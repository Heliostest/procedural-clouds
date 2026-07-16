# Change: 为 Density V2 增加固定预算的共享 Body-local Density Bricks

## Why

W8 已完成代码、自动检查与 64/64 case、128/128 张截图采集，但独立视觉 Gate 为 Stop。当前全局 `96³` RGBA 缓存覆盖 XZ 各 64 km；默认横向 voxel 约 666.7 m，而 `w8-cellular-scale` 中每个 2.5 km 云体只横跨约 3.75 个全局 voxel。已经在全局缓存阶段被低通掉的 cell 骨架、薄 profile 与 ripple，不能靠渲染时再加高频扰动可靠恢复；默认提高整个全局网格又会把 compute、显存和带宽按三次方放大。

W9 需要验证一条分层路径：保留全局 RGBA 缓存负责完整 coarse/fallback 与 metadata，同时在固定总预算的一对共享 3D atlas 中为活动云体分配 body-local scalar density brick。Cached/Hybrid renderer 只在候选完整且有界时用 brick 结果替换 coarse；任何溢出、缺失或失败都整点回退 global-only，而不是把两层相加或扫描全部 12 个云体。

## What Changes

- 新增 `density-body-local-bricks` capability，定义共享 density brick atlas、固定预算、格式探测、分配器、gutter、record ABI、候选网格、ping-pong、生命周期与 W9 Gate。
- 将 `DensityCacheOutput` 升级为版本化复合输出：现有双 `rgba16float` coarse views/通道语义保持不变，Recipe V2 可额外发布只读 hierarchical payload；Legacy 与 global-only V2 发布 `hierarchical=null`。
- 为 Recipe V2 增加 CPU-only `global-only | hierarchical` requested/active 存储模式；默认继续 global-only。Hierarchical 创建、预热或运行失败时回退健康 global-only V2，不强制把整个 Producer 回退到 Legacy。
- 创建一对共享 3D density atlas；优先尝试 `r16float 160³`，仅在 storage-write 与 filter-sample probe 通过时使用；`rgba16float 96³` 为兼容 fallback，`rgba8unorm 128³` 只作受控证据候选。任一时刻只允许一对格式 profile 常驻，双 atlas 有效 payload 硬上限为 16 MiB。
- 每个活动 Recipe V2 Body 最多分配一个逻辑 `24³/32³/48³/64³` brick，使用 2-voxel gutter 和 8-voxel page 对齐；预算不足时逐级降档直至 nonresident，不创建 per-body texture。
- 新增固定 160-byte `DensityBrickRecordGPU[12]` 与每 coarse tile 固定最多 4 个 compact Body index 的 render candidate grid；overflow、任一候选 nonresident 或 generation 不一致时，该采样点必须使用 coarse。
- Brick compute 复用 W8 已批准的静态 Recipe evaluator，不增加 family/sample budget；每个 brick dispatch 只求一个 Body，不执行 12-body loop。每次实际 cache update 最多增加一个 compute pass、12 次有界 dispatch。
- Cached/Hybrid 新增惰性的 hierarchical pipeline bundle。其 `densityAtTyped()` 用固定四候选循环采样 brick 并执行 Legacy-compatible soft overlap/top-two metadata；不包含完整 evaluator，也不在 W9 增加新的 render-time detail 算子。
- 增加 global-only/hierarchical/Legacy 固定 A/B、atlas slice、allocation/candidate/overflow、显存、cache/brick/cloud/ground-shadow timing 与机器可读 Continue/Stop Gate。

## Non-Goals

- 不迁移 Cirrus Fiber 或 Cumulonimbus Convective；Ci/Cb 在 Recipe V2 中继续 disabled。
- 不实现 W12 的 Recipe-aware render-time ripple、边缘侵蚀、微分叉或其他新 Hybrid detail。
- 不改变 `DensityRecipeGPU` layout version 2、W8 family evaluator 数学、shared noise atlas 或 Macro Field ABI。
- 不为每个 Body 创建独立 texture，不允许每 Body 固定 `96³`，不允许无固定总预算的 atlas 扩容。
- W9 每 Body 最多一个 brick；不实现 aspect-aware 多 brick、clipmap、sparse texture、mipmap、virtual-texture page streaming 或 GPU compaction。
- 不改变 scenario/import/preset schema，不把 brick 档位持久化为场景作者参数。
- 不删除 Legacy、不改变默认 Producer/存储模式、不把 W9 Spike 直接作为产品默认。
- 不用 coarse 与 brick 相加，不在候选不完整时做部分 brick 合成。

