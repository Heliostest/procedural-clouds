## Why

阶段 4 落地后发现两个问题：(1) 天气图查询用平流后坐标，区域随风无限漂移、飘出有限天气图纹理后被 clamp 到边缘的零覆盖，导致整盒云逐渐消失；(2) 天气图始终生效，无法回退到阶段 3 的全局整片云，不便对比与调试。

## What Changes

- 天气图查询改用**未平流**的世界水平坐标，区域锚定在 box 固定位置；平流仅驱动云内部细节，不再搬动区域，长时间运行不消失。
- `RenderParams` 新增 `weatherEnabled` 开关：开启时按天气图分区域渲染；关闭时忽略天气图，全盒按全局 `coverage` 与当前预设/`CloudShape` 渲染。
- GUI Weather Regions 分组新增 `Enable Regions` 开关。

## Capabilities

### Modified Capabilities
- `cloud-weather`: 天气图查询锚定世界空间（区域不随风漂移）；新增天气图启用开关，可关闭分区域回退全局渲染。

## Impact

- `shaders/cloud.wgsl`：`cloudDensity()` 天气图采样改用 `objPosRaw.xy`；`RenderParams._pad0`→`weatherEnabled`，按开关分支（关闭走全局 `params.shape`）。
- `src/params.ts`：`PARAM_OFFSETS.weatherEnabled=6`；`CloudParams.weatherEnabled` 默认 true。
- `src/renderer.ts`：`buildParams` 写 `weatherEnabled`。
- `src/gui.ts`：Weather Regions 增 `Enable Regions` 开关。
- 不影响：Region API、预设数组、bind group layout。
