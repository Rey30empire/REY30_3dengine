import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { loadWorkspaceEnv } from './env-utils.mjs';
import { applyResolvedLocalPostgresEnv } from './local-postgres.mjs';
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

async function restorePrismaClient(root, attempts = 5) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      runCommand('pnpm', ['exec', 'prisma', 'generate'], { cwd: root });
      if (attempt > 1) {
        process.stdout.write(`Prisma client restore succeeded on retry ${attempt}.\n`);
      }
      return;
    } catch (error) {
      if (attempt === attempts) {
        throw new Error(
          `Unable to restore the full Prisma client after --no-engine fallback. Run "pnpm run db:generate" before DB-backed tests. Last error: ${String(
            error?.message || error
          )}`
        );
      }

      const waitMs = attempt * 750;
      process.stdout.write(
        `Retrying Prisma client restore in ${waitMs}ms (${attempt}/${attempts - 1} retries used)...\n`
      );
      await delay(waitMs);
    }
  }
}

async function buildInCurrentRoot(root, { restorePrismaAfterFallback = root === process.cwd() } = {}) {
  let fallbackUsed = false;
  let buildError = null;
  const forceNoEngineFallback =
    String(process.env.REY30_FORCE_PRISMA_NO_ENGINE_FALLBACK || '')
      .trim()
      .toLowerCase() === 'true';

  try {
    if (forceNoEngineFallback) {
      throw new Error('Forced --no-engine fallback for stability validation.');
    }
    runCommand('pnpm', ['exec', 'prisma', 'generate'], { cwd: root });
  } catch (error) {
    if (!forceNoEngineFallback && process.platform !== 'win32') {
      throw error;
    }

    if (forceNoEngineFallback) {
      process.stdout.write('Forcing prisma generate --no-engine fallback for stability validation.\n');
    } else {
      process.stdout.write(
        'prisma generate hit a Windows file lock; retrying local build with --no-engine.\n'
      );
    }
    runCommand('pnpm', ['exec', 'prisma', 'generate', '--no-engine'], { cwd: root });
    fallbackUsed = true;
  }

  try {
    runCommand('pnpm', ['exec', 'next', 'build', '--webpack'], { cwd: root });
    runCommand('node', ['scripts/prepare-standalone.mjs'], { cwd: root });
  } catch (error) {
    buildError = error;
  } finally {
    if (fallbackUsed && restorePrismaAfterFallback) {
      process.stdout.write(
        'Restoring the full Prisma client after --no-engine fallback so later DB-backed tests stay deterministic.\n'
      );
      try {
        await restorePrismaClient(root);
      } catch (restoreError) {
        if (buildError) {
          throw new AggregateError(
            [buildError, restoreError],
            'Build failed and Prisma client restore also failed.'
          );
        }
        throw restoreError;
      }
    }
  }

  if (buildError) {
    throw buildError;
  }
}

async function main() {
  const root = process.cwd();
  await applyResolvedLocalPostgresEnv(process.env);
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
    await buildInCurrentRoot(shadowRoot, { restorePrismaAfterFallback: false });
    await syncBuildBack(shadowRoot, root);
    return;
  }
  await buildInCurrentRoot(root);
}

main().catch((error) => {
  process.stderr.write(`build-safe failed: ${String(error?.message || error)}\n`);
  process.exitCode = 1;
});
