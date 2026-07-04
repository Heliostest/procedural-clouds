## Why

roadmap 阶段 9 要求为 HDR 后处理链增加 Bloom，使太阳与受光云缘出现柔和光晕、提升氛围感。当前 `fsPost` 仅有 God rays + exposure + tonemap，高亮区域无扩散溢出；God rays 为径向采样，与 Bloom 用途不同，不能替代。阶段 1（HDR 前置）与阶段 8（TAA）已完成，Bloom 可在 tonemap 之前正确作用于线性 HDR 域。

## What Changes

- 新增 Jimenez 2014 双滤波（或等价 Kawase 金字塔）：亮度阈值提取 → 渐进降采样（13-tap）→ tent 上采样累加；**不用** shadertoy 式径向采样。
- 在 `fsPost` 管线中，Bloom 叠加 SHALL 位于 exposure 之后、tonemap 之前（HDR 域合成）。
- 新增参数 `bloomEnabled`、`bloomThreshold`、`bloomAmount`（`src/params.ts` + post uniform）。
- `src/gui.ts`：后处理文件夹增 Bloom 开关与阈值/强度滑杆。
- 默认值 `bloomEnabled=false` 或 `bloomAmount=0`，旁路 Bloom pass，画面与引入前一致。

## Capabilities

### New Capabilities

（无——Bloom 归入既有渲染/参数能力）

### Modified Capabilities

- `cloud-rendering`: 后处理管线 SHALL 支持 HDR Bloom（双滤波/Kawase 金字塔），在 tonemap 前叠加，可运行时开关。
- `cloud-params`: `RenderParams`（post uniform 或等价通道）SHALL 扩展 `bloomEnabled`、`bloomThreshold`、`bloomAmount`，默认值复现引入前观感。

## Impact

- `src/renderer.ts`：增 Bloom 降采样/上采样 pass 与中间纹理（半分辨率链）；调整 `fsPost` 顺序为 scene → bloom add → godray → exposure → tonemap → gamma。
- `src/params.ts`：`PARAM_OFFSETS`/`CloudParams`/`createDefaultParams` 增 Bloom 字段；post uniform buffer 扩展。
- `src/gui.ts`：Bloom 控件（开关 + 阈值 + 强度）。
- `src/i18n.ts`：Bloom 相关标签与 tooltip。
- 向后兼容：默认关闭时零额外 pass 或旁路，观感不变。
- 验收：太阳与受光云缘柔和光晕；无方向条纹；云主体不被糊化。
