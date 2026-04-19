import * as THREE from 'three';
import type {
  AdvancedLightingSettingsInput,
  Color,
  EnvironmentSettings,
  ToneMappingMode,
} from '@/types/engine';
import { resolveAdvancedLightingSettings } from '@/types/engine';
import { buildAssetFileUrl } from './assetUrls';
import {
  getShadowMapSizeForQuality,
  getShadowRadiusForQuality,
  resolveSceneRenderProfile,
  resolveShadowQualityMode,
  resolveToneMappingMode,
} from '@/engine/rendering/renderEnvironmentProfile';

export const WORLD_SKY_ASSET_PREFIX = 'asset:';

export const WORLD_SKY_PRESETS = {
  studio: {
    top: '#0f1b34',
    horizon: '#5b7fb0',
    bottom: '#0b1220',
    sun: 'rgba(245, 219, 153, 0.72)',
    accent: 'rgba(120, 208, 255, 0.28)',
  },
  sunset: {
    top: '#3c1a39',
    horizon: '#f07c59',
    bottom: '#1b0d1f',
    sun: 'rgba(255, 203, 130, 0.78)',
    accent: 'rgba(255, 112, 166, 0.24)',
  },
  forest: {
    top: '#163226',
    horizon: '#4c7a53',
    bottom: '#0a1610',
    sun: 'rgba(213, 240, 169, 0.58)',
    accent: 'rgba(91, 190, 145, 0.22)',
  },
  night: {
    top: '#050a1c',
    horizon: '#11234d',
    bottom: '#02040d',
    sun: 'rgba(132, 168, 255, 0.32)',
    accent: 'rgba(92, 121, 255, 0.2)',
  },
  void: {
    top: '#05060a',
    horizon: '#121826',
    bottom: '#010103',
    sun: 'rgba(185, 192, 255, 0.16)',
    accent: 'rgba(104, 90, 255, 0.15)',
  },
} as const;

export type WorldSkyPresetName = keyof typeof WORLD_SKY_PRESETS;

type WorldLookPreset = {
  label: string;
  description: string;
  skybox?: string;
  ambientLight?: Color;
  ambientIntensity?: number;
  environmentIntensity?: number;
  environmentRotation?: number;
  directionalLightIntensity?: number;
  directionalLightAzimuth?: number;
  directionalLightElevation?: number;
  advancedLighting?: AdvancedLightingSettingsInput;
  fog?: EnvironmentSettings['fog'];
  postProcessing?: {
    bloom?: Partial<EnvironmentSettings['postProcessing']['bloom']>;
    ssao?: Partial<EnvironmentSettings['postProcessing']['ssao']>;
    ssr?: Partial<EnvironmentSettings['postProcessing']['ssr']>;
    colorGrading?: Partial<EnvironmentSettings['postProcessing']['colorGrading']>;
    vignette?: Partial<EnvironmentSettings['postProcessing']['vignette']>;
  };
};

