import { MATERIAL_PRESET_REGISTRY } from './materialPresetRegistry';

export interface EditorMaterialColor {
  r: number;
  g: number;
  b: number;
  a?: number;
}

export type EditorMaterialTextureSlot =
  | 'albedo'
  | 'normal'
  | 'roughness'
  | 'metallic'
  | 'emissive'
  | 'occlusion'
  | 'alpha';

export interface EditorMaterialTextureMap {
  assetPath: string | null;
  enabled: boolean;
}

export interface EditorMaterialTextureTransform {
  repeatU: number;
  repeatV: number;
  offsetU: number;
  offsetV: number;
  rotation: number;
}

export interface EditorMaterialDefinition {
  id: string;
  name: string;
  albedoColor: Required<EditorMaterialColor>;
  metallic: number;
  roughness: number;
  normalIntensity: number;
  emissiveColor: EditorMaterialColor;
  emissiveIntensity: number;
  occlusionStrength: number;
  alphaCutoff: number;
  doubleSided: boolean;
  transparent: boolean;
  textureMaps: Record<EditorMaterialTextureSlot, EditorMaterialTextureMap>;
  textureTransform: EditorMaterialTextureTransform;
  weightedNormalsEnabled: boolean;
  weightedNormalsStrength: number;
  weightedNormalsKeepSharp: boolean;
}

type MaterialSeed = Omit<
  EditorMaterialDefinition,
  'textureMaps' | 'textureTransform' | 'weightedNormalsEnabled' | 'weightedNormalsStrength' | 'weightedNormalsKeepSharp'
>;

export const MATERIAL_TEXTURE_SLOTS: EditorMaterialTextureSlot[] = [
  'albedo',
  'normal',
  'roughness',
  'metallic',
  'emissive',
  'occlusion',
  'alpha',
];

const clampUnit = (value: number, fallback: number) =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;

const clampPositive = (value: number, fallback: number, max = 10) =>
  Number.isFinite(value) ? Math.min(max, Math.max(0, value)) : fallback;

const clampRange = (value: number, fallback: number, min: number, max: number) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
};

const readColor = (
  value: unknown,
  fallback: Required<EditorMaterialColor>
): Required<EditorMaterialColor> => {
  const record = asRecord(value);
  return {
    r: clampUnit(Number(record?.r), fallback.r),
    g: clampUnit(Number(record?.g), fallback.g),
    b: clampUnit(Number(record?.b), fallback.b),
    a: clampUnit(Number(record?.a), fallback.a),
  };
};

function createEmptyTextureMaps(): Record<EditorMaterialTextureSlot, EditorMaterialTextureMap> {
  return {
    albedo: { assetPath: null, enabled: false },
    normal: { assetPath: null, enabled: false },
    roughness: { assetPath: null, enabled: false },
    metallic: { assetPath: null, enabled: false },
    emissive: { assetPath: null, enabled: false },
    occlusion: { assetPath: null, enabled: false },
    alpha: { assetPath: null, enabled: false },
  };
}

function createDefaultTextureTransform(): EditorMaterialTextureTransform {
  return {
    repeatU: 1,
    repeatV: 1,
    offsetU: 0,
    offsetV: 0,
    rotation: 0,
  };
}

function withMaterialDefaults(seed: MaterialSeed): EditorMaterialDefinition {
  return {
    ...seed,
    textureMaps: createEmptyTextureMaps(),
    textureTransform: createDefaultTextureTransform(),
    weightedNormalsEnabled: false,
    weightedNormalsStrength: 1,
    weightedNormalsKeepSharp: true,
  };
}

function readTextureMap(
  value: unknown,
  fallback: EditorMaterialTextureMap
): EditorMaterialTextureMap {
  if (typeof value === 'string') {
    const assetPath = value.trim() || null;
    return {
      assetPath,
      enabled: Boolean(assetPath),
    };
  }

  const record = asRecord(value);
  const assetPath =
    typeof record?.assetPath === 'string' && record.assetPath.trim().length > 0
      ? record.assetPath.trim()
      : fallback.assetPath;

  return {
    assetPath,
    enabled:
      typeof record?.enabled === 'boolean'
        ? record.enabled && Boolean(assetPath)
        : Boolean(assetPath),
  };
}

function readTextureMaps(
  value: unknown,
  fallback: Record<EditorMaterialTextureSlot, EditorMaterialTextureMap>
) {
  const record = asRecord(value);
  return MATERIAL_TEXTURE_SLOTS.reduce(
    (maps, slot) => ({
      ...maps,
      [slot]: readTextureMap(record?.[slot], fallback[slot]),
    }),
    createEmptyTextureMaps()
  );
}

