## ADDED Requirements

### Requirement: Temporal Quality 唯一 History Owner

渲染管线 SHALL 提供互斥的 temporal quality 路径，且同一像素在一帧内 MUST 只有一个 cloud history owner：

1. Full-resolution quality：`cloud current full-res → TAA resolve → cloud history full-res`
2. Temporal upscale quality（TAAU 4×4）：`cloud current (⌈W/4⌉×⌈H/4⌉, 每帧一个 4×4 phase) → TAAU resolve full-res → cloud history full-res`

系统 MUST NOT 对同一像素先执行旧 full-res TAA 再执行第二次 TAAU。现有 ping-pong history、YCoCg 3×3 variance clipping、Halton jitter（仅 full-res TAA）、resize/开关 reset 与 full-resolution TAA 模式 SHALL 继续可用。当仅 legacy combined emergency fallback 可用时，TAAU MUST 禁用。

#### Scenario: Full-res TAA 单 owner

- **WHEN** temporal quality 为 full-resolution TAA 且 `CloudFrameOutput` 可用
- **THEN** cloud history SHALL 仅由 full-res TAA resolve 写入，MUST NOT 再运行 TAAU resolve

#### Scenario: TAAU 单 owner

- **WHEN** temporal quality 为 TAAU 4×4 且 `CloudFrameOutput` 可用
- **THEN** cloud history SHALL 仅由 TAAU resolve 写入，MUST NOT 对同一像素串联旧 TAA

#### Scenario: Emergency fallback 禁用 TAAU

- **WHEN** active path 为 legacy combined emergency fallback
- **THEN** 系统 MUST 禁用 TAAU，且 MUST NOT 把 combined 输出当作 TAAU 的 cloud-only 输入

### Requirement: 4×4 Bayer Low-resolution Cloud Current

TAAU 模式下，cloud current pass 的渲染目标宽高 SHALL 各为 full-resolution 的 `1/4`（实现 MUST 对非 4 整除尺寸向上取整），raymarched texel 数 SHALL 为 full-res 的 `1/16`。文档、HUD 与诊断 MUST NOT 将该路径描述为“像素数只降到四分之一”。系统 SHALL 使用固定 4×4 Bayer 或等价唯一覆盖序列，以 `frame % 16` 选择本帧 subpixel phase。Bayer offset MUST 同时进入 current ray direction、current projection、previous-jitter/reprojection 与 velocity 约定，MUST NOT 仅偏移 uv。TAAU 模式 SHALL 由 Bayer offset 独占 projection/current-pixel jitter，MUST NOT 再叠加 Halton；full-res TAA 模式 SHALL 继续使用现有 Halton camera jitter。W10B STBN/IGN MUST 只扰动 ray 起点/步进与采样序列，MUST NOT 改变 4×4 pixel phase。Low-res current SHALL 自行输出 radiance/transmittance 与 depth/velocity（语义继承 W10A cloud-only），MUST NOT 从合成后的地面/天空反推云深度。Full-resolution current path SHALL 始终可切回，用于视觉真值、运动回归与设备 fallback。右/下边界的 full→low 映射 MUST 有可执行 fixture。

#### Scenario: Texel 数为 1/16

- **WHEN** full-resolution 为 `W×H` 且均可被 4 整除，并启用 TAAU
- **THEN** low-res current 尺寸 SHALL 为 `(W/4)×(H/4)`，raymarched texel 数 SHALL 为 `(W×H)/16`

#### Scenario: Bayer 独占 jitter

- **WHEN** temporal quality 为 TAAU 4×4
- **THEN** projection/current-pixel jitter SHALL 仅来自本帧 Bayer phase offset，MUST NOT 叠加 Halton

#### Scenario: STBN 不占 phase

- **WHEN** W10B STBN 或 IGN/Halton stochastic 采样启用且 TAAU active
- **THEN** stochastic 采样 SHALL 只影响 ray 起点/步进与采样序列，本帧 4×4 pixel phase SHALL 仍由 `frame % 16` 决定

#### Scenario: Ceil 边界映射

- **WHEN** full-resolution 宽或高不能被 4 整除
- **THEN** low-res 尺寸 SHALL 向上取整，且右/下边界 full→low 映射 SHALL 通过自动 fixture

#### Scenario: Full-res current 可回退

- **WHEN** 用户选择 full-resolution quality 或设备/路径要求 fallback
- **THEN** 系统 SHALL 可切回 full-resolution cloud current，无需依赖 TAAU history

### Requirement: Full-resolution TAAU Resolve 与 Reactive Rejection

