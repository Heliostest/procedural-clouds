import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const renderer = read('src/renderer.ts');
const cloud = read('shaders/cloud.wgsl');
const i18n = read('src/i18n.ts');
const main = read('src/main.ts');
const gui = read('src/gui.ts');

function assert(condition, message) {
  if (!condition) throw new Error(`W11 TAAU resolve failed: ${message}`);
}

function assertIncludes(source, tokens, scope) {
  for (const token of tokens) {
    assert(source.includes(token), `${scope} is missing ${JSON.stringify(token)}`);
  }
}

function blockStartingAt(source, token, scope) {
  const start = source.indexOf(token);
  assert(start >= 0, `${scope} start token is missing: ${JSON.stringify(token)}`);
  const open = source.indexOf('{', start + token.length);
  assert(open >= 0, `${scope} has no opening brace`);
  let depth = 0;
  for (let index = open; index < source.length; index++) {
    if (source[index] === '{') depth++;
    if (source[index] === '}') {
      depth--;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`W11 TAAU resolve failed: ${scope} has no closing brace`);
}

const renderFrame = blockStartingAt(renderer, 'function renderFrame', 'renderFrame');
assert(renderFrame.includes('const taauActive = activeTemporalModeNum === 2 && cloudFramePath === \'cloud-frame\''),
  'taauActive gate missing');
assert(renderFrame.includes('if (taauActive)'), 'TAAU branch missing');
assert(renderFrame.includes('} else {'), 'full-res TAA else branch missing');

const taauBranch = (() => {
  const start = renderFrame.indexOf('if (taauActive)');
  const open = renderFrame.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < renderFrame.length; i++) {
    if (renderFrame[i] === '{') depth++;
    if (renderFrame[i] === '}') {
      depth--;
      if (depth === 0) return renderFrame.slice(start, i + 1);
    }
  }
  throw new Error('W11 TAAU resolve failed: taauActive branch incomplete');
})();
assert(taauBranch.includes('taauResolvePass.setPipeline(taauResolvePipeline)'), 'TAAU resolve pass');
assert(!taauBranch.includes('cloudTaaPipeline') && !taauBranch.includes('legacyTaaPipeline'),
  'TAAU branch must not run full-res TAA pipelines');

const elseStart = renderFrame.indexOf('} else {', renderFrame.indexOf('if (taauActive)'));
assert(elseStart >= 0, 'else branch after taauActive missing');
const elseBranch = (() => {
  const open = renderFrame.indexOf('{', elseStart);
  let depth = 0;
  for (let i = open; i < renderFrame.length; i++) {
    if (renderFrame[i] === '{') depth++;
    if (renderFrame[i] === '}') {
      depth--;
      if (depth === 0) return renderFrame.slice(elseStart, i + 1);
    }
  }
  throw new Error('W11 TAAU resolve failed: else branch incomplete');
})();
assert(elseBranch.includes('cloudTaaPipeline') || elseBranch.includes('legacyTaaPipeline'),
  'non-TAAU path must run full-res/legacy TAA');
assert(!elseBranch.includes('taauResolvePipeline'), 'non-TAAU path must not run TAAU resolve');
assert(!elseBranch.includes('cloudFrameLowResOutput!.createClearAttachments()'),
  'non-TAAU path must not execute low-res current pass');

assertIncludes(renderer, [
  "cloudFramePathForTemporal !== 'cloud-frame' && activeTemporalModeNum === 2",
  "temporalFallbackReason = 'combined-path'",
  'activeTemporalModeNum = 1',
], 'emergency/combined path disables TAAU');

const classifyShared = (() => {
  const start = renderer.indexOf('const taauClassifySharedSource');
  assert(start >= 0, 'taauClassifySharedSource missing');
  const tick = renderer.indexOf('`', start);
  assert(tick >= 0, 'taauClassifySharedSource has no opening template');
  let i = tick + 1;
  while (i < renderer.length) {
    if (renderer[i] === '\\') { i += 2; continue; }
    if (renderer[i] === '`') return renderer.slice(tick + 1, i);
    i++;
  }
  throw new Error('W11 TAAU resolve failed: taauClassifySharedSource has no closing template');
})();
assertIncludes(classifyShared, [
  'fn taauClassify(',
  'fn taauDebugOverlayColor(',
  'let opacity = 1.0 - sampleColor.a',
  'let histOpacity = 1.0 - hist.a',
  'let minOpacity = 1.0 - maxT',
  'let maxOpacity = 1.0 - minT',
  'let opacityOutside = max(minOpacity - histOpacity, histOpacity - maxOpacity)',
  'if (opacityOutside > TAAU_OPACITY_REJECT_HI)',
  'let cloudCoveredSample = neighborhoodMaxOpacity > TAAU_CLOUD_OPACITY_THRESHOLD',
  'textureSampleLevel(historyCloud, samp, prevUv, 0.0)',
  'textureLoad(historyDepth, histCoord, 0)',
  'let clippedT = clamp(hist.a, minT, maxT)',
  'let outColor = mix(clippedHist, cur, reactive)',
], 'shared classify source');
assert(
  [...classifyShared.matchAll(/\b(?:let|var)\s+(opacity|histOpacity|minOpacity|maxOpacity|neighborhoodMaxOpacity)\s*=\s*([^;]+);/g)]
    .every((m) => m[2].trim().startsWith('1.0 -')),
  'named opacity values must derive from 1.0 - transmittance',
);
assert(!classifyShared.includes('@location(2)'), 'opacity must not be a separate attachment');
assert(!classifyShared.includes('abs(curOpacity - histOpacity)') && !classifyShared.includes('opacityDiff'),
  'opacity reject must not compare hist against a single current sample');
