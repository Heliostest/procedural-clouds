## Context

`CloudBody` 当前保存 `windDeg`、`windSpeed`、`morphRate`。`packBodies()` 把方向单位向量和原始 speed 写入 `BodyGPU.wind`，shader 在每次密度求值时计算：

```wgsl
advect = direction * speed * sceneTime
objPos = objPosRaw - advect
```

该实现有三个相互关联的问题：

1. `windSpeed` 没有物理单位；在已建立 1000 m/world-unit 的场景中，现有默认值对应极端速度。
2. 风在时刻 `t` 改变时，过去全部时间会被新速度重新计算，采样相位发生跳变。
3. 初版实现固定 body footprint、只平流内部噪声，无法直接观察云体相对世界坐标的位置变化。修订后的规范要求累计 offset 同时运输足迹与密度，同时保留作者 placement 不被逐帧改写。

本项目仍是程序化云 demo，不追求流体守恒或天气预报。本变更只保证单位、时间积分、方向约定、序列化和渲染路径在运动学上自洽。

## Goals / Non-Goals

### Goals

- CPU 的风速以 m/s 表达，场景时间以秒表达，累计位移以米表达。
- 改变风速或风向时位移连续，不随应用已运行时长发生跳变。
- scenario 任意时刻的风与累计位移是纯函数，scrub 可重复。
- 米到 render world units 只在 GPU pack 边界换算一次。
- cached、hybrid、realtime 对同一时刻使用同一累计位移。
- 让 control envelope、密度、实体调试体和可视化辅助共享同一水平 transport offset。

### Non-Goals

- Navier–Stokes、湿度输送、质量守恒、地形风、垂直速度、风切变或湍流。
- 改写作者保存的 body placement 或 weather-map 像素数据。
- 从 WMO 云属表派生风速。

## Decisions

### D1 — CPU 使用物理风，GPU 使用累计偏移

运行时模型：

```ts
interface PhysicalWind {
  directionDegToward: number
  speedMps: number
}

interface WindAdvectionSample {
  offsetM: readonly [number, number]
  morphTime: number
}
```

`directionDegToward` 是运动去向，不是气象报告中常见的“风从何处来”。坐标约定：0°=`+X`，90°=`+Z`，从 `+Y` 向下看为顺时针。转换为速度：

```ts
velocityMps = [cos(rad) * speedMps, sin(rad) * speedMps]
```

CPU 以 JavaScript number 累计 `offsetM`。`packBodies()` 在唯一边界执行：

```ts
offsetWorld = offsetM / horizontalMetersPerWorldUnit
```

`BodyGPU.wind` 重新定义为语义化 payload，至少携带 `advectionOffsetWorld: vec2` 与 `morphTime`。shader 直接减去偏移，不再接收物理 speed 后再乘 `sceneTime`。这避免 GPU 不知道物理比例，也避免 double-scale。

备选：把 m/s 和比例都传给 shader。否决，因为每次样本重复换算，且仍需额外状态解决变风连续性。

### D2 — 手动模式按场景时间增量累计

每个手动云体持有独立 `WindAdvectionState`，以稳定 body id 为键：

```ts
offsetM += velocityMps * deltaSceneSeconds
```

- 暂停或 `deltaSceneSeconds=0` 时不累计。
- 调整方向/速度只影响之后的增量，不改写历史 offset。
- 删除 body 时删除对应状态；新增 body 从零 offset 开始。
- 切换手动/场景模式时各自状态独立保存，避免模式切换污染另一时间基。
- 提供显式“重置平流相位”，而不是通过改风速暗中归零。

`morphRate` 继续独立控制噪声形变。本实现同时累计 `morphTime += morphRate * deltaSceneSeconds`，消除运行中修改 morphRate 时的历史相位重算；它不解释为风速，也不使用 m/s。

### D3 — Scenario 对速度向量插值并积分

Scenario 不能依赖逐帧历史累加，否则从 0 播到 20 秒与直接 scrub 到 20 秒可能不同。播放器必须对任意 `t` 计算：

```text
offsetM(t) = integral from 0 to t of velocityMps(tau) d tau
```

关键帧 JSON 仍可用 `windDeg`/`windSpeed` 供人编辑，但 parser 先转换成 XZ 速度向量。相邻关键帧按 `ease` 插值速度向量，并对 linear/smoothstep 曲线做确定性积分；播放器可预计算每段完整位移前缀，使每帧采样只查当前段。

直接插值角度会在 350°→10° 时绕远；插值向量避免该歧义。代价是方向大幅反转时中点速度可能接近 0，这正好表达两股相反速度之间的连续过渡。

若某 body 没有风事件，使用 scenario 顶层 wind；若事件只给方向或速度，缺失分量继承该 body 上一个有效值，再转成速度向量。手动值在 scenario 启用时不参与计算。

### D4 — Scenario v3 显式声明风单位

新版格式：

```json
{
  "schemaVersion": 3,
  "distanceUnit": "m",
  "windUnit": "m/s",
  "duration": 70,
  "wind": { "dirDeg": 90, "speed": 10 },
  "bodies": {},
  "events": []
}
```

