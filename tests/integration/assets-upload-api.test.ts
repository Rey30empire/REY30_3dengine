import { afterEach, describe, expect, it } from 'vitest';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { UserRole } from '@prisma/client';
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { DELETE as assetsDelete, PATCH as assetsPatch, POST as assetsPost } from '@/app/api/assets/route';
import { GET as assetFileGet } from '@/app/api/assets/file/route';
import { GET as assetHistoryGet } from '@/app/api/assets/history/route';
import { POST as assetHistoryRollbackPost } from '@/app/api/assets/history/rollback/route';
import { getAssetDbPath } from '@/engine/assets/pipeline';
import {
  DELETE as assetViewsDelete,
  GET as assetViewsGet,
  POST as assetViewsPost,
} from '@/app/api/assets/views/route';
import { createSessionForUser, SESSION_COOKIE_NAME } from '@/lib/security/auth';

const cleanupUserIds = new Set<string>();
const cleanupDirs = new Set<string>();

function buildAuthedRequest(url: string, token: string, body: FormData, projectName = 'Star Forge') {
  const headers = new Headers();
  headers.set('cookie', `${SESSION_COOKIE_NAME}=${token}`);
  headers.set('x-rey30-project', projectName);
  return new NextRequest(url, { method: 'POST', headers, body });
}

function buildAuthedJsonRequest(
  method: 'PATCH' | 'POST',
  url: string,
  token: string,
  body: unknown,
  projectName = 'Star Forge'
) {
  const headers = new Headers();
  headers.set('cookie', `${SESSION_COOKIE_NAME}=${token}`);
  headers.set('x-rey30-project', projectName);
  headers.set('content-type', 'application/json');
  return new NextRequest(url, {
    method,
    headers,
    body: JSON.stringify(body),
  });
}

function buildAuthedDeleteRequest(url: string, token: string, projectName = 'Star Forge') {
  const headers = new Headers();
  headers.set('cookie', `${SESSION_COOKIE_NAME}=${token}`);
  headers.set('x-rey30-project', projectName);
  return new NextRequest(url, { method: 'DELETE', headers });
}

function buildAuthedGetRequest(url: string, token: string, projectName = 'Star Forge') {
  const headers = new Headers();
  headers.set('cookie', `${SESSION_COOKIE_NAME}=${token}`);
  headers.set('x-rey30-project', projectName);
  return new NextRequest(url, { method: 'GET', headers });
}

async function createEditorSession() {
  const user = await db.user.create({
    data: {
      email: `asset-upload-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`,
      role: UserRole.EDITOR,
    },
  });
  cleanupUserIds.add(user.id);
  const { token } = await createSessionForUser(user.id);
  return { token };
}

async function withTempAssetRoot<T>(run: (assetRoot: string) => Promise<T>) {
  const previousRoot = process.env.REY30_ASSET_ROOT;
  const assetRoot = await mkdtemp(path.join(os.tmpdir(), 'rey30-assets-upload-'));
  cleanupDirs.add(assetRoot);
  process.env.REY30_ASSET_ROOT = assetRoot;
  try {
    return await run(assetRoot);
  } finally {
    if (previousRoot === undefined) delete process.env.REY30_ASSET_ROOT;
    else process.env.REY30_ASSET_ROOT = previousRoot;
  }
}

function toWorkspaceRelative(filePath: string) {
  return path.relative(process.cwd(), filePath).replace(/\\/g, '/');
}

afterEach(async () => {
  await Promise.all(Array.from(cleanupUserIds).map(async (userId) => {
    await db.user.delete({ where: { id: userId } }).catch(() => undefined);
    cleanupUserIds.delete(userId);
  }));
  await Promise.all(Array.from(cleanupDirs).map(async (dir) => {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    cleanupDirs.delete(dir);
  }));
});

