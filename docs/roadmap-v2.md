# Roadmap v2 — 未完成项合并（快速观感优先，已调序 + 评估）

合并自 `legacy/roadmap.md`（阶段 9/10/11）、`legacy/roadmap-borrow.md`（B–F，A 已由 per-preset-lighting 变更完成）、`legacy/roadmap-reference-borrow.md`（Track A/B）、`legacy/known_issues.md`（三项已知问题）、`legacy/plan-sharp-edges.md`（云顶尖锐化，改良版）。

调序原则：
- 调试/打点最先做——后续所有阶段的验收都靠它量化。
- `cloudDepth`（阶段 4）前移到 aerial 与 TAA 之前，避免"先近似后返工"做两遍。
- 天气图软边（阶段 3）是当前可见缺陷、零依赖，尽早修。
- 云边尖锐化（阶段 10）必须在自适应步进/蓝噪声（阶段 4）与 TAA（阶段 8）之后——陡传递函数会放大阶梯条纹，需先有抖动/时域收敛兜底。
- 重投影升采样（阶段 11）先于占据金字塔（阶段 12）；做完 11 后 12 的边际收益缩水，按实测再决定。
- 原 borrow C 的 light-march beer-powder 统一项已删：与 Track A2"做对 MS 后关闭 powder"矛盾，并入 13.2。
- 两个 **重校准点**：HDR 化 + tonemap 更换后（阶段 5），密度/光照重写后（阶段 13）。前面阶段的调参验收不是一劳永逸的。

已知问题去向：
- 区域边缘偏硬 → 阶段 3（方案改为 SDF 距离场，见该节）。
- 顶面阶梯条纹 → 阶段 4（蓝噪声）减轻、阶段 8（TAA）收敛，作为两阶段的回归验收项；阶段 10 的硬边会重新放大它，故有前置约束。
- 云底平直 → 阶段 10 第 2 步（vEnvelope 重做）先缓解，阶段 13.1（逐类型垂直包络）根治。

> 路线取舍提示：本主线适合"先要好看的 demo"。若确定冲商业级（阶段 13 必做），在旧密度场上精修阶段 6/7/10 的调参意义有限，可考虑把 13 提前（即 reference 原顺序 P0→A1→A2→…）。

```
1(HDR前置) → 2(调试/打点) → 3(天气图软边) → 4(空区快进+cloudDepth) → 5(Tonemap ★校准1)
→ 6(相位+银边) → 7(大气/调色) → 8(TAA) → 9(Bloom, 可随时并行)
→ 10(云边尖锐化) → 11(重投影升采样) → 12(占据金字塔/LOD, 按实测决定)
→ 13(云本体 Track A ★校准2) → 14(云属增强, 随时插入)
```

## 评估速览与执行策略

| 阶段 | 必要性 | 收益 | 成本 | 推荐模型（Cursor） |
|---|---|---|---|---|
| 1 HDR 前置 | 必做（地基） | 无直接观感，纯解锁 | 极低 | composer-2.5-fast |
| 2 调试/打点 | 必做（杠杆最高） | 间接：验收可量化、省排错 | 低–中 | kimi-k2.7-code / glm-5.2-high |
| 3 天气图 SDF 软边 | 中 | 中 | 中 | glm-5.2-high / kimi-k2.7-code |
| 4 空区快进+cloudDepth | 高（被 7/8/11 依赖） | 高 | 中；自适应步进易引伪影 | gpt-5.3-codex |
| 5 Tonemap ★校准1 | 高 | 高（性价比最高） | 低；校准要人眼 | composer-2.5-fast |
| 6 相位+银边 | 中 | 中 | 低–中 | claude-sonnet-5-thinking |
| 7 大气/调色 | 较高 | 高 | 中 | claude-sonnet-5-thinking |
| 8 TAA | 高 | 高 | **高**（全表最难调之一） | gpt-5.3-codex / claude-opus-4-8-thinking |
| 9 Bloom | 中低 | 中 | 低 | composer-2.5-fast |
| 10 尖锐化 | 看风格需求 | 高（积雨云质变） | 中；解析噪声有逐采样开销 | claude-sonnet-5-thinking / gpt-5.3-codex |
| 11 重投影升采样 | 看性能压力 | 很高（≈4×） | **高**（与 TAA 耦合） | gpt-5.3-codex / claude-opus-4-8-thinking |
| 12 金字塔/HDDA | 按实测，大概率可跳过 | 不确定 | 高（遍历逻辑易错） | gpt-5.3-codex / claude-opus-4-8-thinking |
| 13 Track A | 商业级唯一路径 | 上限最高 | **最高**（大改+大量调参） | claude-opus-4-8-thinking / gpt-5.3-codex，分小步 |
| 14 云属增强 | 锦上添花 | 低–中 | 每项低 | kimi-k2.7-code / glm-5.2-high |

