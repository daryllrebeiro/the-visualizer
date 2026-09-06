import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';

const BASE_URL = 'http://localhost:3002';
const ROUTES = [
  '/database',
  '/kafka',
  '/raft',
  '/redis',
  '/kubernetes',
  '/rabbitmq',
  '/storage',
  '/networking',
  '/rate-limiter',
  '/distributed-lock',
  '/cdn-cache',
  '/id-gen',
  '/transactions',
  '/llm-pipeline',
  '/llm-gateway',
  '/llm-serving',
  '/vectordb',
  '/gpu-cluster',
];

async function main() {
  console.log('⚡ Starting Lighthouse Audit on 18 Canonical Production Routes');
  console.log(`Target: ${BASE_URL}\n`);

  let chrome;
  try {
    chrome = await chromeLauncher.launch({
      chromeFlags: ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
    });
  } catch (err) {
    console.error('Failed to launch Chrome:', err);
    process.exit(1);
  }

  const results = [];
  try {
    for (const route of ROUTES) {
      const url = `${BASE_URL}${route}`;
      const runnerResult = await lighthouse(url, {
        logLevel: 'error',
        output: 'json',
        onlyCategories: ['performance'],
        port: chrome.port,
      });

      const lhr = runnerResult.lhr;
      const perfScore = Math.round((lhr.categories.performance.score || 0) * 100);
      const fcp = lhr.audits['first-contentful-paint']?.displayValue || 'N/A';
      const tbt = lhr.audits['total-blocking-time']?.displayValue || 'N/A';
      const lcp = lhr.audits['largest-contentful-paint']?.displayValue || 'N/A';
      const cls = lhr.audits['cumulative-layout-shift']?.displayValue || 'N/A';

      console.log(`Route ${route.padEnd(20)} | Score: ${perfScore}/100 | FCP: ${fcp.padEnd(8)} | TBT: ${tbt.padEnd(8)} | LCP: ${lcp}`);
      results.push({ route, perfScore, fcp, tbt, lcp, cls });
    }
  } finally {
    if (chrome) {
      try {
        await chrome.kill();
      } catch {}
    }
  }

  const avg = (results.reduce((a, b) => a + b.perfScore, 0) / results.length).toFixed(1);
  console.log('\n' + '='.repeat(80));
  console.log(`Lighthouse Performance Average across 18 routes: ${avg} / 100`);
  const databaseRoute = results.find((r) => r.route === '/database');
  console.log(`Target Check (/database): ${databaseRoute?.perfScore}/100 (TBT: ${databaseRoute?.tbt})`);
}

main().catch(console.error);
