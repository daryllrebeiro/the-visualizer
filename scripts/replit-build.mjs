#!/usr/bin/env node

/**
 * TheVisualizer — Replit Production Build Orchestrator
 * Executes monorepo production build and verifies build outputs.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('═══════════════════════════════════════════════════════════════');
console.log('  THE VISUALIZER — Replit Production Build');
console.log(`  Root Directory: ${rootDir}`);
console.log(`  Node Version:   ${process.version}`);
console.log('═══════════════════════════════════════════════════════════════\n');

// 1. Execute Turborepo Production Build
console.log('>>> [1/2] Running production build (pnpm build)...');
try {
  execSync('pnpm build', {
    cwd: rootDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'production',
    },
  });
  console.log('✅ Turborepo build succeeded.\n');
} catch (err) {
  console.error('❌ Build failed during pnpm build:', err.message);
  process.exit(1);
}

// 2. Verify Output Artifacts
console.log('>>> [2/2] Verifying output artifacts across services...');

const requiredArtifacts = [
  'packages/contracts/dist/index.js',
  'packages/simulation/dist/index.js',
  'packages/config/dist/index.js',
  'packages/logging/dist/index.js',
  'apps/api/dist/index.js',
  'apps/ws-gateway/dist/index.js',
  'apps/web/.next/BUILD_ID',
];

let allArtifactsPresent = true;

for (const relPath of requiredArtifacts) {
  const fullPath = path.join(rootDir, relPath);
  if (fs.existsSync(fullPath)) {
    console.log(`  ✓ Found artifact: ${relPath}`);
  } else {
    console.error(`  ✗ Missing required artifact: ${relPath}`);
    allArtifactsPresent = false;
  }
}

if (!allArtifactsPresent) {
  console.error('\n❌ Build verification failed: One or more required build outputs are missing.');
  process.exit(1);
}

console.log('\n✅ All production artifacts verified successfully. Ready for deployment run.');