执行策略（据评估调整）：
- **速通路径**：时间有限时 1→2→4→5→7 即可拿到大部分肉眼收益；6/9/10 按需追加。
- **性价比前三**：5（tonemap）、7（大气调色）、10（尖锐化）。
- **成本黑洞 8/11/12/13**：调试成本远大于编码成本，各自首任务定为"最小可关闭版本"（GUI 开关 + 与旧路径 A/B 对比，坏了即时回退）。
- **模型分工**：数学密集、一处符号错就全屏鬼影的（4/8/11/12/13）用最强模型；照标准算法搬运的（1/5/9）用快模型。档位对照：快=composer-2.5-fast，中=kimi-k2.7-code/glm-5.2-high，中强=claude-sonnet-5-thinking，强/最强=gpt-5.3-codex/claude-opus-4-8-thinking。所有观感阶段（5 校准、7、10、13）模型只负责代码正确，最终数值靠截图反馈循环人眼定，此成本不因模型强弱而变。

---

## 阶段 1 — HDR 管线整理（P0，前置必做）

> 必要性：必做 ｜ 收益：解锁后续 ｜ 成本：极低 ｜ 模型：快

主 `fs` 当前把已 tonemap 的 LDR 写进 `rgba16float` offscreen，后续 Bloom/ACES/TAA/aerial 全部依赖线性 HDR。

- [x] `shaders/cloud.wgsl` `fs`：删结尾 Reinhard + gamma（`fs` 末尾 `outColor/(outColor+1)` 与 `pow(1/2.2)` 两行），输出线性 HDR。
- [x] `src/renderer.ts` `fsPost`：tonemap + gamma 搬到后处理最末。
- [x] offscreen 保持 `rgba16float`，post 输出 swapchain。

实现要点/坑：
- 本阶段 tonemap 曲线**不换**，仍用 Reinhard + `pow(1/2.2)`（ACES 归阶段 5），只是位置搬到 `fsPost` 结尾。
- `fsPost` 内的 godray 径向采样循环采样的就是 offscreen 场景纹理，改后它在 HDR 域累加——tonemap 必须放在 godray 叠加**之后**，不能放在采样前。godray 观感可能轻微变化（HDR 域更物理正确），如明显过曝可微调 `godrayStrength` 默认值。
- gizmo 线框（`linePipeline`）画进 offscreen，会一并被 post tonemap 压暗，属可接受的调试层变化，不做补偿。
- swapchain 为非 sRGB 格式，手动 gamma `pow(1/2.2)` 必须保留在 `fsPost` 最末。
- 两个 render pass 的 `clearValue`（`todBackground`）被全屏三角覆盖，无需处理。

**验收**：与改前观感一致，无 banding 加重。

---

## 阶段 2 — 调试与性能打点基础（原阶段 10 前移）

> 必要性：必做 ｜ 收益：间接但杠杆最高 ｜ 成本：低–中 ｜ 模型：中

后续阶段的验收（"帧时间下降""调步数观感稳定"）没有它无法量化。

