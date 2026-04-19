import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRemoteEditorBuildExporter } from '@/engine/agentic/tools/adapters/remoteEditorBuildExporter';
import type { EditorBuildExportInput } from '@/engine/agentic/tools/adapters/sceneStoreAdapter';
import { createDefaultAutomationPermissions, createDefaultEditorState } from '@/store/editorStore.utils';
import type { BuildReport } from '@/engine/reyplay/types';
import { resolveAdvancedLightingSettings, type Entity, type Scene } from '@/types/engine';

function createScene(entityIds: string[] = []): Scene {
  return {
    id: 'scene-unsaved',
    name: 'Unsaved Agentic Scene',
    entities: [],
    rootEntities: entityIds,
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
      advancedLighting: resolveAdvancedLightingSettings(),
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
    createdAt: new Date('2026-04-16T00:00:00.000Z'),
    updatedAt: new Date('2026-04-16T00:00:00.000Z'),
  };
}

function createEntity(): Entity {
  return {
    id: 'entity-unsaved',
    name: 'Unsaved Mesh',
    parentId: null,
    children: [],
    active: true,
    tags: ['agentic'],
    components: new Map([
      [
        'Transform',
        {
          id: 'transform-unsaved',
          type: 'Transform',
          enabled: true,
          data: {
            position: { x: 1, y: 2, z: 3 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            scale: { x: 1, y: 1, z: 1 },
          },
        },
      ],
    ]),
  };
}

function createExportInput(projectName = 'Unsaved Agentic Project'): EditorBuildExportInput {
  const entity = createEntity();
  return {
    projectName,
    projectPath: '',
    isDirty: true,
    scenes: [createScene([entity.id])],
    activeSceneId: 'scene-unsaved',
    entities: new Map([[entity.id, entity]]),
    assets: [],
    engineMode: 'MODE_AI_FIRST',
    aiMode: 'API',
    aiEnabled: true,
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
    buildManifest: null,
  };
}

function okBuildReport(): BuildReport {
  return {
    ok: true,
    sceneCount: 1,
    assetCount: 0,
    entityCount: 1,
    diagnostics: [],
    summary: 'Remote build ok.',
    generatedAt: '2026-04-16T00:00:00.000Z',
  };
}

describe('agentic remote build exporter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('syncs the live editor snapshot before requesting a remote build', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          slot: 'agentic-slot',
          summary: {
            slot: 'agentic-slot',
            projectName: 'Unsaved Agentic Project',
            sceneCount: 1,
            entityCount: 1,
            assetCount: 0,
            scribProfileCount: 0,
            scribInstanceCount: 0,
            timestamp: Date.now(),
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          target: 'web',
          buildId: 'remote-build-1',
          report: okBuildReport(),
          artifacts: [
            {
              id: 'artifact-web',
              target: 'web',
              path: 'output/builds/remote-build-1/project-web.zip',
              size: 128,
              createdAt: '2026-04-16T00:00:00.000Z',
              kind: 'bundle',
            },
          ],
          missingDeps: [],
          logs: ['Remote package emitted.'],
          source: 'remote_editor_project',
        }),
      });

    vi.stubGlobal('fetch', fetchMock);

    const exporter = createRemoteEditorBuildExporter({ slot: 'agentic-slot' });
    const result = await exporter('web', createExportInput());

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/editor-project',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-rey30-project': 'unsaved_agentic_project',
        },
      })
    );
    const saveBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(saveBody.slot).toBe('agentic-slot');
    expect(saveBody.saveData.custom.snapshot.session.projectName).toBe('Unsaved Agentic Project');
    expect(saveBody.saveData.custom.entityCount).toBe(1);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/build',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-rey30-project': 'unsaved_agentic_project',
        },
      })
    );
    const buildBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(buildBody.slot).toBe('agentic-slot');
    expect(result.logs[0]).toContain('save synced');
    expect(result.artifacts[0]?.kind).toBe('bundle');
  });

  it('does not request a remote build when the pre-export save fails', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        success: false,
        error: 'Remote save denied.',
      }),
    });

    vi.stubGlobal('fetch', fetchMock);

    const exporter = createRemoteEditorBuildExporter();
    const result = await exporter('web', createExportInput('Blocked Project'));

    expect(result.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.report.diagnostics[0]?.code).toBe('REMOTE_SAVE_FAILED');
    expect(result.logs[0]).toContain('Remote editor project sync failed');
    expect(result.artifacts).toEqual([]);
  });
});
