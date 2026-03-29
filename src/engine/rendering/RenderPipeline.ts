// ============================================
// Render Pipeline with Deferred and Forward Rendering
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// ============================================

import * as THREE from 'three';

// ============================================
// ENUMS & INTERFACES
// ============================================

/**
 * Render path types supported by the pipeline
 */
export enum RenderPath {
  FORWARD = 'forward',
  DEFERRED = 'deferred',
  FORWARD_PLUS = 'forward_plus',
  HYBRID = 'hybrid'
}

/**
 * Pipeline configuration options
 */
export interface PipelineConfig {
  path: RenderPath;
  shadowQuality: 'low' | 'medium' | 'high' | 'ultra';
  msaa: number; // 0, 2, 4, 8, 16
  anisotropicFiltering: number; // 1, 2, 4, 8, 16
  renderScale: number; // 0.5 to 2.0 for dynamic resolution
  maxLights: number;
  maxShadows: number;
  enableGPUInstancing: boolean;
  enableOcclusionCulling: boolean;
  enableFrustumCulling: boolean;
  enableBatching: boolean;
  sortMode: 'frontToBack' | 'backToFront' | 'material';
}

/**
 * Default pipeline configuration
 */
export const defaultPipelineConfig: PipelineConfig = {
  path: RenderPath.FORWARD,
  shadowQuality: 'high',
  msaa: 4,
  anisotropicFiltering: 4,
  renderScale: 1.0,
  maxLights: 32,
  maxShadows: 4,
  enableGPUInstancing: true,
  enableOcclusionCulling: false,
  enableFrustumCulling: true,
  enableBatching: true,
  sortMode: 'backToFront'
};

/**
 * Render statistics
 */
export interface RenderStats {
  drawCalls: number;
  triangles: number;
  vertices: number;
  textures: number;
  shadersCompiled: number;
  frameTime: number;
  gpuTime: number;
  renderPath: RenderPath;
  culledObjects: number;
  batchedDrawCalls: number;
  instancedDrawCalls: number;
  lightsProcessed: number;
  shadowsRendered: number;
}

/**
 * Render feature interface
 */
export interface RenderFeature {
  name: string;
  enabled: boolean;
  priority: number;
  initialize(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void;
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void;
  dispose(): void;
}

/**
 * Light data for rendering
 */
interface LightData {
  light: THREE.Light;
  position: THREE.Vector3;
  direction: THREE.Vector3;
  color: THREE.Color;
  intensity: number;
  range: number;
  type: 'directional' | 'point' | 'spot' | 'ambient';
  castShadow: boolean;
  shadowMap?: THREE.Texture;
}

/**
 * Renderable object data
 */
interface RenderableData {
  object: THREE.Object3D;
  material: THREE.Material | THREE.Material[];
  geometry: THREE.BufferGeometry;
  distance: number;
  isTransparent: boolean;
  isInstanced: boolean;
  instanceCount: number;
  batchKey: string;
}

// ============================================
// G-BUFFER CLASS
// ============================================

/**
 * G-Buffer for deferred rendering using Multiple Render Targets
 */
export class GBuffer {
  private width: number;
  private height: number;
  
  // Render targets
  private gBuffer: THREE.WebGLRenderTarget<THREE.Texture[]> | null = null;
  private depthBuffer: THREE.RenderTarget | null = null;
  
  // Textures
  public albedoTexture: THREE.Texture | null = null;      // RGB: Albedo, A: Alpha
  public normalTexture: THREE.Texture | null = null;      // RGB: Normal, A: Metallic
  public positionTexture: THREE.Texture | null = null;    // RGB: Position, A: Roughness
  public emissiveTexture: THREE.Texture | null = null;    // RGB: Emissive, A: AO
  
  // Depth texture
  public depthTexture: THREE.DepthTexture | null = null;
  
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.createGBuffer();
  }
  
  private createGBuffer(): void {
    // Create G-Buffer with 4 render targets (MRT)
    this.gBuffer = new THREE.WebGLRenderTarget<THREE.Texture[]>(
      this.width,
      this.height,
      {
        count: 4,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        format: THREE.RGBAFormat,
        type: THREE.HalfFloatType // HDR support
      }
    );
    
    // Name the textures for easier identification
    this.gBuffer.texture[0].name = 'albedoAlpha';
    this.gBuffer.texture[1].name = 'normalMetallic';
    this.gBuffer.texture[2].name = 'positionRoughness';
    this.gBuffer.texture[3].name = 'emissiveAO';
    
    // Assign texture references
    this.albedoTexture = this.gBuffer.texture[0];
    this.normalTexture = this.gBuffer.texture[1];
    this.positionTexture = this.gBuffer.texture[2];
    this.emissiveTexture = this.gBuffer.texture[3];
    
    // Create depth texture
    this.depthTexture = new THREE.DepthTexture(this.width, this.height);
    this.depthTexture.format = THREE.DepthFormat;
    this.depthTexture.type = THREE.UnsignedInt248Type;
    this.gBuffer.depthTexture = this.depthTexture;
  }
  
  resize(width: number, height: number): void {
    this.dispose();
    this.width = width;
    this.height = height;
    this.createGBuffer();
  }
  
  getRenderTarget(): THREE.WebGLRenderTarget<THREE.Texture[]> | null {
    return this.gBuffer;
  }
  
  getDepthTexture(): THREE.DepthTexture | null {
    return this.depthTexture;
  }
  
  dispose(): void {
    if (this.gBuffer) {
      this.gBuffer.dispose();
      this.gBuffer = null;
    }
    this.albedoTexture = null;
    this.normalTexture = null;
    this.positionTexture = null;
    this.emissiveTexture = null;
    this.depthTexture = null;
  }
}

// ============================================
// LIGHT CULLING SYSTEM
// ============================================

/**
 * Tile-based and clustered light culling
 */
export class LightCulling {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.Camera | null = null;
  
  // Culling configuration
  private tileSize: number = 16;
  private clusterDepth: number = 24;
  private maxLightsPerTile: number = 32;
  
  // Light data
  private visibleLights: LightData[] = [];
  private culledLights: Map<string, number[]> = new Map();
  
  // Frustum for culling
  private frustum: THREE.Frustum = new THREE.Frustum();
  private projScreenMatrix: THREE.Matrix4 = new THREE.Matrix4();
  
  constructor(config?: { tileSize?: number; clusterDepth?: number; maxLightsPerTile?: number }) {
    if (config) {
      this.tileSize = config.tileSize ?? this.tileSize;
      this.clusterDepth = config.clusterDepth ?? this.clusterDepth;
      this.maxLightsPerTile = config.maxLightsPerTile ?? this.maxLightsPerTile;
    }
  }
  
  initialize(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
  }
  
  /**
   * Collect all lights from the scene
   */
  collectLights(): LightData[] {
    if (!this.scene) return [];
    
    this.visibleLights = [];
    
    this.scene.traverse((object) => {
      if (object instanceof THREE.Light) {
        const lightData: LightData = this.extractLightData(object);
        this.visibleLights.push(lightData);
      }
    });
    
    return this.visibleLights;
  }
  
  private extractLightData(light: THREE.Light): LightData {
    const position = new THREE.Vector3();
    const direction = new THREE.Vector3(0, 0, -1);
    
    light.getWorldPosition(position);
    direction.set(0, 0, -1).applyQuaternion(light.quaternion);
    
    const lightData: LightData = {
      light,
      position,
      direction,
      color: light.color.clone(),
      intensity: light.intensity,
      range: 0,
      type: 'ambient',
      castShadow: light.castShadow ?? false
    };
    
    if (light instanceof THREE.DirectionalLight) {
      lightData.type = 'directional';
      lightData.range = Infinity;
    } else if (light instanceof THREE.PointLight) {
      lightData.type = 'point';
      lightData.range = light.distance || 100;
    } else if (light instanceof THREE.SpotLight) {
      lightData.type = 'spot';
      lightData.range = light.distance || 100;
    }
    
    return lightData;
  }
  
  /**
   * Perform tile-based light culling
   */
  performTileCulling(): Map<string, LightData[]> {
    const tiles = new Map<string, LightData[]>();
    
    if (!this.camera || !('aspect' in this.camera)) return tiles;
    
    const camera = this.camera as THREE.PerspectiveCamera;
    const screenWidth = this.renderer?.domElement.width ?? 1920;
    const screenHeight = this.renderer?.domElement.height ?? 1080;
    
    const tilesX = Math.ceil(screenWidth / this.tileSize);
    const tilesY = Math.ceil(screenHeight / this.tileSize);
    
    // For each tile, find lights that affect it
    for (let x = 0; x < tilesX; x++) {
      for (let y = 0; y < tilesY; y++) {
        const key = `${x}_${y}`;
        const tileLights: LightData[] = [];
        
        // Simple bounds check for point lights
        for (const light of this.visibleLights) {
          if (light.type === 'ambient' || light.type === 'directional') {
            // Ambient and directional lights affect all tiles
            tileLights.push(light);
          } else if (light.type === 'point') {
            // Check if point light affects this tile
            if (this.lightAffectsTile(light, x, y, camera, screenWidth, screenHeight)) {
              tileLights.push(light);
            }
          }
        }
        
        tiles.set(key, tileLights.slice(0, this.maxLightsPerTile));
      }
    }
    
    return tiles;
  }
  
