// ============================================
// 3D Rendering Engine with Three.js
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// ============================================

'use client';

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import type { Scene as EngineScene, Entity, EnvironmentSettings } from '@/types/engine';

// Render Engine Configuration
export interface RenderConfig {
  antialias: boolean;
  shadows: boolean;
  shadowMapSize: number;
  toneMapping: THREE.ToneMapping;
  toneMappingExposure: number;
  outputColorSpace: THREE.ColorSpace;
  pixelRatio: number;
}

const defaultConfig: RenderConfig = {
  antialias: true,
  shadows: true,
  shadowMapSize: 2048,
  toneMapping: THREE.ACESFilmicToneMapping,
  toneMappingExposure: 1.0,
  outputColorSpace: THREE.SRGBColorSpace,
  pixelRatio: Math.min(window.devicePixelRatio, 2),
};

// Main Render Engine Class
export class RenderEngine {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private composer: EffectComposer;
  private config: RenderConfig;
  
  // Entity to Three.js object mapping
  private entityMeshes: Map<string, THREE.Object3D> = new Map();
  
  // Grid and helpers
  private gridHelper: THREE.GridHelper;
  private axesHelper: THREE.AxesHelper;
  
  // Post-processing passes
  private bloomPass: UnrealBloomPass | null = null;
  private ssaoPass: SSAOPass | null = null;
  
  // Animation
  private animationId: number | null = null;
  private lastFrameTime: number;

