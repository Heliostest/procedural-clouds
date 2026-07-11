## ADDED Requirements

### Requirement: 可重复的密度基线 Manifest

系统 SHALL 提供版本化、可序列化的密度 benchmark manifest，固定 source revision、active change 状态、viewport、相机、场景时间、暂停状态、天气、风、生命周期、CloudBody placement、genus、preset 以及所有影响密度和成像的参数。权威 W0 manifest MUST 使用 1280×720 render target、`cacheResolution=96` 和 `cacheUpdateRate=2`。benchmark 开始后若输入或用户交互导致 manifest 状态漂移，系统 MUST 取消本轮或将结果标为无效。

#### Scenario: 相同 Manifest 恢复相同输入

- **WHEN** 在相同 source revision 上重新装载同一 W0 manifest
- **THEN** 系统 SHALL 恢复相同的相机、时间、天气、风、生命周期、云体和渲染参数，并产生相同配置 fingerprint

#### Scenario: 用户交互使运行无效

- **WHEN** benchmark 采样期间用户改变相机、时间、云体或任一被 manifest 固定的参数
- **THEN** 当前 case MUST 停止采样或标为 invalid，且 MUST NOT 写入有效基线统计

#### Scenario: 活动提案状态进入指纹

- **WHEN** `densityShapeModel`、`heightAmbientModel` 或相关 active change 的权威状态发生变化
- **THEN** 新结果 SHALL 具有不同 fingerprint，旧结果 MUST 标为 stale 或保留为具名 compatibility anchor，不得与新 Legacy baseline 合并

### Requirement: 代表性视觉与性能场景矩阵

W0 SHALL 提供十个单云属固定场景、“十属同场景”和“单个复杂 Cumulonimbus”压力场景，作为可重复场景目录。W0 SHOULD 支持 Stratus、Cumulus、Cirrus、复杂 Cumulonimbus 与十属同场五个代表场景在 Cached/Hybrid 正常视图下采集 10 个 timing case，并 SHOULD 支持为每个代表场景保存一张 Normal 和一张 Density Debug 视觉锚点。每个截图 case 的质量模式 SHALL 由 manifest 固定，整组截图配置 SHALL 同时覆盖 Cached 与 Hybrid。所有 case MUST 使用稳定、唯一且可由 manifest 解析的 case ID，并显式标明是否阻塞 W0 Gate。项目所有者明确接受人工视觉签核时，建议 timing 与截图 MAY 保持未采集且 MUST NOT 阻塞后续 Wave；未采集状态 MUST NOT 被表述为性能证据完整。

#### Scenario: 代表矩阵完整

- **WHEN** W0 代表性矩阵被声明为“性能证据完整”
- **THEN** Stratus、Cumulus、Cirrus、复杂 Cumulonimbus 与十属同场 SHALL 各有 Cached/Hybrid 两个 Normal timing case，并各有 Normal/Density Debug 两张视觉锚点

#### Scenario: 项目所有者接受人工签核

- **WHEN** 项目所有者确认画面无明显回归并明确豁免严格采集
- **THEN** timing 与截图 case SHALL 保持可运行但 MAY 标记为非阻塞，W1 MAY 建立；系统 MUST NOT 将缺失数据伪装成已完成结果或定量性能基线

#### Scenario: 其余单属延迟到迁移 Wave

- **WHEN** 某个不属于 W0 代表矩阵的云属进入 Density V2 迁移 Wave
- **THEN** 该 Wave MUST 复用 W0 manifest 中对应的单属场景补采 Legacy/V2 前后证据；该证据在 W0 阶段 MAY 缺失且 MUST NOT 阻塞 W0 Gate

#### Scenario: 压力场景分开记录

- **WHEN** 采集十属同场景或复杂 Cumulonimbus 场景
- **THEN** Cached 与 Hybrid SHALL 分别记录，Normal timing MUST NOT 与 Density Debug timing 合并

#### Scenario: Realtime 仅为可选兼容状态

- **WHEN** 未执行 W0 Realtime 检查，或仅在代表场景记录其兼容状态
- **THEN** 系统 MUST NOT 将 Realtime 纳入性能矩阵、截图矩阵、W0 性能目标或完成 Gate

### Requirement: 分离且可审计的测量协议

