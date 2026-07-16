# W9 Design — Hierarchical Global Coarse + Body-local Density Bricks

## Context

当前 Recipe V2 每次 cache update 对覆盖整个云场的 `96³` 网格求值，并把最终密度与 top-two genus metadata写入双 `rgba16float` texture。默认 `boxHalfExtent=32000 m`，因此 X/Z 体素约为 `64000/96=666.7 m`。W8 固定尺度场中的三个 2.5 km 云体仅横跨约 3.75 个体素，无法同时表达主体、cell 尺度与 ripple。

W5 Base/Detail atlas 已经提供高频噪声信号，但它们是所有 Recipe 共用的周期输入，不是按云体求值后的密度存储。继续提高噪声频率只会让全局 cache 欠采样；在 Hybrid 阶段添加高频扰动也无法恢复已丢失的中尺度拓扑。

W9 是 Proof-of-Architecture，不是全面替换全局缓存。全局 RGBA 仍保存完整、可独立渲染的 V2 density；body-local brick 只在候选集合完整时作为更高分辨率替代结果。这样任何 atlas、allocation 或 renderer 失败都能确定性退回 global-only。

## Goals

- 在固定总显存下，把中尺度分辨率按活动 Body 分配，而不是提高整个世界网格。
- 保持现有 global RGBA density/metadata、ping-pong、Producer selector 与 Legacy 回退可独立工作。
- 每个 render density sample 只处理固定最多 4 个 brick 候选，不遍历全部 12 Body。
- 复用 W8 evaluator 与 Recipe layout，在 body-local 网格上求值时不增加 family sample budget。
- 对 allocation、格式、generation、LOD、gutter、overflow、device loss 和回收给出可自动验证的契约。
- 以视觉、GPU timing、显存和生命周期证据决定 W10–W13 是否可以依赖 brick 基础设施。

## Non-Goals

- 不实现 Fiber/Convective evaluator 或新的 Hybrid detail。
- 不做 coarse+brick 部分相加，也不要求两层数值像素级相等。
- 不在 W9 解决多 brick/Body、超高纵横比最优分块、atlas compaction 或跨场景流式驻留。
- 不以默认提高全局 resolution、删除 global-only 或放宽 Support换取 Gate 通过。

## Runtime Data Flow

```text
DensityFrameInput
  → W8 pack + conservative Support/tile mask
  → existing global RGBA coarse compute (always valid/fallback)
  → CPU brick allocation + fixed-K render candidate grid
  → body-local brick compute (hierarchical active only)
  → DensityCacheOutput v2
      coarse: existing views/sampler/blend
      hierarchical: atlas views + record/candidate bindings + generations
  → global-only or hierarchical Cached/Hybrid bundle
  → unified densityAtTyped() for cloud, light march, density debug, ground shadow
```

## Decisions

### Decision 1: 三层终局中，W9 只实现 coarse + bricks

长期结构是：

1. global coarse：宏观覆盖、完整 fallback、远景、阴影与 metadata；
2. body-local bricks：中尺度 profile/cell/骨架；
3. render-time bounded detail：可丢失的 ripple、边缘侵蚀与微分叉。

W9 只实现前两层及 renderer seam。现有 Hybrid detail维持原样；任何新的 Recipe-aware render-time 算子留给 W12。这样 W9 Gate 能单独判断“局部分辨率是否值得其资源/接口成本”。

### Decision 2: `DensityCacheOutput` 使用兼容的 version 2 复合契约

现有 coarse 字段保留原名与语义；新增 contract version、active storage mode 与可空 hierarchical payload。概念结构：

```ts
interface DensityCacheOutputV2 {
  contractVersion: 2;
  format: 'rgba16float';
  resolution: readonly [number, number, number];
  sampledViews: readonly [GPUTextureView, GPUTextureView];
  sampler: GPUSampler;
  cacheBlend: number;
  resourceGeneration: number;
  contentRevision: number;
  validSampleCount: number;
  valid: boolean;
  storageMode: 'global-only' | 'hierarchical';
  hierarchical: DensityBrickOutput | null;
}
```

