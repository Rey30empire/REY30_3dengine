// ============================================
// Post Processing Stack - Complete Implementation
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// ============================================

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import type { Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { SSAARenderPass } from 'three/examples/jsm/postprocessing/SSAARenderPass.js';
import { TAARenderPass } from 'three/examples/jsm/postprocessing/TAARenderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { CopyShader } from 'three/examples/jsm/shaders/CopyShader.js';
import { LuminosityHighPassShader } from 'three/examples/jsm/shaders/LuminosityHighPassShader.js';

// ============================================
// INTERFACES
// ============================================

/**
 * Quality levels for post-processing effects
 */
export type QualityLevel = 'low' | 'medium' | 'high' | 'ultra';

/**
 * Bokeh shape options for Depth of Field
 */
export type BokehShape = 'circle' | 'hexagon' | 'octagon';

/**
 * Anti-aliasing method options
 */
export type AAMethod = 'none' | 'fxaa' | 'smaa' | 'taa' | 'ssaa';

/**
 * Tone mapping options
 */
export type ToneMappingType = 'none' | 'linear' | 'reinhard' | 'cineon' | 'aces' | 'custom';

/**
 * Base interface for all post-processing effects
 */
export interface PostProcessEffect {
  /** Whether the effect is enabled */
  enabled: boolean;
  /** Quality level of the effect */
  quality: QualityLevel;
  /** Update the effect each frame */
  update(deltaTime: number): void;
  /** Dispose of resources */
  dispose(): void;
}

/**
 * Effect wrapper with metadata
 */
interface EffectWrapper {
  name: string;
  effect: PostProcessEffect;
  pass: Pass | null;
  priority: number;
}

// ============================================
// BLOOM PASS
// ============================================

export interface BloomConfig {
  enabled: boolean;
  strength: number;
  radius: number;
  threshold: number;
  quality: QualityLevel;
}

const BloomQualitySettings = {
  low: { samples: 4, separation: 2.0 },
  medium: { samples: 8, separation: 1.5 },
  high: { samples: 16, separation: 1.0 },
  ultra: { samples: 32, separation: 0.5 },
};

export class BloomPass implements PostProcessEffect {
  enabled: boolean = true;
  quality: QualityLevel = 'high';
  
  private bloomPass: UnrealBloomPass;
  private _strength: number = 1.5;
  private _radius: number = 0.4;
  private _threshold: number = 0.85;

  constructor(resolution: THREE.Vector2, config?: Partial<BloomConfig>) {
    if (config) {
      this.enabled = config.enabled ?? true;
      this.quality = config.quality ?? 'high';
      this._strength = config.strength ?? 1.5;
      this._radius = config.radius ?? 0.4;
      this._threshold = config.threshold ?? 0.85;
    }

    this.bloomPass = new UnrealBloomPass(
      resolution,
      this._strength,
      this._radius,
      this._threshold
    );
    this.bloomPass.enabled = this.enabled;
  }

  get strength(): number { return this._strength; }
  set strength(value: number) {
    this._strength = value;
    this.bloomPass.strength = value;
  }

  get radius(): number { return this._radius; }
  set radius(value: number) {
    this._radius = value;
    this.bloomPass.radius = value;
  }

  get threshold(): number { return this._threshold; }
  set threshold(value: number) {
    this._threshold = value;
    this.bloomPass.threshold = value;
  }

  get pass(): UnrealBloomPass { return this.bloomPass; }

  setQuality(quality: QualityLevel): void {
    this.quality = quality;
    const settings = BloomQualitySettings[quality];
    // UnrealBloomPass doesn't expose these directly, but we store for reference
  }

  update(_deltaTime: number): void {
    this.bloomPass.enabled = this.enabled;
  }

  dispose(): void {
    this.bloomPass.dispose();
  }
}

// ============================================
// SSAO PASS
// ============================================

export interface SSAOConfig {
  enabled: boolean;
  radius: number;
  minDistance: number;
  maxDistance: number;
  samples: 16 | 32 | 48 | 64;
  blurEnabled: boolean;
  quality: QualityLevel;
}

const SSAOQualitySettings = {
  low: { samples: 16 as const, kernelRadius: 8 },
  medium: { samples: 32 as const, kernelRadius: 16 },
  high: { samples: 48 as const, kernelRadius: 24 },
  ultra: { samples: 64 as const, kernelRadius: 32 },
};

export class SSAOPassEffect implements PostProcessEffect {
  enabled: boolean = true;
  quality: QualityLevel = 'high';
  
  private ssaoPass: SSAOPass;
  private _radius: number = 16;
  private _minDistance: number = 0.005;
  private _maxDistance: number = 0.1;
  private _blurEnabled: boolean = true;

  constructor(scene: THREE.Scene, camera: THREE.Camera, width: number, height: number, config?: Partial<SSAOConfig>) {
    this.ssaoPass = new SSAOPass(scene, camera, width, height);
    
    if (config) {
      this.enabled = config.enabled ?? true;
      this.quality = config.quality ?? 'high';
      this._radius = config.radius ?? 16;
      this._minDistance = config.minDistance ?? 0.005;
      this._maxDistance = config.maxDistance ?? 0.1;
      this._blurEnabled = config.blurEnabled ?? true;
    }

    this.applySettings();
  }

  private applySettings(): void {
    this.ssaoPass.kernelRadius = this._radius;
    this.ssaoPass.minDistance = this._minDistance;
    this.ssaoPass.maxDistance = this._maxDistance;
    this.ssaoPass.enabled = this.enabled;
  }

  get radius(): number { return this._radius; }
  set radius(value: number) {
    this._radius = value;
    this.ssaoPass.kernelRadius = value;
  }

  get minDistance(): number { return this._minDistance; }
  set minDistance(value: number) {
    this._minDistance = value;
    this.ssaoPass.minDistance = value;
  }

  get maxDistance(): number { return this._maxDistance; }
  set maxDistance(value: number) {
    this._maxDistance = value;
    this.ssaoPass.maxDistance = value;
  }

  get pass(): SSAOPass { return this.ssaoPass; }

  setQuality(quality: QualityLevel): void {
    this.quality = quality;
    const settings = SSAOQualitySettings[quality];
    this.ssaoPass.kernelRadius = settings.kernelRadius;
  }

  update(_deltaTime: number): void {
    this.ssaoPass.enabled = this.enabled;
  }

  dispose(): void {
    this.ssaoPass.dispose();
  }
}

// ============================================
// SSR PASS (Screen Space Reflections)
// ============================================

export interface SSRConfig {
  enabled: boolean;
  maxDistance: number;
  resolution: number;
  blurEnabled: boolean;
  blurSharpness: number;
  fresnelFade: number;
  quality: QualityLevel;
}

const SSRQualitySettings = {
  low: { resolution: 0.25, steps: 8 },
  medium: { resolution: 0.5, steps: 16 },
  high: { resolution: 0.75, steps: 32 },
  ultra: { resolution: 1.0, steps: 64 },
};

// SSR Shader
const SSRShader = {
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    tNormal: { value: null },
    cameraNear: { value: 0.1 },
    cameraFar: { value: 1000 },
    resolution: { value: new THREE.Vector2() },
    maxDistance: { value: 100 },
    fresnelFade: { value: 0.5 },
    blurSharpness: { value: 0.5 },
    time: { value: 0 },
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
    uniform sampler2D tDepth;
    uniform sampler2D tNormal;
    uniform float cameraNear;
    uniform float cameraFar;
    uniform vec2 resolution;
    uniform float maxDistance;
    uniform float fresnelFade;
    uniform float blurSharpness;
    uniform float time;
    
    varying vec2 vUv;
    
    float getDepth(vec2 uv) {
      float depth = texture2D(tDepth, uv).r;
      return depth;
    }
    
    vec3 getNormal(vec2 uv) {
      return texture2D(tNormal, uv).xyz * 2.0 - 1.0;
    }
    
    vec3 getViewPosition(vec2 uv, float depth) {
      vec4 clipPos = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
      vec4 viewPos = inverse(projectionMatrix) * clipPos;
      return viewPos.xyz / viewPos.w;
    }
    
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float depth = getDepth(vUv);
      vec3 normal = getNormal(vUv);
      vec3 viewPos = getViewPosition(vUv, depth);
      
      // Reflection calculation
      vec3 viewDir = normalize(-viewPos);
      vec3 reflectDir = reflect(-viewDir, normal);
      
      // Simple screen space reflection
      vec2 hitUV = vUv;
      vec3 reflectedColor = vec3(0.0);
      float reflectionStrength = 0.0;
      
      // March along reflection ray
      vec3 currentPos = viewPos;
      vec2 currentUV = vUv;
      
      for(int i = 0; i < 32; i++) {
        currentPos += reflectDir * 0.5;
        vec4 clipPos = projectionMatrix * vec4(currentPos, 1.0);
        currentUV = (clipPos.xy / clipPos.w) * 0.5 + 0.5;
        
        if(currentUV.x < 0.0 || currentUV.x > 1.0 || currentUV.y < 0.0 || currentUV.y > 1.0) break;
        
        float currentDepth = getDepth(currentUV);
        float expectedDepth = clipPos.z / clipPos.w * 0.5 + 0.5;
        
        if(abs(currentDepth - expectedDepth) < 0.001) {
          reflectedColor = texture2D(tDiffuse, currentUV).rgb;
          reflectionStrength = 1.0 - fresnelFade + fresnelFade * pow(1.0 - max(dot(viewDir, normal), 0.0), 3.0);
          break;
        }
      }
      
      gl_FragColor = vec4(mix(color.rgb, reflectedColor, reflectionStrength * 0.5), color.a);
    }
  `,
};

export class SSRPassEffect implements PostProcessEffect {
  enabled: boolean = true;
  quality: QualityLevel = 'high';
  
  private ssrPass: ShaderPass;
  private _maxDistance: number = 100;
  private _resolution: number = 0.5;
  private _blurEnabled: boolean = true;
  private _blurSharpness: number = 0.5;
  private _fresnelFade: number = 0.5;

  constructor(config?: Partial<SSRConfig>) {
    if (config) {
      this.enabled = config.enabled ?? true;
      this.quality = config.quality ?? 'high';
      this._maxDistance = config.maxDistance ?? 100;
      this._resolution = config.resolution ?? 0.5;
      this._blurEnabled = config.blurEnabled ?? true;
      this._blurSharpness = config.blurSharpness ?? 0.5;
      this._fresnelFade = config.fresnelFade ?? 0.5;
    }

    this.ssrPass = new ShaderPass(SSRShader);
    this.ssrPass.enabled = this.enabled;
  }

  get pass(): ShaderPass { return this.ssrPass; }

  get maxDistance(): number { return this._maxDistance; }
  set maxDistance(value: number) {
    this._maxDistance = value;
    this.ssrPass.uniforms.maxDistance.value = value;
  }

  get fresnelFade(): number { return this._fresnelFade; }
  set fresnelFade(value: number) {
    this._fresnelFade = value;
    this.ssrPass.uniforms.fresnelFade.value = value;
  }

  setQuality(quality: QualityLevel): void {
    this.quality = quality;
    const settings = SSRQualitySettings[quality];
    this._resolution = settings.resolution;
  }

  update(deltaTime: number): void {
    this.ssrPass.enabled = this.enabled;
    this.ssrPass.uniforms.time.value += deltaTime;
  }

  dispose(): void {
    this.ssrPass.dispose();
  }
}

// ============================================
// DOF PASS (Depth of Field)
// ============================================

export interface DOFConfig {
  enabled: boolean;
  focusDistance: number;
  focalLength: number;
  aperture: number;
  bokehShape: BokehShape;
  debugFocusPlane: boolean;
  quality: QualityLevel;
}

const DOFQualitySettings = {
  low: { samples: 8, rings: 3 },
  medium: { samples: 16, rings: 4 },
  high: { samples: 32, rings: 5 },
  ultra: { samples: 64, rings: 6 },
};

// Bokeh DOF Shader
const BokehShader = {
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    resolution: { value: new THREE.Vector2() },
    cameraNear: { value: 0.1 },
    cameraFar: { value: 1000 },
    focusDistance: { value: 10 },
    focalLength: { value: 35 },
    aperture: { value: 2.8 },
    bokehShape: { value: 0 }, // 0: circle, 1: hexagon, 2: octagon
    debugFocusPlane: { value: false },
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
    uniform sampler2D tDepth;
    uniform vec2 resolution;
    uniform float cameraNear;
    uniform float cameraFar;
    uniform float focusDistance;
    uniform float focalLength;
    uniform float aperture;
    uniform int bokehShape;
    uniform bool debugFocusPlane;
    
    varying vec2 vUv;
    
    float getDepth(vec2 uv) {
      float depth = texture2D(tDepth, uv).r;
      return depth;
    }
    
    float getCoC(float depth) {
      float focusDepth = focusDistance;
      float coc = abs(depth - focusDepth) * aperture * focalLength / (depth * (focusDepth - focalLength));
      return clamp(coc, 0.0, 1.0);
    }
    
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float depth = getDepth(vUv);
      float coc = getCoC(depth);
      
      if(debugFocusPlane) {
        // Debug: show focus plane
        float focusDepthLinear = (focusDistance - cameraNear) / (cameraFar - cameraNear);
        float diff = abs(depth - focusDepthLinear);
        if(diff < 0.01) {
          gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
          return;
        }
      }
      
      // Simple blur based on CoC
      if(coc > 0.01) {
        vec4 blurColor = vec4(0.0);
        float total = 0.0;
        int samples = 16;
        
        for(int i = 0; i < 16; i++) {
          float angle = float(i) * 6.28318 / float(samples);
          vec2 offset = vec2(cos(angle), sin(angle)) * coc * 0.01;
          blurColor += texture2D(tDiffuse, vUv + offset);
          total += 1.0;
        }
        
        color = mix(color, blurColor / total, coc);
      }
      
      gl_FragColor = color;
    }
  `,
};

