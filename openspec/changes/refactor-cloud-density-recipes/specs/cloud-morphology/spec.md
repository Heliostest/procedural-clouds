## ADDED Requirements

### Requirement: 静态组合式密度 Recipe

系统 SHALL 为十个标准云属定义静态 Density Recipe，使对应具名 evaluator 能显式组合 Domain Transform、Macro Support、Vertical Profile、Base Topology、Detail/Erosion、Attachment 与 Finalize 算子。Recipe SHALL 作为固定云属代码与固定布局参数的组合计划，MUST NOT 解释任意长度算子列表、用户脚本、bytecode 或运行时 WGSL。云属 dispatcher SHALL 继续只负责路由，不得包含 Recipe 形态公式。

#### Scenario: 十属 Recipe 完整

- **WHEN** 构建云渲染 shader 与 recipe 数据
- **THEN** 十个规范云属 SHALL 各有一个对应 Recipe 入口，且 preset、recipe 与 dispatcher 顺序 MUST 一致

#### Scenario: 静态调用而非 GPU 解释器

- **WHEN** 某云属 Recipe 组合多个形态算子
- **THEN** 对应具名 evaluator SHALL 显式调用预编译共享函数，MUST NOT 在采样热路径遍历任意 operator registry

#### Scenario: 一个云属组合多个拓扑

- **WHEN** cumulonimbus Recipe 启用对流塔、billow、砧顶和纤维顶部
- **THEN** 系统 SHALL 在同一属 evaluator 内按明确组合语义生成一个有限非负密度贡献，而非强制四选一 density family

### Requirement: 公共 Support 与组合语义

系统 SHALL 在不预先生成团块密度的前提下复用运输坐标、云体逆旋转、footprint、实例高度、weather coverage、生命周期与最终密度标定。Mask/Support SHALL 以乘法限定允许区域；主体 topology SHALL 经 remap 形成基础密度；第二主体与 attachment SHALL 以有界 smooth union/soft max 组合；erosion SHALL 只减密度；Finalize SHALL 应用阈值、body/lifecycle density scale、edge fade 与有限非负约束。

#### Scenario: Support 外无凝结密度

- **WHEN** 采样点位于云体 footprint、实例垂直区间或有效 lifecycle 之外
- **THEN** 任一 Recipe SHALL 返回 0，且 attachment MUST NOT 在 Support 外产生孤立凝结密度

#### Scenario: 卷云不依赖 Legacy 团块

- **WHEN** cirrus 已迁移到 Fiber Recipe 且采样点位于有效 Support 内
- **THEN** 纤维场 SHALL 能直接形成主体密度，不要求 `LegacyPuffy` 在该点先返回非零

#### Scenario: 侵蚀不扩大缓存占据

- **WHEN** Recipe 应用 Worley、fBm 或 curl 边缘侵蚀
- **THEN** 侵蚀 SHALL 只降低已有密度，不得在原 Support 外增加密度

### Requirement: LegacyPuffy 分阶段回退

当前兼容五阶段密度链 SHALL 作为具名 `LegacyPuffy` Recipe 保留。全局 Legacy 模式 MUST 使十属全部复现当前基线；Recipe 模式下尚未迁移的云属 SHALL 单独选择 LegacyPuffy，而已迁移属 MAY 使用新的静态 Recipe。LegacyPuffy 内现有 `densityShapeModel` 语义 SHALL 保持可用，直到独立清理变更获批。

#### Scenario: 全局 Legacy 回退

- **WHEN** 用户将密度 Recipe 模型切换为 Legacy
- **THEN** 十个云属 SHALL 使用当前兼容密度链、现有专属修饰与下游缓存语义，固定场景观感应与重构前视觉等价

#### Scenario: 单属渐进迁移

- **WHEN** 仅 stratus Recipe 已切换到 Stratiform，其余九属仍标记为 LegacyPuffy
- **THEN** 只有 stratus 主体密度 SHALL 有意改变，其余九属不得因该迁移改变形态或执行新算子

#### Scenario: 属级回滚

- **WHEN** 某已迁移云属的视觉或性能验收失败
- **THEN** 系统 SHALL 能将该属退回 LegacyPuffy，而不回滚其他已验收 Recipe

### Requirement: 按需执行与有界成本

云属/Recipe 分发 SHALL 发生在不相关的昂贵噪声之前。未启用的 topology、detail 或 attachment MUST 在新增噪声采样前跳过。所有噪声 octave、attachment 数量和 Recipe record 大小 MUST 有静态上限；实现 MUST NOT 因 CSV 的尺度示例无条件新增固定 `128³`/`32³` 噪声纹理。

#### Scenario: 层状云跳过团块 Voronoi

- **WHEN** stratus、altostratus 或 cirrostratus 使用不含 Billow/Cellular 的 Stratiform Recipe
- **THEN** 该采样 SHALL 不执行 LegacyPuffy 的两组分形 4D Voronoi

#### Scenario: 零强度 Modifier 早退

- **WHEN** 某 attachment 或 detail strength 为 0
- **THEN** 对应路径 SHALL 在其额外噪声、warp 或 union 工作前返回原密度

#### Scenario: 数值安全

- **WHEN** 任一受支持 Recipe 在参数允许范围内求值
- **THEN** 输出 MUST 为有限非负值，不得产生 NaN、无穷或逃出 Support 的密度

### Requirement: 形态模板和变种 Modifier 边界

Convective、Stratiform、Cellular Layer 与 Fibrous SHALL 作为可组合 Recipe 模板，而非互斥云属枚举。后续云种/变种能力 MAY 通过有限 `VariantModifier` 覆盖参数、启用预编译 modifier 或增加有界 attachment；任何影响 CloudBody/scenario schema 的 variant 字段 MUST 另经规格批准。

#### Scenario: 跨属复用荚状算子

- **WHEN** 后续 altocumulus 或 stratocumulus 启用 lenticularis 变体
- **THEN** 二者 MAY 复用同一 Wave/Lens 算子，同时保留各自 placement、cell scale 与 optical profile

#### Scenario: 核心重构不改变 schema

- **WHEN** 仅实施 Recipe foundation 与十属主体迁移
- **THEN** 既有 CloudBody 和 scenario 文件 SHALL 无需新增 variant 字段即可加载和渲染

