# W7 Stratiform 视觉验收报告（第 2 轮 / r2）

- 日期：2026-07-14
- 轮次目录：`docs/evidence/w7-stratiform-fix/r2/`
- 对照上一轮：[`../report.md`](../report.md)（r1，Intel adapter）
- 机器可读：[`results.json`](./results.json)、[`results.raw.json`](./results.raw.json)
- **Gate 建议：Stop/Review**（Cs + stack/overlap 仍未过；timing unresolved）

## 命名前缀

```text
截图：screenshots/{caseId}--{hud|clean}.png

单属前缀：
  w7--single-stratus--
  w7--single-cirrostratus--
  w7--single-altostratus--
  w7--single-nimbostratus--

家族前缀：
  w7--w7-stratiform-stack--
  w7--w7-stratiform-overlap--

完整 caseId：
  {前缀}{legacy|recipe-v2}--{cached|hybrid}--{normal|density-debug}
```

主证据默认：**cached + clean**。hybrid 结论同 cached，除非另注。

---

## 1. 环境（本轮）

| 项 | 值 |
| --- | --- |
| OS | Windows 10 |
| Browser | Google Chrome（Playwright `channel=chrome`） |
| URL | `http://127.0.0.1:5173/procedural-clouds/?benchmark=1` |
| WebGPU adapter | **NVIDIA ampere**（r1 为 Intel gen-12lp） |
| `timestamp-query` | 可用 |
| 捕获 | 48 cases × 2 = **96 PNG** |
| early timing exit | 12 个 `*--cached--normal` → timing **unresolved** |

说明：本轮**未重跑**全套 `npm test:*` / typecheck / build / openspec；形态证据为新截图。timing 仍不标 pass。

相对 r1 的变化摘要：同一实现提交链上复跑；As/Ns V2 视觉明显好于 r1 的实心板；Cs/stack/overlap 仍未过门。

---

## 2. Stratus（前缀 `w7--single-stratus--`）

| 项 | 内容 |
| --- | --- |
| 总判定 | **recipe-v2 pass** |
| timing | cached/normal = unresolved |

**主证据（据此判定）：**

| 角色 | caseId | 文件 |
| --- | --- | --- |
| V2 raw | `w7--single-stratus--recipe-v2--cached--density-debug` | [clean](./screenshots/w7--single-stratus--recipe-v2--cached--density-debug--clean.png) · [hud](./screenshots/w7--single-stratus--recipe-v2--cached--density-debug--hud.png) |
| V2 normal | `w7--single-stratus--recipe-v2--cached--normal` | [clean](./screenshots/w7--single-stratus--recipe-v2--cached--normal--clean.png) · [hud](./screenshots/w7--single-stratus--recipe-v2--cached--normal--hud.png) |
| Legacy raw | `w7--single-stratus--legacy--cached--density-debug` | [clean](./screenshots/w7--single-stratus--legacy--cached--density-debug--clean.png) |
| Legacy normal | `w7--single-stratus--legacy--cached--normal` | [clean](./screenshots/w7--single-stratus--legacy--cached--normal--clean.png) |

**观察：** debug 非矩形+灰阶/暗斑；normal 不规则且中央透绿（低值区）。非实心白板。

**同前缀 hybrid：**  
`w7--single-stratus--{legacy|recipe-v2}--hybrid--{normal|density-debug}` → 同 pass。

---

## 3. Cirrostratus（前缀 `w7--single-cirrostratus--`）

| 项 | 内容 |
| --- | --- |
| 总判定 | **recipe-v2 fail** |
| timing | cached/normal = unresolved |

**主证据：**

| 角色 | caseId | 文件 |
| --- | --- | --- |
| V2 raw | `w7--single-cirrostratus--recipe-v2--cached--density-debug` | [clean](./screenshots/w7--single-cirrostratus--recipe-v2--cached--density-debug--clean.png) · [hud](./screenshots/w7--single-cirrostratus--recipe-v2--cached--density-debug--hud.png) |
| V2 normal | `w7--single-cirrostratus--recipe-v2--cached--normal` | [clean](./screenshots/w7--single-cirrostratus--recipe-v2--cached--normal--clean.png) · [hud](./screenshots/w7--single-cirrostratus--recipe-v2--cached--normal--hud.png) |
| Legacy raw | `w7--single-cirrostratus--legacy--cached--density-debug` | [clean](./screenshots/w7--single-cirrostratus--legacy--cached--density-debug--clean.png) |
| Legacy normal | `w7--single-cirrostratus--legacy--cached--normal` | [clean](./screenshots/w7--single-cirrostratus--legacy--cached--normal--clean.png) |

