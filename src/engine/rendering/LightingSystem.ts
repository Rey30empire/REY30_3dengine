// ============================================
// Dynamic Lighting System
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// ============================================

import * as THREE from 'three';
import { PMREMGenerator } from 'three';

// ============================================
// Enums and Interfaces
// ============================================

/**
 * Supported light types in the engine
 */
export enum LightType {
  DIRECTIONAL = 'directional',
  POINT = 'point',
  SPOT = 'spot',
  AREA = 'area',
  AMBIENT = 'ambient',
  HEMISPHERE = 'hemisphere',
  VOLUMETRIC = 'volumetric',
}

/**
 * Shadow quality presets
 */
export enum ShadowQuality {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  ULTRA = 'ultra',
}

/**
 * Light configuration interface
 */
export interface LightConfig {
  // Basic properties
  type: LightType;
  color: THREE.Color;
  intensity: number;
  position: THREE.Vector3;
  rotation: THREE.Euler;
  name?: string;

  // Shadow properties
  castShadows: boolean;
  shadowMapSize: number;
  shadowBias: number;
  shadowRadius: number;
  shadowDistance: number;
  cascades?: number; // for directional lights (CSM)

  // Point/Spot light specific
  range?: number; // Point/Spot light range
  decay?: number; // Light decay factor

  // Spot light specific
  angle?: number; // Spot cone angle (radians)
  penumbra?: number; // Spot penumbra (0-1)

  // Area light specific
  width?: number; // Area light width
  height?: number; // Area light height

  // Volumetric lighting
  volumetricEnabled?: boolean;
  volumetricDensity?: number;
  volumetricSamples?: number;
  volumetricColor?: THREE.Color;

  // Image-Based Lighting
  iblIntensity?: number;
  iblRotation?: number;

  // Hemisphere light specific
  groundColor?: THREE.Color;
  skyColor?: THREE.Color;
}

/**
 * Shadow system configuration
 */
export interface ShadowConfig {
  quality: ShadowQuality;
  mapSize: number;
  bias: number;
  normalBias: number;
  radius: number;
  cascades: number;
  maximumDistance: number;
  fadeEnabled: boolean;
  fadeDistance: number;
  pcfSamples: number;
}

/**
 * Light probe configuration
 */
export interface LightProbeConfig {
  position: THREE.Vector3;
  radius: number;
  resolution: number;
  updateMode: 'static' | 'dynamic';
}

/**
 * Volumetric light configuration
 */
export interface VolumetricLightConfig {
  enabled: boolean;
  density: number;
  samples: number;
  decay: number;
  weight: number;
  exposure: number;
  color: THREE.Color;
}

type ShadowCapableLight = THREE.DirectionalLight | THREE.SpotLight | THREE.PointLight;

function isShadowCapableLight(light: THREE.Object3D): light is ShadowCapableLight {
  return light instanceof THREE.DirectionalLight ||
    light instanceof THREE.SpotLight ||
    light instanceof THREE.PointLight;
}

type LightMapCapableMaterial = THREE.Material & {
  lightMap?: THREE.Texture | null;
  lightMapIntensity?: number;
  needsUpdate: boolean;
  userData: Record<string, unknown>;
};

function isLightMapCapableMaterial(material: THREE.Material): material is LightMapCapableMaterial {
  return 'lightMap' in material;
}

function collectSceneLights(scene: THREE.Scene): THREE.Light[] {
  const lights: THREE.Light[] = [];
  scene.traverse((object) => {
    if (object instanceof THREE.Light && object.visible) {
      lights.push(object);
    }
  });
  return lights;
}

function computeMeshCenter(mesh: THREE.Mesh): THREE.Vector3 {
  const box = new THREE.Box3().setFromObject(mesh);
  if (!box.isEmpty()) {
    return box.getCenter(new THREE.Vector3());
  }
  return mesh.getWorldPosition(new THREE.Vector3());
}

function ensureUv2(geometry: THREE.BufferGeometry): boolean {
  if (geometry.getAttribute('uv2')) {
    return false;
  }

  const uv = geometry.getAttribute('uv');
  if (uv && uv.itemSize >= 2) {
    geometry.setAttribute('uv2', uv.clone());
    return true;
  }

  const position = geometry.getAttribute('position');
  if (!position) {
    return false;
  }

  if (!geometry.boundingBox) {
    geometry.computeBoundingBox();
  }
  const box = geometry.boundingBox?.clone();
  if (!box) {
    return false;
  }

  const size = box.getSize(new THREE.Vector3());
  const min = box.min.clone();
  const spanX = size.x || 1;
  const spanZ = size.z || 1;
  const values = new Float32Array(position.count * 2);

  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    values[i * 2] = (x - min.x) / spanX;
    values[i * 2 + 1] = (z - min.z) / spanZ;
  }

  geometry.setAttribute('uv', new THREE.BufferAttribute(values.slice(0), 2));
  geometry.setAttribute('uv2', new THREE.BufferAttribute(values, 2));
  return true;
}

function pseudoNormalFromUv(u: number, v: number): THREE.Vector3 {
  const nx = (u - 0.5) * 1.6;
  const ny = 0.35 + (1 - v) * 0.9;
  const nz = (0.5 - v) * 0.85;
  return new THREE.Vector3(nx, ny, nz).normalize();
}

function evaluateLightingAtPoint(
  point: THREE.Vector3,
  normal: THREE.Vector3,
  lights: THREE.Light[]
): THREE.Color {
  const color = new THREE.Color(0.04, 0.04, 0.05);
  const direction = new THREE.Vector3();
  const lightDirection = new THREE.Vector3();
  const targetPosition = new THREE.Vector3();

  for (const light of lights) {
    if (light instanceof THREE.AmbientLight) {
      color.add(light.color.clone().multiplyScalar(light.intensity));
      continue;
    }

    if (light instanceof THREE.HemisphereLight) {
      const skyFactor = THREE.MathUtils.clamp(normal.y * 0.5 + 0.5, 0, 1);
      color.add(light.color.clone().multiplyScalar(light.intensity * skyFactor));
      color.add(light.groundColor.clone().multiplyScalar(light.intensity * (1 - skyFactor)));
      continue;
    }

    if (light instanceof THREE.DirectionalLight) {
      light.getWorldDirection(direction);
      lightDirection.copy(direction).negate().normalize();
      const diffuse = Math.max(normal.dot(lightDirection), 0);
      color.add(light.color.clone().multiplyScalar(light.intensity * diffuse));
      continue;
    }

    if (light instanceof THREE.PointLight) {
      lightDirection.copy(light.position).sub(point);
      const distance = Math.max(lightDirection.length(), 0.001);
      lightDirection.normalize();
      const diffuse = Math.max(normal.dot(lightDirection), 0);
      const attenuation =
        light.distance && light.distance > 0
          ? Math.max(0, 1 - distance / light.distance)
          : 1 / (1 + distance * 0.08);
      color.add(light.color.clone().multiplyScalar(light.intensity * diffuse * attenuation));
      continue;
    }

    if (light instanceof THREE.SpotLight) {
      lightDirection.copy(light.position).sub(point);
      const distance = Math.max(lightDirection.length(), 0.001);
      const sampleDirection = lightDirection.clone().normalize();
      targetPosition.setFromMatrixPosition(light.target.matrixWorld);
      direction.copy(targetPosition).sub(light.position).normalize();
      const spot = Math.max(direction.dot(sampleDirection.clone().negate()), 0);
      const cone = light.angle > 0 ? Math.pow(spot, Math.max(1, 1 / light.angle)) : spot;
      const diffuse = Math.max(normal.dot(sampleDirection), 0);
      const attenuation =
        light.distance && light.distance > 0
          ? Math.max(0, 1 - distance / light.distance)
          : 1 / (1 + distance * 0.08);
      color.add(light.color.clone().multiplyScalar(light.intensity * diffuse * cone * attenuation));
    }
  }

  color.r = Math.min(2.0, color.r);
  color.g = Math.min(2.0, color.g);
  color.b = Math.min(2.0, color.b);
  return color;
}

