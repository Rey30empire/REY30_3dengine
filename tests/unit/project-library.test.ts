import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readdir, readFile, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  listProjectLibraryEntries,
  parseProjectLibraryRecord,
  runProjectLibraryMutation,
  writeProjectLibraryEntry,
} from '@/lib/server/projectLibrary';

const cleanupDirs = new Set<string>();

async function withTempAssetRoot<T>(run: (assetRoot: string) => Promise<T>) {
  const env = process.env as Record<string, string | undefined>;
  const previousRoot = env.REY30_ASSET_ROOT;
  const assetRoot = await mkdtemp(path.join(os.tmpdir(), 'rey30-project-library-unit-'));
  cleanupDirs.add(assetRoot);
  env.REY30_ASSET_ROOT = assetRoot;

  try {
    return await run(assetRoot);
  } finally {
    if (previousRoot === undefined) {
      delete env.REY30_ASSET_ROOT;
    } else {
      env.REY30_ASSET_ROOT = previousRoot;
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

describe('project library', () => {
  it('serializes library mutations in process order', async () => {
    const events: string[] = [];

    const first = runProjectLibraryMutation(async () => {
      events.push('first:start');
      await new Promise((resolve) => setTimeout(resolve, 20));
      events.push('first:end');
    });

    const second = runProjectLibraryMutation(async () => {
      events.push('second:start');
      events.push('second:end');
    });

    await Promise.all([first, second]);

    expect(events).toEqual([
      'first:start',
      'first:end',
      'second:start',
      'second:end',
    ]);
  });

  it('writes library entries atomically without leaving temp files behind', async () => {
    await withTempAssetRoot(async (assetRoot) => {
      await writeProjectLibraryEntry({
        kind: 'material',
        projectKey: 'Star Forge',
        name: 'Hull Steel',
        definition: {
          id: 'hull_steel',
          roughness: 0.38,
        },
      });

      await writeProjectLibraryEntry({
        kind: 'material',
        projectKey: 'Star Forge',
        name: 'Hull Steel',
        definition: {
          id: 'hull_steel',
          roughness: 0.12,
          metallic: 1,
        },
      });

      const targetDir = path.join(assetRoot, 'material', 'library', 'star_forge');
      const files = await readdir(targetDir);
      expect(files).toEqual(['Hull_Steel.json']);

      const stored = JSON.parse(
        await readFile(path.join(targetDir, 'Hull_Steel.json'), 'utf-8')
      ) as Record<string, unknown>;
      expect(stored).toMatchObject({
        id: 'hull_steel',
        roughness: 0.12,
        metallic: 1,
      });

      const listed = await listProjectLibraryEntries({
        kind: 'material',
        projectKey: 'Star Forge',
        parser: parseProjectLibraryRecord,
      });
      expect(listed).toEqual([
        expect.objectContaining({
          name: 'Hull_Steel',
          definition: expect.objectContaining({
            roughness: 0.12,
            metallic: 1,
          }),
        }),
      ]);
    });
  });
});
