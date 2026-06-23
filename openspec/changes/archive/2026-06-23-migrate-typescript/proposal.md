## Why

当前全部逻辑集中在单文件 `main.js`（~560 行，含参数打包、mat4 数学、WebGPU 初始化、相机/输入、GUI、渲染循环），无类型、无模块边界。要迁往 React + TypeScript 技术栈，需先把代码迁到 TypeScript 并按职责拆分模块，为后续把渲染封装进组件/hook 打好地基。本提案只做「TS 迁移 + 模块拆分」，不引入 React、不改运行行为。

## What Changes

- 引入 TypeScript 工具链：`tsconfig.json`（strict）、devDeps（`typescript`、`@webgpu/types`、`@types/stats.js`）、`vite-env.d.ts`（含 `*.wgsl?raw` 模块声明）、`package.json` 增 `typecheck` 脚本、`build` 前置类型检查。
- `main.js` 拆分为模块化 `.ts`：
  - `src/math/mat4.ts`：`mat4Perspective/LookAt/Multiply/Invert`。
  - `src/params.ts`：`PARAM_OFFSETS`、`PARAMS_FLOAT_COUNT`、`packParams`、`CLOUD_PRESETS`、`SHAPE_PRESET_KEYS` 及相关类型（`CloudParams`、`PresetKey`）。
  - `src/camera.ts`：轨道相机状态、惯性、指针/滚轮输入、view-proj 计算。
  - `src/renderer.ts`：WebGPU 设备/管线/缓冲/密度缓存资源、bind group、compute+render 帧逻辑。
  - `src/gui.ts`：lil-gui 控件装配，回调以参数对象注入。
  - `src/main.ts`：入口，组合上述模块并启动循环。
- 更新 `index.html` 脚本指向 `/src/main.ts`；`shaders/*.wgsl` 保持 `?raw` 导入。
- 删除迁移后的旧 `main.js`。

## Capabilities

### New Capabilities
- `project-tooling`: 项目使用 TypeScript（strict）与按职责拆分的模块结构，构建含类型检查，且迁移后运行时行为与画面与迁移前一致。

## Impact

- 新增：`tsconfig.json`、`vite-env.d.ts`、`src/math/mat4.ts`、`src/params.ts`、`src/camera.ts`、`src/renderer.ts`、`src/gui.ts`、`src/main.ts`。
- 修改：`package.json`（devDeps + scripts）、`index.html`（script src）。
- 删除：`main.js`。
- 不影响：`shaders/*.wgsl`、`style.css`、渲染算法与参数布局（阶段 1-3 成果）、`vite.config.js` 的 `base`。
- 验收基线：`npm run typecheck` 与 `npm run build` 通过；运行画面与交互与迁移前一致。
