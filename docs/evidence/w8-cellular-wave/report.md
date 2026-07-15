# W8 Cellular / Wave 视觉验收报告

OpenSpec：`add-density-v2-cellular-wave-family`  
生成时间：见 `gate-report.json`  
入口：`http://127.0.0.1:5173/procedural-clouds/?benchmark=1`  
浏览器：Google Chrome（Playwright `channel=chrome`）+ `--enable-unsafe-webgpu --ignore-gpu-blocklist --disable-gpu-sandbox`  
viewport：1400×900  

## Gate

| 项 | 状态 |
| --- | --- |
| decision | **stop** |
| automated | pass |
| runtimeWebGpu | pass（64 case 截图齐；Cb Legacy timing 超时） |
| visual | **fail** |
| performance | **pass**（Sc/Ac/Cc cached） |
| rollback | pass |
| ownerApproval | **pending**（未勾选） |
| archiveAllowed | false |

**建议：Stop。不要更新 OpenSpec tasks 9.1–10.3 为完成；10.4 保持未勾选。**

## 采集规模

- case：64
- 截图：128（`screenshots/*--hud.png` + `*--clean.png`）
- 脚本：`capture-w8.mjs`

## 按 scene 结论（Legacy / V2 × normal / density-debug）

### single-stratocumulus — **fail**

| | Legacy | Recipe V2 |
| --- | --- | --- |
| normal | 有云 | 离散团块，非高连接厚 Cellular layer |
| density-debug | 有 raw density | 有密度与斑驳，但未形成大 cell 高连接层 |

![Sc V2 normal](screenshots/w8--single-stratocumulus--recipe-v2--cached--normal--clean.png)  
![Sc V2 debug](screenshots/w8--single-stratocumulus--recipe-v2--cached--density-debug--clean.png)

### single-altocumulus — **fail**

V2 normal/debug 均呈孤立 puff，缺少中等 cell 连接；与 Sc/Cc 尺度区分不足。

![Ac V2 normal](screenshots/w8--single-altocumulus--recipe-v2--cached--normal--clean.png)  
![Ac V2 debug](screenshots/w8--single-altocumulus--recipe-v2--cached--density-debug--clean.png)

### single-cirrocumulus — **review**

存在小尺度离散 cell，未见明显棋盘/锁纹；连续 ripple 与极薄 profile 证据不足。

![Cc V2 normal](screenshots/w8--single-cirrocumulus--recipe-v2--cached--normal--clean.png)  
![Cc V2 debug](screenshots/w8--single-cirrocumulus--recipe-v2--cached--density-debug--clean.png)

### w8-cellular-scale — **fail**

同视域未严格可辨 `Sc > Ac > Cc` 的 cell 尺度与层厚。

![scale V2 debug](screenshots/w8--w8-cellular-scale--recipe-v2--cached--density-debug--clean.png)

### w8-cellular-overlap — **review**

未见明显黑洞/闪断；**无 RGBA metadata readback** → metadata **unresolved**。

![overlap V2 debug](screenshots/w8--w8-cellular-overlap--recipe-v2--cached--density-debug--clean.png)

### w8-wave-ripple — **unresolved**

单帧未见棋盘/锁纹；固定相位连续 ripple 无法仅凭单帧确认。

![wave V2 debug](screenshots/w8--w8-wave-ripple--recipe-v2--cached--density-debug--clean.png)

### Cb / Ci 回退 — **pass**

| case | 结论 |
| --- | --- |
| Cb/Ci Recipe V2 normal | 空（仅地面）；`active=recipe-v2` `lifecycle=ready` |
| Cb/Ci Recipe V2 density-debug | 全黑（0 non-black pixels） |
| Cb/Ci Legacy | 可见云/密度，锚点未坏 |

![Cb V2 debug 空](screenshots/w8--single-cumulonimbus--recipe-v2--cached--density-debug--clean.png)  
![Cb Legacy normal](screenshots/w8--single-cumulonimbus--legacy--cached--normal--clean.png)  
![Ci V2 debug 空](screenshots/w8--single-cirrus--recipe-v2--cached--density-debug--clean.png)  
![Ci Legacy normal](screenshots/w8--single-cirrus--legacy--cached--normal--clean.png)

## Recipe V2 协议检查

对 V2 case：`requested=recipe-v2`、`active=recipe-v2`、`lifecycle=ready`；enabled/unsupported genera 符合预期；Sc/Ac/Cc `sampleLimits=[3,0,0,0]`。  
`actualEvaluatorCalls` 运行时为 `null`（非字符串 `unavailable`）→ **unresolved**，未伪造。  
采集中曾因把数组 sampleLimits 误判为 object 字段而标 invalid，已在 `build-gate.mjs` 纠正。

## Timing（cached + normal）

| scene | Legacy median / p90 | V2 median / p90 | median ratio | p90 ratio | 分类 |
| --- | --- | --- | --- | --- | --- |
| single-stratocumulus | 0.1157 / 0.1649 | 0.0379 / 0.0389 | 0.327 | 0.236 | pass |
| single-altocumulus | 0.1393 / 0.2028 | 0.0369 / 0.0379 | 0.265 | 0.187 | pass |
| single-cirrocumulus | 0.1679 / 0.2499 | 0.0369 / 0.0379 | 0.220 | 0.152 | pass |

样本均 ≥60。`w8--single-cumulonimbus--legacy--cached--normal` warmup 后超时 → 该 case timing **unresolved**（不在三属性能门内）。

## invalid / fail / unresolved

- **visual fail scenes**：Sc、Ac、cellular-scale（相关 case 见 `gate-report.json` → `visual.failCases`）
- **unresolved**：wave-ripple 连续相位；全矩阵 metadata；overlap support/tile；`actualEvaluatorCalls=null`；Cb Legacy timing 超时
- **runtime invalid（纠正后）**：0（无 WebGPU validation / NaN）

## OpenSpec tasks

- **不建议**勾选 9.1–10.3 为完成（视觉 Gate 失败）
- **10.4 项目所有者批准必须保持未勾选**
- 不要归档 change
