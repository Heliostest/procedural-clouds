## Context

W3 V2 compute 对整个 3D cache 网格写零，没有 body loop。W4 需要建立未来 evaluator 的空间剔除地基，但必须同时满足四个事实：

1. ping-pong 输出纹理会复用；跳过写入可能留下旧帧密度。
2. workgroup 可由用户修改，极小 workgroup 配合 `256³` 会产生不可接受的 tile 数。
3. Body 可旋转、平流，未来 Cb 砧顶和 attachment 可超出作者 footprint；mask 过小会产生不可恢复的缺云块。
4. W4 尚无 evaluator，也禁止为计数提前引入 atomics，因此只能证明候选上限下降，不能伪造“实际 evaluator 加速”。

默认配置：

```text
resolution = 96³
workgroup = 8×8×4
tile grid = ceil(96/8) × ceil(96/8) × ceil(96/4)
          = 12 × 12 × 24
tile count = 3,456
mask bytes = 3,456 × 4 = 13,824 bytes = 13.5 KiB
CPU broad-phase upper bound = 3,456 × 12 = 41,472 intersections
```

## Goals / Non-Goals

### Goals

- 让 `[0, activeBodyCount)` 成为真实、紧凑、稳定的 GPU body 前缀。
- 为每个实际 dispatch tile 生成无假阴性的 12-bit candidate mask。
- 为旋转、平流、羽化、砧顶和未来 attachment 建立显式 Support 上界。
- 保持 W3 空输出与 renderer seam 不变。
- 在极端配置下有界退化，不制造 CPU/memory 爆炸。
- 提供不依赖 GPU atomics的候选工作量统计。

### Non-Goals

- 不执行形态、weather、noise、atlas 或 attachment evaluator。
- 不减少 dispatch 数或最终 texture store 数。
- 不决定 W5 atlas 格式、W6 双属公式或 W11 compaction。
- 不以当前空 shader 的 timing 证明最终 V2 性能。

## Decisions

### Decision 1: Mask 只跳过未来 evaluator，不跳过最终输出写入

W4 继续 dispatch 完整 cache grid。每个有效 invocation 最终必须写一次 `vec4f(0.0)`：

```wgsl
if (gid outside resolution) { return; }
let candidateMask = tileMasks[workgroupLinearIndex];
if (candidateMask != 0u) {
  // W4: only establishes the bounded candidate gate.
  // W6: body/profile/evaluator work will live here.
}
textureStore(output, vec3i(gid), vec4f(0.0));
```

不能在 `candidateMask==0` 时直接跳过 `textureStore`。否则下一次写入 ping-pong 中较旧的目标纹理时，曾经有云、现在为空的 tile 可能保留陈旧密度。W4 的收益对象是未来 expensive evaluator，不是 storage write 或 dispatch。

### Decision 2: CPU packing 建立稳定 active-prefix

W3 的 `activeBodyCount` 只是计数，原始 Body slot 仍可能夹有 disabled/invalid 条目，不能安全作为循环上限。W4 改为：

```text
source bodies
  → validate genus/geometry/coverage/density/lifecycle
  → keep active bodies in original relative order
  → pack them contiguously into slots [0, activeBodyCount)
  → zero all remaining slots
```

mask bit `i` 永远引用 compact slot `i`，而不是原始数组索引。packer 可保留 source index 的 CPU-only 诊断映射，但不得上传动态 indirection table。`activeBodyCount<=MAX_BODIES=12`，未来 WGSL loop 的编译期上限仍为 12，运行时 break 使用真实 active count。

### Decision 3: Support 是保守包络，不是密度形态

`DensityRecipeGPU.support0` 在 W4 固化为：

```text
x = maxHorizontalScale          // >= 1
y = maxFeatherScale             // >= 1
z = maxLowerExtensionFraction   // >= 0, relative to body height
w = maxUpperExtensionFraction   // >= 0, relative to body height
```

所有值必须有限并满足固定 schema 上限：horizontal/feather scale 不超过 4，垂直扩张 fraction 不超过 1。W4 Recipe 仍 `enabled=0`、sample budgets 全零；只允许 Support 元数据非零。

