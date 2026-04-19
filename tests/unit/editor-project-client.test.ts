import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEditorProjectSaveData, type EditorProjectSaveState } from '@/engine/serialization';
import { createDefaultAutomationPermissions, createDefaultEditorState } from '@/store/editorStore.utils';

function createRemoteSaveData(projectName = 'Bridge Project') {
  const state: EditorProjectSaveState = {
    projectName,
    projectPath: 'C:/Projects/BridgeProject',
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
    scribProfiles: new Map(),
    activeScribEntityId: null,
    scribInstances: new Map(),
  };

  return createEditorProjectSaveData(state, { markClean: true });
}

describe('editor project client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('normalizes the project key when fetching the remote summary', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        active: true,
        summary: {
          slot: 'editor_project_current',
          projectName: 'Star Forge',
          sceneCount: 1,
          entityCount: 0,
          assetCount: 0,
          scribProfileCount: 0,
          scribInstanceCount: 0,
          timestamp: Date.now(),
        },
      }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const { fetchRemoteEditorProjectSummary } = await import('@/engine/editor/editorProjectClient');

    await fetchRemoteEditorProjectSummary({ projectName: 'Star Forge' });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/editor-project?slot=editor_project_current&projectKey=star_forge',
      expect.objectContaining({
        method: 'GET',
        cache: 'no-store',
        headers: { 'x-rey30-project': 'star_forge' },
      })
    );
  });

  it('posts the remote project save with a normalized backend key', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const { saveRemoteEditorProject } = await import('@/engine/editor/editorProjectClient');

    await saveRemoteEditorProject({
      projectName: 'Bridge Project',
      saveData: createRemoteSaveData('Bridge Project'),
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/editor-project',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-rey30-project': 'bridge_project',
        },
      })
    );
  });
});
