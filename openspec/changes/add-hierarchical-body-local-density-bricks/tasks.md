## 0. Approval and prerequisites

- [x] 0.1 2026-07-16 项目所有者批准 W9 作为 W8 Stop 的架构修复例外先行实施；W8 保持 active/Stop 且不得据此归档
- [x] 0.2 对 W8 当前 `density-cache-production`、`cloud-rendering`、`cloud-params` 八属规范重新核对本 change 的完整 MODIFIED requirements
- [x] 0.3 项目所有者批准推进本 proposal、design、四个 spec delta、16 MiB/32 MiB预算、K=4 与 W9 Continue/Stop Gate
- [x] 0.4 确认 W9 不迁移 Fiber/Convective、不增加新 Hybrid detail、不修改 Recipe layout/shared noise fields/scenario schema
- [x] 0.5 固定目标 WebGPU设备、浏览器、viewport、`96³`、`8×8×4` 与 Legacy/global-only/hierarchical A/B manifests

## 1. Versioned output and storage-mode seam

- [x] 1.1 将 `DensityCacheOutput` 升级为 contract version 2，保留现有 coarse 字段并增加可空只读 hierarchical payload
- [x] 1.2 Legacy 与 global-only V2 输出 `storageMode=global-only`、`hierarchical=null`，RGBA通道/cacheBlend/generation语义不变
- [x] 1.3 增加 CPU-only `densityStorageMode` requested/active/lifecycle/reason，默认 global-only且不进入 Params uniform/WGSL Globals
- [x] 1.4 Hierarchical创建/预热失败时保持健康 global-only V2；Recipe V2整体失败时仍保留 Legacy selector回退
- [x] 1.5 增加 output/layout/storage-mode generation key，确保 cloud/ground-shadow/debug binding与历史不会复用旧资源

## 2. Atlas profiles and fixed-budget allocator

- [x] 2.1 实现 `r16float 160³×2`、`rgba16float 96³×2`、诊断 `rgba8unorm 128³×2` profile及字节/device-limit模型
- [x] 2.2 在 pipeline创建前 probe storage-write/filter-sample；只创建一个 active profile pair，resident payload≤16 MiB
- [x] 2.3 实现 8³ page、2-voxel gutter、逻辑 24/32/48/64 与物理 32/40/56/72 的确定性 first-fit allocator
- [x] 2.4 固定 one-brick-per-Body、档位降级、projected-size/frequency priority与 LOD hysteresis；预算不足降为 nonresident
- [x] 2.5 验证 allocation无重叠/越界、deterministic、尾部归零、增删/重排稳定、resident与 rebuild peak预算

## 3. Brick records and render candidate grid

- [x] 3.1 定义 `DensityBrickRecordGPU` layout version 1、160-byte stride、12-record CPU/WGSL ABI与 reserved-zero约束
- [x] 3.2 Pack Support、world-to-local、atlas scale/bias、genus、edge、generation、LOD；不修改 `DensityRecipeGPU` layout version 2
- [x] 3.3 从 conservative tile-body mask构建每 tile 8-byte、K=4 candidate grid与 generation/signature
- [x] 3.4 count>4、任一 nonresident、generation不一致或 builder失败时标记 overflow/incomplete并强制 coarse fallback
- [x] 3.5 增加 no-false-negative、rotation/wind/edge tile、default 3,456 tile/27,648-byte与 extreme-budget fixtures

## 4. Body-local brick production

- [x] 4.1 新增 format-specialized brick compute pipeline/source，复用 W8 Common Context与 Stratiform/Billow/Cellular evaluator
- [x] 4.2 每个 dispatch只处理一个 compact Body，最多12 dispatch；shader不得包含 render/evaluator 12-body loop或新 family/sample budget
- [x] 4.3 实现 logical interior、2-voxel replicated gutter、body-local→world映射与 scalar density store
- [x] 4.4 双 atlas沿用 global cacheBlend/update cadence；普通无 update帧不编码 brick pass
- [x] 4.5 allocation layout变化时完整 warmup新 pair并原子发布，不跨 layout generation做 temporal blend
- [x] 4.6 一个 cache update最多增加一个 brick compute pass；记录独立 brick timestamp/sample ID/dispatch/voxel统计

## 5. Hierarchical Cached and Hybrid bundles

