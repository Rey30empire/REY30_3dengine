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
const registerScriptRuntimeHeartbeatMock = vi.fn();
const summarizeScriptRuntimeLiveSessionsMock = vi.fn();

vi.mock('@/lib/security/auth', () => ({
  requireSession: requireSessionMock,
  authErrorToResponse: authErrorToResponseMock,
}));

vi.mock('@/lib/server/script-runtime-live-sessions', () => ({
  registerScriptRuntimeHeartbeat: registerScriptRuntimeHeartbeatMock,
  summarizeScriptRuntimeLiveSessions: summarizeScriptRuntimeLiveSessionsMock,
}));

describe('scripts runtime session route', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('records a sanitized heartbeat and returns the live runtime summary', async () => {
    requireSessionMock.mockResolvedValue({
      id: 'editor-1',
      role: 'EDITOR',
      email: 'editor@example.com',
      sessionId: 'session-1',
    });
    registerScriptRuntimeHeartbeatMock.mockResolvedValue({
      heartbeat: {
        instanceId: 'runtime_1',
        playState: 'PLAYING',
        activeEntityScripts: 2,
        activeScribNodes: 1,
        activeScriptIds: ['runtime/player.ts'],
        heartbeatAt: '2026-04-04T10:00:00.000Z',
      },
      lease: {
        status: 'owned',
        ownerInstanceId: 'runtime_1',
        ownerPlayState: 'PLAYING',
        ownerHeartbeatAt: '2026-04-04T10:00:00.000Z',
        leaseExpiresAt: '2026-04-04T10:00:15.000Z',
        stale: false,
      },
    });
    summarizeScriptRuntimeLiveSessionsMock.mockResolvedValue({
      coordinationMode: 'heartbeat-sessions',
      ownershipMode: 'session-lease',
      heartbeatTtlMs: 15000,
      storageMode: 'shared',
      activeSessions: 1,
      playingSessions: 1,
      staleSessions: 0,
      currentSessionPresent: true,
      currentSessionOwnsLease: true,
      currentInstanceOwnsLease: true,
      lease: {
        status: 'owned',
        ownerInstanceId: 'runtime_1',
        ownerPlayState: 'PLAYING',
        ownerHeartbeatAt: '2026-04-04T10:00:00.000Z',
        leaseExpiresAt: '2026-04-04T10:00:15.000Z',
        stale: false,
      },
      sessions: [],
    });

    const { POST } = await import('@/app/api/scripts/runtime/session/route');
    const response = await POST(
      new NextRequest('http://localhost/api/scripts/runtime/session', {
        method: 'POST',
        body: JSON.stringify({
          instanceId: 'runtime_1',
          playState: 'PLAYING',
          activeEntityScripts: 2,
          activeScribNodes: 1,
          activeScriptIds: ['runtime/player.ts', 'runtime/player.ts'],
        }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(registerScriptRuntimeHeartbeatMock).toHaveBeenCalledWith({
      instanceId: 'runtime_1',
      sessionId: 'session-1',
      userId: 'editor-1',
      playState: 'PLAYING',
      activeEntityScripts: 2,
      activeScribNodes: 1,
      activeScriptIds: ['runtime/player.ts'],
    });
    expect(payload.live).toMatchObject({
      coordinationMode: 'heartbeat-sessions',
      activeSessions: 1,
    });
    expect(payload.lease).toMatchObject({
      status: 'owned',
      ownerInstanceId: 'runtime_1',
    });
  });

  it('rejects an invalid runtime instance id', async () => {
    requireSessionMock.mockResolvedValue({
      id: 'editor-1',
      role: 'EDITOR',
      email: 'editor@example.com',
      sessionId: 'session-1',
    });

    const { POST } = await import('@/app/api/scripts/runtime/session/route');
    const response = await POST(
      new NextRequest('http://localhost/api/scripts/runtime/session', {
        method: 'POST',
        body: JSON.stringify({
          instanceId: '../bad',
        }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(String(payload.error || '')).toContain('instancia');
    expect(registerScriptRuntimeHeartbeatMock).not.toHaveBeenCalled();
  });
});