  constructor(container: HTMLElement, config: Partial<RenderConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
    this.lastFrameTime = performance.now();
    
    // Initialize renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: this.config.antialias,
      alpha: true,
      powerPreference: 'high-performance',
      precision: 'mediump',
    });
    
    this.configureRenderer();
    container.appendChild(this.renderer.domElement);
    
    // Initialize scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);
    
    // Initialize camera
    this.camera = new THREE.PerspectiveCamera(
      60,
      container.clientWidth / container.clientHeight,
      0.1,
      10000
    );
    this.camera.position.set(10, 10, 10);
    
    // Initialize controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.screenSpacePanning = false;
    this.controls.minDistance = 1;
    this.controls.maxDistance = 1000;
    
    // Initialize grid
    this.gridHelper = new THREE.GridHelper(100, 100, 0x444466, 0x222244);
    this.gridHelper.name = 'grid';
    this.scene.add(this.gridHelper);
    
    // Initialize axes
    this.axesHelper = new THREE.AxesHelper(5);
    this.axesHelper.name = 'axes';
    this.scene.add(this.axesHelper);
    
    // Initialize post-processing
    this.composer = new EffectComposer(this.renderer);
    this.setupPostProcessing();
    
    // Add default lighting
    this.setupDefaultLighting();
    
    // Handle resize
    this.handleResize(container);
    window.addEventListener('resize', () => this.handleResize(container));
  }

  private configureRenderer(): void {
    this.renderer.shadowMap.enabled = this.config.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = this.config.toneMapping;
    this.renderer.toneMappingExposure = this.config.toneMappingExposure;
    this.renderer.outputColorSpace = this.config.outputColorSpace;
    this.renderer.setPixelRatio(this.config.pixelRatio);
  }

  private setupPostProcessing(): void {
    // Render pass
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);
    
    // Bloom pass
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.5, // strength
      0.4, // radius
      0.85 // threshold
    );
    this.composer.addPass(this.bloomPass);
  }

  private setupDefaultLighting(): void {
    // Ambient light
    const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
    ambientLight.name = 'ambient_light';
    this.scene.add(ambientLight);
    
    // Directional light (sun)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.name = 'directional_light';
    directionalLight.position.set(50, 100, 50);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = this.config.shadowMapSize;
    directionalLight.shadow.mapSize.height = this.config.shadowMapSize;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 500;
    directionalLight.shadow.camera.left = -100;
    directionalLight.shadow.camera.right = 100;
    directionalLight.shadow.camera.top = 100;
    directionalLight.shadow.camera.bottom = -100;
    this.scene.add(directionalLight);
  }

  private handleResize(container: HTMLElement): void {
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    
    this.renderer.setSize(width, height);
    this.composer.setSize(width, height);
    
    if (this.bloomPass) {
      this.bloomPass.resolution.set(width, height);
    }
  }

  // Entity Management
  addEntity(entity: Entity): void {
    const object = this.createThreeObject(entity);
    if (object) {
      this.scene.add(object);
      this.entityMeshes.set(entity.id, object);
    }
  }

  removeEntity(entityId: string): void {
    const object = this.entityMeshes.get(entityId);
    if (object) {
      this.scene.remove(object);
      this.entityMeshes.delete(entityId);
    }
  }

  updateEntity(entity: Entity): void {
    this.removeEntity(entity.id);
    this.addEntity(entity);
  }

  private createThreeObject(entity: Entity): THREE.Object3D | null {
    const group = new THREE.Group();
    group.name = entity.name;
    group.userData = { entityId: entity.id };
    
    // Apply transform
    const transform = entity.components.get('Transform');
    if (transform) {
      const data = transform.data as { position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number; w: number }; scale: { x: number; y: number; z: number } };
      group.position.set(data.position.x, data.position.y, data.position.z);
      group.quaternion.set(data.rotation.x, data.rotation.y, data.rotation.z, data.rotation.w);
      group.scale.set(data.scale.x, data.scale.y, data.scale.z);
    }
    
    // Add mesh renderer
    const meshRenderer = entity.components.get('MeshRenderer');
    if (meshRenderer) {
      const mesh = this.createMesh(meshRenderer.data as { meshId?: string; materialId?: string; castShadows?: boolean; receiveShadows?: boolean });
      if (mesh) {
        group.add(mesh);
      }
    }
    
    // Add light
    const light = entity.components.get('Light');
    if (light) {
      const lightObject = this.createLight(light.data as { type: string; color: { r: number; g: number; b: number }; intensity: number; shadows?: boolean });
      if (lightObject) {
        group.add(lightObject);
      }
    }
    
    // Add camera
    const camera = entity.components.get('Camera');
    if (camera) {
      const cameraObject = this.createCamera(camera.data as { fov: number; near: number; far: number; isMain?: boolean });
      if (cameraObject) {
        group.add(cameraObject);
      }
    }
    
    // Process children
    entity.children.forEach(child => {
      const childObject = this.createThreeObject(child);
      if (childObject) {
        group.add(childObject);
      }
    });
    
    return group;
  }

  private createMesh(data: { meshId?: string; materialId?: string; castShadows?: boolean; receiveShadows?: boolean }): THREE.Mesh | null {
    // Create a default cube if no mesh specified
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    
    // Create default PBR material
    const material = new THREE.MeshStandardMaterial({
      color: 0x888888,
      metalness: 0.5,
      roughness: 0.5,
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = data.castShadows ?? true;
    mesh.receiveShadow = data.receiveShadows ?? true;
    
    return mesh;
  }

  private createLight(data: { type: string; color: { r: number; g: number; b: number }; intensity: number; shadows?: boolean }): THREE.Light | null {
    let light: THREE.Light;
    const color = new THREE.Color(data.color.r, data.color.g, data.color.b);
    
    switch (data.type) {
      case 'directional':
        light = new THREE.DirectionalLight(color, data.intensity);
        if (data.shadows) {
          light.castShadow = true;
        }
        break;
      case 'point':
        light = new THREE.PointLight(color, data.intensity);
        break;
      case 'spot':
        light = new THREE.SpotLight(color, data.intensity);
        break;
      case 'ambient':
      default:
        light = new THREE.AmbientLight(color, data.intensity);
        break;
    }
    
    return light;
  }

  private createCamera(data: { fov: number; near: number; far: number; isMain?: boolean }): THREE.Camera | null {
    const camera = new THREE.PerspectiveCamera(data.fov, 16 / 9, data.near, data.far);
    camera.userData = { isMain: data.isMain };
    return camera;
  }

  // Scene Management
  loadScene(scene: EngineScene): void {
    // Clear existing entities
    this.entityMeshes.forEach((_, id) => this.removeEntity(id));
    
    // Load environment
    this.applyEnvironment(scene.environment);
    
    // Add entities
    scene.entities.forEach(entity => this.addEntity(entity));
  }

  private applyEnvironment(settings: EnvironmentSettings): void {
    // Apply ambient light
    const ambient = this.scene.getObjectByName('ambient_light') as THREE.AmbientLight;
    if (ambient) {
      ambient.color.setRGB(settings.ambientLight.r, settings.ambientLight.g, settings.ambientLight.b);
    }
    
    // Apply fog
    if (settings.fog?.enabled) {
      if (settings.fog.type === 'exponential') {
        this.scene.fog = new THREE.FogExp2(
          new THREE.Color(settings.fog.color.r, settings.fog.color.g, settings.fog.color.b).getHex(),
          settings.fog.density || 0.01
        );
      } else {
        this.scene.fog = new THREE.Fog(
          new THREE.Color(settings.fog.color.r, settings.fog.color.g, settings.fog.color.b).getHex(),
          settings.fog.near || 10,
          settings.fog.far || 100
        );
      }
    } else {
      this.scene.fog = null;
    }
    
    // Apply post-processing
    if (this.bloomPass && settings.postProcessing.bloom.enabled) {
      this.bloomPass.strength = settings.postProcessing.bloom.intensity;
      this.bloomPass.threshold = settings.postProcessing.bloom.threshold;
      this.bloomPass.radius = settings.postProcessing.bloom.radius;
    }
  }

  // Render Loop
  start(): void {
    const animate = () => {
      this.animationId = requestAnimationFrame(animate);
      
      const now = performance.now();
      const delta = Math.min((now - this.lastFrameTime) / 1000, 0.1);
      this.lastFrameTime = now;
      
      // Update controls
      this.controls.update();
      
      // Render with post-processing
      this.composer.render();
      
      // Emit render event
      // eventBus.emit('render', { delta, fps: 1 / delta });
    };
    
    animate();
  }

  stop(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  // Utility Methods
  setGridVisible(visible: boolean): void {
    this.gridHelper.visible = visible;
    this.axesHelper.visible = visible;
  }

  setBackgroundColor(color: number): void {
    this.scene.background = new THREE.Color(color);
  }

  getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }

  getScene(): THREE.Scene {
    return this.scene;
  }

  getRenderer(): THREE.WebGLRenderer {
    return this.renderer;
  }

  // Raycasting for selection
  raycast(mouse: { x: number; y: number }): THREE.Intersection[] {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(mouse.x, mouse.y), this.camera);
    
    const objects: THREE.Object3D[] = [];
    this.entityMeshes.forEach(obj => objects.push(obj));
    
    return raycaster.intersectObjects(objects, true);
  }

  // Dispose
  dispose(): void {
    this.stop();
    this.renderer.dispose();
    this.controls.dispose();
    this.entityMeshes.clear();
  }
}

