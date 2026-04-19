import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { createDefaultAutomationPermissions, createDefaultEditorState } from '@/store/editorStore.utils';
import type { EditorSessionSnapshot } from '@/lib/editor-session-snapshot';

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
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'rey30-editor-session-bridge-'));
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

describe('editor session bridge', () => {
  afterEach(async () => {
    vi.resetModules();
    await Promise.all(
      Array.from(cleanupDirs).map(async (dir) => {
        await rm(dir, { recursive: true, force: true }).catch(() => undefined);
        cleanupDirs.delete(dir);
      })
    );
  });

  it('shares durable session state across reloaded bridge modules', async () => {
    await withTempEditorSessionRoot(async () => {
      const bridgeA = await import('@/lib/server/editor-session-bridge');
      await bridgeA.upsertClientEditorSession({
        sessionId: 'bridge-shared',
        userId: 'editor-1',
        projectKey: 'shared-project',
        snapshot: createSessionSnapshot('shared-project'),
        knownServerMutationVersion: 0,
      });

      vi.resetModules();
      const bridgeB = await import('@/lib/server/editor-session-bridge');
      const resolved = bridgeB.resolveEditorSessionRecord({
        userId: 'editor-1',
        preferredSessionId: 'bridge-shared',
        projectKey: 'shared-project',
      });

      expect(resolved).toMatchObject({
        sessionId: 'bridge-shared',
        projectKey: 'shared-project',
        serverMutationVersion: 0,
        snapshot: expect.objectContaining({
          projectName: 'shared-project',
          activeSceneId: 'scene-1',
        }),
      });
    });
  });

  it('serializes concurrent server mutations and preserves version growth', async () => {
    await withTempEditorSessionRoot(async () => {
      const bridge = await import('@/lib/server/editor-session-bridge');
      const { useEngineStore } = await import('@/store/editorStore');
      await bridge.upsertClientEditorSession({
        sessionId: 'bridge-concurrency',
        userId: 'editor-1',
        projectKey: 'concurrency-project',
        snapshot: createSessionSnapshot('concurrency-project'),
        knownServerMutationVersion: 0,
      });

      const first = bridge.applyEditorSessionMutation({
        userId: 'editor-1',
        preferredSessionId: 'bridge-concurrency',
        projectKey: 'concurrency-project',
        mutate: async () => {
          useEngineStore.setState({ projectName: 'mutated-project' });
          await new Promise((resolve) => setTimeout(resolve, 30));
          return 'first';
        },
      });

      const second = bridge.applyEditorSessionMutation({
        userId: 'editor-1',
        preferredSessionId: 'bridge-concurrency',
        projectKey: 'concurrency-project',
        mutate: async () => {
          useEngineStore.setState({ isDirty: true });
          return 'second';
        },
      });

      const [firstResult, secondResult] = await Promise.all([first, second]);
      expect(firstResult.mutated).toBe(true);
      expect(secondResult.mutated).toBe(true);

      const resolved = bridge.resolveEditorSessionRecord({
        userId: 'editor-1',
        preferredSessionId: 'bridge-concurrency',
        projectKey: 'concurrency-project',
      });

      expect(resolved).toMatchObject({
        sessionId: 'bridge-concurrency',
        serverMutationVersion: 2,
        snapshot: expect.objectContaining({
          projectName: 'mutated-project',
          isDirty: true,
        }),
      });
    });
  });
});
