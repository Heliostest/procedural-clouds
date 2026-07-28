import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer } from 'vite';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(OUT, '../../..');

const viteServer = await createServer({
  root,
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, strictPort: false },
});
await viteServer.listen();
const address = viteServer.httpServer?.address();
const base = `http://127.0.0.1:${address.port}/procedural-clouds/?benchmark=1`;
console.log(JSON.stringify({ base }, null, 2));

const child = spawn(process.execPath, [path.join(OUT, 'capture-w11-visual.mjs')], {
  cwd: root,
  env: { ...process.env, W11_BASE_URL: base },
  stdio: 'inherit',
});

const code = await new Promise((resolve) => {
  child.on('exit', (exitCode) => resolve(exitCode ?? 1));
});
await viteServer.close();
process.exit(code);
