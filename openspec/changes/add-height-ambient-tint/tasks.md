## 0. Approval gate

- [ ] 0.1 用户批准 `proposal.md`、`design.md` 与 spec deltas
- [ ] 0.2 冻结固定相机/云体/时间基线截图（`heightAmbientModel` 引入前）

## 1. 参数与打包

- [ ] 1.1 `params.ts`：新增 `heightAmbientModel`（0=旧常数环境 / 1=高度染色），默认 1；占用 `Globals` offset 58（现 `_pad11`），同步 `PARAM_OFFSETS`、`packParams`、WGSL 字段名；`BODY_BASE` 保持 60
- [ ] 1.2 GUI + i18n：光照 folder 增加模型开关（中英）
- [ ] 1.3 `heightAmbientModel=0` 时确认环境项与引入前一致

## 2. 着色器

- [ ] 2.1 `cloud.wgsl`：实现 `A(zN)=(0.5+0.6·zN)·skyC.ambient + max(0,1-2·zN)·white`，再 `mix(A, skyC.shadow, shadowTint…)`；总倍率对齐旧 `*0.5` 能量
- [ ] 2.2 `heightAmbientModel=0` 分支保留 `ambTint * 0.5`
- [ ] 2.3 不改 `sunPart`、`heightLight`/`darkMul`、`msMod`、积分 `w`

## 3. 验收

- [ ] 3.1 `heightAmbientModel=0` 与引入前截图视觉等价
- [ ] 3.2 `=1`：厚云底偏冷、顶/薄高处偏亮白；不整体过曝/发灰；与 `baseDark` 同开可辨
- [ ] 3.3 Hybrid 打点：cloud pass 与引入前持平（±测量噪声）
- [ ] 3.4 `npm run typecheck`
- [ ] 3.5 `openspec validate add-height-ambient-tint --strict --no-interactive`
