import { createDefaultBodies, type CloudBody } from './body';
import { CLOUD_GENERA, type CloudGenus } from './genusProfile';
import { createDefaultParams, type CloudParams } from './params';
import type { WindAdvectionSample } from './wind';

export const DENSITY_BENCHMARK_SCHEMA_VERSION = 4 as const;
export const DENSITY_BENCHMARK_BASELINE_ID = 'density-v2-w0-legacy-v1';

export type BenchmarkQuality = 'cached' | 'hybrid' | 'realtime';
export type BenchmarkView = 'normal' | 'density-debug';
export type BenchmarkProducer = 'legacy' | 'recipe-v2';
export type BenchmarkSceneId = `single-${CloudGenus}`
  | 'stress-all-genera'
  | 'stress-complex-cb'
  | 'w6-stratus-multi'
  | 'w6-cumulus-multi'
  | 'w6-stratus-cumulus-overlap'
  | 'w7-stratiform-stack'
  | 'w7-stratiform-overlap'
  | 'w8-cellular-scale'
  | 'w8-cellular-overlap'
  | 'w8-wave-ripple';
export type BenchmarkCaseStatus = 'pending' | 'running' | 'complete' | 'invalid' | 'stale';

type SerializableParamKey = {
  [K in keyof CloudParams]: CloudParams[K] extends (...args: never[]) => unknown ? never : K
}[keyof CloudParams];

export type BenchmarkCloudParams = Pick<CloudParams, SerializableParamKey>;

export interface BenchmarkViewport {
  width: number;
  height: number;
}

export interface BenchmarkCamera {
  eye: [number, number, number];
  target: [number, number, number];
  up: [number, number, number];
  fovYRadians: number;
  near: number;
  far: number;
}

export interface BenchmarkActiveChange {
  status: string;
  authoritativeSetting: string;
  compatibilityAnchor?: string;
}

export interface BenchmarkScene {
  id: BenchmarkSceneId;
  label: string;
  sceneTimeSeconds: number;
  bodies: CloudBody[];
  windSamples: WindAdvectionSample[];
  camera?: BenchmarkCamera;
}

export interface DensityBenchmarkCase {
  id: string;
  sceneId: BenchmarkSceneId;
  quality: BenchmarkQuality;
  view: BenchmarkView;
  gateRequired: boolean;
  timingRequired: boolean;
  screenshotRequired: boolean;
  realtimeCompatibilityOnly: boolean;
  screenshotPath: string;
  producer?: BenchmarkProducer;
}

export interface DensityBenchmarkManifest {
  schemaVersion: typeof DENSITY_BENCHMARK_SCHEMA_VERSION;
  baselineId: string;
  sourceRevision: string;
  activeChanges: Record<string, BenchmarkActiveChange>;
  viewport: BenchmarkViewport;
  camera: BenchmarkCamera;
  warmupFrames: number;
  minimumCacheWarmups: number;
  minimumGpuSamples: number;
  params: BenchmarkCloudParams;
  scenes: BenchmarkScene[];
  cases: DensityBenchmarkCase[];
}

const QUALITY_MODE: Record<BenchmarkQuality, number> = {
  cached: 0,
  hybrid: 1,
  realtime: 2,
};

const VIEW_MODE: Record<BenchmarkView, number> = {
  normal: 0,
  // Raw density-path integral: independent of genus optical absorption and lighting presets.
  'density-debug': 10,
};

function cloneBody(body: CloudBody): CloudBody {
  return {
    ...body,
    bounds: body.bounds.slice(),
    rot: [...body.rot],
    life: { ...body.life },
  };
}

function freezeBody(body: CloudBody): CloudBody {
  return {
    ...cloneBody(body),
    placementLocked: true,
    windDeg: 0,
    windSpeedMps: 0,
    morphRate: 0,
    life: { ...body.life, enabled: false },
  };
}

function centeredBody(genus: CloudGenus): CloudBody {
  const source = createDefaultBodies().find((body) => body.type === genus);
  if (!source) throw new Error(`Missing default benchmark body for genus '${genus}'`);
  const halfX = Math.max(1, (source.bounds[2] - source.bounds[0]) * 0.5);
  const halfZ = Math.max(1, (source.bounds[3] - source.bounds[1]) * 0.5);
  const body = freezeBody(source);
  body.id = `benchmark-${genus}`;
  body.bounds = [-halfX, -halfZ, halfX, halfZ];
  return body;
}

function zeroWind(count: number): WindAdvectionSample[] {
  return Array.from({ length: count }, () => ({ offsetM: [0, 0], morphTime: 0 }));
}