  private lightAffectsTile(
    light: LightData,
    tileX: number,
    tileY: number,
    camera: THREE.PerspectiveCamera,
    screenWidth: number,
    screenHeight: number
  ): boolean {
    // Simplified check - project light position to screen space
    const projected = light.position.clone().project(camera);
    
    const lightScreenX = (projected.x + 1) * screenWidth / 2;
    const lightScreenY = (1 - projected.y) * screenHeight / 2;
    
    const tileCenterX = tileX * this.tileSize + this.tileSize / 2;
    const tileCenterY = tileY * this.tileSize + this.tileSize / 2;
    
    // Check distance from light to tile center
    const dx = lightScreenX - tileCenterX;
    const dy = lightScreenY - tileCenterY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Rough estimate of light influence radius on screen
    const lightRadiusScreen = (light.range / (camera.position.distanceTo(light.position) + 1)) * screenHeight;
    
    return distance < lightRadiusScreen + this.tileSize;
  }
  
  /**
   * Perform clustered shading culling (3D grid)
   */
  performClusteredCulling(): Map<string, LightData[]> {
    const clusters = new Map<string, LightData[]>();
    
    if (!this.camera) return clusters;
    
    // Create depth slices
    const camera = this.camera as THREE.PerspectiveCamera | THREE.OrthographicCamera;
    const near = camera.near;
    const far = camera.far;
    
    for (let z = 0; z < this.clusterDepth; z++) {
      const zNear = near * Math.pow(far / near, z / this.clusterDepth);
      const zFar = near * Math.pow(far / near, (z + 1) / this.clusterDepth);
      
      for (const light of this.visibleLights) {
        if (light.type === 'point') {
          const lightDist = this.camera.position.distanceTo(light.position);
          
          // Check if light affects this depth slice
          if (lightDist - light.range < zFar && lightDist + light.range > zNear) {
            const key = `cluster_${z}`;
            if (!clusters.has(key)) {
              clusters.set(key, []);
            }
            clusters.get(key)!.push(light);
          }
        }
      }
    }
    
    return clusters;
  }
  
  /**
   * Frustum culling for objects
   */
  performFrustumCulling(objects: THREE.Object3D[]): THREE.Object3D[] {
    if (!this.camera) return objects;
    
    // Update frustum
    this.projScreenMatrix.multiplyMatrices(
      this.camera.projectionMatrix,
      this.camera.matrixWorldInverse
    );
    this.frustum.setFromProjectionMatrix(this.projScreenMatrix);
    
    return objects.filter((obj) => {
      // Compute bounding sphere
      if (obj instanceof THREE.Mesh || obj instanceof THREE.SkinnedMesh) {
        const geometry = obj.geometry;
        if (geometry.boundingSphere === null) {
          geometry.computeBoundingSphere();
        }
        
        if (geometry.boundingSphere) {
          const sphere = geometry.boundingSphere.clone();
          sphere.applyMatrix4(obj.matrixWorld);
          return this.frustum.intersectsSphere(sphere);
        }
      }
      return true; // Keep objects without geometry
    });
  }
  
  getVisibleLights(): LightData[] {
    return this.visibleLights;
  }
  
  dispose(): void {
    this.visibleLights = [];
    this.culledLights.clear();
  }
}

// ============================================
// CULLING SYSTEM
// ============================================

/**
 * Comprehensive culling system
 */
export class CullingSystem {
  private frustum: THREE.Frustum = new THREE.Frustum();
  private projScreenMatrix: THREE.Matrix4 = new THREE.Matrix4();
  
  // Occlusion query (hardware)
  private occlusionQueries: Map<string, WebGLQuery> = new Map();
  private occlusionResults: Map<string, boolean> = new Map();
  
  // Distance culling
  private distanceCullingEnabled: boolean = true;
  private maxDrawDistance: number = 1000;
  
  // Portal culling
  private portals: THREE.Object3D[] = [];
  
  // Stats
  private culledCount: number = 0;
  
  constructor() {}
  
  /**
   * Frustum culling implementation
   */
  frustumCull(objects: THREE.Object3D[], camera: THREE.Camera): THREE.Object3D[] {
    this.projScreenMatrix.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );
    this.frustum.setFromProjectionMatrix(this.projScreenMatrix);
    
    this.culledCount = 0;
    
    return objects.filter((obj) => {
      if (!this.isInFrustum(obj)) {
        this.culledCount++;
        return false;
      }
      return true;
    });
  }
  
  private isInFrustum(obj: THREE.Object3D): boolean {
    // Get bounding volume
    const boundingSphere = this.getBoundingSphere(obj);
    
    if (boundingSphere) {
      return this.frustum.intersectsSphere(boundingSphere);
    }
    
    // Fallback to bounding box
    const boundingBox = this.getBoundingBox(obj);
    if (boundingBox) {
      return this.frustum.intersectsBox(boundingBox);
    }
    
    return true; // Keep if no bounding volume
  }
  
  private getBoundingSphere(obj: THREE.Object3D): THREE.Sphere | null {
    if (obj instanceof THREE.Mesh) {
      const geometry = obj.geometry;
      if (geometry.boundingSphere === null) {
        geometry.computeBoundingSphere();
      }
      if (geometry.boundingSphere) {
        const sphere = geometry.boundingSphere.clone();
        sphere.applyMatrix4(obj.matrixWorld);
        return sphere;
      }
    }
    return null;
  }
  
  private getBoundingBox(obj: THREE.Object3D): THREE.Box3 | null {
    const box = new THREE.Box3().setFromObject(obj);
    if (!box.isEmpty()) {
      return box;
    }
    return null;
  }
  
  /**
   * Distance culling
   */
  distanceCull(objects: THREE.Object3D[], camera: THREE.Camera, maxDistance?: number): THREE.Object3D[] {
    if (!this.distanceCullingEnabled) return objects;
    
    const maxDist = maxDistance ?? this.maxDrawDistance;
    const cameraPosition = camera.position;
    
    return objects.filter((obj) => {
      const distance = cameraPosition.distanceTo(obj.position);
      if (distance > maxDist) {
        this.culledCount++;
        return false;
      }
      return true;
    });
  }
  
  /**
   * Occlusion culling (using hardware queries)
   */
  occlusionCull(objects: THREE.Object3D[], renderer: THREE.WebGLRenderer): THREE.Object3D[] {
    // Note: Full occlusion culling requires WebGL2 queries
    // This is a simplified implementation
    
    const gl = renderer.getContext();
    if (!('createQuery' in gl)) {
      return objects; // WebGL2 not available
    }
    
    const visibleObjects: THREE.Object3D[] = [];
    
    for (const obj of objects) {
      const objId = obj.uuid;
      
      // Check previous frame's result
      if (this.occlusionResults.get(objId) === false) {
        // Object was occluded last frame, check again
        this.culledCount++;
        continue;
      }
      
      visibleObjects.push(obj);
    }
    
    return visibleObjects;
  }
  
  /**
   * Portal culling for indoor scenes
   */
  portalCull(objects: THREE.Object3D[], camera: THREE.Camera): THREE.Object3D[] {
    if (this.portals.length === 0) return objects;
    
    // Find which portal the camera is looking through
    const visiblePortals = this.portals.filter((portal) => {
      // Check if portal is in view frustum
      return this.isInFrustum(portal);
    });
    
    if (visiblePortals.length === 0) {
      return objects; // No portals visible, show all
    }
    
    // For now, return all objects (full portal culling requires room/sector structure)
    return objects;
  }
  
  /**
   * Add a portal for portal culling
   */
  addPortal(portal: THREE.Object3D): void {
    this.portals.push(portal);
  }
  
  /**
   * Remove a portal
   */
  removePortal(portal: THREE.Object3D): void {
    const index = this.portals.indexOf(portal);
    if (index !== -1) {
      this.portals.splice(index, 1);
    }
  }
  
  /**
   * Combined culling pass
   */
  performFullCulling(
    objects: THREE.Object3D[],
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    config: { frustum: boolean; occlusion: boolean; distance: boolean }
  ): THREE.Object3D[] {
    let result = objects;
    this.culledCount = 0;
    
    if (config.frustum) {
      result = this.frustumCull(result, camera);
    }
    
    if (config.distance) {
      result = this.distanceCull(result, camera);
    }
    
    if (config.occlusion) {
      result = this.occlusionCull(result, renderer);
    }
    
    return result;
  }
  
  getCulledCount(): number {
    return this.culledCount;
  }
  
  setMaxDrawDistance(distance: number): void {
    this.maxDrawDistance = distance;
  }
  
  dispose(): void {
    this.portals = [];
    this.occlusionQueries.clear();
    this.occlusionResults.clear();
  }
}

// ============================================
// BATCHING SYSTEM
// ============================================

/**
 * Static and dynamic batching with GPU instancing
 */
export class BatchingSystem {
  private renderer: THREE.WebGLRenderer | null = null;
  
  // Batched objects
  private staticBatches: Map<string, THREE.InstancedMesh> = new Map();
  private dynamicBatches: Map<string, THREE.Group> = new Map();
  
