import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import {
  CHARACTER_PART_CATEGORIES,
  type CharacterPartCategory,
} from '@/engine/character-builder';
import type { Entity } from '@/types/engine';
import type {
  CharacterBuilderSceneData,
  CharacterBuilderScenePartData,
} from './characterBuilderSceneSync';
import {
  buildEditableMeshSignature,
  createPrimitiveMesh,
  getVisibleFaceIndices,
  listMeshEdges,
  listVisibleMeshEdgeIndices,
  parseEditableMesh,
  type EditableMesh,
} from './modelerMesh';
import {
  buildMaterialVisualSignature,
  resolveEditorMaterial,
  type EditorMaterialDefinition,
} from './editorMaterials';
import { buildAssetFileUrl } from './assetUrls';
import { loadModel } from '@/engine/rendering/ModelLoader';
import {
  applyMeshModifierStack,
  buildMeshModifierSignature,
  parseMeshModifierStack,
} from './meshModifiers';
import { buildWeightPreviewColors } from './paintMesh';
import {
  buildTerrainVisualSignature,
  normalizeTerrainData,
} from '@/engine/scene/terrainAuthoring';
import { TerrainGenerator } from '@/engine/scene/TerrainGenerator';

export const STORE_OBJECT_PREFIX = 'store_entity:';

const checkerTextureCache = new Map<number, THREE.DataTexture>();
const materialTextureCache = new Map<string, THREE.Texture>();
const materialTextureLoader = new THREE.TextureLoader();
const characterModelPromiseCache = new Map<string, Promise<THREE.Object3D | null>>();

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
}

export function readVector3(value: unknown, fallback: THREE.Vector3): THREE.Vector3 {
  const record = asRecord(value);
  if (!record) return fallback.clone();
  const x = typeof record.x === 'number' ? record.x : fallback.x;
  const y = typeof record.y === 'number' ? record.y : fallback.y;
  const z = typeof record.z === 'number' ? record.z : fallback.z;
  return new THREE.Vector3(x, y, z);
}

export function readQuaternion(value: unknown, fallback: THREE.Quaternion): THREE.Quaternion {
  const record = asRecord(value);
  if (!record) return fallback.clone();
  const x = typeof record.x === 'number' ? record.x : fallback.x;
  const y = typeof record.y === 'number' ? record.y : fallback.y;
  const z = typeof record.z === 'number' ? record.z : fallback.z;
  const w = typeof record.w === 'number' ? record.w : fallback.w;
  return new THREE.Quaternion(x, y, z, w);
}

function readString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function readNullableString(value: unknown) {
  const normalized = readString(value);
  return normalized.length > 0 ? normalized : null;
}

function readCharacterBuilderCategory(value: unknown) {
  const category = readNullableString(value);
  if (!category) {
    return null;
  }
  return CHARACTER_PART_CATEGORIES.includes(category as CharacterPartCategory)
    ? (category as CharacterPartCategory)
    : null;
}

function parseCharacterBuilderScenePart(
  value: unknown
): CharacterBuilderScenePartData | null {
  const record = asRecord(value);
  if (!record) return null;

  const category = readString(record.category);
  const partId = readString(record.partId ?? record.id);
  const modelPath = readString(record.modelPath);
  const label = readString(record.label ?? record.name, partId);
  if (!category || !partId || !modelPath) {
    return null;
  }

  return {
    category: category as CharacterBuilderScenePartData['category'],
    partId,
    label,
    modelPath,
    attachmentSocket: readString(record.attachmentSocket),
    materialVariantId: readNullableString(record.materialVariantId),
    materialSwatch: readNullableString(record.materialSwatch),
    colorVariantId: readNullableString(record.colorVariantId),
    colorSwatch: readNullableString(record.colorSwatch),
  };
}

function readCharacterBuilderSceneData(
  meshRendererData: Record<string, unknown> | null
): CharacterBuilderSceneData | null {
  const record = asRecord(
    meshRendererData?.characterBuilder ?? meshRendererData?.characterBuilderAssembly
  );
  if (!record) return null;

  const parts = Array.isArray(record.parts)
    ? record.parts
        .map((entry) => parseCharacterBuilderScenePart(entry))
        .filter((entry): entry is CharacterBuilderScenePartData => Boolean(entry))
    : [];

  if (parts.length === 0) {
    return null;
  }

  return {
    version: 1,
    source: 'character-builder-panel',
    baseBodyId: readNullableString(record.baseBodyId),
    skeletonId: readNullableString(record.skeletonId),
    bodyType: readNullableString(record.bodyType),
    focusedCategory: readCharacterBuilderCategory(record.focusedCategory),
    hoveredCategory: readCharacterBuilderCategory(record.hoveredCategory),
    parts,
  };
}

