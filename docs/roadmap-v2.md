# Roadmap v2 — 未完成项合并（快速观感优先）

合并自 `legacy/roadmap.md`（阶段 9/10/11）、`legacy/roadmap-borrow.md`（B–F，A 已由 per-preset-lighting 变更完成）、`legacy/roadmap-reference-borrow.md`（Track A/B）。
主线取「快速观感优先」：先表现层，Track A 云本体靠后；raymarch 加速去重为一条渐进线。

```
1(HDR前置) → 2(Tonemap) → 3(相位+银边) → 4(大气/调色) → 5(TAA) → 6(Bloom)
                                                     ↘ 7(raymarch 渐进线) → 8(云本体 Track A)
9(云属增强)、10(调试/预算) 随时插入；7.2 的 cloudDepth 反哺 5 与 4
```

---

## 阶段 1 — HDR 管线整理（P0，前置必做）

主 `fs` 当前把已 tonemap 的 LDR 写进 `rgba16float` offscreen，后续 Bloom/ACES/TAA/aerial 全部依赖线性 HDR。

- [ ] `shaders/cloud.wgsl` `fs`：删结尾 Reinhard + gamma，输出线性 HDR。
- [ ] `src/renderer.ts` `fsPost`：tonemap + gamma 搬到后处理最末。
- [ ] offscreen 保持 `rgba16float`，post 输出 swapchain。

**验收**：与改前观感一致，无 banding 加重。

---

## 阶段 2 — Tonemap 升级（P1）

- [ ] 默认 ACES Narkowicz 拟合 + `exposure` 曝光系数。
- [ ] tonemap 可切换（备选 AgX / Tony McMapface，规避 ACES 对大面积天空的 hue shift）。
- [ ] 自动曝光微动幅度调小，防闪烁。

**验收**：云顶高光不 clip、暗部不死黑、天空无明显偏色。

---

## 阶段 3 — 相位升级 + 边缘检测银边（P4 + borrow B）

- [ ] HG 前向叶替换为 Cornette-Shanks（能量归一化）或 Jendersie-d'Eon 2023 Mie 近似。
- [ ] 银边改边缘检测：`densityAt(pos + SUN_DIR * d_offset)` 估边缘密度，只在背光（`-sunTheta>0`）薄边缘加银边；强度取 per-type `silverLining`，保留全局 `silverIntensity` 作总开关/倍率。

**验收**：朝阳薄云亮边更锐更白、背光不过亮；银边只出现在背光云缘，厚云内部不再整体泛白。

---

## 阶段 4 — 大气与调色（A4 务实档 + borrow F）

- [ ] 解析 aerial perspective：`exp(-σ·t)` 透射 + 朝阳 HG 内散射加亮 + 高度雾（先用步进距离近似，阶段 7.2 的 `cloudDepth` 落地后接入精确值）。
- [ ] `todColors()` 按太阳高度角分段插值 8 档关键色（dawn/morning/midday/afternoon/golden/sunset/twilight/night）。
- [ ] 云亮面色与阴影色分离驱动（阴影侧用 cloud-types 的 shadow 列）。

**验收**：远云不「贴片」，黄昏时云底被低空散射染色；黄昏/暮色下亮面与阴影冷暖分离、过渡自然。

---

## 阶段 5 — TAA（P3）

- [ ] YCoCg 邻域方差裁剪 + `mix(new, history, 0.95)`，ping-pong history，resize/首帧重置。
- [ ] 相机亚像素 Halton jitter（`src/camera.ts`）；引入后减弱 IGN。
- [ ] 首版用相机矩阵重投影；阶段 7.2 输出 `cloudDepth` 后升级为深度重投影，消相机平移鬼影。

**验收**：静止噪点显著降，`rayMarchSteps` 可降约 30% 观感不劣；慢速移动无明显拖影。

---

## 阶段 6 — Bloom（P2）

- [ ] Jimenez(COD AW 2014) 双滤波 / Kawase 金字塔：亮度阈值 → 渐进降采样(13-tap) → tent 上采样累加（不用 shadertoy 径向采样）。
- [ ] 在 tonemap 之前叠加，`bloomThreshold`/`bloomAmount`。

**验收**：太阳与受光云缘柔和光晕，无方向条纹、不糊主体。

---

## 阶段 7 — Raymarch 加速渐进线（borrow C → A3 → 占据金字塔 → 调度/LOD → 重投影升采样）

### 7.1 低成本技巧（borrow C）

- [ ] 空区快进：`fs` 主循环 `d < 0.01` 时步长翻倍推进。
- [ ] 蓝噪声/R2 序列替代 `interleavedGradientNoise`（与阶段 5 jitter 协调）。
- [ ] light march beer-powder：`lightMarch` 返回 `mix(beer, beer*powder, 0.5)`，与散射段 powder 统一来源。

### 7.2 自适应步进 + 代表性深度（A3）

