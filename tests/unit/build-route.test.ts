import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { NextRequest } from 'next/server';
import {
  createEditorProjectSaveData,
  type EditorProjectSaveState,
} from '@/engine/serialization';
import {
  createDefaultAnimatorEditorState,
  createLibraryClip,
  serializeAnimatorEditorState,
} from '@/engine/editor/animationEditorState';
import { createMirrorModifier } from '@/engine/editor/meshModifiers';
import { createPlaneMesh } from '@/engine/editor/modelerMesh';
import { createStarterTerrainData } from '@/engine/scene/terrainAuthoring';
import { createDefaultAutomationPermissions, createDefaultEditorState } from '@/store/editorStore.utils';
import { useEngineStore } from '@/store/editorStore';

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
const ORIGINAL_BUILD_ROOT = process.env.REY30_BUILD_ROOT;
const cleanupDirs = new Set<string>();

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
        prompt: 'remote build hero',
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
      prompt: 'remote build hero',
      style: 'realista',
      targetEngine: 'generic',
      generatedAt: '2026-04-03T00:00:00.000Z',
    },
  };
}

async function attachCharacterPackageAsset(
  state: EditorProjectSaveState,
  projectKey: string
) {
  const dir = path.join(
    process.cwd(),
    'download',
    'assets',
    'characters',
    '__tests__',
    projectKey
  );
  cleanupDirs.add(path.join(process.cwd(), 'download', 'assets', 'characters', '__tests__'));
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'package.json'), JSON.stringify(buildCharacterPackageFixture(), null, 2), 'utf-8');
  state.assets.push({
    id: `character-package-${projectKey}`,
    name: `${projectKey}-hero.package.json`,
    type: 'prefab',
    path: path.relative(process.cwd(), path.join(dir, 'package.json')).replace(/\\/g, '/'),
    size: 2048,
    createdAt: new Date('2026-04-03T00:00:00.000Z'),
    metadata: {
      projectKey,
      scope: 'project',
      characterPackage: true,
      source: 'ai_level3_full_character',
      generatedBy: 'character-full-route',
    },
  });
}

