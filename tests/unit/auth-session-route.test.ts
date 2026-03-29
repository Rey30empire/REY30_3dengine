import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getSessionUserMock = vi.fn();
const logSecurityEventMock = vi.fn();
const applyCsrfCookieMock = vi.fn();
const isValidCsrfTokenFormatMock = vi.fn();

vi.mock('@/lib/security/auth', () => ({
  getSessionUser: getSessionUserMock,
  logSecurityEvent: logSecurityEventMock,
}));

vi.mock('@/lib/security/csrf', () => ({
  CSRF_COOKIE_NAME: 'rey30_csrf',
  applyCsrfCookie: applyCsrfCookieMock,
  isValidCsrfTokenFormat: isValidCsrfTokenFormatMock,
}));

describe('Auth session route', () => {
  beforeEach(() => {
    isValidCsrfTokenFormatMock.mockReturnValue(false);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns authenticated session data and applies a csrf cookie when missing', async () => {
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
    expect(applyCsrfCookieMock).toHaveBeenCalledOnce();
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

    expect(response.status).toBe(200);
    expect(applyCsrfCookieMock).not.toHaveBeenCalled();
  });

  it('logs and degrades gracefully when session lookup throws', async () => {
    getSessionUserMock.mockRejectedValue(new Error('session failure'));

    const { GET } = await import('@/app/api/auth/session/route');
    const response = await GET(new NextRequest('http://localhost/api/auth/session'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.authenticated).toBe(false);
    expect(logSecurityEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'auth.session',
        status: 'error',
      })
    );
  });
});
