## MODIFIED Requirements

### Requirement: Recipe V2 Compute 成本与依赖受限

W5 V2 cache update SHALL 继续只 dispatch 现有三维缓存网格；每个有效体素 MUST 保留全局 invocation bounds check 与恰好一次最终 RGBA16F storage write。V2 cache source MAY 读取 W4 Frame/Body/Recipe Support 与只读 tile-body mask，并 MAY 声明 W5 group 2 shared-field sampled bindings；但 cache entry 的可达调用图 MUST NOT 调用 `textureSample*`、shared sampling helper、weather/noise 或任何非零 genus density evaluator，W5 output SHALL 仍始终为 `vec4f(0.0)`。

W5 MAY 在首次 V2 candidate warmup 或 shared-field config/seed 明确失效时编码独立且有界的 shared atlas/macro generator pass，并 MAY 在显式 debug mode 使用独立的只读 sampling render pass；普通 density cache update、正常 cloud render 与 ground-shadow MUST NOT 生成这些额外 pass。V2 cache source MUST NOT 包含 Legacy 4D Voronoi/fBm、atomics、workgroup storage、occupied-tile compaction、indirect dispatch 或 W6 genus evaluator。默认 Legacy 且 V2 未请求时，V2 module/pipeline、mask/shared-field builder/buffer/texture、GPU memory 和 pass count MUST 为零。

#### Scenario: Mask 不跳过最终清零写入

- **WHEN** W5 tile mask 对某 workgroup tile 为零
- **THEN** invocation SHALL 跳过未来 body/evaluator 区域，但每个 bounds 内体素仍 MUST 写一次零值，MUST NOT 因 ping-pong 目标复用而保留陈旧密度

#### Scenario: W5 Cache Compute 静态成本

- **WHEN** 静态审计 W5 V2 cache compute entry 的可达调用图
- **THEN** source SHALL 只有 bounds、tile mask candidate gate 与零值 textureStore；texture samples、noise calls、shared sampling helper、非零 evaluator、atomics 和额外 cache entry SHALL 为零

#### Scenario: Shared Generator 不进入普通帧

- **WHEN** shared-field config/seed 未改变且 V2 candidate 已完成首次 warmup
- **THEN** 普通 cache update SHALL 不编码 atlas/macro generator；正常 cloud render 与 ground-shadow pass 数 SHALL 与 W4 相同

#### Scenario: 默认路径零开销

- **WHEN** active/requested Producer 均为 Legacy
- **THEN** renderer SHALL 不创建或编码任何 V2 GPU resource/pass，也不得运行 W4 mask builder 或 W5 shared-field generator，现有 density texture、cloud pass 与 ground-shadow pass 数 MUST 不变

#### Scenario: 只读 Debug Pass 有限隔离

- **WHEN** 用户显式选择 W5 Base/Detail/Macro debug view
- **THEN** 系统 MAY 惰性编码一个独立只读 sampling debug pass，但 MUST NOT 修改 density cache、触发 atlas 重建、改变 active Producer output 或使普通渲染依赖 shared diagnostics

#### Scenario: 不提前实现后续 Wave

- **WHEN** W5 完成
- **THEN** 所有 Recipe SHALL 继续 disabled 且 V2 normal output SHALL 保持零；W6 Stratus/Cumulus 与其他 genus evaluator 必须由后续独立 change 批准
