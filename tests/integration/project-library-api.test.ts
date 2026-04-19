import { afterEach, describe, expect, it } from 'vitest';
import { access, mkdtemp, readFile, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { UserRole } from '@prisma/client';
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getAssetDbPath } from '@/engine/assets/pipeline';
import { GET as materialsGet, POST as materialsPost, DELETE as materialsDelete } from '@/app/api/materials/route';
import {
  GET as modifierPresetsGet,
  POST as modifierPresetsPost,
  DELETE as modifierPresetsDelete,
} from '@/app/api/modifier-presets/route';
import {
  GET as characterPresetsGet,
  POST as characterPresetsPost,
  DELETE as characterPresetsDelete,
} from '@/app/api/character/presets/route';
import { GET as characterPresetDownloadGet } from '@/app/api/character/presets/download/route';
import { createSessionForUser, SESSION_COOKIE_NAME } from '@/lib/security/auth';

const cleanupUserIds = new Set<string>();
const cleanupDirs = new Set<string>();

function buildAuthedRequest(
  url: string,
  token: string,
  init: RequestInit = {},
  projectName = 'Star Forge'
) {
  const headers = new Headers(init.headers);
  const signal = init.signal ?? undefined;
  headers.set('cookie', `${SESSION_COOKIE_NAME}=${token}`);
  headers.set('x-rey30-project', projectName);
  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  return new NextRequest(url, {
    ...init,
    headers,
    signal,
  });
}

async function createEditorSession() {
  const user = await db.user.create({
    data: {
      email: `project-library-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`,
      role: UserRole.EDITOR,
    },
  });
  cleanupUserIds.add(user.id);

  const { token } = await createSessionForUser(user.id);
  return { token, userId: user.id };
}

async function withTempAssetRoot<T>(run: (assetRoot: string) => Promise<T>) {
  const previousRoot = process.env.REY30_ASSET_ROOT;
  const assetRoot = await mkdtemp(path.join(os.tmpdir(), 'rey30-project-library-'));
  cleanupDirs.add(assetRoot);
  process.env.REY30_ASSET_ROOT = assetRoot;

  try {
    return await run(assetRoot);
  } finally {
    if (previousRoot === undefined) {
      delete process.env.REY30_ASSET_ROOT;
    } else {
      process.env.REY30_ASSET_ROOT = previousRoot;
    }
  }
}

function toWorkspaceRelative(filePath: string) {
  return path.relative(process.cwd(), filePath).replace(/\\/g, '/');
}

afterEach(async () => {
  await Promise.all(
    Array.from(cleanupUserIds).map(async (userId) => {
      await db.user.delete({ where: { id: userId } }).catch(() => undefined);
      cleanupUserIds.delete(userId);
    })
  );

  await Promise.all(
    Array.from(cleanupDirs).map(async (dir) => {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
      cleanupDirs.delete(dir);
    })
  );
});

