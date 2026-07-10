## Context

当前架构已经完成一次重要机械重构：十个标准云属各有具名 WGSL evaluator，dispatcher 只负责按固定 preset 顺序路由，下游 `cloudDensityTyped()`、密度缓存与 raymarch 契约统一。这一边界应保留。

尚未解决的是所有 evaluator 之前的 `evalCompatibilityGenus()`。它包含 Height-Weather、4D Perlin、两组分形 4D Voronoi、统一垂直包络和最终密度标定。Cirrus、Cumulonimbus、Altocumulus、Cirrocumulus 只能在其非零输出上做乘法或软并集，其他六属直接返回兼容密度。

`docs/cloud-morphology-and-density-family-discussion.md` 与十属 CSV 手册提出了新的目标模型：云属由 Placement、Density Recipe 和 Optical 三轴组成；Density Recipe 由可组合的多尺度算子构成。该模型必须适配当前固定十属、WebGPU/WGSL、Cached/Hybrid 优先和有限测试能力，不能演变成运行时 shader graph。

## Goals / Non-Goals

### Goals

- 让每个云属能够直接生成符合其拓扑的主体密度，不依赖非零 LegacyPuffy 结果。
- 共享坐标、Support、Profile、Topology、Detail、Attachment、Finalize 等小粒度算子，而不是共享完整最终密度链。
- 保持静态、可分析的 WGSL 调用图和有上限的算子成本。
- 允许一属组合多个形态算子，例如 Cumulonimbus = Billow + Column + Anvil + Fiber Cap。
- 允许未来云种/变种通过参数覆盖和有限 Modifier 复用算子，不复制十套基础设施。
- 按属、按波次迁移；每一步保留可运行 Legacy 回退并留下 A/B 证据。
- 以 Cached/Hybrid 为性能和观感基线；Realtime 只保留正确性契约，不作为实时预算目标。

### Non-Goals

- 不在本核心重构中实现任意用户自定义 shader graph、bytecode 或动态算子解释器。
- 不一次性实现 CSV 中所有云种/变种。
- 不在本 change 中新增物理流体模拟、风切变、台风涡旋或气象转化链。
- 不把 precipitation curtain、virga 等降水介质强行写入凝结云主体缓存。
- 不重写 Beer、多重散射、大气 LUT、tonemap 或按属光照。
- 不把 CSV 的 `128³/32³` 描述机械实现成两套固定噪声纹理。
- 不要求 Realtime 达成 60fps；项目运行重点为 Cached 与 Hybrid。

## Decisions

### D1: 三轴职责分离

每个云属由三条独立信息轴定义：

1. Placement Profile：典型 base/thickness/bounds、物相和建议高度；继续由现有 genus profile 与 CloudBody 管理。
2. Density Recipe：空间变换、Support、垂直 Profile、主体 Topology、细节、Attachment 和最终标定。
3. Optical Profile：消光、相函数、silver、SSS、halo、sun disc、lightning；继续由现有按属光照路径消费。

Density Recipe MUST NOT 复制 placement 米制字段，也 MUST NOT 执行像素着色。CSV 中 `σa/σs` 的物理记法不会直接覆盖当前艺术化 `absorptionCoeff`。

### D2: 四云族是模板，不是互斥运行时类型

Convective、Stratiform、Cellular Layer、Fibrous 保留为常用 Recipe 模板。底层复用单位进一步下沉为：

- Domain：anisotropy、curl warp、vertical flow、wave coordinates；
- Support：footprint、weather、altitude、lifecycle、anvil/system masks；
- Vertical：thin sheet、soft layer、flat-base dome、cellular layer、tower、anvil、roll/lens；
- Topology：stratiform、billow、cellular、fiber、wave/lens、convective column；
- Detail：Worley erosion、fBm cutout、curl breakup、ripple、height-dependent erosion；
- Attachment：fractus、anvil、fiber cap、turret、mammatus 等；
- Finalize：threshold、density scale、edge fade、finite/non-negative guard。

一个 evaluator MAY 组合多个模板/算子；不存在强制四选一 dispatcher。

### D3: 概念 Recipe，静态 WGSL 实现

TypeScript 侧可以用 `DensityRecipe` 描述一个云属需要的模式和参数，但 WGSL MUST 保持静态函数调用：

