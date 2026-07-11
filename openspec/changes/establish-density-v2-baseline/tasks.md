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
- [ ] 2.4 确认 benchmark controller 默认关闭时无额外 GPU pass、无参数覆盖、无视觉变化

## 3. Sampling and evidence export

- [x] 3.1 实现 warm-up 与 sample 状态机；只在 `cacheRan=true` 时采集 cache 样本
- [x] 3.2 输出各 pass 的 count、median、p95、min、max；normal/debug 与 Cached/Hybrid 独立分组
- [x] 3.3 `timestamp-query` 不可用时输出 `unavailable`，不得以 FPS/CPU 时间代替 GPU timing
- [x] 3.4 导出包含 revision、active changes、device、fingerprint、case、stats、warnings 和 screenshot path 的 versioned JSON
- [x] 3.5 建立 expected/completed/stale case 索引，拒绝合并 fingerprint 不一致的结果

## 4. W0 evidence capture

- [ ] 4.1 在支持 `timestamp-query` 的 reference device 采集 10 属 × Cached/Hybrid × Normal/Density Debug 的 40-case 矩阵
- [ ] 4.2 采集十属同场景与复杂 Cb 的 Cached/Hybrid 压力 timing，并保存对应 density debug 证据
- [ ] 4.3 在一个代表场景记录 Realtime pipeline 可创建和有限输出状态；不记录或承诺 Realtime 性能
- [ ] 4.4 将 manifest、结果 JSON、截图和 README 写入 `docs/baselines/density-v2-w0/`
- [ ] 4.5 README 记录 reference device、测量限制、active change 状态、缺失 case 与 W0 Gate 结论

## 5. Validation

- [ ] 5.1 运行 TypeScript typecheck 与 production build
- [ ] 5.2 运行既有 genus-dispatch 检查，确认十属路由未变
- [ ] 5.3 A/B 确认 benchmark controller 关闭时正常视图、density debug、Cached/Hybrid 与 change 前一致
- [ ] 5.4 静态检查 40 个视觉 case、4 个压力 timing case 和 Realtime 状态记录完整
- [ ] 5.5 运行 `openspec validate establish-density-v2-baseline --strict --no-interactive`
- [ ] 5.6 W0 证据完整前不创建或实施 W1 `DensityCacheProducer` change
