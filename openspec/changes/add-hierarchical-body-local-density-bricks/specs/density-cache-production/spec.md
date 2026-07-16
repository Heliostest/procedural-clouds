## MODIFIED Requirements

### Requirement: 稳定且只读的 DensityCacheOutput

Producer SHALL 输出 `contractVersion=2`、双 `rgba16float` 3D coarse sampled view、采样器、三维 resolution、`cacheBlend`、`resourceGeneration`、`contentRevision`、valid sample count、valid 状态、active storage mode 与可空 hierarchical payload。Coarse 通道语义 MUST 保持 R=密度、G=主云属索引、B=次云属索引、A=次云属混合权重。Legacy 与 global-only V2 SHALL 输出 `storageMode=global-only` 且 `hierarchical=null`。

Recipe V2 hierarchical payload MAY 额外包含一对 scalar density sampled views、sampler、format/dimensions、只读 brick-record与candidate-grid binding resource、layout/allocation/content generations、valid状态与诊断元数据。Output MUST NOT暴露 writable texture、storage view、compute pipeline或Producer私有bind group；consumer MUST NOT写入只读binding resource。

#### Scenario: Consumer 重建采样绑定

- **WHEN** Producer identity、coarse `resourceGeneration`、storage mode、hierarchical layout/allocation generation或任一输出资源发生变化
- **THEN** cloud render、ground shadow与density debug SHALL用新的coarse/hierarchical sampled resources重建目标bundle bind group，MUST NOT继续引用旧generation

#### Scenario: 缓存内容刷新

- **WHEN** Producer编码新的coarse或brick cache内容
- **THEN** `contentRevision`或hierarchical content revision SHALL递增并使依赖密度内容的地面云影历史失效或刷新，但resource generation MUST NOT仅因普通内容刷新递增

#### Scenario: Legacy与Global-only通道保持

- **WHEN** Legacy Adapter或global-only V2在相同输入下写出并采样coarse缓存
- **THEN** 两张view顺序、`cacheBlend`、RGBA数值语义和现有consumer画面 SHALL与引入contract version 2前一致

#### Scenario: Hierarchical完整发布

- **WHEN** Recipe V2 hierarchical candidate的coarse、atlas pair、records、candidate grid与bundles均对当前frame input完成warmup
- **THEN** Output SHALL原子发布`storageMode=hierarchical`与valid payload，所有资源generation SHALL一致

#### Scenario: 半初始化Payload不可见

- **WHEN** 任一hierarchical资源仍creating/warming、失效、generation不匹配或创建失败
- **THEN** Output SHALL保持valid global-only coarse并令`hierarchical=null`或invalid，MUST NOT发布可被consumer绑定的半成品

### Requirement: Recipe V2 独立密度 Producer

`RecipeDensityV2Adapter` SHALL 实现完整 `DensityCacheProducer` contract，并拥有独立于Legacy的V2 WGSL module、explicit pipeline/bind-group layouts、Frame/Body/Recipe buffers、双`rgba16float` global coarse textures、sampled/storage views、sampler、ping-pong状态、bindings、revisions、stats与幂等生命周期。W8 compute SHALL只为enabled Cumulus、四个Stratiform与三个Cellular Recipe生成非零coarse密度；无云、unsupported-only或所有contribution为零时 SHALL确定性写`vec4f(0.0)`。一次成功coarse encode后output SHALL标为valid，无论内容为非零或全零。

W9 SHALL在同一Adapter内提供默认global-only与可选hierarchical storage。Hierarchical MAY惰性拥有受`density-body-local-bricks`约束的一对共享density atlas、brick records、candidate grid、format-specialized compute pipeline与独立Cached/Hybrid bundle resources；这些资源不得改变global coarse RGBA语义、W8 Recipe layout/evaluator budget或Legacy ownership。Global-only SHALL始终是Recipe V2内部健康回退。

#### Scenario: 无云输入写出有效零缓存

- **WHEN** V2对无云frame prepare并encode
- **THEN** coarse pass SHALL成功、validSampleCount/contentRevision SHALL更新、RGBA output SHALL全部为有限零值；hierarchical MAY无resident bricks但正常渲染 SHALL保留天空/地面且没有云

#### Scenario: W8 八属输入生成非零缓存

- **WHEN** V2输入合法Cumulus、Stratiform或Cellular Body、对应Recipe enabled且voxel通过Support/profile/topology
- **THEN** coarse cache SHALL写有限非负R与兼容genus metadata；hierarchical active且candidate complete时 MAY用同一Evaluator生成的body-local brick结果替换sampled coarse

