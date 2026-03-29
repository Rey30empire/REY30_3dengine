// ============================================
// Prefab System - Reusable Game Objects
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// ============================================

import * as THREE from 'three';
import { v4 as uuidv4 } from 'uuid';

// Prefab category
export type PrefabCategory = 'characters' | 'props' | 'environment' | 'vehicles' | 'weapons' | 'effects' | 'ui' | 'custom';

// Prefab metadata
export interface PrefabMetadata {
  id: string;
  name: string;
  description: string;
  category: PrefabCategory;
  tags: string[];
  thumbnail?: string;
  author?: string;
  version: string;
  createdAt: number;
  updatedAt: number;
  usageCount: number;
}

// Component data
export interface ComponentData {
  type: string;
  enabled: boolean;
  data: Record<string, unknown>;
}

// Prefab definition
export interface PrefabDefinition {
  metadata: PrefabMetadata;
  hierarchy: PrefabNode;
  components: ComponentData[];
  scripts: PrefabScript[];
  variants?: PrefabVariant[];
}

// Prefab node (hierarchical structure)
export interface PrefabNode {
  id: string;
  name: string;
  type: 'mesh' | 'group' | 'light' | 'camera' | 'empty';
  transform: {
    position: [number, number, number];
    rotation: [number, number, number, number]; // quaternion
    scale: [number, number, number];
  };
  geometry?: {
    type: 'box' | 'sphere' | 'cylinder' | 'capsule' | 'plane' | 'custom';
    params?: Record<string, unknown>;
    customMeshUrl?: string;
  };
  material?: {
    type: 'standard' | 'basic' | 'phong' | 'physical' | 'custom';
    color?: string;
    metalness?: number;
    roughness?: number;
    emissive?: string;
    customMaterialUrl?: string;
  };
  light?: {
    type: 'directional' | 'point' | 'spot' | 'ambient';
    color: string;
    intensity: number;
    distance?: number;
    angle?: number;
    penumbra?: number;
    castShadow?: boolean;
  };
  children: PrefabNode[];
}

// Prefab script
export interface PrefabScript {
  id: string;
  name: string;
  type: 'visual' | 'code' | 'builtin';
  enabled: boolean;
  order: number;
  data: Record<string, unknown>;
  code?: string;
  nodes?: VisualScriptNode[];
}

// Visual script node
export interface VisualScriptNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  inputs: { id: string; name: string; type: string; value: unknown }[];
  outputs: { id: string; name: string; type: string }[];
}

// Prefab variant
export interface PrefabVariant {
  id: string;
  name: string;
  overrides: Record<string, unknown>;
}

// Prefab instance
export interface PrefabInstance {
  id: string;
  prefabId: string;
  name: string;
  object: THREE.Object3D;
  overrides: Map<string, unknown>;
  isModified: boolean;
}

// ============================================
// Prefab Manager
// ============================================
export class PrefabManager {
  private prefabs: Map<string, PrefabDefinition>;
  private instances: Map<string, PrefabInstance>;
  private thumbnailRenderer: PrefabThumbnailRenderer | null;

  constructor() {
    this.prefabs = new Map();
    this.instances = new Map();
    this.thumbnailRenderer = null;
  }

  // Create prefab from object
  createPrefab(
    object: THREE.Object3D,
    name: string,
    category: PrefabCategory,
    description: string = '',
    tags: string[] = []
  ): PrefabDefinition {
    const now = Date.now();

    const definition: PrefabDefinition = {
      metadata: {
        id: uuidv4(),
        name,
        description,
        category,
        tags,
        version: '1.0.0',
        createdAt: now,
        updatedAt: now,
        usageCount: 0,
      },
      hierarchy: this.objectToNode(object),
      components: [],
      scripts: [],
      variants: [],
    };

    this.prefabs.set(definition.metadata.id, definition);
    return definition;
  }

