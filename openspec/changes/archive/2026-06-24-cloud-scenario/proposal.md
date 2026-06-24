## Why

阶段 1~5 已具备：参数结构、云属预设、风平流、空间天气图、生命周期包络与形态微变。但这些能力目前靠 GUI 手动拼装（固定 A/B 两区域 + 每区域一条五段包络），无法「用一份数据描述一整段演化、按指定时间自动播放」。roadmap 阶段 6 要求把前述能力用数据驱动串起来：加载一个脚本即可自动播放「积云生成 → 增厚 → 被风吹过 → 消散」。这是满足「指定时间」唯象需求的最后一环。

## What Changes

- 新增 `src/scenario.ts`：定义 `Scenario` 类型（TS interface）与 JSON 结构 `{ duration, wind, regions, events }`；`regions` 为 `id → { shape, bounds, type, feather }` 字典，`events` 为 `{ t, regionId, coverage?, densityScale?, type?, ease? }` 关键帧数组。
- `src/scenario.ts` 的 `ScenarioPlayer`：按 `sceneTime` 对每个区域在相邻事件关键帧间插值（`ease: linear|smooth`），输出当前帧的 `Region[]` + 每区域调制值 `RegionMod[]` + 当前 `wind`。
- `src/main.ts`：场景激活时由 `ScenarioPlayer` 驱动 `renderer.setRegions(...)` 与风参数，覆盖 GUI 手动 `WeatherConfig` 路径；未激活时维持现状。
- `src/gui.ts`：时间轴控件——播放/暂停、倍速、scrubber（复用现有 `timeline`，扩展为可拖动预览任意时刻）、加载/导出 Scenario JSON。
- 提供一个内置示例 Scenario（积云生成→增厚→吹过→消散）便于一键演示。

## Capabilities

### New Capabilities
- `cloud-scenario`: 场景编排——以 `Scenario` 数据（duration/wind/regions/events）描述一整段云演化，`ScenarioPlayer` 按 `sceneTime` 插值事件关键帧驱动天气图与风，支持播放/暂停/倍速/scrub 与 JSON 加载/导出。

### Modified Capabilities
- `cloud-weather`: 天气图区域集合 SHALL 可由场景播放器提供（任意数量区域 + 每区域逐帧调制），不再限于 GUI 固定的 A/B 两区域。
- `cloud-wind`: 风向/风速 SHALL 可由场景时间轴驱动，随播放进度变化。

## Impact

- 新增 `src/scenario.ts`：`Scenario`/`ScenarioEvent`/`ScenarioRegion` 类型、`ScenarioPlayer`（插值求值）、`parseScenario`/`serializeScenario`、内置示例。
- `src/main.ts`：帧循环按场景状态分支——场景模式用 player 输出驱动 `setRegions` 与 `params.windDeg/windSpeed`；手动模式不变。
- `src/gui.ts`：Scenario 文件夹（播放/暂停/倍速/scrub/加载/导出 + 启用开关）。
- `src/weather.ts`：`Region`/`RegionMod` 复用（player 直接产出，无需改结构）。
- 依赖：`cloud-weather`、`cloud-lifecycle`、`cloud-wind`（均已归档）。
- 向后兼容：场景未启用时画面与现状一致；启用后接管区域与风。
- 验收基线：加载一个脚本即可自动播放「积云生成→增厚→被风吹过→消散」整段演化。
