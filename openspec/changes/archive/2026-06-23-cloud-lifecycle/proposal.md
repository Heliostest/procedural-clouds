## Why

阶段 4 已让密度场按 XZ 位置从 `weatherMap` 查询局部 `coverage/type/densityScale`，但天气图为静态：`paintRegions` 把 B 通道（densityScale）恒写 255（=1.0），R 通道（coverage）也只取区域固定值。roadmap 阶段 5 要求「每个区域随时间有一条密度曲线」——能在指定时刻凭空出现、增厚到最浓、再缓慢变淡直到消失。这是把空间分布升级为「会演化的天气」的关键一步，也是阶段 6 时间轴编排逐事件驱动的运行时基础。

## What Changes

- 新增 `src/lifecycle.ts`：定义生命周期包络 `envelope(t) → phase ∈ [0,1]`，按关键帧分段 `birth → grow → mature → decay → death`（线性或 smoothstep 插值），并提供按 `sceneTime` 求各区域当前 `phase` 与目标 `densityScale`/`coverage` 的求值器。
- 每个 `Region` 可附带生命周期配置 `{ birth, grow, mature, decay, death, peakDensity }`（绝对秒，相对 `sceneTime`）；无配置者按现状恒定（向后兼容）。
- `src/main.ts` 帧循环按 `elapsed`（现有 sceneTime 基）求各区域 phase → 调 `src/weather.ts` 重绘天气图：phase 调制 R 通道 coverage（出现/消失的淡入淡出）与 B 通道 densityScale（加重/减淡）。
- 出现 = phase 0→1 时 coverage 与 densityScale 淡入；消失 = 1→0 淡出，末态 coverage=0（晴空）。加重/减淡 = 调 mature 段目标 densityScale。
- `src/gui.ts`：经 hooks 注入生命周期控件（各关键帧时刻、peakDensity、启用开关），可手动 scrub `sceneTime` 预览。
- （可选）形态随阶段微变留待 shader 微调：grow 段 `detailStrength` 渐增、decay 段边缘侵蚀增强；本阶段仅在 `cloud-lifecycle` 规格中标注为可选场景，不作硬性验收。

## Capabilities

### New Capabilities
- `cloud-lifecycle`: 生命周期包络——为区域提供随 `sceneTime` 的分段密度曲线（birth/grow/mature/decay/death），逐帧求 phase 并调制天气图的 coverage 与 densityScale，实现云团的出现、增厚、减淡、消失。

### Modified Capabilities
- `cloud-weather`: `weatherMap` 由静态升级为可随时间重绘——B 通道 densityScale 与 R 通道 coverage 不再恒定，可由生命周期逐帧写入；区域绘制 API 接受可选生命周期配置。

## Impact

- 新增 `src/lifecycle.ts`：包络类型、关键帧求值、phase → coverage/densityScale 映射。
- `src/weather.ts`：`Region` 增可选 `lifecycle` 字段；`paintRegions` 的 B 通道改写为传入 densityScale、R 通道乘以 phase；提供逐帧重绘入口（接受当前 sceneTime 解出的每区域调制值）。
- `src/main.ts`：帧循环求各区域 phase，调 `renderer.setRegions`/天气图重绘（每帧或按变化阈值）。
- `src/renderer.ts`：`setRegions`（`paintRegions` + `writeTexture`）已具备整图重写路径，生命周期复用之逐帧上传。
- `src/gui.ts`：生命周期控件经 hooks 注入。
- 依赖：阶段 4 `cloud-weather`（已归档）。不影响相机、风（阶段 3）、预设（阶段 2）。
- 验收基线：一团云能在指定时刻凭空出现、约 30s 内增厚到最浓、之后缓慢变淡直到消失。
