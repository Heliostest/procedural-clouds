# W7 Stratiform 形态修复与验证说明

## 1. 本次修复覆盖什么

本次修复针对 Recipe V2 的 Stratus、Cirrostratus、Altostratus 与 Nimbostratus：

- 降低 `bodyCoverageGain` 与 `macroCoverageBias` 的叠加偏置，避免低 Macro 值也把 coverage gate 顶满。
- 将 Base 调制改为完整峰值幅度：`1 + (base - 0.5) * 2 * amplitude + connectivityBias`。
- 提高 Macro/Base 在整个 Body 上的坐标跨度。旧 bank 的 Macro 横跨仅 `0.38–0.72` 个周期，固定场景可能整块落在同一个高值区；新 bank 至少横跨 `0.72–1.35` 个 Macro 周期与 `1.43–2.61` 个 Base 周期。
- 将顶部变化改为只向下削减：`top = clamp(1 + (macro.g - 1) * strength, 0.72, 1)`，避免正半区被 `clamp(..., 1)` 吞掉一半动态范围。
- 用 `vertical1=[profileStart, profileSpan,...]` 把 Cirrostratus 限制到 5 km placement Body 内部的 30% 薄层，而不是把整个 5 km 当成云层厚度。
- 分离 Body 自身 `densityScale` 与 lifecycle `densityScale` 的 packing，避免 lifecycle 密度被平方。
- 新增 debug view 10“密度积分”。它显示 raw density path integral，不读取属级吸收/光照；所有 debug view 自动关闭 TAA history。
- benchmark schema 升至 3，`density-debug` 改用 view 10，并将固定相机移到 Cirrostratus Body 外部。

采样预算没有改变：四个 Stratiform evaluator 仍然恰好只有一次 Macro 与一次 Base sample，没有 Detail、erosion、octave、warp 或 attachment。

## 2. 自动校准不变量

`npm run test:density-v2-evaluators` 会检查以下 probe。这里的 low/high 是固定的 shared-field 代表值，不是对截图的统计替代。

| Genus | low/high coverage gate | Base 调制跨度 | Macro/Base Body 坐标跨度 | profile span | 低 Macro 顶部起伏 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Stratus | `0.00 / 1.00` | `0.45` | `1.35 / 2.30` | `1.00` | 约 `225 m` |
| Cirrostratus | `0.67 / 1.00` | `0.10` | `0.72 / 1.43` | `0.30`（约 `1500 m`） | 约 `32 m` |
| Altostratus | `0.30 / 1.00` | `0.38` | `1.15 / 2.61` | `1.00` | 约 `442 m` |
| Nimbostratus | `0.86 / 1.00` | `0.34` | `0.95 / 1.95` | `1.00` | 约 `346 m` |

这组判据的含义是：St/As 必须有明显低值区，Ns 可以保持高连通但不能失去灰阶结构，Cs 保持连续薄幕但不能成为完全常数。

## 3. 先运行自动验证

在 `procedural-clouds` 根目录运行：

```powershell
npm run test:genus-dispatch
npm run test:pipeline-isolation
npm run test:density-v2-layout
npm run test:density-v2-tiles
npm run test:density-v2-fields
npm run test:density-v2-evaluators
npm run test:ground-shadow-hash
npm run typecheck
npm run build
openspec validate add-density-v2-stratiform-family --strict --no-interactive
```

其中必须确认：

- evaluator source 仍为 Stratiform=`Macro,Base`，Cumulus=`Macro,Base,Base,Detail`。
- enabled genera 恰为 `cumulus+stratus+altostratus+nimbostratus+cirrostratus`。
- packing fixture 中 Body density=`1.4`、lifecycle density=`0.5` 时，两者分别写入 `1.4` 与 `0.5`，不是预乘后再乘一次。
- manifest 使用 `density-debug=10`、camera eye=`[10.5,13.5,10.5]`，debug 不启用 TAA。

## 4. 固定视觉 A/B 的运行方式

启动：

```powershell
npm run dev -- --host 127.0.0.1
```

打开：

```text
http://127.0.0.1:5173/?benchmark=1
```

也可以用 URL 自动启动一个 case：

```text
http://127.0.0.1:5173/?benchmark=1&benchmarkCase=w7--single-stratus--recipe-v2--cached--density-debug
```

单属 case ID 规则：

```text
w7--single-{stratus|cirrostratus|altostratus|nimbostratus}--{legacy|recipe-v2}--{cached|hybrid}--{normal|density-debug}
```

