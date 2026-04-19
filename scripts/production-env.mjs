import crypto from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { buildDefaultSmokeCredentials } from './provision-smoke-user.mjs';
import { resolveDatabaseUrl } from './env-utils.mjs';

/**
 * @param {string} raw
 * @returns {Record<string, string>}
 */
function parseEnvContents(raw) {
  const values = {};

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

function readEnvFileIfExists(filePath) {
  if (!existsSync(filePath)) {
    return {};
  }
  return parseEnvContents(readFileSync(filePath, 'utf8'));
}

export function collectProductionEnvInputs(options = {}) {
  const root = options.root || process.cwd();
  const envFiles = options.envFiles || [
    '.env',
    '.env.local',
    '.env.production',
    '.env.production.local',
    '.env.production.example',
  ];
  /** @type {Record<string, string>} */
  const merged = {};
  /** @type {Set<string>} */
  const explicitKeys = new Set();

  for (const fileName of envFiles) {
    const fileValues = readEnvFileIfExists(path.join(root, fileName));
    for (const [key, value] of Object.entries(fileValues)) {
      merged[key] = value;
      explicitKeys.add(key);
    }
  }

  for (const [key, value] of Object.entries(options.env || process.env)) {
    if (value !== undefined) {
      merged[key] = String(value);
      explicitKeys.add(key);
    }
  }

  for (const key of Object.keys(merged)) {
    if (isPlaceholderValue(key, merged[key])) {
      delete merged[key];
      explicitKeys.delete(key);
    }
  }

  return {
    root,
    envFiles,
    merged,
    explicitKeys: Array.from(explicitKeys),
  };
}

function isPlaceholderValue(key, value) {
  const normalized = String(value || '').trim();
  if (!normalized) return true;
  if (normalized.startsWith('replace_with_')) return true;

  switch (key) {
    case 'DATABASE_URL':
      return normalized.includes('USER:PASSWORD@HOST');
    case 'REY30_UPSTASH_REDIS_REST_URL':
      return normalized.includes('your-upstash-instance');
    case 'REY30_UPSTASH_REDIS_REST_TOKEN':
      return normalized === 'replace_with_upstash_token';
    case 'REY30_REMOTE_FETCH_ALLOWLIST_ASSETS':
      return normalized.includes('your-domain.com');
    default:
      return false;
  }
}

function randomHex(size = 24) {
  return crypto.randomBytes(size).toString('hex');
}

function randomBase64(size = 32) {
  return crypto.randomBytes(size).toString('base64');
}

const DEFAULT_LOCAL_PRODUCTION_DATABASE_URL =
  'postgresql://postgres:postgres@127.0.0.1:5432/rey30?schema=public';

/**
 * @param {{
 *   root?: string,
 *   env?: Record<string, string | undefined> | NodeJS.ProcessEnv,
 *   envFiles?: string[],
 *   defaultDatabaseUrl?: string,
 * }} [options]
 * @returns {Record<string, string>}
 */
export function resolveProductionEnv(options = {}) {
  return resolveProductionEnvWithMetadata(options).resolved;
}

export function resolveProductionEnvWithMetadata(options = {}) {
  const inputs = collectProductionEnvInputs(options);
  const merged = {
    ...inputs.merged,
  };

  const databaseUrl = (
    resolveDatabaseUrl(merged) ||
    options.defaultDatabaseUrl ||
    DEFAULT_LOCAL_PRODUCTION_DATABASE_URL
  ).trim();

  /** @type {Record<string, string>} */
  const resolved = {
    ...merged,
    DATABASE_URL: databaseUrl,
    REY30_REGISTRATION_MODE: (merged.REY30_REGISTRATION_MODE || 'invite_only').trim().toLowerCase(),
    REY30_ALLOW_OPEN_REGISTRATION_REMOTE:
      (merged.REY30_ALLOW_OPEN_REGISTRATION_REMOTE || 'false').trim().toLowerCase(),
  };
  /** @type {string[]} */
  const generatedKeys = [];

  if (resolved.REY30_REGISTRATION_MODE === 'open') {
    resolved.REY30_REGISTRATION_MODE = 'invite_only';
  }
  resolved.REY30_ALLOW_OPEN_REGISTRATION_REMOTE = 'false';

  if (!resolved.REY30_BOOTSTRAP_OWNER_TOKEN) {
    resolved.REY30_BOOTSTRAP_OWNER_TOKEN = randomHex();
    generatedKeys.push('REY30_BOOTSTRAP_OWNER_TOKEN');
  }

  if (resolved.REY30_REGISTRATION_MODE === 'invite_only' && !resolved.REY30_REGISTRATION_INVITE_TOKEN) {
    resolved.REY30_REGISTRATION_INVITE_TOKEN = randomHex();
    generatedKeys.push('REY30_REGISTRATION_INVITE_TOKEN');
  }

  if (!resolved.REY30_ENCRYPTION_KEY && !resolved.NEXTAUTH_SECRET) {
    resolved.REY30_ENCRYPTION_KEY = randomBase64();
    generatedKeys.push('REY30_ENCRYPTION_KEY');
  }

  if (!resolved.REY30_ALLOWED_ORIGINS) {
    resolved.REY30_ALLOWED_ORIGINS = 'http://127.0.0.1:3000,http://localhost:3000';
    generatedKeys.push('REY30_ALLOWED_ORIGINS');
  }

  if (!resolved.REY30_REMOTE_FETCH_ALLOWLIST_ASSETS) {
    resolved.REY30_REMOTE_FETCH_ALLOWLIST_ASSETS = '127.0.0.1,localhost';
    generatedKeys.push('REY30_REMOTE_FETCH_ALLOWLIST_ASSETS');
  }

  if (!resolved.REY30_OPS_TOKEN) {
    resolved.REY30_OPS_TOKEN = randomHex();
    generatedKeys.push('REY30_OPS_TOKEN');
  }

  if (!resolved.SMOKE_USER_EMAIL || !resolved.SMOKE_USER_PASSWORD) {
    const smokeCredentials = buildDefaultSmokeCredentials();
    if (!resolved.SMOKE_USER_EMAIL) {
      resolved.SMOKE_USER_EMAIL = smokeCredentials.email;
      generatedKeys.push('SMOKE_USER_EMAIL');
    }
    if (!resolved.SMOKE_USER_PASSWORD) {
      resolved.SMOKE_USER_PASSWORD = smokeCredentials.password;
      generatedKeys.push('SMOKE_USER_PASSWORD');
    }
  }

  const hasDistributedRateLimit =
    Boolean(resolved.REY30_UPSTASH_REDIS_REST_URL) &&
    Boolean(resolved.REY30_UPSTASH_REDIS_REST_TOKEN);
  if (!hasDistributedRateLimit) {
    resolved.REY30_ALLOW_IN_MEMORY_RATE_LIMIT_PRODUCTION =
      (resolved.REY30_ALLOW_IN_MEMORY_RATE_LIMIT_PRODUCTION || 'true').trim().toLowerCase();
    if (!merged.REY30_ALLOW_IN_MEMORY_RATE_LIMIT_PRODUCTION) {
      generatedKeys.push('REY30_ALLOW_IN_MEMORY_RATE_LIMIT_PRODUCTION');
    }
  }

  return {
    resolved,
    metadata: {
      explicitKeys: inputs.explicitKeys,
      generatedKeys,
    },
  };
}