assert(
  classifyShared.indexOf('var minT = 1.0')
    < classifyShared.indexOf('if (opacityOutside > TAAU_OPACITY_REJECT_HI)'),
  '3x3 neighborhood minT/maxT must be computed before opacity rejection',
);
assert(
  classifyShared.indexOf('neighborhoodMaxOpacity') < classifyShared.indexOf('rejectNoVelocity')
  || classifyShared.indexOf('neighborhoodMaxOpacity') < classifyShared.indexOf('out.category = 1'),
  'cloud coverage from 3x3 max opacity must precede all rejection paths',
);

const rejectOrder = [
  'out.category = 0',
  'out.category = 1',
  'out.category = 2',
  'out.category = 3',
  'out.category = 4',
  'out.category = 5',
];
let cursor = 0;
for (const token of rejectOrder) {
  const index = classifyShared.indexOf(token, cursor);
  assert(index >= 0, `classify category order missing ${token}`);
  cursor = index + token.length;
}
assert(classifyShared.indexOf('clippedHist') > classifyShared.indexOf('out.category = 4'),
  'variance clip must follow all rejection exits');

assertIncludes(renderer, [
  '${taauClassifySharedSource}',
  'taauResolveShaderSource',
  'taauDebugOverlayShaderSource',
], 'resolve and debug overlay share classify source constant');
assert(
  (renderer.match(/\$\{taauClassifySharedSource\}/g) || []).length >= 2,
  'both resolve and overlay shaders must interpolate taauClassifySharedSource',
);

const fsTaau = blockStartingAt(renderer, '@fragment fn fsTaau', 'fsTaau');
assertIncludes(fsTaau, [
  'let decision = taauClassify(coord, fc.xy)',
  'return TaauOut(decision.outColor, decision.outDepthEnc)',
], 'resolve uses shared classify for normal output');
assert(!fsTaau.includes('debugMode'), 'resolve must not branch on debugMode');
assert(!fsTaau.includes('vec4f(1.0, 0.4, 0.05'), 'resolve must not write phase debug colors');
assert(!fsTaau.includes('vec4f(1.0, 0.15, 0.15'), 'resolve must not write rejection debug colors');
assert(!fsTaau.includes('vec4f(0.08, 0.1, 0.14'), 'resolve must not write accept debug colors');
assert(!fsTaau.includes('@location(2)'), 'opacity must not be a separate attachment');
assertIncludes(fsTaau, [
  'atomicAdd(&counters.rejectNoVelocity, 1u)',
  'atomicAdd(&counters.rejectViewport, 1u)',
  'atomicAdd(&counters.rejectDepth, 1u)',
  'atomicAdd(&counters.rejectOpacity, 1u)',
  'cloudRejected',
], 'resolve still counts rejection reasons');

const counterOrder = [
  'rejectNoVelocity',
  'rejectViewport',
  'rejectDepth',
  'rejectOpacity',
];
cursor = 0;
for (const token of counterOrder) {
  const index = fsTaau.indexOf(token, cursor);
  assert(index >= 0, `rejection counter order missing ${token}`);
  cursor = index + token.length;
}
assert(
  fsTaau.indexOf('cloudCovered') < fsTaau.indexOf('rejectNoVelocity'),
  'cloudCoveredSample must be classified before first rejection path',
);
for (const token of counterOrder) {
  const idx = fsTaau.indexOf(token);
  const window = fsTaau.slice(idx, idx + 220);
  assert(window.includes('cloudRejected'), `${token} path must increment cloudRejected when cloud-covered`);
}

assert(fsTaau.includes('let outColor = mix(clippedHist, cur, reactive)')
  || classifyShared.includes('let outColor = mix(clippedHist, cur, reactive)'),
  'reactive==0 must keep pure clipped history (no taaBlend)');
assert(!fsTaau.includes('u.flags.y') || fsTaau.includes('let phase = i32(u.flags.y)')
  || classifyShared.includes('let phase = i32(u.flags.y)'),
  'flags.y is phase, not taaBlend');
