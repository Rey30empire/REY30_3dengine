import { afterEach, describe, expect, it } from 'vitest';
import { access, mkdtemp, readFile, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { UserRole } from '@prisma/client';
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { POST as compositorPersistPost } from '@/app/api/compositor/persist/route';
import { createSessionForUser, SESSION_COOKIE_NAME } from '@/lib/security/auth';

const cleanupUserIds = new Set<string>();
const cleanupDirs = new Set<string>();

function buildAuthedRequest(
  url: string,
  token: string,
  body: Record<string, unknown>,
  projectName = 'Star Forge'
) {
  const headers = new Headers();
  headers.set('cookie', `${SESSION_COOKIE_NAME}=${token}`);
  headers.set('content-type', 'application/json');
  headers.set('x-rey30-project', projectName);
  return new NextRequest(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

async function createEditorSession() {
  const user = await db.user.create({
    data: {
      email: `compositor-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`,
      role: UserRole.EDITOR,
    },
  });
  cleanupUserIds.add(user.id);

  const { token } = await createSessionForUser(user.id);
  return { token, userId: user.id };
}

async function withTempAssetRoot<T>(run: (assetRoot: string) => Promise<T>) {
  const previousRoot = process.env.REY30_ASSET_ROOT;
  const assetRoot = await mkdtemp(path.join(os.tmpdir(), 'rey30-compositor-'));
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

describe('Compositor persist API', () => {
  it('persists still captures and video job packages into the asset pipeline', async () => {
    await withTempAssetRoot(async (assetRoot) => {
      const { token } = await createEditorSession();

      const stillResponse = await compositorPersistPost(
        buildAuthedRequest('http://localhost/api/compositor/persist', token, {
          mode: 'still',
          name: 'Arena Hero',
          sceneName: 'Arena',
          dataUrl:
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+tm7kAAAAASUVORK5CYII=',
        })
      );
      const stillPayload = await stillResponse.json();

      expect(stillResponse.status).toBe(200);
      expect(stillPayload.asset).toEqual(
        expect.objectContaining({
          type: 'texture',
          metadata: expect.objectContaining({
            compositorStill: true,
            sceneName: 'Arena',
            projectKey: 'star_forge',
          }),
        })
      );

      const stillFile = path.join(assetRoot, 'texture', 'compositor', 'star_forge', path.basename(stillPayload.asset.path));
      await expect(access(stillFile)).resolves.toBeUndefined();

      const jobResponse = await compositorPersistPost(
        buildAuthedRequest('http://localhost/api/compositor/persist', token, {
          mode: 'video_job',
          name: 'Arena Trailer',
          sceneName: 'Arena',
          documentJson: JSON.stringify({
            version: 1,
            createdAt: new Date().toISOString(),
            projectName: 'Star Forge',
            sceneName: 'Arena',
            lookSummary: 'bloom 0.95 · tone aces',
            prompt: 'Create a polished cinematic video shot.',
            shot: {
              title: 'Reveal',
              subject: 'mech hero',
              durationSeconds: 6,
              aspectRatio: '16:9',
              cameraMove: 'orbit',
              notes: '',
            },
          }),
        })
      );
      const jobPayload = await jobResponse.json();

      expect(jobResponse.status).toBe(200);
      expect(jobPayload.asset).toEqual(
        expect.objectContaining({
          type: 'video',
          metadata: expect.objectContaining({
            compositorVideoJob: true,
            sceneName: 'Arena',
            projectKey: 'star_forge',
          }),
        })
      );

      const jobFile = path.join(assetRoot, 'video', 'jobs', 'star_forge', path.basename(jobPayload.asset.path));
      await expect(access(jobFile)).resolves.toBeUndefined();
      await expect(readFile(jobFile, 'utf-8')).resolves.toContain('"sceneName":"Arena"');

      const dbPayload = JSON.parse(
        await readFile(path.join(assetRoot, '..', 'assets-db.json'), 'utf-8')
      ) as {
        assets: Array<{ path: string; metadata?: Record<string, unknown> }>;
      };
      expect(dbPayload.assets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: toWorkspaceRelative(stillFile),
            metadata: expect.objectContaining({
              compositorStill: true,
            }),
          }),
          expect.objectContaining({
            path: toWorkspaceRelative(jobFile),
            metadata: expect.objectContaining({
              compositorVideoJob: true,
            }),
          }),
        ])
      );
    });
  });
});
