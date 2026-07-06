## Context

当前代码把场景尺寸、云体 placement、相机、天气图和 shader 采样都直接绑定到约 0–32 的紧凑 world units。默认 `cloudHeight=8`、`boxHalfExtent=4.5`、相机距离约 10、far plane 100、密度缓存 96³。若只把高度数值改成 12000，默认相机看不到云层，缓存垂直体素会从约 0.083 world unit 变成 125 world units，raymarch 与噪声也会失去原有尺度。

WMO 给出的是随纬度变化且互相重叠的低/中/高层范围，不是十属唯一固定海拔。WMO 还区分相对地面的 height 与相对平均海平面的 altitude。项目没有地形海拔 datum，因此本阶段采用 scene-ground 基准，并把具体 profile 标记为项目的温带 demo 默认值，而不是通用气象定律。

## Goals / Non-Goals

### Goals

- CPU 场景数据和新版 scenario JSON 使用米。
- GPU、相机和程序化噪声继续使用紧凑 render world units。
- 所有跨空间边界经过同一组显式换算函数。
- 建立来源、版本、适用范围明确的十属默认 placement。
- P0 能独立实现、验收、归档，不提前声明风、生命周期或 genus morph 已完成。

### Non-Goals

- 风速 m/s、生命周期与 genus morph。
- MSL、真实地形高度、纬度/季节动态 profile。
- 完整物理云微过程或 Track A 密度场重写。

## Decisions

### D1 — 双空间模型，不采用 1 world unit = 1 meter

系统区分两个空间：

| 空间 | 单位 | 使用位置 |
|---|---|---|
| Physical scene space | meter | `CloudBody`、scenario v2、GUI 数值、profile、约束 |
| Render world space | compact world unit | GPU buffer、weather map、gizmo、camera、raymarch、noise |

新增集中换算：

```ts
worldY = metersY / verticalMetersPerWorldUnit
worldXZ = metersXZ / horizontalMetersPerWorldUnit
metersY = worldY * verticalMetersPerWorldUnit
metersXZ = worldXZ * horizontalMetersPerWorldUnit
```

默认两轴均为 `1000 m/world-unit`，保持物理纵横比一致。`altitudeScale`/`horizontalScale` 迁移为上述字段的兼容别名一个版本，之后删除；它们不再是只改标签的无副作用显示参数。

换算函数位于 CPU 单一模块，shader 不接收“米制 placement”再自行重复换算，避免 double-scale。

### D2 — scene-ground datum，而非绝对海拔

`base=1000` 表示相对场景地面基准上方 1000 m。字段文档使用 “height above scene ground” 或“场景基准高度”，不称 MSL absolute altitude。

未来若引入地形，应另增 `groundElevationM`/`verticalDatum` change；本阶段不让 profile 自动随地形变化。

### D3 — 版本化 Genus Profile

```ts
interface GenusPhysicalProfile {
  recommendedBaseRangeM: readonly [number, number]
  defaultBaseM: number
  defaultThicknessM: number
  defaultHorizontalHalfExtentM: number
  sourceNote: string
}

interface GenusProfileSet {
  id: 'temperate-demo-v1'
  datum: 'scene-ground'
  profiles: Record<PresetKey, GenusPhysicalProfile>
}
```

`recommendedBaseRangeM` 主要依据 WMO 温带层级：低层 0–2000 m、中层 2000–7000 m、高层 5000–13000 m；Nimbostratus 允许延伸到低层。默认 base/top 采用 `../procedural-clouds-threejs/cloud-types.md` 的项目参考值，不宣称是 WMO 唯一值。

| Genus | 推荐 base 范围 m | 默认 base m | 默认 thickness m | 默认水平半宽 m |
|---|---:|---:|---:|---:|
| cumulus | 0–2000 | 1000 | 1500 | 800 |
| stratus | 0–2000 | 300 | 1200 | 5000 |
| stratocumulus | 0–2000 | 600 | 1400 | 3000 |
| cumulonimbus | 0–2000 | 500 | 11500 | 3000 |
| altocumulus | 2000–7000 | 2500 | 2500 | 1500 |
| altostratus | 2000–7000 | 2000 | 3000 | 8000 |
| nimbostratus | 0–7000 | 1000 | 3000 | 10000 |
| cirrus | 5000–13000 | 7000 | 5000 | 4000 |
| cirrostratus | 5000–13000 | 6000 | 5000 | 12000 |
| cirrocumulus | 5000–13000 | 6000 | 4000 | 2000 |

表中的 `defaultThicknessM` 是实例默认厚度，不再通过 `top-base` 重新推导，因此不存在两个默认来源。

### D4 — 默认 placement 与锁定策略

