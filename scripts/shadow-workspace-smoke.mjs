import { mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadWorkspaceEnv } from './env-utils.mjs';
import { safeWorkspaceName } from './shadow-workspace.mjs';

loadWorkspaceEnv();

function parseArgs(argv) {
  const map = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith('--')) continue;
    const key = value.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      map.set(key, 'true');
      continue;
    }
    map.set(key, next);
    index += 1;
  }
  return map;
}

function runStep(name, cwd, command, args) {
  const startedAt = Date.now();
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
  });

  return {
    name,
    command: [command, ...args].join(' '),
    status: result.status === 0 ? 'passed' : 'failed',
    durationMs: Date.now() - startedAt,
    exitCode: result.status ?? 1,
  };
}

async function writeReport(reportPath, report) {
  const absolutePath = path.isAbsolute(reportPath)
    ? reportPath
    : path.join(process.cwd(), reportPath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const outputDir = args.get('output-dir') || 'output/shadow-workspace-smoke';
  const smokeBaseDir = process.env.LOCALAPPDATA || path.join(root, 'output');
  const junctionParent = path.join(smokeBaseDir, 'REY30_shadow_workspace_smoke');
  const junctionName = `${safeWorkspaceName(path.basename(root))}#workspace-smoke`;
  const junctionRoot = path.join(junctionParent, junctionName);
  const shadowWorkspaceName = safeWorkspaceName(path.basename(junctionRoot));
  const shadowBuckets = [
    path.join(smokeBaseDir, 'REY30_shadow_prisma', shadowWorkspaceName),
    path.join(smokeBaseDir, 'REY30_shadow_typecheck', shadowWorkspaceName),
    path.join(smokeBaseDir, 'REY30_shadow_tests', shadowWorkspaceName),
    path.join(smokeBaseDir, 'REY30_shadow_build', shadowWorkspaceName),
  ];

  await rm(junctionRoot, { recursive: true, force: true }).catch(() => undefined);
  await mkdir(junctionParent, { recursive: true });
  for (const shadowBucket of shadowBuckets) {
    await rm(shadowBucket, { recursive: true, force: true }).catch(() => undefined);
  }
  await symlink(root, junctionRoot, 'junction');

  const steps = [
    runStep('prisma-generate', junctionRoot, 'node', ['scripts/prisma-db-safe.mjs', 'generate']),
    runStep('typecheck', junctionRoot, 'node', ['scripts/typecheck-safe.mjs']),
    runStep('vitest', junctionRoot, 'node', [
      'scripts/vitest-safe.mjs',
      'run',
      'tests/unit/env-utils.test.ts',
      'tests/integration/csrf-proxy.test.ts',
    ]),
    runStep('build', junctionRoot, 'node', ['scripts/build-safe.mjs']),
  ];

  const report = {
    ok: steps.every((step) => step.status === 'passed'),
    sourceRoot: root,
    junctionRoot,
    finishedAt: new Date().toISOString(),
    steps,
  };

  await writeReport(path.join(outputDir, 'report.json'), report);
  await rm(junctionRoot, { recursive: true, force: true }).catch(() => undefined);

  if (!report.ok) {
    const failed = steps.filter((step) => step.status === 'failed').map((step) => step.name);
    throw new Error(`Shadow workspace smoke failed: ${failed.join(', ')}`);
  }
}

main().catch((error) => {
  process.stderr.write(`shadow-workspace-smoke failed: ${String(error?.message || error)}\n`);
  process.exit(1);
});
