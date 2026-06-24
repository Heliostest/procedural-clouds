## Why

阶段 1~7 后，系统里并存三套割裂的概念：**固定层**（low/mid/high，阶段 7）、**天气区域 A/B**（阶段 4，挂 lifecycle）、**全局 Shape 手动面板**（阶段 1/2）。三者各自用不同数据结构与 UI 表达「一团云」，互相拼接困难：层是固定的、区域只能贴在某层、演化只能挂在区域、scenario 只驱动区域覆盖度。用户无法像摆放物件一样「新增一团云、设它的高度/范围/类型/演化、再删掉」。

本提案把这三套概念合并为单一抽象 **CloudBody（云体）**：每个云体自带横向范围、垂直位置、云属、强度、风与演化，UI 可自由增删改，scenario 直接驱动云体。固定层被「云体的垂直位置」泛化取代（不再有层数上限语义），区域与层合一。

## What Changes

- 新增 `src/body.ts`：`CloudBody` 类型 + `BodyStore`（`add`/`remove`/`update`/`list` 增删改）+ 默认预置云体集。
- `CloudBody` 统一字段：`shape/bounds/feather`（横向）、`base/thickness`（垂直）、`type`（云属预设）、`coverage/densityScale`（强度）、`wind{dirDeg,speed,morphRate}`（每体风）、`lifecycle?`（每体演化包络）。
- GPU 表达从「固定层数组 + 多通道天气图」改为「**每体一张归一化形状图**（`texture_2d_array`，r8unorm，仅存羽化轮廓）+ **per-body uniform 标量数组**（type/coverage/densityScale/morph/band/wind/enabled）」，上限 `MAX_BODIES`，配 `activeBodyCount`。
- `shaders/cloud.wgsl` 的 `cloudDensity()` 遍历活跃云体：采样该体形状图得 alpha → 乘 `coverage` → band 垂直门控 → 该体 wind 平流 → `presetShape(type)` → 累加。
- 演化（lifecycle）与 scenario 调制只改 per-body **uniform 标量**（每帧廉价更新），仅在云体几何变化时才重绘形状图——比现状「每帧重绘整张天气图」更省。
- `src/scenario.ts`：`Scenario.regions` 升级为 `bodies`，`events` 的 `regionId→bodyId`，可驱动 `coverage/densityScale/type/base/thickness/windDeg/windSpeed`；`ScenarioPlayer` 直接产出 `CloudBody[]`。向后兼容旧 `regions` JSON。
- `src/gui.ts`：云体列表面板（Add rect / Add circle / Remove + 每体折叠编辑全部字段 + 选中线框高亮）。彻底移除固定层面板与区域 A/B 面板与全局 Shape 手动面板。
- 彻底替换阶段 7 的 `extraLayers` / 固定层结构与阶段 4 的 `WeatherConfig` A/B 模型。

## Capabilities

### New Capabilities
- `cloud-body`: 统一云体——以可增删改的 `CloudBody` 列表描述天空中每一团云的横向范围、垂直位置、云属、强度、风与演化；`cloudDensity()` 遍历活跃云体累加；手动 UI 与 scenario 共用同一模型。

### Modified Capabilities
- `cloud-scenario`: 场景数据模型 SHALL 以 `bodies`（云体定义集）取代 `regions`，事件 SHALL 可驱动云体的覆盖度/浓度/类型/高度/厚度/风；解析 SHALL 向后兼容旧 `regions` JSON。

## Impact

- 新增 `src/body.ts`：`CloudBody`/`BodyStore`/默认预置/`evalBodyMod`（复用 lifecycle 求值）。
- `src/params.ts`：uniform 布局改为 globals + `array<BodyGPU, MAX_BODIES>` + `activeBodyCount`；移除 `extraLayers`/固定层偏移。
- `shaders/cloud.wgsl`：`Params` 含云体数组；`cloudDensity()` 遍历云体；`weatherTex` 改 r8unorm 形状数组，按体采样。
- `src/weather.ts`：从「区域→多通道天气图」重构为「云体→归一化形状图层」（`paintBodyShapes`）；移除 `WeatherConfig`/`buildRegions`。
- `src/renderer.ts`：`setBodies(bodies)`（重绘变化的形状层 + 写几何/风 uniform）+ 每帧 `updateBodyIntensity(mods)`（仅写标量 uniform）；线框按云体的 band 高度绘制。
- `src/scenario.ts`：`Scenario.bodies` + 事件扩展 + 兼容旧 `regions`。
- `src/gui.ts`：云体列表增删改 UI，移除旧三套面板。
- `src/main.ts`：装配 `BodyStore`；手动模式与 scenario 模式都输出 `CloudBody[]` 给 renderer。
- 取代阶段 4（cloud-weather 区域）与阶段 7（cloud-layers 固定层）的对外模型；底层纹理/平流/包络机制复用。
- 向后兼容：旧 scenario JSON（`regions`）仍可加载；新建工程默认预置 3~4 个示例云体，画面有内容。
- 验收基线：可通过 UI 新增一团指定高度/范围/类型/演化的云、修改其参数、删除它；并能用 scenario 脚本自动播放多团云体的生成—漂移—消散。