export class DOFPassEffect implements PostProcessEffect {
  enabled: boolean = true;
  quality: QualityLevel = 'high';
  
  private dofPass: ShaderPass;
  private _focusDistance: number = 10;
  private _focalLength: number = 35;
  private _aperture: number = 2.8;
  private _bokehShape: BokehShape = 'circle';
  private _debugFocusPlane: boolean = false;

  constructor(config?: Partial<DOFConfig>) {
    if (config) {
      this.enabled = config.enabled ?? true;
      this.quality = config.quality ?? 'high';
      this._focusDistance = config.focusDistance ?? 10;
      this._focalLength = config.focalLength ?? 35;
      this._aperture = config.aperture ?? 2.8;
      this._bokehShape = config.bokehShape ?? 'circle';
      this._debugFocusPlane = config.debugFocusPlane ?? false;
    }

    this.dofPass = new ShaderPass(BokehShader);
    this.applySettings();
  }

  private applySettings(): void {
    this.dofPass.uniforms.focusDistance.value = this._focusDistance;
    this.dofPass.uniforms.focalLength.value = this._focalLength;
    this.dofPass.uniforms.aperture.value = this._aperture;
    this.dofPass.uniforms.bokehShape.value = this._bokehShape === 'circle' ? 0 : this._bokehShape === 'hexagon' ? 1 : 2;
    this.dofPass.uniforms.debugFocusPlane.value = this._debugFocusPlane;
    this.dofPass.enabled = this.enabled;
  }

  get pass(): ShaderPass { return this.dofPass; }

  get focusDistance(): number { return this._focusDistance; }
  set focusDistance(value: number) {
    this._focusDistance = value;
    this.dofPass.uniforms.focusDistance.value = value;
  }

  get focalLength(): number { return this._focalLength; }
  set focalLength(value: number) {
    this._focalLength = value;
    this.dofPass.uniforms.focalLength.value = value;
  }

  get aperture(): number { return this._aperture; }
  set aperture(value: number) {
    this._aperture = value;
    this.dofPass.uniforms.aperture.value = value;
  }

  get bokehShape(): BokehShape { return this._bokehShape; }
  set bokehShape(value: BokehShape) {
    this._bokehShape = value;
    this.dofPass.uniforms.bokehShape.value = value === 'circle' ? 0 : value === 'hexagon' ? 1 : 2;
  }

  get debugFocusPlane(): boolean { return this._debugFocusPlane; }
  set debugFocusPlane(value: boolean) {
    this._debugFocusPlane = value;
    this.dofPass.uniforms.debugFocusPlane.value = value;
  }

  setQuality(quality: QualityLevel): void {
    this.quality = quality;
  }

  update(_deltaTime: number): void {
    this.dofPass.enabled = this.enabled;
  }

  dispose(): void {
    this.dofPass.dispose();
  }
}

// ============================================
// MOTION BLUR PASS
// ============================================

export interface MotionBlurConfig {
  enabled: boolean;
  intensity: number;
  samples: number;
  quality: QualityLevel;
}

const MotionBlurQualitySettings = {
  low: { samples: 8 },
  medium: { samples: 16 },
  high: { samples: 32 },
  ultra: { samples: 64 },
};

