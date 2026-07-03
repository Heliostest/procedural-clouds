# Roadmap — 借鉴 procedural-clouds-threejs 的可迁移增强

目标：在现有 WebGPU 体渲染基础上，迁移 `../procedural-clouds-threejs/`（cloud-types.md / cloud-shaders.md / SKILL.md）中尚未落地、能提升「不同云种辨识度与美感」的细节。

> 现状：threejs skill 的核心（10 云属预设、HG 相函数、silver lining、powder、time-of-day、godray、多体/天气图/生命周期/场景编排）已迁移。本 roadmap 只覆盖剩余「更细」的差异点。

---

## 阶段 A — 每云属光照参数（最高优先）

当前 `CLOUD_PRESETS` 只携带形态参数，光照（吸收/相函数/silver/SSS/暗底）全是全局常量。`cloud-types.md` 为每个云属定义了独立光照。

参考值（cloud-types.md）：

```
cumulus:       absorption .045  phaseFwd .6  phaseBack -.2  silver .4   baseDark .35  sss .3
stratus:       absorption .06   phaseFwd .3  phaseBack -.1  silver .1   baseDark .15  sss .15
stratocumulus: absorption .05   phaseFwd .4  phaseBack -.2  silver .25  baseDark .25  sss .25
cumulonimbus:  absorption .1    phaseFwd .7  phaseBack -.3  silver .6   baseDark .6   sss .2
altocumulus:   absorption .035  phaseFwd .4  phaseBack -.2  silver .3   baseDark .2   sss .35
altostratus:   absorption .02   phaseFwd .5  phaseBack  0   silver .1   baseDark .1   sss .5
nimbostratus:  absorption .09   phaseFwd .2  phaseBack  0   silver .05  baseDark .5   sss .1
cirrus:        absorption .008  phaseFwd .8  phaseBack  0   silver .5   baseDark .05  sss .7
cirrostratus:  absorption .005  phaseFwd .85 phaseBack  0   silver .2   baseDark .0   sss .8
cirrocumulus:  absorption .01   phaseFwd .7  phaseBack  0   silver .3   baseDark .1   sss .6
```

- [ ] `src/params.ts`：`SHAPE_PRESET_KEYS` 扩展 6 个光照字段 `absorptionCoeff/phaseForward/phaseBack/silverLining/baseDarkening/sssStrength`，填入上表；同步 `packPresetArray()` 与 `PRESET_FLOAT_COUNT`（每预设由 13 字段升到 19，vec4 槽位 4→5）。
- [ ] `shaders/cloud.wgsl`：`Shape13` → `Shape19`，`presetShape()`/`mixShape()` 同步；`PresetShape` 增 `p4`。
- [ ] `fs` 散射段：用当前命中体的 type 取 `silverLining/baseDarkening`，替代 `params.g.silverIntensity` 全局；吸收系数参与 `step_trans = exp(-d * stepSize * absorptionCoeff * k)`。
- [ ] 多体重叠时按 density 加权选主导 type（或取 alpha 最大的体），避免逐体分支。

**验收**：同一光照下 cumulus 明显有亮顶暗底，cirrus 近乎透明强前向散射，cumulonimbus 暗底+强背光银边，肉眼可区分。

---

## 阶段 B — silver lining 改为边缘检测实现

当前 `litColor *= 1 + silverIntensity * pow(clamp01(sunTheta),4) * transmittance`，是全屏统一的视线-太阳夹角，不区分是否薄边缘。

参考 cloud-shaders.md：

```glsl
float edgeDensity = cloudDensity(p + sunDir * 50.0);
float silver = pow(max(1.0 - edgeDensity, 0.0), 2.0) * pow(max(-cosTheta, 0.0), 2.0);
cloudCol += sunColor * silver * silverLining;
```

- [ ] `shaders/cloud.wgsl` `fs`：用 `densityAt(pos + SUN_DIR * d_offset)` 估边缘密度，只在背光（`-sunTheta>0`）的薄边缘加银边。
- [ ] 银边强度取阶段 A 的 per-type `silverLining`。
- [ ] 保留全局 `silverIntensity` 作为总开关/倍率。

