## ADDED Requirements

### Requirement: 世界尺度主 Raymarch 与保守 Skip

主云 raymarch SHALL 支持 world-step 模式：以米制 min/max step 与 max ray distance 驱动沿射线推进，`maxPrimaryIterations` 仅作安全上限。主循环顺序 SHALL 为：ray/AABB → 公开 Body Support 保守 hard reject → 可选 valid/complete candidate 保守 hard reject → step envelope →（可选）envelope 内 coarse hint → 推进/命中细化 → `densityAtTyped` → 既有 lighting/integration → transmittance 早停。global coarse 单点采样 MUST NOT 单独判空或放大超出已证明 envelope 的步长。W10B 全部关闭时 MUST 精确回到 W10A fixed-step + IGN/Halton full-resolution 基线。

#### Scenario: World-step 激活

- **WHEN** `worldStepEnabled` 且路径就绪
- **THEN** 诊断 SHALL 报告 `worldStepActive=true`，并提供平均/最大世界步长与 primary iterations 计数

#### Scenario: Support hard reject 保守

- **WHEN** 公开 Body Support 证明射线区间为空
- **THEN** 系统 MAY hard reject 该区间；false-negative（拒绝实心区间）MUST 为 0（由 fixture 约束）

#### Scenario: Feature-off 回退 fixed-step

- **WHEN** world-step 关闭
- **THEN** primary iterations SHALL 回到固定步数基线，平均世界步长诊断可为 0

### Requirement: Raymarch 子功能独立开关

world-step、Support skip、candidate skip、coarse hint 与 STBN SHALL 可独立开关。关闭单项 MUST 回到其下层基线；candidate invalid、global-only、Legacy 或 W9 hierarchical inactive 时 MUST NOT 触碰无效 candidate buffer。

#### Scenario: 单独关闭 Support skip

- **WHEN** world-step 启用但 Support skipping 关闭
- **THEN** 系统 SHALL 保持 world-step，且诊断报告 `worldStepSupportSkipping=false`

#### Scenario: Candidate 不可用时不读取

- **WHEN** active storage 为 global-only 或 candidate invalid
- **THEN** 系统 MUST NOT 依赖 candidate buffer 做 hard reject
