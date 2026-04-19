import path from 'node:path';
import { loadWorkspaceEnv } from './env-utils.mjs';
import { applyResolvedLocalPostgresEnv } from './local-postgres.mjs';
import {
  pathNeedsShadow,
  prepareShadowWorkspace,
  runCommand,
} from './shadow-workspace.mjs';

loadWorkspaceEnv();

async function main() {
  const root = process.cwd();
  await applyResolvedLocalPostgresEnv(process.env);
  const args = process.argv.slice(2);
  const vitestArgs = args.length > 0 ? args : ['run'];

  if (!pathNeedsShadow(root)) {
    runCommand('pnpm', ['exec', 'vitest', ...vitestArgs], { cwd: root });
    return;
  }

  const shadowRoot = await prepareShadowWorkspace({
    root,
    bucket: 'REY30_shadow_tests',
    binaryRelativePath: [
      'node_modules',
      '.bin',
      process.platform === 'win32' ? 'vitest.cmd' : 'vitest',
    ],
    ensurePrisma: true,
  });
  process.stdout.write(`Detected '#' in path. Running tests in shadow workspace:\n${shadowRoot}\n`);
  runCommand('pnpm', ['exec', 'vitest', ...vitestArgs], { cwd: shadowRoot });
}

main().catch((error) => {
  process.stderr.write(`vitest-safe failed: ${String(error?.message || error)}\n`);
  process.exitCode = 1;
});
