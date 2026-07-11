## ADDED Requirements

### Requirement: 密度质量模式专属 Pipeline Bundle

系统 SHALL 为 Cached、Hybrid 与 Realtime 建立相互独立的密度质量 `Pipeline Bundle`。每个 bundle SHALL 至少拥有与本模式 source closure 匹配的 cloud render pipeline、密度相关 ground-shadow compute pipeline、layout-compatible bindings 和生命周期状态。Common raymarch、light-march、ground shadow 与 density debug SHALL 只依赖同签名 `densityAtTyped()/densityAt()`；模式选择 MUST 由 active bundle 决定，而非在一个共享 shader module 中通过 uniform 分发完整密度调用图。

Cached source closure SHALL 只包含双缓存采样及必要 edge shaping；Hybrid SHALL 只增加现有有界微观细节入口，并 MUST NOT 在空缓存区域生成主体。Cached 与 Hybrid assembled source MUST NOT 静态包含 `cloudDensityTyped()`、`evalBody()`、十属 dispatcher 或完整 Legacy noise/evaluator graph。Realtime SHALL 在独立 source/module/pipeline 中保留当前直接密度求值。Post、Bloom、TAA、line、axis 和 ground-shadow resolve/filter MAY 继续共享。

#### Scenario: Cached closure 不携带完整 evaluator

- **WHEN** 组装或静态审计 Cached cloud/ground-shadow source
- **THEN** source SHALL 只通过 `DensityCacheOutput` 采样密度，MUST NOT 包含或引用完整 Legacy/Realtime evaluator graph

#### Scenario: Hybrid 只补有界细节

- **WHEN** active bundle 为 Hybrid 且缓存基底密度大于现有阈值
- **THEN** pipeline SHALL 使用现有 bounded detail 调制缓存基底；当缓存为空时 MUST 返回空密度，且 source MUST NOT 引入完整 body/genus evaluator

#### Scenario: Realtime 独立直接求值

- **WHEN** active bundle 为 Realtime
- **THEN** 主 raymarch、light-march、density debug 与密度相关 ground shadow SHALL 使用独立 Realtime module 的直接密度 evaluator，MUST NOT 消费 Cached/Hybrid density bind group

#### Scenario: 同一 active bundle 覆盖所有密度消费者

- **WHEN** active quality mode 发生切换
- **THEN** 主画面、自阴影、density debug 和 transmittance ground shadow SHALL 同时使用目标 bundle，不得让不同消费者停留在不同 quality source closure

### Requirement: 异步创建、惰性 Realtime 与原子回退

系统 SHALL 分离 requested 与 active quality mode，并为各 bundle 暴露 `idle`、`compiling`、`ready`、`failed`、`destroyed` 生命周期。Cached 与 Hybrid SHALL 通过异步 pipeline creation 在 renderer 启动阶段准备；Cached 为最低可用回退。Realtime 初始 SHALL 为 `idle`，只有首次请求 Realtime 后才可组装其完整 source 并创建 `GPUShaderModule`、pipeline 与模式 bindings。候选 bundle 只有在所有必需 pipeline/bindings ready 后才可原子成为 active；compiling 或 failed 时 MUST 保留健康的当前 Cached/Hybrid bundle。

#### Scenario: 默认 Hybrid 启动不创建 Realtime

- **WHEN** 应用使用默认 Hybrid 启动且用户从未请求 Realtime
- **THEN** Cached/Hybrid SHALL 可用，Realtime lifecycle SHALL 保持 `idle/not-requested`，且 MUST NOT 创建 Realtime GPU shader module、render pipeline 或 ground-shadow pipeline

#### Scenario: Realtime 首次请求期间保持健康画面

- **WHEN** requested=Realtime 且候选 bundle 仍在 `compiling`
- **THEN** active SHALL 保持先前健康 Cached/Hybrid，画面和密度消费者 SHALL 继续使用该 active bundle，HUD SHALL 不得把 Realtime 报为 active

#### Scenario: 候选创建失败安全回退

- **WHEN** Hybrid 或 Realtime shader/pipeline 创建或 binding 验证失败
- **THEN** 系统 SHALL 保留健康 Cached bundle或先前 active bundle，记录稳定 failure reason，MUST NOT 发布半初始化 pipeline 或悬空 binding

#### Scenario: Ready bundle 复用

- **WHEN** 用户再次切换到已 ready 的 quality mode
- **THEN** 系统 SHALL 复用缓存的 bundle 并原子切换，MUST NOT 重复编译相同 pipeline

#### Scenario: 销毁期间候选完成

- **WHEN** renderer 已销毁而异步候选创建随后完成
- **THEN** 系统 MUST 丢弃该候选并阻止其成为 active；重复销毁 SHALL 幂等

### Requirement: 密度 Pipeline 生命周期可审计

`RenderStats` 与运行时 HUD SHALL 同时提供 requested/active quality、各 bundle lifecycle、active bundle identity/generation、shader module creation CPU time、render/ground-shadow async pipeline creation latency 与 failure reason。CPU creation latency MUST NOT 写入 timestamp-query 的 cloud/cache/shadow GPU timing；未请求的 Realtime SHALL 显示 `idle/not-requested`，不得标记为失败。

#### Scenario: 请求值与运行值分开显示

- **WHEN** requested quality 尚未 ready 或已失败
- **THEN** stats/HUD SHALL 显示 requested、实际 active、lifecycle 与 reason，MUST NOT 只显示 `CloudParams.qualityMode`

#### Scenario: Timing 类型不混淆

- **WHEN** pipeline async creation 有 CPU elapsed time 而 timestamp query 不可用
- **THEN** creation latency SHALL 可见，但 cloud/cache/shadow GPU timing SHALL 保持 unavailable，MUST NOT 复用 CPU 数值

#### Scenario: 切换不增加渲染工作量

- **WHEN** Cached/Hybrid bundle 隔离完成且质量参数与 W1 相同
- **THEN** 系统 MUST NOT 因架构拆分增加 density texture 数、cloud render pass 数、ground-shadow pass 数或 raymarch/light-march 上限
