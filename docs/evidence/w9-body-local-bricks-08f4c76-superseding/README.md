# W9 superseding evidence — `08f4c76`

本目录是 `add-hierarchical-body-local-density-bricks` 在 revision
`08f4c7683961da047bdb0c971168b7ac8c168f63` 上的新证据集。它独立保留，
仅 supersede `../w9-body-local-bricks/` 中基于 `1257786` 的视觉与性能结论；
旧目录没有被删除或原地改写。

## Source provenance

- Capture revision: `08f4c7683961da047bdb0c971168b7ac8c168f63`
- Capture worktree: detached、clean；`results.raw.json/sourceEvidence.dirty=false`
- Source diff fingerprint: `7c8f21d405fd2a34a12eec7cb785c121639f34e56d0ddd3a96d4fdcfea9489fa`
- Evidence generated: `2026-07-18T13:19:10.692Z`
- Gate generated: `2026-07-18T13:47:14.067Z`
- Canonical matrix: 108/108 cases complete，216/216 PNG（每 case 一张 clean 与一张 HUD）

`results.reverse-order-recapture.json` 与 `results.faac799-same-device.json`
是归因诊断，不替代 clean canonical matrix。前者在生成 canonical outputs 后运行，
所以 source status 会列出 evidence 文件修改；其代码 HEAD 仍为 `08f4c76`。

## Fixed environment and sampling

- OS: Windows 11 Pro `10.0.26200`（build 26200）
- Browser: Google Chrome `150.0.7871.124`，Playwright `1.61.1`
- Browser flags: `--enable-unsafe-webgpu --ignore-gpu-blocklist --disable-gpu-sandbox`
- WebGPU adapter: NVIDIA / Blackwell；host GPU 为 NVIDIA GeForce RTX 5090
- Driver: `32.0.15.9579`，driver date `2026-03-04`
- Viewport: `1280×720`；DPR `1`
- Timing support: `timestamp-query` available；单位为 GPU ms
- Warm-up: 60 rendered frames；每个 timing case 至少 5 次 cache warm-up
- 实测 performance case samples: cloud 119–120，coarse cache 60，brick update 60，ground shadow 60
- Canonical performance pair: Recipe V2 / Cached / normal，global-only 与 hierarchical 同 revision、同 manifest、同浏览器进程、同设备和同采样规则
- Coarse cache: `96³`，workgroup `8×8×4`，update rate `2`
- Active brick profile: `rgba16float-96` / `96³`；`r16float-160` storage probe 在此浏览器失败后按协议回退
- Brick contract: one brick per Body，2-voxel gutter，K=4 candidates，record table 1,920 B，candidate grid 27,648 B
- Brick memory diagnostics: resident 14,155,776 B（13.5 MiB），reported rebuild peak 28,311,552 B（27 MiB）

`environment.snapshot.json` 保存完整 manifest、camera、全局 params、23 个 scene 的
time/body placement/wind/lifecycle 数据与 309 个 case definitions。Gate 使用的九个 W9 scene
及其 108 个 case 是该 snapshot 的子集；每条运行结果另保存 `configFingerprint`。

## Artifact map

- `results.raw.json`: clean canonical 108-case runtime/protocol/timestamp output
- `screenshots/`: 216 张本地 PNG；按 repository policy 被 `docs/evidence/.gitignore` 忽略，但保留在工作区
- `artifact-manifest.sha256`: 包含 ignored PNG 在内的内容哈希
- `visual-review.json`: static-PNG AI review；明确不是 owner approval
- `gate-report.json` / `report.md`: 原 Gate builder 的 machine-readable/human-readable verdict
- `gate-assessment.json` / `gate-assessment.md`: 对 machine Gate 之外的 source/lifecycle audit 与 final-disposition 区分
- `task-audit.md`: W9 task 状态核对
- `revision-delta.md`: 旧 `1257786` 证据为何不能继承
- `results.reverse-order-recapture.json`: 同 revision、同设备，hierarchical→global-only 反向次序复测
- `results.faac799-same-device.json`: 早一 source revision 的同设备归因复测
- `automated-checks.json`: 本轮自动检查命令、exit code 与输出
- `capture-w9.mjs` / `build-gate.mjs`: 生成证据时的脚本快照

## Reproduction without touching old evidence

不要在主工作树直接执行 `npm run capture:w9` 或 `npm run gate:w9`；这两个 package
scripts 固定写入旧 `docs/evidence/w9-body-local-bricks/`。使用 disposable detached worktree：

```powershell
$sourceRepo = 'D:\ws\app\cloudy-cloud\procedural-clouds-heli'
$evidenceRevision = '08f4c7683961da047bdb0c971168b7ac8c168f63'
$captureWorktree = 'D:\ws\app\cloudy-cloud\.w9-evidence-repro-08f4c76'

git -C $sourceRepo worktree add --detach $captureWorktree $evidenceRevision
npm ci --prefix $captureWorktree
npm install --prefix "$captureWorktree\docs\evidence\w8-cellular-wave\_pw" --package-lock=false --ignore-scripts
npm run dev --prefix $captureWorktree -- --host 127.0.0.1 --port 5173
```

在另一个 PowerShell 中执行：

```powershell
$captureWorktree = 'D:\ws\app\cloudy-cloud\.w9-evidence-repro-08f4c76'
$env:W9_BASE_URL = 'http://127.0.0.1:5173/procedural-clouds/?benchmark=1'
npm run capture:w9 --prefix $captureWorktree
npm run gate:w9 --prefix $captureWorktree
```

先检查 detached worktree 的 `results.raw.json/sourceEvidence`，再把新输出复制到新的
superseding 目录。不要把它们复制回旧 `w9-body-local-bricks/`。

## Evidence limits

这次 capture 是固定静态 scene matrix。它没有伪装成以下外部证据：真实 device-loss 注入、
单 case 内 Body 增删/重排、相机跨 LOD 阈值的视频、resize transition、owner approval。
这些缺口与 source audit 发现一起记录在 `gate-assessment.md`。