  // Instance data
  private instanceData: Map<string, THREE.Matrix4[]> = new Map();
  
  // Stats
  private batchedDrawCalls: number = 0;
  private instancedDrawCalls: number = 0;
  
  constructor() {}
  
  initialize(renderer: THREE.WebGLRenderer): void {
    this.renderer = renderer;
  }
  
  /**
   * Analyze objects for batching opportunities
   */
  analyzeBatches(objects: THREE.Object3D[]): Map<string, THREE.Object3D[]> {
    const batches = new Map<string, THREE.Object3D[]>();
    
    for (const obj of objects) {
      if (obj instanceof THREE.Mesh) {
        const key = this.getBatchKey(obj);
        if (!batches.has(key)) {
          batches.set(key, []);
        }
        batches.get(key)!.push(obj);
      }
    }
    
    return batches;
  }
  
  /**
   * Generate batch key from material and geometry
   */
  private getBatchKey(mesh: THREE.Mesh): string {
    const geometry = mesh.geometry;
    const material = mesh.material;
    
    const geometryId = geometry.uuid;
    const materialId = Array.isArray(material) 
      ? material.map(m => m.uuid).join('_')
      : material.uuid;
    
    return `${geometryId}_${materialId}`;
  }
  
  /**
   * Create static batch for objects that don't move
   */
  createStaticBatch(objects: THREE.Mesh[]): THREE.InstancedMesh | null {
    if (objects.length < 2) return null;
    
    const firstMesh = objects[0];
    const geometry = firstMesh.geometry.clone();
    const material = firstMesh.material;
    
    const instancedMesh = new THREE.InstancedMesh(
      geometry,
      material,
      objects.length
    );
    
    const matrix = new THREE.Matrix4();
    
    for (let i = 0; i < objects.length; i++) {
      objects[i].updateMatrixWorld();
      matrix.copy(objects[i].matrixWorld);
      instancedMesh.setMatrixAt(i, matrix);
    }
    
    instancedMesh.instanceMatrix.needsUpdate = true;
    
    this.batchedDrawCalls += objects.length - 1;
    this.instancedDrawCalls++;
    
    return instancedMesh;
  }
  
  /**
   * Create dynamic batch for moving objects
   */
  createDynamicBatch(objects: THREE.Mesh[]): THREE.Group {
    const group = new THREE.Group();
    group.name = 'DynamicBatch';
    
    // Merge geometries
    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];
    
    for (const obj of objects) {
      if (obj.geometry) {
        const geo = obj.geometry.clone();
        geo.applyMatrix4(obj.matrixWorld);
        geometries.push(geo);
        if (!Array.isArray(obj.material)) {
          materials.push(obj.material);
        }
      }
    }
    
    if (geometries.length > 0) {
      const mergedGeometry = this.mergeGeometries(geometries);
      const mergedMesh = new THREE.Mesh(mergedGeometry, materials);
      group.add(mergedMesh);
      
      this.batchedDrawCalls += objects.length - 1;
    }
    
    return group;
  }
  
  /**
   * Merge multiple geometries into one
   */
  private mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    
    let indexOffset = 0;
    
    for (const geo of geometries) {
      const posAttr = geo.getAttribute('position');
      const normAttr = geo.getAttribute('normal');
      const uvAttr = geo.getAttribute('uv');
      const indexAttr = geo.getIndex();
      
      if (posAttr) {
        for (let i = 0; i < posAttr.count; i++) {
          positions.push(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
        }
      }
      
      if (normAttr) {
        for (let i = 0; i < normAttr.count; i++) {
          normals.push(normAttr.getX(i), normAttr.getY(i), normAttr.getZ(i));
        }
      }
      
      if (uvAttr) {
        for (let i = 0; i < uvAttr.count; i++) {
          uvs.push(uvAttr.getX(i), uvAttr.getY(i));
        }
      }
      
      if (indexAttr) {
        for (let i = 0; i < indexAttr.count; i++) {
          indices.push(indexAttr.getX(i) + indexOffset);
        }
        indexOffset += posAttr?.count ?? 0;
      }
    }
    
    const merged = new THREE.BufferGeometry();
    
    if (positions.length > 0) {
      merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    }
    if (normals.length > 0) {
      merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    }
    if (uvs.length > 0) {
      merged.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    }
    if (indices.length > 0) {
      merged.setIndex(indices);
    }
    
    return merged;
  }
  
  /**
   * Update static batch with new transforms
   */
  updateStaticBatch(batchId: string, transforms: THREE.Matrix4[]): void {
    const batch = this.staticBatches.get(batchId);
    if (batch) {
      for (let i = 0; i < transforms.length && i < batch.count; i++) {
        batch.setMatrixAt(i, transforms[i]);
      }
      batch.instanceMatrix.needsUpdate = true;
    }
  }
  
  /**
   * Material sorting for optimal rendering
   */
  sortObjectsByMaterial(objects: THREE.Object3D[]): THREE.Object3D[] {
    return objects.sort((a, b) => {
      const aMaterial = this.getMaterialId(a);
      const bMaterial = this.getMaterialId(b);
      return aMaterial.localeCompare(bMaterial);
    });
  }
  
  /**
   * Sort objects by distance from camera
   */
  sortObjectsByDistance(
    objects: THREE.Object3D[],
    camera: THREE.Camera,
    mode: 'frontToBack' | 'backToFront'
  ): THREE.Object3D[] {
    const cameraPosition = camera.position;
    
    const sorted = objects.map((obj) => ({
      object: obj,
      distance: cameraPosition.distanceTo(obj.position)
    }));
    
    sorted.sort((a, b) => {
      return mode === 'frontToBack' 
        ? a.distance - b.distance 
        : b.distance - a.distance;
    });
    
    return sorted.map((item) => item.object);
  }
  
  private getMaterialId(obj: THREE.Object3D): string {
    if (obj instanceof THREE.Mesh) {
      const material = obj.material;
      if (Array.isArray(material)) {
        return material.map((m) => m.uuid).join('_');
      }
      return material.uuid;
    }
    return '';
  }
  
  getBatchedDrawCalls(): number {
    return this.batchedDrawCalls;
  }
  
  getInstancedDrawCalls(): number {
    return this.instancedDrawCalls;
  }
  
  dispose(): void {
    this.staticBatches.forEach((batch) => batch.dispose());
    this.dynamicBatches.forEach((batch) => batch.clear());
    this.staticBatches.clear();
    this.dynamicBatches.clear();
    this.instanceData.clear();
  }
}

// ============================================
// FORWARD RENDERER
// ============================================

/**
 * Forward rendering implementation with optimizations
 */
export class ForwardRenderer {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.Camera | null = null;
  
  // Render targets
  private depthPrepassTarget: THREE.WebGLRenderTarget | null = null;
  
  // Systems
  private lightCulling: LightCulling;
  private batching: BatchingSystem;
  private culling: CullingSystem;
  
  // Configuration
  private zPrepassEnabled: boolean = false;
  private currentSortMode: 'frontToBack' | 'backToFront' | 'material' = 'backToFront';
  
  // Render lists
  private opaqueObjects: RenderableData[] = [];
  private transparentObjects: RenderableData[] = [];
  
  // Stats
  private stats: Partial<RenderStats> = {};
  
  constructor() {
    this.lightCulling = new LightCulling();
    this.batching = new BatchingSystem();
    this.culling = new CullingSystem();
  }
  
  initialize(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    config: PipelineConfig
  ): void {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    
    this.zPrepassEnabled = config.enableBatching;
    this.currentSortMode = config.sortMode;
    
    this.lightCulling.initialize(renderer, scene, camera);
    this.batching.initialize(renderer);
    
    // Create depth prepass target if enabled
    if (this.zPrepassEnabled) {
      this.createDepthPrepassTarget();
    }
  }
  
