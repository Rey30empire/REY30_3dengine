import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * @typedef {{
 *   baseDir?: string,
 *   envFiles?: string[],
 * }} LoadWorkspaceEnvOptions
 */

function parseEnvContents(raw) {
  const values = new Map();
  const lines = raw.split(/\r?\n/);

  for (const line of lines) {
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

    values.set(key, value);
  }

  return values;
}

function trim(value) {
  return String(value || '').trim();
}

export function resolveDatabaseUrl(env = process.env) {
  const databaseUrl = trim(env.DATABASE_URL);
  if (databaseUrl) return databaseUrl;

  const netlifyDatabaseUrl = trim(env.NETLIFY_DATABASE_URL);
  if (netlifyDatabaseUrl) return netlifyDatabaseUrl;

  return '';
}

export function applyDatabaseUrlAliases(env = process.env) {
  const resolved = resolveDatabaseUrl(env);
  if (resolved && !trim(env.DATABASE_URL)) {
    env.DATABASE_URL = resolved;
  }
  return resolved;
}

/**
 * @param {string | LoadWorkspaceEnvOptions | undefined} baseDirOrOptions
 */
function normalizeOptions(baseDirOrOptions) {
  if (typeof baseDirOrOptions === 'string' || baseDirOrOptions === undefined) {
    return {
      baseDir: baseDirOrOptions || process.cwd(),
      envFiles: ['.env', '.env.production', '.env.local'],
    };
  }

  return {
    baseDir: baseDirOrOptions.baseDir || process.cwd(),
    envFiles: baseDirOrOptions.envFiles || ['.env', '.env.production', '.env.local'],
  };
}

/**
 * @param {string | LoadWorkspaceEnvOptions} [baseDirOrOptions]
 */
export function loadWorkspaceEnv(baseDirOrOptions = process.cwd()) {
  const { baseDir, envFiles } = normalizeOptions(baseDirOrOptions);
  const lockedKeys = new Set(Object.keys(process.env));

  for (const fileName of envFiles) {
    const filePath = path.join(baseDir, fileName);
    if (!existsSync(filePath)) continue;

    const parsed = parseEnvContents(readFileSync(filePath, 'utf8'));
    for (const [key, value] of parsed.entries()) {
      if (lockedKeys.has(key)) continue;
      process.env[key] = value;
    }
  }

  applyDatabaseUrlAliases(process.env);
}