- [x] `debugView` uniform + 基础调试视图：透射率、累计散射、步数热力图、weatherMap/coverage、区域边界、当前 `sceneTime`（`cloudDepth` 视图归阶段 4，金字塔层级归阶段 12，MS octave 归阶段 13）。
- [x] 帧预算分项打点（基于 `getStats` GPU timing）：clouds pass / light march / 后处理分项计时。
- [x] 目标预算记录：clouds ≤ 4–6 ms @1080p60，light march ≤ 主步进 ~40%，后处理 ≤ 1.5 ms。
- 实测基线（2026-07-04，默认场景 1254×1272，48+4 步）：cloud 1.64ms · cache 1.64ms · post ≈0.00ms（单采样 pass，低于计时精度）· light share ≈35%（A/B 测量）。附带修复：`fs` 中 `select(sunVisibility(...), 1.0, skipLight)` 两侧都求值导致 skipLight 不省时，已改真分支。

实现要点/坑：
- `debugView` 用 `Globals._pad0` 槽位（offset 33），同步 `src/params.ts` 的 `PARAM_OFFSETS` 与 `packParams` 调用链，无需扩 buffer。
- 调试输出会被 `fsPost` 的 Reinhard+gamma 扭曲：post uniform（`Post.sun` vec4）扩一个 vec4 带 `debugView` 标志，非 0 时 `fsPost` 跳过 tonemap 与 godray，原样输出。
- 步数热力图在 `fs` 主循环里计数实际迭代（含早退/未命中），按 `count/numSteps` 走蓝→红色带；透射率视图输出最终 `transmittance` 灰度；散射视图输出未合成背景的 `color`。
- weatherMap/coverage 视图：取视线与云层中间高度平面交点的 XZ 采样 weatherTex；区域边界视图按 body footprint 着色（bodies 数据 fs 已可访问），羽化带用不同色调。
- light march 占比无法用 timestamp 测（同一 pass 内）：GUI 加"测量光照占比"按钮，在 `main.ts` 帧循环里先后各采 ~30 帧（强制 `skipLight` on/off）平均 `cloudMs`，差值算占比显示在 HUD。注意 `cloudMs` 回读是异步的，采样窗口要留 buffer。
- post pass 计时：`TS_COUNT` 4→6，post pass 加 `timestampWrites`，`stats.postMs` 进 HUD；compute pass 不是每帧跑（`cacheRan`），现有分支保持。
- GUI 新增 Debug folder（视图下拉 + 测量按钮），文案走 `src/i18n.ts` 双语。

**验收**：GUI 可切换各调试视图；每帧分项耗时可读。

---

## 阶段 3 — 天气图区域软边（known issue 修复，独立小项）

> 必要性：中 ｜ 收益：中（演示观感直观改善） ｜ 成本：中 ｜ 模型：中

现象：区域边界（尤其矩形直边）过渡生硬。已有 `feather`/`edgeSoft`/`edgeFade` 缓解，但核心区→羽化带的密度响应曲线偏陡，直边仍可辨。

方案（从原"三个可能方向"中选定距离场路线，羽化不再烘死进纹理）：

- [x] `src/weather.ts`：coverage 笔刷改写入**归一化有符号距离场**（到区域边界的距离），矩形笔刷加圆角半径参数消直角。
- [x] `shaders/cloud.wgsl`：采样后用可调响应曲线（`smoothstep` + pow shaper）把 SDF remap 成 coverage；现有 `edgeSoft`（边缘放宽 `coverageThreshold`）改吃 SDF 距离而非 coverage 值。
- [x] GUI 暴露响应曲线陡度与圆角半径（Global folder：Corner Radius / Edge Curve Width / Edge Curve Shaper，默认 0.5/0.5/1.0 复现旧观感）。
- 纹理分辨率不动：SDF 双线性插值天然平滑，无需提分辨率。
- 注：阶段 13.1 weather map 多通道重构时保留 SDF 编码（占一通道）。

