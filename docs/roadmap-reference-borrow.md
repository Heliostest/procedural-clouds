# 云渲染升级路线图（面向商业级表达）

参考输入：`MiniVerse/reference`（Sky Ocean Sun 四通道管线 + 云雾盒子噪声）。
但**蓝本不止于此**——见下方定位。本路线图分两条主线：
- **Track A 云本体（密度 + 光照）**：决定能否达到商业级的核心壁垒。
- **Track B 画面表现（后处理）**：把已有信号呈现好的"最后一公里"，相对容易。

---

## 0. 商业级基准与本路线图定位

`Sky Ocean Sun` 是 Quilez/Shadertoy 风格的**艺术化大气云**，属"好看的爱好级"，不是商业级蓝本。它适合借鉴**相位、后处理、雾混合**等表现手法，但其密度模型与光照模型不足以支撑商业级保真。

商业级实时体积云的工程基准（应作为 Track A 的对标）：
- **Nubis** — Schneider & Vos, *The Real-time Volumetric Cloudscapes of Horizon: Zero Dawn*, SIGGRAPH 2015；Schneider, *Nubis (Decima)*, 2017；*Nubis, Evolved*, 2023。
- **Frostbite** — Hillaire, *Physically Based Sky, Atmosphere and Cloud Rendering*, SIGGRAPH 2016（多重散射 octave 近似、能量守恒积分）。
- **RDR2** — Bauer, *Creating the Atmospheric World of Red Dead Redemption 2*, SIGGRAPH 2019。

**诚实定位**：当前工程 + 原 P0–P7 后处理升级 ≈ 高质量爱好级。要冲商业级，**Track A 必须落地**，否则后处理再好也只是给爱好级云上滤镜。

---

## 1. 现状基线（移植前必须明确）

| 项 | 现状 | 位置 |
|----|------|------|
| 密度模型 | Blender 节点图：高度 mask + Voronoi(F1) + FBM 混合 + 阈值锐化 | `cloud.wgsl` `evalBody` |
| 噪声 | Voronoi/Perlin FBM；**无 Perlin-Worley、无 curl、无独立高频侵蚀** | `noise.wgsl` |
| 天气 | per-body 2D `weatherTex` array，单次采样，无大尺度演化 | `evalBody` |
| 相位 | 双叶 HG（前向/后向混合），**未能量归一化** | `dualHG/hgPhase` |
| 多重散射 | `sunVisibility` 3 octave Beer 近似（实为 Frostbite-style MS 的雏形，未形式化） | `sunVisibility` |
| 光照步进 | `lightMarchDepth` 指数步长、**单方向无 cone**、无相位 | `lightMarchDepth` |
| Raymarch | **固定步数**，无空步跳过、无自适应、无代表性深度输出 | `fs` 主循环 |
| Tonemap | Reinhard `x/(x+1)` + gamma，**错误地在主 fs 内**对 HDR offscreen 做 | `fs` 结尾 |
| 后处理 | 仅 godray | `renderer.ts` `postShaderSource` |
| 背景/大气 | `bg→top` 线性渐变，**无大气散射/aerial perspective** | `todColors` / `fs` |
| 时序 | 双缓冲密度缓存 + `cacheBlend`（类 froxel 时序混合），**无像素级 TAA/重投影升采样** | `renderFrame` |

**公共前置坑**：主 `fs` 把 LDR（已 tonemap）写进了 HDR `rgba16float` offscreen。任何 Bloom/ACES/TAA/aerial 都依赖线性 HDR，故 **P0 必须先做**。

---

## Track A — 云本体（商业级核心，优先级最高）

### A1. 密度模型重建（最高优先，决定上限）

**目标**：从 Voronoi 阈值云升级为 Nubis 式分层密度场。

**支柱（缺一不可）**
1. **基础形状**：低频 **Perlin-Worley** 3D 噪声（Perlin 连通性 + Worley 团块感），替代/补充当前 FBM 基底。
2. **高频侵蚀**：独立 **Worley** 高频噪声在边缘做 `remap` 侵蚀（`density = remap(base, worley*strength, 1, 0, 1)`），产生菜花状细节。
3. **Curl 噪声畸变**：边缘带用 curl noise 扰动采样坐标，制造 wispy 拉丝（avoids 直愣愣的噪声边）。
4. **Weather map**：2D 通道编码 coverage / cloud-type / precipitation（本工程已有 per-body weatherTex，可扩为多通道）。
5. **逐类型高度-密度梯度**：stratus/cumulus/cumulonimbus 各自的垂直密度包络（本工程 preset 体系已具雏形，需对齐到真实梯度曲线）。
6. **Coverage remap**：用 `remap`/`smoothstep` 把 coverage 映射到密度，保证 0 覆盖处真正空。

