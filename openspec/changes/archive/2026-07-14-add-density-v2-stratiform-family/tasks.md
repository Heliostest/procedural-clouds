## 0. Approval and archived baseline

- [x] 0.1 用户批准本 proposal、design、三个 spec delta 与 W7 Gate
- [x] 0.2 记录 W6 归档提交 `5615a71`、benchmark 修正 `9a8d33a` 与 owner-waived 证据分类
- [x] 0.3 确认 W7 只迁移 St/Cs/As/Ns，不实现 Cellular、Fiber、Convective、fractus、precipitation、attachment 或 Recipe-aware Hybrid
- [x] 0.4 确认工作区无与 Stratiform family 重叠的用户修改，固定 `96³`、`8×8×4` 与 A/B manifests

## 1. Recipe banks and schema

- [x] 1.1 将 enabled 集合固定为 Cumulus、Stratus、Cirrostratus、Altostratus、Nimbostratus；其他五属 disabled
- [x] 1.2 为 Cs/As/Ns 增加有限具名 Recipe bank，保持 layout version 2、256-byte stride 与 reserved/attachment lanes 为零
- [x] 1.3 固定四个 Stratiform `sampleLimits=[2,0,0,0]`、`detailAttachmentCosts=[1,0,0,0]`
- [x] 1.4 固定 Thin Sheet=St/Cs、Soft Layer=As/Ns，并验证 Placement/Optical 参数不进入 Recipe
- [x] 1.5 扩展 packing/range/enabled-set/sample-budget fixtures

## 2. Parameterized Stratiform family kernel

- [x] 2.1 将 Stratus evaluator 泛化为单一 Stratiform family kernel，保持 W6 family/profile/ABI/预算回归并修正已确认饱和的 bank 数值
- [x] 2.2 增加解析 Soft Layer profile 与有限上下 fade；不增加 texture sample
- [x] 2.3 保持 rounded-sheet、local-height、profile 与 coverage early reject，所有 sample 位于 Support 检查之后
- [x] 2.4 确认 family source 恰好一次 Macro + 一次 Base，无 Detail/warp/octave/attachment
- [x] 2.5 增加 Thin Sheet/Soft Layer 边界、连续性、finite/nonnegative 与 Stratiform CPU mirror fixtures

## 3. Per-genus calibration

- [x] 3.1 Cirrostratus：极低幅/低频、近全覆盖 Thin Sheet；halo 完全留在 Optical
- [x] 3.2 Altostratus：低幅、水平相对垂直拉伸、平缓 Soft Layer；sun disc 留在 Optical
- [x] 3.3 Nimbostratus：高覆盖、高填充、厚 Soft Layer；暗底/吸收留在 Optical，fractus/precipitation 保持未实现
- [x] 3.4 增加四属高度/profile、coverage gate、Base 幅度、共享场坐标跨度与顶部起伏 fixtures

## 4. Dispatch, composition and cache integration

- [x] 4.1 dispatcher 以 enabled Recipe + topology family 路由 Stratiform/Cumulus，family dispatch 位于 shared sample 前
- [x] 4.2 保持 fixed active-prefix/tile bit loop、Legacy-compatible soft overlap 与每体素一次 final store
- [x] 4.3 更新 unsupported 集合为 Sc/Cb/Ac/Ci/Cc，unsupported-only 继续 valid zero cache
- [x] 4.4 保持 shared-field cadence、ping-pong/cache scheduling 与 normal-frame 单 cache pass
- [ ] 4.5 增加四属单体、family overlap、Cumulus+Stratiform overlap、mask on/off、wind/rotation/scene-edge fixtures；单独提交

## 5. Source closure and diagnostics

- [x] 5.1 静态检查 source 只有 Stratiform 与 Cumulus 两个 evaluator family，Stratiform/Cumulus sample 上限为 2/4
- [x] 5.2 更新 HUD enabled/unsupported genera、四属 sample limits、candidate upper bound 与 actual calls unavailable
- [x] 5.3 证明无新增 texture/buffer/pass、无 Legacy/4D/interpreter/atomic/workgroup/indirect source
- [x] 5.4 保持默认 Legacy 零 W7 GPU/CPU 资源开销与 Producer 回退

## 6. A/B harness and Gate report

- [x] 6.1 增加 St/Cs/As/Ns single、w7-stratiform-stack 与 w7-stratiform-overlap 固定 scenes/cases
- [x] 6.2 Legacy/V2 A/B 保持相同 camera/time/body/wind/resolution/workgroup/quality/render params
- [x] 6.3 benchmark 分离 pipeline/shared generation、steady cache、cloud/post timing 与资源字节
- [ ] 6.4 timestamp 可用时每 case 完成 5+ cache warmup、30+ cache samples；不可用或豁免时明确分类
- [ ] 6.5 输出机器可读 W7 Gate report，不把 FPS、CPU timing 或 owner-waived 标为性能 pass

## 7. Automated validation

- [x] 7.1 运行新增 Recipe/profile/family/dispatch/composition/source tests
- [x] 7.2 运行 `test:pipeline-isolation`、`test:density-v2-layout`、`test:density-v2-tiles`、`test:density-v2-fields`、`test:density-v2-evaluators`
- [x] 7.3 运行 `test:genus-dispatch`、`npm run typecheck` 与 `npm run build`
- [x] 7.4 运行 `openspec validate add-density-v2-stratiform-family --strict --no-interactive`
- [x] 7.5 静态确认 Cumulus/Stratus family/ABI/预算、Realtime/Optical 未改、其他五属 disabled

## 8. Manual WebGPU acceptance

执行步骤与判据见 `docs/w7-stratiform-fix-validation.md`；以下项目由外部视觉验证完成后勾选。

- [ ] 8.1 Stratus/Cirrostratus Legacy/V2：normal+density debug、Cached+Hybrid、single+multi；确认低层薄片与高空均匀薄幕可辨
- [ ] 8.2 Altostratus/Nimbostratus Legacy/V2：确认中层柔和幕层与厚重高填充层可辨
- [ ] 8.3 family stack/overlap：确认高度层次、G/B/A metadata、Optical Profile、cloud/ground shadow稳定
- [ ] 8.4 旋转、快速风、scene edge、mask on/off 与 atlas 周期下无缺块、Support leak、NaN/Inf、锁纹或断层
- [ ] 8.5 Sc/Cb/Ac/Ci/Cc 在 V2 明确为空，切回 Legacy 后十属与 Realtime 无回归

## 9. W7 Gate and handoff

- [x] 9.1 四个 Stratiform source/sample/Support/finite/metadata/资源静态 Gate 全部通过
- [ ] 9.2 timestamp 可用时 Cs/As/Ns V2 cache median≤1.00×Legacy、p90≤1.20×Legacy；否则记录 unresolved/owner-waived
- [ ] 9.3 四属厚度、连续性和相对形态可辨；Nimbostratus 缺少 fractus/precipitation 不作为 W7 主体失败
- [ ] 9.4 项目所有者批准 W7 Gate report；任何不可豁免的 source/Support/NaN/metadata/Legacy 回退失败必须 Stop/Review
- [ ] 9.5 只有 0–9.4 解决后才能归档并创建 W8 Cellular/Wave 提案
