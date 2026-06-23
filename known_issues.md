# Known Issues

## 区域边缘仍偏硬（阶段 4 天气图）

- 现象：天气图区域边界（尤其矩形直边）过渡仍显生硬，不够自然。
- 已做缓解：`feather` 羽化、边缘 `edgeSharpness` 随 coverage 衰减（`edgeSoft`）、最终密度 `edgeFade` 平滑淡出、默认 feather 1.5。
- 仍不足：核心区与羽化带之间的密度响应曲线偏陡；矩形直边在视觉上仍可辨。
- 可能方向：边缘带额外放宽 `coverageThreshold`/`factorShaper`；或天气图按距离场存软边并提高分辨率；或区域改用更平滑的轮廓（避免直角）。

## 云底平直（次要）

- 现象：云底呈一条水平直线。
- 原因：高度 band/falloff 削平底部 + `cloudHeight` 偏低导致薄板。

## 顶面阶梯条纹（次要）

- 现象：云顶有层叠/阶梯状条纹。
- 原因：raymarch 步数与密度缓存分辨率的采样层叠 artifact，dither 未完全覆盖。
- 缓解：提高 `Ray Steps` / `Cache Res`。
