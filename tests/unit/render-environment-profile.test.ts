import { describe, expect, it } from 'vitest';
import { resolveSceneRenderProfile } from '@/engine/rendering/renderEnvironmentProfile';

describe('render environment profile', () => {
  it('normalizes malformed rendering values into a reproducible contract', () => {
    const profile = resolveSceneRenderProfile({
      skybox: 'night',
      ambientLight: { r: 2, g: -1, b: 0.35, a: 4 },
      ambientIntensity: -3,
      environmentIntensity: 99,
      environmentRotation: -45,
      directionalLightIntensity: 20,
      directionalLightAzimuth: -90,
      directionalLightElevation: 120,
      advancedLighting: {
        shadowQuality: 'broken' as never,
        globalIllumination: { enabled: true, intensity: 99, bounceCount: 12 },
        bakedLightmaps: { enabled: true },
      },
      fog: {
        enabled: true,
        type: 'linear',
        color: { r: -1, g: 0.5, b: 2, a: 8 },
        near: 80,
        far: 12,
      },
      postProcessing: {
        bloom: { enabled: true, intensity: 9, threshold: -3, radius: 4 },
        ssao: { enabled: true, radius: 9, intensity: -2, bias: 0 },
        ssr: { enabled: true, intensity: 2.5, maxDistance: -5 },
        colorGrading: {
          enabled: true,
          exposure: -1,
          contrast: 9,
          saturation: -2,
          gamma: 0,
          toneMapping: 'broken' as never,
          rendererExposure: 12,
        },
        vignette: { enabled: true, intensity: 4, smoothness: -1, roundness: 8 },
      },
    });

    expect(profile.ambientLight).toEqual({ r: 1, g: 0, b: 0.35, a: 1 });
    expect(profile.ambientIntensity).toBe(0);
    expect(profile.environmentIntensity).toBe(8);
    expect(profile.environmentRotation).toBe(315);
    expect(profile.directionalLightAzimuth).toBe(270);
    expect(profile.directionalLightElevation).toBe(89);
    expect(profile.advancedLighting.shadowQuality).toBe('high');
    expect(profile.advancedLighting.shadowMapSize).toBe(4096);
    expect(profile.advancedLighting.globalIllumination.bounceCount).toBe(4);
    expect(profile.fog).toMatchObject({ enabled: true, type: 'linear', near: 80, far: 80.1 });
    expect(profile.postProcessing.bloom).toEqual({
      enabled: true,
      intensity: 2,
      threshold: 0,
      radius: 1.5,
    });
    expect(profile.postProcessing.colorGrading.toneMapping).toBe('aces');
    expect(profile.postProcessing.colorGrading.rendererExposure).toBe(4);
    expect(profile.summary).toContain('shadow high');
    expect(profile.summary).toContain('gi on x4');
    expect(profile.summary).toContain('tone aces');
  });

  it('keeps cinematic settings stable when the scene already contains a valid look', () => {
    const profile = resolveSceneRenderProfile({
      skybox: 'night',
      ambientLight: { r: 0.24, g: 0.28, b: 0.36, a: 1 },
      ambientIntensity: 0.74,
      environmentIntensity: 0.9,
      environmentRotation: 110,
      directionalLightIntensity: 1.85,
      directionalLightAzimuth: 126,
      directionalLightElevation: 31,
      advancedLighting: {
        shadowQuality: 'ultra',
        globalIllumination: { enabled: true, intensity: 1.12, bounceCount: 2 },
        bakedLightmaps: { enabled: false },
      },
      fog: {
        enabled: true,
        type: 'exponential',
        color: { r: 0.08, g: 0.12, b: 0.2, a: 1 },
        density: 0.015,
      },
      postProcessing: {
        bloom: { enabled: true, intensity: 1.1, threshold: 0.54, radius: 0.58 },
        ssao: { enabled: true, radius: 0.88, intensity: 1.18, bias: 0.014 },
        ssr: { enabled: true, intensity: 0.58, maxDistance: 160 },
        colorGrading: {
          enabled: true,
          exposure: 0.98,
          contrast: 1.16,
          saturation: 0.94,
          gamma: 2.18,
          toneMapping: 'aces',
          rendererExposure: 0.96,
        },
        vignette: { enabled: true, intensity: 0.46, smoothness: 0.56, roundness: 0.82 },
      },
    });

    expect(profile.advancedLighting.shadowQuality).toBe('ultra');
    expect(profile.advancedLighting.shadowMapSize).toBe(8192);
    expect(profile.postProcessing.ssr.maxDistance).toBe(160);
    expect(profile.postProcessing.colorGrading.rendererExposure).toBe(0.96);
    expect(profile.summary).toBe('shadow ultra · gi on x2 · bake off · tone aces · bloom 1.10 · fog exponential');
  });
});
