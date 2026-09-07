import http from 'http';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';

const TARGET_PORT = 3002;
const PROXY_PORT = 3005;

let activeInjectedRoute = null;
// Executed after First Contentful Paint (FCP) so it occurs strictly within the FCP-to-TTI window measured by TBT
const DELAY_SCRIPT =
  '<script>setTimeout(()=>{const __start=Date.now();while(Date.now()-__start<1500){}}, 300);</script>';


// Reverse proxy that forwards to Next.js on TARGET_PORT and injects delay when activeInjectedRoute matches
import zlib from 'zlib';

const proxyServer = http.createServer((clientReq, clientRes) => {
  const options = {
    hostname: 'localhost',
    port: TARGET_PORT,
    path: clientReq.url,
    method: clientReq.method,
    headers: {
      ...clientReq.headers,
      host: `localhost:${TARGET_PORT}`,
      'accept-encoding': 'identity', // Request uncompressed HTML
    },
  };

  const proxyReq = http.request(options, (targetRes) => {
    const isHtml = (targetRes.headers['content-type'] || '').includes('text/html');
    const routeMatches = activeInjectedRoute && clientReq.url.startsWith(activeInjectedRoute);

    if (isHtml && routeMatches) {
      const chunks = [];
      targetRes.on('data', (chunk) => chunks.push(chunk));
      targetRes.on('end', () => {
        let raw = Buffer.concat(chunks);
        const encoding = targetRes.headers['content-encoding'];
        if (encoding === 'gzip') raw = zlib.gunzipSync(raw);
        else if (encoding === 'br') raw = zlib.brotliDecompressSync(raw);
        else if (encoding === 'deflate') raw = zlib.inflateSync(raw);

        let html = raw.toString('utf8');
        const hasBody = html.includes('<body>');
        if (hasBody) {
          html = html.replace('<body>', `<body>${DELAY_SCRIPT}`);
        } else {
          html = `${DELAY_SCRIPT}${html}`;
        }
        const modifiedBuffer = Buffer.from(html, 'utf8');

        const headers = { ...targetRes.headers };
        headers['content-length'] = modifiedBuffer.length;
        delete headers['content-encoding'];

        clientRes.writeHead(targetRes.statusCode, headers);
        clientRes.end(modifiedBuffer);
      });
    } else {

      clientRes.writeHead(targetRes.statusCode, targetRes.headers);
      targetRes.pipe(clientRes);
    }
  });

  proxyReq.on('error', (err) => {
    clientRes.writeHead(502, { 'Content-Type': 'text/plain' });
    clientRes.end(`Bad Gateway: ${err.message}`);
  });

  clientReq.pipe(proxyReq);
});

async function audit(url, port) {
  const runnerResult = await lighthouse(url, {
    port,
    onlyCategories: ['performance'],
    output: 'json',
    logLevel: 'error',
  });
  const lhr = runnerResult.lhr;
  const score = Math.round((lhr.categories.performance.score || 0) * 100);
  const tbt = Math.round(lhr.audits['total-blocking-time']?.numericValue || 0);
  const lcp = Number((lhr.audits['largest-contentful-paint']?.numericValue || 0).toFixed(1));
  const fcp = Number((lhr.audits['first-contentful-paint']?.numericValue || 0).toFixed(1));
  return { score, tbt, lcp, fcp };
}

async function run() {
  console.log(`=== CONTROLLED LIGHTHOUSE DELAY TRAP AUDIT ===`);
  console.log(`Timestamp: ${new Date().toISOString()}`);

  await new Promise((resolve) => proxyServer.listen(PROXY_PORT, resolve));
  console.log(`Reverse proxy active on http://localhost:${PROXY_PORT} -> http://localhost:${TARGET_PORT}`);

  const chrome = await chromeLauncher.launch({
    chromeFlags: ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });

  const routes = ['/rate-limiter', '/llm-gateway'];
  const report = [];

  try {
    for (const route of routes) {
      console.log(`\n======================================================`);
      console.log(`Testing Route: ${route}`);
      console.log(`======================================================`);

      // 1. Baseline Run (Pristine HTML)
      activeInjectedRoute = null;
      // Warm up first
      await audit(`http://localhost:${PROXY_PORT}${route}`, chrome.port);
      const baseline = await audit(`http://localhost:${PROXY_PORT}${route}`, chrome.port);
      console.log(`[BASELINE] Score: ${baseline.score}/100 | TBT: ${baseline.tbt}ms | LCP: ${baseline.lcp}ms | FCP: ${baseline.fcp}ms`);

      // 2. Injected Run (Wire-level 2000ms delay in <body>)
      activeInjectedRoute = route;
      const injected = await audit(`http://localhost:${PROXY_PORT}${route}`, chrome.port);
      console.log(`[INJECTED] Score: ${injected.score}/100 | TBT: ${injected.tbt}ms | LCP: ${injected.lcp}ms | FCP: ${injected.fcp}ms`);

      // 3. Recovery Run (Reverted to pristine HTML)
      activeInjectedRoute = null;
      const recovered = await audit(`http://localhost:${PROXY_PORT}${route}`, chrome.port);
      console.log(`[RECOVERY] Score: ${recovered.score}/100 | TBT: ${recovered.tbt}ms | LCP: ${recovered.lcp}ms | FCP: ${recovered.fcp}ms`);

      const scoreDrop = baseline.score - injected.score;
      const tbtIncrease = injected.tbt - baseline.tbt;
      const recoveryDiff = Math.abs(recovered.score - baseline.score);

      report.push({
        route,
        baseline,
        injected,
        recovered,
        scoreDrop,
        tbtIncrease,
        recoveryDiff,
        verdict: scoreDrop >= 10 && tbtIncrease >= 400 && recoveryDiff <= 15 ? 'PASS_SENSITIVE' : 'FAIL',
      });
    }

    console.log(`\n=== FINAL CONTROLLED TRAP REPORT ===`);
    console.table(
      report.map((r) => ({
        Route: r.route,
        'Baseline Score': `${r.baseline.score} (TBT ${r.baseline.tbt}ms)`,
        'Injected Score': `${r.injected.score} (TBT ${r.injected.tbt}ms)`,
        'Score Drop': `-${r.scoreDrop} pts`,
        'TBT Increase': `+${r.tbtIncrease}ms`,
        'Recovered Score': `${r.recovered.score} (TBT ${r.recovered.tbt}ms)`,
        Verdict: r.verdict,
      }))
    );
  } finally {
    try {
      await chrome.kill();
    } catch {}
    proxyServer.close();
  }
}


run().catch((err) => {
  console.error('Fatal error running controlled trap:', err);
  process.exit(1);
});
