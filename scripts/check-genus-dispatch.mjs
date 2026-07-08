import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const params = read('src/params.ts');
const dispatcher = read('shaders/genus/dispatch.wgsl');
const renderer = read('src/renderer.ts');

const presetBlock = params.match(/export const CLOUD_PRESETS:[\s\S]*?^};/m)?.[0];
if (!presetBlock) throw new Error('genus dispatch check: CLOUD_PRESETS block not found');

const genera = [...presetBlock.matchAll(/^\s{2}([a-z]+):\s+/gm)].map((match) => match[1]);
if (genera.length !== 10) {
  throw new Error(`genus dispatch check: expected 10 presets, found ${genera.length}`);
}

const pascal = (value) => value[0].toUpperCase() + value.slice(1);
const caseMatches = [...dispatcher.matchAll(/case GENUS_([A-Z]+):/g)];
if (caseMatches.length !== genera.length) {
  throw new Error(`genus dispatch check: expected ${genera.length} cases, found ${caseMatches.length}`);
}

genera.forEach((genus, index) => {
  const functionName = `eval${pascal(genus)}`;
  const constantName = `GENUS_${genus.toUpperCase()}`;
  const source = read(`shaders/genus/${genus}.wgsl`);
  const declarations = source.match(new RegExp(`fn\\s+${functionName}\\s*\\(`, 'g')) ?? [];
  if (declarations.length !== 1) {
    throw new Error(`genus dispatch check: ${genus} must declare ${functionName} exactly once`);
  }
  if (!dispatcher.includes(`const ${constantName} = ${index};`)) {
    throw new Error(`genus dispatch check: ${constantName} must map to preset index ${index}`);
  }
  if (!dispatcher.includes(`case ${constantName}: { return ${functionName}(compatibilityDensity); }`)) {
    throw new Error(`genus dispatch check: ${genus} case must call ${functionName}`);
  }
  if (!renderer.includes(`../shaders/genus/${genus}.wgsl?raw`)) {
    throw new Error(`genus dispatch check: renderer assembly is missing ${genus}.wgsl`);
  }
});

if (!dispatcher.includes('default: { return evalCumulus(compatibilityDensity); }')) {
  throw new Error('genus dispatch check: invalid indices must fall back to cumulus');
}

console.log(`genus dispatch check: ${genera.length} genera mapped in preset order`);
