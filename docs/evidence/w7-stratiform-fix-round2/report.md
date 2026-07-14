# W7 Stratiform 第二轮修复 — 独立 WebGPU 视觉验收报告

- 日期：2026-07-14
- 证据目录：`docs/evidence/w7-stratiform-fix-round2/`
- 上一轮失败报告：[`../w7-stratiform-fix/report.md`](../w7-stratiform-fix/report.md)
- 机器可读：[`results.json`](./results.json)、[`results.raw.json`](./results.raw.json)
- **Gate：Stop-Review**

本轮只做视觉/证据；未改 shader、bank、camera、TAA、packing、optical。

## 命名前缀

```text
screenshots/{caseId}--{hud|clean}.png

w7--single-stratus--
w7--single-cirrostratus--
w7--single-altostratus--
w7--single-nimbostratus--
w7--w7-stratiform-stack--
w7--w7-stratiform-overlap--

caseId = {前缀}{legacy|recipe-v2}--{cached|hybrid}--{normal|density-debug}
```

主证据默认 **cached + clean**；hybrid 形态与 cached 一致（抽查 Cs hybrid debug 同结论）。

---

## 1. 环境

| 项 | 值 |
| --- | --- |
| OS | Windows 10 |
| Browser | Google Chrome（Playwright `channel=chrome`） |
| URL | `http://127.0.0.1:5173/procedural-clouds/?benchmark=1` |
| WebGPU | NVIDIA ampere |
| timestamp-query | 可用；本轮 12 个 cached/normal 均采满 60 cache samples（无 early） |
| 截图 | 48 × 2 = **96 PNG** |

核对元数据（V2 cached）：单属 `activeBodyCount=1`；stack/overlap `=4`；`producer=recipe-v2` + `lifecycle=ready`；`sharedFields=ready`；`warnings=[]`；enabled = cumulus+stratus+altostratus+nimbostratus+cirrostratus；St/Cs/As/Ns sampleLimits 显示为 `2/0/0/0`。

## 2. 自动检查

| 命令 | 结果 |
| --- | --- |
| `npm run test:genus-dispatch` | pass |
| `npm run test:pipeline-isolation` | pass |
| `npm run test:density-v2-layout` | pass |
| `npm run test:density-v2-tiles` | pass |
| `npm run test:density-v2-fields` | pass |
| `npm run test:density-v2-evaluators` | pass |
| `npm run test:ground-shadow-hash` | pass |
| `npm run build` | pass |
| `npx openspec validate add-density-v2-stratiform-family --strict --no-interactive` | pass |

---

## 3. Stratus（前缀 `w7--single-stratus--`）

| 项 | 结果 |
| --- | --- |
| 总判定 | **recipe-v2 pass**（维持上一轮） |
| failureClass | 无 |
| timing (cached/normal) | V2/Legacy median **0.181×**，p90 **0.158×** → **pass** |

**主证据：**

| 角色 | caseId | 文件 |
| --- | --- | --- |
| V2 raw | `w7--single-stratus--recipe-v2--cached--density-debug` | [clean](./screenshots/w7--single-stratus--recipe-v2--cached--density-debug--clean.png) · [hud](./screenshots/w7--single-stratus--recipe-v2--cached--density-debug--hud.png) |
| V2 normal | `w7--single-stratus--recipe-v2--cached--normal` | [clean](./screenshots/w7--single-stratus--recipe-v2--cached--normal--clean.png) · [hud](./screenshots/w7--single-stratus--recipe-v2--cached--normal--hud.png) |
| Legacy raw | `w7--single-stratus--legacy--cached--density-debug` | [clean](./screenshots/w7--single-stratus--legacy--cached--density-debug--clean.png) |
| Legacy normal | `w7--single-stratus--legacy--cached--normal` | [clean](./screenshots/w7--single-stratus--legacy--cached--normal--clean.png) |

**观察：** debug 中央大孔+灰阶；normal 不规则透绿。非实心白板。

**hybrid：** `w7--single-stratus--{legacy\|recipe-v2}--hybrid--*` 同 pass。

---

## 4. Cirrostratus（前缀 `w7--single-cirrostratus--`）

