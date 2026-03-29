// ============================================
// PBR Material System
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// Complete Physically Based Rendering Material System
// ============================================

import * as THREE from 'three';

// ============================================
// Enums and Types
// ============================================

/**
 * Material type enumeration for different rendering behaviors
 */
export enum MaterialType {
  PBR = 'PBR',
  UNLIT = 'UNLIT',
  CUSTOM = 'CUSTOM',
  PARTICLE = 'PARTICLE',
  TERRAIN = 'TERRAIN',
  SKY = 'SKY',
  WATER = 'WATER',
  FOLIAGE = 'FOLIAGE',
}

/**
 * Render side options for materials
 */
export type MaterialSide = 'front' | 'back' | 'double';

/**
 * Texture encoding options
 */
export type TextureEncoding = 'srgb' | 'linear' | 'srgb-linear' | 'display-p3';

// ============================================
// Configuration Interfaces
// ============================================

/**
 * Complete PBR Material configuration interface
 */
export interface PBRMaterialConfig {
  // Base Properties
  albedo: THREE.Color;
  albedoMap?: THREE.Texture;

  // PBR Core Properties
  metallic: number;
  metallicMap?: THREE.Texture;
  roughness: number;
  roughnessMap?: THREE.Texture;

  // Normal Mapping
  normalMap?: THREE.Texture;
  normalScale: number;

  // Ambient Occlusion
  aoMap?: THREE.Texture;
  aoStrength: number;

  // Emissive Properties
  emissive: THREE.Color;
  emissiveMap?: THREE.Texture;
  emissiveIntensity: number;

  // Height/Parallax Mapping
  heightMap?: THREE.Texture;
  heightScale: number;
  parallaxEnabled: boolean;

  // Transparency
  alpha: number;
  alphaMap?: THREE.Texture;
  alphaCutoff: number;
  transparent: boolean;
  transmission: number;

  // Subsurface Scattering
  subsurfaceColor: THREE.Color;
  subsurfaceStrength: number;
  subsurfaceRadius: THREE.Vector3;

  // Advanced PBR
  anisotropy: number;
  anisotropyRotation: number;
  clearcoat: number;
  clearcoatRoughness: number;
  sheenColor: THREE.Color;
  sheenRoughness: number;

  // Rendering Options
  side: MaterialSide;
  renderQueue: number;
  castShadows: boolean;
  receiveShadows: boolean;
}

/**
 * Texture loading options
 */
export interface TextureLoadOptions {
  repeat?: THREE.Vector2;
  offset?: THREE.Vector2;
  generateMipmaps?: boolean;
  anisotropy?: number;
  encoding?: TextureEncoding;
  flipY?: boolean;
  wrapS?: THREE.Wrapping;
  wrapT?: THREE.Wrapping;
  minFilter?: THREE.MinificationTextureFilter;
  magFilter?: THREE.MagnificationTextureFilter;
}

/**
 * Material preset definition
 */
export interface MaterialPreset {
  name: string;
  type: MaterialType;
  config: Partial<PBRMaterialConfig>;
  description: string;
  category: string;
}

/**
 * Material instance for instancing system
 */
export interface MaterialInstance {
  id: string;
  baseMaterial: THREE.Material;
  overrides: Map<string, unknown>;
  properties: Record<string, unknown>;
}

/**
 * Shader configuration for custom materials
 */
export interface CustomShaderConfig {
  vertexShader: string;
  fragmentShader: string;
  uniforms: Record<string, THREE.IUniform>;
  side?: MaterialSide;
  transparent?: boolean;
  depthWrite?: boolean;
  blending?: THREE.Blending;
}

// ============================================
// Default Configuration
// ============================================

/**
 * Default PBR material configuration
 */
export const DEFAULT_PBR_CONFIG: PBRMaterialConfig = {
  // Base
  albedo: new THREE.Color(0x888888),
  
  // PBR Core
  metallic: 0.0,
  roughness: 0.5,
  
  // Normals
  normalScale: 1.0,
  
  // AO
  aoStrength: 1.0,
  
  // Emissive
  emissive: new THREE.Color(0x000000),
  emissiveIntensity: 0.0,
  
  // Height
  heightScale: 0.1,
  parallaxEnabled: false,
  
  // Transparency
  alpha: 1.0,
  alphaCutoff: 0.5,
  transparent: false,
  transmission: 0.0,
  
  // Subsurface
  subsurfaceColor: new THREE.Color(0xff0000),
  subsurfaceStrength: 0.0,
  subsurfaceRadius: new THREE.Vector3(1, 1, 1),
  
  // Advanced
  anisotropy: 0.0,
  anisotropyRotation: 0.0,
  clearcoat: 0.0,
  clearcoatRoughness: 0.0,
  sheenColor: new THREE.Color(0x000000),
  sheenRoughness: 0.0,
  
  // Rendering
  side: 'front',
  renderQueue: 2000,
  castShadows: true,
  receiveShadows: true,
};

