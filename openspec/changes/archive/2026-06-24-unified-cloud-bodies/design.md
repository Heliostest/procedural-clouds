## Context

现状（阶段 7 后）：
- `params.ts` 有固定 `LAYER_COUNT=3`，`extraLayers[2]` 描述中/高层，layer0 复用全局 Shape/Wind。
- `weather.ts` 把若干 `Region`（A/B，可挂 lifecycle）画进 `texture_2d_array`（每层一张，R=coverage/G=type/B=densityScale/A=morph），`paintRegions` 每帧重绘。
- `cloud.wgsl` 遍历固定 3 层，每层采样对应天气数组层 + 该层 wind/band。
- `scenario.ts` 的 `ScenarioPlayer` 产出 `Region[]`+`RegionMod[]` 驱动天气图。

三套概念（层/区域/全局Shape）数据结构不同、UI 不同。本提案统一为 `CloudBody`。

## Goals / Non-Goals

**Goals:**
- 单一 `CloudBody` 模型同时表达横向范围、垂直位置、云属、强度、风、演化。
- UI 自由增删改云体；scenario 复用同一模型。
- 演化/场景调制走廉价 uniform，几何不变不重绘形状图。
- 取代固定层与区域 A/B 两套对外概念。

**Non-Goals:**
- 不做每体自定义形态（仅选预设 `type`）；自定义 noise scale/detail 留后续。
- 不做云体间物理耦合（阴影互投、合并/分裂）。
- 不做可视化拖拽编辑器（先用数值面板 + 线框高亮）。

## Decisions

### D1：CloudBody 数据模型（CPU）
```ts
interface CloudBody {
  id: string;
  shape: 'rect' | 'circle';
  bounds: number[];        // rect:[minX,minZ,maxX,maxZ] circle:[cx,cz,r]
  feather: number;
  base: number;            // 归一化高度带下沿 [0,1]
  thickness: number;
  type: string;            // 云属预设名
  coverage: number;
  densityScale: number;
  wind: { dirDeg: number; speed: number; morphRate: number };
  lifecycle?: LifecycleEnvelope;
}
```
`BodyStore`：内部 `CloudBody[]`，提供 `add(partial)`/`remove(id)`/`update(id,patch)`/`list()`；`id` 自增生成。

### D2：GPU 表达——形状图 + per-body uniform
固定层的「每层一张多通道天气图」泛化为：
- **形状图**：`texture_2d_array`，`r8unorm`，depth = `MAX_BODIES`（默认 12）。第 i 层只存第 i 个云体羽化后的归一化横向轮廓 alpha∈[0,1]。仅当某云体的 `shape/bounds/feather` 变化时重绘该层。
- **per-body uniform**：`array<BodyGPU, MAX_BODIES>`，每体 3×vec4f：
  - `geom = (base, thickness, typeIdx, enabled)`
  - `wind = (dirX, dirY, speed, morphRate)`
  - `mod  = (coverage, densityScale, morph, _)`
- `activeBodyCount : u32`（globals）。

`coverage/densityScale/morph` 含 lifecycle/scenario 调制，作为标量每帧写入（廉价），无需重绘形状图。`type` 为离散预设索引（per-body 常量，不逐像素）。

- 否决「保留多通道天气图逐像素 type/densityScale」：type/强度对单个云体是常量，逐像素冗余；改 per-body 标量后形状图降到 1 通道，显存 256²×12×1B≈0.79MB，且省每帧整图重绘。
- `MAX_BODIES` 先用 uniform 数组（48B×12+globals≈0.7KB，远低于 64KB）；后续若需更多云体可平滑换 storage buffer。

### D3：着色器遍历
```wgsl
fn cloudDensity(pos) -> f32 {
  let objRaw = vec3f(pos.x, pos.z, pos.y);
  var total = 0.0;
  for (var i = 0u; i < activeBodyCount; i++) {
    let b = bodies[i];
    if (b.geom.w < 0.5) { continue; }              // enabled
    let uv = worldToUv(objRaw.xy);
    let alpha = textureSampleLevel(shapeTex, samp, uv, i, 0.0).r;
    if (alpha < 0.01) { continue; }
    let coverage = alpha * b.mod.x;                 // mod.x=coverage(含调制)
    // band 垂直门控(base,thickness) + b.wind 平流 + presetShape(typeIdx)
    total += evalBody(pos, objRaw, b, coverage);
  }
  return total;
}
```
`evalBody` 复用现有 5 阶段密度（高度掩膜/Voronoi/截断/falloff），垂直 band 与平流取自该体。

### D4：演化与 scenario 统一
- 手动模式：`BodyStore.list()` → 每帧对挂了 `lifecycle` 的云体求 `evalBodyMod(body.lifecycle, sceneTime)` 得 `{coverageMul,densityScale,morph}`，与 body 基值相乘 → 写 per-body uniform；几何不变不重绘形状图。
- scenario 模式：`ScenarioPlayer.sample(t)` 输出 `CloudBody[]`（已含当前 coverage/densityScale/type/band/wind），renderer 据此重绘变化的形状层 + 写 uniform。
- `Scenario`：
```ts
interface ScenarioBody { shape; bounds; feather; base; thickness; type; }
interface ScenarioEvent { t; bodyId; coverage?; densityScale?; type?; base?; thickness?; windDeg?; windSpeed?; ease?; }
interface Scenario { duration; wind?; bodies: Record<string, ScenarioBody>; events; }
```
向后兼容：`parseScenario` 见到旧 `regions` 字段时映射为 `bodies`（补 `base=0`、`thickness=0.4` 等低层默认），`regionId`→`bodyId`。

### D5：UI（彻底替换）
移除 Shape / Layer / High-Altitude Layers / Weather Regions(A/B) 面板。新增「Cloud Bodies」面板：
- 顶部按钮：Add Rect / Add Circle / Remove Selected。
- 每个云体一个折叠子面板：bounds（按 shape 显示 center/size 或 center/radius）、feather、base、thickness、type 下拉、coverage、densityScale、wind(dir/speed/morph)、lifecycle(enable/birth/grow/decay/death/peak)。
- 选中的云体线框高亮（renderer 按该体 band 的 `base*H`~`(base+thickness)*H` 高度画框）。
- 保留全局：渲染质量、缓存、太阳/光照、scenario 控制。

### D6：线框与调试
`buildLineVerts` 改为按云体 band 高度（而非整 box `cloudHeight`）画框，使不同高度云体的框立体可辨。

## Risks / Trade-offs

- [`MAX_BODIES` 上限] → 默认 12，超出忽略并控制台告警；预留 storage buffer 升级路径。
- [大量云体时 compute 每体素遍历] → `alpha<eps`/`enabled`/band 外 early-continue；典型场景个位数云体。
- [彻底替换破坏旧 GUI 习惯与旧天气配置] → 一次性迁移；保留旧 scenario JSON 兼容，降低数据损失。
- [形状图层数固定 = 显存常驻 12 层] → r8unorm 单通道，<1MB，可接受。

## Open Questions

- `MAX_BODIES` 取值（默认 12 是否够）？
- 是否给云体增加可选噪声 `scale/detail` 覆盖（突破纯预设形态）？倾向后续。
- scenario 是否需要「创建/销毁云体」事件（而非仅调制已声明云体）？本期事件仅调制 `bodies` 中已声明者，coverage→0 即视觉消失。
