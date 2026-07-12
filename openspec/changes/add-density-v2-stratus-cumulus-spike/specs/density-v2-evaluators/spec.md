## ADDED Requirements

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

### Requirement: 双属静态分发与 Legacy-compatible 多体合成

W6 dispatcher SHALL 只为 enabled Stratus 与 Cumulus 调用对应预编译 evaluator；其他八属 SHALL 返回零且零 sample。分发 MUST 位于 family sample 前，不得使用动态 operator array、bytecode、函数指针或按 sampleLimits 循环。

对所有 enabled Body contribution，W6 SHALL 累加 total、跟踪最大和次大 contribution/genus，并使用 Legacy-compatible soft overlap：`rest=max(total-bestD,0)`、`restCap=max(bestD,0.25)`、`density=bestD+restCap*(1-exp(-rest/restCap))`、`w2=secondD/max(bestD+secondD,1e-4)`。最终 RGBA SHALL 为 `[density,bestGenus,secondGenus,w2]`；无贡献时四通道 MUST 全零。

#### Scenario: 单属 Metadata

- **WHEN** voxel 只有一个 Stratus 或 Cumulus Body 提供正贡献
- **THEN** G SHALL 为该规范 genus ID、B/A SHALL 为零或约定无次属值，R SHALL 等于单体 contribution 的有限值

#### Scenario: Stratus 与 Cumulus 重叠

- **WHEN** 两属 Body 在同一 voxel 提供不同正贡献
- **THEN** G/B SHALL 按贡献从大到小记录两个 genus ID，A SHALL 位于 `[0,0.5]`，R SHALL 使用 soft overlap 而非简单无界相加

#### Scenario: Unsupported-only 场景

- **WHEN** active V2 frame 只包含八个未迁移 genus Body
- **THEN** cache SHALL valid 且 RGBA 全零，HUD SHALL 明确报告 unsupported Recipe，Legacy Producer 仍可显示相同场景

### Requirement: W6 Proof-of-Architecture 继续停止门

W6 SHALL 使用同一浏览器、device、固定 manifest、camera、scene time、Body、wind、`96³` resolution、`8×8×4` workgroup 与 Cached 配置采集 Legacy/V2 配对证据。每个 backend/case SHALL 排除 pipeline/shared-field warmup，先完成至少 5 次 cache warmup，再采集至少 30 个有效 cache timestamp，分别报告 median 与 p90。CPU timing、FPS、debug view、未运行 cache 的 frame 或 W5 generator timing MUST NOT 替代 steady cache GPU timing。

Stratus single/multi V2 median MUST 不高于对应 Legacy 的 0.80，p90 MUST 不高于 1.00；Cumulus single/multi V2 median MUST 不高于 1.10，p90 MUST 不高于 1.20。若 timestamp query 不可用、样本不足或任一数据混入不兼容状态，该性能项 SHALL 为 `unresolved` 而不是 pass。

#### Scenario: Gate 全部通过

- **WHEN** 两属性能阈值、形态、Support containment、finite RGBA、metadata、tile、周期、source closure、资源和 Legacy 回归全部通过
- **THEN** W6 Gate report MAY 标记 Continue，项目所有者批准后 MAY 归档 W6 并创建 W7

#### Scenario: 关键项失败或未解决

- **WHEN** 任一性能项 fail/unresolved，或形态需要恢复完整 4D chain、增加 per-body texture、扩大无界成本才能成立
- **THEN** Gate SHALL 标记 Stop/Review，系统 MUST 保留 Legacy 与当前 Seam，MUST NOT 创建或实施 W7 迁移

#### Scenario: 一次性成本独立报告

- **WHEN** 首次创建 V2 shared fields 与双属 pipeline
- **THEN** generator GPU timing、pipeline create CPU timing、source length 与资源字节 SHALL 单独报告，MUST NOT 混入 W6 steady cache median/p90
