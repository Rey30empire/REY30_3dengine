import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';

function resetRateStore() {
  (globalThis as any).__rey30RateLimitStore = new Map();
}

const VALID_CSRF = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function withNodeEnv(value: string, run: () => Promise<void>) {
  const previousNodeEnv = process.env.NODE_ENV;
  (process.env as Record<string, string | undefined>).NODE_ENV = value;
  return run().finally(() => {
    (process.env as Record<string, string | undefined>).NODE_ENV = previousNodeEnv;
  });
}

describe('Proxy CSRF enforcement', () => {
  it('blocks authenticated mutation without csrf header', async () => {
    await withNodeEnv('test', async () => {
      resetRateStore();
      const response = await proxy(
        new NextRequest('http://localhost/api/user/api-config', {
          method: 'POST',
          headers: {
            cookie: `rey30_session=session_123; rey30_csrf=${VALID_CSRF}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({}),
        })
      );

      expect(response.status).toBe(403);
      const payload = await response.json();
      expect(String(payload.error || '')).toContain('CSRF');
    });
  });

  it('blocks authenticated mutation with mismatched csrf token', async () => {
    await withNodeEnv('test', async () => {
      resetRateStore();
      const response = await proxy(
        new NextRequest('http://localhost/api/user/api-config', {
          method: 'PUT',
          headers: {
            'x-rey30-csrf': VALID_CSRF,
            cookie: 'rey30_session=session_123; rey30_csrf=abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd',
            'content-type': 'application/json',
          },
          body: JSON.stringify({}),
        })
      );

      expect(response.status).toBe(403);
    });
  });

  it('allows authenticated mutation with matching csrf token', async () => {
    await withNodeEnv('test', async () => {
      resetRateStore();
      const response = await proxy(
        new NextRequest('http://localhost/api/user/api-config', {
          method: 'PATCH',
          headers: {
            'x-rey30-csrf': VALID_CSRF,
            cookie: `rey30_session=session_123; rey30_csrf=${VALID_CSRF}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({}),
        })
      );

      expect(response.status).not.toBe(403);
    });
  });

  it('keeps login endpoint csrf-exempt for unauthenticated bootstrap', async () => {
    await withNodeEnv('test', async () => {
      resetRateStore();
      const response = await proxy(
        new NextRequest('http://localhost/api/auth/login', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({ email: 'user@example.com', password: 'password123' }),
        })
      );

      expect(response.status).not.toBe(403);
    });
  });

  it('blocks originless mutations in production', async () => {
    await withNodeEnv('production', async () => {
      resetRateStore();
      const response = await proxy(
        new NextRequest('http://localhost/api/auth/login', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({ email: 'user@example.com', password: 'password123' }),
        })
      );

      expect(response.status).toBe(403);
      const payload = await response.json();
      expect(String(payload.error || '')).toContain('Forbidden origin');
    });
  });

  it('allows explicit same-origin mutations in production', async () => {
    await withNodeEnv('production', async () => {
      resetRateStore();
      const response = await proxy(
        new NextRequest('http://localhost/api/auth/login', {
          method: 'POST',
          headers: {
            origin: 'http://localhost',
            'content-type': 'application/json',
          },
          body: JSON.stringify({ email: 'user@example.com', password: 'password123' }),
        })
      );

      expect(response.status).not.toBe(403);
    });
  });
});
