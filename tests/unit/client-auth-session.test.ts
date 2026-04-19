import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearClientAuthSessionCache,
  loadClientAuthSession,
  primeClientAuthSessionCache,
} from '@/lib/client-auth-session';

function createResponse(payload: unknown, ok = true) {
  return {
    ok,
    json: vi.fn(async () => payload),
  };
}

describe('client auth session helper', () => {
  beforeEach(() => {
    clearClientAuthSessionCache();
  });

  afterEach(() => {
    clearClientAuthSessionCache();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('dedupes concurrent session requests through a shared inflight promise', async () => {
    const fetchMock = vi.fn(async () =>
      createResponse({
        authenticated: true,
        accessMode: 'user_session',
        user: { email: 'smoke@example.com', role: 'EDITOR' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const [left, right] = await Promise.all([
      loadClientAuthSession({ maxAgeMs: 0 }),
      loadClientAuthSession({ maxAgeMs: 0 }),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(left).toMatchObject({ authenticated: true });
    expect(right).toMatchObject({ authenticated: true });
  });

  it('retries transient failures and resolves the successful payload', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('socket hang up'))
      .mockResolvedValueOnce(
        createResponse({
          authenticated: true,
          accessMode: 'user_session',
          user: { email: 'smoke@example.com', role: 'EDITOR' },
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    const payload = await loadClientAuthSession({
      maxAgeMs: 0,
      maxAttempts: 2,
      retryDelayMs: 0,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(payload).toMatchObject({ authenticated: true });
  });

  it('falls back to the last cached payload when refresh attempts fail', async () => {
    primeClientAuthSessionCache({
      authenticated: true,
      accessMode: 'user_session',
      user: { email: 'cached@example.com', role: 'EDITOR' },
    });
    const fetchMock = vi.fn().mockRejectedValue(new Error('connection refused'));
    vi.stubGlobal('fetch', fetchMock);

    const payload = await loadClientAuthSession({
      forceRefresh: true,
      maxAttempts: 1,
      retryDelayMs: 0,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(payload).toMatchObject({
      authenticated: true,
      user: { email: 'cached@example.com' },
    });
  });
});
