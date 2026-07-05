import { defineConfig } from 'vite';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REF_EXT = /\.(md|glsl)$/;

function referenceStaticPlugin() {
  return {
    name: 'reference-static',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        const marker = '/reference/';
        const idx = url.indexOf(marker);
        if (idx < 0) return next();
        const rel = decodeURIComponent(url.slice(idx + marker.length));
        if (!REF_EXT.test(rel) || rel.includes('..')) return next();
        const file = join(__dirname, 'reference', rel);
        const root = join(__dirname, 'reference');
        if (!file.startsWith(root) || !fs.existsSync(file)) return next();
        res.setHeader('Content-Type', rel.endsWith('.md') ? 'text/markdown; charset=utf-8' : 'text/plain; charset=utf-8');
        fs.createReadStream(file).pipe(res);
      });
    },
    writeBundle(options) {
      const outDir = join(options.dir ?? join(__dirname, 'dist'), 'reference');
      function copyDir(src, dest) {
        if (!fs.existsSync(src)) return;
        fs.mkdirSync(dest, { recursive: true });
        for (const name of fs.readdirSync(src)) {
          if (name === 'index.html') continue;
          const s = join(src, name);
          const d = join(dest, name);
          if (fs.statSync(s).isDirectory()) copyDir(s, d);
          else if (REF_EXT.test(name)) fs.copyFileSync(s, d);
        }
      }
      copyDir(join(__dirname, 'reference'), outDir);
    },
  };
}

export default defineConfig({
  base: '/procedural-clouds/',
  plugins: [referenceStaticPlugin()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        referenceDemo: resolve(__dirname, 'reference.html'),
      },
    },
  },
});
