## ADDED Requirements

### Requirement: V2 Body 使用稳定 Active Prefix

V2 CPU packer SHALL 将所有通过 genus、geometry、coverage、density/lifecycle 与有限值检查的云体按源相对顺序紧凑写入 `DensityBodyGPU[0..activeBodyCount)`，并将剩余 record 全部写零。`activeBodyCount` MUST 等于有效前缀长度且 MUST 不超过 `MAX_BODIES=12`；GPU mask bit 与未来 body loop index SHALL 引用 compact slot，不得引用原始数组中的稀疏 slot。CPU MAY 保留 source-index 诊断映射，但 MUST NOT 上传动态 indirection/operator table。

#### Scenario: 无效条目不截断后续有效云体

- **WHEN** 原始 Body 数组在一个 invalid/disabled 条目之后仍包含有效云体
- **THEN** 有效云体 SHALL 按源相对顺序进入 active prefix，`activeBodyCount` SHALL 覆盖它，未来 `i<activeBodyCount` 循环 MUST NOT 因稀疏 slot 漏掉该云体

#### Scenario: 尾部记录确定性归零

- **WHEN** 有效云体少于 `MAX_BODIES`
- **THEN** `[activeBodyCount, MAX_BODIES)` 的所有 Body bytes SHALL 为零，任何 tile mask 高位或尾部 bit MUST NOT 被设置

#### Scenario: 超限输入有界截断

- **WHEN** 输入包含超过 `MAX_BODIES` 个有效云体
- **THEN** packer SHALL 只保留源顺序中的前 12 个有效云体并报告截断计数，MUST NOT 写越界 record 或生成 bit 12–31

### Requirement: Recipe 声明保守 Support 包络

`DensityRecipeGPU.support0` SHALL 固定表示 `[maxHorizontalScale, maxFeatherScale, maxLowerExtensionFraction, maxUpperExtensionFraction]`。horizontal/feather scale MUST 为有限 `[1,4]`，上下扩张 fraction MUST 为有限 `[0,1]`；它们定义 evaluator、砧顶与 attachment 可能产生非零密度的最大 Support，而不是实际密度公式。W4 Recipe SHALL 继续 `enabled=0` 且 sample/Octave/attachment evaluator budgets 为零，但 MAY 填写非零 Support 上界。

Support builder SHALL 将作者 bounds/base/thickness、feather、累计风平流和完整三轴旋转组合为保守世界 AABB，并额外包含至少半个 density voxel 与有限 epsilon。后续 Wave 在启用任何 topology/detail/attachment 前 MUST 证明其所有非零密度都位于已声明 Support 内；若扩大 Support，必须同步更新 Recipe、mask signature 与 fixtures。

#### Scenario: 旋转和平流不产生假阴性

- **WHEN** 云体具有任意有限三轴旋转与累计水平风位移
- **THEN** 世界 Support AABB SHALL 覆盖扩张后的旋转 OBB，任何通过精确 Support predicate 的 voxel 所属 tile MUST 包含该 compact body bit

#### Scenario: Cb 砧顶与 Attachment 上界被包含

- **WHEN** Cumulonimbus 使用当前声明的最大砧顶扩张，或未来 change 为某 attachment 声明非零最大扩张
- **THEN** 对应 Recipe Support SHALL 在 evaluator 启用前覆盖该最大范围；disabled attachment 的 evaluator budget 与额外扩张 SHALL 保持零

#### Scenario: Support 过宽允许而过窄失败

- **WHEN** deterministic voxel sweep 比较 Support predicate 与 tile mask
- **THEN** false-positive candidate MAY 存在，但任一 false-negative MUST 使检查失败，系统不得以更高剔除率为理由缩小已需覆盖的 Support
