import crypto from 'crypto';
import { mkdtemp, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';
import { POST as integrationEventsPost } from '@/app/api/integrations/events/route';
import { readIntegrationEventRecord, resetExternalIntegrationStorageForTest } from '@/lib/server/external-integration-store';

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

  return () => {
    process.env.REY30_INTEGRATION_CREDENTIALS = previous.REY30_INTEGRATION_CREDENTIALS;
    process.env.REY30_INTEGRATION_ID = previous.REY30_INTEGRATION_ID;
    process.env.REY30_INTEGRATION_TOKEN = previous.REY30_INTEGRATION_TOKEN;
    process.env.REY30_INTEGRATION_SECRET = previous.REY30_INTEGRATION_SECRET;
    process.env.REY30_INTEGRATION_SCOPES = previous.REY30_INTEGRATION_SCOPES;
  };
}

function setUpstashEnv(config?: { url?: string; token?: string }): () => void {
  const previous = {
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    REY30_UPSTASH_REDIS_REST_URL: process.env.REY30_UPSTASH_REDIS_REST_URL,
    REY30_UPSTASH_REDIS_REST_TOKEN: process.env.REY30_UPSTASH_REDIS_REST_TOKEN,
  };

  const url = config?.url?.trim() || '';
  const token = config?.token?.trim() || '';

  if (url) {
    process.env.REY30_UPSTASH_REDIS_REST_URL = url;
  } else {
    delete process.env.REY30_UPSTASH_REDIS_REST_URL;
  }

  if (token) {
    process.env.REY30_UPSTASH_REDIS_REST_TOKEN = token;
  } else {
    delete process.env.REY30_UPSTASH_REDIS_REST_TOKEN;
  }

  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;

  return () => {
    process.env.UPSTASH_REDIS_REST_URL = previous.UPSTASH_REDIS_REST_URL;
    process.env.UPSTASH_REDIS_REST_TOKEN = previous.UPSTASH_REDIS_REST_TOKEN;
    process.env.REY30_UPSTASH_REDIS_REST_URL = previous.REY30_UPSTASH_REDIS_REST_URL;
    process.env.REY30_UPSTASH_REDIS_REST_TOKEN = previous.REY30_UPSTASH_REDIS_REST_TOKEN;
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
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function withTempIntegrationRoot<T>(run: () => Promise<T>) {
    const previous = process.env.REY30_EXTERNAL_INTEGRATION_ROOT;
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'rey30-integration-events-'));
    process.env.REY30_EXTERNAL_INTEGRATION_ROOT = tempRoot;
    try {
      return await run();
    } finally {
      await resetExternalIntegrationStorageForTest();
      if (previous === undefined) {
        delete process.env.REY30_EXTERNAL_INTEGRATION_ROOT;
      } else {
        process.env.REY30_EXTERNAL_INTEGRATION_ROOT = previous;
      }
      await rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  it('accepts valid signed integration events', async () => {
    const credential = makeCredentials();
    const restore = setIntegrationEnv(credential);
    try {
      await withTempIntegrationRoot(async () => {
        const body = JSON.stringify({
          eventType: 'build.completed',
          source: 'ci',
          payload: { jobId: 'job_123' },
          idempotencyKey: 'event-build-123',
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
        expect(payload.alreadyAccepted).toBe(false);

        const stored = readIntegrationEventRecord({
          integrationId: credential.id,
          recordId: payload.recordId,
        });
        expect(stored).toMatchObject({
          integrationId: credential.id,
          eventType: 'build.completed',
          source: 'ci',
          idempotencyKey: 'event-build-123',
          payload: { jobId: 'job_123' },
        });
      });
    } finally {
      restore();
    }
  });

  it('deduplicates repeated idempotency keys while keeping the accepted record durable', async () => {
    const credential = makeCredentials();
    const restore = setIntegrationEnv(credential);
    try {
      await withTempIntegrationRoot(async () => {
        const body = JSON.stringify({
          eventType: 'build.completed',
          source: 'ci',
          payload: { jobId: 'job_123' },
          idempotencyKey: 'event-build-123',
        });
        const nonceA = crypto.randomUUID();
        const nonceB = crypto.randomUUID();
        const timestamp = String(Math.floor(Date.now() / 1000));

        const first = await integrationEventsPost(
          new NextRequest('http://localhost/api/integrations/events', {
            method: 'POST',
            headers: buildHeaders({ credential, body, nonce: nonceA, timestamp }),
            body,
          })
        );
        const firstPayload = await first.json();

        const second = await integrationEventsPost(
          new NextRequest('http://localhost/api/integrations/events', {
            method: 'POST',
            headers: buildHeaders({ credential, body, nonce: nonceB, timestamp }),
            body,
          })
        );
        const secondPayload = await second.json();

        expect(first.status).toBe(200);
        expect(second.status).toBe(200);
        expect(secondPayload.alreadyAccepted).toBe(true);
        expect(secondPayload.recordId).toBe(firstPayload.recordId);
      });
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

  it('uses distributed nonce reservations when Upstash is configured', async () => {
    const credential = makeCredentials();
    const restore = setIntegrationEnv(credential);
    const restoreUpstash = setUpstashEnv({
      url: 'https://upstash.example.test',
      token: 'upstash-token-123',
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ result: 'OK' }]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ result: null }]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    try {
      await withTempIntegrationRoot(async () => {
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
      });

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(String(fetchMock.mock.calls[0]?.[0])).toBe('https://upstash.example.test/pipeline');
      const firstPipeline = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body || '[]')) as unknown[][];
      expect(firstPipeline[0]?.[0]).toBe('SET');
      expect(firstPipeline[0]).toContain('NX');
      expect(firstPipeline[0]).toContain('PX');
    } finally {
      restoreUpstash();
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
