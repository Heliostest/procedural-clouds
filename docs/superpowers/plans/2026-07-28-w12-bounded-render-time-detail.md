# W12 有界渲染期云细节实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实施。每个任务由 fresh implementer 完成，再依次做实现审阅与规格审阅；两个审阅通过才进入下一任务。

**Goal:** 为 Hybrid 路径增加有界、配方感知的 render-time carve 细节，改善粗缓存体素轮廓，同时保留可验证回退和稳定的 TAAU。

**Architecture:** W5 Shared Fields 由只读 consumer contract 提供固定的 WebGPU 绑定槽位。唯一 WGSL stage 先从 support 得到带既有 hardening 的 rough，再只在 final 加入受预算、风相位、Nyquist 限制的侵蚀；主 shader、global Hybrid adapter 与 hierarchical Hybrid adapter 均调用该 stage。Debug 18/19 复用现有 current `backgroundRadiance.a`，在 composite 后叠加到 `sceneView`，不写 history。

**Tech Stack:** TypeScript、WebGPU、WGSL、Vite、OpenSpec、Node.js。

## 全局约束

- 唯一设计真源：`docs/superpowers/specs/2026-07-28-w12-bounded-render-time-detail-design.md` §1–§16；O1 carve、O2 rough light、O3 world step、O4 dilate-then-erode、O5 Billow-first 均不可更改。
- change ID 为 `add-bounded-render-time-cloud-detail`；W11 disposition 在 change 中按 owner-waived Continue 记录。设计已 owner 批准，建立并 strict validate OpenSpec 后即可实施，不另设 proposal 讨论门。
- 只复用 W5 Base/Detail/Macro Shared Fields；不建第三套纹理；Legacy 或 atlas unavailable 只走 Hybrid coarse fallback，不得解析 noise fallback。
- W12 的有效开关是 `edgeSharpening && detailStrength > 0 && detailResources.available && worldStepActive`。任一项为假时禁止 W12 dilation、erosion、warp 和 atlas sample；仍按既有 `edgeSharpening` 语义处理 Cb hardening。`edgeSharpening=false` 是总回退。
- stage 必须保证 support 非正时在采样前返回零、final 不大于 rough、不产生 Support leak/负密度/NaN。Fiber（Ci）final 必为 support；Convective（Cb）无 atlas sample，但在 edge sharpening 开启时仍经 `hardeningLo=0.0425` 单次线性 remap。
- Hybrid 的三处组合点仅调用一份 stage：`shaders/cloud.wgsl`、`hybridQualityAdapter`、`hierarchicalHybridQualityAdapter`。Cached、Realtime、hierarchical Cached 继续保留 `applyEdgeShaping()` 与其既有源码隔离；只删除三处 Hybrid 的乘法 `detailNoise()` 和其后的 edge call。
- main ray 使用 final；light march、legacy/adaptive ground shadow 使用 rough；silver edge probe 在 Task 5 明确选择 rough；W13 BSM 不在本 change。
- 坐标只使用世界米制 `params.march.metric.x/y` 和 `dominantWindPhase()` 的 X/Z 平流映射；禁止相机相对纹理坐标、cache voxel index、atlas allocation coordinate。
- 五项默认固定为 `worldStepEnabled=true`、`worldStepMinMeters=120`、`worldStepMaxIterations=512`、`detailStrength=1`、`detailFreq=1`。detail-off 的真回退基线为 world step on + 120/512；world step off 仅是与旧 W11 的解释性对照。
- Debug 18/19 是 composite 后写 `sceneView` 的非破坏 overlay；不得写 `historyViews`、`historyDepthViews`、`CloudFrameOutputResources` 的历史输出，也不得因切换而设 `historyValid=false`。
- 不提交、不归档、不修改 W13/W15/W16、sun intensity/phase、cache resolution、README、示例或本计划之外的非必需文档。

## 文件映射

| 文件 | 职责 |
| --- | --- |
| `openspec/changes/add-bounded-render-time-cloud-detail/` | proposal、design、tasks、cloud-rendering/cloud-params/cloud-detail delta。 |
| `src/rendering/densityDetailResources.ts` | 只读 detail contract 与 unavailable reason。 |
| `src/rendering/densityQualityContracts.ts`、`src/rendering/densityQualityPipelines.ts`、`src/renderer.ts` | 固定 detail binding slots、dummy resources、generation invalidation、`backgroundRadiance.a` debug carrier 与 overlay。 |
| `shaders/cloud.wgsl` | DetailControls、米制风相位、Nyquist、唯一 stage、rough/final 各调用点、debug scalar 输出。 |
| `src/rendering/densityShaderSources.ts` | 正确保留 `CLOUD_EDGE_START` 并重构两种 Hybrid adapter 的 bool wrappers。 |
| `src/params.ts`、`src/gui.ts`、`src/i18n.ts` | 五项默认、全局 detail 参数的 erosion/wavelength 语义、debug 18/19 文案。 |
| `scripts/check-density-pipeline-isolation.mjs`、`scripts/check-w12-*.mjs`、`package.json` | Isolation 与四个 W12 机器检查、真实 npm 入口。 |
| `docs/evidence/w12-bounded-render-time-detail/` | 仅在 Gate 任务生成的 capture、统计、Gate report。 |

### Task 1: 保护 dirty worktree，并建立/验证已批准的 OpenSpec change

**Files:**

- Create: `openspec/changes/add-bounded-render-time-cloud-detail/proposal.md`
- Create: `openspec/changes/add-bounded-render-time-cloud-detail/design.md`
- Create: `openspec/changes/add-bounded-render-time-cloud-detail/tasks.md`
- Create: `openspec/changes/add-bounded-render-time-cloud-detail/specs/cloud-rendering/spec.md`
- Create: `openspec/changes/add-bounded-render-time-cloud-detail/specs/cloud-params/spec.md`
- Create: `openspec/changes/add-bounded-render-time-cloud-detail/specs/cloud-detail/spec.md`
- Create: `docs/evidence/w12-bounded-render-time-detail/worktree-baseline.txt`
- Create: `docs/evidence/w12-bounded-render-time-detail/worktree-baseline.patch`

**Interfaces:**

- Consumes: approved design §1–§16、roadmap §17、W11 OpenSpec 格式、当前 dirty worktree。
- Produces: strict-valid change；W12 开始前的 HEAD/status、每个 dirty path 的 patch hash 与 `--unified=0` hunk headers。完整 baseline patch 只保存在单独文件，供逐 hunk 审阅，不嵌进摘要。

- [ ] **Step 1: 记录工作区基线，禁止把已有 W11 diff 当成 W12 失败或提交对象。**

Run: `git status --short`