// ============================================
// Material Presets Definition
// ============================================

/**
 * Built-in material presets for common materials
 */
export const MATERIAL_PRESETS: MaterialPreset[] = [
  {
    name: 'default',
    type: MaterialType.PBR,
    config: {
      albedo: new THREE.Color(0x888888),
      metallic: 0.0,
      roughness: 0.5,
    },
    description: 'Default neutral PBR material',
    category: 'basic',
  },
  {
    name: 'metal',
    type: MaterialType.PBR,
    config: {
      albedo: new THREE.Color(0xaaaaaa),
      metallic: 1.0,
      roughness: 0.2,
    },
    description: 'Polished metal surface',
    category: 'basic',
  },
  {
    name: 'plastic',
    type: MaterialType.PBR,
    config: {
      albedo: new THREE.Color(0xff6b6b),
      metallic: 0.0,
      roughness: 0.4,
    },
    description: 'Plastic material',
    category: 'basic',
  },
  {
    name: 'glass',
    type: MaterialType.PBR,
    config: {
      albedo: new THREE.Color(0xffffff),
      metallic: 0.0,
      roughness: 0.0,
      transmission: 0.95,
      transparent: true,
      alpha: 0.1,
    },
    description: 'Transparent glass material',
    category: 'transparent',
  },
  {
    name: 'emissive',
    type: MaterialType.PBR,
    config: {
      albedo: new THREE.Color(0xff6600),
      emissive: new THREE.Color(0xff6600),
      emissiveIntensity: 2.0,
    },
    description: 'Self-illuminated material',
    category: 'effects',
  },
  {
    name: 'wood',
    type: MaterialType.PBR,
    config: {
      albedo: new THREE.Color(0x8b4513),
      metallic: 0.0,
      roughness: 0.8,
      normalScale: 0.5,
    },
    description: 'Wooden surface',
    category: 'organic',
  },
  {
    name: 'concrete',
    type: MaterialType.PBR,
    config: {
      albedo: new THREE.Color(0x808080),
      metallic: 0.0,
      roughness: 0.9,
      aoStrength: 0.8,
    },
    description: 'Concrete surface',
    category: 'construction',
  },
  {
    name: 'fabric',
    type: MaterialType.PBR,
    config: {
      albedo: new THREE.Color(0x4a4a8a),
      metallic: 0.0,
      roughness: 0.95,
      sheenColor: new THREE.Color(0x6666aa),
      sheenRoughness: 0.8,
    },
    description: 'Fabric/cloth material',
    category: 'organic',
  },
  {
    name: 'skin',
    type: MaterialType.PBR,
    config: {
      albedo: new THREE.Color(0xffdbac),
      metallic: 0.0,
      roughness: 0.6,
      subsurfaceColor: new THREE.Color(0xff5533),
      subsurfaceStrength: 0.5,
      subsurfaceRadius: new THREE.Vector3(1, 0.5, 0.3),
    },
    description: 'Human skin material with SSS',
    category: 'organic',
  },
  {
    name: 'foliage',
    type: MaterialType.FOLIAGE,
    config: {
      albedo: new THREE.Color(0x228b22),
      metallic: 0.0,
      roughness: 0.8,
      side: 'double',
      alphaCutoff: 0.5,
    },
    description: 'Plant/foliage material',
    category: 'organic',
  },
  {
    name: 'water',
    type: MaterialType.WATER,
    config: {
      albedo: new THREE.Color(0x0066aa),
      metallic: 0.0,
      roughness: 0.1,
      transmission: 0.6,
      transparent: true,
      alpha: 0.7,
    },
    description: 'Water surface material',
    category: 'liquid',
  },
  {
    name: 'lava',
    type: MaterialType.PBR,
    config: {
      albedo: new THREE.Color(0xff2200),
      emissive: new THREE.Color(0xff4400),
      emissiveIntensity: 3.0,
      metallic: 0.8,
      roughness: 0.3,
    },
    description: 'Molten lava material',
    category: 'effects',
  },
  {
    name: 'hologram',
    type: MaterialType.PBR,
    config: {
      albedo: new THREE.Color(0x00ffff),
      emissive: new THREE.Color(0x00ffff),
      emissiveIntensity: 1.5,
      transparent: true,
      alpha: 0.6,
      side: 'double',
    },
    description: 'Holographic projection material',
    category: 'effects',
  },
  {
    name: 'chrome',
    type: MaterialType.PBR,
    config: {
      albedo: new THREE.Color(0xffffff),
      metallic: 1.0,
      roughness: 0.0,
    },
    description: 'Chrome/mirror surface',
    category: 'metal',
  },
  {
    name: 'gold',
    type: MaterialType.PBR,
    config: {
      albedo: new THREE.Color(0xffd700),
      metallic: 1.0,
      roughness: 0.3,
    },
    description: 'Gold metallic surface',
    category: 'metal',
  },
  {
    name: 'copper',
    type: MaterialType.PBR,
    config: {
      albedo: new THREE.Color(0xb87333),
      metallic: 1.0,
      roughness: 0.4,
    },
    description: 'Copper metallic surface',
    category: 'metal',
  },
  {
    name: 'rubber',
    type: MaterialType.PBR,
    config: {
      albedo: new THREE.Color(0x222222),
      metallic: 0.0,
      roughness: 0.9,
    },
    description: 'Rubber material',
    category: 'synthetic',
  },
  {
    name: 'ceramic',
    type: MaterialType.PBR,
    config: {
      albedo: new THREE.Color(0xf5f5f5),
      metallic: 0.0,
      roughness: 0.2,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
    },
    description: 'Ceramic/glazed material',
    category: 'synthetic',
  },
  {
    name: 'velvet',
    type: MaterialType.PBR,
    config: {
      albedo: new THREE.Color(0x800020),
      metallic: 0.0,
      roughness: 1.0,
      sheenColor: new THREE.Color(0xaa3355),
      sheenRoughness: 0.9,
    },
    description: 'Velvet fabric material',
    category: 'organic',
  },
  {
    name: 'marble',
    type: MaterialType.PBR,
    config: {
      albedo: new THREE.Color(0xf0f0f0),
      metallic: 0.0,
      roughness: 0.3,
      clearcoat: 0.5,
      clearcoatRoughness: 0.2,
    },
    description: 'Marble stone material',
    category: 'construction',
  },
];

