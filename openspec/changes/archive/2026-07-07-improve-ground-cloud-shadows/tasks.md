## 0. 基线、冲突与审批门槛

- [x] 0.1 重新记录实际 `PARAM_OFFSETS`、`BODY_BASE`、WGSL `Globals` 与 active changes 的字段基线，确保不覆盖 `add-physical-wind-advection` 或 `per-preset-lighting`
- [x] 0.2 固定默认相机与场景，记录 legacy 18 步在 96³ Cached/Hybrid/Realtime、太阳高度 70°/10°、TAA 开/关下的截图、GPU 时间与 FPS
- [x] 0.3 增加仅调试可见的地面云影采样计数/GPU 计时基线，并确认关闭统计时不增加生产路径开销
- [x] 0.4 确认本 change 已获批准；未批准前不得开始以下实现任务

## 1. 阶段 1 — 自适应内联积分器

- [x] 1.1 在 `CloudParams`、命名 offset/pack、WGSL `Globals` 中增加 `groundShadowMode`、`groundShadowMaxSteps`、`groundShadowStepScale`、`groundShadowJitter`，按 vec4 对齐更新 `BODY_BASE`
- [x] 1.2 在 GUI/i18n 中增加 Legacy/Adaptive 模式和阶段 1 质量控制，默认先保持 Legacy 供 A/B
- [x] 1.3 将现有固定 18 步逻辑提取为 `integrateGroundShadow()`，返回透射率和采样数；Legacy 结果必须与提取前像素级一致
- [x] 1.4 实现按有效光路长度、质量模式与缓存体素尺度确定的有界动态分段；默认最大 32、静态上限 64，并保留高光学厚度提前结束
- [x] 1.5 实现分层内世界空间稳定抖动；TAA 关闭时不得逐帧闪烁，抖动为 0 时退化为确定性分层中点样本
- [x] 1.6 验证 Cached/Hybrid/Realtime 与 edge sharpening 均继续通过统一 `densityAt()`，不得新增旁路或修改云内自阴影
- [x] 1.7 暴露阶段 1 平均/最大采样数和 GPU 成本到现有性能面板或等价调试输出

## 2. 阶段 1 验收门

- [x] 2.1 对固定场景执行 Legacy/Adaptive 截图 A/B：默认 96³ 下规则条带/台阶明显减弱，无新增漏影、断层或阴影方向错误
- [x] 2.2 在默认物理风、暂停、变风、scenario scrub 下检查阴影连续，无固定世界空间闪烁
- [x] 2.3 验证 70° 与 10° 太阳高度、TAA 开/关、edge sharpening 开/关、Cached/Hybrid/Realtime 矩阵
- [x] 2.4 默认 Hybrid 下平均采样数不超过 32，云渲染 GPU 时间相对 Legacy 基线增量不超过 20%
- [x] 2.5 `npm.cmd run typecheck`、`npm.cmd run build` 与 `openspec validate improve-ground-cloud-shadows --strict --no-interactive` 通过
- [x] 2.6 记录阶段 1 验收结果并把默认模式切为 Adaptive；任一门槛失败时不得开始阶段 2

## 3. 阶段 2 前置门

- [x] 3.1 确认 `add-physical-wind-advection` 任务 5.6 已完成，或记录等价的默认风速、scrub、legacy、高速 cache 视觉验收证据
- [x] 3.2 重新记录物理风后的缓存 generation、per-body `WindAdvectionSample` 和场景时间不连续信号，确定云影历史硬失效/软降权输入
- [x] 3.3 确认阶段 1 的 `integrateGroundShadow()` 无需复制即可被新 compute entry point 调用

## 4. 阶段 2 — 世界空间透射率缓存

- [x] 4.1 在 `CloudParams`/GUI/i18n 中增加 Transmittance 模式、256/512/1024 分辨率、更新率、历史权重和过滤半径；初始保持 Adaptive 默认
- [x] 4.2 创建默认 512² `rgba16float` 当前/历史/过滤纹理、线性采样器、生命周期与 resize/dispose 逻辑
- [x] 4.3 增加地面云影 compute pipeline：每个 texel 映射到 scene-ground XZ，并调用阶段 1 的同一积分器写入透射率
- [x] 4.4 在 `groundColor()` 中采样有效透射率纹理；无效、关闭或越界时回退 Adaptive，守卫带内连续混合且无硬接缝
- [x] 4.5 实现默认每 2 帧更新与 generation/signature；太阳、尺度、质量模式、缓存代次、edge、云体拓扑、时间跳转变化时立即刷新或清历史
- [x] 4.6 接入每体平流位移阈值：任一云体移动超过半个云影 texel 时刷新/降权，不得把多风速云体简化为单一 UV 平移
- [x] 4.7 实现独立双缓冲历史，默认权重 0.8；硬失效权重为 0，连续运动按变化量降低权重
- [x] 4.8 实现可旁路、半径不超过 2 texel 的 separable tent 柔化；默认半径 1，不改变 `shadowDarkness` 语义
- [x] 4.9 增加云影 compute/过滤 GPU 时间、更新状态、history reset 原因与纹理分辨率调试统计

## 5. 阶段 2 验收与最终默认

- [x] 5.1 对 Adaptive/Transmittance 执行与阶段 1 相同的静态截图矩阵；规则块感进一步减弱且宏观阴影轮廓未被过度糊化
- [x] 5.2 默认风、不同云体风速、暂停、变风、重置平流、scenario 前后 scrub 下无超过 2 个云影更新周期的可见拖尾
- [x] 5.3 太阳高度 70°/10°、scene box 边界与盒外守卫带无硬裁切、亮边或模式切换接缝
- [x] 5.4 在 1920×1080 默认 Hybrid 下，摊销云影 compute+过滤成本低于阶段 1 Adaptive 内联成本，并在阶段 1 可达 60 FPS 的参考设备上保持 60 FPS
- [x] 5.5 验证改变画布到 1280×720、2560×1440 时云影 compute 成本不随画布像素数线性增长
- [x] 5.6 验证 Legacy/Adaptive 模式完全旁路透射率 compute/过滤 pass，资源无效时自动回退且无 WebGPU validation error
- [x] 5.7 `npm.cmd run typecheck`、`npm.cmd run build` 与 `openspec validate improve-ground-cloud-shadows --strict --no-interactive` 通过
- [x] 5.8 记录阶段 2 验收结果；全部通过后将默认模式切为 Transmittance，否则保持 Adaptive 默认

## 6. 文档与归档

- [x] 6.1 更新 `docs/glossary.md`、`README.md` 与相关 roadmap：区分密度缓存、自适应云影积分和二维透射率缓存
- [x] 6.2 记录默认参数、参考设备、截图矩阵、GPU 基线和两阶段门槛结果
- [x] 6.3 所有任务完成后执行 `openspec archive improve-ground-cloud-shadows --yes` 并严格校验归档结果
