## Why

当前密度场全局统一：`cloudDensity()` 在固定 box 内用单组全局 `coverage/type/density` 求值，无法「在某区域放某种云、区域外晴空」。roadmap 阶段 4 要求密度场按位置查询「这里有没有云、是什么云、多浓」，这是空间控制的地基，也是阶段 5（生命周期）写入、阶段 6（时间轴）编排的载体。

## What Changes

- 新增 `src/weather.ts`：CPU 生成 **天气图纹理** `weatherMap`（2D，覆盖 box XZ 平面，256×256 `rgba8unorm`），`device.queue.writeTexture` 上传。通道约定：R=coverage（局部覆盖度）、G=cloudType（量化到预设索引）、B=densityScale（局部浓度乘子，供阶段 5 写入）、A=区域 id / 备用。
- `src/renderer.ts`：创建 `weatherMap` 纹理 + sampler，扩展 compute bind group layout（现 `computeBindGroup` 于 `@group(0)` 仅绑 `params`，需新增 binding 绑天气图与 sampler）。
- `shaders/cloud.wgsl` 的 `cloudDensity()`：用平流后 `objPos.xz` 归一化采样 `weatherMap`，取局部 `coverage/type/densityScale` 覆盖全局值。
- type 索引 → 在 shader 内对 2~3 个候选预设参数做 `mix`（避免分支爆炸）；预设参数数组由 `src/params.ts` 打包为 uniform 数组（复用 `CLOUD_PRESETS`/`packParams`）。
- `src/weather.ts` 提供 `Region` API：`{ shape: rect|circle, bounds, type, coverage }` → 软笔刷（带边缘羽化 `feather`）绘制进 `weatherMap`；GUI 区域控件经 hooks 注入 `src/gui.ts`。

## Capabilities

### New Capabilities
- `cloud-weather`: 天气图空间控制——密度场按 XZ 位置从 `weatherMap` 查询局部 coverage/type/densityScale 覆盖全局值，区域外晴空、边缘羽化过渡；Region API 以软笔刷把矩形/圆形区域写入天气图。

### Modified Capabilities
- `cloud-params`: 新增「预设参数数组 uniform」契约——`CLOUD_PRESETS` 形态字段打包为 shader 可索引的 uniform 数组，供天气图 type 索引在候选预设间 `mix`。

## Impact

- 新增 `src/weather.ts`：`weatherMap` 生成/写入、`Region` 类型与软笔刷绘制 API。
- `src/renderer.ts`：新建 `weatherMap` 纹理 + sampler；compute bind group layout 新增天气图绑定；`weatherMap` 更新时重写纹理。
- `src/params.ts`：`CLOUD_PRESETS` 形态字段打包为 uniform 预设数组（新增打包路径/偏移），扩展 `PARAMS_*` 或独立 buffer。
- `shaders/cloud.wgsl`：声明 `weatherMap` 纹理/sampler 绑定；`cloudDensity()` 采样天气图取局部值、按 type 索引 `mix` 预设参数。
- `src/gui.ts`：区域控件（shape/bounds/type/coverage/feather）经 hooks 注入。
- 依赖：阶段 1 `cloud-params`、阶段 2 `cloud-presets`、阶段 3 `cloud-wind`（平流坐标）均已归档。
- 不影响：相机、render bind group（`@group(1)` 采样、`@group(2)` 存储）、生命周期（阶段 5，本阶段仅预留 B 通道）。
- 验收基线：矩形区域 A 只生成 cumulus、圆形区域 B 生成 cirrus，区域外晴空，区域边缘自然过渡。
