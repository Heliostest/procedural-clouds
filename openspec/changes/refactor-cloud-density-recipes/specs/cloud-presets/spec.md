## ADDED Requirements

### Requirement: Placement、Density 与 Optical 职责分离

云属配置 SHALL 将默认物理摆放、密度形态 Recipe 与光学响应作为三个独立职责来源。默认 base/thickness/bounds SHALL 继续由 genus placement profile 管理；Density Recipe SHALL 只包含生成凝结密度所需的模式和参数；现有 absorption/phase/silver/SSS/特殊光效 SHALL 继续作为 Optical Profile 由渲染阶段消费。相同 density topology MAY 被多个云属复用而不共享 placement 或 optical 数值。

#### Scenario: 高度不写入 Density Recipe

- **WHEN** cirrus 与 cirrostratus 复用高空薄层 Support 或相关算子
- **THEN** 二者实际米制 base/thickness SHALL 仍来自各自 CloudBody/genus profile，而不是 Density Recipe 重复编码绝对高度

#### Scenario: 光学不进入密度算子

- **WHEN** 只调整某属 phase、halo 或 sun-disc 参数
- **THEN** Density Recipe 输出和缓存密度 MUST NOT 改变

#### Scenario: 密度不执行像素着色

- **WHEN** 某 Recipe 使用 Fiber、Cellular 或 Convective 算子
- **THEN** 其 evaluator SHALL 只返回凝结密度，不得读取相机散射角或执行 light march

### Requirement: 独立固定布局 Density Recipe 数据

CPU SHALL 为十属维护独立于现有八 `vec4` legacy/optical preset 的固定大小 Density Recipe 数据表，并按规范云属顺序上传 GPU。字段与偏移 MUST 集中定义并按名打包；WGSL 布局 MUST 与 CPU 逐字节一致。Recipe record SHALL 有固定上限且只包含已批准使用的字段，不得实现任意长度 operator list。

#### Scenario: 初始加入不改变画面

- **WHEN** 首次加入 recipe buffer 且十属 Recipe 均选择 LegacyPuffy
- **THEN** 正常渲染、密度调试、缓存输出与引入前 SHALL 视觉等价

#### Scenario: 十属顺序一致

- **WHEN** CPU 打包 recipe 表并由 WGSL 以 genus 索引访问
- **THEN** 每个索引 SHALL 与 `CLOUD_PRESETS`、`CLOUD_GENERA` 和 dispatcher 的同一云属对应

#### Scenario: 布局可静态验证

- **WHEN** recipe record 字段或大小变化
- **THEN** 自动静态检查 SHALL 验证 CPU offset、总字节数、WGSL accessor 与十属完整性，并在不一致时失败

### Requirement: Legacy 字段兼容迁移

核心 Recipe 重构 SHALL 保留现有 preset、CloudBody 与 scenario 的加载能力。`scale`、`detail`、`altitude`、`worleyBlend`、`detailStrength` 及现有 morphology 字段 MAY 在迁移期间映射到 LegacyPuffy 或新 Recipe 参数，但 MUST NOT 在没有独立迁移与回退说明的情况下删除或改变序列化语义。

#### Scenario: 旧场景继续加载

- **WHEN** 加载 Recipe 架构引入前保存的 scenario 或默认 preset
- **THEN** 系统 SHALL 使用兼容默认和映射渲染，不得因缺少新 recipe 字段失败

#### Scenario: 新旧参数不互相污染

- **WHEN** 某属已使用新 Recipe 而另一属仍使用 LegacyPuffy
- **THEN** 修改新 Recipe 专属参数 MUST NOT 改变 Legacy 属，修改 Legacy-only 参数 MUST NOT 隐式改变已迁移属

