## RENAMED Requirements

- FROM: `### Requirement: W7 五属静态分发与 Legacy-compatible 多体合成`
- TO: `### Requirement: W8 八属静态分发与 Legacy-compatible 多体合成`

## MODIFIED Requirements

### Requirement: W8 八属静态分发与 Legacy-compatible 多体合成

W8 dispatcher SHALL 只为 enabled Cumulus、四个 Stratiform genus 与三个 Cellular genus 调用对应预编译 family evaluator：Cumulus 路由 Billow；Stratus、Cirrostratus、Altostratus、Nimbostratus 路由同一个 Stratiform kernel；Stratocumulus、Altocumulus、Cirrocumulus 路由同一个 Cellular kernel。Cumulonimbus 与 Cirrus SHALL 返回零且零 sample。分发 MUST 位于 family sample 前，不得使用动态 operator array、bytecode、函数指针或按 sampleLimits 循环。

对所有 enabled Body contribution，W8 SHALL 累加 total、跟踪最大和次大 contribution/genus，并保持 Legacy-compatible soft overlap：`rest=max(total-bestD,0)`、`restCap=max(bestD,0.25)`、`density=bestD+restCap*(1-exp(-rest/restCap))`、`w2=secondD/max(bestD+secondD,1e-4)`。最终 RGBA SHALL 为 `[density,bestGenus,secondGenus,w2]`；无贡献时四通道 MUST 全零。

#### Scenario: 单属 Metadata

- **WHEN** voxel 只有一个 enabled W8 genus Body 提供正贡献
- **THEN** G SHALL 为该规范 genus ID、B/A SHALL 为零或约定无次属值，R SHALL 等于单体 contribution 的有限值

#### Scenario: Cellular family 内重叠

- **WHEN** 两个不同 Cellular genus Body 在同一 voxel 提供不同正贡献
- **THEN** G/B SHALL 按贡献从大到小记录两个 genus ID，A SHALL 位于 `[0,0.5]`，R SHALL 使用 soft overlap，后续 Optical SHALL 能区分主次 genus

#### Scenario: Cellular 与既有 family 重叠

- **WHEN** 任一 Cellular Body 与 Cumulus 或 Stratiform Body 重叠
- **THEN** 所有 contribution SHALL 使用相同 top-two composition，不得因 family 不同改用私有 cache channel或无界相加

#### Scenario: W7 既有合成回归

- **WHEN** 两个 Stratiform genus 重叠，或 Cumulus 与任一 Stratiform genus 重叠
- **THEN** G/B/A 排序、soft overlap 密度与 Optical 主次属行为 SHALL 保持 W7 契约，不得因加入 Cellular dispatcher 漂移

#### Scenario: Unsupported-only 场景

- **WHEN** active V2 frame 只包含 Cumulonimbus、Cirrus 或无效 genus Body
- **THEN** cache SHALL valid 且 RGBA 全零，HUD SHALL 明确报告 unsupported Recipe，Legacy Producer 仍可显示合法的 Cb/Ci 场景

## ADDED Requirements

### Requirement: 参数化 Cellular Family Evaluator

W8 Cellular kernel SHALL 由 rounded-layer analytic footprint、Recipe-selected Cellular Layer vertical profile、Macro coverage/thickness support、两次 Base Atlas cell signal、固定 connectivity combine、可选解析 ripple 与公共 Finalize 产生主体密度。每次通过早退的 Body evaluation SHALL 至多执行 Macro=1、Base=2 共 3 次 shared sample；Detail、运行时 Worley 邻域、dynamic octave、attachment 与 Hybrid detail sample MUST 为零。

Stratocumulus SHALL 使用低 cell frequency、高 connectivity、高 coverage 与较厚 profile；Altocumulus SHALL 使用中等 cell frequency/connectivity/profile；Cirrocumulus SHALL 使用高 cell frequency、极薄 profile 与较强 ripple。三个 Recipe 的默认有效 cell 尺度 MUST 满足 `Sc > Ac > Cc`，profile span MUST 满足 `Sc > Ac > Cc`。Cellular kernel MUST NOT 读取 Optical、precipitation、Cumulus breakup、Fiber 或 Convective 参数。

#### Scenario: Stratocumulus 大块高连接层

- **WHEN** 使用默认 W8 Stratocumulus Recipe
- **THEN** density SHALL 形成较厚、相邻 cell 高连接的大块层，但不得退化为 Stratiform 平板或 Cumulus 离散穹顶

#### Scenario: Altocumulus 中尺度层

- **WHEN** 使用默认 W8 Altocumulus Recipe
- **THEN** cell 尺度、连接度与 profile span SHALL 位于 Sc/Cc 默认响应之间，并保持有限非负密度

#### Scenario: Cirrocumulus 细粒薄层

- **WHEN** 使用默认 W8 Cirrocumulus Recipe
- **THEN** density SHALL 形成比 Ac 更小的细粒与更薄 profile，ripple MAY 增强排列变化但不得生成 Support 外密度