function readTextureTransform(
  value: unknown,
  fallback: EditorMaterialTextureTransform
): EditorMaterialTextureTransform {
  const record = asRecord(value);
  return {
    repeatU: clampRange(Number(record?.repeatU), fallback.repeatU, 0.05, 32),
    repeatV: clampRange(Number(record?.repeatV), fallback.repeatV, 0.05, 32),
    offsetU: clampRange(Number(record?.offsetU), fallback.offsetU, -10, 10),
    offsetV: clampRange(Number(record?.offsetV), fallback.offsetV, -10, 10),
    rotation: clampRange(Number(record?.rotation), fallback.rotation, -360, 360),
  };
}

const createHashedPreset = (materialId: string): EditorMaterialDefinition => {
  let hash = 0;
  for (let index = 0; index < materialId.length; index += 1) {
    hash = (hash * 31 + materialId.charCodeAt(index)) >>> 0;
  }

  const hue = (hash % 360) / 360;
  const saturation = 0.45;
  const lightness = 0.56;
  const metallic = materialId.toLowerCase().includes('metal') ? 0.82 : 0.1;
  const roughness = materialId.toLowerCase().includes('glass')
    ? 0.08
    : metallic > 0.5
      ? 0.26
      : 0.64;
  const color = hslToRgb(hue, saturation, lightness);

  return withMaterialDefaults({
    id: materialId,
    name: materialId,
    albedoColor: {
      ...color,
      a: materialId.toLowerCase().includes('glass') ? 0.35 : 1,
    },
    metallic,
    roughness,
    normalIntensity: 1,
    emissiveColor: { r: 0, g: 0, b: 0 },
    emissiveIntensity: 0,
    occlusionStrength: 1,
    alphaCutoff: 0.5,
    doubleSided: materialId.toLowerCase().includes('glass'),
    transparent: materialId.toLowerCase().includes('glass'),
  });
};

function hslToRgb(h: number, s: number, l: number) {
  if (s === 0) {
    return { r: l, g: l, b: l };
  }

  const hueToRgb = (p: number, q: number, t: number) => {
    let next = t;
    if (next < 0) next += 1;
    if (next > 1) next -= 1;
    if (next < 1 / 6) return p + (q - p) * 6 * next;
    if (next < 1 / 2) return q;
    if (next < 2 / 3) return p + (q - p) * (2 / 3 - next) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: hueToRgb(p, q, h + 1 / 3),
    g: hueToRgb(p, q, h),
    b: hueToRgb(p, q, h - 1 / 3),
  };
}

export const MATERIAL_PRESETS: EditorMaterialDefinition[] = MATERIAL_PRESET_REGISTRY.map((entry) =>
  withMaterialDefaults({
    ...entry.params,
    albedoColor: {
      ...entry.params.albedoColor,
      a: entry.params.albedoColor.a ?? 1,
    },
  })
);

const MATERIAL_PRESET_MAP = new Map(
  MATERIAL_PRESETS.map((preset) => [preset.id, preset] as const)
);

export function isKnownMaterialPresetId(materialId: string | null | undefined) {
  return Boolean(materialId && MATERIAL_PRESET_MAP.has(materialId));
}

export function getMaterialPreset(materialId: string | null | undefined) {
  if (materialId && MATERIAL_PRESET_MAP.has(materialId)) {
    return MATERIAL_PRESET_MAP.get(materialId)!;
  }

  return createHashedPreset(materialId || 'default');
}