- 十属 dispatcher 仍只选择一个具名 evaluator；
- 每个 evaluator 显式调用所需共享算子；
- 未启用 Modifier 必须在昂贵噪声前返回或跳过；
- 不遍历任意长度 operator list；
- 不执行用户提供的 WGSL；
- 分支和循环上界必须静态可知。

这使 Recipe 可作为设计和打包模型，而不会变成 GPU 解释器。

### D4: 明确组合语义

共享算子不是无差别相乘：

- Mask/Support：乘法，限定允许区域；
- Domain transform：改变后续采样坐标；
- 主体 Topology：remap 后形成基础密度；
- 第二主体/Attachment：smooth union 或 soft max；
- Erosion：只减密度；
- Vertical Profile：乘法或高度相关 remap；
- Finalize：标定、非负和有限性约束。

目标公式为：

```text
support = footprint × altitude × weather × lifecycle
base = composeTopologyFields(domain, recipe)
body = support × verticalProfile × remap(base)
eroded = max(body - detailErosion, 0)
combined = smoothUnion(eroded, attachments)
density = finalize(combined, densityScale, edgeFade)
```

### D5: `LegacyPuffy` 保留为一等回退 Recipe

`evalCompatibilityGenus()` 将在机械重构阶段改名/封装为 `evalLegacyPuffyDensity()`。新全局开关提供：

- `0 = Legacy`：十属全部走当前兼容行为；
- `1 = Recipe`：每属读取自身 Recipe；尚未迁移属的 Recipe mode 仍为 LegacyPuffy。

这允许逐属迁移而不需要 genus bitmask。Legacy 路径在十属全部完成、固定基线与性能证据通过之前不得删除。

现有 `densityShapeModel` 保留为 LegacyPuffy 内部选项，直到 Legacy 清理提案决定是否将 Height-Weather 算子提取为新的 Support/Detail 组件。

### D6: 新增独立 Density Recipe GPU 数据

现有 `PresetGPU` 八个 `vec4` 已混合 legacy shape、morphology、edge 与 optical 字段，并受归档规格约束。核心迁移 SHALL 新增独立、固定大小、十属顺序一致的 `DensityRecipeGPU` 数组/缓冲区：

- CPU 使用具名字段和集中 offset 单一事实来源打包；
- WGSL 使用语义化 accessor/struct；
- Placement 不写入该表；
- Optical 字段继续由现有 preset buffer 提供；
- 新表初始全部指向 LegacyPuffy，加入时不得改变画面；
- 表大小和每属 record 上限固定，不支持任意 operator list。

具体 vec4 数量在实现子提案中冻结；不得以“填满所有未来字段”为由一次扩张过多。

### D7: 按形态差距与风险分波迁移

迁移顺序：

1. Stratiform：Stratus → Cirrostratus → Altostratus → Nimbostratus；
2. Fiber：Cirrus；
3. Cellular/Wave：Stratocumulus → Altocumulus → Cirrocumulus；
4. Convective：Cumulus → Cumulonimbus；
5. Recipe-aware Hybrid detail；
6. Variant/Attachment 扩展；
7. Legacy 清理。

Stratiform 优先，因为形态差距大且可跳过昂贵 4D Voronoi。Cumulus 后移，因为现 Legacy 链与其最匹配，可作为视觉稳定锚。Cumulonimbus 最后迁移，因为它组合算子最多、校准风险最高。

### D8: Cached/Hybrid 是主要验收路径

Cached 缓存 Macro Support、Vertical Profile、主体 Topology、影响轮廓的中尺度 Detail/Attachment，以及现有主/次云属元数据。

Hybrid 只在缓存非空区域补充允许丢失的微观细节，并根据主/次云属及 `w2` 混合 detail 参数：

- Stratiform：很弱的厚度扰动或无实时细节；
- Billow/Convective：高频 Worley/curl 边缘；
- Cellular：粒边破碎和 ripple；
- Fiber：高频分叉和断续。

主 raymarch、light march 与 ground shadow 仍经 `densityAtTyped()`。Realtime 必须编译并保持语义正确，但只记录正确性，不设实时帧预算。

### D9: 云种/变种通过有限 Modifier 扩展

核心十属 Recipe 稳定后，后续独立波次 MAY 增加 `VariantModifier`：

- parameter overrides；
- enable/disable 一个预编译 Modifier；
- 增加有限 Attachment；
- 不允许任意脚本或无限组合。

