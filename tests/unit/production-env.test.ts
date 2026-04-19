import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  resolveProductionEnv,
  resolveProductionEnvWithMetadata,
} from '../../scripts/production-env.mjs';

describe('resolveProductionEnv', () => {
  it('builds a usable production-like env from process env plus example defaults', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'rey30-production-env-'));

    try {
      writeFileSync(
        path.join(tempDir, '.env.production.example'),
        [
          'REY30_REGISTRATION_MODE=invite_only',
          'REY30_BOOTSTRAP_OWNER_TOKEN=replace_with_owner_bootstrap_token',
          'REY30_REGISTRATION_INVITE_TOKEN=replace_with_invite_token',
          'DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/rey30?schema=public',
        ].join('\n')
      );

      const resolved = resolveProductionEnv({
        root: tempDir,
        env: {
          DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/rey30?schema=public',
        },
      });

      expect(resolved.DATABASE_URL).toBe(
        'postgresql://postgres:postgres@127.0.0.1:5432/rey30?schema=public'
      );
      expect(resolved.REY30_REGISTRATION_MODE).toBe('invite_only');
      expect(resolved.REY30_BOOTSTRAP_OWNER_TOKEN).toMatch(/^[a-f0-9]+$/);
      expect(resolved.REY30_REGISTRATION_INVITE_TOKEN).toMatch(/^[a-f0-9]+$/);
      expect(resolved.REY30_OPS_TOKEN).toMatch(/^[a-f0-9]+$/);
      expect(resolved.REY30_ALLOWED_ORIGINS).toContain('http://127.0.0.1:3000');
      expect(resolved.REY30_REMOTE_FETCH_ALLOWLIST_ASSETS).toContain('127.0.0.1');
      expect(resolved.SMOKE_USER_EMAIL).toBe('production-smoke@localhost');
      expect(resolved.SMOKE_USER_PASSWORD).toMatch(/^Rey30Smoke!/);
      expect(resolved.REY30_ALLOW_IN_MEMORY_RATE_LIMIT_PRODUCTION).toBe('true');
      expect(
        Boolean(resolved.REY30_ENCRYPTION_KEY) || Boolean(resolved.NEXTAUTH_SECRET)
      ).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('falls back to the repo local production postgres url when DATABASE_URL is omitted', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'rey30-production-env-'));

    try {
      writeFileSync(
        path.join(tempDir, '.env.production.example'),
        'DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/rey30?schema=public\n'
      );

      const resolved = resolveProductionEnv({
        root: tempDir,
        env: {},
      });

      expect(resolved.DATABASE_URL).toBe(
        'postgresql://postgres:postgres@127.0.0.1:5432/rey30?schema=public'
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('replaces placeholders, normalizes registration posture, and preserves provided smoke credentials', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'rey30-production-env-'));

    try {
      writeFileSync(
        path.join(tempDir, '.env.production.example'),
        [
          'REY30_REGISTRATION_MODE=open',
          'REY30_ALLOW_OPEN_REGISTRATION_REMOTE=true',
          'REY30_UPSTASH_REDIS_REST_URL=https://your-upstash-instance.upstash.io',
          'REY30_UPSTASH_REDIS_REST_TOKEN=replace_with_upstash_token',
          'REY30_REMOTE_FETCH_ALLOWLIST_ASSETS=cdn.your-domain.com',
        ].join('\n')
      );

      const resolved = resolveProductionEnv({
        root: tempDir,
        env: {
          DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/rey30?schema=public',
          SMOKE_USER_EMAIL: 'seal-smoke@example.com',
          SMOKE_USER_PASSWORD: 'SealSmoke123!',
        },
      });

      expect(resolved.REY30_REGISTRATION_MODE).toBe('invite_only');
      expect(resolved.REY30_ALLOW_OPEN_REGISTRATION_REMOTE).toBe('false');
      expect(resolved.REY30_UPSTASH_REDIS_REST_URL).toBeUndefined();
      expect(resolved.REY30_UPSTASH_REDIS_REST_TOKEN).toBeUndefined();
      expect(resolved.REY30_REMOTE_FETCH_ALLOWLIST_ASSETS).toBe('127.0.0.1,localhost');
      expect(resolved.SMOKE_USER_EMAIL).toBe('seal-smoke@example.com');
      expect(resolved.SMOKE_USER_PASSWORD).toBe('SealSmoke123!');
      expect(resolved.REY30_ALLOW_IN_MEMORY_RATE_LIMIT_PRODUCTION).toBe('true');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('accepts NETLIFY_DATABASE_URL as the production database source when DATABASE_URL is absent', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'rey30-production-env-'));

    try {
      writeFileSync(
        path.join(tempDir, '.env.production.example'),
        'DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/rey30?schema=public\n'
      );

      const resolved = resolveProductionEnv({
        root: tempDir,
        env: {
          NETLIFY_DATABASE_URL:
            'postgresql://netlify:secret@ep-example-pooler.us-east-1.aws.neon.tech/rey30',
        },
      });

      expect(resolved.DATABASE_URL).toBe(
        'postgresql://netlify:secret@ep-example-pooler.us-east-1.aws.neon.tech/rey30'
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('reports which smoke credentials were explicit vs generated', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'rey30-production-env-'));

    try {
      const result = resolveProductionEnvWithMetadata({
        root: tempDir,
        env: {
          DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/rey30?schema=public',
          SMOKE_USER_EMAIL: 'seal-smoke@example.com',
        },
      });

      expect(result.resolved.SMOKE_USER_EMAIL).toBe('seal-smoke@example.com');
      expect(result.metadata.explicitKeys).toContain('SMOKE_USER_EMAIL');
      expect(result.metadata.explicitKeys).not.toContain('SMOKE_USER_PASSWORD');
      expect(result.metadata.generatedKeys).toContain('SMOKE_USER_PASSWORD');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
