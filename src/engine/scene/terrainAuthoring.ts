import type { TerrainData, TerrainLayer } from '@/types/engine';
import { TerrainGenerator, type TerrainConfig } from './TerrainGenerator';

export const TERRAIN_PRESET_IDS = ['mountains', 'hills', 'plains', 'island'] as const;
export type TerrainPresetId = (typeof TERRAIN_PRESET_IDS)[number];

const TERRAIN_PRESET_CONFIGS: Record<TerrainPresetId, TerrainConfig> = {
  mountains: {
    width: 200,
    depth: 200,
    segments: 65,
    scale: 0.02,
    octaves: 8,
    heightMultiplier: 150,
    erosionIterations: 200,
    seed: 1847,
  },
  hills: {
    width: 120,
    depth: 120,
    segments: 49,
    scale: 0.018,
    octaves: 6,
    heightMultiplier: 42,
    erosionIterations: 96,
    seed: 2048,
  },
  plains: {
    width: 160,
    depth: 160,
    segments: 49,
    scale: 0.008,
    octaves: 4,
    heightMultiplier: 16,
    erosionIterations: 40,
    seed: 1024,
  },
  island: {
    width: 140,
    depth: 140,
    segments: 65,
    scale: 0.015,
    octaves: 6,
    heightMultiplier: 60,
    erosionIterations: 132,
    seed: 4096,
  },
};

const STARTER_TERRAIN_CONFIG: TerrainConfig = {
  width: 64,
  depth: 64,
  segments: 33,
  scale: 0.04,
  octaves: 5,
  heightMultiplier: 18,
  erosionIterations: 12,
  seed: 1337,
};

type TerrainRecord = Partial<TerrainData> & Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clampInteger(value: number, min: number, max: number) {
  return Math.round(clampNumber(value, min, max));
}

function readNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeSeed(value: unknown, fallback: number) {
  const nextValue = readNumber(value, fallback);
  return clampInteger(Math.abs(nextValue), 0, 2_147_483_647);
}

function normalizeTerrainPresetId(value: unknown): TerrainPresetId {
  if (typeof value !== 'string') {
    return 'hills';
  }
  const normalized = value.trim().toLowerCase();
  return TERRAIN_PRESET_IDS.includes(normalized as TerrainPresetId)
    ? (normalized as TerrainPresetId)
    : 'hills';
}

function deriveSegmentsFromHeightmap(heightmap: number[]) {
  if (heightmap.length === 0) {
    return null;
  }
  const segments = Math.sqrt(heightmap.length);
  return Number.isInteger(segments) ? segments : null;
}

function readHeightmap(
  value: unknown,
  expectedLength: number,
  maxHeight: number
) {
  if (!Array.isArray(value)) {
    return null;
  }
  if (value.length !== expectedLength) {
    return null;
  }

  const normalized = value
    .map((entry) =>
      typeof entry === 'number' && Number.isFinite(entry)
        ? clampNumber(entry, 0, maxHeight)
        : null
    )
    .filter((entry): entry is number => entry !== null);

  return normalized.length === expectedLength ? normalized : null;
}

function normalizeTerrainLayer(
  value: unknown,
  index: number,
  maxHeight: number
): TerrainLayer | null {
  if (!isRecord(value)) {
    return null;
  }

  const minHeight = clampNumber(readNumber(value.minHeight, 0), 0, maxHeight);
  const nextMaxHeight = clampNumber(
    readNumber(value.maxHeight, Math.max(minHeight + 1, maxHeight)),
    minHeight,
    maxHeight
  );
  const textureId =
    typeof value.textureId === 'string' && value.textureId.trim().length > 0
      ? value.textureId.trim()
      : `terrain-layer-${index + 1}`;

  return {
    id:
      typeof value.id === 'string' && value.id.trim().length > 0
        ? value.id.trim()
        : `terrain-layer-${index + 1}`,
    name:
      typeof value.name === 'string' && value.name.trim().length > 0
        ? value.name.trim()
        : `Layer ${index + 1}`,
    textureId,
    minHeight,
    maxHeight: nextMaxHeight,
  };
}

function normalizeTerrainLayers(
  value: unknown,
  maxHeight: number,
  fallback: TerrainLayer[]
) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const normalized = value
    .map((entry, index) => normalizeTerrainLayer(entry, index, maxHeight))
    .filter((entry): entry is TerrainLayer => Boolean(entry));

  return normalized.length > 0 ? normalized : fallback;
}

function buildTerrainConfig(record: TerrainRecord): {
  preset: TerrainPresetId;
  config: TerrainConfig;
} {
  const preset = normalizeTerrainPresetId(record.preset);
  const presetConfig = TERRAIN_PRESET_CONFIGS[preset];
  const heightmapSegments = Array.isArray(record.heightmap)
    ? deriveSegmentsFromHeightmap(
        record.heightmap.filter(
          (entry): entry is number => typeof entry === 'number' && Number.isFinite(entry)
        )
      )
    : null;

  const width = clampNumber(readNumber(record.width, presetConfig.width), 4, 1024);
  const depth = clampNumber(readNumber(record.depth, presetConfig.depth), 4, 1024);
  const segments = clampInteger(
    readNumber(record.segments, heightmapSegments ?? presetConfig.segments),
    2,
    129
  );
  const heightMultiplier = clampNumber(
    readNumber(record.height, presetConfig.heightMultiplier),
    1,
    512
  );

  return {
    preset,
    config: {
      width,
      depth,
      segments,
      scale: clampNumber(readNumber(record.scale, presetConfig.scale), 0.001, 1),
      octaves: clampInteger(readNumber(record.octaves, presetConfig.octaves), 1, 10),
      heightMultiplier,
      erosionIterations: clampInteger(
        readNumber(record.erosionIterations, presetConfig.erosionIterations),
        0,
        512
      ),
      seed: normalizeSeed(record.seed, presetConfig.seed),
    },
  };
}

