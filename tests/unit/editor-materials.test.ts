import { describe, expect, it } from 'vitest';
import {
  buildMaterialVisualSignature,
  resolveEditorMaterial,
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
