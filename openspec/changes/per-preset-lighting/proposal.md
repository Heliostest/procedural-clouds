## Why

`lighting-quality` 已引入 time-of-day、双瓣 HG、silver lining、Beer-powder、暗底亮顶与 God rays，但这些光照量全是**全局**的：`shaders/cloud.wgsl` 的 `fs` 对所有云体用同一组 `silverIntensity/powderStrength/hgForward/hgBackward` 与统一的吸收/暗底逻辑。而 `CLOUD_PRESETS` 只携带**形态**字段，光照不分云属。结果是 cumulus、cirrus、cumulonimbus 仅形状不同，**光的质感一致**——卷云不够通透、积雨云暗底亮顶不够强、积云银边不够。`roadmap-borrow.md` 阶段 A 要求把 `../procedural-clouds-threejs/cloud-types.md` 的每云属光照（吸收/相函数/银边/暗底/SSS）迁移为按云属调制。

关键约束：`fs` 主 raymarch 采样的是密度缓存（仅 `r` 通道存标量密度），着色时**不知道当前样本属于哪个云体/云属**。因此需把「主导云属索引」随密度一起写入缓存的空闲通道，`fs` 据此查预设光照。

## What Changes

- `src/params.ts`：`SHAPE_PRESET_KEYS` 扩展 6 个光照字段 `absorptionCoeff`、`phaseForward`、`phaseBack`、`silverLining`、`baseDarkening`、`sssStrength`，按 `cloud-types.md` 填入 10 云属取值；`packPresetArray()` 与每预设 vec4 槽位（13→19 字段，4→5 个 vec4）同步。
- `shaders/cloud.wgsl`：`PresetShape` 增 `p4`，`Shape13`→`Shape19`，`presetShape()`/`mixShape()` 同步。
- 密度 compute（`cs`）与 `cloudDensity()`：求和各云体密度时记录**主导云体**（贡献密度最大者）的预设索引，写入密度缓存 `g` 通道（realtime 模式同样产出）。
- `fs`：按样本主导云属索引查预设，取 `absorptionCoeff`（消光）、`phaseForward/phaseBack`（每样本双瓣 HG）、`silverLining`、`baseDarkening`、`sssStrength`，替代对应全局常量作为**按云属的调制项**；保留 `lighting-quality` 的全局强度作为总倍率，并新增全局 `typeLightingBlend`（0=回退到全局观感，1=完全按云属，默认 1）。
- `src/gui.ts`：`typeLightingBlend` 控件。

## Capabilities

### Modified Capabilities
- `cloud-params`: 预设 uniform 数组 SHALL 扩展每云属光照字段（吸收/相函数前后向/银边/暗底/SSS），仍由 `packPresetArray` 单一事实来源按 std140 打包。
- `cloud-lighting`: 光照 SHALL 支持按样本主导云属查预设调制吸收、双瓣相函数、银边、暗底与 SSS，并以全局 blend 在「全局观感↔按云属」间插值。
- `cloud-rendering`: 密度缓存 SHALL 在空闲通道附带主导云属索引，使各取样质量模式下 `fs` 能按云属着色。

## Impact

- `src/params.ts`：`SHAPE_PRESET_KEYS`/`ShapePreset`/`CLOUD_PRESETS`/`packPresetArray`/`PRESET_FLOAT_COUNT`；新增全局 `typeLightingBlend`（`PARAM_OFFSETS`/`Globals`/`CloudParams`/`createDefaultParams`，注意 `BODY_BASE` 与 std140 对齐同步）。
- `shaders/cloud.wgsl`：`PresetShape`/`Shape*`/`presetShape`/`mixShape`；`evalBody`/`cloudDensity` 返回主导索引；`cs` 写 `g` 通道；`densityAt`/`sampleDensity` 透出索引；`fs` 散射段按云属调制。
- `src/gui.ts`：blend 控件。
- 向后兼容：`typeLightingBlend=0` 时画面与本变更前一致；密度 `r` 通道不变，cached 模式密度像素级一致。
- 依赖：`lighting-quality` 提供的全局光照字段为本变更前置（建议先归档 `lighting-quality`）。
- 验收：同一光照下 cumulus 亮顶暗底、cirrus 近透明强前向散射、cumulonimbus 强暗底亮顶+银边，肉眼可区分；blend=0 回退一致。
