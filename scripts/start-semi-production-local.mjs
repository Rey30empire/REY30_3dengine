import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { loadWorkspaceEnv } from './env-utils.mjs';

loadWorkspaceEnv({
  envFiles: ['.env', '.env.local', '.env.production', '.env.production.local'],
});

const childProcesses = new Set();
let shuttingDown = false;

function terminateChildProcessTree(child, signal = 'SIGTERM') {
  if (!child || child.exitCode !== null) {
    return;
  }

  if (process.platform === 'win32' && child.pid) {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
    });
    return;
  }

  try {
    child.kill(signal);
  } catch {
    // Best effort cleanup.
  }
}

function parseArgs(argv) {
  const map = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2);
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

function toBoolean(value) {
  if (value === undefined || value === null) return false;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, timeoutMs, allowSelfSigned = false) {
  const previousTlsPolicy = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  if (allowSelfSigned) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
    if (allowSelfSigned) {
      if (previousTlsPolicy === undefined) {
        delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      } else {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = previousTlsPolicy;
      }
    }
  }
}

async function waitForHealth(url, options) {
  let lastError = null;
  for (let attempt = 1; attempt <= options.retries; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, options.timeoutMs, options.allowSelfSigned);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = await response.json();
      if (!payload?.ok) {
        throw new Error(`health payload not ready: ${JSON.stringify(payload)}`);
      }

      return payload;
    } catch (error) {
      lastError = error;
      if (attempt < options.retries) {
        await sleep(options.retryWaitMs);
      }
    }
  }

  throw new Error(`Health check failed for ${url}: ${String(lastError?.message || lastError)}`);
}

function runSmoke(baseUrl, reportPath, runtime) {
  const args = [
    path.join('scripts', 'postdeploy-smoke.mjs'),
    '--base-url',
    baseUrl,
    '--allow-self-signed',
    'true',
    '--report-path',
    reportPath,
    '--timeout-ms',
    String(runtime.timeoutMs),
    '--retries',
    String(runtime.retries),
    '--retry-wait-ms',
    String(runtime.retryWaitMs),
  ];

  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: process.env,
  });

  if (result.status !== 0) {
    throw new Error(`Smoke checks failed with exit code ${result.status}`);
  }
}

function cleanup() {
  childProcesses.forEach((child) => {
    terminateChildProcessTree(child);
  });
}

process.on('SIGINT', () => {
  shuttingDown = true;
  cleanup();
  process.exit(0);
});

process.on('SIGTERM', () => {
  shuttingDown = true;
  cleanup();
  process.exit(0);
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const httpHost = args.get('hostname') || process.env.HOSTNAME || '127.0.0.1';
  const httpPort = toNumber(args.get('port') || process.env.PORT, 3000);
  const httpsHost = args.get('https-host') || process.env.REY30_HTTPS_HOST || 'localhost';
  const httpsPort = toNumber(args.get('https-port') || process.env.REY30_HTTPS_PORT, 8443);
  const certDir = args.get('cert-dir') || 'output/local-certs';
  const skipSmoke = toBoolean(args.get('skip-smoke'));
  const smokeReportPath = args.get('report-path') || 'output/semi-prod-smoke-report.json';
  const startupRuntime = {
    timeoutMs: toNumber(args.get('timeout-ms'), 12000),
    retries: toNumber(args.get('retries'), 30),
    retryWaitMs: toNumber(args.get('retry-wait-ms'), 2000),
  };

  const httpBaseUrl = `http://${httpHost}:${httpPort}`;
  const httpsBaseUrl = `https://${httpsHost}:${httpsPort}`;

  const productionArgs = [path.join('scripts', 'start-production-local.mjs')];
  if (toBoolean(args.get('skip-db'))) productionArgs.push('--skip-db');
  if (toBoolean(args.get('skip-build'))) productionArgs.push('--skip-build');
  if (toBoolean(args.get('skip-docker'))) productionArgs.push('--skip-docker');

  const productionProcess = spawn(process.execPath, productionArgs, {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HOSTNAME: httpHost,
      PORT: String(httpPort),
    },
  });
  childProcesses.add(productionProcess);

  await waitForHealth(`${httpBaseUrl}/api/health/live`, {
    ...startupRuntime,
    allowSelfSigned: false,
  });

  const proxyArgs = [
    path.join('scripts', 'https-local-proxy.mjs'),
    '--target-base-url',
    httpBaseUrl,
    '--https-host',
    httpsHost,
    '--https-port',
    String(httpsPort),
    '--cert-dir',
    certDir,
  ];

  const proxyProcess = spawn(process.execPath, proxyArgs, {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: process.env,
  });
  childProcesses.add(proxyProcess);

  await waitForHealth(`${httpsBaseUrl}/api/health/live`, {
    ...startupRuntime,
    allowSelfSigned: true,
  });

  if (!skipSmoke) {
    runSmoke(httpsBaseUrl, smokeReportPath, startupRuntime);
  }

  process.stdout.write(
    `Semi-production local ready on ${httpsBaseUrl} (HTTP upstream ${httpBaseUrl})\n`
  );
  if (skipSmoke) {
    process.stdout.write('Automatic smoke skipped by flag.\n');
  } else {
    process.stdout.write(`Smoke report: ${smokeReportPath}\n`);
  }

  await new Promise((resolve, reject) => {
    productionProcess.on('exit', (code, signal) => {
      if (shuttingDown) {
        resolve();
        return;
      }
      if (signal) {
        reject(new Error(`Production local process exited with signal ${signal}`));
        return;
      }
      reject(new Error(`Production local process exited with code ${code}`));
    });

    proxyProcess.on('exit', (code, signal) => {
      if (shuttingDown) {
        resolve();
        return;
      }
      if (signal) {
        reject(new Error(`HTTPS proxy exited with signal ${signal}`));
        return;
      }
      reject(new Error(`HTTPS proxy exited with code ${code}`));
    });
  });
}

main().catch((error) => {
  cleanup();
  process.stderr.write(`start-semi-production-local failed: ${String(error?.message || error)}\n`);
  process.exit(1);
});
