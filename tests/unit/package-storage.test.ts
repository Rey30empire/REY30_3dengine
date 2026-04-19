import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const blobData = new Map<string, unknown>();
const blobStoreMock = {
  get: vi.fn(async (key: string) => blobData.get(key) ?? null),
  setJSON: vi.fn(async (key: string, value: unknown) => {
    blobData.set(key, value);
  }),
  list: vi.fn(async () => ({
    blobs: Array.from(blobData.keys()).map((key) => ({ key, etag: `etag:${key}` })),
  })),
  delete: vi.fn(async (key: string) => {
    blobData.delete(key);
  }),
};

const getStoreMock = vi.fn(() => blobStoreMock);
const getDeployStoreMock = vi.fn(() => blobStoreMock);
const ENV_KEYS = [
  'NETLIFY',
  'CONTEXT',
  'DEPLOY_ID',
  'REY30_PACKAGE_STORAGE_BACKEND',
  'REY30_PACKAGE_BLOB_STORE',
  'REY30_PACKAGE_ROOT',
];
const previousEnv = new Map<string, string | undefined>();

vi.mock('@netlify/blobs', () => ({
  getStore: getStoreMock,
  getDeployStore: getDeployStoreMock,
}));

beforeEach(() => {
  blobData.clear();
  for (const key of ENV_KEYS) {
    previousEnv.set(key, process.env[key]);
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const previous = previousEnv.get(key);
    if (previous === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = previous;
    }
  }

  blobData.clear();
  vi.clearAllMocks();
  vi.resetModules();
});

describe('package storage backend selection', () => {
  it('defaults to filesystem outside Netlify', async () => {
    const { resolvePackageStorageBackend, resolvePackageStorageScope } = await import(
      '@/app/api/packages/shared'
    );

    expect(resolvePackageStorageBackend()).toBe('filesystem');
    expect(resolvePackageStorageScope()).toBe('filesystem');
  });

  it('switches to a deploy-scoped blob store on Netlify previews', async () => {
    process.env.NETLIFY = 'true';
    process.env.CONTEXT = 'deploy-preview';

    const { getPackageStorageStatus } = await import('@/lib/server/package-storage');
    const status = await getPackageStorageStatus();

    expect(status).toMatchObject({
      available: true,
      backend: 'netlify-blobs',
      scope: 'deploy',
      storeName: 'rey30-packages',
    });
    expect(getDeployStoreMock).toHaveBeenCalledWith('rey30-packages');
    expect(getStoreMock).not.toHaveBeenCalled();
  });

  it('round-trips packages through a production global blob store with checksum metadata', async () => {
    process.env.NETLIFY = 'true';
    process.env.CONTEXT = 'production';
    process.env.REY30_PACKAGE_BLOB_STORE = 'custom-package-store';

    const { getStoredPackage, listStoredPackages, upsertStoredPackage } = await import(
      '@/lib/server/package-storage'
    );

    const saved = await upsertStoredPackage({
      name: 'Hero Pack',
      kinds: ['character', 'scene'],
      assets: [{ id: 'asset-1', name: 'Hero', type: 'prefab', path: 'download/assets/hero.glb' }],
    });

    expect(saved.name).toBe('Hero_Pack.package.json');
    expect(saved.package.storageLocation).toBe('netlify-blobs');
    expect(saved.package.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(getStoreMock).toHaveBeenCalledWith('custom-package-store');

    const loaded = await getStoredPackage('Hero_Pack.package.json');
    expect(loaded?.package.assets).toHaveLength(1);
    expect(loaded?.package.checksum).toBe(saved.package.checksum);

    const listed = await listStoredPackages();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.storage.storeName).toBe('custom-package-store');
  });

  it('reads legacy filesystem package documents without migration', async () => {
    process.env.REY30_PACKAGE_STORAGE_BACKEND = 'filesystem';

    const { mkdtemp, writeFile } = await import('fs/promises');
    const os = await import('os');
    const path = await import('path');
    const root = await mkdtemp(path.join(os.tmpdir(), 'rey30-package-storage-'));
    process.env.REY30_PACKAGE_ROOT = root;

    try {
      await writeFile(
        path.join(root, 'Legacy.package.json'),
        JSON.stringify(
          {
            name: 'Legacy',
            kinds: ['scene'],
            assets: [{ id: 'asset-1', name: 'Scene', type: 'scene', path: 'download/assets/scene.json' }],
            createdAt: '2026-04-04T00:00:00.000Z',
            version: 1,
          },
          null,
          2
        ),
        'utf8'
      );

      const { getStoredPackage } = await import('@/lib/server/package-storage');
      const loaded = await getStoredPackage('Legacy.package.json');
      expect(loaded?.package.name).toBe('Legacy');
      expect(loaded?.package.version).toBe(1);
      expect(loaded?.package.storageLocation).toBe('filesystem');
      expect(loaded?.package.checksum).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      await (await import('fs/promises')).rm(root, { recursive: true, force: true });
    }
  });
});
