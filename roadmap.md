# Roadmap — 云彩形态与演化控制

目标：在现有 WebGPU 体渲染基础上，实现「**指定范围 / 指定时间 / 指定云彩类型 / 自然演化（加重、减淡、出现、消失、被风吹动）**」的唯象云彩系统。

---

## 0. 现状基线（起点）

当前实现（`main.js` + `shaders/cloud.wgsl` + `shaders/noise.wgsl`）：

- **单层全局云**：密度场 `cloudDensity(pos)` 在固定包围盒 `BOX_MIN(-4.5,0,-4.5)` → `BOX_MAX(4.5, cloudHeight, 4.5)` 内求值。
- **5 阶段密度**：高度掩膜（4D value noise）+ 宏观 Voronoi + 中观 Voronoi + 顶部截断 + 高度衰减。
- **全局参数**：`density / coverage(factorMacro) / scale / altitude / detail / cloudHeight`，无空间区分。
- **时间**：作为 4D 噪声的 W 轴（`time_pack`），只产生**就地形变**，不产生位移。
- **缓存**：96³ `rgba16float`，双缓冲 ping-pong + `cacheBlend` 时间插值。
- **参数传递**：`paramsBuffer` 固定 6×vec4f（96 字节）紧凑打包，`buildParams()` 手填索引。

**关键缺口**（本 roadmap 要补的）：
1. 无云属（cumulus/cirrus/...）形态预设。
2. 无空间控制——无法「在某区域放某种云」。
3. 无生命周期——无法「出现 / 增厚 / 消散」。
4. 风只是形变，不是真正平流位移。
5. 无时间轴编排——无法「在 t 时刻触发某演化」。

---

## 阶段 1 — 参数结构重构（地基，必做）

现有 `Params` 紧凑打包难以扩展，先重构成可维护结构。

- [x] `cloud.wgsl` 的 `Params` 拆分为分组 struct：`RenderParams`（步数/光照）、`CloudShape`（形态）、`Wind`、`SceneTime`。
- [x] `main.js` 用对象 → `ArrayBuffer` 的显式 writer 替换 `buildParams()` 的魔法索引（封装 `packParams(views)`，每字段命名）。
- [x] 保持 ping-pong 缓存与渲染管线不变，仅换 uniform 布局。
- [x] 新增 `SceneTime`：`{ sceneTime, deltaTime }`（区别于噪声 W 轴时间）。

**验收**：重构后画面与重构前一致，参数可按名读写。

---

## 阶段 2 — 云属形态预设（指定云彩类型）

把 `../procedural-clouds-threejs/cloud-types.md` 的 10 种云属映射到密度场可调量。

- [x] 扩展 `CloudShape` 暴露：`coverageThreshold`、`edgeSharpness`（Voronoi remap 锐度）、`baseRoundness`（底部平整度，影响阶段 5 falloff 曲线）、`worleyBlend`（Voronoi 与 Perlin 权重）、`detailStrength`、`altBase/altTop`（归一化高度带）。
- [x] `cloudDensity()` 内：
  - 阶段 2/3 的 `mapRange(... factor ...)` 引入 `edgeSharpness` 做 `pow`/`smoothstep` 锐化。
  - 阶段 1 高度掩膜按 `baseRoundness` 改变底部曲率（平底 vs 圆底）。
  - 引入 `worleyBlend` 在 Voronoi 距离场与 `noise_fbm` 之间 `mix`，控制「细胞感 vs 蓬松感」。
- [x] `main.js` 建 `CLOUD_PRESETS` 表（cumulus/stratus/stratocumulus/cumulonimbus/altocumulus/altostratus/nimbostratus/cirrus/cirrostratus/cirrocumulus），数值参考 cloud-types.md。
- [x] GUI 加预设下拉，切换时把预设值插值到 `CloudShape`（平滑过渡，避免突变）。

**验收**：能切出 cumulus（平底圆顶蓬松）、stratus（均匀薄毯）、cirrus（高空细丝）、cumulonimbus（暗底高耸）四类肉眼可辨形态。

---

## 阶段 3 — 真正的风（被风吹动）

当前 wind 只推进噪声 W（形变）。需分离「平流位移」与「形变」。

- [x] 新增 `Wind { dir: vec3f, speed: f32, morphRate: f32 }`。
- [x] `cloudDensity()` 采样坐标做域偏移：`objPos_advected = objPos - wind.dir * wind.speed * sceneTime`。
- [x] W 轴时间改用 `morphRate * sceneTime`（缓慢形变），与平流解耦。
- [x] 处理包围盒边界：程序噪声场无界，平流沿无限域偏移采样，box 始终满覆盖（无需环绕/淡入）。
- [x] GUI：风向（方位角滑杆）+ 风速 + 形变速率。

**验收**：云团整体沿风向水平漂移，同时边缘细节缓慢演化，不是整体闪烁。

---

## 阶段 4 — 空间控制 / 天气图（指定范围，核心）

让密度场按位置查询「这里有没有云、是什么云、多浓」。

- [ ] CPU 生成 **天气图纹理** `weatherMap`（2D，覆盖 box 的 XZ 平面，建议 256×256 `rgba8unorm`）：
  - R = coverage（局部覆盖度）
  - G = cloudType 索引（量化到预设表）
  - B = densityScale（局部浓度乘子，供生命周期写入）
  - A = 备用 / 区域 id
