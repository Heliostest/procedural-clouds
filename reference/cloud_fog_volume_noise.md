# 云雾盒子噪声生成规则

## 概述

单个云雾体积盒使用两套独立的 3D 噪声纹理：**云噪声** 和 **雾噪声**，分别控制云层和雾层的密度分布。

---

## 1. 噪声纹理生成（CloudSystem.createNoiseTexture）

### 1.1 通用参数

| 参数 | 默认 | 说明 |
|------|------|------|
| size | 192 | 3D 纹理体素边长，总采样数 = size³ |
| scale | - | 噪声频率（y 轴及基础尺度） |
| scaleXZ | - | x/z 轴频率除数，实际 x/z 频率 = scale/scaleXZ |
| seed | - | 坐标偏移，用于区分不同噪声实例 |

### 1.2 体素值计算

对每个体素 (x, y, z)，x,y,z ∈ [0, size-1]：

```
sxz = scale / scaleXZ
nx = x * sxz + seed * 100
ny = y * scale + seed * 50
nz = z * sxz + seed * 75

raw = 128 + 128 * perlin.noise(nx, ny, nz)
d = 1 - |(x,y,z) - center| / (size/2)
value = max(0, raw * d²)
```

- **Perlin 噪声**：ImprovedNoise，输出约 [-1, 1]，线性映射到 [0, 256]
- **中心衰减**：d 为到立方体中心的归一化距离，d² 使边缘密度趋近 0

### 1.3 云噪声（cloudNoiseTexture）

参考 Sky Ocean Sun buffer_a 的 clouds() 设计：

- **FBM 三阶**：`fbm(p) = 0.5*noise(p) + 0.25*noise(m*p*2.02) + 0.125*noise(m*p*2.02*2.03)`，m 为各向异性旋转矩阵
- **密度**：`den = cloudShape - 0.7*fbm(p*0.01)`，再 `den -= 0.2*fbm(p*0.05)`
- **cloudShape**：常量 0.8（无天气纹理时）
- **中心衰减**：d² 同雾

### 1.4 雾噪声（fogNoiseTexture）

```
createNoiseTexture({ scale: 0.02, scaleXZ: 1, seed: 1 })
```

- x/z、y 频率：均为 0.02
- 效果：各向同性、频率更低，雾更均匀、大尺度

---

## 2. Shader 采样与密度（VolumetricNodeMaterial.sampleDensity）

### 2.1 坐标变换

- `p`：Raymarching 射线在单位盒内的局部坐标，约 [-0.5, 0.5]
- 云采样：`psCloud = p * uNoiseScale`，再 `texCloud.sample(psCloud + 0.5)`
- 雾采样：`psFog = p * uFogNoiseScale`，再 `texFog.sample(psFog + 0.5)`

`uNoiseScale` / `uFogNoiseScale` 对应 UI 的 Cloud Detail / Fog Detail，>1 提高采样频率，<1 降低。

### 2.2 雾密度

```
vFog = texFog.sample(psFog + 0.5).r
fogFade = 1 - smoothstep(0, fogLayerHeight, localY)
fogDensity = smoothstep(0.1, 0.3, vFog) * fogFade * opacity * 0.5
```

- `localY`：盒内高度，0=底、1=顶
- `fogFade`：雾在 [fogLayerMin, fogLayerMax] 内（默认 0~0.2）
- `vFog` 经 smoothstep 做软阈值，再乘 fogFade 和 opacity

### 2.3 云密度

```
v = texCloud.sample(psCloud + 0.5).r
cloudFade = smoothstep(cloudLayerBase, cloudLayerBase+0.2, localY) * smoothstep(1, cloudLayerBase+0.3, localY)
cloudDensity = smoothstep(threshold-range, threshold+range, v) * cloudFade * opacity
```

- `cloudFade`：云在 [cloudLayerBase, cloudLayerTop] 内（默认 0.65~1）
- `v` 经 threshold/range 做云团阈值，再乘 cloudFade 和 opacity

### 2.4 总密度

```
density = fogDensity + cloudDensity
```

---

## 3. 参数对应关系

| UI 参数 | 对应 uniform | 作用 |
|---------|--------------|------|
| Cloud Detail | uNoiseScale | 云噪声采样频率 |
| Fog Detail | uFogNoiseScale | 雾噪声采样频率 |
| Fog Layer Min | fogLayerMin | 雾层下界 |
| Fog Layer Max | fogLayerMax | 雾层上界 |
| Cloud Layer Base | cloudLayerBase | 云层下界 |
| Cloud Layer Top | cloudLayerTop | 云层上界 |
| Threshold | threshold | 云密度阈值中心 |
| Range | range | 云密度阈值宽度 |
