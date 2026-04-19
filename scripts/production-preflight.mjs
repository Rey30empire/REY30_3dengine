import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadWorkspaceEnv, resolveDatabaseUrl } from './env-utils.mjs';
import { collectProductionEnvInputs } from './production-env.mjs';

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

function normalizeDeploymentProfile(value) {
  const normalized = trim(value).toLowerCase();
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

function isFileDatabaseUrl(databaseUrl) {
  const normalized = trim(databaseUrl).toLowerCase();
  return normalized.startsWith('file:') || normalized.startsWith('sqlite:');
}

function resolveStorageBackend(env, explicitKey, runtimeFallback = false) {
  const explicit = trim(env[explicitKey]).toLowerCase();
  if (explicit === 'filesystem' || explicit === 'netlify-blobs') {
    return explicit;
  }
  return runtimeFallback ? 'netlify-blobs' : 'filesystem';
}

function inferNetlifyRuntime(env) {
  return trim(env.NETLIFY) === 'true' || Boolean(trim(env.CONTEXT)) || Boolean(trim(env.DEPLOY_ID));
}

function makeStorageCheck(id, label, backend, deploymentProfile) {
  if (deploymentProfile === 'target-real' && backend === 'filesystem') {
    return makeCheck(
      id,
      'failed',
      `${label} still uses filesystem storage. Target-real seal requires shared durable storage.`,
      { backend }
    );
  }

  return makeCheck(id, 'passed', `${label} uses ${backend} storage.`, { backend });
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
  const deploymentProfile = normalizeDeploymentProfile(options.deploymentProfile);
  const checks = [];
  const databaseUrl = resolveDatabaseUrl(env);
  const nodeEnv = trim(env.NODE_ENV).toLowerCase();
  const registrationMode = trim(env.REY30_REGISTRATION_MODE).toLowerCase();
  const allowedOrigins = parseCsv(env.REY30_ALLOWED_ORIGINS);
  const hasEncryptionSecret =
    trim(env.REY30_ENCRYPTION_KEY).length > 0 ||
    trim(env.APP_ENCRYPTION_KEY).length > 0 ||
    trim(env.NEXTAUTH_SECRET).length > 0;
  const hasDistributedRateLimit =
    trim(env.REY30_UPSTASH_REDIS_REST_URL || env.UPSTASH_REDIS_REST_URL).length > 0 &&
    trim(env.REY30_UPSTASH_REDIS_REST_TOKEN || env.UPSTASH_REDIS_REST_TOKEN).length > 0;
  const allowInMemoryRateLimit = asBoolean(env.REY30_ALLOW_IN_MEMORY_RATE_LIMIT_PRODUCTION, false);
  const allowRemoteOpenRegistration = asBoolean(env.REY30_ALLOW_OPEN_REGISTRATION_REMOTE, false);
  const terminalApiEnabled = asBoolean(env.REY30_ENABLE_TERMINAL_API, false);
  const terminalApiRemoteEnabled = asBoolean(env.REY30_ENABLE_TERMINAL_API_REMOTE, false);
  const smokeEmail = trim(env.SMOKE_USER_EMAIL);
  const smokePassword = trim(env.SMOKE_USER_PASSWORD);
  const explicitEnvKeys = new Set(options.explicitEnvKeys || []);
  const isNetlify = inferNetlifyRuntime(env);
  const storageBackends = {
    scripts: resolveStorageBackend(env, 'REY30_SCRIPT_STORAGE_BACKEND', isNetlify),
    gallery: resolveStorageBackend(env, 'REY30_GALLERY_STORAGE_BACKEND', isNetlify),
    packages: resolveStorageBackend(env, 'REY30_PACKAGE_STORAGE_BACKEND', isNetlify),
    assets: resolveStorageBackend(env, 'REY30_ASSET_STORAGE_BACKEND', isNetlify),
    modularCharacters: resolveStorageBackend(
      env,
      'REY30_MODULAR_CHARACTER_STORAGE_BACKEND',
      isNetlify
    ),
  };

  checks.push(
    makeCheck(
      'deployment-profile',
      'passed',
      deploymentProfile === 'target-real'
        ? 'Production preflight is running in target-real mode.'
        : 'Production preflight is running in rehearsal mode.',
      { deploymentProfile }
    )
  );

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

  if (deploymentProfile === 'target-real') {
    const parsedBaseUrl = baseUrl ? new URL(baseUrl) : null;
    checks.push(
      !baseUrl
        ? makeCheck(
            'target-base-url',
            'failed',
            'Target-real preflight requires a real base URL.'
          )
        : isLocalBaseUrl(baseUrl)
          ? makeCheck(
              'target-base-url',
              'failed',
              `Target-real preflight cannot point to a local URL (${baseUrl}).`
            )
          : parsedBaseUrl?.protocol !== 'https:'
            ? makeCheck(
                'target-base-url',
                'failed',
                `Target-real preflight requires HTTPS, got ${parsedBaseUrl?.protocol.replace(':', '')}.`,
                { baseUrl }
              )
          : makeCheck('target-base-url', 'passed', 'Target-real base URL is configured.', {
              baseUrl,
            })
    );

    checks.push(
      isFileDatabaseUrl(databaseUrl)
        ? makeCheck(
            'database-topology',
            'failed',
            'Target-real preflight requires a networked production database, not sqlite/file storage.',
            { databaseUrl }
          )
        : makeCheck(
            'database-topology',
            'passed',
            'Database topology is compatible with target-real preflight.'
          )
    );
  }

  checks.push(
    hasEncryptionSecret
      ? makeCheck('encryption-secret', 'passed', 'Encryption secret is configured.')
      : makeCheck(
          'encryption-secret',
          'failed',
          'Missing REY30_ENCRYPTION_KEY, APP_ENCRYPTION_KEY, or NEXTAUTH_SECRET.'
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

  if (deploymentProfile === 'target-real') {
    const hasExplicitSmokeCredentials =
      explicitEnvKeys.has('SMOKE_USER_EMAIL') && explicitEnvKeys.has('SMOKE_USER_PASSWORD');
    checks.push(
      hasExplicitSmokeCredentials
        ? makeCheck(
            'smoke-credentials-explicit',
            'passed',
            'Target-real preflight is using explicit smoke credentials.'
          )
        : makeCheck(
            'smoke-credentials-explicit',
            'failed',
            'Target-real preflight requires explicit SMOKE_USER_EMAIL and SMOKE_USER_PASSWORD, not generated defaults.'
          )
    );
  }

  checks.push(
    makeStorageCheck(
      'script-storage',
      'Script storage',
      storageBackends.scripts,
      deploymentProfile
    )
  );
  checks.push(
    makeStorageCheck(
      'gallery-storage',
      'Gallery storage',
      storageBackends.gallery,
      deploymentProfile
    )
  );
  checks.push(
    makeStorageCheck(
      'package-storage',
      'Package storage',
      storageBackends.packages,
      deploymentProfile
    )
  );
  checks.push(
    makeStorageCheck(
      'asset-storage',
      'Asset storage',
      storageBackends.assets,
      deploymentProfile
    )
  );
  checks.push(
    makeStorageCheck(
      'modular-character-storage',
      'Modular character storage',
      storageBackends.modularCharacters,
      deploymentProfile
    )
  );

  const summary = summarizeChecks(checks);
  return {
    ok: summary.failed === 0,
    baseUrl,
    deploymentProfile,
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
  const staticResult = evaluateProductionEnv(env, {
    baseUrl,
    deploymentProfile: options.deploymentProfile,
    explicitEnvKeys: options.explicitEnvKeys,
  });
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
    deploymentProfile: staticResult.deploymentProfile,
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
  const deploymentProfile = normalizeDeploymentProfile(args.get('deployment-profile'));
  const envInputs = collectProductionEnvInputs({
    root: process.cwd(),
    env: process.env,
    envFiles: ['.env', '.env.local', '.env.production', '.env.production.local'],
  });

  const result = await runProductionPreflight({
    env: envInputs.merged,
    baseUrl,
    reportPath,
    skipBackupDrill,
    deploymentProfile,
    explicitEnvKeys: envInputs.explicitKeys,
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