function createGeneratedTerrain(config: TerrainConfig) {
  return new TerrainGenerator(config.seed).generateTerrain(config);
}

export function createTerrainData(config: TerrainConfig, preset: TerrainPresetId, layers?: TerrainLayer[]) {
  const generated = createGeneratedTerrain(config);
  const fallbackLayers = layers && layers.length > 0 ? layers : generated.layers;
  return {
    width: config.width,
    height: config.heightMultiplier,
    depth: config.depth,
    preset,
    segments: config.segments,
    scale: config.scale,
    octaves: config.octaves,
    erosionIterations: config.erosionIterations,
    seed: config.seed,
    heightmap: generated.heightmap,
    layers: normalizeTerrainLayers(fallbackLayers, config.heightMultiplier, generated.layers),
  } satisfies TerrainData;
}

export function normalizeTerrainData(
  value: unknown,
  options?: { regenerateHeightmap?: boolean }
): TerrainData {
  const record = isRecord(value) ? (value as TerrainRecord) : {};
  const { preset, config } = buildTerrainConfig(record);
  const generated = createGeneratedTerrain(config);
  const expectedHeightmapLength = config.segments * config.segments;
  const heightmap =
    options?.regenerateHeightmap
      ? generated.heightmap
      : readHeightmap(record.heightmap, expectedHeightmapLength, config.heightMultiplier) ??
        generated.heightmap;

  return {
    width: config.width,
    height: config.heightMultiplier,
    depth: config.depth,
    preset,
    segments: config.segments,
    scale: config.scale,
    octaves: config.octaves,
    erosionIterations: config.erosionIterations,
    seed: config.seed,
    heightmap,
    layers: normalizeTerrainLayers(record.layers, config.heightMultiplier, generated.layers),
  };
}

export function regenerateTerrainData(value: unknown) {
  return normalizeTerrainData(value, { regenerateHeightmap: true });
}

export function createStarterTerrainData(overrides?: Partial<TerrainData>) {
  const preset = normalizeTerrainPresetId(overrides?.preset ?? 'hills');
  return normalizeTerrainData(
    {
      preset,
      width: STARTER_TERRAIN_CONFIG.width,
      depth: STARTER_TERRAIN_CONFIG.depth,
      height: STARTER_TERRAIN_CONFIG.heightMultiplier,
      segments: STARTER_TERRAIN_CONFIG.segments,
      scale: STARTER_TERRAIN_CONFIG.scale,
      octaves: STARTER_TERRAIN_CONFIG.octaves,
      erosionIterations: STARTER_TERRAIN_CONFIG.erosionIterations,
      seed: STARTER_TERRAIN_CONFIG.seed,
      ...overrides,
    },
    { regenerateHeightmap: true }
  );
}

export function createTerrainDataFromPreset(
  preset: TerrainPresetId,
  overrides?: Partial<TerrainData>
) {
  const config = TERRAIN_PRESET_CONFIGS[preset];
  return normalizeTerrainData(
    {
      preset,
      width: config.width,
      depth: config.depth,
      height: config.heightMultiplier,
      segments: config.segments,
      scale: config.scale,
      octaves: config.octaves,
      erosionIterations: config.erosionIterations,
      seed: config.seed,
      ...overrides,
    },
    { regenerateHeightmap: true }
  );
}

export function getTerrainHeightRange(heightmap: number[]) {
  if (heightmap.length === 0) {
    return { min: 0, max: 0 };
  }

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of heightmap) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return { min, max };
}

export function summarizeTerrainData(value: unknown) {
  const terrain = normalizeTerrainData(value);
  const heightRange = getTerrainHeightRange(terrain.heightmap);
  return [
    terrain.preset ?? 'custom',
    `${terrain.width}x${terrain.depth}`,
    `${terrain.segments ?? 0}x${terrain.segments ?? 0}`,
    `${terrain.layers.length} layers`,
    `${Math.round(heightRange.min)}-${Math.round(heightRange.max)}m`,
  ].join(' | ');
}

export function buildTerrainVisualSignature(value: unknown) {
  const terrain = normalizeTerrainData(value);
  let checksum = 2166136261;

  terrain.heightmap.forEach((sample, index) => {
    checksum ^= Math.round(sample * 1000) + index;
    checksum = Math.imul(checksum, 16777619);
  });

  terrain.layers.forEach((layer, index) => {
    const token = `${index}:${layer.name}:${layer.textureId}:${layer.minHeight}:${layer.maxHeight}`;
    for (let character = 0; character < token.length; character += 1) {
      checksum ^= token.charCodeAt(character);
      checksum = Math.imul(checksum, 16777619);
    }
  });

  return [
    'terrain',
    terrain.preset ?? 'custom',
    terrain.width,
    terrain.height,
    terrain.depth,
    terrain.segments ?? 0,
    terrain.heightmap.length,
    terrain.layers.length,
    checksum >>> 0,
  ].join(':');
}