**落地**：`noise.wgsl` 新增 perlin-worley / worley / curl；`cloud.wgsl` `evalBody` 重写 STAGE 1–4 为"基础形状 × 高度梯度 → 高频侵蚀 → curl 边缘"。
**验收**：积云有菜花团块 + 拉丝边；积雨云有砧顶；层云扁平连续。三类肉眼可辨且不靠后处理。
**风险**：最大改动项；建议在 `qualityMode==2`(解析路径)先验证，再回灌缓存。

### A2. 光照模型：cone 采样 + 能量守恒多重散射

**目标**：自阴影柔和、云内透光分层、能量守恒不发灰/不过曝。

**步骤**
1. **Cone-sampled light march**（Schneider）：朝太阳做 5–6 步，每步在一个逐渐张开的圆锥内偏移采样，软化自阴影。
2. **多重散射 octave 形式化**（Hillaire 2016）：把现有 `sunVisibility` 改为标准 N-octave MS——每 octave 衰减 extinction(a)、scattering(b)、phase 各向异性(c)，`a=b=c≈0.5` 递降，求和。这是商业级"便宜 MS"的标准式，目前的 3 octave 是其雏形，需规范化并与主步进的散射积分统一。
3. **能量守恒积分**：每步散射用解析积分 `S = (1-exp(-σ·dt))·scatter/σ` 而非当前 `1-exp(-d)` 的 ad hoc 乘子，保证步长无关。
4. **Beer-Powder 取舍**：powder 是暗边 hack；做对 MS 后**减弱或关闭** powder，避免双重压暗。保留为可选风格化。

**落地**：`cloud.wgsl` `lightMarchDepth`→`lightMarchScatter`；`fs` 散射项改解析积分。
**验收**：厚云朝阳侧 silver lining 自然、背阳侧不死黑、调步数观感稳定（能量守恒标志）。

### A3. 自适应 Raymarch + 空步跳过 + 代表性深度

**目标**：在固定预算内提质，并为 TAA/aerial 提供深度。

**步骤**
1. **空步跳过**：密度为 0 时用大步推进，命中密度后回退细分（ratchet）；连续空采样递增步长。
2. **早退**：`transmittance<ε` 提前退出（已有），补充 cone/MS 路径同样早退。
3. **代表性云深度**：输出透射率加权平均命中距离 `cloudDepth`，供 A4 aerial 与 B3 TAA 重投影使用。
4. **Blue-noise 抖动**：现 IGN 可保留；引入 jitter 后（B3）协调。

**落地**：`fs` 主循环改自适应步进，新增第二输出 `cloudDepth`（offscreen 加一通道或 MRT）。
**验收**：空旷视角步数显著下降，密集区质量不降；`cloudDepth` 可视化正确。

### A4. 大气与 aerial perspective（替代简化雾）

**目标**：云随距离正确地被大气内散射染色，远云融入天空。

**步骤（按投入分两档）**
- **务实档**：解析 aerial——`exp(-σ·t)` 透射 + 朝阳 HG 内散射加亮 + 高度雾，作为 P5 的强化版。
- **商业档**：预计算大气 LUT（Bruneton-Neyret 2008 / Hillaire 2020 aerial perspective LUT），云色与天空物理一致；天空模型升级为 Hosek-Wilkie 或 Bruneton（替代 `todColors` 线性渐变）。

**落地**：`cloud.wgsl` `fs` 末尾用 `cloudDepth` 做 aerial 混合；商业档新增 LUT 预计算 pass。
**验收**：远云不"贴片"，黄昏时云底被低空散射染色，地平线过渡连续。

---

## Track B — 画面表现（后处理，依赖 P0）

### P0. HDR 管线整理（前置，必做）
1. `fs`：删掉结尾 Reinhard + gamma，`return vec4f(outColor,1.0)`（线性 HDR）。
2. `renderer.ts` post `fsPost`：tonemap+gamma 搬到此处最末。
3. offscreen 保持 `rgba16float`，post 输出 swapchain。
**验收**：与改前观感一致，无 banding 加重。