第一批候选为：cumulus humilis/mediocris/congestus/fractus、cirrus fibratus/uncinus/spissatus、lenticularis、castellanus、floccus、stratiformis、volutus、cumulonimbus calvus/capillatus/incus/mamma。

Variant 字段会影响 CloudBody/scenario schema，必须另有 schema migration 和 OpenSpec approval；不属于核心 Recipe foundation 的首批提交。

### D10: 降水与环境流场保持独立

Fractus 是凝结云密度 Attachment，可以进入 Recipe。Virga、降水帘和雨柱延伸到云体主体之外，具有独立输运和光学，应建立 precipitation field。垂直风切变、山岳波和涡旋属于 Domain/场景环境输入，不能由一个 genus preset 冒充完整天气模拟。

Wave/Lens 算子可以先用解析正弦/各向异性域表达荚状外观，但不声称模拟真实地形波动力学。

### D11: 验证以外部行为为准

当前自动化只有 TypeScript、生产构建、genus dispatcher 静态检查和少量 shader 文本检查。重构 SHALL 增加纯数据/静态契约检查，但不测试 WGSL 私有函数实现细节。

每波的外部行为验收包含：

- 固定相机、时间、body、placement、Cached/Hybrid 参数的正常与 density debug 截图；
- 未迁移属与全局 Legacy 模式视觉等价；
- 目标属的可辨轮廓/拓扑验收；
- cache/cloud pass GPU timing 中位数；
- 无 NaN、负密度、逃出 Support、云属元数据错配；
- 主/光/地影密度语义一致。

新增静态检查应验证：十属 Recipe 完整、preset/recipe 顺序一致、固定 record 布局一致、dispatcher 不回到公共属分支、未启用昂贵算子具有早退边界。

## Risks / Trade-offs

- **参数面扩大**：Recipe 可能再次形成巨型 preset。缓解：Placement/Density/Optical 分表；每波只添加已使用字段；保留固定 record 上限。
- **WGSL 分支膨胀**：组合算子可能导致 shader module 更大。缓解：静态 evaluator、早分发、禁用通用解释器、记录编译与 cache timing。
- **视觉校准量大**：十属同时变化不可审查。缓解：逐属迁移，每一属独立 A/B 和回滚。
- **旧字段语义重叠**：`scale/detail/altitude` 与新参数可能并存。缓解：Legacy 与 Recipe 分表，先映射不删除，最后另立清理提案。
- **Active changes 冲突**：Height-Weather 和 breakup 目标重叠。缓解：前置协调 gate；不并行实现空 breakup change。
- **Hybrid 边界闪变**：主/次属 detail 不同可能在交界突变。缓解：沿用缓存 `w2` 混合，并在密度非空阈值内渐入。
- **缓存低通损失形态**：纤维/小云粒可能被 96³ 缓存抹平。缓解：缓存主体骨架，Hybrid 补微观；不得默认把缓存升到立方高成本档。

## Migration Plan

1. 完成 active change 协调和十属 Cached/Hybrid 基线。
2. 建立 LegacyPuffy 命名、公共 Support/Finalize 边界与新静态检查，不改变画面。
3. 增加独立 recipe buffer，默认十属均为 LegacyPuffy。
4. 以未使用状态逐个加入共享算子，保证每次提交可构建。
5. 按 D7 顺序逐属切换 Recipe，单属完成验收后才进入下一属。
6. 十属主体稳定后再实现 Recipe-aware Hybrid detail。
7. 云种/变种、降水和 Legacy 删除分别走独立后续 change。

Rollback 始终优先使用全局 Legacy 开关；若某属单独失败，将该属 Recipe mode 退回 LegacyPuffy，不回滚其他已验收属。

## Open Questions

- `DensityRecipeGPU` 首批最小字段和 vec4 数量是多少？应由 foundation 子阶段在真实使用字段清单后冻结。
- Recipe 编辑器是首批能力还是仅保留代码 preset？建议首批只读/开发态，避免 UI 参数爆炸。
- 截图基线保存为仓库图片、外部 artifact，还是人工记录？当前无图像回归框架。
- 每波可接受 GPU 预算是多少？建议先冻结当前设备中位数，再给相对阈值。
- VariantModifier 是否先只做 Cumulus 发育阶段，还是先做跨属 lenticularis？需要独立产品优先级。