| 项 | 结果 |
| --- | --- |
| 总判定 | **recipe-v2 未完全过** |
| raw | **pass** |
| normal | **fail** |
| failureClass | **optical/exposure**（非 raw density shaping） |
| timing | median **0.084×**，p90 **0.081×** → **pass** |

**主证据：**

| 角色 | caseId | 文件 |
| --- | --- | --- |
| V2 raw | `w7--single-cirrostratus--recipe-v2--cached--density-debug` | [clean](./screenshots/w7--single-cirrostratus--recipe-v2--cached--density-debug--clean.png) · [hud](./screenshots/w7--single-cirrostratus--recipe-v2--cached--density-debug--hud.png) |
| V2 normal | `w7--single-cirrostratus--recipe-v2--cached--normal` | [clean](./screenshots/w7--single-cirrostratus--recipe-v2--cached--normal--clean.png) · [hud](./screenshots/w7--single-cirrostratus--recipe-v2--cached--normal--hud.png) |
| Legacy normal 对照 | `w7--single-cirrostratus--legacy--cached--normal` | [clean](./screenshots/w7--single-cirrostratus--legacy--cached--normal--clean.png) |

**观察：**
- debug：连续幕面 + 上侧明显低密区，有低/中/高灰阶，**不是**近常数高亮平面 → raw **pass**（相对上一轮改善）
- normal：仍偏暗灰丘，高空薄半透明幕层不够明确 → **optical-only follow-up**
- **不归咎** coverage/Base（raw 已过）

**hybrid：** `...--hybrid--density-debug` 与 cached 同 raw 结论。

---

## 5. Altostratus（前缀 `w7--single-altostratus--`）

| 项 | 结果 |
| --- | --- |
| 总判定 | **recipe-v2 pass** |
| failureClass | 无 |
| timing | median **0.133×**，p90 **0.125×** → **pass** |

**主证据：**

| 角色 | caseId | 文件 |
| --- | --- | --- |
| V2 raw | `w7--single-altostratus--recipe-v2--cached--density-debug` | [clean](./screenshots/w7--single-altostratus--recipe-v2--cached--density-debug--clean.png) · [hud](./screenshots/w7--single-altostratus--recipe-v2--cached--density-debug--hud.png) |
| V2 normal | `w7--single-altostratus--recipe-v2--cached--normal` | [clean](./screenshots/w7--single-altostratus--recipe-v2--cached--normal--clean.png) · [hud](./screenshots/w7--single-altostratus--recipe-v2--cached--normal--hud.png) |
| Legacy normal | `w7--single-altostratus--legacy--cached--normal` | [clean](./screenshots/w7--single-altostratus--legacy--cached--normal--clean.png) |

**观察：** debug 多孔隙与峰谷；normal 破碎团块，**无**直边近常数白方板。

---

## 6. Nimbostratus（前缀 `w7--single-nimbostratus--`）

| 项 | 结果 |
| --- | --- |
| 总判定 | **recipe-v2 pass** |
| failureClass | 无 |
| timing | median **0.098×**，p90 **0.100×** → **pass** |

**主证据：**

| 角色 | caseId | 文件 |
| --- | --- | --- |
| V2 raw | `w7--single-nimbostratus--recipe-v2--cached--density-debug` | [clean](./screenshots/w7--single-nimbostratus--recipe-v2--cached--density-debug--clean.png) · [hud](./screenshots/w7--single-nimbostratus--recipe-v2--cached--density-debug--hud.png) |
| V2 normal | `w7--single-nimbostratus--recipe-v2--cached--normal` | [clean](./screenshots/w7--single-nimbostratus--recipe-v2--cached--normal--clean.png) · [hud](./screenshots/w7--single-nimbostratus--recipe-v2--cached--normal--hud.png) |
| Legacy normal | `w7--single-nimbostratus--legacy--cached--normal` | [clean](./screenshots/w7--single-nimbostratus--legacy--cached--normal--clean.png) |

**观察：** debug 低/中/高灰阶+孔隙；normal 厚重斑驳有洞。缺 fractus/precipitation 不记失败。

---

## 7. Stratiform stack（前缀 `w7--w7-stratiform-stack--`）

