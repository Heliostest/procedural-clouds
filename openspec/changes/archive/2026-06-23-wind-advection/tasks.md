## 1. Wind 结构扩展与偏移

- [x] 1.1 `shaders/cloud.wgsl` 的 `Wind` 追加 `dir: vec3f` 与 `morphRate: f32`，按 std140 重排 padding（vec3 16 字节对齐）
- [x] 1.2 同步后续 `SceneTime` 子结构偏移（后移到 idx 32）并标注新字节偏移
- [x] 1.3 `main.js` 扩展 `PARAM_OFFSETS` 新增 `windDir`(24)/`windSpeed`(27)/`morphRate`(28)，`PARAMS_FLOAT_COUNT` 36→40
- [x] 1.4 逐字段核对 WGSL 偏移与 `PARAM_OFFSETS` 一致

## 2. 平流与形变解耦

- [x] 2.1 `cloudDensity()`：`advect = wind.dir * wind.speed * sceneTime`，对 `objPos` 做减法偏移后再除以各 scale 采样
- [x] 2.2 W 轴时间改用 `morphRate * sceneTime`（CPU 侧 `morphTime` 传入），从 `speed` 解耦
- [x] 2.3 程序噪声场无界，平流即沿无限域偏移采样，box 始终满覆盖（无空区/无接缝），无需 `fract` 环绕
- [x] 2.4 `wind.speed=0` 时无位移，`morphRate=0` 时无形变

## 3. CPU 端与 GUI

- [x] 3.1 `buildParams` 由 `windDeg` 算归一化 `windDir`、写 `morphRate`；shader 用 `sceneTime` 计算平流
- [x] 3.2 缓存时间基改用 `elapsed`（实时），与形变 `morphTime` 解耦，morphRate=0 时 cacheBlend 不跳变
- [x] 3.3 GUI 新增 Wind 分组：方位角(0–360°)、风速、形变速率，替换原单一 `windSpeed`
- [x] 3.4 `params` 默认 windDeg=45 / windSpeed=0.15 / morphRate=0.05

## 4. 验收

- [x] 4.1 `vite build` 通过
- [x] 4.2 设非零风向/风速：云团整体沿风向水平漂移
- [x] 4.3 形变速率独立调节，边缘细节缓慢演化、不整体闪烁
- [x] 4.4 长时间运行无空区/硬接缝（无界程序场保证）
- [x] 4.5 `openspec validate wind-advection --strict` 通过