实现要点/坑：
- 编码：`s = clamp(0.5 + 0.5*d/feather, 0, 1)`，`d` 为到边界的有符号世界距离（内正外负）；0.5=边界，band 宽 = ±feather，8-bit 足够（双线性平滑）。
- 圆角矩形 SDF：`q = abs(p-c) - (half - r)`，`dOut = length(max(q,0)) + min(max(q.x,q.y),0) - r`，`d = -dOut`；`r` 需 clamp 到 `min(hw,hd)`。圆形：`d = radius - dist`。
- 响应曲线（保持旧观感为默认）：`cov = pow(smoothstep(0.5 - w, 0.5, s), shaper)`——边界处 cov=1、向外衰减，与旧"羽化向外"语义一致；`w` default 0.5（=整个 feather band），可到 1.0（软化延伸进边界内），shaper default 1（=旧曲线）。
- `edgeSoft` 改吃 s：`smoothstep(0.35, 0.65, s)`（距离带）替代 `smoothstep(0.05, 0.45, alpha)`。
- 新 uniform 用 Globals 剩余槽位：`edgeCurveWidth`(34)、`edgeCurveShaper`(35)；`cornerRadius` 不进 shader（烘进 SDF），但改动后必须触发 weather 重绘——`geometrySignature` 或等价触发链要把 cornerRadius 算进去。
- 调试视图 4（weather coverage）改为显示 remap 后 coverage，与视图名一致。

**验收**：矩形区域边缘无可辨直边，核心区→晴空的密度渐变无台阶。

---

## 阶段 4 — Raymarch 基础加速 + 代表性深度（borrow C 精简 + A3）

> 必要性：高（被 7/8/11 依赖） ｜ 收益：高（性能+解锁） ｜ 成本：中，自适应步进易引伪影 ｜ 模型：强

`cloudDepth` 是阶段 7（aerial）与阶段 8（TAA 深度重投影）的输入，必须先落地。

- [x] 空区快进：`fs` 主循环 `d < 0.01` 时步长翻倍推进；命中后回退细分（ratchet），连续空采样递增步长。
- [x] `transmittance < ε` 早退覆盖所有光照路径（`lightMarchDepth` 光学厚度早退 + `cloudShadowAt` 提前返回）。
- [x] 输出透射率加权平均命中距离 `cloudDepth`（offscreen alpha 通道）+ 调试视图 6。
- [x] 蓝噪声/R2 序列替代 `interleavedGradientNoise`（IGN + 金比率时域旋转，`temporalDither` 开关，阶段 8 引入 TAA 后减弱）。
- 回归修正 1：满幅时域抖动在无 TAA 时导致同一片云逐帧在两种形态间闪烁（金比率相邻帧偏移 0.618 步）。已把时域幅度降到 0.25 步且 `temporalDither` 默认改为 **关**；阶段 8 TAA 落地后再默认开启并配合亚像素 jitter。
- 回归修正 2：自适应步进在薄云与云边缘随视角闪烁——跳步安全性依赖采样点命中，整片薄云落进大步间隙时被无声跳过，相机一转采样梳相位变化导致时隐时现。修补：加"近云带"刹车（0.002 < d ≤ 0.01 时立即回退细步、不升倍率），最大倍率 8×→4×，升倍门槛 3→4 次连续空采样。根治需阶段 12 占据金字塔提供保守跳步距离。
- 实测：空区（天空）像素步数热力图从满红（48 步）降到蓝（≤1/4 步数）；当前视角 clouds pass 1.84→1.64ms（云占屏多时收益小，空旷视角更大）；`cloudDepth` 视图近白远黑正确；`adaptiveMarch` off 时逐步复现旧路径。

实现要点/坑：
- 主循环改按 `t` 参数化（非 pos 累加）。ratchet：采样在 `t`，命中且 `mult>1` 时 `t -= baseStep*(mult-1); mult=1; continue`（回退到最后确认为空的点后细步重扫，不积分本次采样）；连续 ≥3 次空采样才升倍率（×2，上限 8×），命中即归 1。迭代上限保持 `numSteps`，靠 `t >= tExit` 提前结束体现步数下降。
- `cloudDepth` 走 offscreen alpha 通道（rgba16float，无需 MRT）：积分时 `w = transmittance*(1-step_trans)`，`depth = Σw·t / Σw`；`Σw < 1e-4`（天空/未命中）输出 1e4。gizmo 线框 pipeline 会以 alpha=1 污染所在像素深度，调试层可接受。
- 光照路径早退：`lightMarchDepth` 在光学厚度 `> 40/max(shadowDarkness,0.1)` 时 break（最小消光 octave 是 0.1×sdk）；`cloudShadowAt` 在 `dens*shadowDarkness > 4.6` 时 break。主循环 `transmittance<0.01` 早退已有。
- 时域抖动（无 TAA 前的过渡方案）：`dither = fract(ign(fragCoord) + fract(f32(frameIndex)*0.61803398875))` 金比率序列，`temporalDither` GUI 开关（默认开，闪烁不可接受可关）；阶段 8 引入亚像素 jitter 后减弱。
- Globals 扩 4 槽（36 floats→40）：`frameIndex`(36)、`adaptiveMarch`(37)、`temporalDither`(38)、`_pad3`(39)；`BODY_BASE` 36→40，`packBodies` 偏移随动。
- 调试视图 6 = Cloud Depth：`1 - clamp(depth/(boxHalfExtent*6), 0, 1)` 灰度（近白远黑，天空黑）。
- `adaptiveMarch` GUI 开关做 A/B：关闭时必须逐像素复现旧路径结果。

