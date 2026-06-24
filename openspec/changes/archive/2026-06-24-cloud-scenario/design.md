## Context

阶段 5 后，`main.ts` 帧循环从 GUI `WeatherConfig` 经 `buildRegions` 得固定 A/B 两 `Region`，每区域可挂一条五段 `LifecycleEnvelope`，`evalRegionMod` 每帧求 `{coverageMul, densityScale, morph}`，`renderer.setRegions(regions, mods)` 重绘天气图。风来自 `params.windDeg/windSpeed`，`timeline = {scrub, time}` 已可手动预览。`Region`/`RegionMod` 结构通用（`paintRegions` 接受任意数量区域）。

阶段 6 要把「手动拼装 + 固定包络」升级为「数据驱动 + 任意关键帧」，并加播放控制与 JSON 持久化。

## Goals / Non-Goals

**Goals:**
- 一份 `Scenario` JSON 完整描述 duration/wind/regions/events。
- `ScenarioPlayer` 按 sceneTime 插值事件，产出 `Region[]` + `RegionMod[]` + wind。
- 播放/暂停/倍速/scrub；JSON 加载/导出。
- 未启用场景时与现状一致。

**Non-Goals:**
- 不做多高度层（阶段 7）。
- 不做关键帧的可视化曲线编辑器（仅 JSON + 基础 GUI）。
- 不强制替换 `LifecycleEnvelope`——手动模式仍用它；场景模式用事件关键帧。

## Decisions

### D1：Scenario 数据模型
```ts
interface ScenarioRegion { shape: 'rect'|'circle'; bounds: number[]; type: string; feather: number; }
interface ScenarioEvent { t: number; regionId: string; coverage?: number; densityScale?: number; type?: string; ease?: 'linear'|'smooth'; }
interface Scenario { duration: number; wind: { dirDeg: number; speed: number }; regions: Record<string, ScenarioRegion>; events: ScenarioEvent[]; }
```
事件按 `regionId` 分组、按 `t` 排序。区域几何（shape/bounds/feather）取自 `regions`；`type/coverage/densityScale` 随事件随时间变化。

- 备选：把 wind 也做成事件。否决——本阶段 wind 用单一线性段（起止）已够；逐事件 wind 留待扩展。当前 `wind` 取常量（可后续升级为关键帧）。

### D2：ScenarioPlayer 插值
对每个区域，在其事件序列里按 sceneTime 找到前后两关键帧，对 `coverage`/`densityScale` 按 `ease` 插值（linear 或 smoothstep）；`type` 取「前一关键帧」的离散值（不插值类型，避免形态突变）或在 type 改变时按 ease 交叉淡化覆盖度。第一个事件前用首帧值、最后事件后用末帧值（coverage 末帧通常为 0 = 消散）。

输出：`Region[]`（geometry + 当前 type/coverage）与 `RegionMod[]`（coverageMul=1，densityScale=插值，morph 可选由 coverage 斜率推断或置 0）。

- 决策：player 直接产出最终 coverage（写入 Region.coverage）与 densityScale（写入 mod），不复用 `LifecycleEnvelope`。事件关键帧比五段包络更通用。
- morph：本阶段置 0（形态微变留手动 morphStrength），避免与事件语义纠缠。

### D3：与手动模式的切换
`scenarioEnabled` 开关。启用时：帧循环调 `player.sample(sceneTime)` → `renderer.setRegions(regions, mods)`，并把 `wind.dirDeg/speed` 写入 `params.windDeg/windSpeed`（GUI wind 控件随之刷新或只读）。禁用时：走现有 `buildRegions`/lifecycle 路径。

- sceneTime 来源：复用 `timeline`。新增 `playing`（播放/暂停）与 `speed`（倍速）。非 scrub 时 `sceneTime += deltaTime * speed`（受 duration 截断或循环）。scrub 时直接用 `timeline.time`。

### D4：播放时钟
新增播放时钟 `playhead`：`playing` 时每帧 `playhead = min(duration, playhead + deltaTime*speed)`（或 `% duration` 循环，由 `loop` 决定）；scrub 时 `playhead = timeline.time`。sceneTime = playhead。与阶段 5 的 `timeBase`/自由累加解耦：场景模式有独立 playhead。

### D5：JSON 加载/导出
`parseScenario(json)` 校验必填字段并归一化（排序事件、补默认 ease）；`serializeScenario(s)` 输出格式化 JSON。GUI：加载用 `<input type=file>` 或粘贴文本；导出触发浏览器下载 / 复制到剪贴板。内置 `DEMO_SCENARIO` 常量供一键加载。

- 校验失败：保留当前场景、控制台报错、GUI 提示（不崩溃）。

## Risks / Trade-offs

- [事件插值在 type 切换处形态突变] → type 不插值、用覆盖度交叉淡化；或限制同区域 type 不中途改变（文档约定）。
- [逐帧整图重绘开销随区域数增加] → 复用阶段 5 的「调制变化阈值跳过重绘」；区域数通常个位数。
- [场景模式与 GUI 手动控件冲突] → 启用场景时 wind/region 控件标记为被接管（禁用或只读）；切回手动恢复。
- [JSON 结构演进破坏旧文件] → `parseScenario` 容错 + 版本字段（可选 `version`）。

## Open Questions

- 是否支持循环播放（loop）？倾向加 `loop` 开关，默认 false（播完停在末态）。
- wind 是否升级为关键帧事件？本阶段保持单段；若需阵风留作后续。
- type 中途切换的处理：禁止 vs 交叉淡化？倾向先禁止（同区域单一 type），简单可靠。