// ============================================
// Material System Class
// ============================================

/**
 * Main Material System class for creating and managing PBR materials
 */
export class MaterialSystem {
  private textureLoader: THREE.TextureLoader;
  private loadingManager: THREE.LoadingManager;
  private materialCache: Map<string, THREE.Material> = new Map();
  private textureCache: Map<string, THREE.Texture> = new Map();
  private materialInstances: Map<string, MaterialInstance> = new Map();
  private maxAnisotropy: number;

  constructor() {
    this.loadingManager = new THREE.LoadingManager();
    this.textureLoader = new THREE.TextureLoader(this.loadingManager);
    this.maxAnisotropy = 16; // Default max anisotropy
  }

  // ============================================
  // Material Creation Methods
  // ============================================

  /**
   * Creates a PBR material from a configuration object
   * @param config - Material configuration
   * @returns THREE.MeshPhysicalMaterial
   */
  createMaterial(config: Partial<PBRMaterialConfig>): THREE.MeshPhysicalMaterial {
    const mergedConfig = { ...DEFAULT_PBR_CONFIG, ...config };
    
    const material = new THREE.MeshPhysicalMaterial({
      // Base
      color: mergedConfig.albedo,
      map: mergedConfig.albedoMap,
      
      // PBR
      metalness: mergedConfig.metallic,
      metalnessMap: mergedConfig.metallicMap,
      roughness: mergedConfig.roughness,
      roughnessMap: mergedConfig.roughnessMap,
      
      // Normals
      normalMap: mergedConfig.normalMap,
      normalScale: new THREE.Vector2(mergedConfig.normalScale, mergedConfig.normalScale),
      
      // AO
      aoMap: mergedConfig.aoMap,
      aoMapIntensity: mergedConfig.aoStrength,
      
      // Emissive
      emissive: mergedConfig.emissive,
      emissiveMap: mergedConfig.emissiveMap,
      emissiveIntensity: mergedConfig.emissiveIntensity,
      
      // Height/Displacement
      displacementMap: mergedConfig.heightMap,
      displacementScale: mergedConfig.heightScale,
      
      // Transparency
      opacity: mergedConfig.alpha,
      alphaMap: mergedConfig.alphaMap,
      transparent: mergedConfig.transparent || mergedConfig.alpha < 1.0 || mergedConfig.transmission > 0,
      transmission: mergedConfig.transmission,
      
      // Subsurface
      attenuationColor: mergedConfig.subsurfaceColor,
      thickness: mergedConfig.subsurfaceStrength,
      
      // Advanced
      anisotropy: mergedConfig.anisotropy,
      anisotropyRotation: mergedConfig.anisotropyRotation,
      clearcoat: mergedConfig.clearcoat,
      clearcoatRoughness: mergedConfig.clearcoatRoughness,
      sheen: mergedConfig.sheenRoughness > 0 ? 1 : 0,
      sheenColor: mergedConfig.sheenColor,
      sheenRoughness: mergedConfig.sheenRoughness,
      
      // Rendering
      side: this.getThreeSide(mergedConfig.side),
      
      // Shadows
      shadowSide: mergedConfig.side === 'double' ? THREE.DoubleSide : undefined,
    });

    // Apply render queue
    material.userData.renderQueue = mergedConfig.renderQueue;
    
    // Shadow settings
    // Note: castShadow and receiveShadow are properties of the mesh, not the material
    
    return material;
  }

