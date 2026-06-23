## Context

阶段 4 后 `weatherMap`（256×256 `rgba8unorm`）静态生成：`paintRegions(data, regions)` 逐像素取 `bestCov = coverage * regionAlpha`，写 R=coverage、G=type、B=255（densityScale 恒 1）、A=0，再整图 `writeTexture`。`renderFrame(params, cam, elapsed)` 已每帧拿到 `elapsed`（=sceneTime）与 `deltaTime`，但天气图只在 `setRegions` 被显式调用时（初始化、GUI 改动）重写。shader 侧 `cloudDensity()` 采样天气图取局部 coverage/type/densityScale，B 通道已乘进最终密度（阶段 4 预留）。

阶段 5 要把「静态区域」升级为「随 sceneTime 演化的区域」，复用 B 通道（densityScale）与 R 通道（coverage）作为演化载体，无需新增 GPU 资源。

## Goals / Non-Goals

**Goals:**
- 区域可配一条分段密度包络，按 sceneTime 求 phase。
- phase 调制 coverage（出现/消失）与 densityScale（加重/减淡），逐帧重绘天气图。
- 无配置区域保持现状（向后兼容）。

**Non-Goals:**
- 不做 JSON 场景/事件时间轴编排（阶段 6 `cloud-scenario`）。
- 不做多高度层（阶段 7）。
- 不做天气图全空跳过 dispatch 的性能裁剪（阶段 9）。
- 形态随阶段微变（detailStrength/worleyBlend）列为可选，不作硬性验收。

## Decisions

### D1：包络分段与求值
包络以五个关键时刻定义 `{ birth, grow, mature, decay, death }`（绝对秒，相对 sceneTime），语义：
- `t < birth`：phase=0（未出现，晴空）。
- `birth→grow`：phase 0→1（出现 + 增厚，smoothstep）。
- `grow→decay`：phase=1（mature 维持最浓）。
- `decay→death`：phase 1→0（减淡 + 消失，smoothstep）。
- `t ≥ death`：phase=0（已消散，晴空）。

`peakDensity` 为 mature 段目标 densityScale（默认 1.0，可 >1 表示加重、<1 表示偏淡）。当前帧调制值：`densityScale = phase * peakDensity`、`coverageMul = phase`（区域 coverage 乘 phase 实现出现/消失）。

- 备选：用单一关键帧数组 + 任意段数。否决——五段语义对应 roadmap 文字（出现/增厚/最浓/变淡/消失），固定五段最直观；任意段留待阶段 6 事件插值。
- smoothstep vs 线性：默认 smoothstep（更自然的淡入淡出），关键帧相等时退化为瞬变。

### D2：调制落点在天气图重绘（CPU），不进 shader
phase → coverage/densityScale 在 CPU 端解出后写进 `weatherMap` 的 R/B 通道，逐帧 `writeTexture`。shader 不感知时间，仍只采样天气图。

- 备选：把包络参数传 uniform，shader 内按 sceneTime 求 phase。否决——天气图重绘已是整图 CPU 路径（256×256，~262KB/帧），逐帧上传成本可接受；CPU 求值最简单，且与阶段 6 运行时插值同处一层，避免 shader/CPU 双份时间逻辑。
- 优化阈值：phase 变化小于 epsilon 时跳过重绘（mature 段静止帧免上传）。

### D3：Region 生命周期为可选字段，向后兼容
`Region` 增 `lifecycle?: LifecycleEnvelope`。无该字段者 phase 恒 1（等价现状）。`paintRegions` 接受每区域已解出的 `{ coverageMul, densityScale }`（默认 `{1,1}`），避免 `paintRegions` 内部依赖时间。

- 备选：`paintRegions` 直接吃 sceneTime 自行求值。否决——保持 `weather.ts` 纯绘制、`lifecycle.ts` 纯求值，职责分离；main 帧循环负责把 sceneTime → 调制值喂给绘制。

### D4：B 通道编码
densityScale 可能 >1（加重）。B 通道 8bit 仅 [0,1]，约定编码 `B = clamp(densityScale / DENSITY_SCALE_MAX, 0, 1) * 255`，shader 侧解码乘 `DENSITY_SCALE_MAX`（常量，建议 2.0）。本阶段若 peakDensity 上限设 1.0 则与现状兼容；放开 >1 时需同步 shader 解码常量。

- 默认 `DENSITY_SCALE_MAX=2.0`，peakDensity GUI 范围 [0,2]。

## Risks / Trade-offs

- [逐帧整图 writeTexture 开销] → 256×256 单纹理可接受；加 phase 变化阈值跳过静止帧；必要时降天气图分辨率或局部更新。
- [B 通道 8bit 量化致密度阶梯] → DENSITY_SCALE_MAX 适中（2.0）+ shader 线性采样平滑；不足再升 r16float（牵动阶段 4 纹理格式）。
- [多区域包络重叠时 bestCov 竞争] → 沿用阶段 4「取 coverage 最大者」策略，phase 已乘进 coverage，淡出区域自动让位；记录为已知行为。
- [sceneTime 为持续累加，包络只触发一次] → 本阶段单次包络即满足验收；循环/重触发留待阶段 6 scenario。

## Open Questions

- peakDensity 是否放开 >1（加重超过基准）？倾向放开，DENSITY_SCALE_MAX=2.0，shader 同步解码。
- mature 段是否需要轻微起伏（呼吸感）而非恒定？倾向恒定，起伏留待阶段 6 事件曲线。
