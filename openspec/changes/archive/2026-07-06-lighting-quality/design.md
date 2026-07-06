## Context

当前着色集中在 `shaders/cloud.wgsl` 的 `fs`：`SUN_DIR`/`SUN_COLOR`/`AMBIENT`/`BG_COLOR` 为编译期常量；天空 `sky = mix(BG, vec3(0.1,0.2,0.4), rd.y)` + 太阳光斑；体积循环用单瓣 `hgPhase(g=0.45)`，`scattering = shadow*phase*(1-exp(-d))`，`litColor = SUN*scattering*sunIntensity + AMBIENT*0.5`；末端 Reinhard + gamma。`renderPass.clearValue` 在 `src/renderer.ts` 硬编码。参数经 `Globals`（`PARAM_OFFSETS` 前 12 个 float）+ `array<BodyGPU>` 打包，`BODY_BASE=12`。渲染单 pass 直出 canvas，无离屏 target。

## Goals / Non-Goals

**Goals:**
- 太阳高度角驱动 time-of-day 整体调色（天空、背景、SUN/AMBIENT）。
- 更可信散射：双瓣 HG、silver lining、Beer-powder。
- cumulonimbus 暗底亮顶。
- God rays 屏幕空间后处理（可关）。
- 默认值还原既有观感。

**Non-Goals:**
- 不做物理大气散射（Rayleigh/Mie 积分），仅唯象渐变。
- 不做多重散射近似（仅单次散射 + powder 近似）。
- 不改密度场/天气图/场景逻辑。

## Decisions

### D1：太阳由方位/高度角参数化
`sunAzimuth`(0~360°)、`sunElevation`(-10~90°) → `SUN_DIR = (cosE*sinA, sinE, cosE*cosA)`。默认值取使 `SUN_DIR ≈ (0.189,0.943,0.283)`（现常量）的角度，保证默认观感不变。

### D2：Time-of-day 调色函数
以 `t = clamp01(sinElevation)` 为参数：`SUN_COLOR = mix(暖橙(1.0,0.6,0.3), 白(1.0,1.0,1.0), t)`；`AMBIENT`、`BG_COLOR`、天空顶色同理在「暮色暖暗 ↔ 日间冷亮」间插值。CPU 端 `src/renderer.ts` 用同一函数算 `clearValue`，与着色器天空底色一致（单一公式两处实现，常量同步；可考虑 BG 也作为 uniform 传入以避免重复，本阶段先两处对齐）。

### D3：双瓣 HG
`phaseDual = mix(hg(cosTheta, hgBackward), hg(cosTheta, hgForward), hgBlend)`；`hgForward` 正（前向尖峰，太阳穿透感），`hgBackward` 负或小（背向回光）。默认 `hgForward=0.45, hgBackward=0.45, hgBlend=1.0` → 退化为现单瓣。

### D4：Silver lining + Powder
- Silver：背光观察（`sunTheta` 小/负）时，按 `pow(phaseForward, k) * transmittance` 给边缘叠加增亮，强度 `silverIntensity`（默认 0 → 无效）。
- Powder：`powder = 1 - exp(-d * 2)`，`scattering *= mix(1, powder, powderStrength)`，使薄边发亮、厚心压暗。默认 `powderStrength=0`。

### D5：cumulonimbus 暗底亮顶
按采样点归一化高度 `zNorm` 与局部密度：`heightLight = mix(darkBase, brightTop, smoothstep(0,1,zNorm))`，仅对高密区显著（用密度或 densityScale 作权重），`scattering *= heightLight`。默认权重 0 → 不改其他云属。

### D6：God rays（屏幕空间径向模糊）
主云渲染到离屏 `rgba16float` target → God rays pass 以太阳屏幕投影 `sunUV`（CPU 用 viewProj 投影 `SUN_DIR` 远点）为中心，沿 `uv→sunUV` 方向取 N 个衰减采样累加，按 `godrayStrength` 与太阳是否在视野内加权，叠加到主图。`godrayStrength=0` 时旁路（直接 blit 或不建 target）。需在 `renderer.ts` 增第二管线 + 全屏三角形。

- 备选：把所有调色色板作为 uniform 上传而非着色器内插值。否决——本阶段函数化插值更省传输，色板演进留后续。

## Risks / Trade-offs

- [离屏 target + 后处理增显存/带宽] → God rays 默认关闭旁路；target 仅在启用时创建。
- [CPU/GPU 两处 BG 公式漂移] → 抽成同一注释化公式，或后续把 BG 作为 uniform 单源。
- [新增 uniform 字段破坏 std140 对齐] → 严格按 16 字节倍数补 `Globals`，同步 `BODY_BASE`，build 后像素比对默认观感。
- [太阳低角度数值（elevation<0）] → clamp 调色参数，避免负光照。

## Open Questions

- God rays 太阳在屏幕外时是否仍出光束？倾向按 `sunUV` 到屏边距离衰减，屏外淡出。
- time-of-day 是否接入场景时间轴自动推进？本阶段仅手动 GUI；自动昼夜留后续（可由 Scenario 扩展驱动）。
