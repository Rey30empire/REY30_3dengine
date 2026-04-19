import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getSessionUserMock = vi.fn();
const createSessionForUserMock = vi.fn();
const ensureLocalOwnerUserMock = vi.fn();
const applySessionCookieMock = vi.fn((response) => response);
const getLocalOwnerIdentityMock = vi.fn();
const isLocalOwnerModeEnabledMock = vi.fn();
const logSecurityEventMock = vi.fn();
const applyCsrfCookieMock = vi.fn();
const isValidCsrfTokenFormatMock = vi.fn();
const isSharedAccessUserEmailMock = vi.fn();
const env = process.env as Record<string, string | undefined>;
const ORIGINAL_ENV = {
  NODE_ENV: process.env.NODE_ENV,
  REY30_ENABLE_TERMINAL_API: process.env.REY30_ENABLE_TERMINAL_API,
  REY30_ENABLE_TERMINAL_API_REMOTE: process.env.REY30_ENABLE_TERMINAL_API_REMOTE,
  REY30_ADMIN_TOKEN: process.env.REY30_ADMIN_TOKEN,
};

vi.mock('@/lib/security/auth', () => ({
  applySessionCookie: applySessionCookieMock,
  createSessionForUser: createSessionForUserMock,
  ensureLocalOwnerUser: ensureLocalOwnerUserMock,
  getSessionUser: getSessionUserMock,
  getLocalOwnerIdentity: getLocalOwnerIdentityMock,
  isLocalOwnerModeEnabled: isLocalOwnerModeEnabledMock,
  logSecurityEvent: logSecurityEventMock,
}));

vi.mock('@/lib/security/csrf', () => ({
  CSRF_COOKIE_NAME: 'rey30_csrf',
  applyCsrfCookie: applyCsrfCookieMock,
  isValidCsrfTokenFormat: isValidCsrfTokenFormatMock,
}));

vi.mock('@/lib/security/shared-access', () => ({
  isSharedAccessUserEmail: isSharedAccessUserEmailMock,
}));

