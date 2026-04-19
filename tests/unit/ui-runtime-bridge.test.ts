import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Entity, Scene } from '@/types/engine';
import { ScriptRuntime } from '@/engine/gameplay/ScriptRuntime';
import { battleEngine } from '@/engine/gameplay/BattleEngine';
import {
  UI_RUNTIME_CANVAS_ID,
  uiManager,
  uiRuntimeBridge,
} from '@/engine/ui-runtime';
import { useEngineStore } from '@/store/editorStore';
import { installUIRuntimeTestEnvironment } from './ui-runtime-test-helpers';

function makeEntity(): Entity {
  return {
    id: 'entity-player',
    name: 'Hero',
    active: true,
    parentId: null,
    children: [],
    tags: ['player'],
    components: new Map([
      [
        'Transform',
        {
          id: 'transform-player',
          type: 'Transform',
          enabled: true,
          data: {
            position: { x: 0, y: 1, z: 0 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            scale: { x: 1, y: 1, z: 1 },
          },
        },
      ],
      [
        'Health',
        {
          id: 'health-player',
          type: 'Health',
          enabled: true,
          data: {
            maxHealth: 100,
            currentHealth: 75,
          },
        },
      ],
    ]),
  };
}

function makeScene(entity: Entity): Scene {
  return {
    id: 'scene-ui',
    name: 'UI Runtime Scene',
    entities: [entity],
    rootEntities: [entity.id],
    environment: {
      skybox: null,
      ambientLight: { r: 0.2, g: 0.2, b: 0.2, a: 1 },
      fog: null,
      postProcessing: {
        bloom: { enabled: false, intensity: 0, threshold: 0, radius: 0 },
        ssao: { enabled: false, radius: 0, intensity: 0, bias: 0 },
        ssr: { enabled: false, intensity: 0, maxDistance: 0 },
        colorGrading: { enabled: false, exposure: 1, contrast: 1, saturation: 1, gamma: 1 },
        vignette: { enabled: false, intensity: 0, smoothness: 0, roundness: 0 },
      },
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function readPanelTitle(panel: { getChildren: () => Array<{ id: string; getText?: () => string }> }): string | null {
  const title = panel.getChildren().find((child) => child.id.endsWith(':title'));
  return typeof title?.getText === 'function' ? title.getText() : null;
}

describe('UIRuntimeBridge', () => {
  afterEach(() => {
    uiRuntimeBridge.reset();
    uiManager.reset();
    battleEngine.reset();
    useEngineStore.setState({
      scenes: [],
      activeSceneId: null,
      entities: new Map(),
      scribInstances: new Map(),
      playRuntimeState: 'IDLE',
      editor: {
        ...useEngineStore.getState().editor,
        viewportCameraEntityId: null,
      },
    });
    vi.unstubAllGlobals();
  });

  it('materializes scene and entity ui scribs into a runtime HUD and cleans up on idle', () => {
    const { container } = installUIRuntimeTestEnvironment();
    const entity = makeEntity();
    const scene = makeScene(entity);
    const current = useEngineStore.getState();

    useEngineStore.setState({
      ...current,
      scenes: [scene],
      activeSceneId: scene.id,
      entities: new Map([[entity.id, entity]]),
      scribInstances: new Map(),
      playRuntimeState: 'PLAYING',
    });

    uiRuntimeBridge.attachToContainer(container);

    const store = useEngineStore.getState();
    const sceneAssign = store.assignScribToScene(scene.id, 'ui', {
      config: {
        panel: 'hud',
        title: 'Battle HUD',
      },
      origin: 'manual',
    });
    const entityAssign = store.assignScribToEntity(entity.id, 'ui', {
      config: {
        panel: 'hud-right',
        title: 'Hero HUD',
        showHealth: true,
      },
      origin: 'manual',
    });

    expect(sceneAssign.ok).toBe(true);
    expect(entityAssign.ok).toBe(true);

    const runtime = new ScriptRuntime();
    runtime.update(1 / 60);

    const canvas = uiManager.getCanvas(UI_RUNTIME_CANVAS_ID);
    expect(canvas).toBeDefined();
    expect(canvas?.getElement()?.parentElement).toBe(container);
    expect(canvas?.getElement()?.style.pointerEvents).toBe('none');

    const panels = canvas?.getChildren() ?? [];
    expect(panels).toHaveLength(2);
    expect(panels.map(readPanelTitle)).toEqual(expect.arrayContaining(['Battle HUD', 'Hero HUD']));
    expect(
      panels.some((panel) => panel.getChildren().some((child) => child.id.endsWith(':health')))
    ).toBe(true);

    useEngineStore.setState({ playRuntimeState: 'IDLE' });
    runtime.update(0);

    expect(uiManager.getCanvas(UI_RUNTIME_CANVAS_ID)).toBeUndefined();
  });
});
