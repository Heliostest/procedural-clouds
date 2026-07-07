## Context

当前 `groundColor()` 对每个地面片元调用 `cloudShadowAt()`。该函数与地面可见像素数线性扩展，并在整段地面到云层光路上固定做 18 个中点样本。它已经调用统一的 `densityAt()`，因此 Cached/Hybrid/Realtime 和 edge-style 语义是一致的；本变更必须保留这一点。

诊断 A/B 已确认：Realtime 绕过 96³ 缓存、或把 Hybrid 缓存提高到 160³，规则块感都会减弱；把缓存降到 48³ 会恶化。说明主要信息上限来自 3D 密度缓存，固定 18 步则进一步加入积分欠采样。本变更只能减少投影与积分伪影，不能伪造源密度细节。

## Goals / Non-Goals

### Goals

- 用一个可复用函数定义地面云影的光学厚度积分，阶段 1 与阶段 2 不产生两套结果语义。
- 消除固定步数导致的规则条带、台阶和长光路漏采样，同时保持受控成本。
- 阶段 2 将云影成本从屏幕像素数中解耦，并提供有限时域与空间稳定。
- Cached、Hybrid、Realtime、edge sharpening、物理风平流和暂停/scrub 必须保持一致。
- 所有新路径均可运行时旁路，便于视觉 A/B 和性能回归。

### Non-Goals

- 以二维缓存替代三维密度缓存或主云体 raymarch。
- 对任意高度和法线的三维接收面提供严格正确的阴影投影。
- 通过无限历史混合掩盖错误更新；运动状态不可信时宁可刷新。

## Decisions

### D1 — 一个积分器、三个执行模式

WGSL 提取语义单一的地面云影函数：

```wgsl
fn integrateGroundShadow(origin : vec3f, seed : f32) -> GroundShadowResult
```

返回至少包含透射率与已执行采样数。所有模式必须调用 `densityAt()`：

- `legacy`：保留现有固定 18 个中点样本，只用于 A/B 和回退。
- `adaptive`：阶段 1 默认；片元内调用新积分器。
- `transmittance`：阶段 2 默认；compute pass 调用同一积分器生成二维纹理，片元采样纹理。

不允许阶段 2 为求速度改用 `sampleDensity()`、跳过 edge shaping，或在 Hybrid 下只采低频缓存。

### D2 — 阶段 1 使用有界分层自适应积分

自适应不是依据当前样本密度盲目大步跳跃；这种做法可能越过薄云。积分器先求射线与云场盒体的有效区间，再根据：

- 区间长度；
- 当前质量模式的有效密度尺度；
- 3D 缓存体素尺寸（Cached/Hybrid）；
- 用户步长尺度与最大步数；

确定动态分段数。默认最大步数为 32，静态循环上限为 64，运行时提前 break。每段执行一个分层样本，并继续保留 `dens * shadowDarkness > 4.6` 等价的高光学厚度提前结束。

抖动采用 ground XZ 与分段索引生成的世界空间稳定序列，只在各自分层区间内移动样本，不改变无偏区间覆盖：

- TAA 关闭时，序列不得逐帧变化，避免闪烁。
- 阶段 1 默认不依赖 TAA 才能稳定。
- 阶段 2 可在独立历史有效时使用低幅帧序列旋转。

### D3 — 阶段 1 先建立基线和门槛

开始阶段 1 前记录固定场景、固定相机下的截图、GPU 时间、平均地面云影采样数与 96³ 缓存参数。至少覆盖：

- 正午/高太阳角静态场景；
- 10° 低太阳角；
- 默认物理风移动；
- Cached、Hybrid、Realtime；
- TAA 开/关与 edge sharpening 开/关。

阶段 1 只有在默认 Hybrid GPU 时间相对 legacy 增量不超过 20%、平均采样数不超过 32，且没有新增闪烁、漏影或明显条带时才通过。

### D4 — 阶段 2 使用世界空间二维透射率缓存

新增固定分辨率 compute pass。默认 512²，每个 texel 对应 scene-ground XZ 上一个位置，并调用 `integrateGroundShadow()`。输出使用可线性过滤的 `rgba16float`，只使用其中一个通道保存透射率，保留其余通道供调试/未来统计而不在本阶段扩展语义。

主渲染 `groundColor()` 在 `transmittance` 模式下：

1. 将地面世界 XZ 映射到云影纹理 UV；
2. 在线性采样前检查纹理有效性与覆盖范围；
3. 在守卫带内把纹理结果与 adaptive 内联结果混合；
4. 无效或越界时完全回退 adaptive，不采未初始化历史。

纹理覆盖当前 simulation box 的 scene-ground XZ。盒外无限地面、竖直接收面与级联覆盖不是本阶段目标；盒体边界必须通过守卫带回退而非硬裁切。

### D5 — 更新调度与物理风共享同一事实

透射率缓存维护可比较的 generation/signature，至少包含：