  /**
   * Creates a PBR material from a preset name
   * @param presetName - Name of the preset to use
   * @returns THREE.MeshPhysicalMaterial
   */
  createPBRMaterial(presetName: string): THREE.MeshPhysicalMaterial {
    const preset = MATERIAL_PRESETS.find(p => p.name === presetName);
    
    if (!preset) {
      console.warn(`Material preset "${presetName}" not found, using default`);
      return this.createMaterial({});
    }
    
    return this.createMaterial(preset.config);
  }

  /**
   * Creates an unlit material (basic rendering without PBR)
   * @param color - Base color for the material
   * @returns THREE.MeshBasicMaterial
   */
  createUnlitMaterial(color: THREE.Color | number | string): THREE.MeshBasicMaterial {
    const threeColor = color instanceof THREE.Color 
      ? color 
      : new THREE.Color(color);
    
    return new THREE.MeshBasicMaterial({
      color: threeColor,
    });
  }

  /**
   * Creates a custom shader material
   * @param shaderConfig - Shader configuration with vertex/fragment code and uniforms
   * @returns THREE.ShaderMaterial
   */
  createCustomMaterial(shaderConfig: CustomShaderConfig): THREE.ShaderMaterial {
    const material = new THREE.ShaderMaterial({
      vertexShader: shaderConfig.vertexShader,
      fragmentShader: shaderConfig.fragmentShader,
      uniforms: shaderConfig.uniforms,
      side: this.getThreeSide(shaderConfig.side || 'front'),
      transparent: shaderConfig.transparent ?? false,
      depthWrite: shaderConfig.depthWrite ?? true,
      blending: shaderConfig.blending ?? THREE.NormalBlending,
    });
    
    return material;
  }

  /**
   * Creates a particle material for particle systems
   * @param config - Particle material configuration
   * @returns THREE.PointsMaterial or custom shader material
   */
  createParticleMaterial(config: {
    color?: THREE.Color;
    size?: number;
    map?: THREE.Texture;
    transparent?: boolean;
    blending?: THREE.Blending;
    depthWrite?: boolean;
  }): THREE.PointsMaterial {
    return new THREE.PointsMaterial({
      color: config.color || new THREE.Color(0xffffff),
      size: config.size || 1.0,
      map: config.map,
      transparent: config.transparent ?? true,
      blending: config.blending ?? THREE.AdditiveBlending,
      depthWrite: config.depthWrite ?? false,
    });
  }

