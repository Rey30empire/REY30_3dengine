import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createDefaultAnimatorEditorState,
  createLibraryClip,
  serializeAnimatorEditorState,
} from '@/engine/editor/animationEditorState';
import type { Entity, Scene } from '@/types/engine';
import { KeyCode } from '@/engine/input/InputManager';
import { ScriptRuntime } from '@/engine/gameplay/ScriptRuntime';
import { animationRuntimeBridge } from '@/engine/animation/animationRuntimeBridge';
import { audioRuntimeBridge } from '@/engine/audio/audioRuntimeBridge';
import { physicsRuntimeBridge } from '@/engine/physics/physicsRuntimeBridge';
import { useEngineStore } from '@/store/editorStore';
import type { ScribInstance } from '@/engine/scrib';
import {
  dispatchKeyboardEvent,
  dispatchMouseMove,
  installInputTestEnvironment,
  resetInputManagerForTests,
} from './input-test-helpers';
import { battleRuntimeBridge } from '@/engine/gameplay/BattleRuntimeBridge';

function makeEntity(): Entity {
  return {
    id: 'entity-1',
    name: 'Runtime Actor',
    active: true,
    parentId: null,
    children: [],
    tags: [],
    components: new Map([
      [
        'Transform',
        {
          id: 'transform-1',
          type: 'Transform',
          enabled: true,
          data: {
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            scale: { x: 1, y: 1, z: 1 },
          },
        },
      ],
      [
        'Script',
        {
          id: 'script-1',
          type: 'Script',
          enabled: true,
          data: {
            scriptId: 'runtime/player.ts',
            parameters: {},
            enabled: true,
          },
        },
      ],
    ]),
  };
}

