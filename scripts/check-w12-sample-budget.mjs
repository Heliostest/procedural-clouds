import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const cloud = readFileSync(resolve(root, 'shaders/cloud.wgsl'), 'utf8');
const shaderSources = readFileSync(resolve(root, 'src/rendering/densityShaderSources.ts'), 'utf8');
const assert = (value, message) => { if (!value) throw new Error(message); };
const assertIncludes = (source, token) => assert(source.includes(token), `missing ${token}`);
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
function templateStartingAt(source, token) {
  const start = source.indexOf(token);
  assert(start >= 0, `missing ${token}`);
  const open = source.indexOf('`', start);
  const end = source.indexOf('`;', open + 1);
  assert(open >= 0 && end >= 0, `unclosed ${token}`);
  return source.slice(start, end + 1);
}

const controls = blockStartingAt(cloud, 'struct DetailControls');
const presetControls = blockStartingAt(cloud, 'fn detailControlsForPreset(');
const metadataControls = blockStartingAt(cloud, 'fn detailControlsForMetadata(');
const evaluation = blockStartingAt(cloud, 'fn evaluateDetail(');
const sample = blockStartingAt(cloud, 'fn sampleDetailField(');
const stage = blockStartingAt(cloud, 'fn applyBoundedDetailStage(');
const detailSlice = cloud.slice(cloud.indexOf('fn applyBoundedDetailStage('), cloud.indexOf('fn applyEdgeShaping('));
const renderTail = cloud.slice(cloud.indexOf('// Accumulated optical depth toward the sun (raw, not yet attenuated).'), cloud.indexOf('// Density Cache Compute'));
const cachedAdapter = templateStartingAt(shaderSources, 'const cachedQualityAdapter =');
const hybridAdapter = templateStartingAt(shaderSources, 'const hybridQualityAdapter =');
const realtimeAdapter = templateStartingAt(shaderSources, 'const realtimeQualityAdapter =');
const hierarchicalCachedAdapter = templateStartingAt(shaderSources, 'const hierarchicalCachedQualityAdapter =');
const hierarchicalHybridAdapter = templateStartingAt(shaderSources, 'const hierarchicalHybridQualityAdapter =');

