import { describe, expect, it } from 'vitest';
import {
  buildTerrainVisualSignature,
  createStarterTerrainData,
  createTerrainDataFromPreset,
  normalizeTerrainData,
  regenerateTerrainData,
  summarizeTerrainData,
} from '@/engine/scene/terrainAuthoring';

describe('terrain authoring', () => {
  it('normalizes legacy terrain payloads into durable authoring data', () => {
    const terrain = normalizeTerrainData({
      width: 48,
      height: 14,
      depth: 48,
      heightmap: [],
      layers: [],
    });

    expect(terrain.preset).toBe('hills');
    expect(terrain.segments).toBeGreaterThan(2);
    expect(terrain.heightmap.length).toBe((terrain.segments ?? 0) ** 2);
    expect(terrain.layers.length).toBeGreaterThan(0);
  });

  it('uses the seed to produce deterministic but regenerable terrain heightmaps', () => {
    const a = createTerrainDataFromPreset('island', {
      width: 96,
      depth: 96,
      segments: 33,
      seed: 4242,
    });
    const b = createTerrainDataFromPreset('island', {
      width: 96,
      depth: 96,
      segments: 33,
      seed: 4242,
    });
    const c = createTerrainDataFromPreset('island', {
      width: 96,
      depth: 96,
      segments: 33,
      seed: 4343,
    });

    expect(a.heightmap).toEqual(b.heightmap);
    expect(a.heightmap).not.toEqual(c.heightmap);
  });

  it('builds a visual signature that changes when the terrain authoring changes', () => {
    const terrain = createStarterTerrainData({ seed: 1337 });
    const changed = regenerateTerrainData({
      ...terrain,
      seed: 2026,
    });

    expect(buildTerrainVisualSignature(terrain)).not.toBe(buildTerrainVisualSignature(changed));
    expect(summarizeTerrainData(changed)).toContain('layers');
  });
});