**验收**：空旷视角步数显著下降（看阶段 2 热力图），密集区质量不降；`cloudDepth` 可视化正确；**回归**：顶面阶梯条纹较改前减轻。

---

## 阶段 5 — Tonemap 升级（P1）★重校准点 1

> 必要性：高 ｜ 收益：高（性价比最高的一步） ｜ 成本：低，校准要人眼 ｜ 模型：快

- [x] 默认 ACES Narkowicz 拟合 + `exposure` 曝光系数（默认 ACES / 0.7，1.0 时偏亮发灰）。
- [x] tonemap 可切换（Reinhard 保留作 A/B 基线；AgX 用 Benjamin Wrensch 多项式近似，规避 ACES 对大面积天空的 hue shift；Tony McMapface 需 3D LUT 纹理，暂不做）。
- [x] ~~自动曝光微动幅度调小~~：项目无自动曝光，不适用。
- [ ] **重校准**（人眼，截图反馈循环）：HDR 化 + tonemap 更换后，统一复查现有光照参数（`silverIntensity`/`powderStrength`/per-preset 光照/太阳与环境色强度）并回填默认值。**待用户人眼校准**：初查黄昏（太阳 8°）天空偏紫灰、云底暖色偏淡，光照色板本身待阶段 7 `todColors` 重做，此处只需确认云面高光不 clip、暗部不死黑。

实现要点：
- 全部在 `fsPost`：`col *= exposure` → tonemap（按 mode 分支）→ `pow(1/2.2)`。Post uniform `flags` 复用：y=tonemapMode（0=Reinhard/1=ACES/2=AgX），z=exposure。
- ACES Narkowicz：`(x*(2.51x+0.03))/(x*(2.43x+0.59)+0.14)`，输入建议先乘 0.6 抵消该拟合偏亮的惯例可不做，靠 exposure 调。
- AgX 近似：Wrensch/iolite 版多项式（contrast 段可省），注意其自带 sRGB 编码时不要重复 gamma。
- GUI 放"渲染"folder：tonemap 下拉 + exposure 滑杆 [0.1, 3.0]，默认 ACES / 1.0。

**验收**：云顶高光不 clip、暗部不死黑、天空无明显偏色；默认参数下观感不劣于改前。

---

## 阶段 6 — 相位升级 + 边缘检测银边（P4 + borrow B）

> 必要性：中 ｜ 收益：中（云种辨识、背光美感） ｜ 成本：低–中，edge-detect 每样本多一次 `densityAt` ｜ 模型：中强

> 注：本阶段调参建立在旧密度场上，阶段 13.1 重写密度后需重校准（见 ★校准2）。另：阶段 10 的陡传递函数会改变边缘密度分布，10 完成后需回看银边参数（若跳过 13，此项单独做）。

- [x] HG 前向叶替换为 Cornette-Shanks（能量归一化，同 1/4π 约定；`dualHG` 与 per-type phaseFwd 两处，后向叶保持 HG）。
- [x] 银边改边缘检测：`densityAt(pos + SUN_DIR·2·lightMarchStepSize)` 估边缘密度，`exp(-d·3)` 门控；仅 `sunTheta>0` 且银边增益 >0.001 时探测（省开销）；per-type `silverLining` 保留，全局 `silverIntensity` 作总倍率。

