## ADDED Requirements

### Requirement: 高度环境光染色
系统 SHALL 提供可切换的云内环境散射染色模型。`heightAmbientModel=0` 时 MUST 使用变更前的常数环境项（`mix(skyC.ambient, skyC.shadow, …) * 0.5`）并复现引入前观感。`heightAmbientModel=1` 时 MUST 按盒内归一化高度 `zN∈[0,1]` 计算环境色：

`A = (0.5 + 0.6·zN) * skyC.ambient + max(0, 1.0 - 2.0·zN) * white`

其中 `white` 为近白常数（实现默认约 `vec3(0.85)`），再与既有 `shadowTintStrength` 语义混合：`amb = mix(A, skyC.shadow, shadowTintStrength * (1 - sunVisibility))`，并乘以使默认白天平均亮度接近旧路径的总倍率。该模型 MUST NOT 改变太阳散射项 `sunPart`、`heightLight`/`baseDark` 标量、`lightMarchDepth`/`sunVisibility`、密度取样或步进积分权重公式。`heightAmbientModel` 默认 SHALL 为 1。

#### Scenario: 底部偏冷
- **WHEN** `heightAmbientModel=1` 且渲染高光学厚度积雨云/积云下部样本（`zN` 低）
- **THEN** 环境贡献 SHALL 相对顶部更偏 `skyC.ambient` 冷色，底部不死成均匀灰

#### Scenario: 顶部偏亮白
- **WHEN** `heightAmbientModel=1` 且样本 `zN` 高
- **THEN** 白项权重 SHALL 下降、蓝/ambient 项抬升，顶部相对更亮且不整体 clip

#### Scenario: 旧路径回退
- **WHEN** `heightAmbientModel=0`
- **THEN** 环境项 SHALL 与引入本能力前一致

#### Scenario: 与暗底亮顶并存
- **WHEN** `heightAmbientModel=1` 且按云属 `baseDark`/`heightLight` 开启
- **THEN** 太阳项高度标量与环境色分层 SHALL 同时生效，不得互相抵消成无垂直对比

#### Scenario: 无额外步进
- **WHEN** 切换 `heightAmbientModel`
- **THEN** raymarch 与 light-march 迭代上限 SHALL 不变
