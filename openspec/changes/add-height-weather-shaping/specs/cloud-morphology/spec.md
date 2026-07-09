## ADDED Requirements

### Requirement: 可切换的高度–天气塑形
系统 SHALL 在共享兼容密度求值路径中提供可切换的高度–天气塑形模型。`densityShapeModel=0` 时 MUST 使用变更前的兼容密度链并复现引入前观感。`densityShapeModel=1` 时 MUST 按下列语义生成基础塑形信号后再进入既有噪声/阈值阶段：

1. 以云体足迹 coverage 为细尺度 weather，并叠加同层低频 weather 或等价大尺度水平调制得到 `weather`；
2. `weather` MUST 乘以实例归一化高度 `h∈[0,1]` 的上下缘门控：`smoothstep(0,0.5,h)*smoothstep(1,0.5,h)`；
3. `cloudShape = pow(weather, 0.3 + 1.5*smoothstep(0.2,0.5,h))`；`cloudShape≤0` 时 MUST 早退返回 0。

`h` SHALL 取云体实例内相对高度（`profileLocal` 或等价），MUST NOT 用全局盒高重新编码高/中/低云。本塑形 MUST NOT 出现在 dispatcher 或属专属 evaluator 的重复拷贝中；属专属形态（纤维、对流塔、tileScale 等）SHALL 继续叠在兼容结果之上。

#### Scenario: 新模型垂直塑形可辨
- **WHEN** `densityShapeModel=1` 且渲染具有清晰足迹的积云/层积云
- **THEN** 密度调试与正常渲染 SHALL 显示相对旧模型更软的上下缘，以及随高度变化的 coverage 响应（中层更易成团）

#### Scenario: 高度用实例坐标
- **WHEN** 两朵同 preset、不同米制 base/thickness 的云体启用新模型
- **THEN** 二者 SHALL 在各自实例高度带内应用相同相对塑形，不得被推到全局盒的固定绝对高度

#### Scenario: 旧模型回退
- **WHEN** `densityShapeModel=0`
- **THEN** 兼容密度输出 SHALL 与引入本能力前视觉等价

#### Scenario: 属专属不旁路
- **WHEN** `densityShapeModel=1` 且 cirrus/cumulonimbus/altocumulus 等属专属强度大于 0
- **THEN** 属专属形态 SHALL 仍然生效，且 MUST NOT 因本塑形被 dispatcher 旁路

### Requirement: 两级 fbm 侵蚀与早退
当 `densityShapeModel=1` 时，系统 SHALL 在 `cloudShape` 之后应用两级程序化 fbm 侵蚀：先 `den = max(0, cloudShape - k1*fbm_coarse)`，再 `den = max(0, den - k2*fbm_fine)`（系数对齐参考约 `k1=0.7`、`k2=0.2`）。任一级结果 `≤0` 时 MUST 早退返回 0。`densityShapeModel=0` 时 MUST NOT 执行这两级侵蚀。输出 MUST 保持有限非负，且 MUST NOT 产生逃出云体足迹的孤立密度。

#### Scenario: 侵蚀产生团块空隙
- **WHEN** `densityShapeModel=1` 且足迹 coverage 充足
- **THEN** 密度场 SHALL 呈现由侵蚀造成的内部空隙/团块边界，而非均匀填充足迹

#### Scenario: 空区早退
- **WHEN** `densityShapeModel=1` 且塑形或侵蚀后密度为 0
- **THEN** 求值器 SHALL 跳过后续昂贵噪声阶段并返回 0

#### Scenario: 旧路径无新侵蚀
- **WHEN** `densityShapeModel=0`
- **THEN** 密度路径 SHALL 不执行上述两级 fbm 侵蚀

#### Scenario: 三质量模式语义一致
- **WHEN** 同一云体依次使用 Cached、Hybrid 与 Realtime 且 `densityShapeModel=1`
- **THEN** 三种模式 SHALL 表示相同的高度–天气塑形与侵蚀基础形态，差异只可来自既有缓存分辨率与实时细节策略