Expected: 输出原样写入 `worktree-baseline.txt` 的 `status` 段。

Run: `git rev-parse HEAD`

Expected: 输出写入同文件的 `head` 段。

Run: `git diff --no-ext-diff --unified=0 -- src shaders`

Expected: 每个已有 dirty path 的 SHA-256 patch hash 与 hunk headers 写入 `worktree-baseline.txt`；完整 patch 另存 `docs/evidence/w12-bounded-render-time-detail/worktree-baseline.patch`，仅用于最终逐 hunk 归因。

- [ ] **Step 2: 按 W11 格式建立 proposal/design/tasks 与三个 spec delta。**

```markdown
## What Changes

- 发布只读 `DensityDetailResources` 与固定 dummy-bound Hybrid detail slots。
- 用唯一 stage 取代三处 Hybrid 乘法 detail；保留 Cached/Realtime 的 `applyEdgeShaping`。
- 定义 rough/final、family budget、五项默认、debug 18/19、静态检查与 Gate。
```

Expected: proposal 写明 W11 owner-waived Continue、已有 dirty baseline、无解析 fallback、无 W13/W15/W16 范围。

- [ ] **Step 3: 写 delta 的完整 requirement 与 Scenario。**

```markdown
### Requirement: Hybrid bounded detail fallback
The Hybrid renderer SHALL bind valid read-only detail resources for every pipeline layout and SHALL disable W12 dilation, erosion, warp, and atlas sampling when detail resources are unavailable or the global detail switch is disabled.

#### Scenario: Legacy producer
- **WHEN** the active producer returns no Shared Field diagnostics
- **THEN** the Hybrid renderer SHALL use dummy read-only bindings and render its coarse fallback without sampling detail.
```

Expected: `cloud-rendering` 覆盖 contract、generation、rough/final、debug；`cloud-params` 完整修改旧 requirement；新 `cloud-detail` 覆盖 family、坐标、Nyquist、回退、预算。

- [ ] **Step 4: 严格验证 OpenSpec。**

Run: `openspec validate add-bounded-render-time-cloud-detail --strict --no-interactive`

Expected: exit 0；无缺失 Scenario 或不完整 MODIFIED requirement。

### Task 2: 实现只读 contract、固定 dummy bindings 与 generation invalidation

**Files:**

- Create: `src/rendering/densityDetailResources.ts`
- Create: `scripts/check-w12-detail-contract.mjs`
- Modify: `shaders/cloud.wgsl:153-170`
- Modify: `src/rendering/densityQualityContracts.ts`
- Modify: `src/rendering/densityQualityPipelines.ts`
- Modify: `src/renderer.ts`

**Interfaces:**

- Consumes: `DensitySharedFieldDiagnostics | null` 的现有 public fields：`available`、`format`、`atlasDimension`、`macroDimension`、`generation`、`sampler`、`baseView`、`detailView`、`macroView`。
- Produces: `DensityDetailResources`（只读 sampler/views、availability/reason、layoutVersion/generation/format/dimensions）及固定 group 3 binding 4–7 的 `DensityDetailBindingResources`。WGSL 使用 `detailResourceControls.enabled`，不引用 TypeScript 对象名。

- [ ] **Step 1: 创建失败优先的 contract 检查。**

```js
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const detailSource = read('src/rendering/densityDetailResources.ts');
const renderer = read('src/renderer.ts');
const cloud = read('shaders/cloud.wgsl');
const assert = (value, message) => { if (!value) throw new Error(message); };
assert(detailSource.includes('export interface DensityDetailResources'), 'missing consumer contract');
assert(detailSource.includes('layoutVersion: 1'), 'missing layout version');
assert(!detailSource.includes('storageView'), 'storage view leaked');
assert(!detailSource.includes('Pipeline'), 'pipeline leaked');
assert(renderer.includes('previousDetailGeneration'), 'missing generation tracking');
assert(renderer.includes('cloudFrameOutput?.markDiscontinuity()'), 'missing TAAU invalidation');
assert(cloud.includes('@group(3) @binding(4) var detailSampler : sampler'), 'detail sampler ABI missing');
assert(cloud.includes('@group(3) @binding(7) var<uniform> detailResourceControls'), 'detail controls ABI missing');
```

Run: `node scripts/check-w12-detail-contract.mjs`

Expected: FAIL before the contract and binding code exist.

- [ ] **Step 2: 收窄 producer diagnostics，保持 private producer 对象不外泄。**

```ts
export interface DensityDetailResources {
  readonly available: boolean;
  readonly reason: string;
  readonly layoutVersion: 1;
  readonly generation: number;
  readonly format: 'rgba8unorm';
  readonly atlasDimension: 64;
  readonly macroDimension: 256;
  readonly sampler: GPUSampler | null;
  readonly baseView: GPUTextureView | null;
  readonly detailView: GPUTextureView | null;
  readonly macroView: GPUTextureView | null;
}
```

Expected: contract 不出现 storage view、generator pipeline、writable bind group；Legacy/null 返回 `available:false` 和稳定 reason。

- [ ] **Step 3: 在 `shaders/cloud.wgsl` 声明真实 detail ABI，固定使用 group 3 binding 4–7。**

```wgsl
struct DetailResourceControlsGPU { enabled : f32, layoutVersion : f32, generation : f32, _pad : f32, };
@group(3) @binding(4) var detailSampler : sampler;
@group(3) @binding(5) var detailBaseTex : texture_3d<f32>;
@group(3) @binding(6) var detailFieldTex : texture_3d<f32>;
@group(3) @binding(7) var<uniform> detailResourceControls : DetailResourceControlsGPU;
```

Expected: 现有 ground shadow/STBN/counter 仍占 group 3 binding 0–3；group 1 的 hierarchical binding 3–8 不受触碰；Macro 仍保留 consumer contract 字段但本轮不在 shader ABI/binding/dummy 中出现；所有 cloud/cloud-frame Hybrid pipeline 由同一 ABI 访问 Base/Detail。

- [ ] **Step 4: 创建 renderer-owned dummy sampler、1×1×1 只读 3D Base/Detail texture views。**

```ts
const detailBinding = detail.available
  ? { sampler: detail.sampler!, baseView: detail.baseView!, detailView: detail.detailView!, enabled: 1 }
  : { sampler: dummyDetailSampler, baseView: dummyDetailBaseView, detailView: dummyDetailFieldView, enabled: 0 };
const cloudGroup3Entries = [
  { binding: 0, resource: resources.groundShadowSampler }, { binding: 1, resource: resources.groundShadowView },
  { binding: 2, resource: resources.stbnView }, { binding: 3, resource: { buffer: resources.raymarchCountersBuffer } },
  { binding: 4, resource: detailBinding.sampler }, { binding: 5, resource: detailBinding.baseView },
  { binding: 6, resource: detailBinding.detailView }, { binding: 7, resource: { buffer: detailResourceControlsBuffer } },
];
export interface DensityQualityBindings { groundShadowDetail: GPUBindGroup | null; }
```