## Capabilities

### New Capabilities

- `density-body-local-bricks`：共享固定预算 density atlas、body-local allocation/records、brick 生成、render candidate grid、生命周期、诊断与架构 Gate。

### Modified Capabilities

- `density-cache-production`：版本化 `DensityCacheOutput`、Recipe V2 hierarchical payload、global-only 子级回退与 W9 诊断。
- `cloud-rendering`：Cached/Hybrid 的惰性 hierarchical bundle、固定候选 brick 采样、整点 coarse fallback 与统一消费者绑定。
- `cloud-params`：新增 CPU-only Recipe V2 storage mode request，保持默认 global-only 并暴露 requested/active/reason。

### Unchanged Capabilities

- `density-recipe-schema`：仍为 layout version 2；brick allocation 存在独立 record，不占用 Recipe lanes。
- `density-shared-fields`：W5 Base/Detail noise atlas 与 Macro Field 继续是只读信号库；W9 density atlas 是不同资源。
- `density-v2-evaluators`：W9 复用 W8 静态 Stratiform/Billow/Cellular evaluator，不新增 Fiber/Convective/Hybrid family。

## Prerequisites and Conflicts

- 2026-07-16 项目所有者确认 W8 的全局 `96³` 低通是架构性阻塞，并批准 W9 作为 W8 Stop 的受控修复路径先行实施。该决定不把 W8 旧证据改写为 pass，也不允许归档 W8；W8 与 W9 必须以同 revision 的 A/B 证据联合复验。
- 实施前已将本 change 的 `density-cache-production` delta 对 W8 八属当前规范重新核对。后续 W8 修复若改变 sample/Support/metadata 契约，MUST 重新核对并 rebase，不得由 W9 覆盖或静默放宽。
- `establish-density-v2-baseline`、`add-height-weather-shaping`、`add-height-ambient-tint` 与 `raymarch-occupancy` 保持各自范围；本 change 不把其中的未完成项改写为通过。
- W5 shared **noise atlas** 与 W9 shared **density brick atlas** 不是同一资源。W9 不修改 W5 的 2.25 MiB payload、generation cadence 或 group 2 sampling ABI。
- 当前 renderer 的 Cached/Hybrid group 1 只有 coarse sampler + 双 view；hierarchical bundle 必须使用独立 layout/source，不能让默认 global-only bundle静态携带无用 brick bindings。
- 若目标设备不支持批准的 atlas profile、预算或 timestamp evidence，hierarchical SHALL unavailable 并保持 global-only V2；不得临时创建 per-body fallback。
- W9 只能改善 global-cache 低通导致的 Cellular 尺度、薄层与 ripple 丢失；Legacy Cc timeout、未采集的 Support/metadata 证明和最终项目所有者视觉签核仍是独立 Gate 项，不能因 hierarchical 截图变锐自动通过。

## Impact

- **代码**：预计修改 `src/density/contracts.ts`、`recipeDensityV2Adapter.ts`、`recipeV2Pipeline.ts`、renderer quality contracts/pipelines/source assembly、HUD 与 benchmark；新增 brick config/allocator/records/candidate-grid/pipeline/shader/fixtures。
- **GPU 资源**：hierarchical active 时新增一对共享 density atlas、一个 1,920-byte 固定 record buffer、默认约 27 KiB 的候选网格及相关 bind groups；brick atlas resident payload MUST `<=16 MiB`，重建期 brick-only peak MUST `<=32 MiB`。
- **GPU passes**：普通无 cache update 帧不新增 compute pass；实际 cache update 最多由现有 global coarse pass再增加一个 brick compute pass。Cloud/ground-shadow render pass 数不增加。
- **Renderer**：global-only bundle 不变；hierarchical Cached/Hybrid bundle在每次密度采样中最多检查 4 个候选，不得遍历 `MAX_BODIES=12`。
- **视觉**：目标是在相同全局 `96³` 与固定总 brick 预算下恢复小型 Cellular 与细长代理主体的中尺度形态，同时保持 overlap、metadata、风平流和 LOD 稳定。
- **兼容**：Legacy、Realtime、W8 Recipe layout/evaluator、scenario/preset、Optical 与 post 不变；global-only V2 始终可见回退。
