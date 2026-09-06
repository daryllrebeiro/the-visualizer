import fs from 'node:fs';

const reg = fs.readFileSync('packages/simulation/src/domains/registry.ts', 'utf8');
const regMatches = [...reg.matchAll(/id:\s*['"]([^'"]+)['"]/g)].map(m => m[1]);

const opt = fs.readFileSync('apps/web/src/app/domain-options.ts', 'utf8');
const optMatches = [...opt.matchAll(/id:\s*['"]([^'"]+)['"]/g)].map(m => m[1]);

const page = fs.readFileSync('apps/web/src/app/[domain]/page.tsx', 'utf8');
const pageMatches = [...page.matchAll(/domain:\s*['"]([^'"]+)['"]/g)].map(m => m[1]);

const modal = fs.readFileSync('apps/web/src/components/domains/DomainDirectoryModal.tsx', 'utf8');
const modalMatches = [...modal.matchAll(/id:\s*['"]([^'"]+)['"]/g)].map(m => m[1]);

const pal = fs.readFileSync('apps/web/src/components/palette/CommandPaletteModal.tsx', 'utf8');
const palMatches = [...pal.matchAll(/id:\s*['"]domain-([^'"]+)['"]/g)].map(m => m[1]);

const det = fs.readFileSync('packages/simulation/src/golden-determinism.test.ts', 'utf8');
// golden-determinism checks the 20 domains in the expect(ids).toEqual array and iterates over DomainRegistry.list()
const detListMatch = det.match(/expect\(ids\)\.toEqual\(\[\s*([\s\S]*?)\]\);/);
const detMatches = detListMatch
  ? [...detListMatch[1].matchAll(/['"]([a-z0-9-]+)['"]/g)].map(m => m[1])
  : [];

const allDomains = Array.from(new Set([
  ...regMatches, ...optMatches, ...pageMatches, ...modalMatches, ...palMatches, ...detMatches
])).sort();

console.log(`Total unique domains discovered across all 6 files: ${allDomains.length}`);
console.log('\nDomain Registration Cross-Reference Table:');
console.log('| Domain ID | registry.ts | domain-options.ts | page.tsx staticParams | DomainDirectoryModal | CommandPalette | golden-determinism |');
console.log('|---|---|---|---|---|---|---|');

let allPass = true;
for (const d of allDomains) {
  const inReg = regMatches.includes(d) ? 'Y' : 'N';
  const inOpt = optMatches.includes(d) ? 'Y' : 'N';
  const inPage = pageMatches.includes(d) ? 'Y' : 'N';
  const inModal = modalMatches.includes(d) ? 'Y' : 'N';
  const inPal = palMatches.includes(d) ? 'Y' : 'N';
  const inDet = detMatches.includes(d) ? 'Y' : 'N';
  if (inReg !== 'Y' || inOpt !== 'Y' || inPage !== 'Y' || inModal !== 'Y' || inPal !== 'Y' || inDet !== 'Y') {
    allPass = false;
  }
  console.log(`| \`${d}\` | ${inReg} | ${inOpt} | ${inPage} | ${inModal} | ${inPal} | ${inDet} |`);
}

console.log('\nCounts:');
console.log(`registry.ts: ${regMatches.length}`);
console.log(`domain-options.ts: ${optMatches.length}`);
console.log(`page.tsx: ${pageMatches.length}`);
console.log(`DomainDirectoryModal.tsx: ${modalMatches.length}`);
console.log(`CommandPaletteModal.tsx: ${palMatches.length}`);
console.log(`golden-determinism.test.ts: ${detMatches.length}`);
console.log(`All 6 registration points in 100% agreement: ${allPass ? 'YES' : 'NO'}`);
