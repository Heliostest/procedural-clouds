## Why

阶段 1~7 已具备形态、风、空间天气图、生命周期、场景编排与多高度层共存，但着色仍是固定常量：`shaders/cloud.wgsl` 内 `SUN_DIR`/`SUN_COLOR`/`AMBIENT`/`BG_COLOR` 写死，`renderPass.clearValue` 也是硬编码深蓝，单瓣 HG 相函数、无背光银边、无 powder 暗化、cumulonimbus 暗底亮顶未体现、无 God rays。roadmap 阶段 8 要求「光照与画质配合形态」，让同一批云体在不同时刻（黄昏/正午）、不同云属（积雨云暗底亮顶）下呈现更可信的体积光感。

## What Changes

- 新增 `RenderParams` 光照字段（`src/params.ts`）：`sunAzimuth`、`sunElevation`（太阳高度角，驱动 time-of-day 调色）、`silverIntensity`、`powderStrength`、`hgForward`/`hgBackward`/`hgBlend`（双瓣 HG）、`godrayStrength`。打包进现有 `Globals`（扩展 uniform）。
- `shaders/cloud.wgsl`：
  - 由 `sunAzimuth/Elevation` 计算 `SUN_DIR`，并按太阳高度角对 `SUN_COLOR`/`AMBIENT`/`BG_COLOR` 做 time-of-day 渐变（地平线偏暖红、天顶偏白蓝）。
  - 相函数改为双瓣 HG（前向 + 背向）`mix`，配合 silver lining（背光边缘按透射率与相函数增亮）与 Beer-powder 暗化（薄处提亮、厚处压暗）。
  - cumulonimbus 暗底亮顶：按归一化高度与密度梯度调制散射，使高密厚云底暗顶亮。
- `src/renderer.ts`：`renderPass.clearValue`（背景色）由按太阳高度角计算的 BG 色驱动，与着色器天空色一致。
- `src/renderer.ts`：新增 God rays 后处理 pass——主云渲染到离屏 target，第二 pass 做屏幕空间径向模糊（以太阳屏幕投影为中心）合成。
- `src/gui.ts`：光照/画质控件（太阳方位/高度、银边/powder 强度、HG 双瓣、God rays 强度）。

## Capabilities

### New Capabilities
- `cloud-lighting`: 体积云着色与画质——time-of-day 调色（随太阳高度角变 SUN/AMBIENT/BG 与背景）、双瓣 HG 相函数、silver lining 背光银边、Beer-powder 暗化、cumulonimbus 暗底亮顶、God rays 屏幕空间后处理。

### Modified Capabilities
- `cloud-params`: `RenderParams` SHALL 扩展光照与画质字段（太阳方位/高度角、相函数双瓣权重、银边/powder/God rays 强度），并按既有 `packParams` 单一事实来源打包，默认值复现引入前观感。

## Impact

- `src/params.ts`：`PARAM_OFFSETS`/`Globals` 扩展光照字段（注意 `BODY_BASE` 随 `Globals` float 数增加需同步更新，保持 std140 16 字节对齐），`CloudParams` 与 `createDefaultParams` 增字段。
- `shaders/cloud.wgsl`：`Globals` struct 扩展；`fs` 着色逻辑（相函数、银边、powder、暗底亮顶、time-of-day）；新增 God rays 片元。
- `src/renderer.ts`：离屏 color target + God rays 后处理管线；`clearValue` 改由太阳高度角计算。
- `src/gui.ts`：光照/画质文件夹控件。
- 向后兼容：默认值（太阳高度≈现有 SUN_DIR、各画质强度取还原既有观感的值）下画面与引入前一致。
- 验收基线：同一组云体在黄昏（低太阳高度）呈暖色暗底亮顶、正午呈白亮；积雨云可见暗底亮顶；开启 God rays 见太阳方向放射光束。