  private createDepthPrepassTarget(): void {
    const width = this.renderer?.domElement.width ?? 1920;
    const height = this.renderer?.domElement.height ?? 1080;
    
    this.depthPrepassTarget = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthTexture: new THREE.DepthTexture(width, height)
    });
  }
  
  /**
   * Main render function
   */
  render(): RenderStats {
    if (!this.renderer || !this.scene || !this.camera) {
      return this.createEmptyStats();
    }
    
    const startTime = performance.now();
    
    // Collect and sort objects
    this.collectRenderables();
    
    // Perform light culling
    this.lightCulling.collectLights();
    
    // Z-prepass if enabled
    if (this.zPrepassEnabled && this.opaqueObjects.length > 0) {
      this.performZPrepass();
    }
    
    // Render opaque objects
    this.renderOpaqueObjects();
    
    // Render transparent objects
    this.renderTransparentObjects();
    
    const endTime = performance.now();
    
    this.stats.frameTime = endTime - startTime;
    this.stats.renderPath = RenderPath.FORWARD;
    
    return this.stats as RenderStats;
  }
  
  private collectRenderables(): void {
    this.opaqueObjects = [];
    this.transparentObjects = [];
    
    if (!this.scene || !this.camera) return;
    
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh && object.visible) {
        const renderable = this.createRenderableData(object);
        
        if (renderable.isTransparent) {
          this.transparentObjects.push(renderable);
        } else {
          this.opaqueObjects.push(renderable);
        }
      }
    });
    
    // Sort objects
    if (this.currentSortMode === 'material') {
      this.opaqueObjects.sort((a, b) => a.batchKey.localeCompare(b.batchKey));
    } else {
      this.opaqueObjects = this.sortByDistance(this.opaqueObjects, 'frontToBack');
    }
    
    // Transparent always sorted back to front
    this.transparentObjects = this.sortByDistance(this.transparentObjects, 'backToFront');
  }
  
  private createRenderableData(mesh: THREE.Mesh): RenderableData {
    const material = mesh.material as THREE.Material;
    const isTransparent = material.transparent || material.opacity < 1;
    const isInstanced = mesh instanceof THREE.InstancedMesh;
    
    return {
      object: mesh,
      material: mesh.material,
      geometry: mesh.geometry,
      distance: this.camera ? this.camera.position.distanceTo(mesh.position) : 0,
      isTransparent,
      isInstanced,
      instanceCount: isInstanced ? (mesh as THREE.InstancedMesh).count : 1,
      batchKey: this.getBatchKey(mesh)
    };
  }
  
  private getBatchKey(mesh: THREE.Mesh): string {
    const material = mesh.material as THREE.Material;
    return `${mesh.geometry.uuid}_${material.uuid}`;
  }
  
  private sortByDistance(
    objects: RenderableData[],
    mode: 'frontToBack' | 'backToFront'
  ): RenderableData[] {
    return objects.sort((a, b) => {
      return mode === 'frontToBack' ? a.distance - b.distance : b.distance - a.distance;
    });
  }
  
  private performZPrepass(): void {
    if (!this.renderer || !this.scene || !this.camera || !this.depthPrepassTarget) return;
    
    // Render depth only
    this.renderer.setRenderTarget(this.depthPrepassTarget);
    this.renderer.clear(true, true, true);
    
    const depthMaterial = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking
    });
    
    for (const renderable of this.opaqueObjects) {
      if (renderable.object instanceof THREE.Mesh) {
        this.renderer.render(
          new THREE.Scene().add(renderable.object.clone()),
          this.camera
        );
      }
    }
    
    this.renderer.setRenderTarget(null);
  }
  
  private renderOpaqueObjects(): void {
    if (!this.renderer || !this.scene || !this.camera) return;
    
    for (const renderable of this.opaqueObjects) {
      if (renderable.object instanceof THREE.Mesh) {
        this.renderer.render(
          this.createTemporaryScene(renderable.object),
          this.camera
        );
        this.stats.drawCalls = (this.stats.drawCalls ?? 0) + 1;
        this.stats.triangles = (this.stats.triangles ?? 0) + 
          (renderable.geometry.index?.count ?? renderable.geometry.attributes.position.count) / 3;
      }
    }
  }
  
  private renderTransparentObjects(): void {
    if (!this.renderer || !this.scene || !this.camera) return;
    
    for (const renderable of this.transparentObjects) {
      if (renderable.object instanceof THREE.Mesh) {
        this.renderer.render(
          this.createTemporaryScene(renderable.object),
          this.camera
        );
        this.stats.drawCalls = (this.stats.drawCalls ?? 0) + 1;
      }
    }
  }
  
  private createTemporaryScene(object: THREE.Object3D): THREE.Scene {
    const tempScene = new THREE.Scene();
    tempScene.add(object);
    return tempScene;
  }
  
  private createEmptyStats(): RenderStats {
    return {
      drawCalls: 0,
      triangles: 0,
      vertices: 0,
      textures: 0,
      shadersCompiled: 0,
      frameTime: 0,
      gpuTime: 0,
      renderPath: RenderPath.FORWARD,
      culledObjects: 0,
      batchedDrawCalls: 0,
      instancedDrawCalls: 0,
      lightsProcessed: 0,
      shadowsRendered: 0
    };
  }
  
  resize(width: number, height: number): void {
    if (this.depthPrepassTarget) {
      this.depthPrepassTarget.dispose();
      this.depthPrepassTarget = new THREE.WebGLRenderTarget(width, height, {
        depthTexture: new THREE.DepthTexture(width, height)
      });
    }
  }
  
  setSortMode(mode: 'frontToBack' | 'backToFront' | 'material'): void {
    this.currentSortMode = mode;
  }
  
  setZPrepassEnabled(enabled: boolean): void {
    this.zPrepassEnabled = enabled;
    if (enabled && !this.depthPrepassTarget && this.renderer) {
      this.createDepthPrepassTarget();
    }
  }
  
  dispose(): void {
    this.depthPrepassTarget?.dispose();
    this.lightCulling.dispose();
    this.batching.dispose();
    this.culling.dispose();
  }
}

// ============================================
// DEFERRED RENDERER
// ============================================

/**
 * Deferred rendering implementation with G-Buffer
 */
export class DeferredRenderer {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.Camera | null = null;
  
  // G-Buffer
  private gBuffer: GBuffer | null = null;
  
  // Render targets
  private lightAccumulationTarget: THREE.WebGLRenderTarget | null = null;
  private shadingTarget: THREE.WebGLRenderTarget | null = null;
  
  // Materials for deferred passes
  private gBufferMaterial: THREE.ShaderMaterial | null = null;
  private lightingMaterial: THREE.ShaderMaterial | null = null;
  private compositeMaterial: THREE.ShaderMaterial | null = null;
  
  // Full screen quad
  private fullscreenQuad: THREE.Mesh | null = null;
  
  // Systems
  private lightCulling: LightCulling;
  private culling: CullingSystem;
  
  // Transparent objects (forward rendered)
  private transparentObjects: THREE.Mesh[] = [];
  
  // Stats
  private stats: Partial<RenderStats> = {};
  
  // Configuration
  private width: number = 1920;
  private height: number = 1080;
  
  constructor() {
    this.lightCulling = new LightCulling();
    this.culling = new CullingSystem();
  }
  
  initialize(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    config: PipelineConfig
  ): void {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    
    this.width = renderer.domElement.width;
    this.height = renderer.domElement.height;
    
    // Create G-Buffer
    this.gBuffer = new GBuffer(this.width, this.height);
    
    // Create render targets
    this.createRenderTargets();
    
    // Create materials
    this.createMaterials();
    
    // Create fullscreen quad
    this.createFullscreenQuad();
    
    // Initialize systems
    this.lightCulling.initialize(renderer, scene, camera);
  }
  
  private createRenderTargets(): void {
    // Light accumulation buffer
    this.lightAccumulationTarget = new THREE.WebGLRenderTarget(
      this.width,
      this.height,
      {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.HalfFloatType
      }
    );
    
    // Final shading buffer
    this.shadingTarget = new THREE.WebGLRenderTarget(
      this.width,
      this.height,
      {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.HalfFloatType
      }
    );
  }
  
