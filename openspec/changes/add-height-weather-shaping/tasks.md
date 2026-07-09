## 0. Approval gate

- [x] 0.1 用户批准 `proposal.md`、`design.md` 与 spec deltas
- [ ] 0.2 冻结固定相机/云体/时间/质量参数基线截图（正常 + 密度调试）

## 1. 参数与打包

- [x] 1.1 `params.ts`：新增 `densityShapeModel`（0=旧 / 1=高度–天气塑形），默认 1；同步 `Globals` 槽、`BODY_BASE`、`PARAM_OFFSETS`、`packParams`
- [x] 1.2 GUI + i18n：形态/全局 folder 增加模型开关（中英）
- [x] 1.3 `densityShapeModel=0` 时确认无需新字段即可复现旧路径

## 2. 着色器

- [x] 2.1 `genus/common.wgsl`：实现双尺度 weather × 高度门控 × `pow` 塑形；`h` 用实例 `profileLocal`
- [x] 2.2 两级 fbm 侵蚀 + `cloudShape≤0` / `den≤0` 早退；接入兼容链且不改 dispatcher
- [x] 2.3 属专属（cirrus 纤维 / Cb 塔 / Ac·Cc tile）在强度>0 时仍叠在兼容结果上；零强度行为不变
- [x] 2.4 确认 cached / hybrid / realtime 走同一塑形语义

## 3. 验收

- [ ] 3.1 `densityShapeModel=0` 与引入前截图视觉等价
- [ ] 3.2 `densityShapeModel=1`：上下缘更软、中层团块更明显；无 NaN/负密度/逃出足迹
- [ ] 3.3 Hybrid 打点：相对旧路径 cache ≤+10%、cloud pass ≤+5%（或空区因早退不劣）
- [x] 3.4 `npm run typecheck` 与既有 genus-dispatch 检查通过
- [x] 3.5 `openspec validate add-height-weather-shaping --strict --no-interactive`
