import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { getAssetDbPath, listAssets, updateAssetMetadata } from '@/engine/assets/pipeline';

const ORIGINAL_ASSET_ROOT = process.env.REY30_ASSET_ROOT;
const ORIGINAL_RUNTIME_REGISTRY_PATH = process.env.REY30_RUNTIME_REGISTRY_PATH;
const ORIGINAL_CWD = process.cwd();

let tempDir: string | null = null;

afterEach(async () => {
  if (ORIGINAL_ASSET_ROOT === undefined) {
    delete process.env.REY30_ASSET_ROOT;
  } else {
    process.env.REY30_ASSET_ROOT = ORIGINAL_ASSET_ROOT;
  }

  if (ORIGINAL_RUNTIME_REGISTRY_PATH === undefined) {
    delete process.env.REY30_RUNTIME_REGISTRY_PATH;
  } else {
    process.env.REY30_RUNTIME_REGISTRY_PATH = ORIGINAL_RUNTIME_REGISTRY_PATH;
  }

  process.chdir(ORIGINAL_CWD);

  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

describe('asset pipeline lexury runtime registry', () => {
  it('includes runtime-ready library assets from the promoted registry', async () => {
    const ctx = await createTestContext();
    await writeRegistry(ctx.registryPath, {
      assets: [
        {
          asset_id: 'anime_girl',
          asset_path: '01_Personajes/anime_girl',
          category: '01_Personajes',
          preferred_runtime_entry:
            'assets/Modelos_3D_Comentados_Lexury/01_Personajes/anime_girl/geometry/glb/anime.glb',
          runtime_ready: true,
        },
        {
          asset_id: 'blue_crystal_humanoid',
          asset_path: '01_Personajes/blue_crystal_humanoid',
          category: '01_Personajes',
          preferred_runtime_entry:
            'assets/Modelos_3D_Comentados_Lexury/01_Personajes/blue_crystal_humanoid/geometry/glb/blue.glb',
          runtime_ready: false,
        },
      ],
    });

    const animeGlb = path.join(
      ctx.root,
      'assets',
      'Modelos_3D_Comentados_Lexury',
      '01_Personajes',
      'anime_girl',
      'geometry',
      'glb',
      'anime.glb'
    );
    await mkdir(path.dirname(animeGlb), { recursive: true });
    await writeFile(animeGlb, Buffer.from([1, 2, 3, 4]));

    const assets = await listAssets();

    expect(assets).toHaveLength(1);
    expect(assets[0]).toMatchObject({
      id: 'lexury:anime_girl',
      name: 'anime_girl',
      type: 'mesh',
      path: 'assets/Modelos_3D_Comentados_Lexury/01_Personajes/anime_girl/geometry/glb/anime.glb',
      source: 'lexury-runtime-registry',
      metadata: expect.objectContaining({
        library: true,
        scope: 'shared',
        provider: 'lexury',
        runtimeReady: true,
        assetId: 'anime_girl',
        category: '01_Personajes',
      }),
    });
    expect(assets[0].size).toBe(4);
  });

  it('merges runtime registry assets with the regular asset database, including legacy db locations', async () => {
    const ctx = await createTestContext();
    await writeRegistry(ctx.registryPath, {
      assets: [
        {
          asset_id: 'fairy_house',
          asset_path: '02_Entornos/Estructuras/fairy_house',
          category: '02_Entornos/Estructuras',
          preferred_runtime_entry:
            'assets/Modelos_3D_Comentados_Lexury/02_Entornos/Estructuras/fairy_house/geometry/glb/fairy_house.glb',
          runtime_ready: true,
        },
      ],
    });

    const lexuryGlb = path.join(
      ctx.root,
      'assets',
      'Modelos_3D_Comentados_Lexury',
      '02_Entornos',
      'Estructuras',
      'fairy_house',
      'geometry',
      'glb',
      'fairy_house.glb'
    );
    await mkdir(path.dirname(lexuryGlb), { recursive: true });
    await writeFile(lexuryGlb, Buffer.from([5, 6, 7]));

    const dbPath = path.join(ctx.root, 'download', 'assets-db.json');
    await mkdir(path.dirname(dbPath), { recursive: true });
    await writeFile(
      dbPath,
      JSON.stringify(
        {
          assets: [
            {
              id: 'db-texture',
              name: 'hero_diffuse',
              type: 'texture',
              path: 'download/assets/texture/hero_diffuse.png',
              size: 128,
              hash: 'abc123',
              version: 1,
              createdAt: '2026-03-28T00:00:00.000Z',
            },
          ],
        },
        null,
        2
      )
    );

    const assets = await listAssets();
    const ids = new Set(assets.map((asset) => asset.id));

    expect(ids.has('db-texture')).toBe(true);
    expect(ids.has('lexury:fairy_house')).toBe(true);
    expect(assets).toHaveLength(2);
  });

  it('allows metadata overlays on runtime registry assets without moving source files', async () => {
    const ctx = await createTestContext();
    await writeRegistry(ctx.registryPath, {
      assets: [
        {
          asset_id: 'anime_girl',
          asset_path: '01_Personajes/anime_girl',
          category: '01_Personajes',
          preferred_runtime_entry:
            'assets/Modelos_3D_Comentados_Lexury/01_Personajes/anime_girl/geometry/glb/anime.glb',
          runtime_ready: true,
        },
      ],
    });

    const animeGlb = path.join(
      ctx.root,
      'assets',
      'Modelos_3D_Comentados_Lexury',
      '01_Personajes',
      'anime_girl',
      'geometry',
      'glb',
      'anime.glb'
    );
    await mkdir(path.dirname(animeGlb), { recursive: true });
    await writeFile(animeGlb, Buffer.from([1, 2, 3, 4]));

    const updated = await updateAssetMetadata({
      relPath:
        'assets/Modelos_3D_Comentados_Lexury/01_Personajes/anime_girl/geometry/glb/anime.glb',
      metadata: {
        favorite: true,
        tags: ['npc', 'hero'],
        collections: ['shared-cast'],
        notes: 'overlay metadata',
      },
    });

    expect(updated).not.toBeNull();
    const assets = await listAssets();
    expect(assets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'lexury:anime_girl',
          metadata: expect.objectContaining({
            library: true,
            favorite: true,
            tags: ['hero', 'npc'],
            collections: ['shared-cast'],
            notes: 'overlay metadata',
          }),
        }),
      ])
    );
  });

  it('reads legacy asset db data but persists updates into the namespaced db path', async () => {
    const ctx = await createTestContext();
    const legacyDbPath = path.join(ctx.root, 'download', 'assets-db.json');
    await mkdir(path.dirname(legacyDbPath), { recursive: true });
    await writeFile(
      legacyDbPath,
      JSON.stringify(
        {
          assets: [
            {
              id: 'legacy-texture',
              name: 'hero_diffuse',
              type: 'texture',
              path: 'download/assets/texture/hero_diffuse.png',
              size: 128,
              hash: 'legacy-hash',
              version: 1,
              createdAt: '2026-03-28T00:00:00.000Z',
            },
          ],
        },
        null,
        2
      )
    );

    const updated = await updateAssetMetadata({
      relPath: 'download/assets/texture/hero_diffuse.png',
      metadata: {
        favorite: true,
        tags: ['hero'],
        notes: 'migrated to namespaced db',
      },
    });

    expect(updated).not.toBeNull();
    expect(updated).toMatchObject({
      id: 'legacy-texture',
      metadata: expect.objectContaining({
        favorite: true,
        tags: ['hero'],
        notes: 'migrated to namespaced db',
      }),
    });

    const namespacedDbPath = getAssetDbPath();
    expect(namespacedDbPath).toBe(path.join(ctx.assetRoot, '.rey30', 'assets-db.json'));

    const namespacedDb = JSON.parse(await readFile(namespacedDbPath, 'utf-8')) as {
      assets: Array<{ id: string; metadata?: Record<string, unknown> }>;
    };
    expect(namespacedDb.assets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'legacy-texture',
          metadata: expect.objectContaining({
            favorite: true,
            tags: ['hero'],
            notes: 'migrated to namespaced db',
          }),
        }),
      ])
    );

    const legacyDb = JSON.parse(await readFile(legacyDbPath, 'utf-8')) as {
      assets: Array<{ id: string; metadata?: Record<string, unknown> }>;
    };
    const legacyAsset = legacyDb.assets.find((asset) => asset.id === 'legacy-texture');
    expect(legacyAsset).toBeDefined();
    expect(legacyAsset?.metadata).toBeUndefined();
  });
});

async function createTestContext() {
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'rey30-lexury-pipeline-'));
  const root = tempDir;
  const assetRoot = path.join(root, 'download', 'assets');
  const registryPath = path.join(root, 'assets', 'registro_motor.json');
  process.chdir(root);
  process.env.REY30_ASSET_ROOT = assetRoot;
  process.env.REY30_RUNTIME_REGISTRY_PATH = registryPath;
  return { root, assetRoot, registryPath };
}

async function writeRegistry(registryPath: string, value: unknown) {
  await mkdir(path.dirname(registryPath), { recursive: true });
  await writeFile(registryPath, JSON.stringify(value, null, 2));
}
