import {
  CHARACTER_PART_CATEGORIES,
  type CharacterPartCategory,
  type CharacterPreset,
  type StoredCharacterPreset,
} from '@/engine/character-builder';

export interface CharacterPresetDocument {
  version: 1;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  preset: CharacterPreset;
  metadata?: CharacterPresetDocumentMetadata;
}

export interface CharacterPresetDocumentMetadata {
  projectKey: string;
  ownerUserId: string | null;
  ownerEmail?: string | null;
  source: 'character_builder';
  exportProfile: 'character_builder_preset';
  exportedAt: string;
}

export interface CharacterPresetExportManifest {
  version: 1;
  kind: 'character_builder_preset';
  projectKey: string;
  preset: CharacterPresetDocument;
  ownership: {
    ownerUserId: string | null;
    ownerEmail?: string | null;
  };
  export: {
    source: 'character_builder';
    exportProfile: 'character_builder_preset';
    exportedAt: string;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function readCategoryMap(value: unknown) {
  if (!isRecord(value)) {
    return {} as Partial<Record<CharacterPartCategory, string>>;
  }

  return CHARACTER_PART_CATEGORIES.reduce<Partial<Record<CharacterPartCategory, string>>>(
    (acc, category) => {
      const nextValue = readString(value[category]);
      if (nextValue) {
        acc[category] = nextValue;
      }
      return acc;
    },
    {}
  );
}

function readColorMap(value: unknown) {
  if (!isRecord(value)) {
    return {} as Record<string, string>;
  }

  return Object.entries(value).reduce<Record<string, string>>((acc, [key, entryValue]) => {
    const normalizedKey = readString(key);
    const normalizedValue = readString(entryValue);
    if (normalizedKey && normalizedValue) {
      acc[normalizedKey] = normalizedValue;
    }
    return acc;
  }, {});
}

function normalizePreset(value: unknown): CharacterPreset | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    baseBodyId: readString(value.baseBodyId) || null,
    parts: readCategoryMap(value.parts),
    materialVariants: readCategoryMap(value.materialVariants),
    colorVariants: readCategoryMap(value.colorVariants),
    colors: readColorMap(value.colors),
  };
}

function normalizeMetadata(value: unknown): CharacterPresetDocumentMetadata | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const projectKey = readString(value.projectKey);
  const source = readString(value.source);
  const exportProfile = readString(value.exportProfile);
  const exportedAt = readString(value.exportedAt);
  const ownerUserId = readString(value.ownerUserId) || null;
  const ownerEmail = readString(value.ownerEmail) || null;

  if (
    !projectKey ||
    source !== 'character_builder' ||
    exportProfile !== 'character_builder_preset' ||
    !exportedAt
  ) {
    return undefined;
  }

  return {
    projectKey,
    ownerUserId,
    ownerEmail,
    source: 'character_builder',
    exportProfile: 'character_builder_preset',
    exportedAt,
  };
}

export function parseCharacterPresetDocument(value: unknown): CharacterPresetDocument | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = readString(value.id);
  const name = readString(value.name);
  const createdAt = readString(value.createdAt);
  const updatedAt = readString(value.updatedAt);
  const preset = normalizePreset(value.preset);

  if (!id || !name || !createdAt || !updatedAt || !preset) {
    return null;
  }

  return {
    version: 1,
    id,
    name,
    createdAt,
    updatedAt,
    preset,
    metadata: normalizeMetadata(value.metadata),
  };
}

export function buildCharacterPresetDocument(
  entry: StoredCharacterPreset,
  metadata?: Partial<CharacterPresetDocumentMetadata> | null
): CharacterPresetDocument {
  const exportedAt = readString(metadata?.exportedAt) || new Date().toISOString();
  const projectKey = readString(metadata?.projectKey);
  const ownerUserId = readString(metadata?.ownerUserId) || null;
  const ownerEmail = readString(metadata?.ownerEmail) || null;

  return {
    version: 1,
    id: entry.id,
    name: entry.name,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    preset: {
      baseBodyId: entry.preset.baseBodyId ?? null,
      parts: readCategoryMap(entry.preset.parts),
      materialVariants: readCategoryMap(entry.preset.materialVariants),
      colorVariants: readCategoryMap(entry.preset.colorVariants),
      colors: readColorMap(entry.preset.colors),
    },
    metadata: projectKey
      ? {
          projectKey,
          ownerUserId,
          ownerEmail,
          source: 'character_builder',
          exportProfile: 'character_builder_preset',
          exportedAt,
        }
      : undefined,
  };
}

export function parseStoredCharacterPreset(value: unknown): StoredCharacterPreset | null {
  const document = parseCharacterPresetDocument(value);
  if (!document) {
    return null;
  }

  return {
    id: document.id,
    name: document.name,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    preset: document.preset,
  };
}

export function buildCharacterPresetExportManifest(
  projectKey: string,
  preset: CharacterPresetDocument
): CharacterPresetExportManifest {
  return {
    version: 1,
    kind: 'character_builder_preset',
    projectKey,
    preset,
    ownership: {
      ownerUserId: preset.metadata?.ownerUserId ?? null,
      ownerEmail: preset.metadata?.ownerEmail ?? null,
    },
    export: {
      source: 'character_builder',
      exportProfile: 'character_builder_preset',
      exportedAt: preset.metadata?.exportedAt ?? new Date().toISOString(),
    },
  };
}
