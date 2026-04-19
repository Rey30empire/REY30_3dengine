import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { strFromU8, unzipSync } from 'fflate';
import {
  createDefaultAnimatorEditorState,
  createLibraryClip,
  serializeAnimatorEditorState,
} from '@/engine/editor/animationEditorState';
import { createMirrorModifier } from '@/engine/editor/meshModifiers';
import { createPlaneMesh } from '@/engine/editor/modelerMesh';
import {
  buildProject,
  buildProjectFromState,
} from '@/engine/reyplay/build/buildPipeline';
import { makeStarterCamera, makeStarterPlayer, makeStarterTerrain } from '@/engine/reyplay/studio/Templates';
import { useEngineStore } from '@/store/editorStore';

type StoreSnapshot = ReturnType<typeof snapshotStore>;

const WINDOWS_PACKAGING_TIMEOUT_MS = 20_000;
const TEMP_ROOT_REMOVE_RETRY_ATTEMPTS = 10;
const TEMP_ROOT_REMOVE_RETRY_DELAY_MS = 150;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetriableRemoveError(error: unknown) {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === 'ENOTEMPTY' || code === 'EBUSY' || code === 'EPERM';
}

async function removeDirWithRetries(dir: string) {
  for (let attempt = 0; attempt < TEMP_ROOT_REMOVE_RETRY_ATTEMPTS; attempt += 1) {
    try {
      await rm(dir, { recursive: true, force: true });
      return;
    } catch (error) {
      const shouldRetry =
        attempt < TEMP_ROOT_REMOVE_RETRY_ATTEMPTS - 1 && isRetriableRemoveError(error);
      if (!shouldRetry) {
        throw error;
      }
      await wait(TEMP_ROOT_REMOVE_RETRY_DELAY_MS * (attempt + 1));
    }
  }
}

function buildCharacterPackageFixture() {
  return {
    mesh: {
      vertices: [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 0, y: 1, z: 0 },
      ],
      faces: [[0, 1, 2]],
      uvs: [
        { u: 0, v: 0 },
        { u: 1, v: 0 },
        { u: 0, v: 1 },
      ],
      metadata: {
        prompt: 'build test hero',
        style: 'realista',
        targetEngine: 'generic',
      },
    },
    rig: {
      bones: [{ name: 'Hips', parent: null, position: { x: 0, y: 0, z: 0 } }],
      notes: 'Humanoid rig listo para integración.',
    },
    blendshapes: [],
    textures: [{ type: 'albedo', path: 'textures/albedo.png', resolution: '2K' }],
    materials: [
      {
        id: 'hero_body',
        label: 'Hero Body',
        domain: 'body',
        shader: 'pbr_metal_rough',
        doubleSided: false,
        properties: { roughness: 0.4, metallic: 0.2 },
        textureSlots: { albedo: 'textures/albedo.png' },
      },
    ],
    animations: [{ name: 'Idle', duration: 1, loop: true }],
    metadata: {
      prompt: 'build test hero',
      style: 'realista',
      targetEngine: 'generic',
      generatedAt: '2026-04-03T00:00:00.000Z',
    },
  };
}

async function attachCharacterPackageAsset(root: string) {
  const dir = path.join(root, 'character-package');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'package.json'), JSON.stringify(buildCharacterPackageFixture(), null, 2), 'utf-8');
  return path.relative(process.cwd(), path.join(dir, 'package.json')).replace(/\\/g, '/');
}

function snapshotStore() {
  const state = useEngineStore.getState();
  return {
    projectName: state.projectName,
    isDirty: state.isDirty,
    scenes: structuredClone(state.scenes),
    activeSceneId: state.activeSceneId,
    entities: structuredClone(state.entities),
    assets: structuredClone(state.assets),
    historyPast: structuredClone(state.historyPast),
    historyFuture: structuredClone(state.historyFuture),
    lastBuildReport: structuredClone(state.lastBuildReport),
    buildManifest: structuredClone(state.buildManifest),
    lastCompileSummary: state.lastCompileSummary,
    scribProfiles: structuredClone(state.scribProfiles),
    activeScribEntityId: state.activeScribEntityId,
    scribInstances: structuredClone(state.scribInstances),
  };
}

