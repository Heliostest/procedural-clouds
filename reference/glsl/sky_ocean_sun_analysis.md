# Sky Ocean Sun Shader 管线分析

基于 Shadertoy 的「Sky Ocean Sun」场景，四通道渲染管线：BufA（主场景）→ BufB（Bloom）→ BufC（TAA）→ Image（后处理）。

---

## 1. Buffer A：主场景渲染 (sky_ocean_sun_buffer_a.glsl)

主渲染通道，负责天空、云、海洋、立方体及水面交互。

### 1.1 宏与常量

| 宏/常量 | 含义 |
|--------|------|
| `VOLUME_TEXTURES` | 使用 3D 体积纹理做噪声 |
| `NOISE_TEXTURES` | 可选：用纹理替代程序噪声 |
| `EPSILON_NRM` | 法线差分步长，与分辨率相关 |
| `EARTH_RADIUS` | 地球半径 6300km |
| `CLOUD_START` | 云底高度 800m |
| `CLOUD_HEIGHT` | 云层厚度 600m |
| `SUN_POWER` | 太阳辐照度 `(1,0.9,0.6)*750` |
| `LOW_SCATTER` | 低空散射颜色 |
| `ITER_GEOMETRY` | 水面几何迭代次数 3 |
| `ITER_FRAGMENT` | 水面片段迭代次数 5 |
| `SEA_HEIGHT` | 波高 0.6 |
| `SEA_CHOPPY` | 波浪尖锐度 4 |
| `SEA_FREQ` | 基础频率 0.16 |
| `SEA_BASE` | 海水底色 |

### 1.2 噪声系统

**hash / noise：**
- `hash(float n)`：1D 伪随机
- `hash(vec2 p)`：2D 伪随机
- `noise(vec3 x)`：3D 噪声，`VOLUME_TEXTURES` 时用 `iChannel2`，否则用 `iChannel1` 双线性插值
- `noise(vec2 p)`：2D 噪声，`NOISE_TEXTURES` 时用 `iChannel3`，否则用 hash 插值

**fbm：**
- 3 层 FBM，旋转矩阵 `m` 做各向异性
- 权重 0.5, 0.25, 0.125，频率逐层放大

### 1.3 球体求交

```glsl
intersectSphere(origin, dir, spherePos, sphereRad)
```
- 解二次方程求射线与球交点
- 数值稳定：`q = (-b ± sqrt(disc))/2`，另一根用 `c/q`
- 返回最近正交点距离，无交点返回 -1

### 1.4 云层密度 `clouds()`

1. **高度**：`cloudHeight = (atmoHeight - CLOUD_START) / CLOUD_HEIGHT`，归一化到 [0,1]
2. **天气纹理**：`iChannel0` 大尺度 + 小尺度，带时间偏移
3. **形状**：`weather * smoothstep` 控制云层上下边缘
4. **密度**：`cloudShape - 0.7*fbm(p*0.01)`，再减 `0.2*fbm(p*0.05)`（非 fast 模式）
5. **fast 模式**：少一次 fbm，用于反射/折射等快速路径

### 1.5 Mie 散射相位

