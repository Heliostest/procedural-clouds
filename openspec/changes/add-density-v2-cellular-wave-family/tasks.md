## 0. Approval and archived baseline

- [x] 0.1 用户批准本 proposal、design、四个 spec delta 与 W8 Gate
- [x] 0.2 记录 W7 归档提交 `d1923b6`，并保留 W7 未采集手工矩阵/timestamp 项的原始分类
- [x] 0.3 确认 W8 只迁移 Sc/Ac/Cc，不实现 Fiber、Convective、Hybrid detail、完整变种、attachment 或 scenario schema
- [x] 0.4 确认工作区无与 Cellular family 重叠的用户修改，固定 `96³`、`8×8×4` 与 A/B manifests

## 1. Recipe banks and schema

- [x] 1.1 将 enabled 集合固定为 Cu/St/Sc/Ac/As/Ns/Cs/Cc；Cb/Ci 保持 disabled
- [x] 1.2 为 Sc/Ac/Cc 增加有限具名 Cellular Recipe bank，保持 layout version 2、256-byte stride 与 attachment/reserved lanes 为零
- [x] 1.3 固定三个 Cellular `sampleLimits=[3,0,0,0]`、`detailAttachmentCosts=[1,0,0,0]`
- [x] 1.4 固定三属 Cellular Layer profile、cell/connectivity/thickness/ripple 参数语义；Placement/Optical 不进入 Recipe
- [x] 1.5 扩展 packing/range/enabled-set/sample-budget/scale-order fixtures
- [x] 1.6 更新 shared-field sampling ABI 契约：W8 Cellular 只读 Macro/Base，Cb/Ci 与所有早退 Body 保持零采样

## 2. Parameterized Cellular family kernel

- [x] 2.1 新增单一 Cellular family kernel；不得复制 Sc/Ac/Cc evaluator
- [x] 2.2 增加解析 Cellular Layer profile、rounded footprint 与有限上下 fade
- [x] 2.3 保持 footprint/height/profile/coverage early reject，Base sample 位于所有廉价 gate 后
- [x] 2.4 固定 family source 恰好一次 Macro + 两次 Base，无 Detail/neighbor/octave/attachment
- [x] 2.5 增加 profile boundary、cell/connectivity response、finite/nonnegative 与 CPU mirror fixtures

## 3. Wave, Lens and Roll static hooks

- [x] 3.1 增加无 texture sample 的解析 Wave/Ripple hook，Cc 默认 ripple 强于 Sc/Ac
- [x] 3.2 增加 Lens/Roll 参数与静态分支锚点，但默认强度为零且不扩展 scenario schema
- [x] 3.3 零 wave/ripple/lens/roll 强度在相关解析计算前返回 unchanged domain/support
- [x] 3.4 证明 hook 不生成 Support 外密度、不增加资源/pass/sample budget

## 4. Per-genus calibration

- [x] 4.1 Stratocumulus：大 cell、高连接、高覆盖、厚 Cellular Layer
- [x] 4.2 Altocumulus：中 cell、中连接、中等层厚
- [x] 4.3 Cirrocumulus：小 cell、薄 profile、较强 ripple，避免棋盘和相机锁纹
- [x] 4.4 增加 `cellScale(Sc)>cellScale(Ac)>cellScale(Cc)`、profile span、connectivity 与 coverage probe fixtures

## 5. Dispatch, composition and cache integration

- [x] 5.1 dispatcher 以 enabled Recipe + topology family 路由 Stratiform/Cumulus/Cellular，分发位于 shared sample 前
- [x] 5.2 保持 fixed active-prefix/tile bit loop、Legacy-compatible soft overlap 与每体素一次 final store
- [x] 5.3 unsupported 集合更新为 Cb/Ci，unsupported-only 继续 valid zero cache
- [x] 5.4 保持 shared-field cadence、ping-pong/cache scheduling 与 normal-frame 单 cache pass
- [x] 5.5 增加 Cellular 内、Cellular+Stratiform、Cellular+Cumulus overlap 与 mask on/off fixtures

