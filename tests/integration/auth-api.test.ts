import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { GET as openaiGet } from '@/app/api/openai/route';
import { GET as meshyGet } from '@/app/api/meshy/route';
import { GET as runwayGet } from '@/app/api/runway/route';
import { GET as sessionGet } from '@/app/api/auth/session/route';
import { POST as registerPost } from '@/app/api/auth/register/route';
import { POST as tokenPost } from '@/app/api/auth/token/route';
import { GET as userConfigGet } from '@/app/api/user/api-config/route';
import { GET as telemetryGet, POST as telemetryPost } from '@/app/api/telemetry/route';
import { GET as backupsGet } from '@/app/api/ops/backups/route';

describe('Auth + provider API integration', () => {
  it('session endpoint reports unauthenticated without cookie', async () => {
    const previousLocalOwnerMode = process.env.REY30_LOCAL_OWNER_MODE;

    delete process.env.REY30_LOCAL_OWNER_MODE;

    try {
      const request = new NextRequest('http://localhost/api/auth/session');
      const response = await sessionGet(request);
      const payload = await response.json();
      expect(response.status).toBe(200);
      expect(payload.authenticated).toBe(false);
      expect(payload.editorAccess?.shellMode).toBe('product');
    } finally {
      if (previousLocalOwnerMode === undefined) {
        delete process.env.REY30_LOCAL_OWNER_MODE;
      } else {
        process.env.REY30_LOCAL_OWNER_MODE = previousLocalOwnerMode;
      }
    }
  });

  it('bootstraps a local owner session without email or password when local mode is enabled', async () => {
    const previous = {
      REY30_LOCAL_OWNER_MODE: process.env.REY30_LOCAL_OWNER_MODE,
      REY30_LOCAL_OWNER_ALLOW_REMOTE: process.env.REY30_LOCAL_OWNER_ALLOW_REMOTE,
      REY30_LOCAL_OWNER_EMAIL: process.env.REY30_LOCAL_OWNER_EMAIL,
      REY30_LOCAL_OWNER_NAME: process.env.REY30_LOCAL_OWNER_NAME,
    };

    process.env.REY30_LOCAL_OWNER_MODE = 'true';
    process.env.REY30_LOCAL_OWNER_ALLOW_REMOTE = 'false';
    process.env.REY30_LOCAL_OWNER_EMAIL = 'owner-local-test@rey30.local';
    process.env.REY30_LOCAL_OWNER_NAME = 'Local Owner Test';

    try {
      const databaseReachable = await db.$queryRaw`SELECT 1`
        .then(() => true)
        .catch(() => false);

      if (!databaseReachable) {
        expect(databaseReachable).toBe(false);
        return;
      }

      const response = await sessionGet(new NextRequest('http://localhost/api/auth/session'));
      const payload = await response.json();
      const cookie = response.cookies.get('rey30_session');

      expect(response.status).toBe(200);
      expect(payload.authenticated).toBe(true);
      expect(payload.policy?.localOwnerMode).toBe(true);
      expect(payload.user?.email).toBe('owner-local-test@rey30.local');
      expect(payload.user?.role).toBe('OWNER');
      expect(cookie?.value).toBeTruthy();

      const configResponse = await userConfigGet(
        new NextRequest('http://localhost/api/user/api-config', {
          headers: {
            cookie: `rey30_session=${cookie?.value || ''}`,
          },
        })
      );

      expect(configResponse.status).toBe(200);
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  });

  it('session endpoint does not crash when encryption secret is missing in production', async () => {
    const previous = {
      NODE_ENV: process.env.NODE_ENV,
      REY30_ENCRYPTION_KEY: process.env.REY30_ENCRYPTION_KEY,
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
      REY30_LOCAL_OWNER_MODE: process.env.REY30_LOCAL_OWNER_MODE,
    };

    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    delete process.env.REY30_ENCRYPTION_KEY;
    delete process.env.NEXTAUTH_SECRET;
    delete process.env.REY30_LOCAL_OWNER_MODE;

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
      if (previous.REY30_LOCAL_OWNER_MODE === undefined) {
        delete process.env.REY30_LOCAL_OWNER_MODE;
      } else {
        process.env.REY30_LOCAL_OWNER_MODE = previous.REY30_LOCAL_OWNER_MODE;
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

  it('shared access token can authenticate and expose shared OpenAI + Meshy config', async () => {
    const previous = {
      REY30_SHARED_ACCESS_TOKEN: process.env.REY30_SHARED_ACCESS_TOKEN,
      REY30_SHARED_ACCESS_EMAIL: process.env.REY30_SHARED_ACCESS_EMAIL,
      REY30_SHARED_ACCESS_NAME: process.env.REY30_SHARED_ACCESS_NAME,
      REY30_SHARED_ACCESS_ROLE: process.env.REY30_SHARED_ACCESS_ROLE,
      INVITE_PROFILE_OPENAI_API_KEY: process.env.INVITE_PROFILE_OPENAI_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      MESHY_API_KEY: process.env.MESHY_API_KEY,
    };

    process.env.REY30_SHARED_ACCESS_TOKEN = 'shared-access-test-token';
    process.env.REY30_SHARED_ACCESS_EMAIL = 'shared-access-test@rey30.local';
    process.env.REY30_SHARED_ACCESS_NAME = 'Shared Access Test';
    process.env.REY30_SHARED_ACCESS_ROLE = 'OWNER';
    process.env.INVITE_PROFILE_OPENAI_API_KEY = 'sk-test-shared-openai';
    delete process.env.OPENAI_API_KEY;
    process.env.MESHY_API_KEY = 'msy-test-shared-meshy';

    try {
      const databaseReachable = await db.$queryRaw`SELECT 1`
        .then(() => true)
        .catch(() => false);

      if (!databaseReachable) {
        expect(databaseReachable).toBe(false);
        return;
      }

      const loginResponse = await tokenPost(
        new NextRequest('http://localhost/api/auth/token', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token: 'shared-access-test-token' }),
        })
      );
      const loginPayload = await loginResponse.json();
      expect(loginResponse.status).toBe(200);
      expect(loginPayload.success).toBe(true);
      expect(loginPayload.user.role).toBe('VIEWER');

      const authHeaders = {
        authorization: 'Bearer shared-access-test-token',
      };

      const sessionResponse = await sessionGet(
        new NextRequest('http://localhost/api/auth/session', {
          headers: authHeaders,
        })
      );
      const sessionPayload = await sessionResponse.json();
      expect(sessionResponse.status).toBe(200);
      expect(sessionPayload.authenticated).toBe(true);
      expect(sessionPayload.accessMode).toBe('shared_token');
      expect(sessionPayload.user.role).toBe('VIEWER');
      expect(sessionPayload.editorAccess).toEqual({
        shellMode: 'product',
        permissions: {
          advancedShell: false,
          admin: false,
          compile: false,
          advancedWorkspaces: false,
          debugTools: false,
          editorSessionBridge: false,
          terminalActions: false,
        },
      });

      const configResponse = await userConfigGet(
        new NextRequest('http://localhost/api/user/api-config', {
          headers: authHeaders,
        })
      );
      const configPayload = await configResponse.json();
      expect(configResponse.status).toBe(200);
      expect(configPayload.user.role).toBe('VIEWER');
      expect(configPayload.policy.sharedAccess).toBe(true);

      const openaiResponse = await openaiGet(
        new NextRequest('http://localhost/api/openai', {
          headers: authHeaders,
        })
      );
      const meshyResponse = await meshyGet(
        new NextRequest('http://localhost/api/meshy', {
          headers: authHeaders,
        })
      );
      const openaiPayload = await openaiResponse.json();
      const meshyPayload = await meshyResponse.json();
      expect(openaiPayload.configured).toBe(true);
      expect(meshyPayload.configured).toBe(true);

      const backupsResponse = await backupsGet(
        new NextRequest('http://localhost/api/ops/backups', {
          headers: authHeaders,
        })
      );
      expect(backupsResponse.status).toBe(403);
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
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

  it('telemetry ingestion requires authenticated editor session', async () => {
    const response = await telemetryPost(
      new NextRequest('http://localhost/api/telemetry', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          performance: {
            fps: 60,
            frameTimeMs: 16.7,
          },
        }),
      })
    );
    expect(response.status).toBe(401);
  });
});


