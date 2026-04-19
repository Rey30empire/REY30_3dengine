import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { NextRequest } from 'next/server';
import { createDefaultAutomationPermissions, createDefaultEditorState } from '@/store/editorStore.utils';
import type { EditorSessionSnapshot } from '@/lib/editor-session-snapshot';

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

vi.mock('@/lib/security/auth', () => ({
  requireSession: requireSessionMock,
  authErrorToResponse: authErrorToResponseMock,
}));

const ORIGINAL_EDITOR_SESSION_ROOT = process.env.REY30_EDITOR_SESSION_ROOT;
const cleanupDirs = new Set<string>();

function createSessionSnapshot(projectName = 'demo-project'): EditorSessionSnapshot {
  return {
    version: 1,
    projectName,
    projectPath: '',
    isDirty: false,
    scenes: [
      {
        id: 'scene-1',
        name: 'Main Scene',
        rootEntities: [],
        entityIds: [],
        collections: [],
        environment: {
          skybox: 'studio',
          ambientLight: { r: 0.5, g: 0.5, b: 0.5 },
          ambientIntensity: 1,
          environmentIntensity: 1,
          environmentRotation: 0,
          directionalLightIntensity: 1.2,
          directionalLightAzimuth: 45,
          directionalLightElevation: 55,
          fog: null,
          postProcessing: {
            bloom: { enabled: false, intensity: 0.5, threshold: 0.8, radius: 0.5 },
            ssao: { enabled: false, radius: 0.5, intensity: 1, bias: 0.025 },
            ssr: { enabled: false, intensity: 0.5, maxDistance: 100 },
            colorGrading: {
              enabled: false,
              exposure: 1,
              contrast: 1,
              saturation: 1,
              gamma: 2.2,
              toneMapping: 'aces',
              rendererExposure: 1,
            },
            vignette: { enabled: false, intensity: 0.5, smoothness: 0.5, roundness: 1 },
          },
        },
        createdAt: '2026-03-30T00:00:00.000Z',
        updatedAt: '2026-03-30T00:00:00.000Z',
      },
    ],
    activeSceneId: 'scene-1',
    entities: [],
    assets: [],
    engineMode: 'MODE_MANUAL',
    aiMode: 'OFF',
    aiEnabled: false,
    editor: createDefaultEditorState(),
    automationPermissions: createDefaultAutomationPermissions(),
    profiler: {
      fps: 60,
      frameTime: 16.67,
      cpuTime: 0,
      gpuTime: 0,
      memory: {
        used: 0,
        allocated: 0,
        textures: 0,
        meshes: 0,
        audio: 0,
      },
      drawCalls: 0,
      triangles: 0,
      vertices: 0,
    },
  };
}

async function withTempEditorSessionRoot<T>(run: () => Promise<T>) {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'rey30-editor-session-route-'));
  cleanupDirs.add(tempRoot);
  process.env.REY30_EDITOR_SESSION_ROOT = tempRoot;
  try {
    return await run();
  } finally {
    if (ORIGINAL_EDITOR_SESSION_ROOT === undefined) {
      delete process.env.REY30_EDITOR_SESSION_ROOT;
    } else {
      process.env.REY30_EDITOR_SESSION_ROOT = ORIGINAL_EDITOR_SESSION_ROOT;
    }
  }
}