describe('Auth session route', () => {
  beforeEach(() => {
    isValidCsrfTokenFormatMock.mockReturnValue(false);
    isSharedAccessUserEmailMock.mockReturnValue(false);
    isLocalOwnerModeEnabledMock.mockReturnValue(false);
    getLocalOwnerIdentityMock.mockReturnValue({
      email: 'owner@rey30.local',
      name: 'REY30 Local Owner',
    });
    createSessionForUserMock.mockResolvedValue({
      token: 'session-token',
      expiresAt: new Date('2026-04-24T00:00:00.000Z'),
    });
    ensureLocalOwnerUserMock.mockResolvedValue({
      id: 'owner-1',
      email: 'owner@rey30.local',
      name: 'REY30 Local Owner',
      role: 'OWNER',
      isActive: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    if (ORIGINAL_ENV.NODE_ENV === undefined) {
      delete env.NODE_ENV;
    } else {
      env.NODE_ENV = ORIGINAL_ENV.NODE_ENV;
    }
    if (ORIGINAL_ENV.REY30_ENABLE_TERMINAL_API === undefined) {
      delete env.REY30_ENABLE_TERMINAL_API;
    } else {
      env.REY30_ENABLE_TERMINAL_API = ORIGINAL_ENV.REY30_ENABLE_TERMINAL_API;
    }
    if (ORIGINAL_ENV.REY30_ENABLE_TERMINAL_API_REMOTE === undefined) {
      delete env.REY30_ENABLE_TERMINAL_API_REMOTE;
    } else {
      env.REY30_ENABLE_TERMINAL_API_REMOTE = ORIGINAL_ENV.REY30_ENABLE_TERMINAL_API_REMOTE;
    }
    if (ORIGINAL_ENV.REY30_ADMIN_TOKEN === undefined) {
      delete env.REY30_ADMIN_TOKEN;
    } else {
      env.REY30_ADMIN_TOKEN = ORIGINAL_ENV.REY30_ADMIN_TOKEN;
    }
  });

  it('returns authenticated session data and applies a csrf cookie when missing', async () => {
    env.NODE_ENV = 'development';
    env.REY30_ENABLE_TERMINAL_API = 'true';
    delete env.REY30_ENABLE_TERMINAL_API_REMOTE;
    delete env.REY30_ADMIN_TOKEN;
    getSessionUserMock.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      name: 'User',
      role: 'OWNER',
    });

    const { GET } = await import('@/app/api/auth/session/route');
    const response = await GET(new NextRequest('http://localhost/api/auth/session'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.authenticated).toBe(true);
    expect(payload.user.email).toBe('user@example.com');
    expect(payload.editorAccess).toEqual({
      shellMode: 'advanced',
      permissions: {
        advancedShell: true,
        admin: true,
        compile: true,
        advancedWorkspaces: true,
        debugTools: true,
        editorSessionBridge: true,
        terminalActions: true,
      },
    });
    expect(applyCsrfCookieMock).toHaveBeenCalledOnce();
  });

  it('serves HEAD for auth session without returning 404', async () => {
    getSessionUserMock.mockResolvedValue(null);

    const { HEAD } = await import('@/app/api/auth/session/route');
    const response = await HEAD(new NextRequest('http://localhost/api/auth/session', {
      method: 'HEAD',
    }));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
  });

  it('keeps the existing csrf cookie when it is already valid', async () => {
    getSessionUserMock.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      name: 'User',
      role: 'VIEWER',
    });
    isValidCsrfTokenFormatMock.mockReturnValue(true);

    const { GET } = await import('@/app/api/auth/session/route');
    const response = await GET(
      new NextRequest('http://localhost/api/auth/session', {
        headers: {
          cookie:
            'rey30_session=session-token; rey30_csrf=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        },
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(applyCsrfCookieMock).not.toHaveBeenCalled();
    expect(payload.editorAccess).toEqual({
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
  });

  it('logs and degrades gracefully when session lookup throws', async () => {
    getSessionUserMock.mockRejectedValue(new Error('session failure'));

    const { GET } = await import('@/app/api/auth/session/route');
    const response = await GET(new NextRequest('http://localhost/api/auth/session'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.authenticated).toBe(false);
    expect(payload.editorAccess).toEqual({
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
    expect(logSecurityEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'auth.session',
        status: 'error',
      })
    );
  });

  it('keeps shared-token sessions on the product shell even with an owner role', async () => {
    getSessionUserMock.mockResolvedValue({
      id: 'user-1',
      email: 'shared@example.com',
      name: 'Shared User',
      role: 'OWNER',
    });
    isSharedAccessUserEmailMock.mockReturnValue(true);

    const { GET } = await import('@/app/api/auth/session/route');
    const response = await GET(new NextRequest('http://localhost/api/auth/session'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.accessMode).toBe('shared_token');
    expect(payload.editorAccess).toEqual({
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
  });

  it('bootstraps a cookie-backed local owner session when local mode is enabled', async () => {
    getSessionUserMock.mockResolvedValue(null);
    isLocalOwnerModeEnabledMock.mockReturnValue(true);

    const { GET } = await import('@/app/api/auth/session/route');
    const response = await GET(new NextRequest('http://localhost/api/auth/session'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.authenticated).toBe(true);
    expect(payload.policy.localOwnerMode).toBe(true);
    expect(payload.policy.note).toMatch(/single-user/i);
    expect(ensureLocalOwnerUserMock).toHaveBeenCalledWith({ touchLastLogin: true });
    expect(createSessionForUserMock).toHaveBeenCalledWith('owner-1');
    expect(applySessionCookieMock).toHaveBeenCalledOnce();
  });

  it('reuses an existing local owner session cookie without minting a new session', async () => {
    getSessionUserMock.mockResolvedValue({
      id: 'owner-1',
      email: 'owner@rey30.local',
      name: 'REY30 Local Owner',
      role: 'OWNER',
    });
    isLocalOwnerModeEnabledMock.mockReturnValue(true);

    const { GET } = await import('@/app/api/auth/session/route');
    const response = await GET(
      new NextRequest('http://localhost/api/auth/session', {
        headers: {
          cookie: 'rey30_session=existing-session-token',
        },
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.authenticated).toBe(true);
    expect(payload.policy.localOwnerMode).toBe(true);
    expect(ensureLocalOwnerUserMock).not.toHaveBeenCalled();
    expect(createSessionForUserMock).not.toHaveBeenCalled();
    expect(applySessionCookieMock).not.toHaveBeenCalled();
  });
});