for (const field of ['dilateGain', 'erosionAmount', 'detailWeight', 'warpWeight', 'detailWavelengthMeters', 'warpWavelengthMeters']) {
  assertIncludes(controls, field);
}
assertIncludes(presetControls, 'index == 0 || index == 2 || index == 4');
assertIncludes(presetControls, 'DetailControls(1.8, 0.55, 1.0, 1.0, 300.0, 1200.0)');
assertIncludes(presetControls, 'index == 1 || index == 5 || index == 6 || index == 8');
assertIncludes(presetControls, 'DetailControls(1.0, 0.08, 1.0, 0.0, 300.0, 1200.0)');
assertIncludes(presetControls, 'index == 9');
assertIncludes(presetControls, 'DetailControls(1.0, 0.12, 1.0, 0.0, 300.0, 1200.0)');
assertIncludes(presetControls, 'index == 7');
assertIncludes(presetControls, 'DetailControls(1.0, 0.0, 0.0, 0.0, 300.0, 1200.0)');
assertIncludes(metadataControls, 'let w = clamp(w2, 0.0, 0.5);');
assertNoToken(metadataControls, 'w2 >');
for (const field of ['dilateGain', 'erosionAmount', 'detailWeight', 'warpWeight', 'detailWavelengthMeters', 'warpWavelengthMeters']) {
  assertIncludes(metadataControls, `mix(a.${field}, b.${field}, w)`);
}
assertIncludes(evaluation, 'controls.detailWavelengthMeters / max(params.g.detailFreq, 0.01)');
assertIncludes(evaluation, 'controls.warpWavelengthMeters / max(params.g.detailFreq, 0.01)');
assertIncludes(evaluation, 'params.march.metric.x');
assertIncludes(evaluation, 'params.march.metric.y');
assertIncludes(evaluation, 'params.march.limits.x');
assertIncludes(evaluation, 'worldStepMeters(distanceMeters) > 0.5 * wavelength');
assertIncludes(evaluation, 'params.march.controls.x > 0.5');
assertIncludes(evaluation, 'detailResourceControls.enabled > 0.5');
assertIncludes(evaluation, 'params.g.edgeSharpening > 0.5');
assertIncludes(evaluation, 'params.g.detailStrength > 0.0001');
assertIncludes(evaluation, 'min(controls.erosionAmount * params.g.detailStrength, 1.0)');
assertIncludes(evaluation, 'mix(1.0, controls.dilateGain, continuous)');
assertIncludes(evaluation, 'blendedEdgeStyle(idx, idx2, w2).hardness');
assertIncludes(sample, 'dominantWindPhase(pos)');
assertIncludes(sample, 'vec3f(pos.x - phase.x, pos.y, pos.z - phase.y)');
assertIncludes(sample, 'textureSampleLevel(detailBaseTex, detailSampler, warpCoord, 0.0).a');
assertIncludes(sample, '0.15 * evaluation.warpWeight');
assertIncludes(sample, 'textureSampleLevel(detailFieldTex, detailSampler, sampleCoord, 0.0).b');
assertNoToken(sample, 'allocationGeneration');
assertNoToken(sample, 'macro');
assertNoToken(sample, 'camera.position');
assertNoToken(sample, 'phase.z');
assert((sample.match(/textureSampleLevel\(detailBaseTex/g) || []).length === 1, 'Base sample budget exceeded');
assert((sample.match(/textureSampleLevel\(detailFieldTex/g) || []).length === 1, 'Detail sample budget exceeded');
assert((stage.match(/sampleDetailField\s*\(/g) || []).length === 1, 'stage must call detail helper once');
assert(stage.indexOf('if (!wantFinal') < stage.indexOf('sampleDetailField('), 'rough path samples atlas');
assertNoToken(stage, 'detailMacroTex');
assertNoToken(stage, 'sampleMacro');
assert(detailSlice.startsWith('fn applyBoundedDetailStage('), 'stage is not the Hybrid detail slice start');
assertIncludes(detailSlice, 'detailResourceControls');
for (const adapter of [hybridAdapter, hierarchicalHybridAdapter]) {
  assert((adapter.match(/applyBoundedDetailStage\s*\(/g) || []).length === 1, 'Hybrid adapter must call stage once');
  const debugErosion = blockStartingAt(adapter, 'fn w12DebugErosionAt(');
  assertIncludes(debugErosion, 'detailControlsForMetadata(typed.y, typed.z, typed.w)');
  assertIncludes(debugErosion, 'evaluation.effectiveErosionAmount <= 0.0');
  assert((debugErosion.match(/sampleDetailField\s*\(/g) || []).length === 1, 'Hybrid debug helper must sample detail once');
  assert((adapter.match(/sampleDetailField\s*\(/g) || []).length === 1, 'Hybrid adapter debug sample escaped helper');
}
for (const adapter of [cachedAdapter, realtimeAdapter, hierarchicalCachedAdapter]) {
  const debugErosion = blockStartingAt(adapter, 'fn w12DebugErosionAt(');
  assertIncludes(debugErosion, 'return 0.0;');
  for (const token of ['detailControlsForMetadata', 'evaluateDetail', 'sampleDetailField', 'detailResourceControls', 'detailSampler', 'detailBaseTex', 'detailFieldTex']) {
    assertNoToken(adapter, token);
  }
}
for (const token of ['detailControlsForMetadata', 'evaluateDetail', 'sampleDetailField']) assertNoToken(renderTail, token);
assert((renderTail.match(/w12DebugErosionAt\s*\(/g) || []).length === 1, 'shared render tail must call debug adapter once');