function buildCharacterBuilderVisualSignature(data: CharacterBuilderSceneData) {
  return [
    data.version,
    data.baseBodyId ?? 'no_base',
    data.skeletonId ?? 'no_skeleton',
    data.bodyType ?? 'no_body_type',
    data.focusedCategory ?? 'no_focus',
    data.hoveredCategory ?? 'no_hover',
    ...data.parts.map((part) =>
      [
        part.category,
        part.partId,
        part.modelPath,
        part.attachmentSocket,
        part.materialVariantId ?? 'default_material',
        part.materialSwatch ?? 'no_material_swatch',
        part.colorVariantId ?? 'default_color',
        part.colorSwatch ?? 'no_color_swatch',
      ].join(':')
    ),
  ].join('|');
}

function parsePreviewColor(swatch: string | null | undefined) {
  if (!swatch || swatch.trim().length === 0) return null;
  try {
    return new THREE.Color(swatch);
  } catch {
    return null;
  }
}

function cloneCharacterBuilderMaterial(
  material: THREE.Material,
  part: CharacterBuilderScenePartData
) {
  const nextMaterial = material.clone();
  const materialColor = parsePreviewColor(part.materialSwatch);
  const accentColor = parsePreviewColor(part.colorSwatch);

  if ('color' in nextMaterial && nextMaterial.color && materialColor) {
    (nextMaterial.color as THREE.Color).lerp(materialColor, 0.72);
  }

  if ('emissive' in nextMaterial && nextMaterial.emissive && accentColor) {
    (nextMaterial.emissive as THREE.Color).copy(accentColor);
    if ('emissiveIntensity' in nextMaterial && typeof nextMaterial.emissiveIntensity === 'number') {
      nextMaterial.emissiveIntensity = Math.max(nextMaterial.emissiveIntensity, 0.18);
    }
  }

  return nextMaterial;
}

function createCharacterBuilderPlaceholderVisual(data: CharacterBuilderSceneData) {
  const placeholder = new THREE.Group();
  placeholder.name = '__character_builder_placeholder';

  const base = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.35, 1.05, 8, 16),
    new THREE.MeshStandardMaterial({
      color: 0x35506f,
      roughness: 0.55,
      metalness: 0.12,
    })
  );
  base.castShadow = true;
  base.receiveShadow = true;
  placeholder.add(base);

  data.parts
    .filter((part) => part.category !== 'body')
    .forEach((part, index) => {
      const accent = parsePreviewColor(part.colorSwatch ?? part.materialSwatch) ?? new THREE.Color(0x67e8f9);
      const chip = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.08, 0.08),
        new THREE.MeshStandardMaterial({
          color: accent,
          emissive: accent.clone().multiplyScalar(0.2),
          roughness: 0.42,
          metalness: 0.08,
        })
      );
      chip.position.set(-0.5 + (index % 4) * 0.32, 1.1 - Math.floor(index / 4) * 0.16, 0.42);
      placeholder.add(chip);
    });

  return placeholder;
}

const CHARACTER_FOCUS_ANCHORS: Record<CharacterPartCategory, [number, number, number]> = {
  body: [0.5, 0.55, 0.55],
  head: [0.5, 0.92, 0.58],
  hair: [0.5, 0.98, 0.58],
  torso: [0.5, 0.68, 0.58],
  arms: [0.78, 0.68, 0.54],
  legs: [0.5, 0.3, 0.54],
  shoes: [0.5, 0.08, 0.56],
  outfit: [0.5, 0.6, 0.6],
  accessory: [0.76, 0.82, 0.62],
};

const CHARACTER_FOCUS_RADIUS_SCALE: Record<CharacterPartCategory, number> = {
  body: 0.24,
  head: 0.16,
  hair: 0.17,
  torso: 0.18,
  arms: 0.16,
  legs: 0.18,
  shoes: 0.12,
  outfit: 0.2,
  accessory: 0.13,
};

function disposeRenderableObject(object: THREE.Object3D | null | undefined) {
  if (!object) {
    return;
  }

  object.traverse((child) => {
    const renderable = child as THREE.Object3D & {
      geometry?: THREE.BufferGeometry;
      material?: THREE.Material | THREE.Material[];
    };
    renderable.geometry?.dispose?.();
    const materials = Array.isArray(renderable.material)
      ? renderable.material
      : [renderable.material];
    materials.forEach((material) => material?.dispose?.());
  });
}

function readObjectBounds(object: THREE.Object3D | null | undefined) {
  if (!object) {
    return null;
  }

  const bounds = new THREE.Box3().setFromObject(object);
  if (bounds.isEmpty()) {
    return null;
  }

  return {
    center: bounds.getCenter(new THREE.Vector3()),
    size: bounds.getSize(new THREE.Vector3()),
  };
}