// ============================================
// Default Configurations
// ============================================

const DEFAULT_LIGHT_CONFIG: Partial<LightConfig> = {
  intensity: 1,
  position: new THREE.Vector3(0, 0, 0),
  rotation: new THREE.Euler(0, 0, 0),
  castShadows: true,
  shadowMapSize: 2048,
  shadowBias: -0.0001,
  shadowRadius: 1,
  shadowDistance: 100,
  cascades: 4,
  range: 100,
  decay: 2,
  angle: Math.PI / 4,
  penumbra: 0.3,
  width: 5,
  height: 5,
  volumetricEnabled: false,
  volumetricDensity: 0.5,
  volumetricSamples: 32,
  iblIntensity: 1,
  iblRotation: 0,
};

const DEFAULT_SHADOW_CONFIG: ShadowConfig = {
  quality: ShadowQuality.HIGH,
  mapSize: 2048,
  bias: -0.0001,
  normalBias: 0.02,
  radius: 1,
  cascades: 4,
  maximumDistance: 500,
  fadeEnabled: true,
  fadeDistance: 100,
  pcfSamples: 4,
};

// ============================================
// Shadow System
// ============================================

/**
 * Advanced shadow system with CSM support
 */
export class ShadowSystem {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private config: ShadowConfig;
  private cascadeLights: THREE.DirectionalLight[] = [];
  private cascadeCameras: THREE.OrthographicCamera[] = [];
  private cascadeTargets: THREE.WebGLRenderTarget[] = [];
  private mainLight: THREE.DirectionalLight | null = null;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, config?: Partial<ShadowConfig>) {
    this.renderer = renderer;
    this.scene = scene;
    this.config = { ...DEFAULT_SHADOW_CONFIG, ...config };
    this.configureRenderer();
  }

  private configureRenderer(): void {
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
  }

  /**
   * Set up Cascaded Shadow Maps for a directional light
   */
  setupCSM(light: THREE.DirectionalLight, cascades: number = 4): void {
    this.mainLight = light;
    this.cascadeLights = [];
    this.cascadeCameras = [];
    this.cascadeTargets = [];

    // Create cascade splits
    const splitDistances = this.calculateCascadeSplits(cascades);

    for (let i = 0; i < cascades; i++) {
      const cascadeLight = light.clone() as THREE.DirectionalLight;
      cascadeLight.castShadow = true;
      cascadeLight.shadow.mapSize.set(this.config.mapSize, this.config.mapSize);
      cascadeLight.shadow.bias = this.config.bias;
      cascadeLight.shadow.normalBias = this.config.normalBias;
      cascadeLight.shadow.radius = this.config.radius;

      // Create orthographic camera for cascade
      const camera = new THREE.OrthographicCamera(-50, 50, 50, -50, 0.1, splitDistances[i + 1]);
      this.cascadeCameras.push(camera);

      // Create render target
      const target = new THREE.WebGLRenderTarget(this.config.mapSize, this.config.mapSize);
      this.cascadeTargets.push(target);

      this.cascadeLights.push(cascadeLight);
    }
  }

  private calculateCascadeSplits(cascades: number): number[] {
    const near = 0.1;
    const far = this.config.maximumDistance;
    const splits: number[] = [near];

    for (let i = 1; i <= cascades; i++) {
      const split = THREE.MathUtils.lerp(
        near + (i / cascades) * (far - near),
        far * Math.pow(near / far, i / cascades),
        0.5
      );
      splits.push(split);
    }

    return splits;
  }

  /**
   * Update cascade shadow maps
   */
  updateCSM(camera: THREE.Camera): void {
    if (!this.mainLight) return;

    const lightDirection = new THREE.Vector3();
    this.mainLight.getWorldDirection(lightDirection);

    for (let i = 0; i < this.cascadeCameras.length; i++) {
      const cascadeCamera = this.cascadeCameras[i];

      // Position cascade camera
      cascadeCamera.position.copy(camera.position);
      cascadeCamera.position.add(lightDirection.clone().multiplyScalar(50));

      // Look at camera target
      cascadeCamera.lookAt(camera.position);
      cascadeCamera.updateProjectionMatrix();
    }
  }

  /**
   * Enable PCF soft shadows
   */
  enablePCF(light: THREE.Light, samples: number = 4): void {
    if (light instanceof THREE.DirectionalLight || light instanceof THREE.SpotLight) {
      light.shadow.radius = samples;
      this.renderer.shadowMap.type = THREE.PCFShadowMap;
    }
  }

  /**
   * Enable PCSS (Percentage-Closer Soft Shadows)
   */
  enablePCSS(light: THREE.Light, config: { blockerSearchRadius: number; filterRadius: number }): void {
    if ('shadow' in light && light.shadow) {
      // PCSS requires custom shader implementation
      // This is a simplified version using Three.js built-in soft shadows
      (light.shadow as THREE.LightShadow).radius = config.filterRadius;
    }
  }

  /**
   * Optimize shadow distance based on camera position
   */
  optimizeShadowDistance(camera: THREE.Camera, objects: THREE.Object3D[]): void {
    if (!this.mainLight) return;

    // Calculate bounding box of visible objects
    const bbox = new THREE.Box3();
    objects.forEach(obj => {
      if ((obj as THREE.Mesh).isMesh) {
        bbox.expandByObject(obj);
      }
    });

    // Adjust shadow camera bounds
    if (this.mainLight.shadow.camera instanceof THREE.OrthographicCamera) {
      const size = bbox.getSize(new THREE.Vector3());
      const center = bbox.getCenter(new THREE.Vector3());

      this.mainLight.shadow.camera.left = center.x - size.x / 2;
      this.mainLight.shadow.camera.right = center.x + size.x / 2;
      this.mainLight.shadow.camera.top = center.z + size.z / 2;
      this.mainLight.shadow.camera.bottom = center.z - size.z / 2;
      this.mainLight.shadow.camera.updateProjectionMatrix();
    }
  }

  /**
   * Set shadow quality preset
   */
  setQuality(quality: ShadowQuality): void {
    const qualitySettings = {
      [ShadowQuality.LOW]: { mapSize: 512, pcfSamples: 2 },
      [ShadowQuality.MEDIUM]: { mapSize: 1024, pcfSamples: 2 },
      [ShadowQuality.HIGH]: { mapSize: 2048, pcfSamples: 4 },
      [ShadowQuality.ULTRA]: { mapSize: 4096, pcfSamples: 8 },
    };

    const settings = qualitySettings[quality];
    this.config.mapSize = settings.mapSize;
    this.config.pcfSamples = settings.pcfSamples;

    // Update all shadow maps
    this.scene.traverse((obj) => {
      if (isShadowCapableLight(obj) && obj.castShadow) {
        obj.shadow.mapSize.set(settings.mapSize, settings.mapSize);
        obj.shadow.map?.dispose();
        obj.shadow.map = null;
      }
    });
  }

  dispose(): void {
    this.cascadeTargets.forEach(target => target.dispose());
    this.cascadeTargets = [];
    this.cascadeLights = [];
    this.cascadeCameras = [];
  }
}

