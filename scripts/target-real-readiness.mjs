function trim(value) {
  return String(value || '').trim();
}

function makeCheck(id, status, detail, extra = {}) {
  return {
    id,
    status,
    detail,
    ...extra,
  };
}

function hasExplicitValue(env, explicitEnvKeys, key) {
  return explicitEnvKeys.has(key) && trim(env[key]).length > 0;
}

function isFileDatabaseUrl(databaseUrl) {
  const normalized = trim(databaseUrl).toLowerCase();
  return normalized.startsWith('file:') || normalized.startsWith('sqlite:');
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

function parseCsv(value) {
  return trim(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function hasDistributedRateLimit(env) {
  const hasUrl =
    trim(env.REY30_UPSTASH_REDIS_REST_URL).length > 0 ||
    trim(env.UPSTASH_REDIS_REST_URL).length > 0;
  const hasToken =
    trim(env.REY30_UPSTASH_REDIS_REST_TOKEN).length > 0 ||
    trim(env.UPSTASH_REDIS_REST_TOKEN).length > 0;
  return hasUrl && hasToken;
}

function hasExplicitDistributedRateLimit(env, explicitEnvKeys) {
  const hasExplicitUrl =
    hasExplicitValue(env, explicitEnvKeys, 'REY30_UPSTASH_REDIS_REST_URL') ||
    hasExplicitValue(env, explicitEnvKeys, 'UPSTASH_REDIS_REST_URL');
  const hasExplicitToken =
    hasExplicitValue(env, explicitEnvKeys, 'REY30_UPSTASH_REDIS_REST_TOKEN') ||
    hasExplicitValue(env, explicitEnvKeys, 'UPSTASH_REDIS_REST_TOKEN');
  return hasExplicitUrl && hasExplicitToken;
}

function hasExplicitEncryptionSecret(env, explicitEnvKeys) {
  return (
    hasExplicitValue(env, explicitEnvKeys, 'REY30_ENCRYPTION_KEY') ||
    hasExplicitValue(env, explicitEnvKeys, 'APP_ENCRYPTION_KEY') ||
    hasExplicitValue(env, explicitEnvKeys, 'NEXTAUTH_SECRET')
  );
}

export function evaluateTargetRealReadiness(options = {}) {
  const env = options.env || {};
  const baseUrl = trim(options.baseUrl);
  const explicitEnvKeys = new Set(options.explicitEnvKeys || []);
  const generatedEnvKeys = new Set(options.generatedEnvKeys || []);
  const storageProfile = options.storageProfile || {};
  const checks = [];

  if (!baseUrl) {
    checks.push(
      makeCheck(
        'target-base-url-present',
        'failed',
        'Target-real seal requires --base-url or PRODUCTION_BASE_URL.'
      )
    );
  } else {
    const parsed = new URL(baseUrl);
    checks.push(
      parsed.protocol === 'https:'
        ? makeCheck('target-base-url-https', 'passed', 'Target base URL uses HTTPS.', {
            baseUrl,
          })
        : makeCheck(
            'target-base-url-https',
            'failed',
            `Target-real seal requires HTTPS, got ${parsed.protocol.replace(':', '')}.`,
            { baseUrl }
          )
    );
    checks.push(
      isLocalBaseUrl(baseUrl)
        ? makeCheck(
            'target-base-url-non-local',
            'failed',
            `Target-real seal cannot use a local base URL (${baseUrl}).`,
            { baseUrl }
          )
        : makeCheck('target-base-url-non-local', 'passed', 'Target base URL is non-local.', {
            baseUrl,
          })
    );
  }

  const databaseUrl = trim(env.DATABASE_URL || env.NETLIFY_DATABASE_URL);
  checks.push(
    databaseUrl && !isFileDatabaseUrl(databaseUrl)
      ? makeCheck(
          'database-networked',
          'passed',
          'Target-real seal has a networked database URL.'
        )
      : makeCheck(
          'database-networked',
          'failed',
          'Target-real seal requires a networked DATABASE_URL/NETLIFY_DATABASE_URL, not sqlite/file storage.'
        )
  );

  checks.push(
    hasDistributedRateLimit(env) && hasExplicitDistributedRateLimit(env, explicitEnvKeys)
      ? makeCheck(
          'distributed-rate-limit-explicit',
          'passed',
          'Distributed rate-limit backend is explicitly configured.'
        )
      : makeCheck(
          'distributed-rate-limit-explicit',
          'failed',
          'Target-real seal requires explicit Upstash URL and token.'
        )
  );

  checks.push(
    hasExplicitEncryptionSecret(env, explicitEnvKeys)
      ? makeCheck('encryption-secret-explicit', 'passed', 'Encryption secret is explicit.')
      : makeCheck(
          'encryption-secret-explicit',
          'failed',
          'Target-real seal requires explicit REY30_ENCRYPTION_KEY, APP_ENCRYPTION_KEY, or NEXTAUTH_SECRET.'
        )
  );

  checks.push(
    hasExplicitValue(env, explicitEnvKeys, 'REY30_BOOTSTRAP_OWNER_TOKEN')
      ? makeCheck('bootstrap-owner-token-explicit', 'passed', 'Bootstrap owner token is explicit.')
      : makeCheck(
          'bootstrap-owner-token-explicit',
          'failed',
          'Target-real seal requires explicit REY30_BOOTSTRAP_OWNER_TOKEN.'
        )
  );

  if (trim(env.REY30_REGISTRATION_MODE).toLowerCase() === 'invite_only') {
    checks.push(
      hasExplicitValue(env, explicitEnvKeys, 'REY30_REGISTRATION_INVITE_TOKEN')
        ? makeCheck('invite-token-explicit', 'passed', 'Invite token is explicit.')
        : makeCheck(
            'invite-token-explicit',
            'failed',
            'Target-real seal requires explicit REY30_REGISTRATION_INVITE_TOKEN in invite_only mode.'
          )
    );
  }

  checks.push(
    hasExplicitValue(env, explicitEnvKeys, 'REY30_OPS_TOKEN')
      ? makeCheck('ops-token-explicit', 'passed', 'Ops token is explicit.')
      : makeCheck(
          'ops-token-explicit',
          'failed',
          'Target-real seal requires explicit REY30_OPS_TOKEN for backup drill evidence.'
        )
  );

  checks.push(
    hasExplicitValue(env, explicitEnvKeys, 'SMOKE_USER_EMAIL') &&
      hasExplicitValue(env, explicitEnvKeys, 'SMOKE_USER_PASSWORD')
      ? makeCheck('smoke-credentials-explicit', 'passed', 'Smoke credentials are explicit.')
      : makeCheck(
          'smoke-credentials-explicit',
          'failed',
          'Target-real seal requires explicit SMOKE_USER_EMAIL and SMOKE_USER_PASSWORD.'
        )
  );

  const allowedOrigins = parseCsv(env.REY30_ALLOWED_ORIGINS);
  checks.push(
    baseUrl && allowedOrigins.includes(baseUrl)
      ? makeCheck('allowed-origins-target', 'passed', 'Allowed origins include target URL.', {
          allowedOrigins,
        })
      : makeCheck(
          'allowed-origins-target',
          'failed',
          'Target-real seal requires REY30_ALLOWED_ORIGINS to include the exact target base URL.',
          { allowedOrigins, baseUrl: baseUrl || null }
        )
  );

  checks.push(
    hasExplicitValue(env, explicitEnvKeys, 'REY30_REMOTE_FETCH_ALLOWLIST_ASSETS')
      ? makeCheck(
          'asset-fetch-allowlist-explicit',
          'passed',
          'Asset remote-fetch allowlist is explicit.'
        )
      : makeCheck(
          'asset-fetch-allowlist-explicit',
          'failed',
          'Target-real seal requires explicit REY30_REMOTE_FETCH_ALLOWLIST_ASSETS.'
        )
  );

  const filesystemStorage = Object.entries(storageProfile)
    .filter(([key]) => key !== 'allDurableShared')
    .filter(([, backend]) => trim(backend).toLowerCase() === 'filesystem')
    .map(([key]) => key);
  checks.push(
    filesystemStorage.length === 0 && storageProfile.allDurableShared === true
      ? makeCheck('shared-durable-storage', 'passed', 'All storage backends are durable/shared.', {
          storageProfile,
        })
      : makeCheck(
          'shared-durable-storage',
          'failed',
          'Target-real seal requires all storage backends to be durable/shared.',
          {
            filesystemStorage,
            storageProfile,
          }
        )
  );

  const generatedKeys = Array.from(generatedEnvKeys).filter(Boolean).sort();
  checks.push(
    generatedKeys.length === 0
      ? makeCheck('no-generated-production-defaults', 'passed', 'No generated production defaults are in use.')
      : makeCheck(
          'no-generated-production-defaults',
          'failed',
          'Target-real seal cannot rely on generated production defaults.',
          { generatedKeys }
        )
  );

  const failedChecks = checks.filter((check) => check.status === 'failed');
  return {
    ok: failedChecks.length === 0,
    checks,
    failedChecks: failedChecks.map((check) => check.id),
  };
}
