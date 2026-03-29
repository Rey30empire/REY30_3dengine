import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { MaterialRecord, MeshNodeRecord, ModelAnalysisSummary, SkeletonNodeRecord } from './types';
import { inferModelFormat, isMaybeSupportedMimeType, normalizeResourceKey } from './shared';

function loadWithPromise<T>(
  loader: {
    load: (
      url: string,
      onLoad: (value: T) => void,
      onProgress?: (event: ProgressEvent<EventTarget>) => void,
      onError?: (error: unknown) => void
    ) => void;
  },
  url: string
) {
  return new Promise<T>((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });
}

function vectorToObject(vector: THREE.Vector3) {
  return {
    x: Number(vector.x.toFixed(6)),
    y: Number(vector.y.toFixed(6)),
    z: Number(vector.z.toFixed(6)),
  };
}

function boxToBounds(box: THREE.Box3) {
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  return {
    min: vectorToObject(box.min),
    max: vectorToObject(box.max),
    size: vectorToObject(size),
    center: vectorToObject(center),
  };
}

function collectMaterialRecords(root: THREE.Object3D) {
  const materials = new Map<string, MaterialRecord>();

  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!('material' in mesh) || !mesh.material) return;

    const materialList = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materialList) {
      const textureNames = Object.values(material)
        .filter((value): value is THREE.Texture => value instanceof THREE.Texture)
        .map((texture) => texture.name || 'texture');

      const id = `${material.uuid}:${material.name || 'material'}`;
      if (!materials.has(id)) {
        materials.set(id, {
          id,
          name: material.name || 'material',
          textureNames: [...new Set(textureNames)],
        });
      }
    }
  });

  return [...materials.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function buildNodePath(parentPath: string | null, index: number, node: THREE.Object3D) {
  const slug = (node.name || node.type || 'node')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'node';
  return parentPath ? `${parentPath}/${slug}-${index}` : `${slug}-${index}`;
}

function tagNodePaths(root: THREE.Object3D) {
  const walk = (node: THREE.Object3D, parentPath: string | null) => {
    node.children.forEach((child, index) => {
      const path = buildNodePath(parentPath, index, child);
      child.userData.rey30NodePath = path;
      child.userData.rey30ParentPath = parentPath;
      walk(child, path);
    });
  };

  root.userData.rey30NodePath = 'root-0';
  root.userData.rey30ParentPath = null;
  walk(root, 'root-0');
}

function collectMeshNodes(root: THREE.Object3D): MeshNodeRecord[] {
  const nodes: MeshNodeRecord[] = [];

  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;

    const box = new THREE.Box3().setFromObject(mesh);
    const materialList = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    const materialNames = materialList.map((material) => material.name || 'material');
    const textureNames = materialList.flatMap((material) =>
      Object.values(material)
        .filter((value): value is THREE.Texture => value instanceof THREE.Texture)
        .map((texture) => texture.name || 'texture')
    );
    const skinnedMesh = mesh as THREE.SkinnedMesh;
    const boneNames = skinnedMesh.isSkinnedMesh && skinnedMesh.skeleton
      ? skinnedMesh.skeleton.bones.map((bone) => bone.name)
      : [];

    const pivot = new THREE.Vector3();
    mesh.getWorldPosition(pivot);

    nodes.push({
      id: mesh.uuid,
      name: mesh.name || mesh.type,
      path: String(mesh.userData.rey30NodePath || mesh.uuid),
      parentPath: mesh.userData.rey30ParentPath ? String(mesh.userData.rey30ParentPath) : null,
      materialNames: [...new Set(materialNames)],
      textureNames: [...new Set(textureNames)],
      vertexCount: mesh.geometry.attributes.position?.count || 0,
      triangleCount: mesh.geometry.index
        ? Math.floor(mesh.geometry.index.count / 3)
        : Math.floor((mesh.geometry.attributes.position?.count || 0) / 3),
      hasRig: skinnedMesh.isSkinnedMesh,
      boneNames: [...new Set(boneNames)],
      boundingBox: boxToBounds(box),
      pivot: vectorToObject(pivot),
      visible: mesh.visible,
    });
  });

  return nodes;
}

function collectSkeletonNodes(root: THREE.Object3D): SkeletonNodeRecord[] {
  const nodes: SkeletonNodeRecord[] = [];

  root.traverse((child) => {
    const bone = child as THREE.Bone;
    if (!bone.isBone) return;

    const worldPosition = new THREE.Vector3();
    bone.getWorldPosition(worldPosition);

    nodes.push({
      id: bone.uuid,
      name: bone.name || 'bone',
      path: String(bone.userData.rey30NodePath || bone.uuid),
      parentPath: bone.userData.rey30ParentPath ? String(bone.userData.rey30ParentPath) : null,
      position: vectorToObject(worldPosition),
    });
  });

  return nodes;
}

