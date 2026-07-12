# Change: 用 Stratus 与 Cumulus 验证 Density Engine V2 架构

## Why

W5 已经建立共享 Base/Detail Atlas、二维 Macro Field、保守 tile-body mask 和独立 V2 Producer，但正常 V2 缓存仍为全零。现在需要用两个成本与拓扑相反的云属验证这套架构是否真的成立，而不是直接把剩余八属迁入一个未经证明的新共享链。

CSV 与形态讨论给出了清晰的对照：Stratus 是贴地、薄、近连续、低幅 Perlin 的 Stratiform Field，不应支付团块 Worley 链；Cumulus 是离散、平底、穹顶隆起的 Billow，需要 Perlin-Worley 主体和有界高频侵蚀。若同一个固定 Recipe schema、共享 atlas ABI、tile mask 与 RGBA 缓存 seam 能以不同静态 evaluator 表达这两者，才有依据继续 W7–W10；若失败，应停在 W6 重审，而不是因迁移投入继续扩张。

## What Changes

- 将 W5 空 compute 替换为仅包含 Common Density Context、Stratus evaluator、Cumulus evaluator、静态双属 dispatcher、top-two metadata composition 与 final writer 的 W6 source closure。
- 只启用 `stratus` 与 `cumulus` 两条 Recipe；其他八属在 Recipe V2 中继续 disabled、零 sample budget、零密度。Legacy 对十属仍完整可用。
- Stratus 使用 rounded-sheet footprint、Thin Sheet profile、一次 Macro sample 与一次 Base Atlas sample；不使用 Detail Atlas、Worley 循环、domain warp、attachment 或 Hybrid detail。
- Cumulus 使用 elliptical footprint、Flat-base Dome profile、一次 Macro sample、两次 Base Atlas sample 与一次 Detail Atlas sample；只允许一次由已采样 Base-A 驱动的低频坐标 warp。
- 在 atlas sample 前执行 tile mask、recipe-enabled、body-local Support、horizontal footprint 与 vertical profile 早退；disabled/不相交 Body 不得读取 shared textures。
- 多体合成保持 Legacy 的 dominant/secondary genus 与 soft overlap 语义：R 为软饱和总密度，G/B 为贡献最大的两个 genus ID，A 为次属权重。
- 固化 W6 参数 bank 语义、采样上限、有限范围与 fixtures；不改变 64/128/256-byte record stride，不引入 operator interpreter。
- 增加 W6 HUD 与 benchmark 证据：两属各自 sample budget、candidate upper bound、shared-field build 与资源、cache timestamp、pipeline create/source size，以及固定单体/多体/重叠 A/B manifest。
- 建立明确继续/停止 Gate：Stratus 必须显著降低 cache median，Cumulus 不得显著慢于 Legacy；两属还必须通过形态、Support、有限值、tile、周期与可维护性门槛。

## Non-Goals

- 不迁移 Altostratus、Cirrostratus、Nimbostratus、Stratocumulus、Altocumulus、Cirrocumulus、Cirrus 或 Cumulonimbus。
- 不实现 Stratus fractus、Cumulus humilis/mediocris/congestus/fractus 等云种/变种，不实现 Fractus、Convective Column、Anvil、Curl attachment 或 precipitation。
- 不实现 Recipe-aware Hybrid 微观细节；W6 Cached 与 Hybrid 都消费同一中尺度 V2 cache，现有统一 Hybrid detail 维持原状且不得生成新主体。
- 不支持同一缓存中按 Body 混合 Legacy 与 V2 backend；A/B 通过当前全局 Producer seam 对同一固定 genus scene 切换，其他八属场景继续选择 Legacy。
- 不增加 shared texture、per-body texture、mipmap、atomics、workgroup storage、compaction、indirect dispatch、subgroups 或 shader-f16 必需路径。
- 不追求与 Legacy 像素级相等。W6 验证的是形态类别、成本边界和架构可继续性，不是最终艺术校准。

## Capabilities

### New Capabilities

- `density-v2-evaluators`：定义 W6 公共上下文、Stratus/Cumulus 数学、静态调度、多体合成和继续/停止 Gate。

### Modified Capabilities

- `density-recipe-schema`：启用恰好两个 Recipe，固定参数 bank 与 sample/detail cost 语义。
- `density-shared-fields`：授权 W6 evaluator 在固定预算内调用共享 sampling ABI。
- `density-cache-production`：V2 从有效空缓存升级为双属非零 Producer，并更新 compute 成本和 evaluator 统计语义。

## Prerequisites and Conflicts

- 依赖已归档 W5 `2026-07-12-add-density-v2-shared-fields` 与归档提交 `cf1e98a`；W5 的 2.25 MiB shared fields、group 2 ABI、调试视图和生成 cadence 是输入事实。
- 依赖 W4 active-prefix、Support 与 tile mask。W6 evaluator 的所有非零密度必须位于现有 Stratus/Cumulus Support 内；扩大 Support 必须先更新 Recipe 与 no-false-negative fixtures。
- W0 没有严格采集完整基线，因此 W6 必须在同一浏览器/设备/manifest 会话中重新采集 Legacy 与 V2 配对样本；不得把旧截图、CPU timing 或 W5 空 shader timing作为 Gate 数据。
- `add-height-weather-shaping` 保持 Legacy 基线。W6 吸收高度、coverage 和 edge fade 的职责，但不调用该 change 的 Legacy shader closure或复制其同名参数链。
- `add-height-ambient-tint` 属于 Optical/Lighting，不进入 W6 Recipe。
- `add-stratocumulus-cumulus-breakup` 不进入 W6；Cumulus Spike 只验证基本 Billow，不建立第三套 breakup 参数。

## Impact

- **代码**：预计新增 V2 context/profile/stratiform/billow/dispatch WGSL、Recipe bank descriptors、数学 fixtures、双属 benchmark manifests 与统计；修改 V2 pipeline/Adapter、Recipe packer、HUD 和 isolation checks。
- **GPU 稳态**：仍为一次 full-grid cache compute dispatch和每有效体素一次 RGBA16F store；只在非空 tile 的 enabled Body 上执行有界 texture samples。Stratus 最多 2 次 shared sample/Body-evaluation，Cumulus 最多 4 次。
- **GPU 资源**：不新增常驻 texture；继续使用 W5 的 2.25 MiB shared fields、现有双 cache texture、Body/Recipe/mask buffers。Recipe record stride 与 cache format 不变。
- **视觉**：Recipe V2 Cached/Hybrid 首次显示 Stratus 与 Cumulus；其他八属在 V2 下保持空，但使用 Legacy 时不变。
- **性能证据**：W5 generator timing 与 W6 steady cache timing分开；只有 timestamp query 的配对 cache 样本可用于继续/停止 Gate。
- **规格**：新增 `density-v2-evaluators`，修改 `density-recipe-schema`、`density-shared-fields` 与 `density-cache-production`。
