'use client';

import { useEffect, type MutableRefObject, type RefObject } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SSRPass } from 'three/examples/jsm/postprocessing/SSRPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { GlobalIlluminationFeature } from '@/engine/rendering/RenderPipeline';
import type { ViewportCamera } from './viewportCamera';

export function syncSSAOPassCamera(pass: SSAOPass | null, camera: ViewportCamera | null) {
  if (!pass || !camera) return;

  pass.camera = camera;
  pass.ssaoMaterial.uniforms.cameraNear.value = camera.near;
  pass.ssaoMaterial.uniforms.cameraFar.value = camera.far;
  pass.ssaoMaterial.uniforms.cameraProjectionMatrix.value.copy(camera.projectionMatrix);
  pass.ssaoMaterial.uniforms.cameraInverseProjectionMatrix.value.copy(
    camera.projectionMatrixInverse
  );
  pass.depthRenderMaterial.uniforms.cameraNear.value = camera.near;
  pass.depthRenderMaterial.uniforms.cameraFar.value = camera.far;
}

export function syncSSRPassCamera(pass: SSRPass | null, camera: ViewportCamera | null) {
  if (!pass || !camera) return;

  pass.camera = camera;
  pass.ssrMaterial.uniforms.cameraNear.value = camera.near;
  pass.ssrMaterial.uniforms.cameraFar.value = camera.far;
  pass.ssrMaterial.uniforms.cameraProjectionMatrix.value.copy(camera.projectionMatrix);
  pass.ssrMaterial.uniforms.cameraInverseProjectionMatrix.value.copy(
    camera.projectionMatrixInverse
  );
  pass.depthRenderMaterial.uniforms.cameraNear.value = camera.near;
  pass.depthRenderMaterial.uniforms.cameraFar.value = camera.far;
}