// ============================================
// IBL (Image-Based Lighting) System
// ============================================

/**
 * Image-Based Lighting system for realistic reflections and ambient
 */
export class IBLSystem {
  private renderer: THREE.WebGLRenderer;
  private pmremGenerator: PMREMGenerator;
  private environmentMap: THREE.CubeTexture | THREE.Texture | null = null;
  private environmentIntensity: number = 1;
  private environmentRotation: number = 0;
  private scene: THREE.Scene | null = null;

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    this.pmremGenerator = new THREE.PMREMGenerator(renderer);
    this.pmremGenerator.compileEquirectangularShader();
  }

  /**
   * Load HDRI environment map
   */
  async loadHDRI(url: string): Promise<THREE.Texture> {
    return new Promise((resolve, reject) => {
      const loader = new THREE.TextureLoader();
      loader.load(
        url,
        (texture) => {
          texture.mapping = THREE.EquirectangularReflectionMapping;
          const envMap = this.pmremGenerator.fromEquirectangular(texture);
          this.environmentMap = envMap.texture;

          if (this.scene) {
            this.scene.environment = this.environmentMap;
          }

          texture.dispose();
          resolve(this.environmentMap!);
        },
        undefined,
        reject
      );
    });
  }

  /**
   * Load cube map environment
   */
  async loadCubeMap(urls: string[]): Promise<THREE.CubeTexture> {
    return new Promise((resolve, reject) => {
      const loader = new THREE.CubeTextureLoader();
      loader.load(
        urls,
        (cubeTexture) => {
          const envMap = this.pmremGenerator.fromCubemap(cubeTexture);
          this.environmentMap = envMap.texture;

          if (this.scene) {
            this.scene.environment = this.environmentMap;
          }

          cubeTexture.dispose();
          resolve(this.environmentMap as THREE.CubeTexture);
        },
        undefined,
        reject
      );
    });
  }

  /**
   * Generate environment map from scene
   */
  generateFromScene(scene: THREE.Scene, renderTarget?: THREE.WebGLRenderTarget): THREE.Texture {
    const envMap = this.pmremGenerator.fromScene(scene, 0.04);
    this.environmentMap = envMap.texture;
    return this.environmentMap;
  }

  /**
   * Set environment intensity
   */
  setIntensity(intensity: number): void {
    this.environmentIntensity = intensity;
    this.applyEnvironment();
  }

  /**
   * Set environment rotation
   */
  setRotation(rotation: number): void {
    this.environmentRotation = rotation;
    this.applyEnvironment();
  }

  /**
   * Apply environment to scene
   */
  applyToScene(scene: THREE.Scene): void {
    this.scene = scene;
    if (this.environmentMap) {
      scene.environment = this.environmentMap;
      scene.background = this.environmentMap;
    }
  }

  private applyEnvironment(): void {
    if (!this.scene) return;

    this.scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        if (mesh.material && 'envMapIntensity' in mesh.material) {
          (mesh.material as THREE.MeshStandardMaterial).envMapIntensity = this.environmentIntensity;
        }
      }
    });
  }

  /**
   * Enable/disable IBL
   */
  setEnabled(enabled: boolean): void {
    if (this.scene) {
      this.scene.environment = enabled ? this.environmentMap : null;
    }
  }

  dispose(): void {
    this.pmremGenerator.dispose();
    this.environmentMap?.dispose();
  }
}

// ============================================
// Light Probe System
// ============================================

/**
 * Light probe for baked ambient lighting
 */