家族 case：

```text
w7--w7-stratiform-stack--{legacy|recipe-v2}--{cached|hybrid}--{normal|density-debug}
w7--w7-stratiform-overlap--{legacy|recipe-v2}--{cached|hybrid}--{normal|density-debug}
```

每个 case 的操作顺序：

1. 等 HUD 显示 requested/active producer 与 case 一致；Recipe V2 必须为 `active=recipe-v2`、`lifecycle=ready`。
2. 等 `warmup 60/60`。若要给性能 Gate 下结论，还必须等 benchmark 完成规定的有效 cache timestamp；只有截图时不得把 timing 标成 pass。
3. 先保存一张带 HUD 的状态图；再点 `Clean capture (1s)`，在一秒内保存无 HUD 形态图。
4. Legacy 与 Recipe V2 必须使用相同 case，仅改变 producer；不得手动改变相机、Body、时间、风、分辨率、workgroup、quality 或光学参数。
5. normal 与 density-debug 必须分别保存。density-debug 的黑色是零密度，灰白是 raw density integral，不应出现天空色、太阳、halo 或前一 case 的 TAA 残影。

## 5. 改后应看到什么

| Genus | density-debug 必须出现 | normal 必须出现 | 直接判失败 |
| --- | --- | --- | --- |
| Stratus | 大尺度非矩形团块/孔隙、明显灰阶 Base 起伏、顶部至少有一体素量级变化 | 低空连续但有起伏的层云，不是直边白方板 | Body 投影内几乎全白且无灰阶；四边呈规则矩形 |
| Cirrostratus | 有限高度的连续低密度薄带，弱但非零的横向灰阶；不占满 5 km Body 高度 | 高空淡薄但明确可辨；比其他三属弱是允许的 | raw density 为空；或 raw density 占满整个 5 km 高度；用“低吸收”解释 raw debug 消失 |
| Altostratus | 多个宽缓 lobe、低值区与灰阶变化，Soft Layer 上下边界柔和 | 中层磨砂幕层，整体连通但不是无结构白甲板 | raw density 为均匀实心矩形/白板 |
| Nimbostratus | 高覆盖、高填充允许，但顶部轮廓与内部灰阶必须变化 | 厚重暗层；可比 As 更连续、更密，但不能是纯色平顶板 | raw density 完全常数、顶部完全水平；缺少 fractus/precipitation 不算本 Wave 失败 |

四属不要求逐像素复制 Legacy。验收的是同一 placement 下的家族语义、相对厚度、连通度和大尺度结构；Legacy 只作为视觉参照与回退锚点。

## 6. 如何定位仍然异常的阶段

| 观察 | 结论 |
| --- | --- |
| density-debug 已有孔隙/灰阶/顶部起伏，但 normal 仍是白板 | Density 已基本正确，继续查 Optical absorption、lighting、exposure 或 post；不要再提高 coverage/Base density |
| density-debug 结构正确，normal 中 Cs 很淡 | 先按 Optical 问题检查；Cs 的低 absorption 不会再影响 raw density debug |
| density-debug 本身是白色矩形 | 仍是 Recipe gate、field coordinate span、Base amplitude、profile 或 finalize 饱和问题 |
| density-debug 为空但 HUD 为 `recipe-v2 ready` | 查 profileStart/span、Body Support、packing、finalize multiplier 与 camera/body 相交，不要归咎 halo/absorption |
| debug 切换后出现上一 case 残影 | TAA/debug 隔离回归；当前实现应在任何 `debugView>0` 时关闭 TAA |
| 纹理随相机移动或固定贴在屏幕上 | shared-field/world-local 坐标错误，而不是 bank 数值问题 |
| lifecycle density 变化呈平方响应 | packing 回归；检查 `heightDensity.z` 与 `coverageLifecycle.y` 是否又发生预乘 |

## 7. Gate 记录模板

对每个 case 至少记录：

```text
caseId:
producer requested/active/lifecycle:
quality/view:
warmup/cache sample count:
normal screenshot:
density-debug screenshot:
raw density verdict: pass/fail
normal optical verdict: pass/fail
support/tile/metadata verdict: pass/fail
cache timing: pass/fail/unresolved/owner-waived
notes:
```

只有视觉、Support、finite RGBA、metadata、source budget、资源/pass 与 Legacy 回退都通过，且性能被正确分类后，W7 才能归档。视觉验证未完成时，roadmap 状态应保持“实现完成、视觉 Gate 待验收”。
