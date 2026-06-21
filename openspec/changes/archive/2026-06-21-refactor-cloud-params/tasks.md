## 1. WGSL 结构重构

- [x] 1.1 在 `shaders/cloud.wgsl` 定义 `RenderParams`（rayMarchSteps, lightMarchSteps, shadowDarkness, sunIntensity, skipLight, cacheBlend）
- [x] 1.2 定义 `CloudShape`（density, coverage/factorMacro, altitude, scale, detail, lowAltDensity, factorShaper, factorDetail, cloudHeight）
- [x] 1.3 定义 `Wind`（speed，预留 dir/morphRate 槽位）
- [x] 1.4 定义 `SceneTime`（sceneTime, deltaTime, noiseTime；保留 timeVoronoi1/2 形变时间）
- [x] 1.5 定义顶层 `Params { render, shape, wind, time }`，仍绑定 `@group(0) @binding(1)`，按 std140 对齐排布并标注每字段字节偏移
- [x] 1.6 替换 `cloudDensity()`/`shadowMarch()`/`fs()`/`cs()` 中全部 `params.*_pack.*` 读取为命名字段访问

## 2. CPU 端打包重构

- [x] 2.1 在 `main.js` 定义字段→f32 偏移映射表（与 WGSL 结构逐字节对应，含 pad 槽位）
- [x] 2.2 实现 `packParams(values)`：按映射表写入预分配 `Float32Array`，bool 编码为 0/1
- [x] 2.3 用结构推导的字节数替换硬编码的 `paramsBuffer.size = 96` 与 `new Float32Array(24)`
- [x] 2.4 frame 循环填充 `sceneTime`/`deltaTime`（真实流逝时间）、`noiseTime`（windSpeed 推进），调用 `packParams` 替换 `buildParams`
- [x] 2.5 删除旧 `buildParams()` 魔法索引实现

## 3. 验收

- [x] 3.1 逐字段核对 WGSL 偏移与 JS 偏移表一致
- [ ] 3.2 同参数同机位运行，确认画面与重构前一致、无错位/闪烁
- [x] 3.3 确认 GUI 控件、缓存 ping-pong、bind group layout 均未改变
- [x] 3.4 `openspec validate refactor-cloud-params --strict` 通过