function translatedBody(source: CloudBody, id: string, offsetX: number, offsetZ: number): CloudBody {
  const body = cloneBody(source);
  body.id = id;
  body.bounds = [
    source.bounds[0] + offsetX,
    source.bounds[1] + offsetZ,
    source.bounds[2] + offsetX,
    source.bounds[3] + offsetZ,
  ];
  return body;
}

function createScenes(): BenchmarkScene[] {
  const singleScenes = CLOUD_GENERA.map((genus): BenchmarkScene => {
    const bodies = [centeredBody(genus)];
    return {
      id: `single-${genus}`,
      label: `Single ${genus}`,
      sceneTimeSeconds: 12,
      bodies,
      windSamples: zeroWind(bodies.length),
    };
  });

  const allBodies = createDefaultBodies().map(freezeBody);
  const complexCb = centeredBody('cumulonimbus');
  complexCb.id = 'benchmark-complex-cb';
  complexCb.bounds = [-5000, -5000, 5000, 5000];
  complexCb.coverage = Math.max(0.85, complexCb.coverage);
  complexCb.densityScale = 1.15;
  const stratus = centeredBody('stratus');
  const cumulus = centeredBody('cumulus');
  const stratusMulti = [
    translatedBody(stratus, 'w6-stratus-west', -2600, 0),
    translatedBody(stratus, 'w6-stratus-center', 0, 0),
    translatedBody(stratus, 'w6-stratus-east', 2600, 0),
  ];
  const cumulusMulti = [
    translatedBody(cumulus, 'w6-cumulus-nw', -2200, -1700),
    translatedBody(cumulus, 'w6-cumulus-center', 0, 0),
    translatedBody(cumulus, 'w6-cumulus-se', 2200, 1700),
  ];
  const overlap = [
    translatedBody(stratus, 'w6-overlap-stratus', 0, 0),
    translatedBody(cumulus, 'w6-overlap-cumulus', 0, 0),
  ];
  const cirrostratus = centeredBody('cirrostratus');
  const altostratus = centeredBody('altostratus');
  const nimbostratus = centeredBody('nimbostratus');
  const stratiformStack = [
    translatedBody(stratus, 'w7-stack-stratus', -1800, 0),
    translatedBody(altostratus, 'w7-stack-altostratus', 0, 0),
    translatedBody(cirrostratus, 'w7-stack-cirrostratus', 1800, 0),
    translatedBody(nimbostratus, 'w7-stack-nimbostratus', 0, 1600),
  ];
  const stratiformOverlap = [
    translatedBody(stratus, 'w7-overlap-stratus', 0, 0),
    translatedBody(cirrostratus, 'w7-overlap-cirrostratus', 0, 0),
    translatedBody(altostratus, 'w7-overlap-altostratus', 0, 0),
    translatedBody(nimbostratus, 'w7-overlap-nimbostratus', 0, 0),
  ];
  const stratocumulus = centeredBody('stratocumulus');
  const altocumulus = centeredBody('altocumulus');
  const cirrocumulus = centeredBody('cirrocumulus');
  const cellularScale = [
    translatedBody(stratocumulus, 'w8-scale-stratocumulus', -3000, 0),
    translatedBody(altocumulus, 'w8-scale-altocumulus', 0, 0),
    translatedBody(cirrocumulus, 'w8-scale-cirrocumulus', 3000, 0),
  ];
  const cellularOverlap = [
    translatedBody(stratocumulus, 'w8-overlap-stratocumulus', 0, 0),
    translatedBody(altocumulus, 'w8-overlap-altocumulus', 0, 0),
    translatedBody(cirrocumulus, 'w8-overlap-cirrocumulus', 0, 0),
    translatedBody(stratus, 'w8-overlap-stratus', 0, 0),
    translatedBody(cumulus, 'w8-overlap-cumulus', 0, 0),
  ];
  const waveRipple = [
    translatedBody(cirrocumulus, 'w8-ripple-west', -2200, 0),
    translatedBody(cirrocumulus, 'w8-ripple-center', 0, 0),
    translatedBody(cirrocumulus, 'w8-ripple-east', 2200, 0),
  ];

  return [
    ...singleScenes,
    {
      id: 'stress-all-genera',
      label: 'All ten genera',
      sceneTimeSeconds: 12,
      bodies: allBodies,
      windSamples: zeroWind(allBodies.length),
    },
    {
      id: 'stress-complex-cb',
      label: 'Single complex cumulonimbus',
      sceneTimeSeconds: 12,
      bodies: [complexCb],
      windSamples: zeroWind(1),
    },
    {
      id: 'w6-stratus-multi',
      label: 'W6 Stratus multi-body',
      sceneTimeSeconds: 12,
      bodies: stratusMulti,
      windSamples: zeroWind(stratusMulti.length),
    },
    {
      id: 'w6-cumulus-multi',
      label: 'W6 Cumulus multi-body',
      sceneTimeSeconds: 12,
      bodies: cumulusMulti,
      windSamples: zeroWind(cumulusMulti.length),
    },
    {
      id: 'w6-stratus-cumulus-overlap',
      label: 'W6 Stratus + Cumulus overlap',
      sceneTimeSeconds: 12,
      bodies: overlap,
      windSamples: zeroWind(overlap.length),
    },
    {
      id: 'w7-stratiform-stack',
      label: 'W7 Stratiform family stack',
      sceneTimeSeconds: 12,
      bodies: stratiformStack,
      windSamples: zeroWind(stratiformStack.length),
    },
    {
      id: 'w7-stratiform-overlap',
      label: 'W7 Stratiform family overlap',
      sceneTimeSeconds: 12,
      bodies: stratiformOverlap,
      windSamples: zeroWind(stratiformOverlap.length),
    },
    {
      id: 'w8-cellular-scale',
      label: 'W8 Cellular scale: Sc > Ac > Cc',
      sceneTimeSeconds: 12,
      bodies: cellularScale,
      windSamples: zeroWind(cellularScale.length),
    },
    {
      id: 'w8-cellular-overlap',
      label: 'W8 Cellular + Stratiform + Cumulus overlap',
      sceneTimeSeconds: 12,
      bodies: cellularOverlap,
      windSamples: zeroWind(cellularOverlap.length),
    },
    {
      id: 'w8-wave-ripple',
      label: 'W8 Cirrocumulus wave/ripple phase continuity',
      sceneTimeSeconds: 12,
      bodies: waveRipple,
      windSamples: [
        { offsetM: [0, 0], morphTime: 0 },
        { offsetM: [1200, 600], morphTime: 0 },
        { offsetM: [2400, 1200], morphTime: 0 },
      ],
    },
  ];
}

