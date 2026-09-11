/**
 * Hardening audit Part 9: axe-core scan over the new learning UI surfaces,
 * driven by a real Chromium via Playwright (the existing JSDOM script cannot
 * execute client-rendered React, which is what these pages are).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { chromium } from '@playwright/test';

const HERE = dirname(fileURLToPath(import.meta.url));

const BASE = process.env['AXE_BASE_URL'] ?? 'http://localhost:3005';
const ROUTES = [
  '/',
  '/progress',
  '/quizzes',
  '/interview',
  '/badges',
  '/badges/verify',
  '/compare',
  '/composer',
  '/challenges',
];
const AXE_SOURCE = readFileSync(resolve(HERE, '../../node_modules/axe-core/axe.min.js'), 'utf8');

async function main() {
  const browser = await chromium.launch();
  const results = [];

  for (const route of ROUTES) {
    const page = await browser.newPage();
    try {
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.addScriptTag({ content: AXE_SOURCE });
      const outcome = await page.evaluate(async () => {
        const res = await window.axe.run(document, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
        });
        return res.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.length,
        }));
      });
      const serious = outcome.filter((v) => v.impact === 'serious' || v.impact === 'critical').length;
      const detail = outcome.map((v) => `${v.id}[${v.impact}]x${v.nodes}`).join(' ');
      results.push({ route, violations: outcome.length, serious, detail });
      console.log(
        `AXE ${route.padEnd(16)} violations=${outcome.length} serious=${serious} ${detail || 'clean'}`,
      );
    } catch (err) {
      console.log(`AXE ${route.padEnd(16)} ERROR ${err instanceof Error ? err.message : String(err)}`);
      results.push({ route, violations: -1, serious: -1, detail: 'ERROR' });
    } finally {
      await page.close();
    }
  }

  await browser.close();
  const totalSerious = results.reduce((s, r) => s + Math.max(0, r.serious), 0);
  console.log(`AXE-SUMMARY routes=${results.length} total_serious=${totalSerious}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