function buildAnalysis(params: {
  sourceName: string;
  sourceFormat: NonNullable<ReturnType<typeof inferModelFormat>>;
  sourceFiles: File[];
  primaryFile: File;
  scene: THREE.Object3D;
  animations: THREE.AnimationClip[];
}): ModelAnalysisSummary {
  tagNodePaths(params.scene);
  const meshes = collectMeshNodes(params.scene);
  const skeleton = collectSkeletonNodes(params.scene);
  const materials = collectMaterialRecords(params.scene);
  const box = new THREE.Box3().setFromObject(params.scene);

  return {
    sourceName: params.sourceName,
    sourceFormat: params.sourceFormat,
    sourceFiles: params.sourceFiles.map((file) => ({
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      isPrimary: file.name === params.primaryFile.name,
    })),
    sourcePrimaryFileName: params.primaryFile.name,
    sourceSize: params.sourceFiles.reduce((sum, file) => sum + file.size, 0),
    uploadedAt: new Date().toISOString(),
    meshCount: meshes.length,
    materialCount: materials.length,
    boneCount: skeleton.length,
    animationCount: params.animations.length,
    hasRig: meshes.some((mesh) => mesh.hasRig) || skeleton.length > 0,
    hasAnimations: params.animations.length > 0,
    materials,
    meshes,
    skeleton,
    boundingBox: boxToBounds(box),
  };
}

function createResourceResolver(files: File[]) {
  const urls = new Map<string, string>();
  const register = (file: File) => {
    const url = URL.createObjectURL(file);
    const normalizedFull = normalizeResourceKey(file.webkitRelativePath || file.name);
    const baseName = normalizeResourceKey(file.name.split('/').pop() || file.name);
    urls.set(normalizedFull, url);
    urls.set(baseName, url);
  };

  files.forEach(register);

  return {
    resolve(url: string) {
      const normalized = normalizeResourceKey(url.split('?')[0] || url);
      const baseName = normalizeResourceKey(normalized.split('/').pop() || normalized);
      return urls.get(normalized) || urls.get(baseName) || url;
    },
    getForFile(file: File) {
      return urls.get(normalizeResourceKey(file.name)) || urls.get(normalizeResourceKey(file.webkitRelativePath || file.name));
    },
    revoke() {
      const seen = new Set<string>();
      urls.forEach((value) => {
        if (seen.has(value)) return;
        seen.add(value);
        URL.revokeObjectURL(value);
      });
    },
  };
}

async function loadSceneGraph(params: {
  files: File[];
  primaryFile: File;
  format: NonNullable<ReturnType<typeof inferModelFormat>>;
  resolver: ReturnType<typeof createResourceResolver>;
}) {
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => params.resolver.resolve(url));

  if (params.format === 'glb' || params.format === 'gltf') {
    const dracoLoader = new DRACOLoader(manager);
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    const loader = new GLTFLoader(manager);
    loader.setDRACOLoader(dracoLoader);
    const result = await loadWithPromise(loader, params.resolver.getForFile(params.primaryFile) || params.primaryFile.name);
    return {
      scene: result.scene,
      animations: result.animations || [],
      cameras: result.cameras || [],
    };
  }

  if (params.format === 'fbx') {
    const loader = new FBXLoader(manager);
    const scene = await loadWithPromise(loader, params.resolver.getForFile(params.primaryFile) || params.primaryFile.name);
    return {
      scene,
      animations: scene.animations || [],
      cameras: [],
    };
  }

  const objLoader = new OBJLoader(manager);
  const mtlFile = params.files.find((file) => file.name.toLowerCase().endsWith('.mtl'));
  if (mtlFile) {
    const mtlLoader = new MTLLoader(manager);
    const materials = await loadWithPromise(
      mtlLoader,
      params.resolver.getForFile(mtlFile) || mtlFile.name
    );
    materials.preload();
    objLoader.setMaterials(materials);
  }

  const scene = await loadWithPromise(
    objLoader,
    params.resolver.getForFile(params.primaryFile) || params.primaryFile.name
  );
  return {
    scene,
    animations: [],
    cameras: [],
  };
}

export interface LoadedModularCharacterBundle {
  sourceFiles: File[];
  primaryFile: File;
  format: NonNullable<ReturnType<typeof inferModelFormat>>;
  scene: THREE.Object3D;
  animations: THREE.AnimationClip[];
  cameras: THREE.Camera[];
  analysis: ModelAnalysisSummary;
  cloneScene(): THREE.Object3D;
  dispose(): void;
}

export async function analyzeModularCharacterFiles(input: FileList | File[]): Promise<LoadedModularCharacterBundle> {
  const files = Array.from(input);
  if (files.length === 0) {
    throw new Error('Selecciona al menos un archivo 3D o un paquete de recursos.');
  }

  const primaryFile = files.find((file) => inferModelFormat(file.name));
  if (!primaryFile) {
    throw new Error('No se encontro un archivo principal compatible (.fbx, .obj, .glb o .gltf).');
  }

  const format = inferModelFormat(primaryFile.name);
  if (!format) {
    throw new Error(`Formato no soportado para ${primaryFile.name}.`);
  }

  if (!isMaybeSupportedMimeType(primaryFile.type, format)) {
    throw new Error(`El archivo ${primaryFile.name} no coincide con el MIME esperado para ${format}.`);
  }

  const resolver = createResourceResolver(files);
  try {
    const loaded = await loadSceneGraph({
      files,
      primaryFile,
      format,
      resolver,
    });

    loaded.scene.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });

    const analysis = buildAnalysis({
      sourceName: primaryFile.name,
      sourceFormat: format,
      sourceFiles: files,
      primaryFile,
      scene: loaded.scene,
      animations: loaded.animations,
    });

    return {
      sourceFiles: files,
      primaryFile,
      format,
      scene: loaded.scene,
      animations: loaded.animations,
      cameras: loaded.cameras,
      analysis,
      cloneScene() {
        return cloneSkeleton(loaded.scene);
      },
      dispose() {
        resolver.revoke();
      },
    };
  } catch (error) {
    resolver.revoke();
    throw error;
  }
}