#### Scenario: Cellular 静态采样预算

- **WHEN** 静态审计 Cellular family evaluator 可达调用图
- **THEN** source SHALL 只有一处 Macro 与两处 Base sample call site，三属 sample 上限均为 3，Detail/neighbor/octave/attachment SHALL 为零

#### Scenario: 廉价 Gate 位于 Base sample 前

- **WHEN** voxel 位于 footprint/profile 外、coverage 为零或 Recipe disabled
- **THEN** evaluator SHALL 在两次 Base sample 前返回零，MUST NOT 依赖 cell atlas 把已拒绝点重新变为非零

### Requirement: 有界 Wave、Lens 与 Roll 静态 Hook

W8 SHALL 在 Cellular source 中提供预编译、解析且无纹理采样的 Wave/Ripple、Lens 与 Roll hook。hook 只可读取 body-local coordinate、有限 Recipe 参数与已采集 Macro phase；wave/ripple/lens/roll 强度全零时 MUST 在相关三角函数、SDF 或 topology combine 前返回 unchanged domain/support。`waveStrength` SHALL 控制域排列，`rippleAmplitude` SHALL 只调制已有 cell density；hook MUST NOT 增加 texture sample、动态循环、资源、pass 或 Support 扩张。

W8 默认 MAY 为 Cirrocumulus 启用有限 ripple；Lens 与 Roll 默认 SHALL 为零。W8 MUST NOT 新增 per-body variant ID、修改 scenario/import schema 或宣称已实现 lenticularis/volutus 完整云种。

#### Scenario: 零强度无形态成本

- **WHEN** wave、ripple、lens 与 roll strength 全部为零
- **THEN** hook SHALL 返回未修改的 Cellular domain/support，且静态/CPU fixture SHALL 证明没有额外 sample、循环或 Support 扩张

#### Scenario: 非零 Ripple 有界

- **WHEN** Cirrocumulus 使用批准范围内的非零 ripple
- **THEN** ripple SHALL 只调制 footprint/profile 内已存在的 Cellular density，MUST NOT 在零 coverage、零 cell contribution或 Support 外创建新主体

#### Scenario: Variant Schema 保持不变

- **WHEN** W8 完成
- **THEN** CloudBody、scenario 与 import/export schema SHALL 不新增 lenticularis/volutus/castellanus/floccus variant 字段，完整变种必须由后续独立 change 批准

### Requirement: W8 Cellular / Wave Migration Gate

W8 SHALL 使用固定 Sc/Ac/Cc single、cellular-scale、cellular-overlap 与 wave-ripple manifests，对 Legacy/V2、Cached/Hybrid、normal/raw density-debug 进行视觉与协议验证。若 timestamp query 可用，每个 backend/case SHALL 先完成至少 5 个 cache warmup，再采集至少 30 个有效 cache timestamp；Sc/Ac/Cc 的 V2 cache median 目标 SHALL 不高于 Legacy `1.00×`，p90 SHALL 不高于 `1.20×`。

性能结果 MUST 分类为 `pass`、`fail`、`unresolved` 或 `owner-waived`。FPS、CPU timing、cloud pass、debug view 或 owner waiver MUST NOT 被标成 cache performance pass。source budget、Support false-negative、NaN/Inf、metadata 错误、W7/Legacy 回归、新资源/pass、明显棋盘重复或随相机锁纹失败不可豁免。

#### Scenario: 三属尺度与层厚可辨

- **WHEN** 在固定 cellular-scale case 比较默认 Sc/Ac/Cc V2 raw density
- **THEN** 可见 cell 尺度 SHALL 满足 Sc 大于 Ac 大于 Cc，profile span SHALL 满足 Sc 大于 Ac 大于 Cc，差异不得只来自 Optical Profile

#### Scenario: 风平流与相机稳定

- **WHEN** 固定 Cellular Body 经风平流、旋转或相机移动观察
- **THEN** cell/ripple SHALL 随 Body/风连续移动，不得出现相机锁纹、固定屏幕图案、明显 atlas 棋盘或周期跳变

#### Scenario: W8 正常继续

- **WHEN** 三属形态、source/sample budget、Support、finite RGBA、metadata、资源、回退与不可豁免视觉项全部通过，且性能为 pass 或项目所有者显式 owner-waived
- **THEN** W8 Gate report MAY标记Continue，项目所有者批准后 MAY归档并允许已起草的W9分层缓存change进入批准/实施阶段

#### Scenario: 不可豁免失败

- **WHEN** 出现 Support false-negative、NaN/Inf、错误 genus metadata、W7/Legacy 回归、新资源/pass、超预算 sample、运行时邻域或需要恢复完整 4D chain
- **THEN** Gate SHALL 标记 Stop/Review，不得以 owner waiver 记为 Continue