export const WORLD_LOOK_PRESETS = {
  neutral: {
    label: 'Neutral',
    description: 'Balance limpio para revisar modelado y materiales sin dramatizar.',
    skybox: 'studio',
    ambientLight: { r: 0.56, g: 0.58, b: 0.62, a: 1 },
    ambientIntensity: 1,
    environmentIntensity: 1,
    environmentRotation: 0,
    directionalLightIntensity: 1.15,
    directionalLightAzimuth: 42,
    directionalLightElevation: 56,
    advancedLighting: {
      shadowQuality: 'medium',
      globalIllumination: { enabled: false, intensity: 0.9, bounceCount: 1 },
      bakedLightmaps: { enabled: false },
    },
    fog: null,
    postProcessing: {
      bloom: { enabled: false, intensity: 0.3, threshold: 0.9, radius: 0.25 },
      ssao: { enabled: false, radius: 0.5, intensity: 1, bias: 0.025 },
      ssr: { enabled: false, intensity: 0.45, maxDistance: 90 },
      colorGrading: {
        enabled: false,
        exposure: 1,
        contrast: 1,
        saturation: 1,
        gamma: 2.2,
        toneMapping: 'aces',
        rendererExposure: 1,
      },
      vignette: { enabled: false, intensity: 0.25, smoothness: 0.65, roundness: 1 },
    },
  },
  product: {
    label: 'Product',
    description: 'Luz de estudio con respuesta pulida para previews de materiales.',
    skybox: 'studio',
    ambientLight: { r: 0.66, g: 0.68, b: 0.72, a: 1 },
    ambientIntensity: 1.08,
    environmentIntensity: 1.35,
    environmentRotation: 18,
    directionalLightIntensity: 1.05,
    directionalLightAzimuth: 34,
    directionalLightElevation: 62,
    advancedLighting: {
      shadowQuality: 'high',
      globalIllumination: { enabled: true, intensity: 0.85, bounceCount: 1 },
      bakedLightmaps: { enabled: false },
    },
    fog: null,
    postProcessing: {
      bloom: { enabled: true, intensity: 0.32, threshold: 0.84, radius: 0.28 },
      ssao: { enabled: true, radius: 0.65, intensity: 1.12, bias: 0.02 },
      ssr: { enabled: true, intensity: 0.42, maxDistance: 120 },
      colorGrading: {
        enabled: true,
        exposure: 1.02,
        contrast: 1.03,
        saturation: 1.02,
        gamma: 2.12,
        toneMapping: 'aces',
        rendererExposure: 1.08,
      },
      vignette: { enabled: true, intensity: 0.16, smoothness: 0.72, roundness: 1.08 },
    },
  },
  goldenHour: {
    label: 'Golden Hour',
    description: 'Preset cálido con volumen suave para staging y renders hero.',
    skybox: 'sunset',
    ambientLight: { r: 0.82, g: 0.63, b: 0.5, a: 1 },
    ambientIntensity: 0.94,
    environmentIntensity: 1.18,
    environmentRotation: 26,
    directionalLightIntensity: 1.72,
    directionalLightAzimuth: 28,
    directionalLightElevation: 24,
    advancedLighting: {
      shadowQuality: 'high',
      globalIllumination: { enabled: true, intensity: 1.02, bounceCount: 2 },
      bakedLightmaps: { enabled: false },
    },
    fog: {
      enabled: true,
      type: 'exponential',
      color: { r: 0.76, g: 0.56, b: 0.48, a: 1 },
      density: 0.009,
    },
    postProcessing: {
      bloom: { enabled: true, intensity: 0.72, threshold: 0.64, radius: 0.52 },
      ssao: { enabled: true, radius: 0.72, intensity: 1.04, bias: 0.018 },
      ssr: { enabled: false, intensity: 0.35, maxDistance: 100 },
      colorGrading: {
        enabled: true,
        exposure: 1.08,
        contrast: 1.08,
        saturation: 0.96,
        gamma: 2.05,
        toneMapping: 'aces',
        rendererExposure: 1.14,
      },
      vignette: { enabled: true, intensity: 0.28, smoothness: 0.62, roundness: 0.9 },
    },
  },
  cinematic: {
    label: 'Cinematic',
    description: 'Look dramático con volumen, reflejos y separación tonal.',
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
  },
} as const satisfies Record<string, WorldLookPreset>;

export type WorldLookPresetName = keyof typeof WORLD_LOOK_PRESETS;

export function isWorldSkyPreset(value: string | null | undefined): value is WorldSkyPresetName {
  return typeof value === 'string' && value in WORLD_SKY_PRESETS;
}

export function resolveWorldSkyPreset(value: string | null | undefined): WorldSkyPresetName {
  return isWorldSkyPreset(value) ? value : 'studio';
}

export function isWorldSkyAsset(
  value: string | null | undefined
): value is `${typeof WORLD_SKY_ASSET_PREFIX}${string}` {
  return typeof value === 'string' && value.startsWith(WORLD_SKY_ASSET_PREFIX);
}

export function makeWorldSkyAssetValue(assetPath: string) {
  return `${WORLD_SKY_ASSET_PREFIX}${assetPath.trim()}`;
}

export function getWorldSkyAssetPath(value: string | null | undefined) {
  if (!isWorldSkyAsset(value)) {
    return null;
  }
  const assetPath = value.slice(WORLD_SKY_ASSET_PREFIX.length).trim();
  return assetPath.length > 0 ? assetPath : null;
}

export function buildWorldEnvironmentUrl(value: string | null | undefined) {
  const assetPath = getWorldSkyAssetPath(value);
  return assetPath ? buildAssetFileUrl(assetPath) : '';
}

