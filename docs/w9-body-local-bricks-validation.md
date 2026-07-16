# W9 Body-local Density Bricks 视觉与 WebGPU 验收

OpenSpec change：`add-hierarchical-body-local-density-bricks`

当前状态：实现、静态检查、TypeScript、production build、OpenSpec strict validation 与小范围 WebGPU smoke 已完成；完整 108-case 截图、运动/失败路径检查、60+ GPU timestamp 性能对比和项目所有者批准尚未完成。完成前不得归档 W9，也不得据此把 W8 旧 Stop 报告改成 pass。

## 固定矩阵

W9 manifest 含 9 个 scene：

- `single-stratocumulus`
- `single-altocumulus`
- `single-cirrocumulus`
- `w8-cellular-scale`
- `w8-cellular-overlap`
- `w8-wave-ripple`
- `w9-brick-lod-sweep`
- `w9-brick-overflow`
- `w9-thin-ridge-proxy`

每个 scene 包含：

- Legacy/global-only × Cached/Hybrid × normal/density-debug：4 case；
- Recipe V2/global-only × Cached/Hybrid × normal/density-debug：4 case；
- Recipe V2/hierarchical × Cached/Hybrid × normal/density-debug：4 case。

总计 108 case、216 张 HUD/clean 截图。固定 viewport 为 `1280×720`，coarse cache 为 `96³`，workgroup 为 `8×8×4`；性能 case 先完成 5+ cache warmup，再取得 60+ 有效 GPU timestamp 样本。

## 执行命令

仓库根目录：

```powershell
npm run test:genus-dispatch
npm run test:pipeline-isolation
npm run test:density-v2-layout
npm run test:density-v2-tiles
npm run test:density-v2-fields
npm run test:density-v2-evaluators
npm run test:w9-bricks
npm run test:ground-shadow-hash
npm run typecheck
npm run build
openspec validate add-hierarchical-body-local-density-bricks --strict --no-interactive
openspec validate add-density-v2-cellular-wave-family --strict --no-interactive
```

启动页面：

```powershell
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

在另一个终端执行完整采集：

```powershell
node docs/evidence/w9-body-local-bricks/capture-w9.mjs
Copy-Item docs/evidence/w9-body-local-bricks/visual-review.template.json docs/evidence/w9-body-local-bricks/visual-review.json -Force
```

完成视觉判断并填写 `visual-review.json` 后：

```powershell
node docs/evidence/w9-body-local-bricks/build-gate.mjs
```

## 不可豁免判据

- Hierarchical 相对同场 global-only 必须恢复可辨中尺度信息，而不是只增加对比度、条纹、棋盘或噪点。
- `w8-cellular-scale` 必须稳定呈现 Sc 大 cell、Ac 中 cell、Cc 小 cell；层厚顺序也必须可辨。
- `w8-wave-ripple` 的三组 Cc 必须具有连续且 world/body-stable 的相位，不随相机锁定、不跨 Support 或 atlas 边界断裂。
- normal、density-debug、主 ray、light march 与 ground shadow 必须一致；不能 raw density 正常而 normal/阴影出现缺块。
- overlap 中无双重增密、黑洞、NaN/Inf、metadata 错属或 Support leak。
- `w9-brick-overflow` 必须报告 overflow tile 并整点回退 coarse；`maxCandidates=5` 是源集合诊断，不代表 renderer 扫描 5 个 Body。renderer 上限仍为 K=4。
- global-only、Legacy、Realtime 不得常驻或编码 W9 atlas/record/candidate/pipeline 资源。
- atlas resident `<=16 MiB`，rebuild peak `<=32 MiB`，record `=1,920 B`，默认 candidate payload `=27,648 B`。
- GPU 性能必须由 timestamp-query 证明；FPS、CPU timing、主观“看起来流畅”都不能替代。样本不足保持 Review。
- 视觉代理不得把 `ownerApproval` 改为 `approved`，不得归档、commit、push 或修改 Recipe/renderer 代码来掩盖失败。

## 可直接粘给另一个 AI 的提示词

```text
你现在负责 procedural-clouds 的 W9 独立 WebGPU 截图与视觉验收。你只能采集、审阅和写证据文件；不要修改 src/、shaders/、OpenSpec、roadmap 或产品参数，不要 commit/push，不要归档 W8/W9。发现失败必须如实记录，不得通过调 Recipe、曝光、相机或分辨率掩盖。