Expected: dummy sampler 为 `addressModeU/V/W:'repeat'`、`magFilter/minFilter:'linear'`、`mipmapFilter:'nearest'`；Base/Detail 3D textures 为 `[1,1,1]`、`rgba8unorm`、`TEXTURE_BINDING`、viewDimension `3d`，均不含 storage usage、resize path，renderer destroy 时显式 destroy。Hybrid cloud/cloud-frame group 3 绑定 0–7；Hybrid ground-shadow 单独创建 `groundShadowDetail: GPUBindGroup | null`，按其实际 layout 绑定 4–7，并由 `integrationPass.setBindGroup(3, qualityBindings.groundShadowDetail!)` 接入。Cached/Realtime 不创建该 detail group。unavailable controls `enabled=0`，stage 在任何 texture sample 前返回 coarse/hardening fallback。

- [ ] **Step 5: 接入 generation，且只在 generation 变化时整屏失效。**

```ts
if (previousDetailGeneration !== null && detail.generation !== previousDetailGeneration) {
  historyValid = false;
  cloudFrameOutput?.markDiscontinuity();
}
previousDetailGeneration = detail.generation;
```

Expected: resource generation 变化失效；正常 content revision 和连续风移不失效。

- [ ] **Step 6: 运行本 task 检查与类型检查。**

Run: `node scripts/check-w12-detail-contract.mjs`

Expected: exit 0。

Run: `npm run typecheck`

Expected: exit 0。

### Task 3: 先实现 DetailControls、物理坐标、预算与 Nyquist

**Files:**

- Create: `scripts/check-w12-sample-budget.mjs`
- Modify: `shaders/cloud.wgsl:567-572,758-806`
- Modify: `src/rendering/densityQualityContracts.ts`
- Modify: `src/rendering/densityQualityPipelines.ts`

**Interfaces:**

- Produces: `DetailControls`、`DetailEvaluation`、`detailControlsForPreset`、`detailControlsForMetadata`、`evaluateDetail`、`sampleDetailField`，供 Task 4 stage 使用。
- Consumes: `params.march.metric.x/y`、`params.march.controls.x`、`worldStepMeters`、`dominantWindPhase(pos)`、Base.A/Detail.B、metadata 权重。

- [ ] **Step 1: 创建失败优先的 budget/static check，并定义其辅助函数。**

```js
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const detailSource = read('src/rendering/densityDetailResources.ts');
const renderer = read('src/renderer.ts');
const cloud = read('shaders/cloud.wgsl');
const assert = (value, message) => { if (!value) throw new Error(message); };
function assertIncludes(source, token) { assert(source.includes(token), `missing ${token}`); }
function assertNoToken(source, token) { assert(!source.includes(token), `forbidden ${token}`); }
function blockStartingAt(source, token) {
  const start = source.indexOf(token); assert(start >= 0, `missing ${token}`);
  const open = source.indexOf('{', start); let depth = 0;
  for (let i = open; i < source.length; i++) { if (source[i] === '{') depth++; if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1); }
  throw new Error(`unclosed ${token}`);
}
```

Run: `node scripts/check-w12-sample-budget.mjs`

Expected: FAIL before controls/flags/stage samples exist.

- [ ] **Step 2: 用 PRESET_ORDER 的真实 index 定义完整 family controls，并按主/次 metadata 权重连续混合。**

```wgsl
struct DetailControls { dilateGain : f32, erosionAmount : f32, detailWeight : f32, warpWeight : f32, detailWavelengthMeters : f32, warpWavelengthMeters : f32, };
fn detailControlsForPreset(index : i32) -> DetailControls {
  if (index == 0 || index == 2 || index == 4) { return DetailControls(1.8, 0.55, 1.0, 1.0, 300.0, 1200.0); }
  if (index == 1 || index == 5 || index == 6 || index == 8) { return DetailControls(1.0, 0.08, 1.0, 0.0, 300.0, 1200.0); }
  if (index == 9) { return DetailControls(1.0, 0.12, 1.0, 0.0, 300.0, 1200.0); }
  if (index == 7) { return DetailControls(1.0, 0.0, 0.0, 0.0, 300.0, 1200.0); }
  return DetailControls(1.0, 0.0, 0.0, 0.0, 300.0, 1200.0);
}
fn detailControlsForMetadata(idx : f32, idx2 : f32, w2 : f32) -> DetailControls {
  let a = detailControlsForPreset(i32(round(idx)));
  let b = detailControlsForPreset(i32(round(idx2)));
  let w = clamp(w2, 0.0, 0.5);
  return DetailControls(mix(a.dilateGain, b.dilateGain, w), mix(a.erosionAmount, b.erosionAmount, w), mix(a.detailWeight, b.detailWeight, w), mix(a.warpWeight, b.warpWeight, w), mix(a.detailWavelengthMeters, b.detailWavelengthMeters, w), mix(a.warpWavelengthMeters, b.warpWavelengthMeters, w));
}
```

Expected: PRESET_ORDER 映射固定为 0 Cu、1 St、2 Sc、3 Cb、4 Ac、5 As、6 Ns、7 Ci、8 Cs、9 Cc；0/2/4 Billow，1/5/6/8 Stratiform，9 Cellular，7 Fiber，3 Convective。`detailWeight`/`warpWeight` 是连续值，equal-overlap 不经 bool 阈值硬切；Ci/Cb 权重为零而不进 atlas branch。

- [ ] **Step 3: 使用真实 metric 和 `dominantWindPhase` 的 X/Z 映射构造坐标。**

```wgsl
let phase = dominantWindPhase(pos);
let advected = vec3f(pos.x - phase.x, pos.y, pos.z - phase.y);
let meters = vec3f(params.march.metric.x, params.march.metric.y, params.march.metric.x);
let wavelength = controls.detailWavelengthMeters / max(params.g.detailFreq, 0.01);
let coord = advected * meters / wavelength;
```

Expected: 不访问不存在的 `params.g.horizontalMetersPerWorldUnit`/`verticalMetersPerWorldUnit`；不把 `phase.y` 减到 Y；不使用 allocation/camera-relative texture coordinate。

- [ ] **Step 4: 定义完整 evaluation 返回值、Nyquist/fade、warp 与 atlas sampling；stage 只消费此返回值。**

