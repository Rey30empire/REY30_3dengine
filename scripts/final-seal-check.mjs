import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { resolveProductionEnvWithMetadata } from './production-env.mjs';
import { startMockUpstashServer } from './mock-upstash-runtime.mjs';
import { ensureSmokeUser } from './provision-smoke-user.mjs';
import { evaluateQaTotalReport } from './qa-total-check.mjs';
import { evaluateTargetRealReadiness } from './target-real-readiness.mjs';

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

function normalizeSealMode(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (
    normalized === 'target-real' ||
    normalized === 'target' ||
    normalized === 'real' ||
    normalized === 'true'
  ) {
    return 'target-real';
  }
  return 'rehearsal';
}

function normalizeBaseUrl(raw) {
  if (!raw || !String(raw).trim()) return null;
  const trimmed = String(raw).trim();
  const withProtocol =
    trimmed.startsWith('http://') || trimmed.startsWith('https://')
      ? trimmed
      : `https://${trimmed}`;
  return withProtocol.replace(/\/+$/, '');
}

function isLocalBaseUrl(baseUrl) {
  if (!baseUrl) return true;
  const hostname = new URL(baseUrl).hostname.trim().toLowerCase();
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]'
  );
}

function inferNetlifyRuntime(env) {
  const trim = (value) => String(value || '').trim();
  return trim(env.NETLIFY) === 'true' || Boolean(trim(env.CONTEXT)) || Boolean(trim(env.DEPLOY_ID));
}

function resolveStorageBackend(env, explicitKey, runtimeFallback = false) {
  const explicit = String(env[explicitKey] || '').trim().toLowerCase();
  if (explicit === 'filesystem' || explicit === 'netlify-blobs') {
    return explicit;
  }
  return runtimeFallback ? 'netlify-blobs' : 'filesystem';
}

function runStep(name, command, args, options = {}) {
  const startedAt = Date.now();
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      ...(options.envOverrides || {}),
    },
  });

  return {
    name,
    command: [command, ...args].join(' '),
    ok: result.status === 0,
    durationMs: Date.now() - startedAt,
    exitCode: result.status ?? 1,
  };
}

function runStepAsync(name, command, args, options = {}) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: {
        ...process.env,
        ...(options.envOverrides || {}),
      },
    });

    child.once('error', reject);
    child.once('exit', (code) => {
      resolve({
        name,
        command: [command, ...args].join(' '),
        ok: code === 0,
        durationMs: Date.now() - startedAt,
        exitCode: code ?? 1,
      });
    });
  });
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Unable to find a free port.'));
        return;
      }
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(address.port);
      });
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildProductionServerEnv(baseUrl, productionEnv) {
  const url = new URL(baseUrl);
  const hasDistributedRateLimit =
    Boolean(productionEnv.REY30_UPSTASH_REDIS_REST_URL || productionEnv.UPSTASH_REDIS_REST_URL) &&
    Boolean(productionEnv.REY30_UPSTASH_REDIS_REST_TOKEN || productionEnv.UPSTASH_REDIS_REST_TOKEN);
  return {
    ...productionEnv,
    NODE_ENV: 'production',
    HOSTNAME: url.hostname,
    PORT: url.port,
    DATABASE_URL: productionEnv.DATABASE_URL,
    NEXTAUTH_SECRET: productionEnv.NEXTAUTH_SECRET,
    REY30_ENCRYPTION_KEY: productionEnv.REY30_ENCRYPTION_KEY,
    REY30_REGISTRATION_MODE: productionEnv.REY30_REGISTRATION_MODE,
    REY30_REGISTRATION_INVITE_TOKEN: productionEnv.REY30_REGISTRATION_INVITE_TOKEN,
    REY30_BOOTSTRAP_OWNER_TOKEN: productionEnv.REY30_BOOTSTRAP_OWNER_TOKEN,
    REY30_ALLOW_OPEN_REGISTRATION_REMOTE:
      productionEnv.REY30_ALLOW_OPEN_REGISTRATION_REMOTE || 'false',
    REY30_ALLOW_IN_MEMORY_RATE_LIMIT_PRODUCTION:
      hasDistributedRateLimit
        ? 'false'
        : productionEnv.REY30_ALLOW_IN_MEMORY_RATE_LIMIT_PRODUCTION || 'true',
    REY30_ALLOWED_ORIGINS: `${baseUrl},http://localhost:${url.port}`,
  };
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

async function waitForReady(baseUrl, child, timeoutMs = 240000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (child.exitCode !== null) {
      throw new Error(`production-local exited early with code ${child.exitCode}`);
    }

    try {
      const response = await fetch(`${baseUrl}/api/health/ready`, {
        method: 'GET',
        cache: 'no-store',
      });
      if (response.status === 200) {
        const payload = await response.json();
        if (payload?.ok === true && payload?.status === 'ready') {
          return;
        }
      }
    } catch {
      // Retry until timeout.
    }

    await sleep(1000);
  }

  throw new Error(`Timed out waiting for ${baseUrl}/api/health/ready`);
}

