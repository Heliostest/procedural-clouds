## Context

现状 `createOrbitCamera`：

- 球坐标 `(theta, phi, dist)` 绕固定 `target`（约云盒高度 0.42）环绕；
- 指针拖拽改 `targetTheta/Phi`，滚轮改 `targetDist`；
- 每帧 `0.12` 指数平滑；
- `setSceneBounds` 按盒体对角线派生 min/max 距离与 near/far。

缺口：无法平移 look-at 目标，无法在水平面上巡视或升降视高。城建类（天际线 2）核心手感是「移动观察点 + 环绕 + 缩放」，不是第一人称飞行。

约束：

- gizmo 与相机共用 canvas 指针；
- 相机必须继续用 wall-clock（`simulationRate=0` 时仍可操作）；
- GPU 仍只消费 `CameraFrame { invViewProj, viewProj, eye }`。

## Goals / Non-Goals

### Goals

- WASD/方向键：沿相机前向在 XZ 平移 target。
- Q/E：升降 target.y。
- 拖拽环绕、滚轮缩放保留，并带惯性。
- 速度随 `camDist` 缩放；Shift 加速。
- target 限制在场景水平范围与合理高度带内。
- gizmo 拖拽优先于相机环绕。

### Non-Goals

- Pointer Lock / 自由飞行 / 边缘滚动 / 手柄。
- 相机状态序列化进 scenario。
- 改 GPU camera buffer 布局。

## Decisions

### 1. 保留 look-at 球坐标模型

继续用 `target + (theta, phi, dist)` 生成 `eye`，不改为自由相机。平移只改 `target`，环绕只改角度，缩放只改距离。这样与现有 `mat4LookAt` / `CameraFrame` 兼容，改动面最小。

### 2. 输入映射（天际线 2 近似）

| 输入 | 行为 |
|---|---|
| W / ↑ | target 沿相机水平前向前进 |
| S / ↓ | 后退 |
| A / ← | 左移（水平右向的反方向） |
| D / → | 右移 |
| Q | target.y 下降 |
| E | target.y 上升 |
| Shift（按住） | 平移/升降速度 × 加速倍率 |
| 指针拖拽 | 环绕（改 theta/phi） |
| 滚轮 | 缩放 dist |

前向/右向由当前 `camTheta` 在 XZ 投影得到，不随 `phi` 倾斜，避免俯视时前后键变成「钻地」。

### 3. 速度与平滑

- 基础平移速度 = `k * camDist`（世界单位 / 秒），`k` 取常数（实现时标定，约 `0.8–1.2`）。
- 升降速度可用略小的系数，避免过快穿出云层。
- Shift 倍率固定（如 `2.5`），不暴露 GUI。
- 角度与距离继续用现有 `0.12` 平滑；target 平移可用更高跟随（如 `0.2–0.35`）或直接积分后轻平滑，避免拖泥带水。
- 所有相机积分用 wall `deltaSeconds`，忽略 `simulationRate`。

### 4. 边界

`setSceneBounds(boxHalfExtent, cloudHeight)` 继续是边界事实来源：

- `target.x/z` clamp 到约 `±boxHalfExtent * margin`（margin ≥ 1，允许略出盒外观察）；
- `target.y` clamp 到 `[yMin, yMax]`，例如 `[0, cloudHeight * 1.2]`；
- `dist` 仍用现有 min/max；near/far 仍由半径派生。

盒体变化时：若签名变化，更新边界与 near/far；非首次不强制重置用户已平移的 target，仅 clamp。

### 5. 与 gizmo 的指针优先级

相机 `pointerdown` 不得在 gizmo 已开始拖拽时启动环绕。实现二选一（优先 A）：

- **A**：相机监听改为检查「本帧/本次 pointer 是否被 gizmo 占用」的共享标志，或仅在 `button===0` 且 `!params.gizmoMode` 命中手柄时环绕——更稳妥是 gizmo 在命中时 `stopImmediatePropagation` / capture 阶段先处理并设 `cameraOrbitSuppressed`。
- **B**：无 gizmo 模式时相机照常；有 gizmo 模式时仅当未命中手柄才环绕（需 gizmo 暴露 `hitTest` 或回调）。

选定：**B 的变体**——`createOrbitCamera` 接受可选 `shouldOrbit(e): boolean`；`main` 注入「gizmo 未在拖且（无模式或未命中）」逻辑。最小侵入，避免相机依赖 `params`。

滚轮：gizmo 不使用滚轮，相机继续接收；若焦点在 lil-gui 输入框则浏览器默认行为优先（现有 canvas 监听已足够）。

### 6. 键盘焦点

仅在 canvas 聚焦或文档未聚焦到可编辑控件时响应 WASD。`pointerdown` 在 canvas 上时 `canvas.focus({ preventScroll: true })`（canvas 需 `tabIndex=0`）。避免在 GUI 文本框打字时误平移。

### 7. API 形状

```ts
export interface OrbitCamera {
  setSceneBounds(boxHalfExtentWorld: number, cloudHeightWorld: number): void;
  update(deltaSeconds: number): void; // 由无参改为吃 wall delta
  computeFrame(aspect: number): CameraFrame;
}
```

`main` 已有 wall delta，传入即可。工厂可接受 `OrbitCameraOptions { shouldOrbit?: (e: PointerEvent) => boolean }`。

对外仍可叫 OrbitCamera；文档称「城建/天际线风格相机」。

## Risks / Trade-offs

- 键盘与 GUI 焦点冲突 → 可编辑控件聚焦时忽略按键。
- 平移过快/过慢 → 用距离比例速度 + 一次手感标定；不先做 GUI 滑块。
- gizmo/相机抢指针 → `shouldOrbit` 注入，验收矩阵覆盖。
- 用户期望边缘滚动 → 明确 Non-Goal；后续可另开 change。

## Migration Plan

- 无数据迁移。打开页面初始视角仍由 `setSceneBounds` 首次设置。
- 回退：恢复固定 target + 无键盘 + `update()` 无参。

## Open Questions

- 是否需要中键/右键拖拽平移（天际线常用）？本提案默认 **第一版不做**，仅 WASD；若验收时手感不足，可在实现阶段追加「中键拖拽平移 target」而不改规格能力边界。
- 加速键用 Shift 还是 Ctrl？默认 **Shift**。