`DensityBrickOutput` 只暴露 sampled views/sampler、只读 binding resource、format/dimensions、record/candidate layout version、allocation generation、content revision 与 valid 状态。不得暴露 storage view、writable texture、compute pipeline 或 producer-private bind group。

Legacy 与 global-only V2 都返回 `storageMode='global-only'`、`hierarchical=null`。Hierarchical 只有在 coarse 与全部 brick resources 对同一 frame input 完成 warmup 后才可发布；不能把半初始化 payload 塞入 valid output。

### Decision 3: 双 atlas resident payload 固定不超过 16 MiB

Brick density 是单标量；genus 来自 record，而不是每 voxel metadata。W9 定义以下受控 profile：

| Profile | 双 atlas payload | 角色 |
| --- | ---: | --- |
| `r16float 160³ × 2` | 15.625 MiB | 首选；仅 storage-write + filtering-sample probe 通过时可用 |
| `rgba16float 96³ × 2` | 13.5 MiB | 兼容 fallback；只使用 R channel |
| `rgba8unorm 128³ × 2` | 16 MiB | 量化/容量证据候选，不自动成为产品 fallback |

任一时刻只能有一对 active profile。Profile 选择发生在 pipeline 创建前，因为 storage texture format 是静态 WGSL/layout 事实。若首选 probe失败，创建兼容 fallback；两者都失败则 hierarchical unavailable。

Active pair payload MUST `<=16 MiB`。为原子 rebuild 可短暂同时持有旧/新 pair，但 brick-only peak MUST `<=32 MiB`，并在新 generation 发布后立即销毁旧资源。预算统计必须与 global coarse、W5 shared fields 分开并同时报告总 density memory。

### Decision 4: 一个 Body 最多一个、带 2-voxel gutter 的可变 brick

逻辑 interior 档位固定为 `24³/32³/48³/64³`。每边增加 2 voxel gutter 后，再向上对齐到 8-voxel page：物理边长分别为 `32/40/56/72`。Atlas 使用确定性 8³ page occupancy 与 first-fit 3D box allocation；allocation 必须无重叠、位于 atlas bounds 内，并以 compact Body index 稳定排序。

目标档位由固定函数根据 projected size、Recipe topology frequency 和上一档位计算；升级/降级必须有 hysteresis，不能逐帧抖动。预算不足时按 `64→48→32→24→nonresident` 降级，优先级相同时按 compact index。W9 不驱逐到超预算，也不创建第二个 atlas或 per-body texture。

W9 每 Body 最多一个 brick。高纵横比 Body 仍用 world/body-local affine 映射到单一立方 brick；`w9-thin-ridge-proxy` 记录拉伸低通与空间浪费。若 Gate 证明单 brick不足，结论应为 Stop/Review，并由后续 amendment/new change 为 aspect-aware 或多 brick 给出固定上限。

### Decision 5: 固定 `DensityBrickRecordGPU`，不修改 Recipe layout

新增独立 layout version 1、stride 160 bytes、count 12 的 record buffer。每条至少包含：

- enabled/resident、compact Body index、genus ID、logical/physical edge；
- conservative world Support min/max；
- world → normalized body-local affine transform；
- atlas interior scale/bias 与 physical allocation origin/extent；
- allocation generation、content revision、LOD state 与 reserved-zero lanes。

尾部与 nonresident records 必须确定性归零。Record buffer只供 brick compute 和 hierarchical render bundle只读绑定；不得把 allocation lanes塞入 `DensityRecipeGPU` 或现有 `Params.bodies`。

### Decision 6: Brick compute 每个 dispatch 只求一个 Body

Hierarchical cache update顺序：