describe('editor session route', () => {
  afterEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const { resetEditorSessionBridgeForTest } = await import('@/lib/server/editor-session-bridge');
    resetEditorSessionBridgeForTest();
    await Promise.all(
      Array.from(cleanupDirs).map(async (dir) => {
        await rm(dir, { recursive: true, force: true }).catch(() => undefined);
        cleanupDirs.delete(dir);
      })
    );
  });

  it('stores an editor session snapshot and reports it on GET', async () => {
    await withTempEditorSessionRoot(async () => {
      requireSessionMock.mockResolvedValue({
        id: 'editor-1',
        role: 'EDITOR',
        email: 'editor@example.com',
        sessionId: 'session-1',
      });

      const snapshot = createSessionSnapshot('demo-project');
      const { POST, GET } = await import('@/app/api/editor-session/route');

      const saveResponse = await POST(
        new NextRequest('http://localhost/api/editor-session', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-rey30-project': 'demo-project',
          },
          body: JSON.stringify({
            sessionId: 'bridge-1',
            knownServerMutationVersion: 0,
            snapshot,
          }),
        })
      );
      const savePayload = await saveResponse.json();

      expect(saveResponse.status).toBe(200);
      expect(savePayload).toMatchObject({
        success: true,
        accepted: true,
        needsRefresh: false,
        sessionId: 'bridge-1',
        projectKey: 'demo-project',
        serverMutationVersion: 0,
      });

      const getResponse = await GET(
        new NextRequest('http://localhost/api/editor-session?sessionId=bridge-1')
      );
      const getPayload = await getResponse.json();

      expect(getResponse.status).toBe(200);
      expect(requireSessionMock).toHaveBeenCalledWith(expect.any(NextRequest), 'EDITOR');
      expect(getPayload).toEqual({
        success: true,
        active: true,
        session: {
          sessionId: 'bridge-1',
          projectKey: 'demo-project',
          serverMutationVersion: 0,
          lastClientSyncAt: expect.any(String),
          lastServerMutationAt: null,
        },
      });

      const snapshotResponse = await GET(
        new NextRequest('http://localhost/api/editor-session?sessionId=bridge-1&includeSnapshot=1')
      );
      const snapshotPayload = await snapshotResponse.json();

      expect(snapshotResponse.status).toBe(200);
      expect(snapshotPayload.snapshot).toMatchObject({
        version: 1,
        projectName: 'demo-project',
        activeSceneId: 'scene-1',
      });
    });
  });

  it('rejects invalid editor snapshots with a sanitized message', async () => {
    await withTempEditorSessionRoot(async () => {
      requireSessionMock.mockResolvedValue({
        id: 'editor-1',
        role: 'EDITOR',
        email: 'editor@example.com',
        sessionId: 'session-1',
      });

      const { POST } = await import('@/app/api/editor-session/route');
      const response = await POST(
        new NextRequest('http://localhost/api/editor-session', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sessionId: 'bridge-1',
            snapshot: { nope: true },
          }),
        })
      );
      const payload = await response.json();

      expect(response.status).toBe(400);
      expect(payload.error).toBe('La sesión del editor no es válida.');
    });
  });

  it('restores an active session after modules are reloaded', async () => {
    await withTempEditorSessionRoot(async () => {
      requireSessionMock.mockResolvedValue({
        id: 'editor-1',
        role: 'EDITOR',
        email: 'editor@example.com',
        sessionId: 'session-1',
      });

      const snapshot = createSessionSnapshot('restart-proof-project');
      const routeModule = await import('@/app/api/editor-session/route');

      const saveResponse = await routeModule.POST(
        new NextRequest('http://localhost/api/editor-session', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-rey30-project': 'restart-proof-project',
          },
          body: JSON.stringify({
            sessionId: 'bridge-restart',
            knownServerMutationVersion: 0,
            snapshot,
          }),
        })
      );
      expect(saveResponse.status).toBe(200);

      vi.resetModules();
      const { GET } = await import('@/app/api/editor-session/route');
      const getResponse = await GET(
        new NextRequest('http://localhost/api/editor-session?sessionId=bridge-restart&includeSnapshot=1')
      );
      const getPayload = await getResponse.json();

      expect(getResponse.status).toBe(200);
      expect(getPayload.active).toBe(true);
      expect(getPayload.session).toMatchObject({
        sessionId: 'bridge-restart',
        projectKey: 'restart-proof-project',
      });
      expect(getPayload.snapshot).toMatchObject({
        projectName: 'restart-proof-project',
        activeSceneId: 'scene-1',
      });
    });
  });
});
