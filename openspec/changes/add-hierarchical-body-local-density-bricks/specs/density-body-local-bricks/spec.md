## ADDED Requirements

### Requirement: 固定预算的共享 Body-local Density Atlas

Recipe V2 hierarchical storage SHALL 为所有active、enabled且resident Body共享一对3D scalar density atlas，MUST NOT创建per-Body texture。任一时刻 SHALL只存在一个active format profile pair；双atlas resident texture payload MUST不超过16 MiB，原子rebuild期间brick-only texture peak MUST不超过32 MiB。默认候选profile SHALL为`r16float 160³×2`，只有在创建前probe证明storage-write与filtering-sample均可用时才可激活；兼容fallback SHALL为`rgba16float 96³×2`且只使用R channel。`rgba8unorm 128³×2` MAY作为受控量化/容量证据候选，但不得未经Gate自动成为产品fallback。

Profile创建 SHALL 同时检查 `maxTextureDimension3D`、storage/sample usage、format-specific layout、声明字节与设备限制。任一检查失败 SHALL 使 hierarchical unavailable并保持健康 global-only V2；系统 MUST NOT 截断 texture、突破预算、再建第二对 atlas或创建 per-Body fallback。

#### Scenario: 首选 R16F profile可用

- **WHEN** 目标设备对 `r16float` 3D texture同时通过 storage-write与 filtering-sample probe，且 160³双 atlas满足 limits
- **THEN** hierarchical candidate SHALL 只创建一对 `r16float 160³` atlas，有效 payload SHALL 为 15.625 MiB，MUST NOT 同时常驻 RGBA fallback pair

#### Scenario: R16F不可用时兼容回退

- **WHEN** `r16float` 任一 probe失败而 `rgba16float 96³`满足 usage与limits
- **THEN** candidate SHALL 使用一对 `rgba16float 96³` atlas并只消费R channel，有效 payload SHALL 为13.5 MiB，failure reason SHALL 记录 R16F不可用原因

#### Scenario: 所有批准 profile失败

- **WHEN** 首选与兼容 fallback均无法合法创建或会突破预算
- **THEN** requested storage SHALL 保持 hierarchical但 active SHALL 为 global-only，atlas/record/candidate output MUST NOT 发布为valid

#### Scenario: 默认路径无 Brick资源

- **WHEN** requested/active storage均为 global-only、active Producer为Legacy或 active quality为Realtime
- **THEN** density brick texture、pipeline、record/candidate buffer、bind group、allocator build与dispatch SHALL 全为零

### Requirement: 确定性单 Brick 分配与 Gutter

W9 SHALL 固定每个 compact Recipe V2 Body最多一个 brick。逻辑 interior edge SHALL 仅为 `24/32/48/64`；每边 MUST 增加2 voxel gutter并将物理 allocation向上对齐到8-voxel page，因此物理 edge SHALL 分别为 `32/40/56/72`。Allocator SHALL 使用确定性8³ page occupancy与稳定 Body顺序生成无重叠、完全位于 atlas bounds内的 allocation。

目标档位 SHALL 由有限 projected-size、Recipe topology frequency与上一LOD状态决定，并使用固定 hysteresis避免逐帧切换。预算不足 SHALL 按 `64→48→32→24→nonresident` 降级；相同优先级 MUST 以 compact Body index稳定决胜。Allocator MUST NOT无界拆分、动态增加 atlas或为单 Body分配第二个 brick。

#### Scenario: Mixed档位无重叠

- **WHEN** 多个 Body请求不同逻辑档位并能在 active atlas内驻留
- **THEN** 所有 physical allocation SHALL page-aligned、包含2-voxel gutter、互不重叠且完全位于 atlas bounds内

#### Scenario: 预算不足有界降级

- **WHEN** 请求档位总量超过可用 pages
- **THEN** allocator SHALL 按固定优先级和降档顺序产生 resident或nonresident结果，MUST NOT超过16 MiB payload或创建额外资源

#### Scenario: LOD Hysteresis稳定

- **WHEN** Body projected size在相邻档位阈值附近小幅往返
- **THEN** allocation SHALL 保持上一档位直到跨越批准的升级/降级hysteresis边界，generation MUST NOT逐帧抖动

#### Scenario: 高纵横比仍为单 Brick

- **WHEN** W9 thin-ridge proxy或高纵横比Body请求hierarchical storage
- **THEN** 系统 SHALL 使用一个body-local brick并报告拉伸/浪费证据，MUST NOT在W9自动拆成多个brick

### Requirement: 固定 Body Record 与保守坐标映射

系统 SHALL 定义 `DensityBrickRecordGPU` layout version 1、160-byte stride、固定12 records的CPU/WGSL ABI。每条 record SHALL 至少包含 resident/enabled、compact Body index、genus ID、logical/physical edge、conservative world Support、三行world-to-normalized-body-local affine transform、atlas interior scale/bias、allocation generation、content revision与LOD状态；physical origin/extent SHALL可由atlas映射与edge元数据确定。Nonresident、invalid与 `[activeBodyCount,12)` records MUST确定性全零；reserved lanes MUST为零。

