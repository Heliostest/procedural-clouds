## 1. 参数扩展（src/params.ts）

- [x] 1.1 `CloudParams`/`createDefaultParams` 增 `bloomEnabled`、`bloomThreshold`、`bloomAmount`（默认关闭/阈值 1.0/强度 0.5）
- [x] 1.2 `PARAM_OFFSETS` 增对应字段；post uniform buffer 扩展并保持 16 字节对齐
- [x] 1.3 帧循环写入 post uniform（与 `godrayStrength`/`exposure` 同级）

## 2. Bloom 渲染 pass（src/renderer.ts）

- [x] 2.1 增半分辨率 Bloom 中间纹理链（`rgba16float`，约 5 级）
- [x] 2.2 实现 Extract pass：对 TAA 输出取 luminance，超阈值部分写入半分辨率 RT
- [x] 2.3 实现 Downsample chain：Jimenez 13-tap 逐级降采样
- [x] 2.4 实现 Upsample chain：tent filter 上采样并逐级累加（dual filter）
- [x] 2.5 `bloomEnabled=false` 时跳过全部 Bloom pass

## 3. fsPost 合成（src/renderer.ts）

- [x] 3.1 调整 `fsPost` 顺序：`col *= exposure` → 叠加 Bloom → God rays → tonemap → gamma
- [x] 3.2 Bloom 纹理绑定至 post bind group；`debugView` 激活时旁路 Bloom（与 godray 一致）
- [x] 3.3 resize 时重建 Bloom 纹理链

## 4. GUI 与 i18n

- [x] 4.1 `src/i18n.ts` 增 Bloom 开关/阈值/强度标签与 tooltip
- [x] 4.2 `src/gui.ts` 后处理文件夹：Bloom 开关 + `bloomThreshold`(0–3) + `bloomAmount`(0–2)

## 5. 验收

- [x] 5.1 `npm run build` 通过
- [x] 5.2 默认关闭时画面与引入前一致
- [x] 5.3 启用 Bloom：太阳与受光云缘柔和光晕，无方向条纹，主体不糊
- [x] 5.4 `openspec validate add-bloom --strict` 通过
