## 1. CloudShape 字段扩展

- [x] 1.1 `shaders/cloud.wgsl` 的 `CloudShape` 追加 `coverageThreshold`/`edgeSharpness`/`baseRoundness`/`worleyBlend`/`detailStrength`/`altBase`/`altTop`，按 std140 重排 padding
- [x] 1.2 同步更新顶层 `Params` 后续子结构偏移（wind/time 后移），并标注新字节偏移
- [x] 1.3 `main.js` 扩展 `PARAM_OFFSETS` 新字段、增大 `PARAMS_FLOAT_COUNT`/`PARAMS_BYTE_SIZE`
- [x] 1.4 逐字段核对 WGSL 偏移与 `PARAM_OFFSETS` 一致

## 2. 密度场接入新字段

- [x] 2.1 `edgeSharpness`：stage2/stage3 mapped 结果做锐化（pow/smoothstep），0 时退化为原线性
- [x] 2.2 `baseRoundness`：stage1 高度掩膜底部曲率（对 Z 做幂曲线）
- [x] 2.3 `worleyBlend`：在 `noise_fbm` 蓬松密度与 Voronoi 细胞密度间 `mix`
- [x] 2.4 `detailStrength`：调制 stage3 中观 Voronoi 贡献幅度
- [x] 2.5 `altBase/altTop`：用归一化高度带约束 falloff/cutoff（与现有 altitude 并存）
- [x] 2.6 标定各字段默认值，使空选预设时与阶段 1 观感一致

## 3. 预设与 GUI

- [x] 3.1 `main.js` 新增 `CLOUD_PRESETS`（10 云属，数值参考 cloud-types.md 形态子集）
- [x] 3.2 实现切换过渡状态（from 快照 / to 目标 / t），frame 循环按时长推进并 lerp 写入 `params`
- [x] 3.3 GUI 增加预设下拉，onChange 触发过渡
- [x] 3.4 `buildParams` 写入全部新形态字段

## 4. 验收

- [x] 4.1 `vite build` 通过
- [x] 4.2 切换 cumulus/stratus/cirrus/cumulonimbus，确认四类形态肉眼可辨
- [x] 4.3 切换过程平滑无突变跳变
- [x] 4.4 空选/默认与阶段 1 画面一致
- [x] 4.5 `openspec validate cloud-type-presets --strict` 通过
