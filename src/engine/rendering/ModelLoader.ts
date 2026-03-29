// ============================================
// Model Loader - GLB/GLTF/FBX Support
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// ============================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

// Configure DRACO loader for compressed meshes
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');

// Create loaders
const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

const fbxLoader = new FBXLoader();
const objLoader = new OBJLoader();

// Loaded model cache
const modelCache = new Map<string, THREE.Object3D>();

export interface LoadedModel {
  scene: THREE.Object3D;
  animations: THREE.AnimationClip[];
  cameras: THREE.Camera[];
  extensions: unknown;
  userData: {
    vertexCount: number;
    triangleCount: number;
    materialCount: number;
    meshCount: number;
    hasAnimations: boolean;
    hasSkeleton: boolean;
  };
}

// Load GLB/GLTF model
export async function loadGLTF(url: string): Promise<LoadedModel> {
  // Check cache
  if (modelCache.has(url)) {
    const cached = modelCache.get(url)!.clone();
    return analyzeModel(cached);
  }

  return new Promise((resolve, reject) => {
    gltfLoader.load(
      url,
      (gltf) => {
        const model = gltf.scene;
        
        // Setup model
        model.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            
            // Ensure materials are proper
            if (mesh.material) {
              if (Array.isArray(mesh.material)) {
                mesh.material.forEach(mat => {
                  if ((mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
                    (mat as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
                  }
                });
              } else if ((mesh.material as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
                (mesh.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
              }
            }
          }
        });

        // Cache for future use
        modelCache.set(url, model.clone());
        
        resolve({
          scene: model,
          animations: gltf.animations,
          cameras: gltf.cameras,
          extensions: gltf.parser,
          userData: analyzeModel(model).userData,
        });
      },
      (progress) => {
        // Progress callback
        console.log(`Loading: ${(progress.loaded / progress.total * 100).toFixed(0)}%`);
      },
      (error) => {
        reject(error);
      }
    );
  });
}

// Load FBX model
export async function loadFBX(url: string): Promise<LoadedModel> {
  return new Promise((resolve, reject) => {
    fbxLoader.load(
      url,
      (fbx) => {
        fbx.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
          }
        });
        
        resolve(analyzeModel(fbx));
      },
      undefined,
      reject
    );
  });
}

// Load OBJ model
export async function loadOBJ(url: string): Promise<LoadedModel> {
  return new Promise((resolve, reject) => {
    objLoader.load(
      url,
      (obj) => {
        obj.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.material = new THREE.MeshStandardMaterial({
              color: 0x888888,
              metalness: 0.3,
              roughness: 0.6,
            });
          }
        });
        
        resolve(analyzeModel(obj));
      },
      undefined,
      reject
    );
  });
}

// Load from URL (auto-detect format)
export async function loadModel(url: string): Promise<LoadedModel> {
  const ext = url.split('.').pop()?.toLowerCase();
  
  switch (ext) {
    case 'glb':
    case 'gltf':
      return loadGLTF(url);
    case 'fbx':
      return loadFBX(url);
    case 'obj':
      return loadOBJ(url);
    default:
      throw new Error(`Unsupported model format: ${ext}`);
  }
}

// Load from file (File object from input)
export async function loadModelFromFile(file: File): Promise<LoadedModel> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      const arrayBuffer = e.target?.result as ArrayBuffer;
      const blob = new Blob([arrayBuffer]);
      const url = URL.createObjectURL(blob);
      
      try {
        const model = await loadModel(url);
        URL.revokeObjectURL(url);
        resolve(model);
      } catch (error) {
        URL.revokeObjectURL(url);
        reject(error);
      }
    };
    
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// Analyze model statistics
function analyzeModel(model: THREE.Object3D): LoadedModel {
  let vertexCount = 0;
  let triangleCount = 0;
  let materialCount = 0;
  let meshCount = 0;
  let hasSkeleton = false;
  const animations: THREE.AnimationClip[] = [];
  
  model.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      meshCount++;
      
      const geometry = mesh.geometry;
      vertexCount += geometry.attributes.position?.count || 0;
      
      if (geometry.index) {
        triangleCount += geometry.index.count / 3;
      } else {
        triangleCount += (geometry.attributes.position?.count || 0) / 3;
      }
      
      if (Array.isArray(mesh.material)) {
        materialCount += mesh.material.length;
      } else {
        materialCount++;
      }
      
      if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) {
        hasSkeleton = true;
      }
    }
  });
  
  return {
    scene: model,
    animations,
    cameras: [],
    extensions: {},
    userData: {
      vertexCount,
      triangleCount: Math.floor(triangleCount),
      materialCount,
      meshCount,
      hasAnimations: animations.length > 0,
      hasSkeleton,
    },
  };
}

// Optimize model (simplify, merge geometries)
export async function optimizeModel(
  model: THREE.Object3D, 
  options: {
    simplify?: boolean;
    targetRatio?: number;
    mergeGeometries?: boolean;
    flattenHierarchy?: boolean;
  } = {}
): Promise<THREE.Object3D> {
  const optimized = model.clone();
  
  // Flatten hierarchy if requested
  if (options.flattenHierarchy) {
    const meshes: THREE.Mesh[] = [];
    optimized.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        meshes.push(child as THREE.Mesh);
      }
    });
    
    // Create single group with all meshes
    while (optimized.children.length > 0) {
      optimized.remove(optimized.children[0]);
    }
    
    meshes.forEach(mesh => {
      optimized.add(mesh);
    });
  }
  
  // Simplify geometry if requested
  if (options.simplify && options.targetRatio) {
    // Note: Would need to import SimplifyModifier for this
    console.log('Simplification would happen here with ratio:', options.targetRatio);
  }
  
  return optimized;
}

// Create preview thumbnail
export async function createModelThumbnail(
  model: THREE.Object3D, 
  size: number = 128
): Promise<string> {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a2e);
  
  // Add model
  scene.add(model);
  
  // Center and scale model
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  const size3 = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size3.x, size3.y, size3.z);
  const scale = 2 / maxDim;
  
  model.position.sub(center);
  model.scale.multiplyScalar(scale);
  
  // Create camera
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(3, 2, 3);
  camera.lookAt(0, 0, 0);
  
  // Add lighting
  const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
  scene.add(ambientLight);
  
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.set(5, 5, 5);
  scene.add(directionalLight);
  
  // Create renderer
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
  });
  renderer.setSize(size, size);
  renderer.render(scene, camera);
  
  // Get data URL
  const dataUrl = renderer.domElement.toDataURL('image/png');
  
  // Cleanup
  renderer.dispose();
  scene.remove(model);
  
  return dataUrl;
}

// Export model cache utilities
export function clearModelCache() {
  modelCache.clear();
}

export function getCachedModels(): string[] {
  return Array.from(modelCache.keys());
}
