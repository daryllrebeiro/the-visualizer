// Sets UPDATE_GOLDEN=1 cross-platform and runs the golden vector printer.
// Paste the printed block into GOLDEN_VECTORS in golden-determinism.test.ts.
import { spawnSync } from 'node:child_process';

process.env['UPDATE_GOLDEN'] = '1';
const result = spawnSync(
  'pnpm',
  ['vitest', 'run', 'packages/simulation/src/golden-vectors.update.test.ts'],
  { stdio: 'inherit', shell: true },
);
process.exit(result.status ?? 1);