function createProjectState(projectName = 'Remote Build Project', assetCount = 1): EditorProjectSaveState {
  const terrainId = 'entity-terrain';
  const playerId = 'entity-player';
  const weaponId = 'entity-player-weapon';
  const cameraId = 'entity-camera';
  const kitbashId = 'entity-kitbash';
  const animatorBase = createDefaultAnimatorEditorState('Remote Player');
  const walkClip = createLibraryClip('Walk Cycle');
  return {
    projectName,
    projectPath: `C:/Projects/${projectName.replace(/\s+/g, '')}`,
    isDirty: true,
    scenes: [
      {
        id: 'scene-1',
        name: 'Shipping Scene',
        entities: [],
        rootEntities: [terrainId, playerId, kitbashId, cameraId],
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
    entities: new Map([
      [
        terrainId,
        {
          id: terrainId,
          name: 'Remote Terrain',
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
                data: createStarterTerrainData({
                  width: 72,
                  depth: 72,
                  height: 24,
                  segments: 33,
                  seed: 2026,
                  preset: 'island',
                }) as unknown as Record<string, unknown>,
              },
            ],
          ]),
        },
      ],
      [
        playerId,
        {
          id: playerId,
          name: 'Remote Player',
          parentId: null,
          children: [],
          active: true,
          tags: ['player'],
          components: new Map([
            [
              'Transform',
              {
                id: 'transform-player',
                type: 'Transform',
                enabled: true,
                data: {
                  position: { x: 0, y: 0.5, z: 0 },
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
                  maxHealth: 120,
                  currentHealth: 120,
                  attack: 22,
                  defense: 6,
                  speed: 1.4,
                  team: 'player',
                },
              },
            ],
            [
              'PlayerController',
              {
                id: 'controller-player',
                type: 'PlayerController',
                enabled: true,
                data: {
                  speed: 4.5,
                  runSpeed: 7,
                  jumpForce: 10,
                  sensitivity: 1.5,
                },
              },
            ],
            [
              'MeshRenderer',
              {
                id: 'mesh-player',
                type: 'MeshRenderer',
                enabled: true,
                data: {
                  meshId: 'asset-1',
                  materialId: 'metal',
                  castShadows: true,
                  receiveShadows: true,
                  material: {
                    id: 'remote_player_alloy',
                    name: 'Remote Player Alloy',
                    metallic: 0.94,
                    roughness: 0.16,
                    textureMaps: {
                      albedo: {
                        assetPath:
                          'download/assets/texture/uploads/remote_build_project/player-albedo.png',
                        enabled: true,
                      },
                    },
                  },
                },
              },
            ],
            [
              'Animator',
              {
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
              },
            ],
          ]),
        },
      ],
      [
        weaponId,
        {
          id: weaponId,
          name: 'Remote Sword',
          parentId: playerId,
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
                  position: { x: 0.5, y: 1.2, z: 0.1 },
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
                  damage: 22,
                  attackSpeed: 1.6,
                  range: 2.2,
                  heavyDamage: 36,
                  heavyAttackSpeed: 0.9,
                  heavyRange: 2.6,
                  targetTeam: 'enemy',
                  autoAcquireTarget: true,
                },
              },
            ],
          ]),
        },
      ],
      [
        kitbashId,
        {
          id: kitbashId,
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
        },
      ],
      [
        cameraId,
        {
          id: cameraId,
          name: 'Remote Camera',
          parentId: null,
          children: [],
          active: true,
          tags: ['camera'],
          components: new Map([
            [
              'Transform',
              {
                id: 'transform-camera',
                type: 'Transform',
                enabled: true,
                data: {
                  position: { x: 0, y: 2, z: 5 },
                  rotation: { x: 0, y: 0, z: 0, w: 1 },
                  scale: { x: 1, y: 1, z: 1 },
                },
              },
            ],
            [
              'Camera',
              {
                id: 'camera-main',
                type: 'Camera',
                enabled: true,
                data: {
                  fov: 60,
                  near: 0.1,
                  far: 1000,
                  orthographic: false,
                  clearColor: { r: 0.08, g: 0.08, b: 0.1, a: 1 },
                  isMain: true,
                },
              },
            ],
          ]),
        },
      ],
    ]),
    assets: [
      {
        id: 'asset-1',
        name: 'asset-1.glb',
        type: 'mesh' as const,
        path: 'download/assets/mesh/uploads/remote_build_project/asset-1.glb',
        size: 1024,
        createdAt: new Date('2026-04-02T00:00:00.000Z'),
        metadata: { projectKey: 'remote_build_project' },
      },
      {
        id: 'texture-1',
        name: 'player-albedo.png',
        type: 'texture' as const,
        path: 'download/assets/texture/uploads/remote_build_project/player-albedo.png',
        size: 1024,
        createdAt: new Date('2026-04-02T00:00:00.000Z'),
        metadata: {
          projectKey: 'remote_build_project',
          texturePaint: true,
          entityId: playerId,
          slot: 'albedo',
        },
      },
      ...Array.from({ length: Math.max(0, assetCount - 2) }, (_, index) => ({
        id: `asset-extra-${index + 1}`,
        name: `asset-extra-${index + 1}.glb`,
        type: 'mesh' as const,
        path: `download/assets/mesh/uploads/remote_build_project/asset-extra-${index + 1}.glb`,
        size: 1024,
        createdAt: new Date('2026-04-02T00:00:00.000Z'),
        metadata: { projectKey: 'remote_build_project' },
      })),
    ],
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

async function withTempRoots<T>(run: () => Promise<T>) {
  const tempEditorRoot = await mkdtemp(path.join(os.tmpdir(), 'rey30-build-route-editor-'));
  const tempBuildRoot = await mkdtemp(path.join(os.tmpdir(), 'rey30-build-route-build-'));
  cleanupDirs.add(tempEditorRoot);
  cleanupDirs.add(tempBuildRoot);
  process.env.REY30_EDITOR_PROJECT_ROOT = tempEditorRoot;
  process.env.REY30_BUILD_ROOT = tempBuildRoot;
  try {
    return await run();
  } finally {
    if (ORIGINAL_EDITOR_PROJECT_ROOT === undefined) {
      delete process.env.REY30_EDITOR_PROJECT_ROOT;
    } else {
      process.env.REY30_EDITOR_PROJECT_ROOT = ORIGINAL_EDITOR_PROJECT_ROOT;
    }
    if (ORIGINAL_BUILD_ROOT === undefined) {
      delete process.env.REY30_BUILD_ROOT;
    } else {
      process.env.REY30_BUILD_ROOT = ORIGINAL_BUILD_ROOT;
    }
  }
}

