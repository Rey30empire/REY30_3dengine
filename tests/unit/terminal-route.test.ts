import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const requireSessionMock = vi.fn();
const authErrorToResponseMock = vi.fn((error: unknown) =>
  Response.json(
    {
      error: String(error).includes('FORBIDDEN')
        ? 'No tienes permisos para esta acción.'
        : 'Debes iniciar sesión o usar un token de acceso.',
    },
    { status: String(error).includes('FORBIDDEN') ? 403 : 401 }
  )
);
const logSecurityEventMock = vi.fn();
const env = process.env as Record<string, string | undefined>;

vi.mock('@/lib/security/auth', () => ({
  requireSession: requireSessionMock,
  authErrorToResponse: authErrorToResponseMock,
  logSecurityEvent: logSecurityEventMock,
}));

const ORIGINAL_ENV = {
  NODE_ENV: process.env.NODE_ENV,
  REY30_ENABLE_TERMINAL_API: process.env.REY30_ENABLE_TERMINAL_API,
  REY30_ENABLE_TERMINAL_API_REMOTE: process.env.REY30_ENABLE_TERMINAL_API_REMOTE,
  REY30_ADMIN_TOKEN: process.env.REY30_ADMIN_TOKEN,
};

describe('terminal route', () => {
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

  it('returns the allowlisted action catalog for an enabled local owner session', async () => {
    env.NODE_ENV = 'development';
    env.REY30_ENABLE_TERMINAL_API = 'true';
    delete env.REY30_ENABLE_TERMINAL_API_REMOTE;
    delete env.REY30_ADMIN_TOKEN;
    requireSessionMock.mockResolvedValue({
      id: 'owner-1',
      role: 'OWNER',
      email: 'owner@example.com',
      sessionId: 'session-1',
    });

    const { GET } = await import('@/app/api/terminal/route');
    const response = await GET(new NextRequest('http://localhost/api/terminal'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'project.list_directory', acceptsPath: true }),
        expect.objectContaining({ id: 'project.git_status', acceptsPath: false }),
      ])
    );
    expect(logSecurityEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'admin.terminal.catalog',
        status: 'allowed',
      })
    );
  });

  it('executes an allowlisted directory action and audits the result', async () => {
    env.NODE_ENV = 'development';
    env.REY30_ENABLE_TERMINAL_API = 'true';
    delete env.REY30_ENABLE_TERMINAL_API_REMOTE;
    delete env.REY30_ADMIN_TOKEN;
    requireSessionMock.mockResolvedValue({
      id: 'owner-1',
      role: 'OWNER',
      email: 'owner@example.com',
      sessionId: 'session-1',
    });

    const { POST } = await import('@/app/api/terminal/route');
    const response = await POST(
      new NextRequest('http://localhost/api/terminal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          actionId: 'project.list_directory',
          relativePath: 'src',
        }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      actionId: 'project.list_directory',
      code: 0,
    });
    expect(String(payload.cwd || '')).toContain('src');
    expect(logSecurityEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'admin.terminal.execute',
        target: 'project.list_directory',
        status: 'allowed',
      })
    );
  });

  it('rejects path traversal outside the project root', async () => {
    env.NODE_ENV = 'development';
    env.REY30_ENABLE_TERMINAL_API = 'true';
    delete env.REY30_ENABLE_TERMINAL_API_REMOTE;
    delete env.REY30_ADMIN_TOKEN;
    requireSessionMock.mockResolvedValue({
      id: 'owner-1',
      role: 'OWNER',
      email: 'owner@example.com',
      sessionId: 'session-1',
    });

    const { POST } = await import('@/app/api/terminal/route');
    const response = await POST(
      new NextRequest('http://localhost/api/terminal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          actionId: 'project.list_directory',
          relativePath: '..',
        }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.ok).toBe(false);
    expect(String(payload.error || '')).toContain('inside project root');
    expect(logSecurityEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'admin.terminal.execute',
        status: 'denied',
      })
    );
  });

  it('requires the admin token when one is configured', async () => {
    env.NODE_ENV = 'development';
    env.REY30_ENABLE_TERMINAL_API = 'true';
    delete env.REY30_ENABLE_TERMINAL_API_REMOTE;
    env.REY30_ADMIN_TOKEN = 'top-secret';
    requireSessionMock.mockResolvedValue({
      id: 'owner-1',
      role: 'OWNER',
      email: 'owner@example.com',
      sessionId: 'session-1',
    });

    const { POST } = await import('@/app/api/terminal/route');
    const response = await POST(
      new NextRequest('http://localhost/api/terminal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ actionId: 'project.git_status' }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error).toBe('Unauthorized');
    expect(logSecurityEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'admin.terminal.execute',
        status: 'denied',
        metadata: expect.objectContaining({ reason: 'admin_token_mismatch' }),
      })
    );
  });

  it('maps auth failures to the standard auth response', async () => {
    env.NODE_ENV = 'development';
    env.REY30_ENABLE_TERMINAL_API = 'true';
    delete env.REY30_ENABLE_TERMINAL_API_REMOTE;
    delete env.REY30_ADMIN_TOKEN;
    requireSessionMock.mockRejectedValue(new Error('FORBIDDEN'));

    const { GET } = await import('@/app/api/terminal/route');
    const response = await GET(new NextRequest('http://localhost/api/terminal'));
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('No tienes permisos para esta acción.');
    expect(authErrorToResponseMock).toHaveBeenCalled();
  });
});