function caseId(sceneId: BenchmarkSceneId, quality: BenchmarkQuality, view: BenchmarkView): string {
  return `${sceneId}--${quality}--${view}`;
}

function screenshotPath(id: string): string {
  return `screenshots/${id}.png`;
}

const W0_REPRESENTATIVE_SCENES: readonly BenchmarkSceneId[] = [
  'single-stratus',
  'single-cumulus',
  'single-cirrus',
  'stress-complex-cb',
  'stress-all-genera',
];

const W0_VISUAL_ANCHOR_QUALITY: Partial<Record<BenchmarkSceneId, BenchmarkQuality>> = {
  'single-stratus': 'cached',
  'single-cumulus': 'hybrid',
  'single-cirrus': 'cached',
  'stress-complex-cb': 'hybrid',
  'stress-all-genera': 'cached',
};

// Project-owner review on 2026-07-11 made W0 captures advisory. Keep the
// representative cases runnable, but do not block later Waves on missing evidence.
const W0_EVIDENCE_BLOCKS_GATE = false;

function evidenceRequirements(
  sceneId: BenchmarkSceneId,
  quality: BenchmarkQuality,
  view: BenchmarkView,
): Pick<DensityBenchmarkCase, 'gateRequired' | 'timingRequired' | 'screenshotRequired'> {
  const representative = W0_REPRESENTATIVE_SCENES.includes(sceneId);
  const timingRequired = representative && quality !== 'realtime' && view === 'normal';
  const screenshotRequired = representative && W0_VISUAL_ANCHOR_QUALITY[sceneId] === quality;
  return {
    gateRequired: W0_EVIDENCE_BLOCKS_GATE && (timingRequired || screenshotRequired),
    timingRequired,
    screenshotRequired,
  };
}

