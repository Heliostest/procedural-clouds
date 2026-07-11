## Context

当前 renderer 已通过 `timestamp-query` 记录若干 GPU pass，并通过 `Renderer.getStats()` 暴露 `cloudMs`、`cacheMs`、`shadowMs` 和 `postMs`。但这些数据面向实时 HUD：

- cache pass 不是每帧执行，当前调用方无法可靠区分“本帧未执行”与“沿用上次值”；
- 没有固定 benchmark manifest 和参数指纹；
- 正常视图与 density debug 容易混在同一采样窗口；
- pipeline 首次创建 CPU 时间与稳态 GPU pass 时间没有统一记录；
- 活动 change 的默认开关仍可能变化；
- 截图和 timing 没有统一命名、source revision 和 stale 规则。

W0 的职责是建立测量地基，而不是优化现状或提前实现 V2。

## Goals / Non-Goals

### Goals

- 为十属和两个压力场景建立可重复输入。
- 为 Cached/Hybrid 建立可比较的视觉与 GPU timing 基线。
- 明确 GPU、CPU、正常视图、density debug、cache 执行帧之间的区别。
- 让每份证据能够追溯 source revision、设备、features/limits 和完整参数状态。
- 建立后续 Wave 复用的基线格式与 stale 规则。

### Non-Goals

- 不改变任何云密度、光照或缓存算法。
- 不自动判断 V2 是否视觉更好。
- 不给出跨 GPU 通用的毫秒预算。
- 不建立浏览器自动化或 CI GPU 农场。
- 不为 Realtime 收集性能矩阵。

## Decisions

### Decision 1: 新建独立 capability，而不修改 cloud-rendering

`cloud-rendering` 描述质量模式的运行语义；W0 描述如何测量和保存证据。两者职责不同，因此新增 `cloud-density-benchmarking`，不把 benchmark 工具写成渲染语义的一部分。

### Decision 2: 使用声明式 benchmark manifest

权威 manifest SHALL 固定并可序列化以下信息：

- manifest schema/version 和 baseline ID；
- 目标 source revision 与 active change 状态；
- viewport/render target；
- camera、scene time、暂停状态；
- weather、wind、lifecycle；
- CloudBody placement、shape、genus 和 preset；
- 全部影响密度/成像的 CloudParams 快照；
- `cacheResolution=96`、`cacheUpdateRate=2`；
- quality mode、view mode、warm-up 和 sample protocol。

manifest 是输入事实来源。GUI 当前值不得在 benchmark 开始后悄悄覆盖它；运行期间的用户交互必须取消本轮或使结果无效。

### Decision 3: 场景矩阵分为视觉矩阵和压力矩阵

视觉矩阵：

```text
10 个单云属场景
× Cached / Hybrid
× Normal / Density Debug
= 40 个证据 case
```

压力矩阵：

```text
十属同场景
单个复杂 Cumulonimbus
× Cached / Hybrid
```

压力场景必须采集正常视图 timing，并至少保存一张对应 density debug 图；不得把 debug timing 与 normal timing 合并。

Realtime 只在一个代表性场景记录 pipeline 是否可创建、画面是否有限且无明显错误；不进入 timing、截图矩阵或 W0 性能完整性判断。

### Decision 4: 参考 viewport 固定为 1280×720

权威参考运行使用 1280×720 render target。其他分辨率可以作为附加结果，但不得与参考结果合并计算。缓存固定为 `96³`，update rate 固定为 2；其他所有参数由 manifest 固定。

### Decision 5: GPU pass 只接受 timestamp-query

GPU timing 使用 `timestamp-query`。每个 case 在状态稳定后先 warm up 至少 60 帧，再收集：

- 至少 60 个有效 cloud pass 样本；
- 至少 60 个实际执行的 cache pass 样本；
- 对其他被纳入报告的 pass 收集至少 60 个有效样本。

报告至少包含 count、median、p95、min 和 max。cache 样本只在 `cacheRan=true` 时计入，不复用上一次 `cacheMs`。

当设备不支持 `timestamp-query` 时：

- 视觉证据仍可采集；
- GPU 字段写为 `unavailable` 并注明原因；
- FPS、JavaScript 帧时或 CPU wall time不得填入 GPU 字段；
- 至少一台支持 `timestamp-query` 的参考设备完成全部矩阵后，W0 才能通过性能证据 Gate。

### Decision 6: pipeline 创建时间是单独的 CPU 指标

adapter/device 请求、shader module 创建和各 pipeline 创建的 elapsed time 使用 `performance.now()` 等 CPU wall clock 记录，并明确标记为 CPU startup timing。它不与 GPU pass median 相加，也不参与稳态性能判断。

### Decision 7: 证据包同时提供机器与人可读入口

建议目录：

```text
docs/baselines/density-v2-w0/
├── README.md
├── manifest.json
├── results/
│   └── <device-id>.json
└── screenshots/
    └── <case-id>.png
```

结果 JSON 至少记录：

- baseline/manifest version；
- source revision 和采集时间；
- adapter 信息、features、limits 和 timestamp availability；
- 配置 fingerprint；
- case ID、quality mode、view mode 和活跃云体数；
- warm-up/sample counts；
- 各 pass 统计；
- pipeline CPU startup timing；
- screenshot 相对路径；
- warnings、unavailable 字段和 stale 状态。

README 汇总矩阵完整度、测量限制和权威 reference device，但不手工复制所有原始数字。

### Decision 8: 配置漂移使证据失效，不做隐式归一化

source revision、manifest、viewport、quality/view mode、关键参数或活动 change 默认状态不匹配时，两份结果不得直接比较。工具 SHALL 拒绝合并或明确标记 mismatch/stale；不得用比例缩放假装等价。

### Decision 9: benchmark 模式默认关闭且只读

benchmark controller 默认关闭。开启时只装载固定输入、读取 stats 和导出证据；不得添加额外 GPU 渲染 pass。截图可以按 manifest case 手动保存，但文件名和完成状态必须进入证据索引。

## Risks / Trade-offs

- **40 个视觉 case 较多**：十属后续都会迁移，少于该矩阵会留下盲区；通过 case ID、manifest 和半自动状态切换降低人工错误。
- **活动 change 尚未完全验收**：结果包含 source revision、开关和 active change 状态；默认状态变化后明确重采，不混用旧结果。
- **timestamp-query 非必选 feature**：允许视觉-only 结果，但权威性能基线要求至少一台支持设备。
- **手动截图可能遗漏**：机器可读结果保存 expected/completed case 列表，README 只在矩阵完整时声明 W0 完成。
- **仪表代码本身有 CPU 开销**：只统计 GPU timestamp；采集控制器默认关闭，CPU startup timing 独立记录。
- **缓存两帧更新一次**：使用 `cacheRan` 过滤真实 cache 样本，避免重复旧值。

## Migration Plan

1. 先补齐只读 stats 与 benchmark manifest，不改变渲染算法。
2. 建立十属和压力场景，核对装载后的参数 fingerprint。
3. 加入采样状态机和 JSON export。
4. 在一台支持 `timestamp-query` 的参考设备完成矩阵。
5. 补充截图与 README，标记 W0 Gate。
6. 后续 Wave 复制 manifest version 并以新的 result namespace 写对照，不覆盖 W0 Legacy 原始证据。

回滚时可以移除 benchmark controller 和采集入口；现有 renderer 行为与参数 schema 不需要迁移。

## Open Questions

- 无。绝对性能目标与允许回归比例属于 W6 Spike 或后续 V2 提案，不在 W0 决定。

