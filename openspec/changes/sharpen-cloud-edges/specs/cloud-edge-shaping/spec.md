## ADDED Requirements

### Requirement: 按云属的边缘锐化控制
系统 SHALL 为每个云属预设提供 `edgeHardness`，并在 raymarch 统一密度取样入口按样本的主导云属计算有效硬度。系统 SHALL 同时提供全局硬度倍率与总开关；总开关关闭或倍率为 0 时 MUST 直接返回阶段 10 前的密度路径。默认参数 SHALL 只显著锐化 cumulonimbus，普通 cumulus SHALL 保持阶段 10 前观感。

#### Scenario: 积雨云默认锐化
- **WHEN** 样本的主导云属为 cumulonimbus 且总开关开启
- **THEN** 统一取样入口 SHALL 使用 cumulonimbus 预设的非零 `edgeHardness`

#### Scenario: 普通积云默认不变
- **WHEN** 样本的主导云属为默认 cumulus
- **THEN** 有效硬度 SHALL 为 0，密度 SHALL 不经过阶段 10 的侵蚀或陡传递

#### Scenario: 全局即时回退
- **WHEN** 用户关闭边缘锐化总开关或把全局倍率设为 0
- **THEN** cached、hybrid、realtime 的统一取样入口 SHALL 回退到阶段 10 前的密度结果，无需重载页面

### Requirement: 单调陡密度传递
对有效硬度大于零的样本，系统 SHALL 在 raymarch 取样时围绕可调阈值执行随硬度收窄的 `smoothstep` 密度传递。该传递 MUST 单调，且主 raymarch、光照行进与地面云影 MUST 经同一取样入口取得一致结果。

#### Scenario: 硬度收窄传递窗口
- **WHEN** 提高某云属的 `edgeHardness`
- **THEN** 该云属密度阈值的传递窗口 SHALL 收窄，轮廓 SHALL 更快从透明过渡到不透明

#### Scenario: 所有质量模式一致
- **WHEN** 用户在 cached、hybrid、realtime 间切换
- **THEN** 同一云属 SHALL 使用相同的阈值、有效硬度与传递函数

#### Scenario: 未来占据金字塔保持保守
- **WHEN** 对缓存密度最大值应用同一传递函数
- **THEN** 单调传递 SHALL 保持最大值的保守性，不得把空区映射为非零密度

### Requirement: 边缘带解析侵蚀
系统 SHALL 仅在有效硬度大于零且原始密度接近传递阈值的窄带内，使用 curl 域扭曲的 3D Worley 信号执行解析侵蚀。侵蚀 MUST 在 raymarch 取样时计算而不写回密度缓存，MUST 只减少密度，且噪声函数 SHALL 可由后续密度模型复用。

#### Scenario: 仅边缘带付费
- **WHEN** 样本远离密度阈值或有效硬度为 0
- **THEN** 系统 SHALL 跳过 Worley/Curl 边缘侵蚀计算

#### Scenario: 侵蚀不凭空造云
- **WHEN** 解析侵蚀作用于任意样本
- **THEN** 输出密度 SHALL 小于等于输入密度且不小于 0

#### Scenario: 缓存保持不变
- **WHEN** 密度 compute pass 写入缓存
- **THEN** 缓存 SHALL 保留未侵蚀原始密度，解析侵蚀 SHALL 只在后续取样入口执行

### Requirement: 积雨云垂直轮廓
高硬度云属 SHALL 使用区别于旧对称圆化包络的垂直轮廓：顶部 SHALL 采用窄过渡截断并在高层扩展水平足迹形成砧顶，底部 SHALL 由预设 `baseRoundness` 控制平底与圆底之间的曲线。硬度为 0 的云属 MUST 保持旧垂直包络。

#### Scenario: 积雨云砧顶
- **WHEN** 渲染默认 cumulonimbus 云体的上部
- **THEN** 上部水平足迹 SHALL 较中部扩展，顶部 SHALL 呈锐利且受解析噪声侵蚀的砧状轮廓

#### Scenario: 底部曲率可调
- **WHEN** 修改高硬度预设的 `baseRoundness`
- **THEN** 云底 SHALL 在较平与较圆的过渡曲线间变化，不得固定为同一平面裁切

#### Scenario: 非锐化云属保留旧包络
- **WHEN** 云属预设 `edgeHardness` 为 0
- **THEN** `evalBody` SHALL 使用阶段 10 前的垂直包络与底部 falloff