## 6. Source closure and diagnostics

- [x] 6.1 静态检查 source 只有 Stratiform/Cumulus/Cellular 三个 evaluator family，sample 上限为 2/4/3
- [x] 6.2 更新 HUD enabled/unsupported genera、Sc/Ac/Cc sample limits、wave strengths、candidate upper bound 与 actual calls unavailable
- [x] 6.3 证明无新增 texture/buffer/bind-group/pass、无 Legacy/4D/interpreter/atomic/workgroup/indirect source
- [x] 6.4 保持默认 Legacy 零 W8 GPU/CPU 资源开销与逐属 V2 回退
- [x] 6.5 证明 shared-field generator、格式、资源字节与 generation cadence 相对 W7 不变

## 7. A/B harness and Gate report

- [x] 7.1 增加 Sc/Ac/Cc single、w8-cellular-scale、w8-cellular-overlap 与 w8-wave-ripple 固定 scenes/cases
- [x] 7.2 Legacy/V2 A/B 保持相同 camera/time/body/wind/resolution/workgroup/quality/render params
- [x] 7.3 benchmark 分离 pipeline/shared generation、steady cache、cloud/post timing 与资源字节
- [x] 7.4 timestamp 可用时每 case 完成 5+ cache warmup、30+ cache samples；不可用或豁免时明确分类
- [x] 7.5 输出机器可读 W8 Gate report，不把 FPS、CPU timing 或 owner-waived 标为性能 pass

## 8. Automated validation

- [x] 8.1 运行新增 Recipe/profile/cellular/wave/dispatch/composition/source tests
- [x] 8.2 运行 `test:pipeline-isolation`、`test:density-v2-layout`、`test:density-v2-tiles`、`test:density-v2-fields`、`test:density-v2-evaluators`
- [x] 8.3 运行 `test:genus-dispatch`、`npm run typecheck` 与 `npm run build`
- [x] 8.4 运行 `openspec validate add-density-v2-cellular-wave-family --strict --no-interactive`
- [x] 8.5 静态确认 W7 五属、Realtime/Optical 未改，Cb/Ci disabled

## 9. Manual WebGPU acceptance

- [ ] 9.1 Sc/Ac/Cc Legacy/V2：normal+raw density-debug、Cached+Hybrid、single+multi；确认 cell 尺度、层厚和连接度可辨
- [ ] 9.2 w8-cellular-scale：确认 Sc 大块、Ac 中块、Cc 细粒的排序稳定
- [ ] 9.3 w8-cellular-overlap：确认 G/B/A metadata、Optical Profile、cloud/ground shadow稳定
- [ ] 9.4 旋转、快速风、scene edge、mask on/off 与 atlas 周期下无缺块、Support leak、NaN/Inf、棋盘、锁纹或断层
- [ ] 9.5 Cb/Ci 在 V2 明确为空，切回 Legacy 后十属与 Realtime 无回归

## 10. W8 Gate and handoff

- [ ] 10.1 三个 Cellular source/sample/Support/finite/metadata/资源 Gate 全部通过
- [ ] 10.2 timestamp 可用时 Sc/Ac/Cc V2 cache median≤1.00×Legacy、p90≤1.20×Legacy；否则记录 unresolved/owner-waived
- [ ] 10.3 三属 cell 尺度、层厚、连接度与 ripple 可辨，完整云种/变种缺失不作为 W8 主体失败
- [ ] 10.4 项目所有者批准 W8 Gate report；source/Support/NaN/metadata/W7-Legacy 回退、新资源/pass、超预算 sample、棋盘/相机锁纹或风不连续任一失败必须 Stop/Review
- [x] 10.5 2026-07-16 项目所有者批准 W9 作为本 Stop 的架构修复例外先行实施；W8 保持 active，只有同 revision 联合复验解决0–10.4后才能归档；Fiber迁移仍顺延为W10
