## 1. 区域世界空间锚定

- [x] 1.1 `cloudDensity()` 天气图 uv 改用 `objPosRaw.xy`（未平流），区域固定
- [x] 1.2 长时间运行验证云不消失

## 2. 启用开关

- [x] 2.1 `RenderParams._pad0`→`weatherEnabled`；`PARAM_OFFSETS.weatherEnabled=6`
- [x] 2.2 `cloudDensity()` 按 `weatherEnabled` 分支：关闭走全局 `params.shape` + 全局 coverage
- [x] 2.3 `CloudParams.weatherEnabled` 默认 true；`buildParams` 写入
- [x] 2.4 GUI Weather Regions 增 `Enable Regions` 开关

## 3. 验收

- [x] 3.1 `tsc --noEmit` 通过
- [x] 3.2 `vite build` 通过
- [x] 3.3 关闭开关 → 全盒整片云；开启 → 分区域
- [x] 3.4 `openspec validate weather-toggle-anchor --strict` 通过