// Motion Blur Shader
const MotionBlurShader = {
  uniforms: {
    tDiffuse: { value: null },
    tVelocity: { value: null },
    intensity: { value: 0.5 },
    samples: { value: 16 },
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
    uniform sampler2D tVelocity;
    uniform float intensity;
    uniform int samples;
    
    varying vec2 vUv;
    
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      vec2 velocity = texture2D(tVelocity, vUv).xy * intensity;
      
      vec4 blurColor = color;
      float total = 1.0;
      
      for(int i = 1; i < 64; i++) {
        if(i >= samples) break;
        vec2 offset = velocity * float(i) / float(samples);
        blurColor += texture2D(tDiffuse, vUv + offset);
        blurColor += texture2D(tDiffuse, vUv - offset);
        total += 2.0;
      }
      
      gl_FragColor = blurColor / total;
    }
  `,
};

export class MotionBlurPassEffect implements PostProcessEffect {
  enabled: boolean = true;
  quality: QualityLevel = 'high';
  
  private motionBlurPass: ShaderPass;
  private _intensity: number = 0.5;
  private _samples: number = 16;
  private velocityBuffer: THREE.WebGLRenderTarget | null = null;

  constructor(config?: Partial<MotionBlurConfig>) {
    if (config) {
      this.enabled = config.enabled ?? true;
      this.quality = config.quality ?? 'high';
      this._intensity = config.intensity ?? 0.5;
      this._samples = config.samples ?? 16;
    }

    this.motionBlurPass = new ShaderPass(MotionBlurShader);
    this.motionBlurPass.uniforms.intensity.value = this._intensity;
    this.motionBlurPass.uniforms.samples.value = this._samples;
    this.motionBlurPass.enabled = this.enabled;
  }

  get pass(): ShaderPass { return this.motionBlurPass; }

  get intensity(): number { return this._intensity; }
  set intensity(value: number) {
    this._intensity = value;
    this.motionBlurPass.uniforms.intensity.value = value;
  }

  get samples(): number { return this._samples; }
  set samples(value: number) {
    this._samples = value;
    this.motionBlurPass.uniforms.samples.value = value;
  }

  setQuality(quality: QualityLevel): void {
    this.quality = quality;
    const settings = MotionBlurQualitySettings[quality];
    this._samples = settings.samples;
    this.motionBlurPass.uniforms.samples.value = settings.samples;
  }

  update(_deltaTime: number): void {
    this.motionBlurPass.enabled = this.enabled;
  }

  dispose(): void {
    this.motionBlurPass.dispose();
    this.velocityBuffer?.dispose();
  }
}

// ============================================
// CHROMATIC ABERRATION PASS
// ============================================

export interface ChromaticAberrationConfig {
  enabled: boolean;
  offset: number;
  radial: boolean;
  quality: QualityLevel;
}

// Chromatic Aberration Shader
const ChromaticAberrationShader = {
  uniforms: {
    tDiffuse: { value: null },
    offset: { value: 0.005 },
    radial: { value: true },
    resolution: { value: new THREE.Vector2() },
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
    uniform float offset;
    uniform bool radial;
    uniform vec2 resolution;
    
    varying vec2 vUv;
    
    void main() {
      vec2 direction = radial ? normalize(vUv - 0.5) : vec2(1.0, 0.0);
      float dist = radial ? length(vUv - 0.5) : 1.0;
      
      vec2 offsetR = direction * offset * dist;
      vec2 offsetB = direction * offset * dist * -1.0;
      
      float r = texture2D(tDiffuse, vUv + offsetR).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv + offsetB).b;
      
      gl_FragColor = vec4(r, g, b, 1.0);
    }
  `,
};

export class ChromaticAberrationPassEffect implements PostProcessEffect {
  enabled: boolean = true;
  quality: QualityLevel = 'high';
  
  private caPass: ShaderPass;
  private _offset: number = 0.005;
  private _radial: boolean = true;

  constructor(config?: Partial<ChromaticAberrationConfig>) {
    if (config) {
      this.enabled = config.enabled ?? true;
      this.quality = config.quality ?? 'high';
      this._offset = config.offset ?? 0.005;
      this._radial = config.radial ?? true;
    }

    this.caPass = new ShaderPass(ChromaticAberrationShader);
    this.caPass.uniforms.offset.value = this._offset;
    this.caPass.uniforms.radial.value = this._radial;
    this.caPass.enabled = this.enabled;
  }

  get pass(): ShaderPass { return this.caPass; }

  get offset(): number { return this._offset; }
  set offset(value: number) {
    this._offset = value;
    this.caPass.uniforms.offset.value = value;
  }

  get radial(): boolean { return this._radial; }
  set radial(value: boolean) {
    this._radial = value;
    this.caPass.uniforms.radial.value = value;
  }

  setQuality(quality: QualityLevel): void {
    this.quality = quality;
  }

  update(_deltaTime: number): void {
    this.caPass.enabled = this.enabled;
  }

  dispose(): void {
    this.caPass.dispose();
  }
}

// ============================================
// VIGNETTE PASS
// ============================================

export interface VignetteConfig {
  enabled: boolean;
  intensity: number;
  smoothness: number;
  roundness: number;
  color: THREE.Color;
  quality: QualityLevel;
}

// Vignette Shader
const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    intensity: { value: 0.5 },
    smoothness: { value: 0.5 },
    roundness: { value: 1.0 },
    color: { value: new THREE.Color(0x000000) },
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
    uniform vec3 color;
    
    varying vec2 vUv;
    
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      
      vec2 uv = vUv * 2.0 - 1.0;
      float dist = length(uv);
      dist = pow(dist, roundness);
      
      float vignette = smoothstep(1.0 - smoothness, 1.0 + smoothness, dist);
      vignette = mix(0.0, 1.0, vignette * intensity);
      
      texel.rgb = mix(texel.rgb, color, vignette);
      
      gl_FragColor = texel;
    }
  `,
};

export class VignettePassEffect implements PostProcessEffect {
  enabled: boolean = true;
  quality: QualityLevel = 'high';
  
  private vignettePass: ShaderPass;
  private _intensity: number = 0.5;
  private _smoothness: number = 0.5;
  private _roundness: number = 1.0;
  private _color: THREE.Color = new THREE.Color(0x000000);

  constructor(config?: Partial<VignetteConfig>) {
    if (config) {
      this.enabled = config.enabled ?? true;
      this.quality = config.quality ?? 'high';
      this._intensity = config.intensity ?? 0.5;
      this._smoothness = config.smoothness ?? 0.5;
      this._roundness = config.roundness ?? 1.0;
      this._color = config.color ?? new THREE.Color(0x000000);
    }

    this.vignettePass = new ShaderPass(VignetteShader);
    this.vignettePass.uniforms.intensity.value = this._intensity;
    this.vignettePass.uniforms.smoothness.value = this._smoothness;
    this.vignettePass.uniforms.roundness.value = this._roundness;
    this.vignettePass.uniforms.color.value = this._color;
    this.vignettePass.enabled = this.enabled;
  }

  get pass(): ShaderPass { return this.vignettePass; }

  get intensity(): number { return this._intensity; }
  set intensity(value: number) {
    this._intensity = value;
    this.vignettePass.uniforms.intensity.value = value;
  }

  get smoothness(): number { return this._smoothness; }
  set smoothness(value: number) {
    this._smoothness = value;
    this.vignettePass.uniforms.smoothness.value = value;
  }

  get roundness(): number { return this._roundness; }
  set roundness(value: number) {
    this._roundness = value;
    this.vignettePass.uniforms.roundness.value = value;
  }

  get color(): THREE.Color { return this._color; }
  set color(value: THREE.Color) {
    this._color = value;
    this.vignettePass.uniforms.color.value = value;
  }

  setQuality(quality: QualityLevel): void {
    this.quality = quality;
  }

  update(_deltaTime: number): void {
    this.vignettePass.enabled = this.enabled;
  }

  dispose(): void {
    this.vignettePass.dispose();
  }
}

// ============================================
// COLOR GRADING PASS
// ============================================

export interface ColorGradingConfig {
  enabled: boolean;
  contrast: number;
  saturation: number;
  brightness: number;
  colorFilter: THREE.Color;
  hueShift: number;
  temperature: number;
  tint: number;
  toneMapping: ToneMappingType;
  exposure: number;
  gamma: number;
  lutTexture: THREE.Texture | null;
  quality: QualityLevel;
}

// Color Grading Shader
const ColorGradingShader = {
  uniforms: {
    tDiffuse: { value: null },
    contrast: { value: 1.0 },
    saturation: { value: 1.0 },
    brightness: { value: 1.0 },
    colorFilter: { value: new THREE.Color(0xffffff) },
    hueShift: { value: 0.0 },
    temperature: { value: 0.0 },
    tint: { value: 0.0 },
    exposure: { value: 1.0 },
    gamma: { value: 1.0 },
    toneMapping: { value: 0 },
    lutTexture: { value: null },
    lutEnabled: { value: false },
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
    uniform float contrast;
    uniform float saturation;
    uniform float brightness;
    uniform vec3 colorFilter;
    uniform float hueShift;
    uniform float temperature;
    uniform float tint;
    uniform float exposure;
    uniform float gamma;
    uniform int toneMapping;
    uniform sampler2D lutTexture;
    uniform bool lutEnabled;
    
    varying vec2 vUv;
    
    vec3 rgb2hsv(vec3 c) {
      vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
      vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
      vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
      float d = q.x - min(q.w, q.y);
      float e = 1.0e-10;
      return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
    }
    
    vec3 hsv2rgb(vec3 c) {
      vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
      vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
      return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    }
    
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec3 color = texel.rgb;
      
      // Exposure
      color *= exposure;
      
      // Temperature and Tint
      color.r += temperature * 0.1;
      color.b -= temperature * 0.1;
      color.g += tint * 0.05;
      
      // Color Filter
      color *= colorFilter;
      
      // Brightness
      color *= brightness;
      
      // Contrast
      color = (color - 0.5) * contrast + 0.5;
      
      // Saturation
      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color = mix(vec3(luma), color, saturation);
      
      // Hue Shift
      vec3 hsv = rgb2hsv(color);
      hsv.x = fract(hsv.x + hueShift);
      color = hsv2rgb(hsv);
      
      // Tone Mapping
      if(toneMapping == 1) {
        // Linear (no change)
      } else if(toneMapping == 2) {
        // Reinhard
        color = color / (color + vec3(1.0));
      } else if(toneMapping == 3) {
        // Cineon
        color = max(vec3(0.0), color - 0.004);
        color = (color * (6.2 * color + 0.5)) / (color * (6.2 * color + 1.7) + 0.06);
      } else if(toneMapping == 4) {
        // ACES
        float a = 2.51;
        float b = 0.03;
        float c = 2.43;
        float d = 0.59;
        float e = 0.14;
        color = clamp((color * (a * color + b)) / (color * (c * color + d) + e), 0.0, 1.0);
      }
      
      // Gamma correction
      color = pow(color, vec3(1.0 / gamma));
      
      // LUT (simplified - apply 2D LUT)
      if(lutEnabled) {
        // 3D LUT sampling would go here
      }
      
      gl_FragColor = vec4(clamp(color, 0.0, 1.0), texel.a);
    }
  `,
};

