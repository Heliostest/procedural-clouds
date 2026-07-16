# W8 Cellular / Wave 视觉验收报告

OpenSpec：`add-density-v2-cellular-wave-family`  
evidenceGeneratedAt：`2026-07-15T13:18:23.052Z`  
入口：`http://127.0.0.1:5173/procedural-clouds/?benchmark=1`  
浏览器：Google Chrome（Playwright `channel=chrome`）+ `--enable-unsafe-webgpu --ignore-gpu-blocklist --disable-gpu-sandbox`  
viewport：1400×900  

## sourceEvidence

| 字段 | 值 |
| --- | --- |
| revision | `3187a4be76ec1057f7d4d8faf91ce7f7678d3715` |
| dirty | `false` |
| diffSha256 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| status | `[]` |
| untracked | `[]` |

本轮工作树干净；`diffSha256` 为空树 SHA（无 tracked/untracked 源码差分）。

## Gate（见 gate-report.json）

建议：**Stop**。不勾选 tasks 9.x/10.x；不归档；不 commit/push。

## 采集规模

- case：64 / 64（`results.length=64`，`caseCount=64`）
- 关联截图：128 / 128（每 case hud+clean；以 `results.raw.json` 路径为准）
- Recipe V2：32 case 均为 `producerRequested=recipe-v2`、`producerActive=recipe-v2`、`lifecycle=ready`；无 invalid/failed/NaN/WebGPU validation
- `actualEvaluatorCalls`：`null` / HUD `unavailable`（未伪造）
- 非 ready：`w8--single-cirrocumulus--legacy--cached--normal` → `timeout-after-warmup`（仍有截图；timing unresolved）

## Console / WebGPU

| 分类 | 结论 |
| --- | --- |
| WebGPU validation | 无 |
| benign | 仅 `http://127.0.0.1:5173/favicon.ico` 404 |
| 其他 console error | 无 |

## 按 scene（Recipe V2；含人工复查）

### single-stratocumulus — **review**（raw pass）

人工：density-debug **比较符合**。normal 未单独确认 → review。  

`screenshots/w8--single-stratocumulus--recipe-v2--cached--density-debug--clean.png`

### single-altocumulus — **fail**

人工：normal / density-debug **确实只是很小的一朵**。  

`screenshots/w8--single-altocumulus--recipe-v2--cached--normal--clean.png`  
`screenshots/w8--single-altocumulus--recipe-v2--cached--density-debug--clean.png`

### single-cirrocumulus — **fail**

人工：density-debug **确实平滑**，无清晰 ripple。  

`screenshots/w8--single-cirrocumulus--recipe-v2--cached--density-debug--clean.png`

### w8-cellular-scale — **fail**

人工：normal / density-debug **都看不出哪个是哪个**。  

`screenshots/w8--w8-cellular-scale--recipe-v2--cached--normal--clean.png`  
`screenshots/w8--w8-cellular-scale--recipe-v2--cached--density-debug--clean.png`

### w8-cellular-overlap — **pass**（形态；support/metadata unresolved）

人工：**确实叠在一起**。Support / RGBA metadata 仍 unresolved。  

`screenshots/w8--w8-cellular-overlap--recipe-v2--cached--density-debug--clean.png`

### w8-wave-ripple — **fail**

人工：**波纹不连续**。  

`screenshots/w8--w8-wave-ripple--recipe-v2--cached--normal--clean.png`

### Cb / Ci 回退 — **pass**

| | 结论 |
| --- | --- |
| Cb/Ci V2 density-debug | 全黑（0 non-black） |
| Cb/Ci V2 normal | 仅地面，无主体云 |
| Cb/Ci Legacy | 可见，锚点未坏 |

## 不可豁免项

| 项 | 结论 |
| --- | --- |
| finite-nonnegative-density-and-metadata | unresolved |
| support-and-tile-mask-containment | unresolved |
| no-checkerboard-camera-lock-or-wind-discontinuity | **fail**（人工：波纹不连续） |

## Timing（cached + normal，Sc/Ac/Cc）

| scene | Legacy median / p90 | V2 median / p90 | median ratio | p90 ratio | 分类 |
| --- | --- | --- | --- | --- | --- |
| single-stratocumulus | 0.1413 / （见 raw） | 0.03584 / 0.0379 | 0.254 | 0.216 | pass（样本 60/60） |
| single-altocumulus | 0.1382 / （见 raw） | 0.03584 / （见 raw） | 0.259 | 0.191 | pass（样本 60/60） |
| single-cirrocumulus | — | 0.03584 / 0.0379 | — | — | **unresolved**（Legacy timeout，无 cache samples） |

整体 performance：**unresolved**（Cc 对缺失）。性能不能覆盖形态失败。

## OpenSpec

- 不勾选 9.1–10.x  
- 不归档  
- ownerApproval 保持 pending；archiveAllowed=false  
