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
const upsertStoredPackageMock = vi.fn();

vi.mock('@/lib/security/auth', () => ({
  requireSession: requireSessionMock,
  authErrorToResponse: authErrorToResponseMock,
}));

vi.mock('@/lib/server/package-storage', () => ({
  upsertStoredPackage: upsertStoredPackageMock,
}));

describe('packages route', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('persists packages through the shared storage layer and returns storage metadata', async () => {
    requireSessionMock.mockResolvedValue({
      id: 'editor-1',
      role: 'EDITOR',
      email: 'editor@example.com',
    });
    upsertStoredPackageMock.mockResolvedValue({
      name: 'HeroPack.package.json',
      filePath: 'packages/HeroPack.package.json',
      package: {
        name: 'HeroPack',
        kinds: ['character'],
        assets: [],
        createdAt: '2026-04-04T00:00:00.000Z',
        updatedAt: '2026-04-04T00:00:00.000Z',
        version: 2,
        checksum: 'abc123',
        storageLocation: 'netlify-blobs',
      },
      storage: {
        key: 'HeroPack.package.json',
        backend: 'netlify-blobs',
        scope: 'global',
        storeName: 'rey30-packages',
        checksum: 'abc123',
      },
    });

    const { POST } = await import('@/app/api/packages/route');
    const response = await POST(
      new NextRequest('http://localhost/api/packages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'HeroPack', kinds: ['character'], assets: [] }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.name).toBe('HeroPack.package.json');
    expect(payload.path).toBe('packages/HeroPack.package.json');
    expect(payload.storage).toMatchObject({
      backend: 'netlify-blobs',
      scope: 'global',
      storeName: 'rey30-packages',
    });
    expect(upsertStoredPackageMock).toHaveBeenCalledWith({
      name: 'HeroPack',
      kinds: ['character'],
      assets: [],
    });
  });
});
