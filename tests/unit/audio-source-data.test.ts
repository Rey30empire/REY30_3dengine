import { describe, expect, it } from 'vitest';
import type { Asset } from '@/types/engine';
import {
  createDefaultAudioSourceData,
  normalizeAudioSourceData,
  resolveAudioSourceClip,
} from '@/engine/audio/audioSourceData';

describe('audioSourceData', () => {
  it('creates a stable default payload for AudioSource components', () => {
    expect(createDefaultAudioSourceData()).toEqual({
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
    });
  });

  it('normalizes legacy clip payloads and clamps unsafe values', () => {
    expect(
      normalizeAudioSourceData({
        clip: 'download/assets/audio/theme.ogg',
        volume: 4,
        pitch: 0,
        spatialBlend: 2,
        minDistance: -3,
        maxDistance: 0,
        rolloffFactor: -2,
      })
    ).toEqual({
      clipId: null,
      clip: 'download/assets/audio/theme.ogg',
      volume: 2,
      pitch: 0.1,
      loop: false,
      playOnStart: false,
      spatialBlend: 1,
      mixerGroup: 'sfx',
      minDistance: 0.05,
      maxDistance: 0.05,
      rolloffFactor: 0,
    });
  });

  it('prefers an audio asset path when clipId resolves', () => {
    const assets: Asset[] = [
      {
        id: 'audio-1',
        name: 'theme.ogg',
        type: 'audio',
        path: 'download/assets/audio/theme.ogg',
        size: 1024,
        createdAt: new Date('2026-04-03T10:00:00.000Z'),
        metadata: {},
      },
    ];

    expect(
      resolveAudioSourceClip(
        normalizeAudioSourceData({
          clipId: 'audio-1',
          clip: 'manual/fallback.ogg',
        }),
        assets
      )
    ).toEqual({
      clipId: 'audio-1',
      path: 'download/assets/audio/theme.ogg',
      key: 'asset:audio-1',
    });
  });
});