**观察：**
- raw：**fail** — 近满屏浅灰雾面，横向灰阶仍弱，不像“有限高度薄带”
- normal：**fail** — 暗灰丘，不是明确可辨的高空薄幕
- raw 非空 → **不归咎** 低 absorption
- producer：`requested=recipe-v2 active=recipe-v2 lifecycle=ready`（见 hud）

**hybrid：** `w7--single-cirrostratus--{legacy|recipe-v2}--hybrid--*` → 同结论。

---

## 4. Altostratus（前缀 `w7--single-altostratus--`）

| 项 | 内容 |
| --- | --- |
| 总判定 | **recipe-v2 pass**（相对 r1 改善） |
| timing | cached/normal = unresolved |

**主证据：**

| 角色 | caseId | 文件 |
| --- | --- | --- |
| V2 raw | `w7--single-altostratus--recipe-v2--cached--density-debug` | [clean](./screenshots/w7--single-altostratus--recipe-v2--cached--density-debug--clean.png) · [hud](./screenshots/w7--single-altostratus--recipe-v2--cached--density-debug--hud.png) |
| V2 normal | `w7--single-altostratus--recipe-v2--cached--normal` | [clean](./screenshots/w7--single-altostratus--recipe-v2--cached--normal--clean.png) · [hud](./screenshots/w7--single-altostratus--recipe-v2--cached--normal--hud.png) |
| Legacy raw | `w7--single-altostratus--legacy--cached--density-debug` | [clean](./screenshots/w7--single-altostratus--legacy--cached--density-debug--clean.png) |
| Legacy normal | `w7--single-altostratus--legacy--cached--normal` | [clean](./screenshots/w7--single-altostratus--legacy--cached--normal--clean.png) |

**观察：**
- raw：**pass** — 峰谷灰阶、软边团块，非均匀实心矩形
- normal：**pass** — 磨砂状团块，有自阴影与地面阴影，非直边白板
- vs r1：r1 normal 曾判直边白板；本轮明显不同

**hybrid：** `w7--single-altostratus--{legacy|recipe-v2}--hybrid--*` → 同 pass。

---

## 5. Nimbostratus（前缀 `w7--single-nimbostratus--`）

| 项 | 内容 |
| --- | --- |
| 总判定 | **recipe-v2 pass**（相对 r1 改善） |
| timing | cached/normal = unresolved |

**主证据：**

| 角色 | caseId | 文件 |
| --- | --- | --- |
| V2 raw | `w7--single-nimbostratus--recipe-v2--cached--density-debug` | [clean](./screenshots/w7--single-nimbostratus--recipe-v2--cached--density-debug--clean.png) · [hud](./screenshots/w7--single-nimbostratus--recipe-v2--cached--density-debug--hud.png) |
| V2 normal | `w7--single-nimbostratus--recipe-v2--cached--normal` | [clean](./screenshots/w7--single-nimbostratus--recipe-v2--cached--normal--clean.png) · [hud](./screenshots/w7--single-nimbostratus--recipe-v2--cached--normal--hud.png) |
| Legacy raw | `w7--single-nimbostratus--legacy--cached--density-debug` | [clean](./screenshots/w7--single-nimbostratus--legacy--cached--density-debug--clean.png) |
| Legacy normal | `w7--single-nimbostratus--legacy--cached--normal` | [clean](./screenshots/w7--single-nimbostratus--legacy--cached--normal--clean.png) |

**观察：**
- raw：**pass** — 斑驳起伏，非常数平顶板
- normal：**pass** — 厚重不规则，含低值穿透区
- 缺 fractus/precipitation **不算** 失败

**hybrid：** `w7--single-nimbostratus--{legacy|recipe-v2}--hybrid--*` → 同 pass。

---

## 6. Stratiform stack（前缀 `w7--w7-stratiform-stack--`）

