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
const getScriptStorageStatusMock = vi.fn();
const getScriptRuntimeArtifactStorageStatusMock = vi.fn();
const getScriptRuntimePolicyMock = vi.fn();
const summarizeScriptRuntimeLiveSessionsMock = vi.fn();

vi.mock('@/lib/security/auth', () => ({
  requireSession: requireSessionMock,
  authErrorToResponse: authErrorToResponseMock,
}));

vi.mock('@/lib/server/script-storage', () => ({
  getScriptStorageStatus: getScriptStorageStatusMock,
}));

vi.mock('@/lib/server/script-runtime-artifacts', () => ({
  getScriptRuntimeArtifactStorageStatus: getScriptRuntimeArtifactStorageStatusMock,
}));

vi.mock('@/lib/security/script-runtime-policy', () => ({
  getScriptRuntimePolicy: getScriptRuntimePolicyMock,
}));

vi.mock('@/lib/server/script-runtime-live-sessions', () => ({
  summarizeScriptRuntimeLiveSessions: summarizeScriptRuntimeLiveSessionsMock,
}));

describe('scripts health route', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('requires editor access and returns a sanitized healthy payload', async () => {
    requireSessionMock.mockResolvedValue({
      id: 'editor-1',
      role: 'EDITOR',
      email: 'editor@example.com',
      sessionId: 'session-1',
    });
    getScriptRuntimePolicyMock.mockReturnValue({
      enabled: true,
      mode: 'development',
      requiresReviewedArtifact: true,
    });
    getScriptStorageStatusMock.mockResolvedValue({
      available: true,
      backend: 'netlify-blobs',
      scope: 'deploy',
      root: '/srv/scripts',
      storeName: 'rey30-scripts',
    });
    getScriptRuntimeArtifactStorageStatusMock.mockResolvedValue({
      available: true,
      backend: 'netlify-blobs',
      scope: 'deploy',
      root: '/srv/scripts/.rey30-runtime-artifacts',
      storeName: 'rey30-scripts',
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
      currentInstanceOwnsLease: false,
      lease: {
        status: 'owned',
        ownerInstanceId: 'runtime_1',
        ownerPlayState: 'PLAYING',
        ownerHeartbeatAt: '2026-04-04T10:00:00.000Z',
        leaseExpiresAt: '2026-04-04T10:00:15.000Z',
        stale: false,
      },
      sessions: [
        {
          instanceId: 'runtime_1',
          currentSession: true,
          playState: 'PLAYING',
          activeEntityScripts: 2,
          activeScribNodes: 1,
          activeScriptIds: ['runtime/player.ts'],
          heartbeatAt: '2026-04-04T10:00:00.000Z',
          stale: false,
        },
      ],
    });

    const { GET } = await import('@/app/api/scripts/health/route');
    const response = await GET(new NextRequest('http://localhost/api/scripts/health'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(requireSessionMock).toHaveBeenCalledWith(expect.any(NextRequest), 'EDITOR');
    expect(payload).toEqual({
      success: true,
      available: true,
      message: 'La automatización de scripts está disponible.',
      runtime: {
        enabled: true,
        reviewedArtifactsRequired: true,
        sourceStorageMode: 'shared',
        artifactStorageMode: 'shared',
        executionIsolation: 'worker-per-instance',
        consistencyModel: 'reviewed-artifact-read-through',
        multiInstanceMode: 'shared-storage-ready',
        sourceStorageAvailable: true,
        artifactStorageAvailable: true,
        restartReady: true,
      },
      live: {
        coordinationMode: 'heartbeat-sessions',
        ownershipMode: 'session-lease',
        heartbeatTtlMs: 15000,
        storageMode: 'shared',
        activeSessions: 1,
        playingSessions: 1,
        staleSessions: 0,
        currentSessionPresent: true,
        currentSessionOwnsLease: true,
        currentInstanceOwnsLease: false,
        lease: {
          status: 'owned',
          ownerInstanceId: 'runtime_1',
          ownerPlayState: 'PLAYING',
          ownerHeartbeatAt: '2026-04-04T10:00:00.000Z',
          leaseExpiresAt: '2026-04-04T10:00:15.000Z',
          stale: false,
        },
        sessions: [
          {
            instanceId: 'runtime_1',
            currentSession: true,
            playState: 'PLAYING',
            activeEntityScripts: 2,
            activeScribNodes: 1,
            activeScriptIds: ['runtime/player.ts'],
            heartbeatAt: '2026-04-04T10:00:00.000Z',
            stale: false,
          },
        ],
      },
    });
    expect('backend' in payload).toBe(false);
    expect('scope' in payload).toBe(false);
    expect('root' in payload).toBe(false);
    expect('storeName' in payload).toBe(false);
  });

  it('returns a sanitized unavailable payload when runtime artifacts storage is unavailable', async () => {
    requireSessionMock.mockResolvedValue({
      id: 'editor-1',
      role: 'EDITOR',
      email: 'editor@example.com',
      sessionId: 'session-1',
    });
    getScriptRuntimePolicyMock.mockReturnValue({
      enabled: true,
      mode: 'development',
      requiresReviewedArtifact: true,
    });
    getScriptStorageStatusMock.mockResolvedValue({
      available: true,
      backend: 'filesystem',
      scope: 'filesystem',
      root: 'C:/repo/scripts',
    });
    getScriptRuntimeArtifactStorageStatusMock.mockResolvedValue({
      available: false,
      backend: 'filesystem',
      scope: 'filesystem',
      root: 'C:/repo/scripts/.rey30-runtime-artifacts',
      error: 'EACCES',
    });
    summarizeScriptRuntimeLiveSessionsMock.mockResolvedValue({
      coordinationMode: 'heartbeat-sessions',
      ownershipMode: 'implicit-local',
      heartbeatTtlMs: 15000,
      storageMode: 'local',
      activeSessions: 0,
      playingSessions: 0,
      staleSessions: 1,
      currentSessionPresent: false,
      currentSessionOwnsLease: false,
      currentInstanceOwnsLease: false,
      lease: {
        status: 'local-only',
        ownerInstanceId: null,
        ownerPlayState: null,
        ownerHeartbeatAt: null,
        leaseExpiresAt: null,
        stale: false,
      },
      sessions: [],
    });

    const { GET } = await import('@/app/api/scripts/health/route');
    const response = await GET(new NextRequest('http://localhost/api/scripts/health'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      success: false,
      available: false,
      message: 'La automatización de scripts no está disponible en este momento.',
      runtime: {
        enabled: true,
        reviewedArtifactsRequired: true,
        sourceStorageMode: 'local',
        artifactStorageMode: 'local',
        executionIsolation: 'worker-per-instance',
        consistencyModel: 'reviewed-artifact-read-through',
        multiInstanceMode: 'single-instance-only',
        sourceStorageAvailable: true,
        artifactStorageAvailable: false,
        restartReady: false,
      },
      live: {
        coordinationMode: 'heartbeat-sessions',
        ownershipMode: 'implicit-local',
        heartbeatTtlMs: 15000,
        storageMode: 'local',
        activeSessions: 0,
        playingSessions: 0,
        staleSessions: 1,
        currentSessionPresent: false,
        currentSessionOwnsLease: false,
        currentInstanceOwnsLease: false,
        lease: {
          status: 'local-only',
          ownerInstanceId: null,
          ownerPlayState: null,
          ownerHeartbeatAt: null,
          leaseExpiresAt: null,
          stale: false,
        },
        sessions: [],
      },
    });
    expect(JSON.stringify(payload)).not.toContain('filesystem');
    expect(JSON.stringify(payload)).not.toContain('EACCES');
  });

  it('ignores runtime artifact storage when the reviewed runtime policy is disabled', async () => {
    requireSessionMock.mockResolvedValue({
      id: 'editor-1',
      role: 'EDITOR',
      email: 'editor@example.com',
      sessionId: 'session-1',
    });
    getScriptRuntimePolicyMock.mockReturnValue({
      enabled: false,
      mode: 'disabled',
      requiresReviewedArtifact: true,
    });
    getScriptStorageStatusMock.mockResolvedValue({
      available: true,
      backend: 'filesystem',
      scope: 'filesystem',
      root: 'C:/repo/scripts',
    });
    summarizeScriptRuntimeLiveSessionsMock.mockResolvedValue({
      coordinationMode: 'heartbeat-sessions',
      ownershipMode: 'implicit-local',
      heartbeatTtlMs: 15000,
      storageMode: 'local',
      activeSessions: 0,
      playingSessions: 0,
      staleSessions: 0,
      currentSessionPresent: false,
      currentSessionOwnsLease: false,
      currentInstanceOwnsLease: false,
      lease: {
        status: 'local-only',
        ownerInstanceId: null,
        ownerPlayState: null,
        ownerHeartbeatAt: null,
        leaseExpiresAt: null,
        stale: false,
      },
      sessions: [],
    });

    const { GET } = await import('@/app/api/scripts/health/route');
    const response = await GET(new NextRequest('http://localhost/api/scripts/health'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      success: true,
      available: true,
      message: 'La automatización de scripts está disponible.',
      runtime: {
        enabled: false,
        reviewedArtifactsRequired: true,
        sourceStorageMode: 'local',
        artifactStorageMode: 'not-required',
        executionIsolation: 'worker-per-instance',
        consistencyModel: 'reviewed-artifact-read-through',
        multiInstanceMode: 'not-required',
        sourceStorageAvailable: true,
        artifactStorageAvailable: true,
        restartReady: true,
      },
      live: {
        coordinationMode: 'heartbeat-sessions',
        ownershipMode: 'implicit-local',
        heartbeatTtlMs: 15000,
        storageMode: 'local',
        activeSessions: 0,
        playingSessions: 0,
        staleSessions: 0,
        currentSessionPresent: false,
        currentSessionOwnsLease: false,
        currentInstanceOwnsLease: false,
        lease: {
          status: 'local-only',
          ownerInstanceId: null,
          ownerPlayState: null,
          ownerHeartbeatAt: null,
          leaseExpiresAt: null,
          stale: false,
        },
        sessions: [],
      },
    });
    expect(getScriptRuntimeArtifactStorageStatusMock).not.toHaveBeenCalled();
  });

  it('delegates auth failures to the shared auth response', async () => {
    requireSessionMock.mockRejectedValue(new Error('FORBIDDEN'));

    const { GET } = await import('@/app/api/scripts/health/route');
    const response = await GET(new NextRequest('http://localhost/api/scripts/health'));
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('No tienes permisos para esta acción.');
    expect(authErrorToResponseMock).toHaveBeenCalled();
  });
});
