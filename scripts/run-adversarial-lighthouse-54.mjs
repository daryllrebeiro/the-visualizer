import fs from 'fs';
import path from 'path';
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

const RAW_JSON_ROUTES = ROUTES;
const ARTIFACT_DIR = path.resolve('artifacts');
if (!fs.existsSync(ARTIFACT_DIR)) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

async function main() {
  const startTimestamp = new Date().toISOString();
  console.log(`=== ADVERSARIAL LIGHTHOUSE 54-RUN BENCHMARK [${startTimestamp}] ===`);
  console.log(`Target: ${BASE_URL} (18 routes x 3 runs = 54 runs)\n`);

  const chrome = await chromeLauncher.launch({
    chromeFlags: ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });

  const allRuns = [];
  const routeSummaries = [];

  try {
    for (const route of ROUTES) {
      console.log(`--- Benchmarking Route: ${route} ---`);
      const routeRuns = [];

      for (let run = 1; run <= 3; run++) {
        const runTimestamp = new Date().toISOString();
        const url = `${BASE_URL}${route}`;

        const runnerResult = await lighthouse(url, {
          logLevel: 'error',
          output: 'json',
          onlyCategories: ['performance'],
          port: chrome.port,
        });

        const lhr = runnerResult.lhr;
        const perfScore = Math.round((lhr.categories.performance.score || 0) * 100);
        const fcp = lhr.audits['first-contentful-paint']?.numericValue || 0;
        const fcpDisplay = lhr.audits['first-contentful-paint']?.displayValue || 'N/A';
        const tbt = lhr.audits['total-blocking-time']?.numericValue || 0;
        const tbtDisplay = lhr.audits['total-blocking-time']?.displayValue || 'N/A';
        const lcp = lhr.audits['largest-contentful-paint']?.numericValue || 0;
        const lcpDisplay = lhr.audits['largest-contentful-paint']?.displayValue || 'N/A';
        const cls = lhr.audits['cumulative-layout-shift']?.numericValue || 0;
        const clsDisplay = lhr.audits['cumulative-layout-shift']?.displayValue || 'N/A';

        const runRecord = {
          timestamp: runTimestamp,
          route,
          run,
          score: perfScore,
          fcp: fcpDisplay,
          fcpVal: fcp,
          tbt: tbtDisplay,
          tbtVal: tbt,
          lcp: lcpDisplay,
          lcpVal: lcp,
          cls: clsDisplay,
          clsVal: cls,
        };

        routeRuns.push(runRecord);
        allRuns.push(runRecord);

        console.log(`  [${runTimestamp}] Run ${run}/3: Score=${perfScore}/100 | FCP=${fcpDisplay} | TBT=${tbtDisplay} | LCP=${lcpDisplay} | CLS=${clsDisplay}`);

        // Save raw JSON for selected routes on Run 1
        if (run === 1 && RAW_JSON_ROUTES.includes(route)) {
          const safeName = route.replace(/\//g, '');
          const jsonPath = path.join(ARTIFACT_DIR, `lighthouse-${safeName}.json`);
          fs.writeFileSync(jsonPath, JSON.stringify(lhr, null, 2));
          console.log(`    -> Raw JSON saved to ${jsonPath} (${fs.statSync(jsonPath).size} bytes)`);
        }
      }

      // Calculate stats for route
      const scores = routeRuns.map((r) => r.score);
      const meanScore = scores.reduce((a, b) => a + b, 0) / scores.length;
      const variance = scores.reduce((acc, val) => acc + Math.pow(val - meanScore, 2), 0) / scores.length;
      const stddev = Math.sqrt(variance);

      routeSummaries.push({
        route,
        runs: scores,
        meanScore: Number(meanScore.toFixed(2)),
        variance: Number(variance.toFixed(2)),
        stddev: Number(stddev.toFixed(2)),
        fcp: routeRuns[0].fcp,
        tbt: routeRuns[0].tbt,
        lcp: routeRuns[0].lcp,
        cls: routeRuns[0].cls,
      });
    }
  } finally {
    try {
      await chrome.kill();
    } catch {}
  }

  const endTimestamp = new Date().toISOString();
  console.log(`\n=== 54-RUN BENCHMARK COMPLETE [${endTimestamp}] ===\n`);
  console.log('Route | Run 1 | Run 2 | Run 3 | Mean | Variance | StdDev | TBT | LCP');
  console.log('-'.repeat(80));
  for (const s of routeSummaries) {
    console.log(
      `${s.route.padEnd(20)} | ${String(s.runs[0]).padStart(5)} | ${String(s.runs[1]).padStart(5)} | ${String(s.runs[2]).padStart(5)} | ${s.meanScore.toFixed(1).padStart(5)} | ${s.variance.toFixed(2).padStart(8)} | ${s.stddev.toFixed(2).padStart(6)} | ${s.tbt.padEnd(8)} | ${s.lcp}`
    );
  }

  const grandMean = (routeSummaries.reduce((a, b) => a + b.meanScore, 0) / routeSummaries.length).toFixed(2);
  console.log('-'.repeat(80));
  console.log(`Grand Average across all 18 routes (54 runs): ${grandMean} / 100\n`);

  fs.writeFileSync(
    path.join(ARTIFACT_DIR, 'lighthouse-54-summary.json'),
    JSON.stringify({ startTimestamp, endTimestamp, grandMean, summaries: routeSummaries, allRuns }, null, 2)
  );
}

main().catch(console.error);
