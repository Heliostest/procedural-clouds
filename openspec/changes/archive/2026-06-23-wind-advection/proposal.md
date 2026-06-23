## Why

当前 `Wind` 只有 `speed`，且被用作噪声 W 轴时间的倍率（`time = elapsed * windSpeed` → `noiseTime/timeVoronoi1/timeVoronoi2`），只产生**就地形变**，云团整体不位移。roadmap 阶段 3 要求分离「平流位移」与「形变」：云团应沿风向水平漂移，同时边缘细节缓慢演化，而非整体闪烁。

## What Changes

- 扩展 `Wind`：新增 `dir: vec3f`（水平风向，归一化）与 `morphRate: f32`，保留 `speed`。
- `cloudDensity()` 采样坐标做域平流偏移：`objPos_advected = objPos - wind.dir * wind.speed * sceneTime`，密度场各阶段改用平流后坐标采样。
- W 轴形变时间与平流解耦：`noiseTime/timeVoronoi1/timeVoronoi2` 改由 `morphRate * sceneTime` 驱动，不再复用 `speed`。
- 处理包围盒边界：平流坐标用周期性环绕（对采样域 `fract` 重复）避免云飘出 box 后留空，且环绕接缝不产生硬边。
- `main.js`：`PARAM_OFFSETS` 扩展 `windDir`（vec3）/`morphRate`；`buildParams` 写入；按 `sceneTime` 驱动平流与形变；缓存 ping-pong 时间基适配解耦后的形变时间。
- GUI：风向方位角滑杆（0–360°）+ 风速 + 形变速率，替换原单一 `windSpeed`。

## Capabilities

### New Capabilities
- `cloud-wind`: 风的平流位移与形变解耦——风向/风速驱动密度场整体水平漂移，形变速率独立控制边缘演化，平流域用周期环绕处理边界。

### Modified Capabilities
- `cloud-params`: `Wind` 分组扩展暴露 `dir`/`morphRate`，属 spec 级参数契约变更。

## Impact

- `shaders/cloud.wgsl`：`Wind` 结构新增 `dir`/`morphRate`；`cloudDensity()` 用平流坐标 + `fract` 环绕采样；W 轴时间来源改为 `morphRate`。
- `main.js`：`PARAM_OFFSETS`/`PARAMS_FLOAT_COUNT` 调整；`buildParams` 写 `windDir`/`morphRate`；frame 循环用 `sceneTime` 计算平流与形变，缓存混合时间基与形变时间对齐；GUI 风向/风速/形变速率控件。
- 依赖：阶段 1 的 `cloud-params`（已归档）；与阶段 2 `cloud-presets` 并行、不冲突。
- 不影响：相机、bind group layout、天气图/空间控制（阶段 4）、生命周期（阶段 5）。
- 验收基线：云团整体沿风向水平漂移，同时边缘细节缓慢演化，不是整体闪烁。
