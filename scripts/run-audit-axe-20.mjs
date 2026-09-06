import http from 'http';
import { JSDOM } from 'jsdom';
import axe from 'axe-core';

const BASE_URL = 'http://localhost:3002';
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
  '/rate-limiter',
  '/distributed-lock',
  '/cdn-cache',
  '/id-gen',
  '/transactions',
  '/rag',
  '/agents',
  '/llm-pipeline',
  '/llm-gateway',
  '/llm-serving',
  '/vectordb',
  '/gpu-cluster',
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
    nodesCount: v.nodes.length,
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
  console.log('♿ Running axe-core Audit on Production Server (port 3002)');
  console.log('='.repeat(80));

  let totalScore = 0;
  for (const route of ROUTES) {
    const res = await auditRoute(route);
    totalScore += res.score;
    console.log(`Route ${route.padEnd(20)} | Score: ${res.score}/100 | Passes: ${res.passesCount} | Violations: ${res.violationsCount}`);
  }

  const avg = (totalScore / ROUTES.length).toFixed(1);
  console.log('='.repeat(80));
  console.log(`Average axe-core Score across ${ROUTES.length} routes: ${avg} / 100`);
}

main().catch(console.error);
