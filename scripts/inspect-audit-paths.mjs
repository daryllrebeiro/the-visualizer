import { execSync } from 'child_process';

let auditData;
try {
  const jsonStr = execSync('pnpm audit --prod --json', { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  auditData = JSON.parse(jsonStr);
} catch (err) {
  if (err.stdout) {
    auditData = JSON.parse(err.stdout);
  } else {
    console.error('Audit failed:', err);
    process.exit(1);
  }
}

const advisories = Object.values(auditData.advisories || {});
console.log(`=== SUMMARY OF ALL ${advisories.length} ADVISORIES ===\n`);

const summaryTable = advisories.map((a, idx) => {
  const roots = new Set();
  const directParents = new Set();
  (a.findings || []).forEach(f => {
    f.paths.forEach(p => {
      const parts = p.split('>');
      roots.add(parts[0]);
      if (parts.length > 1) {
        directParents.add(parts[parts.length - 2]);
      } else {
        directParents.add('(direct)');
      }
    });
  });

  return {
    '#': idx + 1,
    Severity: a.severity.toUpperCase(),
    Module: a.module_name,
    ID: a.id,
    CVE: a.cves?.[0] || 'N/A',
    Title: a.title.length > 60 ? a.title.substring(0, 57) + '...' : a.title,
    Vulnerable: a.vulnerable_versions,
    Patched: a.patched_versions,
    'Root Workspace Package': Array.from(roots).join(', '),
    'Immediate Parent': Array.from(directParents).slice(0, 2).join(', '),
  };
});

console.table(summaryTable);

// Specifically highlight the CRITICAL advisory
const criticals = advisories.filter(a => a.severity === 'critical');
console.log('\n=== CRITICAL ADVISORIES ===');
for (const c of criticals) {
  console.log(`ID: ${c.id}`);
  console.log(`Module: ${c.module_name}`);
  console.log(`Title: ${c.title}`);
  console.log(`CVE: ${c.cves?.join(', ') || 'N/A'}`);
  console.log(`URL: ${c.url}`);
  console.log(`Vulnerable: ${c.vulnerable_versions} | Patched: ${c.patched_versions}`);
  console.log(`Paths:`);
  for (const f of c.findings || []) {
    for (const p of f.paths) {
      console.log(`  ${p}`);
    }
  }
}

// Highlight the 9 HIGH advisories
const highs = advisories.filter(a => a.severity === 'high');
console.log(`\n=== HIGH ADVISORIES (${highs.length}) ===`);
for (const h of highs) {
  console.log(`- [HIGH] ${h.module_name} (ID: ${h.id}, CVE: ${h.cves?.[0] || 'N/A'}) - ${h.title}`);
  const paths = new Set();
  for (const f of h.findings || []) {
    for (const p of f.paths) {
      paths.add(p);
    }
  }
  for (const p of Array.from(paths).slice(0, 3)) {
    console.log(`    Path: ${p}`);
  }
}
