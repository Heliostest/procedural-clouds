## Context

`main.js` 单文件结构：第 1-6 行导入（`*.wgsl?raw`、lil-gui、stats.js）；12-77 行参数层（`PARAM_OFFSETS`/`packParams`/`CLOUD_PRESETS`）；83-160 行 mat4 数学；167+ 行 `initWebGPU()` 内联了设备初始化、管线、密度缓存资源、相机/输入、GUI、帧循环。依赖：`vite`（已支持 TS，无需额外插件）、`lil-gui`、`stats.js`。

迁移为非行为变更：参数 std140 布局（阶段 1-3）、WGSL、渲染算法均不动，仅加类型并切模块边界。

## Goals / Non-Goals

**Goals:**
- 全量 TS（strict），消除隐式 any。
- 按职责拆模块，依赖单向：`main → {renderer, gui, camera, params, math}`。
- 构建链含 `typecheck`；运行画面/交互与迁移前一致。

**Non-Goals:**
- 不引入 React/JSX（下一提案）。
- 不改渲染算法、参数布局、WGSL。
- 不重写数学库为第三方（保留现有手写 mat4）。
- 不改 `vite.config.js` 的 `base`/部署。

## Decisions

### D1：模块边界
- `math/mat4.ts`：纯函数，返回 `Float32Array`，输入 `readonly number[]`/`Float32Array`。
- `params.ts`：导出 `PARAM_OFFSETS`、`packParams(dst, values)`、`CLOUD_PRESETS`、类型 `CloudParams`/`PresetKey`/`ShapeKey`；`packParams` 的 `values` 用 `Partial<Record<string, number|boolean|number[]>>` 收敛。
- `camera.ts`：`createOrbitCamera(canvas)` 返回 `{ update(), getViewProj(aspect), eye }` 并自管指针/滚轮监听。
- `renderer.ts`：`createRenderer(device, context, format, shaderSource)` 暴露 `resizeDensity(res)`、`renderFrame(state)`；内部持有管线/缓冲/缓存。
- `gui.ts`：`createGui(params, hooks)`，hooks 含 `onPreset`、`onCacheRes`。
- `main.ts`：装配 + `requestAnimationFrame` 循环。

### D2：WGSL ?raw 类型
新增 `vite-env.d.ts`：`declare module '*.wgsl?raw' { const s: string; export default s; }` 并 `/// <reference types="vite/client" />`。

### D3：tsconfig
`strict: true`、`module: ESNext`、`moduleResolution: Bundler`、`target: ES2022`、`noEmit: true`（vite 负责打包，tsc 仅类型检查）、`types: ["@webgpu/types"]`。

### D4：构建脚本
`"typecheck": "tsc --noEmit"`，`"build": "tsc --noEmit && vite build"`。dev 仍 `vite`（esbuild 转译，不阻塞于类型）。

## Risks / Trade-offs

- [WebGPU 类型缺失致大量报错] → 装 `@webgpu/types` 并在 tsconfig `types` 引入。
- [拆模块引入循环依赖] → 强制单向依赖，`params`/`math` 为叶子，`renderer/camera/gui` 不互相 import。
- [闭包内可变状态（cacheIndex、prevCacheTime 等）迁出后语义漂移] → 封装进 `renderer` 内部字段，帧循环只传 `params`/时间。
- [画面回归] → 迁移后逐项对比：相机交互、预设切换过渡、风平流、缓存混合。

## Open Questions

- `params.ts` 的 `CloudParams` 是否细分 `ShapeParams`/`WindParams`/`RenderParamsUI` 子类型？倾向先单一扁平 `CloudParams` 接口（与现有 `params` 对象同构），React 阶段再按面板拆分。