在支持 `timestamp-query` 的设备上，每个被计时 case SHALL 在至少 60 个 warm-up 帧后采集至少 60 个有效 cloud pass 样本和至少 60 个实际执行的 cache pass 样本。系统 MUST 只在 `cacheRan=true` 时采集 cache timing，并 SHALL 为每个 pass 输出 sample count、median、p95、min 与 max。Normal、Density Debug、Cached 与 Hybrid 的样本 MUST 分组保存，不得跨组聚合。

#### Scenario: 非缓存更新帧不重复旧值

- **WHEN** 某帧因 `cacheUpdateRate` 未执行 cache compute pass
- **THEN** 该帧 MUST NOT 把上一次 `cacheMs` 作为新的 cache 样本

#### Scenario: timestamp-query 可用

- **WHEN** reference device 支持 `timestamp-query` 且样本数量达到要求
- **THEN** 结果 SHALL 保存各 pass 的 count、median、p95、min 与 max，并明确单位为 GPU milliseconds

#### Scenario: timestamp-query 不可用

- **WHEN** 当前设备不支持 `timestamp-query`
- **THEN** GPU timing SHALL 标为 `unavailable` 并注明原因，FPS、JavaScript frame time 与 CPU wall time MUST NOT 写入 GPU timing 字段

#### Scenario: CPU 启动时间独立

- **WHEN** 记录 adapter/device/shader/pipeline 首次创建 elapsed time
- **THEN** 结果 SHALL 将其标记为 CPU startup timing，MUST NOT 与稳态 GPU pass timing 相加或用于替代 GPU 样本

### Requirement: 可追溯的 W0 证据包

W0 SHALL 提供保存机器可读结果、权威 manifest、人类可读索引和截图证据的能力。实际生成的每份结果 MUST 包含 baseline/manifest version、source revision、采集时间、adapter 信息、features、limits、timestamp availability、配置 fingerprint、case ID、quality/view mode、活跃云体数、warm-up/sample counts、pass statistics、CPU startup timing、截图路径、warnings 和 stale 状态。至少一台支持 `timestamp-query` 的 reference device MUST 完成全部建议性能 case，W0 才能声明性能证据完整；未作该声明时，缺少结果包 MAY 被项目所有者接受为非阻塞状态。

#### Scenario: 证据可追溯

- **WHEN** 维护者打开任一 W0 result
- **THEN** 其 SHALL 能确定使用的 source revision、manifest、设备、配置、case、样本数量和对应截图，而无需根据文件时间猜测

#### Scenario: 指纹不匹配拒绝合并

- **WHEN** 两份结果的 source revision、manifest、viewport、quality/view mode 或关键参数 fingerprint 不一致
- **THEN** 工具 MUST 拒绝直接聚合或将比较显式标为 mismatch/stale，MUST NOT 通过比例缩放隐式归一化

#### Scenario: 视觉证据可以在无 timestamp 设备采集

- **WHEN** 不支持 `timestamp-query` 的设备完成视觉 case
- **THEN** 截图和配置证据 MAY 记为完成，但 W0 性能证据 MUST 保持未完成，直到支持设备完成权威 timing

### Requirement: W0 不改变渲染行为并阻挡后续实施

benchmark controller SHALL 默认关闭。关闭时 MUST NOT 增加 GPU pass、覆盖渲染参数、改变密度缓存调度或改变 Normal/Density Debug、Cached/Hybrid 的画面。W0 不得实现 `DensityCacheProducer`、V2 shader、Recipe、tile-body mask、noise atlas 或 pipeline 隔离。若项目所有者已完成人工视觉签核并明确接受证据缺失，W1 MAY 建立；缺少 reference timing 时，后续 change MUST NOT 声称相对 Legacy 的性能收益。

#### Scenario: Benchmark 关闭保持现状

- **WHEN** benchmark controller 未启用
- **THEN** renderer SHALL 使用原有参数和 pass 顺序，且不得产生额外 benchmark GPU pass 或视觉变化

#### Scenario: W0 矩阵缺失

- **WHEN** 任一建议代表 timing case、视觉锚点、配置元数据或 reference device GPU timing 缺失
- **THEN** 证据索引 MUST 将“性能证据”标为 incomplete；若存在项目所有者人工签核，该状态 MUST NOT 自动关闭 W1 架构 Gate

#### Scenario: W0 完成

- **WHEN** benchmark 工具已落地、默认关闭路径经人工确认无视觉回归，且项目所有者明确接受未采集的建议证据
- **THEN** W0 MAY 作为架构前置工作被接受并允许建立 W1；只有代表 timing、视觉锚点和可追溯元数据均完整时，才 MAY 额外声明“W0 性能证据完整”
