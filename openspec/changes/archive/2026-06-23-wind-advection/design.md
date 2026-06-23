## Context

阶段 2 后参数布局（f32 偏移）：`Wind` 在 idx 24，当前仅 `speed`（占 1 槽 + 3 pad，24..27）；`SceneTime` 在 idx 28 起（sceneTime/deltaTime/noiseTime/timeVoronoi1/timeVoronoi2 + pad，28..35）。`PARAMS_FLOAT_COUNT=36`。

现状 `time = elapsed * windSpeed` 同时驱动 `noiseTime/timeVoronoi1/timeVoronoi2`（W 轴形变）**和**缓存 ping-pong 的 `prevCacheTime/nextCacheTime` 时间基；即「风」即「形变速率」，且无任何位移。`cloudDensity()` 用 `objPos = vec3f(pos.x, pos.z, pos.y)` 在固定 box 内采样三套 Voronoi/FBM。

平流必须以**域偏移**实现（移动采样坐标），不能移动 box 几何（box 是渲染/缓存的固定容器）。

## Goals / Non-Goals

**Goals:**
- `Wind` 暴露 `dir`(vec3)/`speed`/`morphRate`。
- `cloudDensity()` 用平流坐标采样 → 云团整体水平漂移。
- 形变（W 轴）与平流（位移）解耦，可独立调。
- 平流域边界环绕，长时间无空区/硬边。

**Non-Goals:**
- 不做空间分布/天气图（阶段 4）——风全局统一。
- 不做多层独立风速（阶段 7）。
- 不做垂直风/上升气流，仅水平 `dir.y=0`。
- 不接生命周期（阶段 5）。

## Decisions

### D1：Wind 字段扩展与偏移
`Wind` 改为 `{ dir: vec3f, speed: f32, morphRate: f32, _pad }`。vec3 需 16 字节对齐：让 `dir` 占 idx 24..26、`speed` 占 27（恰好补满 vec3 后的标量槽），`morphRate` 进入下一个 16 字节块。重排后 `SceneTime` 起始偏移后移，逐字段更新 `PARAM_OFFSETS`：新增 `windDir`(24)、`windSpeed`(27→保留语义)、`morphRate`。`packParams` 对 vec3 按分量写入（dst[24],[25],[26]）。

- 备选：dir 用方位角单 f32 在 shader 内转向量。否决——vec3 更直观且便于后续阶段扩 3D 风。

### D2：平流以域偏移实现
在 `cloudDensity()` 入口：
```
let advect = params.wind.dir * params.wind.speed * params.time.sceneTime;
let pAdv = objPos - advect;
```
随后所有 `objPos / scaleX` 改为 `pAdv / scaleX`。高度相关量（`Z`/altitude mask/cutoff）**不**平流（垂直结构不随风移），仅水平细节场平流。

- 备选：在 raymarch 入口偏移 `pos`。否决——会连同高度结构一起平移，破坏底/顶分层。

### D3：W 轴时间解耦
`noiseTime/timeVoronoi1/timeVoronoi2` 由 CPU 传 `morphRate * sceneTime`（缓慢形变），与 `speed` 无关。`speed=0` 且 `morphRate=0` → 完全静止。

### D4：边界环绕
平流后 `pAdv` 在水平方向可无限增长，导致采样域漂移出原 box。对水平采样坐标做周期重复：`pWrap = fract(pAdv / period) * period`（period 取 box 水平尺寸或其整数倍），使云从对侧重新进入。Voronoi/FBM 在该周期下仍连续（噪声以坐标为输入，周期映射要求噪声本身在 period 上无明显突变；必要时取 period 为噪声特征尺度整数倍以减小接缝）。

- 备选：扩大 box + 入口淡入。否决——增大 compute/缓存成本，环绕更省。
- 风险：`fract` 接缝处噪声不连续 → 取 period 对齐噪声尺度，或对接缝带做窄幅 blend。

### D5：缓存时间基适配
缓存 ping-pong 当前依赖 `time`（旧 = 形变时间）。解耦后用 `morphRate * sceneTime` 作为缓存混合时间基（形变是缓存需要插值的量）；平流是逐帧确定性偏移，缓存以 `sceneTime` 重算即可，不引入额外混合。需保证 `prevCacheTime/nextCacheTime` 改用形变时间，避免风速变化时 cacheBlend 抖动。

## Risks / Trade-offs

- [`fract` 环绕接缝硬边] → period 对齐噪声特征尺度；验收时长时间观察接缝。
- [平流 + 缓存不同步导致拖影] → 缓存时间基只跟形变，平流每帧确定性偏移；过渡期实跑确认无 ghosting。
- [偏移重排错位] → 更新后逐字段核对 WGSL 与 `PARAM_OFFSETS`，`vite build` + 实跑。
- [vec3 对齐打包错误] → `packParams` 对 dir 显式三分量写入并核对 std140。

## Open Questions

- 缓存是否需要把平流也烘进 cache（cache 随风移动）还是 cache 存「未平流密度」、采样时再平流？倾向后者（cache 存形变后的静态场，raymarch 采样 cache 时按 sceneTime 平流偏移），但当前 cache 是 box 内 3D 纹理、平流后坐标可能越界——需评估是否本阶段就改采样路径，还是先在 compute 内平流（cache 已含平流、每帧重算）。倾向先 compute 内平流（最小改动），性能不足再优化。
