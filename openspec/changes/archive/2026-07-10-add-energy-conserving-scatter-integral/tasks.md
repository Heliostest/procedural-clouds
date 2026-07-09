## 1. 参数与开关
- [x] 1.1 `Globals` 增 `energyConservingScatter`（offset 56）+ pad 至 60；`PARAM_OFFSETS`/`CloudParams`/`createDefaultParams` 默认 `true`；`BODY_BASE` 56→60
- [x] 1.2 `packParams` / `renderer` 写入该字段
- [x] 1.3 GUI（光照 folder）开关 + `i18n` 中英

## 2. 着色器积分
- [x] 2.1 `fs`：`σ = d * extinction`，`step_trans = exp(-σ·baseStep)`，`w = T*(1-step_trans)`
- [x] 2.2 能量开：`sunPart` 不含 `(1-exp(-d))`，`color += w*litColor`；关：`sunPart` 含该因子
- [x] 2.3 银边/SSS：能量路径 `tGate=1`（不双重 `T`）；旧路径 `tGate=T`
- [x] 2.4 **选定**：Frostbite `w·L`（`σ_s≈σ`），不用对无 σ 的 L 再 `/σ`

## 3. 校准与验收
- [ ] 3.1 固定场景 A/B：开关开/关截图；默认 `sunIntensity` 已 17→10 作初校准，人眼再调
- [ ] 3.2 同场景将 `rayMarchSteps` 48↔32：开启时亮度/对比漂移明显小于关闭时
- [x] 3.3 `npm run typecheck` 与 `vite build` 通过
- [x] 3.4 `openspec validate add-energy-conserving-scatter-integral --strict --no-interactive` 通过
