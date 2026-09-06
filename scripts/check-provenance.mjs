import { execSync } from 'child_process';

const files = [
  'packages/simulation/src/domains/raft/raft.fidelity.test.ts',
  'apps/api/src/routes/routes.test.ts',
  'apps/ws-gateway/src/gateway/room-manager.test.ts'
];

console.log(`=== TEST FILE GIT PROVENANCE AUDIT [${new Date().toISOString()}] ===\n`);

for (const f of files) {
  console.log(`--- File: ${f} ---`);
  try {
    const out = execSync(`git log --follow --format="%h | %ad | %an | %s" --date=iso-strict -n 5 ${f}`, { encoding: 'utf8' });
    console.log(out.trim());
  } catch (e) {
    console.log(`Git log failed: ${e.message}`);
  }
  console.log('');
}