| 项 | 内容 |
| --- | --- |
| 总判定 | **recipe-v2 fail** |
| timing | cached/normal = unresolved |

**主证据：**

| 角色 | caseId | 文件 |
| --- | --- | --- |
| V2 raw | `w7--w7-stratiform-stack--recipe-v2--cached--density-debug` | [clean](./screenshots/w7--w7-stratiform-stack--recipe-v2--cached--density-debug--clean.png) · [hud](./screenshots/w7--w7-stratiform-stack--recipe-v2--cached--density-debug--hud.png) |
| V2 normal | `w7--w7-stratiform-stack--recipe-v2--cached--normal` | [clean](./screenshots/w7--w7-stratiform-stack--recipe-v2--cached--normal--clean.png) · [hud](./screenshots/w7--w7-stratiform-stack--recipe-v2--cached--normal--hud.png) |
| Legacy raw | `w7--w7-stratiform-stack--legacy--cached--density-debug` | [clean](./screenshots/w7--w7-stratiform-stack--legacy--cached--density-debug--clean.png) |
| Legacy normal | `w7--w7-stratiform-stack--legacy--cached--normal` | [clean](./screenshots/w7--w7-stratiform-stack--legacy--cached--normal--clean.png) |

**观察：** V2 normal 呈单一丘状体，**四属高度/厚度仍不可分**；legacy debug 多层团块更可辨。support/metadata 可辨性 **fail**。

**hybrid：** `w7--w7-stratiform-stack--{legacy|recipe-v2}--hybrid--*` → 同结论。

---

## 7. Stratiform overlap（前缀 `w7--w7-stratiform-overlap--`）

| 项 | 内容 |
| --- | --- |
| 总判定 | **recipe-v2 fail** |
| timing | cached/normal = unresolved |

**主证据：**

| 角色 | caseId | 文件 |
| --- | --- | --- |
| V2 raw | `w7--w7-stratiform-overlap--recipe-v2--cached--density-debug` | [clean](./screenshots/w7--w7-stratiform-overlap--recipe-v2--cached--density-debug--clean.png) · [hud](./screenshots/w7--w7-stratiform-overlap--recipe-v2--cached--density-debug--hud.png) |
| V2 normal | `w7--w7-stratiform-overlap--recipe-v2--cached--normal` | [clean](./screenshots/w7--w7-stratiform-overlap--recipe-v2--cached--normal--clean.png) · [hud](./screenshots/w7--w7-stratiform-overlap--recipe-v2--cached--normal--hud.png) |
| Legacy raw | `w7--w7-stratiform-overlap--legacy--cached--density-debug` | [clean](./screenshots/w7--w7-stratiform-overlap--legacy--cached--density-debug--clean.png) |
| Legacy normal | `w7--w7-stratiform-overlap--legacy--cached--normal` | [clean](./screenshots/w7--w7-stratiform-overlap--legacy--cached--normal--clean.png) |

**观察：** 表面有起伏，但仍偏几何板角；属间光学主次不可辨 → normal/support **fail**；raw **borderline-pass**。

**hybrid：** `w7--w7-stratiform-overlap--{legacy|recipe-v2}--hybrid--*` → 同结论。

---

## 8. 汇总

| 类型前缀 | Legacy | Recipe V2 (r2) | vs r1 V2 |
| --- | --- | --- | --- |
| `w7--single-stratus--` | pass | **pass** | 维持 pass |
| `w7--single-cirrostratus--` | pass | **fail** | 仍 fail |
| `w7--single-altostratus--` | pass | **pass** | r1 fail → **本轮过** |
| `w7--single-nimbostratus--` | pass | **pass** | r1 fail → **本轮过** |
| `w7--w7-stratiform-stack--` | pass | **fail** | 仍 fail |
| `w7--w7-stratiform-overlap--` | pass | **fail** | 仍 fail |

| 性能 | 说明 |
| --- | --- |
| pass | 无 |
| unresolved | 全部 `*--cached--normal`（12 case early exit） |
| owner-waived | 无 |

## 9. Gate

**Stop/Review**

- St/As/Ns：V2 形态可过  
- Cs、stack、overlap：未过  
- timing：unresolved  
- 未再改 shader/bank/参数
