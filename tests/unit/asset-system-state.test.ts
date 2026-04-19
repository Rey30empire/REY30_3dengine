import { afterEach, describe, expect, it } from 'vitest';
import { access, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  getAssetDbPath,
  listAssets,
  registerAssetFromPath,
  updateAssetMetadata,
} from '@/engine/assets/pipeline';
import {
  getAssetBrowserViewsPath,
  getAssetMetadataHistoryPath,
  listAssetBrowserViews,
  listAssetMetadataHistory,
  recordAssetMetadataHistory,
  upsertAssetBrowserView,
} from '@/lib/server/asset-browser-state';
import { getAssetSystemStatePath, runAssetSystemMutation } from '@/lib/server/asset-system-storage';

const cleanupDirs = new Set<string>();

async function withTempAssetRoot<T>(run: (assetRoot: string) => Promise<T>) {
  const previousRoot = process.env.REY30_ASSET_ROOT;
  const assetRoot = await mkdtemp(path.join(os.tmpdir(), 'rey30-asset-state-unit-'));
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

afterEach(async () => {
  await Promise.all(
    Array.from(cleanupDirs).map(async (dir) => {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
      cleanupDirs.delete(dir);
    })
  );
});

describe('asset system state', () => {
  it('serializes concurrent asset registry writes without losing assets', async () => {
    await withTempAssetRoot(async (assetRoot) => {
      const firstPath = path.join(assetRoot, 'mesh', 'uploads', 'star_forge', 'alpha.glb');
      const secondPath = path.join(assetRoot, 'mesh', 'uploads', 'star_forge', 'beta.glb');
      await mkdir(path.dirname(firstPath), { recursive: true });
      await writeFile(firstPath, Buffer.from([1, 2, 3, 4]));
      await writeFile(secondPath, Buffer.from([5, 6, 7, 8]));

      await Promise.all([
        registerAssetFromPath({
          absPath: firstPath,
          type: 'mesh',
          name: 'alpha',
          metadata: { uploaded: true, projectKey: 'star_forge' },
        }),
        registerAssetFromPath({
          absPath: secondPath,
          type: 'mesh',
          name: 'beta',
          metadata: { uploaded: true, projectKey: 'star_forge' },
        }),
      ]);

      const dbPayload = JSON.parse(await readFile(getAssetDbPath(), 'utf-8')) as {
        assets: Array<{ name: string }>;
      };
      expect(dbPayload.assets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'alpha' }),
          expect.objectContaining({ name: 'beta' }),
        ])
      );
    });
  });

  it('merges concurrent metadata updates on the same asset without dropping fields', async () => {
    await withTempAssetRoot(async (assetRoot) => {
      const assetPath = path.join(assetRoot, 'mesh', 'uploads', 'star_forge', 'guardian.glb');
      await mkdir(path.dirname(assetPath), { recursive: true });
      await writeFile(assetPath, Buffer.from([9, 10, 11, 12]));

      const asset = await registerAssetFromPath({
        absPath: assetPath,
        type: 'mesh',
        name: 'guardian',
        metadata: { uploaded: true, projectKey: 'star_forge' },
      });

      await Promise.all([
        updateAssetMetadata({
          assetId: asset.id,
          metadata: {
            favorite: true,
            tags: ['guardian'],
          },
        }),
        updateAssetMetadata({
          assetId: asset.id,
          metadata: {
            notes: 'ready for battle',
          },
        }),
      ]);

      const listed = await listAssets();
      expect(listed).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: asset.id,
            metadata: expect.objectContaining({
              favorite: true,
              tags: ['guardian'],
              notes: 'ready for battle',
            }),
          }),
        ])
      );
    });
  });

  it('stores views and history inside namespaced files and preserves concurrent view writes', async () => {
    await withTempAssetRoot(async (assetRoot) => {
      await Promise.all([
        upsertAssetBrowserView({
          userId: 'user-1',
          projectKey: 'star_forge',
          name: 'Favorites',
          filter: { favoritesOnly: true },
        }),
        upsertAssetBrowserView({
          userId: 'user-1',
          projectKey: 'star_forge',
          name: 'Textures',
          filter: { type: 'texture' },
        }),
      ]);

      await recordAssetMetadataHistory({
        assetId: 'asset-1',
        path: 'download/assets/mesh/guardian.glb',
        userId: 'user-1',
        projectKey: 'star_forge',
        action: 'metadata.update',
        before: {},
        after: { favorite: true },
      });
      await recordAssetMetadataHistory({
        assetId: 'asset-1',
        path: 'download/assets/mesh/guardian.glb',
        userId: 'user-1',
        projectKey: 'nebula_yard',
        action: 'metadata.update',
        before: {},
        after: { notes: 'other project' },
      });

      const views = await listAssetBrowserViews({
        userId: 'user-1',
        projectKey: 'star_forge',
      });
      expect(views.map((view) => view.name).sort()).toEqual(['Favorites', 'Textures']);

      const starForgeHistory = await listAssetMetadataHistory({
        assetId: 'asset-1',
        projectKey: 'star_forge',
      });
      const nebulaHistory = await listAssetMetadataHistory({
        assetId: 'asset-1',
        projectKey: 'nebula_yard',
      });
      expect(starForgeHistory).toHaveLength(1);
      expect(nebulaHistory).toHaveLength(1);

      const viewsPath = getAssetBrowserViewsPath();
      const historyPath = getAssetMetadataHistoryPath();
      expect(viewsPath).toContain(assetRoot);
      expect(historyPath).toContain(assetRoot);
      await expect(access(viewsPath)).resolves.toBeUndefined();
      await expect(access(historyPath)).resolves.toBeUndefined();

      const namespaceDirFiles = await readdir(path.join(assetRoot, '.rey30'));
      expect(namespaceDirFiles.sort()).toEqual([
        'asset-browser-views.json',
        'asset-metadata-history.json',
      ]);
    });
  });

  it('waits for a shared asset-system lock file before mutating', async () => {
    await withTempAssetRoot(async () => {
      const lockPath = getAssetSystemStatePath('asset-system.lock');
      await mkdir(path.dirname(lockPath), { recursive: true });
      await writeFile(lockPath, 'locked', 'utf-8');

      const releaseTimer = setTimeout(() => {
        rm(lockPath, { force: true }).catch(() => undefined);
      }, 75);

      try {
        const startedAt = Date.now();
        await runAssetSystemMutation(async () => {
          await writeFile(getAssetSystemStatePath('lock-proof.json'), '{"ok":true}', 'utf-8');
        });

        expect(Date.now() - startedAt).toBeGreaterThanOrEqual(50);
        await expect(access(getAssetSystemStatePath('lock-proof.json'))).resolves.toBeUndefined();
        await expect(access(lockPath)).rejects.toBeDefined();
      } finally {
        clearTimeout(releaseTimer);
      }
    });
  });
});
