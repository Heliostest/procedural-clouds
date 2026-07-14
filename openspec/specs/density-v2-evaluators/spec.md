# density-v2-evaluators Specification

## Purpose
TBD - created by archiving change add-density-v2-stratus-cumulus-spike. Update Purpose after archive.
## Requirements
### Requirement: W6 公共 Density Context 与廉价早退

W6 V2 evaluator SHALL 从 `DensityFrameGPU` 与 compact `DensityBodyGPU` 建立 world position、累计风平流后的 transported position、quaternion 逆旋转 body-local position、normalized XZ、`height01`、feather 与 genus/recipe identity。对每个有效 voxel，系统 MUST 先执行全局 bounds、W4 tile candidate bit、`i<activeBodyCount<=12`、recipe-enabled、有限 half extent、analytic horizontal footprint 与 vertical support 检查，只有仍可能产生非零密度的 Body 才可调用 shared-field sampling helper。

Common Context MUST NOT 引用 Legacy Params/BodyGPU、Optical Profile、4D noise 或 per-body texture。其 analytic support 与 enabled evaluator产生的全部非零密度 MUST 位于 `density-recipe-schema` 声明的保守 Support 内。

#### Scenario: Disabled Recipe 零采样

- **WHEN** candidate bit 引用一个 W6 未启用 genus，或 Recipe `enabled=0`
- **THEN** 该 Body SHALL 返回零且不执行任何 Macro/Base/Detail texture sample，其他 enabled Body 仍按 compact 顺序求值

#### Scenario: Footprint 与高度早退

- **WHEN** voxel 位于 Body analytic horizontal footprint 或 vertical support 外
- **THEN** evaluator SHALL 在 family dispatch 与 shared sample 前返回零，MUST NOT 依赖 atlas 值把 Support 外点重新变为非零

#### Scenario: 旋转平流保持局部形态

- **WHEN** Stratus/Cumulus Body 具有有限三轴旋转和累计水平风平流
- **THEN** Context SHALL 使用 quaternion 逆旋转与 transported center 得到相同 body-local profile，非零 voxel 所属 tile MUST 保留对应 candidate bit

### Requirement: Stratus Thin-Sheet Stratiform Evaluator

W6 Stratus SHALL 由 rounded-sheet analytic footprint、Thin Sheet vertical profile、高 coverage Macro support、低幅 Macro thickness shift、一次低频 Base modulation 与公共 Finalize 直接产生主体密度。其每次通过早退的 Body evaluation SHALL 恰好至多执行一次 Macro sample 与一次 Base Atlas sample，Detail sample、coordinate warp、Worley/cell loop、attachment 与动态 octave MUST 为零。

Thin Sheet SHALL 具有有限 bottom/top fade，厚度变化不得使 local top 低于 0.7 或高于 1.0；Base modulation 只允许低幅改变密度，MUST NOT 产生 Cumulus 式离散胞状主体。W6 不启用 Stratus fractus，因此不得执行高频 fBm cutout。

#### Scenario: 连续薄层

- **WHEN** coverage 接近 1、Body bounds 合法且使用默认 W6 Stratus Recipe
- **THEN** density debug SHALL 显示在水平 footprint 内连续的低幅薄层，上下边界平滑且无明显 Worley 团块或周期断层

#### Scenario: Stratus 静态采样预算

- **WHEN** 静态审计 Stratus evaluator 可达调用图
- **THEN** shared sample call 上限 SHALL 为 2（Macro=1、Base=1、Detail=0），warp/attachment/octave loop SHALL 为零

#### Scenario: 低 Coverage 有界变薄或开孔

- **WHEN** Body coverage 从 1 降低但仍大于零
- **THEN** Macro coverage remap MAY 平滑减少占据区域，但 density MUST 保持有限非负，MUST NOT 扩张出 rounded-sheet Support

### Requirement: Cumulus Flat-Base Billow Evaluator

W6 Cumulus SHALL 由 elliptical analytic footprint、Flat-base Dome vertical profile、Macro coverage、两次 Base Atlas Billow 与一次 Detail Atlas erosion产生主体密度。每次通过早退的 Body evaluation SHALL 至多执行 Macro=1、Base=2、Detail=1 共 4 次 shared sample；只允许使用第一次 Base sample 已取得的 A 通道执行一次低频 coordinate warp，不得为 warp 增加 sample。

Flat-base Dome SHALL 以解析 bottom plane 建立平底，并使允许顶部高度随 normalized horizontal radius 单调不增。第二 Base coordinate MAY 随高度提高 cell frequency；Detail erosion SHALL 有限且高度有界，MUST NOT 把 Support 外点变为非零。Convective Column、curl、variant、attachment 与完整 4D noise MUST 为零。

#### Scenario: 平底与穹顶