  // Convert object to prefab node
  private objectToNode(object: THREE.Object3D): PrefabNode {
    const node: PrefabNode = {
      id: uuidv4(),
      name: object.name || 'unnamed',
      type: this.getObjectType(object),
      transform: {
        position: [object.position.x, object.position.y, object.position.z],
        rotation: [object.quaternion.x, object.quaternion.y, object.quaternion.z, object.quaternion.w],
        scale: [object.scale.x, object.scale.y, object.scale.z],
      },
      children: [],
    };

    // Add geometry if mesh
    if ((object as THREE.Mesh).isMesh) {
      const mesh = object as THREE.Mesh;
      const geometry = mesh.geometry;

      if (geometry.type === 'BoxGeometry') {
        node.geometry = { type: 'box' };
      } else if (geometry.type === 'SphereGeometry') {
        node.geometry = { type: 'sphere' };
      } else if (geometry.type === 'CylinderGeometry') {
        node.geometry = { type: 'cylinder' };
      } else if (geometry.type === 'CapsuleGeometry') {
        node.geometry = { type: 'capsule' };
      } else if (geometry.type === 'PlaneGeometry') {
        node.geometry = { type: 'plane' };
      } else {
        node.geometry = { type: 'custom' };
      }

      // Add material
      const material = mesh.material as THREE.MeshStandardMaterial;
      if (material) {
        node.material = {
          type: material.type === 'MeshStandardMaterial' ? 'standard' : 
                material.type === 'MeshBasicMaterial' ? 'basic' : 'custom',
          color: material.color ? '#' + material.color.getHexString() : '#ffffff',
          metalness: material.metalness,
          roughness: material.roughness,
          emissive: material.emissive ? '#' + material.emissive.getHexString() : undefined,
        };
      }
    }

    // Add light data
    if ((object as THREE.Light).isLight) {
      const light = object as THREE.Light;
      
      if ((light as THREE.DirectionalLight).isDirectionalLight) {
        node.light = {
          type: 'directional',
          color: '#' + light.color.getHexString(),
          intensity: light.intensity,
          castShadow: (light as THREE.DirectionalLight).castShadow,
        };
      } else if ((light as THREE.PointLight).isPointLight) {
        const pointLight = light as THREE.PointLight;
        node.light = {
          type: 'point',
          color: '#' + pointLight.color.getHexString(),
          intensity: pointLight.intensity,
          distance: pointLight.distance,
        };
      } else if ((light as THREE.SpotLight).isSpotLight) {
        const spotLight = light as THREE.SpotLight;
        node.light = {
          type: 'spot',
          color: '#' + spotLight.color.getHexString(),
          intensity: spotLight.intensity,
          distance: spotLight.distance,
          angle: spotLight.angle,
          penumbra: spotLight.penumbra,
          castShadow: spotLight.castShadow,
        };
      } else if ((light as THREE.AmbientLight).isAmbientLight) {
        node.light = {
          type: 'ambient',
          color: '#' + light.color.getHexString(),
          intensity: light.intensity,
        };
      }
    }

    // Process children
    object.children.forEach((child) => {
      node.children.push(this.objectToNode(child));
    });

    return node;
  }

  // Get object type
  private getObjectType(object: THREE.Object3D): PrefabNode['type'] {
    if ((object as THREE.Mesh).isMesh) return 'mesh';
    if ((object as THREE.Light).isLight) return 'light';
    if ((object as THREE.Camera).isCamera) return 'camera';
    if ((object as THREE.Group).isGroup) return 'group';
    return 'empty';
  }

  // Instantiate prefab
  instantiate(prefabId: string, position?: THREE.Vector3, rotation?: THREE.Euler): PrefabInstance | null {
    const definition = this.prefabs.get(prefabId);
    if (!definition) return null;

    const object = this.nodeToObject(definition.hierarchy);

    if (position) object.position.copy(position);
    if (rotation) object.rotation.copy(rotation);

    const instance: PrefabInstance = {
      id: uuidv4(),
      prefabId,
      name: `${definition.metadata.name}_${definition.metadata.usageCount + 1}`,
      object,
      overrides: new Map(),
      isModified: false,
    };

    this.instances.set(instance.id, instance);

    // Update usage count
    definition.metadata.usageCount++;
    definition.metadata.updatedAt = Date.now();

    return instance;
  }

