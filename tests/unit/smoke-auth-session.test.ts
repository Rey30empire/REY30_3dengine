import { describe, expect, it, vi } from 'vitest';
import {
  createSmokeAuthenticatedContext,
  verifySmokeAuthenticatedSession,
  verifySmokeLocalOwnerSession,
} from '../../scripts/smoke-auth-session.mjs';

function createContext(responses) {
  const get = vi.fn();
  for (const response of responses) {
    get.mockImplementationOnce(async () => response);
  }

  return {
    addCookies: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    request: { get },
  };
}

function makeResponse(status, payload) {
  return {
    ok: () => status >= 200 && status < 300,
    status: () => status,
    json: vi.fn(async () => payload),
  };
}

describe('smoke auth session helper', () => {
  it('retries until the smoke user is authenticated', async () => {
    const context = createContext([
      makeResponse(404, {}),
      makeResponse(200, { authenticated: false }),
      makeResponse(200, {
        authenticated: true,
        user: { email: 'smoke@example.com' },
      }),
    ]);

    const payload = await verifySmokeAuthenticatedSession(context, {
      baseUrl: 'http://127.0.0.1:3000',
      sessionToken: 'session-token',
      csrfToken: 'csrf-token',
      expectedEmail: 'smoke@example.com',
      maxAttempts: 3,
      retryDelayMs: 0,
    });

    expect(payload).toMatchObject({
      authenticated: true,
      user: { email: 'smoke@example.com' },
    });
    expect(context.addCookies).toHaveBeenCalledTimes(1);
    expect(context.request.get).toHaveBeenCalledTimes(3);
  });

  it('closes the context when bootstrap never authenticates', async () => {
    const context = createContext([
      makeResponse(404, {}),
      makeResponse(200, { authenticated: false }),
    ]);
    const browser = {
      newContext: vi.fn(async () => context),
    };

    await expect(
      createSmokeAuthenticatedContext(browser, {
        baseUrl: 'http://127.0.0.1:3000',
        createSeededSession: async () => ({
          sessionToken: 'session-token',
          csrfToken: 'csrf-token',
        }),
        expectedEmail: 'smoke@example.com',
        maxAttempts: 2,
        retryDelayMs: 0,
      })
    ).rejects.toThrow(/Session bootstrap failed after 2 attempts/);

    expect(context.close).toHaveBeenCalledTimes(1);
  });

  it('supports local-owner bootstrap without pre-seeded cookies', async () => {
    const context = createContext([
      makeResponse(200, {
        authenticated: true,
        user: { email: 'owner@rey30.local' },
      }),
    ]);

    const payload = await verifySmokeLocalOwnerSession(context, {
      baseUrl: 'http://127.0.0.1:3000',
      expectedEmail: 'owner@rey30.local',
      maxAttempts: 1,
      retryDelayMs: 0,
    });

    expect(payload).toMatchObject({
      authenticated: true,
      user: { email: 'owner@rey30.local' },
    });
    expect(context.addCookies).not.toHaveBeenCalled();
    expect(context.request.get).toHaveBeenCalledTimes(1);
  });
});
