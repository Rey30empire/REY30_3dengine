import { describe, expect, it } from 'vitest';
import {
  PARTICLE_PRESET_CATEGORY_OPTIONS,
  MIN_PARTICLE_PRESET_REGISTRY_COUNT,
  PARTICLE_PRESET_REGISTRY,
} from '@/engine/rendering/particlePresetRegistry';
import { PARTICLE_PRESETS } from '@/engine/rendering/ParticleSystem';

describe('particlePresetRegistry', () => {
  it('keeps the particle preset registry above the current baseline', () => {
    expect(PARTICLE_PRESET_REGISTRY.length).toBeGreaterThanOrEqual(
      MIN_PARTICLE_PRESET_REGISTRY_COUNT
    );
  });

  it('uses unique ids and includes registry metadata for every particle preset', () => {
    const ids = PARTICLE_PRESET_REGISTRY.map((entry) => entry.id);

    expect(new Set(ids).size).toBe(ids.length);
    PARTICLE_PRESET_REGISTRY.forEach((entry) => {
      expect(entry.name.length).toBeGreaterThan(0);
      expect(entry.category.length).toBeGreaterThan(0);
      expect(entry.tags.length).toBeGreaterThan(0);
      expect(entry.thumbnail.length).toBeGreaterThan(0);
      expect(entry.qualityTier).toBeTruthy();
    });
  });

  it('covers every declared particle family with at least one preset', () => {
    PARTICLE_PRESET_CATEGORY_OPTIONS.forEach((option) => {
      expect(
        PARTICLE_PRESET_REGISTRY.some((entry) => entry.category === option.value)
      ).toBe(true);
    });
  });

  it('keeps GPU-backed presets available for heavy preview scenarios', () => {
    expect(
      PARTICLE_PRESET_REGISTRY.filter((entry) => entry.previewBackend === 'gpu').length
    ).toBeGreaterThanOrEqual(6);
  });

  it('keeps the runtime particle presets aligned with the registry', () => {
    expect(Object.keys(PARTICLE_PRESETS).sort()).toEqual(
      PARTICLE_PRESET_REGISTRY.map((entry) => entry.id).sort()
    );
  });

  it('ships representative presets for water, metal and shadow fx families', () => {
    expect(PARTICLE_PRESETS.water_splash?.burstCount).toBeGreaterThan(0);
    expect(PARTICLE_PRESETS.water_splash?.blendMode).toBe('alpha');
    expect(PARTICLE_PRESETS.grinder_sparks?.blendMode).toBe('additive');
    expect(PARTICLE_PRESETS.mercury_droplets?.startAlpha).toBeGreaterThan(0.9);
    expect(PARTICLE_PRESETS.void_smoke?.noiseStrength).toBeGreaterThan(0.3);
    expect(PARTICLE_PRESETS.shadow_motes?.rate).toBeGreaterThan(0);
  });
});
