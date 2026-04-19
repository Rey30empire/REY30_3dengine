import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { loadWorkspaceEnv } from './env-utils.mjs';
import { applyResolvedLocalPostgresEnv, isRepoManagedLocalPostgresUrl } from './local-postgres.mjs';

loadWorkspaceEnv({
  envFiles: ['.env', '.env.local', '.env.production', '.env.production.local'],
});

const args = new Set(process.argv.slice(2));
const shouldSkipDb = args.has('--skip-db');
const shouldSkipBuild = args.has('--skip-build');
const shouldSkipDocker = args.has('--skip-docker');
let childProcess = null;

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

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HOSTNAME: process.env.HOSTNAME || '127.0.0.1',
      PORT: process.env.PORT || '3000',
    },
    ...options,
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${commandArgs.join(' ')} failed with code ${result.status}`);
  }
}

function ensureProductionEnv() {
  const databaseUrl = (process.env.DATABASE_URL || '').trim();
  const registrationMode = (process.env.REY30_REGISTRATION_MODE || '').trim().toLowerCase();
  const inviteToken = (process.env.REY30_REGISTRATION_INVITE_TOKEN || '').trim();
  const bootstrapOwnerToken = (process.env.REY30_BOOTSTRAP_OWNER_TOKEN || '').trim();
  const encryptionSecret = (process.env.REY30_ENCRYPTION_KEY || '').trim();
  const nextAuthSecret = (process.env.NEXTAUTH_SECRET || '').trim();
  const distributedRateLimitUrl = (
    process.env.REY30_UPSTASH_REDIS_REST_URL ||
    process.env.UPSTASH_REDIS_REST_URL ||
    ''
  ).trim();
  const distributedRateLimitToken = (
    process.env.REY30_UPSTASH_REDIS_REST_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    ''
  ).trim();
  const allowInMemoryRateLimitFallback =
    (process.env.REY30_ALLOW_IN_MEMORY_RATE_LIMIT_PRODUCTION || '').trim().toLowerCase() ===
    'true';
  const allowRemoteOpenRegistration =
    (process.env.REY30_ALLOW_OPEN_REGISTRATION_REMOTE || '').trim().toLowerCase() === 'true';

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required. Configure .env.production or .env.production.local first.');
  }
  if (!registrationMode) {
    throw new Error('REY30_REGISTRATION_MODE is required for production local.');
  }
  if (registrationMode === 'open') {
    throw new Error('REY30_REGISTRATION_MODE=open is not allowed for production local.');
  }
  if (registrationMode === 'invite_only' && !inviteToken) {
    throw new Error(
      'REY30_REGISTRATION_INVITE_TOKEN is required when REY30_REGISTRATION_MODE=invite_only.'
    );
  }
  if (!bootstrapOwnerToken) {
    throw new Error('REY30_BOOTSTRAP_OWNER_TOKEN is required for production local.');
  }
  if (!encryptionSecret && !nextAuthSecret) {
    throw new Error('REY30_ENCRYPTION_KEY or NEXTAUTH_SECRET is required for production local.');
  }
  if ((!distributedRateLimitUrl || !distributedRateLimitToken) && !allowInMemoryRateLimitFallback) {
    throw new Error(
      'Configure REY30_UPSTASH_REDIS_REST_URL and REY30_UPSTASH_REDIS_REST_TOKEN, or set REY30_ALLOW_IN_MEMORY_RATE_LIMIT_PRODUCTION=true for intentional single-node production local.'
    );
  }
  if (allowRemoteOpenRegistration) {
    throw new Error('REY30_ALLOW_OPEN_REGISTRATION_REMOTE must remain false in production local.');
  }

  const standaloneServer = path.join(process.cwd(), '.next', 'standalone', 'server.js');
  return {
    standaloneServer,
    databaseUrl,
  };
}

async function main() {
  await applyResolvedLocalPostgresEnv(process.env);
  const { standaloneServer, databaseUrl } = ensureProductionEnv();

  process.env.NODE_ENV = 'production';
  process.env.HOSTNAME = process.env.HOSTNAME || '127.0.0.1';
  process.env.PORT = process.env.PORT || '3000';

  if (!shouldSkipDocker && isRepoManagedLocalPostgresUrl(databaseUrl)) {
    run('pnpm', ['run', 'db:postgres:up']);
  }

  if (!shouldSkipDb) {
    run('pnpm', ['run', 'db:deploy']);
  }

  if (!shouldSkipBuild || !existsSync(standaloneServer)) {
    run('pnpm', ['run', 'build']);
  }

  process.stdout.write(
    `Production local ready on http://${process.env.HOSTNAME}:${process.env.PORT}\n`
  );

  childProcess = spawn(process.execPath, ['scripts/start-standalone.mjs'], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: process.env,
  });

  childProcess.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

function shutdown(signal) {
  terminateChildProcessTree(childProcess, signal);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

main().catch((error) => {
  process.stderr.write(`start-production-local failed: ${String(error?.message || error)}\n`);
  process.exit(1);
});
