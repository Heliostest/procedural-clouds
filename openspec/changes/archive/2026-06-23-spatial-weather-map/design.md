## Context

阶段 3 后 `cloudDensity()` 在固定 box（`BOX_MIN(-4.5,0,-4.5)`→`BOX_MAX(4.5,cloudHeight,4.5)`）内用平流坐标 `objPos = objPosRaw - advect` 采样，全局 `coverage/type/density` 统一。compute 侧 `@group(0)` 仅绑 `params`（binding 1）；`@group(1)` 为密度采样、`@group(2)` 为密度存储。`CLOUD_PRESETS` 当前只在 CPU 端用于 GUI 预设过渡（插值进 `CloudShape`），shader 不感知预设表。

阶段 4 要把「全局单一形态」升级为「按 XZ 位置查表的空间分布」，且为阶段 5/6 留写入接口。

## Goals / Non-Goals

**Goals:**
- 密度场按 box XZ 位置从 `weatherMap` 查询局部 coverage/type/densityScale，覆盖全局值。
- shader 内按 type 索引在候选预设间 `mix`，避免分支爆炸。
- Region API 软笔刷写入天气图，边缘羽化。
- 区域外晴空，区域边缘自然过渡。

**Non-Goals:**
- 不做随时间的生命周期包络（阶段 5，仅预留 B 通道 densityScale）。
- 不做时间轴/Scenario 编排（阶段 6）。
- 不做多高度层（阶段 7）——天气图为单层 XZ。
- 不做天气图全空区跳过 dispatch 的性能裁剪（阶段 9）。

## Decisions

### D1：天气图纹理规格与通道
`weatherMap` 取 256×256 `rgba8unorm`，覆盖 box 的 XZ 平面（线性映射 `objPos.xz` ∈ box 水平范围 → uv ∈ [0,1]）。通道：R=coverage、G=cloudType（量化索引/`(N-1)`）、B=densityScale（默认 1.0，阶段 5 写入）、A=区域 id。

- 备选：用 `r16float` 提精度。否决——8bit 对 coverage/scale 足够，type 用量化区间；省带宽。
- sampler 用 linear + clamp-to-edge：边缘羽化靠绘制时写入的软边，采样线性插值再平滑接缝。

### D2：预设参数以 uniform 数组进 shader
现 `CLOUD_PRESETS`（9~10 条 × 13 字段）在 CPU。shader 需要按 type 索引取形态参数做 `mix`，故把预设形态字段打包为 uniform 数组（每预设 N×vec4f，初始化时静态上传一次，不逐帧）。`src/params.ts` 增独立打包路径与索引偏移；shader 提供 `presetShape(idx)` 访问器。

- 备选：把当前 type 对应的形态值在 CPU 算好写进 `params`。否决——天气图每像素 type 不同，必须 shader 内按采样到的 type 索引取参，CPU 无法预解。
- 候选数限制：G 通道解码出连续 type 值，取 `floor`/`ceil` 两个相邻预设 `mix`（边界最多跨 2~3 个），不全表分支。

### D3：采样在平流之后
`cloudDensity()` 已先算 `objPos = objPosRaw - advect`。天气图采样用**平流前**还是**平流后**坐标？取平流后 `objPos.xz`——这样区域随风一起漂移（区域是「云所在处」，应随云移动），与阶段 3 平流语义一致。

- 备选：用平流前坐标（区域固定于世界，云穿过区域）。否决——本阶段语义为「在某区域放某种云」，区域跟随云团更直观；固定世界区域留待阶段 6 场景编排时按需扩展。

### D4：局部值覆盖全局的方式
- coverage：局部值直接替换全局 `coverage`（GUI 全局 coverage 退化为无区域时的默认底值）。
- densityScale：乘到最终密度（阶段 5 用 0→1 实现淡入淡出，本阶段恒 1）。
- type：解码索引取预设形态参数 `mix`，覆盖全局 `CloudShape` 形态字段。
- coverage≈0 时短路返回 0（晴空），省后续计算。

### D5：Region 软笔刷
`paintRegions` 在 CPU 后备 `Uint8Array` 上逐像素算：rect 用到边界的有符号距离、circle 用到圆心距离，距离经 `feather` 做 `smoothstep` 得软 alpha，混合写入 R/G/B/A，再整图 `writeTexture`。重绘为全清+逐区域叠加（区域少，整图重写最简单）。

## Risks / Trade-offs

- [type `mix` 在预设差异大时中间帧畸形] → 限定相邻索引插值，量化区间设计使相邻预设形态相近；必要时 type 用最近邻不插值。
- [compute bind group layout 变更牵动管线] → 同步改 WGSL 绑定声明与 renderer layout，逐 binding 核对；`vite build` + 实跑。
- [天气图分辨率 256 在大 box 下区域边缘块状] → linear 采样 + feather 软边缓解；不足再提分辨率。
- [预设 uniform 数组 std140 对齐] → 每预设按 vec4f 对齐打包，逐字段核对偏移。

## Open Questions

- 天气图 uv 是否需要随相机/box 尺寸动态映射，还是固定 box 水平范围常量？倾向固定常量（box 尺寸当前不变）。
- type 量化：G 通道 8bit 直接线性映射 [0,N-1]，还是离散分桶？倾向线性以支持 D2 的 `mix`。