实现要点：
- 现有 `hgPhase` 带 1/4π 归一化，CS 同约定：`(1/4π)·(3(1-g²)/(2(2+g²)))·(1+cos²θ)/(1+g²-2g·cosθ)^1.5`；只换前向叶（`dualHG` 与 per-type 的 phaseFwd），后向叶保持 HG。
- 银边探测：`edgeDens = densityAt(pos + SUN_DIR·offset)`（offset 取 `lightMarchStepSize` 的 2 倍），`edgeThin = exp(-edgeDens·3)`；乘进现有银边项替换纯 `transmittance` 门控。开销门控：仅 `sunTheta>0 && silverIntensity·silverScale > 0.001` 时探测。

**验收**：朝阳薄云亮边更锐更白、背光不过亮；银边只出现在背光云缘，厚云内部不再整体泛白。

---

## 阶段 7 — 大气与调色（A4 务实档 + borrow F，直接用 cloudDepth）

> 必要性：较高 ｜ 收益：高（黄昏/远景是观感短板） ｜ 成本：中 ｜ 模型：中强

- [ ] 解析 aerial perspective：`exp(-σ·t)` 透射 + 朝阳 HG 内散射加亮 + 高度雾，距离取阶段 4 的 `cloudDepth`。
- [ ] `todColors()` 按太阳高度角分段插值 8 档关键色（dawn/morning/midday/afternoon/golden/sunset/twilight/night）。
- [ ] 云亮面色与阴影色分离驱动（阴影侧用 cloud-types 的 shadow 列）。

**验收**：远云不「贴片」，黄昏时云底被低空散射染色；黄昏/暮色下亮面与阴影冷暖分离、过渡自然。

---

## 阶段 8 — TAA（P3，直接深度重投影）

> 必要性：高 ｜ 收益：高（噪点降、步数可减 30%） ｜ 成本：**高**，全表最难调之一，鬼影/闪烁迭代长 ｜ 模型：最强

- [ ] **最小可关闭版本先行**：`taaEnabled` GUI 开关 + 与无 TAA 路径 A/B 对比，可即时回退。
- [ ] YCoCg 邻域方差裁剪 + `mix(new, history, 0.95)`，ping-pong history，resize/首帧重置。
- [ ] history 重投影用阶段 4 的 `cloudDepth`（非仅相机矩阵，否则平移鬼影）。
- [ ] 相机亚像素 Halton jitter（`src/camera.ts`）；引入后减弱蓝噪声抖动幅度。

**验收**：静止噪点显著降，`rayMarchSteps` 可降约 30% 观感不劣；慢速移动无明显拖影；**回归**：顶面阶梯条纹时域收敛后基本不可见。

---

## 阶段 9 — Bloom（P2，无依赖，可与 6–8 并行）

> 必要性：中低 ｜ 收益：中（氛围感） ｜ 成本：低（标准算法） ｜ 模型：快

- [ ] Jimenez(COD AW 2014) 双滤波 / Kawase 金字塔：亮度阈值 → 渐进降采样(13-tap) → tent 上采样累加（不用 shadertoy 径向采样）。
- [ ] 在 tonemap 之前叠加，`bloomThreshold`/`bloomAmount`。

**验收**：太阳与受光云缘柔和光晕，无方向条纹、不糊主体。

---

## 阶段 10 — 云边/云顶尖锐化（plan-sharp-edges 改良版）

> 必要性：看风格需求 ｜ 收益：高（积雨云辨识度质变） ｜ 成本：中，步骤 3 有逐采样开销（看阶段 2 打点） ｜ 模型：中强–强

问题：默认渲染云边总是模糊，做不出积雨云顶锐利轮廓。根因按影响排序：缓存三线性低通（96³ 体素 ≈0.09 世界单位）、软不透明度传递（`1-exp(-d·step)` 边缘渐隐）、`vEnvelope = pow(vT,2)*0.55` 刻意圆化、detail 噪声只加绒毛不加锐度。

核心思路：锐化放在 **raymarch 采样时按密度做**（逐采样天然全屏分辨率，绕开体素低通），不靠堆缓存分辨率（立方增长不划算）。per-preset 参数 `edgeHardness` 驱动。