```wgsl
struct DetailEvaluation { enabled : f32, continuousWeight : f32, effectiveDilateGain : f32, effectiveErosionAmount : f32, wavelengthMeters : f32, warpWavelengthMeters : f32, warpWeight : f32, hardeningLo : f32, };
fn evaluateDetail(pos : vec3f, controls : DetailControls, idx : f32, idx2 : f32, w2 : f32) -> DetailEvaluation {
  let wavelength = controls.detailWavelengthMeters / max(params.g.detailFreq, 0.01);
  let warpWavelength = controls.warpWavelengthMeters / max(params.g.detailFreq, 0.01);
  let physicalDelta = (pos - camera.position) * vec3f(params.march.metric.x, params.march.metric.y, params.march.metric.x);
  let distanceMeters = length(physicalDelta);
  let worldStepOn = params.march.controls.x > 0.5;
  let nyquist = select(0.0, select(1.0, 0.0, worldStepMeters(distanceMeters) > 0.5 * wavelength), worldStepOn);
  let distanceFade = 1.0 - smoothstep(0.35 * params.march.limits.x, params.march.limits.x, distanceMeters);
  let enabled = select(0.0, 1.0, detailResourceControls.enabled > 0.5 && params.g.edgeSharpening > 0.5 && params.g.detailStrength > 0.0001 && worldStepOn);
  let continuous = enabled * controls.detailWeight * distanceFade * nyquist;
  let erosion = min(controls.erosionAmount * params.g.detailStrength, 1.0) * continuous;
  let warp = controls.warpWeight * continuous;
  let hardening = select(0.0, blendedEdgeStyle(idx, idx2, w2).hardness * max(params.g.edgeHardnessThreshold, 0.0), params.g.edgeSharpening > 0.5);
  return DetailEvaluation(enabled, continuous, mix(1.0, controls.dilateGain, continuous), erosion, wavelength, warpWavelength, warp, hardening);
}
fn sampleDetailField(pos : vec3f, evaluation : DetailEvaluation) -> f32 {
  let phase = dominantWindPhase(pos);
  let meters = vec3f(params.march.metric.x, params.march.metric.y, params.march.metric.x);
  let advected = vec3f(pos.x - phase.x, pos.y, pos.z - phase.y);
  let baseCoord = advected * meters / evaluation.wavelengthMeters;
  let warpCoord = advected * meters / evaluation.warpWavelengthMeters;
  var sampleCoord = baseCoord;
  if (evaluation.warpWeight > 0.0) { sampleCoord = baseCoord + vec3f(textureSampleLevel(detailBaseTex, detailSampler, warpCoord, 0.0).a) * (0.15 * evaluation.warpWeight); }
  return clamp(textureSampleLevel(detailFieldTex, detailSampler, sampleCoord, 0.0).b, 0.0, 1.0);
}
```

Expected: `detailStrength=0`、unavailable、world-step-off、edge-sharpening-off 都返回 gain=1/erosion=0/warp=0，stage 在 texture sample 前返回；distance/Nyquist 令 gain 从 family gain 连续回到 1 并令 erosion/warp 连续归零；Billow Base.A warp 固定比例 `0.15`、1200 m、最多一次，Detail.B 300 m、最多一次；不采 Macro；`min(...,1)` 保证 erosion 有界。

- [ ] **Step 5: 将本 task 的 budget check 限定为已实现的 controls/坐标/Nyquist 合约。**

```js
assertIncludes(cloud, 'detailWeight'); assertIncludes(cloud, 'warpWeight');
assertIncludes(cloud, 'params.march.metric.x');
assertIncludes(cloud, 'params.march.metric.y');
assertIncludes(cloud, 'params.march.limits.x');
assertNoToken(blockStartingAt(cloud, 'fn sampleDetailField('), 'allocationGeneration');
```

Expected: 脚本验证 family flags、Ci/Cb 禁采、St/Cellular 禁 warp，以及 metric/limits/phase 坐标禁则；stage 内采样次数和 Macro 禁采由 Task 4 在 stage 存在后追加。

Run: `node scripts/check-w12-sample-budget.mjs`

Expected: exit 0。

### Task 4: 实现唯一 stage，并在三处 Hybrid 组合点调用

**Files:**

- Create: `scripts/check-w12-density-monotonic.mjs`
- Modify: `shaders/cloud.wgsl:780-900`
- Modify: `src/rendering/densityShaderSources.ts:57-61,114-131,333-350`
- Modify: `scripts/check-density-pipeline-isolation.mjs`

**Interfaces:**

- Consumes: Task 2 `detailResourceControls.enabled` ABI、Task 3 `DetailControls`/`DetailEvaluation`/sampling helpers。
- Produces: one `applyBoundedDetailStage(support,pos,wantFinal)` and `densityAtTyped(pos,wantFinal)`/`densityAt(pos,wantFinal)` for Hybrid only.

- [ ] **Step 1: 创建 monotonic/isolation 失败检查；仅限定 Hybrid。**

