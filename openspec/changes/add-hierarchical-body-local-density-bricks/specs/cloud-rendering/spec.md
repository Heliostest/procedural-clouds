## MODIFIED Requirements

### Requirement: 密度取样质量模式

渲染管线 SHALL提供可运行时切换的密度取样质量模式，至少包含：cached（读取active `DensityCacheOutput`并时间混合）、hybrid（active缓存基底叠加现有有界高频细节）、realtime（每步直接调用`cloudDensity()`、完全跳过缓存）。当active Producer为Recipe V2时，Cached/Hybrid SHALL正交支持global-only与hierarchical storage；hierarchical只有在output payload和对应bundle均valid时才可active。片元主raymarch、光照行进、density debug与density-related ground shadow MUST经同一storage-aware取样入口取得密度和top-two genus metadata。

#### Scenario: cached Global-only复现现状

- **WHEN** 质量模式为cached且active storage为global-only
- **THEN** 密度取样 SHALL只读取现有双coarse cache，画面、RGBA metadata与引入W9前的global-only路径一致

#### Scenario: cached Hierarchical使用完整 Brick候选

- **WHEN** 质量模式为cached、active storage为hierarchical且sample tile candidate complete
- **THEN** 统一入口 SHALL用最多四个body-local brick candidate组成最终density/metadata并替换coarse；候选不完整时 SHALL返回coarse

#### Scenario: realtime 模式跳过缓存

- **WHEN** 质量模式为realtime
- **THEN** raymarch每步 SHALL直接调用`cloudDensity()`求密度，且global coarse/brick cache compute pass SHALL被跳过，storage mode不得改变Realtime语义

#### Scenario: hybrid 模式补现有高频细节

- **WHEN** 质量模式为hybrid且active global-only或hierarchical基底密度高于阈值、现有细节强度大于0
- **THEN** 系统 SHALL在active缓存基底上应用W2既有bounded detail，MUST NOT在空区凭空生成密度；W9 MUST NOT新增Recipe-aware ripple/fiber/erosion算子

#### Scenario: 取样入口统一

- **WHEN** 着色器在主raymarch、light march、density debug或density-related ground shadow中取密度
- **THEN** 它们 SHALL经同一active quality/storage helper取值，MUST NOT让某消费者把brick与coarse相加或停留在旧generation

### Requirement: 密度缓存消费者与 Producer 隔离

Cached/Hybrid主raymarch、地面云影compute与所有density debug视图 SHALL仅通过`DensityCacheOutput` contract version 2的coarse sampled views/sampler/blend/revision，以及可选hierarchical sampled views和只读record/candidate binding resources消费密度。它们 MUST NOT访问Producer内部texture、storage view、写入index、compute pipeline、storage bind group、allocator或调度状态，也 MUST NOT写入输出的只读buffer binding。Realtime SHALL保持现有直接调用密度求值并跳过cache encode的语义。

#### Scenario: 主渲染消费统一输出

- **WHEN** active Producer提供valid global-only或hierarchical `DensityCacheOutput`
- **THEN** Cached/Hybrid主raymarch与light march SHALL从该output为active bundle建立bind group；hierarchical resources不存在时 MUST使用global-only bundle

#### Scenario: 地面云影消费统一输出

- **WHEN** ground-shadow compute需要Cached/Hybrid密度
- **THEN** 它 SHALL从同一output和active storage bundle建立兼容bind group，并在Producer/storage/resource/allocation/content generation变化时重建绑定或失效历史

#### Scenario: Debug 不旁路 Seam

- **WHEN** 用户切换任一现有或W9 atlas/allocation density debug view
- **THEN** normal density debug SHALL使用与active Cached/Hybrid相同的sampled output；atlas slice MAY使用只读diagnostic view，但 MUST NOT访问Producer storage/private bind group

#### Scenario: Invalid Hierarchical Payload有限回退

- **WHEN** output声明hierarchical requested但payload invalid、generation不匹配或bundle未ready
- **THEN** 所有cache消费者 SHALL继续绑定健康global-only output，MUST NOT创建悬空binding或把requested误当active

#### Scenario: Realtime 保持现有语义

- **WHEN** `qualityMode`为Realtime
- **THEN** 主渲染、light march、density debug与地面云影的现有直接密度语义 SHALL保持，且Producer MUST NOT编码global/brick cache pass

### Requirement: 密度质量模式专属 Pipeline Bundle

系统 SHALL为Cached、Hybrid与Realtime建立相互独立的密度质量`Pipeline Bundle`，并为Cached/Hybrid保持global-only与hierarchical两个正交storage variant。每个bundle SHALL至少拥有与本quality/storage source closure匹配的cloud render pipeline、density-related ground-shadow compute pipeline、layout-compatible bindings与生命周期状态。Common raymarch、light-march、ground shadow与density debug SHALL只依赖同签名`densityAtTyped()/densityAt()`；模式选择 MUST由active quality与active storage bundle决定，而不是在一个共享shader module中通过uniform分发完整调用图。

