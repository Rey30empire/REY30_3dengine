import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { hashScriptRuntimeSource } from '@/lib/server/script-runtime-compiler';

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
const getStoredScriptMock = vi.fn();
const getScriptRuntimeArtifactMock = vi.fn();
const deleteScriptRuntimeArtifactMock = vi.fn();
const getScriptStorageInfoMock = vi.fn();
const getScriptRuntimeArtifactStorageInfoMock = vi.fn();
const summarizeScriptRuntimeLiveSessionsMock = vi.fn();

vi.mock('@/lib/security/auth', () => ({
  requireSession: requireSessionMock,
  authErrorToResponse: authErrorToResponseMock,
  logSecurityEvent: logSecurityEventMock,
}));

vi.mock('@/lib/server/script-storage', () => ({
  getStoredScript: getStoredScriptMock,
  getScriptStorageInfo: getScriptStorageInfoMock,
}));

vi.mock('@/lib/server/script-runtime-artifacts', () => ({
  getScriptRuntimeArtifact: getScriptRuntimeArtifactMock,
  deleteScriptRuntimeArtifact: deleteScriptRuntimeArtifactMock,
  getScriptRuntimeArtifactStorageInfo: getScriptRuntimeArtifactStorageInfoMock,
}));

vi.mock('@/lib/server/script-runtime-live-sessions', () => ({
  summarizeScriptRuntimeLiveSessions: summarizeScriptRuntimeLiveSessionsMock,
}));