```text
global coarse pass
→ brick pass
    for each resident compact Body (max 12 dispatches)
      select record via fixed dynamic offset/push-equivalent uniform
      dispatch physical brick bounds
      gutter voxel clamp/replicate nearest interior coordinate
      map body-local coordinate → world
      call unchanged W8 static evaluator for that Body
      write scalar density to current atlas
```

一个 cache update最多增加一个 compute pass；同一 pass内最多 12 次 dispatch。Brick invocation 不循环 Body，不执行 top-two composition，不写 metadata。W8 family 的 Macro/Base/Detail sample上限保持 2/4/3；Ci/Cb disabled、nonresident、空 Support 与 gutter 外 invocation不得调用 evaluator。

两张 atlas 与 global cache使用同一 `cacheBlend`/update cadence。普通无 cache update帧不重算 brick。Allocation layout变化时，旧/新 atlas不得跨 layout interpolation；新 pair必须完整 warmup后以新 allocation generation原子发布。

### Decision 7: 每 coarse tile 最多 4 个 renderer 候选

W9 从 W4 conservative tile-body mask构建独立 render candidate grid。每 tile固定 8 bytes：header包含 count/overflow/complete/generation，另一个 `u32` 打包最多四个 8-bit compact indices。默认 `96³`、`8×8×4` 为 3,456 tiles，payload 27,648 bytes。

候选规则：

- 所有可能在tile内产生非零Recipe V2密度的active、enabled Body MUST计入源集合；disabled/unsupported Body不得把entry伪造成incomplete；
- 源集合 `<=4` 且所有 Body均有同 generation resident brick时，entry为 complete；
- 源集合 `>4`、任一 Body nonresident、record/atlas generation不一致或 builder失效时，entry标记 overflow/incomplete；
- false-positive允许，false-negative必须使 fixture失败。

Shader只执行固定 `for i<4`，并在 `i>=count` 后早退。不得通过遍历 12 bits寻找候选。Overflow/incomplete不是错误密度：该采样点直接使用 global coarse。

### Decision 8: 完整候选时 brick 替换 coarse，其他情况整点回退

Hierarchical `densityAtTyped(pos)`：

1. 采样现有 coarse RGBA，保留为 fallback；
2. 映射 pos 到 candidate tile；
3. 若 entry不是 complete，返回 coarse；
4. 固定最多四次：检查 record Support，采样双 brick views并按 `cacheBlend` 混合 scalar density；
5. 用 record genus执行与 Legacy一致的 dominant/secondary soft-overlap composition；
6. 返回 brick-composed density/metadata。

不得把 brick density加到 coarse，也不得在 candidate不完整时混合“部分 brick + coarse”。因此不会对同一 Body双重增密。Brick可在 coarse voxel 为零但仍位于 conservative Body Support时产生主体密度；这正是恢复欠采样中尺度结构的目标，但仍不得越出 record Support。

Cloud main ray、light march、density debug和 density-related ground shadow使用同一 hierarchical source helper。W9 不为 ground shadow私自建立不同 density语义；若性能不达标，Gate Stop/Review，优化留给 W12。

### Decision 9: 存储模式与 quality mode保持正交、惰性创建

新增 CPU-only `densityStorageMode`：requested/active为 `global-only|hierarchical`，默认 global-only。它只在 active Producer为 Recipe V2 且 active quality为 Cached/Hybrid时创建/消费 brick resources。

Hierarchical request触发 format probe、atlas/record/candidate resources、brick pipeline与 Cached/Hybrid hierarchical bundles异步创建。候选未 ready或失败时，active storage保持 global-only V2；HUD显示 requested/active/lifecycle/reason。Realtime不消费缓存，不创建或编码 brick resources。

切回 global-only后可销毁或按明确 idle policy保留资源，但 normal frame不能编码 brick。W9默认采用销毁并递增 generation，确保零隐藏显存；再次请求重新 warmup。

### Decision 10: W9 Gate 使用固定视觉、协议、预算与性能阈值

固定 manifests至少包含：