  // Convert node to object
  private nodeToObject(node: PrefabNode): THREE.Object3D {
    let object: THREE.Object3D;

    switch (node.type) {
      case 'mesh':
        object = this.createMesh(node);
        break;
      case 'light':
        object = this.createLight(node);
        break;
      case 'camera':
        object = this.createCamera(node);
        break;
      case 'group':
        object = new THREE.Group();
        break;
      default:
        object = new THREE.Object3D();
    }

    object.name = node.name;
    object.position.fromArray(node.transform.position);
    object.quaternion.fromArray(node.transform.rotation);
    object.scale.fromArray(node.transform.scale);

    // Add children
    node.children.forEach((childNode) => {
      const child = this.nodeToObject(childNode);
      object.add(child);
    });

    return object;
  }

  // Create mesh from node
  private createMesh(node: PrefabNode): THREE.Mesh {
    let geometry: THREE.BufferGeometry;

    switch (node.geometry?.type) {
      case 'box':
        geometry = new THREE.BoxGeometry(1, 1, 1);
        break;
      case 'sphere':
        geometry = new THREE.SphereGeometry(0.5, 32, 32);
        break;
      case 'cylinder':
        geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
        break;
      case 'capsule':
        geometry = new THREE.CapsuleGeometry(0.25, 1, 8, 16);
        break;
      case 'plane':
        geometry = new THREE.PlaneGeometry(1, 1);
        break;
      default:
        geometry = new THREE.BoxGeometry(1, 1, 1);
    }

    let material: THREE.Material;
    const nodeMaterial = node.material;

    switch (node.material?.type) {
      case 'basic':
        material = new THREE.MeshBasicMaterial({
          color: nodeMaterial?.color || '#ffffff',
        });
        break;
      case 'phong':
        material = new THREE.MeshPhongMaterial({
          color: nodeMaterial?.color || '#ffffff',
        });
        break;
      case 'physical':
        material = new THREE.MeshPhysicalMaterial({
          color: nodeMaterial?.color || '#ffffff',
          metalness: nodeMaterial?.metalness ?? 0,
          roughness: nodeMaterial?.roughness ?? 0.5,
        });
        break;
      default:
        material = new THREE.MeshStandardMaterial({
          color: nodeMaterial?.color || '#ffffff',
          metalness: nodeMaterial?.metalness ?? 0,
          roughness: nodeMaterial?.roughness ?? 0.5,
        });
    }

    return new THREE.Mesh(geometry, material);
  }

  // Create light from node
  private createLight(node: PrefabNode): THREE.Light {
    const lightData = node.light;
    if (!lightData) return new THREE.PointLight();

    let light: THREE.Light;

    switch (lightData.type) {
      case 'directional':
        const dirLight = new THREE.DirectionalLight(lightData.color, lightData.intensity);
        dirLight.castShadow = lightData.castShadow ?? false;
        light = dirLight;
        break;
      case 'point':
        light = new THREE.PointLight(lightData.color, lightData.intensity, lightData.distance);
        break;
      case 'spot':
        const spotLight = new THREE.SpotLight(
          lightData.color,
          lightData.intensity,
          lightData.distance,
          lightData.angle,
          lightData.penumbra
        );
        spotLight.castShadow = lightData.castShadow ?? false;
        light = spotLight;
        break;
      case 'ambient':
        light = new THREE.AmbientLight(lightData.color, lightData.intensity);
        break;
      default:
        light = new THREE.PointLight();
    }

    return light;
  }

