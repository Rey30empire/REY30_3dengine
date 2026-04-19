import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Asset, Entity, Scene } from '@/types/engine';
import type { EditorProjectSaveState } from '@/engine/serialization';
import {
  createDefaultAnimatorEditorState,
  createLibraryClip,
  serializeAnimatorEditorState,
} from '@/engine/editor/animationEditorState';
import { createMirrorModifier } from '@/engine/editor/meshModifiers';
import { createPlaneMesh } from '@/engine/editor/modelerMesh';
import { createTerrainDataFromPreset } from '@/engine/scene/terrainAuthoring';
import {
  createEditorProjectSaveData,
  createLoadedEditorProjectPatch,
  getEditorProjectSaveSummary,
  loadEditorProjectFromSlot,
  restoreEditorProjectSaveData,
  saveEditorProjectToSlot,
} from '@/engine/serialization';
import { saveSystem } from '@/engine/serialization/SaveSystem';
import type { ScribInstance } from '@/engine/scrib';
import type { ScribProfile } from '@/engine/reyplay/types';
import { createDefaultAutomationPermissions, createDefaultEditorState } from '@/store/editorStore.utils';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.has(key) ? this.values.get(key) ?? null : null;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

function createTestState(): EditorProjectSaveState {
  const entityId = 'entity-hero';
  const childId = 'entity-sword';
  const sceneId = 'scene-hangar';
  const assetId = 'asset-mesh-1';

  const child: Entity = {
    id: childId,
    name: 'Sword',
    components: new Map([
      [
        'Transform',
        {
          id: 'transform-child',
          type: 'Transform',
          enabled: true,
          data: {
            position: { x: 0.5, y: 1.1, z: 0 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            scale: { x: 1, y: 1, z: 1 },
          },
        },
      ],
      [
        'Weapon',
        {
          id: 'weapon-child',
          type: 'Weapon',
          enabled: true,
          data: {
            damage: 28,
            attackSpeed: 1.6,
            range: 2.4,
            heavyDamage: 46,
            heavyAttackSpeed: 0.8,
            heavyRange: 2.8,
            targetTeam: 'enemy',
          },
        },
      ],
    ]),
    children: [],
    parentId: entityId,
    active: true,
    tags: ['weapon'],
  };

  const hero: Entity = {
    id: entityId,
    name: 'Hero',
    components: new Map([
      [
        'Transform',
        {
          id: 'transform-hero',
          type: 'Transform',
          enabled: true,
          data: {
            position: { x: 2, y: 0, z: -4 },
            rotation: { x: 0, y: 0.25, z: 0, w: 0.97 },
            scale: { x: 1, y: 1, z: 1 },
          },
        },
      ],
      [
        'Script',
        {
          id: 'script-hero',
          type: 'Script',
          enabled: true,
          data: {
            scriptId: 'scribs/hero.ts',
            parameters: { speed: 7 },
          },
        },
      ],
      [
        'MeshRenderer',
        {
          id: 'mesh-hero',
          type: 'MeshRenderer',
          enabled: true,
          data: {
            meshId: 'asset-mesh-1',
            materialId: 'hero_paint',
            castShadows: true,
            receiveShadows: true,
            material: {
              id: 'hero_paint',
              name: 'Hero Paint',
              textureMaps: {
                albedo: {
                  assetPath: 'download/assets/texture/paint/star_forge/entity-hero__albedo.png',
                  enabled: true,
                },
              },
            },
          },
        },
      ],
      [
        'Health',
        {
          id: 'health-hero',
          type: 'Health',
          enabled: true,
          data: {
            maxHealth: 120,
            currentHealth: 95,
            attack: 14,
            defense: 6,
            speed: 1.2,
            team: 'player',
          },
        },
      ],
      [
        'AudioSource',
        {
          id: 'audio-hero',
          type: 'AudioSource',
          enabled: true,
          data: {
            clipId: 'audio-theme',
            clip: 'download/assets/audio/hero_theme.ogg',
            volume: 0.8,
            pitch: 1.05,
            loop: true,
            playOnStart: true,
            spatialBlend: 1,
            mixerGroup: 'music',
            minDistance: 2,
            maxDistance: 40,
            rolloffFactor: 0.5,
          },
        },
      ],
    ]),
    children: [child],
    parentId: null,
    active: true,
    tags: ['player'],
  };

  const scene: Scene = {
    id: sceneId,
    name: 'Hangar',
    entities: [hero, child],
    rootEntities: [entityId],
    collections: [
      {
        id: 'collection-master',
        name: 'Master',
        color: '#4da3ff',
        visible: true,
        entityIds: [entityId, childId],
      },
    ],
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
    createdAt: new Date('2026-04-01T12:00:00.000Z'),
    updatedAt: new Date('2026-04-02T09:30:00.000Z'),
  };

  const asset: Asset = {
    id: assetId,
    name: 'hero.glb',
    type: 'mesh',
    path: 'download/assets/mesh/uploads/star_forge/hero.glb',
    size: 2048,
    createdAt: new Date('2026-04-02T08:00:00.000Z'),
    metadata: {
      uploaded: true,
      scope: 'project',
    },
  };

  const paintedTexture: Asset = {
    id: 'asset-paint-1',
    name: 'Hero_Albedo',
    type: 'texture',
    path: 'download/assets/texture/paint/star_forge/entity-hero__albedo.png',
    size: 1024,
    createdAt: new Date('2026-04-02T08:02:00.000Z'),
    metadata: {
      texturePaint: true,
      entityId: 'entity-hero',
      slot: 'albedo',
      projectKey: 'star_forge',
    },
  };

  const scribProfile: ScribProfile = {
    entityId,
    targetType: 'player',
    mode: 'manual',
    prompt: 'Hero controller',
    status: 'ready',
    createdAt: '2026-04-02T08:05:00.000Z',
    updatedAt: '2026-04-02T08:10:00.000Z',
  };

  const scribInstance: ScribInstance = {
    id: 'scrib-instance-1',
    type: 'movement',
    kind: 'atomic',
    target: { scope: 'entity', id: entityId },
    config: { speed: 7 },
    code: 'export const speed = 7;',
    requires: [],
    optional: [],
    provides: ['movement'],
    enabled: true,
    origin: 'manual',
    createdAt: '2026-04-02T08:06:00.000Z',
    updatedAt: '2026-04-02T08:11:00.000Z',
  };

  return {
    projectName: 'Star Forge',
    projectPath: 'C:/Projects/StarForge',
    isDirty: true,
    scenes: [scene],
    activeSceneId: sceneId,
    entities: new Map([
      [entityId, hero],
      [childId, child],
    ]),
    assets: [asset, paintedTexture],
    engineMode: 'MODE_HYBRID',
    aiMode: 'LOCAL',
    aiEnabled: true,
    editor: {
      ...createDefaultEditorState(),
      selectedEntities: [entityId],
      selectedAsset: assetId,
      tool: 'move',
    },
    automationPermissions: createDefaultAutomationPermissions(),
    profiler: {
      fps: 58,
      frameTime: 17.1,
      cpuTime: 5.1,
      gpuTime: 4.2,
      memory: {
        used: 128,
        allocated: 256,
        textures: 12,
        meshes: 6,
        audio: 1,
      },
      drawCalls: 45,
      triangles: 1200,
      vertices: 2400,
    },
    scribProfiles: new Map([[entityId, scribProfile]]),
    activeScribEntityId: entityId,
    scribInstances: new Map([[scribInstance.id, scribInstance]]),
  };
}

beforeEach(() => {
  const storage = new MemoryStorage();
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', { localStorage: storage });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('editor project save', () => {
  it('round-trips a full editor project save through local storage', () => {
    const state = createTestState();

    const saved = saveEditorProjectToSlot('slot-a', state, { markClean: true });
    expect(saved).toBe(true);

    const summary = getEditorProjectSaveSummary('slot-a');
    expect(summary).toMatchObject({
      slot: 'slot-a',
      projectName: 'Star Forge',
      sceneCount: 1,
      entityCount: 2,
      assetCount: 2,
      scribProfileCount: 1,
      scribInstanceCount: 1,
    });

    const restored = loadEditorProjectFromSlot('slot-a');
    expect(restored).not.toBeNull();
    expect(restored?.isDirty).toBe(false);
    expect(restored?.projectName).toBe('Star Forge');
    expect(restored?.scenes).toHaveLength(1);
    expect(restored?.assets[0]?.path).toBe('download/assets/mesh/uploads/star_forge/hero.glb');
    expect(restored?.assets[1]?.metadata).toMatchObject({
      texturePaint: true,
      entityId: 'entity-hero',
      slot: 'albedo',
    });
    expect(restored?.editor.selectedEntities).toEqual(['entity-hero']);
    const restoredMaterial = restored?.entities.get('entity-hero')?.components.get('MeshRenderer')?.data as
      | Record<string, unknown>
      | undefined;
    expect(
      ((restoredMaterial?.material as Record<string, unknown> | undefined)?.textureMaps as
        | Record<string, { assetPath?: string }>
        | undefined)?.albedo?.assetPath
    ).toBe('download/assets/texture/paint/star_forge/entity-hero__albedo.png');
    const restoredAudio = restored?.entities.get('entity-hero')?.components.get('AudioSource')?.data as
      | Record<string, unknown>
      | undefined;
    expect(restoredAudio).toMatchObject({
      clipId: 'audio-theme',
      clip: 'download/assets/audio/hero_theme.ogg',
      volume: 0.8,
      loop: true,
      playOnStart: true,
      mixerGroup: 'music',
    });
    expect(restored?.scribProfiles.get('entity-hero')).toMatchObject({
      targetType: 'player',
      prompt: 'Hero controller',
    });
    expect(restored?.scribInstances.get('scrib-instance-1')).toMatchObject({
      target: { scope: 'entity', id: 'entity-hero' },
      type: 'movement',
    });

    const patch = createLoadedEditorProjectPatch(restored!);
    expect(patch.playRuntimeState).toBe('IDLE');
    expect(patch.lastBuildReport).toBeNull();
    expect(patch.buildManifest).toBeNull();
    expect(patch.lastCompileSummary).toBe('');
  });

  it('round-trips health and weapon combat configuration through the project save', () => {
    const state = createTestState();

    expect(saveEditorProjectToSlot('slot-combat', state, { markClean: true })).toBe(true);

    const restored = loadEditorProjectFromSlot('slot-combat');
    const restoredHealth = restored?.entities.get('entity-hero')?.components.get('Health')?.data as
      | Record<string, unknown>
      | undefined;
    const restoredWeapon = restored?.entities.get('entity-sword')?.components.get('Weapon')?.data as
      | Record<string, unknown>
      | undefined;

    expect(restoredHealth).toMatchObject({
      maxHealth: 120,
      currentHealth: 95,
      attack: 14,
      defense: 6,
      speed: 1.2,
      team: 'player',
    });
    expect(restoredWeapon).toMatchObject({
      damage: 28,
      attackSpeed: 1.6,
      range: 2.4,
      heavyDamage: 46,
      heavyAttackSpeed: 0.8,
      heavyRange: 2.8,
      targetTeam: 'enemy',
    });
  });

  it('exports and imports an editor project save without losing the snapshot', () => {
    const state = createTestState();
    expect(saveEditorProjectToSlot('slot-export', state)).toBe(true);

    const payload = saveSystem.exportSave('slot-export');
    expect(payload).toContain('"kind":"editor_project"');

    expect(saveSystem.importSave('slot-import', payload!)).toBe(true);
    const restored = loadEditorProjectFromSlot('slot-import');
    expect(restored?.projectPath).toBe('C:/Projects/StarForge');
    expect(restored?.entities.size).toBe(2);
    expect(restored?.activeScribEntityId).toBe('entity-hero');
  });

  it('filters invalid scrib references during restore hardening', () => {
    const state = createTestState();
    const saveData = createEditorProjectSaveData(state);

    const custom = saveData.custom as Record<string, unknown>;
    const snapshot = custom.snapshot as Record<string, unknown>;
    snapshot.activeScribEntityId = 'missing-entity';
    snapshot.scribProfiles = [
      ...(snapshot.scribProfiles as ScribProfile[]),
      {
        entityId: 'missing-entity',
        targetType: 'player',
        mode: 'manual',
        prompt: 'invalid',
        status: 'draft',
        createdAt: '2026-04-02T10:00:00.000Z',
        updatedAt: '2026-04-02T10:00:00.000Z',
      },
    ];
    snapshot.scribInstances = [
      ...(snapshot.scribInstances as ScribInstance[]),
      {
        id: 'invalid-scrib',
        type: 'movement',
        kind: 'atomic',
        target: { scope: 'entity', id: 'missing-entity' },
        config: {},
        code: '',
        requires: [],
        optional: [],
        provides: ['movement'],
        enabled: true,
        origin: 'manual',
        createdAt: '2026-04-02T10:00:00.000Z',
        updatedAt: '2026-04-02T10:00:00.000Z',
      },
    ];

    const restored = restoreEditorProjectSaveData(saveData);
    expect(restored).not.toBeNull();
    expect(restored?.scribProfiles.size).toBe(1);
    expect(restored?.scribInstances.size).toBe(1);
    expect(restored?.activeScribEntityId).toBeNull();
  });

  it('round-trips modeler manual meshes and modifier stacks through the project save', () => {
    const state = createTestState();
    const hero = state.entities.get('entity-hero');
    const meshRenderer = hero?.components.get('MeshRenderer');
    expect(meshRenderer).toBeTruthy();
    if (meshRenderer) {
      meshRenderer.data = {
        ...meshRenderer.data,
        meshId: 'custom',
        manualMesh: createPlaneMesh(),
        modifiers: [createMirrorModifier()],
      };
    }

    expect(saveEditorProjectToSlot('slot-modeler', state, { markClean: true })).toBe(true);

    const restored = loadEditorProjectFromSlot('slot-modeler');
    const restoredMeshRenderer = restored?.entities.get('entity-hero')?.components.get('MeshRenderer')
      ?.data as Record<string, unknown> | undefined;

    expect(restoredMeshRenderer?.meshId).toBe('custom');
    expect(
      (restoredMeshRenderer?.manualMesh as { vertices?: unknown[]; faces?: unknown[] })?.vertices
    ).toHaveLength(4);
    expect(
      (restoredMeshRenderer?.manualMesh as { vertices?: unknown[]; faces?: unknown[] })?.faces
    ).toHaveLength(2);
    expect(restoredMeshRenderer?.modifiers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'mirror_x',
          enabled: true,
        }),
      ])
    );
  });

  it('round-trips terrain authoring data through the project save', () => {
    const state = createTestState();
    const terrainId = 'entity-terrain';
    const terrainEntity: Entity = {
      id: terrainId,
      name: 'Playable Terrain',
      parentId: null,
      children: [],
      active: true,
      tags: ['terrain'],
      components: new Map([
        [
          'Transform',
          {
            id: 'transform-terrain',
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
          'Terrain',
          {
            id: 'terrain-main',
            type: 'Terrain',
            enabled: true,
            data: createTerrainDataFromPreset('island', {
              width: 96,
              depth: 96,
              height: 28,
              segments: 33,
              seed: 4242,
            }) as unknown as Record<string, unknown>,
          },
        ],
      ]),
    };

    state.entities.set(terrainId, terrainEntity);
    state.scenes[0] = {
      ...state.scenes[0],
      entities: [...state.scenes[0].entities, terrainEntity],
      rootEntities: [...state.scenes[0].rootEntities, terrainId],
      collections: state.scenes[0].collections?.map((collection) => ({
        ...collection,
        entityIds: [...collection.entityIds, terrainId],
      })),
    };

    expect(saveEditorProjectToSlot('slot-terrain', state, { markClean: true })).toBe(true);

    const restored = loadEditorProjectFromSlot('slot-terrain');
    const restoredTerrain = restored?.entities.get(terrainId)?.components.get('Terrain')
      ?.data as Record<string, unknown> | undefined;

    expect(restoredTerrain?.preset).toBe('island');
    expect(restoredTerrain?.width).toBe(96);
    expect(restoredTerrain?.depth).toBe(96);
    expect(restoredTerrain?.segments).toBe(33);
    expect(restoredTerrain?.seed).toBe(4242);
    expect((restoredTerrain?.heightmap as number[] | undefined)?.length).toBe(33 * 33);
    expect(restoredTerrain?.layers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: expect.any(String),
          textureId: expect.any(String),
        }),
      ])
    );
  });

  it('round-trips generated character package assets through the project save', () => {
    const state = createTestState();
    state.assets.push({
      id: 'asset-character-package-1',
      name: 'hero_character.package.json',
      type: 'prefab',
      path: 'download/assets/generated-characters/star_forge/job_123/package.json',
      size: 4096,
      createdAt: new Date('2026-04-03T00:00:00.000Z'),
      metadata: {
        projectKey: 'star_forge',
        scope: 'project',
        characterPackage: true,
        characterJobId: 'job_123',
        source: 'ai_level3_full_character',
        generatedBy: 'character-full-route',
      },
    });

    const saveData = createEditorProjectSaveData(state, { markClean: true });
    const restored = restoreEditorProjectSaveData(saveData);
    expect(restored).not.toBeNull();
    const restoredAsset = restored!.assets.find((asset) => asset.id === 'asset-character-package-1');

    expect(restoredAsset).toEqual(
      expect.objectContaining({
        id: 'asset-character-package-1',
        type: 'prefab',
        path: 'download/assets/generated-characters/star_forge/job_123/package.json',
        metadata: expect.objectContaining({
          characterPackage: true,
          characterJobId: 'job_123',
          source: 'ai_level3_full_character',
        }),
      })
    );
  });

  it('round-trips animator clips, rig and NLA through the project save', () => {
    const state = createTestState();
    const hero = state.entities.get('entity-hero');
    const base = createDefaultAnimatorEditorState('Hero');
    const walkClip = createLibraryClip('Walk Cycle');

    hero?.components.set('Animator', {
      id: 'animator-hero',
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
    });

    expect(saveEditorProjectToSlot('slot-animator', state, { markClean: true })).toBe(true);

    const restored = loadEditorProjectFromSlot('slot-animator');
    const restoredAnimator = restored?.entities.get('entity-hero')?.components.get('Animator')
      ?.data as Record<string, unknown> | undefined;
    const restoredEditor = restoredAnimator?.editor as
      | { clips?: Array<{ name?: string }>; bones?: unknown[]; nlaStrips?: Array<{ name?: string }> }
      | undefined;

    expect(restoredAnimator?.currentAnimation).toBe('Walk Cycle');
    expect(restoredEditor?.clips?.map((clip) => clip.name)).toEqual(
      expect.arrayContaining(['Hero_Idle', 'Walk Cycle'])
    );
    expect(restoredEditor?.bones?.length).toBeGreaterThanOrEqual(4);
    expect(restoredEditor?.nlaStrips?.map((strip) => strip.name)).toEqual(['Walk Main']);
  });
});
