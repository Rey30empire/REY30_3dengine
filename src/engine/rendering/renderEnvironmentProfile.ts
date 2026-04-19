import type {
  Color,
  EnvironmentSettings,
  FogSettings,
  ShadowQualityMode,
  ToneMappingMode,
} from '@/types/engine';
import { resolveAdvancedLightingSettings } from '@/types/engine';

export interface SceneRenderProfile {
  skybox: string | null;
  ambientLight: Color;
  ambientIntensity: number;
  environmentIntensity: number;
  environmentRotation: number;
  directionalLightIntensity: number;
  directionalLightAzimuth: number;
  directionalLightElevation: number;
  fog: FogSettings | null;
  advancedLighting: {
    shadowQuality: ShadowQualityMode;
    shadowMapSize: number;
    shadowRadius: number;
    shadowBias: number;
    globalIllumination: {
      enabled: boolean;
      intensity: number;
      bounceCount: number;
    };
    bakedLightmaps: {
      enabled: boolean;
    };
  };
  postProcessing: {
    bloom: {
      enabled: boolean;
      intensity: number;
      threshold: number;
      radius: number;
    };
    ssao: {
      enabled: boolean;
      radius: number;
      intensity: number;
      bias: number;
    };
    ssr: {
      enabled: boolean;
      intensity: number;
      maxDistance: number;
    };
    colorGrading: {
      enabled: boolean;
      exposure: number;
      contrast: number;
      saturation: number;
      gamma: number;
      toneMapping: ToneMappingMode;
      rendererExposure: number;
    };
    vignette: {
      enabled: boolean;
      intensity: number;
      smoothness: number;
      roundness: number;
    };
  };
  summary: string;
}

function clampFinite(value: unknown, fallback: number, min?: number, max?: number) {
  let next = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  if (typeof min === 'number') {
    next = Math.max(min, next);
  }
  if (typeof max === 'number') {
    next = Math.min(max, next);
  }
  return next;
}

function normalizeAngle(value: unknown, fallback: number) {
  const normalized = clampFinite(value, fallback);
  return ((normalized % 360) + 360) % 360;
}

function normalizeColor(value: Partial<Color> | null | undefined, fallback: Color): Color {
  return {
    r: clampFinite(value?.r, fallback.r, 0, 1),
    g: clampFinite(value?.g, fallback.g, 0, 1),
    b: clampFinite(value?.b, fallback.b, 0, 1),
    a: clampFinite(value?.a, fallback.a ?? 1, 0, 1),
  };
}

export function resolveShadowQualityMode(
  value: ShadowQualityMode | null | undefined
): ShadowQualityMode {
  switch (value) {
    case 'low':
    case 'medium':
    case 'high':
    case 'ultra':
      return value;
    default:
      return 'high';
  }
}

export function getShadowMapSizeForQuality(quality: ShadowQualityMode | null | undefined) {
  switch (resolveShadowQualityMode(quality)) {
    case 'low':
      return 1024;
    case 'medium':
      return 2048;
    case 'ultra':
      return 8192;
    case 'high':
    default:
      return 4096;
  }
}

export function getShadowRadiusForQuality(quality: ShadowQualityMode | null | undefined) {
  switch (resolveShadowQualityMode(quality)) {
    case 'low':
      return 1;
    case 'medium':
      return 2;
    case 'ultra':
      return 4;
    case 'high':
    default:
      return 3;
  }
}

export function getShadowBiasForQuality(quality: ShadowQualityMode | null | undefined) {
  return resolveShadowQualityMode(quality) === 'ultra' ? -0.00008 : -0.00018;
}

export function resolveToneMappingMode(
  value: ToneMappingMode | null | undefined
): ToneMappingMode {
  switch (value) {
    case 'none':
    case 'linear':
    case 'reinhard':
    case 'cineon':
    case 'aces':
      return value;
    default:
      return 'aces';
  }
}

function normalizeFog(value: FogSettings | null | undefined): FogSettings | null {
  if (!value?.enabled) {
    return null;
  }

  const type = value.type === 'linear' ? 'linear' : 'exponential';
  const color = normalizeColor(value.color, { r: 0.08, g: 0.1, b: 0.14, a: 1 });
  if (type === 'linear') {
    const near = clampFinite(value.near, 12, 0, 1000);
    const far = clampFinite(value.far, Math.max(near + 1, 90), near + 0.1, 5000);
    return {
      enabled: true,
      type,
      color,
      near,
      far,
    };
  }

  return {
    enabled: true,
    type,
    color,
    density: clampFinite(value.density, 0.015, 0.0001, 0.2),
  };
}