describe('Asset upload API', () => {
  it('persists uploaded files into the asset pipeline', async () => {
    await withTempAssetRoot(async (assetRoot) => {
      const { token } = await createEditorSession();
      const formData = new FormData();
      formData.append(
        'files',
        new File([Uint8Array.from([103, 108, 84, 70, 1, 2, 3, 4])], 'pilot.glb', {
          type: 'model/gltf-binary',
        })
      );

      const response = await assetsPost(
        buildAuthedRequest('http://localhost/api/assets', token, formData, 'Star Forge')
      );
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.success).toBe(true);
      expect(payload.projectKey).toBe('star_forge');
      expect(payload.assets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'pilot',
            type: 'mesh',
            metadata: expect.objectContaining({
              uploaded: true,
              projectKey: 'star_forge',
              scope: 'project',
              originalName: 'pilot.glb',
              storageBackend: 'filesystem',
              storageScope: 'filesystem',
              storageObject: expect.objectContaining({
                backend: 'filesystem',
                scope: 'filesystem',
                key: expect.stringContaining('mesh/uploads/star_forge/'),
                checksum: expect.any(String),
              }),
            }),
          }),
        ])
      );

      const savedFile = path.join(
        assetRoot,
        'mesh',
        'uploads',
        'star_forge',
        path.basename(payload.assets[0].path)
      );
      await expect(access(savedFile)).resolves.toBeUndefined();

      const dbPayload = JSON.parse(await readFile(getAssetDbPath(), 'utf-8')) as {
        assets: Array<{ path: string; metadata?: Record<string, unknown> }>;
      };

      expect(dbPayload.assets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: toWorkspaceRelative(savedFile),
            metadata: expect.objectContaining({
              uploaded: true,
              projectKey: 'star_forge',
              scope: 'project',
              originalName: 'pilot.glb',
              storageBackend: 'filesystem',
              storageScope: 'filesystem',
              storageKey: expect.stringContaining('mesh/uploads/star_forge/'),
              storageChecksum: expect.any(String),
            }),
          }),
        ])
      );
    });
  });

  it('deletes managed uploaded assets from disk and registry', async () => {
    await withTempAssetRoot(async (assetRoot) => {
      const { token } = await createEditorSession();
      const formData = new FormData();
      formData.append(
        'files',
        new File([Uint8Array.from([103, 108, 84, 70, 5, 6, 7, 8])], 'helmet.glb', {
          type: 'model/gltf-binary',
        })
      );

      const uploadResponse = await assetsPost(
        buildAuthedRequest('http://localhost/api/assets', token, formData, 'Star Forge')
      );
      const uploadPayload = await uploadResponse.json();
      expect(uploadResponse.status).toBe(200);

      const assetPath = String(uploadPayload.assets[0].path);
      const deleteResponse = await assetsDelete(
        new NextRequest(`http://localhost/api/assets?path=${encodeURIComponent(assetPath)}`, {
          method: 'DELETE',
          headers: {
            cookie: `${SESSION_COOKIE_NAME}=${token}`,
            'x-rey30-project': 'Star Forge',
          },
        })
      );
      const deletePayload = await deleteResponse.json();

      expect(deleteResponse.status).toBe(200);
      expect(deletePayload.success).toBe(true);

      const savedFile = path.join(
        assetRoot,
        'mesh',
        'uploads',
        'star_forge',
        path.basename(assetPath)
      );
      await expect(access(savedFile)).rejects.toBeDefined();

      const dbPayload = JSON.parse(await readFile(getAssetDbPath(), 'utf-8')) as {
        assets: Array<{ path: string }>;
      };
      expect(dbPayload.assets).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ path: toWorkspaceRelative(savedFile) })])
      );
    });
  });

  it('serves managed uploaded assets even when the asset root lives outside the workspace', async () => {
    await withTempAssetRoot(async () => {
      const { token } = await createEditorSession();
      const bytes = Uint8Array.from([103, 108, 84, 70, 42, 43, 44, 45]);
      const formData = new FormData();
      formData.append(
        'files',
        new File([bytes], 'dropship.glb', {
          type: 'model/gltf-binary',
        })
      );

      const uploadResponse = await assetsPost(
        buildAuthedRequest('http://localhost/api/assets', token, formData, 'Star Forge')
      );
      const uploadPayload = await uploadResponse.json();
      expect(uploadResponse.status).toBe(200);

      const assetId = String(uploadPayload.assets[0].id);
      const fileResponse = await assetFileGet(
        buildAuthedGetRequest(
          `http://localhost/api/assets/file?id=${encodeURIComponent(assetId)}`,
          token
        )
      );

      expect(fileResponse.status).toBe(200);
      expect(fileResponse.headers.get('Content-Type')).toBe('model/gltf-binary');
      expect(new Uint8Array(await fileResponse.arrayBuffer())).toEqual(bytes);
    });
  });

  it('serves a transparent preview placeholder for stale image assets in preview mode', async () => {
    await withTempAssetRoot(async (assetRoot) => {
      const { token } = await createEditorSession();
      const dbPath = getAssetDbPath();
      const staleAssetPath = 'output_Rey30/assets/texture/compositor/demo/still.png';

      await mkdir(path.dirname(dbPath), { recursive: true });
      await writeFile(
        dbPath,
        `${JSON.stringify(
          {
            schemaVersion: 2,
            assetRootNamespace: path.resolve(assetRoot).replace(/\\/g, '/').toLowerCase(),
            assets: [
              {
                id: 'stale-preview',
                name: 'stale_preview',
                type: 'texture',
                path: staleAssetPath,
                size: 0,
                hash: 'stale-preview',
                version: 1,
                createdAt: new Date().toISOString(),
                metadata: {
                  scope: 'project',
                },
              },
            ],
          },
          null,
          2
        )}\n`,
        'utf8'
      );

      const previewResponse = await assetFileGet(
        buildAuthedGetRequest(
          `http://localhost/api/assets/file?path=${encodeURIComponent(staleAssetPath)}&preview=1`,
          token
        )
      );

      expect(previewResponse.status).toBe(200);
      expect(previewResponse.headers.get('Content-Type')).toBe('image/png');
      expect((await previewResponse.arrayBuffer()).byteLength).toBeGreaterThan(0);

      const regularResponse = await assetFileGet(
        buildAuthedGetRequest(
          `http://localhost/api/assets/file?path=${encodeURIComponent(staleAssetPath)}`,
          token
        )
      );

      expect(regularResponse.status).toBe(400);
    });
  });

  it('persists tags, collections, favorite, and notes metadata updates', async () => {
    await withTempAssetRoot(async (assetRoot) => {
      const { token } = await createEditorSession();
      const formData = new FormData();
      formData.append(
        'files',
        new File([Uint8Array.from([103, 108, 84, 70, 9, 10, 11, 12])], 'modular_knight.glb', {
          type: 'model/gltf-binary',
        })
      );

      const uploadResponse = await assetsPost(
        buildAuthedRequest('http://localhost/api/assets', token, formData, 'Star Forge')
      );
      const uploadPayload = await uploadResponse.json();
      expect(uploadResponse.status).toBe(200);

      const uploadedAsset = uploadPayload.assets[0];
      const patchResponse = await assetsPatch(
        buildAuthedJsonRequest('PATCH', 'http://localhost/api/assets', token, {
          updates: [
            {
              id: uploadedAsset.id,
              path: uploadedAsset.path,
              metadata: {
                favorite: true,
                tags: ['character', ' modular ', 'character'],
                collections: ['heroes', 'export-ready'],
                notes: 'Listo para pruebas de Unity',
              },
            },
          ],
        })
      );
      const patchPayload = await patchResponse.json();

      expect(patchResponse.status).toBe(200);
      expect(patchPayload.assets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: uploadedAsset.id,
            metadata: expect.objectContaining({
              favorite: true,
              tags: ['character', 'modular'],
              collections: ['export-ready', 'heroes'],
              notes: 'Listo para pruebas de Unity',
            }),
          }),
        ])
      );

      const dbPayload = JSON.parse(await readFile(getAssetDbPath(), 'utf-8')) as {
        assets: Array<{ id: string; metadata?: Record<string, unknown> }>;
      };
      expect(dbPayload.assets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: uploadedAsset.id,
            metadata: expect.objectContaining({
              favorite: true,
              tags: ['character', 'modular'],
              collections: ['export-ready', 'heroes'],
              notes: 'Listo para pruebas de Unity',
            }),
          }),
        ])
      );
    });
  });

  it('isolates asset registries across sibling asset roots', async () => {
    const { token } = await createEditorSession();
    const previousRoot = process.env.REY30_ASSET_ROOT;
    const firstRoot = await mkdtemp(path.join(os.tmpdir(), 'rey30-assets-root-a-'));
    const secondRoot = await mkdtemp(path.join(os.tmpdir(), 'rey30-assets-root-b-'));
    cleanupDirs.add(firstRoot);
    cleanupDirs.add(secondRoot);

    try {
      process.env.REY30_ASSET_ROOT = firstRoot;
      const firstFormData = new FormData();
      firstFormData.append(
        'files',
        new File([Uint8Array.from([103, 108, 84, 70, 20, 21, 22, 23])], 'scout.glb', {
          type: 'model/gltf-binary',
        })
      );

      const firstResponse = await assetsPost(
        buildAuthedRequest('http://localhost/api/assets', token, firstFormData, 'Star Forge')
      );
      expect(firstResponse.status).toBe(200);

      const firstDbPath = getAssetDbPath();
      const firstDbPayload = JSON.parse(await readFile(firstDbPath, 'utf-8')) as {
        assets: Array<{ name: string }>;
      };
      expect(firstDbPath).toContain(firstRoot);
      expect(firstDbPayload.assets).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'scout' })])
      );

      process.env.REY30_ASSET_ROOT = secondRoot;
      const secondFormData = new FormData();
      secondFormData.append(
        'files',
        new File([Uint8Array.from([103, 108, 84, 70, 24, 25, 26, 27])], 'frigate.glb', {
          type: 'model/gltf-binary',
        })
      );

      const secondResponse = await assetsPost(
        buildAuthedRequest('http://localhost/api/assets', token, secondFormData, 'Star Forge')
      );
      expect(secondResponse.status).toBe(200);

      const secondDbPath = getAssetDbPath();
      const secondDbPayload = JSON.parse(await readFile(secondDbPath, 'utf-8')) as {
        assets: Array<{ name: string }>;
      };
      expect(secondDbPath).toContain(secondRoot);
      expect(secondDbPayload.assets).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'frigate' })])
      );
      expect(secondDbPayload.assets).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'scout' })])
      );

      process.env.REY30_ASSET_ROOT = firstRoot;
      const rereadFirstDbPayload = JSON.parse(await readFile(getAssetDbPath(), 'utf-8')) as {
        assets: Array<{ name: string }>;
      };
      expect(rereadFirstDbPayload.assets).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'scout' })])
      );
      expect(rereadFirstDbPayload.assets).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'frigate' })])
      );
    } finally {
      if (previousRoot === undefined) delete process.env.REY30_ASSET_ROOT;
      else process.env.REY30_ASSET_ROOT = previousRoot;
    }
  });

  it('saves asset browser views per user and project', async () => {
    const { token } = await createEditorSession();

    const saveResponse = await assetViewsPost(
      buildAuthedJsonRequest('POST', 'http://localhost/api/assets/views', token, {
        name: 'Heroes Modulares',
        filter: {
          scope: 'project',
          type: 'model',
          sortBy: 'modified',
          tag: 'character',
          collection: 'heroes',
          favoritesOnly: true,
          managedOnly: false,
          query: 'knight',
        },
      })
    );
    const savePayload = await saveResponse.json();
    expect(saveResponse.status).toBe(200);
    expect(savePayload.view).toEqual(
      expect.objectContaining({
        name: 'Heroes Modulares',
        projectKey: 'star_forge',
        filter: expect.objectContaining({
          scope: 'project',
          type: 'model',
          sortBy: 'modified',
          tag: 'character',
          collection: 'heroes',
          favoritesOnly: true,
          query: 'knight',
        }),
      })
    );

    const listResponse = await assetViewsGet(
      buildAuthedGetRequest('http://localhost/api/assets/views', token)
    );
    const listPayload = await listResponse.json();
    expect(listResponse.status).toBe(200);
    expect(listPayload.views).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: savePayload.view.id,
          name: 'Heroes Modulares',
        }),
      ])
    );

    const deleteResponse = await assetViewsDelete(
      buildAuthedDeleteRequest(
        `http://localhost/api/assets/views?id=${encodeURIComponent(savePayload.view.id)}`,
        token
      )
    );
    expect(deleteResponse.status).toBe(200);
  });

  it('isolates asset browser views across sibling asset roots', async () => {
    const { token } = await createEditorSession();
    const previousRoot = process.env.REY30_ASSET_ROOT;
    const firstRoot = await mkdtemp(path.join(os.tmpdir(), 'rey30-asset-views-root-a-'));
    const secondRoot = await mkdtemp(path.join(os.tmpdir(), 'rey30-asset-views-root-b-'));
    cleanupDirs.add(firstRoot);
    cleanupDirs.add(secondRoot);

    try {
      process.env.REY30_ASSET_ROOT = firstRoot;
      const firstSaveResponse = await assetViewsPost(
        buildAuthedJsonRequest('POST', 'http://localhost/api/assets/views', token, {
          name: 'First Root View',
          filter: {
            scope: 'project',
            query: 'frigate',
          },
        })
      );
      expect(firstSaveResponse.status).toBe(200);

      process.env.REY30_ASSET_ROOT = secondRoot;
      const secondListResponse = await assetViewsGet(
        buildAuthedGetRequest('http://localhost/api/assets/views', token)
      );
      const secondListPayload = await secondListResponse.json();
      expect(secondListResponse.status).toBe(200);
      expect(secondListPayload.views).toEqual([]);

      const secondSaveResponse = await assetViewsPost(
        buildAuthedJsonRequest('POST', 'http://localhost/api/assets/views', token, {
          name: 'Second Root View',
          filter: {
            scope: 'shared',
            query: 'carrier',
          },
        })
      );
      expect(secondSaveResponse.status).toBe(200);

      process.env.REY30_ASSET_ROOT = firstRoot;
      const firstListResponse = await assetViewsGet(
        buildAuthedGetRequest('http://localhost/api/assets/views', token)
      );
      const firstListPayload = await firstListResponse.json();
      expect(firstListResponse.status).toBe(200);
      expect(firstListPayload.views).toEqual([
        expect.objectContaining({
          name: 'First Root View',
        }),
      ]);
    } finally {
      if (previousRoot === undefined) delete process.env.REY30_ASSET_ROOT;
      else process.env.REY30_ASSET_ROOT = previousRoot;
    }
  });

  it('records metadata history and allows rollback', async () => {
    await withTempAssetRoot(async () => {
      const { token } = await createEditorSession();
      const formData = new FormData();
      formData.append(
        'files',
        new File([Uint8Array.from([103, 108, 84, 70, 13, 14, 15, 16])], 'guardian.glb', {
          type: 'model/gltf-binary',
        })
      );

      const uploadResponse = await assetsPost(
        buildAuthedRequest('http://localhost/api/assets', token, formData, 'Star Forge')
      );
      const uploadPayload = await uploadResponse.json();
      const uploadedAsset = uploadPayload.assets[0];

      const patchResponse = await assetsPatch(
        buildAuthedJsonRequest('PATCH', 'http://localhost/api/assets', token, {
          updates: [
            {
              id: uploadedAsset.id,
              path: uploadedAsset.path,
              metadata: {
                favorite: true,
                tags: ['guardian'],
                collections: ['frontline'],
                notes: 'primera version',
              },
            },
          ],
        })
      );
      expect(patchResponse.status).toBe(200);

      const historyResponse = await assetHistoryGet(
        buildAuthedGetRequest(
          `http://localhost/api/assets/history?path=${encodeURIComponent(uploadedAsset.path)}`,
          token
        )
      );
      const historyPayload = await historyResponse.json();
      expect(historyResponse.status).toBe(200);
      expect(historyPayload.entries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: 'metadata.update',
            path: uploadedAsset.path,
            after: expect.objectContaining({
              favorite: true,
              tags: ['guardian'],
              collections: ['frontline'],
              notes: 'primera version',
            }),
          }),
        ])
      );

      const rollbackResponse = await assetHistoryRollbackPost(
        buildAuthedJsonRequest('POST', 'http://localhost/api/assets/history/rollback', token, {
          entryId: historyPayload.entries[0].id,
        })
      );
      const rollbackPayload = await rollbackResponse.json();
      expect(rollbackResponse.status).toBe(200);
      expect(rollbackPayload.asset).toEqual(
        expect.objectContaining({
          id: uploadedAsset.id,
          metadata: expect.not.objectContaining({
            favorite: true,
          }),
        })
      );
    });
  });

  it('scopes asset metadata history by project and isolates sibling asset roots', async () => {
    const { token } = await createEditorSession();
    const previousRoot = process.env.REY30_ASSET_ROOT;
    const firstRoot = await mkdtemp(path.join(os.tmpdir(), 'rey30-asset-history-root-a-'));
    const secondRoot = await mkdtemp(path.join(os.tmpdir(), 'rey30-asset-history-root-b-'));
    cleanupDirs.add(firstRoot);
    cleanupDirs.add(secondRoot);

    try {
      process.env.REY30_ASSET_ROOT = firstRoot;
      const formData = new FormData();
      formData.append(
        'files',
        new File([Uint8Array.from([103, 108, 84, 70, 51, 52, 53, 54])], 'sentinel.glb', {
          type: 'model/gltf-binary',
        })
      );

      const uploadResponse = await assetsPost(
        buildAuthedRequest('http://localhost/api/assets', token, formData, 'Star Forge')
      );
      const uploadPayload = await uploadResponse.json();
      expect(uploadResponse.status).toBe(200);

      const uploadedAsset = uploadPayload.assets[0];
      const patchResponse = await assetsPatch(
        buildAuthedJsonRequest('PATCH', 'http://localhost/api/assets', token, {
          updates: [
            {
              id: uploadedAsset.id,
              path: uploadedAsset.path,
              metadata: {
                favorite: true,
                tags: ['sentinel'],
              },
            },
          ],
        })
      );
      expect(patchResponse.status).toBe(200);

      const sameProjectHistoryResponse = await assetHistoryGet(
        buildAuthedGetRequest(
          `http://localhost/api/assets/history?path=${encodeURIComponent(uploadedAsset.path)}`,
          token,
          'Star Forge'
        )
      );
      const sameProjectHistoryPayload = await sameProjectHistoryResponse.json();
      expect(sameProjectHistoryResponse.status).toBe(200);
      expect(sameProjectHistoryPayload.entries).toHaveLength(1);

      const differentProjectHistoryResponse = await assetHistoryGet(
        buildAuthedGetRequest(
          `http://localhost/api/assets/history?path=${encodeURIComponent(uploadedAsset.path)}`,
          token,
          'Nebula Yard'
        )
      );
      const differentProjectHistoryPayload = await differentProjectHistoryResponse.json();
      expect(differentProjectHistoryResponse.status).toBe(200);
      expect(differentProjectHistoryPayload.entries).toEqual([]);

      process.env.REY30_ASSET_ROOT = secondRoot;
      const secondRootHistoryResponse = await assetHistoryGet(
        buildAuthedGetRequest(
          `http://localhost/api/assets/history?path=${encodeURIComponent(uploadedAsset.path)}`,
          token,
          'Star Forge'
        )
      );
      const secondRootHistoryPayload = await secondRootHistoryResponse.json();
      expect(secondRootHistoryResponse.status).toBe(200);
      expect(secondRootHistoryPayload.entries).toEqual([]);

      process.env.REY30_ASSET_ROOT = firstRoot;
      const rereadHistoryResponse = await assetHistoryGet(
        buildAuthedGetRequest(
          `http://localhost/api/assets/history?path=${encodeURIComponent(uploadedAsset.path)}`,
          token,
          'Star Forge'
        )
      );
      const rereadHistoryPayload = await rereadHistoryResponse.json();
      expect(rereadHistoryResponse.status).toBe(200);
      expect(rereadHistoryPayload.entries).toHaveLength(1);
    } finally {
      if (previousRoot === undefined) delete process.env.REY30_ASSET_ROOT;
      else process.env.REY30_ASSET_ROOT = previousRoot;
    }
  });
});
