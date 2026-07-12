## RENAMED Requirements

- FROM: `### Requirement: 双属静态分发与 Legacy-compatible 多体合成`
- TO: `### Requirement: W7 五属静态分发与 Legacy-compatible 多体合成`

## MODIFIED Requirements

### Requirement: W7 五属静态分发与 Legacy-compatible 多体合成

W7 dispatcher SHALL 只为 enabled Cumulus 与四个 Stratiform genus 调用对应预编译 family evaluator：Cumulus 路由 Billow；Stratus、Cirrostratus、Altostratus、Nimbostratus 路由同一个 Stratiform family kernel。Stratocumulus、Cumulonimbus、Altocumulus、Cirrus、Cirrocumulus SHALL 返回零且零 sample。分发 MUST 位于 family sample 前，不得使用动态 operator array、bytecode、函数指针或按 sampleLimits 循环。

对所有 enabled Body contribution，W7 SHALL 累加 total、跟踪最大和次大 contribution/genus，并保持 Legacy-compatible soft overlap：`rest=max(total-bestD,0)`、`restCap=max(bestD,0.25)`、`density=bestD+restCap*(1-exp(-rest/restCap))`、`w2=secondD/max(bestD+secondD,1e-4)`。最终 RGBA SHALL 为 `[density,bestGenus,secondGenus,w2]`；无贡献时四通道 MUST 全零。

#### Scenario: 单属 Metadata

- **WHEN** voxel 只有一个 enabled W7 genus Body 提供正贡献
- **THEN** G SHALL 为该规范 genus ID、B/A SHALL 为零或约定无次属值，R SHALL 等于单体 contribution 的有限值

#### Scenario: Stratiform family 内重叠

- **WHEN** 两个不同 Stratiform genus Body 在同一 voxel 提供不同正贡献
- **THEN** G/B SHALL 按贡献从大到小记录两个 genus ID，A SHALL 位于 `[0,0.5]`，R SHALL 使用 soft overlap，后续 Optical SHALL 能区分主次 genus

#### Scenario: Cumulus 与 Stratiform 重叠

- **WHEN** Cumulus 与任一 W7 Stratiform Body 重叠
- **THEN** 两个 family contribution SHALL 使用相同 top-two composition，不得因 family 不同改用私有 cache channel或无界相加

#### Scenario: Unsupported-only 场景

- **WHEN** active V2 frame 只包含五个未迁移 genus Body
- **THEN** cache SHALL valid 且 RGBA 全零，HUD SHALL 明确报告 unsupported Recipe，Legacy Producer 仍可显示相同场景

### Requirement: W6 Proof-of-Architecture 继续停止门

W6 SHALL 使用同一浏览器、device、固定 manifest、camera、scene time、Body、wind、`96³` resolution、`8×8×4` workgroup 与 Cached 配置采集 Legacy/V2 配对证据。每个 backend/case SHOULD 排除 pipeline/shared-field warmup，先完成至少 5 次 cache warmup，再采集至少 30 个有效 cache timestamp，分别报告 median 与 p90。CPU timing、FPS、debug view、未运行 cache 的 frame 或 W5 generator timing MUST NOT 替代 steady cache GPU timing。

Stratus single/multi V2 median 目标为不高于对应 Legacy 的 0.80，p90 目标为不高于 1.00；Cumulus single/multi V2 median 目标为不高于 1.10，p90 目标为不高于 1.20。若 timestamp query 不可用、样本不足或任一数据混入不兼容状态，该性能项 SHALL 为 `unresolved` 而不是 pass。项目所有者 MAY 在形态和全部不可豁免架构正确性项通过后，以明确记录的 `owner-waived` 决策批准归档和创建 W7；该决策 MUST NOT 被表述为性能 pass。

#### Scenario: Gate 全部通过

- **WHEN** 两属性能阈值、形态、Support containment、finite RGBA、metadata、tile、周期、source closure、资源和 Legacy 回归全部通过
- **THEN** W6 Gate report MAY 标记 Continue，项目所有者批准后 MAY 归档 W6 并创建 W7

#### Scenario: Owner 明确豁免精确性能证据

- **WHEN** 性能项因未采集合格 timestamp 样本而 unresolved，但形态、Support、finite RGBA、metadata、tile、source closure、资源和 Legacy 回归均无失败，且项目所有者明确批准继续
- **THEN** Gate MAY 记录 `owner-waived` 并允许归档 W6、创建 W7，但 MUST 保留 unresolved 原始事实且 MUST NOT 记为性能 pass

#### Scenario: 不可豁免失败

