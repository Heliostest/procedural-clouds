# Roadmap v2 — 未完成项合并（快速观感优先，已调序）

合并自 `legacy/roadmap.md`（阶段 9/10/11）、`legacy/roadmap-borrow.md`（B–F，A 已由 per-preset-lighting 变更完成）、`legacy/roadmap-reference-borrow.md`（Track A/B）。

调序原则：
- 调试/打点最先做——后续所有阶段的验收都靠它量化。
- `cloudDepth`（阶段 3）前移到 aerial 与 TAA 之前，避免"先近似后返工"做两遍。
- 重投影升采样（阶段 9）先于占据金字塔（阶段 10）；做完 9 后 10 的边际收益缩水，按实测再决定。
- 原 7.1 的 light-march beer-powder 统一项已删：与 Track A2"做对 MS 后关闭 powder"矛盾，并入 11.2。
- 两个 **重校准点**：HDR 化 + tonemap 更换后（阶段 4），密度/光照重写后（阶段 11）。前面阶段的调参验收不是一劳永逸的。

> 路线取舍提示：本主线适合"先要好看的 demo"。若确定冲商业级（阶段 11 必做），在旧密度场上精修阶段 5/6 的调参意义有限，可考虑把 11 提前到 5 之前（即 reference 原顺序 P0→A1→A2→…）。

```
1(HDR前置) → 2(调试/打点) → 3(空区快进+cloudDepth) → 4(Tonemap ★校准1)
→ 5(相位+银边) → 6(大气/调色) → 7(TAA) → 8(Bloom, 可随时并行)
→ 9(重投影升采样) → 10(占据金字塔/LOD, 按实测决定)
→ 11(云本体 Track A ★校准2) → 12(云属增强, 随时插入)
```

---

## 阶段 1 — HDR 管线整理（P0，前置必做）

主 `fs` 当前把已 tonemap 的 LDR 写进 `rgba16float` offscreen，后续 Bloom/ACES/TAA/aerial 全部依赖线性 HDR。

- [ ] `shaders/cloud.wgsl` `fs`：删结尾 Reinhard + gamma，输出线性 HDR。
- [ ] `src/renderer.ts` `fsPost`：tonemap + gamma 搬到后处理最末。
- [ ] offscreen 保持 `rgba16float`，post 输出 swapchain。

**验收**：与改前观感一致，无 banding 加重。

---

## 阶段 2 — 调试与性能打点基础（原阶段 10 前移）

后续阶段的验收（"帧时间下降""调步数观感稳定"）没有它无法量化。

- [ ] `debugView` uniform + 基础调试视图：透射率、累计散射、步数热力图、weatherMap/coverage、区域边界、当前 `sceneTime`（`cloudDepth` 视图归阶段 3，金字塔层级归阶段 10，MS octave 归阶段 11）。
- [ ] 帧预算分项打点（基于 `getStats` GPU timing）：clouds pass / light march / 后处理分项计时。
- [ ] 目标预算记录：clouds ≤ 4–6 ms @1080p60，light march ≤ 主步进 ~40%，后处理 ≤ 1.5 ms。

**验收**：GUI 可切换各调试视图；每帧分项耗时可读。

---

## 阶段 3 — Raymarch 基础加速 + 代表性深度（borrow C 精简 + A3）

`cloudDepth` 是阶段 6（aerial）与阶段 7（TAA 深度重投影）的输入，必须先落地。

- [ ] 空区快进：`fs` 主循环 `d < 0.01` 时步长翻倍推进；命中后回退细分（ratchet），连续空采样递增步长。
- [ ] `transmittance < ε` 早退覆盖所有光照路径。
- [ ] 输出透射率加权平均命中距离 `cloudDepth`（MRT 或加通道）+ 对应调试视图。
- [ ] 蓝噪声/R2 序列替代 `interleavedGradientNoise`（与阶段 7 jitter 协调）。