`CloudBody` 新增 `placementLocked: boolean`，默认 false。所有 type 变更必须经过 `BodyStore.setType(id, type, policy?)`：

- `placementLocked=false`：应用目标 genus 的 base、thickness 和水平半宽。
- `placementLocked=true`：只修改 type，保留 placement。
- GUI 手动修改任一 placement 字段后自动设为 locked，并提供“应用云属默认位置”操作解除锁定并重置。

不再允许 GUI 直接写 `body.type` 绕过该路径。

### D5 — 场景尺寸和完整渲染尺度链

物理默认值：

- `cloudHeight=12000 m`
- `boxHalfExtent=16000 m`
- `verticalMetersPerWorldUnit=1000`
- `horizontalMetersPerWorldUnit=1000`

对应渲染盒约为 X/Z ±16、Y 0–12。实现必须同步：

- `packBodies()`：base、top、footprint、feather 从米转 world units。
- `weather.ts`：body bounds 与 box extent 在同一空间绘制。
- `axis/gizmo/line renderer`：几何用 world units，标签/GUI 显示米。
- `camera.ts`：target、distance、wheel limits、near/far 根据转换后的盒体对角线派生。
- density cache：仍覆盖转换后的紧凑盒体；默认 cached/realtime 都需能解析最薄默认云层。
- shader：噪声和 raymarch 继续使用 render world units，避免把现有噪声频率放大 1000 倍。

### D6 — `altBase/altTop` 只描述云体内部剖面

shader 使用：

```wgsl
bodyY = (sampleY - bodyBaseWorld) / max(bodyTopWorld - bodyBaseWorld, epsilon)
profileY = (bodyY - altBase) / max(altTop - altBase, epsilon)
```

placement 已由 body/profile 决定，因此旧值中用于表达“高云位于盒体上部”的 `altBase=0.3/0.6/0.65` 必须移除。迁移基线为十属全部 `[0,1]`；若 A/B 证明某属需要内部收窄，只能基于其自身形态调整，不能重新编码绝对高度层。

`altBase/altTop` 包络与 preset `altitude` 塑形都使用 `profileLocal`，不得再读取全局盒高归一化值来区分高/中/低云。它们属于原始密度形态，edge-style 与 `edgeSharpening` 不得旁路。

### D7 — Scenario v2 与可逆迁移

新版格式：

```json
{
  "schemaVersion": 2,
  "distanceUnit": "m",
  "duration": 70,
  "bodies": {}
}
```

- v2：body 的 `bounds/feather/base/thickness` 与 event 的 `base/thickness` 直接按米读取。
- 缺少 `schemaVersion`：视为 legacy world units；body/event 的 Y 字段乘 `verticalMetersPerWorldUnit`，XZ/feather 乘 `horizontalMetersPerWorldUnit`。
- serializer 只输出 v2/m，并保证 legacy → v2 → reload 的渲染位置一致。
- 风字段本阶段保持 legacy 语义，不借距离迁移顺便宣称为 m/s。

### D8 — 约束在 CPU 执行

`enforcePhysicalPlacement=false`：接受任何合法有限值；GUI 可展示警告，但不改值。

`enforcePhysicalPlacement=true`：

1. clamp `base` 到 profile 的 `recommendedBaseRangeM`；
2. clamp `thickness` 为正，并保证 `base + thickness <= cloudHeight`；
3. 不用“默认 thickness”作为硬上限，因为它是艺术默认而非气象定律。

该 boolean 不写入 GPU uniform；只有约束后的结果进入 pack。

## Risks / Trade-offs

| 风险 | 缓解 |
|---|---|
| 距离字段语义变化影响旧 scenario | schemaVersion + legacy loader + round-trip 验收 |
| 双空间转换散落导致 double-scale | 集中换算模块；所有边界调用同一 API |
| 12000 m 场景改变默认构图 | 转换后盒高仅 12 world units；相机按盒体派生 |
| profile 被误解为气象定律 | profile set 带 `temperate-demo-v1`、datum、sourceNote |
| `altBase/altTop` 重置改变观感 | 十属 cached/realtime A/B，必要时只校准内部剖面 |
| 其他 active changes 同时修改 preset | implementation 前先处理 `lighting-quality`/`per-preset-lighting` 前置状态 |

## Migration Plan

1. 增加空间换算模块与 scenario v2 loader，先建立 legacy round-trip 基线。
2. 将 CPU body/params 默认值迁移为米，GPU pack 前转换回紧凑 world units。
3. 适配 weather、axis、gizmo、camera、GUI 和 renderer。
4. 增加 profile set、集中换属与 placement lock。
5. 接入相对垂直包络并完成十属 A/B。
6. 通过自动检查、构建、OpenSpec 校验和手动视觉验收后归档。