- 太阳方位/高度；
- scene-ground 范围与米/世界单位比例；
- 质量模式、密度缓存 generation/blend、edge-style generation；
- 云体数量、placement、生命周期调制与当前 `WindAdvectionSample`；
- 云影积分参数。

默认每 2 帧允许生成一个新样本，但以下情况必须立即刷新或清空历史：

- 太阳或场景映射改变；
- 质量模式、缓存分辨率、edge 参数或云体拓扑改变；
- 任一云体自上一云影快照移动超过半个云影 texel；
- scenario 跳转、向后 scrub、重置平流相位或时间不连续。

不同云体可有不同风速，因此不得以单一全局 UV 平移重投影全部历史。若不能证明统一平移有效，就降低历史权重或重置。

### D6 — 独立历史与有限空间柔化

阶段 2 使用双缓冲透射率历史，不复用屏幕空间 TAA 历史。默认历史权重为 0.8，但必须依据 D5 的变化量动态降权；硬失效条件下权重为 0。

历史合成后执行最多半径 1 texel 的可旁路 separable tent 过滤。过滤半径以云影 texel 为单位并限制上限，避免把云体宏观轮廓糊成均匀灰斑。该过滤表达有限太阳半影/重建柔化，不改变 `shadowDarkness` 的光学厚度语义。

### D7 — 参数与 GPU 布局

`CloudParams` 增加：

- `groundShadowMode`: `legacy | adaptive | transmittance`
- `groundShadowMaxSteps`: 默认 32，范围 8–64
- `groundShadowStepScale`: 默认 1.0
- `groundShadowJitter`: 默认 1.0，范围 0–1
- `groundShadowMapResolution`: 默认 512，可选 256/512/1024
- `groundShadowMapUpdateRate`: 默认 2 帧
- `groundShadowHistoryWeight`: 默认 0.8，范围 0–0.95
- `groundShadowFilterRadius`: 默认 1，范围 0–2

阶段 1 所需字段按一个对齐 vec4 扩展现有 `Globals`，同步更新 `BODY_BASE`。阶段 2 的资源尺寸和调度字段尽量留在 CPU；只有主 shader/compute shader 实际读取的值才进入 GPU uniform。所有偏移仍由 `PARAM_OFFSETS`/命名 pack 单一事实来源维护。

### D8 — 阶段门控与最终默认值

实现顺序不可交换：

1. legacy 基线；
2. adaptive 实现与验收；
3. adaptive 成为默认；
4. 物理风视觉契约完成；
5. transmittance 资源、调度、历史、过滤；
6. transmittance A/B 与验收；
7. transmittance 成为最终默认。

若阶段 2 未通过移动云、低太阳角、边界接缝或摊销成本验收，最终默认保持 adaptive，不能仅因功能存在而切换。

## Alternatives Considered

### 提高默认 3D 缓存到 160³/192³

可直接改善源密度，但内存和 compute 成本按立方增长，且不能解决每屏幕像素重复积分。保留为高质量用户选项，不作为本变更主方案。

### 把固定步数直接改为 64

实现简单，但诊断中 Realtime 64 步已导致交互和截图超时，且所有地面像素承担同样成本。否决。

### 屏幕空间半分辨率云影

容易接入当前后处理，但相机移动、遮挡与屏幕重投影会把云影稳定性绑定到 TAA，且无法供世界空间地面复用。否决，采用世界空间纹理。

## Risks / Trade-offs

| 风险 | 缓解 |
|---|---|
| 96³ 源密度仍限制真实细节 | 明确能力边界；用 adaptive/过滤减少规则伪影，不宣传恢复高频 |
| adaptive 最大 32 步仍增加片元成本 | 动态步数、提前结束、20% 阶段门槛；失败则调步长而非放宽门槛 |
| 世界空间抖动形成静态颗粒 | 分层内低幅稳定序列；阶段 2 由独立历史与有限过滤收敛 |
| 历史混合在多风速云体下拖尾 | 不做单一平移假设；按每体位移阈值降权/重置 |
| 512² 在 32 km 场景约 62.5 m/texel | 线性过滤与可选 1024；不通过提高 3D 缓存冒充阴影纹理质量 |
| 低太阳角路径很长 | adaptive 最大步数保护、提前结束；盒外通过守卫带回退，不扩大为无限纹理 |
| active changes 同时触碰参数布局 | 实施前重新读取实际 `BODY_BASE`/offset；逐字段合并并严格校验 |

## Migration Plan

1. 增加参数与 legacy/adaptive A/B，不改变初始默认。
2. 实现 adaptive、完成阶段 1 验收后切为默认。
3. 在物理风视觉契约完成后增加透射率纹理资源与 compute pass，初始默认关闭。
4. 完成历史、过滤、边界回退和阶段 2 验收后切为 transmittance 默认。
5. 保留 legacy/adaptive 运行时模式至少到本 change 归档，后续删除必须单独提案。

