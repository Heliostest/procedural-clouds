# cloud-physical-units Specification

## Purpose
TBD - created by archiving change physical-credibility. Update Purpose after archive.
## Requirements
### Requirement: 米制物理场景数据
系统 SHALL 在 CPU 场景模型与 scenario v2 中以米存储空间距离：`CloudBody.base/thickness/bounds/feather`、`cloudHeight` 与 `boxHalfExtent`。Y=0 SHALL 表示场景地面基准，`base` SHALL 表示相对该基准的高度；系统 MUST NOT 在没有 MSL datum 的情况下将其描述为平均海平面绝对海拔。

#### Scenario: 云体高度以米存储
- **WHEN** 云体 `base=1000`、`thickness=800`
- **THEN** 该云体 SHALL 表示场景地面基准上方 1000–1800 m 的垂直区间

#### Scenario: 水平范围以米存储
- **WHEN** circle 云体 bounds 的半径为 `4000`
- **THEN** CPU 模型与 scenario v2 SHALL 将其解释为 4000 m，而非 4000 render world units

### Requirement: 显式渲染空间映射
系统 SHALL 提供 `verticalMetersPerWorldUnit` 与 `horizontalMetersPerWorldUnit`，并通过集中换算 API 将米制数据映射为紧凑 render world units。GPU body buffer、天气图、gizmo、线框、坐标轴几何与相机 framing SHALL 使用同一映射；shader MUST NOT 对已经转换的 placement 再次缩放。

#### Scenario: 默认 12 km 层顶保持紧凑
- **WHEN** `cloudHeight=12000` 且 `verticalMetersPerWorldUnit=1000`
- **THEN** GPU/raymarch 使用的盒体顶高 SHALL 为 12 render world units

#### Scenario: 比例改变保持物理数据不变
- **WHEN** 用户修改 `verticalMetersPerWorldUnit` 而云体米制参数不变
- **THEN** CPU 与导出的 scenario 物理高度 SHALL 不变，渲染几何 SHALL 按新比例重新映射且只缩放一次

### Requirement: 场景尺寸链一致
`cloudHeight` SHALL 表示场景地面基准至场景层顶的米制距离，`boxHalfExtent` SHALL 表示水平半宽的米制距离。线框、坐标轴、天气图、密度缓存覆盖范围、相机裁剪面与 raymarch 包围盒 SHALL 从转换后的同一场景边界派生。

#### Scenario: 修改层顶同步更新依赖
- **WHEN** 修改 `cloudHeight` 或垂直换算比例
- **THEN** 线框 Y 顶、坐标轴、相机 framing、密度缓存映射和 raymarch Y 上界 SHALL 同步更新

#### Scenario: 默认场景可被相机完整取景
- **WHEN** 使用默认 12000 m 层顶、16000 m 水平半宽和 1000 m/world-unit 比例
- **THEN** 默认相机 SHALL 能取景主要云层，near/far SHALL 覆盖转换后的盒体且 cached 模式不因 12000 数值直接放大而退化