**验收**：空旷视角步数显著下降（看阶段 2 热力图），密集区质量不降；`cloudDepth` 可视化正确。

---

## 阶段 4 — Tonemap 升级（P1）★重校准点 1

- [ ] 默认 ACES Narkowicz 拟合 + `exposure` 曝光系数。
- [ ] tonemap 可切换（备选 AgX / Tony McMapface，规避 ACES 对大面积天空的 hue shift）。
- [ ] 自动曝光微动幅度调小，防闪烁。
- [ ] **重校准**：HDR 化 + tonemap 更换后，统一复查现有光照参数（`silverIntensity`/`powderStrength`/per-preset 光照/太阳与环境色强度）并回填默认值。

**验收**：云顶高光不 clip、暗部不死黑、天空无明显偏色；默认参数下观感不劣于改前。

---

## 阶段 5 — 相位升级 + 边缘检测银边（P4 + borrow B）

> 注：本阶段调参建立在旧密度场上，阶段 11.1 重写密度后需重校准（见 ★校准2）。

- [ ] HG 前向叶替换为 Cornette-Shanks（能量归一化）或 Jendersie-d'Eon 2023 Mie 近似。
- [ ] 银边改边缘检测：`densityAt(pos + SUN_DIR * d_offset)` 估边缘密度，只在背光（`-sunTheta>0`）薄边缘加银边；强度取 per-type `silverLining`，保留全局 `silverIntensity` 作总开关/倍率。

**验收**：朝阳薄云亮边更锐更白、背光不过亮；银边只出现在背光云缘，厚云内部不再整体泛白。

---

## 阶段 6 — 大气与调色（A4 务实档 + borrow F，直接用 cloudDepth）

- [ ] 解析 aerial perspective：`exp(-σ·t)` 透射 + 朝阳 HG 内散射加亮 + 高度雾，距离取阶段 3 的 `cloudDepth`。
- [ ] `todColors()` 按太阳高度角分段插值 8 档关键色（dawn/morning/midday/afternoon/golden/sunset/twilight/night）。
- [ ] 云亮面色与阴影色分离驱动（阴影侧用 cloud-types 的 shadow 列）。

**验收**：远云不「贴片」，黄昏时云底被低空散射染色；黄昏/暮色下亮面与阴影冷暖分离、过渡自然。

---

## 阶段 7 — TAA（P3，直接深度重投影）

- [ ] YCoCg 邻域方差裁剪 + `mix(new, history, 0.95)`，ping-pong history，resize/首帧重置。
- [ ] history 重投影用阶段 3 的 `cloudDepth`（非仅相机矩阵，否则平移鬼影）。
- [ ] 相机亚像素 Halton jitter（`src/camera.ts`）；引入后减弱蓝噪声抖动幅度。

**验收**：静止噪点显著降，`rayMarchSteps` 可降约 30% 观感不劣；慢速移动无明显拖影。

---

## 阶段 8 — Bloom（P2，无依赖，可与 5–7 并行）

- [ ] Jimenez(COD AW 2014) 双滤波 / Kawase 金字塔：亮度阈值 → 渐进降采样(13-tap) → tent 上采样累加（不用 shadertoy 径向采样）。
- [ ] 在 tonemap 之前叠加，`bloomThreshold`/`bloomAmount`。

**验收**：太阳与受光云缘柔和光晕，无方向条纹、不糊主体。

---

## 阶段 9 — 时序重投影升采样（P5，需阶段 3 + 7）

- [ ] clouds 渲 1/4 分辨率 + 16(4×4) 帧轮转更新，用 `cloudDepth` 重投影重建全分辨率，与 TAA 共用 history 体系。

**验收**：clouds pass 成本降约 4×（看阶段 2 打点），移动时重建无明显瑕疵。

---

## 阶段 10 — 占据金字塔 + HDDA、调度/LOD（roadmap 阶段 9/10，按实测决定）

> 做完阶段 9 后每帧只更新 1/16 像素，本阶段边际收益缩水。先看阶段 2 打点：若 clouds pass 仍超预算再做；否则跳过或降级。

