import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const timestamp = new Date().toISOString();
console.log(`=== INDEPENDENT TEST COUNT VERIFICATION [${timestamp}] ===\n`);

// Method 1: git ls-files
const rawGit = execSync('git ls-files', { encoding: 'utf8' }).trim().split('\n').map(f => f.trim());
const gitTestFiles = rawGit.filter(f => /\.(test|spec)\.(ts|tsx|js|mjs)$/.test(f));
console.log(`Method 1 (git ls-files test/spec files): ${gitTestFiles.length}`);

// Method 2: fs walk
function walk(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (['node_modules', '.next', 'dist', '.turbo', '.git', 'artifacts'].includes(file)) continue;
    const filepath = path.join(dir, file);
    const stat = fs.statSync(filepath);
    if (stat.isDirectory()) {
      walk(filepath, fileList);
    } else if (/\.(test|spec)\.(ts|tsx|js|mjs)$/.test(file)) {
      fileList.push(filepath);
    }
  }
  return fileList;
}
const fsTestFiles = walk(process.cwd());
console.log(`Method 2 (filesystem walk test/spec files): ${fsTestFiles.length}`);

// Diff between Method 1 and Method 2
const gitSet = new Set(gitTestFiles.map(f => path.normalize(f)));
const fsSet = new Set(fsTestFiles.map(f => path.normalize(path.relative(process.cwd(), f))));
const untracked = [...fsSet].filter(f => !gitSet.has(f));
console.log(`Untracked test files on disk (${untracked.length}):`, untracked);

// Breakdown by directory/package
const breakdown = {};
for (const f of fsTestFiles) {
  const rel = path.relative(process.cwd(), f);
  const pkg = rel.split(path.sep).slice(0, 2).join('/');
  breakdown[pkg] = (breakdown[pkg] || 0) + 1;
}
console.log('\nBreakdown by Package/Directory:');
for (const [k, v] of Object.entries(breakdown)) {
  console.log(`  ${k.padEnd(30)}: ${v} files`);
}
