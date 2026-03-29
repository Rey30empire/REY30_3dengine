'use client';

import { consoleManager } from './ConsolePanel';
import type {
  CharacterAssetRecord,
  CharacterBuilderEngineAdapter,
  CharacterBuilderErrorReport,
  CharacterBuilderMessageLevel,
  CharacterPartVariant,
  StoredCharacterPreset,
} from '@/engine/character-builder';

const PRESET_STORAGE_KEY = 'rey30.characterBuilder.presets.v1';
const LIBRARY_INDEX_PATH = '/library/character-builder-library.json';

function variant(id: string, label: string, swatch?: string): NonNullable<CharacterAssetRecord['materialVariants']>[number] {
  return {
    id,
    label,
    swatch: swatch ?? null,
  };
}

type BuiltinCharacterMetadataEntry = {
  id: string;
  metadataPath: string;
  fallback: CharacterAssetRecord;
};

const BUILTIN_LIBRARY_MANIFEST: BuiltinCharacterMetadataEntry[] = [
  {
    id: 'mannequin_a',
    metadataPath: '/library/mannequin_a.metadata.json',
    fallback: {
      id: 'mannequin_a',
      name: 'Mannequin A',
      category: 'body',
      modelPath: '/library/mannequin_a.glb',
      thumbnailPath: '/library/mannequin_a.preview.png',
      skeletonId: 'human_base_v1',
      bodyType: 'unisex_medium',
      attachmentSocket: 'root_socket',
      isBaseBody: true,
      tags: ['starter', 'human'],
      source: 'public-library',
    },
  },
  {
    id: 'mannequin_b',
    metadataPath: '/library/mannequin_b.metadata.json',
    fallback: {
      id: 'mannequin_b',
      name: 'Mannequin B',
      category: 'body',
      modelPath: '/library/mannequin_b.glb',
      thumbnailPath: '/library/mannequin_b.preview.png',
      skeletonId: 'human_base_v1',
      bodyType: 'unisex_medium',
      attachmentSocket: 'root_socket',
      isBaseBody: true,
      tags: ['hero', 'human'],
      source: 'public-library',
    },
  },
  {
    id: 'torso_fit',
    metadataPath: '/library/torso_fit.metadata.json',
    fallback: {
      id: 'torso_fit',
      name: 'Torso Fit',
      category: 'torso',
      modelPath: '/library/torso_fit.glb',
      thumbnailPath: '/library/torso_fit.preview.png',
      skeletonId: 'human_base_v1',
      bodyType: 'unisex_medium',
      attachmentSocket: 'torso_socket',
      tags: ['starter'],
      source: 'public-library',
    },
  },
  {
    id: 'head_base',
    metadataPath: '/library/head_base.metadata.json',
    fallback: {
      id: 'head_base',
      name: 'Head Base',
      category: 'head',
      modelPath: '/library/head_base.glb',
      thumbnailPath: '/library/head_base.preview.png',
      skeletonId: 'human_base_v1',
      bodyType: 'unisex_medium',
      attachmentSocket: 'head_socket',
      tags: ['starter'],
      source: 'public-library',
    },
  },
  {
    id: 'hand_game',
    metadataPath: '/library/hand_game.metadata.json',
    fallback: {
      id: 'hand_game',
      name: 'Hand Game',
      category: 'arms',
      modelPath: '/library/hand_game.glb',
      thumbnailPath: '/library/hand_game.preview.png',
      skeletonId: 'human_base_v1',
      bodyType: 'unisex_medium',
      attachmentSocket: 'arms_socket',
      tags: ['hands'],
      source: 'public-library',
    },
  },
  {
    id: 'hair_short',
    metadataPath: '/library/hair_short.metadata.json',
    fallback: {
      id: 'hair_short',
      name: 'Hair Short',
      category: 'hair',
      modelPath: '/library/hair_short.glb',
      thumbnailPath: '/library/hair_short.preview.png',
      skeletonId: 'human_base_v1',
      bodyType: 'unisex_medium',
      attachmentSocket: 'hair_socket',
      tags: ['starter', 'hair'],
      source: 'public-library',
      materialVariants: [
        variant('hair_black', 'Black', '#151515'),
        variant('hair_brown', 'Brown', '#5c4630'),
        variant('hair_blonde', 'Blonde', '#d6b46d'),
      ],
    },
  },
  {
    id: 'hoodie',
    metadataPath: '/library/hoodie.metadata.json',
    fallback: {
      id: 'hoodie',
      name: 'Hoodie',
      category: 'outfit',
      modelPath: '/library/hoodie.glb',
      thumbnailPath: '/library/hoodie.preview.png',
      skeletonId: 'human_base_v1',
      bodyType: 'unisex_medium',
      attachmentSocket: 'torso_socket',
      tags: ['casual', 'top'],
      source: 'public-library',
    },
  },
  {
    id: 'legs_basic',
    metadataPath: '/library/legs_basic.metadata.json',
    fallback: {
      id: 'legs_basic',
      name: 'Legs Basic',
      category: 'legs',
      modelPath: '/library/legs_basic.glb',
      thumbnailPath: '/library/legs_basic.preview.png',
      skeletonId: 'human_base_v1',
      bodyType: 'unisex_medium',
      attachmentSocket: 'legs_socket',
      tags: ['starter', 'lower'],
      source: 'public-library',
      materialVariants: [
        variant('denim_dark', 'Dark Denim', '#203045'),
        variant('denim_light', 'Light Denim', '#516f91'),
      ],
    },
  },
  {
    id: 'boots',
    metadataPath: '/library/boots.metadata.json',
    fallback: {
      id: 'boots',
      name: 'Boots',
      category: 'shoes',
      modelPath: '/library/boots.glb',
      thumbnailPath: '/library/boots.preview.png',
      skeletonId: 'human_base_v1',
      bodyType: 'unisex_medium',
      attachmentSocket: 'feet_socket',
      tags: ['footwear'],
      source: 'public-library',
      materialVariants: [
        variant('boots_black', 'Black', '#171717'),
        variant('boots_brown', 'Brown', '#5f4028'),
      ],
    },
  },
  {
    id: 'hat',
    metadataPath: '/library/hat.metadata.json',
    fallback: {
      id: 'hat',
      name: 'Hat',
      category: 'accessory',
      modelPath: '/library/hat.glb',
      thumbnailPath: '/library/hat.preview.png',
      skeletonId: 'human_base_v1',
      bodyType: 'unisex_medium',
      attachmentSocket: 'accessory_socket',
      tags: ['headwear'],
      source: 'public-library',
      materialVariants: [
        variant('hat_graphite', 'Graphite', '#334155'),
        variant('hat_red', 'Red', '#9f1d1d'),
      ],
    },
  },
];