工作目录：D:\heli-workspace\app\cloudy-cloud\procedural-clouds
验收说明：docs/w9-body-local-bricks-validation.md
OpenSpec：openspec/changes/add-hierarchical-body-local-density-bricks/
旧 W8 Stop 报告：docs/evidence/w8-cellular-wave/report.md

请按以下顺序执行：

1. 先读取验收说明、W9 proposal/design/specs/tasks、W8 Stop 报告和当前 git status。记录 HEAD、dirty 状态；不要清理或覆盖现有代码修改。
2. 运行全部自动检查：test:genus-dispatch、test:pipeline-isolation、test:density-v2-layout、test:density-v2-tiles、test:density-v2-fields、test:density-v2-evaluators、test:w9-bricks、test:ground-shadow-hash、typecheck、build，以及 W8/W9 两个 openspec strict validation。任一失败就保留输出并停止把 Gate 写成 pass。
3. 用支持 WebGPU 的本机 Chrome 启动 http://127.0.0.1:5173/procedural-clouds/?benchmark=1。必须使用真实 WebGPU；不要用静态 HTML、Canvas mock 或软件截图替代。
4. 运行 node docs/evidence/w9-body-local-bricks/capture-w9.mjs。它应采集 108/108 case、216 张 HUD/clean 截图，并生成 docs/evidence/w9-body-local-bricks/results.raw.json。若 timeout、invalid、console/page/WebGPU error、producer/storage fallback 或截图缺失，保留证据，不要跳过后伪报完成。
5. 逐 scene 对比 Legacy、Recipe V2 global-only、Recipe V2 hierarchical；分别检查 Cached/Hybrid 与 normal/density-debug。重点判断：
   - hierarchical 是否真实恢复中尺度形态，而不是增加棋盘、条纹、屏幕锁纹或噪点；
   - w8-cellular-scale 是否稳定满足 Sc > Ac > Cc 的 cell 尺度和层厚；
   - w8-wave-ripple 是否三组相位连续、相机/风稳定；
   - overlap 是否无双重增密、黑洞、metadata 错属、Support leak；
   - w9-brick-lod-sweep 是否无 seam/popping/旧 allocation 残留；
   - w9-brick-overflow 是否出现 overflowTiles>0 并整点 coarse fallback；注意 maxCandidates=5 是源集合诊断，renderer 仍固定 K=4；
   - w9-thin-ridge-proxy 是否比 global-only 保留更连续的细长结构。
6. 除固定矩阵外，使用页面做补充运动检查：缓慢移动/旋转相机，观察 atlas 边界与 LOD；检查固定风场的相位；在 global-only、hierarchical、Legacy、Realtime 间切换，并检查 HUD/diagnostics。不要把补充检查中的参数改变混入固定性能对比。把补充截图放到 docs/evidence/w9-body-local-bricks/supplemental/，在报告中写明操作与结果。
7. 从 visual-review.template.json 复制生成 visual-review.json；evidenceGeneratedAt 必须逐字复制 results.raw.json.generatedAt。每个字段只填 pass/fail/review，给出具体截图文件名和简短理由。ownerApproval 必须保持 pending，不能代替项目所有者批准。
8. 运行 node docs/evidence/w9-body-local-bricks/build-gate.mjs。检查 gate-report.json 和 report.md：
   - runtime 必须 108/108 且截图完整；
   - hierarchical atlas resident<=16 MiB、peak<=32 MiB、record=1920 B、candidate=27648 B；
   - global-only/Legacy 不得保留 brick GPU 资源；
   - 每个性能配对必须 60+ GPU timestamp 样本；不足写 Review；
   - cloud median<=1.25x、p90<=1.35x；ground-shadow median<=1.35x、p90<=1.50x；combined cache-update 满足说明中的相对/绝对阈值。
9. 最终回复中列出：自动检查结果、浏览器/GPU/viewport、108 case与216截图完成数、每个 scene 的判定、所有失败/Review项、性能比值、资源预算、console/WebGPU错误、证据文件路径，以及建议 Stop/Review/Continue。没有项目所有者批准时最终决策至多是 Review。

特别提醒：W9 可能改善 W8 的全局 96³ 低通问题，但不能自动修复 Legacy Cc timeout，也不能把缺失的 Support/metadata 证据改写为 pass。若 hierarchical 更锐但出现规则条纹、棋盘、相机锁纹、风相位断裂或 metadata/Support 回归，应判 fail，而不是“比之前清楚”就判 pass。
```
