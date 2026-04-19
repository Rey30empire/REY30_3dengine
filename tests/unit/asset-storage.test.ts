import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type BlobEntry = {
  data: Uint8Array;
  metadata?: Record<string, unknown>;
};

const blobData = new Map<string, BlobEntry>();
const blobStoreMock = {
  get: vi.fn(async (key: string) => {
    const entry = blobData.get(key);
    if (!entry) return null;
    return entry.data.buffer.slice(
      entry.data.byteOffset,
      entry.data.byteOffset + entry.data.byteLength
    );
  }),
  getWithMetadata: vi.fn(async (key: string) => {
    const entry = blobData.get(key);
    if (!entry) return null;
    return {
      data: entry.data.buffer.slice(
        entry.data.byteOffset,
        entry.data.byteOffset + entry.data.byteLength
      ),
      metadata: entry.metadata,
    };
  }),
  set: vi.fn(async (key: string, value: Blob, options?: { metadata?: Record<string, unknown> }) => {
    const arrayBuffer = await value.arrayBuffer();
    blobData.set(key, {
      data: new Uint8Array(arrayBuffer),
      metadata: options?.metadata,
    });
  }),
  list: vi.fn(async () => ({
    blobs: Array.from(blobData.keys()).map((key) => ({
      key,
      etag: `etag:${key}`,
    })),
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
  'REY30_ASSET_STORAGE_BACKEND',
  'REY30_ASSET_BLOB_STORE',
  'REY30_ASSET_ROOT',
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

describe('asset storage backend selection', () => {
  it('defaults to filesystem outside Netlify', async () => {
    const { resolveAssetStorageBackend, resolveAssetStorageScope } = await import(
      '@/app/api/assets/shared'
    );

    expect(resolveAssetStorageBackend()).toBe('filesystem');
    expect(resolveAssetStorageScope()).toBe('filesystem');
  });

  it('round-trips asset binaries through a production global blob store', async () => {
    process.env.NETLIFY = 'true';
    process.env.CONTEXT = 'production';
    process.env.REY30_ASSET_BLOB_STORE = 'custom-asset-store';

    const {
      getAssetStorageStatus,
      getStoredAssetBinary,
      putStoredAssetBinary,
      deleteStoredAssetBinary,
    } = await import('@/lib/server/asset-storage');

    const status = await getAssetStorageStatus();
    expect(status).toMatchObject({
      available: true,
      backend: 'netlify-blobs',
      scope: 'global',
      storeName: 'custom-asset-store',
    });

    const saved = await putStoredAssetBinary({
      relativePath: 'mesh/uploads/star_forge/pilot.glb',
      data: Uint8Array.from([103, 108, 84, 70, 1, 2, 3, 4]),
      contentType: 'model/gltf-binary',
      checksum: 'sha256-pilot',
    });

    expect(saved.storage.backend).toBe('netlify-blobs');
    expect(saved.storage.scope).toBe('global');
    expect(saved.storage.storeName).toBe('custom-asset-store');
    expect(saved.storage.checksum).toBe('sha256-pilot');
    expect(saved.filePath).toBe('download/assets/mesh/uploads/star_forge/pilot.glb');
    expect(getStoreMock).toHaveBeenCalledWith('custom-asset-store');
    expect(getDeployStoreMock).not.toHaveBeenCalled();

    const loaded = await getStoredAssetBinary(saved.storage);
    expect(loaded?.buffer).toEqual(Buffer.from([103, 108, 84, 70, 1, 2, 3, 4]));
    expect(loaded?.contentType).toBe('model/gltf-binary');
    expect(loaded?.storage.checksum).toBe('sha256-pilot');

    await deleteStoredAssetBinary(saved.storage);
    expect(await getStoredAssetBinary(saved.storage)).toBeNull();
  });
});