function createCharacterBuilderFocusMarker(
  category: CharacterPartCategory,
  center: THREE.Vector3,
  radius: number,
  mode: 'focus' | 'hover'
) {
  const marker = new THREE.Group();
  marker.name = `__character_builder_focus_${category}`;
  marker.position.copy(center);

  const pulseSpeed = mode === 'hover' ? 9 : 7;
  const haloBaseOpacity = mode === 'hover' ? 0.22 : 0.18;
  const ringBaseOpacity = mode === 'hover' ? 0.88 : 0.78;
  const outerBaseOpacity = mode === 'hover' ? 0.3 : 0.22;

  const haloMaterial = new THREE.MeshBasicMaterial({
    color: 0x67e8f9,
    transparent: true,
    opacity: haloBaseOpacity,
    depthWrite: false,
  });
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(Math.max(radius, 0.12), 18, 18),
    haloMaterial
  );
  halo.renderOrder = 30;

  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0x67e8f9,
    transparent: true,
    opacity: ringBaseOpacity,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(
      Math.max(radius * 1.2, 0.18),
      Math.max(radius * 0.08, 0.03),
      16,
      40
    ),
    ringMaterial
  );
  ring.rotation.x = Math.PI / 2;
  ring.renderOrder = 31;

  const outerMaterial = new THREE.MeshBasicMaterial({
    color: 0xe0f2fe,
    transparent: true,
    opacity: outerBaseOpacity,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const outer = new THREE.Mesh(
    new THREE.RingGeometry(
      Math.max(radius * 1.35, 0.22),
      Math.max(radius * 1.52, 0.28),
      32
    ),
    outerMaterial
  );
  outer.rotation.x = Math.PI / 2;
  outer.renderOrder = 32;

  const startedAt =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();

  marker.add(halo, ring, outer);
  marker.onBeforeRender = () => {
    const now =
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();
    const elapsed = (now - startedAt) / 1000;
    const wave = (Math.sin(elapsed * pulseSpeed) + 1) / 2;

    halo.scale.setScalar((mode === 'hover' ? 0.98 : 0.92) + wave * (mode === 'hover' ? 0.34 : 0.28));
    ring.scale.setScalar((mode === 'hover' ? 1 : 0.96) + wave * (mode === 'hover' ? 0.22 : 0.18));
    outer.scale.setScalar((mode === 'hover' ? 1.02 : 0.98) + wave * (mode === 'hover' ? 0.26 : 0.22));
    ring.rotation.z = elapsed * (mode === 'hover' ? 2.4 : 1.8);

    haloMaterial.opacity = (mode === 'hover' ? 0.18 : 0.14) + wave * 0.16;
    ringMaterial.opacity = (mode === 'hover' ? 0.58 : 0.46) + wave * 0.3;
    outerMaterial.opacity = (mode === 'hover' ? 0.18 : 0.12) + wave * 0.22;
  };

  return marker;
}

function createCharacterBuilderFocusPulse(
  data: CharacterBuilderSceneData,
  loadedParts: Map<CharacterPartCategory, THREE.Object3D>,
  fallbackTarget: THREE.Object3D
) {
  const activeCategory = data.hoveredCategory ?? data.focusedCategory;
  if (!activeCategory) {
    return null;
  }
  const mode = data.hoveredCategory ? 'hover' : 'focus';

  const focusedBounds = readObjectBounds(loadedParts.get(activeCategory));
  if (focusedBounds) {
    const radius = Math.max(
      0.14,
      Math.max(focusedBounds.size.x, focusedBounds.size.y, focusedBounds.size.z) * 0.3
    );
    return createCharacterBuilderFocusMarker(activeCategory, focusedBounds.center, radius, mode);
  }

  const fallbackBounds = readObjectBounds(loadedParts.get('body') ?? fallbackTarget);
  if (!fallbackBounds) {
    return null;
  }

  const [anchorX, anchorY, anchorZ] = CHARACTER_FOCUS_ANCHORS[activeCategory];
  const anchor = fallbackBounds.center.clone().add(
    new THREE.Vector3(
      (anchorX - 0.5) * Math.max(fallbackBounds.size.x, 0.8),
      (anchorY - 0.5) * Math.max(fallbackBounds.size.y, 1.6),
      (anchorZ - 0.5) * Math.max(fallbackBounds.size.z, 0.8)
    )
  );
  const radius = Math.max(
    0.14,
    Math.max(fallbackBounds.size.x, fallbackBounds.size.y, fallbackBounds.size.z) *
      CHARACTER_FOCUS_RADIUS_SCALE[activeCategory]
  );
  return createCharacterBuilderFocusMarker(activeCategory, anchor, radius, mode);
}

function resolveCharacterBuilderModelUrl(modelPath: string) {
  const raw = modelPath.trim();
  if (!raw) return '';
  if (
    raw.startsWith('http://') ||
    raw.startsWith('https://') ||
    raw.startsWith('data:') ||
    raw.startsWith('blob:') ||
    raw.startsWith('/library/')
  ) {
    return raw;
  }
  return buildAssetFileUrl(raw);
}

async function loadCharacterBuilderModelClone(modelPath: string) {
  const url = resolveCharacterBuilderModelUrl(modelPath);
  if (!url) {
    return null;
  }

  let job = characterModelPromiseCache.get(url);
  if (!job) {
    job = loadModel(url)
      .then((loaded) => loaded.scene)
      .catch(() => null);
    characterModelPromiseCache.set(url, job);
  }

  const resolved = await job;
  if (!resolved) {
    return null;
  }

  return cloneSkeleton(resolved);
}

function createCharacterBuilderAssemblyVisual(data: CharacterBuilderSceneData) {
  const group = new THREE.Group();
  const signature = buildCharacterBuilderVisualSignature(data);
  const placeholder = createCharacterBuilderPlaceholderVisual(data);
  const loadedPartMap = new Map<CharacterPartCategory, THREE.Object3D>();
  let disposed = false;
  let focusMarker: THREE.Object3D | null = null;

  group.userData.characterBuilderSignature = signature;
  group.userData.dispose = () => {
    disposed = true;
  };
  group.add(placeholder);

  const refreshFocusMarker = (fallbackTarget: THREE.Object3D) => {
    if (focusMarker) {
      group.remove(focusMarker);
      disposeRenderableObject(focusMarker);
      focusMarker = null;
    }

    focusMarker = createCharacterBuilderFocusPulse(data, loadedPartMap, fallbackTarget);
    if (focusMarker) {
      group.add(focusMarker);
    }
  };

  refreshFocusMarker(placeholder);

  void Promise.all(
    data.parts.map(async (part) => {
      const object = await loadCharacterBuilderModelClone(part.modelPath);
      if (!object) {
        return null;
      }

      object.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!('material' in mesh) || !mesh.material) return;
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        if (Array.isArray(mesh.material)) {
          mesh.material = mesh.material.map((material) =>
            cloneCharacterBuilderMaterial(material, part)
          );
          return;
        }

        mesh.material = cloneCharacterBuilderMaterial(mesh.material, part);
      });

      return {
        category: part.category,
        object,
      };
    })
  ).then((loadedParts) => {
    if (disposed) {
      loadedParts.forEach((loadedPart) => {
        disposeRenderableObject(loadedPart?.object);
      });
      return;
    }

    const successfulLoads = loadedParts.filter(
      (
        loadedPart
      ): loadedPart is {
        category: CharacterPartCategory;
        object: THREE.Object3D;
      } => Boolean(loadedPart?.object)
    );
    if (successfulLoads.length === 0) {
      return;
    }

    group.remove(placeholder);
    successfulLoads.forEach((loadedPart) => {
      loadedPartMap.set(loadedPart.category, loadedPart.object);
      group.add(loadedPart.object);
    });
    refreshFocusMarker(loadedPartMap.get('body') ?? placeholder);
  });

  return group;
}

