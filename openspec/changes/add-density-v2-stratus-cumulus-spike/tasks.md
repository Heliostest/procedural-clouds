## 0. Approval and W5 baseline gate

- [x] 0.1 用户批准本 proposal、design、四个 spec delta 与 W6 继续/停止阈值
- [x] 0.2 记录 W5 归档基线 `cf1e98a` 和实现提交 `b3595e2`；确认工作区无与双属 evaluator 重叠的未提交修改
- [x] 0.3 确认 W6 只启用 Stratus/Cumulus，不实现其他八属、variants、attachments、Convective Column 或 Recipe-aware Hybrid
- [x] 0.4 固定 A/B manifest、`96³`、`8×8×4`、warmup/sample 规则与 timestamp-unresolved 行为

## 1. Recipe semantics and fixed budgets

- [x] 1.1 为现有 Recipe lanes 增加 Stratiform/Billow 具名语义、有限范围 descriptor；保持 layout version 2 和 256-byte stride
- [x] 1.2 将 `sampleLimits` 固定为 `[maxBaseSamples,maxDetailSamples,maxOctaves,maxAttachments]`
- [x] 1.3 只启用 Stratus=`[2,0,0,0]`、Cumulus=`[3,1,0,0]`；其他八属保持 disabled/全零预算
- [x] 1.4 固化 `detailAttachmentCosts=[macroCostClass,detailCostClass,attachmentCount,hybridDetailEnabled]` 与 W6 双属值
- [x] 1.5 扩展 layout/packing fixtures，证明参数范围、启用集合和静态 sample budget；单独提交

## 2. Common Density Context and Finalize

- [x] 2.1 新增 world→transported→inverse-quaternion body-local context，使用 Frame/Body V2 records，不依赖 Legacy Params/BodyGPU
- [x] 2.2 在任何 sample 前实现 recipe-enabled、candidate bit、finite extents、horizontal footprint、height/profile early reject
- [x] 2.3 实现 rounded-sheet/ellipse analytic fade、body coverage/density/lifecycle 和统一 nonnegative finalize
- [x] 2.4 增加旋转、风平流、feather、scene edge、invalid extent 与 Support containment CPU mirror fixtures；单独提交

## 3. Stratus evaluator

- [x] 3.1 实现 Thin Sheet vertical profile、低幅 thickness variation 与高 coverage support
- [x] 3.2 恰好使用一次 Macro + 一次 Base Atlas sample；无 Detail、warp、Worley loop、attachment
- [x] 3.3 调整初始参数使单体/多体是连续平坦薄层，不以提高 cache resolution 消除断层
- [x] 3.4 增加 sheet continuity、上下边界、coverage 极值、finite/nonnegative 与 sample-call source fixtures；单独提交

## 4. Cumulus evaluator

- [x] 4.1 实现解析 Flat-base Dome，底边平坦、顶部随水平半径下降
- [x] 4.2 实现 Macro + 两次 Base + 一次 Detail 的 Billow；第二 Base 可高度缩放，只允许一次 Base-A low warp
- [x] 4.3 实现有界 height-biased erosion，不引入 Convective/attachment/variant 分支
- [x] 4.4 增加 flat-base、dome monotonicity、顶部小胞、erosion 范围、finite/nonnegative 与四 sample 上限 fixtures；单独提交

## 5. Static dispatch, composition and cache integration

- [x] 5.1 用 fixed `i<activeBodyCount<=12` + tile candidate bits 遍历，genus/recipe dispatch 位于 shared samples 前
- [x] 5.2 实现 Legacy-compatible total/best/second soft overlap，写出 R/G/B/A；空或 unsupported 输入确定性写零
- [x] 5.3 替换 W5 empty entry 并保持 full-grid bounds、每有效体素一次 final store、现有 ping-pong/cache scheduling
- [x] 5.4 保持 group 2/shared-field cadence；普通 cache update 不重建 atlas/macro，不增加 texture/pass
- [x] 5.5 扩展 no-body、St-only、Cu-only、St+Cu overlap、unsupported-only、mask on/off 与 resize/workgroup fixtures；单独提交

## 6. A/B harness, diagnostics and timing

- [x] 6.1 增加固定 Stratus single/multi、Cumulus single/multi、St+Cu overlap manifests，复用当前 global Producer seam做同输入 A/B
- [x] 6.2 HUD 报告 enabled genera、静态 sample limits、candidate/voxel-body upper bound、actual evaluator calls unavailable 与 unsupported count
- [x] 6.3 benchmark 将 W5 generator、pipeline create CPU、steady cache median/p90、cloud pass 与资源字节分开
- [ ] 6.4 timestamp 可用时采集每 backend 5+ warmup、30+ cache samples；不可用/不足明确为 unresolved，不以 CPU/FPS替代
- [x] 6.5 输出机器可读 W6 Gate report，逐项给出 Stratus、Cumulus、overlap、Support、source closure 与性能 pass/fail/unresolved

## 7. Automated validation

- [x] 7.1 新增并运行双属 Recipe/context/math/composition/source tests
- [x] 7.2 运行扩展后的 `test:pipeline-isolation`，确认仅两个 evaluator、无 Legacy/4D/interpreter/atomics/per-body texture
- [x] 7.3 运行 `test:density-v2-layout`、`test:density-v2-tiles`、`test:density-v2-fields` 与 `test:genus-dispatch`
- [x] 7.4 运行 `npm run typecheck` 与 `npm run build`
- [x] 7.5 静态确认 Legacy 默认零 W6 开销、其他八属 Recipe disabled、normal frame 仍单 cache pass

## 8. Manual WebGPU acceptance

- [ ] 8.1 Stratus Legacy/V2：正常+density debug、Cached+Hybrid、single+multi；确认连续薄层与低幅结构
- [ ] 8.2 Cumulus Legacy/V2：正常+density debug、Cached+Hybrid、single+multi；确认平底、穹顶与 Billow
- [ ] 8.3 St+Cu overlap：确认密度有限、G/B 主次属、A 权重、Optical Profile、cloud/ground shadow稳定
- [ ] 8.4 旋转、快速风、scene edge、mask on/off、atlas 周期下无缺块、Support leak、NaN/Inf 或明显锁纹
- [ ] 8.5 其他八属在 V2 明确为空/unsupported；切回 Legacy 后十属与 Realtime 无回归

## 9. Proof-of-Architecture Gate and handoff

- [ ] 9.1 Stratus single/multi：V2 cache median≤0.80×Legacy，p90≤1.00×Legacy
- [ ] 9.2 Cumulus single/multi：V2 cache median≤1.10×Legacy，p90≤1.20×Legacy
- [ ] 9.3 两属形态、Support、metadata、资源和 source maintainability Gate 全部通过；任一 unresolved 不得记为 pass
- [x] 9.4 运行 `openspec validate add-density-v2-stratus-cumulus-spike --strict --no-interactive`
- [ ] 9.5 只有 0–9.4 完成、项目所有者批准 Gate report 后才能归档并创建 W7；失败则记录 Stop/Review，禁止继续八属迁移
