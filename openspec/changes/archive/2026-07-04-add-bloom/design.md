## Context

当前后处理链（`src/renderer.ts`）：

```
cloud pass → offscreen rgba16float
  → TAA pass → history buffer
  → fsPost: sample scene → godray → exposure → tonemap → gamma → swapchain
```

`fsPost` 内 God rays 为屏幕空间径向采样（48 步），与 Bloom 用途不同。HDR 已在阶段 1 整理完毕（offscreen 线性 HDR，tonemap 在 post 末尾）。TAA 已在阶段 8 落地，Bloom 输入应取 TAA 输出（`historyViews[histIndex]`），避免抖动伪影。

roadmap 阶段 9 指定 Jimenez(COD AW 2014) 双滤波 / Kawase 金字塔，不用 shadertoy 径向采样。

## Goals / Non-Goals

**Goals:**
- HDR 域 Bloom：阈值提取高亮 → 双滤波/Kawase 模糊 → 在 tonemap 前叠加。
- 参数可调：`bloomEnabled`、`bloomThreshold`、`bloomAmount`。
- 默认关闭，零观感回归。
- 验收：太阳/受光云缘柔和光晕，无方向条纹，主体不糊。

**Non-Goals:**
- 不改云体 raymarch / 密度 / 光照模型。
- 不做 lens flare、色差、暗角（roadmap「不做/暂缓」）。
- 不与 God rays 合并（二者独立开关）。
- 不做 compute shader 版 Bloom（render pass 足够，成本低）。

## Decisions

### D1：算法 — Jimenez 2014 Dual Filter（首选）

采用 Jorge Jimenez «Next Generation Post Processing in Call of Duty Advanced Warfare» 双滤波：

1. **Extract pass**：对 HDR 场景色取 luminance，超过 `bloomThreshold` 的部分写入半分辨率 RT（`max(col - threshold, 0)` 或 soft knee 可选）。
2. **Downsample chain**：逐级 13-tap 降采样（半分辨率链，约 5–6 级至 1/32 或更小）。
3. **Upsample chain**：tent filter 上采样并逐级累加（dual filter 核心：down+up 各一次即得宽核近似）。

备选 Kawase blur 金字塔：实现更简单但光晕形状略不同。roadmap 两者均可；本变更优先 Jimenez dual filter，若实现复杂度超预期可降级为 Kawase（5 级 down/up）。

否决 shadertoy 径向采样：roadmap 明确排除，且易产生方向条纹。

### D2：管线插入点

```
TAA out → [Bloom extract+blur passes] → fsPost:
  col = scene
  col += bloomTexture * bloomAmount   // HDR 域
  col += godray(...)
  col *= exposure
  tonemap + gamma
```

Bloom MUST 在 exposure 之后、tonemap 之前叠加（与 roadmap「tonemap 之前」一致；exposure 影响阈值提取的输入亮度，extract 在 exposure 前的 scene 上取，add 在 exposure 后的 col 上——或统一在 exposure 前 extract/add，本设计取：**extract 用 exposure 前的 TAA 输出，add 在 `col * exposure` 之后 tonemap 之前**，使阈值与最终亮度感知一致）。

简化方案（推荐）：extract 与 add 均在 `col *= exposure` 之后、tonemap 之前，阈值作用于已曝光 HDR 色，参数更直观。

### D3：分辨率与 pass 数

- Bloom 链全程 **半分辨率**（宽/2 × 高/2），末级 upsample 全屏合成。
- 约 5 级 mip + 1 extract = 6 render pass；`bloomEnabled=false` 时跳过全部。
- 中间纹理：`rgba16float`，与 offscreen 格式一致。

### D4：参数与 uniform

扩展 post uniform（`Post` struct / `postData`）：

| 字段 | 含义 | 默认 |
|---|---|---|
| `bloomEnabled` | 0/1 开关 | 0 |
| `bloomThreshold` | 亮度阈值 | 1.0 |
| `bloomAmount` | 叠加强度 | 0.5 |

同时写入 `CloudParams` + `PARAM_OFFSETS`（与 `godrayStrength`/`exposure` 同级），GUI 后处理文件夹。

### D5：与 TAA 的交互

Bloom 输入 = TAA 输出（当前 `postBindGroups` 已绑定 `historyViews[histIndex]`）。TAA 关闭时仍走同一 history buffer（TAA pass 旁路写入 scene 或直传——以实现为准，Bloom 始终读 post 输入纹理）。

### D6：GUI 与 i18n

`gui.ts` 后处理文件夹：`bloomEnabled` checkbox + `bloomThreshold`(0–3) + `bloomAmount`(0–2)。`i18n.ts` 增中英文标签。

## Risks / Trade-offs

- [半分辨率 Bloom 在 4K 下仍可能可见] → 5–6 级链足够宽核；验收时查云缘与太阳。
- [HDR 高亮 + Bloom + God rays 叠加过曝] → 默认 `bloomAmount` 保守；tonemap 滚落兜底。
- [额外 6 pass 增带宽] → 默认关闭；半分辨率链成本可控（roadmap 评估成本「低」）。
- [方向条纹] → 禁用径向采样，用各向同性 dual filter。
- [post uniform 扩展破坏布局] → 追加字段保持 16 字节对齐。

## Migration Plan

1. 增 Bloom pass 与纹理，默认 `bloomEnabled=false`。
2. 实现 fsPost 内 bloom 合成分支。
3. GUI 控件 + i18n。
4. 手动验收：开 Bloom 见光晕；关 Bloom 与现版一致。
5. `openspec validate add-bloom --strict` 通过。

回滚：关 `bloomEnabled` 或 revert renderer 改动。

## Open Questions

- Extract 是否加 soft knee（平滑阈值过渡）？倾向首版 hard threshold，观感不够再加 knee。
- Bloom 是否受 `debugView` 旁路影响？倾向 debug 视图时跳过 Bloom（与 godray 一致读 `post.flags.x`）。
