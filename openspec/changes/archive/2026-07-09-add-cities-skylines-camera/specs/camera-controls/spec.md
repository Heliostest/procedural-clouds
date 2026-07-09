## ADDED Requirements

### Requirement: 城建风格 Look-At 相机
系统 SHALL 提供以可平移 look-at 目标为中心的球坐标相机：相机位置由目标点与球坐标 `(theta, phi, dist)` 导出，并通过 `lookAt(target)` 生成视图矩阵。系统 MUST 向渲染管线继续输出与现有一致的 `CameraFrame`（`viewProj`、`invViewProj`、`eye`），MUST NOT 改变 GPU camera uniform 布局。

#### Scenario: 初始取景
- **WHEN** 场景盒体边界首次通过 `setSceneBounds` 提供
- **THEN** 系统 SHALL 将 target 置于盒体水平中心附近与合理云层高度，并将距离设为可观察整盒的默认值

#### Scenario: 环绕不移动目标
- **WHEN** 用户拖拽环绕视角
- **THEN** target 位置 SHALL 保持不变，仅 `theta`/`phi` 变化，eye 绕 target 运动

#### Scenario: 帧输出兼容
- **WHEN** 每帧请求 `computeFrame(aspect)`
- **THEN** 返回值 SHALL 包含有效的 `viewProj`、`invViewProj` 与 `eye`，可供现有 raymarch 与 gizmo 投影使用

### Requirement: 键盘巡视与升降
系统 SHALL 支持键盘平移与升降 look-at 目标，手感对齐城建相机（天际线 2 类）：水平移动沿相机朝向在 XZ 平面分解，不因俯仰角产生明显垂直钻地分量。

#### Scenario: WASD 水平平移
- **WHEN** 用户按下 W/A/S/D 或方向键且输入焦点允许相机快捷键
- **THEN** target 的 XZ SHALL 沿当前水平前向/右向移动，Y 不因这些键改变

#### Scenario: QE 升降
- **WHEN** 用户按下 Q 或 E 且输入焦点允许相机快捷键
- **THEN** target.y SHALL 下降或上升

#### Scenario: 速度随距离与加速键
- **WHEN** 用户按住平移键
- **THEN** 平移速度 SHALL 随当前相机距离增大而增大；按住 Shift 时速度 SHALL 高于未按住时

#### Scenario: 可编辑焦点不抢键
- **WHEN** 焦点位于 GUI 可编辑控件
- **THEN** 系统 MUST NOT 将 WASD/QE 解释为相机移动

### Requirement: 指针环绕与滚轮缩放
系统 SHALL 保留指针拖拽环绕与滚轮缩放，并对角度与距离使用平滑跟随（惯性）。

#### Scenario: 拖拽环绕
- **WHEN** 用户在画布上拖拽且相机被允许环绕
- **THEN** 视角方位角/俯仰角 SHALL 跟随拖拽方向变化，俯仰角 MUST 保持在防止翻转的安全范围内

#### Scenario: 滚轮缩放
- **WHEN** 用户在画布上滚动滚轮
- **THEN** 相机到 target 的距离 SHALL 在场景派生的最小/最大距离内变化

#### Scenario: 惯性平滑
- **WHEN** 用户停止拖拽或滚轮输入
- **THEN** 角度与距离 SHALL 在短时间内平滑收敛到目标值，而非瞬时跳变

### Requirement: 场景边界约束
系统 SHALL 根据场景盒体半宽与云层高度约束 target 与距离，并派生 near/far。

#### Scenario: 水平与高度 clamp
- **WHEN** 用户持续向某一方向平移或升降
- **THEN** target SHALL 被限制在基于盒体半宽与云高派生的允许范围内，不得无限远离场景

#### Scenario: 盒体更新
- **WHEN** 盒体尺寸随后续 `setSceneBounds` 改变
- **THEN** 系统 SHALL 更新边界与 near/far，并将现有 target/距离 clamp 到新范围；MUST NOT 在非首次更新时无故重置用户已平移的巡视位置

### Requirement: 与仿真时钟及 Gizmo 共存
相机控制 SHALL 使用 wall-clock 时间积分，MUST NOT 受全局仿真倍率缩放。指针环绕 MUST NOT 抢占正在进行的 gizmo 拖拽。

#### Scenario: 零倍率仍可操作相机
- **WHEN** 全局仿真倍率为 `0×`
- **THEN** 用户仍能平移、环绕与缩放相机，且云体仿真状态保持冻结

#### Scenario: Gizmo 拖拽优先
- **WHEN** 用户命中并拖拽 gizmo 手柄
- **THEN** 该次指针手势 MUST NOT 同时驱动相机环绕

#### Scenario: 未命中时可环绕
- **WHEN** gizmo 模式开启但指针未命中手柄，或未启用 gizmo
- **THEN** 拖拽 SHALL 仍可环绕相机
