## MODIFIED Requirements

### Requirement: 预设形态参数 uniform 数组
CPU 端 SHALL 把 `CLOUD_PRESETS` 的形态字段按预设顺序打包为着色器可索引的 uniform 数组，使 `cloudDensity()` 能按运行时类型索引取得任一预设的形态参数。该数组 MUST 按 std140 对齐打包，且字段到偏移的映射 MUST 集中定义为单一事实来源。该数组 SHALL 在形态字段之外，额外为每个预设打包**光照字段**，至少包含 `absorptionCoeff`、`phaseForward`、`phaseBack`、`silverLining`、`baseDarkening`、`sssStrength`，以及特效强度 `sunDiscVisible`、`haloEffect`、`internalLightning`，并使着色器能按类型索引取得形态字段 `tileScale`。`sunDiscVisible`/`haloEffect`/`internalLightning`/`tileScale` MUST 分别写入第八个 preset `vec4` 的 `p7.x/y/z/w`。新增或重映射字段 MUST 由同一 `packPresetArray` 单一事实来源写入，MUST NOT 出现裸下标赋值，扩展后每预设 vec4 槽位数与 `PRESET_FLOAT_COUNT` MUST 同步并满足 std140 对齐。

#### Scenario: 按索引取预设形态
- **WHEN** 着色器以整数索引访问预设数组
- **THEN** 返回的形态参数 SHALL 与 `CLOUD_PRESETS` 中对应预设的字段值一致

#### Scenario: 按索引取预设光照
- **WHEN** 着色器以整数索引访问预设数组的光照字段
- **THEN** 返回的吸收/相函数前后向/银边/暗底/SSS SHALL 与 `CLOUD_PRESETS` 中对应预设的光照字段值一致

#### Scenario: 按索引取特效与鱼鳞尺度
- **WHEN** 着色器以整数索引访问预设数组的 `p7` 字段
- **THEN** 返回的 `sunDiscVisible`/`haloEffect`/`internalLightning`/`tileScale` SHALL 与 `CLOUD_PRESETS` 中对应预设一致

#### Scenario: 静态上传一次
- **WHEN** 预设表内容在运行期不变
- **THEN** 预设 uniform 数组 SHALL 仅初始化时上传一次，无需逐帧重写
