import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const outputName = 'artifact-manifest.sha256';
const files = [];

function walk(directory) {
  for (const name of readdirSync(directory).sort()) {
    const absolute = path.join(directory, name);
    const relative = path.relative(root, absolute).replaceAll('\\', '/');
    if (relative === outputName) continue;
    if (statSync(absolute).isDirectory()) walk(absolute);
    else files.push(relative);
  }
}

walk(root);
const lines = files.map((relative) => {
  const digest = createHash('sha256').update(readFileSync(path.join(root, relative))).digest('hex');
  return `${digest}  ${relative}`;
});
writeFileSync(path.join(root, outputName), `${lines.join('\n')}\n`, 'utf8');