const ColorGradingShader = {
  uniforms: {
    tDiffuse: { value: null },
    exposure: { value: 1 },
    contrast: { value: 1 },
    saturation: { value: 1 },
    gamma: { value: 2.2 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float exposure;
    uniform float contrast;
    uniform float saturation;
    uniform float gamma;
    varying vec2 vUv;

    vec3 applySaturation(vec3 color, float amount) {
      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      return mix(vec3(luma), color, amount);
    }

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec3 color = texel.rgb * exposure;
      color = (color - 0.5) * contrast + 0.5;
      color = applySaturation(color, saturation);
      color = pow(max(color, vec3(0.0)), vec3(1.0 / max(gamma, 0.0001)));
      gl_FragColor = vec4(color, texel.a);
    }
  `,
};

const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    intensity: { value: 0.35 },
    smoothness: { value: 0.6 },
    roundness: { value: 1.0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float intensity;
    uniform float smoothness;
    uniform float roundness;
    varying vec2 vUv;

    void main() {
      vec2 centeredUv = vUv * 2.0 - 1.0;
      centeredUv.x *= mix(1.0, 1.6, 1.0 - roundness);
      float falloff = smoothstep(
        1.0,
        max(0.0001, 1.0 - smoothness),
        length(centeredUv)
      );
      vec4 texel = texture2D(tDiffuse, vUv);
      texel.rgb *= mix(1.0, 1.0 - intensity, falloff);
      gl_FragColor = texel;
    }
  `,
};

export function useSceneViewRenderPipeline(params: {
  containerRef: RefObject<HTMLDivElement | null>;
  rendererRef: MutableRefObject<THREE.WebGLRenderer | null>;
  sceneRef: MutableRefObject<THREE.Scene | null>;
  cameraRef: MutableRefObject<ViewportCamera | null>;
  perspectiveCameraRef: MutableRefObject<THREE.PerspectiveCamera | null>;
  globalIlluminationRef: MutableRefObject<GlobalIlluminationFeature | null>;
  composerRef: MutableRefObject<EffectComposer | null>;
  renderPassRef: MutableRefObject<RenderPass | null>;
  ssaoPassRef: MutableRefObject<SSAOPass | null>;
  ssrPassRef: MutableRefObject<SSRPass | null>;
  bloomPassRef: MutableRefObject<UnrealBloomPass | null>;
  colorGradingPassRef: MutableRefObject<ShaderPass | null>;
  vignettePassRef: MutableRefObject<ShaderPass | null>;
  pmremGeneratorRef: MutableRefObject<THREE.PMREMGenerator | null>;
  renderFrameRef: MutableRefObject<(() => void) | null>;
  resizeViewportRef: MutableRefObject<((width: number, height: number) => void) | null>;
}) {
  const {
    containerRef,
    rendererRef,
    sceneRef,
    cameraRef,
    perspectiveCameraRef,
    globalIlluminationRef,
    composerRef,
    renderPassRef,
    ssaoPassRef,
    ssrPassRef,
    bloomPassRef,
    colorGradingPassRef,
    vignettePassRef,
    pmremGeneratorRef,
    renderFrameRef,
    resizeViewportRef,
  } = params;

  useEffect(() => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const initialCamera = cameraRef.current ?? perspectiveCameraRef.current;
    if (!renderer || !scene || !initialCamera) {
      return;
    }
    if (composerRef.current) {
      return;
    }

    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, initialCamera);
    const ssrPass = new SSRPass({
      renderer,
      scene,
      camera: initialCamera,
      width: Math.max(containerRef.current?.clientWidth ?? 1, 1),
      height: Math.max(containerRef.current?.clientHeight ?? 1, 1),
      selects: null,
      groundReflector: null,
    });
    ssrPass.enabled = false;
    ssrPass.opacity = 0.5;
    ssrPass.maxDistance = 100;
    ssrPass.thickness = 0.018;
    ssrPass.blur = true;
    ssrPass.distanceAttenuation = true;
    ssrPass.fresnel = true;

    const ssaoPass = new SSAOPass(
      scene,
      initialCamera,
      Math.max(containerRef.current?.clientWidth ?? 1, 1),
      Math.max(containerRef.current?.clientHeight ?? 1, 1),
      32
    );
    ssaoPass.enabled = false;
    ssaoPass.kernelRadius = 8;
    ssaoPass.minDistance = 0.012;
    ssaoPass.maxDistance = 0.12;
    ssaoPass.copyMaterial.uniforms.opacity.value = 1;

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(
        Math.max(containerRef.current?.clientWidth ?? 1, 1),
        Math.max(containerRef.current?.clientHeight ?? 1, 1)
      ),
      0.5,
      0.5,
      0.85
    );
    bloomPass.enabled = false;

    const colorGradingPass = new ShaderPass(ColorGradingShader);
    colorGradingPass.enabled = false;

    const vignettePass = new ShaderPass(VignetteShader);
    vignettePass.enabled = false;

    composer.addPass(renderPass);
    composer.addPass(ssrPass);
    composer.addPass(ssaoPass);
    composer.addPass(bloomPass);
    composer.addPass(colorGradingPass);
    composer.addPass(vignettePass);

    composerRef.current = composer;
    renderPassRef.current = renderPass;
    ssaoPassRef.current = ssaoPass;
    ssrPassRef.current = ssrPass;
    bloomPassRef.current = bloomPass;
    colorGradingPassRef.current = colorGradingPass;
    vignettePassRef.current = vignettePass;
    pmremGeneratorRef.current = new THREE.PMREMGenerator(renderer);
    pmremGeneratorRef.current.compileEquirectangularShader();
    renderFrameRef.current = () => {
      syncSSAOPassCamera(ssaoPass, cameraRef.current);
      syncSSRPassCamera(ssrPass, cameraRef.current);
      if (globalIlluminationRef.current && sceneRef.current && cameraRef.current) {
        globalIlluminationRef.current.render(
          renderer,
          sceneRef.current,
          cameraRef.current
        );
      }
      composer.render();
    };
    resizeViewportRef.current = (width: number, height: number) => {
      composer.setSize(width, height);
      ssrPass.setSize(width, height);
      ssaoPass.setSize(width, height);
      bloomPass.resolution.set(width, height);
      syncSSAOPassCamera(ssaoPass, cameraRef.current);
      syncSSRPassCamera(ssrPass, cameraRef.current);
    };

    return () => {
      composer.passes.length = 0;
      composerRef.current = null;
      renderPassRef.current = null;
      ssaoPassRef.current = null;
      ssrPassRef.current = null;
      bloomPassRef.current = null;
      colorGradingPassRef.current = null;
      vignettePassRef.current = null;
      renderFrameRef.current = null;
      resizeViewportRef.current = null;
      ssaoPass.dispose();
      ssrPass.dispose();
      pmremGeneratorRef.current?.dispose();
      pmremGeneratorRef.current = null;
    };
  }, [
    bloomPassRef,
    cameraRef,
    colorGradingPassRef,
    composerRef,
    containerRef,
    globalIlluminationRef,
    perspectiveCameraRef,
    pmremGeneratorRef,
    renderFrameRef,
    renderPassRef,
    rendererRef,
    resizeViewportRef,
    sceneRef,
    ssaoPassRef,
    ssrPassRef,
    vignettePassRef,
  ]);
}
