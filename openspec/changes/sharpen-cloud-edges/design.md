## Context

当前实现有两条本应独立的处理链：

1. `evalBody()` 生成云体原始密度，决定砧顶足迹、顶部垂直包络和云底曲线；其结果会写入 3D 密度缓存。
2. `densityAtTyped()` 取得 cached、hybrid 或 realtime 密度后调用 `applyEdgeShaping()`，决定阈值附近的透明度过渡和解析侵蚀。

现有代码在两条链中都读取 `effectiveEdgeHardness()`。因此 `edgeSharpening=false` 不仅关闭后置锐化，也把积雨云的砧顶和硬顶混回旧包络。这是参数语义和管线职责的耦合错误。

## Goals / Non-Goals

**Goals:**

- 积雨云砧顶、顶部截断与底部曲线只由云属形态参数决定。
- 边缘密度传递与解析侵蚀只由边缘渲染参数决定。
- 两组参数在 GUI 中可独立调节并形成稳定的 2×2 对照。
- cached、hybrid、realtime、主 raymarch、光照行进与地面云影继续共享一致的后置边缘响应。
- 普通积云默认形态不突变；现有积雨云阶段 10 观感可由新参数组合近似复现。

**Non-Goals:**

- 不重写阶段 13.1 的完整 Perlin-Worley 密度模型。
- 不增加 3D 缓存分辨率。
- 不改变云体 CRUD、天气图、生命周期或场景格式。
- 本次提案修订不修改实现代码；实施必须等待用户批准。

## Decisions

### D1：参数按职责分组，而不是按当前槽位分组

CPU 侧预设在语义上分为：

```ts
interface CloudPreset {
  morphology: {
    anvilStrength: number;
    topCutoffSharpness: number;
    baseRoundness: number;
  };
  edgeStyle: {
    edgeHardness: number;
    edgeErosionStrength: number;
  };
}
```

这不要求 GPU 缓冲使用嵌套布局。为降低迁移风险，现有六个 `vec4` 保持不变：

- `p5.x`: `edgeHardness`
- `p5.y`: `anvilStrength`
- `p5.z`: `topCutoffSharpness`
- `p5.w`: `edgeErosionStrength`

`baseRoundness` 保留原槽位。WGSL 分别通过 `presetMorphology()` 和 `presetEdgeStyle()` 读取，禁止使用含混的 `shapeHardness` 中间变量。

### D2：形态先生成，边缘后响应

管线顺序固定为：

```text
云属形态参数
  -> evalBody() 原始密度
  -> density cache / realtime density
  -> densityAtTyped()
  -> edge style 后置传递与侵蚀
  -> 光学积分
```

- `evalBody()` 只能读取 morphology 参数；不得读取 `edgeHardness`、`edgeErosionStrength` 或 `edgeSharpening`。
- `applyEdgeShaping()` 只能读取 edge-style 和全局边缘参数；不得改变足迹坐标、垂直包络或云底曲线。
- `edgeSharpening=false` 时，`applyEdgeShaping()` 原样返回输入密度，但输入密度仍包含积雨云形态。

### D3：形态参数的明确语义

- `anvilStrength`：控制高层水平足迹相对中层的扩展量；`0` 表示无砧顶扩张。
- `topCutoffSharpness`：控制顶部从圆化包络到窄过渡截断的混合；`0` 表示旧圆化顶部。
- `baseRoundness`：继续控制平底与圆底之间的过渡，不与边缘硬化联动。

默认 cumulonimbus 使用非零 `anvilStrength` 和 `topCutoffSharpness`；其他云属默认 `anvilStrength=0`。这些默认值不受边缘总开关影响。

### D4：边缘参数的明确语义

- `edgeHardness`：只控制阈值附近单调密度传递窗口的宽度。
- `edgeErosionStrength`：只控制阈值窄带内 Worley/Curl 解析侵蚀幅度；`0` 时完全跳过该计算。
- `edgeHardnessThreshold`：保留为全局传递中心。
- `edgeSharpening`：保留为整个后置边缘阶段的总开关。

每云属可保留不同 edge-style 默认值，这是渲染风格预设，不是云属结构定义。调整或清零它们不得改变密度缓存中的宏观轮廓。

### D5：四象限验收是解耦的硬约束

| 云属形态 | 边缘渲染 | 预期结果 |
|---|---|---|
| 开 | 开 | 积雨云砧顶保留，边缘硬化并受解析侵蚀 |
| 开 | 关 | 积雨云砧顶保留，边缘恢复柔和过渡 |
| 关 | 开 | 无砧顶/硬顶结构，但剩余密度轮廓可被硬化 |
| 关 | 关 | 近似阶段 10 前的形态和软边路径 |

若任一开关同时改变另一列对应的特征，则视为解耦失败。

### D6：GUI 分组反映处理层级

- “云属形态”：`anvilStrength`、`topCutoffSharpness`、`baseRoundness`
- “边缘渲染”：`edgeSharpening`、`edgeHardness`、`edgeErosionStrength`、`edgeHardnessThreshold`

GUI 标签和帮助文本必须说明：形态参数会改变密度场并触发缓存更新；边缘参数只改变取样后的渲染响应，不要求重建缓存。

## Risks / Trade-offs

- [参数数量增加] → 只新增两个必要形态参数和一个侵蚀强度参数，不引入通用曲线编辑器。
- [per-genus edge style 仍可能被误解为结构] → 数据模型、WGSL accessor、GUI 分组和文档均使用 `edgeStyle` 命名，并以四象限测试约束行为。
- [关闭形态后不能逐像素复现旧图] → 验收定义为近似阶段 10 前观感；现有噪声和其他已完成阶段不回退。
- [顶部截断放大阶梯条纹] → 保留阶段 4 命中回退和阶段 8 TAA 回归检查；形态与边缘分别关闭定位来源。

## Migration Plan

1. 先增加 morphology/edge-style 语义访问器并保持现有输出不变。
2. 把 `evalBody()` 中所有 `shapeHardness` 依赖替换为 `anvilStrength`、`topCutoffSharpness` 和 `baseRoundness`。
3. 把 `edgeHardness` 限定在 `applyEdgeShaping()`；增加独立 `edgeErosionStrength`。
4. 拆分 GUI 分组与帮助文本。
5. 完成四象限浏览器验收、性能对比和 OpenSpec/TypeScript/build 校验。

## Review Decisions

- 使用语义更精确的 `topCutoffSharpness`。
- 保留 per-genus edge-style，以支持混合云属场景中的不同边缘风格。
- cumulonimbus 初始硬度保留 `0.85`；解耦后的四象限浏览器复核未发现必须立即改默认值的回归，后续仍可独立肉眼标定。
