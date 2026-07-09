# Project Context

## Purpose

浏览器端实时程序化体积云渲染 demo / 研究项目。目标是在 WebGPU 上实现 WMO 十属云的可交互预览：多云体编辑、风平流、生命周期、场景时间轴、密度缓存与多种质量模式，并逐步提升观感（见 `docs/roadmap-v2.md`）。

当前优先级：**快速观感 demo**（roadmap 速通路径 1→2→4→5→7）；商业级上限走 Track A（roadmap 阶段 13）。

## Tech Stack

- **语言**：TypeScript（`strict`，`verbatimModuleSyntax`）
- **图形**：WebGPU + WGSL（`shaders/cloud.wgsl`、`shaders/noise.wgsl`）
- **构建**：Vite 6（ESM，`?raw` 导入 shader）
- **UI**：lil-gui + 自研 i18n（`src/i18n.ts`，中英切换）
- **性能**：stats.js
- **部署**：GitHub Pages（`base: /procedural-clouds/`，`npm run deploy`）
- **规格驱动**：OpenSpec（`openspec/specs/`、`openspec/changes/`）

无 React/Vue 等框架；纯 Canvas + TS 模块。

## Project Conventions

### Code Style

- TypeScript `strict` 模式，`noUnusedLocals`、`noImplicitReturns` 开启；提交前须 `npm run typecheck` 通过
- ES2022 模块；类型用 `import type`（`verbatimModuleSyntax`）
- 工厂函数命名：`createXxx()`（如 `createRenderer`、`createBodyStore`）
- 参数常量集中定义于 `src/params.ts`（`PARAM_OFFSETS`、GPU pack 布局）
- UI / 文档术语遵循 `docs/glossary.md`：
  - 云的种类 → **云属 / Genus**（不用 "Type"）
  - 场景中一朵云 → **云体 / Body**（`region` 已废弃，仅 scenario JSON 向后兼容）
  - **高度 / 盒体高度 / 高度剖面** 三者含义不可混用
- 注释与 UI 标签默认中文；代码标识符英文 camelCase / PascalCase
- 着色器内联 WGSL 字符串或 `?raw` 导入；后处理 shader 暂内联于 `renderer.ts`

### Architecture Patterns

```
main.ts          ← 入口，装配子系统、渲染循环
├── params.ts    ← 全局参数、GPU uniform 打包（叶子模块）
├── body.ts      ← 云体 CRUD、形状、预设引用
├── weather.ts   ← 天气图（2D 足迹纹理）
├── lifecycle.ts ← 单云体生命周期包络
├── scenario.ts  ← 场景 JSON 时间轴
├── renderer.ts  ← WebGPU 管线、raymarch、后处理
├── camera.ts    ← 城建风格相机（可平移 look-at + 环绕）
├── gui.ts       ← lil-gui 面板
├── gizmo.ts     ← 3D 编辑 gizmo
└── math/        ← 纯数学（叶子模块，不依赖子系统）
```

- **依赖方向单向无环**：叶子模块（`params`、`math`）不得依赖 `renderer` / `gui` 等
- **GPU 数据流**：TS 侧 pack → uniform / storage buffer → WGSL struct；云体上限 `MAX_BODIES = 12`
- **渲染管线**：offscreen `rgba16float` HDR → post pass（tonemap / godray / TAA 等）→ swapchain
- **质量模式**：cached / hybrid / realtime，密度取样经统一入口（见 `cloud-rendering` spec）
- **变更流程**：非 trivial 功能走 OpenSpec proposal → approve → implement → archive；bug fix 可直接改

### Testing Strategy

- **自动化**：仅 `npm run typecheck`（`tsc --noEmit`）；无单元/集成测试框架
- **手动验收**：截图对比 + stats.js 帧时间；roadmap 各阶段有明确验收项
- **回归**：观感类改动须 GUI 开关 A/B 对比；数学密集改动（TAA、重投影等）须最小可关闭版本
- **OpenSpec**：变更完成须 `openspec validate <change-id> --strict --no-interactive` 通过

### Git Workflow

- 主分支 `main`；功能分支如 `dev-edged`、`dev-no-edge`
- Commit message 英文、动词开头（如 `Implement …`、`Enhance …`、`Refactor …`）
- 部署：`npm run deploy` → `gh-pages` 推送 `dist/`
- 规格归档：`openspec archive <change-id> --yes`，目录移入 `openspec/changes/archive/YYYY-MM-DD-<name>/`

## Domain Context

### 核心概念

| 概念 | 代码 | 说明 |
|---|---|---|
| 云体 Body | `CloudBody` | 场景中一朵具体的云 |
| 云属 Genus | `body.type` / `CLOUD_TYPES` | WMO 十属模板 |
| 预设 Preset | `CLOUD_PRESETS` | 云属的形态 + 光照参数组 |
| 天气图 Weather Map | `weather.ts` | 云体 XZ 足迹 2D 纹理 |
| 场景 Scenario | `scenario.ts` | JSON 时间轴脚本 |
| 生命周期 Lifecycle | `lifecycle.ts` | 单云体 生成→生长→衰减→消亡 |

### OpenSpec 能力（`openspec list --specs`）

`cloud-body`、`cloud-lifecycle`、`cloud-params`、`cloud-presets`、`cloud-rendering`、`cloud-scenario`、`cloud-weather`、`cloud-wind`、`project-tooling`

### 参考文档

- `docs/glossary.md` — 术语表（代码/UI/文档须统一）
- `docs/roadmap-v2.md` — 当前开发路线（14 阶段，含模型分工建议）
- `docs/cloud-types-review.md` — 云属覆盖与演化差距分析
- `docs/shadow.md` — 阴影相关技术笔记
- `reference/` — 参考实现（Vite 静态服务 `/reference/`）

### 已知限制

- 十属齐全但缺种/变型（如积云发育阶段、Cb 砧顶）
- 云属高度带（`altBase`/`altTop`）尚未强制绑定渲染
- scenario 换类型为离散突变，无 genus 间形态过渡

## Important Constraints

- **运行时**：须浏览器支持 WebGPU（Chrome/Edge 等）；无 CPU fallback
- **性能**：实时 60fps 目标；密度缓存、自适应步进、TAA 等须可开关回退
- **精度**：swapchain 非 sRGB，gamma 须手动 `pow(1/2.2)` 于 post 末尾
- **观感校准**：tonemap / 大气 / 密度重写后须重校准（roadmap ★校准点 1/2）
- **变更范围**：AI 助手默认最小 diff；非请求功能不擅自扩展
- **云体上限**：`MAX_BODIES = 12`，GPU buffer 布局与此绑定

## External Dependencies

| 依赖 | 用途 |
|---|---|
| WebGPU API | 图形渲染（无 polyfill） |
| lil-gui | 调试参数面板 |
| stats.js | FPS / 帧时间 |
| Vite | 开发服务器与打包 |
| gh-pages | GitHub Pages 部署 |
| `@webgpu/types` | WGSL / GPU 类型定义 |

无后端、无外部 API、无数据库。场景数据为本地 JSON（import / 文件加载）。
