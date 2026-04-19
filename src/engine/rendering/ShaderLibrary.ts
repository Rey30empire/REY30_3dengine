// ============================================
// Custom Shader Library for 3D Engine
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// WebGL 2.0 Compatible
// ============================================

import * as THREE from 'three';

// ============================================
// ENUMS & INTERFACES
// ============================================

/**
 * Shader type enumeration
 */
export enum ShaderType {
  VERTEX = 'vertex',
  FRAGMENT = 'fragment',
  COMPUTE = 'compute'
}

/**
 * Shader definition interface
 */
export interface ShaderDefinition {
  name: string;
  vertexShader: string;
  fragmentShader: string;
  uniforms: Record<string, THREE.IUniform>;
  defines?: Record<string, string | number>;
  extensions?: string[];
  side?: THREE.Side;
  transparent?: boolean;
  depthWrite?: boolean;
  blending?: THREE.Blending;
}

/**
 * Uniform information interface
 */
export interface UniformInfo {
  name: string;
  type: string;
  location: WebGLUniformLocation | null;
  value: unknown;
}

/**
 * Shader pack interface for loading external shaders
 */
export interface ShaderPack {
  name: string;
  version: string;
  shaders: ShaderDefinition[];
}

// ============================================
// SHADER CHUNKS - Reusable GLSL snippets
// ============================================

export const ShaderChunks = {
  // ==================
  // NOISE FUNCTIONS
  // ==================
  
  random: `
    float random(vec2 st) {
      return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
    }
  `,
  
  random2D: `
    float random2D(vec2 st) {
      return fract(sin(dot(st, vec2(12.9898, 78.233))) * 43758.5453123);
    }
  `,
  
  random3D: `
    float random3D(vec3 p) {
      return fract(sin(dot(p, vec3(12.9898, 78.233, 45.5432))) * 43758.5453123);
    }
  `,
  
  noise2D: `
    float noise2D(vec2 st) {
      vec2 i = floor(st);
      vec2 f = fract(st);
      vec2 u = f * f * (3.0 - 2.0 * f);
      
      float a = random(i);
      float b = random(i + vec2(1.0, 0.0));
      float c = random(i + vec2(0.0, 1.0));
      float d = random(i + vec2(1.0, 1.0));
      
      return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
    }
  `,
  
  noise3D: `
    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
    vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
    
    float noise3D(vec3 v) {
      const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
      const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
      
      vec3 i = floor(v + dot(v, C.yyy));
      vec3 x0 = v - i + dot(i, C.xxx);
      
      vec3 g = step(x0.yzx, x0.xyz);
      vec3 l = 1.0 - g;
      vec3 i1 = min(g.xyz, l.zxy);
      vec3 i2 = max(g.xyz, l.zxy);
      
      vec3 x1 = x0 - i1 + C.xxx;
      vec3 x2 = x0 - i2 + C.yyy;
      vec3 x3 = x0 - D.yyy;
      
      i = mod289(i);
      vec4 p = permute(permute(permute(
        i.z + vec4(0.0, i1.z, i2.z, 1.0))
        + i.y + vec4(0.0, i1.y, i2.y, 1.0))
        + i.x + vec4(0.0, i1.x, i2.x, 1.0));
      
      float n_ = 0.142857142857;
      vec3 ns = n_ * D.wyz - D.xzx;
      
      vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
      
      vec4 x_ = floor(j * ns.z);
      vec4 y_ = floor(j - 7.0 * x_);
      
      vec4 x = x_ * ns.x + ns.yyyy;
      vec4 y = y_ * ns.x + ns.yyyy;
      vec4 h = 1.0 - abs(x) - abs(y);
      
      vec4 b0 = vec4(x.xy, y.xy);
      vec4 b1 = vec4(x.zw, y.zw);
      
      vec4 s0 = floor(b0) * 2.0 + 1.0;
      vec4 s1 = floor(b1) * 2.0 + 1.0;
      vec4 sh = -step(h, vec4(0.0));
      
      vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
      vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
      
      vec3 p0 = vec3(a0.xy, h.x);
      vec3 p1 = vec3(a0.zw, h.y);
      vec3 p2 = vec3(a1.xy, h.z);
      vec3 p3 = vec3(a1.zw, h.w);
      
      vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
      p0 *= norm.x;
      p1 *= norm.y;
      p2 *= norm.z;
      p3 *= norm.w;
      
      vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
      m = m * m;
      return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
    }
  `,
  
  fbm: `
    float fbm(vec2 st, int octaves) {
      float value = 0.0;
      float amplitude = 0.5;
      float frequency = 1.0;
      
      for (int i = 0; i < 8; i++) {
        if (i >= octaves) break;
        value += amplitude * noise2D(st * frequency);
        frequency *= 2.0;
        amplitude *= 0.5;
      }
      
      return value;
    }
  `,
  
  // ==================
  // UV TRANSFORMATIONS
  // ==================
  
  rotateUV: `
    vec2 rotateUV(vec2 uv, float angle) {
      float s = sin(angle);
      float c = cos(angle);
      mat2 rotation = mat2(c, -s, s, c);
      return rotation * (uv - 0.5) + 0.5;
    }
  `,
  
  scaleUV: `
    vec2 scaleUV(vec2 uv, float scale) {
      return (uv - 0.5) * scale + 0.5;
    }
  `,
  
  polarUV: `
    vec2 polarUV(vec2 uv, vec2 center) {
      vec2 centered = uv - center;
      float r = length(centered);
      float theta = atan(centered.y, centered.x);
      return vec2(theta / (2.0 * 3.14159265) + 0.5, r);
    }
  `,
  
  // ==================
  // COLOR SPACES
  // ==================
  
  rgb2hsv: `
    vec3 rgb2hsv(vec3 c) {
      vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
      vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
      vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
      
      float d = q.x - min(q.w, q.y);
      float e = 1.0e-10;
      return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
    }
  `,
  
  hsv2rgb: `
    vec3 hsv2rgb(vec3 c) {
      vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
      vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
      return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    }
  `,
  
  srgb2linear: `
    vec3 srgb2linear(vec3 srgb) {
      return pow(srgb, vec3(2.2));
    }
  `,
  
  linear2srgb: `
    vec3 linear2srgb(vec3 linear) {
      return pow(linear, vec3(1.0 / 2.2));
    }
  `,
  
  // ==================
  // LIGHTING FUNCTIONS
  // ==================
  
  fresnelSchlick: `
    vec3 fresnelSchlick(float cosTheta, vec3 F0) {
      return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
    }
  `,
  
  fresnelSchlickRoughness: `
    vec3 fresnelSchlickRoughness(float cosTheta, vec3 F0, float roughness) {
      return F0 + (max(vec3(1.0 - roughness), F0) - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
    }
  `,
  
  distributionGGX: `
    float distributionGGX(vec3 N, vec3 H, float roughness) {
      float a = roughness * roughness;
      float a2 = a * a;
      float NdotH = max(dot(N, H), 0.0);
      float NdotH2 = NdotH * NdotH;
      
      float num = a2;
      float denom = (NdotH2 * (a2 - 1.0) + 1.0);
      denom = 3.14159265 * denom * denom;
      
      return num / denom;
    }
  `,
  
  geometrySchlickGGX: `
    float geometrySchlickGGX(float NdotV, float roughness) {
      float r = (roughness + 1.0);
      float k = (r * r) / 8.0;
      
      float num = NdotV;
      float denom = NdotV * (1.0 - k) + k;
      
      return num / denom;
    }
  `,
  
  geometrySmith: `
    float geometrySmith(vec3 N, vec3 V, vec3 L, float roughness) {
      float NdotV = max(dot(N, V), 0.0);
      float NdotL = max(dot(N, L), 0.0);
      float ggx2 = geometrySchlickGGX(NdotV, roughness);
      float ggx1 = geometrySchlickGGX(NdotL, roughness);
      
      return ggx1 * ggx2;
    }
  `,
  
  // ==================
  // BRDF FUNCTIONS
  // ==================
  
  brdfDiffuse: `
    vec3 brdfDiffuse(vec3 albedo, float metalness) {
      return albedo * (1.0 - metalness) / 3.14159265;
    }
  `,
  
  brdfSpecular: `
    vec3 brdfSpecular(vec3 N, vec3 V, vec3 L, vec3 H, vec3 albedo, float metalness, float roughness) {
      vec3 F0 = mix(vec3(0.04), albedo, metalness);
      vec3 F = fresnelSchlick(max(dot(H, V), 0.0), F0);
      float D = distributionGGX(N, H, roughness);
      float G = geometrySmith(N, V, L, roughness);
      
      vec3 numerator = D * G * F;
      float denominator = 4.0 * max(dot(N, V), 0.0) * max(dot(N, L), 0.0) + 0.0001;
      vec3 specular = numerator / denominator;
      
      vec3 kD = vec3(1.0) - F;
      kD *= 1.0 - metalness;
      
      return kD * albedo / 3.14159265 + specular;
    }
  `,
  
  // ==================
  // MATRIX OPERATIONS
  // ==================
  
  rotationMatrix: `
    mat3 rotationMatrix(vec3 axis, float angle) {
      axis = normalize(axis);
      float s = sin(angle);
      float c = cos(angle);
      float oc = 1.0 - c;
      
      return mat3(
        oc * axis.x * axis.x + c,           oc * axis.x * axis.y - axis.z * s,  oc * axis.z * axis.x + axis.y * s,
        oc * axis.x * axis.y + axis.z * s,  oc * axis.y * axis.y + c,           oc * axis.y * axis.z - axis.x * s,
        oc * axis.z * axis.x - axis.y * s,  oc * axis.y * axis.z + axis.x * s,  oc * axis.z * axis.z + c
      );
    }
  `,
  
  // ==================
  // UTILITY FUNCTIONS
  // ==================
  
  lerp: `
    float lerp(float a, float b, float t) {
      return a + t * (b - a);
    }
    
    vec3 lerp(vec3 a, vec3 b, float t) {
      return a + t * (b - a);
    }
  `,
  
  smoothstep01: `
    float smoothstep01(float x) {
      return smoothstep(0.0, 1.0, x);
    }
  `,
  
  remap: `
    float remap(float value, float inMin, float inMax, float outMin, float outMax) {
      return outMin + (outMax - outMin) * (value - inMin) / (inMax - inMin);
    }
  `,
  
  parallaxMapping: `
    vec2 parallaxMapping(vec2 texCoords, vec3 viewDir, float heightScale, sampler2D heightMap) {
      float height = texture(heightMap, texCoords).r;
      vec2 p = viewDir.xy / viewDir.z * (height * heightScale);
      return texCoords - p;
    }
  `,
  
  steepParallaxMapping: `
    vec2 steepParallaxMapping(vec2 texCoords, vec3 viewDir, float heightScale, sampler2D heightMap, float numLayers) {
      float layerDepth = 1.0 / numLayers;
      float currentLayerDepth = 0.0;
      vec2 P = viewDir.xy * heightScale;
      vec2 deltaTexCoords = P / numLayers;
      
      vec2 currentTexCoords = texCoords;
      float currentDepthMapValue = texture(heightMap, currentTexCoords).r;
      
      while (currentLayerDepth < currentDepthMapValue) {
        currentTexCoords -= deltaTexCoords;
        currentDepthMapValue = texture(heightMap, currentTexCoords).r;
        currentLayerDepth += layerDepth;
      }
      
      return currentTexCoords;
    }
  `,
  
  // ==================
  // ATMOSPHERIC SCATTERING
  // ==================
  
  rayleighPhase: `
    float rayleighPhase(float cosTheta) {
      return 3.0 / (16.0 * 3.14159265) * (1.0 + cosTheta * cosTheta);
    }
  `,
  
  miePhase: `
    float miePhase(float cosTheta, float g) {
      float g2 = g * g;
      float num = (1.0 - g2);
      float denom = 4.0 * 3.14159265 * pow(1.0 + g2 - 2.0 * g * cosTheta, 1.5);
      return num / denom;
    }
  `,
  
  atmosphericScattering: `
    vec3 atmosphericScattering(vec3 rayOrigin, vec3 rayDir, vec3 sunDir, float sunIntensity) {
      float atmosphereRadius = 6471e3;
      float planetRadius = 6371e3;
      
      vec3 betaR = vec3(5.8e-6, 13.5e-6, 33.1e-6);
      vec3 betaM = vec3(21e-6);
      
      float Hr = 7994.0;
      float Hm = 1200.0;
      
      float tMax = 1e6;
      float t = 0.0;
      float tCurrent = 0.0;
      
      vec3 sumR = vec3(0.0);
      vec3 sumM = vec3(0.0);
      
      float opticalDepthR = 0.0;
      float opticalDepthM = 0.0;
      
      int numSamples = 16;
      int numSamplesLight = 8;
      
      float segmentLength = tMax / float(numSamples);
      
      for (int i = 0; i < 16; i++) {
        vec3 samplePos = rayOrigin + rayDir * (tCurrent + segmentLength * 0.5);
        float height = length(samplePos) - planetRadius;
        
        float hr = exp(-height / Hr) * segmentLength;
        float hm = exp(-height / Hm) * segmentLength;
        opticalDepthR += hr;
        opticalDepthM += hm;
        
        float tLight = 0.0;
        float opticalDepthLightR = 0.0;
        float opticalDepthLightM = 0.0;
        float segmentLengthLight = tMax / float(numSamplesLight);
        
        for (int j = 0; j < 8; j++) {
          vec3 samplePosLight = samplePos + sunDir * (tLight + segmentLengthLight * 0.5);
          float heightLight = length(samplePosLight) - planetRadius;
          
          if (heightLight < 0.0) break;
          
          opticalDepthLightR += exp(-heightLight / Hr) * segmentLengthLight;
          opticalDepthLightM += exp(-heightLight / Hm) * segmentLengthLight;
          tLight += segmentLengthLight;
        }
        
        if (height > 0.0) {
          vec3 tau = betaR * (opticalDepthR + opticalDepthLightR) + betaM * 1.1 * (opticalDepthM + opticalDepthLightM);
          vec3 attenuation = exp(-tau);
          
          sumR += attenuation * hr;
          sumM += attenuation * hm;
        }
        
        tCurrent += segmentLength;
      }
      
      float cosTheta = dot(rayDir, sunDir);
      
      float phaseR = rayleighPhase(cosTheta);
      float phaseM = miePhase(cosTheta, 0.76);
      
      return sunIntensity * (sumR * betaR * phaseR + sumM * betaM * phaseM);
    }
  `
};