function createCases(): DensityBenchmarkCase[] {
  const cases: DensityBenchmarkCase[] = [];
  const qualities: BenchmarkQuality[] = ['cached', 'hybrid'];
  const views: BenchmarkView[] = ['normal', 'density-debug'];

  for (const genus of CLOUD_GENERA) {
    const sceneId: BenchmarkSceneId = `single-${genus}`;
    for (const quality of qualities) {
      for (const view of views) {
        const id = caseId(sceneId, quality, view);
        const requirements = evidenceRequirements(sceneId, quality, view);
        cases.push({
          id,
          sceneId,
          quality,
          view,
          ...requirements,
          realtimeCompatibilityOnly: false,
          screenshotPath: screenshotPath(id),
        });
      }
    }
  }

  for (const sceneId of ['stress-all-genera', 'stress-complex-cb'] as const) {
    for (const quality of qualities) {
      for (const view of views) {
        const id = caseId(sceneId, quality, view);
        const requirements = evidenceRequirements(sceneId, quality, view);
        cases.push({
          id,
          sceneId,
          quality,
          view,
          ...requirements,
          realtimeCompatibilityOnly: false,
          screenshotPath: screenshotPath(id),
        });
      }
    }
  }

  const realtimeId = caseId('single-cumulus', 'realtime', 'normal');
  cases.push({
    id: realtimeId,
    sceneId: 'single-cumulus',
    quality: 'realtime',
    view: 'normal',
    gateRequired: false,
    timingRequired: false,
    screenshotRequired: false,
    realtimeCompatibilityOnly: true,
    screenshotPath: '',
  });
  const w6Scenes: readonly BenchmarkSceneId[] = [
    'single-stratus',
    'w6-stratus-multi',
    'single-cumulus',
    'w6-cumulus-multi',
    'w6-stratus-cumulus-overlap',
  ];
  for (const sceneId of w6Scenes) {
    for (const producer of ['legacy', 'recipe-v2'] as const) {
      for (const quality of ['cached', 'hybrid'] as const) {
        for (const view of ['normal', 'density-debug'] as const) {
          const id = `w6--${sceneId}--${producer}--${quality}--${view}`;
          cases.push({
            id,
            sceneId,
            producer,
            quality,
            view,
            gateRequired: quality === 'cached' && view === 'normal',
            timingRequired: quality === 'cached' && view === 'normal',
            screenshotRequired: true,
            realtimeCompatibilityOnly: false,
            screenshotPath: screenshotPath(id),
          });
        }
      }
    }
  }
  const w7Scenes: readonly BenchmarkSceneId[] = [
    'single-stratus', 'single-cirrostratus', 'single-altostratus', 'single-nimbostratus',
    'w7-stratiform-stack', 'w7-stratiform-overlap',
  ];
  for (const sceneId of w7Scenes) {
    for (const producer of ['legacy', 'recipe-v2'] as const) {
      for (const quality of ['cached', 'hybrid'] as const) {
        for (const view of ['normal', 'density-debug'] as const) {
          const id = `w7--${sceneId}--${producer}--${quality}--${view}`;
          cases.push({
            id, sceneId, producer, quality, view,
            gateRequired: quality === 'cached' && view === 'normal',
            timingRequired: quality === 'cached' && view === 'normal',
            screenshotRequired: true,
            realtimeCompatibilityOnly: false,
            screenshotPath: screenshotPath(id),
          });
        }
      }
    }
  }
  const w8Scenes: readonly BenchmarkSceneId[] = [
    'single-stratocumulus', 'single-altocumulus', 'single-cirrocumulus',
    'w8-cellular-scale', 'w8-cellular-overlap', 'w8-wave-ripple',
    'single-cumulonimbus', 'single-cirrus',
  ];
  for (const sceneId of w8Scenes) {
    for (const producer of ['legacy', 'recipe-v2'] as const) {
      for (const quality of ['cached', 'hybrid'] as const) {
        for (const view of ['normal', 'density-debug'] as const) {
          const id = `w8--${sceneId}--${producer}--${quality}--${view}`;
          cases.push({
            id, sceneId, producer, quality, view,
            gateRequired: quality === 'cached' && view === 'normal',
            timingRequired: quality === 'cached' && view === 'normal',
            screenshotRequired: true,
            realtimeCompatibilityOnly: false,
            screenshotPath: screenshotPath(id),
          });
        }
      }
    }
  }
  return cases;
}

export function serializableCloudParams(params: CloudParams): BenchmarkCloudParams {
  const entries = Object.entries(params).filter(([, value]) => typeof value !== 'function');
  return Object.fromEntries(entries) as BenchmarkCloudParams;
}

function benchmarkParams(): BenchmarkCloudParams {
  const params = createDefaultParams();
  params.cacheResolution = 96;
  params.cacheUpdateRate = 2;
  params.cacheSmooth = 0;
  params.qualityMode = QUALITY_MODE.hybrid;
  params.debugView = VIEW_MODE.normal;
  params.temporalDither = false;
  params.showBodyBounds = false;
  params.showAxes = false;
  params.selectedBody = null;
  params.gizmoMode = null;
  params.densityShapeModel = 1;
  params.heightAmbientModel = 1;
  return serializableCloudParams(params);
}