- [ ] 新增 bind group：compute 阶段绑定 `weatherMap` + sampler。
- [ ] `cloudDensity()`：用 `objPos.xz` 归一化采样 `weatherMap`，得到局部 `coverage/type/densityScale`，覆盖全局值。
- [ ] type 索引 → 在 shader 内对 2~3 个候选预设参数做 `mix`（避免分支爆炸，用预设参数数组 uniform）。
- [ ] `main.js` 提供 `Region` API：`{ shape: rect|circle, bounds, type, coverage }` → 软笔刷绘制进 `weatherMap`（带边缘羽化 `feather`）。

**验收**：能在矩形区域 A 只生成 cumulus、圆形区域 B 生成 cirrus，区域外晴空，区域边缘自然过渡。

---

## 阶段 5 — 生命周期包络（加重 / 减淡 / 出现 / 消失）

给每个区域/云团一条随时间的密度曲线。

- [ ] 定义包络 `envelope(t) = phase ∈ [0,1]`，分段：`birth → grow → mature → decay → death`（线性或 smoothstep 关键帧）。
- [ ] CPU 每帧按 `sceneTime` 求各区域 `phase`，写入 `weatherMap` 的 B 通道（densityScale）与 R 通道（coverage 渐变）。
- [ ] 出现 = phase 0→1 时密度淡入；消失 = 1→0 淡出并最终 coverage=0。
- [ ] 加重/减淡 = 调 mature 段的目标 densityScale。
- [ ] 形态随阶段微变（可选）：grow 阶段 `detailStrength` 渐增，decay 阶段边缘侵蚀增强（接 worleyBlend）。

**验收**：一团云能在指定时刻凭空出现、30s 内增厚到最浓、之后缓慢变淡直到消失。

---

## 阶段 6 — 时间轴 / 场景编排（指定时间）

把前述能力用数据驱动串起来。

- [ ] 定义 `Scenario` JSON：
  ```json
  {
    "duration": 120,
    "wind": { "dirDeg": 45, "speed": 0.3 },
    "events": [
      { "t": 0,  "region": "A", "type": "cumulus", "coverage": 0.0 },
      { "t": 10, "region": "A", "type": "cumulus", "coverage": 0.6, "ease": "smooth" },
      { "t": 60, "region": "A", "coverage": 0.0 }
    ],
    "regions": { "A": { "shape": "rect", "bounds": [...] } }
  }
  ```
- [ ] 运行时 `ScenarioPlayer`：按 `sceneTime` 在事件间插值 → 调阶段 4/5 的区域 API。
- [ ] GUI：时间轴 scrubber（拖动预览任意时刻）、播放/暂停/倍速、加载/导出 Scenario JSON。

**验收**：加载一个脚本即可自动播放一整段「积云生成→增厚→被风吹过→消散」的演化。

---

## 阶段 7 — 多高度层共存（可选增强）

- [ ] box 高度按 cloud-types 的 low/mid/high 分带，或叠加多张 density volume。
- [ ] 同一时刻支持「高空 cirrus + 中层 altocumulus + 低层 cumulus」。
- [ ] 各层独立风速（高层更快）。

---

## 阶段 8 — 光照与画质（配合形态，可选）

借鉴 `../procedural-clouds-threejs/cloud-shaders.md`：

- [ ] Time-of-day 调色（`SUN_COLOR/AMBIENT/BG` 随太阳高度角）。
- [ ] Silver lining（背光边缘）、Beer-powder 亮边、双瓣 HG 相函数微调。
- [ ] cumulonimbus 暗底亮顶随密度梯度增强。
- [ ] God rays 后处理（屏幕空间径向模糊）。

---

## 阶段 9 — 性能与工具

- [ ] `weatherMap` 全空区域跳过 compute（区域包围盒裁剪 dispatch）。
- [ ] 缓存分辨率/更新频率随相机距离 LOD。
- [ ] 调试视图：叠加显示 `weatherMap`、区域边界、当前 `sceneTime`。
- [ ] 远距离 fallback：烘焙到 cubemap（极远背景）。

---

## 依赖与优先级

```
阶段1(地基) ─┬─ 阶段2(形态) ──┐
             ├─ 阶段3(风)     ├─ 阶段4(空间) ─ 阶段5(生命周期) ─ 阶段6(时间轴) ── 阶段7(多层)
             └────────────────┘                                              └─ 阶段8/9(画质/性能)
```

- **核心路径**：1 → 2 → 4 → 5 → 6（完成即满足全部唯象需求）。
- 3（风）可与 2 并行。
- 7/8/9 为增强，随时插入。

## 数据模型总览

```
Scenario
 ├─ duration, wind
 ├─ regions[]  { id, shape, bounds, feather }
 └─ events[]   { t, regionId, type, coverage, densityScale, ease }
        │ 运行时插值
        ▼
weatherMap (GPU 纹理: R=coverage G=type B=densityScale A=id)
        │ compute 采样
        ▼
cloudDensity(pos)  ←─ CloudShape 预设(type) + Wind 平流 + 包络(densityScale)
        │
        ▼
3D density cache (ping-pong) ─→ raymarch ─→ 画面
```