- v3：`wind.speed` 与 event `windSpeed` 按 m/s 读取。
- v2：距离已经是米，但风仍是 legacy world-units/second；迁移公式为 `speedMps = legacySpeed * horizontalMetersPerWorldUnit`。
- 无版本：先按既有规则迁移距离，再以同一公式迁移风。
- serializer 只输出 v3，且必须包含 `windUnit: "m/s"`。
- 未知 `windUnit`、负数、NaN 或无限 speed 必须拒绝；方向归一化到 `[0,360)`。

迁移的首要目标是旧画面运动速度不变，因此 `0.15 world/s` 在默认比例下会成为 `150 m/s`。loader 不自动 clamp，否则无法往返；UI/console 可将超过演示阈值的值标记为 legacy/high-speed warning。

### D5 — 作者 placement 与运行时世界运输分离

`CloudBody.bounds/feather/base/thickness` 定义作者保存的初始 placement；`WindAdvectionSample.offsetM` 定义运行时水平 transport offset。渲染时：

- shader 先从世界采样点减去 `advectionOffsetWorld`，再进行 body rotation、足迹天气图查询和程序化噪声求值；因此足迹与内部密度整体沿风向移动；
- 实体调试体使用同一逆向采样变换，不再绕过风；
- renderer 为线框和 gizmo 的显示副本加上同一 offset，使辅助图形跟随当前世界位置；
- 原始 `CloudBody.bounds`、天气图纹理像素和 placement lock 不逐帧改写；重置平流相位即可回到初始位置；
- 垂直 `base/thickness` 不随本阶段的水平风移动。

这是运动学运输，不声称质量守恒或完整空气团动力学。云体移出场景盒后允许自然离开；本变更不以 `fract` 强制环绕。

### D6 — 缓存快照与平流时间一致

所有质量模式从同一 `WindAdvectionSample` 获取偏移：

- realtime：当前帧直接使用当前 offset。
- cached：前/后密度快照分别记录生成它们时的 offset，cache blend 只混合时间相邻快照。
- hybrid：缓存低频密度与实时细节必须使用同一当前物理相位，不能一层按 m/s、另一层按 legacy speed。

若 cache 更新间隔内的最大物理位移超过一个水平体素，renderer SHALL 提前刷新或限制插值区间，避免可见跳格。实现不要求增加缓存分辨率。

### D7 — 新默认值是演示配置，不是属级定律

新建云体默认使用 `10 m/s`；内置 demo 可用低层约 5 m/s、中层约 10 m/s、高层约 20 m/s，作为可视化演示值写入 demo 数据。它们不得写进 `GenusPhysicalProfile`，也不得被描述为 WMO 云属标准风速。

GUI 合理范围为 0–80 m/s，允许文本输入更高的已迁移值但显示警告。负值不用来反转方向；用户应将方向加 180°。

### D8 — 验证以数值契约为主、视觉 A/B 为辅

扩展纯 CPU verification，至少证明：

- 10 m/s 持续 10 s 得到 100 m 位移；默认 1000 m/world-unit 下 pack 为 0.1 world unit。
- 风速在 5 s 时改变，不重写前 5 s 已累计位移。
- v2 `0.15` 在 1000 m/world-unit 下迁移为 150 m/s，迁移前后 world/s 相同。
- scenario 直接 sample(t)、顺序播放到 t、来回 scrub 后 sample(t) 的 offset 相同。
- 350°→10° 的过渡不沿 180° 方向绕行。

视觉验收在 cached 与 realtime 下观察云体足迹、密度、线框与 gizmo 共同沿世界坐标移动，并检查变风连续性和 cache ghosting。

## Risks / Trade-offs

| 风险 | 缓解 |
|---|---|
| legacy 迁移得到 150–600 m/s，看起来不物理 | 保持画面优先且显示 warning；新默认使用合理演示值 |
| transport offset 与作者 placement 混淆 | 原始 bounds 不变；渲染副本和 shader 统一叠加 offset；重置相位回原位 |
| scenario 积分增加播放器复杂度 | 速度向量分段预计算前缀；纯函数 verification 覆盖 scrub |
| cached 模式在高速风下跳格/拖影 | 以每 cache interval 的体素位移为刷新条件，做 cached/realtime A/B |
| `BodyGPU.wind` 语义变化导致布局错位 | 保持 vec4 对齐、集中 offset 常量，并核对 WGSL/TS layout |
| 长时间 f32 偏移精度下降 | CPU 以 f64 米累计；验收至少覆盖 1 小时@80 m/s，必要时另建周期噪声 change |
| active lighting change 同时改 params/shader | 实现前记录其 buffer 基线，按字段合并并运行严格校验 |

## Migration Plan

1. 新增纯 CPU wind 模块、方向/速度向量转换和 scenario 分段积分 verification。
2. 将 runtime 字段迁移为 `windSpeedMps`，更新新默认值；保留 v2/legacy parser。
3. serializer 升级 v3，完成 v2/legacy → v3 → reload 数值与运动往返验证。
4. 引入手动模式 per-body advection state，把累计米制 offset 接到 GPU pack。
5. 修改 WGSL 与 cache 时间语义，完成 cached/hybrid/realtime 一致性检查。
6. 更新 GUI、i18n、glossary、README，完成变风/scrub/长时间视觉验收后归档。

## Open Questions

- 实现时需实测 cached 模式是采用“位移超过一体素即提前刷新”，还是现有 ping-pong 快照足以平滑；选择必须记录帧时和 ghosting A/B。