```js
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const assert = (value, message) => { if (!value) throw new Error(message); };
const assertNoToken = (source, token) => assert(!source.includes(token), `forbidden ${token}`);
function blockStartingAt(source, token) {
  const start = source.indexOf(token); assert(start >= 0, `missing ${token}`);
  const open = source.indexOf('{', start); let depth = 0;
  for (let i = open; i < source.length; i++) { if (source[i] === '{') depth++; if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1); }
  throw new Error(`unclosed ${token}`);
}
function wgslDefinitionCount(source, name) {
  return [...source.matchAll(new RegExp(`fn\\s+${name}\\s*\\([^)]*\\)\\s*->[^\\{]+\\{`, 'g'))].length;
}
function templateAfter(source, token) {
  const start = source.indexOf(token); assert(start >= 0, `missing ${token}`);
  const quote = source.indexOf('`', start); const end = source.indexOf('`', quote + 1);
  assert(quote >= 0 && end > quote, `unclosed template ${token}`); return source.slice(quote + 1, end);
}
const cloud = read('shaders/cloud.wgsl');
const renderer = read('src/renderer.ts');
const shaderSources = read('src/rendering/densityShaderSources.ts');
const hybridDetailSlice = cloud.slice(cloud.indexOf('fn applyBoundedDetailStage('), cloud.indexOf('fn applyEdgeShaping('));
assert(hybridDetailSlice.length > 0, 'Hybrid detail slice missing');
const allSources = `${cloud}\n${shaderSources}`;
const hybridAdapter = templateAfter(shaderSources, 'const hybridQualityAdapter');
const hierarchicalHybridAdapter = templateAfter(shaderSources, 'const hierarchicalHybridQualityAdapter');
const cachedAdapter = templateAfter(shaderSources, 'const cachedQualityAdapter');
const realtimeAdapter = templateAfter(shaderSources, 'const realtimeQualityAdapter');
const mainDensityAt = blockStartingAt(cloud, 'fn densityAtTyped(');
const count = wgslDefinitionCount(allSources, 'applyBoundedDetailStage');
assert(count === 1, 'stage must have one definition');
assert(mainDensityAt.includes('mode == 1') && mainDensityAt.includes('applyBoundedDetailStage('), 'main shader Hybrid misses stage');
assert(hybridAdapter.includes('applyBoundedDetailStage('), 'global Hybrid misses stage');
assert(hierarchicalHybridAdapter.includes('applyBoundedDetailStage('), 'brick Hybrid misses stage');
assert(!hybridAdapter.includes('applyEdgeShaping('), 'global Hybrid retains second edge stage');
assert(!hierarchicalHybridAdapter.includes('applyEdgeShaping('), 'brick Hybrid retains second edge stage');
assert(cachedAdapter.includes('applyEdgeShaping('), 'Cached edge behavior removed');
assert(realtimeAdapter.includes('applyEdgeShaping('), 'Realtime edge behavior removed');
```

Run: `node scripts/check-w12-density-monotonic.mjs`

Expected: FAIL before stage migration.

- [ ] **Step 2: 先算 rough hardening，再在 final 追加 erosion；全回退不得留下 Billow gain。**

```wgsl
fn remapClamped(value : f32, lo : f32, hi : f32) -> f32 {
  if (hi <= lo) { return 0.0; }
  return clamp((value - lo) / (hi - lo), 0.0, 1.0);
}
fn applyBoundedDetailStage(support : vec4f, pos : vec3f, wantFinal : bool) -> vec4f {
  if (support.x <= 0.0) { return vec4f(0.0, support.yzw); }
  let controls = detailControlsForMetadata(support.y, support.z, support.w);
  let evaluation = evaluateDetail(pos, controls, support.y, support.z, support.w);
  let roughBase = min(support.x * evaluation.effectiveDilateGain, 1.0);
  let rough = remapClamped(roughBase, evaluation.hardeningLo, 1.0);
  if (!wantFinal || evaluation.effectiveErosionAmount <= 0.0) { return vec4f(rough, support.yzw); }
  let erosion = sampleDetailField(pos, evaluation);
  let lo = max((1.0 - erosion) * evaluation.effectiveErosionAmount, evaluation.hardeningLo);
  if (lo >= 1.0) { return vec4f(0.0, support.yzw); }
  return vec4f(remapClamped(roughBase, lo, 1.0), support.yzw);
}
```

Expected: `remapClamped` 在 `hi<=lo` 时返回零；rough 保存 Cb hardening；final 只增加最高频 erosion；Ci final=support；Cb final=rough 且不 sample atlas；`detailStrength=0`、atlas unavailable、world-step-off、`edgeSharpening=false` 皆为 gain=1/erosion=0/warp=0 且不 sample；如 edge sharpening 已启用，Cb 保留 legacy hardening。

- [ ] **Step 3: 仅迁移三处 Hybrid，并保留 edge slice 与 non-Hybrid edge calls。**

```ts
const CLOUD_DETAIL_START = 'fn applyBoundedDetailStage(';
const CLOUD_EDGE_START = 'fn applyEdgeShaping(';
```

Expected: `applyBoundedDetailStage` 先出现在新 detail slice marker，随后为 `DetailControls`、`DetailEvaluation`、`remapClamped`、controls/evaluation/sample helpers；WGSL module-scope 前向引用使此顺序可编译。Hybrid source 包含完整 slice，Cached source 不含 detail sampler；definition count 仍只匹配签名后实际 `{`，不把 marker 字符串算定义；删除 `detailNoise` definition 和三处 Hybrid 乘法调用；保留 Cached、Realtime、hierarchical Cached 的 `applyEdgeShaping`，`CLOUD_EDGE_START` 仍划分 edge-shaping fragment。

- [ ] **Step 4: 让 global/hierarchical adapter 的 bool wrapper 明确传递语义。**

```wgsl
fn densityAtTyped(pos : vec3f, wantFinal : bool) -> vec4f { return applyBoundedDetailStage(sampleDensityTyped(pos), pos, wantFinal); }
fn densityAt(pos : vec3f, wantFinal : bool) -> f32 { return densityAtTyped(pos, wantFinal).x; }
```

Expected: hierarchical wrapper 同样以 `sampleHierarchicalDensityTyped(pos)` 调用 stage；所有 Cached/Realtime/hierarchical Cached wrapper 同时改为同一 bool-compatible 签名、忽略 `wantFinal` 并返回既有 `applyEdgeShaping` 结果，确保 render tail 的 `densityAt(..., false)` 可编译，且不得把 Hybrid stage 注入 non-Hybrid 路径。

- [ ] **Step 5: 更新 isolation 边界并运行本 task checks。**

```js
const stage = blockStartingAt(cloud, 'fn applyBoundedDetailStage(');
const helper = blockStartingAt(cloud, 'fn sampleDetailField(');
assert((stage.match(/sampleDetailField\(/g) || []).length === 1, 'stage must call detail helper once');
assert((helper.match(/textureSampleLevel\(detailBaseTex/g) || []).length <= 1, 'more than one Base.A sample');
assert((helper.match(/textureSampleLevel\(detailFieldTex/g) || []).length === 1, 'Detail.B sample count');
assert(helper.indexOf('if (evaluation.warpWeight > 0.0)') < helper.indexOf('textureSampleLevel(detailBaseTex'), 'warp branch samples before guard');
assertNoToken(hybridDetailSlice, 'detailMacroTex'); assertNoToken(hybridDetailSlice, 'sampleMacro');
assertNoToken(helper, 'allocationGeneration');
```

Run: `node scripts/check-w12-density-monotonic.mjs`

Expected: exit 0。

Run: `npm run test:pipeline-isolation`

Expected: exit 0；Cached source 不包含 detail atlas sampling，Hybrid source 含唯一 stage call。

Run: `node scripts/check-w12-sample-budget.mjs`

Expected: exit 0；唯一 stage 最多一次 Base.A/Detail.B、Macro 禁采与 family flags 同时成立。

### Task 5: 完整更新 bool 调用点，并验证 rough/final call graph

**Files:**

- Create: `scripts/check-w12-light-rough.mjs`
- Modify: `shaders/cloud.wgsl:903-1082,1348,1418,1460`
- Modify: `src/rendering/densityShaderSources.ts`

**Interfaces:**

- Consumes: Task 4 bool wrappers。
- Produces: light/ground/silver=rough，main=final；检查直接调用和 `false` branch 在 sample 前返回的 call graph，而非只检查 light function 本体。

- [ ] **Step 1: 编写 call-graph 检查，列出所有真实调用位置。**

```js
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const assert = (value, message) => { if (!value) throw new Error(message); };
function blockStartingAt(source, token) {
  const start = source.indexOf(token); assert(start >= 0, `missing ${token}`);
  const open = source.indexOf('{', start); let depth = 0;
  for (let i = open; i < source.length; i++) { if (source[i] === '{') depth++; if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1); }
  throw new Error(`unclosed ${token}`);
}
const cloud = read('shaders/cloud.wgsl');
const renderer = read('src/renderer.ts');
const lightMarch = blockStartingAt(cloud, 'fn lightMarchDepth(');
const legacyGround = blockStartingAt(cloud, 'fn legacyGroundShadow(');
const adaptiveGround = blockStartingAt(cloud, 'fn integrateGroundShadow(');
const mainLoop = blockStartingAt(cloud, 'fn renderCloudFrame(');
const silverProbe = mainLoop.slice(mainLoop.indexOf('silverGate'));
const stage = blockStartingAt(cloud, 'fn applyBoundedDetailStage(');
assert(lightMarch.includes('densityAt(p, false)'), 'light must be rough');
assert(legacyGround.includes('densityAt(sp, false)'), 'legacy ground must be rough');
assert(adaptiveGround.includes('densityAt(sp, false)'), 'adaptive ground must be rough');
assert(mainLoop.includes('densityAtTyped(pos, true)'), 'main must be final');
assert(silverProbe.includes('densityAt(pos + SUN_DIR * probeOffset, false)'), 'silver probe must be rough');
assert(stage.includes('if (!wantFinal'), 'false branch missing');
assert(stage.indexOf('if (!wantFinal') < stage.indexOf('sampleDetailField('), 'rough branch samples atlas');
```

Run: `node scripts/check-w12-light-rough.mjs`

Expected: FAIL until all five shader sites and TS wrappers are migrated.

- [ ] **Step 2: 改所有指定调用和 adapters。**

```wgsl
shadow = shadow + densityAt(p, false) * ss;
let edgeDens = densityAt(pos + SUN_DIR * probeOffset, false);
let dt = densityAtTyped(pos, true);
```

Expected: line 923 light、994/1053 ground、1348 main、1460 silver probe 均有明确语义；所有 Hybrid TS `densityAt` wrappers 接受并转交 `wantFinal`。

- [ ] **Step 3: 运行 rough 检查与既有 raymarch checks。**

Run: `node scripts/check-w12-light-rough.mjs`

Expected: exit 0。

Run: `npm run test:w10b-raymarch`

Expected: exit 0。

Run: `npm run test:w10b-world-raymarch`

Expected: exit 0。

### Task 6: 五项默认、参数语义与 debug 18/19 数据通路

**Files:**

- Modify: `src/params.ts`
- Modify: `src/gui.ts`
- Modify: `src/i18n.ts`
- Modify: `shaders/cloud.wgsl:1153-1180,1678-1684`
- Modify: `src/renderer.ts:1652-1668,1802-1828,2732-2755,2877-2916`
- Modify: `scripts/check-w12-light-rough.mjs`

**Interfaces:**

- Produces: default `true/120/512/1/1`; debug scalar 复用现有 current-only `CloudFrameOutputResources.backgroundRadiance.a`;统一 `isNonDestructiveTemporalDebugView` 和 composite-after overlay。

- [ ] **Step 1: 更改五项 defaults 和 GUI/i18n 新语义，不增加 param layout 字段。**

```ts
detailFreq: 1,
detailStrength: 1,
worldStepEnabled: true,
worldStepMaxIterations: 512,
worldStepMinMeters: 120,
```

Expected: `detailStrength` 文案为全局侵蚀倍率，`detailFreq` 文案为波长缩放；保留 GUI `0–4` 与 `0.5–16` range；不改变 per-species `detailStrength`。

- [ ] **Step 2: 复用 `backgroundRadiance.a`，不创建第四 attachment、额外 texture 或新的 cloud-frame ABI。**

```wgsl
let backgroundAlpha = select(1.0, w12DebugScalar, i32(round(params.g.debugView)) == 18 || i32(round(params.g.debugView)) == 19);
return CloudFrameSample(
  vec4f(color, clamp(transmittance, 0.0, 1.0)),
  vec4f(outputDepth, velocity, select(0.0, 1.0, reprojectionValid)),
  vec4f(background, backgroundAlpha),
  select(0.0, 1.0, valid),
);
```

Expected: `CloudFrameTargets` 仍是三 target；composite 继续只读 `backgroundRadiance.rgb`；TAA/full-res history 只消费 radiance/depth，TAAU resolve 只消费 low-res radiance/depth，因此 alpha 是 current-only debug carrier，正常 view 的 alpha 保持 1。

- [ ] **Step 3: 在 `renderCloudFrame` 中生成真实 debug scalar；额外 detail sample 只在 18/19 执行。**

```wgsl
fn encodeW12DetailDebug(view : i32, erosion : f32, rough : f32, final : f32) -> f32 {
  if (view == 18) { return clamp(erosion, 0.0, 1.0); }
  return clamp(0.5 + 0.5 * (final - rough), 0.0, 1.0);
}
var debugWeight = 0.0;
var debugScalarSum = 0.0;
if (debugView == 18 || debugView == 19) {
  let debugTyped = dt;
  let roughTyped = densityAtTyped(pos, false);
  let evaluation = evaluateDetail(pos, detailControlsForMetadata(debugTyped.y, debugTyped.z, debugTyped.w), debugTyped.y, debugTyped.z, debugTyped.w);
  var erosion = 0.0;
  if (debugView == 18 && evaluation.effectiveErosionAmount > 0.0) { erosion = sampleDetailField(pos, evaluation); }
  let contribution = transmittance * (1.0 - step_trans);
  debugScalarSum += encodeW12DetailDebug(debugView, erosion, roughTyped.x, debugTyped.x) * contribution;
  debugWeight += contribution;
}
let emptyDebugScalar = select(0.5, 0.0, debugView == 18);
let w12DebugScalar = select(emptyDebugScalar, debugScalarSum / max(debugWeight, 1e-5), debugWeight > 0.0);
```

Expected: 18 使用同一 `sampleDetailField` 的实际 erosion；19 使用主 ray final 和 `densityAtTyped(pos,false)` 的 rough；标量按当前主样本可见贡献 `transmittance * (1-step_trans)` 聚合。额外 helper 采样只在 18/19，production budget 不变；19 保留 signed `final-rough` 的 `[-1,1]→[0,1]` 映射。

- [ ] **Step 4: 在 composite 后单独 overlay 采样 `backgroundRadiance` 的 alpha；TAAU 采样 low current，full-res 采样 full current。**

```wgsl
let scalar = textureSampleLevel(debugScalar, debugSampler, uv, 0.0).a;
var color = vec3f(scalar);
if (debugViewId == 19) {
  let signedDifference = 2.0 * scalar - 1.0;
  if (abs(signedDifference) <= 0.0001) { color = vec3f(0.08, 0.10, 0.14); }
  else if (signedDifference < 0.0) { color = vec3f(0.12, 0.35, 1.0); }
  else { color = vec3f(1.0, 0.20, 0.10); }
}
return vec4f(color, 1.0);
```

```ts
const w12DebugSource = taauActive ? cloudFrameLowResOutput!.backgroundRadianceView : cloudFrameOutput!.backgroundRadianceView;
const w12DetailDebugOverlayPass = commandEncoder.beginRenderPass({ colorAttachments: [{ view: sceneView!, loadOp: 'load', storeOp: 'store' }] });
w12DetailDebugOverlayPass.setPipeline(w12DetailDebugOverlayPipeline);
w12DetailDebugOverlayPass.setBindGroup(0, createW12DetailDebugOverlayBindGroup(w12DebugSource, Math.round(params.debugView)));
w12DetailDebugOverlayPass.draw(3);
w12DetailDebugOverlayPass.end();
```

Expected: overlay controls 携带 `debugViewId`；18 按 `.a` 的 `[0,1]` erosion 灰度/热力显示，19 才解码 `.a` 为 signed `2a-1` 并显示负蓝/零中性/正红。full-res overlay bind group 采 `cloudFrameOutput.backgroundRadianceView`，TAAU overlay bind group 采 `cloudFrameLowResOutput.backgroundRadianceView` 后按屏幕 uv 放大；overlay 位于 composite 后、`sceneView` `loadOp:'load'`，无 history attachment。

- [ ] **Step 5: 为时域和两类 overlay 保留三个职责明确的 predicate。**

```ts
function isNonDestructiveTemporalDebugView(view: number): boolean {
  const rounded = Math.round(view);
  return rounded === 16 || rounded === 17 || rounded === 18 || rounded === 19;
}
function isW12DetailDebugView(view: number): boolean { const rounded = Math.round(view); return rounded === 18 || rounded === 19; }
```

Expected: `isNonDestructiveTemporalDebugView(16..19)` 只替换 renderer 的 `taaOn` 与 `activeTemporalModeNum` debug fallback 两处；现有 `isTaauDebugView(16/17)` 仍只控制 W11 overlay；`isW12DetailDebugView(18/19)` 控制 W12 overlay。18/19 不触发 `historyValid=false` 或 `markDiscontinuity()`。

- [ ] **Step 6: 将 debug attachment/overlay 的 fail→pass assertions 加入既有 W12 check。**

```js
const overlay = blockStartingAt(renderer, 'const w12DetailDebugOverlayPass');
assert(renderer.includes('backgroundRadianceView'), 'current debug carrier missing');
assert(overlay.includes("view: sceneView!"), 'overlay must write sceneView');
assert(!overlay.includes('historyViews'), 'overlay writes history');
assert(overlay.includes('.a'), 'overlay must sample background alpha');
assert(overlay.includes('debugViewId == 19'), 'signed debug branch missing');
assert(cloud.includes('final - rough'), 'debug 19 lost signed difference');
```

Run: `node scripts/check-w12-light-rough.mjs`

Expected: exit 0；debug data path 和 non-destructive condition 有独立静态回归保护。

### Task 7: 汇总四个静态 checks、npm scripts 和回归命令

**Files:**

- Modify: `scripts/check-w12-detail-contract.mjs`
- Modify: `scripts/check-w12-sample-budget.mjs`
- Modify: `scripts/check-w12-density-monotonic.mjs`
- Modify: `scripts/check-w12-light-rough.mjs`
- Modify: `scripts/check-density-pipeline-isolation.mjs`
- Modify: `package.json`

**Interfaces:**

- Consumes: Tasks 2–6 各自已创建的 check；产生统一 npm commands，不重复创建脚本。

- [ ] **Step 1: 添加四个真实 package script，不删除既有脚本。**

```json
"test:w12-detail-contract": "node scripts/check-w12-detail-contract.mjs",
"test:w12-density-monotonic": "node scripts/check-w12-density-monotonic.mjs",
"test:w12-sample-budget": "node scripts/check-w12-sample-budget.mjs",
"test:w12-light-rough": "node scripts/check-w12-light-rough.mjs"
```

Expected: 每个实现 task 已有自身 fail→pass check；本 task 只汇总入口、补齐交叉断言和全量执行。

- [ ] **Step 2: 执行 fail-fast 自动门禁。**

Run: `npm run test:w12-detail-contract`

Expected: exit 0。

Run: `npm run test:w12-density-monotonic`

Expected: exit 0。

Run: `npm run test:w12-sample-budget`

Expected: exit 0。

Run: `npm run test:w12-light-rough`

Expected: exit 0。

Run: `npm run test:pipeline-isolation`

Expected: exit 0。

Run: `npm run typecheck`

Expected: exit 0。

### Task 8: 采集成本、回退与缺陷 Gate 证据

**Files:**

- Create: `docs/evidence/w12-bounded-render-time-detail/run-capture-with-vite.mjs`
- Create: `docs/evidence/w12-bounded-render-time-detail/collect-w12-runtime-evidence.mjs`
- Create: `docs/evidence/w12-bounded-render-time-detail/build-gate.mjs`
- Create: `docs/evidence/w12-bounded-render-time-detail/gate-w12.md`
- Modify: `package.json`

**Interfaces:**

- Consumes: existing `RenderStats.cloudCurrentMs`、`taauCurrentMs`、`shadowMs`、`skipLight` 与 raymarch iteration/sample counters；不新增伪造的 W12 cost fields。
- Produces: detail on/off、world step 固定的 A/B 与双差 Gate，timestamp unavailable 明确为 unavailable。

- [ ] **Step 1: 固定矩阵和 package commands。**

```json
"capture:w12": "node docs/evidence/w12-bounded-render-time-detail/run-capture-with-vite.mjs",
"evidence:w12-runtime": "node docs/evidence/w12-bounded-render-time-detail/collect-w12-runtime-evidence.mjs",
"gate:w12": "node docs/evidence/w12-bounded-render-time-detail/build-gate.mjs"
```

Expected: 固定 Bloom/曝光/tonemap；矩阵包含 Hybrid global-only bounded detail（W9 Stop）、Hybrid hierarchical、equal-overlap、64 km/far-flicker、Cu/Sc/Ac、Cc、W9 thin-ridge，以及 Cb 的已知线性-remap 偏离回归记录（不校准）。每个 Hybrid on/off 都采 `skipLight=false` 和 `skipLight=true`，另保留 world-step-off 旧 W11 对照；所有产物保留 `runtimeSourceMatchesHead`。

- [ ] **Step 2: 用现有字段做精确成本计算。**

```js
const currentMs = (sample) => sample.activeTemporalMode === 'taau-4x4' ? sample.taauCurrentMs : sample.cloudCurrentMs;
const mainDetailCost = currentMs(on.skipLight) - currentMs(off.skipLight);
const localLightDetailCost = (currentMs(on.full) - currentMs(on.skipLight)) - (currentMs(off.full) - currentMs(off.skipLight));
const groundDetailCost = on.full.shadowMs - off.full.shadowMs;
```

Expected: 所有 on/off 都固定 `worldStepEnabled=true`、120/512、相同 scene、相同 temporal mode；`shadowMs` 只使用 `shadowRan=true` 且 `shadowSampleId` 在该 capture frame 更新的 fresh sample。分别报告 full-res/TAAU 的 current timing、`shadowMs`、现有 `raymarchPrimaryIterationsPerPixel` 分布和触顶/最大步长；任一 timestamp 字段不可用则该轴为 unavailable，不以 0 代替；BSM 为 not-applicable。

- [ ] **Step 3: 逐条执行 capture、runtime collector 与 Gate builder。**

Run: `npm run capture:w12`

Expected: 生成矩阵截图、debug 18/19 与每个 on/off × skipLight variant 的 runtime input。

Run: `npm run evidence:w12-runtime`

Expected: 输出 `currentMs` 选择、双差、fresh shadow filter、迭代分布、`runtimeSourceMatchesHead` 和 unavailable 标记。

Run: `npm run gate:w12`

Expected: 产出 Gate report；detail-off 新基线、Legacy/atlas-unavailable fallback、零容忍缺陷、Cb 已知偏离记录和 owner verdict 槽位齐全。

- [ ] **Step 4: 验收回退、视觉与零容忍缺陷。**

```js
const zeroTolerance = ['support-leak', 'negative-density', 'nan', 'brick-seam', 'lod-phase-jump', 'camera-lock', 'genus-hard-cut', 'thin-layer-break'];
const required = ['raw-density', 'normal', 'edge-only', 'detail-frequency', 'wind-motion', 'taau-convergence', 'debug-18', 'debug-19'];
```

Expected: `detailStrength=0` 在 world step 120/512 下精确回退；atlas unavailable/Legacy 走同一 coarse fallback；任一零容忍项失败则 Gate=REVIEW/STOP；owner visual verdict 不被自动数据替代。

### Task 9: 最终审阅、worktree hunk 归因与 OpenSpec 状态

**Files:**

- Modify: `openspec/changes/add-bounded-render-time-cloud-detail/tasks.md`
- Modify: `docs/evidence/w12-bounded-render-time-detail/gate-w12.md`
- Read: `docs/evidence/w12-bounded-render-time-detail/worktree-baseline.txt`

**Interfaces:**

- Consumes: Tasks 1–8 的 results 与 baseline。
- Produces: 真实勾选的 OpenSpec task、owner Continue/Review/Stop、逐 hunk W12 attribution；不提交或归档。

- [ ] **Step 1: 比较 baseline 与当前 diff，按 hunk 而不是文件名隔离 W11。**

Run: `git diff --no-ext-diff -- src/renderer.ts shaders/cloud.wgsl src/rendering/densityShaderSources.ts`

Expected: 每一新增 hunk 引用 Task 2–8；baseline 中原有 W11 hunks 保持记录即可，不要求 dirty 文件消失，也不要求 W12 避开同一文件。

- [ ] **Step 2: 逐条重跑 OpenSpec、四个 W12 checks、isolation、W10B 与 typecheck。**

Run: `openspec validate add-bounded-render-time-cloud-detail --strict --no-interactive`

Expected: exit 0。

Run: `npm run test:w12-detail-contract`

Expected: exit 0。

Run: `npm run test:w12-density-monotonic`

Expected: exit 0。

Run: `npm run test:w12-sample-budget`

Expected: exit 0。

Run: `npm run test:w12-light-rough`

Expected: exit 0。

Run: `npm run test:pipeline-isolation`

Expected: exit 0。

Run: `npm run test:w10b-raymarch`

Expected: exit 0。

Run: `npm run test:w10b-world-raymarch`

Expected: exit 0。

Run: `npm run typecheck`

Expected: exit 0。

- [ ] **Step 3: 进行两阶段审阅并更新实际完成状态。**

```markdown
- [ ] Implementation review: binding slots、dummy fallback、stage/false branch、调用点、debug current attachment、checks 与统计公式可编译并一致。
- [ ] Spec review: O1–O5、§1–§16、family/Nyquist/回退/证据/缺陷均覆盖，且没有扩大 W13/W15/W16。
```

Expected: 仅完成的 OpenSpec items 改为 `[x]`；审阅问题在所属 W12 task 修复并重跑受影响命令。

- [ ] **Step 4: 请求 owner Gate verdict，不自动提交或 archive。**

Expected: `gate-w12.md` 记录 Continue、Review 或 Stop；没有 owner Continue 时保持 change active。

## 执行顺序

1. Task 1 建立可追溯 baseline 和 strict-valid OpenSpec。
2. Task 2 固定 binding/fallback；Task 3 定义所有 stage 依赖；Task 4 才写唯一 stage。
3. Task 5 更新调用图；Task 6 加 defaults/debug data path；Task 7 汇总 checks。
4. Task 8 只在静态门禁全绿后采集 evidence；Task 9 做 hunk 归因与两阶段审阅。

## 计划自审

- [x] Spec coverage：覆盖 §1–§16、O1–O5、只读契约/generation、唯一 Hybrid stage、Cb/Fiber/完整回退、真实 metric/wind/Nyquist、family budget、五项默认、debug 18/19、四 checks、Gate/成本/回退/缺陷。
- [x] Placeholder scan：无未完成标记、模糊后续实现语句或未定义的辅助函数引用；每项命令单独 Run/Expected，不用 PowerShell `;` 串联掩盖失败。
- [x] Type/signature consistency：Task 2 先定义 group 3 binding 4–7 与 `detailResourceControls`；Task 3 再定义完整 controls/evaluation/helpers；Task 4 才消费；`densityAtTyped(pos,wantFinal)`/`densityAt(pos,wantFinal)` 的调用在 Task 5 全枚举；debug 复用 background alpha；成本仅使用现有 RenderStats 字段。