TAAU resolve SHALL 以 full-resolution 输出 cloud color 与 transmittance 到 history。对应当前 Bayer phase 的 full-res texel SHALL 直接使用本帧 current sample；其余 15 个 phase SHALL 从重投影 history 恢复。Velocity 选择 SHALL 使用 low-res 3×3 邻域中最近的有效云深度或最高 derived opacity 样本；`opacity = 1 - T` MUST 仅由固定 transmittance 通道推导，MUST NOT 引入第二种 opacity attachment 语义，且稀薄边缘 MUST NOT 借用天空 invalid velocity。History 消费顺序 SHALL 为：视口、depth、derived opacity、generation 与 camera-cut rejection，其后才做 YCoCg variance clip。系统 SHALL 提供 reactive/disocclusion 规则：当当前与历史的 derived opacity、代表深度或 storage/`resourceGeneration` 差异超过阈值时，MUST 提高 current 权重或完全拒绝 history。Cloud color、transmittance 与 representative depth 的 history 策略 SHALL 分开；系统 MUST NOT 把 color clipping 结果当作物理深度。

#### Scenario: 当前 phase 直写

- **WHEN** 某 full-res texel 的 Bayer phase 等于本帧 phase
- **THEN** resolve 输出 SHALL 使用本帧对应 low-res current sample，不得用陈旧 history 覆盖该 texel

#### Scenario: 其余 phase 重投影

- **WHEN** 某 full-res texel 的 Bayer phase 不等于本帧 phase 且 history 通过 rejection
- **THEN** resolve SHALL 从重投影 history 恢复该 texel

#### Scenario: Derived opacity 选 velocity

- **WHEN** low-res 3×3 邻域存在多个候选
- **THEN** velocity SHALL 取最近有效云深度或最高 `opacity = 1 - T` 的有效样本，MUST NOT 使用 invalid 天空 velocity

#### Scenario: Rejection 先于 variance clip

- **WHEN** history 样本未通过视口、depth、derived opacity、generation 或 camera-cut 检查
- **THEN** 系统 MUST 拒绝该 history，不得先对其做 YCoCg clip 再混入

#### Scenario: 通道策略分离

- **WHEN** color 通道触发 variance clipping
- **THEN** representative depth history 策略 MUST NOT 复用该 color clip 结果作为物理深度

### Requirement: Temporal Invalidation 三代语义

TAAU/TAA 消费者 SHALL 区分三个独立概念：`resourceGeneration`（资源/分配世代）、`contentRevision`（当前分配内可重投影内容修订）、`discontinuityGeneration`（结构性不连续旗标/世代）。下列事件 MUST 触发整屏 history invalidation：W9 allocation/`resourceGeneration` 变化（若发生）、brick 重分配、producer/storage/quality 切换、sun discontinuity、scene time jump、resize、device loss，以及等价结构性 discontinuity。正常 density cache 内容更新、连续风平流与可重投影的 `contentRevision` 递增 MUST NOT 导致每帧整屏 reset；此类更新 SHALL 依靠 velocity、reactive mask 与局部 rejection。

#### Scenario: 结构性不连续整屏失效

- **WHEN** 发生 resize、device loss、producer/storage/quality 切换、sun discontinuity、scene time jump 或 camera-cut 类 `discontinuityGeneration` 变化
- **THEN** cloud temporal history MUST 整屏无效，下一帧不得混入不匹配世代的样本

#### Scenario: Content revision 不整屏 reset

- **WHEN** 仅发生正常 density cache 内容更新或连续风平流导致的 `contentRevision` 递增
- **THEN** 系统 MUST NOT 仅因此整屏清空 history，而 SHALL 依赖 velocity、reactive mask 与局部 rejection

#### Scenario: 三代名称不混用

- **WHEN** 诊断或契约检查报告失效原因
- **THEN** 输出 SHALL 分别命名 `resourceGeneration`、`contentRevision` 与 `discontinuityGeneration`，不得用单一计数器表达全部语义

## MODIFIED Requirements

### Requirement: Full-resolution Cloud-only Composite

当 `CloudFrameOutput` 可用时，渲染管线 SHALL 先积分云介质到 cloud-only 附件，再由 full-resolution composite 唯一执行 `cloudRadiance + T * background`。天空/地面解析背景 MUST NOT 写入 cloud temporal history 颜色；gizmo/axis/debug line SHALL 在 cloud temporal resolve（full-res TAA 或 TAAU，二者互斥）之后叠加。Bloom、tonemap 与所选 temporal resolve 的相对顺序 MUST 保持可回退，且 MUST NOT 对 cloud-only radiance 与最终 LDR 输出重复 tonemap。W11 MUST NOT 重新定义 W10A attachment 格式或 composite owner。

#### Scenario: History 不含天空地面

- **WHEN** cloud-frame 路径 active 且 temporal resolve（TAA 或 TAAU）启用
- **THEN** 进入 cloud temporal history 的颜色 SHALL 来自 cloud-only 积分结果，MUST NOT 烘焙天空、地面或 debug line

#### Scenario: Composite 唯一合成

- **WHEN** full-resolution composite 执行
- **THEN** 最终场景色 SHALL 按 `cloudRadiance + T * background` 合成一次，MUST NOT 在 cloud current 内提前完成等价合成后再次按 opacity 混合

#### Scenario: Resolve 后叠加 gizmo

- **WHEN** gizmo/axis/debug line 需要绘制
- **THEN** 它们 SHALL 在所选 cloud temporal resolve 之后、且不得写入 cloud history
