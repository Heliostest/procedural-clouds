import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const assert = (value, message) => { if (!value) throw new Error(message); };
const assertNoToken = (source, token) => assert(!source.includes(token), `forbidden ${token}`);
function blockStartingAt(source, token) {
  const start = source.indexOf(token);
  assert(start >= 0, `missing ${token}`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`unclosed ${token}`);
}
function wgslDefinitionCount(source, name) {
  return [...source.matchAll(new RegExp(`fn\\s+${name}\\s*\\([^)]*\\)\\s*->[^\\{]+\\{`, 'g'))].length;
}
function templateAfter(source, token) {
  const start = source.indexOf(token);
  assert(start >= 0, `missing ${token}`);
  const quote = source.indexOf('`', start);
  const end = source.indexOf('`', quote + 1);
  assert(quote >= 0 && end > quote, `unclosed template ${token}`);
  return source.slice(quote + 1, end);
}

const cloud = read('shaders/cloud.wgsl');
const shaderSources = read('src/rendering/densityShaderSources.ts');
const hybridDetailSlice = cloud.slice(cloud.indexOf('fn applyBoundedDetailStage('), cloud.indexOf('fn applyEdgeShaping('));
const sharedAbi = cloud.slice(0, cloud.indexOf('struct VSOut {'));
const hybridAdapter = templateAfter(shaderSources, 'const hybridQualityAdapter');
const hierarchicalHybridAdapter = templateAfter(shaderSources, 'const hierarchicalHybridQualityAdapter');
const cachedAdapter = templateAfter(shaderSources, 'const cachedQualityAdapter');
const realtimeAdapter = templateAfter(shaderSources, 'const realtimeQualityAdapter');
const hierarchicalCachedAdapter = templateAfter(shaderSources, 'const hierarchicalCachedQualityAdapter');
const mainDensityAt = blockStartingAt(cloud, 'fn densityAtTyped(');
const stage = blockStartingAt(cloud, 'fn applyBoundedDetailStage(');
const helper = blockStartingAt(cloud, 'fn sampleDetailField(');
const remap = blockStartingAt(cloud, 'fn remapClamped(');

assert(hybridDetailSlice.length > 0, 'Hybrid detail slice missing');
assert(hybridDetailSlice.startsWith('fn applyBoundedDetailStage('), 'stage is not the Hybrid detail slice start');
for (const token of ['DetailResourceControlsGPU', 'detailSampler', 'detailBaseTex', 'detailFieldTex', 'detailResourceControls']) {
  assert(hybridDetailSlice.includes(token), `Hybrid detail ABI missing: ${token}`);
  assertNoToken(sharedAbi, token);
}
assert(wgslDefinitionCount(`${cloud}\n${shaderSources}`, 'applyBoundedDetailStage') === 1, 'stage must have one definition');
assert(mainDensityAt.includes('mode == 1') && mainDensityAt.includes('applyBoundedDetailStage('), 'main shader Hybrid misses stage');
assert(hybridAdapter.includes('applyBoundedDetailStage('), 'global Hybrid misses stage');
assert(hierarchicalHybridAdapter.includes('applyBoundedDetailStage('), 'brick Hybrid misses stage');
assertNoToken(hybridAdapter, 'applyEdgeShaping(');
assertNoToken(hierarchicalHybridAdapter, 'applyEdgeShaping(');
for (const adapter of [cachedAdapter, realtimeAdapter, hierarchicalCachedAdapter]) {
  assert(adapter.includes('applyEdgeShaping('), 'non-Hybrid edge behavior removed');
  assertNoToken(adapter, 'applyBoundedDetailStage(');
  assertNoToken(adapter, 'detailSampler');
}
assertNoToken(cloud, 'fn detailNoise(');
assertNoToken(cloud, 'fn detailAbiReachabilityGuard(');
assert(stage.includes('if (support.x <= 0.0)'), 'support early return missing');
const roughBase = 'let roughBase = min(support.x * evaluation.effectiveDilateGain, 1.0);';
const rough = 'let rough = remapClamped(roughBase, evaluation.hardeningLo, 1.0);';
const roughBranch = 'if (!wantFinal || evaluation.effectiveErosionAmount <= 0.0)';
const roughReturn = 'return vec4f(rough, support.yzw);';
const finalLo = 'let lo = max((1.0 - erosion) * evaluation.effectiveErosionAmount, evaluation.hardeningLo);';
const finalReturn = 'return vec4f(remapClamped(roughBase, lo, 1.0), support.yzw);';
const roughBaseIndex = stage.indexOf(roughBase);
const roughIndex = stage.indexOf(rough);
const roughBranchIndex = stage.indexOf(roughBranch);
const roughReturnIndex = stage.indexOf(roughReturn);
const erosionIndex = stage.indexOf('let erosion = sampleDetailField(pos, evaluation);');
const finalLoIndex = stage.indexOf(finalLo);
const finalReturnIndex = stage.indexOf(finalReturn);
assert(roughBaseIndex >= 0, 'dilated support contract changed');
assert(roughIndex > roughBaseIndex, 'rough must remap the dilated support');
assert(roughBranchIndex > roughIndex && roughReturnIndex > roughBranchIndex && roughReturnIndex < erosionIndex, 'rough early return must return rough before atlas sampling');
assert(erosionIndex > roughReturnIndex, 'final erosion must follow rough fallback');
assert((stage.match(/sampleDetailField\(/g) || []).length === 1, 'stage must call detail helper once');
assert(finalLoIndex > erosionIndex, 'erosion must only set the low threshold');
assert(finalReturnIndex > finalLoIndex, 'final must remap the same dilated support after the low threshold');
assert(remap.includes('if (hi <= lo) { return 0.0; }'), 'remap degenerate-range guard missing');
assert(remap.includes('return clamp((value - lo) / (hi - lo), 0.0, 1.0);'), 'remap no longer bounds final density by its input');
assert((helper.match(/textureSampleLevel\(detailBaseTex/g) || []).length <= 1, 'more than one Base.A sample');
assert((helper.match(/textureSampleLevel\(detailFieldTex/g) || []).length === 1, 'Detail.B sample count');
assert(helper.indexOf('if (evaluation.warpWeight > 0.0)') < helper.indexOf('textureSampleLevel(detailBaseTex'), 'warp branch samples before guard');
assertNoToken(hybridDetailSlice, 'detailMacroTex');
assertNoToken(helper, 'allocationGeneration');