- [ ] 空步大步推进、命中后回退细分（ratchet），连续空采样递增步长。
- [ ] `transmittance < ε` 早退覆盖 cone/MS 路径。
- [ ] 输出透射率加权平均命中距离 `cloudDepth`（MRT 或加通道），供阶段 4/5 使用。

### 7.3 min-max 占据金字塔 + HDDA（roadmap 阶段 9）

- [ ] 密度 compute 后生成 mip 链（128³→…→8³，存子块 max[/min]），全程 GPU 零回读。
- [ ] `fs` 层级遍历：粗层空则按体素尺寸大步跳，非空下钻精细积分；薄云不被跨过。
- [ ] 仅云内执行 `lightMarch` 与散射累加。
- [ ] 质量参数（云内细步倍率等）+ GUI；默认值复现既有画质，循环有静态上界。

### 7.4 调度与 LOD（roadmap 阶段 10，复用 7.3 金字塔）

- [ ] 空区跳过 compute：占据/包围盒裁剪 `dispatchWorkgroups` 范围。
- [ ] 缓存分辨率/更新频率随相机距离 LOD（`setDensityResolution`/`cacheUpdateRate`）。
- [ ] 远距离 fallback：烘焙到 cubemap。

### 7.5 时序重投影升采样（P5，需 7.2 + 阶段 5）

- [ ] clouds 渲 1/4 分辨率 + 16(4×4) 帧轮转更新，用 `cloudDepth` 重投影重建全分辨率（取代 borrow C 的简单半分辨率方案）。

**验收**：相同画质下总采样/光照行进次数显著下降；空旷视角帧时间明显下降；clouds pass 成本降约 4×，移动时重建无明显瑕疵。

---

## 阶段 8 — 云本体 Track A（商业级核心，A1 → A2 → A4 商业档）

### 8.1 密度模型重建（A1）

- [ ] `noise.wgsl` 新增 Perlin-Worley / 高频 Worley / curl 噪声。
- [ ] `evalBody` 重写为「基础形状 × 高度梯度 → 高频 Worley 边缘侵蚀（remap）→ curl 边缘畸变」。
- [ ] weather map 扩多通道（coverage / cloud-type / precipitation）；逐类型高度-密度包络对齐真实梯度；coverage remap 保证 0 覆盖真空。
- [ ] 先在 `qualityMode==2` 解析路径验证，再回灌缓存。

**验收**：积云菜花团块 + 拉丝边、积雨云砧顶、层云扁平连续，三类肉眼可辨且不靠后处理。

### 8.2 光照模型（A2）

- [ ] Cone-sampled light march（朝太阳 5–6 步锥形偏移采样，软化自阴影）。
- [ ] `sunVisibility` 形式化为 N-octave 多重散射（Hillaire，a=b=c≈0.5 递降）。
- [ ] 每步散射解析积分 `S = (1-exp(-σ·dt))·scatter/σ`，步长无关。
- [ ] MS 做对后减弱/关闭 powder（保留为可选风格化）。

**验收**：厚云朝阳侧 silver lining 自然、背阳侧不死黑、调步数观感稳定。

### 8.3 大气商业档（A4）

- [ ] 预计算大气 LUT（Bruneton-Neyret / Hillaire 2020 aerial LUT），云色与天空物理一致。
- [ ] 天空模型升级 Hosek-Wilkie 或 Bruneton，替代 `todColors` 线性渐变。

**验收**：地平线过渡连续，云色与天空物理一致。

---

## 阶段 9 — 云属细节增强（borrow D/E，随时插入）

- [ ] 卷云方向性 domain warping：cirrus 系预设增 `directional/curlStrength`，高空带（altBase>0.6）采样坐标沿风向域扭曲成弯钩细丝，仅 cirrus 类启用。
- [ ] altostratus `sunDiscVisible`：薄云档透出朦胧日盘。
- [ ] cirrostratus `haloEffect`：22° 日晕亮环。
- [ ] cumulonimbus `internalLightning`：随机内部暖色闪光脉冲。

---

## 阶段 10 — 调试与性能工具（roadmap 阶段 11 + reference，随时插入）

- [ ] `debugView` uniform + 调试视图：透射率、累计散射、步数热力图、`cloudDepth`、weatherMap/coverage、区域边界、占据金字塔层级、单 octave MS 贡献、当前 `sceneTime`。
- [ ] 帧预算分项打点（基于 `getStats` GPU timing）：clouds ≤ 4–6 ms @1080p60，light march ≤ 主步进 ~40%，后处理 ≤ 1.5 ms。

---

## 不做 / 暂缓

- mesh-cluster / billboard WebGL2 降级路径；预烘焙噪声纹理（已有密度缓存）。
- 参考工程的地球大气球壳、海洋高度场、立方体 SDF。
- 色差/暗角：阶段 2 后按需加在 post 末尾。
