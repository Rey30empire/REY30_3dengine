'use client';

import { useEffect, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import type { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import type { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import type { SSRPass } from 'three/examples/jsm/postprocessing/SSRPass.js';
import type { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { createLightingSystem, type LightingSystem, ShadowQuality } from '@/engine/rendering/LightingSystem';
import { GlobalIlluminationFeature } from '@/engine/rendering/RenderPipeline';
import type { Scene } from '@/types/engine';
import type { ViewportCamera } from './viewportCamera';
import {
  buildWorldEnvironmentUrl,
  computeDirectionalLightPosition,
  getShadowMapSizeForQuality,
  getShadowRadiusForQuality,
  getThreeToneMapping,
  getWorldSkyAssetPath,
  resolveSceneRenderProfile,
  resolveToneMapping,
  resolveWorldSkyPreset,
  WORLD_SKY_PRESETS,
} from './worldPipeline';
import { isPerspectiveCamera } from './viewportCamera';

type SceneRuntimeEnvironment = THREE.Scene & {
  backgroundIntensity?: number;
  environmentIntensity?: number;
  backgroundRotation?: THREE.Euler;
  environmentRotation?: THREE.Euler;
};

function createEnvironmentTexture(preset: string, rotationDegrees: number) {
  if (typeof document === 'undefined') return null;

  const palette = WORLD_SKY_PRESETS[resolveWorldSkyPreset(preset)];
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;

  const context = canvas.getContext('2d');
  if (!context) return null;

  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, palette.top);
  gradient.addColorStop(0.52, palette.horizon);
  gradient.addColorStop(1, palette.bottom);
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const normalizedRotation = (((rotationDegrees % 360) + 360) % 360) / 360;
  const primaryGlowX = canvas.width * normalizedRotation;
  const secondaryGlowX = (primaryGlowX + canvas.width * 0.42) % canvas.width;
  const glowY = canvas.height * 0.28;

  [primaryGlowX, secondaryGlowX].forEach((glowX, index) => {
    const radius = index === 0 ? canvas.height * 0.78 : canvas.height * 0.45;
    const glow = context.createRadialGradient(glowX, glowY, 0, glowX, glowY, radius);
    glow.addColorStop(0, palette.sun);
    glow.addColorStop(0.3, palette.accent);
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    context.fillStyle = glow;
    context.fillRect(0, 0, canvas.width, canvas.height);
  });

  context.globalAlpha = 0.1;
  for (let index = 0; index < 14; index += 1) {
    const bandY = canvas.height * (0.24 + index * 0.035);
    context.strokeStyle = index % 2 === 0 ? '#ffffff' : '#9cc8ff';
    context.lineWidth = index % 3 === 0 ? 2 : 1;
    context.beginPath();
    context.moveTo(0, bandY);
    context.bezierCurveTo(
      canvas.width * 0.25,
      bandY - 16,
      canvas.width * 0.75,
      bandY + 12,
      canvas.width,
      bandY - 10
    );
    context.stroke();
  }

  if (preset === 'night' || preset === 'void') {
    context.globalAlpha = preset === 'night' ? 0.35 : 0.18;
    context.fillStyle = '#ffffff';
    for (let index = 0; index < 60; index += 1) {
      const starX = (index * 173) % canvas.width;
      const starY = (index * 97) % (canvas.height * 0.55);
      const size = index % 7 === 0 ? 2.2 : 1.2;
      context.beginPath();
      context.arc(starX, starY, size, 0, Math.PI * 2);
      context.fill();
    }
  }

  context.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

function disposeEnvironmentResources(
  texture: THREE.Texture | null,
  renderTarget: THREE.WebGLRenderTarget | null
) {
  texture?.dispose();
  renderTarget?.dispose();
}

async function loadEnvironmentAssetTexture(
  assetPath: string,
  environmentUrl: string
): Promise<THREE.Texture> {
  if (assetPath.toLowerCase().endsWith('.hdr')) {
    const loader = new RGBELoader();
    const texture = await loader.loadAsync(environmentUrl);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    return texture;
  }

  if (assetPath.toLowerCase().endsWith('.exr')) {
    const loader = new EXRLoader();
    const texture = await loader.loadAsync(environmentUrl);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    return texture;
  }

  const loader = new THREE.TextureLoader();
  const texture = await loader.loadAsync(environmentUrl);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

async function resolveEnvironmentTexture(
  skybox: string | null,
  rotationDegrees: number
): Promise<THREE.Texture | null> {
  const assetPath = getWorldSkyAssetPath(skybox);
  const environmentUrl = buildWorldEnvironmentUrl(skybox);
  if (assetPath && environmentUrl) {
    try {
      return await loadEnvironmentAssetTexture(assetPath, environmentUrl);
    } catch (error) {
      console.warn('[SceneView] Falling back to preset environment after asset load failure.', error);
    }
  }

  return createEnvironmentTexture(resolveWorldSkyPreset(skybox), rotationDegrees);
}

export function useSceneViewWorldPipeline(params: {
  activeScene: Scene | null;
  showLights: boolean;
  lightingBakeRequest:
    | {
        sceneId?: string | null;
        token?: number | null;
      }
    | null
    | undefined;
  sceneRef: MutableRefObject<THREE.Scene | null>;
  rendererRef: MutableRefObject<THREE.WebGLRenderer | null>;
  cameraRef: MutableRefObject<ViewportCamera | null>;
  perspectiveCameraRef: MutableRefObject<THREE.PerspectiveCamera | null>;
  environmentTextureRef: MutableRefObject<THREE.Texture | null>;
  environmentRenderTargetRef: MutableRefObject<THREE.WebGLRenderTarget | null>;
  pmremGeneratorRef: MutableRefObject<THREE.PMREMGenerator | null>;
  lightingSystemRef: MutableRefObject<LightingSystem | null>;
  globalIlluminationRef: MutableRefObject<GlobalIlluminationFeature | null>;
  lastLightingBakeTokenRef: MutableRefObject<number | null>;
  bloomPassRef: MutableRefObject<UnrealBloomPass | null>;
  colorGradingPassRef: MutableRefObject<ShaderPass | null>;
  ssaoPassRef: MutableRefObject<SSAOPass | null>;
  ssrPassRef: MutableRefObject<SSRPass | null>;
  vignettePassRef: MutableRefObject<ShaderPass | null>;
}) {
  const {
    activeScene,
    showLights,
    lightingBakeRequest,
    sceneRef,
    rendererRef,
    cameraRef,
    perspectiveCameraRef,
    environmentTextureRef,
    environmentRenderTargetRef,
    pmremGeneratorRef,
    lightingSystemRef,
    globalIlluminationRef,
    lastLightingBakeTokenRef,
    bloomPassRef,
    colorGradingPassRef,
    ssaoPassRef,
    ssrPassRef,
    vignettePassRef,
  } = params;

  useEffect(() => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const initialCamera = cameraRef.current ?? perspectiveCameraRef.current;
    if (!renderer || !scene || !initialCamera) {
      return;
    }

    const lightingSystem = createLightingSystem();
    lightingSystem.initialize(scene, renderer);
    lightingSystemRef.current = lightingSystem;

    const globalIllumination = new GlobalIlluminationFeature();
    globalIllumination.initialize(renderer, scene);
    globalIlluminationRef.current = globalIllumination;

    return () => {
      globalIllumination.dispose();
      globalIlluminationRef.current = null;
      lightingSystem.dispose();
      lightingSystemRef.current = null;
    };
  }, [
    cameraRef,
    globalIlluminationRef,
    lightingSystemRef,
    perspectiveCameraRef,
    rendererRef,
    sceneRef,
  ]);

  useEffect(() => {
    const scene = sceneRef.current;
    const renderer = rendererRef.current;
    if (!scene || !activeScene) return;

    let cancelled = false;

    const applyWorldPipeline = async () => {
      const renderProfile = resolveSceneRenderProfile(activeScene.environment);
      const runtimeScene = scene as SceneRuntimeEnvironment;
      const skybox = activeScene.environment.skybox ?? 'studio';
      const skyPreset = resolveWorldSkyPreset(skybox);
      const skyPalette = WORLD_SKY_PRESETS[skyPreset];
      const ambient = scene.getObjectByName('ambient_light') as THREE.AmbientLight | null;
      const directional = scene.getObjectByName('directional_light') as THREE.DirectionalLight | null;
      const ground = scene.getObjectByName('Ground') as THREE.Mesh | null;
      const nextBackgroundTexture = await resolveEnvironmentTexture(
        skybox,
        renderProfile.environmentRotation
      );
      let nextEnvironmentRenderTarget: THREE.WebGLRenderTarget | null = null;

      if (renderer && nextBackgroundTexture && pmremGeneratorRef.current) {
        nextEnvironmentRenderTarget = pmremGeneratorRef.current.fromEquirectangular(
          nextBackgroundTexture
        );
      }

      if (cancelled) {
        disposeEnvironmentResources(nextBackgroundTexture, nextEnvironmentRenderTarget);
        return;
      }

      if (nextBackgroundTexture && nextEnvironmentRenderTarget) {
        runtimeScene.background = nextBackgroundTexture;
        runtimeScene.environment = nextEnvironmentRenderTarget.texture;
        runtimeScene.backgroundIntensity = 1;
        runtimeScene.environmentIntensity = renderProfile.environmentIntensity;
        runtimeScene.backgroundRotation = new THREE.Euler(
          0,
          THREE.MathUtils.degToRad(renderProfile.environmentRotation),
          0
        );
        runtimeScene.environmentRotation = new THREE.Euler(
          0,
          THREE.MathUtils.degToRad(renderProfile.environmentRotation),
          0
        );
      } else {
        runtimeScene.background = new THREE.Color(skyPalette.bottom);
        runtimeScene.environment = null;
        runtimeScene.backgroundIntensity = 1;
        runtimeScene.environmentIntensity = renderProfile.environmentIntensity;
        runtimeScene.backgroundRotation = new THREE.Euler(0, 0, 0);
        runtimeScene.environmentRotation = new THREE.Euler(0, 0, 0);
      }

      if (ambient) {
        ambient.color.copy(
          new THREE.Color(
            renderProfile.ambientLight.r,
            renderProfile.ambientLight.g,
            renderProfile.ambientLight.b
          )
        );
        ambient.intensity = renderProfile.ambientIntensity;
        ambient.visible = showLights;
      }

      if (directional) {
        directional.intensity = renderProfile.directionalLightIntensity;
        directional.position.copy(
          computeDirectionalLightPosition(
            renderProfile.directionalLightAzimuth,
            renderProfile.directionalLightElevation,
            85
          )
        );
        let target = scene.getObjectByName('__directional_light_target');
        if (!target) {
          target = new THREE.Object3D();
          target.name = '__directional_light_target';
          scene.add(target);
        }
        target.position.set(0, 0, 0);
        target.updateMatrixWorld();
        directional.target = target as THREE.Object3D;
        directional.visible = showLights;
        directional.updateMatrixWorld();
      }

      if (ground && ground.material instanceof THREE.MeshStandardMaterial) {
        const groundColor = new THREE.Color(skyPalette.bottom).lerp(
          new THREE.Color(skyPalette.horizon),
          0.22
        );
        ground.material.color.copy(groundColor);
        ground.material.metalness = 0.08;
        ground.material.roughness = 0.92;
        ground.material.envMapIntensity = renderProfile.environmentIntensity * 0.35;
        ground.material.needsUpdate = true;
      }

      if (renderProfile.fog?.enabled) {
        const fogColor = new THREE.Color(
          renderProfile.fog.color.r,
          renderProfile.fog.color.g,
          renderProfile.fog.color.b
        );

        scene.fog =
          renderProfile.fog.type === 'exponential'
            ? new THREE.FogExp2(fogColor, renderProfile.fog.density ?? 0.015)
            : new THREE.Fog(
                fogColor,
                renderProfile.fog.near ?? 12,
                renderProfile.fog.far ?? 90
              );
      } else {
        scene.fog = null;
      }

      const bloom = renderProfile.postProcessing.bloom;
      if (bloomPassRef.current) {
        bloomPassRef.current.enabled = bloom.enabled;
        bloomPassRef.current.strength = bloom.intensity;
        bloomPassRef.current.threshold = bloom.threshold;
        bloomPassRef.current.radius = bloom.radius;
      }

      const colorGrading = renderProfile.postProcessing.colorGrading;
      if (renderer) {
        renderer.toneMapping = getThreeToneMapping(resolveToneMapping(colorGrading.toneMapping));
        renderer.toneMappingExposure = colorGrading.rendererExposure;
      }

      const ssao = renderProfile.postProcessing.ssao;
      if (ssaoPassRef.current) {
        const ssaoBias = THREE.MathUtils.clamp(ssao.bias, 0.001, 0.2);
        ssaoPassRef.current.enabled = ssao.enabled;
        ssaoPassRef.current.kernelRadius = THREE.MathUtils.clamp(ssao.radius * 16, 3, 32);
        ssaoPassRef.current.minDistance = ssaoBias;
        ssaoPassRef.current.maxDistance = Math.max(ssaoBias + ssao.radius * 0.18, ssaoBias + 0.01);
        ssaoPassRef.current.copyMaterial.uniforms.opacity.value = THREE.MathUtils.clamp(
          ssao.intensity,
          0,
          2
        );
      }

      const ssr = renderProfile.postProcessing.ssr;
      if (ssrPassRef.current) {
        ssrPassRef.current.enabled =
          ssr.enabled && isPerspectiveCamera(cameraRef.current ?? perspectiveCameraRef.current);
        ssrPassRef.current.opacity = THREE.MathUtils.clamp(ssr.intensity, 0.05, 1);
        ssrPassRef.current.maxDistance = Math.max(ssr.maxDistance, 1);
        ssrPassRef.current.thickness = THREE.MathUtils.lerp(
          0.014,
          0.04,
          THREE.MathUtils.clamp(ssr.intensity, 0, 1)
        );
      }

      if (colorGradingPassRef.current) {
        colorGradingPassRef.current.enabled = colorGrading.enabled;
        colorGradingPassRef.current.uniforms.exposure.value = colorGrading.exposure;
        colorGradingPassRef.current.uniforms.contrast.value = colorGrading.contrast;
        colorGradingPassRef.current.uniforms.saturation.value = colorGrading.saturation;
        colorGradingPassRef.current.uniforms.gamma.value = colorGrading.gamma;
      }

      const vignette = renderProfile.postProcessing.vignette;
      if (vignettePassRef.current) {
        vignettePassRef.current.enabled = vignette.enabled;
        vignettePassRef.current.uniforms.intensity.value = vignette.intensity;
        vignettePassRef.current.uniforms.smoothness.value = vignette.smoothness;
        vignettePassRef.current.uniforms.roundness.value = vignette.roundness;
      }

      disposeEnvironmentResources(
        environmentTextureRef.current,
        environmentRenderTargetRef.current
      );
      environmentTextureRef.current = nextBackgroundTexture;
      environmentRenderTargetRef.current = nextEnvironmentRenderTarget;
    };

    void applyWorldPipeline();

    return () => {
      cancelled = true;
    };
  }, [
    activeScene,
    bloomPassRef,
    cameraRef,
    colorGradingPassRef,
    environmentRenderTargetRef,
    environmentTextureRef,
    pmremGeneratorRef,
    perspectiveCameraRef,
    rendererRef,
    sceneRef,
    showLights,
    ssaoPassRef,
    ssrPassRef,
    vignettePassRef,
  ]);

  useEffect(() => {
    return () => {
      disposeEnvironmentResources(
        environmentTextureRef.current,
        environmentRenderTargetRef.current
      );
      environmentTextureRef.current = null;
      environmentRenderTargetRef.current = null;
    };
  }, [environmentRenderTargetRef, environmentTextureRef]);

  useEffect(() => {
    const scene = sceneRef.current;
    const renderer = rendererRef.current;
    const lightingSystem = lightingSystemRef.current;
    const globalIllumination = globalIlluminationRef.current;
    if (!scene || !renderer || !activeScene || !lightingSystem || !globalIllumination) {
      return;
    }

    const renderProfile = resolveSceneRenderProfile(activeScene.environment);
    const advancedLighting = renderProfile.advancedLighting;
    const shadowQuality = advancedLighting.shadowQuality as ShadowQuality;
    const shadowMapSize = getShadowMapSizeForQuality(shadowQuality);
    const directional = scene.getObjectByName('directional_light') as THREE.DirectionalLight | null;

    lightingSystem.setShadowQuality(shadowQuality);
    renderer.shadowMap.enabled = true;

    if (directional) {
      directional.castShadow = true;
      if (
        directional.shadow.mapSize.x !== shadowMapSize ||
        directional.shadow.mapSize.y !== shadowMapSize
      ) {
        directional.shadow.mapSize.set(shadowMapSize, shadowMapSize);
        directional.shadow.map?.dispose();
        directional.shadow.map = null;
      }
      directional.shadow.radius = getShadowRadiusForQuality(shadowQuality);
      directional.shadow.bias = advancedLighting.shadowBias;
      directional.shadow.needsUpdate = true;
    }

    globalIllumination.setIntensity(advancedLighting.globalIllumination.intensity);
    globalIllumination.setBounceCount(advancedLighting.globalIllumination.bounceCount);
    globalIllumination.enabled = advancedLighting.globalIllumination.enabled;

    if (!advancedLighting.globalIllumination.enabled) {
      globalIllumination.dispose();
      scene.userData.globalIllumination = {
        enabled: false,
        intensity: advancedLighting.globalIllumination.intensity,
        bounceCount: advancedLighting.globalIllumination.bounceCount,
        updatedAt: Date.now(),
      };
    }

    const bakeRequestToken =
      lightingBakeRequest?.sceneId === activeScene.id
        ? lightingBakeRequest.token || 0
        : 0;

    let cancelled = false;

    const applyBakedLightmaps = async () => {
      if (!advancedLighting.bakedLightmaps.enabled) {
        lightingSystem.clearBakedLightmaps(scene);
        scene.userData.__advancedLightmapsEnabled = false;
        return;
      }

      const shouldBake =
        scene.userData.__advancedLightmapsEnabled !== true ||
        lastLightingBakeTokenRef.current !== bakeRequestToken;

      if (!shouldBake) {
        return;
      }

      await lightingSystem.bakeLightmaps(scene);
      if (cancelled) {
        return;
      }

      scene.userData.__advancedLightmapsEnabled = true;
      lastLightingBakeTokenRef.current = bakeRequestToken;
    };

    void applyBakedLightmaps();

    scene.userData.viewportLighting = {
      shadowQuality: advancedLighting.shadowQuality,
      shadowMapSize: advancedLighting.shadowMapSize,
      shadowRadius: advancedLighting.shadowRadius,
      shadowBias: advancedLighting.shadowBias,
      globalIllumination: {
        enabled: advancedLighting.globalIllumination.enabled,
        intensity: advancedLighting.globalIllumination.intensity,
        bounceCount: advancedLighting.globalIllumination.bounceCount,
      },
      bakedLightmaps: {
        enabled: advancedLighting.bakedLightmaps.enabled,
      },
      summary: renderProfile.summary,
      updatedAt: Date.now(),
    };

    return () => {
      cancelled = true;
    };
  }, [
    activeScene,
    globalIlluminationRef,
    lastLightingBakeTokenRef,
    lightingBakeRequest?.sceneId,
    lightingBakeRequest?.token,
    lightingSystemRef,
    rendererRef,
    sceneRef,
  ]);

}