**前置约束（对原方案的修正）**：必须在阶段 4（蓝噪声+自适应细分）与阶段 8（TAA）之后——陡传递函数会放大「顶面阶梯条纹」，需先有抖动与时域收敛兜底；命中回退细分保证硬边处步长足够细。

- [ ] 1. 陡峭密度传递函数（≈零成本，约 70% 效果）：采样后过窄窗 `smoothstep(thr-w, thr+w, d)`，窗宽由 `edgeHardness` 控制；配合调高 `densityScale` 让 alpha 一两步饱和。传递函数单调 → 缓存/占据金字塔 max 经同一变换仍保守（阶段 12 兼容）。
- [ ] 2. 去云顶圆化 + 重做底部（≈零成本）：硬顶类型顶部 `vEnvelope` 换近硬截断（或砧状 anvil 上沿），云顶贴噪声等值面；底部 falloff 从"削平"改为可调圆底/平底曲线，缓解 known issue「云底平直」（根治在 13.1）。
- [ ] 3. 边界高频解析侵蚀（质量关键，成本中等）：仅边缘带（`d` 接近 `thr`）叠高频 worley/curl 噪声啃边，**raymarch 内解析计算、不进缓存**，给出积雨云"花椰菜"硬块感。`noise.wgsl` 的 worley/curl 与 13.1 共用同一实现——本阶段先落地，13.1 直接复用。
- [ ] 4. `edgeHardness` 进 `PresetShape`（扩 p5 槽位，同步 `packPresetArray`/`PRESET_FLOAT_COUNT`）+ GUI 滑杆；普通积云保持现状，积雨云调高。
- [ ] 兜底：若主体边缘仍有波纹，该 body 局部走质量模式 2（解析、不缓存），不全局提分辨率。
- [ ] 完成后回看阶段 6 银边参数（边缘密度分布已变）。

**验收**：cumulonimbus 云顶锐利、有花椰菜硬块感与砧顶轮廓；无新增阶梯条纹；普通积云观感不变。

---

## 阶段 11 — 时序重投影升采样（P5，需阶段 4 + 8）

> 必要性：看性能压力 ｜ 收益：很高（≈4× 提速） ｜ 成本：**高**，与 TAA 耦合、运动瑕疵调试难 ｜ 模型：最强

- [ ] **最小可关闭版本先行**：`upsampleEnabled` GUI 开关 + 全分辨率路径 A/B 对比，可即时回退。
- [ ] clouds 渲 1/4 分辨率 + 16(4×4) 帧轮转更新，用 `cloudDepth` 重投影重建全分辨率，与 TAA 共用 history 体系。

**验收**：clouds pass 成本降约 4×（看阶段 2 打点），移动时重建无明显瑕疵；**阶段 10 的硬边在升采样后不糊**。

---

## 阶段 12 — 占据金字塔 + HDDA、调度/LOD（roadmap 阶段 9/10，按实测决定）

> 必要性：按实测，大概率可跳过 ｜ 收益：不确定（视场景空旷度） ｜ 成本：高，HDDA 遍历易错 ｜ 模型：最强

> 做完阶段 11 后每帧只更新 1/16 像素，本阶段边际收益缩水。先看阶段 2 打点：若 clouds pass 仍超预算再做；否则跳过或降级。

### 12.1 min-max 占据金字塔 + HDDA

- [ ] **最小可关闭版本先行**：`hddaEnabled` GUI 开关 + 线性步进路径 A/B 对比。
- [ ] 密度 compute 后生成 mip 链（128³→…→8³，存子块 max[/min]），全程 GPU 零回读。
- [ ] `fs` 层级遍历：粗层空则按体素尺寸大步跳，非空下钻精细积分；薄云不被跨过。
- [ ] 仅云内执行 `lightMarch` 与散射累加。
- [ ] 质量参数 + GUI + 金字塔层级调试视图；默认值复现既有画质，循环有静态上界。
- 注：阶段 10 的解析侵蚀只减不增密度，cached max 仍保守；陡传递函数单调，对 max 施同一变换即可。

### 12.2 调度与 LOD（复用 12.1 金字塔）

