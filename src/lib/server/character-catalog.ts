import type { SavedModularCharacterSummary } from '@/engine/modular-character';
import type { StoredCharacterPreset } from '@/engine/character-builder';
import type {
  CharacterCatalogEntry,
  CharacterCatalogResponse,
} from '@/lib/character-catalog';
import { normalizeProjectKey } from '@/lib/project-key';
import { parseStoredCharacterPreset } from '@/lib/character-preset-document';
import { listModularCharacters } from '@/lib/server/modular-character-service';
import { listProjectLibraryEntries } from '@/lib/server/projectLibrary';

function countPresetParts(entry: StoredCharacterPreset) {
  return Object.values(entry.preset.parts).filter(
    (partId): partId is string => typeof partId === 'string' && partId.trim().length > 0
  ).length;
}

function countPresetVariants(entry: StoredCharacterPreset) {
  const materialCount = Object.values(entry.preset.materialVariants ?? {}).filter(
    (variantId): variantId is string =>
      typeof variantId === 'string' && variantId.trim().length > 0
  ).length;
  const colorCount = Object.values(entry.preset.colorVariants ?? entry.preset.colors ?? {}).filter(
    (variantId): variantId is string =>
      typeof variantId === 'string' && variantId.trim().length > 0
  ).length;
  return materialCount + colorCount;
}

function toBuilderPresetEntry(projectKey: string, entry: StoredCharacterPreset): CharacterCatalogEntry {
  const normalizedProjectKey = normalizeProjectKey(projectKey);
  const partCount = countPresetParts(entry);
  const variantCount = countPresetVariants(entry);
  const baseBody = entry.preset.baseBodyId?.trim() || 'sin base';

  return {
    id: entry.id,
    kind: 'builder_preset',
    workspace: 'builder',
    name: entry.name,
    description: `${partCount} pieza(s) activas · base ${baseBody}`,
    projectKey: normalizedProjectKey,
    projectName: normalizedProjectKey,
    projectMatch: 'current-project',
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    stats: {
      partCount,
      variantCount,
      hasRig: null,
      meshCount: null,
      materialCount: null,
      animationCount: null,
    },
    actions: {
      packageUrl: `/api/character/package?kind=builder_preset&name=${encodeURIComponent(
        entry.name
      )}&projectKey=${encodeURIComponent(normalizedProjectKey)}`,
      downloadUrl: `/api/character/presets/download?name=${encodeURIComponent(
        entry.name
      )}&projectKey=${encodeURIComponent(normalizedProjectKey)}`,
    },
  };
}

function toModularCharacterEntry(
  currentProjectKey: string,
  entry: SavedModularCharacterSummary
): CharacterCatalogEntry {
  const currentProject = normalizeProjectKey(currentProjectKey);
  const entryProjectKey = normalizeProjectKey(entry.projectSlug || entry.projectName);
  const projectMatch = entryProjectKey === currentProject ? 'current-project' : 'other-project';

  return {
    id: entry.id,
    kind: 'modular_character',
    workspace: 'modular-lab',
    name: entry.name,
    description: `${entry.projectName} · ${entry.partCount} parte(s) · ${entry.exportProfile}`,
    projectKey: entryProjectKey,
    projectName: entry.projectName,
    projectMatch,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    stats: {
      partCount: entry.partCount,
      variantCount: 0,
      hasRig: entry.hasRig,
      meshCount: entry.meshCount,
      materialCount: entry.materialCount,
      animationCount: entry.animationCount,
    },
    actions: {
      packageUrl: `/api/character/package?kind=modular_character&id=${encodeURIComponent(
        entry.id
      )}&projectKey=${encodeURIComponent(entryProjectKey)}`,
      downloadUrl: entry.downloadUrl,
      originalDownloadUrl: entry.originalDownloadUrl,
    },
  };
}

function compareEntries(left: CharacterCatalogEntry, right: CharacterCatalogEntry) {
  if (left.projectMatch !== right.projectMatch) {
    return left.projectMatch === 'current-project' ? -1 : 1;
  }
  return right.updatedAt.localeCompare(left.updatedAt);
}

export async function listCharacterCatalog(input: {
  userId: string;
  projectKey: string;
}): Promise<CharacterCatalogResponse> {
  const projectKey = normalizeProjectKey(input.projectKey);

  const [builderPresets, modularCharacters] = await Promise.all([
    listProjectLibraryEntries({
      kind: 'character_preset',
      projectKey,
      includeShared: false,
      parser: parseStoredCharacterPreset,
    }),
    listModularCharacters(input.userId),
  ]);

  const entries = [
    ...builderPresets.map((entry) => toBuilderPresetEntry(projectKey, entry.definition)),
    ...modularCharacters.items.map((entry) => toModularCharacterEntry(projectKey, entry)),
  ].sort(compareEntries);

  return {
    projectKey,
    entries,
    summary: {
      totalCount: entries.length,
      builderPresetCount: builderPresets.length,
      modularCharacterCount: modularCharacters.items.length,
      currentProjectCount: entries.filter((entry) => entry.projectMatch === 'current-project').length,
      otherProjectCount: entries.filter((entry) => entry.projectMatch === 'other-project').length,
      riggedModularCount: entries.filter(
        (entry) => entry.kind === 'modular_character' && entry.stats.hasRig === true
      ).length,
    },
  };
}
