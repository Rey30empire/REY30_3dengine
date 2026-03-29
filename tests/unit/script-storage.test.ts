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
  'REY30_SCRIPT_STORAGE_BACKEND',
  'REY30_SCRIPT_BLOB_STORE',
  'REY30_SCRIPT_ROOT',
] as const;
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
    const previousValue = previousEnv.get(key);
    if (previousValue === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = previousValue;
    }
  }

  blobData.clear();
  vi.clearAllMocks();
  vi.resetModules();
});

describe('script storage backend selection', () => {
  it('defaults to filesystem outside Netlify', async () => {
    const { resolveScriptStorageBackend, resolveScriptStorageScope } = await import(
      '@/app/api/scripts/shared'
    );

    expect(resolveScriptStorageBackend()).toBe('filesystem');
    expect(resolveScriptStorageScope()).toBe('filesystem');
  });

  it('switches to a deploy-scoped blob store on Netlify previews', async () => {
    process.env.NETLIFY = 'true';
    process.env.CONTEXT = 'deploy-preview';

    const { getScriptStorageStatus } = await import('@/lib/server/script-storage');
    const status = await getScriptStorageStatus();

    expect(status).toMatchObject({
      available: true,
      backend: 'netlify-blobs',
      scope: 'deploy',
      storeName: 'rey30-scripts',
    });
    expect(getDeployStoreMock).toHaveBeenCalledWith('rey30-scripts');
    expect(getStoreMock).not.toHaveBeenCalled();
  });

  it('round-trips scripts through a production global blob store', async () => {
    process.env.NETLIFY = 'true';
    process.env.CONTEXT = 'production';
    process.env.REY30_SCRIPT_BLOB_STORE = 'custom-script-store';

    const {
      deleteStoredScript,
      getStoredScript,
      listStoredScripts,
      upsertStoredScript,
    } = await import('@/lib/server/script-storage');

    const saved = await upsertStoredScript('autogen/PlayerController.ts', 'export const speed = 3;\n');
    expect(saved.relativePath).toBe('autogen/PlayerController.ts');
    expect(saved.size).toBeGreaterThan(0);
    expect(getStoreMock).toHaveBeenCalledWith('custom-script-store');
    expect(getDeployStoreMock).not.toHaveBeenCalled();

    const loaded = await getStoredScript('autogen/PlayerController.ts');
    expect(loaded?.content).toBe('export const speed = 3;\n');

    const listed = await listStoredScripts();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.relativePath).toBe('autogen/PlayerController.ts');

    await deleteStoredScript('autogen/PlayerController.ts');
    expect(await getStoredScript('autogen/PlayerController.ts')).toBeNull();
  });

  it('honors an explicit filesystem override even on Netlify', async () => {
    process.env.NETLIFY = 'true';
    process.env.CONTEXT = 'production';
    process.env.REY30_SCRIPT_STORAGE_BACKEND = 'filesystem';

    const { getScriptStorageInfo } = await import('@/lib/server/script-storage');
    const info = getScriptStorageInfo();

    expect(info.backend).toBe('filesystem');
    expect(info.scope).toBe('filesystem');
    expect(info.root).toBeTruthy();
  });
});