// Primitive mesh generators
export const PrimitiveGenerator = {
  createCube(size = 1): THREE.BufferGeometry {
    return new THREE.BoxGeometry(size, size, size);
  },
  
  createSphere(radius = 0.5, segments = 32): THREE.BufferGeometry {
    return new THREE.SphereGeometry(radius, segments, segments);
  },
  
  createCylinder(radiusTop = 0.5, radiusBottom = 0.5, height = 1, segments = 32): THREE.BufferGeometry {
    return new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments);
  },
  
  createPlane(width = 1, height = 1): THREE.BufferGeometry {
    return new THREE.PlaneGeometry(width, height);
  },
  
  createCapsule(radius = 0.25, height = 1, segments = 16): THREE.BufferGeometry {
    return new THREE.CapsuleGeometry(radius, height - radius * 2, segments, segments);
  },
  
  createTorus(radius = 0.5, tube = 0.2, radialSegments = 16, tubularSegments = 32): THREE.BufferGeometry {
    return new THREE.TorusGeometry(radius, tube, radialSegments, tubularSegments);
  },
};

// Material presets
export const MaterialPresets = {
  default: (): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({
    color: 0x888888,
    metalness: 0.5,
    roughness: 0.5,
  }),
  
  metal: (): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({
    color: 0xaaaaaa,
    metalness: 1.0,
    roughness: 0.2,
  }),
  
  plastic: (): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({
    color: 0xff6b6b,
    metalness: 0.0,
    roughness: 0.4,
  }),
  
  glass: (): THREE.MeshPhysicalMaterial => new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0,
    roughness: 0,
    transmission: 0.9,
    transparent: true,
    opacity: 0.3,
  }),
  
  emissive: (color: number): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({
    color: color,
    emissive: color,
    emissiveIntensity: 1,
  }),
};