  // Create camera from node
  private createCamera(node: PrefabNode): THREE.Camera {
    return new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 1000);
  }

  // Update prefab from instance
  updatePrefabFromInstance(instanceId: string): boolean {
    const instance = this.instances.get(instanceId);
    if (!instance) return false;

    const definition = this.prefabs.get(instance.prefabId);
    if (!definition) return false;

    // Update hierarchy
    definition.hierarchy = this.objectToNode(instance.object);
    definition.metadata.updatedAt = Date.now();

    return true;
  }

  // Apply changes to all instances
  applyPrefabChanges(prefabId: string): void {
    const definition = this.prefabs.get(prefabId);
    if (!definition) return;

    this.instances.forEach((instance) => {
      if (instance.prefabId === prefabId && !instance.isModified) {
        // Re-instantiate
        const newObject = this.nodeToObject(definition.hierarchy);
        instance.object.parent?.add(newObject);
        instance.object.parent?.remove(instance.object);
        instance.object = newObject;
      }
    });
  }

  // Delete prefab
  deletePrefab(prefabId: string): boolean {
    if (!this.prefabs.has(prefabId)) return false;

    // Remove all instances
    this.instances.forEach((instance, id) => {
      if (instance.prefabId === prefabId) {
        this.instances.delete(id);
      }
    });

    this.prefabs.delete(prefabId);
    return true;
  }

  // Get prefab
  getPrefab(prefabId: string): PrefabDefinition | undefined {
    return this.prefabs.get(prefabId);
  }

  // Get all prefabs
  getAllPrefabs(): PrefabDefinition[] {
    return Array.from(this.prefabs.values());
  }

  // Get prefabs by category
  getPrefabsByCategory(category: PrefabCategory): PrefabDefinition[] {
    return Array.from(this.prefabs.values()).filter((p) => p.metadata.category === category);
  }

  // Search prefabs
  searchPrefabs(query: string): PrefabDefinition[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.prefabs.values()).filter((p) => 
      p.metadata.name.toLowerCase().includes(lowerQuery) ||
      p.metadata.description.toLowerCase().includes(lowerQuery) ||
      p.metadata.tags.some((t) => t.toLowerCase().includes(lowerQuery))
    );
  }

  // Export prefab
  exportPrefab(prefabId: string): string {
    const definition = this.prefabs.get(prefabId);
    if (!definition) return '';

    return JSON.stringify(definition, null, 2);
  }

  // Import prefab
  importPrefab(json: string): PrefabDefinition | null {
    try {
      const definition = JSON.parse(json) as PrefabDefinition;
      
      // Generate new ID
      definition.metadata.id = uuidv4();
      definition.metadata.createdAt = Date.now();
      definition.metadata.updatedAt = Date.now();

      this.prefabs.set(definition.metadata.id, definition);
      return definition;
    } catch {
      return null;
    }
  }

  // Create variant
  createVariant(prefabId: string, name: string, overrides: Record<string, unknown>): PrefabVariant | null {
    const definition = this.prefabs.get(prefabId);
    if (!definition) return null;

    const variant: PrefabVariant = {
      id: uuidv4(),
      name,
      overrides,
    };

    if (!definition.variants) {
      definition.variants = [];
    }
    definition.variants.push(variant);

    return variant;
  }

  // Dispose
  dispose(): void {
    this.prefabs.clear();
    this.instances.clear();
    this.thumbnailRenderer?.dispose();
  }
}

// ============================================
// Prefab Thumbnail Renderer
// ============================================
export class PrefabThumbnailRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private size: number;

  constructor(size: number = 128) {
    this.size = size;
    
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    this.renderer.setSize(size, size);
    this.renderer.setClearColor(0x1a1a2e, 1);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.camera.position.set(2, 2, 2);
    this.camera.lookAt(0, 0, 0);

    // Add lights
    const ambient = new THREE.AmbientLight(0x404040, 0.5);
    this.scene.add(ambient);

    const directional = new THREE.DirectionalLight(0xffffff, 1);
    directional.position.set(5, 5, 5);
    this.scene.add(directional);
  }

  renderThumbnail(object: THREE.Object3D): string {
    // Clear scene
    while (this.scene.children.length > 2) {
      this.scene.remove(this.scene.children[this.scene.children.length - 1]);
    }

    // Add object
    this.scene.add(object);

    // Center and scale
    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = 2 / maxDim;

    object.position.sub(center);
    object.scale.multiplyScalar(scale);

    // Render
    this.renderer.render(this.scene, this.camera);

    // Get data URL
    return this.renderer.domElement.toDataURL('image/png');
  }

  dispose(): void {
    this.renderer.dispose();
  }
}