export class LightProbeSystem {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private probes: Map<string, THREE.LightProbe> = new Map();
  private probeData: Map<string, LightProbeConfig> = new Map();

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
    this.renderer = renderer;
    this.scene = scene;
  }

  /**
   * Create a light probe at a position
   */
  createProbe(id: string, config: LightProbeConfig): THREE.LightProbe {
    const probe = new THREE.LightProbe();

    // Store configuration
    this.probeData.set(id, config);

    // Position the probe
    probe.position.copy(config.position);

    // Add to scene and map
    this.scene.add(probe);
    this.probes.set(id, probe);

    return probe;
  }

  /**
   * Generate spherical harmonics from environment
   */
  generateSH(probeId: string, environmentMap: THREE.Texture): void {
    const probe = this.probes.get(probeId);
    if (!probe) return;

    // Generate SH coefficients from environment map
    const sh = this.generateSphericalHarmonics(environmentMap);
    probe.sh.coefficients = sh;
  }

  private generateSphericalHarmonics(envMap: THREE.Texture): THREE.Vector3[] {
    // Simplified SH generation - in production use proper SH calculation
    const coefficients: THREE.Vector3[] = [];

    // L0, L1, L2 coefficients (9 coefficients total)
    for (let i = 0; i < 9; i++) {
      coefficients.push(new THREE.Vector3(0.5, 0.5, 0.5));
    }

    return coefficients;
  }

  /**
   * Automatic probe placement in scene
   */
  autoPlaceProbes(gridSize: number, height: number): void {
    // Get scene bounding box
    const bbox = new THREE.Box3().setFromObject(this.scene);
    const size = bbox.getSize(new THREE.Vector3());

    const probesX = Math.ceil(size.x / gridSize);
    const probesZ = Math.ceil(size.z / gridSize);

    for (let x = 0; x < probesX; x++) {
      for (let z = 0; z < probesZ; z++) {
        const position = new THREE.Vector3(
          bbox.min.x + x * gridSize + gridSize / 2,
          height,
          bbox.min.z + z * gridSize + gridSize / 2
        );

        const id = `probe_${x}_${z}`;
        this.createProbe(id, {
          position,
          radius: gridSize / 2,
          resolution: 32,
          updateMode: 'static',
        });
      }
    }
  }

  /**
   * Interpolate between probes based on position
   */
  interpolate(position: THREE.Vector3): THREE.LightProbe {
    // Find nearest probes
    const nearestProbes: { probe: THREE.LightProbe; distance: number }[] = [];

    this.probes.forEach((probe, id) => {
      const config = this.probeData.get(id);
      if (config) {
        const distance = position.distanceTo(config.position);
        if (distance < config.radius * 2) {
          nearestProbes.push({ probe, distance });
        }
      }
    });

    // Sort by distance
    nearestProbes.sort((a, b) => a.distance - b.distance);

    // Create interpolated probe
    const interpolatedProbe = new THREE.LightProbe();

    if (nearestProbes.length > 0) {
      // Weight by inverse distance
      let totalWeight = 0;
      const weights: number[] = [];

      nearestProbes.forEach(({ distance }) => {
        const weight = 1 / (distance + 0.001);
        weights.push(weight);
        totalWeight += weight;
      });

      // Normalize weights
      weights.forEach((w, i) => {
        weights[i] = w / totalWeight;
      });

      // Interpolate SH coefficients
      for (let c = 0; c < 9; c++) {
        interpolatedProbe.sh.coefficients[c] = new THREE.Vector3(0, 0, 0);

        nearestProbes.forEach(({ probe }, i) => {
          interpolatedProbe.sh.coefficients[c].add(
            probe.sh.coefficients[c].clone().multiplyScalar(weights[i])
          );
        });
      }
    }

    return interpolatedProbe;
  }

  /**
   * Remove a probe
   */
  removeProbe(id: string): void {
    const probe = this.probes.get(id);
    if (probe) {
      this.scene.remove(probe);
      this.probes.delete(id);
      this.probeData.delete(id);
    }
  }

  dispose(): void {
    this.probes.forEach((probe, id) => this.removeProbe(id));
  }
}

// ============================================
// Volumetric Lighting System
// ============================================

/**
 * Volumetric light data structure
 */
interface VolumetricLightData {
  light: THREE.Light;
  config: VolumetricLightConfig;
  volume: THREE.Mesh;
  material: THREE.ShaderMaterial;
}

/**
 * Volumetric lighting effects (god rays, light shafts)
 */
export class VolumetricLightSystem {
  private scene: THREE.Scene;
  private renderer: THREE.WebGLRenderer;
  private volumetricLights: Map<string, VolumetricLightData> = new Map();

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
    this.renderer = renderer;
    this.scene = scene;
  }

  /**
   * Create volumetric light effect
   */
  createVolumetricLight(
    light: THREE.Light,
    config: Partial<VolumetricLightConfig> = {}
  ): string {
    const id = `vol_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const fullConfig: VolumetricLightConfig = {
      enabled: true,
      density: 0.5,
      samples: 32,
      decay: 0.95,
      weight: 0.4,
      exposure: 0.2,
      color: new THREE.Color(1, 1, 1),
      ...config,
    };

    // Create volumetric geometry based on light type
    let geometry: THREE.BufferGeometry;

    if (light instanceof THREE.SpotLight) {
      geometry = new THREE.ConeGeometry(
        Math.tan(light.angle) * light.distance,
        light.distance,
        32,
        1,
        true
      );
      geometry.rotateX(Math.PI);
    } else if (light instanceof THREE.PointLight) {
      geometry = new THREE.SphereGeometry(light.distance, 32, 32);
    } else {
      geometry = new THREE.BoxGeometry(100, 100, 100);
    }

    // Create volumetric shader material
    const material = this.createVolumetricMaterial(fullConfig);

    const volume = new THREE.Mesh(geometry, material);
    volume.position.copy(light.position);

    if (light instanceof THREE.SpotLight) {
      volume.lookAt(light.target.position);
    }

    this.scene.add(volume);
    this.volumetricLights.set(id, { light, config: fullConfig, volume, material });

    return id;
  }

  private createVolumetricMaterial(config: VolumetricLightConfig): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: {
        uDensity: { value: config.density },
        uDecay: { value: config.decay },
        uWeight: { value: config.weight },
        uExposure: { value: config.exposure },
        uLightColor: { value: config.color },
        uSamples: { value: config.samples },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: `
        uniform float uDensity;
        uniform float uDecay;
        uniform float uWeight;
        uniform float uExposure;
        uniform vec3 uLightColor;
        uniform int uSamples;
        
        varying vec3 vWorldPosition;
        
        void main() {
          vec3 lightDir = normalize(vWorldPosition - cameraPosition);
          float density = uDensity;
          
          vec3 color = vec3(0.0);
          float illuminationDecay = 1.0;
          
          for (int i = 0; i < 32; i++) {
            if (i >= uSamples) break;
            
            vec3 samplePos = vWorldPosition - lightDir * float(i) * density;
            float sampleIntensity = 1.0 / (1.0 + length(samplePos - cameraPosition) * 0.1);
            
            sampleIntensity *= illuminationDecay;
            color += uLightColor * sampleIntensity;
            
            illuminationDecay *= uDecay;
          }
          
          color *= uWeight * uExposure;
          
          gl_FragColor = vec4(color, 0.5);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      depthWrite: false,
    });
  }

  /**
   * Update volumetric light
   */
  updateVolumetricLight(id: string, config: Partial<VolumetricLightConfig>): void {
    const data = this.volumetricLights.get(id);
    if (!data) return;

    data.config = { ...data.config, ...config };

    data.material.uniforms.uDensity.value = data.config.density;
    data.material.uniforms.uDecay.value = data.config.decay;
    data.material.uniforms.uWeight.value = data.config.weight;
    data.material.uniforms.uExposure.value = data.config.exposure;
    data.material.uniforms.uLightColor.value = data.config.color;
    data.material.uniforms.uSamples.value = data.config.samples;
  }

  /**
   * Enable/disable volumetric light
   */
  setEnabled(id: string, enabled: boolean): void {
    const data = this.volumetricLights.get(id);
    if (data) {
      data.volume.visible = enabled;
    }
  }

  /**
   * Integrate with fog
   */
  integrateFog(fog: THREE.Fog | THREE.FogExp2): void {
    this.volumetricLights.forEach((data) => {
      if (fog instanceof THREE.FogExp2) {
        data.material.uniforms.uDensity.value *= fog.density * 10;
      } else if (fog instanceof THREE.Fog) {
        const density = 1 / (fog.far - fog.near);
        data.material.uniforms.uDensity.value *= density;
      }
    });
  }

  /**
   * Remove volumetric light
   */
  removeVolumetricLight(id: string): void {
    const data = this.volumetricLights.get(id);
    if (data) {
      this.scene.remove(data.volume);
      data.volume.geometry.dispose();
      data.material.dispose();
      this.volumetricLights.delete(id);
    }
  }

  dispose(): void {
    this.volumetricLights.forEach((_, id) => this.removeVolumetricLight(id));
  }
}

