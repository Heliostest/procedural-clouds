# Change: 增加天际线 2 风格镜头控制

## Why

当前相机只能绕固定目标点拖拽环绕与滚轮缩放，无法在场景中平移巡视。云体分布在较大水平盒体内时，用户难以像城建游戏那样快速扫视、贴近观察或升高俯瞰。

本变更将镜头升级为接近《城市：天际线 2》的城建相机：在保留环绕/缩放的同时，支持键盘平移目标点、升降视高，并与现有 gizmo 指针交互共存。

## What Changes

- 将 `camera.ts` 从「固定 target 的纯轨道相机」扩展为「可平移 look-at 目标 + 球坐标环绕」的城建相机。
- 增加 WASD / 方向键：沿相机朝向在 XZ 平面平移 target；Q/E（或等价键）升降 target 高度。
- 保留指针拖拽环绕与滚轮缩放；环绕仍绕当前 target，缩放仍改距离。
- 平移速度随当前距离缩放，并提供 Shift 加速；输入使用 wall-clock，不受 `simulationRate` 影响。
- target 与距离受场景盒体边界约束；`setSceneBounds` 继续派生初始 target、距离与 near/far。
- 明确与 gizmo 的指针优先级：gizmo 命中拖拽时相机不抢占；未命中时拖拽仍可环绕。
- 更新 README / i18n 操作说明。

## Non-Goals

- 第一人称飞行、Pointer Lock、自由 6DOF 相机。
- 屏幕边缘滚动（edge scroll）、手柄/触控专用手势、双指捏合。
- 将相机位姿写入 scenario JSON 或 CloudParams。
- 改变 GPU `Camera` uniform 布局、raymarch、TAA 或渲染管线。
- 实现天际线 2 的全部快捷键/设置面板（仅对齐核心巡视手感）。

## Capabilities

### Added Capabilities

- `camera-controls`：定义城建相机输入、目标平移、环绕/缩放、边界、惯性与 gizmo 共存规则。

### Modified Capabilities

- （无）现有 `cloud-rendering` 等规格不描述相机交互；本变更新增独立能力。

## Prerequisites and Conflicts

- 与 gizmo 共享 canvas 指针事件；实现 MUST 在 gizmo 已捕获拖拽时抑制相机环绕。
- 相机更新继续使用 wall time（与 `simulation-time` 的「相机不受仿真倍率影响」一致）。
- 不与 active genus / simulation-speed 变更冲突；主要改动面为 `camera.ts`、`main.ts`、文档与可选轻量输入提示。

## Impact

- **代码**：`src/camera.ts`（主）、`src/main.ts`（装配）、可选 `src/i18n.ts` / README 操作说明；必要时微调 `gizmo.ts` 事件优先级。
- **规格**：新增 `camera-controls`。
- **兼容性**：默认仍从场景盒体派生初始视角；无 scenario schema 变化。
- **默认手感**：打开场景后仍可拖拽环绕 + 滚轮缩放；新增键盘平移为增量能力。
- **回退**：恢复固定 target 的纯轨道逻辑即可。