function restoreStore(snapshot: StoreSnapshot) {
  useEngineStore.setState({
    projectName: snapshot.projectName,
    isDirty: snapshot.isDirty,
    scenes: snapshot.scenes,
    activeSceneId: snapshot.activeSceneId,
    entities: snapshot.entities,
    assets: snapshot.assets,
    historyPast: snapshot.historyPast,
    historyFuture: snapshot.historyFuture,
    lastBuildReport: snapshot.lastBuildReport,
    buildManifest: snapshot.buildManifest,
    lastCompileSummary: snapshot.lastCompileSummary,
    scribProfiles: snapshot.scribProfiles,
    activeScribEntityId: snapshot.activeScribEntityId,
    scribInstances: snapshot.scribInstances,
  });
}

function seedBuildableProject() {
  useEngineStore.setState({
    projectName: 'Build Test Project',
    isDirty: false,
    scenes: [],
    activeSceneId: null,
    entities: new Map(),
    assets: [],
    historyPast: [],
    historyFuture: [],
    lastBuildReport: null,
    buildManifest: null,
    lastCompileSummary: '',
    scribProfiles: new Map(),
    activeScribEntityId: null,
    scribInstances: new Map(),
  });

  const store = useEngineStore.getState();
  store.addAsset({
    id: 'mesh-placeholder',
    name: 'mesh-placeholder',
    type: 'mesh',
    path: 'download/assets/mesh/mesh-placeholder.json',
    size: 1,
    createdAt: new Date(),
    metadata: {},
  });
  store.addAsset({
    id: 'material-player',
    name: 'material-player',
    type: 'material',
    path: 'download/assets/materials/material-player.json',
    size: 1,
    createdAt: new Date(),
    metadata: {},
  });
  store.addAsset({
    id: 'texture-player-albedo',
    name: 'player-albedo.png',
    type: 'texture',
    path: 'download/assets/texture/player-albedo.png',
    size: 1,
    createdAt: new Date(),
    metadata: {
      texturePaint: true,
      entityId: 'player',
      slot: 'albedo',
    },
  });
  store.addAsset({
    id: 'texture-player-normal',
    name: 'player-normal.png',
    type: 'texture',
    path: 'download/assets/texture/player-normal.png',
    size: 1,
    createdAt: new Date(),
    metadata: {},
  });

  store.createScene('Build Scene');
  store.addEntity(makeStarterTerrain('Terrain'));
  const player = makeStarterPlayer('Player');
  player.components.set('PlayerController', {
    id: 'player-controller',
    type: 'PlayerController',
    enabled: true,
    data: {
      speed: 4.5,
      runSpeed: 7,
      jumpForce: 10,
      sensitivity: 1.5,
    },
  });
  const playerHealth = player.components.get('Health');
  if (playerHealth) {
    playerHealth.data = {
      ...playerHealth.data,
      maxHealth: 110,
      currentHealth: 110,
      attack: 18,
      defense: 4,
      speed: 1.2,
      team: 'player',
    };
  }
  const animatorBase = createDefaultAnimatorEditorState('Player');
  const walkClip = createLibraryClip('Walk Cycle');
  const meshRenderer = player.components.get('MeshRenderer');
  if (meshRenderer) {
    meshRenderer.data = {
      ...meshRenderer.data,
      materialId: 'metal',
      material: {
        id: 'player_alloy',
        name: 'Player Alloy',
        metallic: 0.92,
        roughness: 0.18,
        textureMaps: {
          albedo: {
            assetPath: 'download/assets/texture/player-albedo.png',
            enabled: true,
          },
          normal: {
            assetPath: 'download/assets/texture/player-normal.png',
            enabled: true,
          },
        },
      },
    };
  }
  player.components.set('Animator', {
    id: 'animator-player',
    type: 'Animator',
    enabled: true,
    data: serializeAnimatorEditorState(
      {
        controllerId: null,
        currentAnimation: walkClip.name,
        parameters: { locomotion: 'walk' },
      },
      {
        ...animatorBase,
        activeClipId: walkClip.id,
        clips: [animatorBase.clips[0], walkClip],
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
  store.addEntity(player);
  store.addEntity({
    id: 'entity-player-weapon',
    name: 'Player Sword',
    parentId: player.id,
    children: [],
    active: true,
    tags: ['weapon'],
    components: new Map([
      [
        'Transform',
        {
          id: 'transform-player-weapon',
          type: 'Transform',
          enabled: true,
          data: {
            position: { x: 0.4, y: 1.1, z: 0.15 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            scale: { x: 1, y: 1, z: 1 },
          },
        },
      ],
      [
        'Weapon',
        {
          id: 'weapon-player',
          type: 'Weapon',
          enabled: true,
          data: {
            category: 'melee',
            damage: 18,
            attackSpeed: 1.5,
            range: 2.1,
            heavyDamage: 30,
            heavyAttackSpeed: 0.85,
            heavyRange: 2.5,
            targetTeam: 'enemy',
            autoAcquireTarget: true,
          },
        },
      ],
    ]),
  });
  store.addEntity({
    id: 'entity-kitbash',
    name: 'Kitbash Panel',
    parentId: null,
    children: [],
    active: true,
    tags: ['prop', 'editable'],
    components: new Map([
      [
        'Transform',
        {
          id: 'transform-kitbash',
          type: 'Transform',
          enabled: true,
          data: {
            position: { x: 2.5, y: 1, z: 0 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            scale: { x: 1, y: 1, z: 1 },
          },
        },
      ],
      [
        'MeshRenderer',
        {
          id: 'mesh-kitbash',
          type: 'MeshRenderer',
          enabled: true,
          data: {
            meshId: 'custom',
            materialId: 'kitbash_panel',
            castShadows: true,
            receiveShadows: true,
            manualMesh: createPlaneMesh(),
            modifiers: [createMirrorModifier()],
          },
        },
      ],
    ]),
  });
  store.addEntity(makeStarterCamera('Camera'));
}

function readZipEntries(buffer: Buffer) {
  const archive = unzipSync(new Uint8Array(buffer));
  return Object.fromEntries(
    Object.entries(archive).map(([key, value]) => [key, strFromU8(value)])
  );
}

describe('reyplay build pipeline', () => {
  let snapshot: StoreSnapshot;
  let tempRoot: string;
  let previousBuildRoot: string | undefined;

  beforeEach(async () => {
    snapshot = snapshotStore();
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'reyplay-build-'));
    previousBuildRoot = process.env.REY30_BUILD_ROOT;
    process.env.REY30_BUILD_ROOT = tempRoot;
  });

  afterEach(async () => {
    restoreStore(snapshot);
    if (previousBuildRoot === undefined) {
      delete process.env.REY30_BUILD_ROOT;
    } else {
      process.env.REY30_BUILD_ROOT = previousBuildRoot;
    }
    await removeDirWithRetries(tempRoot);
  });

  it('packages a real web bundle with manifest and offline launcher html', async () => {
    seedBuildableProject();
    const characterPackagePath = await attachCharacterPackageAsset(tempRoot);
    useEngineStore.getState().addAsset({
      id: 'character-package-build-test-project',
      name: 'build-test-project-hero.package.json',
      type: 'prefab',
      path: characterPackagePath,
      size: 2048,
      createdAt: new Date('2026-04-03T00:00:00.000Z'),
      metadata: {
        characterPackage: true,
        source: 'ai_level3_full_character',
        generatedBy: 'character-full-route',
      },
    });

    const result = await buildProject('web');

    expect(result.ok).toBe(true);
    expect(result.missingDeps).toEqual([]);
    const bundle = result.artifacts.find((artifact) => artifact.kind === 'bundle');
    const packageManifest = result.artifacts.find((artifact) =>
      artifact.path.endsWith('package-manifest.json')
    );
    expect(bundle).toBeTruthy();
    expect(packageManifest).toBeTruthy();

    const zipBuffer = await readFile(path.join(process.cwd(), bundle!.path));
    const entries = readZipEntries(zipBuffer);
    const packageManifestPayload = JSON.parse(
      await readFile(path.join(process.cwd(), packageManifest!.path), 'utf-8')
    ) as {
      schema: string;
      target: string;
      projectName: string;
      stageFiles: Array<{ path: string }>;
    };
    const manifestPayload = JSON.parse(entries['manifest.json']) as {
      projectName: string;
      scenes: Array<{ name: string; renderProfile: { summary: string; advancedLighting: { shadowQuality: string } } }>;
      assets: Array<{
        id: string;
        path: string;
        source?: string;
        entityId?: string | null;
        entityName?: string | null;
        meshSummary?: { vertexCount: number; faceCount: number; modifierCount: number } | null;
        terrainSummary?: { width: number; depth: number; segments: number; layerCount: number } | null;
        characterSummary?: { materialCount: number; animationCount: number } | null;
      }>;
      materials: Array<{
        entityName: string;
        materialId: string;
        summary: string;
        textureReferences: Array<{
          assetPath: string;
          assetId: string | null;
          texturePaint: boolean;
        }>;
      }>;
      compileMeta: {
        assetCount: number;
        materialCount: number;
        textureReferenceCount: number;
        paintedTextureCount: number;
        generatedModelerMeshCount: number;
        generatedTerrainCount: number;
        generatedAnimationCount: number;
        generatedCharacterCount: number;
        combatActorCount: number;
        combatWeaponCount: number;
      };
      combatActors: Array<{
        entityId: string;
        entityName: string;
        team: 'player' | 'enemy' | 'neutral';
        maxHealth: number;
        currentHealth: number;
        attack: number;
        defense: number;
        speed: number;
        hasWeapon: boolean;
        hasPlayerController: boolean;
      }>;
      combatWeapons: Array<{
        entityId: string;
        entityName: string;
        ownerEntityId: string | null;
        ownerEntityName: string | null;
        damage: number;
        attackSpeed: number;
        range: number;
        heavyDamage: number;
        autoAcquireTarget: boolean;
        targetTeam: 'opposing' | 'player' | 'enemy' | 'neutral';
      }>;
      generatedModelerMeshes: Array<{
        assetId: string;
        entityId: string;
        entityName: string;
        path: string;
        modifierCount: number;
        summary: { vertexCount: number; faceCount: number };
      }>;
      generatedTerrains: Array<{
        assetId: string;
        entityId: string;
        entityName: string;
        path: string;
        summary: { width: number; depth: number; segments: number; layerCount: number };
      }>;
      generatedAnimations: Array<{
        assetId: string;
        entityId: string;
        entityName: string;
        path: string;
        summary: { clipCount: number; trackCount: number; nlaStripCount: number; hasRootMotion: boolean };
      }>;
      generatedCharacters: Array<{
        assetId: string;
        assetPath: string;
        assetName: string;
        path: string;
        summary: { materialCount: number; animationCount: number };
      }>;
    };

    expect(Object.keys(entries)).toEqual(
      expect.arrayContaining([
        'index.html',
        'manifest.json',
        'build-report.json',
        'build-info.json',
        'assets-index.json',
        'materials-index.json',
        'characters-index.json',
        'combat-index.json',
        'terrains-index.json',
        'animations-index.json',
        'generated-modeler-Kitbash_Panel-entity-kitbash.json',
        'README.txt',
      ])
    );
    expect(entries['index.html']).toContain('ReyPlay Offline Build');
    expect(entries['manifest.json']).toContain('Build Test Project');
    expect(entries['build-report.json']).toContain('"ok": true');
    expect(manifestPayload.scenes[0]?.renderProfile.advancedLighting.shadowQuality).toBe('high');
    expect(manifestPayload.scenes[0]?.renderProfile.summary).toContain('tone aces');
    expect(manifestPayload.materials).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityName: 'Player',
          materialId: 'player_alloy',
          textureReferences: expect.arrayContaining([
            expect.objectContaining({
              assetPath: 'download/assets/texture/player-albedo.png',
              assetId: 'texture-player-albedo',
              texturePaint: true,
            }),
          ]),
        }),
      ])
    );
    expect(manifestPayload.compileMeta.materialCount).toBeGreaterThanOrEqual(1);
    expect(manifestPayload.compileMeta.textureReferenceCount).toBeGreaterThanOrEqual(2);
    expect(manifestPayload.compileMeta.paintedTextureCount).toBeGreaterThanOrEqual(1);
    expect(manifestPayload.compileMeta.generatedModelerMeshCount).toBeGreaterThanOrEqual(1);
    expect(manifestPayload.compileMeta.generatedTerrainCount).toBeGreaterThanOrEqual(1);
    expect(manifestPayload.compileMeta.generatedAnimationCount).toBeGreaterThanOrEqual(1);
    expect(manifestPayload.compileMeta.generatedCharacterCount).toBeGreaterThanOrEqual(1);
    expect(manifestPayload.compileMeta.combatActorCount).toBeGreaterThanOrEqual(1);
    expect(manifestPayload.compileMeta.combatWeaponCount).toBeGreaterThanOrEqual(1);
    expect(manifestPayload.combatActors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityName: 'Player',
          team: 'player',
          maxHealth: 110,
          currentHealth: 110,
          attack: 18,
          defense: 4,
          speed: 1.2,
          hasWeapon: true,
          hasPlayerController: true,
        }),
      ])
    );
    expect(manifestPayload.combatWeapons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityId: 'entity-player-weapon',
          entityName: 'Player Sword',
          ownerEntityName: 'Player',
          damage: 18,
          attackSpeed: 1.5,
          range: 2.1,
          heavyDamage: 30,
          autoAcquireTarget: true,
          targetTeam: 'enemy',
        }),
      ])
    );
    expect(manifestPayload.assets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: expect.stringMatching(/^generated-terrain-/),
          source: 'generated_terrain',
          terrainSummary: expect.objectContaining({
            layerCount: 3,
          }),
        }),
        expect.objectContaining({
          id: 'generated-modeler-entity-kitbash',
          path: 'generated-modeler-Kitbash_Panel-entity-kitbash.json',
          source: 'generated_modeler_mesh',
          entityId: 'entity-kitbash',
          entityName: 'Kitbash Panel',
          meshSummary: expect.objectContaining({
            vertexCount: expect.any(Number),
            faceCount: expect.any(Number),
            modifierCount: 1,
          }),
        }),
        expect.objectContaining({
          id: expect.stringMatching(/^generated-animation-/),
          path: expect.stringMatching(/^generated-animation-Player-/),
          source: 'generated_animation',
          entityName: 'Player',
          animationSummary: expect.objectContaining({
            nlaStripCount: 1,
            hasRootMotion: true,
          }),
        }),
        expect.objectContaining({
          id: 'character-package-build-test-project',
          source: 'generated_character',
          characterSummary: expect.objectContaining({
            materialCount: 1,
            animationCount: 1,
          }),
        }),
      ])
    );
    expect(manifestPayload.generatedModelerMeshes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assetId: 'generated-modeler-entity-kitbash',
          entityId: 'entity-kitbash',
          entityName: 'Kitbash Panel',
          path: 'generated-modeler-Kitbash_Panel-entity-kitbash.json',
          modifierCount: 1,
        }),
      ])
    );
    expect(manifestPayload.generatedTerrains).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assetId: expect.stringMatching(/^generated-terrain-/),
          entityName: 'Terrain',
          summary: expect.objectContaining({
            layerCount: 3,
          }),
        }),
      ])
    );
    expect(manifestPayload.generatedAnimations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assetId: expect.stringMatching(/^generated-animation-/),
          entityName: 'Player',
          path: expect.stringMatching(/^generated-animation-Player-/),
          summary: expect.objectContaining({
            clipCount: expect.any(Number),
            nlaStripCount: 1,
            hasRootMotion: true,
          }),
        }),
      ])
    );
    expect(manifestPayload.generatedCharacters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assetId: 'character-package-build-test-project',
          assetName: 'build-test-project-hero.package.json',
          summary: expect.objectContaining({
            materialCount: 1,
            animationCount: 1,
          }),
        }),
      ])
    );
    expect(entries['materials-index.json']).toContain('"player_alloy"');
    expect(entries['characters-index.json']).toContain('"assetId": "character-package-build-test-project"');
    expect(entries['combat-index.json']).toContain('"entityName": "Player Sword"');
    expect(entries['terrains-index.json']).toContain('"entityName": "Terrain"');
    expect(entries['animations-index.json']).toContain('"entityName": "Player"');
    expect(entries['generated-modeler-Kitbash_Panel-entity-kitbash.json']).toContain('"entityId": "entity-kitbash"');
    const terrainArtifactPath = manifestPayload.generatedTerrains[0]?.path;
    const animationArtifactPath = manifestPayload.generatedAnimations[0]?.path;
    const characterArtifactPath = manifestPayload.generatedCharacters[0]?.path;
    expect(terrainArtifactPath).toBeTruthy();
    expect(animationArtifactPath).toBeTruthy();
    expect(characterArtifactPath).toBeTruthy();
    expect(entries[terrainArtifactPath!]).toContain('"entityName": "Terrain"');
    expect(entries[animationArtifactPath!]).toContain('"entityName": "Player"');
    expect(entries[characterArtifactPath!]).toContain('"assetId": "character-package-build-test-project"');
    expect(entries['index.html']).toContain(manifestPayload.scenes[0]!.renderProfile.summary);
    expect(entries['index.html']).toContain('Player Alloy');
    expect(entries['index.html']).toContain('Animations');
    expect(entries['index.html']).toContain('Characters');
    expect(entries['index.html']).toContain('Combat');
    expect(entries['index.html']).toContain('Player Sword');
    expect(entries['index.html']).toContain('Terrains');
    expect(entries['README.txt']).toContain('Terrains: 1');
    expect(entries['README.txt']).toContain('Animations: 1');
    expect(entries['README.txt']).toContain('Characters: 1');
    expect(entries['README.txt']).toContain('Combat Actors: 1');
    expect(entries['README.txt']).toContain('Combat Weapons: 1');
    expect(entries['README.txt']).toContain('Modeler Meshes: 1');
    expect(packageManifestPayload).toMatchObject({
      schema: 'reyplay-package-1.0',
      target: 'web',
      projectName: 'Build Test Project',
    });
    expect(packageManifestPayload.stageFiles.map((file) => file.path)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('/stage/index.html'),
        expect.stringContaining('/stage/manifest.json'),
      ])
    );
  });

  it('packages an explicit project snapshot without depending on the live editor store', async () => {
    seedBuildableProject();
    const characterPackagePath = await attachCharacterPackageAsset(tempRoot);
    useEngineStore.getState().addAsset({
      id: 'character-package-build-test-project',
      name: 'build-test-project-hero.package.json',
      type: 'prefab',
      path: characterPackagePath,
      size: 2048,
      createdAt: new Date('2026-04-03T00:00:00.000Z'),
      metadata: {
        characterPackage: true,
        source: 'ai_level3_full_character',
        generatedBy: 'character-full-route',
      },
    });
    const store = useEngineStore.getState();
    const input = {
      projectName: store.projectName,
      scenes: structuredClone(store.scenes),
      entities: structuredClone(store.entities),
      assets: structuredClone(store.assets),
      scribProfiles: structuredClone(store.scribProfiles),
      scribInstances: structuredClone(store.scribInstances),
      activeSceneId: store.activeSceneId,
      buildManifest: null,
    };

    useEngineStore.setState({
      projectName: 'Diverged Store',
      scenes: [],
      activeSceneId: null,
      entities: new Map(),
      assets: [],
      buildManifest: null,
      lastBuildReport: null,
      lastCompileSummary: '',
      scribProfiles: new Map(),
      activeScribEntityId: null,
      scribInstances: new Map(),
    });

    const result = await buildProjectFromState('web', input);

    expect(result.ok).toBe(true);
    const manifestArtifact = result.artifacts.find((artifact) =>
      artifact.path.endsWith('/stage/manifest.json') || artifact.path.endsWith('\\stage\\manifest.json')
    );
    expect(manifestArtifact).toBeTruthy();
    const manifestPayload = JSON.parse(
      await readFile(path.join(process.cwd(), manifestArtifact!.path), 'utf-8')
    ) as {
      projectName: string;
      scenes: Array<{ name: string; renderProfile: { summary: string; advancedLighting: { shadowQuality: string } } }>;
      materials: Array<{ materialId: string; entityName: string }>;
      generatedModelerMeshes: Array<{ entityId: string; modifierCount: number }>;
      generatedTerrains: Array<{ entityName: string; summary: { layerCount: number } }>;
      generatedCharacters: Array<{ assetId: string; summary: { materialCount: number } }>;
      combatActors: Array<{ entityName: string; hasWeapon: boolean }>;
      combatWeapons: Array<{ entityName: string; ownerEntityName: string | null }>;
      compileMeta: {
        materialCount: number;
        paintedTextureCount: number;
        generatedModelerMeshCount: number;
        generatedTerrainCount: number;
        generatedCharacterCount: number;
        combatActorCount: number;
        combatWeaponCount: number;
      };
    };
    expect(manifestPayload.projectName).toBe('Build Test Project');
    expect(manifestPayload.scenes[0]?.name).toBe('Build Scene');
    expect(manifestPayload.scenes[0]?.renderProfile.advancedLighting.shadowQuality).toBe('high');
    expect(manifestPayload.scenes[0]?.renderProfile.summary).toContain('shadow high');
    expect(manifestPayload.materials).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityName: 'Player',
          materialId: 'player_alloy',
        }),
      ])
    );
    expect(manifestPayload.compileMeta.materialCount).toBeGreaterThanOrEqual(1);
    expect(manifestPayload.compileMeta.paintedTextureCount).toBeGreaterThanOrEqual(1);
    expect(manifestPayload.compileMeta.generatedModelerMeshCount).toBeGreaterThanOrEqual(1);
    expect(manifestPayload.compileMeta.generatedTerrainCount).toBeGreaterThanOrEqual(1);
    expect(manifestPayload.compileMeta.generatedCharacterCount).toBeGreaterThanOrEqual(1);
    expect(manifestPayload.compileMeta.combatActorCount).toBeGreaterThanOrEqual(1);
    expect(manifestPayload.compileMeta.combatWeaponCount).toBeGreaterThanOrEqual(1);
    expect(manifestPayload.combatActors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityName: 'Player',
          hasWeapon: true,
        }),
      ])
    );
    expect(manifestPayload.combatWeapons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityName: 'Player Sword',
          ownerEntityName: 'Player',
        }),
      ])
    );
    expect(manifestPayload.generatedModelerMeshes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityId: 'entity-kitbash',
          modifierCount: 1,
        }),
      ])
    );
    expect(manifestPayload.generatedTerrains).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityName: 'Terrain',
          summary: expect.objectContaining({
            layerCount: 3,
          }),
        }),
      ])
    );
    expect(manifestPayload.generatedCharacters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assetId: 'character-package-build-test-project',
          summary: expect.objectContaining({
            materialCount: 1,
          }),
        }),
      ])
    );
  });

  it('fails packaging when a material texture is still transient paint data', async () => {
    seedBuildableProject();
    const store = useEngineStore.getState();
    const player = Array.from(store.entities.values()).find((entity) => entity.name === 'Player');
    const meshRenderer = player?.components.get('MeshRenderer');
    expect(meshRenderer).toBeTruthy();
    if (meshRenderer) {
      meshRenderer.data = {
        ...meshRenderer.data,
        material: {
          ...((meshRenderer.data as Record<string, unknown>).material as Record<string, unknown>),
          textureMaps: {
            albedo: {
              assetPath: 'data:image/png;base64,AAAA',
              enabled: true,
            },
          },
        },
      };
    }
    useEngineStore.setState({
      assets: useEngineStore.getState().assets.filter((asset) => asset.id !== 'texture-player-albedo'),
    });

    const result = await buildProject('web');

    expect(result.ok).toBe(false);
    expect(result.report.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'RYP_MATERIAL_TEXTURE_TRANSIENT',
          level: 'error',
        }),
      ])
    );
  });

  it.runIf(process.platform === 'win32' && spawnSync('where', ['iexpress.exe'], { stdio: 'ignore' }).status === 0)(
    'packages a self-extracting windows launcher when IExpress is available',
    { timeout: WINDOWS_PACKAGING_TIMEOUT_MS },
    async () => {
      seedBuildableProject();

      const result = await buildProject('windows-exe');

      expect(result.ok).toBe(true);
      const installer = result.artifacts.find((artifact) => artifact.kind === 'installer');
      const bundle = result.artifacts.find((artifact) => artifact.kind === 'bundle');
      expect(installer?.path.endsWith('.exe')).toBe(true);
      expect(bundle?.path.endsWith('.zip')).toBe(true);

      const installerStat = await readFile(path.join(process.cwd(), installer!.path));
      expect(installerStat.byteLength).toBeGreaterThan(0);

      const bundleEntries = readZipEntries(await readFile(path.join(process.cwd(), bundle!.path)));
      expect(bundleEntries['Launch ReyPlay.cmd']).toContain('REY30\\Builds');
      expect(bundleEntries['index.html']).toContain('Build Test Project');
    }
  );

  it.runIf(process.platform === 'win32' && spawnSync('where', ['wix.exe'], { stdio: 'ignore' }).status === 0)(
    'packages a real windows msi when WiX is available',
    { timeout: WINDOWS_PACKAGING_TIMEOUT_MS },
    async () => {
      seedBuildableProject();

      const result = await buildProject('windows-msi');

      expect(result.ok).toBe(true);
      expect(result.missingDeps).toEqual([]);
      const installer = result.artifacts.find((artifact) => artifact.kind === 'installer');
      expect(installer?.path.endsWith('.msi')).toBe(true);

      const installerBuffer = await readFile(path.join(process.cwd(), installer!.path));
      expect(installerBuffer.byteLength).toBeGreaterThan(1024);
      expect(result.logs.some((line) => line.includes('Windows MSI packaged with WiX'))).toBe(true);
    }
  );
});
