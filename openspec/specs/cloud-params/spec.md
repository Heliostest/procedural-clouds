# cloud-params Specification

## Purpose
TBD - created by archiving change refactor-cloud-params. Update Purpose after archive.
## Requirements
### Requirement: 分组参数结构

着色器 SHALL 以语义化分组 struct 定义云渲染参数，并通过单一顶层 `Params` 聚合，经一个 uniform binding 暴露。分组 MUST 至少包含 `RenderParams`（步进与光照）、`CloudShape`（密度场形态）、每体风 payload、`SceneTime`。`CloudShape` MUST 暴露形态控制字段，至少包含 `coverageThreshold`、`edgeSharpness`、`baseRoundness`、`worleyBlend`、`detailStrength`、`altBase`、`altTop`，且各字段 SHALL 有可复现既有观感的默认值。CPU `CloudBody` MUST 以 `windDeg`/`windSpeedMps` 表达物理风，并累计米制位移；每体 GPU 风 payload MUST 以命名字段暴露 `advectionOffsetWorld`（水平 render-world 偏移）与独立 `morphTime`，shader MUST NOT 再以当前 speed 乘总 `sceneTime` 重算历史平流。

#### Scenario: 单一 binding 暴露聚合结构

- **WHEN** 着色器声明云参数 uniform
- **THEN** 仅存在一个 `params: Params` 绑定于既有的 `@group(0) @binding(1)`，且 bind group layout 与重构前一致

#### Scenario: 每个字段语义可定位

- **WHEN** 开发者在着色器中读取某个参数
- **THEN** 该参数 SHALL 通过命名字段访问（如 `params.g.sceneTime`、每体 `advectionOffsetWorld`），而非无说明的裸 `vecN` 分量索引

#### Scenario: 形态字段可调制密度场

- **WHEN** 修改 `CloudShape` 的 `edgeSharpness`/`baseRoundness`/`worleyBlend`/`detailStrength`/`altBase`/`altTop`
- **THEN** `cloudDensity()` 输出 SHALL 随之改变（边缘锐度、底部曲率、细胞感↔蓬松感、细节幅度、高度带）

#### Scenario: 默认值复现既有观感

- **WHEN** 形态字段取其默认值
- **THEN** 渲染结果 SHALL 与未引入这些字段前一致，不产生突变

#### Scenario: 风 payload 控制平流与形变

- **WHEN** CPU 更新某体 `advectionOffsetWorld` 或 `morphTime`
- **THEN** 密度场 SHALL 据此分别调整累计水平平流相位与 W 轴形变相位，二者互不复用单位

### Requirement: CPU 端按名打包

CPU 端 SHALL 提供按字段名或集中语义常量写入参数的打包函数，字段到字节偏移的映射 MUST 集中定义于单一事实来源。每体物理累计位移 SHALL 在 pack 边界除以 `horizontalMetersPerWorldUnit` 后写入 `advectionOffsetWorld`，且 MUST NOT 在 shader 再次缩放。打包过程 MUST NOT 出现散落的无语义裸数组下标赋值。

#### Scenario: 按名写入

- **WHEN** 帧循环准备参数数据
- **THEN** 每个全局参数与每体风 payload SHALL 经命名字段或集中 offset 常量写入对应位置，bool 值以 0/1 的 f32 编码

#### Scenario: 米制偏移只转换一次

- **WHEN** 某体累计位移为 100 m 且 `horizontalMetersPerWorldUnit=1000`
- **THEN** GPU `advectionOffsetWorld` SHALL 为 0.1 world unit，shader MUST NOT 再除以 1000

#### Scenario: buffer 大小由结构推导

- **WHEN** 分配参数 uniform buffer
- **THEN** buffer 字节数 SHALL 由分组结构按 std140 对齐推导，而非硬编码常量

### Requirement: GPU 与 CPU 布局一致
CPU 偏移表与着色器结构字段布局 MUST 逐字节对齐，满足 WebGPU std140-like 对齐规则（vec3/struct 16 字节对齐、整体 size 向上取整到 16 的倍数）。

#### Scenario: 重构后画面一致
- **WHEN** 使用与重构前相同的参数值与相机位姿渲染
- **THEN** 输出画面 SHALL 与重构前像素级一致

### Requirement: SceneTime 时间基
参数结构 SHALL 包含 `SceneTime`，至少暴露 `sceneTime` 与 `deltaTime`，与作为噪声 W 轴的形变时间相互区分。

#### Scenario: 时间字段独立填充
- **WHEN** 帧循环更新参数
- **THEN** `sceneTime`/`deltaTime` SHALL 按真实流逝时间填充，且与噪声形变时间为独立字段

#### Scenario: 本阶段不改变密度行为
- **WHEN** 本次重构完成
- **THEN** 密度场采样 SHALL 不读取 `sceneTime`/`deltaTime`，仅保留字段供后续阶段使用

