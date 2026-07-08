## 0. 基线与冲突控制

- [x] 0.1 记录 `per-preset-lighting` 当前 `params.ts`/`cloud.wgsl` buffer 布局，确认本变更只合并风 payload，不覆盖 active change 字段

## 1. 物理风模型

- [x] 1.1 新增 `src/wind.ts`：方向约定、`direction/speed ↔ velocityMps`、有限值校验与角度归一化
- [x] 1.2 将 `CloudBody.windSpeed` 迁移为 `windSpeedMps`；更新新建体和内置 demo 为明确的 m/s 演示值
- [x] 1.3 实现手动模式 per-body `WindAdvectionState`，按 `deltaSceneSeconds` 连续累计米制 offset，并处理新增/删除/暂停/模式切换/显式重置
- [x] 1.4 保持 `morphRate` 与 m/s 解耦；决定并记录 morph phase 是继续绝对时间还是改为累计时间

## 2. Scenario v3 与确定性积分

- [x] 2.1 Scenario 增加 `schemaVersion: 3`、`windUnit: "m/s"`；serializer 只输出 v3 显式单位
- [x] 2.2 v2 与无版本 loader 将 legacy world-units/second 乘 `horizontalMetersPerWorldUnit` 迁移为 m/s，未知/非法单位拒绝且不替换当前场景
- [x] 2.3 将风关键帧转为 XZ 速度向量，按 linear/smooth ease 预计算分段积分与累计前缀
- [x] 2.4 `ScenarioPlayer.sample(t)` 输出每体确定性累计 offset；验证播放、直接跳转和来回 scrub 的同一时刻结果一致
- [x] 2.5 增加 v2/legacy → v3 → reload 验证，证明迁移前后 world-space 运动速度一致

## 3. GPU 与质量模式

- [x] 3.1 `packBodies()` 将 `offsetM` 除以 `horizontalMetersPerWorldUnit`，按语义化偏移写入对齐的 `BodyGPU.wind` payload
- [x] 3.2 `shaders/cloud.wgsl` 直接使用累计 `advectionOffsetWorld`，移除 `current speed * sceneTime` 平流公式；足迹、密度与实体调试体共同水平运输，垂直剖面保持不变
- [x] 3.3 cached 快照记录对应平流相位；按最大位移/体素阈值验证或调整刷新策略
- [x] 3.4 hybrid 的缓存低频层与实时细节层使用同一平流相位；cached/hybrid/realtime 不得混用 legacy 与 m/s 路径
- [x] 3.5 验证 1 小时@80 m/s 无 NaN、回跳、明显精度抖动或硬接缝
- [x] 3.6 renderer 线框与 gizmo 显示副本叠加同一世界运输 offset，原始 `CloudBody.bounds` 不被逐帧改写

## 4. GUI 与文档

- [x] 4.1 GUI 风速标签和 tooltip 改为 m/s，方向 tooltip 明确“去向”、0°=`+X`、90°=`+Z`
- [x] 4.2 GUI 提供平流相位重置；正常范围 0–80 m/s，迁移高值显示 warning 而不静默 clamp
- [x] 4.3 更新 `docs/glossary.md` 与 `README.md`：物理单位、方向、世界运输、scenario v3 与 legacy 迁移
- [x] 4.4 更新内置 scenario 示例并验证导出 JSON 包含 `schemaVersion: 3`/`distanceUnit: "m"`/`windUnit: "m/s"`
- [x] 4.5 默认开启坐标轴；默认云体保持非零 m/s 风，启动后可直接观察世界 XZ 运输

## 5. 验证与验收

- [x] 5.1 扩展纯 CPU verification：10 m/s×10 s、变风连续性、350°→10°、v2 迁移和 scrub 确定性
- [x] 5.2 `npm.cmd run typecheck` 通过
- [x] 5.3 `npm.cmd run build` 通过
- [x] 5.4 `openspec validate add-physical-wind-advection --strict --no-interactive` 通过
- [x] 5.5 cached 与 realtime A/B：云体足迹、密度、线框和 gizmo 沿相同世界方向/速度运输，改变风速/方向无相位瞬移
- [ ] 5.6 用户完成默认风速、scenario scrub、legacy 场景和高速 cache 行为的视觉验收

## 6. 归档

- [ ] 6.1 仅在以上任务完成后执行 `openspec archive add-physical-wind-advection --yes`
- [ ] 6.2 垂直风、风切变、湍流/阵风和场景边界环绕分别创建后续 change，不在本次归档中声明
