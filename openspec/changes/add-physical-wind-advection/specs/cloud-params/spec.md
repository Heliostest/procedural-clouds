## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: 默认场景风运输可观察

`createDefaultParams()` SHALL 默认设置 `showAxes=true`。默认云体 SHALL 携带非零 m/s 水平风，使应用启动后无需额外配置即可观察云体相对世界 XZ 坐标的运输。

#### Scenario: 默认显示坐标轴

- **WHEN** 首次以默认参数启动应用
- **THEN** 世界坐标轴 SHALL 默认可见

#### Scenario: 默认云体随风运输

- **WHEN** 默认场景持续运行且未暂停
- **THEN** 至少一个默认云体 SHALL 以非零物理风在世界 XZ 中连续移动
