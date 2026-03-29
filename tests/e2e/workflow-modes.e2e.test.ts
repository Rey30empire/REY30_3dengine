import { describe, expect, it } from 'vitest';
import { useEngineStore } from '@/store/editorStore';
import { EntityFactory } from '@/engine/core/ECS';
import type { EngineWorkflowMode } from '@/types/engine';

function resetWorkspaceState() {
  const current = useEngineStore.getState();
  useEngineStore.setState({
    scenes: [],
    activeSceneId: null,
    entities: new Map(),
    assets: [],
    chatMessages: [],
    tasks: [],
    scribInstances: new Map(),
    editor: {
      ...current.editor,
      selectedEntities: [],
      selectedAsset: null,
    },
    lastBuildReport: null,
    buildManifest: null,
    lastCompileSummary: '',
    playRuntimeState: 'IDLE',
    engineMode: 'MODE_MANUAL',
    aiMode: 'OFF',
    aiEnabled: false,
  });
}

describe('Workflow modes e2e', () => {
  it('maps engine mode to expected ai mode', () => {
    resetWorkspaceState();
    const store = useEngineStore.getState();

    const cases: Array<{ mode: EngineWorkflowMode; expectedAiMode: 'OFF' | 'LOCAL' | 'API' }> = [
      { mode: 'MODE_MANUAL', expectedAiMode: 'OFF' },
      { mode: 'MODE_HYBRID', expectedAiMode: 'LOCAL' },
      { mode: 'MODE_AI_FIRST', expectedAiMode: 'API' },
    ];

    for (const item of cases) {
      store.setEngineMode(item.mode);
      const state = useEngineStore.getState();
      expect(state.engineMode).toBe(item.mode);
      expect(state.aiMode).toBe(item.expectedAiMode);
    }
  });

  it('compiles a playable scene in all three modes using shared core', () => {
    resetWorkspaceState();
    const store = useEngineStore.getState();
    const scene = store.createScene('E2E Scene');
    store.setActiveScene(scene.id);

    const player = EntityFactory.create('E2E Player');
    player.components.set('Transform', {
      id: crypto.randomUUID(),
      type: 'Transform',
      data: {
        position: { x: 0, y: 1, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: { x: 1, y: 1, z: 1 },
      },
      enabled: true,
    });
    player.tags.push('player');
    store.addEntity(player);

    const assigned = store.assignScribToEntity(player.id, 'characterBasic', { origin: 'manual' });
    expect(assigned.ok).toBe(true);

    const modes: EngineWorkflowMode[] = ['MODE_MANUAL', 'MODE_HYBRID', 'MODE_AI_FIRST'];
    for (const mode of modes) {
      store.setEngineMode(mode);
      const report = useEngineStore.getState().runReyPlayCompile();
      expect(report.summary.length).toBeGreaterThan(0);
      expect(useEngineStore.getState().scenes.length).toBeGreaterThan(0);
    }
  });
});
