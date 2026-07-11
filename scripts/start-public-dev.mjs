import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const localUrl = 'http://127.0.0.1:5173';
const publicUrlPattern = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;
const wranglerBin = resolve(root, 'node_modules/wrangler/bin/wrangler.js');
const viteBin = resolve(root, 'node_modules/vite/bin/vite.js');

let tunnel;
let server;
let tunnelOutput = '';
let stopping = false;

function stopProcessTree(child) {
  if (!child?.pid || child.exitCode !== null) return Promise.resolve();

  if (process.platform !== 'win32') {
    child.kill('SIGTERM');
    return Promise.resolve();
  }

  return new Promise((resolveStop) => {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    killer.once('exit', resolveStop);
    killer.once('error', resolveStop);
  });
}

async function shutdown(code) {
  if (stopping) return;
  stopping = true;
  await Promise.all([stopProcessTree(server), stopProcessTree(tunnel)]);
  process.exit(code);
}

function startServer(publicUrl) {
  if (server || stopping) return;

  const hostname = new URL(publicUrl).hostname;
  console.log(`\nPublic URL ready: ${publicUrl}/procedural-clouds/`);
  console.log(`Allowing only ${hostname} through Vite's host check.\n`);

  server = spawn(
    process.execPath,
    [viteBin, '--host', '127.0.0.1', '--port', '5173', '--strictPort'],
    {
      cwd: root,
      env: {
        ...process.env,
        __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS: hostname,
      },
      stdio: 'inherit',
      windowsHide: true,
    },
  );

  server.once('error', (error) => {
    console.error(`Unable to start Vite: ${error.message}`);
    void shutdown(1);
  });
  server.once('exit', (code) => {
    if (!stopping) void shutdown(code ?? 1);
  });
}

function relayTunnelOutput(chunk, target) {
  target.write(chunk);
  tunnelOutput = `${tunnelOutput}${chunk.toString()}`.slice(-8192);
  const publicUrl = tunnelOutput.match(publicUrlPattern)?.[0];
  if (publicUrl) startServer(publicUrl);
}

console.log(`Creating a temporary Cloudflare tunnel for ${localUrl} ...`);
tunnel = spawn(
  process.execPath,
  [wranglerBin, 'tunnel', 'quick-start', localUrl],
  {
    cwd: root,
    env: process.env,
    stdio: ['inherit', 'pipe', 'pipe'],
    windowsHide: true,
  },
);

tunnel.stdout.on('data', (chunk) => relayTunnelOutput(chunk, process.stdout));
tunnel.stderr.on('data', (chunk) => relayTunnelOutput(chunk, process.stderr));
tunnel.once('error', (error) => {
  console.error(`Unable to start the tunnel: ${error.message}`);
  void shutdown(1);
});
tunnel.once('exit', (code) => {
  if (!stopping) void shutdown(code ?? 1);
});

process.once('SIGINT', () => void shutdown(0));
process.once('SIGTERM', () => void shutdown(0));