Record SHALL 存在独立只读 binding resource，不得改变 `DensityRecipeGPU` layout version 2或复用Recipe lanes表达allocation。所有由brick生成或采样得到的非零密度 MUST 位于该record声明的Support内；CPU pack、brick compute与renderer MUST使用同一变换事实。

#### Scenario: CPU与WGSL Record一致

- **WHEN** 构建或静态检查 record buffer
- **THEN** CPU offsets/stride/count与WGSL struct SHALL完全一致，buffer size SHALL恰好为1,920 bytes，任一错位 MUST使检查失败

#### Scenario: 尾部与Nonresident归零

- **WHEN** active/resident Body少于12或某Body因预算降为nonresident
- **THEN** 对应无效record及所有尾部bytes SHALL为零，renderer MUST NOT从陈旧allocation采样

#### Scenario: Support约束 Brick密度

- **WHEN** voxel映射到Body Support外或world-to-local输入无效
- **THEN** brick compute与renderer SHALL返回零或coarse fallback，MUST NOT生成/采样Support外密度

### Requirement: 每 Body 有界 Brick 生成与时间混合

Hierarchical Recipe V2 cache update SHALL 先编码现有global coarse pass，再至多编码一个brick compute pass。Brick pass MAY对每个resident compact Body执行一次dispatch，但总dispatch MUST不超过12；每个dispatch SHALL只求一个Body，MUST NOT循环所有Body或执行top-two composition。它 SHALL复用W8已批准的静态Stratiform/Billow/Cellular evaluator与2/4/3 shared-sample上限，不得新增Fiber、Convective、Hybrid evaluator或提高Recipe budget。

Brick interior SHALL在body-local grid求值；gutter voxel SHALL通过clamp/replicate最近interior坐标生成，防止相邻allocation三线性串色。双atlas SHALL与global coarse使用同一cache update cadence与`cacheBlend`。普通无cache update帧 MUST NOT编码brick pass。Allocation layout变化时，新pair MUST完整warmup并原子发布新generation，MUST NOT在不同layout之间做temporal blend。

#### Scenario: 单 Body Dispatch无 Body Loop

- **WHEN** 一个resident Body更新其brick
- **THEN** 对应dispatch SHALL只读取该Body/Recipe record并写其physical allocation，shader source MUST NOT包含12-body evaluator loop

#### Scenario: Gutter连续采样

- **WHEN** renderer在brick interior边界附近进行三线性采样
- **THEN** 2-voxel replicated gutter SHALL阻止相邻allocation值渗入，atlas slice与normal view MUST无可见packing seam

#### Scenario: 普通帧不更新

- **WHEN** global cache plan本帧不刷新且allocation/config未变化
- **THEN** brick dispatch count、content revision与atlas write index SHALL保持不变

#### Scenario: Layout变化原子切换

- **WHEN** Body增删、LOD或atlas profile变化导致allocation generation改变
- **THEN** 旧hierarchical payload SHALL继续有效直到新pair/records/candidate grid完整warmup；发布时 SHALL一次切换generation并使消费者重绑/历史失效

### Requirement: 固定四候选 Render Grid 与完整性回退

系统 SHALL从conservative tile-body Support集合构建独立render candidate grid。每coarse tile entry SHALL固定8 bytes，并编码count、overflow、complete、generation及最多四个8-bit compact Body indices。默认`96³`与`8×8×4` SHALL产生3,456 entries、27,648-byte payload。所有可能在tile内产生非零Recipe V2密度的active、enabled Body MUST先进入源集合；disabled/unsupported Body不得使entry变为incomplete。False-positive MAY存在，任一false-negative MUST使检查失败。

只有源集合数量`<=4`、全部候选均有同generation resident brick且records有效时，entry才可标记complete。数量`>4`、任一nonresident、generation不一致、builder失效或索引越界时 SHALL标记overflow/incomplete。Hierarchical shader MUST使用固定`i<4`循环并在`i>=count`早退，MUST NOT扫描12-bit mask或遍历`MAX_BODIES`。

#### Scenario: 默认Grid预算

- **WHEN** coarse resolution=`96³`且workgroup=`8×8×4`
- **THEN** candidate grid SHALL为`12×12×24`、3,456 entries、27,648 bytes，单entry候选上限 SHALL恰好为4

#### Scenario: 五Body重叠安全溢出

- **WHEN** 某tile的conservative源集合包含5个或更多Body
- **THEN** entry SHALL标记overflow/incomplete，renderer SHALL对该tile整点使用global coarse，MUST NOT截断为前四个并声称complete

#### Scenario: Nonresident候选不做部分合成

- **WHEN** tile有三个候选但其中任一Body nonresident或generation失配
- **THEN** entry SHALL incomplete并使renderer返回global coarse，MUST NOT使用两个brick再与coarse相加