describe('scripts runtime route', () => {
  const env = process.env as Record<string, string | undefined>;
  const originalEnv = {
    NODE_ENV: env.NODE_ENV,
    REY30_ENABLE_CUSTOM_SCRIPT_RUNTIME: env.REY30_ENABLE_CUSTOM_SCRIPT_RUNTIME,
  };

  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    if (originalEnv.NODE_ENV === undefined) {
      delete env.NODE_ENV;
    } else {
      env.NODE_ENV = originalEnv.NODE_ENV;
    }
    if (originalEnv.REY30_ENABLE_CUSTOM_SCRIPT_RUNTIME === undefined) {
      delete env.REY30_ENABLE_CUSTOM_SCRIPT_RUNTIME;
    } else {
      env.REY30_ENABLE_CUSTOM_SCRIPT_RUNTIME =
        originalEnv.REY30_ENABLE_CUSTOM_SCRIPT_RUNTIME;
    }
  });

  it('returns a reviewed runtime artifact only when the stored source hash matches', async () => {
    env.NODE_ENV = 'development';
    delete env.REY30_ENABLE_CUSTOM_SCRIPT_RUNTIME;
    requireSessionMock.mockResolvedValue({
      id: 'editor-1',
      role: 'EDITOR',
      email: 'editor@example.com',
      sessionId: 'session-1',
    });
    getScriptStorageInfoMock.mockReturnValue({
      backend: 'netlify-blobs',
      scope: 'global',
      storeName: 'rey30-scripts',
    });
    getScriptRuntimeArtifactStorageInfoMock.mockReturnValue({
      backend: 'netlify-blobs',
      scope: 'global',
      storeName: 'rey30-scripts',
    });
    const sourceText = 'export function update(ctx) { ctx.setTransform({ x: 1 }); }';
    getStoredScriptMock.mockResolvedValue({
      relativePath: 'scribs/runtime.ts',
      content: sourceText,
    });
    getScriptRuntimeArtifactMock.mockResolvedValue({
      version: 1,
      scriptId: 'scribs/runtime.ts',
      sourceHash: hashScriptRuntimeSource(sourceText),
      compiledHash: 'compiled-hash',
      compiledCode: '"use strict"; exports.update = function update(ctx) { ctx.setTransform({ x: 1 }); };',
      generatedAt: '2026-04-02T00:00:00.000Z',
      sourceBytes: 58,
      compiledBytes: 84,
      guardFunction: '__rey30SandboxGuard__',
      compiler: { target: 'ES2020', module: 'CommonJS', policyVersion: 1 },
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
      sessions: [],
    });

    const { GET } = await import('@/app/api/scripts/runtime/route');
    const response = await GET(
      new NextRequest('http://localhost/api/scripts/runtime?path=scribs/runtime.ts')
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.ready).toBe(true);
    expect(payload.runtime.compiledHash).toBe('compiled-hash');
    expect(payload.runtime.multiInstanceMode).toBe('shared-storage-ready');
    expect(payload.runtime.executionIsolation).toBe('worker-per-instance');
    expect(payload.live).toMatchObject({
      coordinationMode: 'heartbeat-sessions',
      activeSessions: 1,
    });
    expect(typeof payload.compiledCode).toBe('string');
    expect(logSecurityEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'scripts.runtime.fetch',
        status: 'allowed',
      })
    );
  });

  it('rejects stale artifacts and deletes them from storage', async () => {
    env.NODE_ENV = 'development';
    delete env.REY30_ENABLE_CUSTOM_SCRIPT_RUNTIME;
    requireSessionMock.mockResolvedValue({
      id: 'editor-1',
      role: 'EDITOR',
      email: 'editor@example.com',
      sessionId: 'session-1',
    });
    getScriptStorageInfoMock.mockReturnValue({
      backend: 'filesystem',
      scope: 'filesystem',
      root: 'C:/repo/scripts',
    });
    getScriptRuntimeArtifactStorageInfoMock.mockReturnValue({
      backend: 'filesystem',
      scope: 'filesystem',
      root: 'C:/repo/scripts/.rey30-runtime-artifacts',
    });
    getStoredScriptMock.mockResolvedValue({
      relativePath: 'scribs/runtime.ts',
      content: 'export function update(ctx) { ctx.setTransform({ x: 2 }); }',
    });
    getScriptRuntimeArtifactMock.mockResolvedValue({
      version: 1,
      scriptId: 'scribs/runtime.ts',
      sourceHash: 'old-hash',
      compiledHash: 'compiled-hash',
      compiledCode: 'compiled',
      generatedAt: '2026-04-02T00:00:00.000Z',
      sourceBytes: 58,
      compiledBytes: 84,
      guardFunction: '__rey30SandboxGuard__',
      compiler: { target: 'ES2020', module: 'CommonJS', policyVersion: 1 },
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

    const { GET } = await import('@/app/api/scripts/runtime/route');
    const response = await GET(
      new NextRequest('http://localhost/api/scripts/runtime?path=scribs/runtime.ts')
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.ready).toBe(false);
    expect(String(payload.error || '')).toContain('Scrib Studio');
    expect(payload.runtime.multiInstanceMode).toBe('single-instance-only');
    expect(payload.live).toMatchObject({
      coordinationMode: 'heartbeat-sessions',
      storageMode: 'local',
    });
    expect(deleteScriptRuntimeArtifactMock).toHaveBeenCalledWith('scribs/runtime.ts');
  });

  it('returns 503 when the custom runtime policy is disabled', async () => {
    env.NODE_ENV = 'production';
    delete env.REY30_ENABLE_CUSTOM_SCRIPT_RUNTIME;
    requireSessionMock.mockResolvedValue({
      id: 'editor-1',
      role: 'EDITOR',
      email: 'editor@example.com',
      sessionId: 'session-1',
    });
    getScriptStorageInfoMock.mockReturnValue({
      backend: 'filesystem',
      scope: 'filesystem',
      root: 'C:/repo/scripts',
    });
    getScriptRuntimeArtifactStorageInfoMock.mockReturnValue({
      backend: 'filesystem',
      scope: 'filesystem',
      root: 'C:/repo/scripts/.rey30-runtime-artifacts',
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

    const { GET } = await import('@/app/api/scripts/runtime/route');
    const response = await GET(
      new NextRequest('http://localhost/api/scripts/runtime?path=scribs/runtime.ts')
    );
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(String(payload.error || '')).toContain('runtime personalizado');
    expect(payload.policy).toMatchObject({
      enabled: false,
      mode: 'disabled',
    });
  });
});
