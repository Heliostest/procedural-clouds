## ADDED Requirements

### Requirement: 预设形态参数 uniform 数组
CPU 端 SHALL 把 `CLOUD_PRESETS` 的形态字段按预设顺序打包为着色器可索引的 uniform 数组，使 `cloudDensity()` 能按运行时类型索引取得任一预设的形态参数。该数组 MUST 按 std140 对齐打包，且字段到偏移的映射 MUST 集中定义为单一事实来源。

#### Scenario: 按索引取预设形态
- **WHEN** 着色器以整数索引访问预设数组
- **THEN** 返回的形态参数 SHALL 与 `CLOUD_PRESETS` 中对应预设的字段值一致

#### Scenario: 静态上传一次
- **WHEN** 预设表内容在运行期不变
- **THEN** 预设 uniform 数组 SHALL 仅初始化时上传一次，无需逐帧重写