  private createMaterials(): void {
    // G-Buffer material (writes to MRT)
    this.gBufferMaterial = new THREE.ShaderMaterial({
      uniforms: {
        albedoMap: { value: null },
        normalMap: { value: null },
        metallicRoughnessMap: { value: null },
        emissiveMap: { value: null },
        aoMap: { value: null },
        albedoColor: { value: new THREE.Color(1, 1, 1) },
        metallic: { value: 0.5 },
        roughness: { value: 0.5 },
        emissiveColor: { value: new THREE.Color(0, 0, 0) },
        emissiveIntensity: { value: 1.0 }
      },
      vertexShader: `
        varying vec3 vPosition;
        varying vec3 vNormal;
        varying vec2 vUv;
        
        void main() {
          vPosition = (modelMatrix * vec4(position, 1.0)).xyz;
          vNormal = normalize(normalMatrix * normal);
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 albedoColor;
        uniform float metallic;
        uniform float roughness;
        uniform vec3 emissiveColor;
        uniform float emissiveIntensity;
        
        varying vec3 vPosition;
        varying vec3 vNormal;
        varying vec2 vUv;
        
        layout(location = 0) out vec4 albedoAlpha;
        layout(location = 1) out vec4 normalMetallic;
        layout(location = 2) out vec4 positionRoughness;
        layout(location = 3) out vec4 emissiveAO;
        
        void main() {
          // Albedo + Alpha
          albedoAlpha = vec4(albedoColor, 1.0);
          
          // Normal + Metallic
          normalMetallic = vec4(normalize(vNormal) * 0.5 + 0.5, metallic);
          
          // Position + Roughness
          positionRoughness = vec4(vPosition, roughness);
          
          // Emissive + AO
          emissiveAO = vec4(emissiveColor * emissiveIntensity, 1.0);
        }
      `
    });
    
    // Lighting material
    this.lightingMaterial = new THREE.ShaderMaterial({
      uniforms: {
        albedoBuffer: { value: null },
        normalBuffer: { value: null },
        positionBuffer: { value: null },
        emissiveBuffer: { value: null },
        depthBuffer: { value: null },
        lightPosition: { value: new THREE.Vector3() },
        lightColor: { value: new THREE.Color(1, 1, 1) },
        lightIntensity: { value: 1.0 },
        lightRange: { value: 100.0 },
        lightType: { value: 0 },
        cameraPosition: { value: new THREE.Vector3() },
        inverseProjection: { value: new THREE.Matrix4() },
        inverseView: { value: new THREE.Matrix4() }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D albedoBuffer;
        uniform sampler2D normalBuffer;
        uniform sampler2D positionBuffer;
        uniform sampler2D emissiveBuffer;
        uniform sampler2D depthBuffer;
        
        uniform vec3 lightPosition;
        uniform vec3 lightColor;
        uniform float lightIntensity;
        uniform float lightRange;
        uniform int lightType;
        uniform vec3 cameraPosition;
        
        varying vec2 vUv;
        
        void main() {
          vec4 albedoData = texture2D(albedoBuffer, vUv);
          vec4 normalData = texture2D(normalBuffer, vUv);
          vec4 positionData = texture2D(positionBuffer, vUv);
          
          vec3 albedo = albedoData.rgb;
          vec3 normal = normalData.rgb * 2.0 - 1.0;
          float metallic = normalData.a;
          vec3 position = positionData.rgb;
          float roughness = positionData.a;
          
          // Calculate lighting
          vec3 lightDir;
          float attenuation = 1.0;
          
          if (lightType == 0) {
            // Directional light
            lightDir = normalize(-lightPosition);
          } else if (lightType == 1) {
            // Point light
            vec3 lightVec = lightPosition - position;
            float distance = length(lightVec);
            lightDir = normalize(lightVec);
            attenuation = 1.0 / (1.0 + (distance / lightRange) * (distance / lightRange));
          } else {
            // Spot light
            lightDir = normalize(lightPosition - position);
            attenuation = 1.0;
          }
          
          // Lambert diffuse
          float NdotL = max(dot(normal, lightDir), 0.0);
          vec3 diffuse = albedo * NdotL;
          
          // Specular (Blinn-Phong)
          vec3 viewDir = normalize(cameraPosition - position);
          vec3 halfDir = normalize(lightDir + viewDir);
          float spec = pow(max(dot(normal, halfDir), 0.0), 32.0 * (1.0 - roughness));
          vec3 specular = vec3(spec) * metallic;
          
          vec3 finalColor = (diffuse + specular) * lightColor * lightIntensity * attenuation;
          
          gl_FragColor = vec4(finalColor, 1.0);
        }
      `,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false
    });
    
    // Composite material
    this.compositeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        albedoBuffer: { value: null },
        lightAccumBuffer: { value: null },
        emissiveBuffer: { value: null }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D albedoBuffer;
        uniform sampler2D lightAccumBuffer;
        uniform sampler2D emissiveBuffer;
        
        varying vec2 vUv;
        
        void main() {
          vec3 albedo = texture2D(albedoBuffer, vUv).rgb;
          vec3 lighting = texture2D(lightAccumBuffer, vUv).rgb;
          vec3 emissive = texture2D(emissiveBuffer, vUv).rgb;
          
          vec3 ambient = albedo * 0.1;
          vec3 finalColor = albedo * lighting + ambient + emissive;
          
          // Tone mapping
          finalColor = finalColor / (finalColor + vec3(1.0));
          
          gl_FragColor = vec4(finalColor, 1.0);
        }
      `
    });
  }
  
  private createFullscreenQuad(): void {
    const geometry = new THREE.PlaneGeometry(2, 2);
    this.fullscreenQuad = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ visible: false }));
  }
  
  /**
   * Main render function
   */
  render(): RenderStats {
    if (!this.renderer || !this.scene || !this.camera || !this.gBuffer) {
      return this.createEmptyStats();
    }
    
    const startTime = performance.now();
    
    // Collect transparent objects for forward pass
    this.collectTransparentObjects();
    
    // Pass 1: G-Buffer generation
    this.renderGBufferPass();
    
    // Pass 2: Light accumulation
    this.renderLightingPass();
    
    // Pass 3: Shading/composition
    this.renderShadingPass();
    
    // Pass 4: Forward pass for transparent objects
    this.renderTransparentPass();
    
    const endTime = performance.now();
    
    this.stats.frameTime = endTime - startTime;
    this.stats.renderPath = RenderPath.DEFERRED;
    
    return this.stats as RenderStats;
  }
  
  private collectTransparentObjects(): void {
    this.transparentObjects = [];
    
    if (!this.scene) return;
    
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh && object.visible) {
        const material = object.material as THREE.Material;
        if (material.transparent || material.opacity < 1) {
          this.transparentObjects.push(object);
        }
      }
    });
  }
  
  private renderGBufferPass(): void {
    if (!this.renderer || !this.scene || !this.camera || !this.gBuffer) return;
    
    const gBufferTarget = this.gBuffer.getRenderTarget();
    if (!gBufferTarget) return;
    
    this.renderer.setRenderTarget(gBufferTarget);
    this.renderer.clear(true, true, true);
    
    // Override materials for G-Buffer write
    this.scene.overrideMaterial = this.gBufferMaterial;
    this.renderer.render(this.scene, this.camera);
    this.scene.overrideMaterial = null;
    
    this.stats.drawCalls = (this.stats.drawCalls ?? 0) + 1;
  }
  
  private renderLightingPass(): void {
    if (!this.renderer || !this.scene || !this.camera || !this.lightAccumulationTarget) return;
    
    this.renderer.setRenderTarget(this.lightAccumulationTarget);
    this.renderer.clear(true, true, true);
    
    // Collect lights
    const lights = this.lightCulling.collectLights();
    
    // Render each light
    for (const lightData of lights) {
      if (lightData.type === 'ambient') continue; // Ambient handled in composite
      
      // Update lighting uniforms
      if (this.lightingMaterial) {
        this.lightingMaterial.uniforms.albedoBuffer.value = this.gBuffer?.albedoTexture;
        this.lightingMaterial.uniforms.normalBuffer.value = this.gBuffer?.normalTexture;
        this.lightingMaterial.uniforms.positionBuffer.value = this.gBuffer?.positionTexture;
        this.lightingMaterial.uniforms.emissiveBuffer.value = this.gBuffer?.emissiveTexture;
        this.lightingMaterial.uniforms.depthBuffer.value = this.gBuffer?.depthTexture;
        this.lightingMaterial.uniforms.lightPosition.value = lightData.position;
        this.lightingMaterial.uniforms.lightColor.value = lightData.color;
        this.lightingMaterial.uniforms.lightIntensity.value = lightData.intensity;
        this.lightingMaterial.uniforms.lightRange.value = lightData.range;
        this.lightingMaterial.uniforms.cameraPosition.value = this.camera.position;
        
        const lightTypeMap = { directional: 0, point: 1, spot: 2, ambient: 3 };
        this.lightingMaterial.uniforms.lightType.value = lightTypeMap[lightData.type];
        
        // Render fullscreen quad with lighting
        this.fullscreenQuad!.material = this.lightingMaterial;
        const tempScene = new THREE.Scene();
        tempScene.add(this.fullscreenQuad!);
        this.renderer.render(tempScene, this.createOrthoCamera());
      }
      
      this.stats.lightsProcessed = (this.stats.lightsProcessed ?? 0) + 1;
    }
    
    this.stats.drawCalls = (this.stats.drawCalls ?? 0) + lights.length;
  }
  
  private renderShadingPass(): void {
    if (!this.renderer || !this.shadingTarget) return;
    
    this.renderer.setRenderTarget(this.shadingTarget);
    
    if (this.compositeMaterial && this.fullscreenQuad) {
      this.compositeMaterial.uniforms.albedoBuffer.value = this.gBuffer?.albedoTexture;
      this.compositeMaterial.uniforms.lightAccumBuffer.value = this.lightAccumulationTarget?.texture;
      this.compositeMaterial.uniforms.emissiveBuffer.value = this.gBuffer?.emissiveTexture;
      
      this.fullscreenQuad.material = this.compositeMaterial;
      const tempScene = new THREE.Scene();
      tempScene.add(this.fullscreenQuad);
      this.renderer.render(tempScene, this.createOrthoCamera());
    }
    
    this.stats.drawCalls = (this.stats.drawCalls ?? 0) + 1;
  }
  
  private renderTransparentPass(): void {
    if (!this.renderer || !this.scene || !this.camera) return;
    
    this.renderer.setRenderTarget(null);
    
    // Sort transparent objects back to front
    const sorted = this.transparentObjects.sort((a, b) => {
      const distA = this.camera!.position.distanceTo(a.position);
      const distB = this.camera!.position.distanceTo(b.position);
      return distB - distA;
    });
    
    // Render with forward rendering
    for (const mesh of sorted) {
      const tempScene = new THREE.Scene();
      tempScene.add(mesh);
      this.renderer.render(tempScene, this.camera);
      this.stats.drawCalls = (this.stats.drawCalls ?? 0) + 1;
    }
  }
  
  private createOrthoCamera(): THREE.OrthographicCamera {
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    return camera;
  }
  
  private createEmptyStats(): RenderStats {
    return {
      drawCalls: 0,
      triangles: 0,
      vertices: 0,
      textures: 0,
      shadersCompiled: 0,
      frameTime: 0,
      gpuTime: 0,
      renderPath: RenderPath.DEFERRED,
      culledObjects: 0,
      batchedDrawCalls: 0,
      instancedDrawCalls: 0,
      lightsProcessed: 0,
      shadowsRendered: 0
    };
  }
  
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    
    this.gBuffer?.resize(width, height);
    this.lightAccumulationTarget?.setSize(width, height);
    this.shadingTarget?.setSize(width, height);
  }
  
  getGBuffer(): GBuffer | null {
    return this.gBuffer;
  }
  
  dispose(): void {
    this.gBuffer?.dispose();
    this.lightAccumulationTarget?.dispose();
    this.shadingTarget?.dispose();
    this.gBufferMaterial?.dispose();
    this.lightingMaterial?.dispose();
    this.compositeMaterial?.dispose();
    this.fullscreenQuad?.geometry.dispose();
    this.lightCulling.dispose();
    this.culling.dispose();
  }
}

