import { afterEach, describe, expect, it } from 'vitest';
import { access, mkdtemp, readFile, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { UserRole } from '@prisma/client';
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getAssetDbPath } from '@/engine/assets/pipeline';
import { POST as texturePaintPersistPost } from '@/app/api/texture-paint/persist/route';
import { createSessionForUser, SESSION_COOKIE_NAME } from '@/lib/security/auth';

const cleanupUserIds = new Set<string>();
const cleanupDirs = new Set<string>();

function buildAuthedRequest(
  url: string,
  token: string,
  body: FormData,
  projectName = 'Star Forge'
) {
  const headers = new Headers();
  headers.set('cookie', `${SESSION_COOKIE_NAME}=${token}`);
  headers.set('x-rey30-project', projectName);
  return new NextRequest(url, {
    method: 'POST',
    headers,
    body,
  });
}

async function createEditorSession() {
  const user = await db.user.create({
    data: {
      email: `texture-paint-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`,
      role: UserRole.EDITOR,
    },
  });
  cleanupUserIds.add(user.id);

  const { token } = await createSessionForUser(user.id);
  return { token, userId: user.id };
}

async function withTempAssetRoot<T>(run: (assetRoot: string) => Promise<T>) {
  const previousRoot = process.env.REY30_ASSET_ROOT;
  const assetRoot = await mkdtemp(path.join(os.tmpdir(), 'rey30-texture-paint-'));
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

describe('Texture paint persist API', () => {
  it('persists painted texture maps into the asset pipeline', async () => {
    await withTempAssetRoot(async (assetRoot) => {
      const { token } = await createEditorSession();

      const formData = new FormData();
      formData.append(
        'file',
        new File([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])], 'hull.png', {
          type: 'image/png',
        })
      );
      formData.append('name', 'Hull_Base');
      formData.append('slot', 'albedo');
      formData.append('entityName', 'HullMesh');
      formData.append('entityId', 'entity-hull');
      formData.append('resolution', '2048');

      const response = await texturePaintPersistPost(
        buildAuthedRequest(
          'http://localhost/api/texture-paint/persist',
          token,
          formData,
          'Star Forge'
        )
      );
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.success).toBe(true);
      expect(payload.projectKey).toBe('star_forge');
      expect(payload.slot).toBe('albedo');
      expect(payload.asset).toEqual(
        expect.objectContaining({
          name: 'Hull_Base',
          type: 'texture',
          metadata: expect.objectContaining({
            texturePaint: true,
            entityId: 'entity-hull',
            entityName: 'HullMesh',
            slot: 'albedo',
            projectKey: 'star_forge',
            resolution: 2048,
          }),
        })
      );

      const paintDir = path.join(assetRoot, 'texture', 'paint', 'star_forge');
      const savedFile = path.join(paintDir, path.basename(payload.asset.path));
      await expect(access(savedFile)).resolves.toBeUndefined();

      const dbPayload = JSON.parse(await readFile(getAssetDbPath(), 'utf-8')) as {
        assets: Array<{ path: string; metadata?: Record<string, unknown> }>;
      };
      expect(dbPayload.assets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: toWorkspaceRelative(savedFile),
            metadata: expect.objectContaining({
              texturePaint: true,
              entityId: 'entity-hull',
              entityName: 'HullMesh',
              slot: 'albedo',
              projectKey: 'star_forge',
              resolution: 2048,
            }),
          }),
        ])
      );
    });
  });

  it('overwrites the same painted slot deterministically without duplicating the asset row', async () => {
    await withTempAssetRoot(async (assetRoot) => {
      const { token } = await createEditorSession();

      const buildPaintBody = (bytes: number[]) => {
        const formData = new FormData();
        formData.append(
          'file',
          new File([Uint8Array.from(bytes)], 'trim.png', { type: 'image/png' })
        );
        formData.append('name', 'Hull Trim');
        formData.append('slot', 'metallic');
        formData.append('entityName', 'HullMesh');
        formData.append('entityId', 'entity-hull');
        return formData;
      };

      const firstResponse = await texturePaintPersistPost(
        buildAuthedRequest(
          'http://localhost/api/texture-paint/persist',
          token,
          buildPaintBody([1, 2, 3, 4]),
          'Star Forge'
        )
      );
      const firstPayload = await firstResponse.json();
      expect(firstResponse.status).toBe(200);

      const secondResponse = await texturePaintPersistPost(
        buildAuthedRequest(
          'http://localhost/api/texture-paint/persist',
          token,
          buildPaintBody([9, 8, 7, 6]),
          'Star Forge'
        )
      );
      const secondPayload = await secondResponse.json();
      expect(secondResponse.status).toBe(200);

      expect(secondPayload.asset.path).toBe(firstPayload.asset.path);
      expect(secondPayload.asset.name).toBe('Hull_Trim');

      const savedFile = path.join(
        assetRoot,
        'texture',
        'paint',
        'star_forge',
        'entity-hull__metallic.png'
      );
      await expect(access(savedFile)).resolves.toBeUndefined();
      expect(Array.from(await readFile(savedFile))).toEqual([9, 8, 7, 6]);

      const dbPayload = JSON.parse(await readFile(getAssetDbPath(), 'utf-8')) as {
        assets: Array<{ path: string; name: string; metadata?: Record<string, unknown> }>;
      };
      const rows = dbPayload.assets.filter(
        (asset) => asset.path === toWorkspaceRelative(savedFile)
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        name: 'Hull_Trim',
        metadata: expect.objectContaining({
          texturePaint: true,
          stableKey: 'star_forge:entity-hull:metallic',
        }),
      });
    });
  });
});
