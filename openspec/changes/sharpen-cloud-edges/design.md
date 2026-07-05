## Context

当前密度缓存为 96³ `rgba16float`，`r` 存密度、`g/b/a` 存两个主导云属及次主导权重。`densityAtTyped()` 是主 raymarch、光照行进和地面云影的统一取样入口。旧 `applyEdgeHardness()` 在该入口执行全局 `smoothstep`，但不读取样本云属，且没有解析边缘细节。`evalBody()` 的垂直轮廓则由对称 `vEnvelope = pow(vT, shape) * range` 产生，积雨云顶部仍被刻意圆化。

阶段 4 已提供自适应步进命中回退，阶段 8 已提供可关闭 TAA；阶段 10 可以在统一取样入口引入陡传递函数，并通过总开关即时回退。

## Goals / Non-Goals

**Goals:**
- 积雨云默认获得锐利边缘、花椰菜硬块感与可辨砧顶。
- 普通积云及其他硬度为 0 的云属保持阶段 10 前密度路径。
- cached/hybrid/realtime、主行进/光照行进/地面云影使用一致锐化。
- 解析侵蚀只减密度，不在缓存空区凭空造云，保持未来占据 max 金字塔的保守性。
- 提供无需重载的全局 A/B 回退。

**Non-Goals:**
- 不提高 3D 缓存分辨率。
- 不重写阶段 13.1 的完整 Perlin-Worley 密度模型。
- 不引入 body 级自动切换 realtime；现有质量模式仍由用户控制。
- 不在本阶段重新标定全部银边/光照参数，只做回归检查。

## Decisions

### D1：预设扩为六个 vec4

`ShapePreset.edgeHardness` 追加为第 20 个语义字段；按路线图要求把每预设布局从 `p0..p4` 扩为 `p0..p5`，值写入 `p5.x`，其余分量保留。`packPresetArray()` 仍是唯一打包入口。默认 cumulonimbus 为 `0.85`，其他云属为 `0`，保证普通积云不变。

### D2：全局控制语义

现有全局 `edgeHardness` 改作预设硬度倍率（默认 `1`），`edgeHardnessThreshold` 继续作为传递中心。复用 `Globals` 的 padding 槽增加 `edgeSharpening` 总开关（默认开启）。有效硬度为：

`effective = edgeSharpening ? clamp(presetHardness * globalScale, 0, 1) : 0`

总开关关闭或倍率为 0 时，取样入口原样返回阶段 10 前的密度。

### D3：单调传递与解析侵蚀顺序

取样入口先在阈值邻域内做只减不增的解析侵蚀，再执行 `smoothstep(threshold-width, threshold+width, density)`。宽度随有效硬度从 `0.15` 收窄到 `0.006`。该顺序保证侵蚀塑造等值面，而陡传递提供清晰不透明度边缘。

解析侵蚀只在 `abs(density-threshold)` 的窄带内且有效硬度大于零时运行。它使用 `curlNoise3D()` 扭曲后的 `worleyF1_3D()`，最大减密度幅度受阈值与硬度限制，输出恒满足 `0 <= shapedDensity <= inputDensity`。

### D4：可复用 Worley/Curl

在 `noise.wgsl` 提供两个无资源依赖函数：

- `worley_f1_3d(p)`：使用当前 cell 与最相关对角邻居的两点 F1 近似。完整 3³ 搜索在 256 步 raymarch 内会造成着色器展开/运行成本失控，留待阶段 13.1 的独立质量路径。
- `curl_noise_3d(p, time)`：由多频解析向量势的旋度构造便宜的无散域扭曲。

两者以稳定函数名留给阶段 13.1 的高频边缘侵蚀直接复用。

### D5：高硬度云属的垂直轮廓

`evalBody()` 读取预设硬度。硬度为 0 时保留旧对称 `vEnvelope` 与 falloff。硬度升高时：

- 顶部混入 2% 高度范围的窄过渡截断，去掉圆顶包络。
- `vLocal > 0.68` 时逐步把天气足迹采样坐标向云体中心收缩，等价于把高层足迹扩到最多 1.28 倍，形成砧顶。
- 底部使用 `baseRoundness` 决定过渡宽度：低值接近平底，高值为较宽圆底。

### D6：验证边界

自动验证覆盖 TypeScript、Vite 生产构建、OpenSpec 严格校验与源级布局断言。浏览器验证覆盖：无 WGSL 编译错误、cumulonimbus 预设硬度可见、关闭总开关即时回退、默认普通积云未被锐化。最终肉眼数值仍以本地截图为准。

## Risks / Trade-offs

- [Worley 逐样本成本] → 仅 cumulonimbus 阈值窄带执行，并用阶段 2 GPU timing 对比。
- [硬边放大阶梯条纹] → 保留阶段 4 命中回退；推荐 TAA，且总开关可即时回退。
- [预设布局与活动变更冲突] → 本变更显式依赖 `per-preset-lighting` 当前五 vec4 布局，在其后追加第六槽，不重排既有 19 个字段。
- [砧顶过平] → 解析侵蚀作用于顶部阈值带，高层足迹扩展只改变水平尺度；顶部窄过渡而非零宽裁剪。
- [银边随密度分布变化] → 浏览器回归检查，不在缺少人眼反馈时擅自改全局银边默认值。

## Migration Plan

1. 扩展预设 CPU/GPU 布局并先保持有效硬度为 0，验证布局。
2. 引入统一取样锐化和噪声函数，启用 cumulonimbus 默认硬度。
3. 引入高硬度垂直轮廓与砧顶扩展。
4. 浏览器 A/B 验证；如出现阶梯条纹，关闭总开关可完整回退。

## Open Questions

- 阶段 13.1 重写密度后是否还需要保留顶部窄截断，将在该阶段的第二次重校准中决定。
