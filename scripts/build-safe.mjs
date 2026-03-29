import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { loadWorkspaceEnv } from './env-utils.mjs';
import {
  pathExists,
  pathNeedsShadow,
  prepareShadowWorkspace,
  runCommand,
} from './shadow-workspace.mjs';

loadWorkspaceEnv();

async function syncBuildBack(shadowRoot, sourceRoot) {
  const shadowNext = path.join(shadowRoot, '.next');
  if (!(await pathExists(shadowNext))) {
    throw new Error('Shadow build did not produce .next output');
  }

  const sourceNext = path.join(sourceRoot, '.next');
  await mkdir(sourceNext, { recursive: true });

  for (const dir of ['standalone', 'static']) {
    const from = path.join(shadowNext, dir);
    if (!(await pathExists(from))) continue;
    const to = path.join(sourceNext, dir);
    await rm(to, { recursive: true, force: true });
    await cp(from, to, { recursive: true, force: true });
  }

  for (const file of [
    'BUILD_ID',
    'required-server-files.json',
    'prerender-manifest.json',
    'routes-manifest.json',
    'build-manifest.json',
    'app-build-manifest.json',
    'react-loadable-manifest.json',
  ]) {
    const from = path.join(shadowNext, file);
    if (!(await pathExists(from))) continue;
    await cp(from, path.join(sourceNext, file), { force: true });
  }
}

async function buildInCurrentRoot(root) {
  runCommand('pnpm', ['exec', 'next', 'build', '--webpack'], { cwd: root });
  runCommand('node', ['scripts/prepare-standalone.mjs'], { cwd: root });
}

async function main() {
  const root = process.cwd();
  if (pathNeedsShadow(root)) {
    const shadowRoot = await prepareShadowWorkspace({
      root,
      bucket: 'REY30_shadow_build',
      binaryRelativePath: [
        'node_modules',
        '.bin',
        process.platform === 'win32' ? 'next.cmd' : 'next',
      ],
      ensurePrisma: true,
    });
    process.stdout.write(`Detected '#' in path. Building in shadow workspace:\n${shadowRoot}\n`);
    await buildInCurrentRoot(shadowRoot);
    await syncBuildBack(shadowRoot, root);
    return;
  }
  await buildInCurrentRoot(root);
}

main().catch((error) => {
  process.stderr.write(`build-safe failed: ${String(error?.message || error)}\n`);
  process.exitCode = 1;
});
