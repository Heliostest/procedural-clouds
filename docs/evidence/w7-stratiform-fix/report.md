# W7 Stratiform 修复后 WebGPU 视觉验收报告

- 日期：2026-07-14
- 工作目录：`D:\heli-workspace\app\cloudy-cloud\procedural-clouds`
- 证据目录：`docs/evidence/w7-stratiform-fix/`
- 机器可读：[`results.json`](./results.json)、[`results.raw.json`](./results.raw.json)
- **Gate 建议：Stop/Review**

截图命名约定：

```text
screenshots/{caseId}--hud.png
screenshots/{caseId}--clean.png
```

caseId 前缀规则：

```text
单属：w7--single-{stratus|cirrostratus|altostratus|nimbostratus}--{legacy|recipe-v2}--{cached|hybrid}--{normal|density-debug}
家族：w7--w7-stratiform-{stack|overlap}--{legacy|recipe-v2}--{cached|hybrid}--{normal|density-debug}
```

以下「主证据」默认指 **cached + clean**；hybrid 另行列出是否同结论。

---

## 1. 环境

| 项 | 值 |
| --- | --- |
| OS | Windows 10 |
| Browser | Google Chrome（Playwright `channel=chrome`） |
| URL | `http://127.0.0.1:5173/procedural-clouds/?benchmark=1` |
| WebGPU adapter | Intel `gen-12lp` |
| `timestamp-query` | 设备声明可用 |
| 捕获 | 48 cases × 2 = 96 PNG |

timing：warmup≥60 后若 cache timestamp 20s 内不收敛则提前截图，标 `unresolved`。**不以 FPS/CPU/截图当作 cache GPU timing pass。**

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
| `npm run typecheck` | pass |
| `npm run build` | pass |
| `npx openspec validate add-density-v2-stratiform-family --strict --no-interactive` | pass |

---

## 3. 按类型汇报

### 3.1 Stratus（前缀 `w7--single-stratus--`）

| 项 | 内容 |
| --- | --- |
| 总判定 | **recipe-v2 形态 pass**（已非实心白板） |
| timing | cached/normal = unresolved |

**主证据截图（据此判定 V2 pass）：**

| 角色 | caseId | 文件 |
| --- | --- | --- |
| V2 raw | `w7--single-stratus--recipe-v2--cached--density-debug` | [clean](./screenshots/w7--single-stratus--recipe-v2--cached--density-debug--clean.png) · [hud](./screenshots/w7--single-stratus--recipe-v2--cached--density-debug--hud.png) |
| V2 normal | `w7--single-stratus--recipe-v2--cached--normal` | [clean](./screenshots/w7--single-stratus--recipe-v2--cached--normal--clean.png) · [hud](./screenshots/w7--single-stratus--recipe-v2--cached--normal--hud.png) |
| Legacy raw 对照 | `w7--single-stratus--legacy--cached--density-debug` | [clean](./screenshots/w7--single-stratus--legacy--cached--density-debug--clean.png) |
| Legacy normal 对照 | `w7--single-stratus--legacy--cached--normal` | [clean](./screenshots/w7--single-stratus--legacy--cached--normal--clean.png) |

**观察：**
- V2 density-debug：非矩形、孔隙、灰阶起伏 → raw **pass**
- V2 normal：不规则团块 + 中央低值区，非直边实心方板 → normal **pass**
- Legacy：多团块起伏，作参照 → pass

**同前缀其余 case（结论同 cached）：**

- `w7--single-stratus--legacy--hybrid--normal`
- `w7--single-stratus--legacy--hybrid--density-debug`
- `w7--single-stratus--recipe-v2--hybrid--normal`
- `w7--single-stratus--recipe-v2--hybrid--density-debug`

---

### 3.2 Cirrostratus（前缀 `w7--single-cirrostratus--`）

| 项 | 内容 |
| --- | --- |
| 总判定 | **recipe-v2 形态 fail** |
| timing | cached/normal = unresolved |

**主证据截图：**

