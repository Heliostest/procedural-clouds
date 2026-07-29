## ADDED Requirements

### Requirement: Recipe-aware bounded carve

Hybrid render-time detail SHALL 以已有 supportDensity 为唯一主体来源，先 gain dilation，再通过单次 `remapClamped(dilated, lo, 1)` 施加 pure subtractive erosion。`lo` SHALL 由 `[0,1]` erosion、`erosionAmount` 与既有 hardening 合成；不得对同一密度做第二次 threshold。stage MUST 早退非正 support、保持 finite/nonnegative 输出、保证 final 不大于 dilated 且不能在 support 外生成密度。Cb 的既有 hardening SHALL 进入该单次 remap；其 detail/erosion atlas 幅度仍为零。

#### Scenario: Carve 不泄漏

- **WHEN** supportDensity 为 0 或负值
- **THEN** finalDensity SHALL 为 0，且系统 MUST NOT 执行 warp 或 detail atlas sampling

#### Scenario: 侵蚀只减

- **WHEN** erosion 增大而其他输入不变
- **THEN** finalDensity SHALL 不增加，且 MUST NOT 变为负数或非有限值

### Requirement: Family budget 与连续混合

系统 SHALL 按 recipe family 限制 detail atlas budget：Billow（Cu/Sc/Ac）为 1 detail 加可选 1 Base.A warp，首轮默认启用 warp；Stratiform（St/As/Ns/Cs）为 1 极弱 detail；Cellular/Wave（Cc）为 1 极弱 detail；Fiber（Ci）与 Convective（Cb）为零 detail/warp atlas samples。Billow 初值 SHALL 为 gain 1.8、erosion 0.55、base wavelength 300 m、warp wavelength 1200 m；Stratiform 为 1.0/0.08；Cellular 为 1.0/0.12；Fiber/Convective 为 1.0/0。主/次 genus SHALL 按 metadata 权重连续混合 detail controls；不得各采完整细节后无界叠加。

#### Scenario: Billow 完整预算

- **WHEN** dominant 或 blended family 为 Cu、Sc 或 Ac，且 W12 detail active
- **THEN** renderer SHALL 最多采样一次 Detail.B 和一次可关闭的 Base.A warp

#### Scenario: Fiber 与 Convective 延后

- **WHEN** family 为 Ci 或 Cb
- **THEN** renderer MUST NOT 采样 W12 detail atlas；Ci final SHALL 等于 support，Cb 仅保留单次 hardening remap

#### Scenario: Equal-overlap 连续

- **WHEN** 主次 genus 权重相等或连续变化
- **THEN** family controls SHALL 平滑混合，MUST NOT 出现 genus 硬切或闪变

### Requirement: 米制相位、Nyquist 与回退

detail coordinate SHALL 使用世界位置、水平/垂直 meters-per-world-unit 与 `dominantWindPhase()` 的 X/Z 平流；MUST NOT 使用相机相关坐标、cache voxel index 或 atlas allocation coordinate。Detail.B SHALL 提供 erosion，Base.A SHALL 仅提供 Billow low-frequency warp，Macro SHALL 不在 W12 采样。无 mip 链时，detail 振幅 SHALL 随距离连续衰减，且当 `worldStepMeters(distance) > wavelengthMeters*0.5` 时强制为零。有效条件为 `edgeSharpening && detailStrength>0 && detailResources.available && worldStepActive`；任一项为假时只走 coarse/hardening fallback，且不得解析 noise fallback。

#### Scenario: 世界风相位稳定

- **WHEN** 相机移动或 W9 brick allocation 重分配
- **THEN** detail 相位 SHALL 保持世界/风稳定，MUST NOT 因相机、voxel index 或 allocation coordinate 跳变

#### Scenario: Nyquist 归零

- **WHEN** 当前距离的 world step 超过当前波长一半
- **THEN** detail amplitude SHALL 为零，且远景不得保留未滤高频

#### Scenario: 不可用回退

- **WHEN** Shared Fields unavailable 或全局 detail 开关关闭
- **THEN** renderer SHALL 关闭 dilation、erosion、warp 与 atlas sampling，不得使用解析 noise 或新 atlas

### Requirement: W12 Gate 与范围

W12 Gate SHALL 在五项新默认下重采基线并验证 Cu/Sc/Ac 相对 Cached/global-only 的轮廓和内部结构改善不是单纯对比度提升。Gate MUST 覆盖 raw density、normal、edge-only、detail-frequency、wind motion、TAAU convergence、debug 18/19、Support leak、negative/NaN、brick seam、LOD phase jump、camera-lock、genus-hard-cut、thin-layer-break、family overlap、远景闪烁与 static sample budget。它 SHALL 分别报告 full-res/TAAU 的 main ray、local light、ground shadow 与 main-ray iteration distribution。W13 BSM 为 not-applicable；W15 Fiber 和 W16 Convective 专属细节不在本 change。

#### Scenario: Global-only Stop

- **WHEN** W9 最终停在 global-only storage
- **THEN** Hybrid bounded detail SHALL 仍可在 global support 上独立工作

#### Scenario: 不可豁免缺陷

- **WHEN** 出现 Support leak、负密度、NaN、brick seam、明显 LOD phase jump、camera-lock、genus-hard-cut、thin-layer-break 或 sample budget 超限
- **THEN** Gate MUST NOT 以 owner waiver 将该项记录为通过
