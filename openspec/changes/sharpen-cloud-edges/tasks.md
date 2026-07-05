## 1. 预设与控制布局
- [x] 1.1 为 `ShapePreset` 增加 per-genus `edgeHardness`，扩展 `PRESET_VEC4_COUNT`/`PresetShape` 到 p5
- [x] 1.2 增加 `edgeSharpening` 总开关，并把全局 `edgeHardness` 明确为预设硬度倍率
- [x] 1.3 在预设编辑器和渲染 GUI 补齐范围、中英文名称与说明

## 2. 阶段 10 密度塑形
- [x] 2.1 在 `noise.wgsl` 增加可复用 `worley_f1_3d` 与 `curl_noise_3d`
- [x] 2.2 统一取样入口按样本云属执行边缘带解析侵蚀与陡密度传递
- [x] 2.3 高硬度云属使用硬顶、可调底部曲线与高层砧顶足迹
- [x] 2.4 保证关闭总开关或全局倍率为 0 时回退旧密度路径，普通积云默认不变

## 3. 文档与既有构建阻塞
- [x] 3.1 更新 `docs/roadmap-v2.md` 阶段 10 完成项、实现取舍与验收记录
- [x] 3.2 修复 Vite 对已删除 `reference/index.html`/`reference/` 的构建引用

## 4. 验证
- [x] 4.1 `npm run typecheck` 通过
- [x] 4.2 `npm run build` 通过
- [x] 4.3 `openspec validate sharpen-cloud-edges --strict --no-interactive` 与 `openspec validate --all --strict --no-interactive` 通过
- [x] 4.4 浏览器无控制台/WGSL 错误，cumulonimbus 锐化开关 A/B 生效，普通积云默认观感不突变
- [x] 4.5 对比 GPU clouds pass，记录阶段 10 默认开销并复查银边与阶梯条纹

验证记录（2026-07-05）：1200×900、Hybrid、48+4 步下，积雨云场景 `edgeSharpening=false` 的 cloud pass 约 0.77 ms，开启后约 0.97–1.04 ms，默认增量约 0.2–0.27 ms；cache pass 均约 1.8 ms。页面无启动错误或控制台警告，开关可即时关闭并恢复。WebGPU canvas 的浏览器截图接口超时，因此 `docs/roadmap-v2.md` 中阶段 6 银边的人眼重校准仍明确保留为开放项；当前全局银边默认值为 0，本变更未擅自改数值。