export class ColorGradingPassEffect implements PostProcessEffect {
  enabled: boolean = true;
  quality: QualityLevel = 'high';
  
  private colorGradingPass: ShaderPass;
  private _contrast: number = 1.0;
  private _saturation: number = 1.0;
  private _brightness: number = 1.0;
  private _colorFilter: THREE.Color = new THREE.Color(0xffffff);
  private _hueShift: number = 0.0;
  private _temperature: number = 0.0;
  private _tint: number = 0.0;
  private _toneMapping: ToneMappingType = 'aces';
  private _exposure: number = 1.0;
  private _gamma: number = 1.0;
  private _lutTexture: THREE.Texture | null = null;

  constructor(config?: Partial<ColorGradingConfig>) {
    if (config) {
      this.enabled = config.enabled ?? true;
      this.quality = config.quality ?? 'high';
      this._contrast = config.contrast ?? 1.0;
      this._saturation = config.saturation ?? 1.0;
      this._brightness = config.brightness ?? 1.0;
      this._colorFilter = config.colorFilter ?? new THREE.Color(0xffffff);
      this._hueShift = config.hueShift ?? 0.0;
      this._temperature = config.temperature ?? 0.0;
      this._tint = config.tint ?? 0.0;
      this._toneMapping = config.toneMapping ?? 'aces';
      this._exposure = config.exposure ?? 1.0;
      this._gamma = config.gamma ?? 1.0;
      this._lutTexture = config.lutTexture ?? null;
    }

    this.colorGradingPass = new ShaderPass(ColorGradingShader);
    this.applySettings();
  }

  private applySettings(): void {
    const uniforms = this.colorGradingPass.uniforms;
    uniforms.contrast.value = this._contrast;
    uniforms.saturation.value = this._saturation;
    uniforms.brightness.value = this._brightness;
    uniforms.colorFilter.value = this._colorFilter;
    uniforms.hueShift.value = this._hueShift;
    uniforms.temperature.value = this._temperature;
    uniforms.tint.value = this._tint;
    uniforms.exposure.value = this._exposure;
    uniforms.gamma.value = this._gamma;
    uniforms.toneMapping.value = this.getToneMappingIndex();
    uniforms.lutTexture.value = this._lutTexture;
    uniforms.lutEnabled.value = this._lutTexture !== null;
    this.colorGradingPass.enabled = this.enabled;
  }

  private getToneMappingIndex(): number {
    switch (this._toneMapping) {
      case 'none': return 0;
      case 'linear': return 1;
      case 'reinhard': return 2;
      case 'cineon': return 3;
      case 'aces': return 4;
      default: return 4;
    }
  }

  get pass(): ShaderPass { return this.colorGradingPass; }

  get contrast(): number { return this._contrast; }
  set contrast(value: number) {
    this._contrast = value;
    this.colorGradingPass.uniforms.contrast.value = value;
  }

  get saturation(): number { return this._saturation; }
  set saturation(value: number) {
    this._saturation = value;
    this.colorGradingPass.uniforms.saturation.value = value;
  }

  get brightness(): number { return this._brightness; }
  set brightness(value: number) {
    this._brightness = value;
    this.colorGradingPass.uniforms.brightness.value = value;
  }

  get colorFilter(): THREE.Color { return this._colorFilter; }
  set colorFilter(value: THREE.Color) {
    this._colorFilter = value;
    this.colorGradingPass.uniforms.colorFilter.value = value;
  }

  get hueShift(): number { return this._hueShift; }
  set hueShift(value: number) {
    this._hueShift = value;
    this.colorGradingPass.uniforms.hueShift.value = value;
  }

  get temperature(): number { return this._temperature; }
  set temperature(value: number) {
    this._temperature = value;
    this.colorGradingPass.uniforms.temperature.value = value;
  }

  get tint(): number { return this._tint; }
  set tint(value: number) {
    this._tint = value;
    this.colorGradingPass.uniforms.tint.value = value;
  }

  get exposure(): number { return this._exposure; }
  set exposure(value: number) {
    this._exposure = value;
    this.colorGradingPass.uniforms.exposure.value = value;
  }

  get gamma(): number { return this._gamma; }
  set gamma(value: number) {
    this._gamma = value;
    this.colorGradingPass.uniforms.gamma.value = value;
  }

  get toneMapping(): ToneMappingType { return this._toneMapping; }
  set toneMapping(value: ToneMappingType) {
    this._toneMapping = value;
    this.colorGradingPass.uniforms.toneMapping.value = this.getToneMappingIndex();
  }

  get lutTexture(): THREE.Texture | null { return this._lutTexture; }
  set lutTexture(value: THREE.Texture | null) {
    this._lutTexture = value;
    this.colorGradingPass.uniforms.lutTexture.value = value;
    this.colorGradingPass.uniforms.lutEnabled.value = value !== null;
  }

  setQuality(quality: QualityLevel): void {
    this.quality = quality;
  }

  update(_deltaTime: number): void {
    this.colorGradingPass.enabled = this.enabled;
  }

  dispose(): void {
    this.colorGradingPass.dispose();
    this._lutTexture?.dispose();
  }
}

// ============================================
// ANTI-ALIASING PASSES
// ============================================

export interface AAConfig {
  enabled: boolean;
  method: AAMethod;
  quality: QualityLevel;
}

const AAQualitySettings = {
  low: { method: 'fxaa' as AAMethod },
  medium: { method: 'smaa' as AAMethod },
  high: { method: 'smaa' as AAMethod },
  ultra: { method: 'taa' as AAMethod },
};

export class FXAAPassEffect implements PostProcessEffect {
  enabled: boolean = true;
  quality: QualityLevel = 'high';
  
  private fxaaPass: ShaderPass;

  constructor(config?: Partial<AAConfig>) {
    if (config) {
      this.enabled = config.enabled ?? true;
      this.quality = config.quality ?? 'high';
    }

    this.fxaaPass = new ShaderPass(FXAAShader);
    this.fxaaPass.enabled = this.enabled;
  }

  get pass(): ShaderPass { return this.fxaaPass; }

  setResolution(width: number, height: number): void {
    this.fxaaPass.uniforms['resolution'].value.set(1 / width, 1 / height);
  }

  setQuality(quality: QualityLevel): void {
    this.quality = quality;
  }

  update(_deltaTime: number): void {
    this.fxaaPass.enabled = this.enabled;
  }

  dispose(): void {
    this.fxaaPass.dispose();
  }
}

export class SMAAPassEffect implements PostProcessEffect {
  enabled: boolean = true;
  quality: QualityLevel = 'high';
  
  private smaaPass: SMAAPass;
  private width: number;
  private height: number;

