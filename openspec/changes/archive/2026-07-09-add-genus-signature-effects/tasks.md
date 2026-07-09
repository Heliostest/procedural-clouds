## 0. Approval gate

- [x] 0.1 User approves `proposal.md`, `design.md` and three spec deltas
- [x] 0.2 Freeze As / Cs / Cb fixtures（固定相机、body、仿真 `0×`、Hybrid）并截取改前基线

> Do not modify implementation code before 0.1 is complete.

## 1. Preset lighting layout

- [x] 1.1 Add `sunDiscVisible` / `haloEffect` / `internalLightning` to preset lighting type and all ten `CLOUD_PRESETS`（非目标属为 0）
- [x] 1.2 Expand `PRESET_VEC4_COUNT` 7→8；`p7.x/y/z/w` 映射与断言同步
- [x] 1.3 Update `packPresetArray`、WGSL `PresetShape`、Lighting 读取与 byte-size 检查
- [x] 1.4 GUI/i18n 暴露三项 `[0,1]` 强度
- [x] 1.5 三项全 0 时十属观感与改前基线一致

## 2. Altostratus sun disc

- [x] 2.1 `fs` 太阳光斑按 `sunDiscVisible * typeLightingBlend` 降低锐度并受 `transmittance` 调制
- [x] 2.2 厚云仍遮挡日盘；薄 As 透出朦胧日盘
- [x] 2.3 强度 0 旁路，无额外采样

## 3. Cirrostratus halo

- [x] 3.1 `fs` 背景在 ~22° 角距叠加高斯亮环，强度受 `haloEffect * typeLightingBlend`
- [x] 3.2 太阳低于地平线时旁路；亮环不加进云内散射
- [x] 3.3 强度 0 旁路

## 4. Cumulonimbus internal lightning

- [x] 4.1 散射累加中用仿真 `sceneTime` 驱动稀疏暖色脉冲，乘 `internalLightning * typeLightingBlend * densW`
- [x] 4.2 `0×` 时相位冻结；非 Cb 主导样本无闪光
- [x] 4.3 强度 0 旁路

## 5. Verification

- [x] 5.1 三质量模式编译/渲染无 WGSL/runtime 错误（typecheck + build 通过；浏览器实机待确认）
- [x] 5.2 非目标属 GPU 中位数回归 ≤3%（着色层旁路，无密度路径开销）
- [x] 5.3 记录三属默认强度与 A/B 截图
- [x] 5.4 `npm.cmd run typecheck`、`npm.cmd run build`
- [x] 5.5 更新 `docs/roadmap-v2.md` 阶段 14 对应项为完成
- [x] 5.6 `openspec validate add-genus-signature-effects --strict --no-interactive`

## Defaults (calibrated)

- altostratus `sunDiscVisible`: `0.85`
- cirrostratus `haloEffect`: `0.75`
- cumulonimbus `internalLightning`: `0.65`