- W8 `single-stratocumulus/altocumulus/cirrocumulus`；
- `w8-cellular-scale`、`w8-cellular-overlap`、`w8-wave-ripple`；
- `w9-brick-lod-sweep`：同一 Body跨 24/32/48/64 档位与 hysteresis；
- `w9-brick-overflow`：5+ 重叠 Body强制整点 coarse fallback；
- `w9-thin-ridge-proxy`：测试单 brick对细长中尺度骨架的保留，不启用 Cirrus Recipe；
- resize、Body add/remove、风平流、相机运动、atlas boundary和 device-loss模拟。

同一设备/浏览器/viewport/camera/time/body/wind下采集 Legacy、global-only V2、hierarchical V2；每个 timing case排除 pipeline/warmup并至少 5 次 cache warmup、60 个有效 timestamp样本。

Continue硬条件：

- 小型 Cellular尺度/层厚/ripple和 thin-ridge proxy相对 global-only有明确、可复核改善；
- 无 gutter seam、LOD popping、相机锁纹、风相位跳变、Support leak、NaN/Inf、metadata错属或 overlap双重增密；
- atlas pair payload `<=16 MiB`、brick-only rebuild peak `<=32 MiB`、候选上限恰好 4，shader无 12-body render loop；
- hierarchical cloud GPU median `<=1.25×` global-only、p90 `<=1.35×`；
- hierarchical density-related ground-shadow GPU median `<=1.35×` global-only、p90 `<=1.50×`；
- coarse+brick cache-update GPU median `<=max(1.75× global-only, global-only+0.50 ms)`，p90 `<=max(2.00×, global-only+0.75 ms)`；
- overflow/nonresident/format failure/resize/device loss均确定性回退 global-only，Legacy与Realtime无回归；
- timestamp、allocation、candidate和显存证据完整。Timestamp不可用或样本不足为 Review，不得写 Continue。

## Migration and Rollback

1. W8 Gate Continue并归档；重新核对本 change deltas。
2. 增加 contracts/storage mode/stats，但保持默认 global-only且不创建 atlas。
3. 实现 format profile、allocator、records与 CPU fixtures。
4. 实现 candidate grid及 overflow global-only fallback。
5. 实现 brick compute与双 atlas warmup，不接 renderer。
6. 实现惰性 hierarchical Cached/Hybrid bundles并接统一采样。
7. 接入 LOD/lifecycle/resize/device loss、HUD与 manifests。
8. 运行自动化、WebGPU视觉/性能 Gate。
9. Gate Stop时删除/关闭 hierarchical request入口或保持实验不可用；global-only V2、Legacy与现有 specs继续有效。

## Risks and Mitigations

- **Atlas碎片导致容量不稳定**：8³ page、确定性 first-fit、最多12 allocations；W9不做动态 compaction。
- **R16F兼容性不足**：创建前 probe；失败使用受限 RGBA16F profile，仍失败则 global-only。
- **部分驻留导致双重增密**：complete tile才使用全 brick composition；否则整点 coarse。
- **候选过多使 render loop膨胀**：K固定为4；overflow不截断而回退 coarse。
- **LOD/重分配跳变**：hysteresis，layout变化整 pair warmup并原子 generation切换，不跨 layout blend。
- **单 brick不适合 Ci/Cb高纵横比**：W9只记录 proxy证据；不在 Spike中无界扩展。失败则停止并另提 bounded方案。
- **Ground shadow成本上升**：统一采样以保证语义；若阈值失败，不在 W9偷偷切分语义，交由后续提案优化。
- **活动 W8 delta冲突**：W9实施前必须等 W8归档并重新核对完整 MODIFIED requirements。

## Open Questions

无阻塞问题。Atlas profile最终 active选择、档位分布和视觉参数必须由 W9 Gate evidence决定，但不得改变 16 MiB resident cap、K=4、单 brick/Body、完整候选替换与 global-only回退不变量。