// ============================================
// Light Presets
// ============================================

/**
 * Pre-configured lighting setups
 */
export const LightPresets: Record<string, LightConfig[]> = {
  day: [
    {
      type: LightType.DIRECTIONAL,
      color: new THREE.Color(1, 0.95, 0.9),
      intensity: 1.5,
      position: new THREE.Vector3(50, 100, 50),
      rotation: new THREE.Euler(-Math.PI / 4, Math.PI / 4, 0),
      castShadows: true,
      shadowMapSize: 2048,
      shadowBias: -0.0001,
      shadowRadius: 2,
      shadowDistance: 200,
      cascades: 4,
    },
    {
      type: LightType.AMBIENT,
      color: new THREE.Color(0.4, 0.6, 0.8),
      intensity: 0.4,
      position: new THREE.Vector3(0, 0, 0),
      rotation: new THREE.Euler(0, 0, 0),
      castShadows: false,
      shadowMapSize: 1024,
      shadowBias: 0,
      shadowRadius: 0,
      shadowDistance: 0,
    },
    {
      type: LightType.HEMISPHERE,
      color: new THREE.Color(0.6, 0.8, 1),
      skyColor: new THREE.Color(0.6, 0.8, 1),
      groundColor: new THREE.Color(0.3, 0.25, 0.2),
      intensity: 0.5,
      position: new THREE.Vector3(0, 0, 0),
      rotation: new THREE.Euler(0, 0, 0),
      castShadows: false,
      shadowMapSize: 1024,
      shadowBias: 0,
      shadowRadius: 0,
      shadowDistance: 0,
    },
  ],

  sunset: [
    {
      type: LightType.DIRECTIONAL,
      color: new THREE.Color(1, 0.6, 0.3),
      intensity: 1.2,
      position: new THREE.Vector3(100, 20, 50),
      rotation: new THREE.Euler(-Math.PI / 6, Math.PI / 3, 0),
      castShadows: true,
      shadowMapSize: 2048,
      shadowBias: -0.0001,
      shadowRadius: 3,
      shadowDistance: 200,
      cascades: 4,
    },
    {
      type: LightType.AMBIENT,
      color: new THREE.Color(0.3, 0.2, 0.4),
      intensity: 0.3,
      position: new THREE.Vector3(0, 0, 0),
      rotation: new THREE.Euler(0, 0, 0),
      castShadows: false,
      shadowMapSize: 1024,
      shadowBias: 0,
      shadowRadius: 0,
      shadowDistance: 0,
    },
    {
      type: LightType.HEMISPHERE,
      color: new THREE.Color(1, 0.5, 0.3),
      skyColor: new THREE.Color(1, 0.5, 0.3),
      groundColor: new THREE.Color(0.2, 0.15, 0.1),
      intensity: 0.6,
      position: new THREE.Vector3(0, 0, 0),
      rotation: new THREE.Euler(0, 0, 0),
      castShadows: false,
      shadowMapSize: 1024,
      shadowBias: 0,
      shadowRadius: 0,
      shadowDistance: 0,
    },
  ],

  night: [
    {
      type: LightType.DIRECTIONAL,
      color: new THREE.Color(0.2, 0.3, 0.5),
      intensity: 0.2,
      position: new THREE.Vector3(-50, 80, -50),
      rotation: new THREE.Euler(-Math.PI / 3, 0, 0),
      castShadows: true,
      shadowMapSize: 1024,
      shadowBias: -0.0001,
      shadowRadius: 1,
      shadowDistance: 100,
      cascades: 2,
    },
    {
      type: LightType.AMBIENT,
      color: new THREE.Color(0.1, 0.1, 0.2),
      intensity: 0.3,
      position: new THREE.Vector3(0, 0, 0),
      rotation: new THREE.Euler(0, 0, 0),
      castShadows: false,
      shadowMapSize: 1024,
      shadowBias: 0,
      shadowRadius: 0,
      shadowDistance: 0,
    },
    {
      type: LightType.HEMISPHERE,
      color: new THREE.Color(0.1, 0.1, 0.3),
      skyColor: new THREE.Color(0.1, 0.1, 0.3),
      groundColor: new THREE.Color(0.05, 0.05, 0.1),
      intensity: 0.2,
      position: new THREE.Vector3(0, 0, 0),
      rotation: new THREE.Euler(0, 0, 0),
      castShadows: false,
      shadowMapSize: 1024,
      shadowBias: 0,
      shadowRadius: 0,
      shadowDistance: 0,
    },
  ],

  indoor: [
    {
      type: LightType.POINT,
      color: new THREE.Color(1, 0.9, 0.8),
      intensity: 1.5,
      position: new THREE.Vector3(0, 3, 0),
      rotation: new THREE.Euler(0, 0, 0),
      castShadows: true,
      shadowMapSize: 1024,
      shadowBias: -0.0001,
      shadowRadius: 2,
      shadowDistance: 20,
      range: 15,
      decay: 2,
    },
    {
      type: LightType.AMBIENT,
      color: new THREE.Color(0.3, 0.25, 0.2),
      intensity: 0.4,
      position: new THREE.Vector3(0, 0, 0),
      rotation: new THREE.Euler(0, 0, 0),
      castShadows: false,
      shadowMapSize: 1024,
      shadowBias: 0,
      shadowRadius: 0,
      shadowDistance: 0,
    },
  ],

  studio: [
    {
      type: LightType.DIRECTIONAL,
      color: new THREE.Color(1, 1, 1),
      intensity: 1.0,
      position: new THREE.Vector3(5, 10, 5),
      rotation: new THREE.Euler(-Math.PI / 4, Math.PI / 4, 0),
      castShadows: true,
      shadowMapSize: 4096,
      shadowBias: -0.00001,
      shadowRadius: 0,
      shadowDistance: 50,
      cascades: 1,
    },
    {
      type: LightType.DIRECTIONAL,
      color: new THREE.Color(0.8, 0.9, 1),
      intensity: 0.5,
      position: new THREE.Vector3(-5, 5, -5),
      rotation: new THREE.Euler(-Math.PI / 6, -Math.PI / 4, 0),
      castShadows: false,
      shadowMapSize: 1024,
      shadowBias: 0,
      shadowRadius: 0,
      shadowDistance: 0,
    },
    {
      type: LightType.AMBIENT,
      color: new THREE.Color(0.5, 0.5, 0.5),
      intensity: 0.6,
      position: new THREE.Vector3(0, 0, 0),
      rotation: new THREE.Euler(0, 0, 0),
      castShadows: false,
      shadowMapSize: 1024,
      shadowBias: 0,
      shadowRadius: 0,
      shadowDistance: 0,
    },
  ],

  neon: [
    {
      type: LightType.AMBIENT,
      color: new THREE.Color(0.05, 0.05, 0.1),
      intensity: 0.2,
      position: new THREE.Vector3(0, 0, 0),
      rotation: new THREE.Euler(0, 0, 0),
      castShadows: false,
      shadowMapSize: 1024,
      shadowBias: 0,
      shadowRadius: 0,
      shadowDistance: 0,
    },
    {
      type: LightType.POINT,
      color: new THREE.Color(1, 0, 1),
      intensity: 2,
      position: new THREE.Vector3(-5, 2, 0),
      rotation: new THREE.Euler(0, 0, 0),
      castShadows: false,
      shadowMapSize: 1024,
      shadowBias: 0,
      shadowRadius: 0,
      shadowDistance: 0,
      range: 15,
      decay: 1.5,
    },
    {
      type: LightType.POINT,
      color: new THREE.Color(0, 1, 1),
      intensity: 2,
      position: new THREE.Vector3(5, 2, 0),
      rotation: new THREE.Euler(0, 0, 0),
      castShadows: false,
      shadowMapSize: 1024,
      shadowBias: 0,
      shadowRadius: 0,
      shadowDistance: 0,
      range: 15,
      decay: 1.5,
    },
  ],

  foggy: [
    {
      type: LightType.DIRECTIONAL,
      color: new THREE.Color(0.8, 0.85, 0.9),
      intensity: 0.5,
      position: new THREE.Vector3(0, 50, 0),
      rotation: new THREE.Euler(-Math.PI / 2, 0, 0),
      castShadows: true,
      shadowMapSize: 2048,
      shadowBias: -0.0001,
      shadowRadius: 4,
      shadowDistance: 150,
      cascades: 2,
      volumetricEnabled: true,
      volumetricDensity: 0.8,
      volumetricSamples: 64,
    },
    {
      type: LightType.AMBIENT,
      color: new THREE.Color(0.5, 0.55, 0.6),
      intensity: 0.6,
      position: new THREE.Vector3(0, 0, 0),
      rotation: new THREE.Euler(0, 0, 0),
      castShadows: false,
      shadowMapSize: 1024,
      shadowBias: 0,
      shadowRadius: 0,
      shadowDistance: 0,
    },
  ],
};