function readPresetStorage() {
  if (typeof window === 'undefined') return [] as StoredCharacterPreset[];
  try {
    const raw = window.localStorage.getItem(PRESET_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredCharacterPreset[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePresetStorage(presets: StoredCharacterPreset[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presets));
}

function readString(
  value: unknown,
  fallback = ''
): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
    : [];
}

function readBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function readVariants(value: unknown): CharacterPartVariant[] {
  if (!Array.isArray(value)) return [];

  return value.reduce<CharacterPartVariant[]>((acc, entry) => {
    if (!entry || typeof entry !== 'object') return acc;
    const record = entry as Record<string, unknown>;
    const id = readString(record.id);
    if (!id) return acc;
    acc.push({
      id,
      label: readString(record.label ?? record.name, id),
      swatch: readString(record.swatch ?? record.color, '') || null,
    });
    return acc;
  }, []);
}

function mergeLibraryRecord(
  fallback: CharacterAssetRecord,
  data: Record<string, unknown>
): CharacterAssetRecord {
  const nextTags = readStringArray(data.tags);
  const nextMaterialVariants = readVariants(data.materialVariants ?? data.material_variants);
  const nextColorVariants = readVariants(data.colorVariants ?? data.color_variants);

  return {
    ...fallback,
    id: readString(data.id, fallback.id),
    name: readString(data.name, fallback.name),
    category: readString(data.category, fallback.category ?? ''),
    modelPath: readString(data.glb ?? data.modelPath, fallback.modelPath),
    thumbnailPath: readString(data.preview ?? data.thumbnailPath, fallback.thumbnailPath ?? ''),
    metadataPath: fallback.metadataPath,
    skeletonId: readString(data.skeletonId ?? data.skeleton_id, fallback.skeletonId ?? ''),
    bodyType: readString(data.bodyType ?? data.body_type, fallback.bodyType ?? ''),
    attachmentSocket: readString(
      data.attachmentSocket ?? data.attachment_socket,
      fallback.attachmentSocket ?? ''
    ),
    enabled: readBoolean(data.enabled, fallback.enabled !== false),
    tags: nextTags.length > 0 ? nextTags : fallback.tags,
    isBaseBody: readBoolean(data.isBaseBody ?? data.is_base_body, fallback.isBaseBody === true),
    polycount:
      typeof data.polycount === 'number' && Number.isFinite(data.polycount)
        ? data.polycount
        : fallback.polycount,
    notes: readString(data.notes, fallback.notes ?? '') || fallback.notes,
    source: fallback.source,
    materialVariants: nextMaterialVariants.length > 0 ? nextMaterialVariants : fallback.materialVariants,
    colorVariants: nextColorVariants.length > 0 ? nextColorVariants : fallback.colorVariants,
  };
}

function normalizeIndexedRecord(payload: unknown): CharacterAssetRecord | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;
  const id = readString(record.id);
  const modelPath = readString(record.modelPath ?? record.glb);
  const name = readString(record.name, id);
  if (!id || !modelPath || !name) return null;

  return {
    id,
    name,
    category: readString(record.category),
    modelPath,
    thumbnailPath: readString(record.thumbnailPath ?? record.preview),
    metadataPath: readString(record.metadataPath),
    skeletonId: readString(record.skeletonId ?? record.skeleton_id, 'human_base_v1'),
    bodyType: readString(record.bodyType ?? record.body_type, 'unisex_medium'),
    attachmentSocket: readString(record.attachmentSocket ?? record.attachment_socket),
    enabled: readBoolean(record.enabled, true),
    tags: readStringArray(record.tags),
    isBaseBody: readBoolean(record.isBaseBody ?? record.is_base_body, false),
    polycount:
      typeof record.polycount === 'number' && Number.isFinite(record.polycount)
        ? record.polycount
        : null,
    notes: readString(record.notes) || null,
    source: readString(record.source, 'public-library'),
    materialVariants: readVariants(record.materialVariants ?? record.material_variants),
    colorVariants: readVariants(record.colorVariants ?? record.color_variants),
  };
}

async function resolveLibraryIndex() {
  try {
    const response = await fetch(LIBRARY_INDEX_PATH, { cache: 'no-store' });
    if (!response.ok) return null;
    const data = (await response.json()) as unknown;
    const rawRecords =
      Array.isArray(data)
        ? data
        : data && typeof data === 'object' && Array.isArray((data as { records?: unknown[] }).records)
          ? (data as { records: unknown[] }).records
          : null;
    if (!rawRecords) return null;
    const records = rawRecords
      .map((entry) => normalizeIndexedRecord(entry))
      .filter((entry): entry is CharacterAssetRecord => Boolean(entry));
    return records.length > 0 ? records : null;
  } catch {
    return null;
  }
}

async function resolveLibraryEntry(
  entry: BuiltinCharacterMetadataEntry
): Promise<CharacterAssetRecord> {
  try {
    const response = await fetch(entry.metadataPath, { cache: 'no-store' });
    if (!response.ok) return entry.fallback;
    const data = (await response.json()) as Record<string, unknown>;
    return mergeLibraryRecord(entry.fallback, data);
  } catch {
    return entry.fallback;
  }
}

function logByLevel(message: string, level: CharacterBuilderMessageLevel) {
  if (level === 'error') {
    consoleManager.error(message);
    return;
  }
  if (level === 'warn') {
    consoleManager.warn(message);
    return;
  }
  if (level === 'success') {
    consoleManager.success(message);
    return;
  }
  consoleManager.info(message);
}

function reportCharacterError(report: CharacterBuilderErrorReport) {
  const issueSummary = report.issues.map((issue) => issue.message).join(' | ');
  consoleManager.error(
    `[CharacterBuilder] ${report.message}${issueSummary ? ` :: ${issueSummary}` : ''}`
  );
}

export function createCharacterBuilderEditorAdapter(): CharacterBuilderEngineAdapter {
  return {
    async loadCharacterLibraryRecords() {
      const indexed = await resolveLibraryIndex();
      if (indexed) {
        return indexed;
      }
      return Promise.all(BUILTIN_LIBRARY_MANIFEST.map((entry) => resolveLibraryEntry(entry)));
    },
    async listCharacterPresets() {
      return readPresetStorage();
    },
    async saveCharacterPreset(entry) {
      const current = readPresetStorage();
      const next = current.filter((item) => item.id !== entry.id);
      next.push(entry);
      writePresetStorage(next);
    },
    async deleteCharacterPreset(presetId) {
      const current = readPresetStorage();
      writePresetStorage(current.filter((entry) => entry.id !== presetId));
    },
    showMessage(message, level = 'info') {
      logByLevel(message, level);
    },
    reportCharacterError(report) {
      reportCharacterError(report);
    },
  };
}
