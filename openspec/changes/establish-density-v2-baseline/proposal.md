# Change: 建立 Density Engine V2 的 Legacy 基线与证据协议

## Why

`docs/roadmap-refactor.md` 决定采用同仓库并行重写 Density Engine V2 的路线。后续 Wave 会改变 shader 组装、缓存生产和十属密度形态；如果没有固定输入、分离计时和可追溯截图，就无法判断变化来自 V2、设备、活动提案、调试视图还是普通测量噪声。

W0 先建立可重复的 Legacy Cached/Hybrid 基线和证据协议。它只增加基准场景、采集工具、结果导出与文档，不改变密度、光照、缓存或云属形态语义。

## What Changes

- 新增 `cloud-density-benchmarking` capability，定义固定 benchmark manifest、场景矩阵、测量协议、证据格式和有效性规则。
- 保留十个单云属场景，以及“十属同场景”和“单个复杂 Cb”两个压力场景，作为后续 Wave 共用的可重复场景目录。
- 固定相机、viewport、场景时间、暂停状态、天气、风、生命周期、云体 placement、质量参数、`96³` cache 与 update rate。
- W0 提供五个代表场景（Stratus、Cumulus、Cirrus、复杂 Cb、十属同场）的建议证据方案：Cached/Hybrid 正常视图共 10 个 timing case，以及 5 组 Normal/Density Debug 视觉锚点（10 张截图）。项目所有者已于 2026-07-11 完成人工审阅并豁免严格采集，因此缺失这些证据不阻塞 W1，但不得据此声称已有定量性能基线。
- 其余单云属 case 保留为可选采集项，在对应云族迁移 Wave 开始时再生成 Legacy/V2 前后对照；Realtime 仅保留可选兼容入口，不进入 W0 Gate。
- 扩展只读统计，明确区分 `cloud`、实际执行的 `cache`、其他既有 GPU pass、pipeline 首次创建 CPU 时间、活跃云体数与配置指纹。
- 当 `timestamp-query` 不可用时明确记录 GPU timing 不可用，不使用 FPS 或 CPU wall time伪装成 GPU pass 时间。
- 可按需生成机器可读 JSON 结果、人类可读索引和按规范命名的代表性截图证据；manifest 明确这些 case 为建议采集而非 W0 Gate 必需项。
- 将 source revision、活动 OpenSpec change 状态和关键参数快照纳入证据指纹；输入发生变化后旧结果必须标为 stale 或重新采集。
- W0 不设置绝对性能通过线；它建立后续 W1–W12 使用的比较基准和测量噪声范围。

## Non-Goals

- 不建立 `DensityCacheProducer`、Legacy/V2 Adapter 或 V2 shader。
- 不拆分 Cached、Hybrid、Realtime pipeline。
- 不修改密度、噪声、光照、weather、preset、CloudBody 或 scenario 语义。
- 不修改 cache format、resolution 默认值、workgroup 或 update rate 默认值。
- 不实现自动截图浏览器框架、跨机器性能排行榜或 CI GPU 测试。
- 不优化 4D Voronoi/fBm，不实现 tile-body mask、noise atlas 或新 Recipe。
- 不将 Realtime 纳入性能验收。

## Capabilities

### New Capabilities

- `cloud-density-benchmarking`：可重复的密度基线场景、GPU 测量协议、证据包和 W0 完成 Gate。

### Modified Capabilities

- 无。现有 `cloud-rendering`、`cloud-morphology` 和 `cloud-params` 行为保持不变。

## Prerequisites and Conflicts

- `add-height-weather-shaping` 与 `add-height-ambient-tint` 已实现但仍缺少部分视觉/性能验收。W0 SHALL 记录两项开关与 active change 状态；它们在默认状态或验收状态改变后，权威基线必须重新采集。
- `densityShapeModel=0`、`heightAmbientModel=0` 可作为兼容锚，但 Density V2 的权威 Legacy 基线 SHALL 使用 W0 实施时已批准的默认状态，不能混合两套配置的结果。
- `add-stratocumulus-cumulus-breakup` 当前没有实施任务；W0 不实现或假定其形态行为。
- 本 change 依赖现有 `timestamp-query` 统计和 `Renderer.getStats()`，允许补足只读状态，但不得借机调整渲染公式。
- W1 及后续 Density V2 change 可在 W0 工具落地、人工视觉签核和项目所有者明确批准后建立；缺少 timing/截图只限制性能结论，不再阻塞架构工作。

## Impact

- **代码**：预计新增独立 benchmark controller/manifest 模块；小幅扩展 `src/renderer.ts` 的只读统计和 `src/main.ts`/`src/gui.ts` 的采集入口。
- **文档/数据**：新增 `docs/baselines/density-v2-w0/` 下的 manifest、结果、截图索引和采集说明。
- **规格**：新增 `cloud-density-benchmarking`。
- **运行时**：正常运行路径默认关闭 benchmark controller；关闭时不得增加额外 GPU pass 或改变画面。
- **性能**：本 change 测量现状，不声明优化收益；采集模式的 CPU 记录开销不得计入稳态 GPU pass 数据。
