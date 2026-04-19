import type { SavedModularCharacterDetail } from '@/engine/modular-character';
import type { PackageAsset, StoredPackageRecord } from '@/lib/server/package-storage';
import type { CharacterPresetExportManifest } from '@/lib/character-preset-document';

export type CharacterUnifiedPackageSourceKind = 'builder_preset' | 'modular_character';

export interface CharacterUnifiedPackageOwnership {
  ownerUserId: string | null;
  ownerEmail?: string | null;
  exportedByUserId: string | null;
  exportedByEmail?: string | null;
}

export interface CharacterUnifiedPackageStats {
  partCount: number;
  variantCount: number;
  hasRig: boolean | null;
  meshCount: number | null;
  materialCount: number | null;
  animationCount: number | null;
}

export interface CharacterUnifiedPackageDocument {
  version: 1;
  packageName: string;
  exportedAt: string;
  projectKey: string;
  source: {
    kind: CharacterUnifiedPackageSourceKind;
    sourceId: string;
    sourceName: string;
    workspace: 'builder' | 'modular-lab';
  };
  ownership: CharacterUnifiedPackageOwnership;
  stats: CharacterUnifiedPackageStats;
  assets: PackageAsset[];
  payload:
    | {
        kind: 'builder_preset';
        preset: CharacterPresetExportManifest;
      }
    | {
        kind: 'modular_character';
        character: SavedModularCharacterDetail;
      };
  storedPackage?: {
    name: string;
    relativePath: string;
    filePath: string;
    checksum: string;
    storageBackend: string;
    storageScope: string;
  };
}

function sanitizePackageSegment(value: string) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}

export function buildBuilderPresetPackageName(projectKey: string, presetName: string) {
  return [
    sanitizePackageSegment(projectKey) || 'project',
    sanitizePackageSegment(presetName) || 'character_preset',
    'builder_package',
  ].join('_');
}

export function buildModularCharacterPackageName(projectKey: string, characterName: string) {
  return [
    sanitizePackageSegment(projectKey) || 'project',
    sanitizePackageSegment(characterName) || 'modular_character',
    'modular_package',
  ].join('_');
}

export function buildBuilderPresetPackageAssets(input: {
  manifest: CharacterPresetExportManifest;
  libraryPath: string;
}): PackageAsset[] {
  return [
    {
      id: input.manifest.preset.id,
      name: input.manifest.preset.name,
      type: 'character_preset',
      path: input.libraryPath,
    },
  ];
}

export function buildModularCharacterPackageAssets(input: {
  detail: SavedModularCharacterDetail;
}): PackageAsset[] {
  const assets: PackageAsset[] = [
    {
      id: input.detail.id,
      name: `${input.detail.name} manifest`,
      type: 'character_manifest',
      path: input.detail.metadata.manifestPath,
    },
    {
      id: `${input.detail.id}:assembly`,
      name: `${input.detail.name} assembly`,
      type: 'character_assembly',
      path: input.detail.metadata.unityManifestPath,
    },
    {
      id: `${input.detail.id}:source`,
      name: `${input.detail.name} original`,
      type: 'character_source',
      path: input.detail.metadata.originalPath,
    },
  ];

  if (input.detail.metadata.previewPath) {
    assets.push({
      id: `${input.detail.id}:preview`,
      name: `${input.detail.name} preview`,
      type: 'character_preview',
      path: input.detail.metadata.previewPath,
    });
  }

  input.detail.metadata.parts.forEach((part) => {
    assets.push({
      id: part.id,
      name: part.name,
      type: 'character_part',
      path: part.storagePath,
    });
    assets.push({
      id: `${part.id}:metadata`,
      name: `${part.name} metadata`,
      type: 'character_part_metadata',
      path: part.metadataPath,
    });
  });

  return assets;
}

export function toStoredPackageSummary(record: StoredPackageRecord) {
  return {
    name: record.name,
    relativePath: record.relativePath,
    filePath: record.filePath,
    checksum: record.package.checksum,
    storageBackend: record.storage.backend,
    storageScope: record.storage.scope,
  };
}