### P1. ACES（或更优）Tonemap
- 默认 ACES Narkowicz 拟合 + 曝光系数 `exposure`。
- **备注色偏**：ACES RRT 有蓝→青/红→橙的 hue shift 与高饱和扭曲；对天空/晚霞影响可见。**备选 AgX(Sobotka) 或 Tony McMapface**，更适合大面积天空。建议把 tonemap 做成可切换。
- 自动曝光微动幅度调小，防闪烁。
**验收**：云顶高光不 clip、暗部不死黑、天空无明显偏色。

### P2. Bloom
- **不要用** shadertoy 的"径向 20 采样"（方向性偏差、非物理）。
- 用 **Jimenez(COD AW 2014) 双滤波 / Kawase 金字塔**：亮度阈值 → 渐进降采样(13-tap) → tent 上采样累加。各向同性、稳定、便宜。
- 在 ACES 之前叠加，`bloomThreshold`/`bloomAmount`。
**验收**：太阳与受光云缘柔和光晕，无方向条纹、不糊主体。

### P3. TAA（含体积云重投影）
- YCoCg 邻域方差裁剪 + `mix(new,history,0.95)`。
- **关键**：用 A3 输出的 `cloudDepth` 做 history 重投影（而非仅相机矩阵），否则相机平移产生鬼影。
- 相机亚像素 Halton jitter；引入后减弱 IGN。
- ping-pong history，resize/首帧重置。
**验收**：静止噪点显著降，`rayMarchSteps` 可降约 30% 观感不劣；慢速移动无明显拖影。

### P4. 相位升级
- HG 前向叶替换为 **Cornette-Shanks（能量归一化）** 或 **Jendersie-d'Eon 2023 Mie 近似**（雾/云专用，比单 HG 真实）。
- 与 A2 的 per-octave phase 各向异性统一。
**验收**：朝阳薄云亮边更锐更白，背光不过亮；与 tonemap 协调不 clip。

### P5. 时序重投影升采样（可选，强力提速）
- Schneider 式：clouds 渲染 **1/4 分辨率 + 16(4×4)帧轮转更新**，用 `cloudDepth` 重投影重建全分辨率。
- 与 P3 TAA 协同（同一 history 体系）。
**验收**：clouds pass 成本降约 4×，移动时重建无明显瑕疵。

---

## 依赖与推荐顺序

```
P0(前置) ──┬─ P1 ─┬─ P2
           │      └─ P3 ←需 A3.cloudDepth
A1 密度 ──→ A2 光照 ──→ A3 raymarch ──→ A4 大气
P4 相位(并入 A2) │
P5 重投影 ←需 A3 + P3
```

**冲商业级的正确顺序**：`P0 → A1 → A2 → A3 → P4 → A4 → P1 → P3 → P2 → P5`
（先把云本体做对，再做表现层；TAA/重投影依赖 A3 的深度，故在 A3 之后。）

**若只想快速提升观感（不追商业级）**：`P0 → P1 → P4 → A4务实档 → P3 → P2`。

---

## 性能预算与调试（商业级工程必需，原路线图缺失）

**帧预算**（需先定目标平台，示例 1080p@60）
- clouds raymarch ≤ 4–6 ms（配合 A3 空步跳过 / P5 重投影）。
- light march（cone+MS）≤ 主步进的 ~40%。
- 后处理（bloom+taa+tonemap）≤ 1.5 ms。
- 在 `getStats` 已有 GPU timing 基础上，分项打点。

**调试可视化模式**（新增 `debugView` uniform）
- 透射率、累计散射、步数热力图、`cloudDepth`、weather/coverage、单 octave MS 贡献。
- 无这些无法定位"发灰/鬼影/过曝/边缘糊"的根因。

---

## 涉及文件总览
- `shaders/noise.wgsl`：A1（perlin-worley / worley / curl）。
- `shaders/cloud.wgsl`：A1–A4、P0、P4、调试视图。
- `src/renderer.ts`：P0/P1(tonemap)、P2(bloom 金字塔)、P3(TAA+history+jitter)、P5(低分辨率+重投影)、A4 商业档 LUT pass、MRT 输出 cloudDepth。
- `src/params.ts` / `src/gui.ts`：各阶段 uniform 与滑杆、`tonemapMode`、`debugView`。
- `src/camera.ts`：P3 Halton jitter。

## 不做 / 暂缓
- 参考工程的地球大气球壳几何、海洋高度场、立方体 SDF：与 box+body 架构不符，不移植。
- 色差/暗角：风格化小项，P1 后按需加在 post 末尾。
- **诚实提示**：若 Track A（A1–A4）不做，本路线图最高只到高质量爱好级；商业级保真的壁垒在云本体，不在后处理。
