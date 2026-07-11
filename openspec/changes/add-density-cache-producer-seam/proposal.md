# Change: 建立 DensityCacheProducer Seam 与 Legacy Adapter

## Why

当前 `src/renderer.ts` 同时拥有密度 compute pipeline、`rgba16float` ping-pong 纹理、缓存更新调度、时间混合、采样 bind group、地面云影绑定和统计。这使后续 Density Engine V2 若直接接入，必然与 renderer、阴影和 debug 视图同时耦合，也无法在同一输出契约下安全回退 Legacy。

W1 建立一个有实际资源所有权的 `DensityCacheProducer` Seam：先把现有缓存生产完整包入 `LegacyDensityAdapter`，再提供尚不可用的 `RecipeDensityV2Adapter` 槽位和安全选择器。Legacy 仍是唯一工作实现，密度数学、缓存格式、Cached/Hybrid 成像和更新节奏均不改变。

## What Changes

- 新增 `density-cache-production` capability，定义 Producer 的帧输入、准备/编码顺序、输出缓存、统计、资源生命周期和失败语义。
- 新建独立 density 模块，包含公共 contracts、`LegacyDensityAdapter`、`RecipeDensityV2Adapter` unavailable 槽位和 producer selector。
- 将现有双 3D 纹理、cache index、更新调度、wind-voxel 刷新、时间 blend、cache compute 编码和相关资源销毁移入 Legacy Adapter。
- 保持输出为双 `rgba16float` 3D 缓存：R=密度、G=主云属、B=次云属、A=次云属混合权重；本 Wave 不改变通道数值。
- renderer、地面云影和 density debug 只通过 `DensityCacheOutput` 获取采样器、两张只读 view、blend、resolution、resource generation 与 content revision，不得访问 Adapter 内部 texture、storage view、pipeline 或 bind group。
- 新增 CPU-only `densityProducerMode`（Legacy / Recipe V2 request），与 Cached/Hybrid/Realtime `qualityMode` 正交；默认 Legacy。
- Recipe V2 在 W1 中 MUST 报告 unavailable 且不创建 shader/pipeline/texture；请求 V2 时 selector 必须保留或回退 Legacy，并暴露结构化原因。
- 明确 resize、workgroup 变更、销毁、device loss、重复销毁和创建失败的责任；扩展只读统计以区分 requested/active producer 与 fallback reason。

## Non-Goals

- 不实现 V2 Recipe、V2 compute shader、V2 参数布局或任何新密度公式。
- 不拆分 Cached、Hybrid、Realtime shader module 或 pipeline；该工作属于 W2。
- 不实现 tile-body mask、noise atlas、macro field、算子预算或云属迁移。
- 不改变 `rgba16float` 格式、双缓存时间混合、cache resolution/update rate/workgroup 默认值。
- 不改变 weather、wind、lifecycle、CloudBody、preset、光照、地面云影积分或 debug 视图语义。
- 不承诺 Realtime 性能，也不把 Realtime 纳入 Producer 输出；Realtime 继续跳过缓存 compute。
- 不实现完整 renderer/device 自动重建；device loss 时只要求资源失效和可诊断状态。
- 不删除 Legacy，也不把 Recipe V2 设为默认。

## Capabilities

### New Capabilities

- `density-cache-production`：密度缓存 Producer contract、Legacy Adapter、V2 槽位、选择/回退和生命周期。

### Modified Capabilities

- `cloud-rendering`：Cached/Hybrid、地面云影与 density debug 只能消费 `DensityCacheOutput`，Realtime 语义保持不变。
- `cloud-params`：增加 CPU-only `densityProducerMode`，不进入 WGSL uniform 布局。

## Prerequisites and Conflicts

- W0 工具已落地；项目所有者于 2026-07-11 人工确认画面无明显回归，并在提交 `1c62d25` 中接受 timing/截图未采集。W1 不得据此声称存在定量 Legacy 性能基线。
- `add-height-weather-shaping` 与 `add-height-ambient-tint` 的当前默认状态属于 Legacy 行为；Legacy Adapter 必须原样包裹，不得重写其公式。
- `add-stratocumulus-cumulus-breakup` 当前无实施任务；W1 不吸收或实现该形态目标。
- W1 对 `cloud-params` 的修改是 CPU-only selector，不占用 `Globals` offset，因此不与上述 active changes 的 uniform 字段冲突。
- W2 及后续 change 依赖本 Seam，但本提案获批不自动批准 W2 或 V2 实现。

## Impact

- **代码**：预计新增 `src/density/` 模块；重构 `src/renderer.ts` 的缓存资源、调度、consumer bind group 和统计；小幅修改 `src/params.ts`、`src/gui.ts`、`src/i18n.ts`。
- **着色器**：保持现有 `cloud.wgsl` 密度公式与 binding 语义；只允许为显式输出契约增加非行为性注释或常量核对。
- **规格**：新增 `density-cache-production`；扩展 `cloud-rendering` 与 `cloud-params`。
- **运行时**：默认 Legacy；请求未就绪 V2 时继续使用 Legacy，并显示 fallback reason。
- **视觉/性能**：目标是无视觉变化；因 W0 未采集权威 timing，本 Wave 只能报告观感、调度和 pass 结构是否保持，不能声明性能等价或收益。
