## ADDED Requirements

### Requirement: 高积云与卷积云鱼鳞胞元尺度
系统 SHALL 在 `evalAltocumulus()` 与 `evalCirrocumulus()` 内提供由 `tileScale` 控制的重复胞元（鱼鳞）密度重塑，使高积云呈现中空规则云胞行、卷积云呈现更高频细鳞/米粒。重塑 SHALL 受云体足迹、实例垂直区间、生命周期/密度调制与统一物理平流约束。公式 MUST NOT 出现在 dispatcher、`evalCompatibilityGenus()` 或其他云属 evaluator 中。`tileScale=0` 时对应 evaluator SHALL 在新增噪声采样前返回兼容密度。

#### Scenario: 高积云鱼鳞可辨
- **WHEN** altocumulus 的 `tileScale` 大于 0
- **THEN** 正常渲染与密度调试视图 SHALL 呈现规则重复的小云胞及可辨缝隙，而非单一平滑团块

#### Scenario: 卷积云更细密
- **WHEN** 在相同足迹与相机下比较默认 cirrocumulus 与默认 altocumulus
- **THEN** cirrocumulus 的典型胞元尺度 SHALL 明显小于 altocumulus

#### Scenario: 尺度连续可调
- **WHEN** 在有效范围内调节某一目标属的 `tileScale`
- **THEN** 胞元重复频率 SHALL 连续变化，且 MUST NOT 产生 NaN、负密度或逃出足迹的孤立密度

#### Scenario: 零强度回退
- **WHEN** 两目标属 `tileScale` 均为 0
- **THEN** 密度 SHALL 与变更前固定场景视觉等价，且新增噪声路径 SHALL 不执行

#### Scenario: 非目标属隔离
- **WHEN** 渲染非 altocumulus、非 cirrocumulus 的云属
- **THEN** 其密度路径与观感 MUST NOT 因本能力改变