export function isHdrEnvironmentAsset(assetPath: string | null | undefined) {
  const normalized = (assetPath ?? '').trim().toLowerCase();
  return normalized.endsWith('.hdr') || normalized.endsWith('.exr');
}

export function isWorldLookPreset(
  value: string | null | undefined
): value is WorldLookPresetName {
  return typeof value === 'string' && value in WORLD_LOOK_PRESETS;
}

export function resolveWorldLookPreset(value: string | null | undefined): WorldLookPresetName {
  return isWorldLookPreset(value) ? value : 'neutral';
}

export function applyWorldLookPreset(
  environment: EnvironmentSettings,
  presetName: WorldLookPresetName
): EnvironmentSettings {
  const preset = WORLD_LOOK_PRESETS[presetName];
  const keepAssetSkybox = isWorldSkyAsset(environment.skybox) && preset.skybox;
  const currentAdvancedLighting = resolveAdvancedLightingSettings(
    environment.advancedLighting
  );
  const nextAdvancedLighting = resolveAdvancedLightingSettings({
    ...currentAdvancedLighting,
    ...preset.advancedLighting,
    globalIllumination: {
      ...currentAdvancedLighting.globalIllumination,
      ...preset.advancedLighting?.globalIllumination,
    },
    bakedLightmaps: {
      ...currentAdvancedLighting.bakedLightmaps,
      ...preset.advancedLighting?.bakedLightmaps,
    },
  });

  return {
    ...environment,
    skybox: keepAssetSkybox ? environment.skybox : preset.skybox ?? environment.skybox,
    ambientLight: preset.ambientLight ?? environment.ambientLight,
    ambientIntensity: preset.ambientIntensity ?? environment.ambientIntensity,
    environmentIntensity: preset.environmentIntensity ?? environment.environmentIntensity,
    environmentRotation: preset.environmentRotation ?? environment.environmentRotation,
    directionalLightIntensity:
      preset.directionalLightIntensity ?? environment.directionalLightIntensity,
    directionalLightAzimuth:
      preset.directionalLightAzimuth ?? environment.directionalLightAzimuth,
    directionalLightElevation:
      preset.directionalLightElevation ?? environment.directionalLightElevation,
    advancedLighting: nextAdvancedLighting,
    fog: preset.fog === undefined ? environment.fog : preset.fog,
    postProcessing: {
      ...environment.postProcessing,
      bloom: {
        ...environment.postProcessing.bloom,
        ...preset.postProcessing?.bloom,
      },
      ssao: {
        ...environment.postProcessing.ssao,
        ...preset.postProcessing?.ssao,
      },
      ssr: {
        ...environment.postProcessing.ssr,
        ...preset.postProcessing?.ssr,
      },
      colorGrading: {
        ...environment.postProcessing.colorGrading,
        ...preset.postProcessing?.colorGrading,
      },
      vignette: {
        ...environment.postProcessing.vignette,
        ...preset.postProcessing?.vignette,
      },
    },
  };
}

export { getShadowMapSizeForQuality, getShadowRadiusForQuality, resolveSceneRenderProfile };

export function resolveToneMapping(value: Parameters<typeof resolveToneMappingMode>[0]) {
  return resolveToneMappingMode(value);
}

export function getThreeToneMapping(mode: ToneMappingMode | null | undefined) {
  switch (resolveToneMapping(mode)) {
    case 'none':
      return THREE.NoToneMapping;
    case 'linear':
      return THREE.LinearToneMapping;
    case 'reinhard':
      return THREE.ReinhardToneMapping;
    case 'cineon':
      return THREE.CineonToneMapping;
    case 'aces':
    default:
      return THREE.ACESFilmicToneMapping;
  }
}

export function resolveShadowQuality(value: Parameters<typeof resolveShadowQualityMode>[0]) {
  return resolveShadowQualityMode(value);
}

export function computeDirectionalLightPosition(
  azimuthDegrees: number,
  elevationDegrees: number,
  distance = 85
) {
  const azimuthRadians = THREE.MathUtils.degToRad(azimuthDegrees);
  const elevationRadians = THREE.MathUtils.degToRad(elevationDegrees);

  return new THREE.Vector3(
    Math.cos(elevationRadians) * Math.cos(azimuthRadians) * distance,
    Math.sin(elevationRadians) * distance,
    Math.cos(elevationRadians) * Math.sin(azimuthRadians) * distance
  );
}