### Requirement: 预设形态参数 uniform 数组
CPU 端 SHALL 把 `CLOUD_PRESETS` 的形态字段按预设顺序打包为着色器可索引的 uniform 数组，使 `cloudDensity()` 能按运行时类型索引取得任一预设的形态参数。该数组 MUST 按 std140 对齐打包，且字段到偏移的映射 MUST 集中定义为单一事实来源。该数组 SHALL 在形态字段之外，额外为每个预设打包**光照字段**，至少包含 `absorptionCoeff`、`phaseForward`、`phaseBack`、`silverLining`、`baseDarkening`、`sssStrength`，使着色器能按类型索引取得任一预设的光照参数。新增光照字段 MUST 由同一 `packPresetArray` 单一事实来源写入，MUST NOT 出现裸下标赋值，扩展后每预设 vec4 槽位数与 `PRESET_FLOAT_COUNT` MUST 同步并满足 std140 对齐。

#### Scenario: 按索引取预设形态
- **WHEN** 着色器以整数索引访问预设数组
- **THEN** 返回的形态参数 SHALL 与 `CLOUD_PRESETS` 中对应预设的字段值一致

#### Scenario: 按索引取预设光照
- **WHEN** 着色器以整数索引访问预设数组的光照字段
- **THEN** 返回的吸收/相函数前后向/银边/暗底/SSS SHALL 与 `CLOUD_PRESETS` 中对应预设的光照字段值一致

#### Scenario: 静态上传一次
- **WHEN** 预设表内容在运行期不变
- **THEN** 预设 uniform 数组 SHALL 仅初始化时上传一次，无需逐帧重写

### Requirement: RenderParams 取样质量字段
`RenderParams`（聚合于顶层 `Params` 的 `Globals`）SHALL 扩展取样质量字段，至少包含 `qualityMode`（cached/hybrid/realtime 的整数枚举）、`detailFreq`（hybrid 高频细节频率）、`detailStrength`（hybrid 高频细节强度）。这些字段 MUST 经既有 `packParams` 按命名字段写入单一事实来源的偏移表，MUST NOT 出现裸下标赋值，且默认值（`qualityMode` 为 cached、`detailStrength` 为 0）SHALL 复现引入前观感。新增字段 MUST 满足 std140-like 对齐，扩展后 `Globals` 之后的 `bodies` 数组基偏移 MUST 同步更新。此外 `RenderParams` SHALL 包含全局 `typeLightingBlend`（0~1），用于在「全局光照观感」与「按云属光照」之间插值；其默认值 SHALL 使按云属光照生效，取值为 0 时 SHALL 复现引入本字段前的全局光照观感。

#### Scenario: 质量字段按名打包
- **WHEN** 帧循环准备参数数据
- **THEN** `qualityMode`/`detailFreq`/`detailStrength` SHALL 经命名字段写入对应偏移

#### Scenario: 按云属混合字段按名打包
- **WHEN** 帧循环准备参数数据
- **THEN** `typeLightingBlend` SHALL 经命名字段写入对应偏移

#### Scenario: 混合为零复现全局观感
- **WHEN** `typeLightingBlend` 取 0
- **THEN** 着色结果 SHALL 与引入按云属光照前的全局光照一致

#### Scenario: 扩展不破坏体数组布局
- **WHEN** `Globals` 增加取样质量字段后打包
- **THEN** `bodies` 数组的字节布局 SHALL 仍与着色器一致，云体渲染不受影响

### Requirement: Bloom 后处理参数
顶层参数结构 SHALL 扩展 Bloom 后处理字段，至少包含 `bloomEnabled`（bool）、`bloomThreshold`（亮度阈值）、`bloomAmount`（叠加强度）。字段 MUST 经既有 `packParams` 或 post uniform 的单一事实来源写入，MUST NOT 出现裸下标赋值。默认值（Bloom 关闭或强度为 0）SHALL 复现引入前观感。

#### Scenario: 参数按名打包
- **WHEN** 帧循环准备 post uniform 或等价参数 buffer
- **THEN** `bloomEnabled`/`bloomThreshold`/`bloomAmount` SHALL 经命名字段写入对应偏移

#### Scenario: 默认值复现观感
- **WHEN** Bloom 参数取默认值（关闭或强度 0）
- **THEN** 渲染结果 SHALL 与引入这些字段前一致

#### Scenario: GUI 可调
- **WHEN** 用户通过 GUI 修改 Bloom 开关、阈值或强度
- **THEN** 后处理 SHALL 实时响应，无需重启

### Requirement: RenderParams 光照与画质字段
`RenderParams`（聚合于顶层 `Params` 的 `Globals`）SHALL 扩展光照与画质字段，至少包含太阳方位角、太阳高度角、双瓣相函数的前向/背向项与混合权重、silver lining 强度、powder 强度、God rays 强度。这些字段 MUST 经既有 `packParams` 按命名字段写入单一事实来源的偏移表，MUST NOT 出现裸下标赋值，且各字段 SHALL 有可复现引入前观感的默认值。新增字段 MUST 满足 std140-like 对齐，扩展后 `Globals` 之后的 `bodies` 数组基偏移 MUST 同步更新。