// ============================================
// RENDER FEATURES
// ============================================

/**
 * Screen Space Reflections (SSR)
 */
export class SSRFeature implements RenderFeature {
  name = 'SSR';
  enabled = true;
  priority = 100;
  
  private renderer: THREE.WebGLRenderer | null = null;
  private renderTarget: THREE.WebGLRenderTarget | null = null;
  private material: THREE.ShaderMaterial | null = null;
  private fullscreenQuad: THREE.Mesh | null = null;
  
  initialize(renderer: THREE.WebGLRenderer): void {
    this.renderer = renderer;
    
    const width = renderer.domElement.width;
    const height = renderer.domElement.height;
    
    this.renderTarget = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType
    });
    
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        normalBuffer: { value: null },
        positionBuffer: { value: null },
        depthBuffer: { value: null },
        colorBuffer: { value: null },
        projectionMatrix: { value: new THREE.Matrix4() },
        viewMatrix: { value: new THREE.Matrix4() },
        cameraPosition: { value: new THREE.Vector3() },
        stepSize: { value: 0.1 },
        maxSteps: { value: 32 },
        thickness: { value: 0.5 }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D normalBuffer;
        uniform sampler2D positionBuffer;
        uniform sampler2D depthBuffer;
        uniform sampler2D colorBuffer;
        uniform mat4 projectionMatrix;
        uniform mat4 viewMatrix;
        uniform vec3 cameraPosition;
        uniform float stepSize;
        uniform int maxSteps;
        uniform float thickness;
        
        varying vec2 vUv;
        
        vec3 getViewPosition(vec2 uv, float depth) {
          vec4 clipPos = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
          vec4 viewPos = inverse(projectionMatrix) * clipPos;
          return viewPos.xyz / viewPos.w;
        }
        
        void main() {
          vec3 normal = texture2D(normalBuffer, vUv).rgb * 2.0 - 1.0;
          vec3 position = texture2D(positionBuffer, vUv).rgb;
          
          vec3 viewDir = normalize(cameraPosition - position);
          vec3 reflectDir = reflect(-viewDir, normal);
          
          vec3 currentPosition = position;
          vec3 currentStep = reflectDir * stepSize;
          
          float reflectionStrength = 0.0;
          vec3 reflectionColor = vec3(0.0);
          
          for (int i = 0; i < 32; i++) {
            if (i >= maxSteps) break;
            
            currentPosition += currentStep;
            
            vec4 projected = projectionMatrix * viewMatrix * vec4(currentPosition, 1.0);
            vec2 screenUv = projected.xy / projected.w * 0.5 + 0.5;
            
            if (screenUv.x < 0.0 || screenUv.x > 1.0 || 
                screenUv.y < 0.0 || screenUv.y > 1.0) break;
            
            float sampledDepth = texture2D(depthBuffer, screenUv).r;
            vec3 sampledPos = getViewPosition(screenUv, sampledDepth);
            
            float depthDiff = abs(currentPosition.z - sampledPos.z);
            
            if (depthDiff < thickness) {
              reflectionColor = texture2D(colorBuffer, screenUv).rgb;
              reflectionStrength = 1.0 - float(i) / float(maxSteps);
              break;
            }
          }
          
          gl_FragColor = vec4(reflectionColor * reflectionStrength, 1.0);
        }
      `
    });
    
    const geometry = new THREE.PlaneGeometry(2, 2);
    this.fullscreenQuad = new THREE.Mesh(geometry, this.material);
  }
  
  render(renderer: THREE.WebGLRenderer): void {
    if (!this.enabled || !this.renderTarget || !this.material) return;
    
    renderer.setRenderTarget(this.renderTarget);
    
    const tempScene = new THREE.Scene();
    tempScene.add(this.fullscreenQuad!);
    
    const orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    renderer.render(tempScene, orthoCamera);
  }
  
  dispose(): void {
    this.renderTarget?.dispose();
    this.material?.dispose();
    this.fullscreenQuad?.geometry.dispose();
  }
}

/**
 * Screen Space Ambient Occlusion (SSAO)
 */
export class SSAOFeature implements RenderFeature {
  name = 'SSAO';
  enabled = true;
  priority = 50;
  
  private renderer: THREE.WebGLRenderer | null = null;
  private renderTarget: THREE.WebGLRenderTarget | null = null;
  private material: THREE.ShaderMaterial | null = null;
  private fullscreenQuad: THREE.Mesh | null = null;
  
  // SSAO parameters
  private radius: number = 0.5;
  private intensity: number = 1.0;
  private samples: number = 16;
  
  initialize(renderer: THREE.WebGLRenderer): void {
    this.renderer = renderer;
    
    const width = renderer.domElement.width;
    const height = renderer.domElement.height;
    
    this.renderTarget = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType
    });
    
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        normalBuffer: { value: null },
        positionBuffer: { value: null },
        depthBuffer: { value: null },
        radius: { value: this.radius },
        intensity: { value: this.intensity },
        samples: { value: this.samples },
        projectionMatrix: { value: new THREE.Matrix4() }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D normalBuffer;
        uniform sampler2D positionBuffer;
        uniform sampler2D depthBuffer;
        uniform float radius;
        uniform float intensity;
        uniform int samples;
        uniform mat4 projectionMatrix;
        
        varying vec2 vUv;
        
        float random(vec2 co) {
          return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
        }
        
        void main() {
          vec3 normal = texture2D(normalBuffer, vUv).rgb * 2.0 - 1.0;
          vec3 position = texture2D(positionBuffer, vUv).rgb;
          float depth = texture2D(depthBuffer, vUv).r;
          
          float occlusion = 0.0;
          
          for (int i = 0; i < 16; i++) {
            if (i >= samples) break;
            
            vec2 sampleUv = vUv + vec2(
              random(vUv + float(i) * 0.1) - 0.5,
              random(vUv + float(i) * 0.2) - 0.5
            ) * radius;
            
            if (sampleUv.x < 0.0 || sampleUv.x > 1.0 || 
                sampleUv.y < 0.0 || sampleUv.y > 1.0) continue;
            
            vec3 samplePos = texture2D(positionBuffer, sampleUv).rgb;
            vec3 diff = samplePos - position;
            float dist = length(diff);
            
            vec3 sampleNormal = texture2D(normalBuffer, sampleUv).rgb * 2.0 - 1.0;
            
            float attenuation = 1.0 / (1.0 + dist * dist);
            float angleFactor = max(0.0, dot(normalize(diff), normal));
            
            occlusion += attenuation * angleFactor;
          }
          
          occlusion = 1.0 - (occlusion / float(samples)) * intensity;
          occlusion = clamp(occlusion, 0.0, 1.0);
          
          gl_FragColor = vec4(vec3(occlusion), 1.0);
        }
      `
    });
    
    const geometry = new THREE.PlaneGeometry(2, 2);
    this.fullscreenQuad = new THREE.Mesh(geometry, this.material);
  }
  
  render(renderer: THREE.WebGLRenderer): void {
    if (!this.enabled || !this.renderTarget || !this.material) return;
    
    renderer.setRenderTarget(this.renderTarget);
    
    const tempScene = new THREE.Scene();
    tempScene.add(this.fullscreenQuad!);
    
    const orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    renderer.render(tempScene, orthoCamera);
  }
  
  setRadius(radius: number): void {
    this.radius = radius;
    if (this.material) {
      this.material.uniforms.radius.value = radius;
    }
  }
  
  setIntensity(intensity: number): void {
    this.intensity = intensity;
    if (this.material) {
      this.material.uniforms.intensity.value = intensity;
    }
  }
  
  dispose(): void {
    this.renderTarget?.dispose();
    this.material?.dispose();
    this.fullscreenQuad?.geometry.dispose();
  }
}

/**
 * Shadow mapping feature
 */
export class ShadowFeature implements RenderFeature {
  name = 'Shadows';
  enabled = true;
  priority = 10;
  
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.Camera | null = null;
  
  // Shadow maps
  private shadowMaps: Map<string, THREE.WebGLRenderTarget> = new Map();
  private shadowCameras: Map<string, THREE.Camera> = new Map();
  
  // Configuration
  private shadowMapSize: number = 2048;
  private quality: 'low' | 'medium' | 'high' | 'ultra' = 'high';
  