CPU 从作者 bounds/base/thickness 得到局部 OBB，应用 Support scale、feather、累计 wind transport 和完整三轴旋转，再用旋转矩阵绝对值构造世界 AABB。当前 Cb 声明的最大砧顶扩张必须落在 Support 内；disabled attachment 的扩张为零。后续 Wave 在启用任何更宽的 topology/attachment 前，必须先提高相应 Support 声明和 fixtures，不得让 evaluator 超出 mask 包络。

### Decision 4: 每个实际 dispatch tile 使用一个 u32 bit mask

tile grid 与 compute dispatch 完全一致：

```text
gridX = ceil(resX / wgX)
gridY = ceil(resY / wgY)
gridZ = ceil(resZ / wgZ)
linear = tileX + gridX * (tileY + gridY * tileZ)
mask[linear] bit i ↔ compact body slot i
```

WGSL 使用 `@builtin(workgroup_id)` 计算 `linear`，不为每个 voxel 重做除法。bit 12–31 必须为零。mask 是 read-only storage buffer，属于 V2 Adapter 私有资源，不进入 `DensityCacheOutput`。

tile 世界 AABB 按实际边缘 tile 的有效 voxel 范围计算。相交测试采用闭区间，并在 Support 外再扩张至少半个 voxel 加有限 epsilon；宁可多保留候选，不得产生假阴性。

### Decision 5: 极端 tile grid 超预算时退化为 dense active-prefix

W4 固定基础预算：

```text
MAX_TILE_MASK_TILES = 262,144
MAX_TILE_MASK_BYTES = 1 MiB
MAX_CPU_TILE_BODY_TESTS = 262,144 × 12 = 3,145,728
```

同时必须检查 `device.limits.maxStorageBufferBindingSize` 与 `maxBufferSize`。任一预算或设备限制不满足时：

- 不分配目标大小 mask；只保留最小合法 dummy buffer。
- Frame flag 标记 mask disabled。
- shader 使用 dense active-prefix 语义。
- output、promotion 和 cache scheduling 继续有效。
- stats/HUD 报告 `disabled-budget` 或具体 device-limit reason。

不得自动修改用户请求的合法 workgroup，也不得建立较粗逻辑 tile 冒充实际 workgroup tile。

### Decision 6: Mask 只在实际 cache update 需要时重建

mask signature 至少包含：

- resolution、workgroup、volume min/extent 与 voxel size；
- compact active count/order；
- 每体 bounds、base/top、feather、transport、rotation、enabled 与 recipe ID；
- 对应 Recipe Support 值和 layout/support version。

V2 `prepareFrame()` 只有在本帧计划 encode 且 signature 变化时才重算/上传 mask。普通无 cache update 帧不得做全 mask rebuild。resolution/workgroup 改变重建 buffer/grid；仅 Body/support 改变可复用容量并 `queue.writeBuffer`。mask 使用独立 `maskGeneration`/`maskRevision`，不得因为私有 mask 更新伪造 sampled output `resourceGeneration`。

### Decision 7: 统计候选上限，不用 atomics伪造 evaluator 计数

CPU builder 可精确报告：

- grid dimensions、tile count、mask bytes；
- empty/occupied tile count；
- candidate memberships 的 sum/average/max；
- `denseTileBodyPairs = tileCount × activeBodyCount`；
- `maskedTileBodyPairs = Σ popcount(tileMask)`；
- 考虑边缘 tile 有效 voxel 数后的 dense/masked voxel-body upper bound；
- culled ratio、rebuild CPU time/count/reason、mask generation/revision；
- `evaluatorCalls=0`（W4 事实）。

这些数字是未来 evaluator 的保守候选上限，不是 GPU 执行指令计数或性能结论。W6 有真实 evaluator 后才能定义“实际 evaluator invocation”；W4 不为此引入 atomic counter、readback 或额外正常帧 pass。

### Decision 8: Layout version 与显式 binding 一起演进

W4 将 V2 layout version 从 1 提升到 2，并为 `countsAndFlags.w` 定义稳定 bit flags（至少包括 invalid-genus 与 tile-mask-enabled）。Record stride 保持 Frame=64B、Body=128B、Recipe=256B。

V2 group 0 新增只读 mask binding；pipeline layout、minBindingSize、CPU descriptor 与 WGSL declaration 必须由机器检查保持一致。W4 不添加 texture binding、weather binding、atlas binding 或 writable diagnostic buffer。