async function startProductionLocal(baseUrl, productionEnv) {
  const startArgs = ['scripts/start-production-local.mjs', '--skip-build'];
  if (
    process.env.CI === 'true' ||
    process.env.REY30_PRODUCTION_LOCAL_SKIP_DOCKER === 'true'
  ) {
    startArgs.push('--skip-docker');
  }

  const child = spawn(process.execPath, startArgs, {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: {
      ...process.env,
      ...buildProductionServerEnv(baseUrl, productionEnv),
    },
  });

  await waitForReady(baseUrl, child);
  return child;
}

async function writeSummary(summaryPath, summary) {
  const absolutePath = path.isAbsolute(summaryPath)
    ? summaryPath
    : path.join(process.cwd(), summaryPath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
}

async function readJson(filePath) {
  return JSON.parse(await readFile(path.join(process.cwd(), filePath), 'utf8'));
}

async function maybeReadJson(filePath) {
  try {
    return await readJson(filePath);
  } catch {
    return null;
  }
}

async function writeSummaryArtifacts(summaryPath, qaSummaryPath, summary) {
  const qaTotal = evaluateQaTotalReport(summary);
  const nextSummary = {
    ...summary,
    qaTotal,
    releaseCandidateEligible: qaTotal.releaseCandidate.eligible,
    localSingleUserEligible: qaTotal.localSingleUser?.eligible === true,
    finalSealTrueEligible: qaTotal.finalSealTrue?.eligible === true,
  };

  await writeSummary(summaryPath, nextSummary);
  await writeSummary(qaSummaryPath, {
    ok: qaTotal.ok,
    finishedAt: new Date().toISOString(),
    sourceReportPath: summaryPath,
    qaTotal,
  });

  return nextSummary;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sealMode = normalizeSealMode(
    args.get('mode') || process.env.REY30_FINAL_SEAL_MODE || 'rehearsal'
  );
  const outputDir = path.join('output', 'final-seal');
  const summaryPath = path.join(outputDir, 'report.json');
  const qaSummaryPath = path.join('output', 'qa-total', 'report.json');
  const testStabilityReportPath = path.join(outputDir, 'test-stability-report.json');
  const editorCriticalOutputDir = path.join(outputDir, 'editor-critical-smokes');
  const editorCriticalReportPath = path.join(editorCriticalOutputDir, 'report.json');
  const shadowWorkspaceOutputDir = path.join(outputDir, 'shadow-workspace-smoke');
  const shadowWorkspaceReportPath = path.join(shadowWorkspaceOutputDir, 'report.json');
  const performanceSmokeReportPath = path.join(outputDir, 'editor-performance-smoke', 'report.json');
  const performanceBudgetReportPath = path.join(outputDir, 'performance-budget-report.json');
  const postdeploySmokeReportPath = path.join(outputDir, 'postdeploy-smoke-report.json');
  const productionPreflightReportPath = path.join(outputDir, 'production-preflight-report.json');
  const releaseSecurityReportPath = path.join(outputDir, 'release-security-report.json');
  const { resolved: baseProductionEnv, metadata: productionEnvMetadata } =
    resolveProductionEnvWithMetadata({
    root: process.cwd(),
    env: process.env,
    envFiles: ['.env', '.env.local', '.env.production', '.env.production.local'],
    defaultDatabaseUrl: process.env.DATABASE_URL || '',
  });
  const explicitEnvKeys = new Set(productionEnvMetadata.explicitKeys || []);
  const generatedEnvKeys = new Set(productionEnvMetadata.generatedKeys || []);
  const hasDistributedRateLimit =
    Boolean(baseProductionEnv.REY30_UPSTASH_REDIS_REST_URL || baseProductionEnv.UPSTASH_REDIS_REST_URL) &&
    Boolean(baseProductionEnv.REY30_UPSTASH_REDIS_REST_TOKEN || baseProductionEnv.UPSTASH_REDIS_REST_TOKEN);
  const explicitSmokeCredentials =
    explicitEnvKeys.has('SMOKE_USER_EMAIL') && explicitEnvKeys.has('SMOKE_USER_PASSWORD');
  const targetBaseUrl = normalizeBaseUrl(
    args.get('base-url') ||
      process.env.PRODUCTION_BASE_URL ||
      process.env.SMOKE_BASE_URL ||
      process.env.DEPLOY_BASE_URL ||
      process.env.VERCEL_URL
  );
  const isTargetSeal = sealMode === 'target-real';
  const baseUrl = isTargetSeal ? targetBaseUrl : `http://127.0.0.1:${await findFreePort()}`;
  const steps = [];
  const isNetlify = inferNetlifyRuntime(baseProductionEnv);
  const storageProfile = {
    scripts: resolveStorageBackend(baseProductionEnv, 'REY30_SCRIPT_STORAGE_BACKEND', isNetlify),
    gallery: resolveStorageBackend(baseProductionEnv, 'REY30_GALLERY_STORAGE_BACKEND', isNetlify),
    packages: resolveStorageBackend(baseProductionEnv, 'REY30_PACKAGE_STORAGE_BACKEND', isNetlify),
    assets: resolveStorageBackend(baseProductionEnv, 'REY30_ASSET_STORAGE_BACKEND', isNetlify),
    modularCharacters: resolveStorageBackend(
      baseProductionEnv,
      'REY30_MODULAR_CHARACTER_STORAGE_BACKEND',
      isNetlify
    ),
  };
  const sharedDurableStorage =
    storageProfile.scripts !== 'filesystem' &&
    storageProfile.gallery !== 'filesystem' &&
    storageProfile.packages !== 'filesystem' &&
    storageProfile.assets !== 'filesystem' &&
    storageProfile.modularCharacters !== 'filesystem';
  const sealProfile = {
    mode: sealMode,
    baseUrl,
    explicitSmokeCredentials,
    generatedEnvKeys: Array.from(generatedEnvKeys),
    hasDistributedRateLimit,
    usedMockRateLimitBackend: false,
    usedLocalProductionServer: !isTargetSeal,
    storage: {
      ...storageProfile,
      allDurableShared: sharedDurableStorage,
    },
  };

  const collectSummary = async (ok, extra = {}) => ({
    ok,
    baseUrl,
    sealProfile,
    finishedAt: new Date().toISOString(),
    steps,
    testStability: await maybeReadJson(testStabilityReportPath),
    editorCritical: await maybeReadJson(editorCriticalReportPath),
    shadowWorkspace: await maybeReadJson(shadowWorkspaceReportPath),
    performanceSmoke: await maybeReadJson(performanceSmokeReportPath),
    performanceBudget: await maybeReadJson(performanceBudgetReportPath),
    postdeploySmoke: await maybeReadJson(postdeploySmokeReportPath),
    productionPreflight: await maybeReadJson(productionPreflightReportPath),
    releaseSecurity: await maybeReadJson(releaseSecurityReportPath),
    ...extra,
  });

  if (isTargetSeal) {
    const targetRealReadiness = evaluateTargetRealReadiness({
      baseUrl,
      env: baseProductionEnv,
      explicitEnvKeys,
      generatedEnvKeys,
      storageProfile: sealProfile.storage,
    });
    sealProfile.targetRealReadiness = targetRealReadiness;

    if (!targetRealReadiness.ok) {
      const summary = await collectSummary(false, {
        error: 'target-real readiness failed',
        targetRealReadiness,
      });
      await writeSummaryArtifacts(summaryPath, qaSummaryPath, summary);
      process.stderr.write(
        `target-real readiness failed: ${targetRealReadiness.failedChecks.join(', ')}\n`
      );
      process.exit(1);
    }
  }

  const releaseCheck = runStep('release-check', 'pnpm', ['run', 'release:check']);
  steps.push(releaseCheck);
  if (!releaseCheck.ok) {
    await writeSummaryArtifacts(summaryPath, qaSummaryPath, await collectSummary(false));
    process.exit(1);
  }

  const stability = runStep('test-stability', 'node', [
    'scripts/test-stability.mjs',
    '--iterations',
    '3',
    '--exercise-build',
    'true',
    '--report-path',
    testStabilityReportPath,
  ]);
  steps.push({
    ...stability,
    reportPath: testStabilityReportPath,
  });
  if (!stability.ok) {
    await writeSummaryArtifacts(summaryPath, qaSummaryPath, await collectSummary(false));
    process.exit(1);
  }

  const editorCritical = runStep('editor-critical-smokes', 'node', [
    'scripts/editor-critical-smokes.mjs',
    '--output-dir',
    editorCriticalOutputDir,
    '--iterations',
    '2',
  ]);
  steps.push({
    ...editorCritical,
    reportPath: editorCriticalReportPath,
  });
  if (!editorCritical.ok) {
    await writeSummaryArtifacts(summaryPath, qaSummaryPath, await collectSummary(false));
    process.exit(1);
  }

  const shadowSmoke = runStep('shadow-workspace-smoke', 'node', [
    'scripts/shadow-workspace-smoke.mjs',
    '--output-dir',
    shadowWorkspaceOutputDir,
  ]);
  steps.push({
    ...shadowSmoke,
    reportPath: shadowWorkspaceReportPath,
  });
  if (!shadowSmoke.ok) {
    await writeSummaryArtifacts(summaryPath, qaSummaryPath, await collectSummary(false));
    process.exit(1);
  }

  let productionServer = null;
  let mockRateLimitBackend = null;
  try {
    let productionEnv = {
      ...baseProductionEnv,
    };

    if (isTargetSeal) {
      if (!baseUrl) {
        throw new Error('target-real final seal requires --base-url or PRODUCTION_BASE_URL.');
      }
      if (isLocalBaseUrl(baseUrl)) {
        throw new Error(`target-real final seal cannot use a local base URL (${baseUrl}).`);
      }
      if (!hasDistributedRateLimit) {
        throw new Error(
          'target-real final seal requires a real distributed rate limit backend.'
        );
      }
      if (!explicitSmokeCredentials) {
        throw new Error(
          'target-real final seal requires explicit SMOKE_USER_EMAIL and SMOKE_USER_PASSWORD.'
        );
      }
    } else if (!hasDistributedRateLimit) {
      const startedAt = Date.now();
      mockRateLimitBackend = await startMockUpstashServer();
      productionEnv = {
        ...productionEnv,
        REY30_UPSTASH_REDIS_REST_URL: mockRateLimitBackend.url,
        REY30_UPSTASH_REDIS_REST_TOKEN: mockRateLimitBackend.token,
        REY30_ALLOW_IN_MEMORY_RATE_LIMIT_PRODUCTION: 'false',
      };

      steps.push({
        name: 'mock-rate-limit-backend',
        command: 'in-process mock Upstash runtime',
        ok: true,
        durationMs: Date.now() - startedAt,
        exitCode: 0,
        endpoint: mockRateLimitBackend.url,
      });
      sealProfile.usedMockRateLimitBackend = true;
    }

    const productionRuntimeEnv = isTargetSeal
      ? {
          ...productionEnv,
          NODE_ENV: 'production',
          PRODUCTION_BASE_URL: baseUrl,
          SMOKE_BASE_URL: baseUrl,
        }
      : buildProductionServerEnv(baseUrl, productionEnv);

    if (!isTargetSeal) {
      productionServer = await startProductionLocal(baseUrl, productionEnv);
      const smokeUserStartedAt = Date.now();
      const smokeUser = await ensureSmokeUser({
        env: productionRuntimeEnv,
        databaseUrl: productionRuntimeEnv.DATABASE_URL,
        email: productionRuntimeEnv.SMOKE_USER_EMAIL,
        password: productionRuntimeEnv.SMOKE_USER_PASSWORD,
      });

      steps.push({
        name: 'local-smoke-user',
        command: 'ensureSmokeUser()',
        ok: true,
        durationMs: Date.now() - smokeUserStartedAt,
        exitCode: 0,
        email: smokeUser.email,
        role: smokeUser.role,
      });
    }

    const performanceSmoke = await runStepAsync(
      'editor-performance-smoke',
      'node',
      [
        'scripts/editor-performance-smoke.mjs',
        '--base-url',
        baseUrl,
        '--output-dir',
        path.join(outputDir, 'editor-performance-smoke'),
        '--smoke-email',
        productionRuntimeEnv.SMOKE_USER_EMAIL,
        '--smoke-password',
        productionRuntimeEnv.SMOKE_USER_PASSWORD,
        ...(isTargetSeal ? ['--skip-seed-user', 'true'] : []),
      ],
      {
        envOverrides: productionRuntimeEnv,
      }
    );

    steps.push({
      ...performanceSmoke,
      reportPath: performanceSmokeReportPath,
    });
    if (!performanceSmoke.ok) {
      throw new Error('editor-performance-smoke failed');
    }

    const performanceCheck = await runStepAsync(
      'performance-budget-check',
      'node',
      [
        'scripts/performance-budget-check.mjs',
        '--report-path',
        performanceSmokeReportPath,
        '--report-output',
        performanceBudgetReportPath,
      ],
      {
        envOverrides: productionRuntimeEnv,
      }
    );

    steps.push({
      ...performanceCheck,
      reportPath: performanceBudgetReportPath,
    });
    if (!performanceCheck.ok) {
      throw new Error('performance-budget-check failed');
    }

    const postdeploySmoke = await runStepAsync(
      'postdeploy-smoke',
      'node',
      [
        'scripts/postdeploy-smoke.mjs',
        '--base-url',
        baseUrl,
        '--require-authenticated-flow',
        'true',
        '--report-path',
        postdeploySmokeReportPath,
      ],
      {
        envOverrides: productionRuntimeEnv,
      }
    );

    steps.push({
      ...postdeploySmoke,
      reportPath: postdeploySmokeReportPath,
    });
    if (!postdeploySmoke.ok) {
      throw new Error('postdeploy-smoke failed');
    }

    const productionPreflight = await runStepAsync(
      'production-preflight',
      'node',
      [
        'scripts/production-preflight.mjs',
        '--base-url',
        baseUrl,
        '--deployment-profile',
        sealMode,
        '--report-path',
        productionPreflightReportPath,
      ],
      {
        envOverrides: productionRuntimeEnv,
      }
    );

    steps.push({
      ...productionPreflight,
      reportPath: productionPreflightReportPath,
    });
    if (!productionPreflight.ok) {
      throw new Error('production-preflight failed');
    }

    const securityRelease = await runStepAsync(
      'release-security',
      'node',
      [
        'scripts/release-security-check.mjs',
        '--base-url',
        baseUrl,
        '--allowed-origin',
        baseUrl,
        '--expect-hsts',
        'true',
        '--report-path',
        releaseSecurityReportPath,
      ],
      {
        envOverrides: productionRuntimeEnv,
      }
    );

    steps.push({
      ...securityRelease,
      reportPath: releaseSecurityReportPath,
    });
    if (!securityRelease.ok) {
      throw new Error('release-security failed');
    }
  } finally {
    await terminateChildProcessTree(productionServer);
    if (mockRateLimitBackend?.stop) {
      await mockRateLimitBackend.stop().catch(() => undefined);
    }
  }

  const summary = await collectSummary(true, {
    ok: true,
  });

  const writtenSummary = await writeSummaryArtifacts(summaryPath, qaSummaryPath, summary);
  process.stdout.write(`${JSON.stringify(writtenSummary, null, 2)}\n`);
}

main().catch(async (error) => {
  const summary = {
    ok: false,
    error: String(error?.message || error),
    finishedAt: new Date().toISOString(),
  };
  await writeSummary(path.join('output', 'final-seal', 'report.json'), summary);
  await writeSummary(path.join('output', 'qa-total', 'report.json'), {
    ok: false,
    finishedAt: new Date().toISOString(),
    error: summary.error,
  });
  process.stderr.write(`final-seal-check failed: ${String(error?.message || error)}\n`);
  process.exit(1);
});
