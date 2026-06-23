## Why

阶段 5 核心（出现 / 增厚 / 减淡 / 消失）已完成，roadmap 仍留一条可选项未做：「形态随阶段微变——grow 阶段 `detailStrength` 渐增，decay 阶段边缘侵蚀增强（接 `worleyBlend`）」。当前生命周期只调制密度（coverage/densityScale），云在成长与消散时只是整体浓淡变化，缺少形态层面的演化：成长期应逐渐长出细节，消散期边缘应破碎侵蚀。补上这条让生命周期更自然。

## What Changes

- `src/lifecycle.ts`：`evalRegionMod` 增输出 `morph ∈ [-1, 1]`——birth→grow 段 `0 → +1`（成长，正值驱动 detail 增强）、mature 段恒 `+1`、decay→death 段 `+1 → -1`（消散，负值驱动边缘侵蚀）、区间外 0。
- `src/weather.ts`：`paintRegions` 把 `morph` 编码进 `weatherMap` 的 **A 通道**（`A = (morph + 1) / 2`，0.5 表示无微变）；无生命周期 / 无形态微变时 A 写 0.5（向后兼容）。
- `shaders/cloud.wgsl`：采样 A 通道解码 `morph`，按全局 `morphStrength` 强度：grow 部分 `max(morph, 0)` 增 `detailStrength`，decay 部分 `max(-morph, 0)` 增 `worleyBlend`（推向细胞感 = 边缘侵蚀）。`morphStrength = 0` 时形态完全不变。
- `src/params.ts` + `src/gui.ts`：新增全局 `morphStrength`（默认 0，关闭）GUI 滑杆。

## Capabilities

### Modified Capabilities
- `cloud-lifecycle`: 新增「形态随阶段微变」需求——生命周期除调制密度外，SHALL 额外输出形态微变信号，grow 段增强细节、decay 段增强边缘侵蚀。
- `cloud-weather`: 天气图 A 通道语义由「区域 id / 备用」改为「形态微变信号 morph」；区域绘制 API 增写 A 通道。

## Impact

- `src/lifecycle.ts`：`RegionMod` 增 `morph` 字段；`evalRegionMod` 计算 morph。
- `src/weather.ts`：`paintRegions` 写 A 通道（morph 编码），默认 0.5。
- `shaders/cloud.wgsl`：解码 A 通道，按 `morphStrength` 调 `detailStrength`/`worleyBlend`；`Params` 增 `morphStrength`。
- `src/params.ts`：`CloudParams` 增 `morphStrength` + 偏移；`PARAMS_FLOAT_COUNT` 视需要扩展。
- `src/gui.ts`：`morphStrength` 滑杆。
- 依赖：`cloud-lifecycle`、`cloud-weather`（均已归档）。
- 向后兼容：`morphStrength=0`（默认）时画面与现状完全一致；A 通道默认 0.5 使 morph=0。
- 验收基线：开启 `morphStrength` 后，成长期云细节逐渐增多、消散期边缘破碎侵蚀，且关闭时无差异。