| 角色 | caseId | 文件 |
| --- | --- | --- |
| V2 raw | `w7--single-cirrostratus--recipe-v2--cached--density-debug` | [clean](./screenshots/w7--single-cirrostratus--recipe-v2--cached--density-debug--clean.png) · [hud](./screenshots/w7--single-cirrostratus--recipe-v2--cached--density-debug--hud.png) |
| V2 normal | `w7--single-cirrostratus--recipe-v2--cached--normal` | [clean](./screenshots/w7--single-cirrostratus--recipe-v2--cached--normal--clean.png) · [hud](./screenshots/w7--single-cirrostratus--recipe-v2--cached--normal--hud.png) |
| Legacy raw 对照 | `w7--single-cirrostratus--legacy--cached--density-debug` | [clean](./screenshots/w7--single-cirrostratus--legacy--cached--density-debug--clean.png) |
| Legacy normal 对照 | `w7--single-cirrostratus--legacy--cached--normal` | [clean](./screenshots/w7--single-cirrostratus--legacy--cached--normal--clean.png) |

**观察：**
- V2 density-debug：近常数高亮平面，横向灰阶不足 → raw **fail**
- V2 normal：暗灰丘/极淡，非明确高空薄幕 → normal **fail**
- raw 非空 → **不归咎** 低 absorption
- 阶段：coverage / Base amplitude / profile 动态范围

**同前缀其余 case：** `w7--single-cirrostratus--{legacy\|recipe-v2}--hybrid--{normal\|density-debug}`（结论同 cached）

---

### 3.3 Altostratus（前缀 `w7--single-altostratus--`）

| 项 | 内容 |
| --- | --- |
| 总判定 | **recipe-v2 形态 fail** |
| timing | cached/normal = unresolved |

**主证据截图：**

| 角色 | caseId | 文件 |
| --- | --- | --- |
| V2 raw | `w7--single-altostratus--recipe-v2--cached--density-debug` | [clean](./screenshots/w7--single-altostratus--recipe-v2--cached--density-debug--clean.png) · [hud](./screenshots/w7--single-altostratus--recipe-v2--cached--density-debug--hud.png) |
| V2 normal | `w7--single-altostratus--recipe-v2--cached--normal` | [clean](./screenshots/w7--single-altostratus--recipe-v2--cached--normal--clean.png) · [hud](./screenshots/w7--single-altostratus--recipe-v2--cached--normal--hud.png) |
| Legacy raw 对照 | `w7--single-altostratus--legacy--cached--density-debug` | [clean](./screenshots/w7--single-altostratus--legacy--cached--density-debug--clean.png) |
| Legacy normal 对照 | `w7--single-altostratus--legacy--cached--normal` | [clean](./screenshots/w7--single-altostratus--legacy--cached--normal--clean.png) |

**观察：**
- V2 density-debug：软边 + 局部低值，但仍偏板 → raw **borderline-pass**
- V2 normal：直边白方板 → normal **fail**
- 定位：Optical/曝光嫌疑 + raw 结构仍偏弱；未授权继续调参

**同前缀其余 case：** `w7--single-altostratus--{legacy\|recipe-v2}--hybrid--{normal\|density-debug}`

---

### 3.4 Nimbostratus（前缀 `w7--single-nimbostratus--`）

| 项 | 内容 |
| --- | --- |
| 总判定 | **recipe-v2 形态 fail** |
| timing | cached/normal = unresolved |

**主证据截图：**

| 角色 | caseId | 文件 |
| --- | --- | --- |
| V2 raw | `w7--single-nimbostratus--recipe-v2--cached--density-debug` | [clean](./screenshots/w7--single-nimbostratus--recipe-v2--cached--density-debug--clean.png) · [hud](./screenshots/w7--single-nimbostratus--recipe-v2--cached--density-debug--hud.png) |
| V2 normal | `w7--single-nimbostratus--recipe-v2--cached--normal` | [clean](./screenshots/w7--single-nimbostratus--recipe-v2--cached--normal--clean.png) · [hud](./screenshots/w7--single-nimbostratus--recipe-v2--cached--normal--hud.png) |
| Legacy raw 对照 | `w7--single-nimbostratus--legacy--cached--density-debug` | [clean](./screenshots/w7--single-nimbostratus--legacy--cached--density-debug--clean.png) |
| Legacy normal 对照 | `w7--single-nimbostratus--legacy--cached--normal` | [clean](./screenshots/w7--single-nimbostratus--legacy--cached--normal--clean.png) |

**观察：**
- V2 density-debug：近常数实心矩形/平顶 → raw **fail**
- V2 normal：实心白甲板 → normal **fail**
- 阶段：coverage / Base / finalize 饱和
- 缺 fractus/precipitation **不算** 本 Wave 失败原因

**同前缀其余 case：** `w7--single-nimbostratus--{legacy\|recipe-v2}--hybrid--{normal\|density-debug}`

---

### 3.5 Stratiform stack（前缀 `w7--w7-stratiform-stack--`）

