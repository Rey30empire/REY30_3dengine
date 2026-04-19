import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  clearCharacterGenerationStoreForTest,
  getCharacterGenerationJobRecord,
  patchCharacterGenerationJobRecord,
  upsertCharacterGenerationJobRecord,
} from '@/lib/server/character-generation-store';

const cleanupDirs = new Set<string>();
const ORIGINAL_ASSET_ROOT = process.env.REY30_ASSET_ROOT;

async function withTempAssetRoot<T>(run: () => Promise<T>) {
  const assetRoot = await mkdtemp(path.join(os.tmpdir(), 'rey30-character-store-'));
  cleanupDirs.add(assetRoot);
  process.env.REY30_ASSET_ROOT = assetRoot;
  try {
    await clearCharacterGenerationStoreForTest();
    return await run();
  } finally {
    if (ORIGINAL_ASSET_ROOT === undefined) {
      delete process.env.REY30_ASSET_ROOT;
    } else {
      process.env.REY30_ASSET_ROOT = ORIGINAL_ASSET_ROOT;
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

describe('character generation store', () => {
  it('persists and patches durable character job records', async () => {
    await withTempAssetRoot(async () => {
      await upsertCharacterGenerationJobRecord({
        jobId: 'job_123',
        userId: 'user-1',
        projectKey: 'star_forge',
        prompt: 'crea un guerrero',
        style: 'realista',
        targetEngine: 'generic',
        includeAnimations: true,
        includeBlendshapes: true,
        references: [],
        status: 'queued',
        progress: 0,
        stage: 'queued',
      });

      await patchCharacterGenerationJobRecord('job_123', (current) => ({
        ...current,
        status: 'completed',
        progress: 100,
        stage: 'completed',
        remotePackagePath: 'download/assets/generated-characters/star_forge/job_123',
        packageDirectoryPath: 'download/assets/generated-characters/star_forge/job_123',
        packageSummary: {
          vertexCount: 3,
          triangleCount: 1,
          rigBoneCount: 1,
          blendshapeCount: 0,
          textureCount: 6,
          materialCount: 1,
          animationCount: 1,
          prompt: 'crea un guerrero',
          style: 'realista',
          targetEngine: 'generic',
          generatedAt: '2026-04-03T00:00:00.000Z',
        },
        asset: {
          id: 'asset_1',
          name: 'CharacterPackage_job_123',
          type: 'prefab',
          path: 'download/assets/generated-characters/star_forge/job_123/package.json',
          size: 4096,
          createdAt: '2026-04-03T00:00:00.000Z',
          metadata: {
            characterPackage: true,
            characterJobId: 'job_123',
          },
        },
      }));

      const stored = await getCharacterGenerationJobRecord('job_123');
      expect(stored).toEqual(
        expect.objectContaining({
          status: 'completed',
          progress: 100,
          packageDirectoryPath: 'download/assets/generated-characters/star_forge/job_123',
          asset: expect.objectContaining({
            id: 'asset_1',
            type: 'prefab',
          }),
          packageSummary: expect.objectContaining({
            materialCount: 1,
            animationCount: 1,
          }),
        })
      );
    });
  });
});
