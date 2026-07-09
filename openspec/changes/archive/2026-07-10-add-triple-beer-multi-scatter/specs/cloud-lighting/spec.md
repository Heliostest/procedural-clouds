## ADDED Requirements

### Requirement: 三指数 Beer 多重散射可见度
系统 SHALL 提供可切换的朝阳光路可见度模型：`msModel=0` 时 MUST 使用变更前的固定权重三 octave Beer（`sunVisibility`）并复现引入前观感；`msModel=1` 时 MUST 使用三指数 Beer：

`V = exp(-τ) + 0.5·s·exp(-0.1·τ) + 0.4·s·exp(-0.02·τ)`

其中 `τ` 为经 `shadowDarkness` 倍率后的朝阳光学厚度，`s = mix(0.008, 1.0, smoothstep(0.96, 0.0, μ))`，`μ` 为视线与太阳方向的点积。该模型 MUST NOT 增加 light-march 采样步数。`msModel` 默认 SHALL 为 1。

#### Scenario: 新模型朝阳透光
- **WHEN** `msModel=1` 且渲染高光学厚度积雨云、视线接近太阳方向（`μ` 高）
- **THEN** 云体内部 SHALL 保留可见透光分层，背光侧 SHALL 不死黑

#### Scenario: 背光散射量降低
- **WHEN** `msModel=1` 且 `μ` 接近 -1（视线背离太阳）
- **THEN** `s` SHALL 接近下限，多重散射贡献 SHALL 明显弱于朝阳视角

#### Scenario: 旧模型回退
- **WHEN** `msModel=0`
- **THEN** 朝阳可见度 SHALL 与引入本能力前的 `sunVisibility` 公式一致

#### Scenario: 无额外步进成本
- **WHEN** 切换 `msModel` 且 light-march 步数参数不变
- **THEN** light-march 循环迭代次数上限 SHALL 不变

### Requirement: 密度与高度调制的散射乘子
当 `msModel=1` 时，系统 SHALL 在样本散射项上乘以参考式调制：

`mix(0.05 + 1.5·pow(min(1, d·8.5), 0.3+5.5·zN), 1.0, clamp(τ·0.4, 0, 1))`

其中 `d` 为样本密度，`zN` 为盒内归一化高度，`τ` 为该样本朝阳光学厚度（含 `shadowDarkness`）。`msModel=0` 时 MUST NOT 应用该乘子。

#### Scenario: 厚云吃透射
- **WHEN** `msModel=1` 且样本 `τ` 较大
- **THEN** 调制因子 SHALL 接近 1，散射以 Beer 透射为主

#### Scenario: 薄高处塑形
- **WHEN** `msModel=1` 且样本 `τ` 小、`zN` 高
- **THEN** 调制因子 SHALL 抬高散射，使薄高处相对更亮

#### Scenario: 旧路径无乘子
- **WHEN** `msModel=0`
- **THEN** 散射项 SHALL 不包含上述密度/高度调制乘子

## MODIFIED Requirements

### Requirement: 双瓣相函数与边缘增亮
散射 SHALL 采用可调的双瓣相函数（前向瓣为 Cornette-Shanks、背向瓣为 HG，按混合权重组合），并 SHALL 支持 silver lining 背光银边与 Beer-powder 暗化：薄处提亮、厚处压暗。各效果强度为 0 时 SHALL 退化为基础单次散射观感。当 `msModel=1`（三指数 Beer）时，系统 SHALL 将 `powderStrength` 的出厂默认值设为 0，避免与多重散射双重压暗；用户仍可手动提高 powder。`msModel=0` 时 powder 默认行为 MUST 与引入三指数 Beer 前一致。

#### Scenario: 前向散射尖峰
- **WHEN** 视线接近太阳方向
- **THEN** 云体 SHALL 呈现更强的前向透光高光

#### Scenario: 背光银边
- **WHEN** 背光观察云缘且银边强度大于 0
- **THEN** 云的边缘 SHALL 出现增亮的银边

#### Scenario: powder 暗化
- **WHEN** powder 强度大于 0
- **THEN** 云的薄区 SHALL 提亮、厚实内部 SHALL 相对压暗

#### Scenario: 新 MS 默认关闭 powder
- **WHEN** 参数取默认值且 `msModel=1`
- **THEN** `powderStrength` SHALL 为 0

#### Scenario: 旧 MS 保留原 powder 默认
- **WHEN** `msModel=0` 且其余参数为引入本能力前的默认
- **THEN** powder 相关观感 SHALL 与引入前一致
