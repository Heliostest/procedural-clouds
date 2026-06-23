## ADDED Requirements

### Requirement: TypeScript 源码与严格类型
项目源码 SHALL 以 TypeScript 编写，并在 `strict` 模式下通过类型检查，MUST NOT 存在隐式 any。构建流程 SHALL 包含独立的类型检查步骤。

#### Scenario: 类型检查通过
- **WHEN** 运行 `npm run typecheck`
- **THEN** SHALL 无类型错误退出（exit 0）

#### Scenario: 构建含类型检查
- **WHEN** 运行 `npm run build`
- **THEN** SHALL 先执行类型检查再打包，任一失败则构建失败

### Requirement: 按职责拆分的模块结构
代码 SHALL 按职责拆分为独立模块（至少：数学、参数、相机、渲染器、GUI、入口），叶子模块（数学、参数）MUST NOT 依赖子系统模块，依赖关系 SHALL 单向无环。

#### Scenario: 单一入口装配
- **WHEN** 应用启动
- **THEN** 入口模块 SHALL 组合各子系统模块并启动渲染循环，渲染/相机/GUI 逻辑 SHALL NOT 集中于单一文件

### Requirement: 迁移不改变运行行为
迁移到 TypeScript 与模块化后，运行时画面与交互 SHALL 与迁移前一致，参数布局与渲染算法 MUST NOT 改变。

#### Scenario: 行为一致
- **WHEN** 以相同参数与操作运行迁移后版本
- **THEN** 画面、相机交互、预设切换过渡、风平流与缓存混合 SHALL 与迁移前表现一致