// ============================================
// UNIFORM MANAGER
// ============================================

/**
 * Manages global and per-material uniforms with auto-updating capabilities
 */
export class UniformManager {
  private globalUniforms: Map<string, THREE.IUniform> = new Map();
  private materialUniforms: Map<string, Map<string, THREE.IUniform>> = new Map();
  private autoUpdateCallbacks: Map<string, () => unknown> = new Map();
  private startTime: number;
  private lastTickTime: number;
  private camera: THREE.Camera | null = null;
  private lights: THREE.Light[] = [];

  constructor() {
    this.startTime = performance.now();
    this.lastTickTime = this.startTime;
    this.initializeGlobalUniforms();
  }

  private initializeGlobalUniforms(): void {
    // Time uniforms
    this.setGlobalUniform('uTime', { value: 0.0 });
    this.setGlobalUniform('uDeltaTime', { value: 0.0 });
    this.setGlobalUniform('uFrameCount', { value: 0 });
    
    // Camera uniforms
    this.setGlobalUniform('uCameraPosition', { value: new THREE.Vector3() });
    this.setGlobalUniform('uCameraNear', { value: 0.1 });
    this.setGlobalUniform('uCameraFar', { value: 1000.0 });
    this.setGlobalUniform('uProjectionMatrix', { value: new THREE.Matrix4() });
    this.setGlobalUniform('uViewMatrix', { value: new THREE.Matrix4() });
    this.setGlobalUniform('uInverseViewMatrix', { value: new THREE.Matrix4() });
    this.setGlobalUniform('uInverseProjectionMatrix', { value: new THREE.Matrix4() });
    
    // Screen uniforms
    this.setGlobalUniform('uResolution', { value: new THREE.Vector2(1920, 1080) });
    this.setGlobalUniform('uAspectRatio', { value: 16 / 9 });
    
    // Light uniforms
    this.setGlobalUniform('uLightPosition', { value: new THREE.Vector3(50, 100, 50) });
    this.setGlobalUniform('uLightColor', { value: new THREE.Color(1, 1, 1) });
    this.setGlobalUniform('uLightIntensity', { value: 1.0 });
    this.setGlobalUniform('uAmbientColor', { value: new THREE.Color(0.1, 0.1, 0.1) });
    
    // Fog uniforms
    this.setGlobalUniform('uFogColor', { value: new THREE.Color(0.5, 0.5, 0.5) });
    this.setGlobalUniform('uFogNear', { value: 10.0 });
    this.setGlobalUniform('uFogFar', { value: 100.0 });
    this.setGlobalUniform('uFogDensity', { value: 0.01 });

    // Register auto-update callbacks
    this.setAutoUpdateCallback('uTime', () => (performance.now() - this.startTime) / 1000);
    this.setAutoUpdateCallback('uDeltaTime', () => {
      const now = performance.now();
      const delta = Math.min((now - this.lastTickTime) / 1000, 0.1);
      this.lastTickTime = now;
      return delta;
    });
    this.setAutoUpdateCallback('uFrameCount', () => {
      const frameUniform = this.globalUniforms.get('uFrameCount');
      return (frameUniform?.value as number || 0) + 1;
    });
  }

  /**
   * Set a global uniform value
   */
  setGlobalUniform(name: string, uniform: THREE.IUniform): void {
    this.globalUniforms.set(name, uniform);
  }

  /**
   * Get a global uniform
   */
  getGlobalUniform(name: string): THREE.IUniform | undefined {
    return this.globalUniforms.get(name);
  }

  /**
   * Set auto-update callback for a uniform
   */
  setAutoUpdateCallback(name: string, callback: () => unknown): void {
    this.autoUpdateCallbacks.set(name, callback);
  }

  /**
   * Register material uniforms
   */
  registerMaterial(materialId: string, uniforms: Record<string, THREE.IUniform>): void {
    this.materialUniforms.set(materialId, new Map(Object.entries(uniforms)));
  }

  /**
   * Unregister material uniforms
   */
  unregisterMaterial(materialId: string): void {
    this.materialUniforms.delete(materialId);
  }

  /**
   * Set camera for auto-updating camera uniforms
   */
  setCamera(camera: THREE.Camera): void {
    this.camera = camera;
  }

  /**
   * Set lights for lighting uniforms
   */
  setLights(lights: THREE.Light[]): void {
    this.lights = lights;
  }

  /**
   * Update all uniforms - should be called every frame
   */
  update(): void {
    // Update auto-updating uniforms
    this.autoUpdateCallbacks.forEach((callback, name) => {
      const uniform = this.globalUniforms.get(name);
      if (uniform) {
        uniform.value = callback();
      }
    });

    // Update camera uniforms
    if (this.camera) {
      const camPosUniform = this.globalUniforms.get('uCameraPosition');
      if (camPosUniform && this.camera.position) {
        (camPosUniform.value as THREE.Vector3).copy(this.camera.position);
      }

      const projUniform = this.globalUniforms.get('uProjectionMatrix');
      if (projUniform && 'projectionMatrix' in this.camera) {
        (projUniform.value as THREE.Matrix4).copy(this.camera.projectionMatrix);
      }

      const viewUniform = this.globalUniforms.get('uViewMatrix');
      if (viewUniform && 'matrixWorldInverse' in this.camera) {
        (viewUniform.value as THREE.Matrix4).copy(this.camera.matrixWorldInverse);
      }

      const invViewUniform = this.globalUniforms.get('uInverseViewMatrix');
      if (invViewUniform && 'matrixWorld' in this.camera) {
        (invViewUniform.value as THREE.Matrix4).copy(this.camera.matrixWorld);
      }

      const invProjUniform = this.globalUniforms.get('uInverseProjectionMatrix');
      if (invProjUniform && 'projectionMatrixInverse' in this.camera) {
        (invProjUniform.value as THREE.Matrix4).copy(this.camera.projectionMatrixInverse);
      }

      if ('near' in this.camera) {
        const nearUniform = this.globalUniforms.get('uCameraNear');
        if (nearUniform) nearUniform.value = this.camera.near;
      }

      if ('far' in this.camera) {
        const farUniform = this.globalUniforms.get('uCameraFar');
        if (farUniform) farUniform.value = this.camera.far;
      }
    }

    // Update light uniforms from first directional light
    const dirLight = this.lights.find(l => l instanceof THREE.DirectionalLight) as THREE.DirectionalLight;
    if (dirLight) {
      const lightPosUniform = this.globalUniforms.get('uLightPosition');
      if (lightPosUniform && dirLight.position) {
        (lightPosUniform.value as THREE.Vector3).copy(dirLight.position);
      }

      const lightColorUniform = this.globalUniforms.get('uLightColor');
      if (lightColorUniform && dirLight.color) {
        (lightColorUniform.value as THREE.Color).copy(dirLight.color);
      }

      const lightIntensityUniform = this.globalUniforms.get('uLightIntensity');
      if (lightIntensityUniform) lightIntensityUniform.value = dirLight.intensity;
    }
  }

  /**
   * Set resolution for screen uniforms
   */
  setResolution(width: number, height: number): void {
    const resUniform = this.globalUniforms.get('uResolution');
    if (resUniform) {
      (resUniform.value as THREE.Vector2).set(width, height);
    }

    const aspectUniform = this.globalUniforms.get('uAspectRatio');
    if (aspectUniform) {
      aspectUniform.value = width / height;
    }
  }

  /**
   * Get all global uniforms as an object
   */
  getGlobalUniformsObject(): Record<string, THREE.IUniform> {
    const result: Record<string, THREE.IUniform> = {};
    this.globalUniforms.forEach((uniform, name) => {
      result[name] = uniform;
    });
    return result;
  }

  /**
   * Reset clock
   */
  resetClock(): void {
    this.startTime = performance.now();
    this.lastTickTime = this.startTime;
    const frameUniform = this.globalUniforms.get('uFrameCount');
    if (frameUniform) frameUniform.value = 0;
  }
}

// Global uniform manager instance
export const uniformManager = new UniformManager();

// ============================================
// SHADER UTILS
// ============================================

/**
 * Utility functions for shader compilation and manipulation
 */
