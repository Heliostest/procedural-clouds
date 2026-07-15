# W8 Cellular / Wave 自动化视觉验收

OpenSpec change：`add-density-v2-cellular-wave-family`

当前状态：代码、静态检查、TypeScript 类型检查、production build 与 OpenSpec strict validation 已通过；WebGPU 视觉、运行时 metadata 与 GPU timestamp Gate 待独立自动化采集。视觉未完成前不得归档 W8。

## 固定入口与矩阵

在仓库根目录启动：

```powershell
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

重新验证修复后的工作树时必须强制覆盖旧截图：

```powershell
$env:W8_FORCE_CAPTURE='1'
node docs/evidence/w8-cellular-wave/capture-w8.mjs
Remove-Item Env:W8_FORCE_CAPTURE
```

采集文件会记录 Git revision、dirty 状态、tracked diff 与未跟踪源码内容的 SHA-256，以及 console error URL；散列会排除本目录下会被采集过程改写的结果、审阅和截图产物。不得复用与当前工作树不匹配的旧截图。

入口：

```text
http://127.0.0.1:5173/procedural-clouds/?benchmark=1
```

case ID：

```text
w8--{scene}--{legacy|recipe-v2}--{cached|hybrid}--{normal|density-debug}
```

固定 scene：

- 主体 Gate：`single-stratocumulus`、`single-altocumulus`、`single-cirrocumulus`、`w8-cellular-scale`、`w8-cellular-overlap`、`w8-wave-ripple`。
- unsupported 回退：`single-cumulonimbus`、`single-cirrus`。

共 64 个 case。每个 case 保存 `--hud.png` 与 `--clean.png` 两张截图，共 128 张。

## 自动化协议

1. 使用支持 WebGPU 的本机 Chrome，启动参数至少包含 `--enable-unsafe-webgpu`、`--ignore-gpu-blocklist`、`--disable-gpu-sandbox`。
2. 等待 `window.densityBenchmark` 与 `navigator.gpu` 可用。
3. 对每个 case 调用 `window.densityBenchmark.start(caseId)`，等待 `ready-for-screenshot`、`complete` 或 `invalid`。
4. Recipe V2 case 必须确认 requested/active 均为 `recipe-v2` 且 lifecycle ready；否则 case 失败，禁止截一张空图后继续当作成功。
5. 必须完成 `warmup 60/60`。timingRequired case 在 timestamp 可用时还必须达到 manifest 的 cache sample 数；当前 manifest 要求 60，严于提案的最低 30。
6. timestamp 不可用、样本不足或超时时，性能只能写 `unresolved`；FPS、CPU timing、早退截图均不能替代 GPU cache timing。
7. 先截带 HUD 图，再给 `body` 加 `density-benchmark-clean-capture` class，等待 150 ms 后截 clean 图，最后移除 class 并调用 `markScreenshot(caseId)`。
8. 不得手工修改相机、时间、Body、风、分辨率、workgroup、quality、Optical 或 exposure。Legacy/V2 必须使用同一 manifest case。
9. 收集页面 console error、uncaught exception、WebGPU validation error、HUD 的 NaN/fail/lifecycle 信息；出现任一项时保留证据并将 case 标为 fail/invalid。

## 视觉判据

| Scene | 必须观察到 | 直接失败 |
| --- | --- | --- |
| single-stratocumulus | 大 cell、高连接、较厚 Cellular layer；raw density 有胞状边界与孔隙 | 退化为均匀层状白板、离散积云穹顶或全空 |
| single-altocumulus | 中等 cell、中等连接与层厚；尺度明显小于 Sc、大于 Cc | 与 Sc/Cc 无法区分、棋盘周期或相机锁纹 |
| single-cirrocumulus | 小 cell、极薄 profile、连续但有限的 ripple | 低于缓存分辨率而消失、厚白板、明显棋盘/断层 |
| w8-cellular-scale | 同一视域内严格可辨 `Sc > Ac > Cc` 的 cell 尺度和 `Sc > Ac > Cc` 的层厚 | 排序反转或三者近似相同 |
| w8-cellular-overlap | Cellular 内部及与 Stratiform/Cumulus 重叠稳定；normal 与 density-debug 均无闪断 | metadata 跳变、黑洞、Support leak、NaN/Inf、shadow 断裂 |
| w8-wave-ripple | Cc ripple 随固定相位连续，三组不锁相为同一屏幕纹理 | 相机锁纹、明显 atlas 棋盘、跨周期断层、风相位跳变 |
| Cb/Ci Recipe V2 | normal 与 raw density 均为空，HUD 明确为 V2 ready | 产生任何 V2 主体密度或 producer fallback 被误当通过 |
| Cb/Ci Legacy | Legacy 仍可见，证明回退锚点未坏 | Legacy 也为空或出现新回归 |

normal 用来判断 Optical、云影和最终呈现；`density-debug` 是 raw density integral，黑色为零密度。不能用“光学太淡”解释 raw density 为空，也不能用 normal 看似有云掩盖 raw density 的白板/棋盘问题。

## 输出契约

在 `docs/evidence/w8-cellular-wave/` 输出：

- `capture-w8.mjs`：可重复执行、已有完整截图时可跳过的采集脚本；
- `screenshots/*.png`：128 张 HUD/clean 图；
- `results.raw.json`：每个 case 的状态、fingerprint、producer diagnostics、evaluator stats、shared-field stats、GPU timing、warnings 与截图路径；
- `gate-report.json`：机器可读分类，至少含 automated/runtime/visual/performance/rollback/ownerApproval；
- `report.md`：按 scene 汇总的视觉判断、失败证据和 Continue/Stop/Review 建议。
- `visual-review.json`：从 `visual-review.template.json` 复制，`evidenceGeneratedAt` 必须与本轮 `results.raw.json.generatedAt` 完全一致；仅对 Recipe V2 写 pass/fail/review，Legacy 保持 reference。

完成视觉判断后运行：

```powershell
node docs/evidence/w8-cellular-wave/build-gate.mjs
```

若 visual review 时间戳缺失或与本轮 evidence 不一致，Gate 必须保持 review；反复生成 Gate 不得覆盖 evidence 的 `generatedAt`。模板中的三个 `nonWaivableChecks` 也必须逐项填写，缺失或 unresolved 时不能 Continue。`actualEvaluatorCalls=null` 与字符串 `unavailable` 均表示无法获得真实调用数，不得误记为 unresolved 或伪造成数字。非 WebGPU console error 必须连同 URL 分类；明确来自 `/favicon.ico` 的 404 可单列为 benign，其余错误不能只凭一条裸 `404` 忽略。

性能只对 Sc/Ac/Cc 的 Legacy/V2 `cached + normal` 成对计算：V2 cache median 目标 `<=1.00x Legacy`，p90 目标 `<=1.20x Legacy`。timestamp 不可用或任一侧有效样本不足时写 `unresolved`，不得写 pass。

最终只有 64 个 case 全部完成、不可豁免视觉/协议项通过且项目所有者批准，才可把 `gate-report.json` 的 decision 改为 `continue`。采集代理不得归档 OpenSpec、不得 commit/push、不得擅自调 Recipe 参数掩盖失败。
