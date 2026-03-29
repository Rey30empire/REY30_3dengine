import { describe, expect, it } from 'vitest';
import { GET as liveGet } from '@/app/api/health/live/route';
import { GET as readyGet } from '@/app/api/health/ready/route';

describe('Health API integration', () => {
  it('liveness endpoint reports service as live', async () => {
    const response = await liveGet();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.status).toBe('live');
    expect(payload.release?.service).toBe('rey30-3dengine');
  });

  it('readiness endpoint reports database ready', async () => {
    const previousNodeEnv = process.env.NODE_ENV;

    (process.env as Record<string, string | undefined>).NODE_ENV = 'test';

    try {
      const response = await readyGet();
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.ok).toBe(true);
      expect(payload.status).toBe('ready');
      expect(payload.checks?.database).toBe('ok');
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = previousNodeEnv;
    }
  });

  it('readiness endpoint reports security config error in production when secret is missing', async () => {
    const previous = {
      NODE_ENV: process.env.NODE_ENV,
      REY30_ENCRYPTION_KEY: process.env.REY30_ENCRYPTION_KEY,
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    };

    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    delete process.env.REY30_ENCRYPTION_KEY;
    delete process.env.NEXTAUTH_SECRET;

    try {
      const response = await readyGet();
      const payload = await response.json();

      expect(response.status).toBe(503);
      expect(payload.ok).toBe(false);
      expect(payload.status).toBe('not_ready');
      expect(payload.checks?.securityConfig).toBe('error');
      expect(String(payload.reason || '')).toMatch(/encryption secret/i);
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = previous.NODE_ENV;
      if (previous.REY30_ENCRYPTION_KEY === undefined) {
        delete process.env.REY30_ENCRYPTION_KEY;
      } else {
        process.env.REY30_ENCRYPTION_KEY = previous.REY30_ENCRYPTION_KEY;
      }
      if (previous.NEXTAUTH_SECRET === undefined) {
        delete process.env.NEXTAUTH_SECRET;
      } else {
        process.env.NEXTAUTH_SECRET = previous.NEXTAUTH_SECRET;
      }
    }
  });

  it('readiness endpoint reports registration policy error in production when invite token is missing', async () => {
    const previous = {
      NODE_ENV: process.env.NODE_ENV,
      REY30_ENCRYPTION_KEY: process.env.REY30_ENCRYPTION_KEY,
      REY30_REGISTRATION_MODE: process.env.REY30_REGISTRATION_MODE,
      REY30_REGISTRATION_INVITE_TOKEN: process.env.REY30_REGISTRATION_INVITE_TOKEN,
      REY30_BOOTSTRAP_OWNER_TOKEN: process.env.REY30_BOOTSTRAP_OWNER_TOKEN,
      REY30_ALLOW_OPEN_REGISTRATION_REMOTE: process.env.REY30_ALLOW_OPEN_REGISTRATION_REMOTE,
    };

    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    process.env.REY30_ENCRYPTION_KEY = previous.REY30_ENCRYPTION_KEY || 'test-prod-secret';
    process.env.REY30_REGISTRATION_MODE = 'invite_only';
    delete process.env.REY30_REGISTRATION_INVITE_TOKEN;
    process.env.REY30_BOOTSTRAP_OWNER_TOKEN =
      previous.REY30_BOOTSTRAP_OWNER_TOKEN || 'bootstrap-owner-token';
    process.env.REY30_ALLOW_OPEN_REGISTRATION_REMOTE = 'false';

    try {
      const response = await readyGet();
      const payload = await response.json();

      expect(response.status).toBe(503);
      expect(payload.ok).toBe(false);
      expect(payload.status).toBe('not_ready');
      expect(payload.checks?.registrationPolicy).toBe('error');
      expect(String(payload.reason || '')).toMatch(/invite[_ ]token/i);
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = previous.NODE_ENV;
      if (previous.REY30_ENCRYPTION_KEY === undefined) {
        delete process.env.REY30_ENCRYPTION_KEY;
      } else {
        process.env.REY30_ENCRYPTION_KEY = previous.REY30_ENCRYPTION_KEY;
      }
      if (previous.REY30_REGISTRATION_MODE === undefined) {
        delete process.env.REY30_REGISTRATION_MODE;
      } else {
        process.env.REY30_REGISTRATION_MODE = previous.REY30_REGISTRATION_MODE;
      }
      if (previous.REY30_REGISTRATION_INVITE_TOKEN === undefined) {
        delete process.env.REY30_REGISTRATION_INVITE_TOKEN;
      } else {
        process.env.REY30_REGISTRATION_INVITE_TOKEN =
          previous.REY30_REGISTRATION_INVITE_TOKEN;
      }
      if (previous.REY30_BOOTSTRAP_OWNER_TOKEN === undefined) {
        delete process.env.REY30_BOOTSTRAP_OWNER_TOKEN;
      } else {
        process.env.REY30_BOOTSTRAP_OWNER_TOKEN = previous.REY30_BOOTSTRAP_OWNER_TOKEN;
      }
      if (previous.REY30_ALLOW_OPEN_REGISTRATION_REMOTE === undefined) {
        delete process.env.REY30_ALLOW_OPEN_REGISTRATION_REMOTE;
      } else {
        process.env.REY30_ALLOW_OPEN_REGISTRATION_REMOTE =
          previous.REY30_ALLOW_OPEN_REGISTRATION_REMOTE;
      }
    }
  });
});
