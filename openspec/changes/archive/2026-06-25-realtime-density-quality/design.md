## Context

当前取样链路：

- compute `cs` 逐体素调用 `cloudDensity(pos)` 写入 `densityStore`（96³，`cacheUpdateRate` 隔帧 ping-pong 到 `densityTex0/1`）。
- 片元 `fs` 与 `lightMarch` 调用 `sampleDensity(pos)`，对两份缓存 `textureSampleLevel`（linear）后按 `cacheBlend` 时间混合。

`cloudDensity` 内含 voronoi/detail 高频项，进入 96³ 缓存即被体素平均 + 线性插值二次低通，这是模糊上限的根源。

## Goals / Non-Goals

- Goals：提供绕过缓存的实时取样路径根治模糊；提供低成本的高频细节补偿路径；保持默认行为像素级不变。
- Non-Goals：不重写噪声函数本身；不改缓存的双缓冲/时间混合机制（仅在 realtime 下旁路）；不在本次引入自适应/空缺跳格优化（occupancy 由另一变更负责）。

## Decisions

### 取样分发器 `densityAt(pos)`

统一片元与光照行进的密度入口，按 `params.g.qualityMode` 分发：

```wgsl
fn densityAt(pos: vec3f) -> f32 {
  let mode = i32(params.g.qualityMode);
  if (mode == 2) { return cloudDensity(pos); }            // realtime
  let base = sampleDensity(pos);                            // cached base
  if (mode == 1 && base > 0.01) {                          // hybrid
    base *= 1.0 + params.g.detailStrength * (detailNoise(pos * params.g.detailFreq) - 0.5) * 2.0;
  }
  return max(base, 0.0);
}
```

- `mode==0` 等价于现状（直接 `sampleDensity`），保证默认像素级一致。
- `mode==1` 仅在已有基底（`base>0.01`）处叠加 ±高频扰动，避免在空区凭空生成云、并省去满屏噪声开销；高频项复用现有 noise（fbm/worley）按 `detailFreq` 提频。
- `mode==2` 每步实时求密度，清晰度上限取决于 `rayMarchSteps` 而非缓存分辨率。

### realtime 下旁路缓存 compute

`qualityMode==2` 时，`renderFrame` 跳过密度缓存 compute dispatch（缓存内容不被读取，无需更新），抵消一部分实时取样的额外开销。`lightMarch` 同样走 `densityAt`，故光照阴影在 realtime 下也实时求值。

### 参数布局

`Globals` 末尾追加 `qualityMode`、`detailFreq`、`detailStrength` 三个 f32（offsets 19/20/21），`BODY_BASE` 由 20 调整为对齐后的新基偏移（22 → 向上取整到 16 的倍数即 24，保持 std140）。WGSL `Globals` struct 同步追加三字段并补齐对齐。

默认值：`qualityMode=0`、`detailFreq=2.5`、`detailStrength=0.0`（即便误入 hybrid，强度 0 也不改观感）。

## Risks / Trade-offs

- Realtime 性能下降明显（每步全量 `cloudDensity` + 光照行进），需 GUI 提示；用降低 `rayMarchSteps`/`lightMarchSteps` 折中。
- Hybrid 的高频叠加是“伪细节”，与真实 `cloudDensity` 不完全一致，但成本远低于 realtime，作为日常默认增锐手段。
- std140 对齐若算错会整体错位 → 以 `vite build` + 默认值无突变作为回归基线。

## Migration

默认 `qualityMode=0` 保持现状；用户在 GUI 主动切换。无数据迁移。
