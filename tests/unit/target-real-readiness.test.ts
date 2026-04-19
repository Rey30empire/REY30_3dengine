import { describe, expect, it } from 'vitest';
import { evaluateTargetRealReadiness } from '../../scripts/target-real-readiness.mjs';

const completeTargetEnv = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://netlify:secret@ep-example-pooler.us-east-1.aws.neon.tech/rey30',
  REY30_ENCRYPTION_KEY: 'secret',
  REY30_REGISTRATION_MODE: 'invite_only',
  REY30_REGISTRATION_INVITE_TOKEN: 'invite-token',
  REY30_BOOTSTRAP_OWNER_TOKEN: 'owner-token',
  REY30_ALLOWED_ORIGINS: 'https://prod.example.com',
  REY30_REMOTE_FETCH_ALLOWLIST_ASSETS: 'cdn.example.com',
  REY30_OPS_TOKEN: 'ops-token',
  REY30_UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
  REY30_UPSTASH_REDIS_REST_TOKEN: 'upstash-token',
  SMOKE_USER_EMAIL: 'smoke@example.com',
  SMOKE_USER_PASSWORD: 'smoke-password',
};

const durableStorage = {
  scripts: 'netlify-blobs',
  gallery: 'netlify-blobs',
  packages: 'netlify-blobs',
  assets: 'netlify-blobs',
  modularCharacters: 'netlify-blobs',
  allDurableShared: true,
};

describe('target real readiness', () => {
  it('passes when all target-real prereqs are explicit and durable', () => {
    const result = evaluateTargetRealReadiness({
      baseUrl: 'https://prod.example.com',
      env: completeTargetEnv,
      explicitEnvKeys: Object.keys(completeTargetEnv),
      generatedEnvKeys: [],
      storageProfile: durableStorage,
    });

    expect(result.ok).toBe(true);
    expect(result.failedChecks).toEqual([]);
  });

  it('fails fast for local/http targets, generated defaults and filesystem storage', () => {
    const result = evaluateTargetRealReadiness({
      baseUrl: 'http://127.0.0.1:3000',
      env: {
        ...completeTargetEnv,
        DATABASE_URL: 'file:./dev.db',
        REY30_ALLOWED_ORIGINS: 'http://127.0.0.1:3000',
      },
      explicitEnvKeys: ['DATABASE_URL', 'REY30_ALLOWED_ORIGINS'],
      generatedEnvKeys: ['REY30_OPS_TOKEN', 'SMOKE_USER_PASSWORD'],
      storageProfile: {
        ...durableStorage,
        assets: 'filesystem',
        allDurableShared: false,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.failedChecks).toContain('target-base-url-https');
    expect(result.failedChecks).toContain('target-base-url-non-local');
    expect(result.failedChecks).toContain('database-networked');
    expect(result.failedChecks).toContain('distributed-rate-limit-explicit');
    expect(result.failedChecks).toContain('shared-durable-storage');
    expect(result.failedChecks).toContain('no-generated-production-defaults');
  });
});
