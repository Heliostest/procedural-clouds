## 1. 参数扩展（src/params.ts + shaders/cloud.wgsl）
- [x] 1.1 `Globals` 增 `qualityMode`/`detailFreq`/`detailStrength`，`PARAM_OFFSETS` 与 WGSL `Globals` struct 同步，更新 `BODY_BASE` 与 std140 对齐
- [x] 1.2 `CloudParams`/`createDefaultParams` 增字段（默认 `qualityMode=0`/`detailFreq=2.5`/`detailStrength=0`）
- [x] 1.3 `buildParams` 经 `packParams` 写入新字段，无裸下标

## 2. 取样分发器（shaders/cloud.wgsl）
- [x] 2.1 新增 `densityAt(pos)`：按 `qualityMode` 分发 cached/hybrid/realtime
- [x] 2.2 新增高频 detail 叠加（复用现有 noise，按 `detailFreq`/`detailStrength`），仅在 base>0.01 处叠加
- [x] 2.3 `fs` 主 raymarch 与 `lightMarch` 改用 `densityAt`

## 3. 缓存旁路（src/renderer.ts）
- [x] 3.1 `qualityMode==2` 时跳过密度缓存 compute pass

## 4. GUI（src/gui.ts）
- [x] 4.1 Render 文件夹新增 Quality Mode 下拉（Cached/Hybrid/Realtime）与 Detail Freq/Strength 控件

## 5. 验收
- [x] 5.1 `vite build` 通过
- [ ] 5.2 `qualityMode=0` 与引入前画面一致（无突变）
- [ ] 5.3 切到 Realtime → 边缘/细丝明显变锐，调 `cacheResolution` 不再影响清晰度
- [ ] 5.4 切到 Hybrid 且 `detailStrength>0` → 边缘可见增锐，性能优于 Realtime
- [x] 5.5 `openspec validate realtime-density-quality --strict` 通过
