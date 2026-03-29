import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { resolveProductionEnv } from './production-env.mjs';
import { startMockUpstashServer } from './mock-upstash-runtime.mjs';
import { ensureSmokeUser } from './provision-smoke-user.mjs';

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

async function main() {
  const outputDir = path.join('output', 'final-seal');
  const summaryPath = path.join(outputDir, 'report.json');
  const baseProductionEnv = resolveProductionEnv({
    root: process.cwd(),
    env: process.env,
    defaultDatabaseUrl: process.env.DATABASE_URL || '',
  });
  const port = await findFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const steps = [];

  const releaseCheck = runStep('release-check', 'pnpm', ['run', 'release:check']);
  steps.push(releaseCheck);
  if (!releaseCheck.ok) {
    const summary = {
      ok: false,
      baseUrl,
      finishedAt: new Date().toISOString(),
      steps,
    };
    await writeSummary(summaryPath, summary);
    process.exit(1);
  }

  const editorCritical = runStep('editor-critical-smokes', 'pnpm', ['run', 'smoke:editor-critical']);
  steps.push({
    ...editorCritical,
    reportPath: 'output/editor-critical-smokes/report.json',
  });
  if (!editorCritical.ok) {
    const summary = {
      ok: false,
      baseUrl,
      finishedAt: new Date().toISOString(),
      steps,
    };
    await writeSummary(summaryPath, summary);
    process.exit(1);
  }

  const shadowSmoke = runStep('shadow-workspace-smoke', 'pnpm', ['run', 'smoke:shadow-workspace']);
  steps.push({
    ...shadowSmoke,
    reportPath: 'output/shadow-workspace-smoke/report.json',
  });
  if (!shadowSmoke.ok) {
    const summary = {
      ok: false,
      baseUrl,
      finishedAt: new Date().toISOString(),
      steps,
    };
    await writeSummary(summaryPath, summary);
    process.exit(1);
  }

  let productionServer = null;
  let mockRateLimitBackend = null;
  try {
    let productionEnv = {
      ...baseProductionEnv,
    };

    const hasDistributedRateLimit =
      Boolean(
        productionEnv.REY30_UPSTASH_REDIS_REST_URL || productionEnv.UPSTASH_REDIS_REST_URL
      ) &&
      Boolean(
        productionEnv.REY30_UPSTASH_REDIS_REST_TOKEN || productionEnv.UPSTASH_REDIS_REST_TOKEN
      );

    if (!hasDistributedRateLimit) {
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
    }

    productionServer = await startProductionLocal(baseUrl, productionEnv);
    const productionServerEnv = buildProductionServerEnv(baseUrl, productionEnv);
    const smokeUserStartedAt = Date.now();
    const smokeUser = await ensureSmokeUser({
      env: productionServerEnv,
      databaseUrl: productionServerEnv.DATABASE_URL,
      email: productionServerEnv.SMOKE_USER_EMAIL,
      password: productionServerEnv.SMOKE_USER_PASSWORD,
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
        path.join(outputDir, 'postdeploy-smoke-report.json'),
      ],
      {
        envOverrides: productionServerEnv,
      }
    );

    steps.push({
      ...postdeploySmoke,
      reportPath: path.join(outputDir, 'postdeploy-smoke-report.json'),
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
        '--report-path',
        path.join(outputDir, 'production-preflight-report.json'),
      ],
      {
        envOverrides: productionServerEnv,
      }
    );

    steps.push({
      ...productionPreflight,
      reportPath: path.join(outputDir, 'production-preflight-report.json'),
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
        path.join(outputDir, 'release-security-report.json'),
      ]
    );

    steps.push({
      ...securityRelease,
      reportPath: path.join(outputDir, 'release-security-report.json'),
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

  const summary = {
    ok: true,
    baseUrl,
    finishedAt: new Date().toISOString(),
    steps,
    productionPreflight: await readJson(path.join(outputDir, 'production-preflight-report.json')),
    postdeploySmoke: await readJson(path.join(outputDir, 'postdeploy-smoke-report.json')),
    releaseSecurity: await readJson(path.join(outputDir, 'release-security-report.json')),
    editorCritical: await readJson('output/editor-critical-smokes/report.json'),
    shadowWorkspace: await readJson('output/shadow-workspace-smoke/report.json'),
  };

  await writeSummary(summaryPath, summary);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch(async (error) => {
  const summary = {
    ok: false,
    error: String(error?.message || error),
    finishedAt: new Date().toISOString(),
  };
  await writeSummary(path.join('output', 'final-seal', 'report.json'), summary);
  process.stderr.write(`final-seal-check failed: ${String(error?.message || error)}\n`);
  process.exit(1);
});
