# Change: 有界渲染期云细节（W12）

## Why

默认 Hybrid 以粗密度缓存、默认关闭的渲染期 detail 与千米级固定步长成像，外轮廓呈颗粒和体素化。W10/W11 只改变采样调度与时域复用，未提高密度场空间分辨率或增加渲染期细节。W12 用有界 carve 改善已存在 support 的轮廓和内部结构。

W11 Gate 当前为 `REVIEW (pending owner)`；本 change 将其 disposition 记录为 **owner-waived Continue**，对齐 W10A/W10B。当前工作区已有未提交 W11 `src`/`shaders` 改动的事实由 W12 worktree baseline 单独保留，不视作本 change 的失败或提交对象。

## What Changes

- 发布只读 `DensityDetailResources` 与固定 dummy-bound Hybrid detail slots；Legacy 或 atlas unavailable 时只关闭 detail，不使用解析 noise fallback。
- 以唯一 dilate-then-erode `remapClamped` stage 替换三处 Hybrid 乘法 detail；Cached/Realtime 维持既有 `applyEdgeShaping()`。
- 定义 `supportDensity`、`roughDensity`、`finalDensity`：main ray 用 final，light march 与 ground shadow 用 rough；generation 变化使 TAAU history 整屏失效。
- 固定 owner 决定：O1 carve、O2 rough light、O3 world step 默认开启、O4 gain dilation + pure subtractive erosion、O5 Billow-first。
- 固定五项默认：`worldStepEnabled=true`、`worldStepMinMeters=120`、`worldStepMaxIterations=512`、`detailStrength=1`、`detailFreq=1`；重采 W12 Gate 基线。
- 加入 Billow 完整预算、Stratiform/Cellular 极弱预算、Fiber/Convective 幅度零、米制风相位、Nyquist/距离衰减、debug 18/19、机器检查与 Gate。
- 不实现 W13 BSM、W15 Fiber 专属细节、W16 Convective 专属细节；不提高缓存分辨率、不新建第三套纹理、不修改太阳默认值。

## Capabilities

### New Capabilities

- `cloud-detail`：只读 detail 资源、有界 Hybrid carve、family budget、坐标与 Nyquist、回退及 Gate。

### Modified Capabilities

- `cloud-rendering`：Hybrid detail contract、rough/final consumer、generation invalidation、非破坏 debug 与 Gate。
- `cloud-params`：既有全局 `detailStrength`/`detailFreq` 的 erosion/wavelength 语义与五项默认切换。

## Prerequisites and Conflicts

- 依赖 W5 Shared Fields、W10B world-step/STBN 与 W11 cloud-only/TAAU；W11 以 owner-waived Continue 继续。
- 不改 W9 support、brick、gutter、overflow 或 allocation 语义；hierarchical 路径只将其 support 输出送入同一 stage。
- 不改 `cloud-frame-output`、`cloud-stochastic-sampling`、W13/W15/W16 的范围或要求。

## Impact

- Affected specs: `cloud-rendering`、`cloud-params`、`cloud-detail`。
- Planned code: detail consumer contract、renderer bindings/invalidation、唯一 WGSL stage、两份 Hybrid adapter、参数/GUI/debug、检查脚本与 W12 evidence。
- Detail-off 的真回退是 world-step on 的 120/512 新基线；world-step off 仅保留为旧 W11 的解释性对照。