export const ShaderUtils = {
  /**
   * Compile a shader and return the WebGLShader
   */
  compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
    const shader = gl.createShader(type);
    if (!shader) return null;

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compilation error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }

    return shader;
  },

  /**
   * Get uniform information from a WebGL program
   */
  getUniforms(gl: WebGL2RenderingContext, program: WebGLProgram): UniformInfo[] {
    const uniforms: UniformInfo[] = [];
    const numUniforms = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);

    for (let i = 0; i < numUniforms; i++) {
      const info = gl.getActiveUniform(program, i);
      if (info) {
        const location = gl.getUniformLocation(program, info.name);
        uniforms.push({
          name: info.name,
          type: this.getUniformTypeName(info.type),
          location,
          value: null
        });
      }
    }

    return uniforms;
  },

  /**
   * Get uniform type name from WebGL enum
   */
  getUniformTypeName(type: number): string {
    const typeNames: Record<number, string> = {
      [WebGL2RenderingContext.FLOAT]: 'float',
      [WebGL2RenderingContext.FLOAT_VEC2]: 'vec2',
      [WebGL2RenderingContext.FLOAT_VEC3]: 'vec3',
      [WebGL2RenderingContext.FLOAT_VEC4]: 'vec4',
      [WebGL2RenderingContext.FLOAT_MAT2]: 'mat2',
      [WebGL2RenderingContext.FLOAT_MAT3]: 'mat3',
      [WebGL2RenderingContext.FLOAT_MAT4]: 'mat4',
      [WebGL2RenderingContext.INT]: 'int',
      [WebGL2RenderingContext.INT_VEC2]: 'ivec2',
      [WebGL2RenderingContext.INT_VEC3]: 'ivec3',
      [WebGL2RenderingContext.INT_VEC4]: 'ivec4',
      [WebGL2RenderingContext.BOOL]: 'bool',
      [WebGL2RenderingContext.BOOL_VEC2]: 'bvec2',
      [WebGL2RenderingContext.BOOL_VEC3]: 'bvec3',
      [WebGL2RenderingContext.BOOL_VEC4]: 'bvec4',
      [WebGL2RenderingContext.SAMPLER_2D]: 'sampler2D',
      [WebGL2RenderingContext.SAMPLER_3D]: 'sampler3D',
      [WebGL2RenderingContext.SAMPLER_CUBE]: 'samplerCube',
      [WebGL2RenderingContext.SAMPLER_2D_SHADOW]: 'sampler2DShadow',
    };
    return typeNames[type] || 'unknown';
  },

  /**
   * Optimize shader by removing comments and unnecessary whitespace
   */
  optimizeShader(glsl: string): string {
    return glsl
      // Remove single-line comments
      .replace(/\/\/.*$/gm, '')
      // Remove multi-line comments
      .replace(/\/\*[\s\S]*?\*\//g, '')
      // Remove leading/trailing whitespace on lines
      .replace(/^\s+|\s+$/gm, '')
      // Remove multiple consecutive blank lines
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      // Remove leading/trailing whitespace
      .trim();
  },

  /**
   * Inject shader chunks into a shader string
   */
  injectChunks(shader: string, chunks: Record<string, string>): string {
    let result = shader;
    
    Object.entries(chunks).forEach(([key, chunk]) => {
      const placeholder = `// INSERT_${key.toUpperCase()}`;
      result = result.replace(placeholder, chunk);
    });

    return result;
  },

  /**
   * Add WebGL 2.0 specific precision and version headers
   */
  addGLSLHeaders(glsl: string, isVertex: boolean = false): string {
    const header = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp sampler3D;
precision highp samplerCube;
precision highp sampler2DShadow;
${isVertex ? 'precision highp sampler2DArray;' : ''}

`;
    return header + glsl;
  },

  /**
   * Validate shader for common errors
   */
  validateShader(glsl: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check for missing main function
    if (!glsl.includes('void main()')) {
      errors.push('Missing main() function');
    }

    // Check for unbalanced braces
    let braceCount = 0;
    for (const char of glsl) {
      if (char === '{') braceCount++;
      if (char === '}') braceCount--;
    }
    if (braceCount !== 0) {
      errors.push('Unbalanced braces');
    }

    // Check for missing semicolons (basic check)
    const lines = glsl.split('\n');
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (trimmed && 
          !trimmed.endsWith('{') && 
          !trimmed.endsWith('}') && 
          !trimmed.endsWith(';') && 
          !trimmed.endsWith(',') &&
          !trimmed.startsWith('#') &&
          !trimmed.startsWith('//') &&
          trimmed.length > 0 &&
          !/\b(if|else|for|while|do|switch|case|default)\b/.test(trimmed)) {
        errors.push(`Line ${index + 1}: Possibly missing semicolon`);
      }
    });

    return {
      valid: errors.length === 0,
      errors
    };
  },

  /**
   * Generate a hash for shader caching
   */
  hashShader(glsl: string): string {
    let hash = 0;
    for (let i = 0; i < glsl.length; i++) {
      const char = glsl.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }
};

// ============================================
// SHADER HOT RELOAD (Development Mode)
// ============================================

/**
 * Hot reload system for shader development
 */
export class ShaderHotReload {
  private static instance: ShaderHotReload;
  private watchers: Map<string, { url: string; callback: (shader: ShaderDefinition) => void }> = new Map();
  private enabled: boolean = false;
  private interval: NodeJS.Timeout | null = null;
  private shaderVersions: Map<string, string> = new Map();

  private constructor() {}

  static getInstance(): ShaderHotReload {
    if (!ShaderHotReload.instance) {
      ShaderHotReload.instance = new ShaderHotReload();
    }
    return ShaderHotReload.instance;
  }

  /**
   * Enable hot reload watching
   */
  enable(): void {
    this.enabled = true;
    // Start polling for changes
    this.interval = setInterval(() => this.checkForChanges(), 1000);
  }

  /**
   * Disable hot reload watching
   */
  disable(): void {
    this.enabled = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  /**
   * Register a shader for hot reload
   */
  register(name: string, url: string, callback: (shader: ShaderDefinition) => void): void {
    this.watchers.set(name, { url, callback });
    this.shaderVersions.set(name, '');
  }

  /**
   * Unregister a shader from hot reload
   */
  unregister(name: string): void {
    this.watchers.delete(name);
    this.shaderVersions.delete(name);
  }

  /**
   * Check for shader changes
   */
  private async checkForChanges(): Promise<void> {
    if (!this.enabled) return;

    for (const [name, { url, callback }] of this.watchers) {
      try {
        const response = await fetch(url);
        const content = await response.text();
        const hash = ShaderUtils.hashShader(content);
        const lastHash = this.shaderVersions.get(name);

        if (lastHash && lastHash !== hash) {
          // Shader changed, reload
          const shaderPack = JSON.parse(content) as ShaderPack;
          const shader = shaderPack.shaders.find(s => s.name === name);
          if (shader) {
            callback(shader);
            console.log(`[ShaderHotReload] Reloaded shader: ${name}`);
          }
        }

        this.shaderVersions.set(name, hash);
      } catch (error) {
        console.error(`[ShaderHotReload] Error checking shader ${name}:`, error);
      }
    }
  }

  /**
   * Force reload all shaders
   */
  async reloadAll(): Promise<void> {
    for (const [name, { url, callback }] of this.watchers) {
      try {
        const response = await fetch(url);
        const content = await response.text();
        const shaderPack = JSON.parse(content) as ShaderPack;
        const shader = shaderPack.shaders.find(s => s.name === name);
        if (shader) {
          callback(shader);
          this.shaderVersions.set(name, ShaderUtils.hashShader(content));
        }
      } catch (error) {
        console.error(`[ShaderHotReload] Error reloading shader ${name}:`, error);
      }
    }
  }

  /**
   * Check if hot reload is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}

export const shaderHotReload = ShaderHotReload.getInstance();

// ============================================
// BUILT-IN SHADERS
// ============================================

/**
 * Built-in shader definitions
 */
export const BUILTIN_SHADERS: Record<string, ShaderDefinition> = {
  // ==================
  // PBR SHADER (Enhanced)
  // ==================
  pbr: {
    name: 'pbr',
    vertexShader: `#version 300 es
precision highp float;

in vec3 position;
in vec3 normal;
in vec2 uv;
in vec4 tangent;

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;

out vec3 vWorldPosition;
out vec3 vNormal;
out vec2 vUv;
out mat3 vTBN;

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vNormal = normalize(normalMatrix * normal);
  vUv = uv;
  
  // Calculate TBN matrix for normal mapping
  vec3 T = normalize(normalMatrix * tangent.xyz);
  vec3 N = normalize(normalMatrix * normal);
  T = normalize(T - dot(T, N) * N);
  vec3 B = cross(N, T) * tangent.w;
  vTBN = mat3(T, B, N);
  
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}`,
    fragmentShader: `#version 300 es
precision highp float;

in vec3 vWorldPosition;
in vec3 vNormal;
in vec2 vUv;
in mat3 vTBN;

uniform vec3 uCameraPosition;
uniform vec3 uLightPosition;
uniform vec3 uLightColor;
uniform float uLightIntensity;
uniform vec3 uAmbientColor;

// Material properties
uniform vec3 uAlbedo;
uniform float uMetallic;
uniform float uRoughness;
uniform float uAo;
uniform vec3 uEmissive;
uniform float uEmissiveIntensity;

// Textures
uniform sampler2D uAlbedoMap;
uniform sampler2D uNormalMap;
uniform sampler2D uMetallicMap;
uniform sampler2D uRoughnessMap;
uniform sampler2D uAoMap;
uniform sampler2D uEmissiveMap;
uniform sampler2D uHeightMap;

// Parallax
uniform float uHeightScale;
uniform bool uUseParallax;

// Subsurface scattering
uniform float uSubsurface;
uniform vec3 uSubsurfaceColor;

// Anisotropy
uniform float uAnisotropy;
uniform vec3 uAnisotropyDirection;

uniform float uTime;
uniform bool uUseAlbedoMap;
uniform bool uUseNormalMap;
uniform bool uUseMetallicMap;
uniform bool uUseRoughnessMap;
uniform bool uUseAoMap;
uniform bool uUseEmissiveMap;

out vec4 fragColor;

const float PI = 3.14159265359;

// Distribution function (GGX/Trowbridge-Reitz)
float distributionGGX(vec3 N, vec3 H, float roughness) {
  float a = roughness * roughness;
  float a2 = a * a;
  float NdotH = max(dot(N, H), 0.0);
  float NdotH2 = NdotH * NdotH;
  
  float num = a2;
  float denom = (NdotH2 * (a2 - 1.0) + 1.0);
  denom = PI * denom * denom;
  
  return num / denom;
}

// Geometry function (Schlick-GGX)
float geometrySchlickGGX(float NdotV, float roughness) {
  float r = (roughness + 1.0);
  float k = (r * r) / 8.0;
  
  float num = NdotV;
  float denom = NdotV * (1.0 - k) + k;
  
  return num / denom;
}

float geometrySmith(vec3 N, vec3 V, vec3 L, float roughness) {
  float NdotV = max(dot(N, V), 0.0);
  float NdotL = max(dot(N, L), 0.0);
  float ggx2 = geometrySchlickGGX(NdotV, roughness);
  float ggx1 = geometrySchlickGGX(NdotL, roughness);
  
  return ggx1 * ggx2;
}

// Fresnel function (Schlick)
vec3 fresnelSchlick(float cosTheta, vec3 F0) {
  return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

vec3 fresnelSchlickRoughness(float cosTheta, vec3 F0, float roughness) {
  return F0 + (max(vec3(1.0 - roughness), F0) - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

// Parallax occlusion mapping
vec2 parallaxMapping(vec2 uv, vec3 viewDir) {
  float heightScale = uHeightScale;
  float numLayers = 32.0;
  float layerDepth = 1.0 / numLayers;
  float currentLayerDepth = 0.0;
  vec2 P = viewDir.xy * heightScale;
  vec2 deltaTexCoords = P / numLayers;
  
  vec2 currentTexCoords = uv;
  float currentDepthMapValue = texture(uHeightMap, currentTexCoords).r;
  
  while (currentLayerDepth < currentDepthMapValue) {
    currentTexCoords -= deltaTexCoords;
    currentDepthMapValue = texture(uHeightMap, currentTexCoords).r;
    currentLayerDepth += layerDepth;
  }
  
  // Parallax interpolation
  vec2 prevTexCoords = currentTexCoords + deltaTexCoords;
  float afterDepth = currentDepthMapValue - currentLayerDepth;
  float beforeDepth = texture(uHeightMap, prevTexCoords).r - currentLayerDepth + layerDepth;
  float weight = afterDepth / (afterDepth - beforeDepth);
  
  return prevTexCoords * weight + currentTexCoords * (1.0 - weight);
}

// Subsurface scattering approximation
vec3 subsurfaceScattering(vec3 L, vec3 V, vec3 N, vec3 albedo, float subsurface) {
  vec3 scatterDir = L + N * 1.0;
  float scatter = pow(clamp(dot(V, -scatterDir), 0.0, 1.0), 3.0) * subsurface;
  return uSubsurfaceColor * albedo * scatter;
}

void main() {
  vec2 texCoords = vUv;
  
  // Parallax mapping
  if (uUseParallax) {
    vec3 viewDir = normalize(transpose(vTBN) * (uCameraPosition - vWorldPosition));
    texCoords = parallaxMapping(vUv, viewDir);
  }
  
  // Sample textures
  vec3 albedo = uUseAlbedoMap ? pow(texture(uAlbedoMap, texCoords).rgb, vec3(2.2)) : uAlbedo;
  float metallic = uUseMetallicMap ? texture(uMetallicMap, texCoords).r : uMetallic;
  float roughness = uUseRoughnessMap ? texture(uRoughnessMap, texCoords).r : uRoughness;
  float ao = uUseAoMap ? texture(uAoMap, texCoords).r : uAo;
  vec3 emissive = uUseEmissiveMap ? texture(uEmissiveMap, texCoords).rgb : uEmissive;
  
  // Normal mapping
  vec3 N = normalize(vNormal);
  if (uUseNormalMap) {
    vec3 normalMap = texture(uNormalMap, texCoords).rgb * 2.0 - 1.0;
    N = normalize(vTBN * normalMap);
  }
  
  // Calculate view and light vectors
  vec3 V = normalize(uCameraPosition - vWorldPosition);
  vec3 L = normalize(uLightPosition - vWorldPosition);
  vec3 H = normalize(V + L);
  
  // Calculate distances and attenuation
  float distance = length(uLightPosition - vWorldPosition);
  float attenuation = 1.0 / (1.0 + 0.09 * distance + 0.032 * distance * distance);
  
  // Calculate radiance
  vec3 radiance = uLightColor * uLightIntensity * attenuation;
  
  // PBR calculations
  vec3 F0 = mix(vec3(0.04), albedo, metallic);
  
  // Cook-Torrance BRDF
  float D = distributionGGX(N, H, roughness);
  float G = geometrySmith(N, V, L, roughness);
  vec3 F = fresnelSchlick(max(dot(H, V), 0.0), F0);
  
  vec3 numerator = D * G * F;
  float denominator = 4.0 * max(dot(N, V), 0.0) * max(dot(N, L), 0.0) + 0.0001;
  vec3 specular = numerator / denominator;
  
  // kS is equal to Fresnel
  vec3 kS = F;
  vec3 kD = vec3(1.0) - kS;
  kD *= 1.0 - metallic;
  
  // Diffuse (Lambertian)
  vec3 diffuse = kD * albedo / PI;
  
  // Subsurface scattering
  vec3 sss = subsurfaceScattering(L, V, N, albedo, uSubsurface);
  
  // Final lighting
  float NdotL = max(dot(N, L), 0.0);
  vec3 Lo = (diffuse + specular + sss) * radiance * NdotL;
  
  // Ambient (simplified IBL)
  vec3 R = reflect(-V, N);
  vec3 F_ambient = fresnelSchlickRoughness(max(dot(N, V), 0.0), F0, roughness);
  vec3 kD_ambient = (1.0 - F_ambient) * (1.0 - metallic);
  vec3 ambient = (kD_ambient * albedo + F_ambient * 0.5) * uAmbientColor * ao;
  
  // Emissive
  vec3 emissiveOutput = emissive * uEmissiveIntensity;
  
  // Final color
  vec3 color = ambient + Lo + emissiveOutput;
  
  // Tone mapping (ACES)
  color = color / (color + vec3(1.0));
  
  // Gamma correction
  color = pow(color, vec3(1.0 / 2.2));
  
  fragColor = vec4(color, 1.0);
}`,
    uniforms: {
      uCameraPosition: { value: new THREE.Vector3() },
      uLightPosition: { value: new THREE.Vector3(50, 100, 50) },
      uLightColor: { value: new THREE.Color(1, 1, 1) },
      uLightIntensity: { value: 1.0 },
      uAmbientColor: { value: new THREE.Color(0.1, 0.1, 0.1) },
      uAlbedo: { value: new THREE.Color(0.5, 0.5, 0.5) },
      uMetallic: { value: 0.5 },
      uRoughness: { value: 0.5 },
      uAo: { value: 1.0 },
      uEmissive: { value: new THREE.Color(0, 0, 0) },
      uEmissiveIntensity: { value: 1.0 },
      uAlbedoMap: { value: null },
      uNormalMap: { value: null },
      uMetallicMap: { value: null },
      uRoughnessMap: { value: null },
      uAoMap: { value: null },
      uEmissiveMap: { value: null },
      uHeightMap: { value: null },
      uHeightScale: { value: 0.05 },
      uUseParallax: { value: false },
      uSubsurface: { value: 0.0 },
      uSubsurfaceColor: { value: new THREE.Color(1, 0.5, 0.3) },
      uAnisotropy: { value: 0.0 },
      uAnisotropyDirection: { value: new THREE.Vector3(1, 0, 0) },
      uTime: { value: 0.0 },
      uUseAlbedoMap: { value: false },
      uUseNormalMap: { value: false },
      uUseMetallicMap: { value: false },
      uUseRoughnessMap: { value: false },
      uUseAoMap: { value: false },
      uUseEmissiveMap: { value: false }
    },
    transparent: false,
    depthWrite: true
  },

  // ==================
  // FOLIAGE SHADER
  // ==================
  foliage: {
    name: 'foliage',
    vertexShader: `#version 300 es
precision highp float;

in vec3 position;
in vec3 normal;
in vec2 uv;

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform float uTime;
uniform float uWindStrength;
uniform float uWindSpeed;
uniform vec3 uWindDirection;

out vec3 vWorldPosition;
out vec3 vNormal;
out vec2 vUv;
out float vFogDepth;

// Simple noise function
float noise(vec3 p) {
  return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
}

void main() {
  vec3 pos = position;
  
  // Wind animation
  float windPhase = uTime * uWindSpeed;
  float windNoise = noise(position * 0.5 + windPhase * 0.1);
  float windEffect = sin(windPhase + position.x * 2.0 + windNoise * 6.28) * uWindStrength;
  
  // Apply wind to vertices (stronger at the top)
  float heightFactor = position.y;
  pos.x += windEffect * heightFactor * uWindDirection.x;
  pos.z += windEffect * heightFactor * uWindDirection.z;
  
  // Secondary wind wave
  float windEffect2 = cos(windPhase * 1.5 + position.z * 3.0) * uWindStrength * 0.5;
  pos.x += windEffect2 * heightFactor;
  
  vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
  vWorldPosition = worldPosition.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vUv = uv;
  
  // Calculate fog depth
  vec4 mvPosition = viewMatrix * worldPosition;
  vFogDepth = -mvPosition.z;
  
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}`,
    fragmentShader: `#version 300 es
precision highp float;

in vec3 vWorldPosition;
in vec3 vNormal;
in vec2 vUv;
in float vFogDepth;

uniform vec3 uCameraPosition;
uniform vec3 uLightPosition;
uniform vec3 uLightColor;
uniform float uLightIntensity;
uniform vec3 uBaseColor;
uniform vec3 uTipColor;
uniform float uTranslucency;
uniform float uAlphaCutoff;
uniform sampler2D uAlbedoMap;
uniform sampler2D uNormalMap;
uniform bool uUseAlbedoMap;
uniform bool uUseNormalMap;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;

out vec4 fragColor;

void main() {
  // Sample albedo
  vec4 albedo = uUseAlbedoMap ? texture(uAlbedoMap, vUv) : vec4(mix(uBaseColor, uTipColor, vUv.y), 1.0);
  
  // Alpha test
  if (albedo.a < uAlphaCutoff) discard;
  
  // Normal mapping
  vec3 N = normalize(vNormal);
  if (uUseNormalMap) {
    vec3 normalMap = texture(uNormalMap, vUv).rgb * 2.0 - 1.0;
    // Transform to world space (simplified for foliage)
    N = normalize(N + normalMap * 0.5);
  }
  
  // Lighting
  vec3 L = normalize(uLightPosition - vWorldPosition);
  vec3 V = normalize(uCameraPosition - vWorldPosition);
  
  // Basic diffuse
  float NdotL = max(dot(N, L), 0.0);
  
  // Transmission (light passing through leaves)
  float transmission = max(dot(-V, L), 0.0) * uTranslucency;
  
  // Ambient
  float ambient = 0.3;
  
  // Combine lighting
  vec3 color = albedo.rgb * (ambient + NdotL * uLightColor * uLightIntensity);
  color += uTipColor * transmission * uLightColor * 0.5;
  
  // Fog
  float fogFactor = smoothstep(uFogNear, uFogFar, vFogDepth);
  color = mix(color, uFogColor, fogFactor);
  
  // Gamma correction
  color = pow(color, vec3(1.0 / 2.2));
  
  fragColor = vec4(color, albedo.a);
}`,
    uniforms: {
      uTime: { value: 0.0 },
      uWindStrength: { value: 0.1 },
      uWindSpeed: { value: 1.0 },
      uWindDirection: { value: new THREE.Vector3(1, 0, 0.5).normalize() },
      uCameraPosition: { value: new THREE.Vector3() },
      uLightPosition: { value: new THREE.Vector3(50, 100, 50) },
      uLightColor: { value: new THREE.Color(1, 1, 1) },
      uLightIntensity: { value: 1.0 },
      uBaseColor: { value: new THREE.Color(0.1, 0.3, 0.05) },
      uTipColor: { value: new THREE.Color(0.2, 0.5, 0.1) },
      uTranslucency: { value: 0.5 },
      uAlphaCutoff: { value: 0.5 },
      uAlbedoMap: { value: null },
      uNormalMap: { value: null },
      uUseAlbedoMap: { value: false },
      uUseNormalMap: { value: false },
      uFogColor: { value: new THREE.Color(0.5, 0.5, 0.5) },
      uFogNear: { value: 10.0 },
      uFogFar: { value: 100.0 }
    },
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: true
  },

  // ==================
  // WATER SHADER
  // ==================
  water: {
    name: 'water',
    vertexShader: `#version 300 es
precision highp float;

in vec3 position;
in vec3 normal;
in vec2 uv;

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform float uTime;
uniform float uWaveHeight;
uniform float uWaveSpeed;
uniform vec2 uWaveDirection;
uniform float uWaveFrequency;

out vec3 vWorldPosition;
out vec3 vNormal;
out vec2 vUv;
out float vWaveHeight;
out vec4 vClipPosition;

// Gerstner wave function
vec3 gerstnerWave(vec2 pos, float steepness, float wavelength, vec2 direction, float time) {
  float k = 2.0 * 3.14159 / wavelength;
  float c = sqrt(9.8 / k);
  vec2 d = normalize(direction);
  float f = k * (dot(d, pos) - c * time);
  float a = steepness / k;
  
  return vec3(
    d.x * (a * cos(f)),
    a * sin(f),
    d.y * (a * cos(f))
  );
}

void main() {
  vec3 pos = position;
  
  // Calculate multiple Gerstner waves
  vec3 wave1 = gerstnerWave(pos.xz, 0.25, 10.0, uWaveDirection, uTime * uWaveSpeed);
  vec3 wave2 = gerstnerWave(pos.xz, 0.15, 5.0, uWaveDirection * 0.5 + vec2(1.0, 0.3), uTime * uWaveSpeed * 1.2);
  vec3 wave3 = gerstnerWave(pos.xz, 0.1, 2.5, uWaveDirection * 1.5 + vec2(-0.5, 0.8), uTime * uWaveSpeed * 0.8);
  
  vec3 totalWave = (wave1 + wave2 + wave3) * uWaveHeight;
  pos += totalWave;
  
  // Calculate normal from wave derivatives
  float eps = 0.1;
  vec3 waveX = gerstnerWave(pos.xz + vec2(eps, 0.0), 0.25, 10.0, uWaveDirection, uTime * uWaveSpeed);
  vec3 waveZ = gerstnerWave(pos.xz + vec2(0.0, eps), 0.25, 10.0, uWaveDirection, uTime * uWaveSpeed);
  
  vec3 tangent = normalize(vec3(eps, waveX.y - totalWave.y, 0.0));
  vec3 bitangent = normalize(vec3(0.0, waveZ.y - totalWave.y, eps));
  vec3 waveNormal = normalize(cross(bitangent, tangent));
  
  vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
  vWorldPosition = worldPosition.xyz;
  vNormal = normalize(mat3(modelMatrix) * mix(normal, waveNormal, 0.8));
  vUv = uv;
  vWaveHeight = totalWave.y;
  
  vec4 clipPosition = projectionMatrix * viewMatrix * worldPosition;
  vClipPosition = clipPosition;
  
  gl_Position = clipPosition;
}`,
    fragmentShader: `#version 300 es
precision highp float;

in vec3 vWorldPosition;
in vec3 vNormal;
in vec2 vUv;
in float vWaveHeight;
in vec4 vClipPosition;

uniform vec3 uCameraPosition;
uniform vec3 uLightPosition;
uniform vec3 uLightColor;
uniform float uLightIntensity;
uniform vec3 uDeepColor;
uniform vec3 uShallowColor;
uniform float uFoamThreshold;
uniform float uFoamFalloff;
uniform float uRefractionStrength;
uniform float uReflectionStrength;
uniform float uAlpha;
uniform float uTime;
uniform sampler2D uNormalMap;
uniform sampler2D uFoamMap;
uniform sampler2D uDepthTexture;
uniform vec2 uResolution;

out vec4 fragColor;

// Noise function for foam
float noise(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec3 N = normalize(vNormal);
  
  // Animated normal map
  vec2 normalUv1 = vUv * 4.0 + uTime * 0.05;
  vec2 normalUv2 = vUv * 4.0 - uTime * 0.05 + vec2(0.5);
  vec3 normalMap1 = texture(uNormalMap, normalUv1).rgb * 2.0 - 1.0;
  vec3 normalMap2 = texture(uNormalMap, normalUv2).rgb * 2.0 - 1.0;
  vec3 normalMap = normalize(normalMap1 + normalMap2);
  N = normalize(N + normalMap * 0.3);
  
  // View direction
  vec3 V = normalize(uCameraPosition - vWorldPosition);
  
  // Fresnel effect
  float fresnel = pow(1.0 - max(dot(V, N), 0.0), 5.0);
  fresnel = mix(0.1, 1.0, fresnel);
  
  // Light direction
  vec3 L = normalize(uLightPosition - vWorldPosition);
  vec3 H = normalize(V + L);
  
  // Specular reflection (Blinn-Phong)
  float specular = pow(max(dot(N, H), 0.0), 256.0);
  
  // Depth-based color
  vec2 screenUv = vClipPosition.xy / vClipPosition.w * 0.5 + 0.5;
  float depth = texture(uDepthTexture, screenUv).r;
  float waterDepth = gl_FragCoord.z - depth;
  float depthFactor = smoothstep(0.0, 5.0, waterDepth);
  
  // Mix deep and shallow colors based on depth
  vec3 waterColor = mix(uShallowColor, uDeepColor, depthFactor);
  
  // Foam
  float foamNoise = noise(vWorldPosition.xz * 2.0 + uTime * 0.5);
  float foam = smoothstep(uFoamThreshold - uFoamFalloff, uFoamThreshold, vWaveHeight + foamNoise * 0.3);
  vec3 foamColor = texture(uFoamMap, vUv * 8.0 + uTime * 0.1).rgb;
  
  // Caustics (simplified)
  float caustics = 0.0;
  vec2 causticsUv = vWorldPosition.xz * 0.2 + uTime * 0.1;
  caustics += sin(causticsUv.x * 10.0 + uTime) * 0.5 + 0.5;
  caustics += sin(causticsUv.y * 10.0 - uTime * 1.3) * 0.5 + 0.5;
  caustics = caustics * 0.5 * (1.0 - depthFactor);
  
  // Refraction distortion
  vec2 refractionUv = screenUv + N.xy * uRefractionStrength;
  
  // Reflection (simplified sky reflection)
  vec3 R = reflect(-V, N);
  float skyGradient = R.y * 0.5 + 0.5;
  vec3 skyColor = mix(vec3(0.6, 0.7, 0.9), vec3(0.2, 0.4, 0.8), skyGradient);
  
  // Combine everything
  vec3 color = waterColor;
  color += caustics * vec3(0.2, 0.4, 0.6);
  color = mix(color, skyColor, fresnel * uReflectionStrength);
  color += specular * uLightColor * uLightIntensity;
  color = mix(color, foamColor, foam * 0.8);
  
  // Gamma correction
  color = pow(color, vec3(1.0 / 2.2));
  
  fragColor = vec4(color, uAlpha);
}`,
    uniforms: {
      uTime: { value: 0.0 },
      uWaveHeight: { value: 1.0 },
      uWaveSpeed: { value: 1.0 },
      uWaveDirection: { value: new THREE.Vector2(1, 0.5) },
      uWaveFrequency: { value: 1.0 },
      uCameraPosition: { value: new THREE.Vector3() },
      uLightPosition: { value: new THREE.Vector3(50, 100, 50) },
      uLightColor: { value: new THREE.Color(1, 1, 1) },
      uLightIntensity: { value: 1.0 },
      uDeepColor: { value: new THREE.Color(0.0, 0.1, 0.3) },
      uShallowColor: { value: new THREE.Color(0.1, 0.4, 0.6) },
      uFoamThreshold: { value: 0.3 },
      uFoamFalloff: { value: 0.2 },
      uRefractionStrength: { value: 0.02 },
      uReflectionStrength: { value: 0.8 },
      uAlpha: { value: 0.8 },
      uNormalMap: { value: null },
      uFoamMap: { value: null },
      uDepthTexture: { value: null },
      uResolution: { value: new THREE.Vector2(1920, 1080) }
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  },

  // ==================
  // SKY SHADER
  // ==================
  sky: {
    name: 'sky',
    vertexShader: `#version 300 es
precision highp float;

in vec3 position;

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;

out vec3 vWorldPosition;
out vec3 vDirection;

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vDirection = normalize(worldPosition.xyz);
  
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
  gl_Position.z = gl_Position.w; // Force far plane
}`,
    fragmentShader: `#version 300 es
precision highp float;

in vec3 vWorldPosition;
in vec3 vDirection;

uniform vec3 uSunPosition;
uniform vec3 uSunColor;
uniform float uSunIntensity;
uniform float uSunSize;
uniform vec3 uSkyColorTop;
uniform vec3 uSkyColorBottom;
uniform float uAtmosphereStrength;
uniform float uRayleighCoefficient;
uniform float uMieCoefficient;
uniform float uTime;
uniform bool uShowStars;
uniform float uStarIntensity;

out vec4 fragColor;

// Constants
const float PI = 3.14159265359;
const vec3 betaR = vec3(5.8e-6, 13.5e-6, 33.1e-6); // Rayleigh scattering
const vec3 betaM = vec3(21e-6); // Mie scattering

// Phase functions
float rayleighPhase(float cosTheta) {
  return 3.0 / (16.0 * PI) * (1.0 + cosTheta * cosTheta);
}

float miePhase(float cosTheta, float g) {
  float g2 = g * g;
  float num = (1.0 - g2);
  float denom = 4.0 * PI * pow(1.0 + g2 - 2.0 * g * cosTheta, 1.5);
  return num / denom;
}

// Hash function for stars
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

// Noise for clouds
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

void main() {
  vec3 direction = normalize(vDirection);
  vec3 sunDir = normalize(uSunPosition);
  
  float cosTheta = dot(direction, sunDir);
  float sunAngle = acos(max(direction.y, 0.0));
  
  // Sky gradient
  float gradientFactor = pow(max(direction.y, 0.0), 0.5);
  vec3 skyColor = mix(uSkyColorBottom, uSkyColorTop, gradientFactor);
  
  // Atmospheric scattering (simplified)
  float sunAngleFromHorizon = max(sunDir.y, 0.0);
  float atmosphereFactor = exp(-sunAngleFromHorizon * 3.0) * uAtmosphereStrength;
  
  // Rayleigh scattering
  float rayleigh = rayleighPhase(cosTheta) * uRayleighCoefficient;
  vec3 rayleighColor = betaR * rayleigh;
  
  // Mie scattering (sun glow)
  float mie = miePhase(cosTheta, 0.76) * uMieCoefficient;
  vec3 mieColor = betaM * mie;
  
  // Sun disc
  float sunDisc = smoothstep(uSunSize, uSunSize * 0.5, length(direction - sunDir));
  vec3 sunColor = uSunColor * uSunIntensity * sunDisc;
  
  // Combine scattering
  vec3 scatterColor = (rayleighColor + mieColor) * sunAngleFromHorizon * 20.0;
  
  // Stars (visible at night)
  vec3 starColor = vec3(0.0);
  if (uShowStars) {
    vec2 starUv = direction.xz / (abs(direction.y) + 0.001) * 100.0;
    float star = hash(floor(starUv));
    float twinkle = sin(uTime * 3.0 + star * 100.0) * 0.5 + 0.5;
    
    // Only show stars where sky is dark
    float nightFactor = 1.0 - min(gradientFactor * 2.0 + sunAngleFromHorizon, 1.0);
    starColor = vec3(step(0.99, star) * twinkle * uStarIntensity * nightFactor);
  }
  
  // Final color
  vec3 color = skyColor + scatterColor + sunColor + starColor;
  
  // Tone mapping
  color = color / (color + vec3(1.0));
  
  // Gamma correction
  color = pow(color, vec3(1.0 / 2.2));
  
  fragColor = vec4(color, 1.0);
}`,
    uniforms: {
      uSunPosition: { value: new THREE.Vector3(0, 100, 0) },
      uSunColor: { value: new THREE.Color(1, 0.95, 0.8) },
      uSunIntensity: { value: 1.0 },
      uSunSize: { value: 0.05 },
      uSkyColorTop: { value: new THREE.Color(0.2, 0.4, 0.8) },
      uSkyColorBottom: { value: new THREE.Color(0.6, 0.7, 0.9) },
      uAtmosphereStrength: { value: 1.0 },
      uRayleighCoefficient: { value: 1.0 },
      uMieCoefficient: { value: 1.0 },
      uTime: { value: 0.0 },
      uShowStars: { value: true },
      uStarIntensity: { value: 1.0 }
    },
    side: THREE.BackSide,
    depthWrite: false
  },

  // ==================
  // TERRAIN SHADER
  // ==================
  terrain: {
    name: 'terrain',
    vertexShader: `#version 300 es
precision highp float;

in vec3 position;
in vec3 normal;
in vec2 uv;

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;
uniform float uTessellationFactor;
uniform float uDisplacementScale;
uniform sampler2D uHeightMap;
uniform float uHeightMapSize;

out vec3 vWorldPosition;
out vec3 vNormal;
out vec2 vUv;
out float vHeight;

void main() {
  vec3 pos = position;
  
  // Displacement from height map
  float height = texture(uHeightMap, uv).r;
  pos.y += height * uDisplacementScale;
  
  // Calculate normal from height map
  float texelSize = 1.0 / uHeightMapSize;
  float heightL = texture(uHeightMap, uv - vec2(texelSize, 0.0)).r;
  float heightR = texture(uHeightMap, uv + vec2(texelSize, 0.0)).r;
  float heightD = texture(uHeightMap, uv - vec2(0.0, texelSize)).r;
  float heightU = texture(uHeightMap, uv + vec2(0.0, texelSize)).r;
  
  vec3 calcNormal = normalize(vec3(
    (heightL - heightR) * uDisplacementScale,
    2.0 * texelSize,
    (heightD - heightU) * uDisplacementScale
  ));
  
  vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
  vWorldPosition = worldPosition.xyz;
  vNormal = normalize(normalMatrix * mix(normal, calcNormal, 0.5));
  vUv = uv;
  vHeight = height;
  
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}`,
    fragmentShader: `#version 300 es
precision highp float;

in vec3 vWorldPosition;
in vec3 vNormal;
in vec2 vUv;
in float vHeight;

uniform vec3 uCameraPosition;
uniform vec3 uLightPosition;
uniform vec3 uLightColor;
uniform float uLightIntensity;
uniform vec3 uAmbientColor;

// Layer textures
uniform sampler2D uLayer1Diffuse;
uniform sampler2D uLayer2Diffuse;
uniform sampler2D uLayer3Diffuse;
uniform sampler2D uLayer4Diffuse;
uniform sampler2D uLayer1Normal;
uniform sampler2D uLayer2Normal;
uniform sampler2D uLayer3Normal;
uniform sampler2D uLayer4Normal;
uniform sampler2D uSplatMap;

// Layer properties
uniform float uLayer1Height;
uniform float uLayer2Height;
uniform float uLayer3Height;
uniform float uLayer1Blend;
uniform float uLayer2Blend;
uniform float uLayer3Blend;
uniform float uDistanceBlendStart;
uniform float uDistanceBlendEnd;
uniform vec2 uTextureScale;

out vec4 fragColor;

void main() {
  vec3 N = normalize(vNormal);
  vec3 L = normalize(uLightPosition - vWorldPosition);
  vec3 V = normalize(uCameraPosition - vWorldPosition);
  vec3 H = normalize(V + L);
  
  // Sample splat map
  vec4 splat = texture(uSplatMap, vUv);
  
  // Sample layer textures with UV scaling
  vec2 scaledUv = vUv * uTextureScale;
  
  vec3 diff1 = texture(uLayer1Diffuse, scaledUv).rgb;
  vec3 diff2 = texture(uLayer2Diffuse, scaledUv).rgb;
  vec3 diff3 = texture(uLayer3Diffuse, scaledUv).rgb;
  vec3 diff4 = texture(uLayer4Diffuse, scaledUv).rgb;
  
  // Height-based blending
  float blend1 = smoothstep(uLayer1Height - uLayer1Blend, uLayer1Height + uLayer1Blend, vHeight);
  float blend2 = smoothstep(uLayer2Height - uLayer2Blend, uLayer2Height + uLayer2Blend, vHeight);
  float blend3 = smoothstep(uLayer3Height - uLayer3Blend, uLayer3Height + uLayer3Blend, vHeight);
  
  // Combine layers based on height and splat map
  vec3 diffuse = diff1;
  diffuse = mix(diffuse, diff2, splat.r * blend1);
  diffuse = mix(diffuse, diff3, splat.g * blend2);
  diffuse = mix(diffuse, diff4, splat.b * blend3);
  
  // Normal mapping (blend normals)
  vec3 n1 = texture(uLayer1Normal, scaledUv).rgb * 2.0 - 1.0;
  vec3 n2 = texture(uLayer2Normal, scaledUv).rgb * 2.0 - 1.0;
  vec3 n3 = texture(uLayer3Normal, scaledUv).rgb * 2.0 - 1.0;
  vec3 n4 = texture(uLayer4Normal, scaledUv).rgb * 2.0 - 1.0;
  
  vec3 mapNormal = n1;
  mapNormal = mix(mapNormal, n2, splat.r * blend1);
  mapNormal = mix(mapNormal, n3, splat.g * blend2);
  mapNormal = mix(mapNormal, n4, splat.b * blend3);
  
  N = normalize(N + mapNormal * 0.3);
  
  // Lighting
  float NdotL = max(dot(N, L), 0.0);
  float NdotH = max(dot(N, H), 0.0);
  
  float ambient = 0.3;
  float diffuseLight = NdotL;
  float specular = pow(NdotH, 16.0) * 0.2;
  
  // Distance blend for LOD
  float distance = length(vWorldPosition - uCameraPosition);
  float distanceBlend = smoothstep(uDistanceBlendStart, uDistanceBlendEnd, distance);
  
  // Use simpler shading at distance
  vec3 color = diffuse * (ambient + diffuseLight * uLightColor * uLightIntensity) + specular * uLightColor;
  
  // Fog
  float fogFactor = smoothstep(50.0, 200.0, distance);
  color = mix(color, uAmbientColor, fogFactor);
  
  // Gamma correction
  color = pow(color, vec3(1.0 / 2.2));
  
  fragColor = vec4(color, 1.0);
}`,
    uniforms: {
      uCameraPosition: { value: new THREE.Vector3() },
      uLightPosition: { value: new THREE.Vector3(50, 100, 50) },
      uLightColor: { value: new THREE.Color(1, 1, 1) },
      uLightIntensity: { value: 1.0 },
      uAmbientColor: { value: new THREE.Color(0.3, 0.3, 0.3) },
      uTessellationFactor: { value: 1.0 },
      uDisplacementScale: { value: 10.0 },
      uHeightMap: { value: null },
      uHeightMapSize: { value: 512.0 },
      uLayer1Diffuse: { value: null },
      uLayer2Diffuse: { value: null },
      uLayer3Diffuse: { value: null },
      uLayer4Diffuse: { value: null },
      uLayer1Normal: { value: null },
      uLayer2Normal: { value: null },
      uLayer3Normal: { value: null },
      uLayer4Normal: { value: null },
      uSplatMap: { value: null },
      uLayer1Height: { value: 0.2 },
      uLayer2Height: { value: 0.4 },
      uLayer3Height: { value: 0.6 },
      uLayer1Blend: { value: 0.1 },
      uLayer2Blend: { value: 0.1 },
      uLayer3Blend: { value: 0.1 },
      uDistanceBlendStart: { value: 100.0 },
      uDistanceBlendEnd: { value: 300.0 },
      uTextureScale: { value: new THREE.Vector2(1, 1) }
    },
    transparent: false,
    depthWrite: true
  },

  // ==================
  // HOLOGRAM SHADER
  // ==================
  hologram: {
    name: 'hologram',
    vertexShader: `#version 300 es
precision highp float;

in vec3 position;
in vec3 normal;

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;
uniform float uTime;
uniform float uScanlineSpeed;

out vec3 vWorldPosition;
out vec3 vNormal;
out float vScanline;

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vNormal = normalize(normalMatrix * normal);
  
  // Animated scanline
  vScanline = worldPosition.y + uTime * uScanlineSpeed;
  
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}`,
    fragmentShader: `#version 300 es
precision highp float;

in vec3 vWorldPosition;
in vec3 vNormal;
in float vScanline;

uniform vec3 uCameraPosition;
uniform vec3 uBaseColor;
uniform vec3 uHighlightColor;
uniform float uScanlineFrequency;
uniform float uScanlineIntensity;
uniform float uFlickerSpeed;
uniform float uFlickerIntensity;
uniform float uGlitchIntensity;
uniform float uAlpha;
uniform float uFresnelPower;
uniform float uTime;

out vec4 fragColor;

float random(float x) {
  return fract(sin(x * 12.9898) * 43758.5453);
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCameraPosition - vWorldPosition);
  
  // Fresnel effect
  float fresnel = pow(1.0 - max(dot(V, N), 0.0), uFresnelPower);
  
  // Scanline effect
  float scanline = sin(vScanline * uScanlineFrequency) * 0.5 + 0.5;
  scanline = pow(scanline, 2.0) * uScanlineIntensity;
  
  // Flicker effect
  float flicker = sin(uTime * uFlickerSpeed) * 0.5 + 0.5;
  flicker = mix(1.0, flicker, uFlickerIntensity);
  
  // Glitch effect
  float glitch = 0.0;
  if (uGlitchIntensity > 0.0) {
    float glitchTime = floor(uTime * 10.0);
    if (random(glitchTime) > 0.95) {
      glitch = random(glitchTime + vWorldPosition.y) * uGlitchIntensity;
    }
  }
  
  // Color gradient
  vec3 color = mix(uBaseColor, uHighlightColor, fresnel);
  
  // Apply effects
  color += scanline * uHighlightColor;
  color *= flicker;
  color += glitch * uHighlightColor;
  
  // Alpha with fresnel
  float alpha = uAlpha * (0.5 + fresnel * 0.5);
  
  fragColor = vec4(color, alpha);
}`,
    uniforms: {
      uTime: { value: 0.0 },
      uCameraPosition: { value: new THREE.Vector3() },
      uBaseColor: { value: new THREE.Color(0, 0.8, 1) },
      uHighlightColor: { value: new THREE.Color(1, 1, 1) },
      uScanlineFrequency: { value: 50.0 },
      uScanlineIntensity: { value: 0.5 },
      uScanlineSpeed: { value: 2.0 },
      uFlickerSpeed: { value: 10.0 },
      uFlickerIntensity: { value: 0.1 },
      uGlitchIntensity: { value: 0.1 },
      uAlpha: { value: 0.8 },
      uFresnelPower: { value: 2.0 }
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide
  },

  // ==================
  // OUTLINE SHADER
  // ==================
  outline: {
    name: 'outline',
    vertexShader: `#version 300 es
precision highp float;

in vec3 position;
in vec3 normal;

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform float uOutlineWidth;
uniform vec3 uOutlineOffset;

out vec3 vNormal;

void main() {
  vec3 pos = position + normal * uOutlineWidth + uOutlineOffset;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(pos, 1.0);
  vNormal = normal;
}`,
    fragmentShader: `#version 300 es
precision highp float;

in vec3 vNormal;

uniform vec3 uOutlineColor;
uniform float uAlpha;

out vec4 fragColor;

void main() {
  fragColor = vec4(uOutlineColor, uAlpha);
}`,
    uniforms: {
      uOutlineWidth: { value: 0.05 },
      uOutlineColor: { value: new THREE.Color(0, 0, 0) },
      uOutlineOffset: { value: new THREE.Vector3(0, 0, 0) },
      uAlpha: { value: 1.0 }
    },
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide
  },

  // ==================
  // TOON SHADER
  // ==================
  toon: {
    name: 'toon',
    vertexShader: `#version 300 es
precision highp float;

in vec3 position;
in vec3 normal;
in vec2 uv;

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;

out vec3 vWorldPosition;
out vec3 vNormal;
out vec2 vUv;

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vNormal = normalize(normalMatrix * normal);
  vUv = uv;
  
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}`,
    fragmentShader: `#version 300 es