export function buildSceneRenderProfileSummary(profile: Omit<SceneRenderProfile, 'summary'>) {
  const segments = [
    `shadow ${profile.advancedLighting.shadowQuality}`,
    profile.advancedLighting.globalIllumination.enabled
      ? `gi on x${profile.advancedLighting.globalIllumination.bounceCount}`
      : 'gi off',
    profile.advancedLighting.bakedLightmaps.enabled ? 'bake on' : 'bake off',
    `tone ${profile.postProcessing.colorGrading.toneMapping}`,
  ];

  if (profile.postProcessing.bloom.enabled) {
    segments.push(`bloom ${profile.postProcessing.bloom.intensity.toFixed(2)}`);
  }
  if (profile.fog?.enabled) {
    segments.push(`fog ${profile.fog.type}`);
  }

  return segments.join(' · ');
}

export function resolveSceneRenderProfile(
  environment: EnvironmentSettings | null | undefined
): SceneRenderProfile {
  const advancedLighting = resolveAdvancedLightingSettings(environment?.advancedLighting);
  const shadowQuality = resolveShadowQualityMode(advancedLighting.shadowQuality);
  const profileWithoutSummary = {
    skybox: environment?.skybox ?? 'studio',
    ambientLight: normalizeColor(environment?.ambientLight, { r: 0.5, g: 0.5, b: 0.5, a: 1 }),
    ambientIntensity: clampFinite(environment?.ambientIntensity, 1, 0, 8),
    environmentIntensity: clampFinite(environment?.environmentIntensity, 1, 0, 8),
    environmentRotation: normalizeAngle(environment?.environmentRotation, 0),
    directionalLightIntensity: clampFinite(environment?.directionalLightIntensity, 1.2, 0, 8),
    directionalLightAzimuth: normalizeAngle(environment?.directionalLightAzimuth, 45),
    directionalLightElevation: clampFinite(environment?.directionalLightElevation, 55, -89, 89),
    fog: normalizeFog(environment?.fog),
    advancedLighting: {
      shadowQuality,
      shadowMapSize: getShadowMapSizeForQuality(shadowQuality),
      shadowRadius: getShadowRadiusForQuality(shadowQuality),
      shadowBias: getShadowBiasForQuality(shadowQuality),
      globalIllumination: {
        enabled: Boolean(advancedLighting.globalIllumination.enabled),
        intensity: clampFinite(advancedLighting.globalIllumination.intensity, 1, 0, 2),
        bounceCount: Math.round(
          clampFinite(advancedLighting.globalIllumination.bounceCount, 1, 1, 4)
        ),
      },
      bakedLightmaps: {
        enabled: Boolean(advancedLighting.bakedLightmaps.enabled),
      },
    },
    postProcessing: {
      bloom: {
        enabled: Boolean(environment?.postProcessing?.bloom.enabled),
        intensity: clampFinite(environment?.postProcessing?.bloom.intensity, 0.5, 0, 2),
        threshold: clampFinite(environment?.postProcessing?.bloom.threshold, 0.8, 0, 1),
        radius: clampFinite(environment?.postProcessing?.bloom.radius, 0.5, 0, 1.5),
      },
      ssao: {
        enabled: Boolean(environment?.postProcessing?.ssao.enabled),
        radius: clampFinite(environment?.postProcessing?.ssao.radius, 0.5, 0.1, 2),
        intensity: clampFinite(environment?.postProcessing?.ssao.intensity, 1, 0, 2),
        bias: clampFinite(environment?.postProcessing?.ssao.bias, 0.025, 0.001, 0.2),
      },
      ssr: {
        enabled: Boolean(environment?.postProcessing?.ssr.enabled),
        intensity: clampFinite(environment?.postProcessing?.ssr.intensity, 0.5, 0.05, 1),
        maxDistance: clampFinite(environment?.postProcessing?.ssr.maxDistance, 100, 1, 500),
      },
      colorGrading: {
        enabled: Boolean(environment?.postProcessing?.colorGrading.enabled),
        exposure: clampFinite(environment?.postProcessing?.colorGrading.exposure, 1, 0.1, 4),
        contrast: clampFinite(environment?.postProcessing?.colorGrading.contrast, 1, 0.25, 2),
        saturation: clampFinite(environment?.postProcessing?.colorGrading.saturation, 1, 0, 2),
        gamma: clampFinite(environment?.postProcessing?.colorGrading.gamma, 2.2, 0.1, 4),
        toneMapping: resolveToneMappingMode(environment?.postProcessing?.colorGrading.toneMapping),
        rendererExposure: clampFinite(
          environment?.postProcessing?.colorGrading.rendererExposure,
          1,
          0.25,
          4
        ),
      },
      vignette: {
        enabled: Boolean(environment?.postProcessing?.vignette.enabled),
        intensity: clampFinite(environment?.postProcessing?.vignette.intensity, 0.5, 0, 1),
        smoothness: clampFinite(environment?.postProcessing?.vignette.smoothness, 0.5, 0, 1),
        roundness: clampFinite(environment?.postProcessing?.vignette.roundness, 1, 0.5, 1.5),
      },
    },
  };

  return {
    ...profileWithoutSummary,
    summary: buildSceneRenderProfileSummary(profileWithoutSummary),
  };
}