  constructor(width: number, height: number, config?: Partial<AAConfig>) {
    this.width = width;
    this.height = height;
    
    if (config) {
      this.enabled = config.enabled ?? true;
      this.quality = config.quality ?? 'high';
    }

    this.smaaPass = new SMAAPass();
    this.smaaPass.setSize(width, height);
    this.smaaPass.enabled = this.enabled;
  }

  get pass(): SMAAPass { return this.smaaPass; }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.smaaPass.setSize(width, height);
  }

  setQuality(quality: QualityLevel): void {
    this.quality = quality;
  }

  update(_deltaTime: number): void {
    this.smaaPass.enabled = this.enabled;
  }

  dispose(): void {
    this.smaaPass.dispose();
  }
}

export class TAAPassEffect implements PostProcessEffect {
  enabled: boolean = true;
  quality: QualityLevel = 'ultra';
  
  private taaPass: TAARenderPass;
  private scene: THREE.Scene;
  private camera: THREE.Camera;

  constructor(scene: THREE.Scene, camera: THREE.Camera, width: number, height: number, config?: Partial<AAConfig>) {
    this.scene = scene;
    this.camera = camera;
    
    if (config) {
      this.enabled = config.enabled ?? true;
      this.quality = config.quality ?? 'ultra';
    }

    this.taaPass = new TAARenderPass(scene, camera);
    this.taaPass.enabled = this.enabled;
    this.taaPass.setSize(width, height);
  }

  get pass(): TAARenderPass { return this.taaPass; }

  resize(width: number, height: number): void {
    this.taaPass.setSize(width, height);
  }

  setQuality(quality: QualityLevel): void {
    this.quality = quality;
  }

  update(_deltaTime: number): void {
    this.taaPass.enabled = this.enabled;
  }

  dispose(): void {
    this.taaPass.dispose();
  }
}

export class SSAAPassEffect implements PostProcessEffect {
  enabled: boolean = false;
  quality: QualityLevel = 'ultra';
  
  private ssaaPass: SSAARenderPass;
  private scene: THREE.Scene;
  private camera: THREE.Camera;

  constructor(scene: THREE.Scene, camera: THREE.Camera, width: number, height: number, config?: Partial<AAConfig>) {
    this.scene = scene;
    this.camera = camera;
    
    if (config) {
      this.enabled = config.enabled ?? false;
      this.quality = config.quality ?? 'ultra';
    }

    this.ssaaPass = new SSAARenderPass(scene, camera);
    this.ssaaPass.enabled = this.enabled;
    this.ssaaPass.setSize(width, height);
  }

  get pass(): SSAARenderPass { return this.ssaaPass; }

  resize(width: number, height: number): void {
    this.ssaaPass.setSize(width, height);
  }

  setQuality(quality: QualityLevel): void {
    this.quality = quality;
  }

  update(_deltaTime: number): void {
    this.ssaaPass.enabled = this.enabled;
  }

  dispose(): void {
    this.ssaaPass.dispose();
  }
}

// ============================================
// SHARPEN PASS
// ============================================

export interface SharpenConfig {
  enabled: boolean;
  amount: number;
  clamp: number;
  quality: QualityLevel;
}

// Sharpen Shader
const SharpenShader = {
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2() },
    amount: { value: 0.5 },
    clamp: { value: 0.05 },
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
    uniform vec2 resolution;
    uniform float amount;
    uniform float clamp;
    
    varying vec2 vUv;
    
    void main() {
      vec2 texel = vec2(1.0 / resolution.x, 1.0 / resolution.y);
      
      vec4 color = texture2D(tDiffuse, vUv);
      
      vec4 n = texture2D(tDiffuse, vUv + vec2(0.0, texel.y));
      vec4 s = texture2D(tDiffuse, vUv - vec2(0.0, texel.y));
      vec4 e = texture2D(tDiffuse, vUv + vec2(texel.x, 0.0));
      vec4 w = texture2D(tDiffuse, vUv - vec2(texel.x, 0.0));
      
      vec4 blur = (n + s + e + w) * 0.25;
      vec4 sharp = color + (color - blur) * amount;
      
      sharp = clamp > 0.0 ? clamp(sharp, color - clamp, color + clamp) : sharp;
      
      gl_FragColor = sharp;
    }
  `,
};

export class SharpenPassEffect implements PostProcessEffect {
  enabled: boolean = true;
  quality: QualityLevel = 'high';
  
  private sharpenPass: ShaderPass;
  private _amount: number = 0.5;
  private _clamp: number = 0.05;

  constructor(width: number, height: number, config?: Partial<SharpenConfig>) {
    if (config) {
      this.enabled = config.enabled ?? true;
      this.quality = config.quality ?? 'high';
      this._amount = config.amount ?? 0.5;
      this._clamp = config.clamp ?? 0.05;
    }

    this.sharpenPass = new ShaderPass(SharpenShader);
    this.sharpenPass.uniforms.resolution.value.set(width, height);
    this.sharpenPass.uniforms.amount.value = this._amount;
    this.sharpenPass.uniforms.clamp.value = this._clamp;
    this.sharpenPass.enabled = this.enabled;
  }

  get pass(): ShaderPass { return this.sharpenPass; }

  get amount(): number { return this._amount; }
  set amount(value: number) {
    this._amount = value;
    this.sharpenPass.uniforms.amount.value = value;
  }

  get clampValue(): number { return this._clamp; }
  set clampValue(value: number) {
    this._clamp = value;
    this.sharpenPass.uniforms.clamp.value = value;
  }

  setResolution(width: number, height: number): void {
    this.sharpenPass.uniforms.resolution.value.set(width, height);
  }

  setQuality(quality: QualityLevel): void {
    this.quality = quality;
  }

  update(_deltaTime: number): void {
    this.sharpenPass.enabled = this.enabled;
  }

  dispose(): void {
    this.sharpenPass.dispose();
  }
}

// ============================================
// FILM GRAIN PASS
// ============================================

export interface FilmGrainConfig {
  enabled: boolean;
  intensity: number;
  speed: number;
  quality: QualityLevel;
}

// Film Grain Shader
const FilmGrainShader = {
  uniforms: {
    tDiffuse: { value: null },
    intensity: { value: 0.15 },
    speed: { value: 1.0 },
    time: { value: 0.0 },
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
    uniform float speed;
    uniform float time;
    
    varying vec2 vUv;
    
    float random(vec2 st) {
      return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
    }
    
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      
      float grain = random(vUv + time * speed) * 2.0 - 1.0;
      grain *= intensity;
      
      color.rgb += grain;
      
      gl_FragColor = color;
    }
  `,
};

export class FilmGrainPassEffect implements PostProcessEffect {
  enabled: boolean = true;
  quality: QualityLevel = 'high';
  
  private filmGrainPass: ShaderPass;
  private _intensity: number = 0.15;
  private _speed: number = 1.0;
  private time: number = 0;

  constructor(config?: Partial<FilmGrainConfig>) {
    if (config) {
      this.enabled = config.enabled ?? true;
      this.quality = config.quality ?? 'high';
      this._intensity = config.intensity ?? 0.15;
      this._speed = config.speed ?? 1.0;
    }

    this.filmGrainPass = new ShaderPass(FilmGrainShader);
    this.filmGrainPass.uniforms.intensity.value = this._intensity;
    this.filmGrainPass.uniforms.speed.value = this._speed;
    this.filmGrainPass.enabled = this.enabled;
  }

  get pass(): ShaderPass { return this.filmGrainPass; }

  get intensity(): number { return this._intensity; }
  set intensity(value: number) {
    this._intensity = value;
    this.filmGrainPass.uniforms.intensity.value = value;
  }

  get speed(): number { return this._speed; }
  set speed(value: number) {
    this._speed = value;
    this.filmGrainPass.uniforms.speed.value = value;
  }

  setQuality(quality: QualityLevel): void {
    this.quality = quality;
  }

  update(deltaTime: number): void {
    this.time += deltaTime;
    this.filmGrainPass.enabled = this.enabled;
    this.filmGrainPass.uniforms.time.value = this.time;
  }

  dispose(): void {
    this.filmGrainPass.dispose();
  }
}

// ============================================
// LENS FLARE PASS
// ============================================

export interface LensFlareConfig {
  enabled: boolean;
  intensity: number;
  ghostColors: THREE.Color[];
  ghostCount: number;
  quality: QualityLevel;
}