precision highp float;

in vec3 vWorldPosition;
in vec3 vNormal;
in vec2 vUv;

uniform vec3 uCameraPosition;
uniform vec3 uLightPosition;
uniform vec3 uBaseColor;
uniform vec3 uShadowColor;
uniform vec3 uHighlightColor;
uniform float uSteps;
uniform float uOutlineThreshold;
uniform float uRampSmooth;
uniform sampler2D uRampTexture;
uniform bool uUseRampTexture;

out vec4 fragColor;

void main() {
  vec3 N = normalize(vNormal);
  vec3 L = normalize(uLightPosition - vWorldPosition);
  vec3 V = normalize(uCameraPosition - vWorldPosition);
  
  // Cel shading
  float NdotL = dot(N, L);
  float intensity = NdotL * 0.5 + 0.5;
  
  // Quantize lighting
  float stepSize = 1.0 / uSteps;
  float quantized = floor(intensity / stepSize) * stepSize;
  
  // Ramp texture or step-based
  float rampValue;
  if (uUseRampTexture) {
    rampValue = texture(uRampTexture, vec2(intensity, 0.5)).r;
  } else {
    rampValue = mix(quantized, intensity, uRampSmooth);
  }
  
  // Color based on ramp
  vec3 color;
  if (rampValue < 0.33) {
    color = uShadowColor;
  } else if (rampValue < 0.66) {
    color = uBaseColor;
  } else {
    color = mix(uBaseColor, uHighlightColor, (rampValue - 0.66) / 0.34);
  }
  
  // Outline detection (using depth slope - simplified)
  // This is better done as a post-process or inverted hull
  
  // Gamma correction
  color = pow(color, vec3(1.0 / 2.2));
  
  fragColor = vec4(color, 1.0);
}`,
    uniforms: {
      uCameraPosition: { value: new THREE.Vector3() },
      uLightPosition: { value: new THREE.Vector3(50, 100, 50) },
      uBaseColor: { value: new THREE.Color(0.8, 0.2, 0.2) },
      uShadowColor: { value: new THREE.Color(0.2, 0.05, 0.05) },
      uHighlightColor: { value: new THREE.Color(1, 0.8, 0.8) },
      uSteps: { value: 3.0 },
      uOutlineThreshold: { value: 0.5 },
      uRampSmooth: { value: 0.2 },
      uRampTexture: { value: null },
      uUseRampTexture: { value: false }
    },
    transparent: false,
    depthWrite: true
  },

  // ==================
  // GLASS SHADER
  // ==================
  glass: {
    name: 'glass',
    vertexShader: `#version 300 es
