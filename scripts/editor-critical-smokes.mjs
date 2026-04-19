import { spawn, spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { loadWorkspaceEnv } from './env-utils.mjs';

loadWorkspaceEnv();

const CRITICAL_SMOKES = [
  {
    id: 'editor-thumbnails',
    script: 'scripts/editor-thumbnails-smoke.mjs',
    outputDir: 'output/editor-thumbnails-smoke',
    reportPath: 'output/editor-thumbnails-smoke/report.json',
  },
  {
    id: 'editor-world',
    script: 'scripts/editor-world-pipeline-smoke.mjs',
    outputDir: 'output/editor-world-pipeline-smoke',
    reportPath: 'output/editor-world-pipeline-smoke/report.json',
  },
  {
    id: 'editor-library',
    script: 'scripts/editor-project-library-smoke.mjs',
    outputDir: 'output/editor-project-library-smoke',
    reportPath: 'output/editor-project-library-smoke/report.json',
  },
  {
    id: 'editor-sculpt-retopo',
    script: 'scripts/editor-sculpt-retopo-smoke.mjs',
    outputDir: 'output/editor-sculpt-retopo-smoke',
    reportPath: 'output/editor-sculpt-retopo-smoke/report.json',
  },
  {
    id: 'editor-paint',
    script: 'scripts/editor-paint-workflow-smoke.mjs',
    outputDir: 'output/editor-paint-workflow-smoke',
    reportPath: 'output/editor-paint-workflow-smoke/report.json',
  },
  {
    id: 'editor-animation',
    script: 'scripts/editor-animation-smoke.mjs',
    outputDir: 'output/editor-animation-smoke',
    reportPath: 'output/editor-animation-smoke/report.json',
  },
  {
    id: 'editor-simulation',
    script: 'scripts/editor-simulation-smoke.mjs',
    outputDir: 'output/editor-simulation-smoke',
    reportPath: 'output/editor-simulation-smoke/report.json',
  },
  {
    id: 'editor-geometry',
    script: 'scripts/editor-geometry-nodes-smoke.mjs',
    outputDir: 'output/editor-geometry-nodes-smoke',
    reportPath: 'output/editor-geometry-nodes-smoke/report.json',
  },
  {
    id: 'editor-compositor',
    script: 'scripts/editor-compositor-smoke.mjs',
    outputDir: 'output/editor-compositor-smoke',
    reportPath: 'output/editor-compositor-smoke/report.json',
  },
  {
    id: 'editor-content-packs',
    script: 'scripts/editor-content-packs-smoke.mjs',
    outputDir: 'output/editor-content-packs-smoke',
    reportPath: 'output/editor-content-packs-smoke/report.json',
  },
];

function parseArgs(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) continue;
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args.set(item.slice(2), 'true');
      continue;
    }
    args.set(item.slice(2), next);
    index += 1;
  }
  return args;
}

function toPositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeBaseUrl(value, port) {
  if (value && value.trim()) {
    return value.trim().replace(/\/+$/, '');
  }
  return `http://127.0.0.1:${port}`;
}

