## Context

参考：`MiniVerse/reference/glsl/sky_ocean_sun_buffer_a.glsl` 的 `skyRay`：

```
ambient = (0.5 + 0.6*cloudHeight)*vec3(0.2, 0.5, 1.0)*6.5
        + vec3(0.8) * max(0.0, 1.0-2.0*cloudHeight);
radiance = ambient + SUN_POWER*intensity;
```

heli 现状（`cloud.wgsl` 主步进）：

```
ambTint = mix(skyC.ambient, skyC.shadow, shadowTintStrength * (1-shadow));
litColor = skyC.sun * sunPart + ambTint * 0.5;
```

另有太阳项标量 `heightLight`/`darkMul`（「积雨云暗底亮顶」），不改色相。

## Goals / Non-Goals

- Goals：低成本垂直环境色分层；可 A/B；与 TOD / shadowTint 共存。
- Non-Goals：大气 LUT；改太阳项标量公式；改密度。

## Decisions

- **Decision: 只替换环境向量，不动 `sunPart`**  
  参考把 ambient 与太阳强度相加。heli 已有完整太阳路径（MS/相位/powder/银边），只把 `ambTint * 0.5` 换成高度染色环境项，避免重调整条太阳链。

- **Decision: `zN` = 全局盒归一化高度**  
  与现 `heightLight`/`darkMul`/`msDensityHeightMod` 同一 `zN`，保证垂直明暗坐标一致。不用 body 局部高度（环境光是「天空穹顶」语义，盒高更合适）。

- **Decision: 蓝/白锚定 TOD，不写死 Shadertoy 常数**  
  蓝项：`mix(vec3(0.2,0.5,1.0), skyC.ambient, todLock)` 或直接用 `skyC.ambient` 作蓝基再乘 `(0.5+0.6·zN)`；白项：`vec3(0.8)` 或 `mix(vec3(0.8), skyC.top, …)`。推荐：蓝=`skyC.ambient`，白=`vec3(0.85)`（略低于 1 防顶爆），再整体乘可调强度默认对齐旧 `*0.5` 能量。

- **Decision: 保留 shadowTint**  
  先算高度 ambient `A(zN)`，再 `mix(A, skyC.shadow, shadowTintStrength*(1-shadow))`，与现语义一致。

- **Decision: `heightAmbientModel` 开关**  
  `0` = `ambTint * 0.5`；`1` = 参考式。默认 `1`。占用 `Globals` 现有 `_pad11`（offset 58），`BODY_BASE` 已为 60，无需扩 buffer。

- **Decision: 能量尺度**  
  参考有 `*6.5` 因 HDR 太阳功率不同。heli 用系数使默认白天积云平均亮度接近 `heightAmbientModel=0`，避免一开就整体抬亮；以截图校准，不追求数值照搬。

- **Alternatives considered**  
  - 只加强 `heightLight`：仍无色相分层，观感上限低。  
  - 直接做 13.3 LUT：成本过高。  
  - 用 body 局部 `h`：薄高层云会整片偏白/偏蓝，与「穹顶」直觉不符。

## Risks / Trade-offs

- 与 `baseDark`/`heightLight` 叠加可能底部过暗 → 默认校准 + 开关回退。
- 黄昏时 `skyC.ambient` 已暖，再乘蓝公式可能脏 → 蓝基跟 TOD，或对低太阳高度略降蓝权重（实现时用截图定，可不另加 uniform）。
- 能量守恒路径下环境项同样进 `w * litColor`，步数变化应仍稳定。

## Migration Plan

1. 占用 `_pad11` 为 `heightAmbientModel`，实现两路径，默认 `1`。
2. 固定场景截图 A/B，微调白项/总倍率。
3. 回退：`heightAmbientModel=0`。

## Open Questions

- 白项用固定 `0.85` 还是 `skyC.top`？（实现先固定灰白；若白天顶发灰再改 top。）