### 10.1 min-max 占据金字塔 + HDDA

- [ ] 密度 compute 后生成 mip 链（128³→…→8³，存子块 max[/min]），全程 GPU 零回读。
- [ ] `fs` 层级遍历：粗层空则按体素尺寸大步跳，非空下钻精细积分；薄云不被跨过。
- [ ] 仅云内执行 `lightMarch` 与散射累加。
- [ ] 质量参数 + GUI + 金字塔层级调试视图；默认值复现既有画质，循环有静态上界。

### 10.2 调度与 LOD（复用 10.1 金字塔）

- [ ] 空区跳过 compute：占据/包围盒裁剪 `dispatchWorkgroups` 范围。
- [ ] 缓存分辨率/更新频率随相机距离 LOD（`setDensityResolution`/`cacheUpdateRate`）。
- [ ] 远距离 fallback：烘焙到 cubemap。

**验收**：相同画质下总采样/光照行进次数显著下降；空旷视角帧时间明显下降。

---

## 阶段 11 — 云本体 Track A（商业级核心）★重校准点 2

### 11.1 密度模型重建（A1）

- [ ] `noise.wgsl` 新增 Perlin-Worley / 高频 Worley / curl 噪声。
- [ ] `evalBody` 重写为「基础形状 × 高度梯度 → 高频 Worley 边缘侵蚀（remap）→ curl 边缘畸变」。
- [ ] weather map 扩多通道（coverage / cloud-type / precipitation）；逐类型高度-密度包络对齐真实梯度；coverage remap 保证 0 覆盖真空。
- [ ] 先在 `qualityMode==2` 解析路径验证，再回灌缓存。

**验收**：积云菜花团块 + 拉丝边、积雨云砧顶、层云扁平连续，三类肉眼可辨且不靠后处理。

### 11.2 光照模型（A2）

- [ ] Cone-sampled light march（朝太阳 5–6 步锥形偏移采样，软化自阴影）。
- [ ] `sunVisibility` 形式化为 N-octave 多重散射（Hillaire，a=b=c≈0.5 递降）+ MS octave 调试视图。
- [ ] 每步散射解析积分 `S = (1-exp(-σ·dt))·scatter/σ`，步长无关。
- [ ] MS 做对后减弱/关闭 powder（保留为可选风格化）。
- [ ] **重校准**：密度/光照重写后，复查阶段 5 银边参数与 per-preset 光照数值。

**验收**：厚云朝阳侧 silver lining 自然、背阳侧不死黑、调步数观感稳定。

### 11.3 大气商业档（A4）

- [ ] 预计算大气 LUT（Bruneton-Neyret / Hillaire 2020 aerial LUT），云色与天空物理一致。
- [ ] 天空模型升级 Hosek-Wilkie 或 Bruneton，替代 `todColors` 线性渐变。

**验收**：地平线过渡连续，云色与天空物理一致。

---

## 阶段 12 — 云属细节增强（borrow D/E，随时插入）

- [ ] 卷云方向性 domain warping：cirrus 系预设增 `directional/curlStrength`，高空带（altBase>0.6）采样坐标沿风向域扭曲成弯钩细丝，仅 cirrus 类启用。
- [ ] altostratus `sunDiscVisible`：薄云档透出朦胧日盘。
- [ ] cirrostratus `haloEffect`：22° 日晕亮环。
- [ ] cumulonimbus `internalLightning`：随机内部暖色闪光脉冲。

---

## 不做 / 暂缓

- mesh-cluster / billboard WebGL2 降级路径；预烘焙噪声纹理（已有密度缓存）。
- 参考工程的地球大气球壳、海洋高度场、立方体 SDF。
- 色差/暗角：阶段 4 后按需加在 post 末尾。
- light-march beer-powder 统一（原 borrow C 项）：与 11.2 关闭 powder 矛盾，不单独做。