export function createDensityBenchmarkManifest(
  sourceRevision = import.meta.env.VITE_SOURCE_REVISION || 'working-tree',
): DensityBenchmarkManifest {
  return {
    schemaVersion: DENSITY_BENCHMARK_SCHEMA_VERSION,
    baselineId: DENSITY_BENCHMARK_BASELINE_ID,
    sourceRevision,
    activeChanges: {
      'add-height-weather-shaping': {
        status: 'implementation-complete-validation-pending (10/14)',
        authoritativeSetting: 'densityShapeModel=1',
        compatibilityAnchor: 'densityShapeModel=0',
      },
      'add-height-ambient-tint': {
        status: 'implementation-complete-validation-pending (9/13)',
        authoritativeSetting: 'heightAmbientModel=1',
        compatibilityAnchor: 'heightAmbientModel=0',
      },
      'add-stratocumulus-cumulus-breakup': {
        status: 'scope absorbed by add-density-v2-cellular-wave-family',
        authoritativeSetting: 'recipe-v2-cellular-family',
      },
      'add-density-v2-cellular-wave-family': {
        status: 'implementation-complete-validation-pending',
        authoritativeSetting: 'densityProducerMode=1',
        compatibilityAnchor: 'densityProducerMode=0',
      },
    },
    viewport: { width: 1280, height: 720 },
    camera: {
      eye: [10.5, 13.5, 10.5],
      target: [0, 3.8, 0],
      up: [0, 1, 0],
      fovYRadians: Math.PI / 4,
      near: 0.05,
      far: 220,
    },
    warmupFrames: 60,
    minimumCacheWarmups: 5,
    minimumGpuSamples: 60,
    params: benchmarkParams(),
    scenes: createScenes(),
    cases: createCases(),
  };
}

function normalizedJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizedJson);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = normalizedJson((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return typeof value === 'number' && Object.is(value, -0) ? 0 : value;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(normalizedJson(value));
}

export function fingerprintValue(value: unknown): string {
  const input = stableStringify(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32-${hash.toString(16).padStart(8, '0')}`;
}

export function caseParams(manifest: DensityBenchmarkManifest, benchmarkCase: DensityBenchmarkCase): BenchmarkCloudParams {
  return {
    ...manifest.params,
    qualityMode: QUALITY_MODE[benchmarkCase.quality],
    debugView: VIEW_MODE[benchmarkCase.view],
    taaEnabled: benchmarkCase.view === 'normal' && manifest.params.taaEnabled,
    densityProducerMode: benchmarkCase.producer === 'recipe-v2' ? 1 : 0,
  };
}

export function benchmarkScene(manifest: DensityBenchmarkManifest, sceneId: BenchmarkSceneId): BenchmarkScene {
  const scene = manifest.scenes.find((candidate) => candidate.id === sceneId);
  if (!scene) throw new Error(`Unknown density benchmark scene '${sceneId}'`);
  return scene;
}

export function benchmarkCase(manifest: DensityBenchmarkManifest, id: string): DensityBenchmarkCase {
  const result = manifest.cases.find((candidate) => candidate.id === id);
  if (!result) throw new Error(`Unknown density benchmark case '${id}'`);
  return result;
}

export function benchmarkCaseFingerprint(
  manifest: DensityBenchmarkManifest,
  candidate: DensityBenchmarkCase,
  camera: BenchmarkCamera = resolveBenchmarkCamera(manifest, candidate.sceneId),
): string {
  return fingerprintValue({
    schemaVersion: manifest.schemaVersion,
    baselineId: manifest.baselineId,
    sourceRevision: manifest.sourceRevision,
    activeChanges: manifest.activeChanges,
    viewport: manifest.viewport,
    camera,
    params: caseParams(manifest, candidate),
    scene: benchmarkScene(manifest, candidate.sceneId),
    case: candidate,
  });
}

export function cloneBenchmarkBodies(scene: BenchmarkScene): CloudBody[] {
  return scene.bodies.map(cloneBody);
}

export function cloneBenchmarkWind(scene: BenchmarkScene): WindAdvectionSample[] {
  return scene.windSamples.map((sample) => ({
    offsetM: [sample.offsetM[0], sample.offsetM[1]],
    morphTime: sample.morphTime,
  }));
}

export function cloneBenchmarkCamera(camera: BenchmarkCamera): BenchmarkCamera {
  return {
    eye: [...camera.eye],
    target: [...camera.target],
    up: [...camera.up],
    fovYRadians: camera.fovYRadians,
    near: camera.near,
    far: camera.far,
  };
}

export function resolveBenchmarkCamera(
  manifest: DensityBenchmarkManifest,
  sceneId: BenchmarkSceneId,
): BenchmarkCamera {
  const scene = benchmarkScene(manifest, sceneId);
  return cloneBenchmarkCamera(scene.camera ?? manifest.camera);
}
