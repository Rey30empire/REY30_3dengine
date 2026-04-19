import type {
  PresetQualityTier,
  PresetRegistryEntry,
} from '@/engine/presets/presetRegistryTypes';

export interface MaterialPresetColorSeed {
  r: number;
  g: number;
  b: number;
  a?: number;
}

export interface MaterialPresetParams {
  id: string;
  name: string;
  albedoColor: MaterialPresetColorSeed;
  metallic: number;
  roughness: number;
  normalIntensity: number;
  emissiveColor: MaterialPresetColorSeed;
  emissiveIntensity: number;
  occlusionStrength: number;
  alphaCutoff: number;
  doubleSided: boolean;
  transparent: boolean;
}

export type MaterialPresetCategory =
  | 'generic'
  | 'metal'
  | 'synthetic'
  | 'transparent'
  | 'emissive'
  | 'organic'
  | 'mineral'
  | 'wood';

export type MaterialPresetRegistryEntry = PresetRegistryEntry<
  MaterialPresetCategory,
  MaterialPresetParams
>;

interface MaterialPresetEntryInput extends Omit<MaterialPresetParams, 'id' | 'name'> {
  id: string;
  name: string;
  category: MaterialPresetCategory;
  tags: string[];
  thumbnail?: string;
  qualityTier?: PresetQualityTier;
}

function createMaterialPresetEntry(
  input: MaterialPresetEntryInput
): MaterialPresetRegistryEntry {
  const {
    id,
    name,
    category,
    tags,
    thumbnail = `material/${id}`,
    qualityTier = 'standard',
    ...params
  } = input;

  return {
    id,
    name,
    category,
    tags,
    thumbnail,
    qualityTier,
    params: {
      id,
      name,
      ...params,
    },
  };
}

export const MATERIAL_PRESET_CATEGORY_LABELS: Record<MaterialPresetCategory, string> = {
  generic: 'Generic',
  metal: 'Metal',
  synthetic: 'Synthetic',
  transparent: 'Transparent',
  emissive: 'Emissive',
  organic: 'Organic',
  mineral: 'Mineral',
  wood: 'Wood',
};

export const MATERIAL_PRESET_CATEGORY_OPTIONS = (
  Object.entries(MATERIAL_PRESET_CATEGORY_LABELS) as Array<
    [MaterialPresetCategory, string]
  >
).map(([value, label]) => ({ value, label }));

export function getMaterialPresetCategoryLabel(category: MaterialPresetCategory) {
  return MATERIAL_PRESET_CATEGORY_LABELS[category];
}

