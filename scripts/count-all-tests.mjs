import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();

function walk(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (['node_modules', '.next', 'dist', '.turbo', '.git'].includes(file)) continue;
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

const allTests = walk(ROOT);
console.log(`Total test files on disk: ${allTests.length}`);

const byPackage = {};
for (const t of allTests) {
  const rel = path.relative(ROOT, t);
  const parts = rel.split(path.sep);
  const pkgName = parts.length > 1 ? `${parts[0]}/${parts[1]}` : parts[0];
  byPackage[pkgName] = (byPackage[pkgName] || []);
  byPackage[pkgName].push(rel);
}

for (const [pkg, files] of Object.entries(byPackage)) {
  console.log(`\n📦 ${pkg} (${files.length} test files):`);
  for (const f of files) {
    console.log(`   - ${f}`);
  }
}