// Lens Flare Shader
const LensFlareShader = {
  uniforms: {
    tDiffuse: { value: null },
    tGhost: { value: null },
    intensity: { value: 1.0 },
    ghostScale: { value: 0.5 },
    distortion: { value: 1.0 },
    resolution: { value: new THREE.Vector2() },
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
    uniform sampler2D tGhost;
    uniform float intensity;
    uniform float ghostScale;
    uniform float distortion;
    uniform vec2 resolution;
    
    varying vec2 vUv;
    
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      
      // Ghost flare
      vec2 ghostUv = (vUv - 0.5) * ghostScale + 0.5;
      vec4 ghost = texture2D(tGhost, ghostUv);
      
      // Distortion
      vec2 center = vUv - 0.5;
      float dist = length(center);
      ghost *= (1.0 - dist) * intensity;
      
      color += ghost;
      
      gl_FragColor = color;
    }
  `,
};

export class LensFlarePassEffect implements PostProcessEffect {
  enabled: boolean = true;
  quality: QualityLevel = 'high';
  
  private lensFlarePass: ShaderPass;
  private _intensity: number = 1.0;
  private _ghostColors: THREE.Color[] = [
    new THREE.Color(0x4444ff),
    new THREE.Color(0xff4444),
    new THREE.Color(0x44ff44),
  ];
  private _ghostCount: number = 3;

  constructor(config?: Partial<LensFlareConfig>) {
    if (config) {
      this.enabled = config.enabled ?? true;
      this.quality = config.quality ?? 'high';
      this._intensity = config.intensity ?? 1.0;
      this._ghostColors = config.ghostColors ?? this._ghostColors;
      this._ghostCount = config.ghostCount ?? 3;
    }

    this.lensFlarePass = new ShaderPass(LensFlareShader);
    this.lensFlarePass.uniforms.intensity.value = this._intensity;
    this.lensFlarePass.enabled = this.enabled;
  }

  get pass(): ShaderPass { return this.lensFlarePass; }

  get intensity(): number { return this._intensity; }
  set intensity(value: number) {
    this._intensity = value;
    this.lensFlarePass.uniforms.intensity.value = value;
  }

  get ghostColors(): THREE.Color[] { return this._ghostColors; }
  set ghostColors(value: THREE.Color[]) {
    this._ghostColors = value;
  }

  setQuality(quality: QualityLevel): void {
    this.quality = quality;
  }

  update(_deltaTime: number): void {
    this.lensFlarePass.enabled = this.enabled;
  }

  dispose(): void {
    this.lensFlarePass.dispose();
  }
}

// ============================================
// POST PROCESSING PRESETS
// ============================================

export type PostProcessPresetName = 
  | 'default' 
  | 'cinematic' 
  | 'realistic' 
  | 'stylized' 
  | 'vintage' 
  | 'scifi' 
  | 'retro' 
  | 'underwater';

export interface PostProcessPresetConfig {
  name: PostProcessPresetName;
  bloom: Partial<BloomConfig>;
  ssao: Partial<SSAOConfig>;
  ssr: Partial<SSRConfig>;
  dof: Partial<DOFConfig>;
  motionBlur: Partial<MotionBlurConfig>;
  chromaticAberration: Partial<ChromaticAberrationConfig>;
  vignette: Partial<VignetteConfig>;
  colorGrading: Partial<ColorGradingConfig>;
  filmGrain: Partial<FilmGrainConfig>;
  lensFlare: Partial<LensFlareConfig>;
  sharpen: Partial<SharpenConfig>;
}

export const PostProcessPresets: Record<PostProcessPresetName, PostProcessPresetConfig> = {
  default: {
    name: 'default',
    bloom: { enabled: true, strength: 0.5, radius: 0.4, threshold: 0.85 },
    ssao: { enabled: true, radius: 16, samples: 32 },
    ssr: { enabled: false },
    dof: { enabled: false },
    motionBlur: { enabled: false },
    chromaticAberration: { enabled: false },
    vignette: { enabled: true, intensity: 0.3 },
    colorGrading: { enabled: true, toneMapping: 'aces' },
    filmGrain: { enabled: false },
    lensFlare: { enabled: false },
    sharpen: { enabled: true, amount: 0.3 },
  },
  cinematic: {
    name: 'cinematic',
    bloom: { enabled: true, strength: 1.2, radius: 0.6, threshold: 0.7 },
    ssao: { enabled: true, radius: 24, samples: 48 },
    ssr: { enabled: true, maxDistance: 50 },
    dof: { enabled: true, focusDistance: 15, aperture: 4.0 },
    motionBlur: { enabled: true, intensity: 0.5, samples: 24 },
    chromaticAberration: { enabled: true, offset: 0.003 },
    vignette: { enabled: true, intensity: 0.5, smoothness: 0.6 },
    colorGrading: { 
      enabled: true, 
      toneMapping: 'aces', 
      contrast: 1.1, 
      saturation: 0.9,
      temperature: 0.1 
    },
    filmGrain: { enabled: true, intensity: 0.08, speed: 0.5 },
    lensFlare: { enabled: true, intensity: 0.5 },
    sharpen: { enabled: true, amount: 0.2 },
  },
  realistic: {
    name: 'realistic',
    bloom: { enabled: true, strength: 0.3, radius: 0.3, threshold: 0.9 },
    ssao: { enabled: true, radius: 32, samples: 64 },
    ssr: { enabled: true, maxDistance: 100 },
    dof: { enabled: true, focusDistance: 20, aperture: 2.8 },
    motionBlur: { enabled: false },
    chromaticAberration: { enabled: false },
    vignette: { enabled: true, intensity: 0.2 },
    colorGrading: { 
      enabled: true, 
      toneMapping: 'aces', 
      contrast: 1.0, 
      saturation: 1.0 
    },
    filmGrain: { enabled: false },
    lensFlare: { enabled: true, intensity: 0.3 },
    sharpen: { enabled: true, amount: 0.1 },
  },
  stylized: {
    name: 'stylized',
    bloom: { enabled: true, strength: 2.0, radius: 1.0, threshold: 0.5 },
    ssao: { enabled: true, radius: 8, samples: 16 },
    ssr: { enabled: false },
    dof: { enabled: false },
    motionBlur: { enabled: true, intensity: 0.8 },
    chromaticAberration: { enabled: true, offset: 0.01 },
    vignette: { enabled: true, intensity: 0.6, roundness: 0.5 },
    colorGrading: { 
      enabled: true, 
      toneMapping: 'reinhard', 
      contrast: 1.3, 
      saturation: 1.4,
      hueShift: 0.05 
    },
    filmGrain: { enabled: true, intensity: 0.2 },
    lensFlare: { enabled: true, intensity: 1.0 },
    sharpen: { enabled: true, amount: 0.5 },
  },
  vintage: {
    name: 'vintage',
    bloom: { enabled: true, strength: 0.8, radius: 0.8, threshold: 0.6 },
    ssao: { enabled: false },
    ssr: { enabled: false },
    dof: { enabled: true, focusDistance: 10, aperture: 5.6 },
    motionBlur: { enabled: false },
    chromaticAberration: { enabled: true, offset: 0.008 },
    vignette: { enabled: true, intensity: 0.7, smoothness: 0.3, roundness: 0.8 },
    colorGrading: { 
      enabled: true, 
      toneMapping: 'reinhard', 
      contrast: 1.2, 
      saturation: 0.8,
      colorFilter: new THREE.Color(0xffeedd),
      temperature: 0.2,
      gamma: 1.1
    },
    filmGrain: { enabled: true, intensity: 0.25, speed: 0.3 },
    lensFlare: { enabled: true, intensity: 0.4 },
    sharpen: { enabled: false },
  },
  scifi: {
    name: 'scifi',
    bloom: { enabled: true, strength: 1.5, radius: 0.5, threshold: 0.4 },
    ssao: { enabled: true, radius: 20, samples: 32 },
    ssr: { enabled: true, maxDistance: 150 },
    dof: { enabled: false },
    motionBlur: { enabled: true, intensity: 0.3 },
    chromaticAberration: { enabled: true, offset: 0.015, radial: true },
    vignette: { enabled: true, intensity: 0.4, roundness: 1.5 },
    colorGrading: { 
      enabled: true, 
      toneMapping: 'aces', 
      contrast: 1.2, 
      saturation: 1.2,
      colorFilter: new THREE.Color(0x88ccff),
      temperature: -0.2
    },
    filmGrain: { enabled: true, intensity: 0.05, speed: 2.0 },
    lensFlare: { enabled: true, intensity: 0.8 },
    sharpen: { enabled: true, amount: 0.4 },
  },
  retro: {
    name: 'retro',
    bloom: { enabled: false },
    ssao: { enabled: false },
    ssr: { enabled: false },
    dof: { enabled: false },
    motionBlur: { enabled: false },
    chromaticAberration: { enabled: true, offset: 0.02 },
    vignette: { enabled: true, intensity: 0.8, smoothness: 0.2 },
    colorGrading: { 
      enabled: true, 
      toneMapping: 'linear', 
      contrast: 1.4, 
      saturation: 1.5,
      gamma: 1.2
    },
    filmGrain: { enabled: true, intensity: 0.35, speed: 0.5 },
    lensFlare: { enabled: false },
    sharpen: { enabled: false },
  },
  underwater: {
    name: 'underwater',
    bloom: { enabled: true, strength: 1.0, radius: 1.2, threshold: 0.5 },
    ssao: { enabled: true, radius: 40, samples: 48 },
    ssr: { enabled: false },
    dof: { enabled: true, focusDistance: 5, aperture: 8.0 },
    motionBlur: { enabled: true, intensity: 0.6 },
    chromaticAberration: { enabled: true, offset: 0.01 },
    vignette: { enabled: true, intensity: 0.4, color: new THREE.Color(0x001144) },
    colorGrading: { 
      enabled: true, 
      toneMapping: 'reinhard', 
      contrast: 0.9, 
      saturation: 0.7,
      colorFilter: new THREE.Color(0x4488aa),
      temperature: -0.3,
      tint: -0.1
    },
    filmGrain: { enabled: true, intensity: 0.1, speed: 1.5 },
    lensFlare: { enabled: true, intensity: 0.3 },
    sharpen: { enabled: true, amount: 0.1 },
  },
};

// ============================================
// RENDER FEATURES
// ============================================

export interface RenderFeatureSettings {
  bloom: boolean;
  ssao: boolean;
  ssr: boolean;
  dof: boolean;
  motionBlur: boolean;
  chromaticAberration: boolean;
  vignette: boolean;
  colorGrading: boolean;
  filmGrain: boolean;
  lensFlare: boolean;
  sharpen: boolean;
  antiAliasing: AAMethod;
}

export const QualityFeatureSettings: Record<QualityLevel, RenderFeatureSettings> = {
  low: {
    bloom: true,
    ssao: false,
    ssr: false,
    dof: false,
    motionBlur: false,
    chromaticAberration: false,
    vignette: true,
    colorGrading: true,
    filmGrain: false,
    lensFlare: false,
    sharpen: true,
    antiAliasing: 'fxaa',
  },
  medium: {
    bloom: true,
    ssao: true,
    ssr: false,
    dof: false,
    motionBlur: false,
    chromaticAberration: false,
    vignette: true,
    colorGrading: true,
    filmGrain: false,
    lensFlare: false,
    sharpen: true,
    antiAliasing: 'smaa',
  },
  high: {
    bloom: true,
    ssao: true,
    ssr: true,
    dof: true,
    motionBlur: true,
    chromaticAberration: true,
    vignette: true,
    colorGrading: true,
    filmGrain: true,
    lensFlare: true,
    sharpen: true,
    antiAliasing: 'smaa',
  },
  ultra: {
    bloom: true,
    ssao: true,
    ssr: true,
    dof: true,
    motionBlur: true,
    chromaticAberration: true,
    vignette: true,
    colorGrading: true,
    filmGrain: true,
    lensFlare: true,
    sharpen: true,
    antiAliasing: 'taa',
  },
};

// ============================================
// POST PROCESSING MANAGER
// ============================================

export interface PostProcessingManagerConfig {
  quality: QualityLevel;
  preset: PostProcessPresetName;
  antiAliasing: AAMethod;
}

export class PostProcessingManager {
  private composer: EffectComposer | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.Camera | null = null;
  
  private effects: Map<string, EffectWrapper> = new Map();
  private _quality: QualityLevel = 'high';
  private _preset: PostProcessPresetName = 'default';
  private _antiAliasing: AAMethod = 'smaa';
  
  private width: number = 1920;
  private height: number = 1080;
  
  // Effect instances
  private bloomEffect: BloomPass | null = null;
  private ssaoEffect: SSAOPassEffect | null = null;
  private ssrEffect: SSRPassEffect | null = null;
  private dofEffect: DOFPassEffect | null = null;
  private motionBlurEffect: MotionBlurPassEffect | null = null;
  private chromaticAberrationEffect: ChromaticAberrationPassEffect | null = null;
  private vignetteEffect: VignettePassEffect | null = null;
  private colorGradingEffect: ColorGradingPassEffect | null = null;
  private filmGrainEffect: FilmGrainPassEffect | null = null;
  private lensFlareEffect: LensFlarePassEffect | null = null;
  private sharpenEffect: SharpenPassEffect | null = null;
  private fxaaEffect: FXAAPassEffect | null = null;
  private smaaEffect: SMAAPassEffect | null = null;
  private taaEffect: TAAPassEffect | null = null;

  constructor(config?: Partial<PostProcessingManagerConfig>) {
    if (config) {
      this._quality = config.quality ?? 'high';
      this._preset = config.preset ?? 'default';
      this._antiAliasing = config.antiAliasing ?? 'smaa';
    }
  }

  /**
   * Initialize the post-processing manager
   */
  initialize(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    
    const size = renderer.getSize(new THREE.Vector2());
    this.width = size.x;
    this.height = size.y;
    
    this.composer = new EffectComposer(renderer);
    
    // Add render pass first
    const renderPass = new RenderPass(scene, camera);
    this.composer.addPass(renderPass);
    
    // Apply preset
    this.applyPreset(this._preset);
  }

  /**
   * Add an effect to the stack
   */
  addEffect(name: string, effect: PostProcessEffect, pass: Pass | null, priority: number = 0): void {
    const wrapper: EffectWrapper = {
      name,
      effect,
      pass,
      priority,
    };
    
    this.effects.set(name, wrapper);
    
    if (pass && this.composer) {
      // Insert pass at correct position based on priority
      this.insertPassAtPriority(pass, priority);
    }
  }

  /**
   * Remove an effect from the stack
   */
  removeEffect(name: string): void {
    const wrapper = this.effects.get(name);
    if (wrapper) {
      if (wrapper.pass && this.composer) {
        const passIndex = this.composer.passes.indexOf(wrapper.pass);
        if (passIndex !== -1) {
          this.composer.passes.splice(passIndex, 1);
        }
      }
      wrapper.effect.dispose();
      this.effects.delete(name);
    }
  }

  /**
   * Get an effect by name with type safety
   */
  getEffect<T extends PostProcessEffect>(name: string): T | null {
    const wrapper = this.effects.get(name);
    return wrapper ? (wrapper.effect as T) : null;
  }

  /**
   * Set the global quality level
   */
  setQuality(quality: QualityLevel): void {
    this._quality = quality;
    
    // Update all effects
    this.effects.forEach(wrapper => {
      wrapper.effect.quality = quality;
      wrapper.effect.update(0);
    });
    
    // Apply quality-based feature toggles
    const features = QualityFeatureSettings[quality];
    this.setFeatures(features);
  }

  /**
   * Apply a preset configuration
   */
  applyPreset(presetName: PostProcessPresetName): void {
    this._preset = presetName;
    const preset = PostProcessPresets[presetName];
    
    // Clear existing effects
    this.clearEffects();
    
    // Create and add effects from preset
    if (!this.renderer || !this.scene || !this.camera || !this.composer) {
      return;
    }
    
    // Bloom
    if (preset.bloom.enabled !== false) {
      this.bloomEffect = new BloomPass(
        new THREE.Vector2(this.width, this.height),
        preset.bloom
      );
      this.addEffect('bloom', this.bloomEffect, this.bloomEffect.pass, 10);
    }
    
    // SSAO
    if (preset.ssao.enabled !== false) {
      this.ssaoEffect = new SSAOPassEffect(
        this.scene,
        this.camera,
        this.width,
        this.height,
        preset.ssao
      );
      this.addEffect('ssao', this.ssaoEffect, this.ssaoEffect.pass, 5);
    }
    
    // SSR
    if (preset.ssr.enabled) {
      this.ssrEffect = new SSRPassEffect(preset.ssr);
      this.addEffect('ssr', this.ssrEffect, this.ssrEffect.pass, 6);
    }
    
    // DOF
    if (preset.dof.enabled) {
      this.dofEffect = new DOFPassEffect(preset.dof);
      this.addEffect('dof', this.dofEffect, this.dofEffect.pass, 8);
    }
    
    // Motion Blur
    if (preset.motionBlur.enabled) {
      this.motionBlurEffect = new MotionBlurPassEffect(preset.motionBlur);
      this.addEffect('motionBlur', this.motionBlurEffect, this.motionBlurEffect.pass, 12);
    }
    
    // Chromatic Aberration
    if (preset.chromaticAberration.enabled) {
      this.chromaticAberrationEffect = new ChromaticAberrationPassEffect(preset.chromaticAberration);
      this.addEffect('chromaticAberration', this.chromaticAberrationEffect, this.chromaticAberrationEffect.pass, 15);
    }
    
    // Vignette
    if (preset.vignette.enabled !== false) {
      this.vignetteEffect = new VignettePassEffect(preset.vignette);
      this.addEffect('vignette', this.vignetteEffect, this.vignetteEffect.pass, 20);
    }
    
    // Color Grading
    if (preset.colorGrading.enabled !== false) {
      this.colorGradingEffect = new ColorGradingPassEffect(preset.colorGrading);
      this.addEffect('colorGrading', this.colorGradingEffect, this.colorGradingEffect.pass, 25);
    }
    
    // Film Grain
    if (preset.filmGrain.enabled) {
      this.filmGrainEffect = new FilmGrainPassEffect(preset.filmGrain);
      this.addEffect('filmGrain', this.filmGrainEffect, this.filmGrainEffect.pass, 30);
    }
    
    // Lens Flare
    if (preset.lensFlare.enabled) {
      this.lensFlareEffect = new LensFlarePassEffect(preset.lensFlare);
      this.addEffect('lensFlare', this.lensFlareEffect, this.lensFlareEffect.pass, 35);
    }
    
    // Sharpen
    if (preset.sharpen.enabled) {
      this.sharpenEffect = new SharpenPassEffect(this.width, this.height, preset.sharpen);
      this.addEffect('sharpen', this.sharpenEffect, this.sharpenEffect.pass, 40);
    }
    
    // Anti-aliasing
    this.setAntiAliasing(this._antiAliasing);
  }

  /**
   * Set which features are enabled
   */
  setFeatures(features: RenderFeatureSettings): void {
    if (this.bloomEffect) this.bloomEffect.enabled = features.bloom;
    if (this.ssaoEffect) this.ssaoEffect.enabled = features.ssao;
    if (this.ssrEffect) this.ssrEffect.enabled = features.ssr;
    if (this.dofEffect) this.dofEffect.enabled = features.dof;
    if (this.motionBlurEffect) this.motionBlurEffect.enabled = features.motionBlur;
    if (this.chromaticAberrationEffect) this.chromaticAberrationEffect.enabled = features.chromaticAberration;
    if (this.vignetteEffect) this.vignetteEffect.enabled = features.vignette;
    if (this.colorGradingEffect) this.colorGradingEffect.enabled = features.colorGrading;
    if (this.filmGrainEffect) this.filmGrainEffect.enabled = features.filmGrain;
    if (this.lensFlareEffect) this.lensFlareEffect.enabled = features.lensFlare;
    if (this.sharpenEffect) this.sharpenEffect.enabled = features.sharpen;
    
    this.setAntiAliasing(features.antiAliasing);
  }

  /**
   * Set the anti-aliasing method
   */
  setAntiAliasing(method: AAMethod): void {
    this._antiAliasing = method;
    
    // Remove existing AA effects
    if (this.fxaaEffect) {
      this.removeEffect('fxaa');
      this.fxaaEffect = null;
    }
    if (this.smaaEffect) {
      this.removeEffect('smaa');
      this.smaaEffect = null;
    }
    if (this.taaEffect) {
      this.removeEffect('taa');
      this.taaEffect = null;
    }
    
    if (!this.scene || !this.camera) return;
    
    switch (method) {
      case 'fxaa':
        this.fxaaEffect = new FXAAPassEffect({ method: 'fxaa', quality: this._quality });
        this.fxaaEffect.setResolution(this.width, this.height);
        this.addEffect('fxaa', this.fxaaEffect, this.fxaaEffect.pass, 50);
        break;
      case 'smaa':
        this.smaaEffect = new SMAAPassEffect(this.width, this.height, { method: 'smaa', quality: this._quality });
        this.addEffect('smaa', this.smaaEffect, this.smaaEffect.pass, 50);
        break;
      case 'taa':
        this.taaEffect = new TAAPassEffect(this.scene, this.camera, this.width, this.height, { method: 'taa', quality: this._quality });
        this.addEffect('taa', this.taaEffect, this.taaEffect.pass, 50);
        break;
      case 'none':
      default:
        break;
    }
  }

  /**
   * Render the scene with all post-processing effects
   */
  render(): void {
    if (!this.composer) return;
    this.composer.render();
  }

  /**
   * Update all effects (call each frame)
   */
  update(deltaTime: number): void {
    this.effects.forEach(wrapper => {
      wrapper.effect.update(deltaTime);
    });
  }

  /**
   * Resize all effects
   */
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    
    if (this.composer) {
      this.composer.setSize(width, height);
    }
    
    // Update effect resolutions
    if (this.bloomEffect) {
      this.bloomEffect.pass.resolution.set(width, height);
    }
    if (this.fxaaEffect) {
      this.fxaaEffect.setResolution(width, height);
    }
    if (this.smaaEffect) {
      this.smaaEffect.resize(width, height);
    }
    if (this.taaEffect) {
      this.taaEffect.resize(width, height);
    }
    if (this.sharpenEffect) {
      this.sharpenEffect.setResolution(width, height);
    }
  }

  /**
   * Get current quality level
   */
  get quality(): QualityLevel {
    return this._quality;
  }

  /**
   * Get current preset name
   */
  get preset(): PostProcessPresetName {
    return this._preset;
  }

  /**
   * Get current anti-aliasing method
   */
  get antiAliasing(): AAMethod {
    return this._antiAliasing;
  }

  /**
   * Get the EffectComposer instance
   */
  getComposer(): EffectComposer | null {
    return this.composer;
  }

  /**
   * Get all enabled effects
   */
  getEnabledEffects(): string[] {
    const enabled: string[] = [];
    this.effects.forEach((wrapper, name) => {
      if (wrapper.effect.enabled) {
        enabled.push(name);
      }
    });
    return enabled;
  }

  /**
   * Toggle an effect on/off
   */
  toggleEffect(name: string): void {
    const effect = this.getEffect<PostProcessEffect>(name);
    if (effect) {
      effect.enabled = !effect.enabled;
    }
  }

  /**
   * Enable all effects
   */
  enableAll(): void {
    this.effects.forEach(wrapper => {
      wrapper.effect.enabled = true;
    });
  }

  /**
   * Disable all effects
   */
  disableAll(): void {
    this.effects.forEach(wrapper => {
      wrapper.effect.enabled = false;
    });
  }

  // ============================================
  // CONVENIENCE METHODS FOR EFFECT ACCESS
  // ============================================

  get bloom(): BloomPass | null { return this.bloomEffect; }
  get ssao(): SSAOPassEffect | null { return this.ssaoEffect; }
  get ssr(): SSRPassEffect | null { return this.ssrEffect; }
  get dof(): DOFPassEffect | null { return this.dofEffect; }
  get motionBlur(): MotionBlurPassEffect | null { return this.motionBlurEffect; }
  get chromaticAberration(): ChromaticAberrationPassEffect | null { return this.chromaticAberrationEffect; }
  get vignette(): VignettePassEffect | null { return this.vignetteEffect; }
  get colorGrading(): ColorGradingPassEffect | null { return this.colorGradingEffect; }
  get filmGrain(): FilmGrainPassEffect | null { return this.filmGrainEffect; }
  get lensFlare(): LensFlarePassEffect | null { return this.lensFlareEffect; }
  get sharpen(): SharpenPassEffect | null { return this.sharpenEffect; }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  private insertPassAtPriority(pass: Pass, priority: number): void {
    if (!this.composer) return;
    
    // Find the correct position to insert the pass
    let insertIndex = 1; // Start after render pass
    
    for (let i = 1; i < this.composer.passes.length; i++) {
      const existingPass = this.composer.passes[i];
      let existingPriority = 0;
      
      // Find the priority of the existing pass
      this.effects.forEach(wrapper => {
        if (wrapper.pass === existingPass) {
          existingPriority = wrapper.priority;
        }
      });
      
      if (existingPriority < priority) {
        insertIndex = i + 1;
      } else {
        break;
      }
    }
    
    this.composer.passes.splice(insertIndex, 0, pass);
  }

  private clearEffects(): void {
    // Dispose all effects
    this.effects.forEach(wrapper => {
      wrapper.effect.dispose();
    });
    
    // Clear the map
    this.effects.clear();
    
    // Clear effect references
    this.bloomEffect = null;
    this.ssaoEffect = null;
    this.ssrEffect = null;
    this.dofEffect = null;
    this.motionBlurEffect = null;
    this.chromaticAberrationEffect = null;
    this.vignetteEffect = null;
    this.colorGradingEffect = null;
    this.filmGrainEffect = null;
    this.lensFlareEffect = null;
    this.sharpenEffect = null;
    this.fxaaEffect = null;
    this.smaaEffect = null;
    this.taaEffect = null;
    
    // Recreate composer
    if (this.renderer && this.scene && this.camera) {
      this.composer = new EffectComposer(this.renderer);
      const renderPass = new RenderPass(this.scene, this.camera);
      this.composer.addPass(renderPass);
    }
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.effects.forEach(wrapper => {
      wrapper.effect.dispose();
    });
    this.effects.clear();
    this.composer?.dispose();
  }
}
