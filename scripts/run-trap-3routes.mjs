import fs from 'fs';
import path from 'path';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';

const BASE_URL = 'http://localhost:3002';
const APP_DIR = path.resolve('apps/web/.next/server/app');

const TRAP_ROUTES = [
  { route: '/kafka', htmlFile: 'kafka.html', batch: 'Original-8' },
  { route: '/rate-limiter', htmlFile: 'rate-limiter.html', batch: 'System-Design-Canon' },
  { route: '/llm-gateway', htmlFile: 'llm-gateway.html', batch: 'LLM/AI Domain' },
];

const DELAY_SNIPPET = '<script>const __start=Date.now();while(Date.now()-__start<2000){}</script>';

async function auditRoute(url, port) {
  const runnerResult = await lighthouse(url, {
    port,
    onlyCategories: ['performance'],
    output: 'json',
    logLevel: 'error',
  });
  const lhr = runnerResult.lhr;
  const score = Math.round((lhr.categories.performance.score || 0) * 100);
  const tbt = Math.round(lhr.audits['total-blocking-time']?.numericValue || 0);
  const lcp = (lhr.audits['largest-contentful-paint']?.numericValue || 0).toFixed(1);
  return { score, tbt, lcp };
}

async function run() {
  console.log('=== RUNNING INJECTED-DELAY TRAP ON 3 ADDITIONAL ROUTES ===\n');
  const chrome = await chromeLauncher.launch({
    chromeFlags: ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });

  const results = [];

  try {
    for (const item of TRAP_ROUTES) {
      const htmlPath = path.join(APP_DIR, item.htmlFile);
      const originalHtml = fs.readFileSync(htmlPath, 'utf8');

      console.log(`>>> Testing [${item.batch}] ${item.route} (${item.htmlFile})`);

      // 1. Baseline
      const baseline = await auditRoute(`${BASE_URL}${item.route}`, chrome.port);
      console.log(`  [BASELINE] Score: ${baseline.score}/100 | TBT: ${baseline.tbt}ms | LCP: ${baseline.lcp}ms`);

      // 2. Inject delay trap
      const mutatedHtml = originalHtml.replace('<head>', `<head>${DELAY_SNIPPET}`);
      fs.writeFileSync(htmlPath, mutatedHtml);
      console.log(`  [INJECTED] 2000ms synchronous block inserted into <head>`);

      // 3. Mutated run
      const mutated = await auditRoute(`${BASE_URL}${item.route}`, chrome.port);
      console.log(`  [MUTATED]  Score: ${mutated.score}/100 | TBT: ${mutated.tbt}ms | LCP: ${mutated.lcp}ms`);

      // 4. Revert
      fs.writeFileSync(htmlPath, originalHtml);
      console.log(`  [REVERTED] Cleaned <head> back to original baseline`);

      // 5. Post-revert run
      const recovered = await auditRoute(`${BASE_URL}${item.route}`, chrome.port);
      console.log(`  [RECOVERY] Score: ${recovered.score}/100 | TBT: ${recovered.tbt}ms | LCP: ${recovered.lcp}ms\n`);

      results.push({
        ...item,
        baseline,
        mutated,
        recovered,
        scoreDrop: baseline.score - mutated.score,
        tbtIncrease: mutated.tbt - baseline.tbt,
      });
    }

    console.log('=== TRAP SUMMARY RESULTS ===');
    console.table(
      results.map((r) => ({
        Batch: r.batch,
        Route: r.route,
        'Baseline Score': `${r.baseline.score} (TBT ${r.baseline.tbt}ms)`,
        'Mutated Score': `${r.mutated.score} (TBT ${r.mutated.tbt}ms)`,
        'Score Drop': `-${r.scoreDrop} pts`,
        'TBT Delta': `+${r.tbtIncrease}ms`,
        'Recovered Score': `${r.recovered.score} (TBT ${r.recovered.tbt}ms)`,
        TrapVerdict: r.scoreDrop >= 15 && r.tbtIncrease >= 1500 ? 'SENSITIVITY_CONFIRMED' : 'FAIL',
      }))
    );

    const artifactPath = path.resolve('artifacts/lighthouse-trap-3routes.json');
    fs.writeFileSync(artifactPath, JSON.stringify(results, null, 2));
    console.log(`Results written to ${artifactPath}`);
  } finally {
    await chrome.kill();
  }
}

run().catch(console.error);