  initialize(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    
    this.setupShadowMaps();
  }
  
  private setupShadowMaps(): void {
    if (!this.scene) return;
    
    // Find all lights with shadows enabled
    this.scene.traverse((object) => {
      if (object instanceof THREE.DirectionalLight && object.castShadow) {
        this.createShadowMap(object);
      } else if (object instanceof THREE.SpotLight && object.castShadow) {
        this.createShadowMap(object);
      }
    });
  }
  
  private createShadowMap(light: THREE.Light): void {
    const sizeMap = { low: 1024, medium: 2048, high: 4096, ultra: 8192 };
    const size = sizeMap[this.quality];
    
    const shadowTarget = new THREE.WebGLRenderTarget(size, size, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType
    });
    
    this.shadowMaps.set(light.uuid, shadowTarget);
    
    // Create shadow camera based on light type
    if (light instanceof THREE.DirectionalLight) {
      const shadowCamera = new THREE.OrthographicCamera(-50, 50, 50, -50, 0.1, 500);
      this.shadowCameras.set(light.uuid, shadowCamera);
    } else if (light instanceof THREE.SpotLight) {
      const shadowCamera = new THREE.PerspectiveCamera(light.angle * 180 / Math.PI, 1, 0.1, light.distance);
      this.shadowCameras.set(light.uuid, shadowCamera);
    }
  }
  
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
    if (!this.enabled) return;
    
    // Render shadow maps for each light
    this.shadowMaps.forEach((target, lightId) => {
      renderer.setRenderTarget(target);
      renderer.clear(true, true, true);
      
      const shadowCamera = this.shadowCameras.get(lightId);
      if (shadowCamera) {
        renderer.render(scene, shadowCamera);
      }
    });
    
    renderer.setRenderTarget(null);
  }
  
  setQuality(quality: 'low' | 'medium' | 'high' | 'ultra'): void {
    this.quality = quality;
    // Recreate shadow maps with new quality
    this.dispose();
    this.setupShadowMaps();
  }
  
  dispose(): void {
    this.shadowMaps.forEach((target) => target.dispose());
    this.shadowMaps.clear();
    this.shadowCameras.clear();
  }
}

/**
 * Volumetric lighting feature
 */
export class VolumetricLightingFeature implements RenderFeature {
  name = 'VolumetricLighting';
  enabled = false;
  priority = 200;
  
  private renderer: THREE.WebGLRenderer | null = null;
  private renderTarget: THREE.WebGLRenderTarget | null = null;
  private material: THREE.ShaderMaterial | null = null;
  private fullscreenQuad: THREE.Mesh | null = null;
  
  // Parameters
  private density: number = 0.01;
  private scattering: number = 0.5;
  private steps: number = 64;
  
  initialize(renderer: THREE.WebGLRenderer): void {
    this.renderer = renderer;
    
    const width = renderer.domElement.width;
    const height = renderer.domElement.height;
    
    this.renderTarget = new THREE.WebGLRenderTarget(width / 2, height / 2, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType
    });
    
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        depthBuffer: { value: null },
        lightPosition: { value: new THREE.Vector3() },
        lightColor: { value: new THREE.Color(1, 1, 1) },
        cameraPosition: { value: new THREE.Vector3() },
        density: { value: this.density },
        scattering: { value: this.scattering },
        steps: { value: this.steps }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D depthBuffer;
        uniform vec3 lightPosition;
        uniform vec3 lightColor;
        uniform vec3 cameraPosition;
        uniform float density;
        uniform float scattering;
        uniform int steps;
        
        varying vec2 vUv;
        
