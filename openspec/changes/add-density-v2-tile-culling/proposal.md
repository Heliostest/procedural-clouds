# Change: 为 Density Engine V2 增加保守 Tile-Body 剔除

## Why

W3 已建立独立、输出兼容但始终写零的 Recipe V2 Producer。下一步不能立刻把十属形态和噪声塞进每体素热区；应先把未来 evaluator 的候选集合从“每个体素尝试全部 `MAX_BODIES=12`”缩小为“每个 workgroup tile 只尝试可能相交的云体”。

默认 `96³`、`8×8×4` 下有 `12×12×24=3,456` 个 dispatch tile。CPU 为每次实际 cache update 做至多 `3,456×12=41,472` 次廉价包围盒相交，即可建立 12-bit tile-body mask；这比未来在 884,736 个体素中盲试所有云体更适合作为 W5/W6 前的空间地基。

W4 仍没有任何云属密度 evaluator，因此不能声称实际形态加速。它只建立保守 Support、active-body 前缀、mask 生命周期和可审计的候选上限；V2 Cached/Hybrid 继续显示 W3 空场景。

## What Changes

- 将 V2 Body packing 改为稳定的 active-prefix：所有可参与密度计算的云体按源顺序紧凑写入 `[0, activeBodyCount)`，无效或禁用云体不占用循环前缀。
- 为十属 Recipe 的 `support0` 固化“最大横向扩张、最大羽化扩张、下/上垂直扩张”语义；Support 是保守上界，不是形态公式。
- 基于实际 cache resolution 和 workgroup 网格，在 CPU 生成每 tile 一个 `u32` 的 12-bit body mask；bit 只允许引用 active-prefix。
- Support AABB 包含作者 placement、完整三轴旋转、累计风平流、feather、当前声明的 Cb 砧顶与 attachment 最大扩张，并以半体素和有限 epsilon 向外保守扩张。
- V2 compute 读取 mask，在进入未来 body/evaluator 区域前排除空 tile；但仍 full-grid dispatch，并为每个有效体素执行一次最终零值 `textureStore`，避免 ping-pong 目标残留旧密度。
- 对极端 resolution/workgroup 或设备 buffer limit 设置 mask 预算；超限时退化为无 mask 的 active-prefix 路径，不创建巨型 buffer、不改变输出。
- 增加 tile grid、mask bytes、empty/occupied tile、候选 body 总数、平均/最大候选、dense/masked voxel-body 上限、重建原因/耗时和 fallback reason 统计。
- 增加确定性几何 fixtures 和 source-closure 检查，证明 mask 无假阴性、mask on/off 输出语义一致，且未引入 W5 atlas、W6 evaluator、atomics、compaction 或 indirect dispatch。

## Non-Goals

- 不启用任何十属 Recipe，不生成非零密度、云属 metadata 或视觉形态。
- 不采样 weather、macro field、Base/Detail atlas 或任何 noise。
- 不实现 W6 的 body evaluator、vertical profile、topology、detail、attachment 或 finalize 运算。
- 不减少 full-grid dispatch 和最终 storage write；W4 优化对象是未来候选/evaluator 工作，不是体素写入带宽。
- 不引入 GPU compaction、indirect dispatch、atomics、subgroups、workgroup storage 或 per-body texture。
- 不改变 Legacy、Realtime、RGBA16F output seam、Optical Profile、CloudBody/scenario schema 或默认质量模式。
- 不把 CPU 理论候选上限、FPS 或 W3 空 compute timing表述为实际形态加速。

## Capabilities

### Modified Capabilities

- `density-cache-production`：允许 V2 在仍为空密度的前提下增加保守 tile-body mask、full-grid 安全清零、预算退化和剔除统计。
- `density-recipe-schema`：定义 active-prefix packing 与 `support0` 保守包络语义。

### New Capabilities

- 无。W4 是 Density V2 Producer 与 Recipe schema 的内部扩展。

## Prerequisites and Conflicts

- 依赖已归档 W3 `2026-07-12-establish-density-recipe-v2-shell` 和提交 `338b61a`；W3 的固定 record、独立 pipeline、lazy promotion 与有效空密度语义是本 change 的输入事实。
- W0 未采集定量 GPU baseline，因此 W4 不设置毫秒加速门槛；候选数量与保守性是主要证据。
- `add-height-weather-shaping`、`add-height-ambient-tint` 和 `add-stratocumulus-cumulus-breakup` 不进入 V2 mask 数学。W4 只为未来 Cb/attachment 声明保守 Support 上界，不复制 Legacy 光学或 breakup 参数链。
- W4 不建立 W5/W6 change，也不提高任何 Recipe sample/Octave budget；所有 Recipe 继续 `enabled=0`。

## Impact

- **代码**：预计新增 V2 support/mask builder 与 fixtures；修改 `recipeV2Packing`、`recipeV2Recipes`、V2 WGSL/pipeline/Adapter、stats/HUD 和隔离检查。
- **GPU 资源**：V2 被请求后新增一个只读 mask storage buffer。默认配置约 13.5 KiB；默认 Legacy 仍为 0 字节、0 pass。
- **CPU**：只在实际 V2 cache update 且 mask signature 变化时重建；默认最多约 41,472 次 tile-body AABB 判断。超预算时明确退化，不做无界分配。
- **GPU**：正常 W4 V2 update 仍一次 full-grid compute dispatch、每有效体素一次零值 store；mask 只增加一次 tile mask read/branch，并为 W6 预留候选入口。
- **视觉**：Recipe V2 Cached/Hybrid 仍为空场景，Realtime/Legacy 不变。
- **规格**：修改 `density-cache-production` 与 `density-recipe-schema`。

