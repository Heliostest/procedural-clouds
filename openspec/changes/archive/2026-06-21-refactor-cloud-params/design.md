## Context

参数从 `main.js` 流向 GPU 的现状：
- `paramsBuffer` 固定 96 字节（6×vec4f），`usage = UNIFORM | COPY_DST`。
- `buildParams(time, cacheBlend)` 把 24 个 f32 按裸索引写进预分配的 `paramsData = new Float32Array(24)`。
- `cloud.wgsl` 的 `Params` 用 6 个 `vec4f`（`time_pack` / `alt_pack` / `scale_pack` / `extra_pack` / `cache_pack` / `bounds_pack`），各分量含义靠行尾注释，读取点散落在 `cloudDensity()`、`shadowMarch()`、`fs()`、`cs()`。

约束：WebGPU uniform buffer 遵循 std140-like 对齐——`vec3f` 占 16 字节对齐，struct 成员按 16 字节对齐，结构整体 size 向上取整到 16 的倍数。重构必须保证 JS 写入偏移与 WGSL 结构偏移逐字节一致，否则画面错乱。

## Goals / Non-Goals

**Goals:**
- WGSL 用语义化分组 struct 表达参数，字段名自解释。
- JS 端按字段名写入，偏移集中定义一次，杜绝散落的魔法索引。
- 引入 `SceneTime` 字段（`sceneTime`/`deltaTime`），与噪声 W 轴时间解耦（仅占位+填充）。
- 重构前后同参数同机位画面像素级一致。

**Non-Goals:**
- 不改变任何密度/光照算法行为（含 `SceneTime` 暂不参与采样）。
- 不新增/删除 GUI 控件，不改数值范围。
- 不动 bind group layout、缓存纹理、ping-pong 逻辑。
- 不实现风的平流位移（阶段 3）。

## Decisions

### D1：顶层单 `Params` 聚合分组 struct，保持单一 binding
WGSL 定义嵌套结构并以一个 `params: Params` 暴露于 `@group(0) @binding(1)`：

```
struct RenderParams { rayMarchSteps, lightMarchSteps, shadowDarkness, sunIntensity, skipLight, cacheBlend, ... }
struct CloudShape   { density, coverage, altitude, scale, detail, lowAltDensity, factorShaper, factorDetail, cloudHeight, ... }
struct Wind         { speed, ... }
struct SceneTime    { sceneTime, deltaTime, noiseTime }
struct Params       { render: RenderParams, shape: CloudShape, wind: Wind, time: SceneTime }
```

- 备选：拆成多个 binding/多个 buffer。否决——会改 bind group layout，违反「管线不变」目标且增加 binding 管理成本。

### D2：JS 端集中式偏移表 + 命名 writer
不再手写 `paramsData[n]`。定义一份字段→偏移（以 f32 为单位）映射，`packParams(values)` 遍历映射写入 `Float32Array`。bool（`skipLight`）以 0/1 的 f32 写入。

- 备选：用 DataView + 逐字段 setFloat32。等价，但 `Float32Array` + 偏移表更简洁且复用现有预分配 buffer 模式。

### D3：buffer 大小由结构推导
按分组结构的 std140 对齐重新计算字节数（向上取整到 16 倍数），`paramsBuffer.size` 与 `paramsData` 长度由该值派生，而非硬编码 96。偏移表与 WGSL 字段顺序为唯一事实来源。

### D4：`SceneTime` 与噪声时间分离
WGSL 内现有的 `timeNoise/timeVoronoi1/timeVoronoi2`（W 轴形变）归入 `SceneTime.noiseTime`（或保留三者），新增 `sceneTime`/`deltaTime` 字段由 frame 循环按真实流逝时间填充。本阶段密度场仍只读 `noiseTime`，`sceneTime/deltaTime` 不参与计算，仅为阶段 3/5/6 预留。

## Risks / Trade-offs

- [std140 对齐错位导致画面错乱] → 重构后逐字段核对 WGSL 偏移与 JS 偏移表；保留旧 `buildParams` 一次提交内对照，确认像素一致后再删。
- [vec3f 隐式 padding 被忽略] → 字段尽量用标量+显式 pad，或将相关量打包进 vec4 对齐边界；偏移表显式列出 pad 槽位。
- [重构范围蔓延] → 严格限定仅参数层；算法、GUI、管线零改动，作为验收红线。
