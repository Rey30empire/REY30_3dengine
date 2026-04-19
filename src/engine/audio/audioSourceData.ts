import type { Asset, AudioSourceData } from '@/types/engine';

export const AUDIO_MIXER_GROUPS = ['master', 'music', 'sfx', 'voice', 'ambient'] as const;

export const DEFAULT_AUDIO_SOURCE_DATA: AudioSourceData = {
  clipId: null,
  clip: null,
  volume: 1,
  pitch: 1,
  loop: false,
  playOnStart: false,
  spatialBlend: 1,
  mixerGroup: 'sfx',
  minDistance: 1,
  maxDistance: 100,
  rolloffFactor: 1,
};

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function createDefaultAudioSourceData(
  overrides?: Partial<AudioSourceData>
): AudioSourceData {
  return {
    ...DEFAULT_AUDIO_SOURCE_DATA,
    ...overrides,
  };
}

export function normalizeAudioSourceData(value: unknown): AudioSourceData {
  const record = value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};

  const clip = readString(record.clip) ?? readString(record.clipPath);
  const clipId = readString(record.clipId);
  const minDistance = Math.max(0.05, readNumber(record.minDistance, DEFAULT_AUDIO_SOURCE_DATA.minDistance));
  const maxDistance = Math.max(
    minDistance,
    readNumber(record.maxDistance, DEFAULT_AUDIO_SOURCE_DATA.maxDistance)
  );
  const mixerGroup = readString(record.mixerGroup) ?? DEFAULT_AUDIO_SOURCE_DATA.mixerGroup;

  return {
    clipId,
    clip,
    volume: clamp(readNumber(record.volume, DEFAULT_AUDIO_SOURCE_DATA.volume), 0, 2),
    pitch: clamp(readNumber(record.pitch, DEFAULT_AUDIO_SOURCE_DATA.pitch), 0.1, 4),
    loop: readBoolean(record.loop, DEFAULT_AUDIO_SOURCE_DATA.loop),
    playOnStart: readBoolean(record.playOnStart, DEFAULT_AUDIO_SOURCE_DATA.playOnStart),
    spatialBlend: clamp(
      readNumber(record.spatialBlend, DEFAULT_AUDIO_SOURCE_DATA.spatialBlend),
      0,
      1
    ),
    mixerGroup,
    minDistance,
    maxDistance,
    rolloffFactor: clamp(
      readNumber(record.rolloffFactor, DEFAULT_AUDIO_SOURCE_DATA.rolloffFactor),
      0,
      5
    ),
  };
}

export interface ResolvedAudioSourceClip {
  clipId: string | null;
  path: string;
  key: string;
}

export function resolveAudioSourceClip(
  data: AudioSourceData,
  assets: Asset[]
): ResolvedAudioSourceClip | null {
  if (data.clipId) {
    const asset = assets.find((candidate) => candidate.id === data.clipId);
    if (asset?.type === 'audio' && asset.path.trim()) {
      return {
        clipId: asset.id,
        path: asset.path,
        key: `asset:${asset.id}`,
      };
    }
  }

  if (data.clip) {
    return {
      clipId: data.clipId,
      path: data.clip,
      key: data.clipId ? `asset:${data.clipId}` : `path:${data.clip}`,
    };
  }

  return null;
}
