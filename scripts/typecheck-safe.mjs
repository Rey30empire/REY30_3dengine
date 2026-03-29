import { spawnSync } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadWorkspaceEnv } from './env-utils.mjs';
import {
  pathNeedsShadow,
  prepareShadowWorkspace,
} from './shadow-workspace.mjs';

const TYPECHECK_DIST_DIR = process.env.REY30_TYPECHECK_DIST_DIR?.trim() || '.next-typecheck';
const GENERATED_TSCONFIG = 'tsconfig.typecheck-safe.generated.json';

loadWorkspaceEnv();

function run(command, args, cwd, extraEnv = {}) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      ...extraEnv,
    },
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with code ${result.status}`);
  }
}

async function writeGeneratedTsconfig(root, distDir) {
  const sourceConfig = JSON.parse(
    await readFile(path.join(root, 'tsconfig.json'), 'utf8')
  );
  const include = (sourceConfig.include ?? []).filter(
    (entry) =>
      entry !== '.next/types/**/*.ts' &&
      entry !== '.next/dev/types/**/*.ts'
  );
  include.push(`${distDir}/types/**/*.ts`, `${distDir}/dev/types/**/*.ts`);

  const exclude = Array.from(
    new Set([...(sourceConfig.exclude ?? []), '.next', '.next/**/*'])
  );

  const generatedPath = path.join(root, GENERATED_TSCONFIG);
  await writeFile(
    generatedPath,
    `${JSON.stringify(
      {
        extends: './tsconfig.json',
        include,
        exclude,
      },
      null,
      2
    )}\n`,
    'utf8'
  );
  return generatedPath;
}

async function main() {
  const originalRoot = process.cwd();
  const root = pathNeedsShadow(originalRoot)
    ? await prepareShadowWorkspace({
        root: originalRoot,
        bucket: 'REY30_shadow_typecheck',
        binaryRelativePath: [
          'node_modules',
          '.bin',
          process.platform === 'win32' ? 'next.cmd' : 'next',
        ],
        ensurePrisma: true,
      })
    : originalRoot;
  const generatedTsconfigPath = await writeGeneratedTsconfig(root, TYPECHECK_DIST_DIR);
  const sharedEnv = {
    REY30_NEXT_DIST_DIR: TYPECHECK_DIST_DIR,
  };

  if (root !== originalRoot) {
    process.stdout.write(`Detected '#' in path. Running typecheck in shadow workspace:\n${root}\n`);
  }

  await rm(path.join(root, TYPECHECK_DIST_DIR), { recursive: true, force: true }).catch(
    () => undefined
  );

  try {
    run('pnpm', ['exec', 'next', 'typegen'], root, sharedEnv);
    run('pnpm', ['exec', 'tsc', '--noEmit', '-p', generatedTsconfigPath], root, sharedEnv);
  } finally {
    await rm(generatedTsconfigPath, { force: true }).catch(() => undefined);
  }
}

main().catch((error) => {
  process.stderr.write(`typecheck-safe failed: ${String(error?.message || error)}\n`);
  process.exitCode = 1;
});
