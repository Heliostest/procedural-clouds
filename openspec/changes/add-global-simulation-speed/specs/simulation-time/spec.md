## ADDED Requirements

### Requirement: 全局离散仿真倍率

系统 SHALL 提供单一全局仿真倍率 `simulationRate`，允许值严格为 `0`、`1`、`2`、`4`，默认值为 `1`。GUI SHALL 以横向相邻的 `0×`、`1×`、`2×`、`4×` 游戏式四按钮组暴露该状态，当前按钮 MUST 高亮并设置 `aria-pressed=true`；非法值 MUST 被拒绝或归一化到允许值。系统 MUST NOT 同时保留手动暂停 checkbox 或会与其相乘的 scenario 专用倍速。

#### Scenario: 默认一倍速
- **WHEN** 首次启动应用且用户未修改速度
- **THEN** `simulationRate` SHALL 为 `1`，仿真推进速度 SHALL 与引入本功能前一致

#### Scenario: 四按钮组
- **WHEN** 用户展开全局控制
- **THEN** 系统 SHALL 横向显示 `0×`、`1×`、`2×`、`4×` 四个按钮，且仅当前档位高亮并声明 pressed 状态

#### Scenario: 不再显示手动暂停 checkbox
- **WHEN** 用户查看全局控制
- **THEN** 系统 MUST NOT 显示「暂停动画」checkbox，手动冻结 SHALL 通过 `0×` 完成

### Requirement: 统一缩放仿真时间

每帧仿真增量 SHALL 在 CPU 时间入口统一计算为 `wallDeltaSeconds × simulationRate`。手动场景时钟、每体物理风累计位移、独立 morph time、生命周期输入与 scenario 播放头 MUST 共享该缩放后的时间语义；renderer、shader 或下游子系统 MUST NOT 再次乘倍率。

#### Scenario: 两倍速手动仿真
- **WHEN** `simulationRate=2` 且手动模式连续运行 5 秒 wall time
- **THEN** 手动仿真时钟、风平流、形变与生命周期 SHALL 推进 10 个仿真秒

#### Scenario: 四倍速 scenario
- **WHEN** `simulationRate=4`、scenario 正在播放且未 scrub
- **THEN** playhead SHALL 每 1 秒 wall time 推进 4 秒，并按该 playhead 确定性采样关键帧与累计风位移

### Requirement: 零倍率冻结但保持交互

`simulationRate=0` SHALL 冻结所有仿真状态，但 MUST NOT 停止 requestAnimationFrame、相机、GUI、FPS/GPU 统计、TAA 帧序列或纯渲染过渡。切换回非零倍率 SHALL 从冻结时刻继续，MUST NOT 补算冻结期间的 wall-clock 时间。

#### Scenario: 零倍率冻结
- **WHEN** 仿真以 `0×` 保持 10 秒 wall time
- **THEN** scene clock、playhead、生命周期、平流 offset 与 morph time SHALL 均保持不变，同时相机和 GUI 仍可响应

#### Scenario: 从零倍率恢复
- **WHEN** 用户从 `0×` 切回 `1×`
- **THEN** 下一帧 SHALL 只推进该帧的正常增量，不得出现 0× 期间时间补算或云体位置跳变

### Requirement: 仿真与渲染时间分离

系统 SHALL 保持 wall/render time 与 simulation time 分离。`elapsed`、`frameIndex`、相机更新、TAA jitter、性能计时、缓存调度与纯渲染 cross-fade SHALL 继续使用未缩放 wall time；只有仿真状态使用 `simulationRate`。

#### Scenario: 四倍速不改变渲染帧率目标
- **WHEN** 用户从 `1×` 切到 `4×`
- **THEN** requestAnimationFrame 与渲染质量参数 SHALL 不因倍率改变，速度档位不得被实现为跳帧或增加 ray-march 步数

#### Scenario: 零倍率仍渲染
- **WHEN** `simulationRate=0`
- **THEN** renderer SHALL 继续提交帧并允许相机移动，画面中的仿真状态保持冻结

### Requirement: Scenario pause、scrub 与重置交互

手动模式 SHALL 不再维护独立 pause 状态，`0×` 是唯一手动冻结入口。Scenario play/pause SHALL 与全局倍率共同决定是否推进，但不得改写选中的倍率。Scrub SHALL 采用绝对 `timeline.time`，不乘倍率；退出 scrub 后从该时刻按当前倍率继续。重置时间与重置平流 SHALL 保留既有语义。

#### Scenario: Scenario pause 不改倍率
- **WHEN** 当前为 `4×` 且用户暂停 scenario 后再恢复
- **THEN** scenario 暂停期间 playhead SHALL 不推进，恢复后倍率仍为 `4×`

#### Scenario: Scrub 不乘倍率
- **WHEN** 当前为 `2×` 且用户 scrub 到 30 秒
- **THEN** scene clock/playhead SHALL 直接等于 30 秒，而非 60 秒

#### Scenario: Scrub 后继续
- **WHEN** 用户在 `2×` 下退出 30 秒 scrub 并运行 1 秒 wall time
- **THEN** 仿真时钟 SHALL 从 30 秒推进到 32 秒

### Requirement: 仿真倍率是运行时偏好

`simulationRate` SHALL 作为运行时 UI/调度状态存在，MUST NOT 写入 scenario JSON，也 MUST NOT 扩展 GPU uniform 布局。

#### Scenario: Scenario 往返不携带倍率
- **WHEN** 用户在 `4×` 下导出并重新加载 scenario
- **THEN** JSON SHALL 不包含 `simulationRate`，加载后的场景内容与关键帧 SHALL 不受导出时倍率污染

#### Scenario: GPU 布局不变
- **WHEN** 实现全局仿真倍率
- **THEN** `PARAM_OFFSETS`、`BODY_BASE` 与 WGSL `Globals` SHALL 无需新增倍率字段
