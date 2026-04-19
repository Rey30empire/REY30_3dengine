import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { NextRequest } from 'next/server';
import {
  createEditorProjectSaveData,
  type EditorProjectSaveState,
} from '@/engine/serialization';
import { createDefaultAutomationPermissions, createDefaultEditorState } from '@/store/editorStore.utils';

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

const ORIGINAL_EDITOR_PROJECT_ROOT = process.env.REY30_EDITOR_PROJECT_ROOT;
const cleanupDirs = new Set<string>();

function createProjectState(projectName = 'Star Forge', assetCount = 0): EditorProjectSaveState {
  return {
    projectName,
    projectPath: 'C:/Projects/StarForge',
    isDirty: true,
    scenes: [
      {
        id: 'scene-1',
        name: 'Main Scene',
        entities: [],
        rootEntities: [],
        collections: [],
        environment: {
          skybox: 'studio',
          ambientLight: { r: 0.5, g: 0.5, b: 0.5, a: 1 },
          ambientIntensity: 1,
          environmentIntensity: 1,
          environmentRotation: 0,
          directionalLightIntensity: 1.2,
          directionalLightAzimuth: 45,
          directionalLightElevation: 55,
          advancedLighting: {
            shadowQuality: 'high',
            globalIllumination: { enabled: false, intensity: 1, bounceCount: 1 },
            bakedLightmaps: { enabled: false },
          },
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
        createdAt: new Date('2026-04-02T00:00:00.000Z'),
        updatedAt: new Date('2026-04-02T00:00:00.000Z'),
      },
    ],
    activeSceneId: 'scene-1',
    entities: new Map(),
    assets: Array.from({ length: assetCount }, (_, index) => ({
      id: `asset-${index + 1}`,
      name: `asset-${index + 1}.glb`,
      type: 'mesh' as const,
      path: `download/assets/mesh/uploads/star_forge/asset-${index + 1}.glb`,
      size: 1024,
      createdAt: new Date('2026-04-02T00:00:00.000Z'),
      metadata: { projectKey: 'star_forge' },
    })),
    engineMode: 'MODE_AI_FIRST',
    aiMode: 'LOCAL',
    aiEnabled: true,
    editor: createDefaultEditorState(),
    automationPermissions: createDefaultAutomationPermissions(),
    profiler: {
      fps: 60,
      frameTime: 16.67,
      cpuTime: 2,
      gpuTime: 3,
      memory: {
        used: 32,
        allocated: 64,
        textures: 1,
        meshes: 1,
        audio: 0,
      },
      drawCalls: 1,
      triangles: 12,
      vertices: 24,
    },
    scribProfiles: new Map(),
    activeScribEntityId: null,
    scribInstances: new Map(),
  };
}

async function withTempEditorProjectRoot<T>(run: () => Promise<T>) {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'rey30-editor-project-route-'));
  cleanupDirs.add(tempRoot);
  process.env.REY30_EDITOR_PROJECT_ROOT = tempRoot;
  try {
    return await run();
  } finally {
    if (ORIGINAL_EDITOR_PROJECT_ROOT === undefined) {
      delete process.env.REY30_EDITOR_PROJECT_ROOT;
    } else {
      process.env.REY30_EDITOR_PROJECT_ROOT = ORIGINAL_EDITOR_PROJECT_ROOT;
    }
  }
}

