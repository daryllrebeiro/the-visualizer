/**
 * Programmatic Lighthouse Audit Script
 * Audits production Next.js routes on http://localhost:3005
 */

import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';

const ROUTES = ['/', '/kafka', '/raft', '/database', '/redis', '/kubernetes', '/rabbitmq', '/storage', '/networking'];
const BASE_URL = 'http://localhost:3005';

async function runLighthouseOnRoute(route, chrome) {
  const url = `${BASE_URL}${route}`;
  const options = {
    logLevel: 'error',
    output: 'json',
    onlyCategories: ['performance'],
    port: chrome.port,
  };

  const runnerResult = await lighthouse(url, options);
  const lhr = runnerResult.lhr;

  const perfScore = Math.round((lhr.categories.performance.score || 0) * 100);
  const fcp = lhr.audits['first-contentful-paint']?.displayValue || 'N/A';
  const tti = lhr.audits['interactive']?.displayValue || 'N/A';
  const tbt = lhr.audits['total-blocking-time']?.displayValue || 'N/A';
  const lcp = lhr.audits['largest-contentful-paint']?.displayValue || 'N/A';
  const cls = lhr.audits['cumulative-layout-shift']?.displayValue || 'N/A';

  return {
    route,
    perfScore,
    fcp,
    tti,
    tbt,
    lcp,
    cls,
  };
}

async function main() {
  console.log('⚡ Starting Real Lighthouse Performance Audit on Production Next.js Server');
  console.log(`- Base URL: ${BASE_URL}`);
  console.log('='.repeat(90));

  let chrome;
  try {
    chrome = await chromeLauncher.launch({ chromeFlags: ['--headless', '--no-sandbox', '--disable-gpu'] });
    console.log(`🌐 Headless Chrome launched on debug port: ${chrome.port}`);
  } catch (err) {
    console.error('❌ Failed to launch Chrome for Lighthouse:', err.message);
    process.exit(1);
  }

  const results = [];
  try {
    for (const route of ROUTES) {
      console.log(`⏳ Auditing ${route}...`);
      const res = await runLighthouseOnRoute(route, chrome);
      results.push(res);
      console.log(`   Score: ${res.perfScore}/100 | FCP: ${res.fcp} | LCP: ${res.lcp} | TTI: ${res.tti} | TBT: ${res.tbt} | CLS: ${res.cls}`);
    }
  } finally {
    if (chrome) {
      try {
        await chrome.kill();
      } catch {
        // Ignore Windows temp directory unlock race
      }
    }
  }

  const avgPerf = (results.reduce((acc, r) => acc + r.perfScore, 0) / results.length).toFixed(1);
  console.log('\n' + '='.repeat(90));
  console.log('📊 Lighthouse Performance Audit Summary:');
  console.log(`- Average Performance Score: ${avgPerf} / 100`);
  for (const r of results) {
    console.log(`  ${r.route.padEnd(16)}: ${r.perfScore}/100 (FCP: ${r.fcp}, TTI: ${r.tti}, TBT: ${r.tbt})`);
  }
}

main().catch(console.error);
