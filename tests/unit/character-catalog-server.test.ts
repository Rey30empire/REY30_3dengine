import { afterEach, describe, expect, it, vi } from 'vitest';

const listProjectLibraryEntriesMock = vi.fn();
const listModularCharactersMock = vi.fn();

vi.mock('@/lib/server/projectLibrary', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/projectLibrary')>(
    '@/lib/server/projectLibrary'
  );
  return {
    ...actual,
    listProjectLibraryEntries: listProjectLibraryEntriesMock,
  };
});

vi.mock('@/lib/server/modular-character-service', () => ({
  listModularCharacters: listModularCharactersMock,
}));

describe('character catalog server', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('publishes common package urls for builder presets and modular characters', async () => {
    listProjectLibraryEntriesMock.mockResolvedValue([
      {
        name: 'Hero_Loadout',
        path: 'public/library/character_preset/library/star_forge/Hero_Loadout.json',
        projectKey: 'star_forge',
        scope: 'project',
        definition: {
          id: 'preset_hero',
          name: 'Hero Loadout',
          createdAt: '2026-04-05T09:00:00.000Z',
          updatedAt: '2026-04-05T11:00:00.000Z',
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
            colors: {},
          },
        },
      },
    ]);
    listModularCharactersMock.mockResolvedValue({
      items: [
        {
          id: 'mod_char_1',
          projectId: 'proj_1',
          projectName: 'Side Quest',
          projectSlug: 'side_quest',
          name: 'Hero Modular',
          slug: 'hero_modular',
          exportProfile: 'unity-ready',
          sourceFormat: 'glb',
          meshCount: 4,
          materialCount: 2,
          animationCount: 1,
          hasRig: true,
          partCount: 3,
          createdAt: '2026-04-05T08:00:00.000Z',
          updatedAt: '2026-04-05T12:00:00.000Z',
          downloadUrl: '/api/modular-characters/mod_char_1/download',
          originalDownloadUrl: '/api/modular-characters/mod_char_1/original',
          parts: [],
        },
      ],
    });

    const { listCharacterCatalog } = await import('@/lib/server/character-catalog');
    const catalog = await listCharacterCatalog({
      userId: 'viewer-1',
      projectKey: 'star_forge',
    });

    expect(catalog.summary).toMatchObject({
      totalCount: 2,
      builderPresetCount: 1,
      modularCharacterCount: 1,
      currentProjectCount: 1,
      otherProjectCount: 1,
    });
    expect(catalog.entries[0]).toMatchObject({
      id: 'preset_hero',
      kind: 'builder_preset',
      actions: {
        packageUrl:
          '/api/character/package?kind=builder_preset&name=Hero%20Loadout&projectKey=star_forge',
        downloadUrl:
          '/api/character/presets/download?name=Hero%20Loadout&projectKey=star_forge',
      },
    });
    expect(catalog.entries[1]).toMatchObject({
      id: 'mod_char_1',
      kind: 'modular_character',
      projectMatch: 'other-project',
      actions: {
        packageUrl:
          '/api/character/package?kind=modular_character&id=mod_char_1&projectKey=side_quest',
        downloadUrl: '/api/modular-characters/mod_char_1/download',
        originalDownloadUrl: '/api/modular-characters/mod_char_1/original',
      },
    });
  });
});
