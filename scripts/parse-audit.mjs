import { execSync } from 'child_process';

try {
  const jsonStr = execSync('pnpm audit --prod --json', { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  console.log('Clean audit: 0 issues');
} catch (err) {
  if (err.stdout) {
    const data = JSON.parse(err.stdout);
    const advisories = Object.values(data.advisories || {});
    console.log(`Total advisories found: ${advisories.length}`);
    const summary = advisories.map(a => ({
      id: a.id,
      module: a.module_name,
      severity: a.severity,
      title: a.title,
      vulnerable: a.vulnerable_versions,
      patched: a.patched_versions,
      recommendation: a.recommendation,
    }));
    console.table(summary);
  } else {
    console.error('Audit failed without JSON stdout:', err);
  }
}