precision highp float;

in vec3 position;
in vec3 normal;
in vec2 uv;

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;
uniform mat4 modelViewMatrix;

out vec3 vWorldPosition;
out vec3 vNormal;
out vec2 vUv;
out vec4 vClipPosition;

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vNormal = normalize(normalMatrix * normal);
  vUv = uv;
  
  vec4 mvPosition = viewMatrix * worldPosition;
  vClipPosition = projectionMatrix * mvPosition;
  
  gl_Position = vClipPosition;
}`,
    fragmentShader: `#version 300 es
precision highp float;

in vec3 vWorldPosition;
in vec3 vNormal;
in vec2 vUv;
in vec4 vClipPosition;

uniform vec3 uCameraPosition;
uniform vec3 uBaseColor;
uniform float uIOR;
uniform float uThickness;
uniform float uRoughness;
uniform float uTransmission;
uniform float uAlpha;
uniform sampler2D uEnvMap;
uniform sampler2D uNormalMap;
uniform bool uUseNormalMap;
uniform vec2 uResolution;

out vec4 fragColor;

void main() {
  vec3 N = normalize(vNormal);
  
  // Normal mapping
  if (uUseNormalMap) {
    vec3 normalMap = texture(uNormalMap, vUv).rgb * 2.0 - 1.0;
    N = normalize(N + normalMap * 0.5);
  }
  
  vec3 V = normalize(uCameraPosition - vWorldPosition);
  vec3 I = normalize(vWorldPosition - uCameraPosition);
  
  // Fresnel (Schlick approximation)
  float cosTheta = max(dot(V, N), 0.0);
  float fresnel = pow(1.0 - cosTheta, 5.0);
  fresnel = mix(0.04, 1.0, fresnel); // Base reflectivity of glass
  
  // Refraction direction
  vec3 R = refract(I, N, 1.0 / uIOR);
  
  // Reflection direction
  vec3 Refl = reflect(I, N);
  
  // Calculate refraction UV (simplified)
  vec2 screenUv = vClipPosition.xy / vClipPosition.w * 0.5 + 0.5;
  vec2 refractUv = screenUv + R.xy * 0.1;
  
  // Sample environment (would normally use a cubemap)
  vec3 refractColor = texture(uEnvMap, refractUv).rgb;
  vec3 reflectColor = texture(uEnvMap, screenUv + Refl.xy * 0.1).rgb;
  
  // Mix refraction and reflection based on fresnel
  vec3 color = mix(refractColor, reflectColor, fresnel);
  
  // Add base color tint
  color = mix(color, color * uBaseColor, 0.3);
  
  // Roughness blur (simplified)
  if (uRoughness > 0.0) {
    vec2 blurUv = vUv * (1.0 + uRoughness);
    // This is a very simplified blur
    color = mix(color, uBaseColor, uRoughness * 0.5);
  }
  
  // Alpha
  float alpha = mix(uTransmission, 1.0, fresnel) * uAlpha;
  
  fragColor = vec4(color, alpha);
}`,
    uniforms: {
      uCameraPosition: { value: new THREE.Vector3() },
      uBaseColor: { value: new THREE.Color(1, 1, 1) },
      uIOR: { value: 1.5 },
      uThickness: { value: 1.0 },
      uRoughness: { value: 0.0 },
      uTransmission: { value: 0.9 },
      uAlpha: { value: 0.5 },
      uEnvMap: { value: null },
      uNormalMap: { value: null },
      uUseNormalMap: { value: false },
      uResolution: { value: new THREE.Vector2(1920, 1080) }
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  },

  // ==================
  // LAVA SHADER
  // ==================
  lava: {
    name: 'lava',
    vertexShader: `#version 300 es
