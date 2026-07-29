import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const assert = (value, message) => { if (!value) throw new Error(message); };

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
  return source.slice(open + 1, end);
}

function argumentCount(source, start) {
  let depth = 0;
  let commas = 0;
  for (let i = start; i < source.length; i++) {
    if (source[i] === '(') depth++;
    if (source[i] === ')') {
      depth--;
      if (depth === 0) {
        const args = source.slice(start + 1, i).trim().replace(/,\s*$/, '');
        return { count: args === '' ? 0 : commas + 1 - (source.slice(start + 1, i).trim().endsWith(',') ? 1 : 0), end: i };
      }
    }
    if (source[i] === ',' && depth === 1) commas++;
  }
  throw new Error('unclosed call');
}

function callsIn(source, label) {
  const calls = [];
  const matcher = /\b(densityAtTyped|densityAt)\s*\(/g;
  for (const match of source.matchAll(matcher)) {
    const lineStart = source.lastIndexOf('\n', match.index) + 1;
    if (source.slice(lineStart, match.index).trimEnd().endsWith('fn')) continue;
    const parsed = argumentCount(source, match.index + match[0].lastIndexOf('('));
    calls.push({
      label,
      name: match[1],
      args: parsed.count,
      text: source.slice(match.index, parsed.end + 1).replace(/\s+/g, ' '),
    });
  }
  return calls;
}

function assertExactCalls(calls, label, expected) {
  const actual = calls.map(({ name, text }) => ({ name, text }));
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${label} calls changed: ${JSON.stringify(actual)}`);
}

function sectionBetween(source, startToken, endToken) {
  const start = source.indexOf(startToken);
  assert(start >= 0, `missing ${startToken}`);
  const end = source.indexOf(endToken, start + startToken.length);
  assert(end >= 0, `missing ${endToken} after ${startToken}`);
  return source.slice(start, end);
}

function callStartingAt(source, token) {
  const start = source.indexOf(token);
  assert(start >= 0, `missing ${token}`);
  const open = source.indexOf('(', start + token.length);
  const parsed = argumentCount(source, open);
  return { args: parsed.count, text: source.slice(start, parsed.end + 1) };
}

function callCount(source, token) {
  return source.split(token).length - 1;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const cloud = read('shaders/cloud.wgsl');
const shaderSources = read('src/rendering/densityShaderSources.ts');
const params = read('src/params.ts');
const gui = read('src/gui.ts');
const i18n = read('src/i18n.ts');
const renderer = read('src/renderer.ts');
const cloudFrameOutput = read('src/rendering/cloudFrameOutput.ts');
const adapters = [
  ['cachedQualityAdapter', templateStartingAt(shaderSources, 'const cachedQualityAdapter =')],
  ['hybridQualityAdapter', templateStartingAt(shaderSources, 'const hybridQualityAdapter =')],
  ['realtimeQualityAdapter', templateStartingAt(shaderSources, 'const realtimeQualityAdapter =')],
  ['hierarchicalCachedQualityAdapter', templateStartingAt(shaderSources, 'const hierarchicalCachedQualityAdapter =')],
  ['hierarchicalHybridQualityAdapter', templateStartingAt(shaderSources, 'const hierarchicalHybridQualityAdapter =')],
];
const stage = blockStartingAt(cloud, 'fn applyBoundedDetailStage(');
const cloudScalarWrapper = blockStartingAt(cloud, 'fn densityAt(');
const lightMarch = blockStartingAt(cloud, 'fn lightMarchDepth(');
const legacyGround = blockStartingAt(cloud, 'fn legacyGroundShadow(');
const adaptiveGround = blockStartingAt(cloud, 'fn integrateGroundShadow(');
const mainLoop = blockStartingAt(cloud, 'fn renderCloudFrame(');
const silverProbe = mainLoop.slice(mainLoop.indexOf('silverGate'));
const allCalls = [
  ...callsIn(cloud, 'shaders/cloud.wgsl'),
  ...adapters.flatMap(([label, source]) => callsIn(source, `src/rendering/densityShaderSources.ts:${label}`)),
];

const expectedWrapperCall = [{ name: 'densityAtTyped', text: 'densityAtTyped(pos, wantFinal)' }];
const expectedLightCall = [{ name: 'densityAt', text: 'densityAt(p, false)' }];
const expectedGroundCall = [{ name: 'densityAt', text: 'densityAt(sp, false)' }];
const expectedMainCalls = [
  { name: 'densityAtTyped', text: 'densityAtTyped(pos, true)' },
  { name: 'densityAtTyped', text: 'densityAtTyped(pos, false)' },
  { name: 'densityAt', text: 'densityAt(pos + SUN_DIR * probeOffset, false)' },
];
const expectedSilverCall = [{ name: 'densityAt', text: 'densityAt(pos + SUN_DIR * probeOffset, false)' }];

assert(allCalls.length === 12, `expected 12 real density calls, got ${allCalls.length}`);
assert(allCalls.every((call) => call.args === 2), `legacy one-argument density call: ${allCalls.filter((call) => call.args !== 2).map((call) => `${call.label} ${call.text}`).join('; ')}`);
assertExactCalls(callsIn(cloud, 'cloud'), 'cloud', [
  ...expectedWrapperCall,
  ...expectedLightCall,
  ...expectedGroundCall,
  ...expectedGroundCall,
  ...expectedMainCalls,
]);
assertExactCalls(callsIn(cloudScalarWrapper, 'cloud scalar wrapper'), 'cloud scalar wrapper', expectedWrapperCall);
assertExactCalls(callsIn(lightMarch, 'light'), 'light', expectedLightCall);
assertExactCalls(callsIn(legacyGround, 'legacy ground'), 'legacy ground', expectedGroundCall);
assertExactCalls(callsIn(adaptiveGround, 'adaptive ground'), 'adaptive ground', expectedGroundCall);
assertExactCalls(callsIn(mainLoop, 'main'), 'main', expectedMainCalls);
assertExactCalls(callsIn(silverProbe, 'silver probe'), 'silver probe', expectedSilverCall);
assert(stage.includes('if (!wantFinal'), 'false branch missing');
assert(stage.indexOf('if (!wantFinal') < stage.indexOf('sampleDetailField('), 'rough branch samples atlas');
for (const [, adapter] of adapters) {
  assert(adapter.includes('fn densityAtTyped(pos : vec3f, wantFinal : bool)'), 'adapter typed bool wrapper missing');
  assert(adapter.includes('fn densityAt(pos : vec3f, wantFinal : bool)'), 'adapter scalar bool wrapper missing');
  assert(adapter.includes('fn w12DebugErosionAt(pos : vec3f, typed : vec4f) -> f32'), 'adapter debug erosion wrapper missing');
}
const hybridAdapterLabels = new Set(['hybridQualityAdapter', 'hierarchicalHybridQualityAdapter']);
for (const [label, adapter] of adapters) {
  assertExactCalls(callsIn(adapter, label), label, expectedWrapperCall);
}
for (const [label, adapter] of adapters.filter(([label]) => hybridAdapterLabels.has(label))) {
  const typedWrapper = blockStartingAt(adapter, 'fn densityAtTyped(');
  const debugErosion = blockStartingAt(adapter, 'fn w12DebugErosionAt(');
  const sample = label === 'hybridQualityAdapter' ? 'sampleDensityTyped' : 'sampleHierarchicalDensityTyped';
  assert(typedWrapper.includes(`applyBoundedDetailStage(${sample}(pos), pos, wantFinal)`), 'Hybrid adapter drops wantFinal');
  assert((typedWrapper.match(/applyBoundedDetailStage\s*\(/g) || []).length === 1, 'Hybrid adapter stage call count changed');
  assert(debugErosion.includes('detailControlsForMetadata(typed.y, typed.z, typed.w)'), 'Hybrid debug helper lost metadata controls');
  assert(debugErosion.includes('if (evaluation.effectiveErosionAmount <= 0.0) { return 0.0; }'), 'Hybrid debug helper lost zero guard');
  assert((debugErosion.match(/sampleDetailField\s*\(/g) || []).length === 1, 'Hybrid debug helper sample count changed');
}
for (const [, adapter] of adapters.filter(([label]) => !hybridAdapterLabels.has(label))) {
  const debugErosion = blockStartingAt(adapter, 'fn w12DebugErosionAt(');
  assert(adapter.includes('applyEdgeShaping('), 'non-Hybrid adapter lost edge behavior');
  assert(!adapter.includes('applyBoundedDetailStage('), 'non-Hybrid adapter gained detail stage');
  assert(debugErosion.includes('return 0.0;'), 'non-Hybrid debug helper must return zero');
  assert(!/detailControlsForMetadata|evaluateDetail|sampleDetailField|detailResourceControls/.test(debugErosion), 'non-Hybrid debug helper gained Hybrid detail');
}

const defaults = blockStartingAt(params, 'export function createDefaultParams()');
for (const [field, value] of [['detailFreq', '1'], ['detailStrength', '1'], ['worldStepEnabled', 'true'], ['worldStepMaxIterations', '512'], ['worldStepMinMeters', '120']]) {
  assert(new RegExp(`\\b${field}: ${value},`).test(defaults), `W12 default ${field} missing`);
}
const debugOptions = sectionBetween(gui, 'const debugOptions: Record<string, number> = {};', "tipKey(debugFolder.add(params, 'debugView', debugOptions)");
for (const [key, value] of [['debugW12Erosion', '18'], ['debugW12FinalMinusRough', '19']]) {
  const option = new RegExp(`debugOptions\\[t\\('${key}'\\)\\] = ${value};`, 'g');
  assert((debugOptions.match(option) || []).length === 1, `GUI option ${key} is missing or duplicated`);
}
assert(!/debugOptions\[t\('debugTaauPhase'\)\] = (?!16;)/.test(debugOptions), 'debug 16 changed');
assert(!/debugOptions\[t\('debugTaauRejection'\)\] = (?!17;)/.test(debugOptions), 'debug 17 changed');
const dictionary = blockStartingAt(i18n, 'const DICT');
for (const [key, en, zh] of [
  ['debugW12Erosion', 'W12 Erosion (non-destructive overlay)', 'W12 侵蚀（非破坏叠加）'],
  ['debugW12FinalMinusRough', 'W12 Final − Rough (signed; non-destructive overlay)', 'W12 Final − Rough（有符号；非破坏叠加）'],
]) {
  const entry = new RegExp(`${key}: \\{ en: '${escapeRegExp(en)}', zh: '${escapeRegExp(zh)}' \\}`, 'g');
  assert((dictionary.match(entry) || []).length === 1, `localized debug label ${key} is missing or duplicated`);
}
const cacheControls = sectionBetween(gui, "tipKey(cacheFolder.add(params, 'detailFreq'", 'const wgProxy =');
assert(/'detailFreq', 0\.5, 16\.0, 0\.1/.test(cacheControls), 'detail wavelength GUI range changed');
assert(/'detailStrength', 0\.0, 4\.0, 0\.01/.test(cacheControls), 'global erosion GUI range changed');

const cloudFrameTargets = blockStartingAt(cloud, 'struct CloudFrameTargets');
const targetLocations = [...cloudFrameTargets.matchAll(/@location\((\d+)\)\s+(\w+)/g)].map((match) => [match[1], match[2]]);
assert(JSON.stringify(targetLocations) === JSON.stringify([['0', 'radianceTransmittance'], ['1', 'depthVelocity'], ['2', 'backgroundRadiance']]), 'cloud-frame targets changed');
const clearAttachments = blockStartingAt(cloudFrameOutput, 'createClearAttachments()');
const attachmentViews = [...clearAttachments.matchAll(/view: views\.(\w+)/g)].map((match) => match[1]);
assert(JSON.stringify(attachmentViews) === JSON.stringify(['radianceTransmittance', 'depthVelocity', 'backgroundRadiance']), 'cloud-frame attachment array changed');
assert(/const ATTACHMENT_COUNT = 3;/.test(cloudFrameOutput), 'cloud-frame attachment count changed');
const cloudFrame = blockStartingAt(cloud, 'fn renderCloudFrame(');
const cloudFrameReturn = callStartingAt(cloudFrame, 'return CloudFrameSample');
assert(cloudFrameReturn.args === 4 && cloudFrameReturn.text.includes('vec4f(background, backgroundAlpha)'), `CloudFrameSample debug carrier changed: ${cloudFrameReturn.args} ${cloudFrameReturn.text}`);
const encodeW12DetailDebug = blockStartingAt(cloud, 'fn encodeW12DetailDebug(');
assert(encodeW12DetailDebug.startsWith('fn encodeW12DetailDebug(view : i32, erosion : f32, rough : f32, finalDensity : f32) -> f32'), 'W12 debug encoder signature changed');
assert(!/\bfinal\b/.test(encodeW12DetailDebug), 'W12 debug encoder uses reserved identifier final');
assert(encodeW12DetailDebug.includes('return clamp(0.5 + 0.5 * (finalDensity - rough), 0.0, 1.0);'), 'W12 signed final-minus-rough expression changed');
const detailDebugBlock = blockStartingAt(cloudFrame, 'if (debugView == 18 || debugView == 19)');
const erosionDebugBranch = blockStartingAt(detailDebugBlock, 'if (debugView == 18)');
assert(detailDebugBlock.includes('rough = densityAtTyped(pos, false).x;'), 'debug 19 rough sample escapes detail debug');
assert(erosionDebugBranch.includes('erosion = w12DebugErosionAt(pos, dt);'), 'debug 18 adapter call missing');
assert(!/detailControlsForMetadata|evaluateDetail|sampleDetailField/.test(cloudFrame), 'shared render tail contains Hybrid-only detail symbols');
assert((cloudFrame.match(/w12DebugErosionAt\s*\(/g) || []).length === 1, 'shared render tail debug helper call count changed');
const dynamicDebugErosion = blockStartingAt(cloud, 'fn w12DebugErosionAt(');
assert(dynamicDebugErosion.includes('if (i32(params.g.qualityMode) != 1) { return 0.0; }'), 'dynamic debug helper lost Hybrid guard');
assert(dynamicDebugErosion.includes('detailControlsForMetadata(typed.y, typed.z, typed.w)'), 'dynamic debug helper lost metadata controls');
assert((dynamicDebugErosion.match(/sampleDetailField\s*\(/g) || []).length === 1, 'dynamic debug helper sample count changed');
assert(cloudFrame.includes('let contribution = transmittance * (1.0 - step_trans);'), 'W12 debug weight changed');
assert(cloudFrame.includes('let emptyDebugScalar = select(0.5, 0.0, debugView == 18);'), 'W12 no-cloud debug scalar changed');
assert(cloudFrame.includes('let backgroundAlpha = select(1.0, w12DebugScalar, debugView == 18 || debugView == 19);'), 'W12 current-only alpha carrier missing');
assert((cloudFrame.match(/sampleDetailField\(/g) || []).length === 0, 'shared render tail directly samples Hybrid detail');

const composite = templateStartingAt(renderer, 'const cloudCompositeShaderSource =');
const compositeFragment = blockStartingAt(composite, '@fragment fn fsComposite');
const compositeBackgroundSamples = [...compositeFragment.matchAll(/textureSampleLevel\(backgroundTex, samp, uv, 0\.0\)\.(rgb|rgba|a)/g)];
assert(compositeBackgroundSamples.length === 1 && compositeBackgroundSamples[0][1] === 'rgb', 'composite must only sample background RGB');
const w12OverlayShader = templateStartingAt(renderer, 'const w12DetailDebugOverlayShaderSource =');
const w12OverlayFragment = blockStartingAt(w12OverlayShader, '@fragment fn fsW12DetailDebug');
const overlaySamples = [...w12OverlayFragment.matchAll(/textureSampleLevel\(debugScalar, debugSampler, uv, 0\.0\)\.(rgb|rgba|a)/g)];
assert(overlaySamples.length === 1 && overlaySamples[0][1] === 'a', 'W12 overlay must only read background alpha');
assert(w12OverlayFragment.includes('debugViewId == 19'), 'W12 signed difference branch missing');
assert(w12OverlayFragment.includes('signedDifference < 0.0'), 'W12 negative difference color missing');
assert(w12OverlayFragment.includes('vec3f(0.12, 0.35, 1.0)'), 'W12 negative difference is not blue');
assert(w12OverlayFragment.includes('vec3f(1.0, 0.20, 0.10)'), 'W12 positive difference is not red');
const overlayFlow = sectionBetween(renderer, 'if (isW12DetailDebugView(params.debugView))', '\n    historyValid = true;');
const overlayPass = blockStartingAt(overlayFlow, 'const w12DetailDebugOverlayPass =');
assert(overlayFlow.includes('cloudFrameOutput!.backgroundRadianceView') && overlayFlow.includes('cloudFrameLowResOutput!.backgroundRadianceView'), 'W12 current sources changed');
assert(!overlayFlow.includes('historyViews'), 'W12 overlay writes history');
assert(overlayPass.includes('view: sceneView!') && overlayPass.includes("loadOp: 'load'"), 'W12 overlay must load composite scene');

const nonDestructivePredicate = blockStartingAt(renderer, 'function isNonDestructiveTemporalDebugView(');
const taauPredicate = blockStartingAt(renderer, 'function isTaauDebugView(');
const w12Predicate = blockStartingAt(renderer, 'function isW12DetailDebugView(');
assert(nonDestructivePredicate.includes('return rounded === 16 || rounded === 17 || rounded === 18 || rounded === 19;'), 'non-destructive debug range changed');
assert(taauPredicate.includes('TAAU_DEBUG_VIEWS') && renderer.includes('TAAU_DEBUG_VIEWS = Object.freeze([DEBUG_VIEW_TAAU_PHASE, DEBUG_VIEW_TAAU_REJECTION]'), 'TAAU debug range changed');
assert(w12Predicate.includes('return rounded === 18 || rounded === 19;'), 'W12 debug range changed');
assert(callCount(renderer, 'isNonDestructiveTemporalDebugView(') === 3, 'non-destructive predicate call count changed');
assert(callCount(renderer, 'isTaauDebugView(') === 2, 'W11 overlay predicate call count changed');
assert(callCount(renderer, 'isW12DetailDebugView(') === 2, 'W12 overlay predicate call count changed');
const taaOn = sectionBetween(renderer, 'const taaOn =', 'const activeQualityBundleForTemporal');
const temporalFallback = sectionBetween(renderer, 'if (!params.taaEnabled)', 'const temporalBayerPhase');
assert(taaOn.includes('isNonDestructiveTemporalDebugView(params.debugView)'), 'taaOn ignores non-destructive debug views');
assert(temporalFallback.includes('!isNonDestructiveTemporalDebugView(params.debugView)'), 'temporal fallback resets W12 debug');
const taauOverlayFlow = sectionBetween(renderer, 'if (taauActive && isTaauDebugView(params.debugView))', 'if (isW12DetailDebugView(params.debugView))');
assert(!taauOverlayFlow.includes('isW12DetailDebugView'), 'W11 overlay consumes W12 debug');

const legacyTaa = templateStartingAt(renderer, 'const legacyTaaShaderSource =');
const cloudTaa = templateStartingAt(renderer, 'const cloudTaaShaderSource =');
const taauResolve = templateStartingAt(renderer, 'const taauResolveShaderSource =');
for (const [name, source] of [['legacy TAA', legacyTaa], ['cloud TAA', cloudTaa], ['TAAU resolve', taauResolve]]) {
  assert(!/backgroundRadiance|backgroundTex|debugScalar/.test(source), `${name} consumes the background alpha carrier`);
}
const sceneResources = blockStartingAt(renderer, 'function ensureSceneTexture(');
const cloudTaaBindings = sectionBetween(sceneResources, 'cloudTaaBindGroups =', 'cloudCompositeBindGroups =');
const taauBindings = sectionBetween(sceneResources, 'taauResolveBindGroups =', 'taauDebugOverlayBindGroups =');
assert(!/backgroundRadiance|debugScalar/.test(cloudTaaBindings), 'full-res history bind group consumes debug carrier');
assert(!/backgroundRadiance|debugScalar/.test(taauBindings), 'TAAU history bind group consumes debug carrier');
for (const call of allCalls) console.log(`${call.label}: ${call.text}`);
console.log('W12 rough/final call graph passed');