// ============================================
// Main Lighting System
// ============================================

/**
 * Main Lighting System - Complete dynamic lighting management
 */
export class LightingSystem {
  private scene: THREE.Scene | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private lights: Map<string, THREE.Light> = new Map();
  private lightConfigs: Map<string, LightConfig> = new Map();

  private shadowSystem: ShadowSystem | null = null;
  private iblSystem: IBLSystem | null = null;
  private lightProbeSystem: LightProbeSystem | null = null;
  private volumetricSystem: VolumetricLightSystem | null = null;

  private ambientLight: THREE.AmbientLight | null = null;
  private hemisphereLight: THREE.HemisphereLight | null = null;
  private currentPreset: string | null = null;

  private time: number = 0;

  constructor() {}

  /**
   * Initialize the lighting system
   */
  initialize(scene: THREE.Scene, renderer: THREE.WebGLRenderer): void {
    this.scene = scene;
    this.renderer = renderer;

    // Initialize subsystems
    this.shadowSystem = new ShadowSystem(renderer, scene);
    this.iblSystem = new IBLSystem(renderer);
    this.lightProbeSystem = new LightProbeSystem(renderer, scene);
    this.volumetricSystem = new VolumetricLightSystem(renderer, scene);

    // Configure renderer for shadows
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
  }

  /**
   * Create a light from configuration
   */
  createLight(config: Partial<LightConfig>): THREE.Light {
    const fullConfig = this.mergeConfig(config);

    let light: THREE.Light;

    switch (fullConfig.type) {
      case LightType.DIRECTIONAL:
        light = this.createDirectionalLight(fullConfig);
        break;
      case LightType.POINT:
        light = this.createPointLight(fullConfig);
        break;
      case LightType.SPOT:
        light = this.createSpotLight(fullConfig);
        break;
      case LightType.AREA:
        light = this.createAreaLight(fullConfig);
        break;
      case LightType.AMBIENT:
        light = this.createAmbientLight(fullConfig);
        break;
      case LightType.HEMISPHERE:
        light = this.createHemisphereLight(fullConfig);
        break;
      case LightType.VOLUMETRIC:
        light = this.createVolumetricLight(fullConfig);
        break;
      default:
        light = new THREE.PointLight(fullConfig.color, fullConfig.intensity);
    }

    // Apply common properties
    light.name = fullConfig.name || `light_${Date.now()}`;

    // Store light
    this.lights.set(light.name, light);
    this.lightConfigs.set(light.name, fullConfig);

    // Add to scene
    if (this.scene) {
      this.scene.add(light);
    }

    // Setup volumetric if enabled
    if (fullConfig.volumetricEnabled && this.volumetricSystem) {
      this.volumetricSystem.createVolumetricLight(light, {
        enabled: true,
        density: fullConfig.volumetricDensity || 0.5,
        samples: fullConfig.volumetricSamples || 32,
        color: fullConfig.volumetricColor || fullConfig.color,
      });
    }

    return light;
  }

  private mergeConfig(config: Partial<LightConfig>): LightConfig {
    return {
      ...DEFAULT_LIGHT_CONFIG,
      ...config,
      color: config.color || new THREE.Color(1, 1, 1),
      position: config.position || new THREE.Vector3(0, 0, 0),
      rotation: config.rotation || new THREE.Euler(0, 0, 0),
    } as LightConfig;
  }

  private createDirectionalLight(config: LightConfig): THREE.DirectionalLight {
    const light = new THREE.DirectionalLight(config.color, config.intensity);
    light.position.copy(config.position);

    if (config.castShadows) {
      light.castShadow = true;
      light.shadow.mapSize.set(config.shadowMapSize, config.shadowMapSize);
      light.shadow.bias = config.shadowBias;
      light.shadow.radius = config.shadowRadius;

      // Configure shadow camera
      light.shadow.camera.left = -config.shadowDistance;
      light.shadow.camera.right = config.shadowDistance;
      light.shadow.camera.top = config.shadowDistance;
      light.shadow.camera.bottom = -config.shadowDistance;
      light.shadow.camera.near = 0.1;
      light.shadow.camera.far = config.shadowDistance * 2;

      // Setup CSM if cascades > 1
      if (config.cascades && config.cascades > 1 && this.shadowSystem) {
        this.shadowSystem.setupCSM(light, config.cascades);
      }
    }

    return light;
  }

