import { execFileSync, spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const outputDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(outputDirectory, '..', '..', '..');
const npm = 'npm';
const openspec = process.platform === 'win32'
  ? path.join(process.env.APPDATA, 'npm', 'openspec.cmd')
  : 'openspec';
const checks = [
  [npm, ['run', 'test:genus-dispatch']],
  [npm, ['run', 'test:pipeline-isolation']],
  [npm, ['run', 'test:density-v2-layout']],
  [npm, ['run', 'test:density-v2-tiles']],
  [npm, ['run', 'test:density-v2-fields']],
  [npm, ['run', 'test:density-v2-evaluators']],
  [npm, ['run', 'test:w9-bricks']],
  [npm, ['run', 'test:ground-shadow-hash']],
  [npm, ['run', 'test:w8-gate']],
  [npm, ['run', 'typecheck']],
  [npm, ['run', 'build']],
  [openspec, ['validate', 'add-hierarchical-body-local-density-bricks', '--strict', '--no-interactive']],
  [openspec, ['validate', 'add-density-v2-cellular-wave-family', '--strict', '--no-interactive']],
];

const startedAt = new Date().toISOString();
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const results = checks.map(([command, args]) => {
  const started = performance.now();
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  return {
    command: [command, ...args].join(' '),
    exitCode: result.status,
    durationMs: Math.round((performance.now() - started) * 1000) / 1000,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    spawnError: result.error?.message ?? '',
  };
});

const output = {
  schemaVersion: 1,
  startedAt,
  completedAt: new Date().toISOString(),
  revision,
  allPassed: results.every((result) => result.exitCode === 0),
  results,
};

writeFileSync(path.join(outputDirectory, 'automated-checks.json'), `${JSON.stringify(output, null, 2)}\n`, 'utf8');
if (!output.allPassed) process.exitCode = 1;
