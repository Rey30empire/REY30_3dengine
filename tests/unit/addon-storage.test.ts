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
const getStoredPackageMock = vi.fn();
const listStoredPackagesMock = vi.fn(async () => []);
const ENV_KEYS = [
  'NETLIFY',
  'CONTEXT',
  'DEPLOY_ID',
  'REY30_ADDON_STORAGE_BACKEND',
  'REY30_ADDON_BLOB_STORE',
  'REY30_ADDON_ROOT',
];
const previousEnv = new Map<string, string | undefined>();

vi.mock('@netlify/blobs', () => ({
  getStore: getStoreMock,
  getDeployStore: getDeployStoreMock,
}));

vi.mock('@/lib/server/package-storage', () => ({
  getStoredPackage: getStoredPackageMock,
  listStoredPackages: listStoredPackagesMock,
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

describe('addon storage backend selection', () => {
  it('defaults to filesystem outside Netlify', async () => {
    const { resolveAddonStorageBackend, resolveAddonStorageScope } = await import(
      '@/app/api/addons/shared'
    );

    expect(resolveAddonStorageBackend()).toBe('filesystem');
    expect(resolveAddonStorageScope()).toBe('filesystem');
  });

  it('round-trips addons through a production global blob store with checksum metadata', async () => {
    process.env.NETLIFY = 'true';
    process.env.CONTEXT = 'production';
    process.env.REY30_ADDON_BLOB_STORE = 'custom-addon-store';

    const { getStoredAddon, listStoredAddons, upsertStoredAddon } = await import(
      '@/lib/server/addon-storage'
    );

    const saved = await upsertStoredAddon({
      name: 'Animation Boost',
      category: 'animation',
      permissions: ['assets', 'scene'],
      workspaceHints: ['animation', 'scene'],
      description: 'Addon de animacion local',
    });

    expect(saved.addon.id).toBe('Animation_Boost');
    expect(saved.addon.storageLocation).toBe('netlify-blobs');
    expect(saved.addon.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(getStoreMock).toHaveBeenCalledWith('custom-addon-store');

    const loaded = await getStoredAddon('Animation_Boost');
    expect(loaded?.addon.name).toBe('Animation Boost');
    expect(loaded?.addon.category).toBe('animation');

    const listed = await listStoredAddons();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.storage.storeName).toBe('custom-addon-store');
  });

  it('installs addon metadata from a stored package when sourcePackagePath is provided', async () => {
    process.env.REY30_ADDON_STORAGE_BACKEND = 'filesystem';
    getStoredPackageMock.mockResolvedValue({
      relativePath: 'HeroPack.package.json',
      filePath: 'packages/HeroPack.package.json',
      package: {
        name: 'HeroPack',
        kinds: ['animation', 'character'],
        assets: [{ id: 'asset-1', name: 'HeroRig', type: 'prefab', path: 'download/hero.glb' }],
      },
    });

    const { upsertStoredAddon } = await import('@/lib/server/addon-storage');
    const saved = await upsertStoredAddon({
      sourcePackagePath: 'HeroPack.package.json',
    });

    expect(saved.addon.name).toBe('HeroPack');
    expect(saved.addon.sourcePackagePath).toBe('HeroPack.package.json');
    expect(saved.addon.assetCount).toBe(1);
    expect(saved.addon.workspaceHints).toContain('animation');
    expect(saved.addon.permissions).toContain('assets');
  });
});
