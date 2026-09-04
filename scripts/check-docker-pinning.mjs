import fs from 'fs';
import path from 'path';

const DOCKERFILES = [
  'infrastructure/docker/api.Dockerfile',
  'infrastructure/docker/ws-gateway.Dockerfile',
  'Dockerfile',
];

console.log('🔒 Verifying Docker Base Image Digest Pinning (SHA256)...');
let hasError = false;

for (const relPath of DOCKERFILES) {
  const fullPath = path.resolve(process.cwd(), relPath);
  if (!fs.existsSync(fullPath)) {
    console.error(`❌ Dockerfile missing: ${relPath}`);
    hasError = true;
    continue;
  }

  const content = fs.readFileSync(fullPath, 'utf8');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('FROM ') && !line.includes(' AS base') && !line.startsWith('FROM base') && !line.startsWith('FROM deps') && !line.startsWith('FROM builder')) {
      // Check if line specifies an external image with @sha256:
      if (!line.includes('@sha256:')) {
        console.error(`❌ ${relPath}:${i + 1}: Unpinned base image detected: "${line}"`);
        console.error(`   Every external base image must be pinned to an immutable SHA256 digest.`);
        hasError = true;
      } else {
        console.log(`✅ ${relPath}:${i + 1}: Properly pinned to SHA256 digest.`);
      }
    } else if (line.startsWith('FROM ') && line.includes(' AS base')) {
      if (!line.includes('@sha256:')) {
        console.error(`❌ ${relPath}:${i + 1}: Unpinned base stage detected: "${line}"`);
        hasError = true;
      } else {
        console.log(`✅ ${relPath}:${i + 1}: Base stage properly pinned to SHA256 digest.`);
      }
    }
  }
}

if (hasError) {
  console.error('\n🚨 Docker pinning audit FAILED. Builds with unpinned images are blocked.');
  process.exit(1);
} else {
  console.log('\n🛡️ All Dockerfiles successfully pass immutable digest pinning validation.');
  process.exit(0);
}
