## 0. 基线与批准门

- [x] 0.1 记录当前 `camera.ts` 输入、平滑、`setSceneBounds` 与 `main`/`gizmo` 指针关系
- [x] 0.2 确认与 gizmo、simulation-time（相机用 wall clock）无冲突
- [x] 0.3 提案获批准；批准前不实施以下任务

## 1. 相机模型与边界

- [x] 1.1 扩展 `OrbitCamera`：可平移 `target`，保留 theta/phi/dist 球坐标与 `CameraFrame` 输出
- [x] 1.2 `update(deltaSeconds)` 用 wall delta 积分平移/平滑；忽略 `simulationRate`
- [x] 1.3 `setSceneBounds` 派生并更新 target 水平/高度 clamp、dist min/max、near/far；非首次不强制重置用户 target，仅 clamp
- [x] 1.4 平移速度随 `camDist` 缩放；Shift 加速；前向/右向取自水平化相机朝向

## 2. 输入

- [x] 2.1 WASD / 方向键平移 XZ；Q/E 升降 target.y
- [x] 2.2 保留拖拽环绕与滚轮缩放及现有角度/距离惯性
- [x] 2.3 canvas `tabIndex` + 聚焦策略；可编辑控件聚焦时不响应键盘
- [x] 2.4 注入 `shouldOrbit`（或等价）：gizmo 拖拽/命中手柄时抑制相机环绕

## 3. 装配与说明

- [x] 3.1 `main.ts` 传入 wall delta 与 gizmo 共存回调
- [x] 3.2 更新 README（及必要 i18n）操作说明：WASD/QE/Shift/拖拽/滚轮

## 4. 验证

- [x] 4.1 默认打开：拖拽环绕 + 滚轮缩放仍可用；初始 framing 合理
- [x] 4.2 WASD 沿视角水平移动；Q/E 升降；Shift 明显加速；松键即停
- [x] 4.3 target 不越出约定边界；盒体尺寸变化后 clamp/near/far 正确
- [x] 4.4 `simulationRate=0` 时相机仍可操作
- [x] 4.5 gizmo move/rotate/scale 拖拽不被相机抢走；未命中时可环绕
- [x] 4.6 GUI 输入框打字不触发平移
- [x] 4.7 `npm.cmd run typecheck`、`npm.cmd run build`、`openspec validate add-cities-skylines-camera --strict --no-interactive` 通过
