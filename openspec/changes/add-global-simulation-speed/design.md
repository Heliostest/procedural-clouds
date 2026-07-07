## Context

当前帧循环同时使用两类时间：

- wall/render time：`performance.now()`、`elapsed`、`frameIndex`，服务于 FPS、相机、TAA、缓存过渡和 GPU 调度；
- simulation time：`manualClock` 或 scenario `playhead`，服务于生命周期、物理风累计位移、形变和关键帧采样。

手动模式直接使用 `deltaTime` 推进 `manualClock` 与 `manualWind.advance()`；scenario 模式另有 `scenarioState.speed`。如果只修改 shader `sceneTime`，CPU 平流、生命周期和 scenario 将产生不同倍率，因此倍率必须在 CPU 时间入口统一处理。

## Goals / Non-Goals

### Goals

- 一个控制同时覆盖手动和 scenario 仿真。
- 四个精确档位：0、1、2、4，默认 1。
- 1× 与当前行为一致；切换倍率不回算历史、不跳相位。
- 渲染循环与相机保持实时响应。

### Non-Goals

- 控制渲染 FPS 或 GPU 质量。
- 支持倒放、逐系统倍率或将倍率写入场景文件。

## Decisions

### 1. CPU 单一事实来源

新增 `src/simulationTime.ts`：

```ts
export const SIMULATION_RATES = [0, 1, 2, 4] as const;
export type SimulationRate = (typeof SIMULATION_RATES)[number];

export interface SimulationState {
  rate: SimulationRate;
}

export function scaledSimulationDelta(wallDeltaSeconds: number, rate: SimulationRate): number;
```

`SimulationState` 由 `main.ts` 持有并传给 GUI。它是 CPU 调度状态，不加入 `CloudParams`、GPU uniform 或 scenario JSON。

### 2. 在时间入口缩放一次

每帧先计算：

```text
simulationDelta = wallDeltaSeconds × simulationRate
```

- 手动模式且未 scrub：`manualClock += simulationDelta`，并以同一值调用 `manualWind.advance()`；`0×` 时增量自然为 0。
- scenario 模式且 playing/未 scrub：`playhead += simulationDelta`。
- 生命周期继续用 `manualClock`，scenario 风继续由 `ScenarioPlayer.sample(playhead)` 确定性计算。

不得在 renderer、WGSL、生命周期或风模块再次乘倍率。

### 3. 渲染时间保持真实时间

`elapsed`、CPU/FPS 测量、相机更新、`frameIndex`、TAA jitter、缓存 cross-fade 与后处理继续使用 wall time。`renderer.renderFrame(..., sceneClock)` 的 `sceneClock` 使用已缩放的仿真时钟，因此需要 scene-time 连续性的功能能感知 0×、2×、4×，而渲染调度不被停止。

### 4. 0× 替代手动暂停

删除 `timeline.paused` 与「暂停动画」checkbox。手动模式只用 `0×` 冻结；scenario 仍保留自己的 play/pause。有效推进条件为：

```text
manual:   !scrub ? simulationDelta : 0
scenario: playing && !scrub ? simulationDelta : 0
```

从 0× 切回非零倍率时从原时刻继续，无 wall-time 补算。scenario pause/play 不改写全局倍率。

### 5. Scrub 与 loop

scrub 是绝对时间定位，直接令时钟等于 `timeline.time`，不乘倍率。退出 scrub 后按当前倍率继续。scenario loop 仍在推进后执行取模；0× 不触发 loop 边界。

### 6. 收敛 scenario 专用 speed

删除 `ScenarioState.speed` 和 scenario 文件夹中的连续 speed 滑块；全局文件夹显示横向四按钮组，按钮使用 `aria-pressed` 与高亮样式表达当前档位。调试面板在手动与 scenario 模式均显示 `simulationRate`，避免隐藏的倍率叠乘。

## Risks / Trade-offs

- **4× 使每帧位移增大**：现有物理风缓存以位移阈值强制刷新；验收覆盖 Cached/Hybrid/Realtime 与地面云影历史失效。
- **手动暂停入口变化**：原 checkbox 被移除，手动冻结只通过 `0×`；scenario 播放暂停仍独立存在。
- **旧 scenario speed UI 行为改变**：该值未写入 JSON，属于内部运行时状态；用固定档位换取统一、可预测的整体仿真语义。
- **后台标签页大 delta 在 4× 下放大**：沿用现有 wall-delta 策略；本变更不另引入时间步长 clamp，以免改变 1× 基线。

## Migration Plan

1. 引入纯 CPU rate 类型、校验与 delta helper，默认 1×。
2. 将手动和 scenario 两条推进路径改为同一个 `simulationDelta`。
3. 删除 scenario 专用 speed 与手动 pause checkbox，新增全局横向四按钮组与调试输出。
4. 验证 0×/1×/2×/4×、scenario pause/scrub/loop/reset、物理风和三种质量模式。
5. 更新 glossary/README，验收后归档。

## Open Questions

- 无。倍率集合、默认值、0× 行为和与 scenario speed 的收敛方式在本提案中固定。
