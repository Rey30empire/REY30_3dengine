import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadWorkspaceEnv, resolveDatabaseUrl } from './env-utils.mjs';

function parseArgs(argv) {
  const args = new Map();

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) continue;

    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args.set(key, 'true');
      continue;
    }

    args.set(key, next);
    index += 1;
  }

  return args;
}

function trim(value) {
  return String(value || '').trim();
}

function asBoolean(value, fallback = false) {
  const normalized = trim(value).toLowerCase();
  if (!normalized) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function parseCsv(value) {
  return trim(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function makeCheck(id, status, detail, extra = {}) {
  return {
    id,
    status,
    detail,
    ...extra,
  };
}

function normalizeBaseUrl(baseUrl) {
  if (!trim(baseUrl)) return null;
  const parsed = new URL(baseUrl);
  parsed.hash = '';
  parsed.search = '';
  parsed.pathname = '';
  return parsed.toString().replace(/\/+$/, '');
}

function getRemoteFetchStatus(env) {
  const providers = [
    'REY30_REMOTE_FETCH_ALLOWLIST_OPENAI',
    'REY30_REMOTE_FETCH_ALLOWLIST_MESHY',
    'REY30_REMOTE_FETCH_ALLOWLIST_RUNWAY',
  ];
  const missingRecommended = providers.filter((key) => !trim(env[key]));
  const assetsAllowlist = trim(env.REY30_REMOTE_FETCH_ALLOWLIST_ASSETS);

  if (!assetsAllowlist) {
    return makeCheck(
      'remote-fetch-allowlists',
      'failed',
      'Missing REY30_REMOTE_FETCH_ALLOWLIST_ASSETS for production asset imports.',
      {
        missingRequired: ['REY30_REMOTE_FETCH_ALLOWLIST_ASSETS'],
        missingRecommended,
      }
    );
  }

  if (missingRecommended.length > 0) {
    return makeCheck(
      'remote-fetch-allowlists',
      'warning',
      'Asset allowlist is configured, but provider allowlists rely on built-in defaults.',
      {
        missingRecommended,
      }
    );
  }

  return makeCheck(
    'remote-fetch-allowlists',
    'passed',
    'Remote fetch allowlists are configured explicitly for assets and providers.'
  );
}

export function evaluateProductionEnv(env, options = {}) {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const checks = [];
  const databaseUrl = resolveDatabaseUrl(env);
  const nodeEnv = trim(env.NODE_ENV).toLowerCase();
  const registrationMode = trim(env.REY30_REGISTRATION_MODE).toLowerCase();
  const allowedOrigins = parseCsv(env.REY30_ALLOWED_ORIGINS);
  const hasEncryptionSecret =
    trim(env.REY30_ENCRYPTION_KEY).length > 0 || trim(env.NEXTAUTH_SECRET).length > 0;
  const hasDistributedRateLimit =
    trim(env.REY30_UPSTASH_REDIS_REST_URL || env.UPSTASH_REDIS_REST_URL).length > 0 &&
    trim(env.REY30_UPSTASH_REDIS_REST_TOKEN || env.UPSTASH_REDIS_REST_TOKEN).length > 0;
  const allowInMemoryRateLimit = asBoolean(env.REY30_ALLOW_IN_MEMORY_RATE_LIMIT_PRODUCTION, false);
  const allowRemoteOpenRegistration = asBoolean(env.REY30_ALLOW_OPEN_REGISTRATION_REMOTE, false);
  const terminalApiEnabled = asBoolean(env.REY30_ENABLE_TERMINAL_API, false);
  const terminalApiRemoteEnabled = asBoolean(env.REY30_ENABLE_TERMINAL_API_REMOTE, false);
  const smokeEmail = trim(env.SMOKE_USER_EMAIL);
  const smokePassword = trim(env.SMOKE_USER_PASSWORD);

  checks.push(
    nodeEnv === 'production'
      ? makeCheck('node-env', 'passed', 'NODE_ENV=production')
      : makeCheck('node-env', 'failed', 'NODE_ENV must be production for a production preflight.')
  );

  checks.push(
    databaseUrl
      ? makeCheck('database-url', 'passed', 'DATABASE_URL is configured.')
      : makeCheck(
          'database-url',
          'failed',
          'Missing DATABASE_URL (or NETLIFY_DATABASE_URL on Netlify).'
        )
  );

  checks.push(
    hasEncryptionSecret
      ? makeCheck('encryption-secret', 'passed', 'Encryption secret is configured.')
      : makeCheck(
          'encryption-secret',
          'failed',
          'Missing REY30_ENCRYPTION_KEY or NEXTAUTH_SECRET.'
        )
  );

  if (!registrationMode) {
    checks.push(
      makeCheck('registration-mode', 'failed', 'Missing REY30_REGISTRATION_MODE.')
    );
  } else if (registrationMode === 'open') {
    checks.push(
      makeCheck(
        'registration-mode',
        'failed',
        'REY30_REGISTRATION_MODE=open is not allowed in production.'
      )
    );
  } else {
    checks.push(
      makeCheck(
        'registration-mode',
        'passed',
        `Registration mode is ${registrationMode}.`
      )
    );
  }

  if (registrationMode === 'invite_only') {
    checks.push(
      trim(env.REY30_REGISTRATION_INVITE_TOKEN)
        ? makeCheck('invite-token', 'passed', 'Invite token is configured.')
        : makeCheck(
            'invite-token',
            'failed',
            'Missing REY30_REGISTRATION_INVITE_TOKEN for invite_only registration.'
          )
    );
  } else if (registrationMode === 'allowlist' && parseCsv(env.REY30_REGISTRATION_ALLOWLIST).length === 0) {
    checks.push(
      makeCheck(
        'registration-allowlist',
        'warning',
        'Allowlist mode is enabled without REY30_REGISTRATION_ALLOWLIST entries.'
      )
    );
  }

  checks.push(
    trim(env.REY30_BOOTSTRAP_OWNER_TOKEN)
      ? makeCheck('bootstrap-owner-token', 'passed', 'Bootstrap owner token is configured.')
      : makeCheck(
          'bootstrap-owner-token',
          'failed',
          'Missing REY30_BOOTSTRAP_OWNER_TOKEN.'
        )
  );

  if (allowedOrigins.length === 0) {
    checks.push(
      makeCheck('allowed-origins', 'failed', 'Missing REY30_ALLOWED_ORIGINS.')
    );
  } else if (baseUrl && !allowedOrigins.includes(baseUrl)) {
    checks.push(
      makeCheck(
        'allowed-origins',
        'failed',
        `REY30_ALLOWED_ORIGINS does not include ${baseUrl}.`,
        { allowedOrigins }
      )
    );
  } else {
    checks.push(
      makeCheck('allowed-origins', 'passed', 'Allowed origins are configured.', {
        allowedOrigins,
      })
    );
  }

  checks.push(getRemoteFetchStatus(env));

  if (hasDistributedRateLimit) {
    checks.push(
      makeCheck(
        'rate-limit-backend',
        'passed',
        'Distributed rate limit backend is configured.'
      )
    );
  } else if (allowInMemoryRateLimit) {
    checks.push(
      makeCheck(
        'rate-limit-backend',
        'warning',
        'Distributed rate limit backend is missing; using in-memory fallback for a single-node deployment.'
      )
    );
  } else {
    checks.push(
      makeCheck(
        'rate-limit-backend',
        'failed',
        'Missing distributed rate limit backend. Configure Upstash or intentionally enable REY30_ALLOW_IN_MEMORY_RATE_LIMIT_PRODUCTION=true.'
      )
    );
  }

  checks.push(
    allowRemoteOpenRegistration
      ? makeCheck(
          'remote-open-registration',
          'failed',
          'REY30_ALLOW_OPEN_REGISTRATION_REMOTE must remain false in production.'
        )
      : makeCheck(
          'remote-open-registration',
          'passed',
          'Remote open registration is disabled.'
        )
  );

  checks.push(
    terminalApiRemoteEnabled
      ? makeCheck(
          'terminal-api-remote',
          'failed',
          'REY30_ENABLE_TERMINAL_API_REMOTE must remain false in production.'
        )
      : makeCheck(
          'terminal-api-remote',
          'passed',
          'Remote terminal API is disabled.'
        )
  );

  if (terminalApiEnabled) {
    checks.push(
      makeCheck(
        'terminal-api-local',
        'warning',
        'REY30_ENABLE_TERMINAL_API is enabled. Confirm this is intentional before go-live.'
      )
    );
  } else {
    checks.push(
      makeCheck('terminal-api-local', 'passed', 'Terminal API is disabled.')
    );
  }

  checks.push(
    trim(env.REY30_OPS_TOKEN)
      ? makeCheck('ops-token', 'passed', 'Ops token is configured.')
      : makeCheck(
          'ops-token',
          'warning',
          'REY30_OPS_TOKEN is missing. Ops endpoints and backup drills will require an owner session instead.'
        )
  );

  if (smokeEmail && smokePassword) {
    checks.push(
      makeCheck(
        'smoke-credentials',
        'passed',
        'Authenticated smoke credentials are configured.'
      )
    );
  } else {
    checks.push(
      makeCheck(
        'smoke-credentials',
        'warning',
        'SMOKE_USER_EMAIL/SMOKE_USER_PASSWORD are missing. Post-deploy authenticated smoke will need them before launch.'
      )
    );
  }

  const summary = summarizeChecks(checks);
  return {
    ok: summary.failed === 0,
    baseUrl,
    checks,
    summary,
  };
}

function summarizeChecks(checks) {
  return checks.reduce(
    (acc, check) => {
      acc[check.status] += 1;
      return acc;
    },
    {
      passed: 0,
      warning: 0,
      failed: 0,
      skipped: 0,
    }
  );
}

async function fetchJson(url, init) {
  const response = await fetch(url, {
    cache: 'no-store',
    ...init,
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function runHealthChecks(baseUrl) {
  const checks = [];

  try {
    const { response: liveResponse, payload: livePayload } = await fetchJson(
      `${baseUrl}/api/health/live`,
      {
        headers: {
          accept: 'application/json',
          origin: baseUrl,
        },
      }
    );

    checks.push(
      liveResponse.status === 200 && livePayload?.status === 'live'
        ? makeCheck('health-live', 'passed', 'Liveness endpoint returned 200/live.', {
            httpStatus: liveResponse.status,
          })
        : makeCheck(
            'health-live',
            'failed',
            `Liveness endpoint returned ${liveResponse.status}.`,
            {
              httpStatus: liveResponse.status,
              payload: livePayload,
            }
          )
    );
  } catch (error) {
    checks.push(
      makeCheck('health-live', 'failed', `Liveness request failed: ${String(error)}`)
    );
  }

  try {
    const { response: readyResponse, payload: readyPayload } = await fetchJson(
      `${baseUrl}/api/health/ready`,
      {
        headers: {
          accept: 'application/json',
          origin: baseUrl,
        },
      }
    );

    if (readyResponse.status === 200 && readyPayload?.status === 'ready' && readyPayload?.ok === true) {
      checks.push(
        makeCheck('health-ready', 'passed', 'Readiness endpoint returned 200/ready.', {
          httpStatus: readyResponse.status,
        })
      );

      const warningCount = Array.isArray(readyPayload?.warnings) ? readyPayload.warnings.length : 0;
      checks.push(
        warningCount > 0
          ? makeCheck(
              'health-ready-warnings',
              'warning',
              `Readiness returned ${warningCount} warning(s).`,
              {
                warnings: readyPayload.warnings,
              }
            )
          : makeCheck(
              'health-ready-warnings',
              'passed',
              'Readiness reported no warnings.'
            )
      );
    } else {
      checks.push(
        makeCheck(
          'health-ready',
          'failed',
          `Readiness endpoint returned ${readyResponse.status}.`,
          {
            httpStatus: readyResponse.status,
            payload: readyPayload,
          }
        )
      );
    }
  } catch (error) {
    checks.push(
      makeCheck('health-ready', 'failed', `Readiness request failed: ${String(error)}`)
    );
  }

  return checks;
}

async function callOpsJson(baseUrl, endpoint, method, opsToken, body) {
  const headers = {
    accept: 'application/json',
    origin: baseUrl,
  };
  if (opsToken) {
    headers['x-rey30-ops-token'] = opsToken;
  }
  if (body) {
    headers['content-type'] = 'application/json';
  }

  const response = await fetch(`${baseUrl}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${endpoint} -> ${response.status}: ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function runBackupDrill(baseUrl, opsToken) {
  if (!trim(opsToken)) {
    return [
      makeCheck(
        'ops-backup-drill',
        'skipped',
        'Backup drill skipped because REY30_OPS_TOKEN is missing.'
      ),
    ];
  }

  const checks = [];

  try {
    const createPayload = await callOpsJson(baseUrl, '/api/ops/backups', 'POST', opsToken, {
      note: 'production preflight backup drill',
    });
    const backupId = trim(createPayload?.backup?.backupId);
    if (!backupId) {
      checks.push(
        makeCheck(
          'ops-backup-create',
          'failed',
          'Backup creation did not return a backupId.',
          { payload: createPayload }
        )
      );
      return checks;
    }

    checks.push(
      makeCheck('ops-backup-create', 'passed', 'Backup creation succeeded.', { backupId })
    );

    const verifyPayload = await callOpsJson(
      baseUrl,
      '/api/ops/backups/verify',
      'POST',
      opsToken,
      { backupId }
    );
    checks.push(
      verifyPayload?.result?.ok === true
        ? makeCheck('ops-backup-verify', 'passed', 'Backup verification succeeded.', {
            backupId,
            checkedFiles: verifyPayload.result.checkedFiles,
          })
        : makeCheck('ops-backup-verify', 'failed', 'Backup verification reported failure.', {
            backupId,
            payload: verifyPayload,
          })
    );

    const restorePayload = await callOpsJson(
      baseUrl,
      '/api/ops/backups/restore',
      'POST',
      opsToken,
      {
        backupId,
        dryRun: true,
      }
    );
    checks.push(
      restorePayload?.result?.dryRun === true
        ? makeCheck('ops-backup-restore-dry-run', 'passed', 'Backup dry-run restore succeeded.', {
            backupId,
            operations: Array.isArray(restorePayload?.result?.operations)
              ? restorePayload.result.operations.length
              : 0,
          })
        : makeCheck(
            'ops-backup-restore-dry-run',
            'failed',
            'Backup dry-run restore did not return dryRun=true.',
            {
              backupId,
              payload: restorePayload,
            }
          )
    );
  } catch (error) {
    checks.push(
      makeCheck('ops-backup-drill', 'failed', `Backup drill failed: ${String(error)}`)
    );
  }

  return checks;
}

async function writeReport(reportPath, payload) {
  if (!trim(reportPath)) return;

  const absolutePath = path.isAbsolute(reportPath)
    ? reportPath
    : path.join(process.cwd(), reportPath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

export async function runProductionPreflight(options = {}) {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const env = options.env || process.env;
  const staticResult = evaluateProductionEnv(env, { baseUrl });
  const checks = [...staticResult.checks];

  if (baseUrl) {
    checks.push(...(await runHealthChecks(baseUrl)));
    if (options.skipBackupDrill === true) {
      checks.push(
        makeCheck(
          'ops-backup-drill',
          'skipped',
          'Backup drill skipped by configuration.'
        )
      );
    } else {
      checks.push(...(await runBackupDrill(baseUrl, env.REY30_OPS_TOKEN)));
    }
  } else {
    checks.push(
      makeCheck(
        'health-live',
        'skipped',
        'Live health check skipped because no base URL was provided.'
      )
    );
    checks.push(
      makeCheck(
        'health-ready',
        'skipped',
        'Readiness health check skipped because no base URL was provided.'
      )
    );
    checks.push(
      makeCheck(
        'ops-backup-drill',
        'skipped',
        'Backup drill skipped because no base URL was provided.'
      )
    );
  }

  const summary = summarizeChecks(checks);
  const result = {
    ok: summary.failed === 0,
    baseUrl,
    generatedAt: new Date().toISOString(),
    checks,
    summary,
  };

  if (options.reportPath) {
    await writeReport(options.reportPath, result);
  }

  return result;
}

async function main() {
  loadWorkspaceEnv({
    envFiles: ['.env', '.env.local', '.env.production', '.env.production.local'],
  });

  const args = parseArgs(process.argv.slice(2));
  const reportPath =
    args.get('report-path') || path.join('output', 'production-preflight', 'report.json');
  const baseUrl =
    args.get('base-url') ||
    process.env.PREFLIGHT_BASE_URL ||
    process.env.PRODUCTION_BASE_URL ||
    process.env.SMOKE_BASE_URL ||
    process.env.DEPLOY_BASE_URL ||
    '';
  const skipBackupDrill = asBoolean(args.get('skip-backup-drill'), false);

  const result = await runProductionPreflight({
    env: process.env,
    baseUrl,
    reportPath,
    skipBackupDrill,
  });

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) {
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`production-preflight failed: ${String(error?.message || error)}\n`);
    process.exit(1);
  });
}
