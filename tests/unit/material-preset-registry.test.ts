import { describe, expect, it } from 'vitest';
import {
  MATERIAL_PRESET_CATEGORY_OPTIONS,
  MATERIAL_PRESET_REGISTRY,
  MIN_MATERIAL_PRESET_REGISTRY_COUNT,
} from '@/engine/editor/materialPresetRegistry';
import { MATERIAL_PRESETS, resolveEditorMaterial } from '@/engine/editor/editorMaterials';

describe('materialPresetRegistry', () => {
  it('keeps the material preset registry above the current baseline', () => {
    expect(MATERIAL_PRESET_REGISTRY.length).toBeGreaterThanOrEqual(
      MIN_MATERIAL_PRESET_REGISTRY_COUNT
    );
  });

  it('uses unique ids and includes registry metadata for every material preset', () => {
    const ids = MATERIAL_PRESET_REGISTRY.map((entry) => entry.id);

    expect(new Set(ids).size).toBe(ids.length);
    MATERIAL_PRESET_REGISTRY.forEach((entry) => {
      expect(entry.name.length).toBeGreaterThan(0);
      expect(entry.category.length).toBeGreaterThan(0);
      expect(entry.tags.length).toBeGreaterThan(0);
      expect(entry.thumbnail.length).toBeGreaterThan(0);
      expect(entry.qualityTier).toBeTruthy();
    });
  });

  it('covers every declared material family with at least one preset', () => {
    MATERIAL_PRESET_CATEGORY_OPTIONS.forEach((option) => {
      expect(
        MATERIAL_PRESET_REGISTRY.some((entry) => entry.category === option.value)
      ).toBe(true);
    });
  });

  it('keeps the runtime material presets aligned with the registry', () => {
    expect(MATERIAL_PRESETS).toHaveLength(MATERIAL_PRESET_REGISTRY.length);
    expect(MATERIAL_PRESETS.map((preset) => preset.id)).toEqual(
      MATERIAL_PRESET_REGISTRY.map((entry) => entry.id)
    );
  });

  it('ships representative production-ready presets for key surface families', () => {
    const gold = resolveEditorMaterial({ materialId: 'gold' });
    const water = resolveEditorMaterial({ materialId: 'water' });
    const fabric = resolveEditorMaterial({ materialId: 'fabric' });
    const lava = resolveEditorMaterial({ materialId: 'lava' });

    expect(gold.metallic).toBeGreaterThan(0.95);
    expect(gold.roughness).toBeLessThan(0.2);
    expect(water.transparent).toBe(true);
    expect(water.doubleSided).toBe(true);
    expect(fabric.roughness).toBeGreaterThan(0.9);
    expect(lava.emissiveIntensity).toBeGreaterThan(4);
  });
});
