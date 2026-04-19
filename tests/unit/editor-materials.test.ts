import { describe, expect, it } from 'vitest';
import {
  buildMaterialVisualSignature,
  collectMaterialTextureAssetPaths,
  resolveEditorMaterial,
  sanitizeMaterialDefinition,
  summarizeEditorMaterial,
} from '@/engine/editor/editorMaterials';

describe('editorMaterials', () => {
  it('resolves built-in presets into viewport-ready material definitions', () => {
    const glass = resolveEditorMaterial({ materialId: 'glass' });

    expect(glass.transparent).toBe(true);
    expect(glass.doubleSided).toBe(true);
    expect(glass.albedoColor.a).toBeLessThan(0.5);
    expect(glass.roughness).toBeLessThan(0.2);
  });

  it('merges material overrides over the selected preset', () => {
    const material = resolveEditorMaterial({
      materialId: 'metal',
      material: {
        roughness: 0.63,
        metallic: 0.52,
        albedoColor: { r: 0.2, g: 0.3, b: 0.4, a: 0.75 },
        emissiveColor: { r: 0.1, g: 0.2, b: 0.3 },
        emissiveIntensity: 1.6,
      },
    });

    expect(material.roughness).toBeCloseTo(0.63, 5);
    expect(material.metallic).toBeCloseTo(0.52, 5);
    expect(material.albedoColor).toEqual({ r: 0.2, g: 0.3, b: 0.4, a: 0.75 });
    expect(material.emissiveIntensity).toBeCloseTo(1.6, 5);
  });

  it('changes the visual signature when effective material properties change', () => {
    const base = buildMaterialVisualSignature({ materialId: 'plastic' });
    const tinted = buildMaterialVisualSignature({
      materialId: 'plastic',
      material: {
        roughness: 0.18,
        albedoColor: { r: 0.9, g: 0.4, b: 0.2, a: 1 },
      },
    });

    expect(base).not.toBe(tinted);
  });

  it('resolves PBR texture maps, tiling and weighted normals settings', () => {
    const material = resolveEditorMaterial({
      materialId: 'default',
      material: {
        textureMaps: {
          albedo: { assetPath: 'download/assets/texture/base.png', enabled: true },
          normal: { assetPath: 'download/assets/texture/normal.png', enabled: true },
          roughness: { assetPath: 'download/assets/texture/roughness.png', enabled: true },
        },
        textureTransform: {
          repeatU: 2,
          repeatV: 3,
          offsetU: 0.25,
          offsetV: -0.15,
          rotation: 45,
        },
        weightedNormalsEnabled: true,
        weightedNormalsStrength: 1.75,
        weightedNormalsKeepSharp: false,
      },
    });

    expect(material.textureMaps.albedo.assetPath).toBe('download/assets/texture/base.png');
    expect(material.textureMaps.normal.enabled).toBe(true);
    expect(material.textureTransform.repeatU).toBeCloseTo(2, 5);
    expect(material.textureTransform.offsetV).toBeCloseTo(-0.15, 5);
    expect(material.weightedNormalsEnabled).toBe(true);
    expect(material.weightedNormalsStrength).toBeCloseTo(1.75, 5);
    expect(material.weightedNormalsKeepSharp).toBe(false);
  });

  it('preserves explicit material ids when a custom definition is resolved', () => {
    const material = resolveEditorMaterial({
      materialId: 'metal',
      material: {
        id: 'hero_alloy',
        name: 'Hero Alloy',
        metallic: 0.91,
      },
    });

    expect(material.id).toBe('hero_alloy');
    expect(material.name).toBe('Hero Alloy');
    expect(material.metallic).toBeCloseTo(0.91, 5);
  });

  it('sanitizes persisted material definitions into a stable PBR contract', () => {
    const material = sanitizeMaterialDefinition({
      id: 'wild_alloy',
      metallic: 9,
      roughness: -2,
      transparent: 'yes',
      textureMaps: {
        albedo: {
          assetPath: '  download/assets/texture/wild-albedo.png  ',
          enabled: true,
        },
      },
      textureTransform: {
        repeatU: 0,
        repeatV: 99,
        offsetU: 20,
        offsetV: -20,
        rotation: 999,
      },
    });

    expect(material).toMatchObject({
      id: 'wild_alloy',
      metallic: 1,
      roughness: 0,
      transparent: false,
      textureMaps: expect.objectContaining({
        albedo: {
          assetPath: 'download/assets/texture/wild-albedo.png',
          enabled: true,
        },
      }),
      textureTransform: {
        repeatU: 0.05,
        repeatV: 32,
        offsetU: 10,
        offsetV: -10,
        rotation: 360,
      },
    });
  });

  it('collects unique enabled texture asset paths and summarizes the effective material', () => {
    const material = resolveEditorMaterial({
      materialId: 'default',
      material: {
        id: 'panel_glass',
        name: 'Panel Glass',
        metallic: 0.14,
        roughness: 0.09,
        transparent: true,
        textureMaps: {
          albedo: {
            assetPath: 'download/assets/texture/panel-albedo.png',
            enabled: true,
          },
          alpha: {
            assetPath: 'download/assets/texture/panel-albedo.png',
            enabled: true,
          },
        },
      },
    });

    expect(collectMaterialTextureAssetPaths(material)).toEqual([
      'download/assets/texture/panel-albedo.png',
    ]);
    expect(summarizeEditorMaterial(material)).toContain('Panel Glass');
    expect(summarizeEditorMaterial(material)).toContain('transparent');
    expect(summarizeEditorMaterial(material)).toContain('maps albedo, alpha');
  });

  it('changes the visual signature when maps or weighted normals change', () => {
    const base = buildMaterialVisualSignature({
      materialId: 'default',
      material: {
        textureMaps: {
          albedo: { assetPath: 'download/assets/texture/base.png', enabled: true },
        },
      },
    });
    const weighted = buildMaterialVisualSignature({
      materialId: 'default',
      material: {
        textureMaps: {
          albedo: { assetPath: 'download/assets/texture/base.png', enabled: true },
        },
        weightedNormalsEnabled: true,
        weightedNormalsStrength: 2,
      },
    });

    expect(base).not.toBe(weighted);
  });
});