| 项 | 结果 |
| --- | --- |
| 总判定 | **recipe-v2 未完全过** |
| raw | **pass** |
| normal | **fail** |
| support/metadata | **pass**（bodies=4, ready, no warnings） |
| failureClass | **composition** |
| timing | median **0.061×**，p90 **0.060×** → **pass** |

**主证据：**

| 角色 | caseId | 文件 |
| --- | --- | --- |
| V2 raw | `w7--w7-stratiform-stack--recipe-v2--cached--density-debug` | [clean](./screenshots/w7--w7-stratiform-stack--recipe-v2--cached--density-debug--clean.png) · [hud](./screenshots/w7--w7-stratiform-stack--recipe-v2--cached--density-debug--hud.png) |
| V2 normal | `w7--w7-stratiform-stack--recipe-v2--cached--normal` | [clean](./screenshots/w7--w7-stratiform-stack--recipe-v2--cached--normal--clean.png) · [hud](./screenshots/w7--w7-stratiform-stack--recipe-v2--cached--normal--hud.png) |
| Legacy raw | `w7--w7-stratiform-stack--legacy--cached--density-debug` | [clean](./screenshots/w7--w7-stratiform-stack--legacy--cached--density-debug--clean.png) |

**观察：** 已不是单一白甲板；但 normal 下四属高度/厚度层次仍难清晰分出 → composition fail。不把 timing/TAA 记为形态失败原因。

---

## 8. Stratiform overlap（前缀 `w7--w7-stratiform-overlap--`）

| 项 | 结果 |
| --- | --- |
| 总判定 | **recipe-v2 pass** |
| failureClass | 无 |
| timing | median **0.063×**，p90 **0.062×** → **pass** |

**主证据：**

| 角色 | caseId | 文件 |
| --- | --- | --- |
| V2 raw | `w7--w7-stratiform-overlap--recipe-v2--cached--density-debug` | [clean](./screenshots/w7--w7-stratiform-overlap--recipe-v2--cached--density-debug--clean.png) · [hud](./screenshots/w7--w7-stratiform-overlap--recipe-v2--cached--density-debug--hud.png) |
| V2 normal | `w7--w7-stratiform-overlap--recipe-v2--cached--normal` | [clean](./screenshots/w7--w7-stratiform-overlap--recipe-v2--cached--normal--clean.png) · [hud](./screenshots/w7--w7-stratiform-overlap--recipe-v2--cached--normal--hud.png) |

**观察：** 保留低密区与内部起伏；非全屏近常数直边板；`activeBodyCount=4`、无 warnings。属间主次单帧难量化，未见合成崩溃。

---

## 9. 性能汇总（cache GPU，cached/normal）

| scene | Legacy median→p90 (ms) | V2 median→p90 (ms) | median 比 | p90 比 | Gate |
| --- | ---: | ---: | ---: | ---: | --- |
| single-stratus | 0.159→0.188 | 0.029→0.030 | 0.181 | 0.158 | pass |
| single-cirrostratus | 0.454→0.468 | 0.038→0.038 | 0.084 | 0.081 | pass |
| single-altostratus | 0.239→0.254 | 0.032→0.032 | 0.133 | 0.125 | pass |
| single-nimbostratus | 0.334→0.338 | 0.033→0.034 | 0.098 | 0.100 | pass |
| stack | 0.893→0.919 | 0.054→0.055 | 0.061 | 0.060 | pass |
| overlap | 0.883→0.909 | 0.055→0.056 | 0.063 | 0.062 | pass |

注：V2 绝对值与比值偏低，符合更轻 Stratiform 路径预期，但建议人工确认 timestamp 分段语义；本报告仍按阈值记 **pass**，**不是** owner-waived。

## 10. 失败项分类

| 项 | 分类 |
| --- | --- |
| Cirrostratus V2 normal | **optical/exposure**（raw 已 pass） |
| Stratiform stack V2 normal 层次难辨 | **composition** |
| raw density shaping（Cs/As/Ns/St） | 本轮 **无失败** |
| timing | **pass**（非 unresolved） |

## 11. Gate

**Stop-Review**

原因：Cs normal optical follow-up + stack composition 未达“四属高度可辨”。  
St/As/Ns/overlap 形态与 Cs/As/Ns timing 可过；自动检查全过。
