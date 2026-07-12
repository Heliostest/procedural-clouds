# Change: 为 Density Engine V2 增加共享 GPU 场与噪声图集

## Why

W4 已用保守 tile-body mask 限定未来 evaluator 的候选范围，但 V2 仍没有可复用的形态信号。如果 W6 以后在每个体素、每个云体中直接执行多 octave 4D fBm/Voronoi，或给每个云体创建独立 3D texture，计算量和显存都会随体素数与云体数相乘，重新形成旧共享链的热区问题。

W5 先建立与云属 evaluator 解耦的共享场层：由 GPU compute 一次生成周期 Base/Detail 3D atlas 与低频 XZ macro field，后续云体仅通过坐标变换、平流和少量采样复用它们。这样把昂贵的格点/细胞噪声从“每体素每云体重复求值”改为“共享预计算一次、硬件三线性读取”，同时给资源、格式、更新频率和调试证据设置硬边界。

W5 不启用任何十属密度。Recipe V2 Cached/Hybrid 仍输出有效零缓存；图集只通过显式诊断视图接受周期、接缝、量化和平流连续性检查。W6 才能批准 Stratus/Cumulus evaluator 使用这些资源。

## What Changes

- 新增 V2 私有 `DensitySharedFields` 生命周期，惰性拥有一张 Base Atlas、一张 Detail Atlas、一张 2D Macro Field 与只读重复线性 sampler；所有 V2 云体共享同一套资源。
- 默认规格固定为 Base `64³ rgba8unorm`、Detail `64³ rgba8unorm`、Macro `256² rgba8unorm`，有效纹理 payload 合计 2.25 MiB；连同候选格式、临时资源和对齐后的硬上限为 8 MiB。
- 用有界 compute 生成周期信号：3D atlas 使用有限 lattice/fBm 与至多 `3×3×3` 邻域 Worley；Macro RGBA 分别承载 coverage、thickness、wave phase 与 cell layout 的低频基础信号。
- 固化共享采样 ABI：repeat + linear/trilinear、归一化周期坐标、每体坐标变换/seed offset、风平流与最多一次低频 warp；W5 只提供资源和 helper，不在密度 entry 调用它们。
- atlas 只在首次 V2 创建或 atlas config/seed 变化时重建；macro 只在首次创建或自身 config/seed 变化时重建。普通 cache update 与每帧 Hybrid detail 不得触发资源再生成。
- 将 V2 候选预热顺序固定为 `shared fields compute → zero cache compute → submit/promotion`；任一创建、生成或绑定失败都保留健康 Legacy，不发布半成品 V2。
- 提供惰性的 V2-only atlas slice/macro debug 视图与统计，显示格式、尺寸、估算字节、generation、build count/reason/timing、接缝/量化检查结果；不把私有 writable view 放进 `DensityCacheOutput`。
- 比较 `rgba8unorm`、`r16float`、`rgba16float`：默认产品路径锁定 `rgba8unorm`；其余格式仅作为受控诊断候选，不增加运行时产品开关，也不要求云体使用更多 texture samples。
- 扩展静态隔离检查：W5 可以声明并绑定共享 sampled textures，但 V2 cache entry 仍禁止 `textureSample*`、非零 evaluator、Legacy 4D noise、per-body texture、每帧 atlas pass 和额外正常渲染 pass。

## Non-Goals

- 不实现 W6 Stratus/Cumulus 或任何十属非零密度、vertical profile、topology、detail erosion、attachment 与 genus metadata。
- 不让正常 Cached/Hybrid cache shader 采样 atlas；不改变 W4 的 full-grid dispatch、mask gate 与每体素最终零写入。
- 不为每个云体、每种云属或每个 cache tile 创建独立 3D texture。
- 不实现 GPU compaction、indirect dispatch、atomics、subgroups、动态 mipmap、稀疏纹理或 bindless 资源。
- 不改变 Legacy/Realtime evaluator、RGBA16F cache seam、Optical Profile、CloudBody/scenario schema 或默认质量模式。
- 不用一次性预计算耗时推断稳态 density evaluator 性能；W6 才能测量真实非零采样路径。

## Capabilities

### New Capabilities

- `density-shared-fields`：定义共享 atlas/macro field 的资源规格、生成数学、采样 ABI、生命周期、预算、格式证据和诊断视图。

### Modified Capabilities

- `density-cache-production`：允许 W5 在 V2 候选预热中生成并绑定共享 sampled fields，同时维持正常 cache entry 的全零、零采样和 Legacy 零开销语义。

## Prerequisites and Conflicts

- 依赖已归档 W4 `2026-07-12-add-density-v2-tile-culling` 与归档提交 `a6940f6`；W4 的 active-prefix、Support、mask、预算退化与零输出是本 change 的输入事实。
- W4 验收相关健壮性修复提交为 `43b3cca`；W5 不回退 workgroup clamp、GUI hook 隔离或 HUD 可读性修复。
- `add-height-weather-shaping`、`add-height-ambient-tint` 和 `add-stratocumulus-cumulus-breakup` 保持 Legacy 范围；W5 macro channels 不是对这些提案参数链的复制。
- W5 不提高 `density-recipe-schema` 中任何 Recipe sample/Octave budget；十属 Recipe 继续 `enabled=0`。

## Impact

- **代码**：预计新增 shared-field config/resource owner、生成 WGSL/pipeline、sampling ABI、debug pipeline/视图、format probe 与 fixtures；修改 V2 Adapter/pipeline、stats/HUD 和隔离检查。
- **GPU 资源**：仅首次请求 Cached/Hybrid V2 后分配共享资源；默认有效纹理约 2.25 MiB，声明硬上限 8 MiB；云体数量增加不复制 atlas。
- **GPU 工作**：候选首次预热或显式 config/seed 失效时新增一次 atlas compute 与一次 macro compute；普通帧、Legacy 与 Realtime-only 请求不新增 pass。
- **CPU**：只负责有限 config 校验、资源生命周期和诊断统计，不在 CPU 生成/上传体积噪声。
- **视觉**：正常 V2 Cached/Hybrid 仍为空场景；新增诊断视图可以显示共享场切片和平流。Legacy 与 Realtime 画面不变。
- **规格**：新增 `density-shared-fields`，修改 `density-cache-production`。
