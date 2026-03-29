import {
  type CharacterAssetRecord,
  type CharacterPartVariant,
  type CharacterPartMetadata,
  type CharacterPartCategory,
  CHARACTER_PART_CATEGORIES,
  getDefaultSocketForCategory,
  normalizeCharacterCategory,
} from './types';

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => (value ?? '').trim())
        .filter((value) => value.length > 0)
    )
  );
}

function normalizeVariants(
  variants: CharacterAssetRecord['materialVariants'] | CharacterAssetRecord['colorVariants']
) {
  return Array.from(
    new Map(
      (variants ?? [])
        .filter((variant): variant is CharacterPartVariant => Boolean(variant?.id))
        .map((variant) => [
          variant.id.trim(),
          {
            id: variant.id.trim(),
            label: variant.label.trim().length > 0 ? variant.label.trim() : variant.id.trim(),
            swatch: variant.swatch?.trim() || null,
          },
        ])
    ).values()
  );
}

function inferCategory(record: CharacterAssetRecord): CharacterPartCategory {
  const direct = normalizeCharacterCategory(record.category);
  if (direct) return direct;

  const haystack = [
    record.id,
    record.name,
    record.modelPath,
    record.notes,
    ...(record.tags ?? []),
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ');
  return normalizeCharacterCategory(haystack) ?? 'accessory';
}

function inferBaseBody(record: CharacterAssetRecord, category: CharacterPartCategory) {
  if (typeof record.isBaseBody === 'boolean') return record.isBaseBody;
  if (category !== 'body') return false;
  const haystack = `${record.id} ${record.name}`.toLowerCase();
  return haystack.includes('maniqui') || haystack.includes('mannequin') || haystack.includes('base');
}

function inferTags(record: CharacterAssetRecord, category: CharacterPartCategory) {
  return uniqueStrings([
    ...(record.tags ?? []),
    category,
    inferBaseBody(record, category) ? 'base_body' : null,
  ]).map((value) => value.toLowerCase());
}

export function normalizeCharacterAssetRecord(
  record: CharacterAssetRecord
): CharacterPartMetadata {
  const category = inferCategory(record);
  const defaultSocket = getDefaultSocketForCategory(category);
  const enabled = record.enabled !== false;
  const normalizedName = record.name.trim().length > 0 ? record.name.trim() : record.id;
  return {
    id: record.id.trim(),
    name: normalizedName,
    category,
    modelPath: record.modelPath.trim(),
    thumbnailPath: (record.thumbnailPath ?? '').trim(),
    metadataPath: record.metadataPath?.trim() || null,
    skeletonId: record.skeletonId?.trim() || 'human_base_v1',
    bodyType: record.bodyType?.trim() || 'unisex_medium',
    attachmentSocket: record.attachmentSocket?.trim() || defaultSocket,
    enabled,
    tags: inferTags(record, category),
    isBaseBody: inferBaseBody(record, category),
    polycount:
      typeof record.polycount === 'number' && Number.isFinite(record.polycount)
        ? record.polycount
        : null,
    notes: record.notes?.trim() || null,
    source: record.source?.trim() || null,
    materialVariants: normalizeVariants(record.materialVariants),
    colorVariants: normalizeVariants(record.colorVariants),
  };
}

export class AssetMetadataDatabase {
  private records = new Map<string, CharacterPartMetadata>();

  replaceAll(records: CharacterAssetRecord[]) {
    this.records.clear();
    records.forEach((record) => this.upsert(record));
  }

  upsert(record: CharacterAssetRecord) {
    const normalized = normalizeCharacterAssetRecord(record);
    this.records.set(normalized.id, normalized);
    return normalized;
  }

  all() {
    return Array.from(this.records.values());
  }

  findById(id: string | null | undefined) {
    if (!id) return null;
    return this.records.get(id) ?? null;
  }

  categories() {
    const available = new Set(this.all().map((record) => record.category));
    return CHARACTER_PART_CATEGORIES.filter((category) => available.has(category));
  }

  findBaseBodies() {
    return this.all().filter((record) => record.isBaseBody);
  }
}