#### Scenario: 光照字段按名打包
- **WHEN** 帧循环准备参数数据
- **THEN** 太阳方位/高度角、相函数权重与各画质强度 SHALL 经命名字段写入对应偏移

#### Scenario: 默认值复现观感
- **WHEN** 光照与画质字段取默认值
- **THEN** 渲染结果 SHALL 与引入这些字段前一致

#### Scenario: 扩展不破坏体数组布局
- **WHEN** `Globals` 增加光照字段后打包
- **THEN** `bodies` 数组的字节布局 SHALL 仍与着色器一致，云体渲染不受影响

### Requirement: 米到渲染单位比例
`CloudParams` SHALL 包含 `verticalMetersPerWorldUnit` 与 `horizontalMetersPerWorldUnit`，两者必须为正，默认均为 1000。旧 `altitudeScale`/`horizontalScale` SHALL 在兼容期映射到新字段或经迁移删除，不能与新字段同时独立缩放。

#### Scenario: 默认比例
- **WHEN** 首次加载新版默认参数
- **THEN** 垂直与水平比例 SHALL 均为 1000 m/world-unit

#### Scenario: 非法比例被拒绝
- **WHEN** 用户输入 0、负数或非有限比例
- **THEN** 系统 SHALL 拒绝该值并保留上一个合法比例

### Requirement: 物理约束 CPU 开关
`CloudParams` SHALL 包含 `enforcePhysicalPlacement: boolean`，默认 false。该开关 SHALL 仅控制 CPU placement 校验，不得为了该逻辑扩展 GPU uniform；GPU 只接收约束后的转换结果。

#### Scenario: 默认不强制
- **WHEN** 首次加载应用
- **THEN** `enforcePhysicalPlacement` SHALL 为 false

#### Scenario: GUI 切换立即生效
- **WHEN** 用户开启物理约束并编辑越界 placement
- **THEN** CPU SHALL 立即按 `cloud-genus-profile` 规则修正并刷新渲染数据

### Requirement: 默认米制场景边界
`createDefaultParams()` 中 `cloudHeight` SHALL 为 12000 m、`boxHalfExtent` SHALL 为 16000 m，并经空间比例映射为紧凑渲染盒。GUI 与 glossary SHALL 显示米制语义。

#### Scenario: 默认层顶容纳积雨云
- **WHEN** 使用默认参数新增 cumulonimbus
- **THEN** profile 默认顶部 SHALL 不被 `cloudHeight` 截断

### Requirement: 地面云影质量参数
`CloudParams` SHALL 提供地面云影执行模式、内联积分质量与二维透射率缓存控制字段，至少包含 `groundShadowMode`、`groundShadowMaxSteps`、`groundShadowStepScale`、`groundShadowJitter`、`groundShadowMapResolution`、`groundShadowMapUpdateRate`、`groundShadowHistoryWeight` 与 `groundShadowFilterRadius`。GPU 实际读取的字段 MUST 经命名 offset/pack 单一事实来源写入并保持对齐；仅用于 CPU 资源生命周期和调度的字段 MUST NOT 为方便而重复写入 GPU uniform。

#### Scenario: 阶段 1 参数按名打包
- **WHEN** 帧循环准备 Adaptive 地面云影参数
- **THEN** mode、最大步数、步长尺度与抖动强度 SHALL 经命名字段写入对齐的 GPU 参数，`bodies` 基偏移 SHALL 与 WGSL 保持一致

#### Scenario: 透射率资源参数留在 CPU
- **WHEN** map 分辨率、更新率或资源生命周期字段只由 renderer 调度读取
- **THEN** 这些字段 SHALL 保持在 CPU 侧单一事实来源，不得无语义地扩展主云 shader uniform

#### Scenario: 运行时模式切换
- **WHEN** 用户在 Legacy、Adaptive 与 Transmittance 间切换
- **THEN** 渲染 SHALL 无需重载页面即可切换路径，且未选路径的专用 pass SHALL 被旁路

#### Scenario: 参数边界
- **WHEN** 用户设置地面云影质量参数
- **THEN** 最大步数 SHALL 限制在 8–64、抖动在 0–1、历史权重在 0–0.95、过滤半径在 0–2，纹理分辨率 SHALL 限制为受支持的离散值

#### Scenario: 阶段门控默认值
- **WHEN** 阶段 1 尚未通过验收
- **THEN** 默认模式 SHALL 保持 Legacy；阶段 1 通过后 SHALL 切为 Adaptive；只有阶段 2 全部验收通过后 SHALL 切为 Transmittance

### Requirement: 默认场景风运输可观察

`createDefaultParams()` SHALL 默认设置 `showAxes=true`。默认云体 SHALL 携带非零 m/s 水平风，使应用启动后无需额外配置即可观察云体相对世界 XZ 坐标的运输。

#### Scenario: 默认显示坐标轴

- **WHEN** 首次以默认参数启动应用
- **THEN** 世界坐标轴 SHALL 默认可见

#### Scenario: 默认云体随风运输

- **WHEN** 默认场景持续运行且未暂停
- **THEN** 至少一个默认云体 SHALL 以非零物理风在世界 XZ 中连续移动

