import crypto from 'crypto';
import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';
import { POST as integrationEventsPost } from '@/app/api/integrations/events/route';

type Credential = {
  id: string;
  token: string;
  secret: string;
  scopes: string[];
};

function makeCredentials(scopes: string[] = ['events:write']): Credential {
  return {
    id: 'svc_backend',
    token: 'integration-token-123',
    secret: 'integration-secret-abc',
    scopes,
  };
}

function setIntegrationEnv(credential: Credential): () => void {
  const previous = {
    REY30_INTEGRATION_CREDENTIALS: process.env.REY30_INTEGRATION_CREDENTIALS,
    REY30_INTEGRATION_ID: process.env.REY30_INTEGRATION_ID,
    REY30_INTEGRATION_TOKEN: process.env.REY30_INTEGRATION_TOKEN,
    REY30_INTEGRATION_SECRET: process.env.REY30_INTEGRATION_SECRET,
    REY30_INTEGRATION_SCOPES: process.env.REY30_INTEGRATION_SCOPES,
  };

  process.env.REY30_INTEGRATION_CREDENTIALS = JSON.stringify([credential]);
  delete process.env.REY30_INTEGRATION_ID;
  delete process.env.REY30_INTEGRATION_TOKEN;
  delete process.env.REY30_INTEGRATION_SECRET;
  delete process.env.REY30_INTEGRATION_SCOPES;

  (globalThis as any).__rey30IntegrationNonceStore = new Map();

  return () => {
    process.env.REY30_INTEGRATION_CREDENTIALS = previous.REY30_INTEGRATION_CREDENTIALS;
    process.env.REY30_INTEGRATION_ID = previous.REY30_INTEGRATION_ID;
    process.env.REY30_INTEGRATION_TOKEN = previous.REY30_INTEGRATION_TOKEN;
    process.env.REY30_INTEGRATION_SECRET = previous.REY30_INTEGRATION_SECRET;
    process.env.REY30_INTEGRATION_SCOPES = previous.REY30_INTEGRATION_SCOPES;
    (globalThis as any).__rey30IntegrationNonceStore = new Map();
  };
}

function buildSignature(params: {
  method: string;
  path: string;
  timestamp: string;
  nonce: string;
  body: string;
  secret: string;
}): string {
  const bodyHash = crypto.createHash('sha256').update(params.body, 'utf8').digest('hex');
  const canonical = [
    params.method.toUpperCase(),
    params.path,
    params.timestamp,
    params.nonce,
    bodyHash,
  ].join('\n');
  return crypto.createHmac('sha256', params.secret).update(canonical, 'utf8').digest('hex');
}

function buildHeaders(params: {
  credential: Credential;
  body: string;
  method?: string;
  path?: string;
  nonce?: string;
  timestamp?: string;
  signatureOverride?: string;
}): HeadersInit {
  const method = params.method || 'POST';
  const path = params.path || '/api/integrations/events';
  const nonce = params.nonce || crypto.randomUUID();
  const timestamp = params.timestamp || String(Math.floor(Date.now() / 1000));
  const signature = params.signatureOverride || buildSignature({
    method,
    path,
    nonce,
    timestamp,
    body: params.body,
    secret: params.credential.secret,
  });

  return {
    authorization: `Bearer ${params.credential.token}`,
    'content-type': 'application/json',
    'x-rey30-integration-id': params.credential.id,
    'x-rey30-timestamp': timestamp,
    'x-rey30-nonce': nonce,
    'x-rey30-signature': signature,
  };
}