  private createPointLight(config: LightConfig): THREE.PointLight {
    const light = new THREE.PointLight(
      config.color,
      config.intensity,
      config.range,
      config.decay
    );
    light.position.copy(config.position);

    if (config.castShadows) {
      light.castShadow = true;
      light.shadow.mapSize.set(config.shadowMapSize, config.shadowMapSize);
      light.shadow.bias = config.shadowBias;
      light.shadow.radius = config.shadowRadius;
      light.shadow.camera.near = 0.1;
      light.shadow.camera.far = config.range || 100;
    }

    return light;
  }

  private createSpotLight(config: LightConfig): THREE.SpotLight {
    const light = new THREE.SpotLight(
      config.color,
      config.intensity,
      config.range,
      config.angle,
      config.penumbra,
      config.decay
    );
    light.position.copy(config.position);
    light.rotation.copy(config.rotation);

    if (config.castShadows) {
      light.castShadow = true;
      light.shadow.mapSize.set(config.shadowMapSize, config.shadowMapSize);
      light.shadow.bias = config.shadowBias;
      light.shadow.radius = config.shadowRadius;
      light.shadow.camera.near = 0.1;
      light.shadow.camera.far = config.range || 100;
    }

    // Create target
    const targetPosition = config.position.clone();
    const direction = new THREE.Vector3(0, 0, -1);
    direction.applyEuler(config.rotation);
    targetPosition.add(direction.multiplyScalar(10));
    light.target.position.copy(targetPosition);

    return light;
  }

  private createAreaLight(config: LightConfig): THREE.RectAreaLight {
    const light = new THREE.RectAreaLight(
      config.color,
      config.intensity,
      config.width || 5,
      config.height || 5
    );
    light.position.copy(config.position);
    light.rotation.copy(config.rotation);

    return light;
  }

  private createAmbientLight(config: LightConfig): THREE.AmbientLight {
    const light = new THREE.AmbientLight(config.color, config.intensity);
    this.ambientLight = light;
    return light;
  }

  private createHemisphereLight(config: LightConfig): THREE.HemisphereLight {
    const light = new THREE.HemisphereLight(
      config.skyColor || config.color,
      config.groundColor || new THREE.Color(0.3, 0.25, 0.2),
      config.intensity
    );
    this.hemisphereLight = light;
    return light;
  }

  private createVolumetricLight(config: LightConfig): THREE.PointLight {
    const light = new THREE.PointLight(
      config.color,
      config.intensity,
      config.range
    );
    light.position.copy(config.position);

    return light;
  }

  /**
   * Remove a light from the scene
   */
  removeLight(light: THREE.Light): void {
    const name = light.name;

    if (this.scene) {
      this.scene.remove(light);
    }

    this.lights.delete(name);
    this.lightConfigs.delete(name);

    // Dispose shadow map
    if (isShadowCapableLight(light) && light.castShadow) {
      light.shadow.map?.dispose();
    }

    light.dispose();
  }

  /**
   * Update light configuration
   */
  updateLight(light: THREE.Light, config: Partial<LightConfig>): void {
    const name = light.name;
    const existingConfig = this.lightConfigs.get(name);

    if (!existingConfig) return;

    const newConfig = { ...existingConfig, ...config };
    this.lightConfigs.set(name, newConfig);

    // Update properties
    if (config.color) light.color.copy(config.color);
    if (config.intensity !== undefined) light.intensity = config.intensity;
    if (config.position) light.position.copy(config.position);

    // Update rotation for spot lights
    if (config.rotation && light instanceof THREE.SpotLight) {
      light.rotation.copy(config.rotation);
    }

    // Update range for point/spot lights
    if (config.range !== undefined) {
      if (light instanceof THREE.PointLight || light instanceof THREE.SpotLight) {
        light.distance = config.range;
      }
    }

    // Update shadows
    if (config.castShadows !== undefined && 'castShadow' in light) {
      light.castShadow = config.castShadows;
    }

    if (config.shadowMapSize !== undefined && isShadowCapableLight(light) && light.castShadow) {
      light.shadow.mapSize.set(config.shadowMapSize, config.shadowMapSize);
      light.shadow.map?.dispose();
      light.shadow.map = null;
    }
  }

  /**
   * Set environment map from HDRI
   */
  async setEnvironmentMap(hdriUrl: string): Promise<void> {
    if (!this.iblSystem || !this.scene) return;

    try {
      const envMap = await this.iblSystem.loadHDRI(hdriUrl);
      this.iblSystem.applyToScene(this.scene);
    } catch (error) {
      console.error('Failed to load HDRI:', error);
    }
  }

  /**
   * Set ambient light color and intensity
   */
  setAmbientLight(color: THREE.Color, intensity: number): void {
    if (this.ambientLight) {
      this.ambientLight.color.copy(color);
      this.ambientLight.intensity = intensity;
    } else {
      this.createLight({
        type: LightType.AMBIENT,
        color,
        intensity,
        position: new THREE.Vector3(0, 0, 0),
        rotation: new THREE.Euler(0, 0, 0),
        castShadows: false,
        shadowMapSize: 1024,
        shadowBias: 0,
        shadowRadius: 0,
        shadowDistance: 0,
      });
    }
  }

  /**
   * Enable/disable Image-Based Lighting
   */
  enableIBL(enabled: boolean): void {
    if (this.iblSystem) {
      this.iblSystem.setEnabled(enabled);
    }
  }

  /**
   * Bake approximate lightmaps directly in-engine and apply them as lightMap textures.
   */
  async bakeLightmaps(scene: THREE.Scene): Promise<void> {
    const lights = collectSceneLights(scene);
    const baked: Array<{ mesh: string; textureSize: number }> = [];
    let generatedUv2 = 0;

    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || !(object.geometry instanceof THREE.BufferGeometry)) {
        return;
      }

      const hadUv2 = Boolean(object.geometry.getAttribute('uv2'));
      const createdUv2 = !hadUv2 && ensureUv2(object.geometry);
      if (!object.geometry.getAttribute('uv2')) {
        return;
      }
      if (createdUv2) generatedUv2 += 1;

      const textureSize = 32;
      const data = new Uint8Array(textureSize * textureSize * 4);
      const center = computeMeshCenter(object);
      const box = new THREE.Box3().setFromObject(object);
      const size = box.getSize(new THREE.Vector3());
      const depthJitter = Math.max(0.1, size.z || size.x || 0.25);