function runNodeScript(args, envOverrides = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: {
      ...process.env,
      ...envOverrides,
    },
  });

  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status ?? 'unknown'}): ${args.join(' ')}`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildReadyUrl(baseUrl) {
  return `${baseUrl.replace(/\/+$/, '')}/api/health/ready`;
}

async function terminateChildProcessTree(child) {
  if (!child || child.exitCode !== null) {
    return;
  }

  if (process.platform === 'win32' && child.pid) {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
    });
    await sleep(500);
    return;
  }

  try {
    child.kill('SIGTERM');
  } catch {
    return;
  }

  await sleep(1000);
  if (child.exitCode === null) {
    try {
      child.kill('SIGKILL');
    } catch {
      // Best effort cleanup.
    }
  }
}

async function waitForServer(baseUrl, serverProcess, timeoutMs = 60000) {
  const readyUrl = buildReadyUrl(baseUrl);
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (serverProcess.exitCode !== null) {
      throw new Error(`Standalone server exited early with code ${serverProcess.exitCode}`);
    }

    try {
      const response = await fetch(readyUrl, { cache: 'no-store' });
      if (response.status === 200) {
        const payload = await response.json().catch(() => null);
        if (payload?.ok === true && payload?.status === 'ready') {
          return;
        }
      }
    } catch {}

    try {
      const response = await fetch(baseUrl, { cache: 'no-store' });
      if (response.ok) {
        return;
      }
    } catch {}

    await sleep(1000);
  }

  throw new Error(`Standalone server was not ready after ${timeoutMs}ms at ${baseUrl}`);
}

function startStandaloneServer(port) {
  return spawn(process.execPath, ['scripts/start-standalone.mjs'], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: {
      ...process.env,
      PORT: port,
      HOSTNAME: '127.0.0.1',
    },
  });
}

async function restartStandaloneServer(baseUrl, port, serverProcess) {
  await terminateChildProcessTree(serverProcess);
  const nextServerProcess = startStandaloneServer(port);
  await waitForServer(baseUrl, nextServerProcess);
  return nextServerProcess;
}

async function ensureServerReady(baseUrl, port, serverProcess) {
  if (serverProcess && serverProcess.exitCode === null) {
    try {
      await waitForServer(baseUrl, serverProcess, 15000);
      return {
        serverProcess,
        restarted: false,
      };
    } catch {
      // Fall through to restart below.
    }
  }

  return {
    serverProcess: await restartStandaloneServer(baseUrl, port, serverProcess),
    restarted: true,
  };
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function resolveSmokeRunOutputDir(smoke, summaryDir, iteration, totalIterations) {
  if (totalIterations <= 1) {
    return smoke.outputDir;
  }
  return path.join(summaryDir, `iteration-${iteration}`, smoke.id);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const port = String(args.get('port') || process.env.PORT || '3100');
  const baseUrl = normalizeBaseUrl(args.get('base-url'), port);
  const summaryDir = args.get('output-dir') || 'output/editor-critical-smokes';
  const iterations = toPositiveInteger(args.get('iterations'), 1);
  const reportPath = args.get('report-path') || path.join(summaryDir, 'report.json');
  const shouldPrepare = args.get('prepare') !== 'false';
  const shouldStartServer = args.get('start-server') !== 'false';

  await mkdir(summaryDir, { recursive: true });

  if (shouldPrepare) {
    runNodeScript(['scripts/prepare-standalone.mjs']);
  }

  let serverProcess = null;
  let serverRestartCount = 0;
  const iterationReports = [];
  const startedAt = new Date().toISOString();

  try {
    if (shouldStartServer) {
      serverProcess = startStandaloneServer(port);
      await waitForServer(baseUrl, serverProcess);
    }

    for (let iteration = 1; iteration <= iterations; iteration += 1) {
      if (shouldStartServer && iteration > 1) {
        process.stdout.write(
          `[editor-critical-smokes] Restarting standalone server before iteration ${iteration}\n`
        );
        serverProcess = await restartStandaloneServer(baseUrl, port, serverProcess);
        serverRestartCount += 1;
      }

      process.stdout.write(`\n[editor-critical-smokes] Iteration ${iteration}/${iterations}\n`);
      const iterationStartedAt = Date.now();
      const results = [];

      for (const smoke of CRITICAL_SMOKES) {
        const smokeStartedAt = Date.now();
        const smokeOutputDir = resolveSmokeRunOutputDir(smoke, summaryDir, iteration, iterations);
        const smokeReportPath = path.join(smokeOutputDir, 'report.json');
        let attempt = 0;
        let finished = false;

        while (!finished) {
          try {
            if (shouldStartServer) {
              const readiness = await ensureServerReady(baseUrl, port, serverProcess);
              serverProcess = readiness.serverProcess;
              if (readiness.restarted) {
                serverRestartCount += 1;
              }
            }

            runNodeScript([smoke.script, '--base-url', baseUrl, '--output-dir', smokeOutputDir]);
            const report = await readJson(path.join(process.cwd(), smokeReportPath));
            results.push({
              id: smoke.id,
              ok: Boolean(report.ok),
              durationMs: Date.now() - smokeStartedAt,
              reportPath: smokeReportPath,
              consoleErrors: Array.isArray(report.consoleErrors) ? report.consoleErrors.length : 0,
              attempts: attempt + 1,
            });
            finished = true;
          } catch (error) {
            const retryable = shouldStartServer && attempt === 0;

            if (retryable) {
              process.stdout.write(
                `[editor-critical-smokes] Restarting standalone server and retrying ${smoke.id}\n`
              );
              serverProcess = await restartStandaloneServer(baseUrl, port, serverProcess);
              serverRestartCount += 1;
              attempt += 1;
              continue;
            }

            results.push({
              id: smoke.id,
              ok: false,
              durationMs: Date.now() - smokeStartedAt,
              reportPath: smokeReportPath,
              error: String(error?.message || error),
              attempts: attempt + 1,
            });
            finished = true;
            break;
          }
        }

        if (!results[results.length - 1]?.ok) {
          break;
        }
      }

      iterationReports.push({
        iteration,
        ok: results.length === CRITICAL_SMOKES.length && results.every((entry) => entry.ok),
        durationMs: Date.now() - iterationStartedAt,
        results,
      });

      if (!iterationReports[iterationReports.length - 1].ok) {
        break;
      }
    }
  } finally {
    await terminateChildProcessTree(serverProcess);
  }

  const latestIteration = iterationReports[iterationReports.length - 1] || null;
  const summary = {
    ok:
      iterationReports.length === iterations &&
      iterationReports.every((entry) => entry.ok),
    baseUrl,
    startedAt,
    finishedAt: new Date().toISOString(),
    iterationsRequested: iterations,
    completedIterations: iterationReports.length,
    serverRestartCount,
    iterations: iterationReports,
    results: latestIteration?.results || [],
  };

  await writeFile(reportPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

  if (!summary.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(`editor-critical-smokes failed: ${String(error?.message || error)}\n`);
  process.exit(1);
});