- **WHEN** 使用默认 W6 Cumulus Recipe 对中心到边缘的 vertical columns 求值
- **THEN** 所有非零 column SHALL 共享约定的平滑底平面，允许 top height SHALL 从中心向 footprint 边缘单调下降并形成可辨识穹顶

#### Scenario: Cumulus 静态采样预算

- **WHEN** 静态审计 Cumulus evaluator 可达调用图
- **THEN** shared sample call 上限 SHALL 为 4（Macro=1、Base=2、Detail=1），low-frequency warp SHALL 至多一次，attachment/octave/cell-neighbor loop SHALL 为零

#### Scenario: Erosion 不产生 NaN 或负密度

- **WHEN** Detail channel、erosion strength、height bias 或 density threshold 位于批准范围边界
- **THEN** Finalize 前后 density SHALL 有限且非负，强 erosion MAY 清空局部边缘但 MUST NOT 反向增加密度或破坏平底 analytic gate

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

### Requirement: 参数化 Stratiform Family Evaluator

W7 Stratiform kernel SHALL 由 rounded-sheet analytic footprint、Recipe-selected Thin Sheet/Soft Layer vertical profile、高 coverage Macro support、低幅 Macro thickness shift、一次低频 Base modulation 与公共 Finalize 产生主体密度。每次通过早退的 Body evaluation SHALL 至多执行 Macro=1、Base=1 共 2 次 shared sample；Detail、coordinate warp、Worley/cell loop、dynamic octave、attachment 与 Hybrid detail sample MUST 为零。

Stratus SHALL 保持 W6 Thin Sheet family、ABI 与 Macro=1/Base=1 预算回归；W6 bank 数值若被固定 benchmark 证明会使 coverage/Base/vertical 退化为饱和平板，MAY 由 W7 重新校准，但 MUST 以 coverage 非饱和、Base 调制跨度、共享场坐标跨度与可解析顶部起伏 fixture 约束。Cirrostratus SHALL 使用极低幅/低频、近均匀 Thin Sheet；Altostratus SHALL 使用平缓 Soft Layer 与水平相对垂直的低频结构；Nimbostratus SHALL 使用高 coverage/高填充 Thick Soft Layer。family kernel MUST NOT 读取 halo、sun disc、absorption、base darkening、lightning 或 precipitation 参数。

#### Scenario: Stratus 回归

- **WHEN** 对相同 W6 Stratus Body 与 Macro/Base sample fixture 执行泛化前后 CPU/WGSL mirror
- **THEN** family/profile/ABI 与 sample-call 上限 SHALL 保持一致；校准后的 density SHALL 满足显式非饱和与可解析结构不变量，而不是逐数值复刻已确认异常的 W6 bank 输出

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

W7 `density-debug` SHALL 显示沿视线的 raw density integral，不得混入 genus absorption、lighting 或 prior-frame TAA history。固定相机 SHALL 位于 Cirrostratus Body 外部。若 raw density 已有结构而 normal 仍异常，Gate report SHALL 将问题归入 Optical/lighting；若 raw density 本身为空、饱和或为矩形平板，SHALL 归入 Density Recipe/profile/Support。

性能结果 MUST 分类为 `pass`、`fail`、`unresolved` 或 `owner-waived`。FPS、CPU timing、cloud pass、debug view 或 owner waiver MUST NOT 被标成 cache performance pass。source budget、Support false-negative、NaN/Inf、metadata 错误、Legacy/Cumulus/Stratus 回归或资源/pass 增长失败不可豁免。

#### Scenario: Raw density 与 Optical 分层诊断

- **WHEN** 对同一固定 case 切换 normal 与 density-debug
- **THEN** density-debug SHALL 只反映缓存密度的路径积分并关闭 TAA history；Cirrostratus 的低 absorption MUST NOT 使 density-debug 消失，normal 与 density-debug 的差异 SHALL 可用于判定问题所属阶段

#### Scenario: W7 正常继续

- **WHEN** 四属形态/连续性、source/sample budget、Support、finite RGBA、metadata、资源与回退全部通过，且性能为 pass 或项目所有者显式 owner-waived
- **THEN** W7 Gate report MAY 标记 Continue，项目所有者批准后 MAY 归档并创建 W8

#### Scenario: 不可豁免失败

- **WHEN** 出现 Support false-negative、NaN/Inf、错误 genus metadata、Legacy/Cumulus/Stratus 回归、新 texture/pass、超预算 sample 或需要恢复完整 4D chain
- **THEN** Gate SHALL 标记 Stop/Review，不得以 owner waiver 记为 Continue

#### Scenario: 一次性成本独立

- **WHEN** 首次创建或扩展 W7 V2 pipeline
- **THEN** shared generator timing、pipeline create CPU、source length 与资源字节 SHALL 与 steady cache timestamp 分开报告

