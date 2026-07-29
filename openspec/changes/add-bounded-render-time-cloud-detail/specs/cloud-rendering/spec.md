## ADDED Requirements

### Requirement: Hybrid 有界 detail 资源与回退

Hybrid renderer SHALL 对每个 Hybrid pipeline layout 绑定有效的只读 detail resources 或固定 dummy read-only bindings。资源 SHALL 仅来自 `DensityDetailResources` 的 sampler、Base/Detail views、版本、generation 与可用性；renderer MUST NOT 直接消费 producer-private diagnostics、storage view、generator pipeline 或 writable bind group。Legacy producer、atlas unavailable、`edgeSharpening=false`、`detailStrength<=0` 或 inactive world-step 时，系统 MUST 禁用 W12 dilation、erosion、warp 与 atlas sampling，并输出 coarse/hardening fallback。系统 MUST NOT 使用解析 noise fallback 或隐式创建第二套 atlas。

#### Scenario: Legacy producer

- **WHEN** active producer 未提供可用 Shared Fields
- **THEN** Hybrid SHALL 使用 dummy read-only bindings 并在不采样 detail atlas 的情况下渲染 coarse fallback

#### Scenario: 可用资源

- **WHEN** detail resources 可用且全局开关满足 W12 条件
- **THEN** Hybrid SHALL 只读采样既有 Base/Detail atlas，且 MUST NOT 新建第三套噪声纹理

#### Scenario: Generation 失效

- **WHEN** detail resource generation 改变
- **THEN** renderer SHALL 使 cloud temporal history 无效并标记 discontinuity；正常 content revision 或连续风平流 MUST NOT 仅因此整屏失效

### Requirement: Hybrid rough 与 final 密度语义

Hybrid SHALL 将已有 global 或 hierarchical support 输出送入唯一的 gain-dilate / pure-erode `remapClamped` stage。stage 在 support 非正时必须在昂贵 sample 前返回零；erosion 只抬低端阈值，`finalDensity` MUST 有限、非负、单调不减于 support，且 MUST NOT 大于 `roughDensity` 或 `dilated`，不得在 Support 外产生正密度。`roughDensity` SHALL 跳过最高频 detail；main ray SHALL 使用 final，`lightMarchDepth()`、legacy/adaptive ground shadow 与 silver edge probe SHALL 使用 rough。global Hybrid、hierarchical Hybrid 与主 shader 的三处组合点 MUST 调用同一 WGSL stage 定义；不得各自复制函数体。Cached、Realtime 与 hierarchical Cached 的既有 edge shaping 语义不得被此 requirement 改写。

#### Scenario: 空 support

- **WHEN** global 或 hierarchical support density 非正
- **THEN** stage SHALL 在 detail/warp atlas sample 前返回零，final MUST NOT 产生 Support leak

#### Scenario: 光照使用 rough

- **WHEN** light march 或任一地面云影路径请求密度
- **THEN** source closure SHALL 不含最高频 detail sample，且 SHALL 使用 rough density

#### Scenario: 三处 Hybrid 一致

- **WHEN** 主 shader、global Hybrid adapter 或 hierarchical Hybrid adapter 组合密度
- **THEN** 三者 SHALL 调用同一 stage 定义，并保留各自既有 support 语义

#### Scenario: Edge 总回退

- **WHEN** `edgeSharpening` 为 false
- **THEN** W12 dilation、erosion、warp 与 atlas sample SHALL 全部关闭；Cb SHALL 保留既有回退语义

### Requirement: W12 debug 与证据隔离

渲染器 SHALL 提供 debug 18 erosion 与 debug 19 `finalDensity-roughDensity`。它们 MUST 在 composite 后以独立 overlay 写入 scene output，MUST NOT 写入 cloud history、history depth、`CloudFrameOutput` history 或改变 history validity。W12 Gate SHALL 固定 Bloom、曝光和 tonemap，并记录 raw density、normal、edge-only、detail frequency、wind motion、TAAU 收敛、fallback、global-only 与 main ray/local light/ground shadow 成本；W13 BSM 成本 SHALL 记录为 not-applicable。

#### Scenario: Debug 非破坏

- **WHEN** 用户切换 debug 18 或 19
- **THEN** history 内容和有效性 SHALL 保持不变，overlay 仅影响 composite 后可见 scene

#### Scenario: Detail-off 回退

- **WHEN** detailStrength 为零
- **THEN** 渲染 SHALL 精确回退到 world-step-on 的 W12 120/512 基线；world-step-off 仅作为旧 W11 对照

## MODIFIED Requirements

### Requirement: 密度取样质量模式

渲染管线 SHALL 提供可运行时切换的密度取样质量模式，至少包含：cached（读低分辨率 3D 缓存 + 时间混合）、hybrid（缓存基底叠加有界 render-time carve 细节）、realtime（每步直接调用 `cloudDensity()`、完全跳过缓存）。片元主 raymarch 与光照行进 MUST 经单一取样分发入口取得密度，使三种模式行为一致地作用于成像与阴影。Hybrid SHALL 将 global 或 complete hierarchical support 输入唯一 dilate-then-erode stage；main ray SHALL 消费 `finalDensity`，`lightMarchDepth()`、legacy ground shadow、adaptive ground shadow 与 silver edge probe SHALL 消费 `roughDensity`。`finalDensity` MUST NOT 大于 `roughDensity`，而 `roughDensity` MUST 保留 support 的既有 hardening 语义并跳过最高频 detail。Cached、Realtime 与 hierarchical Cached SHALL 保留既有 `applyEdgeShaping()` 语义；本 change 不改写其 source closure 或 W9 support 语义。

#### Scenario: cached 模式复现现状

- **WHEN** 质量模式为 cached
- **THEN** 密度取样 SHALL 等价于引入本特性前的缓存采样，画面与之像素级一致，且 SHALL 保留既有 `applyEdgeShaping()`

#### Scenario: realtime 模式跳过缓存

- **WHEN** 质量模式为 realtime
- **THEN** raymarch 每步 SHALL 直接调用 `cloudDensity()` 求密度，清晰度上限 SHALL 取决于行进步数而非缓存分辨率，且密度缓存 compute pass SHALL 被跳过，并保留既有 `applyEdgeShaping()`

#### Scenario: hybrid 模式补高频细节

- **WHEN** 质量模式为 hybrid 且细节强度大于 0
- **THEN** 在缓存基底存在（密度高于阈值）处 SHALL 按 detail 波长/erosion 强度进行有界 carve，使边缘较 cached 更锐，main ray SHALL 使用 final，light/legacy ground/adaptive ground/silver edge probe SHALL 使用 rough，且 MUST NOT 在空区凭空生成密度

#### Scenario: 取样入口统一

- **WHEN** 着色器在主 raymarch 或光照行进中取密度
- **THEN** 二者 SHALL 经同一分发入口取值，质量模式切换 SHALL 同时影响成像与自阴影；Hybrid 的 consumer SHALL 按请求取得 final 或 rough