#### Scenario: 旋转平流与边界保持保守

- **WHEN** Body旋转、风平流、快速移动或Support接触scene/tile边界
- **THEN** candidate signature/rebuild SHALL覆盖所有相交Body，任何漏候选 MUST使fixture失败

### Requirement: Brick 采样替换、软重叠与可回退生命周期

Hierarchical `densityAtTyped()` SHALL先取得现有global coarse RGBA作为fallback。Candidate entry complete时，shader SHALL对最多四个record做Support reject、采样双brick views并按`cacheBlend`混合scalar density，再使用Legacy-compatible soft-overlap与top-two genus metadata从record genus组成最终值；该brick结果 SHALL替换coarse。Entry overflow/incomplete、payload invalid、坐标越界或generation不匹配时 SHALL直接返回coarse。系统 MUST NOT把brick与coarse相加，也不得在不完整集合上做部分brick composition。

Hierarchical requested/active lifecycle SHALL与global-only V2分离。创建/预热期间active storage MUST保持global-only；失败 SHALL记录稳定reason并继续global-only V2。切回global-only SHALL停止brick encode并销毁或失效其资源。Resize、Body增删、allocation rebuild、device loss与destroy MUST幂等且不得发布半初始化binding。Realtime active时 MUST不创建或编码无人消费的brick cache。

#### Scenario: 完整候选使用 Brick替换

- **WHEN** sample所在tile complete且所有candidate record/atlas generation有效
- **THEN** 返回值 SHALL只由brick candidate soft composition产生，coarse SHALL只作为未采用的fallback，MUST NOT双重增密

#### Scenario: Coarse为零但Support内 Brick非零

- **WHEN** global voxel欠采样为零而complete candidate的body-local brick在其Support内为非零
- **THEN** hierarchical sample MAY返回该有限非负brick密度，这不视为Support外造云

#### Scenario: Hierarchical失败回退Global-only

- **WHEN** format/pipeline/allocation/record/candidate/warmup任一步失败
- **THEN** active storage SHALL保持global-only V2，现有coarse Cached/Hybrid画面 SHALL继续工作，MUST NOT强制回退Legacy或发布半成品

#### Scenario: Device loss与重复销毁

- **WHEN** WebGPU device lost或brick subsystem被destroy一次或多次
- **THEN** 所有brick output SHALL invalid、资源至多释放一次、pending candidate不得promotion，global Producer生命周期 SHALL继续遵循`density-cache-production`

### Requirement: W9 诊断、固定 Manifests 与 Continue Gate

Stats/HUD SHALL报告requested/active storage、lifecycle/reason、format/profile/dimensions、resident/peak/total density bytes、allocation档位/residency/generation/rebuild、record bytes、candidate complete/overflow/incomplete tiles、average/max candidates、fallback count、brick dispatch/voxel/sample ID及create/coarse/brick/cloud/ground-shadow GPU timing。CPU timing、理论upper bound与GPU timestamp MUST分开。

系统 SHALL提供W8 Cellular复用场景、`w9-brick-lod-sweep`、`w9-brick-overflow`、`w9-thin-ridge-proxy`及resize/Body增删/风/相机/atlas边界/device-loss cases。Legacy、global-only V2、hierarchical V2 SHALL使用相同browser/device/viewport/camera/time/Body/wind/resolution/workgroup/quality/render params。每个性能case SHALL排除create/warmup，先完成至少5次cache warmup，再采集至少60个有效timestamp样本。

Continue SHALL要求：视觉相对global-only明确改善；无seam/popping/lock/support leak/NaN/metadata错属/双重增密；resident≤16 MiB、brick rebuild peak≤32 MiB、K=4、无render 12-body loop；hierarchical cloud median≤`1.25×` global-only且p90≤`1.35×`；density-related ground-shadow median≤`1.35×`且p90≤`1.50×`；coarse+brick cache-update median≤`max(1.75× global-only, global-only+0.50 ms)`且p90≤`max(2.00×, global-only+0.75 ms)`；所有失败路径安全回退。Timestamp不可用或样本不足 MUST为Review，不得标记Continue。

#### Scenario: Architecture Gate Continue

- **WHEN** 所有视觉、协议、资源、生命周期与性能硬条件有同revision完整证据且项目所有者批准
- **THEN** W9 report MAY标记Continue，后续W10+ MAY把body-local bricks作为已批准基础设施

#### Scenario: 不可豁免失败

- **WHEN** 出现Support leak、NaN/Inf、metadata错误、coarse+brick双重增密、候选false-negative/K>4、预算超限、render 12-body loop、unsafe fallback、seam/LOD popping或任一性能阈值失败
- **THEN** Gate MUST为Stop或Review，MUST NOT仅凭局部截图改善归档

#### Scenario: Timestamp证据缺失

- **WHEN** timestamp query不可用、任一配对样本不足或warmup混入steady样本
- **THEN** 对应性能项 SHALL记为unresolved/Review，CPU timing或FPS MUST NOT替代GPU Gate
