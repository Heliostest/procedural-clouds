## 0. Approval and prerequisite gate

- [x] 0.1 用户批准本 proposal、design 与 `cloud-density-benchmarking` spec delta
- [x] 0.2 记录 `add-height-weather-shaping`（10/14，`densityShapeModel=1`）、`add-height-ambient-tint`（9/13，`heightAmbientModel=1`）、`add-stratocumulus-cumulus-breakup`（无 tasks）的状态；0/0 是 compatibility anchor，1/1 是 W0 Legacy baseline
- [x] 0.3 确认本 change 只建立观测与证据，不开始 W1 Seam 或任何 Density V2 实现

## 1. Benchmark manifest and fixed scenarios

- [x] 1.1 定义 versioned benchmark manifest、case ID、配置 fingerprint 与结果类型；单独提交
- [x] 1.2 固定 1280×720、96³ cache、update rate 2、相机、时间、暂停、天气、风、生命周期和完整参数快照；单独提交
- [x] 1.3 增加十个单云属固定场景并校验 genus/placement/preset 完整性；单独提交
- [x] 1.4 增加十属同场景和单个复杂 Cb 压力场景；单独提交
- [x] 1.5 benchmark 装载后计算 fingerprint；用户交互或参数漂移必须取消/使本轮无效

## 2. Read-only instrumentation

- [x] 2.1 扩展 `RenderStats`，暴露 timestamp availability、`cacheRan`、活跃云体数和当前测量所需的既有 pass timing；不改变 pass 内容
- [x] 2.2 记录 adapter features/limits 和可用 adapter 信息；不新增 required feature
- [x] 2.3 将 adapter/device/shader/pipeline 首次创建 elapsed time 作为独立 CPU startup timing 记录
- [x] 2.4 用户于 2026-07-11 人工确认 benchmark controller 默认关闭时画面与改动前无差异；代码路径确认无额外 benchmark GPU pass 与参数覆盖

## 3. Sampling and evidence export

- [x] 3.1 实现 warm-up 与 sample 状态机；只在 `cacheRan=true` 时采集 cache 样本
- [x] 3.2 输出各 pass 的 count、median、p95、min、max；normal/debug 与 Cached/Hybrid 独立分组
- [x] 3.3 `timestamp-query` 不可用时输出 `unavailable`，不得以 FPS/CPU 时间代替 GPU timing
- [x] 3.4 导出包含 revision、active changes、device、fingerprint、case、stats、warnings 和 screenshot path 的 versioned JSON
- [x] 3.5 建立 expected/completed/stale case 索引，拒绝合并 fingerprint 不一致的结果

## 4. W0 evidence capture

- [x] 4.1 项目所有者于 2026-07-11 豁免严格 timing 采集；保留五个代表场景 × Cached/Hybrid 的 10 个 Normal timing case 作为按需工具，不把未采集状态记作性能完成
- [x] 4.2 项目所有者于 2026-07-11 接受人工视觉审阅并豁免 10 张视觉锚点；manifest 继续保留可重复截图入口
- [x] 4.3 将 Realtime 保留为可选兼容入口；当前 W0 不要求采集，且不纳入 timing、截图或完成 Gate
- [x] 4.4 不生成空的基线证据包；manifest 与 JSON 导出能力保留在代码中，实际采集时再写入 `docs/baselines/density-v2-w0/`
- [x] 4.5 记录当前结论：人工视觉签核通过、定量 GPU 基线未采集，因此后续不得声称已有 W0 性能数字

## 5. Validation

- [ ] 5.1 运行 TypeScript typecheck 与 production build
- [ ] 5.2 运行既有 genus-dispatch 检查，确认十属路由未变
- [x] 5.3 用户于 2026-07-11 完成人工 A/B，确认 benchmark controller 关闭时正常视图及当前使用的 Cached/Hybrid 与 change 前无视觉差异
- [x] 5.4 静态确认代表 timing/截图 case 仍可运行，但 `gateRequired=false`；其缺失与 Realtime 缺失均不阻塞后续 Wave
- [x] 5.5 运行 `openspec validate establish-density-v2-baseline --strict --no-interactive`
- [x] 5.6 项目所有者于 2026-07-11 明确批准在人工签核基础上创建 W1 `DensityCacheProducer` proposal；未采集 timing 只禁止性能结论