describe('Project library API', () => {
  it('keeps concurrent library saves durable in the shared asset registry', async () => {
    await withTempAssetRoot(async (assetRoot) => {
      const { token } = await createEditorSession();

      const [materialResponse, presetResponse] = await Promise.all([
        materialsPost(
          buildAuthedRequest(
            'http://localhost/api/materials',
            token,
            {
              method: 'POST',
              body: JSON.stringify({
                name: 'Concurrent Alloy',
                scope: 'project',
                material: {
                  id: 'concurrent_alloy',
                  roughness: 0.22,
                },
              }),
            },
            'Star Forge'
          )
        ),
        modifierPresetsPost(
          buildAuthedRequest(
            'http://localhost/api/modifier-presets',
            token,
            {
              method: 'POST',
              body: JSON.stringify({
                name: 'Concurrent Array',
                scope: 'shared',
                modifiers: [{ type: 'array', enabled: true, count: 4 }],
              }),
            },
            'Star Forge'
          )
        ),
      ]);

      expect(materialResponse.status).toBe(200);
      expect(presetResponse.status).toBe(200);

      const dbPayload = JSON.parse(await readFile(getAssetDbPath(), 'utf-8')) as {
        assets: Array<{ path: string; metadata?: Record<string, unknown> }>;
      };

      expect(dbPayload.assets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: toWorkspaceRelative(
              path.join(
                assetRoot,
                'material',
                'library',
                'star_forge',
                'Concurrent_Alloy.json'
              )
            ),
          }),
          expect.objectContaining({
            path: toWorkspaceRelative(
              path.join(
                assetRoot,
                'modifier_preset',
                'library',
                'Concurrent_Array.json'
              )
            ),
          }),
        ])
      );
    });
  });

  it('isolates project-scoped library entries while keeping shared entries visible', async () => {
    await withTempAssetRoot(async () => {
      const { token } = await createEditorSession();

      const starForgeMaterial = await materialsPost(
        buildAuthedRequest(
          'http://localhost/api/materials',
          token,
          {
            method: 'POST',
            body: JSON.stringify({
              name: 'Forge Bronze',
              scope: 'project',
              material: {
                id: 'forge_bronze',
                roughness: 0.31,
              },
            }),
          },
          'Star Forge'
        )
      );
      expect(starForgeMaterial.status).toBe(200);

      const nebulaMaterial = await materialsPost(
        buildAuthedRequest(
          'http://localhost/api/materials',
          token,
          {
            method: 'POST',
            body: JSON.stringify({
              name: 'Nebula Chrome',
              scope: 'project',
              material: {
                id: 'nebula_chrome',
                roughness: 0.11,
              },
            }),
          },
          'Nebula Lab'
        )
      );
      expect(nebulaMaterial.status).toBe(200);

      const sharedMaterial = await materialsPost(
        buildAuthedRequest(
          'http://localhost/api/materials',
          token,
          {
            method: 'POST',
            body: JSON.stringify({
              name: 'Shared Carbon',
              scope: 'shared',
              material: {
                id: 'shared_carbon',
                roughness: 0.44,
              },
            }),
          },
          'Star Forge'
        )
      );
      expect(sharedMaterial.status).toBe(200);

      const starForgeList = await materialsGet(
        buildAuthedRequest('http://localhost/api/materials', token, {}, 'Star Forge')
      );
      const starForgePayload = await starForgeList.json();
      expect(starForgeList.status).toBe(200);
      expect(starForgePayload.materials).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Forge_Bronze', scope: 'project' }),
          expect.objectContaining({ name: 'Shared_Carbon', scope: 'shared' }),
        ])
      );
      expect(starForgePayload.materials).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'Nebula_Chrome' })])
      );

      const nebulaList = await materialsGet(
        buildAuthedRequest('http://localhost/api/materials', token, {}, 'Nebula Lab')
      );
      const nebulaPayload = await nebulaList.json();
      expect(nebulaList.status).toBe(200);
      expect(nebulaPayload.materials).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Nebula_Chrome', scope: 'project' }),
          expect.objectContaining({ name: 'Shared_Carbon', scope: 'shared' }),
        ])
      );
      expect(nebulaPayload.materials).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'Forge_Bronze' })])
      );
    });
  });

  it('updates an existing library entry without duplicating its asset registry row', async () => {
    await withTempAssetRoot(async (assetRoot) => {
      const { token } = await createEditorSession();

      const initialSave = await materialsPost(
        buildAuthedRequest(
          'http://localhost/api/materials',
          token,
          {
            method: 'POST',
            body: JSON.stringify({
              name: 'Hull Steel',
              scope: 'project',
              material: {
                id: 'hull_steel',
                roughness: 0.38,
              },
            }),
          },
          'Star Forge'
        )
      );
      expect(initialSave.status).toBe(200);

      const updatedSave = await materialsPost(
        buildAuthedRequest(
          'http://localhost/api/materials',
          token,
          {
            method: 'POST',
            body: JSON.stringify({
              name: 'Hull Steel',
              scope: 'project',
              material: {
                id: 'hull_steel',
                roughness: 0.12,
                metallic: 1,
              },
            }),
          },
          'Star Forge'
        )
      );
      expect(updatedSave.status).toBe(200);

      const storedMaterial = JSON.parse(
        await readFile(
          path.join(assetRoot, 'material', 'library', 'star_forge', 'Hull_Steel.json'),
          'utf-8'
        )
      ) as Record<string, unknown>;
      expect(storedMaterial).toMatchObject({
        id: 'hull_steel',
        roughness: 0.12,
        metallic: 1,
      });

      const dbPayload = JSON.parse(await readFile(getAssetDbPath(), 'utf-8')) as {
        assets: Array<{ path: string; metadata?: Record<string, unknown> }>;
      };
      const libraryAssetPath = toWorkspaceRelative(
        path.join(assetRoot, 'material', 'library', 'star_forge', 'Hull_Steel.json')
      );
      expect(
        dbPayload.assets.filter((asset) => asset.path === libraryAssetPath)
      ).toHaveLength(1);
    });
  });

  it('persists project and shared materials on the server library', async () => {
    await withTempAssetRoot(async (assetRoot) => {
      const { token } = await createEditorSession();

      const projectSaveResponse = await materialsPost(
        buildAuthedRequest(
          'http://localhost/api/materials',
          token,
          {
            method: 'POST',
            body: JSON.stringify({
              name: 'Hull Steel',
              scope: 'project',
              material: {
                id: 'hull_steel',
                roughness: 0.38,
              },
            }),
          },
          'Star Forge'
        )
      );
      const projectSavePayload = await projectSaveResponse.json();
      expect(projectSaveResponse.status).toBe(200);
      expect(projectSavePayload.scope).toBe('project');
      expect(projectSavePayload.projectKey).toBe('star_forge');

      const sharedSaveResponse = await materialsPost(
        buildAuthedRequest(
          'http://localhost/api/materials',
          token,
          {
            method: 'POST',
            body: JSON.stringify({
              name: 'Studio Glass',
              scope: 'shared',
              material: {
                id: 'studio_glass',
                roughness: 0.08,
                transparent: true,
              },
            }),
          },
          'Star Forge'
        )
      );
      const sharedSavePayload = await sharedSaveResponse.json();
      expect(sharedSaveResponse.status).toBe(200);
      expect(sharedSavePayload.scope).toBe('shared');
      expect(sharedSavePayload.projectKey).toBe('shared');

      await expect(
        access(path.join(assetRoot, 'material', 'library', 'star_forge', 'Hull_Steel.json'))
      ).resolves.toBeUndefined();
      await expect(
        access(path.join(assetRoot, 'material', 'library', 'Studio_Glass.json'))
      ).resolves.toBeUndefined();

      const listResponse = await materialsGet(
        buildAuthedRequest('http://localhost/api/materials', token, {}, 'Star Forge')
      );
      const listPayload = await listResponse.json();

      expect(listResponse.status).toBe(200);
      expect(listPayload.materials).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'Hull_Steel',
            scope: 'project',
            projectKey: 'star_forge',
          }),
          expect.objectContaining({
            name: 'Studio_Glass',
            scope: 'shared',
            projectKey: 'shared',
          }),
        ])
      );

      const dbPayload = JSON.parse(await readFile(getAssetDbPath(), 'utf-8')) as {
        assets: Array<{ path: string; metadata?: Record<string, unknown> }>;
      };
      expect(dbPayload.assets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: toWorkspaceRelative(
              path.join(assetRoot, 'material', 'library', 'star_forge', 'Hull_Steel.json')
            ),
            metadata: expect.objectContaining({
              library: true,
              projectKey: 'star_forge',
              scope: 'project',
            }),
          }),
          expect.objectContaining({
            path: toWorkspaceRelative(
              path.join(assetRoot, 'material', 'library', 'Studio_Glass.json')
            ),
            metadata: expect.objectContaining({
              library: true,
              projectKey: 'shared',
              scope: 'shared',
            }),
          }),
        ])
      );

      const deleteProjectResponse = await materialsDelete(
        buildAuthedRequest(
          'http://localhost/api/materials?name=Hull_Steel&scope=project',
          token,
          { method: 'DELETE' },
          'Star Forge'
        )
      );
      expect(deleteProjectResponse.status).toBe(200);

      const listAfterDeleteResponse = await materialsGet(
        buildAuthedRequest('http://localhost/api/materials', token, {}, 'Star Forge')
      );
      const listAfterDeletePayload = await listAfterDeleteResponse.json();
      expect(listAfterDeletePayload.materials).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'Hull_Steel' })])
      );
      expect(listAfterDeletePayload.materials).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'Studio_Glass' })])
      );
    });
  });

  it('sanitizes persisted PBR materials before storing and listing them', async () => {
    await withTempAssetRoot(async (assetRoot) => {
      const { token } = await createEditorSession();

      const saveResponse = await materialsPost(
        buildAuthedRequest(
          'http://localhost/api/materials',
          token,
          {
            method: 'POST',
            body: JSON.stringify({
              name: 'Wild Alloy',
              scope: 'project',
              material: {
                id: 'wild_alloy',
                metallic: 7,
                roughness: -3,
                normalIntensity: 99,
                emissiveIntensity: -5,
                transparent: 'yes',
                textureMaps: {
                  albedo: {
                    assetPath: '  download/assets/texture/wild-albedo.png  ',
                    enabled: true,
                  },
                  emissive: {
                    assetPath: '   ',
                    enabled: true,
                  },
                },
                textureTransform: {
                  repeatU: 0,
                  repeatV: 99,
                  offsetU: 99,
                  offsetV: -99,
                  rotation: 999,
                },
                weightedNormalsEnabled: true,
                weightedNormalsStrength: 8,
                weightedNormalsKeepSharp: false,
                unexpected: 'drop-me',
              },
            }),
          },
          'Star Forge'
        )
      );
      const savePayload = await saveResponse.json();
      expect(saveResponse.status).toBe(200);
      expect(savePayload.material).toMatchObject({
        id: 'wild_alloy',
        metallic: 1,
        roughness: 0,
        normalIntensity: 4,
        emissiveIntensity: 0,
        transparent: false,
        textureMaps: expect.objectContaining({
          albedo: {
            assetPath: 'download/assets/texture/wild-albedo.png',
            enabled: true,
          },
          emissive: {
            assetPath: null,
            enabled: false,
          },
        }),
        textureTransform: {
          repeatU: 0.05,
          repeatV: 32,
          offsetU: 10,
          offsetV: -10,
          rotation: 360,
        },
        weightedNormalsEnabled: true,
        weightedNormalsStrength: 4,
        weightedNormalsKeepSharp: false,
      });
      expect(savePayload.material).not.toHaveProperty('unexpected');

      const storedMaterial = JSON.parse(
        await readFile(
          path.join(assetRoot, 'material', 'library', 'star_forge', 'Wild_Alloy.json'),
          'utf-8'
        )
      ) as Record<string, unknown>;
      expect(storedMaterial).toEqual(savePayload.material);

      const listResponse = await materialsGet(
        buildAuthedRequest('http://localhost/api/materials', token, {}, 'Star Forge')
      );
      const listPayload = await listResponse.json();
      expect(listResponse.status).toBe(200);
      expect(listPayload.materials).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'Wild_Alloy',
            definition: expect.objectContaining({
              id: 'wild_alloy',
              metallic: 1,
              roughness: 0,
              textureMaps: expect.objectContaining({
                albedo: expect.objectContaining({
                  assetPath: 'download/assets/texture/wild-albedo.png',
                  enabled: true,
                }),
              }),
            }),
          }),
        ])
      );
    });
  });

  it('persists project and shared modifier presets on the server library', async () => {
    await withTempAssetRoot(async (assetRoot) => {
      const { token } = await createEditorSession();

      const projectSaveResponse = await modifierPresetsPost(
        buildAuthedRequest(
          'http://localhost/api/modifier-presets',
          token,
          {
            method: 'POST',
            body: JSON.stringify({
              name: 'Panel Stack',
              scope: 'project',
              description: 'Preset de panelado para el proyecto',
              modifiers: [
                { type: 'mirror_x', enabled: true },
                { type: 'solidify', enabled: true, thickness: 0.08 },
              ],
            }),
          },
          'Star Forge'
        )
      );
      const projectSavePayload = await projectSaveResponse.json();
      expect(projectSaveResponse.status).toBe(200);
      expect(projectSavePayload.scope).toBe('project');
      expect(projectSavePayload.projectKey).toBe('star_forge');

      const sharedSaveResponse = await modifierPresetsPost(
        buildAuthedRequest(
          'http://localhost/api/modifier-presets',
          token,
          {
            method: 'POST',
            body: JSON.stringify({
              name: 'Shared Kit',
              scope: 'shared',
              description: 'Preset comun para varios proyectos',
              modifiers: [{ type: 'array', enabled: true, count: 6, mode: 'radial' }],
            }),
          },
          'Star Forge'
        )
      );
      const sharedSavePayload = await sharedSaveResponse.json();
      expect(sharedSaveResponse.status).toBe(200);
      expect(sharedSavePayload.scope).toBe('shared');
      expect(sharedSavePayload.projectKey).toBe('shared');

      await expect(
        access(
          path.join(assetRoot, 'modifier_preset', 'library', 'star_forge', 'Panel_Stack.json')
        )
      ).resolves.toBeUndefined();
      await expect(
        access(path.join(assetRoot, 'modifier_preset', 'library', 'Shared_Kit.json'))
      ).resolves.toBeUndefined();

      const listResponse = await modifierPresetsGet(
        buildAuthedRequest('http://localhost/api/modifier-presets', token, {}, 'Star Forge')
      );
      const listPayload = await listResponse.json();
      expect(listResponse.status).toBe(200);
      expect(listPayload.presets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'Panel_Stack',
            scope: 'project',
            projectKey: 'star_forge',
            definition: expect.objectContaining({
              description: 'Preset de panelado para el proyecto',
            }),
          }),
          expect.objectContaining({
            name: 'Shared_Kit',
            scope: 'shared',
            projectKey: 'shared',
            definition: expect.objectContaining({
              description: 'Preset comun para varios proyectos',
            }),
          }),
        ])
      );

      const dbPayload = JSON.parse(await readFile(getAssetDbPath(), 'utf-8')) as {
        assets: Array<{ path: string; metadata?: Record<string, unknown> }>;
      };
      expect(dbPayload.assets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: toWorkspaceRelative(
              path.join(assetRoot, 'modifier_preset', 'library', 'star_forge', 'Panel_Stack.json')
            ),
            metadata: expect.objectContaining({
              library: true,
              projectKey: 'star_forge',
              scope: 'project',
            }),
          }),
          expect.objectContaining({
            path: toWorkspaceRelative(
              path.join(assetRoot, 'modifier_preset', 'library', 'Shared_Kit.json')
            ),
            metadata: expect.objectContaining({
              library: true,
              projectKey: 'shared',
              scope: 'shared',
            }),
          }),
        ])
      );

      const deleteSharedResponse = await modifierPresetsDelete(
        buildAuthedRequest(
          'http://localhost/api/modifier-presets?name=Shared_Kit&scope=shared',
          token,
          { method: 'DELETE' },
          'Star Forge'
        )
      );
      expect(deleteSharedResponse.status).toBe(200);

      const listAfterDeleteResponse = await modifierPresetsGet(
        buildAuthedRequest('http://localhost/api/modifier-presets', token, {}, 'Star Forge')
      );
      const listAfterDeletePayload = await listAfterDeleteResponse.json();
      expect(listAfterDeletePayload.presets).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'Shared_Kit' })])
      );
      expect(listAfterDeletePayload.presets).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'Panel_Stack' })])
      );

      const dbPayloadAfterDelete = JSON.parse(await readFile(getAssetDbPath(), 'utf-8')) as {
        assets: Array<{ path: string }>;
      };
      expect(dbPayloadAfterDelete.assets).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: toWorkspaceRelative(
              path.join(assetRoot, 'modifier_preset', 'library', 'Shared_Kit.json')
            ),
          }),
        ])
      );
    });
  });

  it('persists project character presets on the server library', async () => {
    await withTempAssetRoot(async (assetRoot) => {
      const { token } = await createEditorSession();

      const projectSaveResponse = await characterPresetsPost(
        buildAuthedRequest(
          'http://localhost/api/character/presets',
          token,
          {
            method: 'POST',
            body: JSON.stringify({
              entry: {
                id: 'preset_hero_loadout',
                name: 'Hero Loadout',
                createdAt: '2026-04-04T10:00:00.000Z',
                updatedAt: '2026-04-04T10:00:00.000Z',
                preset: {
                  baseBodyId: 'mannequin_a',
                  parts: {
                    body: 'mannequin_a',
                    head: 'head_base',
                    outfit: 'hoodie',
                    shoes: 'boots',
                  },
                  materialVariants: {
                    shoes: 'boots_black',
                  },
                  colorVariants: {
                    accessory: 'hat_red',
                  },
                  colors: {
                    accessory: 'hat_red',
                  },
                },
              },
            }),
          },
          'Star Forge'
        )
      );
      const projectSavePayload = await projectSaveResponse.json();
      expect(projectSaveResponse.status).toBe(200);
      expect(projectSavePayload.scope).toBe('project');
      expect(projectSavePayload.projectKey).toBe('star_forge');
      expect(projectSavePayload.preset).toMatchObject({
        id: 'preset_hero_loadout',
        name: 'Hero Loadout',
        metadata: expect.objectContaining({
          projectKey: 'star_forge',
          source: 'character_builder',
          exportProfile: 'character_builder_preset',
        }),
        preset: expect.objectContaining({
          baseBodyId: 'mannequin_a',
        }),
      });

      await expect(
        access(
          path.join(assetRoot, 'character_preset', 'library', 'star_forge', 'Hero_Loadout.json')
        )
      ).resolves.toBeUndefined();

      const listResponse = await characterPresetsGet(
        buildAuthedRequest('http://localhost/api/character/presets', token, {}, 'Star Forge')
      );
      const listPayload = await listResponse.json();
      expect(listResponse.status).toBe(200);
      expect(listPayload.presets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'Hero_Loadout',
            scope: 'project',
            projectKey: 'star_forge',
            definition: expect.objectContaining({
              id: 'preset_hero_loadout',
              name: 'Hero Loadout',
            }),
          }),
        ])
      );

      const dbPayload = JSON.parse(await readFile(getAssetDbPath(), 'utf-8')) as {
        assets: Array<{ path: string; metadata?: Record<string, unknown> }>;
      };
      expect(dbPayload.assets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: toWorkspaceRelative(
              path.join(
                assetRoot,
                'character_preset',
                'library',
                'star_forge',
                'Hero_Loadout.json'
              )
            ),
            metadata: expect.objectContaining({
              library: true,
              projectKey: 'star_forge',
              scope: 'project',
              presetId: 'preset_hero_loadout',
            }),
          }),
        ])
      );

      const downloadResponse = await characterPresetDownloadGet(
        buildAuthedRequest(
          'http://localhost/api/character/presets/download?name=Hero%20Loadout&projectKey=star_forge',
          token,
          {},
          'Star Forge'
        )
      );
      const downloadPayload = JSON.parse(await downloadResponse.text()) as Record<string, unknown>;
      expect(downloadResponse.status).toBe(200);
      expect(downloadResponse.headers.get('content-disposition')).toContain(
        'Hero_Loadout.character-preset.json'
      );
      expect(downloadPayload).toMatchObject({
        kind: 'character_builder_preset',
        projectKey: 'star_forge',
        ownership: {
          ownerUserId: expect.any(String),
        },
        export: {
          source: 'character_builder',
          exportProfile: 'character_builder_preset',
        },
        preset: {
          id: 'preset_hero_loadout',
          name: 'Hero Loadout',
        },
      });

      const deleteResponse = await characterPresetsDelete(
        buildAuthedRequest(
          'http://localhost/api/character/presets?name=Hero%20Loadout',
          token,
          { method: 'DELETE' },
          'Star Forge'
        )
      );
      expect(deleteResponse.status).toBe(200);

      const listAfterDeleteResponse = await characterPresetsGet(
        buildAuthedRequest('http://localhost/api/character/presets', token, {}, 'Star Forge')
      );
      const listAfterDeletePayload = await listAfterDeleteResponse.json();
      expect(listAfterDeletePayload.presets).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'Hero_Loadout' })])
      );
    });
  });
});