`numericalMieFit(costh)`：10 参数拟合，近似 Mie 相位函数，来源 [shadertoy.com/view/4sjBDG](https://www.shadertoy.com/view/4sjBDG)。

### 1.6 光路采样 `lightRay()`

沿太阳方向步进采样云密度：
- fast：7 步，简化 Beer-Lambert
- 非 fast：20 步，多散射项 + 相位函数 + 密度调制

### 1.7 SDF 与立方体

**udRoundBox**：圆角盒 SDF  
**map()**：7 个圆角盒组成 Enscape 立方体，经 `cubeForm` 旋转、`Yelevation` 平移，与水面起伏对齐。

### 1.8 海洋高度场

**sea_octave**：单层波浪，`noise` + `sin/cos` 组合，`choppy` 控制尖锐度。  
**mapWater()**：多八度叠加，`octave_m` 旋转，`freq*1.9`、`amp*0.22` 衰减。`cube=true` 时叠加立方体 SDF 的指数衰减项，用于水面与立方体交界。

### 1.9 天空射线 `skyRay()`

1. 求射线与大气球壳交点
2. 在大气层内步进（fast 13 步，非 fast 35 步）
3. 每步：云密度 → `lightRay` → 环境光 + 太阳光 → 体积渲染累加
4. 透射率 `T *= exp(-density*stepS)`，`T<0.05` 提前退出
5. 非 fast：加 fbm 高空细节
6. 背景：根据 `mu` 和 `dir.y` 混合蓝天与地平线

### 1.10 水面着色 `getSeaColor()`

- **反射**：Schlick Fresnel，反射方向 `reflect(dir,N)`，命中立方体则用 `renderCubeFast`，否则用 `skyRay`
- **底色**：`cloudShadow * SEA_BASE`
- **次表面**：Henyey-Greenstein 相位，`SEA_WATER_COLOR`，与高度相关
- **镜面**：GGX，`roughness=0.05`，仅当反射未命中立方体时
- **泡沫**：`smoothstep` 基于高度 + 立方体边缘的 `map(p)` 项

### 1.11 立方体渲染

**renderCube**：漫反射 + 环境光 + 镜面反射 + 软阴影 + AO  
**renderCubeFast**：无阴影、无 AO，用于反射/折射快速路径

### 1.12 立方体姿态 `setupCubeForm()`

在三个采样点计算 `mapWater`，得到波浪引起的俯仰/偏航，构造 `rotX`、`rotZ`，`cubeForm = inverse(rotX*rotZ)`，使立方体随水面倾斜。

### 1.13 mainImage 主流程

1. 相机：鼠标控制旋转与高度
2. `setupCubeForm()`
3. `castRay` 检测立方体
4. `intersectSphere` 检测地球/大气
5. 分支：
   - 仅天空：`skyRay`
   - 仅立方体：`renderCube`
   - 水面：`heightMapTracing` → `getNormalWater` → `getSeaColor`，再处理水下折射立方体
6. 雾：Henyey-Greenstein 相位，`exp(-0.0003*fogDistance)` 混合雾与场景

---

## 2. Buffer B：Bloom (sky_ocean_sun_buffer_b.glsl)

对 BufA 做径向模糊并混合回原图，再 ACES 色调映射。

### 2.1 模糊

- 20 个采样点，沿圆周分布
- `phiOffset` 用 hash 随时间变化，减少带状伪影
- `blurRadius = 20/resolution`
- `BLOOM_AMOUNT = 0.05`：5% 模糊 + 95% 原图

### 2.2 ACES 色调映射

```glsl
(x*(a*x+b))/(x*(c*x+d)+e)
```
来源：[ACES Filmic Tone Mapping](https://knarkowicz.wordpress.com/2016/01/06/aces-filmic-tone-mapping-curve/)

### 2.3 曝光

```glsl
exposure = 0.06 * (1.0 + 0.2*sin(0.5*iTime)*sin(1.8*iTime))
```
轻微周期性变化，模拟自动曝光。

---

## 3. Buffer C：TAA (sky_ocean_sun_buffer_c.glsl)

Marco Salvi 风格的时域抗锯齿，在 YCoCg 空间做方差裁剪。

### 3.1 YCoCg 色彩空间

- **RGB→YCoCg**：Y 亮度，Co/Cg 色度，偏移到 [0,1] 便于插值
- **YCoCg→RGB**：逆变换

### 3.2 邻域统计

- 中心 + 8 邻域共 9 像素
- `colorAvg = sum/9`，`colorVar = sum(sq)/9`
- `sigma = sqrt(max(0, colorVar - colorAvg²))`

### 3.3 方差裁剪

```glsl
colorMin = colorAvg - 0.75 * sigma
colorMax = colorAvg + 0.75 * sigma
history = clamp(history, colorMin, colorMax)
```
限制历史帧在邻域范围内，减少鬼影。

### 3.4 混合

```glsl
mix(new, history, 0.95)
```
95% 历史 + 5% 当前帧。`NO_AA` 时直接输出 `new`。

---

## 4. Main Image：后处理 (sky_ocean_sun_main_image.glsl)

最终输出：暗角 + 色差 + 伽马校正。

### 4.1 暗角

```glsl
vign = smoothstep(4.0, 0.6, length(v))
```
`v` 为 NDC，中心亮、边缘暗。

### 4.2 色差

- `centerToUv = q - 0.5`
- R：`centerToUv * 0.995`（略缩小）
- G：`centerToUv * 0.997`
- B：`centerToUv * 1.0`（不缩放）

模拟镜头色散。

### 4.3 伽马

```glsl
pow(vign*aberr, vec3(0.2 + 1.0/2.2))
```
`0.2 + 1/2.2 ≈ 0.65`，近似 sRGB 输出。

---

## 5. 通道依赖关系

```
BufA (iChannel0) ──┬──→ BufB (blur) ──→ iChannel0
                  │
                  └──→ BufC (TAA) 读取 iChannel0(新) + iChannel1(历史)
                        ↓
                   Image 读取 BufC 输出
```

- BufA：主场景，无通道依赖
- BufB：读 BufA，写回 BufA 的输入（或等价通道）
- BufC：读当前帧 + 上一帧 BufC
- Image：读 BufC 做后处理

---

## 6. 纹理通道 (iChannel)

| 通道 | 用途 |
|------|------|
| iChannel0 | 天气/云纹理（BufA）；BufB/C 的输入 |
| iChannel1 | 2D 噪声（非 VOLUME_TEXTURES 时）；TAA 历史 |
| iChannel2 | 3D 体积噪声（VOLUME_TEXTURES 时） |
| iChannel3 | 2D 噪声（NOISE_TEXTURES 时） |

---

## 7. 性能相关

- **fast 路径**：`skyRay`、`lightRay`、`clouds` 在反射/折射时用更少步数
- **TAA**：高帧率下效果更好
- **云**：体积步进是主要开销
- **水面**：`ITER_GEOMETRY=3`、`ITER_FRAGMENT=5` 控制质量与性能
