## RENAMED Requirements

- FROM: `### Requirement: W3 V2 Compute 成本与依赖受限`
- TO: `### Requirement: Recipe V2 Compute 成本与依赖受限`

## MODIFIED Requirements

### Requirement: Recipe V2 Compute 成本与依赖受限

W4 V2 cache update SHALL 继续只 dispatch 现有三维缓存网格；每个有效体素 MUST 保留全局 invocation bounds check 与恰好一次最终 RGBA16F storage write。V2 source MAY 读取 W4 Frame/Body/Recipe Support 与只读 tile-body mask，并在未来 evaluator 区域前排除空 tile；但 W4 output SHALL 仍始终为 `vec4f(0.0)`。V2 source MUST NOT 包含 weather/atlas/noise texture sample、非零 genus density evaluator、Legacy 4D Voronoi/fBm、atomics、workgroup storage、occupied-tile compaction、indirect dispatch 或额外正常帧 compute/render pass。默认 Legacy 且 V2 未请求时，V2 module/pipeline、mask builder/buffer、GPU memory 和 pass count MUST 为零。

#### Scenario: Mask 不跳过最终清零写入

- **WHEN** W4 tile mask 对某 workgroup tile 为零
- **THEN** invocation SHALL 跳过未来 body/evaluator 区域，但每个 bounds 内体素仍 MUST 写一次零值，MUST NOT 因 ping-pong 目标复用而保留陈旧密度

#### Scenario: W4 Compute 静态成本

- **WHEN** 静态审计 W4 V2 compute entry
- **THEN** source SHALL 只有 bounds、tile mask candidate gate 与零值 textureStore；noise calls、texture samples、非零 evaluator、atomics 和额外 entry/pass SHALL 为零

#### Scenario: 默认路径零开销

- **WHEN** active/requested Producer 均为 Legacy
- **THEN** renderer SHALL 不创建或编码任何 V2 GPU resource/pass，也不得运行 W4 CPU mask builder，现有 density texture、cloud pass 与 ground-shadow pass 数 MUST 不变

#### Scenario: 不提前实现后续 Wave

- **WHEN** W4 完成
- **THEN** V2 source/resources MUST NOT 包含 W5 atlas/macro fields 或 W6 genus density evaluator；这些能力必须由后续独立 change 批准

## ADDED Requirements

### Requirement: V2 保守 Tile-Body 候选 Mask

Recipe V2 Adapter SHALL 按实际 cache resolution/workgroup dispatch grid 为每个 tile 建立一个 read-only `u32` body mask。linear index SHALL 为 `x + gridX*(y + gridY*z)`；bit `i` SHALL 仅引用 `i<activeBodyCount<=12` 的 compact Body slot，bit 12–31 MUST 为零。tile/body 相交 SHALL 使用 `density-recipe-schema` 声明的保守世界 Support AABB、闭区间边界和至少半体素加有限 epsilon；允许多保留候选，MUST NOT 漏掉任何可能产生非零密度的 Body。

Mask buffer SHALL 为 V2 Adapter 私有 read-only storage resource，不得进入 `DensityCacheOutput`。mask update SHALL 使用独立 generation/revision；普通 mask 内容变化 MUST NOT 伪造 sampled output `resourceGeneration`。

#### Scenario: 默认 96³ 网格

- **WHEN** resolution=`96³` 且 workgroup=`8×8×4`
- **THEN** grid SHALL 为 `12×12×24`、tile count SHALL 为 3,456、mask payload SHALL 为 13,824 bytes，并至多执行 41,472 次 CPU tile-body broad-phase 判断

#### Scenario: 空 Tile 无候选工作

- **WHEN** 某 tile 不与任何 active Body Support 相交
- **THEN** 其 mask SHALL 为零，W4 shader SHALL 不进入未来 body/evaluator 区域，但最终 output SHALL 仍被确定性写零

#### Scenario: 旋转平流与边界接触保持保守

- **WHEN** Body 旋转、累计风平流、快速移动或其 Support 恰好接触 tile/scene 边界
- **THEN** mask SHALL 随当前 cache input 重建并保留所有相交 bit，MUST NOT 因取整、edge tile 或旧 signature 产生缺块

#### Scenario: Resize 与 Workgroup 重建

- **WHEN** density resolution 或合法 workgroup 改变
- **THEN** Adapter SHALL 重新计算 grid、检查预算并重建/复用合适 mask capacity；旧 grid/mask MUST NOT 与新 dispatch 混用

### Requirement: Tile Mask 有界退化与可审计统计

W4 SHALL 将 mask 基础预算限制为最多 262,144 tiles、1 MiB payload 和 3,145,728 次 CPU tile-body tests，并同时检查 WebGPU `maxStorageBufferBindingSize` 与 `maxBufferSize`。任一限制不满足时，Adapter SHALL 使用最小合法 dummy buffer 并退化为 dense active-prefix，不得分配目标巨型 mask、拒绝合法 Producer 或改变零输出。

Stats/HUD SHALL 报告 mask enabled/fallback reason、grid/tile/mask bytes、empty/occupied tiles、candidate sum/average/max、dense/masked tile-body pairs、考虑 edge tile 后的 dense/masked voxel-body upper bound、culled ratio、mask generation/revision 与 rebuild CPU timing/count/reason。W4 `evaluatorCalls` SHALL 明确为零；候选上限 MUST NOT 表述为 GPU invocation、timestamp timing 或 steady-state 加速。

#### Scenario: 极端小 Workgroup 安全退化

- **WHEN** `256³` resolution 配合 `1×1×1` workgroup 导致 tile count 或 buffer/CPU tests 超预算
- **THEN** mask SHALL 标记为 `disabled-budget` 或具体 device-limit reason，Adapter SHALL 继续产生有效零 output，MUST NOT 尝试分配 16,777,216-entry mask

#### Scenario: 普通无更新帧不重建

- **WHEN** 本帧 V2 cache plan 不编码，或 resolution/workgroup/volume/active Body Support signature 均未改变
- **THEN** CPU mask builder MUST NOT 重新遍历全部 tile-body pairs，mask revision 与 rebuild count SHALL 保持不变

#### Scenario: 候选统计不冒充性能证据

- **WHEN** W4 报告 masked candidate upper bound 小于 dense upper bound
- **THEN** 系统 MAY 将其记录为候选剔除证据，但 MUST NOT 声称实际 evaluator 或 GPU cache pass 已加速；该判断 SHALL 等待 W6 非零 evaluator 与真实 timestamp 数据

