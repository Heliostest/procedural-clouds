## 0. Approval and baseline gate

- [ ] 0.1 用户批准本 proposal、design、`density-cache-production` 与 `density-recipe-schema` delta
- [ ] 0.2 记录 W3 归档基线 `338b61a`，确认 V2 Cached/Hybrid 空场景、Realtime 有内容，且工作区无与 W4 support/mask 重叠的未提交修改
- [ ] 0.3 确认 W4 不实现 W5 atlas/macro field、W6 evaluator、非零密度、atomics、compaction 或 indirect dispatch
- [ ] 0.4 确认 W0 无定量 GPU baseline；W4 只报告候选上限与资源成本，不声明 steady-state 加速

## 1. Layout v2 and active-prefix contract

- [ ] 1.1 将 V2 layout version 提升为 2，定义 Frame flags 与 mask binding descriptor；保持 64/128/256-byte record stride；单独提交
- [ ] 1.2 将 Body packer 改为稳定 active-prefix，compact slot 保留源相对顺序，尾部 record 全零
- [ ] 1.3 明确 invalid genus、非有限 geometry、零 coverage/density/lifecycle Body 的排除规则，并保留 CPU-only source index 诊断
- [ ] 1.4 扩展 layout/packing fixtures，证明 activeBodyCount 等于有效前缀长度且 mask bit 不引用前缀外 slot；单独提交

## 2. Conservative Support schema and geometry

- [ ] 2.1 固化 `support0=[maxHorizontalScale,maxFeatherScale,maxLowerExtensionFraction,maxUpperExtensionFraction]`、有限范围与版本
- [ ] 2.2 为十属 disabled Recipe 填写保守 Support；sample/Octave/attachment evaluator budgets 继续为零
- [ ] 2.3 实现 Euler→rotation representation、局部 OBB 扩张、风运输和旋转 OBB→世界 AABB；包含半体素+epsilon
- [ ] 2.4 增加 Cb 最大已声明砧顶、disabled attachment、三轴旋转、快速风位移和 scene-edge fixtures；单独提交

## 3. Tile-mask builder and bounded fallback

- [ ] 3.1 按实际 dispatch grid 建立 linear tile index 与每 tile `u32` 12-bit mask
- [ ] 3.2 实现闭区间 tile/support AABB 相交、edge tile 有效 voxel 范围和 no-false-negative voxel sweep verifier
- [ ] 3.3 实现 `262,144 tiles / 1 MiB / 3,145,728 tests` 与 device buffer limits gate；超限返回 dense fallback + reason
- [ ] 3.4 实现 signature、capacity reuse、mask generation/revision、rebuild reason/count/CPU timing；无 cache update 帧不得重建
- [ ] 3.5 增加 no-body、single/multi-body、invalid slot、非整除 grid、预算边界与 `256³ + 1×1×1` fixtures；单独提交

## 4. Explicit pipeline and Adapter integration

- [ ] 4.1 在 V2 group 0 增加 read-only mask storage binding、minBindingSize 和显式 pipeline layout 校验
- [ ] 4.2 修改空 WGSL：用 workgroup ID 读取 mask，在未来 evaluator 区域前 gate；保持 full-grid bounds check 与每有效体素一次最终零 store
- [ ] 4.3 接入 Adapter mask buffer 创建/上传、dummy fallback、resolution/workgroup rebuild、device loss 与幂等 destroy
- [ ] 4.4 默认 Legacy 未请求 V2 时确认 mask builder/buffer/module/pass 全为零；V2 promotion 仍要求有效空 output
- [ ] 4.5 扩展 source-closure guard，禁止 W5/W6 symbols、texture sample、atomics、workgroup storage、compaction、indirect dispatch 和额外正常帧 pass；单独提交

## 5. Diagnostics and cost accounting

- [ ] 5.1 扩展 stats：grid、tile/mask bytes、empty/occupied、candidate sum/avg/max、dense/masked tile-body 与 voxel-body upper bound
- [ ] 5.2 增加 culled ratio、mask generation/revision、rebuild CPU timing/count/reason、enabled/fallback status
- [ ] 5.3 HUD 明确显示 `W4 tile-mask` 或 dense fallback；`evaluatorCalls=0`，不得把 candidate upper bound 标为 GPU invocation
- [ ] 5.4 默认 `96³/8×8×4` fixture 确认 3,456 tiles、13.5 KiB 与最多 41,472 CPU broad-phase tests

## 6. Automated validation

- [ ] 6.1 运行扩展后的 `npm run test:density-v2-layout` 与新增 `npm run test:density-v2-tiles`
- [ ] 6.2 运行扩展后的 `npm run test:pipeline-isolation`，确认 full-grid zero-store 和禁止依赖
- [ ] 6.3 运行 `npm run test:genus-dispatch`，确认 Legacy 十属与 Realtime 路由未变
- [ ] 6.4 运行 `npm run typecheck` 与 `npm run build`
- [ ] 6.5 静态确认默认 Legacy 0 mask 开销，V2 mask on/dense fallback 均保持 RGBA 全零

## 7. Manual WebGPU acceptance

- [ ] 7.1 Legacy Cached/Hybrid 与 W3 基线无视觉差异；Realtime 仍有云内容
- [ ] 7.2 V2 Cached/Hybrid 继续保留天空/地面且云与云影为空；HUD 显示 mask enabled 和有限统计
- [ ] 7.3 快速移动、三轴旋转与风平流场景无 validation error、黑屏或资源悬空
- [ ] 7.4 改变 resolution/workgroup，确认 grid/mask 重建正确；超预算配置显示 dense fallback 且不分配巨型 buffer
- [ ] 7.5 记录默认 mask bytes、candidate reduction 与 rebuild CPU timing；不表述为形态质量或 steady-state GPU 加速证据

## 8. OpenSpec and handoff gate

- [ ] 8.1 运行 `openspec validate add-density-v2-tile-culling --strict --no-interactive`
- [ ] 8.2 W4 完成前不得创建或实施 W5/W6 change
- [ ] 8.3 只有 1–7 完成且项目所有者确认 W4 空输出与 mask 统计语义后，才能归档并开始 W5 proposal
