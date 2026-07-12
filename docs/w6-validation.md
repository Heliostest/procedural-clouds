# W6 Stratus/Cumulus 验证说明

W6 已把 Recipe V2 从空密度升级为双属 Spike。自动化检查证明配方启用集合、静态采样上限、CPU 数学镜像、shader source closure、tile mask 接入和 A/B 场景清单符合提案；它不能代替真实 WebGPU 设备上的视觉与 timestamp query 证据。

## 固定条件

- 密度分辨率：`96³`
- Workgroup：`8×8×4`
- 主性能模式：Cached；Hybrid 只做视觉与消费协议回归
- A/B：同一个场景通过全局 `densityProducerMode` 切换 Legacy / Recipe V2
- 至少 5 次有效 cache warmup，之后至少 30 次有效 cache timestamp；当前 harness 使用更严格的 60 帧和 60 个 GPU 样本
- timestamp query 不可用或样本不足时，性能结论必须保持 `unresolved`

## 固定场景

Benchmark 面板中以 `w6--` 开头的 case 覆盖：Stratus 单体/多体、Cumulus 单体/多体，以及 Stratus+Cumulus 重叠。每个场景都提供 Legacy/V2、Cached/Hybrid、normal/density-debug 组合。

## 继续/停止阈值

- Stratus 单体和多体：V2 cache median 不高于 Legacy 的 `0.80×`，p90 不高于 `1.00×`
- Cumulus 单体和多体：V2 cache median 不高于 Legacy 的 `1.10×`，p90 不高于 `1.20×`
- 重叠场还必须确认密度有限、G/B 主次属与 A 权重稳定
- 任意性能、形态、Support、metadata 或 source-maintainability 项未决，都不能标成通过，也不能归档或继续 W7

机器可读状态见 `docs/w6-gate-report.json`。

## 项目所有者归档决定

2026-07-12，项目所有者确认修正后的 benchmark 已无明显卡顿，并批准归档 W6、继续 W7。精确 cache median/p90 比率与逐项视觉矩阵没有采集，因此报告将这些项目记为 `owner-waived` / `not-collected-owner-waived`，而不是伪装成性能通过。修正提交为 `9a8d33a`，主要解决异步 timestamp 样本收集与等待问题。
