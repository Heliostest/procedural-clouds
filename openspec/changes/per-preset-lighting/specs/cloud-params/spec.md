## MODIFIED Requirements

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
