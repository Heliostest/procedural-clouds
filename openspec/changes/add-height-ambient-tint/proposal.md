# Change: 引入参考式高度环境光染色（Sky Ocean Sun skyRay ambient）

## Why

云内环境项目前基本是常数 `ambTint * 0.5`，垂直明暗主要靠太阳项上的 `heightLight`/`baseDark` 标量。厚云底部仍偏「灰平」，缺少参考里「低处偏蓝、高处偏白」的环境色分层。`MiniVerse/reference` 的 `skyRay` 用 `(0.5+0.6·h)·蓝 + (1-2·h)·白` 以零步进成本补垂直氛围；可在完整大气 LUT（roadmap 13.3）之前先落地。

## What Changes

- 主步进散射中的环境项改为可切换的高度染色：`heightAmbientModel=0` 复现现 `ambTint * 0.5`；`=1` 启用参考式：
  `ambient = (0.5 + 0.6·zN) * skyBlue * kBlue + max(0, 1.0 - 2.0·zN) * white * kWhite`
  再与既有 `shadowTint` 冷阴影混合语义对齐（阴影侧仍可染 `skyC.shadow`）。
- `zN` 用盒内归一化高度（与现 `heightLight`/`darkMul` 同一坐标），不引入大气球壳。
- 蓝/白基色锚定 `todColors()` 的 ambient/top 通道（或固定艺术蓝白再乘 TOD），避免与昼夜色板脱节。
- GUI 暴露 `heightAmbientModel`；默认 `1`；`0` 像素级复现引入前环境项。
- 不改密度、light-march 步数、相位、powder、银边公式。

## Non-Goals

- 不做 Bruneton/Hillaire 大气 LUT、Hosek-Wilkie 天空（roadmap 13.3）。
- 不改 `heightLight`/`baseDark` 太阳项标量（可并存；本变更只动环境色向量）。
- 不做 Mie 相位、暗角/色差、云雾分噪声。
- 不扩 preset `vec4` 槽。

## Capabilities

### Modified Capabilities

- `cloud-lighting`：环境散射项增加可切换的高度染色。
- `cloud-params`：新增 `heightAmbientModel`，经 `packParams` 单一事实来源写入。

## Prerequisites and Conflicts

- 依赖已落地的 `todColors()`（含 `ambient`/`shadow`）与主步进 `ambTint` 路径。
- 与 active `add-height-weather-shaping` **无冲突**（彼改密度，本改光照环境项）。
- 与已归档三指数 Beer / 能量守恒积分 **兼容**：本项只替换 `litColor` 中的环境向量，不改 `sunVisibility`/`w` 积分。
- 与既有「积雨云暗底亮顶」**并存**：后者乘在太阳散射标量上；本项改环境色。验收时两者同开不得互相抵消成发灰。
- 不改变 CloudBody / scenario JSON schema。

## Impact

- **代码**：`shaders/cloud.wgsl`（主步进环境项）；`src/params.ts`、`src/gui.ts`、`src/i18n.ts`。
- **规格**：修改 `cloud-lighting`、`cloud-params`。
- **观感**：云底偏冷蓝、云顶/薄高处偏亮白；可用开关回退。
- **性能**：每命中样本数次 `mix`/`max`，无额外纹理或步进；打点应与引入前持平。