assert(!fsTaau.includes('params.taaBlend') && !renderer.includes('taauResolveData[1] = params.taaBlend'),
  'taaBlend must not feed TAAU uniforms');
assertIncludes(i18n, [
  'Does not affect TAAU',
  '不影响 TAAU',
], 'taaBlend tip excludes TAAU');

assertIncludes(fsTaau, [
  'sampleStats = (coord.x % 4) == 0 && (coord.y % 4) == 0',
], 'rejection counters use 1/16 grid');
assertIncludes(main, [
  'reject≈',
  '[nv=',
  'cloud≈',
  'thr=',
  'phaseN=',
  '(1/16 sampled)',
], 'HUD labels sampled rejection estimate with reason split');
assertIncludes(renderer, [
  'taauHistoryRejectionSampledEstimate: true',
  'taauHistoryRejectionSampledEstimate: boolean',
  'taauRejectNoVelocityRatio',
  'taauRejectViewportRatio',
  'taauRejectDepthRatio',
  'taauRejectOpacityRatio',
  'taauCloudCoveredRejectionRatio',
  'TAAU_CLOUD_OPACITY_THRESHOLD',
  'cloudCovered',
  'cloudRejected',
], 'RenderStats marks sampled estimate and reason-split / cloud-covered rejection');

assertIncludes(renderer, [
  "activeTemporalModeNum === 2 && cloudFramePath === 'cloud-frame'",
], 'TAAU passes only when temporalQuality resolves to taau-4x4 on cloud-frame');
assert(
  /if \(taaOn && activeTemporalModeNum === 1\)[\s\S]*?halton/.test(renderer),
  'Halton remains on full-res TAA only',
);

assertIncludes(renderer, [
  'function isTaauDebugView',
  'DEBUG_VIEW_TAAU_PHASE',
  'DEBUG_VIEW_TAAU_REJECTION',
  'TAAU_DEBUG_VIEWS',
  'params.debugView >= 0.5 && !isTaauDebugView(params.debugView)',
], 'TAAU debug views keep temporal mode');
assert(
  !/else if \(params\.debugView >= 0\.5\) \{\s*activeTemporalModeNum = 0/.test(renderer),
  'generic debugView>=0.5 must not unconditionally zero temporal mode',
);

const fsTaauDebug = blockStartingAt(renderer, '@fragment fn fsTaauDebug', 'fsTaauDebug');
assertIncludes(fsTaauDebug, [
  'let debugMode = i32(u.flags.z)',
  'taauDebugOverlayColor',
  'taauClassify',
], 'debug overlay derives phase/rejection independently');
assertIncludes(classifyShared, [
  'vec4f(1.0, 0.4, 0.05, 1.0)',
  'vec4f(1.0, 0.15, 0.15, 1.0)',
  'vec4f(0.9, 0.2, 0.9, 1.0)',
  'vec4f(0.15, 0.85, 0.95, 1.0)',
  'vec4f(1.0, 0.85, 0.15, 1.0)',
  'vec4f(0.08, 0.1, 0.14, 1.0)',
], 'debug overlay color map preserved');
assertIncludes(renderFrame, [
  'taauDebugOverlayPass.setPipeline(taauDebugOverlayPipeline)',
  'view: sceneView!',
  'taauActive && isTaauDebugView(params.debugView)',
], 'debug overlay is a separate pass writing sceneView');
assert(
  renderFrame.indexOf('taauResolvePass.setPipeline(taauResolvePipeline)')
    < renderFrame.indexOf('taauDebugOverlayPass.setPipeline(taauDebugOverlayPipeline)'),
  'debug overlay runs after resolve',
);
assert(
  renderFrame.indexOf('cloudCompositePipeline')
    < renderFrame.indexOf('taauDebugOverlayPass.setPipeline(taauDebugOverlayPipeline)'),
  'debug overlay runs after composite',
);
const overlayPassWindow = renderFrame.slice(
  renderFrame.indexOf('taauDebugOverlayPass'),
  renderFrame.indexOf('taauDebugOverlayPass.end()') + 40,
);
assert(!overlayPassWindow.includes('historyViews'), 'debug overlay must not write history');
assert(!overlayPassWindow.includes('historyDepthViews'), 'debug overlay must not write history depth');
assertIncludes(gui, [
  'debugOptions[t(\'debugTaauPhase\')] = 16',
  'debugOptions[t(\'debugTaauRejection\')] = 17',
], 'GUI registers TAAU debug views');
assertIncludes(i18n, [
  'debugTaauPhase',
  'debugTaauRejection',
  'non-destructive overlay',
  '非破坏叠加',
], 'i18n labels mark TAAU debug as non-destructive overlay');
assert(!i18n.includes('pollutes history') && !i18n.includes('会污染 history'),
  'i18n must not claim TAAU debug pollutes history');

void cloud;
console.log('W11 TAAU resolve contracts passed');