precision highp float;

in vec3 position;
in vec3 normal;
in vec2 uv;

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;
uniform float uTime;
uniform float uFlowSpeed;
uniform float uDisplacementScale;

out vec3 vWorldPosition;
out vec3 vNormal;
out vec2 vUv;
out float vDisplacement;

// Noise functions
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  
  i = mod289(i);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;
  
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

void main() {
  vec3 pos = position;
  
  // Flowing displacement
  float time = uTime * uFlowSpeed;
  float noise1 = snoise(vec3(pos.xz * 0.5, time));
  float noise2 = snoise(vec3(pos.xz * 1.0, time * 0.7));
  float displacement = (noise1 * 0.5 + noise2 * 0.5) * uDisplacementScale;
  
  pos.y += displacement;
  
  vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
  vWorldPosition = worldPosition.xyz;
  vNormal = normalize(normalMatrix * normal);
  vUv = uv;
  vDisplacement = displacement;
  
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}`,
    fragmentShader: `#version 300 es
precision highp float;

in vec3 vWorldPosition;
in vec3 vNormal;
in vec2 vUv;
in float vDisplacement;

uniform float uTime;
uniform float uFlowSpeed;
uniform vec3 uCoolColor;
uniform vec3 uHotColor;
uniform vec3 uGlowColor;
uniform float uEmissiveIntensity;
uniform float uFlowScale;
uniform sampler2D uLavaTexture;
uniform sampler2D uNormalMap;
uniform bool uUseLavaTexture;