export function resolveEditorMaterial(
  meshRendererData: Record<string, unknown> | null
): EditorMaterialDefinition {
  const materialId =
    typeof meshRendererData?.materialId === 'string'
      ? meshRendererData.materialId
      : 'default';
  const preset = getMaterialPreset(materialId);
  const override = asRecord(meshRendererData?.material);
  const resolvedId =
    typeof override?.id === 'string' && override.id.trim().length > 0
      ? override.id.trim()
      : preset.id;

  return {
    id: resolvedId,
    name: typeof override?.name === 'string' ? override.name : preset.name,
    albedoColor: readColor(override?.albedoColor, preset.albedoColor),
    metallic: clampUnit(Number(override?.metallic), preset.metallic),
    roughness: clampUnit(Number(override?.roughness), preset.roughness),
    normalIntensity: clampPositive(
      Number(override?.normalIntensity),
      preset.normalIntensity,
      4
    ),
    emissiveColor: readColor(
      override?.emissiveColor,
      { ...preset.emissiveColor, a: 1 }
    ),
    emissiveIntensity: clampPositive(
      Number(override?.emissiveIntensity),
      preset.emissiveIntensity,
      20
    ),
    occlusionStrength: clampUnit(
      Number(override?.occlusionStrength),
      preset.occlusionStrength
    ),
    alphaCutoff: clampUnit(Number(override?.alphaCutoff), preset.alphaCutoff),
    doubleSided:
      typeof override?.doubleSided === 'boolean'
        ? override.doubleSided
        : preset.doubleSided,
    transparent:
      typeof override?.transparent === 'boolean'
        ? override.transparent
        : preset.transparent,
    textureMaps: readTextureMaps(override?.textureMaps, preset.textureMaps),
    textureTransform: readTextureTransform(
      override?.textureTransform,
      preset.textureTransform
    ),
    weightedNormalsEnabled:
      typeof override?.weightedNormalsEnabled === 'boolean'
        ? override.weightedNormalsEnabled
        : preset.weightedNormalsEnabled,
    weightedNormalsStrength: clampRange(
      Number(override?.weightedNormalsStrength),
      preset.weightedNormalsStrength,
      0,
      4
    ),
    weightedNormalsKeepSharp:
      typeof override?.weightedNormalsKeepSharp === 'boolean'
        ? override.weightedNormalsKeepSharp
        : preset.weightedNormalsKeepSharp,
  };
}

export function sanitizeMaterialDefinition(
  value: unknown,
  fallbackId = 'default'
): EditorMaterialDefinition | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const materialId =
    typeof record.id === 'string' && record.id.trim().length > 0
      ? record.id.trim()
      : fallbackId;

  return resolveEditorMaterial({
    materialId,
    material: record,
  });
}

export function collectMaterialTextureAssetPaths(
  definition: EditorMaterialDefinition
): string[] {
  return MATERIAL_TEXTURE_SLOTS.flatMap((slot) => {
    const map = definition.textureMaps[slot];
    return map.enabled && map.assetPath ? [map.assetPath] : [];
  }).filter((assetPath, index, items) => items.indexOf(assetPath) === index);
}

export function summarizeEditorMaterial(definition: EditorMaterialDefinition) {
  const enabledMaps = MATERIAL_TEXTURE_SLOTS.filter(
    (slot) => definition.textureMaps[slot].enabled && definition.textureMaps[slot].assetPath
  );
  const parts = [
    `metal ${definition.metallic.toFixed(2)}`,
    `rough ${definition.roughness.toFixed(2)}`,
  ];

  if (definition.transparent) {
    parts.push('transparent');
  }
  if (definition.doubleSided) {
    parts.push('double-sided');
  }
  if (enabledMaps.length > 0) {
    parts.push(`maps ${enabledMaps.join(', ')}`);
  }

  return `${definition.name} (${definition.id}) · ${parts.join(' · ')}`;
}

export function buildMaterialVisualSignature(
  meshRendererData: Record<string, unknown> | null
) {
  const material = resolveEditorMaterial(meshRendererData);
  return JSON.stringify({
    id: material.id,
    albedoColor: material.albedoColor,
    metallic: material.metallic,
    roughness: material.roughness,
    normalIntensity: material.normalIntensity,
    emissiveColor: material.emissiveColor,
    emissiveIntensity: material.emissiveIntensity,
    occlusionStrength: material.occlusionStrength,
    alphaCutoff: material.alphaCutoff,
    doubleSided: material.doubleSided,
    transparent: material.transparent,
    textureMaps: material.textureMaps,
    textureTransform: material.textureTransform,
    weightedNormalsEnabled: material.weightedNormalsEnabled,
    weightedNormalsStrength: material.weightedNormalsStrength,
    weightedNormalsKeepSharp: material.weightedNormalsKeepSharp,
  });
}

export function materialColorToHex(color: EditorMaterialColor) {
  const toHex = (value: number) =>
    Math.round(clampUnit(value, 0) * 255)
      .toString(16)
      .padStart(2, '0');

  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}

export function hexToMaterialColor(hex: string, alpha = 1): Required<EditorMaterialColor> {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!match) {
    return { r: 0, g: 0, b: 0, a: clampUnit(alpha, 1) };
  }

  return {
    r: parseInt(match[1], 16) / 255,
    g: parseInt(match[2], 16) / 255,
    b: parseInt(match[3], 16) / 255,
    a: clampUnit(alpha, 1),
  };
}