export const MATERIAL_PRESET_REGISTRY: MaterialPresetRegistryEntry[] = [
  createMaterialPresetEntry({
    id: 'default',
    name: 'Default',
    category: 'generic',
    tags: ['base', 'neutral', 'viewport'],
    qualityTier: 'starter',
    albedoColor: { r: 0.54, g: 0.56, b: 0.64, a: 1 },
    metallic: 0.08,
    roughness: 0.62,
    normalIntensity: 1,
    emissiveColor: { r: 0, g: 0, b: 0 },
    emissiveIntensity: 0,
    occlusionStrength: 1,
    alphaCutoff: 0.5,
    doubleSided: false,
    transparent: false,
  }),
  createMaterialPresetEntry({
    id: 'metal',
    name: 'Metal',
    category: 'metal',
    tags: ['metal', 'reflective', 'hard-surface'],
    qualityTier: 'starter',
    albedoColor: { r: 0.73, g: 0.77, b: 0.83, a: 1 },
    metallic: 0.88,
    roughness: 0.24,
    normalIntensity: 1,
    emissiveColor: { r: 0, g: 0, b: 0 },
    emissiveIntensity: 0,
    occlusionStrength: 1,
    alphaCutoff: 0.5,
    doubleSided: false,
    transparent: false,
  }),
  createMaterialPresetEntry({
    id: 'plastic',
    name: 'Plastic',
    category: 'synthetic',
    tags: ['plastic', 'painted', 'clean'],
    qualityTier: 'starter',
    albedoColor: { r: 0.14, g: 0.54, b: 0.98, a: 1 },
    metallic: 0.04,
    roughness: 0.36,
    normalIntensity: 1,
    emissiveColor: { r: 0, g: 0, b: 0 },
    emissiveIntensity: 0,
    occlusionStrength: 1,
    alphaCutoff: 0.5,
    doubleSided: false,
    transparent: false,
  }),
  createMaterialPresetEntry({
    id: 'glass',
    name: 'Glass',
    category: 'transparent',
    tags: ['glass', 'transparent', 'refractive'],
    qualityTier: 'starter',
    albedoColor: { r: 0.82, g: 0.92, b: 1, a: 0.28 },
    metallic: 0,
    roughness: 0.08,
    normalIntensity: 1,
    emissiveColor: { r: 0, g: 0, b: 0 },
    emissiveIntensity: 0,
    occlusionStrength: 1,
    alphaCutoff: 0.08,
    doubleSided: true,
    transparent: true,
  }),
  createMaterialPresetEntry({
    id: 'emissive',
    name: 'Emissive',
    category: 'emissive',
    tags: ['emissive', 'neon', 'glow'],
    qualityTier: 'starter',
    albedoColor: { r: 0.05, g: 0.06, b: 0.09, a: 1 },
    metallic: 0,
    roughness: 0.78,
    normalIntensity: 1,
    emissiveColor: { r: 0.18, g: 0.86, b: 1 },
    emissiveIntensity: 2.4,
    occlusionStrength: 1,
    alphaCutoff: 0.5,
    doubleSided: false,
    transparent: false,
  }),
  createMaterialPresetEntry({
    id: 'clay',
    name: 'Clay',
    category: 'organic',
    tags: ['clay', 'sculpt', 'matte'],
    qualityTier: 'starter',
    albedoColor: { r: 0.71, g: 0.47, b: 0.39, a: 1 },
    metallic: 0,
    roughness: 0.88,
    normalIntensity: 1,
    emissiveColor: { r: 0, g: 0, b: 0 },
    emissiveIntensity: 0,
    occlusionStrength: 1,
    alphaCutoff: 0.5,
    doubleSided: false,
    transparent: false,
  }),
  createMaterialPresetEntry({
    id: 'steel',
    name: 'Steel',
    category: 'metal',
    tags: ['steel', 'industrial', 'clean'],
    albedoColor: { r: 0.62, g: 0.67, b: 0.71, a: 1 },
    metallic: 0.96,
    roughness: 0.18,
    normalIntensity: 1,
    emissiveColor: { r: 0, g: 0, b: 0 },
    emissiveIntensity: 0,
    occlusionStrength: 1,
    alphaCutoff: 0.5,
    doubleSided: false,
    transparent: false,
  }),
  createMaterialPresetEntry({
    id: 'iron',
    name: 'Iron',
    category: 'metal',
    tags: ['iron', 'dark', 'industrial'],
    albedoColor: { r: 0.36, g: 0.37, b: 0.39, a: 1 },
    metallic: 0.93,
    roughness: 0.42,
    normalIntensity: 1,
    emissiveColor: { r: 0, g: 0, b: 0 },
    emissiveIntensity: 0,
    occlusionStrength: 1,
    alphaCutoff: 0.5,
    doubleSided: false,
    transparent: false,
  }),
  createMaterialPresetEntry({
    id: 'aluminum',
    name: 'Aluminum',
    category: 'metal',
    tags: ['aluminum', 'light', 'machined'],
    albedoColor: { r: 0.8, g: 0.82, b: 0.86, a: 1 },
    metallic: 0.97,
    roughness: 0.14,
    normalIntensity: 1,
    emissiveColor: { r: 0, g: 0, b: 0 },
    emissiveIntensity: 0,
    occlusionStrength: 1,
    alphaCutoff: 0.5,
    doubleSided: false,
    transparent: false,
  }),
  createMaterialPresetEntry({
    id: 'copper',
    name: 'Copper',
    category: 'metal',
    tags: ['copper', 'warm', 'conductive'],
    albedoColor: { r: 0.84, g: 0.53, b: 0.31, a: 1 },
    metallic: 0.96,
    roughness: 0.2,
    normalIntensity: 1,
    emissiveColor: { r: 0, g: 0, b: 0 },
    emissiveIntensity: 0,
    occlusionStrength: 1,
    alphaCutoff: 0.5,
    doubleSided: false,
    transparent: false,
  }),
  createMaterialPresetEntry({
    id: 'bronze',
    name: 'Bronze',
    category: 'metal',
    tags: ['bronze', 'aged', 'warm'],
    albedoColor: { r: 0.59, g: 0.44, b: 0.24, a: 1 },
    metallic: 0.9,
    roughness: 0.34,
    normalIntensity: 1,
    emissiveColor: { r: 0, g: 0, b: 0 },
    emissiveIntensity: 0,
    occlusionStrength: 1,
    alphaCutoff: 0.5,
    doubleSided: false,
    transparent: false,
  }),
  createMaterialPresetEntry({
    id: 'gold',
    name: 'Gold',
    category: 'metal',
    tags: ['gold', 'luxury', 'jewelry'],
    qualityTier: 'hero',
    albedoColor: { r: 0.97, g: 0.8, b: 0.24, a: 1 },
    metallic: 0.99,
    roughness: 0.16,
    normalIntensity: 1,
    emissiveColor: { r: 0, g: 0, b: 0 },
    emissiveIntensity: 0,
    occlusionStrength: 1,
    alphaCutoff: 0.5,
    doubleSided: false,
    transparent: false,
  }),
  createMaterialPresetEntry({
    id: 'mercury',
    name: 'Mercury',
    category: 'metal',
    tags: ['mercury', 'liquid-metal', 'mirror'],
    qualityTier: 'hero',
    albedoColor: { r: 0.74, g: 0.77, b: 0.81, a: 1 },
    metallic: 1,
    roughness: 0.05,
    normalIntensity: 1,
    emissiveColor: { r: 0, g: 0, b: 0 },
    emissiveIntensity: 0,
    occlusionStrength: 1,
    alphaCutoff: 0.5,
    doubleSided: false,
    transparent: false,
  }),
  createMaterialPresetEntry({
    id: 'rubber',
    name: 'Rubber',
    category: 'synthetic',
    tags: ['rubber', 'soft', 'matte'],
    albedoColor: { r: 0.08, g: 0.09, b: 0.1, a: 1 },
    metallic: 0,
    roughness: 0.94,
    normalIntensity: 1,
    emissiveColor: { r: 0, g: 0, b: 0 },
    emissiveIntensity: 0,
    occlusionStrength: 1,
    alphaCutoff: 0.5,
    doubleSided: false,
    transparent: false,
  }),
  createMaterialPresetEntry({
    id: 'ceramic',
    name: 'Ceramic',
    category: 'synthetic',
    tags: ['ceramic', 'glazed', 'clean'],
    albedoColor: { r: 0.92, g: 0.91, b: 0.88, a: 1 },
    metallic: 0.02,
    roughness: 0.42,
    normalIntensity: 1,
    emissiveColor: { r: 0, g: 0, b: 0 },
    emissiveIntensity: 0,
    occlusionStrength: 1,
    alphaCutoff: 0.5,
    doubleSided: false,
    transparent: false,
  }),
  createMaterialPresetEntry({
    id: 'frosted_glass',
    name: 'Frosted Glass',
    category: 'transparent',
    tags: ['glass', 'frosted', 'matte'],
    albedoColor: { r: 0.88, g: 0.94, b: 1, a: 0.42 },
    metallic: 0,
    roughness: 0.56,
    normalIntensity: 1,
    emissiveColor: { r: 0, g: 0, b: 0 },
    emissiveIntensity: 0,
    occlusionStrength: 1,
    alphaCutoff: 0.06,
    doubleSided: true,
    transparent: true,
  }),
  createMaterialPresetEntry({
    id: 'acrylic',
    name: 'Acrylic',
    category: 'transparent',
    tags: ['acrylic', 'plastic', 'clear'],
    albedoColor: { r: 0.91, g: 0.95, b: 1, a: 0.32 },
    metallic: 0,
    roughness: 0.12,
    normalIntensity: 1,
    emissiveColor: { r: 0, g: 0, b: 0 },
    emissiveIntensity: 0,
    occlusionStrength: 1,
    alphaCutoff: 0.04,
    doubleSided: true,
    transparent: true,
  }),
  createMaterialPresetEntry({
    id: 'water',
    name: 'Water',
    category: 'transparent',
    tags: ['water', 'liquid', 'surface'],
    qualityTier: 'hero',
    albedoColor: { r: 0.32, g: 0.58, b: 0.9, a: 0.34 },
    metallic: 0,
    roughness: 0.03,
    normalIntensity: 1.15,
    emissiveColor: { r: 0, g: 0.03, b: 0.08 },
    emissiveIntensity: 0.15,
    occlusionStrength: 1,
    alphaCutoff: 0.02,
    doubleSided: true,
    transparent: true,
  }),
  createMaterialPresetEntry({
    id: 'ice',
    name: 'Ice',
    category: 'transparent',
    tags: ['ice', 'frozen', 'cold'],
    qualityTier: 'hero',
    albedoColor: { r: 0.79, g: 0.9, b: 1, a: 0.62 },
    metallic: 0,
    roughness: 0.18,
    normalIntensity: 1.1,
    emissiveColor: { r: 0.02, g: 0.08, b: 0.12 },
    emissiveIntensity: 0.1,
    occlusionStrength: 1,
    alphaCutoff: 0.04,
    doubleSided: true,
    transparent: true,
  }),
  createMaterialPresetEntry({
    id: 'lava',
    name: 'Lava',
    category: 'emissive',
    tags: ['lava', 'molten', 'hot'],
    qualityTier: 'hero',
    albedoColor: { r: 0.17, g: 0.06, b: 0.03, a: 1 },
    metallic: 0,
    roughness: 0.84,
    normalIntensity: 1,
    emissiveColor: { r: 1, g: 0.34, b: 0.05 },
    emissiveIntensity: 4.6,
    occlusionStrength: 1,
    alphaCutoff: 0.5,
    doubleSided: false,
    transparent: false,
  }),
  createMaterialPresetEntry({
    id: 'stone',
    name: 'Stone',
    category: 'mineral',
    tags: ['stone', 'rock', 'rough'],
    albedoColor: { r: 0.47, g: 0.48, b: 0.45, a: 1 },
    metallic: 0,
    roughness: 0.92,
    normalIntensity: 1,
    emissiveColor: { r: 0, g: 0, b: 0 },
    emissiveIntensity: 0,
    occlusionStrength: 1,
    alphaCutoff: 0.5,
    doubleSided: false,
    transparent: false,
  }),
  createMaterialPresetEntry({
    id: 'marble',
    name: 'Marble',
    category: 'mineral',
    tags: ['marble', 'polished', 'interior'],
    albedoColor: { r: 0.9, g: 0.89, b: 0.86, a: 1 },
    metallic: 0,
    roughness: 0.28,
    normalIntensity: 1,
    emissiveColor: { r: 0, g: 0, b: 0 },
    emissiveIntensity: 0,
    occlusionStrength: 1,
    alphaCutoff: 0.5,
    doubleSided: false,
    transparent: false,
  }),
  createMaterialPresetEntry({
    id: 'concrete',
    name: 'Concrete',
    category: 'mineral',
    tags: ['concrete', 'architectural', 'matte'],
    albedoColor: { r: 0.58, g: 0.59, b: 0.57, a: 1 },
    metallic: 0,
    roughness: 0.96,
    normalIntensity: 1,
    emissiveColor: { r: 0, g: 0, b: 0 },
    emissiveIntensity: 0,
    occlusionStrength: 1,
    alphaCutoff: 0.5,
    doubleSided: false,
    transparent: false,
  }),
  createMaterialPresetEntry({
    id: 'sand',
    name: 'Sand',
    category: 'mineral',
    tags: ['sand', 'desert', 'grainy'],
    albedoColor: { r: 0.78, g: 0.69, b: 0.49, a: 1 },
    metallic: 0,
    roughness: 0.98,
    normalIntensity: 1,
    emissiveColor: { r: 0, g: 0, b: 0 },
    emissiveIntensity: 0,
    occlusionStrength: 1,
    alphaCutoff: 0.5,
    doubleSided: false,
    transparent: false,
  }),
  createMaterialPresetEntry({
    id: 'oak_wood',
    name: 'Oak Wood',
    category: 'wood',
    tags: ['wood', 'oak', 'natural'],
    albedoColor: { r: 0.62, g: 0.44, b: 0.24, a: 1 },
    metallic: 0,
    roughness: 0.72,
    normalIntensity: 1,
    emissiveColor: { r: 0, g: 0, b: 0 },
    emissiveIntensity: 0,
    occlusionStrength: 1,
    alphaCutoff: 0.5,
    doubleSided: false,
    transparent: false,
  }),
  createMaterialPresetEntry({
    id: 'walnut_wood',
    name: 'Walnut Wood',
    category: 'wood',
    tags: ['wood', 'walnut', 'dark'],
    albedoColor: { r: 0.32, g: 0.21, b: 0.13, a: 1 },
    metallic: 0,
    roughness: 0.76,
    normalIntensity: 1,
    emissiveColor: { r: 0, g: 0, b: 0 },
    emissiveIntensity: 0,
    occlusionStrength: 1,
    alphaCutoff: 0.5,
    doubleSided: false,
    transparent: false,
  }),
  createMaterialPresetEntry({
    id: 'leather',
    name: 'Leather',
    category: 'organic',
    tags: ['leather', 'organic', 'soft'],
    albedoColor: { r: 0.34, g: 0.19, b: 0.11, a: 1 },
    metallic: 0,
    roughness: 0.68,
    normalIntensity: 1,
    emissiveColor: { r: 0, g: 0, b: 0 },
    emissiveIntensity: 0,
    occlusionStrength: 1,
    alphaCutoff: 0.5,
    doubleSided: false,
    transparent: false,
  }),
  createMaterialPresetEntry({
    id: 'fabric',
    name: 'Fabric',
    category: 'organic',
    tags: ['fabric', 'cloth', 'textile'],
    albedoColor: { r: 0.38, g: 0.41, b: 0.46, a: 1 },
    metallic: 0,
    roughness: 0.94,
    normalIntensity: 1,
    emissiveColor: { r: 0, g: 0, b: 0 },
    emissiveIntensity: 0,
    occlusionStrength: 1,
    alphaCutoff: 0.5,
    doubleSided: false,
    transparent: false,
  }),
  createMaterialPresetEntry({
    id: 'skin',
    name: 'Skin',
    category: 'organic',
    tags: ['skin', 'organic', 'character'],
    albedoColor: { r: 0.76, g: 0.56, b: 0.47, a: 1 },
    metallic: 0,
    roughness: 0.56,
    normalIntensity: 1,
    emissiveColor: { r: 0, g: 0, b: 0 },
    emissiveIntensity: 0,
    occlusionStrength: 1,
    alphaCutoff: 0.5,
    doubleSided: false,
    transparent: false,
  }),
];

export type MaterialPresetId = string;

export const MATERIAL_PRESET_REGISTRY_MAP = new Map(
  MATERIAL_PRESET_REGISTRY.map((entry) => [entry.id, entry] as const)
);

export function getMaterialPresetRegistryEntry(materialId: string | null | undefined) {
  if (!materialId) {
    return null;
  }
  return MATERIAL_PRESET_REGISTRY_MAP.get(materialId) ?? null;
}

export const MIN_MATERIAL_PRESET_REGISTRY_COUNT = 24;
