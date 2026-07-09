## Context

Ac/Cc evaluator 仍是 `return compatibilityDensity`。兼容链里 Voronoi/`worleyBlend` 能做出一定胞状感，但胞元尺度绑在全局 `scale` 上，无法在「整体云团大小不变」时单独加密/放大鱼鳞。cloud-types 用 `tileScale` 表达这一自由度。

## Goals / Non-Goals

### Goals

- Ac：中空规则云胞行，蓝天缝隙可辨（鲭鱼天）。
- Cc：更高频、更细的鱼鳞/米粒点彩。
- `tileScale` 连续可调；0 精确回退。

### Non-Goals

- 精确气象胞元物理；Sc 卷轴云；按风向拉伸鱼鳞（属 flow-field）。

## Decisions

### D1: 只扩展两个 evaluator

签名对齐 cirrus/Cb：`(compatibilityDensity, pos, bodyIndex)`。零强度早退。其余八属保持标量。公式只在 `altocumulus.wgsl` / `cirrocumulus.wgsl`。

### D2: tileScale 语义

CPU 存 `[0,1]`。shader 映射为相对兼容噪声坐标的水平频率倍率，例如：

`freq = mix(1.0, mix(0.6, 2.2, tileScale), strengthGate)`

其中 strengthGate 在 `tileScale>0` 时启用重塑。cloud-types 的 Ac 0.8 / Cc 1.5 是「相对参考」：实现时把 Cc 默认映射到更高频端，Ac 到中高频，并在固定场景校准后写入 tasks。不得用 `tileScale` 替换或旁路 `shape.scale` 对整体云团的控制。

### D3: 鱼鳞场形式

在云体局部 XZ（可轻度用 Y）上采样低成本 Worley/Voronoi F1，形成重复胞元 mask；与兼容密度做有界 soft intersection / remap，保留 footprint 与垂直包络。Cc 默认频率高于 Ac。禁止在公共兼容链按属分支。

### D4: 布局占用 p7.w

- `p7.x/y/z` 不变（特效）
- `p7.w = tileScale`

更新 `PRESET_P7_OFFSETS.reserved` → `tileScale`，WGSL 常量与 pack/断言同步。不扩 `PRESET_VEC4_COUNT`。

`tileScale` 归入 `PresetMorphology`（与纤维/对流塔同类），GUI 放在云属形态 folder。

### D5: 默认值

- altocumulus：`tileScale` 中高（校准目标 ≈ cloud-types 0.8 观感）
- cirrocumulus：更高（≈ 1.5 观感）
- 其余属：`0`

精确数值实现期 A/B 后记录。

## Risks / Trade-offs

- 缓存分辨率抹平细鱼鳞 → 先 Hybrid/Realtime 验收，Cached 记录可接受降级。
- 频率过高闪烁 → 有界频率 + 既有 TAA；默认避开极端。
- 与 `worleyBlend` 叠加过强 → 重塑以兼容密度为基底，blend 仍控兼容链胞状比例。

## Migration Plan

- 无 scenario 迁移；旧运行时 p7.w=0 即关闭新形态。
- 回退：Ac/Cc `tileScale=0`。

## Open Questions

- 无。默认映射曲线实现期校准。
