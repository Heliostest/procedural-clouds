# W10 Visual QA Summary

| Item | Value |
| --- | --- |
| Aggregate rows | **78 PASS / 0 FAIL / 13 UNABLE / 9 OBSERVATION** |
| Screenshots (local, gitignored) | 110 — `screenshot-manifest.json` |
| Visual Gate | **UNABLE** |
| Performance Gate | **UNABLE**（稳态 median/p90 已采 ≠ Gate 通过） |
| W10A / W10B | **CONTINUE (owner-approved 2026-07-27)** — visual/performance evidence owner-waived |
| Owner disposition | 2026-07-27 Continue+archive both changes; UNABLE/OBSERVATION 事实保留；W9 disposition 仍 pending |
| Runtime provenance | HEAD `bd266eb`; runtimeSourceMatchesHead=true; gitDirty=true（docs/OpenSpec）；src/shaders clean |

## UNABLE (13)

1–4. 四场景 A vs B 视觉等价（PNG OBS only）  
5. depth/velocity 硬条件  
6. history 污染视觉  
7. hard-reject FN=0  
8. thin-ridge 视觉  
9. coarse-hint 独立开关  
10–11. W10A/W10B performance-gate rows  
12. owner-visual-signoff  
13. resize/camera-cut/device-loss/pipeline suite  

## Steady-state timing（HEAD API only）

- warmup=30, n=60, 1280×720, DPR=1  
- HeadlessChrome + timestamp-query；withdrawn APIs absent  
- W10A modeB cloudCurrent median/p90 ≈ 2.185 / 2.377 ms  
- W10B modeC ≈ 9.245 / 9.681 ms  
- W10B modeD ≈ 11.392 / 12.040 ms  

## Policy

- 未提交 evidence API（markCameraCut/setFixedCanvasSize 等）已撤回，不追认 OpenSpec  
- PNG diff = OBSERVATION；阈值非规范  
- 弱 API（emptySky/wind revision）= OBSERVATION，不升格 hard-visual PASS  

## Validation

| Command | Result |
| --- | --- |
| typecheck (+`W10_TYPECHECK_OK`) | PASS |
| build | PASS |
| test:w10a / w10b-world / w10b-raymarch | PASS |
| smoke:w10 | PASS |
| openspec validate both --strict | valid |
| src/{camera,densityBenchmark,main}.ts vs HEAD | clean |
