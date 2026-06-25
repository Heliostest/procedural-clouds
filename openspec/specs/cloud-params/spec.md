# cloud-params Specification

## Purpose
TBD - created by archiving change refactor-cloud-params. Update Purpose after archive.
## Requirements
### Requirement: 分组参数结构
着色器 SHALL 以语义化分组 struct 定义云渲染参数，并通过单一顶层 `Params` 聚合，经一个 uniform binding 暴露。分组 MUST 至少包含 `RenderParams`（步进与光照）、`CloudShape`（密度场形态）、`Wind`、`SceneTime`。`CloudShape` MUST 暴露形态控制字段，至少包含 `coverageThreshold`、`edgeSharpness`、`baseRoundness`、`worleyBlend`、`detailStrength`、`altBase`、`altTop`，且各字段 SHALL 有可复现既有观感的默认值。`Wind` MUST 暴露 `dir`（vec3，水平风向）、`speed`、`morphRate`，分别控制平流方向、平流速度与形变速率。

#### Scenario: 单一 binding 暴露聚合结构
- **WHEN** 着色器声明云参数 uniform
- **THEN** 仅存在一个 `params: Params` 绑定于既有的 `@group(0) @binding(1)`，且 bind group layout 与重构前一致

#### Scenario: 每个字段语义可定位
- **WHEN** 开发者在着色器中读取某个参数
- **THEN** 该参数 SHALL 通过命名字段访问（如 `params.shape.density`、`params.wind.dir`），而非裸 `vecN` 分量索引

#### Scenario: 形态字段可调制密度场
- **WHEN** 修改 `CloudShape` 的 `edgeSharpness`/`baseRoundness`/`worleyBlend`/`detailStrength`/`altBase`/`altTop`
- **THEN** `cloudDensity()` 输出 SHALL 随之改变（边缘锐度、底部曲率、细胞感↔蓬松感、细节幅度、高度带）

#### Scenario: 默认值复现既有观感
- **WHEN** 形态字段取其默认值
- **THEN** 渲染结果 SHALL 与未引入这些字段前一致，不产生突变

#### Scenario: 风字段控制平流与形变
- **WHEN** 修改 `Wind` 的 `dir`/`speed`/`morphRate`
- **THEN** 密度场 SHALL 据此分别调整平流方向、平流速度与 W 轴形变速率

### Requirement: CPU 端按名打包
CPU 端 SHALL 提供按字段名写入参数的打包函数 `packParams`，字段到字节偏移的映射 MUST 集中定义于单一事实来源。打包过程 MUST NOT 出现散落的裸数组下标赋值。

#### Scenario: 按名写入
- **WHEN** 帧循环准备参数数据
- **THEN** 每个参数 SHALL 经命名字段写入对应偏移，bool 值以 0/1 的 f32 编码

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
CPU 端 SHALL 把 `CLOUD_PRESETS` 的形态字段按预设顺序打包为着色器可索引的 uniform 数组，使 `cloudDensity()` 能按运行时类型索引取得任一预设的形态参数。该数组 MUST 按 std140 对齐打包，且字段到偏移的映射 MUST 集中定义为单一事实来源。

#### Scenario: 按索引取预设形态
- **WHEN** 着色器以整数索引访问预设数组
- **THEN** 返回的形态参数 SHALL 与 `CLOUD_PRESETS` 中对应预设的字段值一致

#### Scenario: 静态上传一次
- **WHEN** 预设表内容在运行期不变
- **THEN** 预设 uniform 数组 SHALL 仅初始化时上传一次，无需逐帧重写

### Requirement: RenderParams 取样质量字段
`RenderParams`（聚合于顶层 `Params` 的 `Globals`）SHALL 扩展取样质量字段，至少包含 `qualityMode`（cached/hybrid/realtime 的整数枚举）、`detailFreq`（hybrid 高频细节频率）、`detailStrength`（hybrid 高频细节强度）。这些字段 MUST 经既有 `packParams` 按命名字段写入单一事实来源的偏移表，MUST NOT 出现裸下标赋值，且默认值（`qualityMode` 为 cached、`detailStrength` 为 0）SHALL 复现引入前观感。新增字段 MUST 满足 std140-like 对齐，扩展后 `Globals` 之后的 `bodies` 数组基偏移 MUST 同步更新。

#### Scenario: 质量字段按名打包
- **WHEN** 帧循环准备参数数据
- **THEN** `qualityMode`/`detailFreq`/`detailStrength` SHALL 经命名字段写入对应偏移

#### Scenario: 默认值复现观感
- **WHEN** 取样质量字段取默认值
- **THEN** 渲染结果 SHALL 与引入这些字段前一致

#### Scenario: 扩展不破坏体数组布局
- **WHEN** `Globals` 增加取样质量字段后打包
- **THEN** `bodies` 数组的字节布局 SHALL 仍与着色器一致，云体渲染不受影响

