import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  applyWorldLookPreset,
  buildWorldEnvironmentUrl,
  computeDirectionalLightPosition,
  getThreeToneMapping,
  getWorldSkyAssetPath,
  isHdrEnvironmentAsset,
  isWorldSkyAsset,
  makeWorldSkyAssetValue,
  resolveToneMapping,
  WORLD_LOOK_PRESETS,
  resolveWorldSkyPreset,
} from '@/engine/editor/worldPipeline';

describe('world pipeline helpers', () => {
  it('resolves preset fallback and asset markers', () => {
    const assetValue = makeWorldSkyAssetValue('download/assets/texture/studio.hdr');

    expect(resolveWorldSkyPreset('sunset')).toBe('sunset');
    expect(resolveWorldSkyPreset('unknown')).toBe('studio');
    expect(isWorldSkyAsset(assetValue)).toBe(true);
    expect(getWorldSkyAssetPath(assetValue)).toBe('download/assets/texture/studio.hdr');
    expect(buildWorldEnvironmentUrl(assetValue)).toContain(
      encodeURIComponent('download/assets/texture/studio.hdr')
    );
  });

  it('detects hdr assets and computes stable sun positions', () => {
    expect(isHdrEnvironmentAsset('sky.HDR')).toBe(true);
    expect(isHdrEnvironmentAsset('sky.exr')).toBe(true);
    expect(isHdrEnvironmentAsset('sky.png')).toBe(false);

    const lightPosition = computeDirectionalLightPosition(45, 55, 100);
    expect(lightPosition.length()).toBeCloseTo(100, 4);
    expect(lightPosition.y).toBeGreaterThan(0);
  });

  it('applies look presets while preserving an asset hdri selection', () => {
    const environment = {
      skybox: makeWorldSkyAssetValue('download/assets/texture/custom.hdr'),
      ambientLight: { r: 0.5, g: 0.5, b: 0.5, a: 1 },
      ambientIntensity: 1,
      environmentIntensity: 1,
      environmentRotation: 0,
      directionalLightIntensity: 1.2,
      directionalLightAzimuth: 45,
      directionalLightElevation: 55,
      advancedLighting: {
        shadowQuality: 'medium' as const,
        globalIllumination: { enabled: false, intensity: 1, bounceCount: 1 },
        bakedLightmaps: { enabled: false },
      },
      fog: null,
      postProcessing: {
        bloom: { enabled: false, intensity: 0.5, threshold: 0.8, radius: 0.5 },
        ssao: { enabled: false, radius: 0.5, intensity: 1, bias: 0.025 },
        ssr: { enabled: false, intensity: 0.5, maxDistance: 100 },
        colorGrading: {
          enabled: false,
          exposure: 1,
          contrast: 1,
          saturation: 1,
          gamma: 2.2,
          toneMapping: 'aces' as const,
          rendererExposure: 1,
        },
        vignette: { enabled: false, intensity: 0.5, smoothness: 0.5, roundness: 1 },
      },
    };

    const nextEnvironment = applyWorldLookPreset(environment, 'cinematic');

    expect(nextEnvironment.skybox).toBe(environment.skybox);
    expect(nextEnvironment.postProcessing.ssr.enabled).toBe(true);
    expect(nextEnvironment.postProcessing.colorGrading.toneMapping).toBe('aces');
    expect(nextEnvironment.advancedLighting?.globalIllumination.enabled).toBe(true);
    expect(nextEnvironment.advancedLighting?.shadowQuality).toBe('ultra');
    expect(nextEnvironment.fog?.enabled).toBe(true);
  });

  it('exposes stable look presets and tone mapping fallbacks', () => {
    expect(WORLD_LOOK_PRESETS.product.label).toBeTruthy();
    expect(resolveToneMapping('unknown' as never)).toBe('aces');
    expect(getThreeToneMapping('reinhard')).toBe(THREE.ReinhardToneMapping);
    expect(getThreeToneMapping('none')).toBe(THREE.NoToneMapping);
  });
});