out vec4 fragColor;

// Noise for flow pattern
float noise(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec3 N = normalize(vNormal);
  
  // Flowing texture coordinates
  float time = uTime * uFlowSpeed;
  vec2 flowUv = vUv * uFlowScale;
  
  // Animated flow pattern
  vec2 flow1 = vec2(time * 0.1, time * 0.05);
  vec2 flow2 = vec2(-time * 0.08, time * 0.07);
  
  float pattern1 = noise(flowUv + flow1);
  float pattern2 = noise(flowUv * 2.0 + flow2);
  float pattern = pattern1 * 0.5 + pattern2 * 0.5;
  
  // Normal animation
  vec3 normalMap = vec3(0.0);
  if (uUseLavaTexture) {
    normalMap = texture(uNormalMap, flowUv + time * 0.02).rgb * 2.0 - 1.0;
    N = normalize(N + normalMap * 0.3);
  }
  
  // Temperature gradient based on displacement and pattern
  float temperature = vDisplacement * 2.0 + pattern;
  temperature = clamp(temperature, 0.0, 1.0);
  
  // Color gradient
  vec3 color = mix(uCoolColor, uHotColor, temperature);
  
  // Add glow for hot areas
  float glow = smoothstep(0.6, 1.0, temperature);
  color += uGlowColor * glow * uEmissiveIntensity;
  
  // Add emissive
  color += color * uEmissiveIntensity * 0.5;
  
  // No gamma correction for emissive materials
  fragColor = vec4(color, 1.0);
}`,
    uniforms: {
      uTime: { value: 0.0 },
      uFlowSpeed: { value: 0.5 },
      uDisplacementScale: { value: 0.3 },
      uCoolColor: { value: new THREE.Color(0.1, 0.05, 0.0) },
      uHotColor: { value: new THREE.Color(1.0, 0.3, 0.0) },
      uGlowColor: { value: new THREE.Color(1.0, 0.8, 0.3) },
      uEmissiveIntensity: { value: 2.0 },
      uFlowScale: { value: 2.0 },
      uLavaTexture: { value: null },
      uNormalMap: { value: null },
      uUseLavaTexture: { value: false }
    },
    transparent: false,
    depthWrite: true
  },

  // ==================
  // HOLOGRAM GRID SHADER
  // ==================
  hologramGrid: {
    name: 'hologramGrid',
    vertexShader: `#version 300 es
precision highp float;

in vec3 position;
in vec3 normal;

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;
uniform float uTime;

out vec3 vWorldPosition;
out vec3 vNormal;
out vec3 vViewDir;

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vNormal = normalize(normalMatrix * normal);
  
  vec4 mvPosition = viewMatrix * worldPosition;
  vViewDir = -mvPosition.xyz;
  
  gl_Position = projectionMatrix * mvPosition;
}`,
    fragmentShader: `#version 300 es
precision highp float;

in vec3 vWorldPosition;
in vec3 vNormal;
in vec3 vViewDir;

uniform float uTime;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform float uGridSize;
uniform float uGridThickness;
uniform float uAlpha;
uniform float uFresnelPower;
uniform float uColorShiftSpeed;
uniform float uPulseSpeed;
uniform float uPulseIntensity;

out vec4 fragColor;

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(vViewDir);
  
  // Fresnel effect
  float fresnel = pow(1.0 - abs(dot(V, N)), uFresnelPower);
  
  // Grid pattern in world space
  vec3 gridPos = vWorldPosition * uGridSize;
  vec2 grid = abs(fract(gridPos.xz) - 0.5);
  float gridLine = step(grid.x, uGridThickness) + step(grid.y, uGridThickness);
  gridLine = min(gridLine, 1.0);
  
  // Vertical grid lines
  vec2 gridV = abs(fract(gridPos.xy) - 0.5);
  float gridLineV = step(gridV.x, uGridThickness) + step(gridV.y, uGridThickness);
  gridLine = max(gridLine, min(gridLineV, 1.0));
  
  // Color shift over time
  float colorShift = sin(uTime * uColorShiftSpeed) * 0.5 + 0.5;
  vec3 color = mix(uColor1, uColor2, colorShift);
  
  // Pulse effect
  float pulse = sin(uTime * uPulseSpeed) * 0.5 + 0.5;
  float pulseEffect = mix(1.0, pulse, uPulseIntensity);
  
  // Combine effects
  color = color * (gridLine * 0.8 + 0.2) * pulseEffect;
  color += fresnel * uColor2 * 0.5;
  
  // Alpha
  float alpha = uAlpha * (gridLine * 0.5 + 0.5) * (0.5 + fresnel * 0.5);
  
  fragColor = vec4(color, alpha);
}`,
    uniforms: {
      uTime: { value: 0.0 },
      uColor1: { value: new THREE.Color(0, 1, 0.5) },
      uColor2: { value: new THREE.Color(0, 0.5, 1) },
      uGridSize: { value: 5.0 },
      uGridThickness: { value: 0.05 },
      uAlpha: { value: 0.7 },
      uFresnelPower: { value: 2.0 },
      uColorShiftSpeed: { value: 0.5 },
      uPulseSpeed: { value: 2.0 },
      uPulseIntensity: { value: 0.3 }
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide
  },

  // ==================
  // FORCE FIELD SHADER
  // ==================
  forceField: {
    name: 'forceField',
    vertexShader: `#version 300 es
precision highp float;

in vec3 position;
in vec3 normal;

uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;
uniform float uTime;
uniform float uDistortionStrength;

out vec3 vWorldPosition;
out vec3 vNormal;
out vec3 vViewDir;
out float vDistortion;

// Simple noise
float noise(vec3 p) {
  return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
}