**验收**：银边只出现在背光云缘，厚云内部不再整体泛白。

---

## 阶段 C — Raymarch 低成本加速（roadmap 阶段 9 的前置铺垫）

cloud-shaders.md 末尾的现成技巧，先于占据金字塔做，成本低收益大。

- [ ] **空区快进**：`fs` 主循环 `if (d < 0.01) { pos += rd * stepSize * 2.0; continue; }`（空气段步长翻倍）。
- [ ] **蓝噪声抖动**：用蓝噪声纹理或 R2 序列替代 `interleavedGradientNoise`，消 banding 更干净（`src/renderer.ts` 加 1 张蓝噪声纹理，`fs` 采样替换 `dither`）。
- [ ] **半分辨率体渲染**：体渲染 pass 渲到半分辨率 RT，再双边上采样合成（`src/renderer.ts` 加 RT 与上采样 pass）；约 4× 便宜。
- [ ] **light march beer-powder**：`lightMarch` 返回 `mix(beer, beer*powder, 0.5)`（cloud-shaders.md），与散射段的 powder 统一来源。

**验收**：相近画质下帧时间下降，空旷视角尤其明显，无新增 banding。

---

## 阶段 D — 卷云方向性 domain warping

`cirrus`/`cirrocumulus` 当前只有形态参数，没有「马尾/钩状」丝缕。cloud-types.md 标注 `directional / curlStrength 0.4`。

- [ ] `src/params.ts`：cirrus 系预设增 `directional/curlStrength`（可复用阶段 A 扩展位）。
- [ ] `shaders/cloud.wgsl` `evalBody`：对高空带（altBase>0.6）的采样坐标沿风向做域扭曲：`objPos.xy += curlDir * noise(objPos) * curlStrength`，制造弯钩。
- [ ] 仅对 cirrus 类启用，避免影响低层蓬松云。

**验收**：卷云呈现沿风向拉伸的弯钩细丝，而非各向同性絮状。

---

## 阶段 E — 少数云属特效（锦上添花）

- [ ] altostratus `sunDiscVisible`：薄云档透出朦胧日盘（`fs` 背景日盘强度按云透过率衰减而非全遮）。
- [ ] cirrostratus `haloEffect`：太阳周围 ~22° 亮环（`fs` 按 `acos(sunTheta)` 接近 22° 时加亮）。
- [ ] cumulonimbus `internalLightning`：随机时刻内部暖色闪光（`SceneTime` 驱动一个闪光脉冲，叠加到散射）。

**验收**：对应预设下出现可辨识的日盘/日晕/内部闪光。

---

## 阶段 F — time-of-day 调色板细化（可选）

当前 `todColors()` 只在 2 个端点 mix。cloud-types.md 提供 8 档（dawn/morning/midday/afternoon/golden/sunset/twilight/night）的「亮面/阴影/天空」三色表。

- [ ] `shaders/cloud.wgsl` `todColors()`：按太阳高度角分段插值更多关键色，提升日出/黄昏/暮色层次。
- [ ] 云亮面色与阴影色分离驱动（阴影侧用 cloud-types 的 shadow 列）。

**验收**：黄昏/暮色下云的亮面与阴影呈现明显冷暖分离，过渡自然。

---

## 优先级

```
A(每云属光照) ─ B(边缘 silver) ─┬─ D(卷云 warp)
                                ├─ E(云属特效)
C(加速，独立可并行)              └─ F(调色板)
```

- 核心：A → B（直接补齐「全局光照」最大短板，提升云种辨识度与美感）。
- C 与 A/B 正交，可并行；同时为 roadmap 阶段 9 铺路。
- D/E/F 为增强，随时插入。

## 不迁移

- mesh-cluster / billboard 两条 WebGL2 降级路径：本项目纯 WebGPU 体渲染质量更高，无需要。
- `noise3d_compute.wgsl` 预烘焙噪声纹理：已有 96³ 密度缓存（缓存最终密度，比缓存原始噪声更省采样），无需改。