        void main() {
          vec3 rayStart = cameraPosition;
          vec3 rayDir = normalize(vec3(vUv * 2.0 - 1.0, -1.0));
          
          vec3 accumulatedLight = vec3(0.0);
          
          for (int i = 0; i < 64; i++) {
            if (i >= steps) break;
            
            float t = float(i) / float(steps) * 100.0;
            vec3 samplePos = rayStart + rayDir * t;
            
            float distToLight = length(lightPosition - samplePos);
            float attenuation = 1.0 / (1.0 + distToLight * 0.01);
            
            accumulatedLight += lightColor * density * scattering * attenuation;
          }
          
          gl_FragColor = vec4(accumulatedLight, 1.0);
        }
      `
    });
    
    const geometry = new THREE.PlaneGeometry(2, 2);
    this.fullscreenQuad = new THREE.Mesh(geometry, this.material);
  }
  
  render(renderer: THREE.WebGLRenderer): void {
    if (!this.enabled || !this.renderTarget || !this.material) return;
    
    renderer.setRenderTarget(this.renderTarget);
    
    const tempScene = new THREE.Scene();
    tempScene.add(this.fullscreenQuad!);
    
    const orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    renderer.render(tempScene, orthoCamera);
  }
  
  setDensity(density: number): void {
    this.density = density;
    if (this.material) {
      this.material.uniforms.density.value = density;
    }
  }
  
  dispose(): void {
    this.renderTarget?.dispose();
    this.material?.dispose();
    this.fullscreenQuad?.geometry.dispose();
  }
}

/**
 * Approximated Global Illumination
 */
export class GlobalIlluminationFeature implements RenderFeature {
  name = 'GlobalIllumination';
  enabled = false;
  priority = 150;
  
  private renderer: THREE.WebGLRenderer | null = null;
  private irradianceVolume: THREE.Data3DTexture | null = null;
  private material: THREE.ShaderMaterial | null = null;
  
  // Parameters
  private intensity: number = 1.0;
  private bounceCount: number = 1;
  
  initialize(renderer: THREE.WebGLRenderer): void {
    this.renderer = renderer;
    this.createIrradianceVolume();
  }
  
  private createIrradianceVolume(): void {
    const size = 32;
    const data = new Float32Array(size * size * size * 3);
    
    // Initialize with ambient color
    for (let i = 0; i < data.length; i += 3) {
      data[i] = 0.1;
      data[i + 1] = 0.1;
      data[i + 2] = 0.1;
    }
    
    this.irradianceVolume = new THREE.Data3DTexture(data, size, size, size);
    this.irradianceVolume.format = THREE.RGBFormat;
    this.irradianceVolume.type = THREE.FloatType;
    this.irradianceVolume.needsUpdate = true;
  }
  
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
    if (!this.enabled) return;
    
    // Light propagation volumes would be implemented here
    // For now, this is a placeholder for the GI approximation
  }
  
  setIntensity(intensity: number): void {
    this.intensity = intensity;
  }
  
  dispose(): void {
    this.irradianceVolume?.dispose();
    this.material?.dispose();
  }
}

// ============================================
// MAIN RENDER PIPELINE
// ============================================

/**
 * Main Render Pipeline class
 * Supports Forward, Deferred, Forward+ and Hybrid rendering paths
 */
export class RenderPipeline {
  // Core components
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.Camera | null = null;
  
  // Configuration
  private config: PipelineConfig;
  
  // Renderers
  private forwardRenderer: ForwardRenderer | null = null;
  private deferredRenderer: DeferredRenderer | null = null;
  
  // Systems
  private lightCulling: LightCulling;
  private batching: BatchingSystem;
  private culling: CullingSystem;
  
  // Features
  private features: Map<string, RenderFeature> = new Map();
  
  // Render targets
  private intermediateTarget: THREE.WebGLRenderTarget | null = null;
  private outputTarget: THREE.WebGLRenderTarget | null = null;
  
  // Resolution
  private width: number = 1920;
  private height: number = 1080;
  private renderScale: number = 1.0;
  
  // Stats
  private stats: RenderStats = {
    drawCalls: 0,
    triangles: 0,
    vertices: 0,
    textures: 0,
    shadersCompiled: 0,
    frameTime: 0,
    gpuTime: 0,
    renderPath: RenderPath.FORWARD,
    culledObjects: 0,
    batchedDrawCalls: 0,
    instancedDrawCalls: 0,
    lightsProcessed: 0,
    shadowsRendered: 0
  };
  
  // Frame timing
  private lastFrameTime: number = 0;
  private frameCount: number = 0;
  
  constructor(config: Partial<PipelineConfig> = {}) {
    this.config = { ...defaultPipelineConfig, ...config };
    
    // Initialize systems
    this.lightCulling = new LightCulling();
    this.batching = new BatchingSystem();
    this.culling = new CullingSystem();
    
    // Initialize default features
    this.features.set('ssr', new SSRFeature());
    this.features.set('ssao', new SSAOFeature());
    this.features.set('shadows', new ShadowFeature());
    this.features.set('volumetric', new VolumetricLightingFeature());
    this.features.set('gi', new GlobalIlluminationFeature());
  }
  
  /**
   * Initialize the render pipeline
   */
  initialize(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera
  ): void {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    
    this.width = renderer.domElement.width;
    this.height = renderer.domElement.height;
    this.renderScale = this.config.renderScale;
    
    // Initialize renderers
    this.forwardRenderer = new ForwardRenderer();
    this.forwardRenderer.initialize(renderer, scene, camera, this.config);
    
    this.deferredRenderer = new DeferredRenderer();
    this.deferredRenderer.initialize(renderer, scene, camera, this.config);
    
    // Initialize systems
    this.lightCulling.initialize(renderer, scene, camera);
    this.batching.initialize(renderer);
    
    // Initialize features
    this.features.forEach((feature) => {
      feature.initialize(renderer, scene, camera);
    });
    
    // Create render targets
    this.createRenderTargets();
    
    // Configure renderer
    this.configureRenderer();
  }
  
  private createRenderTargets(): void {
    const scaledWidth = Math.floor(this.width * this.renderScale);
    const scaledHeight = Math.floor(this.height * this.renderScale);
    
    // Intermediate render target
    this.intermediateTarget = new THREE.WebGLRenderTarget(
      scaledWidth,
      scaledHeight,
      {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.HalfFloatType,
        samples: this.config.msaa
      }
    );
    
    // Output render target
    this.outputTarget = new THREE.WebGLRenderTarget(
      this.width,
      this.height,
      {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.HalfFloatType
      }
    );
  }
  
  private configureRenderer(): void {
    if (!this.renderer) return;
    
    // Shadow configuration
    const shadowSizeMap = { low: 1024, medium: 2048, high: 4096, ultra: 8192 };
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    // Anisotropic filtering
    const maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.config.anisotropicFiltering = Math.min(this.config.anisotropicFiltering, maxAnisotropy);
    
    // Tone mapping
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    
    // Output color space
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
  }
  
  /**
   * Set the render path
   */
  setPath(path: RenderPath): void {
    this.config.path = path;
    this.stats.renderPath = path;
  }
  
  /**
   * Main render function
   */
  render(): void {
    if (!this.renderer || !this.scene || !this.camera) return;
    
    const startTime = performance.now();
    
    // Reset stats
    this.resetStats();
    
    // Pre-render culling
    this.performCulling();
    
    // Render based on path
    switch (this.config.path) {
      case RenderPath.FORWARD:
        this.renderForward();
        break;
      case RenderPath.DEFERRED:
        this.renderDeferred();
        break;
      case RenderPath.FORWARD_PLUS:
        this.renderForwardPlus();
        break;
      case RenderPath.HYBRID:
        this.renderHybrid();
        break;
    }
    
    // Post-render features
    this.renderFeatures();
    
    // Update stats
    const endTime = performance.now();
    this.stats.frameTime = endTime - startTime;
    this.stats.renderPath = this.config.path;
    
    // Get renderer stats
    const rendererInfo = this.renderer.info;
    this.stats.drawCalls = rendererInfo.render.calls;
    this.stats.triangles = rendererInfo.render.triangles;
    this.stats.vertices = rendererInfo.render.points;
    this.stats.textures = rendererInfo.memory.textures;
    this.stats.shadersCompiled = rendererInfo.programs?.length ?? 0;
    
    this.frameCount++;
  }
  
  private resetStats(): void {
    this.stats.drawCalls = 0;
    this.stats.triangles = 0;
    this.stats.vertices = 0;
    this.stats.lightsProcessed = 0;
    this.stats.shadowsRendered = 0;
    this.stats.culledObjects = 0;
    this.stats.batchedDrawCalls = 0;
    this.stats.instancedDrawCalls = 0;
  }
  
  private performCulling(): void {
    if (!this.config.enableFrustumCulling) return;
    
    // Collect all renderable objects
    const objects: THREE.Object3D[] = [];
    this.scene?.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.visible) {
        objects.push(obj);
      }
    });
    
    // Perform culling
    const visibleObjects = this.culling.performFullCulling(
      objects,
      this.camera!,
      this.renderer!,
      {
        frustum: this.config.enableFrustumCulling,
        occlusion: this.config.enableOcclusionCulling,
        distance: true
      }
    );
    
    this.stats.culledObjects = objects.length - visibleObjects.length;
    
    // Update visibility
    objects.forEach((obj) => {
      obj.visible = visibleObjects.includes(obj);
    });
  }
  
  private renderForward(): void {
    if (!this.forwardRenderer || !this.renderer || !this.scene || !this.camera) return;
    
    const renderStats = this.forwardRenderer.render();
    Object.assign(this.stats, renderStats);
  }
  
  private renderDeferred(): void {
    if (!this.deferredRenderer || !this.renderer || !this.scene || !this.camera) return;
    
    const renderStats = this.deferredRenderer.render();
    Object.assign(this.stats, renderStats);
  }
  
  private renderForwardPlus(): void {
    if (!this.forwardRenderer || !this.renderer || !this.scene || !this.camera) return;
    
    // Enhanced forward with tiled light culling
    const lightTiles = this.lightCulling.performTileCulling();
    
    // Store light tile data for shader access
    // (Would be uploaded to GPU via uniform buffer)
    
    const renderStats = this.forwardRenderer.render();
    Object.assign(this.stats, renderStats);
    this.stats.lightsProcessed = this.lightCulling.getVisibleLights().length;
  }
  
  private renderHybrid(): void {
    if (!this.renderer || !this.scene || !this.camera) return;
    
    // Analyze scene to decide best path per object
    const deferredObjects: THREE.Mesh[] = [];
    const forwardObjects: THREE.Mesh[] = [];
    
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh && object.visible) {
        const material = object.material as THREE.Material;
        
        // Transparent objects always use forward
        if (material.transparent || material.opacity < 1) {
          forwardObjects.push(object);
        } else {
          // Complex materials use forward, simple use deferred
          const isComplex = material instanceof THREE.MeshPhysicalMaterial ||
                           material instanceof THREE.ShaderMaterial;
          
          if (isComplex) {
            forwardObjects.push(object);
          } else {
            deferredObjects.push(object);
          }
        }
      }
    });
    
    // Render deferred objects first
    if (deferredObjects.length > 0 && this.deferredRenderer) {
      // Temporarily hide forward objects
      forwardObjects.forEach((obj) => { obj.visible = false; });
      
      const renderStats = this.deferredRenderer.render();
      Object.assign(this.stats, renderStats);
      
      // Restore visibility
      forwardObjects.forEach((obj) => { obj.visible = true; });
    }
    
    // Render forward objects on top
    if (forwardObjects.length > 0 && this.forwardRenderer) {
      deferredObjects.forEach((obj) => { obj.visible = false; });
      
      const renderStats = this.forwardRenderer.render();
      this.stats.drawCalls += renderStats.drawCalls;
      this.stats.triangles += renderStats.triangles;
      
      deferredObjects.forEach((obj) => { obj.visible = true; });
    }
  }
  
  private renderFeatures(): void {
    if (!this.renderer) return;
    
    // Sort features by priority
    const sortedFeatures = Array.from(this.features.values())
      .filter((f) => f.enabled)
      .sort((a, b) => a.priority - b.priority);
    
    // Render each feature
    for (const feature of sortedFeatures) {
      feature.render(this.renderer!, this.scene!, this.camera!);
    }
  }
  
  /**
   * Resize the pipeline
   */
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    
    // Recreate render targets
    this.createRenderTargets();
    
    // Resize renderers
    this.forwardRenderer?.resize(width, height);
    this.deferredRenderer?.resize(width, height);
  }
  
  /**
   * Set render scale for dynamic resolution
   */
  setRenderScale(scale: number): void {
    this.renderScale = Math.max(0.5, Math.min(2.0, scale));
    this.config.renderScale = this.renderScale;
    
    // Recreate render targets with new scale
    this.createRenderTargets();
  }
  
  /**
   * Get render statistics
   */
  getStats(): RenderStats {
    return { ...this.stats };
  }
  
  /**
   * Add a render feature
   */
  addRenderFeature(feature: RenderFeature): void {
    this.features.set(feature.name, feature);
    
    if (this.renderer && this.scene && this.camera) {
      feature.initialize(this.renderer, this.scene, this.camera);
    }
  }
  
  /**
   * Enable/disable a feature by name
   */
  enableFeature(name: string, enabled: boolean): void {
    const feature = this.features.get(name);
    if (feature) {
      feature.enabled = enabled;
    }
  }
  
  /**
   * Get G-Buffer (for deferred rendering)
   */
  getGBuffer(): GBuffer | null {
    return this.deferredRenderer?.getGBuffer() ?? null;
  }
  
  /**
   * Update configuration
   */
  setConfig(config: Partial<PipelineConfig>): void {
    this.config = { ...this.config, ...config };
    
    if (config.msaa !== undefined || config.renderScale !== undefined) {
      this.createRenderTargets();
    }
    
    if (config.shadowQuality !== undefined) {
      const shadowFeature = this.features.get('shadows') as ShadowFeature;
      shadowFeature?.setQuality(config.shadowQuality);
    }
    
    if (config.sortMode !== undefined) {
      this.forwardRenderer?.setSortMode(config.sortMode);
    }
  }
  
  /**
   * Get current configuration
   */
  getConfig(): PipelineConfig {
    return { ...this.config };
  }
  
  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.forwardRenderer?.dispose();
    this.deferredRenderer?.dispose();
    
    this.lightCulling.dispose();
    this.batching.dispose();
    this.culling.dispose();
    
    this.features.forEach((feature) => feature.dispose());
    
    this.intermediateTarget?.dispose();
    this.outputTarget?.dispose();
  }
}

export type {
  LightData,
  RenderableData
};
