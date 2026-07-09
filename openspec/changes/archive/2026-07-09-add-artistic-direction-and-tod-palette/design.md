## Context

阶段 7 已落地 8 结点 `todColors()`，但关键色是工程拟合值，不是 cloud-types 艺术色板。十属只有名称 i18n，没有「这朵云应该长什么样」的验收文案。本变更把参考资料变成可执行契约：文案给人看，色板给 shader 用。

## Goals / Non-Goals

### Goals

- 十属均有中英 artistic 文案，预设编辑器可见。
- 黄昏/暮色/正午下亮面、阴影、天空色更接近 cloud-types 表，冷暖分离更清晰。
- 一键回退旧 TOD 表，避免色板改坏无法对比。

### Non-Goals

- 物理大气、按属 lit RGB、方位不对称昼夜。

## Decisions

### D1: artistic 文案只做参考元数据

来源：`../procedural-clouds-threejs/cloud-types.md` 各属 `artistic` 段，译为中文并保留英文。存放于 `src/genusArtistic.ts`（或 `genusProfile` 旁路模块），经 `i18n` 按语言取出。GUI 在预设编辑器当前云属 folder 顶部以只读说明展示。文案 MUST NOT 进入 GPU pack，MUST NOT 改变密度/光照公式。

### D2: 色板映射到既有 5 通道

cloud-types 三列 → heli 通道：

| 表列 | 映射 |
|------|------|
| Cloud Lit Side | `TOD_SUN`（主）+ 适度影响 `TOD_AMBIENT` 暖度 |
| Cloud Shadow | `TOD_SHADOW` |
| Sky | `TOD_BG`；`TOD_TOP` 由同档天空加深/压暗派生，保持天顶更冷更深 |

结点语义（高度角，dawn/sunset 共用 0°）：

| Knot ° | 语义 | 表行 |
|--------|------|------|
| -15 | Night | Night |
| -6 | Twilight | Twilight |
| 0 | Sunset/Dawn | Sunset（与 Dawn 同高角；取 Sunset 行，Dawn 仅作文案对照） |
| 5 | Golden Hour | Golden Hour |
| 12 | Afternoon | Afternoon |
| 25 | Morning | Morning |
| 45 | Midday | Midday |
| 90 | Midday zenith | Midday |

Hex → linear RGB（`/255`，不做 sRGB 解码到线性的复杂管线；与现表一致用 0–1 直接色）。实现时记录最终 `vec3` 常量。

### D3: 可回退混合

新增全局 `todPaletteBlend`（0=旧表，1=新艺术色板，默认 1），在 `todColors()` 内对五通道 `mix(old, new, blend)`。旧表常量表保留为 `TOD_*_LEGACY`。GUI 放在光照 folder。`blend==0` 时 MUST 复现本变更前观感。

不扩 `Globals` 若无槽：优先复用 pad；若无 pad 则按既有 `PARAM_OFFSETS`/`BODY_BASE` 同步扩展（实现期选最小改动）。

### D4: 验收用固定高度角截图

固定相机与云体，分别在 elevation ≈ `-6 / 0 / 5 / 12 / 45` 对比 blend 0/1；记录于 tasks。不要求自动化像素 diff。

## Risks / Trade-offs

- 新色板可能让白天过暖或过饱和 → 用 blend 与微调 ambient/top 派生缓解。
- Dawn/Sunset 共用可能让「清晨」不够桃粉 → 接受高度角限制；文案中注明。
- 文案过长撑开 GUI → 用可折叠 tip / 多行只读文本，默认折叠或限高滚动。

## Migration Plan

- 无 scenario/body 迁移。
- 回退：`todPaletteBlend=0` 或还原常量。

## Open Questions

- 无。最终 hex→vec3 与 ambient/top 派生系数实现期人眼微调后写入 tasks。