describe('Integration endpoint auth hardening', () => {
  it('accepts valid signed integration events', async () => {
    const credential = makeCredentials();
    const restore = setIntegrationEnv(credential);
    try {
      const body = JSON.stringify({
        eventType: 'build.completed',
        source: 'ci',
        payload: { jobId: 'job_123' },
      });
      const request = new NextRequest('http://localhost/api/integrations/events', {
        method: 'POST',
        headers: buildHeaders({ credential, body }),
        body,
      });

      const response = await integrationEventsPost(request);
      const payload = await response.json();
      expect(response.status).toBe(200);
      expect(payload.ok).toBe(true);
      expect(payload.integrationId).toBe(credential.id);
    } finally {
      restore();
    }
  });

  it('rejects invalid signature', async () => {
    const credential = makeCredentials();
    const restore = setIntegrationEnv(credential);
    try {
      const body = JSON.stringify({ eventType: 'build.completed' });
      const request = new NextRequest('http://localhost/api/integrations/events', {
        method: 'POST',
        headers: buildHeaders({
          credential,
          body,
          signatureOverride: 'deadbeef',
        }),
        body,
      });

      const response = await integrationEventsPost(request);
      const payload = await response.json();
      expect(response.status).toBe(401);
      expect(payload.code).toBe('invalid_signature');
    } finally {
      restore();
    }
  });

  it('rejects replayed nonce', async () => {
    const credential = makeCredentials();
    const restore = setIntegrationEnv(credential);
    try {
      const body = JSON.stringify({ eventType: 'build.completed' });
      const nonce = crypto.randomUUID();
      const timestamp = String(Math.floor(Date.now() / 1000));
      const headers = buildHeaders({
        credential,
        body,
        nonce,
        timestamp,
      });

      const first = await integrationEventsPost(
        new NextRequest('http://localhost/api/integrations/events', {
          method: 'POST',
          headers,
          body,
        })
      );
      expect(first.status).toBe(200);

      const second = await integrationEventsPost(
        new NextRequest('http://localhost/api/integrations/events', {
          method: 'POST',
          headers,
          body,
        })
      );
      const payload = await second.json();
      expect(second.status).toBe(401);
      expect(payload.code).toBe('replay_detected');
    } finally {
      restore();
    }
  });

  it('rejects integration without required scope', async () => {
    const credential = makeCredentials(['read:only']);
    const restore = setIntegrationEnv(credential);
    try {
      const body = JSON.stringify({ eventType: 'build.completed' });
      const request = new NextRequest('http://localhost/api/integrations/events', {
        method: 'POST',
        headers: buildHeaders({ credential, body }),
        body,
      });

      const response = await integrationEventsPost(request);
      const payload = await response.json();
      expect(response.status).toBe(403);
      expect(payload.code).toBe('missing_scope');
    } finally {
      restore();
    }
  });

  it('proxy allows no-origin integration only with required signed-header bundle', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    try {
      const blockedMissingHeaders = await proxy(
        new NextRequest('http://localhost/api/integrations/events', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: '{}',
        })
      );
      expect(blockedMissingHeaders.status).toBe(403);

      const allowedWithHeaderBundle = await proxy(
        new NextRequest('http://localhost/api/integrations/events', {
          method: 'POST',
          headers: {
            authorization: 'Bearer some-token',
            'x-rey30-integration-id': 'svc_backend',
            'x-rey30-timestamp': String(Math.floor(Date.now() / 1000)),
            'x-rey30-nonce': crypto.randomUUID(),
            'x-rey30-signature': 'abc123',
            'content-type': 'application/json',
          },
          body: '{}',
        })
      );
      expect(allowedWithHeaderBundle.status).not.toBe(403);

      const blockedOnRegularRoute = await proxy(
        new NextRequest('http://localhost/api/auth/login', {
          method: 'POST',
          headers: {
            authorization: 'Bearer some-token',
            'x-rey30-integration-id': 'svc_backend',
            'x-rey30-timestamp': String(Math.floor(Date.now() / 1000)),
            'x-rey30-nonce': crypto.randomUUID(),
            'x-rey30-signature': 'abc123',
            'content-type': 'application/json',
          },
          body: '{}',
        })
      );
      expect(blockedOnRegularRoute.status).toBe(403);
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = previousNodeEnv;
    }
  });
});