describe('editor project route', () => {
  afterEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const { clearEditorProjectStorageForTest } = await import('@/lib/server/editor-project-storage');
    clearEditorProjectStorageForTest();
    await Promise.all(
      Array.from(cleanupDirs).map(async (dir) => {
        await rm(dir, { recursive: true, force: true }).catch(() => undefined);
        cleanupDirs.delete(dir);
      })
    );
  });

  it('stores a remote editor project save and returns it durably', async () => {
    await withTempEditorProjectRoot(async () => {
      requireSessionMock.mockResolvedValue({
        id: 'editor-1',
        role: 'EDITOR',
        email: 'editor@example.com',
        sessionId: 'session-1',
      });

      const saveData = createEditorProjectSaveData(createProjectState('Star Forge'), {
        markClean: true,
      });
      const { GET, POST } = await import('@/app/api/editor-project/route');

      const saveResponse = await POST(
        new NextRequest('http://localhost/api/editor-project', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-rey30-project': 'Star Forge',
          },
          body: JSON.stringify({
            slot: 'primary',
            saveData,
          }),
        })
      );
      const savePayload = await saveResponse.json();

      expect(saveResponse.status).toBe(200);
      expect(savePayload).toMatchObject({
        success: true,
        projectKey: 'star_forge',
        slot: 'primary',
        summary: {
          projectName: 'Star Forge',
          sceneCount: 1,
          assetCount: 0,
        },
      });

      const summaryResponse = await GET(
        new NextRequest('http://localhost/api/editor-project?slot=primary&projectKey=Star%20Forge')
      );
      const summaryPayload = await summaryResponse.json();

      expect(summaryResponse.status).toBe(200);
      expect(summaryPayload).toMatchObject({
        success: true,
        active: true,
        projectKey: 'star_forge',
        slot: 'primary',
        summary: {
          projectName: 'Star Forge',
          sceneCount: 1,
        },
      });

      const loadResponse = await GET(
        new NextRequest(
          'http://localhost/api/editor-project?slot=primary&projectKey=Star%20Forge&includeSave=1'
        )
      );
      const loadPayload = await loadResponse.json();

      expect(loadResponse.status).toBe(200);
      expect(loadPayload.saveData).toMatchObject({
        version: 'editor-project/1',
        custom: {
          kind: 'editor_project',
        },
      });
    });
  });

  it('rejects invalid remote editor project payloads with a sanitized message', async () => {
    await withTempEditorProjectRoot(async () => {
      requireSessionMock.mockResolvedValue({
        id: 'editor-1',
        role: 'EDITOR',
        email: 'editor@example.com',
        sessionId: 'session-1',
      });

      const { POST } = await import('@/app/api/editor-project/route');
      const response = await POST(
        new NextRequest('http://localhost/api/editor-project', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            slot: 'primary',
            saveData: { nope: true },
          }),
        })
      );
      const payload = await response.json();

      expect(response.status).toBe(400);
      expect(payload.error).toBe('El save remoto del proyecto no es válido.');
    });
  });

  it('restores a persisted remote project after modules are reloaded', async () => {
    await withTempEditorProjectRoot(async () => {
      requireSessionMock.mockResolvedValue({
        id: 'editor-1',
        role: 'EDITOR',
        email: 'editor@example.com',
        sessionId: 'session-1',
      });

      const saveData = createEditorProjectSaveData(createProjectState('Reload Project', 1), {
        markClean: true,
      });
      const routeModule = await import('@/app/api/editor-project/route');

      const saveResponse = await routeModule.POST(
        new NextRequest('http://localhost/api/editor-project', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-rey30-project': 'Reload Project',
          },
          body: JSON.stringify({
            slot: 'reload-slot',
            saveData,
          }),
        })
      );
      expect(saveResponse.status).toBe(200);

      vi.resetModules();
      const { GET } = await import('@/app/api/editor-project/route');
      const getResponse = await GET(
        new NextRequest(
          'http://localhost/api/editor-project?slot=reload-slot&projectKey=Reload%20Project&includeSave=1'
        )
      );
      const getPayload = await getResponse.json();

      expect(getResponse.status).toBe(200);
      expect(getPayload).toMatchObject({
        success: true,
        active: true,
        projectKey: 'reload_project',
        slot: 'reload-slot',
        summary: {
          assetCount: 1,
          projectName: 'Reload Project',
        },
      });
      expect(getPayload.saveData).toMatchObject({
        custom: {
          kind: 'editor_project',
        },
      });
    });
  });

  it('serializes concurrent remote project writes without corrupting the stored save', async () => {
    await withTempEditorProjectRoot(async () => {
      requireSessionMock.mockResolvedValue({
        id: 'editor-1',
        role: 'EDITOR',
        email: 'editor@example.com',
        sessionId: 'session-1',
      });

      const { GET, POST } = await import('@/app/api/editor-project/route');
      const first = createEditorProjectSaveData(createProjectState('Bridge Project', 0), {
        markClean: true,
      });
      const second = createEditorProjectSaveData(createProjectState('Bridge Project', 2), {
        markClean: true,
      });

      const writes = await Promise.all([
        POST(
          new NextRequest('http://localhost/api/editor-project', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-rey30-project': 'Bridge Project',
            },
            body: JSON.stringify({ slot: 'concurrent', saveData: first }),
          })
        ),
        POST(
          new NextRequest('http://localhost/api/editor-project', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-rey30-project': 'Bridge Project',
            },
            body: JSON.stringify({ slot: 'concurrent', saveData: second }),
          })
        ),
      ]);

      expect(writes.every((response) => response.status === 200)).toBe(true);

      const getResponse = await GET(
        new NextRequest(
          'http://localhost/api/editor-project?slot=concurrent&projectKey=Bridge%20Project&includeSave=1'
        )
      );
      const getPayload = await getResponse.json();

      expect(getResponse.status).toBe(200);
      expect(getPayload.active).toBe(true);
      expect(getPayload.summary.assetCount === 0 || getPayload.summary.assetCount === 2).toBe(true);
      expect(getPayload.saveData).toMatchObject({
        custom: {
          kind: 'editor_project',
        },
      });
    });
  });
});
