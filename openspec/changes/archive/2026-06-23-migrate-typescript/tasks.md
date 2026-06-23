## 1. TypeScript 工具链

- [x] 1.1 装 devDeps：`typescript`、`@webgpu/types`、`@types/stats.js`
- [x] 1.2 新增 `tsconfig.json`（strict / ESNext / Bundler / noEmit / types:[@webgpu/types]）
- [x] 1.3 新增 `vite-env.d.ts`（vite/client + `*.wgsl?raw` 模块声明）
- [x] 1.4 `package.json` 增 `typecheck` 脚本、`build` 前置 `tsc --noEmit`

## 2. 拆分叶子模块

- [x] 2.1 `src/math/mat4.ts`：迁 `mat4Perspective/LookAt/Multiply/Invert`，加类型
- [x] 2.2 `src/params.ts`：迁 `PARAM_OFFSETS`/`PARAMS_FLOAT_COUNT`/`packParams`/`CLOUD_PRESETS`/`SHAPE_PRESET_KEYS`，导出 `CloudParams`/`PresetKey` 类型

## 3. 拆分子系统模块

- [x] 3.1 `src/camera.ts`：轨道相机状态/惯性/指针/滚轮/view-proj，自管监听
- [x] 3.2 `src/renderer.ts`：设备/管线/缓冲/密度缓存资源/bind group/compute+render 帧逻辑，内部持有可变状态
- [x] 3.3 `src/gui.ts`：lil-gui 控件装配 + hooks（onPreset/onCacheResolution）

## 4. 入口与清理

- [x] 4.1 `src/main.ts`：装配各模块 + rAF 循环 + 预设过渡推进
- [x] 4.2 `index.html` script src 指向 `/src/main.ts`
- [x] 4.3 删除旧 `main.js`

## 5. 验收

- [x] 5.1 `npm run typecheck` 无错误
- [x] 5.2 `npm run build` 通过
- [x] 5.3 运行核对：相机交互、预设切换过渡、风平流、缓存混合与迁移前一致
- [x] 5.4 `openspec validate migrate-typescript --strict` 通过