Global-only Cached source closure SHALL只包含双coarse cache采样及必要edge shaping。Hierarchical Cached SHALL只增加coarse fallback、固定K=4 candidate/record/brick sampling与soft-overlap metadata，MUST NOT包含Recipe/Legacy evaluator或12-body render loop。Global-only/Hierarchical Hybrid SHALL在对应Cached基底上只增加W2既有bounded detail，并 MUST NOT在空基底区域生成主体。Realtime SHALL在独立source/module/pipeline中保留当前直接密度求值。Post、Bloom、TAA、line、axis与ground-shadow resolve/filter MAY继续共享。

#### Scenario: Global-only Cached closure不携带 Brick或Evaluator

- **WHEN** 组装或静态审计global-only Cached cloud/ground-shadow source
- **THEN** source SHALL只通过coarse `DensityCacheOutput`采样密度，MUST NOT包含brick bindings/helper、完整Legacy/Realtime evaluator graph或Recipe family source

#### Scenario: Hierarchical Cached closure固定四候选

- **WHEN** 组装或静态审计hierarchical Cached source
- **THEN** source SHALL包含固定`i<4` candidate loop、coarse fallback与brick soft composition，MUST NOT包含`MAX_BODIES` render loop、Recipe evaluator、动态candidate count loop或coarse+brick加法

#### Scenario: Hybrid 只补既有有界细节

- **WHEN** active bundle为global-only或hierarchical Hybrid且active基底密度大于现有阈值
- **THEN** pipeline SHALL使用现有bounded detail调制基底；当基底为空时 MUST返回空密度，且W9 source MUST NOT引入新的Recipe-aware detail或完整body/genus evaluator

#### Scenario: Realtime 独立直接求值

- **WHEN** active bundle为Realtime
- **THEN** 主raymarch、light march、density debug与density-related ground shadow SHALL使用独立Realtime module的直接density evaluator，MUST NOT消费global-only/hierarchical cache bind group

#### Scenario: 同一 Active Bundle覆盖所有密度消费者

- **WHEN** active quality或active storage发生切换
- **THEN** 主画面、自阴影、density debug与transmittance ground shadow SHALL同时使用目标quality/storage bundle，不得让不同消费者停留在不同source closure或generation

### Requirement: 异步创建、惰性 Realtime 与原子回退

系统 SHALL分离requested/active quality mode与requested/active Recipe V2 storage mode，并为每个实际bundle暴露`idle`、`compiling`、`ready`、`failed`、`destroyed`生命周期。Global-only Cached与Hybrid SHALL通过异步pipeline creation在renderer启动阶段准备；Cached global-only为最低可用cache回退。Hierarchical Cached/Hybrid初始 SHALL为`idle`，只有首次请求hierarchical storage后才可组装brick source并创建module、pipeline与bindings。Realtime初始同样 SHALL为`idle`，只有首次请求Realtime后才创建完整direct-evaluator bundle。

候选bundle只有在其全部pipeline/bindings ready且对应`DensityCacheOutput` payload valid后才可原子active。Hierarchical compiling/failed时 MUST保留健康global-only quality bundle；Realtime compiling/failed时 MUST保留先前健康Cached/Hybrid bundle。切回global-only SHALL不需要重编译已ready global-only bundle。

#### Scenario: 默认 Hybrid 启动不创建 Hierarchical或Realtime

- **WHEN** 应用以默认global-only Hybrid启动且用户从未请求hierarchical或Realtime
- **THEN** global-only Cached/Hybrid SHALL可用，hierarchical与Realtime lifecycle SHALL保持`idle/not-requested`，且 MUST NOT创建其shader module、pipeline、brick binding或GPU resource

#### Scenario: Hierarchical首次请求期间保持Global-only

- **WHEN** requested storage=hierarchical而atlas/output或Cached/Hybrid候选bundle仍creating/compiling/warming
- **THEN** active storage SHALL保持global-only，所有消费者 SHALL继续健康画面，HUD MUST NOT把hierarchical报为active

#### Scenario: Realtime 首次请求期间保持健康画面

- **WHEN** requested=Realtime且候选bundle仍`compiling`
- **THEN** active SHALL保持先前健康Cached/Hybrid quality/storage，画面与密度消费者 SHALL继续使用该active bundle

#### Scenario: 候选创建失败安全回退

- **WHEN** hierarchical或Realtime shader/pipeline/binding创建验证失败
- **THEN** 系统 SHALL保留健康global-only或先前active bundle并记录稳定reason，MUST NOT发布半初始化pipeline、悬空binding或错误storage状态

#### Scenario: Ready Bundle复用

- **WHEN** 用户再次切换到已ready且资源generation仍匹配的quality/storage bundle
- **THEN** 系统 MAY复用并原子切换，MUST NOT重复编译相同pipeline；若brick resources已按policy销毁，则必须重新warmup资源后才能active

#### Scenario: 销毁期间候选完成

- **WHEN** renderer已销毁而异步hierarchical或Realtime候选随后完成
- **THEN** 系统 MUST丢弃该候选并阻止其active；重复销毁 SHALL幂等
