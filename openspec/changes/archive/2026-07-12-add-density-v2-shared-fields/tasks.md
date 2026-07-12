## 0. Approval and baseline gate

- [x] 0.1 用户批准本 proposal、design、`density-shared-fields` 与 `density-cache-production` delta（2026-07-12）
- [x] 0.2 记录 W4 归档基线 `a6940f6` 与验收修复 `43b3cca`，确认工作区无与 W5 shared-field 重叠的未提交修改
- [x] 0.3 确认 W5 不实现 W6 genus evaluator、非零 density、Recipe budget 提升、per-body 3D texture 或 Hybrid detail 路径
- [x] 0.4 固化默认 `64³ + 64³ + 256² RGBA8 = 2.25 MiB` 与 8 MiB 峰值硬预算

## 1. Shared-field contracts and format budget

- [x] 1.1 定义版本化 `DensitySharedFieldConfig`、固定 dimensions/seed/format 与有限校验
- [x] 1.2 定义 Base/Detail/Macro 通道语义、sampling ABI、read-only diagnostics 与 stats
- [x] 1.3 实现 `rgba8unorm`、`r16float`、`rgba16float` 字节/采样成本模型和 device format probe；产品默认只允许 RGBA8
- [x] 1.4 增加默认 2.25 MiB、RGBA16 4.25 MiB、单通道参考与 8 MiB 预算边界 fixtures

## 2. Bounded periodic GPU generators

- [x] 2.1 新增 Base/Detail atlas compute WGSL，使用周期 hash/lattice noise、固定 octave 与至多 27-neighbor Worley
- [x] 2.2 新增 Macro compute WGSL，生成 coverage/thickness/wave phase/cell layout 四通道低频场
- [x] 2.3 使用显式 storage layouts、合法受限 workgroup 与全尺寸 bounds checks；禁止 atomics、workgroup storage、无界循环和 per-body dispatch
- [x] 2.4 增加 source manifest/closure guard，验证固定 entry、循环界、周期取模与 forbidden symbols

## 3. Resource owner and lifecycle

- [x] 3.1 实现 V2 私有 `DensitySharedFields` owner：textures/views/sampler/pipelines/bind groups/generation/status
- [x] 3.2 实现惰性创建、signature、atlas/macro 独立 rebuild reason/count、峰值预算与失败清理
- [x] 3.3 保证普通 frame、Body movement、wind、mask revision 与 cache ping-pong 不触发 atlas/macro 再生成
- [x] 3.4 实现幂等 destroy、device-loss invalidation、pending warmup cancellation 与无半成品 diagnostics

## 4. V2 Adapter and promotion integration

- [x] 4.1 建立 V2 group 2 sampled ABI：filtering sampler、Base 3D、Detail 3D、Macro 2D
- [x] 4.2 将首次候选预热顺序接为 shared atlas pass → macro pass → W4 zero-cache pass → submit/promotion
- [x] 4.3 保持 cache entry 零 texture sample、零 evaluator、full-grid mask gate 与每有效体素一次零 store
- [x] 4.4 确认 Legacy 默认与 Realtime-only 请求为 0 shared texture/pipeline/pass/bytes，失败保持 Legacy active
- [x] 4.5 扩展 lifecycle/promotion fixtures，覆盖创建一次、普通帧不重建、config/seed 失效、失败回退与切回 V2

## 5. Sampling helpers and diagnostic views

- [x] 5.1 新增只读 shared sampling WGSL helper：归一化周期坐标、repeat/trilinear、seed offset、风平流与最多一次 low-frequency warp；W5 cache entry 不引用
- [x] 5.2 新增惰性 fullscreen debug pipeline，显示 Base/Detail Z slice、Macro RGBA channel、slice/phase 与 tile/seam overlays
- [x] 5.3 调试接口只暴露 sampled views/sampler/metadata，不修改或污染 `DensityCacheOutput`
- [x] 5.4 GUI/HUD 增加 V2-only debug mode、slice/channel/phase 控件；Legacy 或资源 unavailable 时有限回退
- [x] 5.5 增加平流跨周期、不同 seed/channel 去相关与 debug lifecycle fixtures

