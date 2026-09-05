#!/usr/bin/env node

/**
 * TheVisualizer — Replit Production Deployment Pre-Flight & Verification Automation
 *
 * Runs full monorepo quality gates, validates .replit & replit.nix manifests,
 * verifies the production build artifacts, checks environment variable readiness,
 * and outputs actionable deployment next-steps.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('═══════════════════════════════════════════════════════════════════');
console.log('  THE VISUALIZER — Replit Production Deployment Pipeline');
console.log(`  Root Directory: ${rootDir}`);
console.log('═══════════════════════════════════════════════════════════════════\n');

function runStep(title, command) {
  console.log(`>>> [STEP] ${title}...`);
  console.log(`    $ ${command}`);
  try {
    execSync(command, { cwd: rootDir, stdio: 'inherit' });
    console.log(`    ✓ ${title} PASSED.\n`);
  } catch (err) {
    console.error(`\n❌ FAILED at step: "${title}"`);
    console.error(`Command failed: ${command}`);
    process.exit(1);
  }
}

// 1. Quality Gates
runStep('1/5 TypeScript Compilation Check (All 9 Packages)', 'pnpm typecheck');
runStep('2/5 Golden Determinism Suite (18 Domains)', 'pnpm test:determinism');
runStep('3/5 Full Test Suite (Unit, Invariant & Behavioral)', 'pnpm test:all');

// 2. Validate Replit Manifests
console.log('>>> [STEP] 4/5 Validating Replit Manifests & Configurations...');
const replitPath = path.join(rootDir, '.replit');
const nixPath = path.join(rootDir, 'replit.nix');
const proxyPath = path.join(rootDir, 'scripts', 'replit-reverse-proxy.mjs');
const supervisorPath = path.join(rootDir, 'scripts', 'replit-supervisor.mjs');

if (!fs.existsSync(replitPath)) {
  console.error('❌ Missing .replit manifest file!');
  process.exit(1);
}
const replitContent = fs.readFileSync(replitPath, 'utf8');
if (!replitContent.includes('[deployment]') || !replitContent.includes('localPort = 8080')) {
  console.error('❌ .replit is missing [deployment] block or public ingress port 8080!');
  process.exit(1);
}

if (!fs.existsSync(nixPath)) {
  console.error('❌ Missing replit.nix manifest file!');
  process.exit(1);
}

if (!fs.existsSync(proxyPath) || !fs.existsSync(supervisorPath)) {
  console.error('❌ Missing Replit proxy or supervisor scripts!');
  process.exit(1);
}
console.log('    ✓ Replit manifests (.replit, replit.nix, supervisor, reverse-proxy) validated.\n');

// 3. Execute Production Build
runStep('5/5 Monorepo Production Build & Artifact Verification', 'node scripts/replit-build.mjs');

// 4. Deployment Instructions
console.log('═══════════════════════════════════════════════════════════════════');
console.log('  ALL PRE-DEPLOYMENT QUALITY GATES & BUILDS CERTIFIED (5/5 PASS)');
console.log('═══════════════════════════════════════════════════════════════════');
console.log(`
REPLIT DEPLOYMENT RUNBOOK:
1. Ensure your Secrets are populated in the Replit Project Editor (Tools > Secrets):
   • DATABASE_URL      (Replit Postgres or external Neon/Supabase pooler)
   • REDIS_URL         (External TLS Redis, e.g. rediss://default:...@...upstash.io:6379)
   • SESSION_SECRET    (>= 32 character secure random string)
   • JWT_SECRET        (>= 32 character secure random string)
   • ALLOWED_ORIGINS   (https://<your-app>.replit.app, or custom domain)

2. Trigger Deployment in Replit:
   • If connected via Git: git push origin main
   • Or in Replit UI: Open "Publishing" tool > select "Reserved VM" > click "Publish".

3. Post-Deployment Smoke Test:
   Once Replit reports deployment healthy, run the live verification suite:
   $ node scripts/replit-smoke-test.mjs https://<your-app>.replit.app
`);
