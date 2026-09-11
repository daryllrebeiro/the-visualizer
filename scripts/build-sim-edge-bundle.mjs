/**
 * Portable edge bundle builder for the simulation kernel (Phase 3).
 *
 * Compiles `packages/simulation/src/wasm/edge-kernel.ts` (plus its pure
 * dependency closure) into a single dependency-free ESM/IIFE file with NO
 * `node:` platform — the artifact shape required by browser, worker, and edge
 * runtimes, and the mandatory precursor to any future `.wasm` target.
 *
 * Uses the esbuild already present in the pnpm store (vitest's transitive
 * dependency) so no new package is required.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const entry = resolve(root, 'packages/simulation/src/wasm/edge-kernel.ts');
const outdir = resolve(root, 'dist-edge');
const esbuildJs = resolve(
  root,
  'node_modules/.pnpm/esbuild@0.21.5/node_modules/esbuild/bin/esbuild',
);

if (!existsSync(esbuildJs)) {
  console.error('esbuild binary not found in the pnpm store; run pnpm install first');
  process.exit(2);
}

mkdirSync(outdir, { recursive: true });

execFileSync(
  process.execPath,
  [
    esbuildJs,
    entry,
    '--bundle',
    '--platform=neutral',
    '--format=iife',
    '--global-name=SimKernel',
    '--target=es2020',
    `--outfile=${resolve(outdir, 'sim-kernel.js')}`,
    '--log-level=warning',
  ],
  { stdio: 'inherit' },
);

// esbuild refuses to bundle `node:` builtins under platform=neutral, so a
// successful emit already proves the kernel has zero Node dependencies.
console.log('edge bundle written to dist-edge/sim-kernel.js');
