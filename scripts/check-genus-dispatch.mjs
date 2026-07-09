import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const params = read('src/params.ts');
const cloud = read('shaders/cloud.wgsl');
const common = read('shaders/genus/common.wgsl');
const dispatcher = read('shaders/genus/dispatch.wgsl');
const renderer = read('src/renderer.ts');

const presetBlock = params.match(/export const CLOUD_PRESETS:[\s\S]*?^};/m)?.[0];
if (!presetBlock) throw new Error('genus dispatch check: CLOUD_PRESETS block not found');

const genera = [...presetBlock.matchAll(/^\s{2}([a-z]+):\s+/gm)].map((match) => match[1]);
if (genera.length !== 10) {
  throw new Error(`genus dispatch check: expected 10 presets, found ${genera.length}`);
}

const pascal = (value) => value[0].toUpperCase() + value.slice(1);
const specializedCalls = {
  cumulonimbus: 'evalCumulonimbus(compatibilityDensity, pos, bodyIndex)',
  cirrus: 'evalCirrus(compatibilityDensity, pos, bodyIndex)',
};
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
  const call = specializedCalls[genus] ?? `${functionName}(compatibilityDensity)`;
  if (!dispatcher.includes(`case ${constantName}: { return ${call}; }`)) {
    throw new Error(`genus dispatch check: ${genus} case must call ${functionName}`);
  }
  if (!renderer.includes(`../shaders/genus/${genus}.wgsl?raw`)) {
    throw new Error(`genus dispatch check: renderer assembly is missing ${genus}.wgsl`);
  }
});

if (!dispatcher.includes('fn evalGenusDensity(genusIndex : i32, compatibilityDensity : f32, pos : vec3f, bodyIndex : i32)')) {
  throw new Error('genus dispatch check: dispatcher must expose only minimal specialized inputs');
}

for (const genus of Object.keys(specializedCalls)) {
  const source = read(`shaders/genus/${genus}.wgsl`);
  const earlyReturn = source.indexOf('if (strength <= 0.0001');
  const contextPreparation = source.indexOf('prepareGenusEvalContext');
  if (earlyReturn < 0 || contextPreparation < 0 || earlyReturn > contextPreparation) {
    throw new Error(`genus dispatch check: ${genus} must zero-strength return before context/noise work`);
  }
}

const p6Fields = [
  ['cirrusFiberStrength', 24, 'PRESET_P6_CIRRUS_FIBER_STRENGTH'],
  ['cirrusFiberCurl', 25, 'PRESET_P6_CIRRUS_FIBER_CURL'],
  ['convectiveTowerStrength', 26, 'PRESET_P6_CONVECTIVE_TOWER_STRENGTH'],
  ['convectiveCellScale', 27, 'PRESET_P6_CONVECTIVE_CELL_SCALE'],
];
const p7Fields = [
  ['sunDiscVisible', 28, 'PRESET_P7_SUN_DISC_VISIBLE'],
  ['haloEffect', 29, 'PRESET_P7_HALO_EFFECT'],
  ['internalLightning', 30, 'PRESET_P7_INTERNAL_LIGHTNING'],
];
if (!params.includes('export const PRESET_VEC4_COUNT = 8;') || !cloud.includes('p7 : vec4f,')) {
  throw new Error('genus dispatch check: preset storage must contain eight vec4 values');
}
for (const [field, offset, wgslConstant] of p6Fields) {
  if (!params.includes(`${field}: ${offset},`)) {
    throw new Error(`genus dispatch check: ${field} must use preset float offset ${offset}`);
  }
  if (!cloud.includes(wgslConstant) || !cloud.includes(`p.p6[${wgslConstant}]`)) {
    throw new Error(`genus dispatch check: WGSL p6 accessor missing for ${field}`);
  }
  const presetFieldCount = [...presetBlock.matchAll(new RegExp(`${field}:`, 'g'))].length;
  if (presetFieldCount !== genera.length) {
    throw new Error(`genus dispatch check: ${field} must be explicit in all ${genera.length} presets`);
  }
}
for (const [field, offset, wgslConstant] of p7Fields) {
  if (!params.includes(`${field}: ${offset},`)) {
    throw new Error(`genus dispatch check: ${field} must use preset float offset ${offset}`);
  }
  if (!cloud.includes(wgslConstant) || !cloud.includes(`p.p7[${wgslConstant}]`)) {
    throw new Error(`genus dispatch check: WGSL p7 accessor missing for ${field}`);
  }
  const presetFieldCount = [...presetBlock.matchAll(new RegExp(`${field}:`, 'g'))].length;
  if (presetFieldCount !== genera.length) {
    throw new Error(`genus dispatch check: ${field} must be explicit in all ${genera.length} presets`);
  }
}

for (const forbidden of ['cirrusFiberStrength', 'cirrusFiberCurl', 'convectiveTowerStrength', 'convectiveCellScale']) {
  if (common.includes(forbidden)) {
    throw new Error(`genus dispatch check: ${forbidden} must stay out of compatibility code`);
  }
}

if (!dispatcher.includes('default: { return evalCumulus(compatibilityDensity); }')) {
  throw new Error('genus dispatch check: invalid indices must fall back to cumulus');
}

console.log(`genus dispatch check: ${genera.length} genera mapped in preset order`);