      for (let y = 0; y < textureSize; y++) {
        for (let x = 0; x < textureSize; x++) {
          const u = x / Math.max(1, textureSize - 1);
          const v = y / Math.max(1, textureSize - 1);
          const samplePoint = new THREE.Vector3(
            THREE.MathUtils.lerp(box.min.x, box.max.x, u),
            THREE.MathUtils.lerp(box.max.y, box.min.y, v),
            center.z + (u - 0.5) * depthJitter * 0.35
          );
          const normal = pseudoNormalFromUv(u, v);
          const lighting = evaluateLightingAtPoint(samplePoint, normal, lights);
          const edgeOcclusion = 0.74 + 0.26 * (1 - Math.abs(u - 0.5) * 2) * (1 - Math.abs(v - 0.5) * 2);
          const pixelIndex = (y * textureSize + x) * 4;
          data[pixelIndex] = Math.round(THREE.MathUtils.clamp(lighting.r * edgeOcclusion * 255, 0, 255));
          data[pixelIndex + 1] = Math.round(THREE.MathUtils.clamp(lighting.g * edgeOcclusion * 255, 0, 255));
          data[pixelIndex + 2] = Math.round(THREE.MathUtils.clamp(lighting.b * edgeOcclusion * 255, 0, 255));
          data[pixelIndex + 3] = 255;
        }
      }

      const lightMap = new THREE.DataTexture(data, textureSize, textureSize, THREE.RGBAFormat);
      lightMap.needsUpdate = true;
      lightMap.colorSpace = THREE.SRGBColorSpace;
      lightMap.flipY = false;

      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => {
        if (!material || !isLightMapCapableMaterial(material)) return;
        if (material.lightMap && material.lightMap instanceof THREE.Texture) {
          material.lightMap.dispose();
        }
        material.lightMap = lightMap;
        material.lightMapIntensity = 1;
        material.needsUpdate = true;
      });

      object.userData.bakedLightmap = lightMap;
      baked.push({ mesh: object.name || object.uuid, textureSize });
    });

    scene.userData.lightmapBakeSummary = {
      bakedMeshes: baked.length,
      generatedUv2,
      lights: lights.length,
      entries: baked,
      generatedAt: new Date().toISOString(),
    };
  }

  clearBakedLightmaps(scene: THREE.Scene): void {
    const disposedTextures = new Set<THREE.Texture>();

    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) {
        return;
      }

      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => {
        if (!material || !isLightMapCapableMaterial(material)) return;
        if (material.lightMap && !disposedTextures.has(material.lightMap)) {
          disposedTextures.add(material.lightMap);
          material.lightMap.dispose();
        }
        material.lightMap = null;
        material.lightMapIntensity = 1;
        material.needsUpdate = true;
      });

      delete object.userData.bakedLightmap;
    });

    delete scene.userData.lightmapBakeSummary;
  }

  /**
   * Create a light probe at a position
   */
  createLightProbe(position: THREE.Vector3): THREE.LightProbe {
    if (!this.lightProbeSystem) {
      throw new Error('LightingSystem not initialized');
    }

    return this.lightProbeSystem.createProbe(`probe_${Date.now()}`, {
      position,
      radius: 10,
      resolution: 32,
      updateMode: 'static',
    });
  }

  /**
   * Apply a lighting preset
   */
  applyPreset(presetName: keyof typeof LightPresets): void {
    const preset = LightPresets[presetName];
    if (!preset) {
      console.warn(`Lighting preset "${presetName}" not found`);
      return;
    }

    // Clear existing lights
    this.clearAllLights();

    // Create lights from preset
    preset.forEach((config) => {
      this.createLight(config);
    });

    this.currentPreset = presetName;
  }

  /**
   * Clear all lights
   */
  clearAllLights(): void {
    this.lights.forEach((light) => {
      if (this.scene) {
        this.scene.remove(light);
      }
      if (isShadowCapableLight(light) && light.castShadow) {
        light.shadow.map?.dispose();
      }
      light.dispose();
    });

    this.lights.clear();
    this.lightConfigs.clear();
    this.ambientLight = null;
    this.hemisphereLight = null;
  }

  /**
   * Get all lights
   */
  getLights(): THREE.Light[] {
    return Array.from(this.lights.values());
  }

  /**
   * Get light by name
   */
  getLight(name: string): THREE.Light | undefined {
    return this.lights.get(name);
  }

  /**
   * Update lighting system (call in render loop)
   */
  update(deltaTime: number): void {
    this.time += deltaTime;

    // Update animated lights
    this.lights.forEach((light, name) => {
      const config = this.lightConfigs.get(name);
      if (!config) return;

      // Animate volumetric lights
      if (config.volumetricEnabled && config.volumetricDensity) {
        // Subtle flickering effect
        const flicker = Math.sin(this.time * 5) * 0.1 + 1;
        light.intensity = config.intensity * flicker;
      }
    });

    // Update shadow system
    if (this.shadowSystem && this.scene) {
      // Update CSM if active
      // this.shadowSystem.updateCSM(camera);
    }
  }

  /**
   * Get current preset name
   */
  getCurrentPreset(): string | null {
    return this.currentPreset;
  }

  /**
   * Set shadow quality
   */
  setShadowQuality(quality: ShadowQuality): void {
    if (this.shadowSystem) {
      this.shadowSystem.setQuality(quality);
    }
  }

  /**
   * Set IBL intensity
   */
  setIBLIntensity(intensity: number): void {
    if (this.iblSystem) {
      this.iblSystem.setIntensity(intensity);
    }
  }

  /**
   * Set fog for volumetric integration
   */
  setFog(fog: THREE.Fog | THREE.FogExp2 | null): void {
    if (this.scene) {
      this.scene.fog = fog;

      if (fog && this.volumetricSystem) {
        this.volumetricSystem.integrateFog(fog);
      }
    }
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.clearAllLights();

    if (this.shadowSystem) {
      this.shadowSystem.dispose();
      this.shadowSystem = null;
    }

    if (this.iblSystem) {
      this.iblSystem.dispose();
      this.iblSystem = null;
    }

    if (this.lightProbeSystem) {
      this.lightProbeSystem.dispose();
      this.lightProbeSystem = null;
    }

    if (this.volumetricSystem) {
      this.volumetricSystem.dispose();
      this.volumetricSystem = null;
    }

    this.scene = null;
    this.renderer = null;
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a lighting system instance
 */
export function createLightingSystem(): LightingSystem {
  return new LightingSystem();
}

/**
 * Create a light from a preset
 */
export function createLightFromPreset(
  presetName: keyof typeof LightPresets,
  system: LightingSystem
): THREE.Light[] {
  const preset = LightPresets[presetName];
  return preset.map((config) => system.createLight(config));
}
