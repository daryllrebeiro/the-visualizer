#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const webDir = resolve(rootDir, 'apps', 'web');

console.log('═══════════════════════════════════════════════════════════════');
console.log('  THE VISUALIZER — Extended Browser E2E & Visual Quality Gates ');
console.log('  Target: Chromium headless, Next.js webServer port 3002        ');
console.log('═══════════════════════════════════════════════════════════════\n');

const isWindows = process.platform === 'win32';
const cmd = isWindows ? 'cmd.exe' : 'pnpm';
const args = isWindows
  ? ['/c', 'pnpm', 'exec', 'playwright', 'test']
  : ['exec', 'playwright', 'test'];

const proc = spawn(cmd, args, {
  cwd: webDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    FORCE_COLOR: '1',
  },
});

proc.on('close', (code) => {
  if (code === 0) {
    console.log('\n[PASS] All Extended Playwright E2E suites certified successfully.');
    process.exit(0);
  } else {
    console.error(`\n[FAIL] Playwright E2E test runner exited with error code ${code}`);
    process.exit(code ?? 1);
  }
});
