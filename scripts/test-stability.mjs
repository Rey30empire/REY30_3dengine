import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadWorkspaceEnv } from './env-utils.mjs';
import { applyResolvedLocalPostgresEnv } from './local-postgres.mjs';
import { runCommand } from './shadow-workspace.mjs';

export const CRITICAL_SUITE = [
  'tests/integration/assets-upload-api.test.ts',
  'tests/integration/project-library-api.test.ts',
  'tests/integration/texture-paint-api.test.ts',
  'tests/integration/compositor-persist-api.test.ts',
  'tests/unit/editor-session-route.test.ts',
  'tests/unit/editor-session-bridge.test.ts',
  'tests/unit/editor-session-client.test.ts',
  'tests/unit/mcp-route.test.ts',
  'tests/unit/usage-governance-race.test.ts',
  'tests/unit/usage-finops-race.test.ts',
  'tests/integration/usage-finops-concurrency.test.ts',
  'tests/integration/usage-routes.test.ts',
  'tests/unit/test-harness-isolation.test.ts',
];

function parseArgs(argv) {
  const options = {
    iterations: 5,
    exerciseBuild: false,
    reportPath: path.join('output', 'test-stability', 'report.json'),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--iterations') {
      options.iterations = Number(argv[index + 1] || options.iterations);
      index += 1;
      continue;
    }

    if (arg === '--exercise-build') {
      const value = String(argv[index + 1] || 'true').trim().toLowerCase();
      options.exerciseBuild = value !== 'false';
      if (argv[index + 1] && !argv[index + 1].startsWith('--')) {
        index += 1;
      }
      continue;
    }

    if (arg === '--report-path') {
      options.reportPath = String(argv[index + 1] || options.reportPath);
      index += 1;
    }
  }

  if (!Number.isInteger(options.iterations) || options.iterations <= 0) {
    throw new Error(`--iterations must be a positive integer. Received: ${options.iterations}`);
  }

  return options;
}

async function writeReport(reportPath, report) {
  if (!reportPath) return;
  const absolutePath = path.isAbsolute(reportPath)
    ? reportPath
    : path.join(process.cwd(), reportPath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

loadWorkspaceEnv();

async function main() {
  await applyResolvedLocalPostgresEnv(process.env);
  const root = process.cwd();
  const options = parseArgs(process.argv.slice(2));
  const startedAt = new Date().toISOString();
  const report = {
    ok: true,
    startedAt,
    finishedAt: null,
    iterationsRequested: options.iterations,
    completedIterations: 0,
    exerciseBuild: options.exerciseBuild,
    suite: CRITICAL_SUITE,
    iterations: [],
  };

  try {
    for (let iteration = 1; iteration <= options.iterations; iteration += 1) {
      const iterationStartedAt = Date.now();
      process.stdout.write(`\n[test-stability] Iteration ${iteration}/${options.iterations}\n`);

      try {
        if (options.exerciseBuild) {
          runCommand('pnpm', ['run', 'build'], { cwd: root });
        }

        runCommand('node', ['scripts/vitest-safe.mjs', 'run', ...CRITICAL_SUITE], { cwd: root });
        report.completedIterations = iteration;
        report.iterations.push({
          iteration,
          ok: true,
          buildExercised: options.exerciseBuild,
          durationMs: Date.now() - iterationStartedAt,
        });
      } catch (error) {
        report.ok = false;
        report.completedIterations = iteration - 1;
        report.iterations.push({
          iteration,
          ok: false,
          buildExercised: options.exerciseBuild,
          durationMs: Date.now() - iterationStartedAt,
          error: String(error?.message || error),
        });
        break;
      }
    }
  } finally {
    report.finishedAt = new Date().toISOString();
    await writeReport(options.reportPath, report);
  }

  if (!report.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(`test-stability failed: ${String(error?.message || error)}\n`);
  process.exitCode = 1;
});
