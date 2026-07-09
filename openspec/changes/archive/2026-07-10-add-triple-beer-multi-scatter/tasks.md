## 1. 参数与打包
- [x] 1.1 `params.ts`：新增 `msModel`（0=旧 / 1=三指数 Beer），默认 1；确认 `Globals` 槽位与 `BODY_BASE`/`PARAM_OFFSETS`/`packParams` 同步
- [x] 1.2 新路径默认下调 `powderStrength`（建议 0），旧路径默认行为不变；`msModel=0` 时可不强制改 powder
- [x] 1.3 GUI + i18n：光照 folder 增加 MS 模型开关（中英）

## 2. 着色器
- [x] 2.1 `cloud.wgsl`：实现三指数 Beer 可见度（`μ`/`scatterAmount`/`shadowDarkness` 倍率），`msModel` 分支调用旧/新
- [x] 2.2 主循环散射项叠加密度/高度调制乘子（可用同一 `msModel` 门控）
- [x] 2.3 确认不增加 `lightMarchDepth` 步数；`skipLight` 路径仍旁路

## 3. 验收
- [ ] 3.1 `msModel=0` 与引入前截图一致（同场景同参数）
- [ ] 3.2 `msModel=1`：厚积雨云背光不死黑、朝阳侧透光分层可见；薄云不过曝
- [x] 3.3 `npm run typecheck` 通过