## 6. Diagnostics and format evidence

- [x] 6.1 Stats/HUD 报告 format、dimensions、estimated/peak bytes、generation、build count/reason、CPU create/build encode timing
- [x] 6.2 timestamp 可用时为首次 atlas/macro pass 分配不冲突 query range；不可用时 GPU timing 明确为 unavailable，不以 CPU 值替代
- [x] 6.3 受控比较 RGBA8、R16F、RGBA16F 的创建/采样兼容、内存、生成 timing、切片量化与 seam；不增加产品运行时格式开关（项目所有者接受浮点完整生成 timing/slice 未采集且不进入默认路径，2026-07-12）
- [x] 6.4 记录默认选用 RGBA8 的预算/兼容性证据与已知量化风险；不得声称 W6 稳态 evaluator 已加速

## 7. Automated validation

- [x] 7.1 新增并运行 shared config/budget/generator/sampling/lifecycle tests
- [x] 7.2 运行扩展后的 `test:pipeline-isolation`，确认 cache entry 零采样、generator/debug source 独立且无 Legacy closure
- [x] 7.3 运行 `test:density-v2-layout`、`test:density-v2-tiles` 与 `test:genus-dispatch`，确认 W3/W4 contracts 和 Legacy/Realtime 路由未回归
- [x] 7.4 运行 `npm run typecheck` 与 `npm run build`
- [x] 7.5 静态确认默认 Legacy 0 开销、V2 正常 RGBA 全零、无 per-body texture allocation 和无普通帧 atlas pass

## 8. Manual WebGPU acceptance

- [x] 8.1 检查 Base/Detail 多个 Z slice 与 Macro 四通道，确认信号非空、有限且无明显整块接缝
- [x] 8.2 慢速/快速移动 debug phase 跨越 repeat 边界，确认平流连续、无闪断和固定纹理锁定
- [x] 8.3 比较 RGBA8 与可用浮点诊断候选的量化、内存和 timing，记录截图/数值或明确无法采集项
- [x] 8.4 V2 Cached/Hybrid 正常视图继续为空；Legacy Cached/Hybrid、Realtime 与 W4 基线无回归
- [x] 8.5 确认首次 V2 之后普通帧 build count 不增长，资源总量不随 1–12 个 Body 增长

## 9. OpenSpec and handoff gate

- [x] 9.1 运行 `openspec validate add-density-v2-shared-fields --strict --no-interactive`
- [x] 9.2 W5 完成前不得创建或实施 W6 change，不得启用 Stratus/Cumulus Recipe
- [x] 9.3 只有 0–8 完成且项目所有者确认 debug 周期/接缝/量化与 Legacy 隔离后，才能归档并开始 W6 proposal

### W5 自动验证记录（2026-07-12）

- 新增 `test:density-v2-fields`，共享预算、周期生成、采样 ABI、生命周期、debug 隔离与 Recipe disabled 检查通过。
- `test:pipeline-isolation`、`test:density-v2-layout`、`test:density-v2-tiles`、`test:genus-dispatch`：全部通过。
- `npm.cmd run typecheck` 与 `npm.cmd run build`：通过，Vite 生产构建成功。
- `openspec validate add-density-v2-shared-fields --strict --no-interactive`：通过。
- 格式、量化、周期和 GUI 验收口径记录于 `docs/w5-shared-field-format-evidence.md`。

### W5 项目所有者验收（2026-07-12）

- 项目所有者确认 Base/Detail 的屏幕切片与二维 Macro debug 行为正常；旋转场景相机不改变 fullscreen slice 是预期设计，不要求增加 3D volume debug。
- 项目所有者批准归档 W5，并接受浮点候选完整 generation timing/slice 未采集为非阻塞项；默认 RGBA8 路径、2.25 MiB 资源预算和 capability probe 证据保留。
- 本验收只确认共享场资源、周期/平流、调试视图与 Legacy 隔离，不构成 W6 Stratus/Cumulus 非零 evaluator 的视觉或性能结论。
