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
const listCharacterCatalogMock = vi.fn();

vi.mock('@/lib/security/auth', () => ({
  requireSession: requireSessionMock,
  authErrorToResponse: authErrorToResponseMock,
}));

vi.mock('@/lib/server/character-catalog', () => ({
  listCharacterCatalog: listCharacterCatalogMock,
}));

describe('character catalog route', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns a unified character catalog for the active project', async () => {
    requireSessionMock.mockResolvedValue({
      id: 'editor-1',
      role: 'EDITOR',
      email: 'editor@example.com',
    });
    listCharacterCatalogMock.mockResolvedValue({
      projectKey: 'star_forge',
      summary: {
        totalCount: 3,
        builderPresetCount: 1,
        modularCharacterCount: 2,
        currentProjectCount: 2,
        otherProjectCount: 1,
        riggedModularCount: 1,
      },
      entries: [
        {
          id: 'preset_hero',
          kind: 'builder_preset',
          workspace: 'builder',
          name: 'Hero Preset',
          description: '4 pieza(s) activas · base mannequin_a',
          projectKey: 'star_forge',
          projectName: 'star_forge',
          projectMatch: 'current-project',
          createdAt: '2026-04-05T00:00:00.000Z',
          updatedAt: '2026-04-05T00:00:00.000Z',
          stats: {
            partCount: 4,
            variantCount: 2,
            hasRig: null,
            meshCount: null,
            materialCount: null,
            animationCount: null,
          },
        },
      ],
    });

    const { GET } = await import('@/app/api/character/catalog/route');
    const response = await GET(
      new NextRequest('http://localhost/api/character/catalog', {
        headers: {
          'x-rey30-project': 'Star Forge',
        },
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(requireSessionMock).toHaveBeenCalledWith(expect.any(NextRequest), 'VIEWER');
    expect(listCharacterCatalogMock).toHaveBeenCalledWith({
      userId: 'editor-1',
      projectKey: 'star_forge',
    });
    expect(payload.summary).toMatchObject({
      totalCount: 3,
      builderPresetCount: 1,
      modularCharacterCount: 2,
    });
    expect(payload.entries[0]).toMatchObject({
      kind: 'builder_preset',
      workspace: 'builder',
      name: 'Hero Preset',
    });
  });

  it('returns auth-safe errors when the session is missing', async () => {
    requireSessionMock.mockRejectedValue(new Error('UNAUTHORIZED'));

    const { GET } = await import('@/app/api/character/catalog/route');
    const response = await GET(new NextRequest('http://localhost/api/character/catalog'));
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error).toBe('Debes iniciar sesión o usar un token de acceso.');
  });
});
