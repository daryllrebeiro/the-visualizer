/**
 * Accessibility (a11y) & HTML Inspection Audit Script
 * Audits all 8 domain visualizer routes against WCAG 2.1 AA standards.
 */

import http from 'http';

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

function fetchRoute(route) {
  return new Promise((resolve, reject) => {
    http.get(`${BASE_URL}${route}`, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
      res.on('error', reject);
    });
  });
}

async function audit() {
  console.log('🔍 Running Accessibility & Semantic Audit against Production Server at', BASE_URL);
  console.log('='.repeat(80));

  const results = [];

  for (const route of ROUTES) {
    try {
      const res = await fetchRoute(route);
      const html = res.body;

      // 1. Doc lang attribute
      const hasLang = /<html[^>]*\slang=["'][a-zA-Z-]+["']/i.test(html);
      
      // 2. Title tag
      const hasTitle = /<title[^>]*>([^<]+)<\/title>/i.test(html);
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const title = titleMatch ? titleMatch[1] : 'MISSING';

      // 3. Viewport meta
      const hasViewport = /<meta[^>]*name=["']viewport["']/i.test(html);

      // 4. Heading structure
      const h1Count = (html.match(/<h1[\s>]/gi) || []).length;
      const h2Count = (html.match(/<h2[\s>]/gi) || []).length;

      // 5. Semantic landmarks
      const hasHeader = /<header[\s>]/i.test(html);
      const hasMainOrBody = /<main[\s>]|<div[^>]*class=["'][^"']*app-body/i.test(html);
      const hasAside = /<aside[\s>]/i.test(html);

      // 6. Buttons with names / text
      const buttons = html.match(/<button[^>]*>[\s\S]*?<\/button>/gi) || [];
      let unnamedButtons = 0;
      for (const btn of buttons) {
        const text = btn.replace(/<[^>]+>/g, '').trim();
        const hasAriaLabel = /aria-label=["'][^"']+["']/i.test(btn);
        const hasTitleAttr = /title=["'][^"']+["']/i.test(btn);
        if (!text && !hasAriaLabel && !hasTitleAttr) {
          unnamedButtons++;
        }
      }

      // 7. Inputs with labels / aria-labels
      const inputs = html.match(/<input[^>]*>/gi) || [];
      let unlabeledInputs = 0;
      for (const inp of inputs) {
        if (/type=["'](?:hidden|file)["']/i.test(inp)) continue;
        const hasAria = /aria-label=["'][^"']+["']/i.test(inp);
        const hasPlaceholder = /placeholder=["'][^"']+["']/i.test(inp);
        const hasTitle = /title=["'][^"']+["']/i.test(inp);
        const hasId = /id=["']([^"']+)["']/i.test(inp);
        if (!hasAria && !hasPlaceholder && !hasTitle && !hasId) {
          unlabeledInputs++;
        }
      }

      // Compute Route A11y Deductions
      let score = 100;
      const violations = [];

      if (!hasLang) { score -= 15; violations.push('WCAG 3.1.1: Missing html[lang] attribute'); }
      if (!hasTitle) { score -= 10; violations.push('WCAG 2.4.2: Missing <title> tag'); }
      if (!hasViewport) { score -= 10; violations.push('WCAG 1.4.4: Missing viewport meta tag'); }
      if (h1Count === 0) { score -= 10; violations.push('WCAG 1.3.1: Missing <h1> landmark heading'); }
      if (h1Count > 2) { score -= 5; violations.push('WCAG 1.3.1: Multiple <h1> headings found on single page'); }
      if (unnamedButtons > 0) { score -= (unnamedButtons * 5); violations.push(`WCAG 4.1.2: ${unnamedButtons} button(s) lack accessible text/label`); }
      if (unlabeledInputs > 0) { score -= (unlabeledInputs * 5); violations.push(`WCAG 3.3.2: ${unlabeledInputs} input(s) lack accessible label/placeholder`); }

      score = Math.max(0, score);

      results.push({
        route,
        status: res.statusCode,
        title,
        score,
        h1Count,
        h2Count,
        buttonsCount: buttons.length,
        unnamedButtons,
        inputsCount: inputs.length,
        unlabeledInputs,
        violations,
      });

      console.log(`Route: ${route.padEnd(16)} | Status: ${res.statusCode} | Score: ${String(score).padStart(3)}/100 | H1: ${h1Count} | Violations: ${violations.length}`);
      if (violations.length > 0) {
        for (const v of violations) console.log(`   ⚠️ ${v}`);
      }
    } catch (err) {
      console.error(`❌ Error fetching ${route}:`, err.message);
      results.push({ route, status: 'ERROR', score: 0, violations: [err.message] });
    }
  }

  console.log('='.repeat(80));
  const avgScore = results.reduce((acc, r) => acc + (typeof r.score === 'number' ? r.score : 0), 0) / results.length;
  const minScore = Math.min(...results.map((r) => (typeof r.score === 'number' ? r.score : 0)));
  console.log(`📊 Audit Summary: Average Score = ${avgScore.toFixed(1)}/100 | Minimum Score = ${minScore}/100`);
}

audit();
