## ADDED Requirements

### Requirement: 风速物理单位与方向约定

系统 SHALL 在 CPU 模型与 scenario v3 中以 m/s 表达水平风速。风向 SHALL 表示密度结构移动的去向：0°=`+X`、90°=`+Z`，从 `+Y` 俯视按顺时针增加；系统 MUST NOT 将该角度误标为气象学“来向”。风速 MUST 为有限非负数，方向 SHALL 归一化到 `[0,360)`。

#### Scenario: 十米每秒产生物理位移

- **WHEN** 某云体以 10 m/s 沿固定方向平流 10 s
- **THEN** 其累计水平平流位移 SHALL 为 100 m

#### Scenario: 方向约定可验证

- **WHEN** 风向为 90°且风速大于 0
- **THEN** 密度结构 SHALL 沿场景 `+Z` 方向平流

#### Scenario: 非法风速被拒绝

- **WHEN** 输入负数、NaN 或无限风速
- **THEN** 系统 SHALL 拒绝该值并保留上一个合法风速

### Requirement: 时间变风连续累计

系统 SHALL 通过对水平速度向量按场景时间积分获得累计平流位移，MUST NOT 使用“当前速度 × 从零开始的总 `sceneTime`”重算全部历史位移。手动模式 SHALL 按 `deltaSceneSeconds` 累计；scenario 模式 SHALL 将任意时刻的累计位移实现为风时间线的确定性函数。

#### Scenario: 运行中改变风速不回跳

- **WHEN** 云体先以速度 A 平流一段时间，再在场景时间连续的情况下切换到速度 B
- **THEN** 切换时刻的累计位移 SHALL 连续，之后仅新增位移使用速度 B

#### Scenario: 暂停不累计位移

- **WHEN** 场景时间暂停且 wall-clock 继续流逝
- **THEN** 平流累计位移 SHALL 保持不变

#### Scenario: Scrub 结果与路径无关

- **WHEN** 直接跳转、顺序播放或来回 scrub 到同一 scenario 时刻
- **THEN** 每个云体的累计平流位移 SHALL 相同

### Requirement: 质量模式共享物理相位

cached、hybrid 与 realtime 质量模式 SHALL 使用同一米制累计位移映射得到的平流相位。缓存快照与其平流 offset MUST 对应；hybrid 的缓存低频密度与实时细节 MUST NOT 使用不同时间或单位语义。

#### Scenario: 质量模式方向与速度一致

- **WHEN** 在相同场景时刻和风配置下切换 cached、hybrid、realtime
- **THEN** 可识别密度特征的平流方向与累计位移 SHALL 一致，不得反向或按 1000 倍比例跳变

#### Scenario: 高速风触发足够缓存更新

- **WHEN** 一个缓存更新间隔内的最大平流位移超过一个水平体素
- **THEN** renderer SHALL 提前刷新或限制插值区间，使画面不出现明显跳格或长拖影

## MODIFIED Requirements

### Requirement: 风向平流位移

系统 SHALL 将 CPU 累计的米制位移除以 `horizontalMetersPerWorldUnit`，在 GPU pack 边界只转换一次，并作为水平 world transport offset 同时应用于云体足迹、程序化密度、实体调试体、线框与 gizmo。作者保存的 `bounds/feather` 与天气图纹理数据 MUST NOT 被逐帧改写；垂直结构（高度掩膜、顶部截断、falloff）MUST NOT 随水平风移动。

#### Scenario: 云体在世界坐标中运输

- **WHEN** 设置非零物理风并推进场景时间
- **THEN** 云体足迹、可识别密度、实体调试体、线框与 gizmo SHALL 沿世界 XZ 风向共同移动

#### Scenario: 作者 placement 不被改写

- **WHEN** 云体累计非零世界运输位移
- **THEN** 原始 `CloudBody.bounds/feather/base/thickness`、天气图纹理与 placement lock SHALL 保持不变，重置平流相位后云体回到初始 placement

#### Scenario: 风速为零时平流静止

- **WHEN** `windSpeedMps = 0`
- **THEN** 累计平流位移 SHALL 不再增加，但独立的 morph 仍可继续

### Requirement: 长时间平流稳定性

系统 SHALL 以 CPU 双精度数值累计米制位移，并保证至少在 80 m/s 连续运行 1 小时的验收窗口内，GPU 平流相位无 NaN、回跳、明显精度抖动或硬接缝。系统 MUST NOT 在程序化噪声尚未证明周期连续时以简单 `fract` 环绕引入可见接缝。

#### Scenario: 一小时高速平流稳定

- **WHEN** 风速为 80 m/s 且场景时间连续推进 1 小时
- **THEN** 密度平流 SHALL 连续，不出现数值溢出、突然归零或周期接缝

### Requirement: 风随场景时间轴驱动

场景启用时，系统 SHALL 以 scenario 顶层 wind 作为每个云体的默认物理风，并允许 body event 的 `windDeg`/`windSpeed` 覆盖对应分量。播放器 SHALL 先把方向/速度转为 XZ 速度向量，再按事件 ease 插值并积分累计位移；场景禁用时 SHALL 恢复手动风及其独立平流状态。

#### Scenario: 场景风覆盖手动风

- **WHEN** 启用含 wind 配置的场景并播放
- **THEN** 云体平流 SHALL 由 scenario 的 m/s 风时间线决定，而非 GUI 手动值

#### Scenario: Body 风事件覆盖场景默认

- **WHEN** 某云体事件指定 `windDeg` 或 `windSpeed`
- **THEN** 该分量 SHALL 从事件时刻起按 ease 参与该云体速度向量插值，其他云体继续使用各自时间线

#### Scenario: 禁用场景恢复手动风

- **WHEN** 关闭场景开关
- **THEN** 系统 SHALL 恢复手动云体风与切换前保存的手动平流状态

## RENAMED Requirements

- FROM: `### Requirement: 平流边界环绕`
- TO: `### Requirement: 长时间平流稳定性`
