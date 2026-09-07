import http from 'http';
import zlib from 'zlib';
import crypto from 'crypto';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';

const TARGET_PORT = 3002;
const PROXY_PORT = 3006;

let activeInjectedRoute = null;
const DELAY_SCRIPT =
  '<script>setTimeout(()=>{const __start=Date.now();while(Date.now()-__start<1500){}}, 300);</script>';

const proxyServer = http.createServer((clientReq, clientRes) => {
  const options = {
    hostname: 'localhost',
    port: TARGET_PORT,
    path: clientReq.url,
    method: clientReq.method,
    headers: {
      ...clientReq.headers,
      host: `localhost:${TARGET_PORT}`,
      'accept-encoding': 'identity',
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
        if (html.includes('<body>')) {
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

function fetchContent(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        const hash = crypto.createHash('sha256').update(buf).digest('hex');
        resolve({ statusCode: res.statusCode, length: buf.length, hash, text: buf.toString('utf8') });
      });
    }).on('error', reject);
  });
}

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
  const lcpElement = lhr.audits['largest-contentful-paint']?.details?.items?.[0]?.node?.snippet || 'N/A';
  return { score, tbt, lcp, fcp, lcpElement };
}

async function run() {
  await new Promise((resolve) => proxyServer.listen(PROXY_PORT, resolve));
  console.log(`Proxy listening on http://localhost:${PROXY_PORT} -> http://localhost:${TARGET_PORT}`);

  const route = '/rate-limiter';
  const url = `http://localhost:${PROXY_PORT}${route}`;

  console.log('\n=== BYTE-FOR-BYTE SERVED CONTENT PARITY CHECK ===');
  // 1. Pre-injection baseline content
  activeInjectedRoute = null;
  const pre = await fetchContent(url);
  console.log(`Pre-Injection Baseline: Size=${pre.length} bytes | SHA256=${pre.hash}`);

  // 2. Injected content
  activeInjectedRoute = route;
  const inj = await fetchContent(url);
  console.log(`Injected Content:       Size=${inj.length} bytes | SHA256=${inj.hash}`);
  const hasInjectedScript = inj.text.includes(DELAY_SCRIPT);
  console.log(`Injected script present in wire HTML? ${hasInjectedScript}`);

  // 3. Post-revert content
  activeInjectedRoute = null;
  const post = await fetchContent(url);
  console.log(`Post-Revert Recovery:   Size=${post.length} bytes | SHA256=${post.hash}`);

  const hashesMatch = pre.hash === post.hash;
  console.log(`Byte-for-byte HTML Hash Match (Pre === Post): ${hashesMatch ? 'IDENTICAL' : 'DIVERGED'}`);
  if (!hashesMatch) {
    console.error('ERROR: Revert did not restore identical bytes!');
  }

  console.log('\n=== SINGLE CHROME INSTANCE SEQUENTIAL AUDIT ===');
  const chrome = await chromeLauncher.launch({
    chromeFlags: ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });

  try {
    // Warmup
    console.log('Warming cache...');
    activeInjectedRoute = null;
    await audit(url, chrome.port);

    // 1. Baseline
    console.log('\n[RUN 1 - BASELINE]');
    activeInjectedRoute = null;
    const baseline = await audit(url, chrome.port);
    console.log(`Baseline: Score=${baseline.score} | TBT=${baseline.tbt}ms | LCP=${baseline.lcp}ms | FCP=${baseline.fcp}ms | LCP element: ${baseline.lcpElement}`);

    // 2. Injected
    console.log('\n[RUN 2 - INJECTED (1500ms synchronous delay)]');
    activeInjectedRoute = route;
    const injected = await audit(url, chrome.port);
    console.log(`Injected: Score=${injected.score} | TBT=${injected.tbt}ms | LCP=${injected.lcp}ms | FCP=${injected.fcp}ms | LCP element: ${injected.lcpElement}`);

    // 3. Recovery
    console.log('\n[RUN 3 - RECOVERY (IDENTICAL BYTE-FOR-BYTE TO RUN 1)]');
    activeInjectedRoute = null;
    const recovery = await audit(url, chrome.port);
    console.log(`Recovery: Score=${recovery.score} | TBT=${recovery.tbt}ms | LCP=${recovery.lcp}ms | FCP=${recovery.fcp}ms | LCP element: ${recovery.lcpElement}`);

    console.log('\n=== SUMMARY TABLE ===');
    console.table([
      { Stage: 'Baseline', Score: baseline.score, TBT: `${baseline.tbt}ms`, LCP: `${baseline.lcp}ms`, FCP: `${baseline.fcp}ms` },
      { Stage: 'Injected', Score: injected.score, TBT: `${injected.tbt}ms`, LCP: `${injected.lcp}ms`, FCP: `${injected.fcp}ms` },
      { Stage: 'Recovery', Score: recovery.score, TBT: `${recovery.tbt}ms`, LCP: `${recovery.lcp}ms`, FCP: `${recovery.fcp}ms` },
    ]);

    const tbtDiff = recovery.tbt - baseline.tbt;
    const scoreDiff = recovery.score - baseline.score;
    const lcpDiff = recovery.lcp - baseline.lcp;
    console.log(`\nRecovery vs Baseline Deltas: Score=${scoreDiff} pts | TBT=${tbtDiff}ms | LCP=${lcpDiff}ms`);

  } finally {
    try { await chrome.kill(); } catch {}
    proxyServer.close();
  }
}

run().catch(console.error);
