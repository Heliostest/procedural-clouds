# Change: Sharpen cloud edges and cumulonimbus tops

## Why

路线图 v2 阶段 10 尚未落实完整：现有全局 `edgeHardness` 只能对所有云属统一做密度传递，无法保持普通积云不变，也没有积雨云专用的硬顶/砧顶轮廓和边缘解析侵蚀。96³ 密度缓存的三线性低通因此仍让积雨云边缘与云顶显得松软。

## What Changes

- 把 `edgeHardness` 加入每云属预设，并保留全局倍率与总开关用于即时 A/B 回退；默认只显著锐化 cumulonimbus。
- 在 raymarch 取样入口按样本云属执行单调密度传递，使 cached、hybrid、realtime 与光照行进共享同一锐化结果。
- 为高硬度云属改造垂直包络：顶部采用窄过渡硬截断并在高层扩展足迹形成砧顶，底部使用 `baseRoundness` 驱动的平底/圆底曲线。
- 在 `noise.wgsl` 增加可由阶段 13.1 复用的 3D Worley 与解析 curl 域扭曲；仅在硬边密度阈值带内做减密度侵蚀。
- 在预设编辑器和渲染面板提供云属硬度、全局倍率与总开关；补充中英文说明。
- 更新路线图阶段 10 的落实记录，并修复当前 Vite 构建对已不存在 `reference/index.html` 的引用。

## Impact

- Affected specs: new `cloud-edge-shaping` capability
- Affected code: `src/params.ts`, `src/renderer.ts`, `src/gui.ts`, `src/i18n.ts`, `shaders/cloud.wgsl`, `shaders/noise.wgsl`
- Affected docs/tooling: `docs/roadmap-v2.md`, `vite.config.js`
- Depends on: active `per-preset-lighting` change, which already expanded the preset layout to five vec4 slots and exposes density-weighted genus indices to the raymarcher
- Compatibility: `edgeSharpening=false` or global hardness scale `0` restores the pre-stage-10 density path; non-cumulonimbus presets default to zero hardness
