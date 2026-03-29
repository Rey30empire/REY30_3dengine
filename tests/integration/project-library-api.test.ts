import { afterEach, describe, expect, it } from 'vitest';
import { access, mkdtemp, readFile, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { UserRole } from '@prisma/client';
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { GET as materialsGet, POST as materialsPost, DELETE as materialsDelete } from '@/app/api/materials/route';
import {
  GET as modifierPresetsGet,
  POST as modifierPresetsPost,
  DELETE as modifierPresetsDelete,
} from '@/app/api/modifier-presets/route';
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

      const dbPayload = JSON.parse(
        await readFile(path.join(assetRoot, '..', 'assets-db.json'), 'utf-8')
      ) as {
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

      const dbPayload = JSON.parse(
        await readFile(path.join(assetRoot, '..', 'assets-db.json'), 'utf-8')
      ) as {
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

      const dbPayloadAfterDelete = JSON.parse(
        await readFile(path.join(assetRoot, '..', 'assets-db.json'), 'utf-8')
      ) as {
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
});