  /**
   * Creates a terrain material with multi-texture support
   * @param config - Terrain material configuration
   * @returns THREE.ShaderMaterial for terrain
   */
  createTerrainMaterial(config: {
    splatMap?: THREE.Texture;
    layers?: Array<{
      albedo: THREE.Texture;
      normal?: THREE.Texture;
      scale: number;
    }>;
    baseColor?: THREE.Color;
  }): THREE.ShaderMaterial {
    const vertexShader = `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vPosition;
      
      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;
    
    const fragmentShader = `
      uniform vec3 uBaseColor;
      uniform float uRoughness;
      
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vPosition;
      
      void main() {
        vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
        float diff = max(dot(vNormal, lightDir), 0.0);
        vec3 color = uBaseColor * (0.3 + 0.7 * diff);
        gl_FragColor = vec4(color, 1.0);
      }
    `;
    
    return this.createCustomMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uBaseColor: { value: config.baseColor || new THREE.Color(0x808080) },
        uRoughness: { value: 0.8 },
      },
    });
  }

  /**
   * Creates a sky material for skybox/environment
   * @param config - Sky configuration
   * @returns THREE.ShaderMaterial for sky
   */
  createSkyMaterial(config?: {
    topColor?: THREE.Color;
    bottomColor?: THREE.Color;
    offset?: number;
    exponent?: number;
  }): THREE.ShaderMaterial {
    const topColor = config?.topColor || new THREE.Color(0x0077ff);
    const bottomColor = config?.bottomColor || new THREE.Color(0xffffff);
    const offset = config?.offset || 400;
    const exponent = config?.exponent || 0.6;
    
    const vertexShader = `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;
    
    const fragmentShader = `
      uniform vec3 uTopColor;
      uniform vec3 uBottomColor;
      uniform float uOffset;
      uniform float uExponent;
      varying vec3 vWorldPosition;
      
      void main() {
        float h = normalize(vWorldPosition + uOffset).y;
        gl_FragColor = vec4(mix(uBottomColor, uTopColor, max(pow(max(h, 0.0), uExponent), 0.0)), 1.0);
      }
    `;
    
    return this.createCustomMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTopColor: { value: topColor },
        uBottomColor: { value: bottomColor },
        uOffset: { value: offset },
        uExponent: { value: exponent },
      },
      side: 'back',
    });
  }

  /**
   * Creates a water material with animated waves
   * @param config - Water configuration
   * @returns THREE.ShaderMaterial for water
   */
  createWaterMaterial(config?: {
    color?: THREE.Color;
    normalMap?: THREE.Texture;
    flowSpeed?: number;
    waveHeight?: number;
  }): THREE.ShaderMaterial {
    const color = config?.color || new THREE.Color(0x0055aa);
    const flowSpeed = config?.flowSpeed || 1.0;
    const waveHeight = config?.waveHeight || 0.5;
    
    const vertexShader = `
      uniform float uTime;
      uniform float uWaveHeight;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vPosition;
      
      void main() {
        vUv = uv;
        vec3 pos = position;
        
        // Simple wave animation
        float wave = sin(pos.x * 2.0 + uTime) * cos(pos.z * 2.0 + uTime * 0.7) * uWaveHeight;
        pos.y += wave;
        
        vNormal = normalize(normalMatrix * normal);
        vPosition = (modelMatrix * vec4(pos, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `;
    
    const fragmentShader = `
      uniform vec3 uWaterColor;
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vPosition;
      
      void main() {
        vec3 lightDir = normalize(vec3(1.0, 1.0, 0.5));
        float diff = max(dot(vNormal, lightDir), 0.0);
        
        // Fresnel effect
        vec3 viewDir = normalize(cameraPosition - vPosition);
        float fresnel = pow(1.0 - max(dot(viewDir, vNormal), 0.0), 3.0);
        
        vec3 color = uWaterColor * (0.4 + 0.6 * diff);
        color = mix(color, vec3(0.8, 0.9, 1.0), fresnel * 0.5);
        
        gl_FragColor = vec4(color, 0.85);
      }
    `;
    
    return this.createCustomMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uWaterColor: { value: color },
        uTime: { value: 0 },
        uWaveHeight: { value: waveHeight },
        uFlowSpeed: { value: flowSpeed },
      },
      transparent: true,
      side: 'double',
    });
  }

  /**
   * Creates a foliage material with alpha cutoff and wind animation
   * @param config - Foliage configuration
   * @returns THREE.ShaderMaterial for foliage
   */
  createFoliageMaterial(config?: {
    color?: THREE.Color;
    alphaMap?: THREE.Texture;
    windStrength?: number;
  }): THREE.ShaderMaterial {
    const color = config?.color || new THREE.Color(0x228b22);
    const windStrength = config?.windStrength || 0.5;
    
    const vertexShader = `
      uniform float uTime;
      uniform float uWindStrength;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying float vAlpha;
      
      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        
        // Wind animation
        vec3 pos = position;
        float wind = sin(pos.x * 5.0 + uTime * 2.0) * cos(pos.z * 3.0 + uTime * 1.5) * uWindStrength;
        pos.x += wind * 0.1;
        pos.z += wind * 0.05;
        
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `;
    
    const fragmentShader = `
      uniform vec3 uFoliageColor;
      varying vec2 vUv;
      varying vec3 vNormal;
      
      void main() {
        vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));
        float diff = max(dot(vNormal, lightDir), 0.0);
        vec3 color = uFoliageColor * (0.4 + 0.6 * diff);
        
        // Slight color variation
        color += (vUv.y - 0.5) * 0.1;
        
        gl_FragColor = vec4(color, 1.0);
      }
    `;
    
    return this.createCustomMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uFoliageColor: { value: color },
        uTime: { value: 0 },
        uWindStrength: { value: windStrength },
      },
      side: 'double',
    });
  }

  // ============================================
  // Material Cloning and Management
  // ============================================

  /**
   * Clones a material with all its properties
   * @param material - Material to clone
   * @returns Cloned material
   */
  cloneMaterial(material: THREE.Material): THREE.Material {
    if (material instanceof THREE.MeshPhysicalMaterial) {
      return material.clone();
    } else if (material instanceof THREE.MeshStandardMaterial) {
      return material.clone();
    } else if (material instanceof THREE.MeshBasicMaterial) {
      return material.clone();
    } else if (material instanceof THREE.ShaderMaterial) {
      const clonedShader = material.clone() as THREE.ShaderMaterial;
      // Deep clone uniforms
      clonedShader.uniforms = JSON.parse(JSON.stringify(material.uniforms));
      return clonedShader;
    }
    
    return material.clone();
  }

  /**
   * Sets a texture on a material channel
   * @param material - Target material
   * @param channel - Texture channel name
   * @param texture - Texture to set
   */
  setTexture(
    material: THREE.Material,
    channel: string,
    texture: THREE.Texture
  ): void {
    if (material instanceof THREE.MeshPhysicalMaterial || 
        material instanceof THREE.MeshStandardMaterial) {
      
      switch (channel) {
        case 'albedo':
        case 'diffuse':
        case 'map':
          material.map = texture;
          break;
        case 'normal':
          material.normalMap = texture;
          break;
        case 'roughness':
          material.roughnessMap = texture;
          break;
        case 'metallic':
        case 'metalness':
          material.metalnessMap = texture;
          break;
        case 'ao':
        case 'occlusion':
          material.aoMap = texture;
          break;
        case 'emissive':
          material.emissiveMap = texture;
          break;
        case 'height':
        case 'displacement':
          material.displacementMap = texture;
          break;
        case 'alpha':
          material.alphaMap = texture;
          break;
        default:
          console.warn(`Unknown texture channel: ${channel}`);
      }
      
      material.needsUpdate = true;
    }
  }

  /**
   * Gets all available material presets
   * @returns Array of material presets
   */
  getMaterialPresets(): MaterialPreset[] {
    return [...MATERIAL_PRESETS];
  }

  /**
   * Gets presets by category
   * @param category - Category name
   * @returns Filtered presets
   */
  getPresetsByCategory(category: string): MaterialPreset[] {
    return MATERIAL_PRESETS.filter(p => p.category === category);
  }

  /**
   * Gets all unique categories
   * @returns Array of category names
   */
  getCategories(): string[] {
    return [...new Set(MATERIAL_PRESETS.map(p => p.category))];
  }

  // ============================================
  // Texture Loading
  // ============================================

  /**
   * Loads a texture from a URL with options
   * @param url - Texture URL
   * @param options - Loading options
   * @returns Promise with loaded texture
   */
  async loadTexture(url: string, options: TextureLoadOptions = {}): Promise<THREE.Texture> {
    // Check cache first
    if (this.textureCache.has(url)) {
      return this.textureCache.get(url)!;
    }
    
    return new Promise((resolve, reject) => {
      this.textureLoader.load(
        url,
        (texture) => {
          // Apply options
          this.applyTextureOptions(texture, options);
          
          // Cache the texture
          this.textureCache.set(url, texture);
          
          resolve(texture);
        },
        undefined,
        (error) => {
          console.error(`Failed to load texture: ${url}`, error);
          reject(error);
        }
      );
    });
  }

  /**
   * Loads multiple textures at once
   * @param urls - Array of texture URLs
   * @param options - Common loading options
   * @returns Promise with array of loaded textures
   */
  async loadTextures(
    urls: string[],
    options: TextureLoadOptions = {}
  ): Promise<THREE.Texture[]> {
    return Promise.all(urls.map(url => this.loadTexture(url, options)));
  }

  /**
   * Loads a cube texture for environment mapping
   * @param urls - Array of 6 URLs for cube faces (+x, -x, +y, -y, +z, -z)
   * @returns Promise with cube texture
   */
  async loadCubeTexture(urls: string[]): Promise<THREE.CubeTexture> {
    const loader = new THREE.CubeTextureLoader(this.loadingManager);
    
    return new Promise((resolve, reject) => {
      loader.load(
        urls,
        (cubeTexture) => {
          resolve(cubeTexture);
        },
        undefined,
        (error) => {
          console.error('Failed to load cube texture', error);
          reject(error);
        }
      );
    });
  }

  /**
   * Applies texture loading options to a texture
   * @param texture - Target texture
   * @param options - Options to apply
   */
  private applyTextureOptions(texture: THREE.Texture, options: TextureLoadOptions): void {
    if (options.repeat) {
      texture.repeat.copy(options.repeat);
    }
    
    if (options.offset) {
      texture.offset.copy(options.offset);
    }
    
    if (options.generateMipmaps !== undefined) {
      texture.generateMipmaps = options.generateMipmaps;
    }
    
    if (options.anisotropy !== undefined) {
      texture.anisotropy = Math.min(options.anisotropy, this.maxAnisotropy);
    }
    
    if (options.encoding) {
      texture.colorSpace = this.getThreeColorSpace(options.encoding);
    }
    
    if (options.flipY !== undefined) {
      texture.flipY = options.flipY;
    }
    
    if (options.wrapS !== undefined) {
      texture.wrapS = options.wrapS;
    }
    
    if (options.wrapT !== undefined) {
      texture.wrapT = options.wrapT;
    }
    
    if (options.minFilter !== undefined) {
      texture.minFilter = options.minFilter;
    }
    
    if (options.magFilter !== undefined) {
      texture.magFilter = options.magFilter;
    }
    
    texture.needsUpdate = true;
  }

  // ============================================
  // Material Instancing
  // ============================================

  /**
   * Creates a material instance for batching
   * @param baseMaterial - Base material to instance
   * @param overrides - Property overrides
   * @returns Material instance ID
   */
  createMaterialInstance(
    baseMaterial: THREE.Material,
    overrides: Record<string, unknown> = {}
  ): string {
    const id = this.generateId();
    
    const instance: MaterialInstance = {
      id,
      baseMaterial,
      overrides: new Map(Object.entries(overrides)),
      properties: { ...overrides },
    };
    
    this.materialInstances.set(id, instance);
    
    return id;
  }

  /**
   * Gets a material instance by ID
   * @param id - Instance ID
   * @returns Material instance or undefined
   */
  getMaterialInstance(id: string): MaterialInstance | undefined {
    return this.materialInstances.get(id);
  }

  /**
   * Updates a material instance property
   * @param id - Instance ID
   * @param property - Property name
   * @param value - New value
   */
  updateMaterialInstance(id: string, property: string, value: unknown): void {
    const instance = this.materialInstances.get(id);
    if (instance) {
      instance.overrides.set(property, value);
      instance.properties[property] = value;
    }
  }

  /**
   * Removes a material instance
   * @param id - Instance ID
   */
  removeMaterialInstance(id: string): void {
    this.materialInstances.delete(id);
  }

  /**
   * Gets all material instances
   * @returns Map of material instances
   */
  getAllMaterialInstances(): Map<string, MaterialInstance> {
    return new Map(this.materialInstances);
  }

  // ============================================
  // Material Caching
  // ============================================

  /**
   * Caches a material for reuse
   * @param name - Cache key
   * @param material - Material to cache
   */
  cacheMaterial(name: string, material: THREE.Material): void {
    this.materialCache.set(name, material);
  }

  /**
   * Gets a cached material
   * @param name - Cache key
   * @returns Cached material or undefined
   */
  getCachedMaterial(name: string): THREE.Material | undefined {
    return this.materialCache.get(name);
  }

  /**
   * Checks if a material is cached
   * @param name - Cache key
   * @returns Boolean indicating if cached
   */
  hasCachedMaterial(name: string): boolean {
    return this.materialCache.has(name);
  }

  /**
   * Removes a cached material
   * @param name - Cache key
   */
  removeCachedMaterial(name: string): void {
    this.materialCache.delete(name);
  }

  /**
   * Clears all cached materials
   */
  clearMaterialCache(): void {
    this.materialCache.forEach(material => material.dispose());
    this.materialCache.clear();
  }

  /**
   * Clears all cached textures
   */
  clearTextureCache(): void {
    this.textureCache.forEach(texture => texture.dispose());
    this.textureCache.clear();
  }

  // ============================================
  // Utility Methods
  // ============================================

  /**
   * Converts MaterialSide to THREE.Side
   * @param side - Material side string
   * @returns THREE.Side enum value
   */
  private getThreeSide(side: MaterialSide): THREE.Side {
    switch (side) {
      case 'front':
        return THREE.FrontSide;
      case 'back':
        return THREE.BackSide;
      case 'double':
        return THREE.DoubleSide;
      default:
        return THREE.FrontSide;
    }
  }

  /**
   * Converts TextureEncoding to THREE.ColorSpace
   * @param encoding - Encoding string
   * @returns THREE.ColorSpace value
   */
  private getThreeColorSpace(encoding: TextureEncoding): THREE.ColorSpace {
    switch (encoding) {
      case 'srgb':
        return THREE.SRGBColorSpace;
      case 'linear':
        return THREE.LinearSRGBColorSpace;
      case 'srgb-linear':
        return THREE.SRGBColorSpace;
      case 'display-p3':
        return THREE.SRGBColorSpace;
      default:
        return THREE.SRGBColorSpace;
    }
  }

  /**
   * Generates a unique ID
   * @returns Unique string ID
   */
  private generateId(): string {
    return `mat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Sets the max anisotropy for textures
   * @param value - Max anisotropy value
   */
  setMaxAnisotropy(value: number): void {
    this.maxAnisotropy = value;
  }

  /**
   * Creates a procedural texture
   * @param type - Type of procedural texture
   * @param size - Texture size
   * @returns Generated texture
   */
  createProceduralTexture(type: 'noise' | 'checker' | 'gradient', size = 256): THREE.DataTexture {
    const data = new Uint8Array(size * size * 4);
    
    switch (type) {
      case 'noise':
        for (let i = 0; i < size * size; i++) {
          const value = Math.random() * 255;
          data[i * 4] = value;
          data[i * 4 + 1] = value;
          data[i * 4 + 2] = value;
          data[i * 4 + 3] = 255;
        }
        break;
        
      case 'checker':
        const checkerSize = size / 8;
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            const i = (y * size + x) * 4;
            const isEven = (Math.floor(x / checkerSize) + Math.floor(y / checkerSize)) % 2 === 0;
            const value = isEven ? 255 : 64;
            data[i] = value;
            data[i + 1] = value;
            data[i + 2] = value;
            data[i + 3] = 255;
          }
        }
        break;
        
      case 'gradient':
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            const i = (y * size + x) * 4;
            const gradient = (y / size) * 255;
            data[i] = gradient;
            data[i + 1] = gradient;
            data[i + 2] = gradient;
            data[i + 3] = 255;
          }
        }
        break;
    }
    
    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    texture.needsUpdate = true;
    
    return texture;
  }

  /**
   * Disposes of all resources
   */
  dispose(): void {
    // Dispose all cached materials
    this.materialCache.forEach(material => material.dispose());
    this.materialCache.clear();
    
    // Dispose all cached textures
    this.textureCache.forEach(texture => texture.dispose());
    this.textureCache.clear();
    
    // Clear instances
    this.materialInstances.clear();
  }
}

// ============================================
// Singleton Instance
// ============================================

/**
 * Global material system instance
 */
export const materialSystem = new MaterialSystem();