- [ ] 空区跳过 compute：占据/包围盒裁剪 `dispatchWorkgroups` 范围。
- [ ] 缓存分辨率/更新频率随相机距离 LOD（`setDensityResolution`/`cacheUpdateRate`）。
- [ ] 远距离 fallback：烘焙到 cubemap。

**验收**：相同画质下总采样/光照行进次数显著下降；空旷视角帧时间明显下降。

---

## 阶段 13 — 云本体 Track A（商业级核心）★重校准点 2

> 必要性：商业级唯一路径（只要 demo 可整体不做） ｜ 收益：上限最高 ｜ 成本：**最高**，大改+大量肉眼调参 ｜ 模型：最强，分小步走，每步保留旧路径开关

### 13.1 密度模型重建（A1）

- [ ] **最小可关闭版本先行**：新密度路径挂 `densityModel` 开关，与旧 evalBody A/B 对比。
- [ ] `noise.wgsl` 新增 Perlin-Worley；高频 Worley / curl 复用阶段 10 已落地实现。
- [ ] `evalBody` 重写为「基础形状 × 高度梯度 → 高频 Worley 边缘侵蚀（remap）→ curl 边缘畸变」。
- [ ] weather map 扩多通道（coverage / cloud-type / precipitation），保留阶段 3 的 SDF 软边编码；coverage remap 保证 0 覆盖真空。
- [ ] 逐类型高度-密度包络对齐真实梯度曲线（stratus 扁平 / cumulus 平底圆顶 / cumulonimbus 砧顶），根治「云底平直」。
- [ ] 先在 `qualityMode==2` 解析路径验证，再回灌缓存。

**验收**：积云菜花团块 + 拉丝边、积雨云砧顶、层云扁平连续，三类肉眼可辨且不靠后处理。

### 13.2 光照模型（A2）

- [ ] Cone-sampled light march（朝太阳 5–6 步锥形偏移采样，软化自阴影）。
- [ ] `sunVisibility` 形式化为 N-octave 多重散射（Hillaire，a=b=c≈0.5 递降）+ MS octave 调试视图。
- [ ] 每步散射解析积分 `S = (1-exp(-σ·dt))·scatter/σ`，步长无关。
- [ ] MS 做对后减弱/关闭 powder（保留为可选风格化）。
- [ ] **重校准**（人眼，截图反馈循环）：密度/光照重写后，复查阶段 6 银边参数、阶段 10 `edgeHardness` 与 per-preset 光照数值。

**验收**：厚云朝阳侧 silver lining 自然、背阳侧不死黑、调步数观感稳定。

### 13.3 大气商业档（A4）

- [ ] 预计算大气 LUT（Bruneton-Neyret / Hillaire 2020 aerial LUT），云色与天空物理一致。
- [ ] 天空模型升级 Hosek-Wilkie 或 Bruneton，替代 `todColors` 线性渐变。

**验收**：地平线过渡连续，云色与天空物理一致。

---

## 阶段 14 — 云属细节增强（borrow D/E，随时插入）

> 必要性：锦上添花 ｜ 收益：低–中，单项独立 ｜ 成本：每项低 ｜ 模型：中

- [ ] 卷云方向性 domain warping：cirrus 系预设增 `directional/curlStrength`，高空带（altBase>0.6）采样坐标沿风向域扭曲成弯钩细丝，仅 cirrus 类启用。
- [ ] altostratus `sunDiscVisible`：薄云档透出朦胧日盘。
- [ ] cirrostratus `haloEffect`：22° 日晕亮环。
- [ ] cumulonimbus `internalLightning`：随机内部暖色闪光脉冲。

---

## 不做 / 暂缓

- mesh-cluster / billboard WebGL2 降级路径；预烘焙噪声纹理（已有密度缓存）。
- 参考工程的地球大气球壳、海洋高度场、立方体 SDF。
- 色差/暗角：阶段 5 后按需加在 post 末尾。
- light-march beer-powder 统一（原 borrow C 项）：与 13.2 关闭 powder 矛盾，不单独做。
- 全局提缓存分辨率求锐边（原 sharp-edges 备选）：立方增长不划算，被阶段 10 的解析方案替代。
