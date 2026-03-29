import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as openaiGet } from '@/app/api/openai/route';
import { GET as meshyGet } from '@/app/api/meshy/route';
import { GET as runwayGet } from '@/app/api/runway/route';
import { GET as sessionGet } from '@/app/api/auth/session/route';
import { POST as registerPost } from '@/app/api/auth/register/route';
import { GET as userConfigGet } from '@/app/api/user/api-config/route';
import { GET as telemetryGet } from '@/app/api/telemetry/route';

describe('Auth + provider API integration', () => {
  it('session endpoint reports unauthenticated without cookie', async () => {
    const request = new NextRequest('http://localhost/api/auth/session');
    const response = await sessionGet(request);
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.authenticated).toBe(false);
  });

  it('session endpoint does not crash when encryption secret is missing in production', async () => {
    const previous = {
      NODE_ENV: process.env.NODE_ENV,
      REY30_ENCRYPTION_KEY: process.env.REY30_ENCRYPTION_KEY,
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    };

    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    delete process.env.REY30_ENCRYPTION_KEY;
    delete process.env.NEXTAUTH_SECRET;

    try {
      const request = new NextRequest('http://localhost/api/auth/session');
      const response = await sessionGet(request);
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.authenticated).toBe(false);
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
  it('register endpoint is invite-only by default', async () => {
    const previousMode = process.env.REY30_REGISTRATION_MODE;
    const previousInvite = process.env.REY30_REGISTRATION_INVITE_TOKEN;
    delete process.env.REY30_REGISTRATION_MODE;
    delete process.env.REY30_REGISTRATION_INVITE_TOKEN;
    try {
      const response = await registerPost(
        new NextRequest('http://localhost/api/auth/register', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            email: 'new-user@example.com',
            password: 'valid-password-123',
            name: 'New User',
          }),
        })
      );
      expect(response.status).toBe(403);
    } finally {
      if (previousMode === undefined) {
        delete process.env.REY30_REGISTRATION_MODE;
      } else {
        process.env.REY30_REGISTRATION_MODE = previousMode;
      }
      if (previousInvite === undefined) {
        delete process.env.REY30_REGISTRATION_INVITE_TOKEN;
      } else {
        process.env.REY30_REGISTRATION_INVITE_TOKEN = previousInvite;
      }
    }
  });
  it('open registration mode is blocked for non-local hosts unless explicitly allowed', async () => {
    const previousMode = process.env.REY30_REGISTRATION_MODE;
    const previousRemote = process.env.REY30_ALLOW_OPEN_REGISTRATION_REMOTE;
    process.env.REY30_REGISTRATION_MODE = 'open';
    delete process.env.REY30_ALLOW_OPEN_REGISTRATION_REMOTE;
    try {
      const response = await registerPost(
        new NextRequest('http://example.com/api/auth/register', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            email: 'remote-user@example.com',
            password: 'valid-password-123',
            name: 'Remote User',
          }),
        })
      );
      expect(response.status).toBe(403);
    } finally {
      if (previousMode === undefined) {
        delete process.env.REY30_REGISTRATION_MODE;
      } else {
        process.env.REY30_REGISTRATION_MODE = previousMode;
      }
      if (previousRemote === undefined) {
        delete process.env.REY30_ALLOW_OPEN_REGISTRATION_REMOTE;
      } else {
        process.env.REY30_ALLOW_OPEN_REGISTRATION_REMOTE = previousRemote;
      }
    }
  });
  it('cloud provider status endpoints return configured=false when user is anonymous', async () => {
    const openaiResponse = await openaiGet(new NextRequest('http://localhost/api/openai'));
    const meshyResponse = await meshyGet(new NextRequest('http://localhost/api/meshy'));
    const runwayResponse = await runwayGet(new NextRequest('http://localhost/api/runway'));

    const openaiPayload = await openaiResponse.json();
    const meshyPayload = await meshyResponse.json();
    const runwayPayload = await runwayResponse.json();

    expect(openaiPayload.configured).toBe(false);
    expect(meshyPayload.configured).toBe(false);
    expect(runwayPayload.configured).toBe(false);
  });

  it('user api config endpoint blocks anonymous access', async () => {
    const response = await userConfigGet(new NextRequest('http://localhost/api/user/api-config'));
    const payload = await response.json();
    expect(response.status).toBe(401);
    expect(String(payload.error || '')).toContain('iniciar sesi');
  });

  it('telemetry endpoint requires authenticated editor session', async () => {
    const response = await telemetryGet(new NextRequest('http://localhost/api/telemetry'));
    expect(response.status).toBe(401);
  });
});


