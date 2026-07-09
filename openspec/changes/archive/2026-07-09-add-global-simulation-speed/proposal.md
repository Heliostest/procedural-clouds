# Change: 增加全局运行/仿真速度档位

## Why

当前只有 scenario 模式提供 `0.1–8.0` 的局部播放倍速；手动模式的云体生命周期、风平流和形变始终按真实时间推进。因此用户无法用一个控制统一暂停或加速整个仿真，也容易把 scenario 倍速误认为全局速度。

本变更建立单一的 CPU 侧仿真时间倍率，提供 `0×`、`1×`、`2×`、`4×` 四个离散档位，并让手动与 scenario 模式共享相同语义。

## What Changes

- 在全局 GUI 增加类似游戏速度栏的横向 `0× / 1× / 2× / 4×` 四按钮组，当前档位高亮，默认 `1×`。
- 用单一 `simulationRate` 缩放后续帧的仿真增量；手动时钟、生命周期、每体物理风累计位移、噪声形变时间和 scenario 播放头统一响应。
- `0×` 冻结仿真状态，但不停止渲染循环、相机、GUI、性能统计、TAA 帧序列或纯渲染过渡。
- 将现有 scenario 专用连续 `speed` 滑块收敛到全局离散倍率，避免两个倍率相乘造成语义不清。
- 删除原「暂停动画」checkbox；手动模式统一用 `0×` 冻结。保留 scenario 播放/暂停、scrub、loop、重置时间和重置平流；倍率不写入 scenario JSON。
- 倍率切换只影响未来时间增量，不重算历史平流，不产生位置跳变，也不补算 `0×` 期间的 wall-clock 时间。

## Non-Goals

- 改变浏览器 requestAnimationFrame、FPS 上限、GPU 步进数或渲染分辨率。
- 提供负速度、倒放、任意小数倍率、逐云体时间倍率或慢动作插值。
- 将相机操作、GUI 动画、TAA、缓存 cross-fade 等纯渲染行为绑定到仿真倍率。
- 修改 scenario JSON schema 或序列化运行时 UI 偏好。

## Capabilities

### Added Capabilities

- `simulation-time`：定义离散全局倍率、受影响的仿真子系统、0× 语义、渲染时钟隔离和控制交互。

### Modified Capabilities

- `cloud-scenario`：播放头改用全局离散倍率；移除 scenario 专用连续倍速控制，保留播放/暂停、loop 与 scrub。

## Prerequisites and Conflicts

- 与 active change `add-physical-wind-advection` 共享 `src/main.ts`、`src/gui.ts`、`src/i18n.ts` 和 `ScenarioState`。实现 MUST 基于其 `deltaSceneSeconds` 与累计 `WindAdvectionState`，不能恢复 `speed × totalSceneTime` 的旧公式。
- `per-preset-lighting` 不改变 CPU 时钟；本变更不触碰 GPU 参数布局或 WGSL。

## Impact

- **代码**：新增 `src/simulationTime.ts`；修改 `src/main.ts`、`src/gui.ts`、`src/i18n.ts`，并扩展开发期 verification。
- **规格**：新增 `simulation-time`；修改 `cloud-scenario` 的播放控制要求。
- **兼容性**：scenario JSON 无变化；现有运行时 `scenarioState.speed` 为内部字段，可直接迁移为全局 `simulationRate`。
- **默认观感**：`1×` MUST 与当前默认运行速度一致。
- **回退**：移除全局按钮组并固定 `simulationRate=1` 即可恢复持续运行行为。
