## Why

当前 `cloud.wgsl` 的 `Params` 是 6×vec4f 的紧凑打包（`time_pack`/`alt_pack`/…），`main.js` 用 `buildParams()` 按魔法索引手填 `paramsData[0..23]`，字段含义只能靠注释对照，极易错位。roadmap 阶段 2-6（云属预设、风、天气图、生命周期、时间轴）都要持续扩展 uniform，继续用魔法索引会让后续每次扩展都成为高风险改动。此次先把参数层重构为可维护、可按名读写的结构，作为后续所有阶段的地基。

## What Changes

- 将 `cloud.wgsl` 的单一 `Params` 拆分为分组 struct：`RenderParams`（步数/光照/缓存混合）、`CloudShape`（密度场形态量）、`Wind`、`SceneTime`，并通过一个顶层 `Params` 聚合（保持单一 uniform binding，不动 bind group 布局）。
- 用显式的、按字段命名的 writer 替换 `main.js` 的 `buildParams()` 魔法索引；封装 `packParams(views)`，每个字段写入有名字、有偏移定义，消除裸 `paramsData[n] = ...`。
- 新增 `SceneTime { sceneTime, deltaTime }`，与现有作为噪声 W 轴的 `time_pack` 时间区分开（本阶段仅引入字段并填充，不改变密度采样行为）。
- 保持 ping-pong 缓存、compute/render 管线、绑定组结构完全不变，仅替换 uniform 内存布局与打包方式。

## Capabilities

### New Capabilities
- `cloud-params`: 云渲染参数的 uniform 数据契约——分组结构定义、CPU 端按名打包、字段语义与 GPU 布局对齐规则，以及 `SceneTime` 时间基。

### Modified Capabilities
<!-- 无既有 spec，留空 -->

## Impact

- `shaders/cloud.wgsl`：`Params` 结构定义与所有 `params.*_pack.*` 读取点（约 15 处）。
- `main.js`：`paramsBuffer` 分配（大小/对齐）、`buildParams()` → `packParams()`、`paramsData` 预分配 buffer、frame 循环中的写入调用。
- 不影响：相机 uniform、密度缓存纹理、bind group layout、GUI 控件集合（数值与控件保持一致）。
- 验收基线：重构后画面与重构前像素级一致（同参数、同相机），参数可按名读写。
