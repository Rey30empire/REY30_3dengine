import { describe, expect, it } from 'vitest';
import { evaluateProductionEnv } from '../../scripts/production-preflight.mjs';

describe('production preflight env evaluation', () => {
  it('passes a complete single-node production env with expected warnings only', () => {
    const result = evaluateProductionEnv(
      {
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/rey30?schema=public',
        REY30_ENCRYPTION_KEY: 'super-secret',
        REY30_REGISTRATION_MODE: 'invite_only',
        REY30_REGISTRATION_INVITE_TOKEN: 'invite-token',
        REY30_BOOTSTRAP_OWNER_TOKEN: 'owner-token',
        REY30_ALLOWED_ORIGINS:
          'http://127.0.0.1:3000,http://localhost:3000,https://example.com',
        REY30_REMOTE_FETCH_ALLOWLIST_OPENAI: 'api.openai.com',
        REY30_REMOTE_FETCH_ALLOWLIST_MESHY: 'api.meshy.ai',
        REY30_REMOTE_FETCH_ALLOWLIST_RUNWAY: 'api.dev.runwayml.com',
        REY30_REMOTE_FETCH_ALLOWLIST_ASSETS: 'cdn.example.com',
        REY30_ALLOW_IN_MEMORY_RATE_LIMIT_PRODUCTION: 'true',
        REY30_OPS_TOKEN: 'ops-token',
        SMOKE_USER_EMAIL: 'smoke@example.com',
        SMOKE_USER_PASSWORD: 'smoke-password',
      },
      { baseUrl: 'http://127.0.0.1:3000' }
    );

    expect(result.ok).toBe(true);
    expect(result.summary.failed).toBe(0);
    const rateLimitCheck = result.checks.find((check) => check.id === 'rate-limit-backend');
    expect(rateLimitCheck?.status).toBe('warning');
  });

  it('fails missing critical production controls', () => {
    const result = evaluateProductionEnv(
      {
        NODE_ENV: 'production',
        REY30_REGISTRATION_MODE: 'open',
        REY30_ALLOW_OPEN_REGISTRATION_REMOTE: 'true',
        REY30_ENABLE_TERMINAL_API_REMOTE: 'true',
      },
      { baseUrl: 'https://prod.example.com' }
    );

    expect(result.ok).toBe(false);
    const failedIds = result.checks
      .filter((check) => check.status === 'failed')
      .map((check) => check.id);

    expect(failedIds).toContain('database-url');
    expect(failedIds).toContain('encryption-secret');
    expect(failedIds).toContain('registration-mode');
    expect(failedIds).toContain('bootstrap-owner-token');
    expect(failedIds).toContain('allowed-origins');
    expect(failedIds).toContain('remote-fetch-allowlists');
    expect(failedIds).toContain('rate-limit-backend');
    expect(failedIds).toContain('remote-open-registration');
    expect(failedIds).toContain('terminal-api-remote');
  });

  it('warns when provider allowlists rely on built-in defaults', () => {
    const result = evaluateProductionEnv({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/rey30?schema=public',
      REY30_ENCRYPTION_KEY: 'super-secret',
      REY30_REGISTRATION_MODE: 'allowlist',
      REY30_REGISTRATION_ALLOWLIST: 'owner@example.com',
      REY30_BOOTSTRAP_OWNER_TOKEN: 'owner-token',
      REY30_ALLOWED_ORIGINS: 'https://prod.example.com',
      REY30_REMOTE_FETCH_ALLOWLIST_ASSETS: 'cdn.example.com',
      REY30_UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
      REY30_UPSTASH_REDIS_REST_TOKEN: 'token',
    });

    expect(result.ok).toBe(true);
    const remoteFetchCheck = result.checks.find((check) => check.id === 'remote-fetch-allowlists');
    expect(remoteFetchCheck?.status).toBe('warning');
  });

  it('accepts NETLIFY_DATABASE_URL when DATABASE_URL is not set explicitly', () => {
    const result = evaluateProductionEnv({
      NODE_ENV: 'production',
      NETLIFY_DATABASE_URL:
        'postgresql://netlify:secret@ep-example-pooler.us-east-1.aws.neon.tech/rey30',
      REY30_ENCRYPTION_KEY: 'super-secret',
      REY30_REGISTRATION_MODE: 'invite_only',
      REY30_REGISTRATION_INVITE_TOKEN: 'invite-token',
      REY30_BOOTSTRAP_OWNER_TOKEN: 'owner-token',
      REY30_ALLOWED_ORIGINS: 'https://prod.example.com',
      REY30_REMOTE_FETCH_ALLOWLIST_ASSETS: 'cdn.example.com',
      REY30_ALLOW_IN_MEMORY_RATE_LIMIT_PRODUCTION: 'true',
    });

    expect(result.ok).toBe(true);
    const databaseCheck = result.checks.find((check) => check.id === 'database-url');
    expect(databaseCheck?.status).toBe('passed');
  });
});