void main() {
  vec3 pos = position;
  
  // Distortion based on time and position
  float distortion = sin(pos.y * 10.0 + uTime * 2.0) * cos(pos.x * 10.0 + uTime * 1.5);
  distortion *= uDistortionStrength;
  pos += normal * distortion;
  
  vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
  vWorldPosition = worldPosition.xyz;
  vNormal = normalize(normalMatrix * normal);
  
  vec4 mvPosition = viewMatrix * worldPosition;
  vViewDir = -mvPosition.xyz;
  vDistortion = distortion;
  
  gl_Position = projectionMatrix * mvPosition;
}`,
    fragmentShader: `#version 300 es
precision highp float;

in vec3 vWorldPosition;
in vec3 vNormal;
in vec3 vViewDir;
in float vDistortion;

uniform float uTime;
uniform vec3 uBaseColor;
uniform vec3 uHighlightColor;
uniform float uFresnelPower;
uniform float uDistortionScale;
uniform float uPulseSpeed;
uniform float uPulseIntensity;
uniform float uAlpha;
uniform sampler2D uNoiseTexture;

out vec4 fragColor;

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(vViewDir);
  
  // Fresnel effect
  float fresnel = pow(1.0 - abs(dot(V, N)), uFresnelPower);
  
  // Hexagonal pattern
  vec3 hexPos = vWorldPosition * uDistortionScale;
  float hex = 0.0;
  for (int i = 0; i < 3; i++) {
    vec2 offset = vec2(float(i) * 0.33, float(i) * 0.67);
    vec2 hexUv = hexPos.xz + offset;
    hex += sin(hexUv.x * 6.28) * sin(hexUv.y * 6.28);
  }
  hex = hex / 3.0 * 0.5 + 0.5;
  
  // Pulse effect
  float pulse = sin(uTime * uPulseSpeed + length(vWorldPosition) * 2.0) * 0.5 + 0.5;
  float pulseEffect = mix(1.0, pulse, uPulseIntensity);
  
  // Ripple from center
  float ripple = sin(length(vWorldPosition) * 5.0 - uTime * 3.0) * 0.5 + 0.5;
  
  // Color
  vec3 color = uBaseColor;
  color += uHighlightColor * fresnel * 0.8;
  color += uHighlightColor * hex * 0.3;
  color *= pulseEffect;
  color += uHighlightColor * ripple * 0.2;
  
  // Alpha
  float alpha = uAlpha * (0.3 + fresnel * 0.7) * pulseEffect;
  
  fragColor = vec4(color, alpha);
}`,
    uniforms: {
      uTime: { value: 0.0 },
      uDistortionStrength: { value: 0.1 },
      uBaseColor: { value: new THREE.Color(0.2, 0.5, 1.0) },
      uHighlightColor: { value: new THREE.Color(1.0, 1.0, 1.0) },
      uFresnelPower: { value: 3.0 },
      uDistortionScale: { value: 2.0 },
      uPulseSpeed: { value: 2.0 },
      uPulseIntensity: { value: 0.4 },
      uAlpha: { value: 0.6 },
      uNoiseTexture: { value: null }
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide
  }
};

// ============================================
// SHADER LIBRARY CLASS
// ============================================

/**
 * Main Shader Library class for managing custom shaders
 */
export class ShaderLibrary {
  private static instance: ShaderLibrary;
  private shaders: Map<string, ShaderDefinition> = new Map();
  private materials: Map<string, THREE.ShaderMaterial> = new Map();
  private uniformManager: UniformManager;

  private constructor() {
    this.uniformManager = uniformManager;
    this.registerBuiltInShaders();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): ShaderLibrary {
    if (!ShaderLibrary.instance) {
      ShaderLibrary.instance = new ShaderLibrary();
    }
    return ShaderLibrary.instance;
  }

  /**
   * Register all built-in shaders
   */
  private registerBuiltInShaders(): void {
    Object.entries(BUILTIN_SHADERS).forEach(([name, definition]) => {
      this.shaders.set(name, definition);
    });
  }

  /**
   * Register a new shader
   */
  registerShader(name: string, definition: ShaderDefinition): void {
    if (this.shaders.has(name)) {
      console.warn(`Shader "${name}" already exists. Overwriting.`);
    }
    this.shaders.set(name, definition);
  }

  /**
   * Get a shader definition by name
   */
  getShader(name: string): ShaderDefinition | undefined {
    return this.shaders.get(name);
  }

  /**
   * Create a ShaderMaterial from a registered shader
   */
  createMaterial(name: string): THREE.ShaderMaterial {
    const definition = this.shaders.get(name);
    if (!definition) {
      throw new Error(`Shader "${name}" not found in library`);
    }

    // Clone uniforms to avoid shared state
    const uniforms: Record<string, THREE.IUniform> = {};
    Object.entries(definition.uniforms).forEach(([key, uniform]) => {
      uniforms[key] = { value: uniform.value };
    });

    const material = new THREE.ShaderMaterial({
      name: definition.name,
      vertexShader: definition.vertexShader,
      fragmentShader: definition.fragmentShader,
      uniforms,
      defines: definition.defines ? { ...definition.defines } : undefined,
      transparent: definition.transparent ?? false,
      depthWrite: definition.depthWrite ?? true,
      side: definition.side ?? THREE.FrontSide,
      blending: definition.blending ?? THREE.NormalBlending,
      extensions: definition.extensions ? {
        clipCullDistance: definition.extensions.includes('clipCullDistance'),
        multiDraw: definition.extensions.includes('multiDraw')
      } : undefined
    });

    // Store material reference
    const materialId = `${name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.materials.set(materialId, material);
    this.uniformManager.registerMaterial(materialId, uniforms);

    return material;
  }

  /**
   * Clone a shader with a new name
   */
  cloneShader(name: string, newName: string): void {
    const definition = this.shaders.get(name);
    if (!definition) {
      throw new Error(`Shader "${name}" not found in library`);
    }

    // Deep clone the definition
    const clonedDefinition: ShaderDefinition = {
      ...definition,
      name: newName,
      uniforms: {}
    };

    // Clone uniforms
    Object.entries(definition.uniforms).forEach(([key, uniform]) => {
      let clonedValue = uniform.value;
      if (uniform.value instanceof THREE.Vector3) {
        clonedValue = uniform.value.clone();
      } else if (uniform.value instanceof THREE.Vector2) {
        clonedValue = uniform.value.clone();
      } else if (uniform.value instanceof THREE.Color) {
        clonedValue = uniform.value.clone();
      } else if (uniform.value instanceof THREE.Matrix4) {
        clonedValue = uniform.value.clone();
      } else if (uniform.value instanceof THREE.Matrix3) {
        clonedValue = uniform.value.clone();
      } else if (Array.isArray(uniform.value)) {
        clonedValue = [...uniform.value];
      }
      clonedDefinition.uniforms[key] = { value: clonedValue };
    });

    // Clone other properties
    if (definition.defines) {
      clonedDefinition.defines = { ...definition.defines };
    }
    if (definition.extensions) {
      clonedDefinition.extensions = [...definition.extensions];
    }

    this.registerShader(newName, clonedDefinition);
  }

  /**
   * Get all registered shader names
   */
  getShaderNames(): string[] {
    return Array.from(this.shaders.keys());
  }

  /**
   * Load a shader pack from a URL
   */
  async loadShaderPack(url: string): Promise<void> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to load shader pack from ${url}: ${response.statusText}`);
      }

      const pack: ShaderPack = await response.json();
      
      pack.shaders.forEach(shader => {
        this.registerShader(shader.name, shader);
      });

      console.log(`Loaded shader pack "${pack.name}" v${pack.version} with ${pack.shaders.length} shaders`);
    } catch (error) {
      console.error('Error loading shader pack:', error);
      throw error;
    }
  }

  /**
   * Check if a shader exists
   */
  hasShader(name: string): boolean {
    return this.shaders.has(name);
  }

  /**
   * Remove a shader from the library
   */
  removeShader(name: string): boolean {
    return this.shaders.delete(name);
  }

  /**
   * Get uniform manager
   */
  getUniformManager(): UniformManager {
    return this.uniformManager;
  }

  /**
   * Update all materials with time uniform
   */
  updateMaterials(time: number, deltaTime?: number): void {
    this.uniformManager.update();
    
    this.materials.forEach(material => {
      if (material.uniforms.uTime) {
        material.uniforms.uTime.value = time;
      }
    });
  }

  /**
   * Dispose all materials
   */
  dispose(): void {
    this.materials.forEach(material => {
      material.dispose();
    });
    this.materials.clear();
  }

  /**
   * Create a material with custom uniforms override
   */
  createMaterialWithOverrides(name: string, uniformOverrides: Partial<Record<string, unknown>>): THREE.ShaderMaterial {
    const material = this.createMaterial(name);
    
    Object.entries(uniformOverrides).forEach(([key, value]) => {
      if (material.uniforms[key]) {
        material.uniforms[key].value = value;
      }
    });

    return material;
  }

  /**
   * Get shader info
   */
  getShaderInfo(name: string): {
    name: string;
    uniformCount: number;
    hasVertexShader: boolean;
    hasFragmentShader: boolean;
    transparent: boolean;
  } | null {
    const definition = this.shaders.get(name);
    if (!definition) return null;

    return {
      name: definition.name,
      uniformCount: Object.keys(definition.uniforms).length,
      hasVertexShader: !!definition.vertexShader,
      hasFragmentShader: !!definition.fragmentShader,
      transparent: definition.transparent ?? false
    };
  }

  /**
   * Export shader as JSON
   */
  exportShader(name: string): string | null {
    const definition = this.shaders.get(name);
    if (!definition) return null;

    // Convert THREE objects to plain objects for serialization
    const serializable: Record<string, unknown> = {
      name: definition.name,
      vertexShader: definition.vertexShader,
      fragmentShader: definition.fragmentShader,
      uniforms: {},
      transparent: definition.transparent,
      depthWrite: definition.depthWrite,
      side: definition.side
    };

    Object.entries(definition.uniforms).forEach(([key, uniform]) => {
      let value = uniform.value;
      if (value instanceof THREE.Vector3) {
        value = { type: 'Vector3', x: value.x, y: value.y, z: value.z };
      } else if (value instanceof THREE.Vector2) {
        value = { type: 'Vector2', x: value.x, y: value.y };
      } else if (value instanceof THREE.Color) {
        value = { type: 'Color', r: value.r, g: value.g, b: value.b };
      } else if (value instanceof THREE.Matrix4) {
        value = { type: 'Matrix4', elements: value.elements };
      }
      (serializable.uniforms as Record<string, unknown>)[key] = { value };
    });

    return JSON.stringify(serializable, null, 2);
  }

  /**
   * Import shader from JSON
   */
  importShader(json: string): void {
    const data = JSON.parse(json);
    
    // Convert plain objects back to THREE objects
    const uniforms: Record<string, THREE.IUniform> = {};
    Object.entries(data.uniforms).forEach(([key, uniform]) => {
      const u = uniform as { value: unknown };
      let value = u.value;
      
      if (value && typeof value === 'object' && 'type' in value) {
        const v = value as { type: string; x?: number; y?: number; z?: number; r?: number; g?: number; b?: number; elements?: number[] };
        switch (v.type) {
          case 'Vector3':
            value = new THREE.Vector3(v.x, v.y, v.z);
            break;
          case 'Vector2':
            value = new THREE.Vector2(v.x, v.y);
            break;
          case 'Color':
            value = new THREE.Color(v.r ?? 0, v.g ?? 0, v.b ?? 0);
            break;
          case 'Matrix4':
            const mat = new THREE.Matrix4();
            if (v.elements && v.elements.length === 16) {
              mat.fromArray(v.elements);
            }
            value = mat;
            break;
        }
      }
      
      uniforms[key] = { value };
    });

    const definition: ShaderDefinition = {
      name: data.name,
      vertexShader: data.vertexShader,
      fragmentShader: data.fragmentShader,
      uniforms,
      transparent: data.transparent,
      depthWrite: data.depthWrite,
      side: data.side
    };

    this.registerShader(definition.name, definition);
  }
}

// Export singleton instance
export const shaderLibrary = ShaderLibrary.getInstance();

// Default export
export default ShaderLibrary;
