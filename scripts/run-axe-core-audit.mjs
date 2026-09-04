/**
 * Real axe-core Accessibility Audit Script
 * Fetches server-rendered HTML from Next.js production build (http://localhost:3005)
 * and runs full axe-core rule evaluation in JSDOM.
 */

import http from 'http';
import { JSDOM } from 'jsdom';
import axe from 'axe-core';

const BASE_URL = 'http://localhost:3005';
const ROUTES = [
  '/',
  '/kafka',
  '/raft',
  '/database',
  '/redis',
  '/kubernetes',
  '/rabbitmq',
  '/storage',
  '/networking',
  '/design-system',
];

function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ statusCode: res.statusCode, html: data }));
    }).on('error', reject);
  });
}

async function auditRoute(route) {
  const url = `${BASE_URL}${route}`;
  const { statusCode, html } = await fetchHtml(url);

  if (statusCode !== 200) {
    return { route, status: statusCode, error: `HTTP ${statusCode}` };
  }

  const dom = new JSDOM(html, {
    url,
    runScripts: 'outside-only',
    resources: 'usable',
  });

  // Inject axe source into the window
  const axeResults = await axe.run(dom.window.document.documentElement, {
    runOnly: {
      type: 'tag',
      values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'],
    },
  });

  const violations = axeResults.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    description: v.description,
    help: v.help,
    helpUrl: v.helpUrl,
    nodesCount: v.nodes.length,
    selectors: v.nodes.map((n) => n.target.join(' ')).slice(0, 3),
  }));

  const passesCount = axeResults.passes.length;
  const violationsCount = violations.length;
  const score = Math.max(0, Math.round((passesCount / (passesCount + violationsCount)) * 100));

  return {
    route,
    status: statusCode,
    score,
    passesCount,
    violationsCount,
    violations,
  };
}

async function main() {
  console.log('♿ Starting Real axe-core WCAG 2.1 AA Production Route Audit');
  console.log(`- Base URL: ${BASE_URL}`);
  console.log('='.repeat(90));

  const results = [];
  let totalScore = 0;

  for (const route of ROUTES) {
    const res = await auditRoute(route);
    results.push(res);
    totalScore += res.score || 0;

    console.log(`\n📄 Route: ${route.padEnd(16)} | Status: ${res.status} | axe Score: ${res.score}/100 | Passes: ${res.passesCount} | Violations: ${res.violationsCount}`);
    if (res.violations && res.violations.length > 0) {
      for (const v of res.violations) {
        console.log(`   ❌ [${v.id}] (${v.impact}) - ${v.help} (${v.nodesCount} nodes)`);
        console.log(`      Selector snippet: ${v.selectors.join(', ')}`);
      }
    } else {
      console.log('   ✅ 0 axe-core violations found');
    }
  }

  const avgScore = (totalScore / ROUTES.length).toFixed(1);
  const minScore = Math.min(...results.map((r) => r.score || 0));

  console.log('\n' + '='.repeat(90));
  console.log(`📊 axe-core Audit Summary:`);
  console.log(`- Total Routes Audited: ${ROUTES.length}`);
  console.log(`- Average axe-core Score: ${avgScore} / 100`);
  console.log(`- Minimum Route Score: ${minScore} / 100`);
}

main().catch(console.error);
