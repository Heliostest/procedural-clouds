# Change: 将十属密度重构为组合式 Recipe 架构

## Why

当前十个云属虽然已经拥有独立 WGSL evaluator，但所有普通云体仍先执行 `evalCompatibilityGenus()` 的同一套团块型 Perlin/Voronoi 密度链，云属 evaluator 基本只能在非零兼容密度上二次雕刻。这使卷云纤维、层状薄幕、鱼鳞云粒、对流塔和附属结构都受同一个基础团块限制，也让不需要分形 4D Voronoi 的层状云支付相同计算成本。

新整理的十属形态手册进一步表明：云属、云种/变种与数学拓扑不是一一对应。荚状、堡状、絮状、成层状、滚轴状和碎片状会跨云属重复出现；积雨云则同时组合对流塔、砧顶、纤维顶部和乳状附属特征。继续增加互斥 `densityFamily` 或把更多分支塞进兼容链都无法形成稳定扩展边界。

## What Changes

- 将当前兼容密度链明确降级为 `LegacyPuffy` 回退/过渡算子，不再是所有云属不可绕过的最终基础密度。
- 保留十属独立 evaluator 与静态 dispatcher；每个 evaluator 通过静态 Recipe 组合共享的 Domain、Support、Vertical Profile、Topology、Detail/Erosion、Attachment 和 Finalize 算子。
- 将云属数据按 Placement Profile、Density Recipe 与 Optical Profile 三条职责轴分离；placement 继续由 genus profile/CloudBody 管理，现有按属光照继续独立于密度 Recipe。
- 为 Density Recipe 增加独立、固定布局、按名打包的 GPU 数据，不把新字段继续挤入现有八个 `vec4` 的 legacy/optical preset 布局。
- 按 Stratiform → Fiber → Cellular/Wave → Convective 的波次迁移十属；每一属均可单独选择 Legacy 或 Recipe 路径，未迁移属保持现有观感。
- Cached 保存宏观与中尺度主体；Hybrid 根据主/次云属元数据补充 Recipe 相关微观细节，不在空区生成密度。
- 保持 `cloudDensityTyped()`、多云体软饱和、RGBA 密度缓存、主次云属光照元数据、raymarch 和地面云影下游契约不变。
- 将云种/变种 Modifier、mammatus、fractus、lenticularis、volutus 等纳入后续波次；降水帘/雨幡仍作为独立 precipitation field 提案，不混入凝结云密度核心。

## Capabilities

### Modified Capabilities

- `cloud-morphology`：从“兼容密度 + 后置属修饰”扩展为静态组合式密度 Recipe，同时保留 Legacy 回退。
- `cloud-presets`：增加独立 Density Recipe 数据与 Placement/Density/Optical 职责边界。
- `cloud-rendering`：Hybrid 细节从单一全局 Perlin 扩展为按 Recipe/云属选择并按主次云属混合。

### Behavior Preserved

- `CloudBody` 与 scenario schema 在核心重构阶段保持兼容。
- 十属索引顺序、dispatcher、无效索引 cumulus 回退保持不变。
- 密度缓存仍为 RGBA：密度、主云属、次云属、次云属权重。
- Cached/Hybrid 仍通过统一 `densityAtTyped()` 服务主 raymarch、light march 和地面云影。
- edge-style 继续是缓存采样后的独立阶段。
- 现有按属光照字段和特殊光效不在本重构中物理化重写。

## Prerequisites and Conflicts

- `add-height-weather-shaping` 已实现但尚缺截图和性能验收。本重构开始前必须完成/归档，或记录其残余风险；其算法保留为 LegacyPuffy/Billow 的候选输入，不重复实现。
- `add-height-ambient-tint` 只改光照，但尚缺视觉/性能验收。应独立收尾，并在首次密度重校准前冻结最终光照基线。
- `add-stratocumulus-cumulus-breakup` 当前只有空 spec 目录。其目标由 Cellular/Billow 与 `fractus` Modifier 波次吸收，不应并行实现另一套 breakup 公式。
- 本提案细化并取代 `docs/roadmap-v2.md` 阶段 13.1 的单体密度重建步骤，并吸收阶段 14 的后续形态扩展边界；不改变阶段 13.2/13.3 的光照与大气路线。

## Impact

- **主要代码区域**：云属 WGSL evaluator、共享 genus 算子、噪声函数、preset/recipe 数据与打包、renderer 绑定组、GUI/i18n、genus dispatch 检查脚本。
- **规格**：修改 `cloud-morphology`、`cloud-presets`、`cloud-rendering`。
- **数据兼容**：核心波次不要求 scenario schema 迁移；云种/变种字段若进入运行时，必须另经后续批准。
- **性能**：目标是在 Cached/Hybrid 下按属跳过无关重噪声；每波必须记录 cache/cloud pass 中位数，任何超过预算的回归不得用提高缓存分辨率掩盖。
- **观感**：有意改变形态，只能按属逐波发生；未迁移属和全局 Legacy 模式必须保持现有基线。
- **回滚**：全局 Recipe 开关和每属 Legacy recipe 保留到十属全部验收完成后的独立清理提案。

## Approval Status

本目录目前仅包含提案、设计、路线任务和规格 delta。实现代码 MUST NOT 在用户批准本 change 前开始修改。