describe('build route', () => {
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

  it('packages the remote editor project save instead of the live server store', async () => {
    await withTempRoots(async () => {
      requireSessionMock.mockResolvedValue({
        id: 'editor-1',
        role: 'EDITOR',
        email: 'editor@example.com',
        sessionId: 'session-1',
      });

      const projectState = createProjectState('Remote Build Project', 2);
      await attachCharacterPackageAsset(projectState, 'remote_build_project');
      const saveData = createEditorProjectSaveData(projectState, {
        markClean: true,
      });
      const {
        buildEditorProjectRecord,
        writeEditorProjectRecord,
      } = await import('@/lib/server/editor-project-storage');

      writeEditorProjectRecord(
        buildEditorProjectRecord({
          userId: 'editor-1',
          projectKey: 'Remote Build Project',
          slot: 'build-slot',
          saveData,
        })
      );

      useEngineStore.setState({
        projectName: 'Wrong Live Store',
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

      const { POST } = await import('@/app/api/build/route');
      const response = await POST(
        new NextRequest('http://localhost/api/build', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-rey30-project': 'Remote Build Project',
          },
          body: JSON.stringify({
            target: 'web',
            slot: 'build-slot',
          }),
        })
      );
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload).toMatchObject({
        ok: true,
        target: 'web',
        projectKey: 'remote_build_project',
        slot: 'build-slot',
        source: 'remote_editor_project',
      });

      const manifestArtifact = payload.artifacts.find((artifact: { path: string }) =>
        artifact.path.endsWith('package-manifest.json')
      );
      const stageManifestArtifact = payload.artifacts.find((artifact: { path: string }) =>
        artifact.path.endsWith('/stage/manifest.json') || artifact.path.endsWith('\\stage\\manifest.json')
      );
      expect(manifestArtifact).toBeTruthy();
      expect(stageManifestArtifact).toBeTruthy();
      const manifestPayload = JSON.parse(
        await readFile(path.join(process.cwd(), manifestArtifact.path), 'utf-8')
      ) as {
        projectName: string;
        target: string;
        artifacts: Array<{ path: string }>;
      };
      const stageManifestPayload = JSON.parse(
        await readFile(path.join(process.cwd(), stageManifestArtifact.path), 'utf-8')
      ) as {
        scenes: Array<{ renderProfile: { summary: string; advancedLighting: { shadowQuality: string } } }>;
        assets: Array<{
          id: string;
          path: string;
          source?: string;
          entityId?: string | null;
          entityName?: string | null;
          meshSummary?: { vertexCount: number; faceCount: number; modifierCount: number } | null;
          terrainSummary?: { width: number; depth: number; segments: number; layerCount: number } | null;
        }>;
        materials: Array<{
          entityName: string;
          materialId: string;
          textureReferences: Array<{
            assetPath: string;
            assetId: string | null;
            texturePaint: boolean;
          }>;
        }>;
        compileMeta: {
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
      expect(manifestPayload.projectName).toBe('Remote Build Project');
      expect(manifestPayload.target).toBe('web');
      expect(stageManifestPayload.scenes[0]?.renderProfile.advancedLighting.shadowQuality).toBe('high');
      expect(stageManifestPayload.scenes[0]?.renderProfile.summary).toContain('tone aces');
      expect(stageManifestPayload.materials).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            entityName: 'Remote Player',
            materialId: 'remote_player_alloy',
            textureReferences: expect.arrayContaining([
              expect.objectContaining({
                assetPath:
                  'download/assets/texture/uploads/remote_build_project/player-albedo.png',
                assetId: 'texture-1',
                texturePaint: true,
              }),
            ]),
          }),
        ])
      );
      expect(stageManifestPayload.compileMeta.materialCount).toBeGreaterThanOrEqual(1);
      expect(stageManifestPayload.compileMeta.textureReferenceCount).toBeGreaterThanOrEqual(1);
      expect(stageManifestPayload.compileMeta.paintedTextureCount).toBeGreaterThanOrEqual(1);
      expect(stageManifestPayload.compileMeta.generatedModelerMeshCount).toBeGreaterThanOrEqual(1);
      expect(stageManifestPayload.compileMeta.generatedTerrainCount).toBeGreaterThanOrEqual(1);
      expect(stageManifestPayload.compileMeta.generatedAnimationCount).toBeGreaterThanOrEqual(1);
      expect(stageManifestPayload.compileMeta.generatedCharacterCount).toBeGreaterThanOrEqual(1);
      expect(stageManifestPayload.compileMeta.combatActorCount).toBeGreaterThanOrEqual(1);
      expect(stageManifestPayload.compileMeta.combatWeaponCount).toBeGreaterThanOrEqual(1);
      expect(stageManifestPayload.combatActors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            entityId: 'entity-player',
            entityName: 'Remote Player',
            team: 'player',
            maxHealth: 120,
            currentHealth: 120,
            attack: 22,
            defense: 6,
            speed: 1.4,
            hasWeapon: true,
            hasPlayerController: true,
          }),
        ])
      );
      expect(stageManifestPayload.combatWeapons).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            entityId: 'entity-player-weapon',
            entityName: 'Remote Sword',
            ownerEntityId: 'entity-player',
            ownerEntityName: 'Remote Player',
            damage: 22,
            attackSpeed: 1.6,
            range: 2.2,
            heavyDamage: 36,
            autoAcquireTarget: true,
            targetTeam: 'enemy',
          }),
        ])
      );
      expect(stageManifestPayload.assets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'generated-terrain-entity-terrain',
            path: 'generated-terrain-Remote_Terrain-entity-terrain.json',
            source: 'generated_terrain',
            entityId: 'entity-terrain',
            entityName: 'Remote Terrain',
            terrainSummary: expect.objectContaining({
              segments: 33,
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
              modifierCount: 1,
            }),
          }),
          expect.objectContaining({
            id: 'generated-animation-entity-player',
            path: 'generated-animation-Remote_Player-entity-player.json',
            source: 'generated_animation',
            entityId: 'entity-player',
            entityName: 'Remote Player',
            animationSummary: expect.objectContaining({
              clipCount: expect.any(Number),
              trackCount: expect.any(Number),
              nlaStripCount: 1,
              hasRootMotion: true,
            }),
          }),
          expect.objectContaining({
            id: 'character-package-remote_build_project',
            path: 'generated-character-remote_build_project-hero_package_json-character-package-remote_build_project.json',
            source: 'generated_character',
            characterSummary: expect.objectContaining({
              materialCount: 1,
              animationCount: 1,
            }),
          }),
        ])
      );
      expect(stageManifestPayload.generatedModelerMeshes).toEqual(
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
      expect(stageManifestPayload.generatedTerrains).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            assetId: 'generated-terrain-entity-terrain',
            entityId: 'entity-terrain',
            entityName: 'Remote Terrain',
            path: 'generated-terrain-Remote_Terrain-entity-terrain.json',
            summary: expect.objectContaining({
              width: 72,
              depth: 72,
              segments: 33,
              layerCount: 3,
            }),
          }),
        ])
      );
      expect(stageManifestPayload.generatedAnimations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            assetId: 'generated-animation-entity-player',
            entityId: 'entity-player',
            entityName: 'Remote Player',
            path: 'generated-animation-Remote_Player-entity-player.json',
            summary: expect.objectContaining({
              nlaStripCount: 1,
              hasRootMotion: true,
            }),
          }),
        ])
      );
      expect(stageManifestPayload.generatedCharacters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            assetId: 'character-package-remote_build_project',
            assetName: 'remote_build_project-hero.package.json',
            summary: expect.objectContaining({
              materialCount: 1,
              animationCount: 1,
            }),
          }),
        ])
      );
      expect(manifestPayload.artifacts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: expect.stringContaining('remote-build-project-web.zip') }),
        ])
      );
    });
  });

  it('returns 409 when there is no remote project save to package', async () => {
    await withTempRoots(async () => {
      requireSessionMock.mockResolvedValue({
        id: 'editor-1',
        role: 'EDITOR',
        email: 'editor@example.com',
        sessionId: 'session-1',
      });

      const { POST } = await import('@/app/api/build/route');
      const response = await POST(
        new NextRequest('http://localhost/api/build', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-rey30-project': 'Missing Project',
          },
          body: JSON.stringify({
            target: 'web',
            slot: 'missing-slot',
          }),
        })
      );
      const payload = await response.json();

      expect(response.status).toBe(409);
      expect(payload.error).toBe('No existe un save remoto del proyecto para empaquetar.');
      expect(payload.projectKey).toBe('missing_project');
      expect(payload.slot).toBe('missing-slot');
    });
  });

  it('blocks packaging when a material still points at a transient texture paint data url', async () => {
    await withTempRoots(async () => {
      requireSessionMock.mockResolvedValue({
        id: 'editor-1',
        role: 'EDITOR',
        email: 'editor@example.com',
        sessionId: 'session-1',
      });

      const state = createProjectState('Transient Paint Project', 2);
      const meshRenderer = state.entities.get('entity-player')?.components.get('MeshRenderer');
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
      state.assets = state.assets.filter((asset) => asset.id !== 'texture-1');

      const saveData = createEditorProjectSaveData(state, {
        markClean: true,
      });
      const {
        buildEditorProjectRecord,
        writeEditorProjectRecord,
      } = await import('@/lib/server/editor-project-storage');

      writeEditorProjectRecord(
        buildEditorProjectRecord({
          userId: 'editor-1',
          projectKey: 'Transient Paint Project',
          slot: 'paint-slot',
          saveData,
        })
      );

      const { POST } = await import('@/app/api/build/route');
      const response = await POST(
        new NextRequest('http://localhost/api/build', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-rey30-project': 'Transient Paint Project',
          },
          body: JSON.stringify({
            target: 'web',
            slot: 'paint-slot',
          }),
        })
      );
      const payload = await response.json();

      expect(response.status).toBe(400);
      expect(payload.ok).toBe(false);
      expect(payload.report?.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'RYP_MATERIAL_TEXTURE_TRANSIENT',
            level: 'error',
          }),
        ])
      );
    });
  });
});