export function getEntityVisualKind(entity: Entity): string {
  const meshRendererData = asRecord(entity.components.get('MeshRenderer')?.data);
  const characterBuilderData = readCharacterBuilderSceneData(meshRendererData);
  if (entity.components.has('Light')) return 'light';
  if (entity.components.has('Camera')) return 'camera';
  if (entity.components.has('Terrain')) return 'terrain';
  if (entity.components.has('Weapon')) return 'weapon';
  if (entity.tags.includes('enemy')) return 'enemy';
  if (characterBuilderData) return 'generic';
  if (entity.tags.includes('player') || entity.components.has('PlayerController')) return 'player';
  return 'generic';
}

function readCheckerPreview(meshRendererData: Record<string, unknown> | null): boolean {
  return Boolean(meshRendererData?.checkerPreview);
}

function readCheckerScale(meshRendererData: Record<string, unknown> | null): number {
  const value = Number(meshRendererData?.checkerScale);
  return Number.isFinite(value) ? Math.min(32, Math.max(1, Math.round(value))) : 8;
}

function getCheckerTexture(scale: number) {
  const safeScale = Math.min(32, Math.max(1, Math.round(scale)));
  const cached = checkerTextureCache.get(safeScale);
  if (cached) {
    return cached;
  }

  const size = 16;
  const data = new Uint8Array(size * size * 4);
  const cellSize = 4;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const isEven = (Math.floor(x / cellSize) + Math.floor(y / cellSize)) % 2 === 0;
      const value = isEven ? 236 : 82;
      data[index] = value;
      data[index + 1] = isEven ? 240 : 110;
      data[index + 2] = isEven ? 244 : 138;
      data[index + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(safeScale, safeScale);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  checkerTextureCache.set(safeScale, texture);
  return texture;
}

function createSeamOverlay(mesh: EditableMesh) {
  if (!mesh.seamEdges || mesh.seamEdges.length === 0) {
    return null;
  }

  const allEdges = listMeshEdges(mesh);
  const visibleEdgeKeySet = new Set(
    listVisibleMeshEdgeIndices(mesh).map((edgeIndex) => {
      const edge = allEdges[edgeIndex];
      return edge ? `${edge[0]}:${edge[1]}` : '';
    })
  );
  if (visibleEdgeKeySet.size === 0) {
    return null;
  }
  const positions: number[] = [];
  mesh.seamEdges.forEach(([leftIndex, rightIndex]) => {
    const seamKey = `${Math.min(leftIndex, rightIndex)}:${Math.max(leftIndex, rightIndex)}`;
    if (!visibleEdgeKeySet.has(seamKey)) return;
    const left = mesh.vertices[leftIndex];
    const right = mesh.vertices[rightIndex];
    if (!left || !right) return;
    positions.push(left.x, left.y + 0.002, left.z, right.x, right.y + 0.002, right.z);
  });

  if (positions.length === 0) {
    return null;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({
      color: 0xf8d04e,
      transparent: true,
      opacity: 0.95,
    })
  );
}

function createEditableMeshGeometry(
  mesh: EditableMesh,
  options?: {
    displayVertexColors?: Array<{ r: number; g: number; b: number; a?: number }> | undefined;
  }
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const hasUvs = Array.isArray(mesh.uvs) && mesh.uvs.length === mesh.vertices.length;
  const displayVertexColors =
    Array.isArray(options?.displayVertexColors) &&
    options.displayVertexColors.length === mesh.vertices.length
      ? options.displayVertexColors
      : Array.isArray(mesh.vertexColors) && mesh.vertexColors.length === mesh.vertices.length
        ? mesh.vertexColors
        : undefined;

  getVisibleFaceIndices(mesh).forEach((faceIndex) => {
    const [a, b, c] = mesh.faces[faceIndex] ?? [];
    if (a === undefined || b === undefined || c === undefined) return;
    const vertices = [mesh.vertices[a], mesh.vertices[b], mesh.vertices[c]];
    if (vertices.some((vertex) => !vertex)) return;

    vertices.forEach((vertex) => {
      positions.push(vertex.x, vertex.y, vertex.z);
    });

    if (hasUvs && mesh.uvs) {
      [a, b, c].forEach((vertexIndex) => {
        const uv = mesh.uvs?.[vertexIndex] ?? { u: 0, v: 0 };
        uvs.push(uv.u, uv.v);
      });
    }

    if (displayVertexColors) {
      [a, b, c].forEach((vertexIndex) => {
        const color = displayVertexColors[vertexIndex] ?? { r: 1, g: 1, b: 1 };
        colors.push(color.r, color.g, color.b);
      });
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (hasUvs && uvs.length === (positions.length / 3) * 2) {
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  }
  if (displayVertexColors && colors.length === positions.length) {
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function ensureSecondaryUvAttribute(geometry: THREE.BufferGeometry) {
  if (geometry.getAttribute('uv2')) {
    return;
  }

  const uv = geometry.getAttribute('uv');
  if (!uv) {
    return;
  }

  geometry.setAttribute('uv2', uv.clone());
}

function buildTextureCacheKey(
  assetPath: string,
  material: EditorMaterialDefinition,
  colorSpace: 'srgb' | 'linear'
) {
  const transform = material.textureTransform;
  return [
    assetPath,
    transform.repeatU.toFixed(4),
    transform.repeatV.toFixed(4),
    transform.offsetU.toFixed(4),
    transform.offsetV.toFixed(4),
    transform.rotation.toFixed(2),
    colorSpace,
  ].join('|');
}

function getMaterialTexture(
  assetPath: string | null,
  material: EditorMaterialDefinition,
  colorSpace: 'srgb' | 'linear'
) {
  if (!assetPath) {
    return null;
  }

  const url = buildAssetFileUrl(assetPath);
  if (!url) {
    return null;
  }

  const cacheKey = buildTextureCacheKey(assetPath, material, colorSpace);
  const cached = materialTextureCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const texture = materialTextureLoader.load(url);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(
    material.textureTransform.repeatU,
    material.textureTransform.repeatV
  );
  texture.offset.set(
    material.textureTransform.offsetU,
    material.textureTransform.offsetV
  );
  texture.center.set(0.5, 0.5);
  texture.rotation = THREE.MathUtils.degToRad(material.textureTransform.rotation);
  if (colorSpace === 'srgb') {
    texture.colorSpace = THREE.SRGBColorSpace;
  }
  texture.needsUpdate = true;

  materialTextureCache.set(cacheKey, texture);
  return texture;
}

function positionKeyFromBufferAttribute(
  attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  index: number
) {
  const x = attribute.getX(index).toFixed(5);
  const y = attribute.getY(index).toFixed(5);
  const z = attribute.getZ(index).toFixed(5);
  return `${x}:${y}:${z}`;
}

export function applyWeightedNormalsToGeometry(
  geometry: THREE.BufferGeometry,
  options?: {
    strength?: number;
    keepSharp?: boolean;
    creaseAngle?: number;
  }
) {
  const working = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  const positions = working.getAttribute('position');
  if (!positions || positions.count < 3) {
    return working;
  }

  const strength = Math.min(4, Math.max(0, options?.strength ?? 1));
  const keepSharp = options?.keepSharp ?? true;
  const creaseAngle = options?.creaseAngle ?? 55;
  const minDot = Math.cos(THREE.MathUtils.degToRad(creaseAngle));
  const cornerGroups = new Map<
    string,
    Array<{
      cornerIndex: number;
      faceNormal: THREE.Vector3;
      weight: number;
    }>
  >();

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const edgeAB = new THREE.Vector3();
  const edgeAC = new THREE.Vector3();
  const edgeBA = new THREE.Vector3();
  const edgeBC = new THREE.Vector3();
  const edgeCA = new THREE.Vector3();
  const edgeCB = new THREE.Vector3();
  const faceNormal = new THREE.Vector3();

  const angleAt = (left: THREE.Vector3, center: THREE.Vector3, right: THREE.Vector3) => {
    const first = left.clone().sub(center).normalize();
    const second = right.clone().sub(center).normalize();
    return Math.acos(THREE.MathUtils.clamp(first.dot(second), -1, 1));
  };

  for (let faceStart = 0; faceStart < positions.count; faceStart += 3) {
    a.fromBufferAttribute(positions, faceStart);
    b.fromBufferAttribute(positions, faceStart + 1);
    c.fromBufferAttribute(positions, faceStart + 2);

    edgeAB.subVectors(b, a);
    edgeAC.subVectors(c, a);
    faceNormal.crossVectors(edgeAB, edgeAC);
    const area = Math.max(faceNormal.length() * 0.5, 1e-6);
    if (area <= 1e-6) {
      continue;
    }

    faceNormal.normalize();
    edgeBA.subVectors(a, b);
    edgeBC.subVectors(c, b);
    edgeCA.subVectors(a, c);
    edgeCB.subVectors(b, c);

    const cornerWeights = [
      Math.max(angleAt(b, a, c) * area, 1e-6),
      Math.max(angleAt(a, b, c) * area, 1e-6),
      Math.max(angleAt(a, c, b) * area, 1e-6),
    ];

    [faceStart, faceStart + 1, faceStart + 2].forEach((cornerIndex, localIndex) => {
      const key = positionKeyFromBufferAttribute(positions, cornerIndex);
      const baseWeight = cornerWeights[localIndex] ?? 1;
      const weight = strength <= 0 ? 1 : Math.pow(baseWeight, Math.max(0.25, strength));
      cornerGroups.set(key, [
        ...(cornerGroups.get(key) ?? []),
        {
          cornerIndex,
          faceNormal: faceNormal.clone(),
          weight,
        },
      ]);
    });
  }

  const normals = new Float32Array(positions.count * 3);
  const accumulated = new THREE.Vector3();

  cornerGroups.forEach((corners) => {
    corners.forEach((target) => {
      accumulated.set(0, 0, 0);

      corners.forEach((candidate) => {
        if (keepSharp && target.faceNormal.dot(candidate.faceNormal) < minDot) {
          return;
        }
        accumulated.addScaledVector(candidate.faceNormal, candidate.weight);
      });

      if (accumulated.lengthSq() <= 1e-10) {
        accumulated.copy(target.faceNormal);
      }

      accumulated.normalize();
      const offset = target.cornerIndex * 3;
      normals[offset] = accumulated.x;
      normals[offset + 1] = accumulated.y;
      normals[offset + 2] = accumulated.z;
    });
  });

  working.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  working.computeBoundingBox();
  working.computeBoundingSphere();
  return working;
}

export function getEntityVisualSignature(
  entity: Entity,
  options?: {
    weightPreviewBone?: string | null;
  }
): string {
  const visualKind = getEntityVisualKind(entity);
  if (visualKind === 'terrain') {
    return buildTerrainVisualSignature(entity.components.get('Terrain')?.data);
  }
  if (visualKind !== 'generic') {
    return visualKind;
  }

  const meshRendererData = asRecord(entity.components.get('MeshRenderer')?.data);
  const characterBuilderData = readCharacterBuilderSceneData(meshRendererData);
  if (characterBuilderData) {
    return `${visualKind}:character_builder:${buildCharacterBuilderVisualSignature(characterBuilderData)}`;
  }
  const checkerPreview = readCheckerPreview(meshRendererData);
  const checkerScale = readCheckerScale(meshRendererData);
  const materialSignature = buildMaterialVisualSignature(meshRendererData);
  const modifiers = parseMeshModifierStack(meshRendererData?.modifiers);
  const modifierSignature = buildMeshModifierSignature(modifiers);
  const meshId =
    typeof meshRendererData?.meshId === 'string'
      ? meshRendererData.meshId.toLowerCase()
      : 'cube';
  const editableBaseMesh =
    parseEditableMesh(
      meshRendererData?.manualMesh ?? meshRendererData?.customMesh
    ) ??
    (modifiers.length > 0 && (meshId === 'cube' || meshId === 'plane')
      ? createPrimitiveMesh(meshId)
      : null);
  const manualMesh = editableBaseMesh;
  const weightPreviewBone = options?.weightPreviewBone?.trim() || '';

  return manualMesh
    ? `${visualKind}:${meshId}:${checkerPreview}:${checkerScale}:${materialSignature}:${modifierSignature}:${weightPreviewBone}:${buildEditableMeshSignature(manualMesh)}`
    : `${visualKind}:${meshId}:${checkerPreview}:${checkerScale}:${materialSignature}:${modifierSignature}:${weightPreviewBone}`;
}

export function createEntityVisual(
  entity: Entity,
  options?: {
    weightPreviewBone?: string | null;
  }
): THREE.Object3D {
  const visualKind = getEntityVisualKind(entity);

  if (visualKind === 'light') {
    const lightGroup = new THREE.Group();
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 16, 16),
      new THREE.MeshStandardMaterial({
        color: 0xfff2a8,
        emissive: 0xffd84f,
        emissiveIntensity: 0.5,
      })
    );
    lightGroup.add(bulb);
    return lightGroup;
  }

  if (visualKind === 'camera') {
    const cameraBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.4, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x6aa2ff, roughness: 0.35, metalness: 0.25 })
    );
    const lens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.1, 0.2, 16),
      new THREE.MeshStandardMaterial({ color: 0x1d2a4a, roughness: 0.4, metalness: 0.1 })
    );
    lens.rotation.x = Math.PI / 2;
    lens.position.z = 0.25;
    const cameraGroup = new THREE.Group();
    cameraGroup.add(cameraBody);
    cameraGroup.add(lens);
    return cameraGroup;
  }

  if (visualKind === 'terrain') {
    const terrainData = normalizeTerrainData(entity.components.get('Terrain')?.data);
    const terrainGenerator = new TerrainGenerator(terrainData.seed ?? 0);
    const terrain = terrainGenerator.createTerrainMesh(
      terrainData.width,
      terrainData.depth,
      terrainData.segments ?? 2,
      terrainData.heightmap,
      1
    );
    if (terrain.material instanceof THREE.MeshStandardMaterial) {
      terrain.material.roughness = 0.92;
      terrain.material.metalness = 0.04;
      terrain.material.flatShading = false;
      terrain.material.needsUpdate = true;
    }
    terrain.receiveShadow = true;
    terrain.castShadow = true;
    return terrain;
  }

  if (visualKind === 'weapon') {
    const weapon = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 1.1, 0.15),
      new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.25, metalness: 0.75 })
    );
    weapon.castShadow = true;
    return weapon;
  }

  if (visualKind === 'enemy') {
    const enemy = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0xd85656, roughness: 0.5, metalness: 0.2 })
    );
    enemy.castShadow = true;
    enemy.receiveShadow = true;
    return enemy;
  }

  if (visualKind === 'player') {
    const player = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.35, 1.1, 8, 16),
      new THREE.MeshStandardMaterial({ color: 0x4cb7ff, roughness: 0.4, metalness: 0.18 })
    );
    player.castShadow = true;
    player.receiveShadow = true;
    return player;
  }

  const meshRendererData = asRecord(entity.components.get('MeshRenderer')?.data);
  const characterBuilderData = readCharacterBuilderSceneData(meshRendererData);
  if (characterBuilderData) {
    return createCharacterBuilderAssemblyVisual(characterBuilderData);
  }
  const checkerPreview = readCheckerPreview(meshRendererData);
  const checkerScale = readCheckerScale(meshRendererData);
  const materialDefinition = resolveEditorMaterial(meshRendererData);
  const modifiers = parseMeshModifierStack(meshRendererData?.modifiers);
  const meshId =
    typeof meshRendererData?.meshId === 'string'
      ? meshRendererData.meshId.toLowerCase()
      : 'cube';
  const baseManualMesh =
    parseEditableMesh(
      meshRendererData?.manualMesh ?? meshRendererData?.customMesh
    ) ??
    (modifiers.length > 0 && (meshId === 'cube' || meshId === 'plane')
      ? createPrimitiveMesh(meshId)
      : null);
  const manualMesh =
    baseManualMesh && modifiers.length > 0
      ? applyMeshModifierStack(baseManualMesh, modifiers)
      : baseManualMesh;
  const displayVertexColors =
    manualMesh && options?.weightPreviewBone
      ? buildWeightPreviewColors(manualMesh, options.weightPreviewBone)
      : manualMesh?.vertexColors;

  let geometry: THREE.BufferGeometry;
  if (manualMesh) {
    geometry = createEditableMeshGeometry(manualMesh, {
      displayVertexColors,
    });
  } else {
    switch (meshId) {
      case 'sphere':
        geometry = new THREE.SphereGeometry(0.55, 24, 24);
        break;
      case 'cylinder':
        geometry = new THREE.CylinderGeometry(0.45, 0.45, 1.2, 20);
        break;
      case 'plane':
        geometry = new THREE.BoxGeometry(1.5, 0.1, 1.5);
        break;
      case 'capsule':
        geometry = new THREE.CapsuleGeometry(0.35, 1.1, 8, 16);
        break;
      default:
        geometry = new THREE.BoxGeometry(1, 1, 1);
        break;
    }
  }

  const renderGeometry = materialDefinition.weightedNormalsEnabled
    ? applyWeightedNormalsToGeometry(geometry, {
        strength: materialDefinition.weightedNormalsStrength,
        keepSharp: materialDefinition.weightedNormalsKeepSharp,
      })
    : geometry;

  if (!renderGeometry.getAttribute('normal')) {
    renderGeometry.computeVertexNormals();
  }
  renderGeometry.computeBoundingBox();
  renderGeometry.computeBoundingSphere();

  const hasUvs = Boolean(renderGeometry.getAttribute('uv'));
  if (hasUvs) {
    ensureSecondaryUvAttribute(renderGeometry);
  }

  const baseColor = new THREE.Color(
    materialDefinition.albedoColor.r,
    materialDefinition.albedoColor.g,
    materialDefinition.albedoColor.b
  );
  const emissiveColor = new THREE.Color(
    materialDefinition.emissiveColor.r,
    materialDefinition.emissiveColor.g,
    materialDefinition.emissiveColor.b
  );
  const albedoMap =
    !checkerPreview && hasUvs && materialDefinition.textureMaps.albedo.enabled
      ? getMaterialTexture(materialDefinition.textureMaps.albedo.assetPath, materialDefinition, 'srgb')
      : null;
  const normalMap =
    !checkerPreview && hasUvs && materialDefinition.textureMaps.normal.enabled
      ? getMaterialTexture(materialDefinition.textureMaps.normal.assetPath, materialDefinition, 'linear')
      : null;
  const roughnessMap =
    !checkerPreview && hasUvs && materialDefinition.textureMaps.roughness.enabled
      ? getMaterialTexture(materialDefinition.textureMaps.roughness.assetPath, materialDefinition, 'linear')
      : null;
  const metalnessMap =
    !checkerPreview && hasUvs && materialDefinition.textureMaps.metallic.enabled
      ? getMaterialTexture(materialDefinition.textureMaps.metallic.assetPath, materialDefinition, 'linear')
      : null;
  const emissiveMap =
    !checkerPreview && hasUvs && materialDefinition.textureMaps.emissive.enabled
      ? getMaterialTexture(materialDefinition.textureMaps.emissive.assetPath, materialDefinition, 'srgb')
      : null;
  const aoMap =
    !checkerPreview && hasUvs && materialDefinition.textureMaps.occlusion.enabled
      ? getMaterialTexture(materialDefinition.textureMaps.occlusion.assetPath, materialDefinition, 'linear')
      : null;
  const alphaMap =
    !checkerPreview && hasUvs && materialDefinition.textureMaps.alpha.enabled
      ? getMaterialTexture(materialDefinition.textureMaps.alpha.assetPath, materialDefinition, 'linear')
      : null;

  const generic = new THREE.Mesh(
    renderGeometry,
    new THREE.MeshStandardMaterial({
      color: checkerPreview ? 0xffffff : baseColor,
      emissive: checkerPreview ? new THREE.Color(0x111827) : emissiveColor,
      emissiveIntensity: checkerPreview ? 0.28 : materialDefinition.emissiveIntensity,
      roughness: checkerPreview ? 0.78 : materialDefinition.roughness,
      metalness: checkerPreview ? 0.04 : materialDefinition.metallic,
      map: checkerPreview && hasUvs ? getCheckerTexture(checkerScale) : albedoMap,
      normalMap,
      roughnessMap,
      metalnessMap,
      emissiveMap,
      aoMap,
      aoMapIntensity: materialDefinition.occlusionStrength,
      alphaMap,
      transparent: checkerPreview
        ? false
        : materialDefinition.transparent ||
          materialDefinition.albedoColor.a < 0.999 ||
          Boolean(alphaMap),
      opacity: checkerPreview ? 1 : materialDefinition.albedoColor.a,
      side: checkerPreview
        ? THREE.FrontSide
        : materialDefinition.doubleSided
          ? THREE.DoubleSide
          : THREE.FrontSide,
      alphaTest: checkerPreview ? 0 : materialDefinition.alphaCutoff,
      vertexColors: Boolean(displayVertexColors && displayVertexColors.length > 0),
    })
  );

  const genericMaterial = generic.material;
  if (normalMap) {
    genericMaterial.normalScale.set(
      materialDefinition.normalIntensity,
      materialDefinition.normalIntensity
    );
  }

  generic.castShadow = true;
  generic.receiveShadow = true;

  const seamOverlay =
    baseManualMesh && modifiers.length === 0 ? createSeamOverlay(baseManualMesh) : null;
  if (!seamOverlay) {
    return generic;
  }

  const group = new THREE.Group();
  group.add(generic);
  group.add(seamOverlay);
  return group;
}