| 项 | 内容 |
| --- | --- |
| 总判定 | **recipe-v2 形态 fail**（四属层次不可辨） |
| timing | cached/normal = unresolved |

**主证据截图：**

| 角色 | caseId | 文件 |
| --- | --- | --- |
| V2 raw | `w7--w7-stratiform-stack--recipe-v2--cached--density-debug` | [clean](./screenshots/w7--w7-stratiform-stack--recipe-v2--cached--density-debug--clean.png) · [hud](./screenshots/w7--w7-stratiform-stack--recipe-v2--cached--density-debug--hud.png) |
| V2 normal | `w7--w7-stratiform-stack--recipe-v2--cached--normal` | [clean](./screenshots/w7--w7-stratiform-stack--recipe-v2--cached--normal--clean.png) · [hud](./screenshots/w7--w7-stratiform-stack--recipe-v2--cached--normal--hud.png) |
| Legacy raw 对照 | `w7--w7-stratiform-stack--legacy--cached--density-debug` | [clean](./screenshots/w7--w7-stratiform-stack--legacy--cached--density-debug--clean.png) |
| Legacy normal 对照 | `w7--w7-stratiform-stack--legacy--cached--normal` | [clean](./screenshots/w7--w7-stratiform-stack--legacy--cached--normal--clean.png) |

**观察：** V2 呈单一实心白甲板，高度/厚度不可分属；未见明确 tile 缺块/NaN，但形态门失败。

**同前缀其余 case：** `w7--w7-stratiform-stack--{legacy\|recipe-v2}--hybrid--{normal\|density-debug}`

---

### 3.6 Stratiform overlap（前缀 `w7--w7-stratiform-overlap--`）

| 项 | 内容 |
| --- | --- |
| 总判定 | **recipe-v2 形态 fail** |
| timing | cached/normal = unresolved |

**主证据截图：**

| 角色 | caseId | 文件 |
| --- | --- | --- |
| V2 raw | `w7--w7-stratiform-overlap--recipe-v2--cached--density-debug` | [clean](./screenshots/w7--w7-stratiform-overlap--recipe-v2--cached--density-debug--clean.png) · [hud](./screenshots/w7--w7-stratiform-overlap--recipe-v2--cached--density-debug--hud.png) |
| V2 normal | `w7--w7-stratiform-overlap--recipe-v2--cached--normal` | [clean](./screenshots/w7--w7-stratiform-overlap--recipe-v2--cached--normal--clean.png) · [hud](./screenshots/w7--w7-stratiform-overlap--recipe-v2--cached--normal--hud.png) |
| Legacy raw 对照 | `w7--w7-stratiform-overlap--legacy--cached--density-debug` | [clean](./screenshots/w7--w7-stratiform-overlap--legacy--cached--density-debug--clean.png) |
| Legacy normal 对照 | `w7--w7-stratiform-overlap--legacy--cached--normal` | [clean](./screenshots/w7--w7-stratiform-overlap--legacy--cached--normal--clean.png) |

**观察：** V2 合成仍为直边近常数板；属间光学主次不可辨。

**同前缀其余 case：** `w7--w7-stratiform-overlap--{legacy\|recipe-v2}--hybrid--{normal\|density-debug}`

---

## 4. 汇总

| 类型前缀 | Legacy | Recipe V2 | 主证据（V2 cached clean） |
| --- | --- | --- | --- |
| `w7--single-stratus--` | pass | **pass** | `...recipe-v2--cached--density-debug--clean.png` + `...recipe-v2--cached--normal--clean.png` |
| `w7--single-cirrostratus--` | pass | **fail** | 同上命名规则，cirrostratus |
| `w7--single-altostratus--` | pass | **fail** | 同上，altostratus |
| `w7--single-nimbostratus--` | pass | **fail** | 同上，nimbostratus |
| `w7--w7-stratiform-stack--` | pass | **fail** | stack V2 cached clean |
| `w7--w7-stratiform-overlap--` | pass | **fail** | overlap V2 cached clean |

| 性能分类 | 说明 |
| --- | --- |
| pass | 无 |
| fail | 无（样本不足不作 fail） |
| unresolved | 全部 `*--cached--normal` gate timing |
| owner-waived | 无 |

## 5. Gate

**Stop/Review**

- 自动检查 pass  
- 仅 Stratus V2 形态过；Cs/As/Ns/stack/overlap V2 未过  
- timing unresolved  
- 本轮未再改 shader/bank/参数