function makePhysicsEntity(): Entity {
  return {
    id: 'entity-physics',
    name: 'Physics Actor',
    active: true,
    parentId: null,
    children: [],
    tags: ['physics'],
    components: new Map([
      [
        'Transform',
        {
          id: 'transform-physics',
          type: 'Transform',
          enabled: true,
          data: {
            position: { x: 0, y: 3, z: 0 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            scale: { x: 1, y: 1, z: 1 },
          },
        },
      ],
      [
        'Collider',
        {
          id: 'collider-physics',
          type: 'Collider',
          enabled: true,
          data: {
            type: 'box',
            isTrigger: false,
            center: { x: 0, y: 0, z: 0 },
            size: { x: 1, y: 1, z: 1 },
          },
        },
      ],
      [
        'Rigidbody',
        {
          id: 'rigidbody-physics',
          type: 'Rigidbody',
          enabled: true,
          data: {
            mass: 1,
            drag: 0.01,
            angularDrag: 0.05,
            useGravity: true,
            isKinematic: false,
            velocity: { x: 0, y: 0, z: 0 },
            angularVelocity: { x: 0, y: 0, z: 0 },
          },
        },
      ],
    ]),
  };
}

function makePlayerCameraEntity(): Entity {
  return {
    id: 'entity-player-camera',
    name: 'Player Camera',
    active: true,
    parentId: null,
    children: [],
    tags: ['player'],
    components: new Map([
      [
        'Transform',
        {
          id: 'transform-player-camera',
          type: 'Transform',
          enabled: true,
          data: {
            position: { x: 0, y: 3, z: 0 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            scale: { x: 1, y: 1, z: 1 },
          },
        },
      ],
      [
        'Camera',
        {
          id: 'camera-player-camera',
          type: 'Camera',
          enabled: true,
          data: {
            fov: 60,
            near: 0.1,
            far: 1000,
            orthographic: false,
            clearColor: { r: 0, g: 0, b: 0, a: 1 },
            isMain: true,
          },
        },
      ],
      [
        'PlayerController',
        {
          id: 'controller-player-camera',
          type: 'PlayerController',
          enabled: true,
          data: {
            speed: 4.5,
            runSpeed: 7,
            jumpForce: 10,
            sensitivity: 1.5,
            height: 1.8,
            radius: 0.35,
            stepOffset: 0.4,
            slopeLimit: 45,
          },
        },
      ],
    ]),
  };
}

function makeAnimatorEntity(): Entity {
  const base = createDefaultAnimatorEditorState('Animated Hero');
  const walkClip = createLibraryClip('Walk Cycle');

  return {
    id: 'entity-animator',
    name: 'Animated Hero',
    active: true,
    parentId: null,
    children: [],
    tags: ['animated'],
    components: new Map([
      [
        'Transform',
        {
          id: 'transform-animator',
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
        'Animator',
        {
          id: 'animator-main',
          type: 'Animator',
          enabled: true,
          data: serializeAnimatorEditorState(
            {
              controllerId: null,
              currentAnimation: walkClip.name,
              parameters: { locomotion: 'walk' },
            },
            {
              ...base,
              activeClipId: walkClip.id,
              clips: [base.clips[0], walkClip],
              nlaStrips: [
                {
                  id: 'strip-walk',
                  name: 'Walk Main',
                  clipId: walkClip.id,
                  start: 0,
                  end: walkClip.duration,
                  blendMode: 'replace',
                  muted: false,
                },
              ],
            }
          ),
        },
      ],
    ]),
  };
}

function makeCombatPlayerEntity(): Entity {
  return {
    id: 'entity-combat-player',
    name: 'Combat Player',
    active: true,
    parentId: null,
    children: [],
    tags: ['player'],
    components: new Map([
      [
        'Transform',
        {
          id: 'transform-combat-player',
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
        'Camera',
        {
          id: 'camera-combat-player',
          type: 'Camera',
          enabled: true,
          data: {
            fov: 60,
            near: 0.1,
            far: 1000,
            orthographic: false,
            clearColor: { r: 0, g: 0, b: 0, a: 1 },
            isMain: true,
          },
        },
      ],
      [
        'PlayerController',
        {
          id: 'controller-combat-player',
          type: 'PlayerController',
          enabled: true,
          data: {
            speed: 4.5,
            runSpeed: 7,
            jumpForce: 10,
            sensitivity: 1.5,
            height: 1.8,
            radius: 0.35,
            stepOffset: 0.4,
            slopeLimit: 45,
          },
        },
      ],
      [
        'Health',
        {
          id: 'health-combat-player',
          type: 'Health',
          enabled: true,
          data: {
            maxHealth: 100,
            currentHealth: 100,
            attack: 16,
            defense: 4,
            speed: 1.2,
            team: 'player',
          },
        },
      ],
    ]),
  };
}

function makeCombatWeaponEntity(parentId: string): Entity {
  return {
    id: 'entity-combat-weapon',
    name: 'Combat Sword',
    active: true,
    parentId,
    children: [],
    tags: ['weapon'],
    components: new Map([
      [
        'Transform',
        {
          id: 'transform-combat-weapon',
          type: 'Transform',
          enabled: true,
          data: {
            position: { x: 0.35, y: 1.1, z: 0.1 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            scale: { x: 1, y: 1, z: 1 },
          },
        },
      ],
      [
        'Weapon',
        {
          id: 'weapon-combat-player',
          type: 'Weapon',
          enabled: true,
          data: {
            damage: 16,
            attackSpeed: 1.2,
            range: 2.2,
            heavyDamage: 28,
            heavyAttackSpeed: 0.8,
            heavyRange: 2.6,
            targetTeam: 'enemy',
            autoAcquireTarget: true,
          },
        },
      ],
    ]),
  };
}

function makeCombatEnemyEntity(): Entity {
  return {
    id: 'entity-combat-enemy',
    name: 'Combat Enemy',
    active: true,
    parentId: null,
    children: [],
    tags: ['enemy'],
    components: new Map([
      [
        'Transform',
        {
          id: 'transform-combat-enemy',
          type: 'Transform',
          enabled: true,
          data: {
            position: { x: 0, y: 1, z: 1.25 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            scale: { x: 1, y: 1, z: 1 },
          },
        },
      ],
      [
        'Health',
        {
          id: 'health-combat-enemy',
          type: 'Health',
          enabled: true,
          data: {
            maxHealth: 80,
            currentHealth: 80,
            attack: 10,
            defense: 1,
            speed: 1,
            team: 'enemy',
          },
        },
      ],
    ]),
  };
}

function makeFloorEntity(): Entity {
  return {
    id: 'entity-floor',
    name: 'Floor',
    active: true,
    parentId: null,
    children: [],
    tags: ['ground'],
    components: new Map([
      [
        'Transform',
        {
          id: 'transform-floor',
          type: 'Transform',
          enabled: true,
          data: {
            position: { x: 0, y: -0.5, z: 0 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            scale: { x: 1, y: 1, z: 1 },
          },
        },
      ],
      [
        'Collider',
        {
          id: 'collider-floor',
          type: 'Collider',
          enabled: true,
          data: {
            type: 'box',
            isTrigger: false,
            center: { x: 0, y: 0, z: 0 },
            size: { x: 20, y: 1, z: 20 },
          },
        },
      ],
    ]),
  };
}

function makeScene(entity: Entity): Scene {
  return {
    id: 'scene-1',
    name: 'Runtime Scene',
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

describe('ScriptRuntime', () => {
  const env = process.env as Record<string, string | undefined>;
  const originalRuntimeFlag = env.REY30_ENABLE_CUSTOM_SCRIPT_RUNTIME;
  const originalNodeEnv = env.NODE_ENV;

  afterEach(() => {
    animationRuntimeBridge.reset();
    battleRuntimeBridge.reset();
    physicsRuntimeBridge.reset();
    resetInputManagerForTests();
    useEngineStore.setState({
      scenes: [],
      activeSceneId: null,
      entities: new Map(),
      scribInstances: new Map(),
      playRuntimeState: 'IDLE',
    });
    if (originalRuntimeFlag === undefined) {
      delete env.REY30_ENABLE_CUSTOM_SCRIPT_RUNTIME;
    } else {
      env.REY30_ENABLE_CUSTOM_SCRIPT_RUNTIME = originalRuntimeFlag;
    }
    if (originalNodeEnv === undefined) {
      delete env.NODE_ENV;
    } else {
      env.NODE_ENV = originalNodeEnv;
    }
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('loads reviewed runtime artifacts through the worker host and applies worker commands', async () => {
    env.REY30_ENABLE_CUSTOM_SCRIPT_RUNTIME = 'true';
    env.NODE_ENV = 'development';

    const entity = makeEntity();
    useEngineStore.setState({
      scenes: [makeScene(entity)],
      activeSceneId: 'scene-1',
      entities: new Map([[entity.id, entity]]),
      playRuntimeState: 'PLAYING',
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        compiledCode: '"use strict"; exports.update = function update(ctx) { ctx.setTransform({ x: 4 }); };',
        runtime: {
          compiledHash: 'compiled-hash-1',
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const loadModuleMock = vi.fn().mockResolvedValue({
      onStart: false,
      update: true,
      onStop: false,
      default: false,
    });
    const invokeModuleMock = vi.fn().mockResolvedValue([
      {
        type: 'setTransform',
        transform: { x: 4 },
      },
    ]);
    const resetMock = vi.fn();

    const runtime = new ScriptRuntime() as unknown as {
      runEntityScript: (entity: Entity, scriptId: string, deltaTime: number) => Promise<void>;
      reset: () => void;
      sandboxWorkerHost: {
        loadModule: typeof loadModuleMock;
        invokeModule: typeof invokeModuleMock;
        reset: typeof resetMock;
      };
    };
    runtime.sandboxWorkerHost = {
      loadModule: loadModuleMock,
      invokeModule: invokeModuleMock,
      reset: resetMock,
    };

    await runtime.runEntityScript(entity, 'runtime/player.ts', 0.016);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/scripts/runtime?path=runtime%2Fplayer.ts',
      { cache: 'no-store' }
    );
    expect(loadModuleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        moduleKind: 'legacy',
        scriptId: 'runtime/player.ts',
        compiledHash: 'compiled-hash-1',
      })
    );
    expect(invokeModuleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        moduleKind: 'legacy',
        phase: 'update',
        context: expect.objectContaining({
          entityId: 'entity-1',
        }),
      })
    );

    const updatedEntity = useEngineStore.getState().entities.get('entity-1');
    const updatedTransform = updatedEntity?.components.get('Transform')?.data as {
      position?: { x?: number };
    };
    expect(updatedTransform.position?.x).toBe(4);

    runtime.reset();
    expect(resetMock).toHaveBeenCalled();
  });

  it('loads scribs/*.scrib.ts through reviewed runtime artifacts instead of built-ins', async () => {
    env.REY30_ENABLE_CUSTOM_SCRIPT_RUNTIME = 'true';
    env.NODE_ENV = 'development';

    const entity = makeEntity();
    useEngineStore.setState({
      scenes: [makeScene(entity)],
      activeSceneId: 'scene-1',
      entities: new Map([[entity.id, entity]]),
      playRuntimeState: 'PLAYING',
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        compiledCode: '"use strict"; exports.update = function update(ctx) { ctx.setTransform({ x: 9 }); };',
        runtime: {
          compiledHash: 'scrib-compiled-hash-1',
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const loadModuleMock = vi.fn().mockResolvedValue({
      onStart: false,
      update: true,
      onStop: false,
      default: false,
    });
    const invokeModuleMock = vi.fn().mockResolvedValue([
      {
        type: 'setTransform',
        transform: { x: 9 },
      },
    ]);
    const resetMock = vi.fn();

    const runtime = new ScriptRuntime() as unknown as {
      loadScribHandler: (node: {
        id: string;
        sourceScribId: string;
        type: 'movement';
        target: { scope: 'entity'; id: string };
        config: Record<string, unknown>;
        code: string;
        priority: number;
        autoAdded: boolean;
        enabled: boolean;
      }) => Promise<{
        executionModel: 'worker' | 'local';
        update?: (ctx: {
          deltaTime: number;
          entityId: string;
          entity: Entity;
          scribNodeId: string;
          scribSourceId: string;
          scribType: 'movement';
          config: Record<string, unknown>;
          sceneId: string;
          setTransform: (transform: { x?: number; y?: number; z?: number }) => void;
        }) => Promise<void> | void;
      }>;
      sandboxWorkerHost: {
        loadModule: typeof loadModuleMock;
        invokeModule: typeof invokeModuleMock;
        reset: typeof resetMock;
      };
    };
    runtime.sandboxWorkerHost = {
      loadModule: loadModuleMock,
      invokeModule: invokeModuleMock,
      reset: resetMock,
    };

    const handler = await runtime.loadScribHandler({
      id: 'scrib-node-1',
      sourceScribId: 'scrib-instance-1',
      type: 'movement',
      target: { scope: 'entity', id: entity.id },
      config: {},
      code: 'scribs/movement.scrib.ts',
      priority: 60,
      autoAdded: false,
      enabled: true,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/scripts/runtime?path=scribs%2Fmovement.scrib.ts',
      { cache: 'no-store' }
    );
    expect(loadModuleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        moduleKind: 'scrib',
        scriptId: 'scribs/movement.scrib.ts',
        compiledHash: 'scrib-compiled-hash-1',
      })
    );
    expect(handler.executionModel).toBe('worker');

    await handler.update?.({
      deltaTime: 0.016,
      entityId: entity.id,
      entity,
      scribNodeId: 'scrib-node-1',
      scribSourceId: 'scrib-instance-1',
      scribType: 'movement',
      config: {},
      sceneId: 'scene-1',
      setTransform: () => undefined,
    });

    expect(invokeModuleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        moduleKind: 'scrib',
        phase: 'update',
        context: expect.objectContaining({
          scribType: 'movement',
          entityId: entity.id,
        }),
      })
    );

    const updatedEntity = useEngineStore.getState().entities.get(entity.id);
    const updatedTransform = updatedEntity?.components.get('Transform')?.data as {
      position?: { x?: number };
    };
    expect(updatedTransform.position?.x).toBe(9);
  });

  it('executes scene scribs from composer nodes through reviewed runtime artifacts', async () => {
    env.REY30_ENABLE_CUSTOM_SCRIPT_RUNTIME = 'true';
    env.NODE_ENV = 'development';

    const entity = makeEntity();
    const sceneScrib: ScribInstance = {
      id: 'scene-scrib-1',
      type: 'ui',
      kind: 'atomic',
      target: { scope: 'scene', id: 'scene-1' },
      config: {},
      code: 'scribs/scene-global.scrib.ts',
      requires: [],
      optional: [],
      provides: ['ui'],
      enabled: true,
      origin: 'manual',
      createdAt: '2026-04-18T00:00:00.000Z',
      updatedAt: '2026-04-18T00:00:00.000Z',
    };
    useEngineStore.setState({
      scenes: [makeScene(entity)],
      activeSceneId: 'scene-1',
      entities: new Map([[entity.id, entity]]),
      scribInstances: new Map([[sceneScrib.id, sceneScrib]]),
      playRuntimeState: 'PLAYING',
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        compiledCode:
          '"use strict"; exports.update = function update(ctx) { ctx.setSceneEnvironment({ fog: { enabled: true, type: "exponential", color: { r: 0.2, g: 0.3, b: 0.4, a: 1 }, density: 0.03 } }); };',
        runtime: {
          compiledHash: 'scene-scrib-hash-1',
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const loadModuleMock = vi.fn().mockResolvedValue({
      onStart: false,
      update: true,
      onStop: false,
      default: false,
    });
    const invokeModuleMock = vi.fn().mockResolvedValue([
      {
        type: 'setSceneEnvironment',
        environment: {
          fog: {
            enabled: true,
            type: 'exponential',
            color: { r: 0.2, g: 0.3, b: 0.4, a: 1 },
            density: 0.03,
          },
        },
      },
    ]);
    const resetMock = vi.fn();

    const runtime = new ScriptRuntime() as unknown as {
      updateAndFlush: (
        deltaTime: number,
        timeoutMs?: number
      ) => Promise<{
        scheduledTasks: number;
        settledTasks: number;
        pendingTasks: number;
        timedOut: boolean;
      }>;
      sandboxWorkerHost: {
        loadModule: typeof loadModuleMock;
        invokeModule: typeof invokeModuleMock;
        reset: typeof resetMock;
      };
    };
    runtime.sandboxWorkerHost = {
      loadModule: loadModuleMock,
      invokeModule: invokeModuleMock,
      reset: resetMock,
    };

    const flush = await runtime.updateAndFlush(0.016);

    expect(flush.scheduledTasks).toBeGreaterThanOrEqual(1);
    expect(flush.pendingTasks).toBe(0);
    expect(flush.timedOut).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/scripts/runtime?path=scribs%2Fscene-global.scrib.ts',
      { cache: 'no-store' }
    );
    expect(loadModuleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        moduleKind: 'scrib',
        scriptId: 'scribs/scene-global.scrib.ts',
        compiledHash: 'scene-scrib-hash-1',
      })
    );
    expect(invokeModuleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        moduleKind: 'scrib',
        phase: 'update',
        context: expect.objectContaining({
          targetScope: 'scene',
          targetId: 'scene-1',
          sceneId: 'scene-1',
          entityId: 'scene:scene-1',
          scribType: 'ui',
        }),
      })
    );

    const updatedScene = useEngineStore.getState().scenes.find((item) => item.id === 'scene-1');
    expect(updatedScene?.environment.fog).toEqual(
      expect.objectContaining({
        enabled: true,
        type: 'exponential',
        density: 0.03,
      })
    );
  });

  it('surfaces missing scrib artifacts as visible backoff diagnostics', async () => {
    env.REY30_ENABLE_CUSTOM_SCRIPT_RUNTIME = 'true';
    env.NODE_ENV = 'development';

    const entity = makeEntity();
    useEngineStore.setState({
      scenes: [makeScene(entity)],
      activeSceneId: 'scene-1',
      entities: new Map([[entity.id, entity]]),
      playRuntimeState: 'PLAYING',
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: 'review required' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const runtime = new ScriptRuntime() as unknown as {
      loadScribHandler: (node: {
        id: string;
        sourceScribId: string;
        type: 'movement';
        target: { scope: 'entity'; id: string };
        config: Record<string, unknown>;
        code: string;
        priority: number;
        autoAdded: boolean;
        enabled: boolean;
      }) => Promise<unknown>;
      getDiagnostics: () => {
        legacyScripts: {
          statuses: Array<{
            scriptId: string;
            status: string;
            lastStatusCode: number | null;
          }>;
        };
        artifacts: Array<{ scriptId: string; status: string }>;
        recentEvents: Array<{ kind: string; scriptId?: string; nodeId?: string }>;
      };
    };

    await expect(
      runtime.loadScribHandler({
        id: 'scrib-node-missing',
        sourceScribId: 'scrib-instance-missing',
        type: 'movement',
        target: { scope: 'entity', id: entity.id },
        config: {},
        code: 'scribs/movement.scrib.ts',
        priority: 60,
        autoAdded: false,
        enabled: true,
      })
    ).rejects.toThrow(/HTTP 409/);

    const diagnostics = runtime.getDiagnostics();
    expect(diagnostics.legacyScripts.statuses).toContainEqual(
      expect.objectContaining({
        scriptId: 'scribs/movement.scrib.ts',
        status: 'backoff',
        lastStatusCode: 409,
      })
    );
    expect(diagnostics.artifacts).toContainEqual(
      expect.objectContaining({
        scriptId: 'scribs/movement.scrib.ts',
        status: 'stale',
      })
    );
    expect(diagnostics.recentEvents).toContainEqual(
      expect.objectContaining({
        kind: 'scrib_load_failed',
        scriptId: 'scribs/movement.scrib.ts',
        nodeId: 'scrib-node-missing',
      })
    );
  });

  it('surfaces runtime diagnostics after a reviewed artifact fetch failure', async () => {
    env.REY30_ENABLE_CUSTOM_SCRIPT_RUNTIME = 'true';
    env.NODE_ENV = 'development';

    const entity = makeEntity();
    useEngineStore.setState({
      scenes: [makeScene(entity)],
      activeSceneId: 'scene-1',
      entities: new Map([[entity.id, entity]]),
      playRuntimeState: 'PLAYING',
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'missing' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const runtime = new ScriptRuntime() as unknown as {
      runEntityScript: (entity: Entity, scriptId: string, deltaTime: number) => Promise<void>;
      getDiagnostics: () => {
        legacyScripts: {
          statuses: Array<{
            scriptId: string;
            status: string;
            lastStatusCode: number | null;
          }>;
        };
        artifacts: Array<{ scriptId: string; status: string }>;
        recentEvents: Array<{ kind: string; scriptId?: string }>;
      };
    };

    await runtime.runEntityScript(entity, 'runtime/missing.ts', 0.016);

    const diagnostics = runtime.getDiagnostics();
    expect(diagnostics.legacyScripts.statuses).toContainEqual(
      expect.objectContaining({
        scriptId: 'runtime/missing.ts',
        status: 'backoff',
        lastStatusCode: 404,
      })
    );
    expect(diagnostics.artifacts).toContainEqual(
      expect.objectContaining({
        scriptId: 'runtime/missing.ts',
        status: 'missing',
      })
    );
    expect(diagnostics.recentEvents).toContainEqual(
      expect.objectContaining({
        kind: 'script_load_failed',
        scriptId: 'runtime/missing.ts',
      })
    );
  });

  it('tracks artifact verification counters in runtime diagnostics', () => {
    const runtime = new ScriptRuntime();

    runtime.recordArtifactVerification({
      scriptId: 'scribs/movement.scrib.ts',
      ok: true,
      message: 'compile ok',
    });
    runtime.recordArtifactVerification({
      scriptId: 'scribs/movement.scrib.ts',
      ok: false,
      message: 'compile failed',
    });

    const diagnostics = runtime.getDiagnostics();
    expect(diagnostics.artifactVerifications).toContainEqual(
      expect.objectContaining({
        scriptId: 'scribs/movement.scrib.ts',
        okCount: 1,
        failedCount: 1,
        lastStatus: 'failed',
        lastMessage: 'compile failed',
      })
    );
    expect(diagnostics.legacyScripts.statuses).toContainEqual(
      expect.objectContaining({
        scriptId: 'scribs/movement.scrib.ts',
        status: 'ready',
      })
    );
    expect(diagnostics.recentEvents).toContainEqual(
      expect.objectContaining({
        kind: 'artifact_verification_failed',
        scriptId: 'scribs/movement.scrib.ts',
      })
    );
  });

  it('clears script backoff immediately after a reviewed artifact verifies OK', async () => {
    env.REY30_ENABLE_CUSTOM_SCRIPT_RUNTIME = 'true';
    env.NODE_ENV = 'development';

    const entity = makeEntity();
    useEngineStore.setState({
      scenes: [makeScene(entity)],
      activeSceneId: 'scene-1',
      entities: new Map([[entity.id, entity]]),
      playRuntimeState: 'PLAYING',
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: 'review required' }),
    }));

    const runtime = new ScriptRuntime() as unknown as {
      loadScribHandler: (node: {
        id: string;
        sourceScribId: string;
        type: 'movement';
        target: { scope: 'entity'; id: string };
        config: Record<string, unknown>;
        code: string;
        priority: number;
        autoAdded: boolean;
        enabled: boolean;
      }) => Promise<unknown>;
      forceImmediateRetryForScript: (scriptId: string, reason?: string) => void;
      hydrateArtifactVerifications: (records: Array<{
        scriptId: string;
        okCount: number;
        failedCount: number;
        lastStatus: 'ok' | 'failed';
        lastVerifiedAt: string;
        lastMessage: string | null;
      }>) => void;
      getDiagnostics: () => ReturnType<ScriptRuntime['getDiagnostics']>;
    };

    await expect(
      runtime.loadScribHandler({
        id: 'scrib-node-retry',
        sourceScribId: 'scrib-instance-retry',
        type: 'movement',
        target: { scope: 'entity', id: entity.id },
        config: {},
        code: 'scribs/movement.scrib.ts',
        priority: 60,
        autoAdded: false,
        enabled: true,
      })
    ).rejects.toThrow(/HTTP 409/);

    expect(runtime.getDiagnostics().legacyScripts.statuses).toContainEqual(
      expect.objectContaining({
        scriptId: 'scribs/movement.scrib.ts',
        status: 'backoff',
      })
    );

    runtime.hydrateArtifactVerifications([
      {
        scriptId: 'scribs/movement.scrib.ts',
        okCount: 1,
        failedCount: 0,
        lastStatus: 'ok',
        lastVerifiedAt: '2026-04-18T00:00:00.000Z',
        lastMessage: 'compile ok',
      },
    ]);
    runtime.forceImmediateRetryForScript('scribs/movement.scrib.ts', 'artifact_verified');

    const diagnostics = runtime.getDiagnostics();
    expect(diagnostics.legacyScripts.statuses).toContainEqual(
      expect.objectContaining({
        scriptId: 'scribs/movement.scrib.ts',
        status: 'ready',
        failures: 0,
      })
    );
    expect(diagnostics.artifacts).not.toContainEqual(
      expect.objectContaining({ scriptId: 'scribs/movement.scrib.ts' })
    );
    expect(diagnostics.artifactVerifications).toContainEqual(
      expect.objectContaining({
        scriptId: 'scribs/movement.scrib.ts',
        okCount: 1,
        lastStatus: 'ok',
      })
    );
  });

  it('reports blocked scrib node details and allows retrying the node', () => {
    const entity = makeEntity();
    const node = {
      id: 'scrib-node-movement',
      sourceScribId: 'scrib-instance-movement',
      type: 'movement',
      target: { scope: 'entity' as const, id: entity.id },
      config: {},
      code: 'scribs/movement.scrib.ts',
      priority: 60,
      autoAdded: true,
      enabled: true,
    };
    const runtime = new ScriptRuntime() as unknown as {
      composerPlan: {
        ok: boolean;
        version: string;
        sceneId: string;
        collectedEntityIds: string[];
        collectedScribIds: string[];
        diagnostics: [];
        stages: [];
        nodes: typeof node[];
        createdAt: string;
      };
      disableScribNode: (blockedNode: typeof node, error: unknown) => void;
      retryDisabledScribNode: (nodeId?: string) => void;
      getDiagnostics: () => ReturnType<ScriptRuntime['getDiagnostics']>;
    };
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    runtime.composerPlan = {
      ok: true,
      version: 'test-plan',
      sceneId: 'scene-1',
      collectedEntityIds: [entity.id],
      collectedScribIds: [node.sourceScribId],
      diagnostics: [],
      stages: [],
      nodes: [node],
      createdAt: '2026-04-18T00:00:00.000Z',
    };

    runtime.disableScribNode(node, new Error('boom'));

    let diagnostics = runtime.getDiagnostics();
    expect(diagnostics.composer.disabledScribNodeDetails).toContainEqual(
      expect.objectContaining({
        nodeId: 'scrib-node-movement',
        sourceScribId: 'scrib-instance-movement',
        code: 'scribs/movement.scrib.ts',
        scribType: 'movement',
        autoAdded: true,
      })
    );

    runtime.retryDisabledScribNode('scrib-node-movement');
    diagnostics = runtime.getDiagnostics();
    expect(diagnostics.composer.disabledScribNodes).not.toContain('scrib-node-movement');
    expect(diagnostics.recentEvents).toContainEqual(
      expect.objectContaining({
        kind: 'scrib_node_retry_requested',
        nodeId: 'scrib-node-movement',
      })
    );
  });

  it('runs the physics bridge during play and restores authored state when returning to idle', () => {
    const floor = makeFloorEntity();
    const actor = makePhysicsEntity();
    const scene = makeScene(floor);
    scene.entities = [floor, actor];
    scene.rootEntities = [floor.id, actor.id];

    useEngineStore.setState({
      scenes: [scene],
      activeSceneId: 'scene-1',
      entities: new Map([
        [floor.id, floor],
        [actor.id, actor],
      ]),
      playRuntimeState: 'PLAYING',
    });

    const runtime = new ScriptRuntime();

    for (let i = 0; i < 180; i += 1) {
      runtime.update(1 / 60);
    }

    const simulatedActor = useEngineStore.getState().entities.get(actor.id);
    const simulatedTransform = simulatedActor?.components.get('Transform')?.data as {
      position?: { y?: number };
    };
    expect((simulatedTransform.position?.y ?? 0)).toBeLessThan(1);

    useEngineStore.setState({ playRuntimeState: 'IDLE' });
    runtime.update(0);

    const restoredActor = useEngineStore.getState().entities.get(actor.id);
    const restoredTransform = restoredActor?.components.get('Transform')?.data as {
      position?: { x?: number; y?: number; z?: number };
    };
    expect(restoredTransform.position).toEqual({ x: 0, y: 3, z: 0 });
  });

  it('ticks and resets the audio runtime bridge with the play lifecycle', () => {
    const entity = makeEntity();

    useEngineStore.setState({
      scenes: [makeScene(entity)],
      activeSceneId: 'scene-1',
      entities: new Map([[entity.id, entity]]),
      playRuntimeState: 'PLAYING',
    });

    const updateSpy = vi.spyOn(audioRuntimeBridge, 'update').mockImplementation(() => undefined);
    const resetSpy = vi.spyOn(audioRuntimeBridge, 'reset').mockImplementation(() => undefined);
    vi.spyOn(audioRuntimeBridge, 'isActive', 'get').mockReturnValue(true);
    const runtime = new ScriptRuntime();

    runtime.update(1 / 60);
    expect(updateSpy).toHaveBeenCalledWith(1 / 60);

    useEngineStore.setState({ playRuntimeState: 'IDLE' });
    runtime.update(0);

    expect(resetSpy).toHaveBeenCalled();
  });

  it('feeds runtime input into the player controller, physics and play camera', () => {
    installInputTestEnvironment();
    const floor = makeFloorEntity();
    const player = makePlayerCameraEntity();
    const scene = makeScene(floor);
    scene.entities = [floor, player];
    scene.rootEntities = [floor.id, player.id];

    useEngineStore.setState({
      scenes: [scene],
      activeSceneId: 'scene-1',
      entities: new Map([
        [floor.id, floor],
        [player.id, player],
      ]),
      playRuntimeState: 'PLAYING',
      editor: {
        ...useEngineStore.getState().editor,
        viewportCameraEntityId: null,
      },
    });

    const runtime = new ScriptRuntime();

    for (let i = 0; i < 180; i += 1) {
      runtime.update(1 / 60);
    }

    dispatchMouseMove(18, -8);
    dispatchKeyboardEvent('keydown', KeyCode.W, 'w');

    for (let i = 0; i < 120; i += 1) {
      runtime.update(1 / 60);
    }

    const movedPlayer = useEngineStore.getState().entities.get(player.id);
    const movedTransform = movedPlayer?.components.get('Transform')?.data as {
      position?: { y?: number; z?: number };
      rotation?: { x?: number };
    };
    const movedController = movedPlayer?.components.get('PlayerController')?.data as Record<string, unknown>;
    const movedInput = movedController.moveInput as { z?: number };

    expect(movedInput.z ?? 0).toBeGreaterThan(0.9);
    expect((movedTransform.position?.z ?? 0)).toBeGreaterThan(0.1);
    expect(movedController.isGrounded).toBe(true);
    expect(Math.abs(movedTransform.rotation?.x ?? 0)).toBeGreaterThan(0.01);
    expect(useEngineStore.getState().editor.viewportCameraEntityId).toBe(player.id);

    dispatchKeyboardEvent('keyup', KeyCode.W, 'w');
    dispatchKeyboardEvent('keydown', KeyCode.Space, ' ');
    runtime.update(1 / 60);

    const jumpedPlayer = useEngineStore.getState().entities.get(player.id);
    const jumpedController = jumpedPlayer?.components.get('PlayerController')?.data as Record<string, unknown>;
    const jumpedVelocity = jumpedController.velocity as { y?: number };

    expect(jumpedController.jumpRequested).toBe(false);
    expect(jumpedVelocity.y ?? 0).toBeGreaterThan(0);

    useEngineStore.setState({ playRuntimeState: 'IDLE' });
    runtime.update(0);

    expect(useEngineStore.getState().editor.viewportCameraEntityId).toBeNull();
  });

  it('routes combat state through runtime, applies damage with cooldowns, and restores authored combat state on idle', () => {
    const floor = makeFloorEntity();
    const player = makeCombatPlayerEntity();
    const weapon = makeCombatWeaponEntity(player.id);
    const enemy = makeCombatEnemyEntity();
    const scene = makeScene(floor);
    scene.entities = [floor, player, weapon, enemy];
    scene.rootEntities = [floor.id, player.id, enemy.id];

    useEngineStore.setState({
      scenes: [scene],
      activeSceneId: 'scene-1',
      entities: new Map([
        [floor.id, floor],
        [player.id, player],
        [weapon.id, weapon],
        [enemy.id, enemy],
      ]),
      playRuntimeState: 'PLAYING',
      editor: {
        ...useEngineStore.getState().editor,
        viewportCameraEntityId: null,
      },
    });

    const runtime = new ScriptRuntime();

    for (let i = 0; i < 180; i += 1) {
      runtime.update(1 / 60);
    }

    const attackComponents = new Map(useEngineStore.getState().entities.get(player.id)!.components);
    attackComponents.set('PlayerController', {
      ...useEngineStore.getState().entities.get(player.id)!.components.get('PlayerController')!,
      data: {
        ...(useEngineStore.getState().entities.get(player.id)!.components.get('PlayerController')!
          .data as Record<string, unknown>),
        attackRequested: true,
      },
    });
    useEngineStore.getState().updateEntityTransient(player.id, { components: attackComponents });
    runtime.update(1 / 60);

    const damagedEnemy = useEngineStore.getState().entities.get(enemy.id);
    const damagedEnemyHealth = damagedEnemy?.components.get('Health')?.data as Record<string, unknown>;
    const updatedPlayer = useEngineStore.getState().entities.get(player.id);
    const updatedController = updatedPlayer?.components.get('PlayerController')?.data as Record<string, unknown>;
    const updatedWeapon = useEngineStore.getState().entities.get(weapon.id);
    const weaponData = updatedWeapon?.components.get('Weapon')?.data as Record<string, unknown>;
    const weaponRuntime = (weaponData.runtime as Record<string, unknown> | undefined) ?? {};

    expect((damagedEnemyHealth.currentHealth as number) ?? 0).toBeLessThan(80);
    expect(damagedEnemyHealth.lastDamageSourceEntityId).toBe(player.id);
    expect(damagedEnemyHealth.lastAttackType).toBe('light');
    expect(updatedController.attackRequested).toBe(false);
    expect((weaponRuntime.totalAttacks as number) ?? 0).toBe(1);
    expect((weaponRuntime.totalHits as number) ?? 0).toBe(1);
    expect(weaponRuntime.lastAttackType).toBe('light');
    expect(weaponRuntime.lastTargetEntityId).toBe(enemy.id);
    expect(((weaponRuntime.cooldownRemaining as number) ?? 0)).toBeGreaterThan(0.6);

    const cooldownAttackComponents = new Map(useEngineStore.getState().entities.get(player.id)!.components);
    cooldownAttackComponents.set('PlayerController', {
      ...useEngineStore.getState().entities.get(player.id)!.components.get('PlayerController')!,
      data: {
        ...(useEngineStore.getState().entities.get(player.id)!.components.get('PlayerController')!
          .data as Record<string, unknown>),
        attackRequested: true,
      },
    });
    useEngineStore.getState().updateEntityTransient(player.id, { components: cooldownAttackComponents });
    runtime.update(0.1);

    const cooledEnemy = useEngineStore.getState().entities.get(enemy.id);
    const cooledEnemyHealth = cooledEnemy?.components.get('Health')?.data as Record<string, unknown>;
    const cooledWeapon = useEngineStore.getState().entities.get(weapon.id);
    const cooledWeaponRuntime =
      ((cooledWeapon?.components.get('Weapon')?.data as Record<string, unknown>).runtime as
        | Record<string, unknown>
        | undefined) ?? {};

    expect((cooledEnemyHealth.currentHealth as number) ?? 0).toBe((damagedEnemyHealth.currentHealth as number) ?? 0);
    expect((cooledWeaponRuntime.totalAttacks as number) ?? 0).toBe(1);

    for (let i = 0; i < 80; i += 1) {
      runtime.update(1 / 60);
    }

    const secondAttackComponents = new Map(useEngineStore.getState().entities.get(player.id)!.components);
    secondAttackComponents.set('PlayerController', {
      ...useEngineStore.getState().entities.get(player.id)!.components.get('PlayerController')!,
      data: {
        ...(useEngineStore.getState().entities.get(player.id)!.components.get('PlayerController')!
          .data as Record<string, unknown>),
        attackRequested: true,
      },
    });
    useEngineStore.getState().updateEntityTransient(player.id, { components: secondAttackComponents });
    runtime.update(1 / 60);

    const twiceDamagedEnemy = useEngineStore.getState().entities.get(enemy.id);
    const twiceDamagedHealth = twiceDamagedEnemy?.components.get('Health')?.data as Record<string, unknown>;
    const twiceUpdatedWeapon = useEngineStore.getState().entities.get(weapon.id);
    const twiceWeaponRuntime =
      ((twiceUpdatedWeapon?.components.get('Weapon')?.data as Record<string, unknown>).runtime as
        | Record<string, unknown>
        | undefined) ?? {};

    expect((twiceDamagedHealth.currentHealth as number) ?? 0).toBeLessThan(
      (cooledEnemyHealth.currentHealth as number) ?? 0
    );
    expect((twiceWeaponRuntime.totalAttacks as number) ?? 0).toBe(2);

    useEngineStore.setState({ playRuntimeState: 'IDLE' });
    runtime.update(0);

    const restoredEnemy = useEngineStore.getState().entities.get(enemy.id);
    const restoredEnemyHealth = restoredEnemy?.components.get('Health')?.data as Record<string, unknown>;
    const restoredWeapon = useEngineStore.getState().entities.get(weapon.id);
    const restoredWeaponData = restoredWeapon?.components.get('Weapon')?.data as Record<string, unknown>;

    expect(restoredEnemyHealth.currentHealth).toBe(80);
    expect(restoredEnemyHealth.lastDamageAmount).toBeUndefined();
    expect(restoredWeaponData.runtime).toBeUndefined();
    expect(useEngineStore.getState().editor.viewportCameraEntityId).toBeNull();
  });

  it('plays animator timelines through the runtime bridge and restores authored state on idle', () => {
    const entity = makeAnimatorEntity();

    useEngineStore.setState({
      scenes: [makeScene(entity)],
      activeSceneId: 'scene-1',
      entities: new Map([[entity.id, entity]]),
      playRuntimeState: 'PLAYING',
    });

    const runtime = new ScriptRuntime();
    runtime.update(0.6);

    const animated = useEngineStore.getState().entities.get(entity.id);
    const animatedTransform = animated?.components.get('Transform')?.data as {
      position?: { z?: number };
    };
    const animatedAnimator = animated?.components.get('Animator')?.data as {
      currentAnimation?: string | null;
      runtime?: { activeClipNames?: string[] };
    };

    expect((animatedTransform.position?.z ?? 0)).toBeGreaterThan(0.4);
    expect(animatedAnimator.currentAnimation).toBe('Walk Cycle');
    expect(animatedAnimator.runtime?.activeClipNames).toEqual(['Walk Cycle']);

    useEngineStore.setState({ playRuntimeState: 'IDLE' });
    runtime.update(0);

    const restored = useEngineStore.getState().entities.get(entity.id);
    const restoredTransform = restored?.components.get('Transform')?.data as {
      position?: { x?: number; y?: number; z?: number };
    };
    const restoredAnimator = restored?.components.get('Animator')?.data as {
      runtime?: unknown;
    };

    expect(restoredTransform.position).toEqual({ x: 0, y: 1, z: 0 });
    expect(restoredAnimator.runtime).toBeUndefined();
  });
});