### Decision 9: Mask on/off 是验证模式，不新增产品参数

Adapter/factory 测试入口 SHALL 能强制 `mask enabled` 或 `dense fallback`，用于 fixtures 与 WebGPU A/B；正常产品默认在预算允许时启用 mask。W4 不向全局 `CloudParams`、scenario schema 或 Legacy params buffer 增加临时开关。HUD 只显示实际状态和 fallback reason。

### Decision 10: W4 仍维持惰性 V2 所有权

默认 Legacy 未请求 V2 时，不创建 mask buffer、不运行 CPU builder、不增加 shader/pipeline 或 pass。V2 candidate 创建后才分配最小需要的私有资源；创建、resize、workgroup rebuild、device loss 与 destroy 均由 V2 Adapter 负责。

## Validation Strategy

### Deterministic CPU fixtures

- no-body、single-body、multi-body、invalid-genus、disabled-body；
- body 夹在 invalid slot 后仍 compact 为 active-prefix；
- X/Y/Z 旋转、累计风位移、feather、场景边界裁剪；
- Cb 最大已声明 anvil Support、disabled attachment；
- tile 边界/半体素接触、非整除 edge tile；
- resolution/workgroup/signature 改变；
- 预算边界与 `1×1×1 + 256³` 安全 fallback。

对每个 fixture 进行确定性 voxel-center sweep：任何通过精确 Support predicate 的 body/voxel，其所属 tile 对应 bit 必须为 1；允许 false positive，不允许 false negative。

### Static source checks

- mask 仅为 `array<u32>` read-only storage；bit 上限 12；
- shader full-grid bounds check 与最终零 store 保留；
- 无 noise/weather/atlas texture sample、evaluator、atomics、workgroup storage、compaction、indirect dispatch；
- 默认 Legacy 仍不引用 V2 factory resources。

### Manual WebGPU acceptance

- Legacy Cached/Hybrid 与 W3 前一致；Realtime 仍有内容。
- V2 Cached/Hybrid 继续是天空/地面存在、云和云影为空的 W3 语义。
- HUD 在默认配置显示 `12×12×24` grid、3,456 tiles、13.5 KiB mask 与有限候选统计。
- 快速移动/旋转 Body、改变 resolution/workgroup 时无 validation error、黑屏或资源悬空；超预算配置显示明确 fallback。

## Risks / Trade-offs

- **过宽 Support 降低剔除率**：优先保证无缺块；候选统计会暴露过宽包络，W6 只能在证明安全后收紧。
- **过窄 Support 产生缺云**：半体素扩张、旋转 OBB→AABB、风/羽化/砧顶/attachment 上界和 voxel sweep 共同防止假阴性。
- **小 workgroup 造成 mask 爆炸**：固定 tile/memory/CPU tests 上限，超限 dense fallback。
- **W4 空输出使视觉 A/B 信息有限**：视觉只验证 seam/资源安全；主要 Gate 是几何 fixtures、候选统计和 source audit。
- **mask read 本身有成本**：W4 不宣称加速；W6 用真实 evaluator/timestamp 决定收益是否覆盖读取与 CPU rebuild。
- **active-prefix 改变 Body slot**：metadata 使用 compact record 内的 genus/recipe ID，不依赖源数组 slot；CPU-only source index 只用于诊断。

## Migration Plan

1. 固化 layout v2 flags、Support schema 与 active-prefix contract。
2. 实现纯 CPU support/mask builder、预算 fallback 和 deterministic fixtures。
3. 将 read-only mask binding 接入 V2 explicit pipeline。
4. 在空 shader 中读取 tile mask，同时保持 full-grid 单次零 store。
5. 接入 Adapter rebuild/lifecycle、stats/HUD 与 source checks。
6. 完成自动验证和人工 WebGPU seam 验收；确认后归档 W4，W5 才可建立 atlas/macro field 提案。

回滚时删除 mask binding/builder/stats，并恢复 layout v1 packing；W3 V2 空 Producer、Legacy 和 renderer consumer seam 可独立保留。

## Open Questions

无。实际非零 evaluator 调用量、atlas 采样成本与形态收益分别属于 W6、W5 和后续迁移 Wave。
