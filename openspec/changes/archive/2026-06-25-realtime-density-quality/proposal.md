## Why

云体模糊的根因是渲染管线把 `cloudDensity()` 预烘焙进低分辨率 3D 体积缓存（`cacheResolution=96`，包围盒 XZ≈9 / 高≈8，每体素≈0.09 单位），再用 `sampleDensity()` 做三线性 `linear` 插值采样。`cloudDensity` 里 voronoi/detail 的高频结构写进 96³ 缓存时被体素平均、采样时又被线性插值低通，边缘与细丝被抹圆 → 整体发糊。即使把 `cacheResolution` 拉满，缓存本身仍是细节瓶颈：清晰度上限被缓存分辨率卡死。次要柔化来自 `rayMarchSteps=48` 步长偏大、`cacheUpdateRate` 隔帧 + 时间 ping-pong 混合的拖影、以及采样器全 `linear` 低通。

要根治而非缓解，需要一条绕过缓存、在 raymarch 内实时求密度的路径，或在缓存采样后补一层高频细节。

## What Changes

- 新增渲染质量模式 `qualityMode`（`src/params.ts` 的 `RenderParams`/`Globals`）：
  - `0 Cached`（现状）：`sampleDensity` 读双缓存 + 时间混合，性能优先。
  - `1 Hybrid`：缓存采样得到低频基底后，按采样位置实时叠加一层高频 detail noise（`detailFreq`/`detailStrength` 控制），以低成本恢复边缘锐度。
  - `2 Realtime`：raymarch 每步直接调用 `cloudDensity(pos)`，完全跳过缓存，清晰度上限解除，代价是性能。
- `shaders/cloud.wgsl`：把 `fs`/`lightMarch` 的取样统一改为走 `densityAt(pos)` 分发器，按 `qualityMode` 选择缓存 / 缓存+高频 / 实时路径；新增 `detailFreq`/`detailStrength` 字段。Realtime 模式下 compute 缓存 pass 可跳过（不更新缓存）。
- `src/renderer.ts`：`qualityMode==2` 时跳过密度缓存 compute pass（省一遍 96³ dispatch）；其余模式不变。
- `src/gui.ts`：Render 文件夹新增 Quality Mode 下拉与 Detail Freq/Strength 控件。

## Capabilities

### New Capabilities
- `cloud-rendering`: 体积云密度取样管线——支持缓存（cached）、缓存+实时高频细节（hybrid）、完全实时逐步求密度（realtime）三种质量模式，并将 raymarch 与光照行进的取样统一到单一分发入口。

### Modified Capabilities
- `cloud-params`: `RenderParams` SHALL 扩展 `qualityMode`、`detailFreq`、`detailStrength` 字段，经既有 `packParams` 单一事实来源打包，默认值（`qualityMode=0`）复现引入前观感。

## Impact

- `src/params.ts`：`PARAM_OFFSETS`/`Globals` 扩展 3 个 float（注意 `BODY_BASE` 随之同步、保持 std140 16 字节对齐），`CloudParams`/`createDefaultParams`/`buildParams` 增字段。
- `shaders/cloud.wgsl`：`Globals` struct 扩展；新增 `densityAt()` 分发与高频 detail 叠加函数；`fs` 与 `lightMarch` 改用 `densityAt`。
- `src/renderer.ts`：realtime 模式跳过缓存 compute pass。
- `src/gui.ts`：Render 文件夹新增控件。
- 向后兼容：默认 `qualityMode=0` 时画面与引入前一致（缓存路径不变）。
- 验收基线：切到 Realtime，云的边缘/细丝明显变锐、缓存分辨率不再是上限；Hybrid 在保留缓存性能的同时边缘可见增锐；Cached 与现状像素级一致。
