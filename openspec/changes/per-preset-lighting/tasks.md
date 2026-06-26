## 1. 预设光照字段（src/params.ts）
- [x] 1.1 `SHAPE_PRESET_KEYS`/`ShapePreset` 增 `absorptionCoeff/phaseForward/phaseBack/silverLining/baseDarkening/sssStrength`
- [x] 1.2 `CLOUD_PRESETS` 10 云属按 design D1 填光照取值
- [x] 1.3 `packPresetArray`/`PRESET_FLOAT_COUNT` 扩到每预设 5 个 vec4（p0..p4），std140 对齐
- [x] 1.4 新增全局 `typeLightingBlend`：`PARAM_OFFSETS`/`CloudParams`/`createDefaultParams`（默认 1），复用 `_pad0` 槽位无需改 `BODY_BASE`

## 2. 预设结构与主导索引（shaders/cloud.wgsl）
- [x] 2.1 `PresetShape` 增 `p4`；新增 `Lighting`/`presetLighting`
- [x] 2.2 `Globals` 增 `typeLightingBlend`
- [x] 2.3 `cloudDensityTyped()` 求和时跟踪贡献最大云体，返回 `(density, dominantIndex)`
- [x] 2.4 `cs` 写缓存：`vec4f(d, dominantIndex, 0, 1)`
- [x] 2.5 `densityAtTyped`/`sampleDensityTyped` 透出主导索引（cached 取较密样本的 `g` 并 round，realtime 直取）

## 3. 按云属着色（shaders/cloud.wgsl fs）
- [x] 3.1 吸收：`step_trans = exp(-d*stepSize*mix(1, absorptionCoeff*ABS_K, blend))`，ABS_K=22 使 cumulus 默认≈现观感
- [x] 3.2 每样本双瓣相函数按主导云属 `phaseFwd/phaseBack`，与全局相 `mix(blend)`
- [x] 3.3 银边强度乘预设 `silverLining`（×blend）
- [x] 3.4 暗底幅度由预设 `baseDarkening` 驱动（×blend）
- [x] 3.5 SSS 背光透射项按预设 `sssStrength`

## 4. GUI（src/gui.ts）
- [x] 4.1 光照文件夹增 `typeLightingBlend` 滑杆（0~1）+ i18n `typeLighting`

## 5. 验收
- [x] 5.1 `vite build` 通过
- [ ] 5.2 `typeLightingBlend=0` 画面与本变更前一致（无突变）
- [ ] 5.3 同一光照下 cumulus 亮顶暗底、cirrus 近透明强前向、cumulonimbus 强暗底亮顶+银边，肉眼可辨
- [ ] 5.4 cached 模式密度 `r` 通道像素级一致（仅光质变化）
- [x] 5.5 `openspec validate per-preset-lighting --strict` 通过