#### Scenario: 未迁移属保持有效零语义

- **WHEN** V2输入一个或多个有效Body但其genus均属于Cumulonimbus/Cirrus
- **THEN** Adapter SHALL pack有界Body/Recipe records，coarse与brick compute SHALL在disabled dispatch前返回零且不采样shared fields，并明确报告unsupported Recipe

#### Scenario: Global-only消费者协议兼容

- **WHEN** active Producer为Legacy或Recipe V2且active storage为global-only
- **THEN** Cached、Hybrid、density debug与transmittance ground shadow SHALL只消费现有coarse sampled resources，MUST NOT创建或绑定brick资源

#### Scenario: Hierarchical子级原子Promotion

- **WHEN** requested storage为hierarchical且atlas/records/candidates/compute/bundles对当前frame input全部ready
- **THEN** Adapter SHALL递增对应generation并原子切换active storage；切换前画面 MUST持续使用健康global-only V2

#### Scenario: Hierarchical失败不强制Legacy回退

- **WHEN** format probe、预算、allocator、brick pipeline、candidate grid、warmup或hierarchical render bundle失败但global coarse仍健康
- **THEN** requested storage与failure reason SHALL可见，active storage SHALL保持global-only且active Producer仍为Recipe V2，MUST NOT销毁健康coarse或伪报hierarchical active

#### Scenario: Resize 与 workgroup 重建

- **WHEN** V2 active/candidate状态下改变density resolution或合法workgroup
- **THEN** Adapter SHALL重建global coarse及依赖其tile grid的candidate resources、递增相关generation并阻止旧view混用；shared noise fields SHALL按自身signature复用，brick allocation SHALL按批准生命周期重建/warmup

#### Scenario: 销毁与 device loss

- **WHEN** V2 Adapter重复销毁或设备丢失
- **THEN** global与brick GPU resources SHALL至多释放一次，pending producer/storage candidate MUST NOT被提升，后续prepare/encode/getOutput SHALL有限拒绝或返回invalid状态

## ADDED Requirements

### Requirement: W9 Hierarchical 调度、统计与固定 Manifests

Active storage为hierarchical且active quality为Cached/Hybrid时，每次实际cache update SHALL先编码一个现有global coarse pass，再至多编码一个brick pass；普通无update帧 MUST不编码两者。Active storage为global-only时brick资源/pass MUST为零；Realtime active时Producer plan SHALL跳过无人消费的coarse/brick cache encode。

Producer stats/HUD SHALL报告requested/active storage、storage lifecycle/reason、coarse/brick sample ID与GPU timing、format/profile/dimensions、resident/peak/total output bytes、allocation/candidate generations、resident/nonresident Body数、brick dispatch/voxel数、candidate complete/overflow/incomplete/fallback与source/bundle creation。CPU create/rebuild timing、理论upper bound与GPU timestamp MUST分开。

系统 SHALL提供W8 Cellular reuse、brick LOD、overflow、thin-ridge proxy与lifecycle固定Legacy/global-only/hierarchical manifests。Case SHALL等待requested/active Producer、storage与quality均匹配；静默fallback MUST使hierarchical case invalid而不是被采集为通过。

#### Scenario: Cache Pass 顺序有界

- **WHEN** hierarchical Cached/Hybrid帧需要刷新cache
- **THEN**同一command encoder内 SHALL按global coarse pass→最多一个brick pass→ground shadow→cloud render排序，brick pass内dispatch不超过resident Body数与12上限

#### Scenario: Global-only零额外成本

- **WHEN** active storage为global-only
- **THEN** cache pass数、output bytes、bind groups与source closure SHALL与W8 global-only一致，brick统计 SHALL明确为idle/zero而非failed

#### Scenario: A/B 状态严格对齐

- **WHEN** harness运行hierarchical配对case
- **THEN** requested/active Producer SHALL均为Recipe V2、requested/active storage SHALL均为hierarchical且quality/lifecycle ready；任一不匹配 MUST使case invalid

#### Scenario: Timing 样本分类

- **WHEN** coarse或brick sample ID产生新timestamp
- **THEN** harness SHALL分别记录coarse、brick、combined cache、cloud与ground-shadow GPU timing；timestamp不可用、样本不足或warmup污染 SHALL记为unresolved/Review，MUST NOT使用CPU timing或FPS替代

#### Scenario: W9 Gate 不升级历史证据

- **WHEN** W9 report引用W8 Stop/unresolved证据或其他active change未完成项
- **THEN** 原分类 SHALL保留，只有同revision W9复验才可产生新结论，MUST NOT因hierarchical视觉改善自动把旧项改为pass
