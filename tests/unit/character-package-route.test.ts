import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { SavedModularCharacterDetail } from '@/engine/modular-character';
import type { CharacterPresetDocument } from '@/lib/character-preset-document';

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
const readProjectLibraryEntryMock = vi.fn();
const getModularCharacterDetailMock = vi.fn();
const upsertStoredPackageMock = vi.fn();

vi.mock('@/lib/security/auth', () => ({
  requireSession: requireSessionMock,
  authErrorToResponse: authErrorToResponseMock,
}));

vi.mock('@/lib/server/projectLibrary', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/projectLibrary')>(
    '@/lib/server/projectLibrary'
  );
  return {
    ...actual,
    readProjectLibraryEntry: readProjectLibraryEntryMock,
  };
});

vi.mock('@/lib/server/modular-character-service', () => ({
  getModularCharacterDetail: getModularCharacterDetailMock,
}));

vi.mock('@/lib/server/package-storage', () => ({
  upsertStoredPackage: upsertStoredPackageMock,
}));

function mockStoredPackage(name: string) {
  return {
    name,
    relativePath: `packages/${name}.package.json`,
    filePath: `C:/packages/${name}.package.json`,
    size: 1024,
    modifiedAt: '2026-04-05T12:00:00.000Z',
    package: {
      name,
      kinds: ['character'],
      assets: [],
      createdAt: '2026-04-05T12:00:00.000Z',
      updatedAt: '2026-04-05T12:00:00.000Z',
      version: 2,
      checksum: `checksum:${name}`,
      storageLocation: 'filesystem',
    },
    storage: {
      key: `packages/${name}.package.json`,
      backend: 'filesystem',
      scope: 'project',
      contentType: 'application/json; charset=utf-8',
      checksum: `checksum:${name}`,
      size: 1024,
      url: null,
    },
  };
}

function makeBuilderPresetDocument(): CharacterPresetDocument {
  return {
    version: 1,
    id: 'preset_hero',
    name: 'Hero Loadout',
    createdAt: '2026-04-05T10:00:00.000Z',
    updatedAt: '2026-04-05T11:00:00.000Z',
    metadata: {
      projectKey: 'star_forge',
      ownerUserId: 'owner-1',
      ownerEmail: 'owner@example.com',
      source: 'character_builder',
      exportProfile: 'character_builder_preset',
      exportedAt: '2026-04-05T11:00:00.000Z',
    },
    preset: {
      baseBodyId: 'mannequin_a',
      parts: {
        head: 'head_alpha',
        torso: 'torso_alpha',
      },
      materialVariants: {
        torso: 'metallic_red',
      },
      colorVariants: {
        torso: 'accent_blue',
      },
      colors: {
        accent: '#3b82f6',
      },
    },
  };
}

function makeModularDetail(): SavedModularCharacterDetail {
  return {
    id: 'mod_char_1',
    projectId: 'proj_1',
    projectName: 'Star Forge',
    projectSlug: 'star_forge',
    name: 'Hero Modular',
    slug: 'hero_modular',
    exportProfile: 'unity-ready',
    sourceFormat: 'glb',
    meshCount: 3,
    materialCount: 2,
    animationCount: 1,
    hasRig: true,
    partCount: 2,
    createdAt: '2026-04-05T09:00:00.000Z',
    updatedAt: '2026-04-05T11:00:00.000Z',
    downloadUrl: '/api/modular-characters/mod_char_1/download',
    originalDownloadUrl: '/api/modular-characters/mod_char_1/original',
    parts: [
      {
        id: 'part_head',
        name: 'Head',
        slug: 'head',
        partType: 'head',
        hasRig: true,
        materialNames: ['skin'],
        boneNames: ['Head'],
        downloadUrl: '/api/modular-characters/mod_char_1/parts/part_head/download',
      },
    ],
    metadata: {
      id: 'mod_char_1',
      projectId: 'proj_1',
      projectSlug: 'star_forge',
      name: 'Hero Modular',
      slug: 'hero_modular',
      exportProfile: 'unity-ready',
      sourceFormat: 'glb',
      originalDownloadMode: 'single-file',
      storageBackend: 'filesystem',
      uploadedAt: '2026-04-05T09:00:00.000Z',
      updatedAt: '2026-04-05T11:00:00.000Z',
      sourceFiles: [],
      manifestPath: 'star_forge/hero_modular_mod_char_1/metadata.json',
      unityManifestPath: 'star_forge/hero_modular_mod_char_1/unity-ready/assembly.json',
      originalPath: 'star_forge/hero_modular_mod_char_1/full_model/hero.glb',
      originalFiles: ['star_forge/hero_modular_mod_char_1/full_model/hero.glb'],
      previewPath: 'star_forge/hero_modular_mod_char_1/preview/preview.png',
      analysis: {
        meshCount: 3,
        materialCount: 2,
        animationCount: 1,
        hasRig: true,
      },
      parts: [
        {
          id: 'part_head',
          name: 'Head',
          slug: 'head',
          partType: 'head',
          category: 'head',
          storagePath: 'star_forge/hero_modular_mod_char_1/parts/head/head.glb',
          metadataPath: 'star_forge/hero_modular_mod_char_1/parts/head/metadata_head.json',
        },
      ],
    } as unknown as SavedModularCharacterDetail['metadata'],
  } as unknown as SavedModularCharacterDetail;
}