// ============================================
// Built-in Prefabs
// ============================================
export const BUILTIN_PREFABS: PrefabDefinition[] = [
  // Cube
  {
    metadata: {
      id: 'builtin-cube',
      name: 'Cube',
      description: 'Basic cube primitive',
      category: 'props',
      tags: ['primitive', 'basic'],
      version: '1.0.0',
      createdAt: 0,
      updatedAt: 0,
      usageCount: 0,
    },
    hierarchy: {
      id: 'cube-root',
      name: 'Cube',
      type: 'mesh',
      transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      geometry: { type: 'box' },
      material: { type: 'standard', color: '#888888', metalness: 0, roughness: 0.5 },
      children: [],
    },
    components: [],
    scripts: [],
  },
  // Sphere
  {
    metadata: {
      id: 'builtin-sphere',
      name: 'Sphere',
      description: 'Basic sphere primitive',
      category: 'props',
      tags: ['primitive', 'basic'],
      version: '1.0.0',
      createdAt: 0,
      updatedAt: 0,
      usageCount: 0,
    },
    hierarchy: {
      id: 'sphere-root',
      name: 'Sphere',
      type: 'mesh',
      transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      geometry: { type: 'sphere' },
      material: { type: 'standard', color: '#888888', metalness: 0, roughness: 0.5 },
      children: [],
    },
    components: [],
    scripts: [],
  },
  // Point Light
  {
    metadata: {
      id: 'builtin-point-light',
      name: 'Point Light',
      description: 'Basic point light',
      category: 'environment',
      tags: ['light', 'basic'],
      version: '1.0.0',
      createdAt: 0,
      updatedAt: 0,
      usageCount: 0,
    },
    hierarchy: {
      id: 'point-light-root',
      name: 'Point Light',
      type: 'light',
      transform: { position: [0, 3, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      light: { type: 'point', color: '#ffffff', intensity: 1, distance: 10 },
      children: [],
    },
    components: [],
    scripts: [],
  },
  // Directional Light
  {
    metadata: {
      id: 'builtin-directional-light',
      name: 'Directional Light',
      description: 'Sun-like directional light',
      category: 'environment',
      tags: ['light', 'sun'],
      version: '1.0.0',
      createdAt: 0,
      updatedAt: 0,
      usageCount: 0,
    },
    hierarchy: {
      id: 'dir-light-root',
      name: 'Directional Light',
      type: 'light',
      transform: { position: [5, 10, 5], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      light: { type: 'directional', color: '#ffffff', intensity: 1, castShadow: true },
      children: [],
    },
    components: [],
    scripts: [],
  },
  // Empty Group
  {
    metadata: {
      id: 'builtin-empty',
      name: 'Empty',
      description: 'Empty game object',
      category: 'props',
      tags: ['empty', 'basic'],
      version: '1.0.0',
      createdAt: 0,
      updatedAt: 0,
      usageCount: 0,
    },
    hierarchy: {
      id: 'empty-root',
      name: 'Empty',
      type: 'empty',
      transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      children: [],
    },
    components: [],
    scripts: [],
  },
];

// Export singleton
export const prefabManager = new PrefabManager();

// Initialize with built-in prefabs
BUILTIN_PREFABS.forEach((prefab) => {
  prefabManager['prefabs'].set(prefab.metadata.id, prefab);
});