- **WHEN** 形态需要恢复完整 4D chain、增加 per-body texture、扩大无界成本才能成立，或存在 Support false-negative、NaN/Inf、metadata、source budget、资源/pass 或 Legacy 回归失败
- **THEN** Gate SHALL 标记 Stop/Review，系统 MUST 保留 Legacy 与当前 Seam，且 owner waiver MUST NOT 将该结果改为 Continue

## ADDED Requirements

### Requirement: 参数化 Stratiform Family Evaluator

W7 Stratiform kernel SHALL 由 rounded-sheet analytic footprint、Recipe-selected Thin Sheet/Soft Layer vertical profile、高 coverage Macro support、低幅 Macro thickness shift、一次低频 Base modulation 与公共 Finalize 产生主体密度。每次通过早退的 Body evaluation SHALL 至多执行 Macro=1、Base=1 共 2 次 shared sample；Detail、coordinate warp、Worley/cell loop、dynamic octave、attachment 与 Hybrid detail sample MUST 为零。

Stratus SHALL 保持 W6 Thin Sheet 数值回归；Cirrostratus SHALL 使用极低幅/低频、近均匀 Thin Sheet；Altostratus SHALL 使用平缓 Soft Layer 与水平相对垂直的低频结构；Nimbostratus SHALL 使用高 coverage/高填充 Thick Soft Layer。family kernel MUST NOT 读取 halo、sun disc、absorption、base darkening、lightning 或 precipitation 参数。

#### Scenario: Stratus 回归

- **WHEN** 对相同 W6 Stratus Recipe、Body、Macro/Base sample fixture 执行泛化前后 CPU/WGSL mirror
- **THEN** density、profile boundary 与 sample-call 上限 SHALL 在约定容差内保持一致

#### Scenario: Cirrostratus 极薄均匀幕

- **WHEN** 使用默认 W7 Cirrostratus Recipe 且 coverage 接近 1
- **THEN** density SHALL 形成连续 Thin Sheet，低幅结构不得产生明显胞状团块，halo 仍只由 Optical Profile 产生

#### Scenario: Altostratus 柔和中层

- **WHEN** 使用默认 W7 Altostratus Recipe
- **THEN** Soft Layer SHALL 具有平缓上下边界与低幅缓慢厚度变化，sun disc 可见性 MUST NOT 改变 density sample budget

#### Scenario: Nimbostratus 厚层主体

- **WHEN** 使用默认 W7 Nimbostratus Recipe
- **THEN** Soft Layer SHALL 比 Altostratus 具有更高填充/密度与连续厚层，但不得生成 Support 外底部碎云或 precipitation attachment

#### Scenario: Stratiform 静态采样预算

- **WHEN** 静态审计 Stratiform family evaluator 可达调用图
- **THEN** source SHALL 只有一处 Macro 与一处 Base sample call site，四属 sample 上限均为 2，Detail/warp/octave/attachment SHALL 为零

### Requirement: W7 Stratiform Migration Gate

W7 SHALL 使用固定 St/Cs/As/Ns single、family stack/overlap manifests，对 Legacy/V2、Cached/Hybrid、normal/density-debug 进行视觉与协议验证。若 timestamp query 可用，每个 backend/case SHALL 先完成至少 5 个 cache warmup，再采集至少 30 个有效 cache timestamp；Cs/As/Ns 的 V2 cache median 目标 SHALL 不高于 Legacy `1.00×`，p90 SHALL 不高于 `1.20×`。

性能结果 MUST 分类为 `pass`、`fail`、`unresolved` 或 `owner-waived`。FPS、CPU timing、cloud pass、debug view 或 owner waiver MUST NOT 被标成 cache performance pass。source budget、Support false-negative、NaN/Inf、metadata 错误、Legacy/Cumulus/Stratus 回归或资源/pass 增长失败不可豁免。

#### Scenario: W7 正常继续

- **WHEN** 四属形态/连续性、source/sample budget、Support、finite RGBA、metadata、资源与回退全部通过，且性能为 pass 或项目所有者显式 owner-waived
- **THEN** W7 Gate report MAY 标记 Continue，项目所有者批准后 MAY 归档并创建 W8

#### Scenario: 不可豁免失败

- **WHEN** 出现 Support false-negative、NaN/Inf、错误 genus metadata、Legacy/Cumulus/Stratus 回归、新 texture/pass、超预算 sample 或需要恢复完整 4D chain
- **THEN** Gate SHALL 标记 Stop/Review，不得以 owner waiver 记为 Continue

#### Scenario: 一次性成本独立

- **WHEN** 首次创建或扩展 W7 V2 pipeline
- **THEN** shared generator timing、pipeline create CPU、source length 与资源字节 SHALL 与 steady cache timestamp 分开报告
