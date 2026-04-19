import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const requireSessionMock = vi.fn();
const authErrorToResponseMock = vi.fn((error: unknown) =>
  Response.json(
    {
      error: String(error).includes('FORBIDDEN')
        ? 'No tienes permisos para esta acción.'
        : 'Debes iniciar sesión o usar un token de acceso.',
    },
    { status: String(error).includes('FORBIDDEN') ? 403 : 401 }
  )
);
const listStoredAddonsMock = vi.fn();
const listAddonInstallSourcesMock = vi.fn();
const getAddonStorageInfoMock = vi.fn();
const upsertStoredAddonMock = vi.fn();
const setStoredAddonEnabledMock = vi.fn();
const deleteStoredAddonMock = vi.fn();

vi.mock('@/lib/security/auth', () => ({
  requireSession: requireSessionMock,
  authErrorToResponse: authErrorToResponseMock,
}));

vi.mock('@/lib/server/addon-storage', () => ({
  listStoredAddons: listStoredAddonsMock,
  listAddonInstallSources: listAddonInstallSourcesMock,
  getAddonStorageInfo: getAddonStorageInfoMock,
  upsertStoredAddon: upsertStoredAddonMock,
  setStoredAddonEnabled: setStoredAddonEnabledMock,
  deleteStoredAddon: deleteStoredAddonMock,
}));

describe('addons route', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('lists installed addons and available package sources', async () => {
    requireSessionMock.mockResolvedValue({ id: 'viewer-1', role: 'VIEWER' });
    listStoredAddonsMock.mockResolvedValue([
      {
        addon: {
          id: 'animation_boost',
          name: 'Animation Boost',
          version: '1.0.0',
          enabled: true,
        },
        filePath: 'addons/animation_boost.addon.json',
        storage: {
          backend: 'netlify-blobs',
          scope: 'global',
          storeName: 'rey30-addons',
        },
      },
    ]);
    listAddonInstallSourcesMock.mockResolvedValue([
      {
        relativePath: 'HeroPack.package.json',
        package: {
          name: 'HeroPack',
          kinds: ['animation'],
          assets: [{ id: 'asset-1' }],
        },
        storage: {
          backend: 'netlify-blobs',
          scope: 'global',
        },
      },
    ]);
    getAddonStorageInfoMock.mockReturnValue({
      backend: 'netlify-blobs',
      scope: 'global',
      storeName: 'rey30-addons',
    });

    const { GET } = await import('@/app/api/addons/route');
    const response = await GET(new NextRequest('http://localhost/api/addons'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.addons).toHaveLength(1);
    expect(payload.packages[0]).toMatchObject({
      relativePath: 'HeroPack.package.json',
      assetCount: 1,
    });
    expect(payload.storage.storeName).toBe('rey30-addons');
  });

  it('installs an addon from manifest or package data', async () => {
    requireSessionMock.mockResolvedValue({ id: 'editor-1', role: 'EDITOR' });
    upsertStoredAddonMock.mockResolvedValue({
      addon: {
        id: 'animation_boost',
        name: 'Animation Boost',
        version: '1.0.0',
        enabled: true,
      },
      filePath: 'addons/animation_boost.addon.json',
      storage: {
        backend: 'netlify-blobs',
        scope: 'global',
        storeName: 'rey30-addons',
      },
    });

    const { POST } = await import('@/app/api/addons/route');
    const response = await POST(
      new NextRequest('http://localhost/api/addons', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sourcePackagePath: 'HeroPack.package.json',
          name: 'Animation Boost',
          permissions: ['assets', 'scene'],
        }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.addon.name).toBe('Animation Boost');
    expect(payload.path).toBe('addons/animation_boost.addon.json');
    expect(upsertStoredAddonMock).toHaveBeenCalledWith({
      sourcePackagePath: 'HeroPack.package.json',
      name: 'Animation Boost',
      permissions: ['assets', 'scene'],
    });
  });

  it('toggles addon enabled state', async () => {
    requireSessionMock.mockResolvedValue({ id: 'editor-1', role: 'EDITOR' });
    setStoredAddonEnabledMock.mockResolvedValue({
      addon: {
        id: 'animation_boost',
        name: 'Animation Boost',
        enabled: false,
      },
      filePath: 'addons/animation_boost.addon.json',
      storage: {
        backend: 'filesystem',
        scope: 'filesystem',
      },
    });

    const { PATCH } = await import('@/app/api/addons/route');
    const response = await PATCH(
      new NextRequest('http://localhost/api/addons', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: 'animation_boost', enabled: false }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.addon.enabled).toBe(false);
    expect(setStoredAddonEnabledMock).toHaveBeenCalledWith('animation_boost', false);
  });

  it('deletes an addon by id', async () => {
    requireSessionMock.mockResolvedValue({ id: 'editor-1', role: 'EDITOR' });
    deleteStoredAddonMock.mockResolvedValue(undefined);

    const { DELETE } = await import('@/app/api/addons/route');
    const response = await DELETE(
      new NextRequest('http://localhost/api/addons?id=animation_boost', {
        method: 'DELETE',
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(deleteStoredAddonMock).toHaveBeenCalledWith('animation_boost');
  });
});