describe('character package route', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('exports a unified package document for builder presets', async () => {
    requireSessionMock.mockResolvedValue({
      id: 'viewer-1',
      role: 'VIEWER',
      email: 'viewer@example.com',
    });
    readProjectLibraryEntryMock.mockResolvedValue({
      name: 'Hero_Loadout',
      path: 'public/library/character_preset/library/star_forge/Hero_Loadout.json',
      projectKey: 'star_forge',
      scope: 'project',
      definition: makeBuilderPresetDocument(),
    });
    upsertStoredPackageMock.mockResolvedValue(
      mockStoredPackage('star_forge_Hero_Loadout_builder_package')
    );

    const { GET } = await import('@/app/api/character/package/route');
    const response = await GET(
      new NextRequest(
        'http://localhost/api/character/package?kind=builder_preset&name=Hero%20Loadout&projectKey=star_forge'
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toContain(
      'star_forge_Hero_Loadout_builder_package.character-package.json'
    );
    expect(readProjectLibraryEntryMock).toHaveBeenCalledWith({
      kind: 'character_preset',
      projectKey: 'star_forge',
      name: 'Hero_Loadout',
      scope: 'project',
      parser: expect.any(Function),
    });
    expect(upsertStoredPackageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'star_forge_Hero_Loadout_builder_package',
        kinds: ['character', 'builder_preset'],
        assets: [
          expect.objectContaining({
            id: 'preset_hero',
            type: 'character_preset',
          }),
        ],
      })
    );
    expect(payload).toMatchObject({
      packageName: 'star_forge_Hero_Loadout_builder_package',
      projectKey: 'star_forge',
      source: {
        kind: 'builder_preset',
        sourceId: 'preset_hero',
        workspace: 'builder',
      },
      ownership: {
        ownerUserId: 'owner-1',
        exportedByUserId: 'viewer-1',
      },
      payload: {
        kind: 'builder_preset',
        preset: {
          kind: 'character_builder_preset',
          projectKey: 'star_forge',
        },
      },
      storedPackage: {
        checksum: 'checksum:star_forge_Hero_Loadout_builder_package',
        storageBackend: 'filesystem',
      },
    });
  });

  it('exports a unified package document for modular characters', async () => {
    requireSessionMock.mockResolvedValue({
      id: 'viewer-1',
      role: 'VIEWER',
      email: 'viewer@example.com',
    });
    getModularCharacterDetailMock.mockResolvedValue(makeModularDetail());
    upsertStoredPackageMock.mockResolvedValue(
      mockStoredPackage('star_forge_Hero_Modular_modular_package')
    );

    const { GET } = await import('@/app/api/character/package/route');
    const response = await GET(
      new NextRequest(
        'http://localhost/api/character/package?kind=modular_character&id=mod_char_1&projectKey=star_forge'
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(getModularCharacterDetailMock).toHaveBeenCalledWith('viewer-1', 'mod_char_1');
    expect(upsertStoredPackageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'star_forge_Hero_Modular_modular_package',
        kinds: ['character', 'modular_character'],
        assets: expect.arrayContaining([
          expect.objectContaining({
            id: 'mod_char_1',
            type: 'character_manifest',
          }),
          expect.objectContaining({
            id: 'part_head',
            type: 'character_part',
          }),
        ]),
      })
    );
    expect(payload).toMatchObject({
      packageName: 'star_forge_Hero_Modular_modular_package',
      projectKey: 'star_forge',
      source: {
        kind: 'modular_character',
        sourceId: 'mod_char_1',
        workspace: 'modular-lab',
      },
      stats: {
        partCount: 2,
        hasRig: true,
      },
      payload: {
        kind: 'modular_character',
        character: {
          id: 'mod_char_1',
          name: 'Hero Modular',
        },
      },
      storedPackage: {
        checksum: 'checksum:star_forge_Hero_Modular_modular_package',
        storageScope: 'project',
      },
    });
  });
});
