# W5 共享场格式与验收证据

本文记录 W5 已实现的共享 GPU 场资源、格式取舍和验收边界。它不是 W6 非零云密度的性能结论。

## 1. 默认资源

| 资源 | 尺寸 | 格式 | 字节 |
|---|---:|---|---:|
| Base Atlas | `64³` | `rgba8unorm` | 1,048,576 |
| Detail Atlas | `64³` | `rgba8unorm` | 1,048,576 |
| Macro Field | `256²` | `rgba8unorm` | 262,144 |
| 合计 | — | — | 2,359,296（2.25 MiB） |

资源只在首次请求 Cached/Hybrid Recipe V2 时创建。1–12 个云体共用同一套三张纹理；Body 数量、位置、风平流、tile-mask revision 和普通 cache update 都不会复制或重新生成图集。

## 2. 格式比较

Macro 始终保持 RGBA8；下表只改变两张 3D atlas 的候选格式。

| 候选 | 总 payload | 通道 | 归一化区间精度 | 采样/带宽结论 |
|---|---:|---:|---|---|
| `rgba8unorm` | 2.25 MiB | 4 | 步长 `1/255≈0.00392`，最大舍入误差约 `1/510` | 一次采样取得四路信号；W5 默认 |
| `r16float` | 1.25 MiB | 1 | 半精度浮点，区间内通常优于 RGBA8 | 若表达四路信号需要多纹理/多采样，违背固定采样预算；只作单通道参考 |
| `rgba16float` | 4.25 MiB | 4 | 半精度浮点，明显降低 8-bit 量化带 | 3D atlas 带宽和显存约为 RGBA8 的两倍；只作高精度参考 |

三种候选合计为 7.75 MiB，低于规范声明的 8 MiB 比较上限。但产品路径不会同时常驻这些候选：默认只创建 2.25 MiB RGBA8。运行时会用 1³ 临时纹理与显式 bind-group 校验探测每种格式是否可 storage-write、是否可 filtering-sample，随后立即销毁临时资源；HUD 的 `field formats` 行报告结果。

W5 不提供普通 GUI 格式切换，也不为浮点候选生成常驻 atlas。因此浮点候选的完整切片和 generation timestamp 在 W5 标记为未采集；若 W6 的非零 Stratus/Cumulus 显示 RGBA8 量化伪影，应由新的证据驱动 change 再比较完整浮点 atlas，而不是现在增加稳态资源与带宽。

## 3. 周期与时间连续性

- Generator 使用整数 hash；格点与 Worley cell 均以声明 period 显式取模。
- Base/Detail 使用 `repeat + linear` 的 3D sampler；Macro 使用同一 repeat-linear sampler。
- 时间变化只移动采样坐标。`Advection Phase` 不会重建纹理，HUD 中 atlas/macro build count 应保持为 1。
- Debug 画面把 UV 显示为 `2×2` 重复区，红线是整数周期边界。跨红线的灰度形态应连续；红线本身只是 overlay，不属于纹理内容。

## 4. GUI 验收步骤

1. 选择“渲染 → 密度缓存 → 密度产生器 → Recipe V2”，质量模式使用 Cached 或 Hybrid。
2. 等 HUD 显示 `active=recipe-v2`、`W5 shared-fields: ready`。
3. 在“调试 → 调试视图”依次选择 `W5 基础图集`、`W5 细节图集`、`W5 宏观场`。
4. 对 Atlas 调整“图集切片”；对三类视图依次检查 R/G/B/A 通道。
5. 缓慢和快速拖动“平流相位”，观察图案跨红色周期线时是否连续。
6. 返回正常视图，确认 V2 Cached/Hybrid 仍为空云场；再切回 Legacy，确认原有云与云影不变。
7. 观察 HUD：默认 bytes 应为 `2.25/8MiB`，resources 应为 3；改变相位、Body 数量或等待普通帧后，atlas/macro build count 不应继续增长。

## 5. 自动证据（2026-07-12）

- `npm.cmd run test:density-v2-fields`：共享预算、27-neighbor 上限、周期取模、group 2 ABI、惰性生命周期、debug 隔离和 Recipe disabled 检查通过。
- `npm.cmd run test:pipeline-isolation`：Legacy、Cached、Hybrid、Realtime 与 W5 generator/cache source closure 隔离通过。
- `npm.cmd run test:density-v2-layout`、`test:density-v2-tiles`、`test:genus-dispatch`：W3/W4 与十属路由回归通过。
- `npm.cmd run typecheck`、`npm.cmd run build`：通过。
- `openspec validate add-density-v2-shared-fields --strict --no-interactive`：通过。

自动检查不替代真实 WebGPU 设备上的切片与平流视觉验收，也不构成 W6 evaluator 的质量或稳态性能证据。