- [x] 5.1 保持现有 global-only Cached/Hybrid source/layout不变；首次 hierarchical request才异步创建新 bundle
- [x] 5.2 Hierarchical group绑定 coarse sampler/views、brick sampler/views、record buffer与 candidate grid，禁止访问 Producer storage/private bindings
- [x] 5.3 实现固定 `for i<4` sample helper；complete候选时用 brick soft-overlap/top-two结果替换 coarse
- [x] 5.4 overflow/incomplete/nonresident/invalid generation/out-of-volume时整点返回 coarse，禁止 coarse+brick或部分 brick合成
- [x] 5.5 cloud main ray、light march、density debug与 density-related ground shadow使用同一 hierarchical `densityAtTyped()`
- [x] 5.6 Hierarchical source不得包含 Legacy/Realtime evaluator、Recipe family source、12-body render loop或新的 W12 Hybrid detail

## 6. Lifecycle, LOD and rollback

- [x] 6.1 实现 requested/active storage原子 promotion；candidate warming期间画面保持 global-only V2
- [x] 6.2 切回 global-only时停止 pass并销毁 brick resources；再次请求重新创建/warmup且 generation单调变化
- [x] 6.3 resize、workgroup、Body增删、Support/LOD变化分别维护正确 signature、allocation/content/resource generation
- [x] 6.4 device loss、destroy与异步完成竞态幂等；失败不得发布半初始化 atlas/record/candidate binding
- [x] 6.5 Realtime active或默认 Legacy未请求 V2时 brick pipeline/texture/buffer/bind group/pass/CPU builder均为零

## 7. Diagnostics, manifests and Gate report

- [x] 7.1 HUD/stats增加 requested/active storage、profile/format/dimensions、resident/peak bytes、allocation档位/residency/generation
- [ ] 7.2 报告 candidate complete/overflow/incomplete tiles、average/max candidates、fallback samples与固定 K=4；理论上限不冒充实际调用
- [ ] 7.3 增加 W8 cellular reuse、`w9-brick-lod-sweep`、`w9-brick-overflow`、`w9-thin-ridge-proxy`、lifecycle/resize/device-loss cases
- [x] 7.4 固定 Legacy/global-only/hierarchical camera/time/body/wind/viewport，分离 create/warmup、coarse cache、brick cache、cloud、ground-shadow与总 GPU timing
- [x] 7.5 输出机器可读 W9 Gate report与 source evidence；不得把 FPS/CPU timing/unavailable/owner-waived写成 GPU pass

## 8. Automated validation

- [x] 8.1 增加 output contract、profile budget、allocator、record ABI、candidate grid、fallback与generation tests
- [x] 8.2 增加 source closure检查：K=4、无 render 12-body loop、无新 evaluator family/sample、无 per-body texture/多 brick/compaction
- [x] 8.3 运行现有 density-v2 layout/tile/fields/evaluators、pipeline isolation、genus dispatch与 benchmark manifest checks
- [x] 8.4 运行 `npm run typecheck`、`npm run build` 与 `openspec validate add-hierarchical-body-local-density-bricks --strict --no-interactive`
- [x] 8.5 静态确认 W8 八属、Legacy、Realtime、Optical、scenario/preset与 W5 shared fields无回归

## 9. Manual WebGPU acceptance

- [x] 9.1 完成 Legacy/global-only/hierarchical、Cached/Hybrid、normal/raw debug的 W8 cellular与 W9新增场景截图矩阵
- [ ] 9.2 确认小型 Cellular尺度/层厚/ripple与 thin-ridge proxy相对 global-only有明确中尺度改善
- [ ] 9.3 确认 gutter/atlas边界、相机、风、LOD、Body增删和 resize无 seam、popping、锁纹、相位跳变或旧 allocation残留
- [ ] 9.4 确认 overlap metadata与密度有限非负、无双重增密/Support leak；5+ candidate场景整点回退 coarse
- [ ] 9.5 确认 format失败、预算不足、device loss、global-only/Legacy/Realtime切换均可见且安全回退

## 10. W9 Gate and handoff

- [ ] 10.1 atlas resident≤16 MiB、brick rebuild peak≤32 MiB、K=4、one-brick/Body与所有协议/生命周期不可豁免项通过
- [x] 10.2 每 timing case完成5+ cache warmup与60+有效timestamp；unavailable/不足保持 Review
- [ ] 10.3 hierarchical cloud median≤1.25×global-only、p90≤1.35×，ground-shadow median≤1.35×、p90≤1.50×；coarse+brick cache-update满足批准的相对/绝对阈值
- [ ] 10.4 项目所有者确认视觉改善足以证明架构收益，并批准 machine-readable Continue；任一核心失败必须 Stop/Review
- [ ] 10.5 只有0–10.4全部解决后才能归档，并允许 W10 Fiber提案依赖 body-local bricks；Stop时 W10必须使用/重审 global-only方案
