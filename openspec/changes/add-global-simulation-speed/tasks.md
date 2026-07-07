## 0. 基线与冲突门

- [x] 0.1 记录手动 `manualClock/manualWind.advance`、scenario `playhead/scenarioState.speed`、renderer wall/scene clock 的现状
- [x] 0.2 与 active `add-physical-wind-advection` 对齐，确认只缩放其 `deltaSceneSeconds`，不修改累计位移或 scrub 纯函数契约
- [x] 0.3 固定默认场景，记录 1× 下 10 秒手动风位移、生命周期/形变时刻与 scenario playhead 基线
- [x] 0.4 确认提案获批准；批准前不实施以下任务

## 1. 统一仿真时间模型

- [x] 1.1 新增 `src/simulationTime.ts`，定义 `SimulationRate = 0 | 1 | 2 | 4`、允许值、默认值与有限非负 wall delta 校验
- [x] 1.2 在 `main.ts` 创建单一 `SimulationState`，每帧只计算一次 `simulationDelta = wallDelta × rate`
- [x] 1.3 手动模式用同一 `simulationDelta` 推进 `manualClock`、`manualWind.advance`、morph time 和生命周期输入
- [x] 1.4 scenario 模式用同一 `simulationDelta` 推进 playhead，保留 duration clamp/loop 与 `ScenarioPlayer.sample(t)` 的确定性
- [x] 1.5 保证 renderer 的 `elapsed/frameIndex`、相机、TAA、性能统计和缓存 cross-fade 继续使用 wall time；不得新增 GPU uniform

## 2. 控制与交互

- [x] 2.1 在全局 GUI/i18n 增加横向 `0×/1×/2×/4×` 游戏式四按钮组，以高亮/`aria-pressed` 标识当前档位，默认 1×
- [x] 2.2 删除 scenario 专用连续 `speed` 字段/滑块，避免与全局倍率相乘；scenario JSON schema 保持不变
- [x] 2.3 定义并实现 0×：仿真冻结但渲染、相机、GUI、TAA 与统计继续更新；切回非零倍率不得补算冻结期间 wall time
- [x] 2.4 删除手动「暂停动画」checkbox，以 0× 作为唯一手动冻结入口；保留 scenario pause/play、scrub、loop、重置时间与重置平流语义
- [x] 2.5 调试面板在手动和 scenario 模式均显示当前全局倍率与有效推进/冻结状态

## 3. 验证

- [x] 3.1 增加纯 CPU verification：10 秒 wall time 在 0×/1×/2×/4× 下分别推进 0/10/20/40 仿真秒
- [x] 3.2 验证 1× 的 manualClock、每体平流 offset、morph time、生命周期与 scenario playhead 和变更前一致
- [x] 3.3 验证 0× 运行期间所有仿真状态保持不变，切回 1× 后连续恢复且无位置/形变跳变
- [x] 3.4 验证 2×/4× 下手动与 scenario 的风位移、关键帧、生命周期按倍率推进，scrub 到同一时刻仍得到同一结果
- [x] 3.5 验证按钮高亮、scenario pause/play、loop 边界、前后 scrub、reset time、reset advection 及 manual/scenario 切换矩阵
- [x] 3.6 验证 Cached/Hybrid/Realtime 和 Legacy/Adaptive/Transmittance 地面云影在 4× 下无相位回跳或超过既有阈值的拖影
- [x] 3.7 `npm.cmd run typecheck`、`npm.cmd run build`、浏览器运行时检查与 `openspec validate add-global-simulation-speed --strict --no-interactive` 通过

## 4. 文档与归档

- [x] 4.1 更新 `README.md`、`docs/glossary.md`，说明 0× 替代手动 pause checkbox，并区分 scenario pause、scrub 与渲染 FPS
- [x] 4.2 记录四档验证结果、1× 回归证据和 4× 高速缓存/云影验收结果
- [ ] 4.3 所有任务完成后归档 `add-global-simulation-speed` 并严格校验全部 OpenSpec
