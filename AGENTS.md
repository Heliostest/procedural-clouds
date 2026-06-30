# AGENTS.md

## Cursor Cloud specific instructions

This is a single-product client-side WebGPU app (`procedural-clouds`): Vite + TypeScript + WGSL shaders. No backend, DB, or automated tests/linters exist; `npm run typecheck` (`tsc --noEmit`) is the only static-analysis gate. Standard scripts live in `package.json` (`dev`, `typecheck`, `build`, `preview`).

- Dev server: `npm run dev` (Vite). The app is served under the configured `base` path, so open `http://localhost:5173/procedural-clouds/` (root `/` redirects/404s).
- WebGPU in the cloud VM's Chrome is blocklisted by default. To render, launch Chrome with software rendering flags, e.g.: `google-chrome --disable-gpu-blocklist --enable-unsafe-webgpu --use-angle=swiftshader http://localhost:5173/procedural-clouds/`. Without these, the page shows a "WebGPU not supported" message.
- To see actual clouds, add and enable a Cloud Body in the lil-gui panel and ensure "Show Wireframe" (Global) is off; the default scene is just a sky gradient.
- `npm run build` currently fails: `vite.config.js` declares rollup inputs `reference/index.html` and `reference.html`, but the `reference/` directory does not exist in the repo. This is a pre-existing repo issue, unrelated to environment setup. Use `npm run dev` / `npm run typecheck` for verification.
