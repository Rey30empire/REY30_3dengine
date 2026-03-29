'use client';

import {
  useCallback,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type MutableRefObject,
} from 'react';
import * as THREE from 'three';
import { useEngineStore } from '@/store/editorStore';
import type { ViewportCamera } from './viewportCamera';
import { buildAssetFileUrl } from './assetUrls';
import { resolveEditorMaterial } from './editorMaterials';
import {
  createPrimitiveMesh,
  parseEditableMesh,
  sanitizeEditableMesh,
  unwrapMeshPlanar,
  type EditableMesh,
  voxelRemeshMesh,
} from './modelerMesh';
import {
  paintMeshVertexColors,
  paintMeshWeights,
} from './paintMesh';
import { sculptMesh, type SculptBrush } from './sculptMesh';

type PaintEntitySnapshot = {
  entityId: string;
  beforeData: Record<string, unknown>;
  afterData: Record<string, unknown> | null;
};

type PaintStroke = {
  timestamp: number;
  entities: PaintEntitySnapshot[];
};

type TextureCanvasState = {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  resolution: number;
  assetPath: string | null;
};

type PaintMode =
  | 'vertex'
  | 'texture'
  | 'weight'
  | 'sculpt_draw'
  | 'sculpt_clay'
  | 'sculpt_grab'
  | 'sculpt_smooth'
  | 'sculpt_crease';

const PAINT_HISTORY_LIMIT = 50;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
}

function cloneRecord(value: unknown): Record<string, unknown> {
  const record = asRecord(value);
  if (!record) return {};
  return structuredClone(record);
}

function findPaintEntityId(object: THREE.Object3D | null): string | null {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (typeof current.userData?.entityId === 'string') {
      return current.userData.entityId;
    }
    current = current.parent;
  }
  return null;
}

function createDefaultCanvasColor(slot: string, meshRendererData: Record<string, unknown>) {
  const material = resolveEditorMaterial(meshRendererData);
  if (slot === 'albedo') {
    return `rgba(${Math.round(material.albedoColor.r * 255)}, ${Math.round(material.albedoColor.g * 255)}, ${Math.round(material.albedoColor.b * 255)}, ${material.albedoColor.a.toFixed(3)})`;
  }
  if (slot === 'emissive') {
    return `rgba(${Math.round(material.emissiveColor.r * 255)}, ${Math.round(material.emissiveColor.g * 255)}, ${Math.round(material.emissiveColor.b * 255)}, 1)`;
  }
  if (slot === 'normal') {
    return 'rgba(128, 128, 255, 1)';
  }
  if (slot === 'metallic') {
    const value = Math.round(material.metallic * 255);
    return `rgba(${value}, ${value}, ${value}, 1)`;
  }
  if (slot === 'roughness') {
    const value = Math.round(material.roughness * 255);
    return `rgba(${value}, ${value}, ${value}, 1)`;
  }
  if (slot === 'occlusion') {
    const value = Math.round(material.occlusionStrength * 255);
    return `rgba(${value}, ${value}, ${value}, 1)`;
  }
  return 'rgba(255, 255, 255, 1)';
}

function resolveEditableMesh(meshRendererData: Record<string, unknown>) {
  return (
    parseEditableMesh(meshRendererData.manualMesh ?? meshRendererData.customMesh) ??
    createPrimitiveMesh(
      typeof meshRendererData.meshId === 'string' ? meshRendererData.meshId : 'cube'
    )
  );
}

function buildMeshRendererDataWithMesh(
  meshRendererData: Record<string, unknown>,
  mesh: EditableMesh
) {
  return {
    ...meshRendererData,
    meshId: 'custom',
    manualMesh: sanitizeEditableMesh(mesh),
  };
}

function buildTexturePaintColor(rawColor: string, slot: string, alpha: number) {
  const color = new THREE.Color(rawColor || '#ff4d6d');
  const luminance = color.r * 0.299 + color.g * 0.587 + color.b * 0.114;

  if (
    slot === 'metallic' ||
    slot === 'roughness' ||
    slot === 'occlusion' ||
    slot === 'alpha'
  ) {
    const value = Math.round(luminance * 255);
    return `rgba(${value}, ${value}, ${value}, ${alpha.toFixed(3)})`;
  }

  return `rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${alpha.toFixed(3)})`;
}

function isSculptPaintMode(mode: PaintMode): mode is Extract<PaintMode, `sculpt_${string}`> {
  return mode.startsWith('sculpt_');
}

function getSculptBrush(mode: PaintMode): SculptBrush {
  switch (mode) {
    case 'sculpt_clay':
      return 'clay';
    case 'sculpt_grab':
      return 'grab';
    case 'sculpt_smooth':
      return 'smooth';
    case 'sculpt_crease':
      return 'crease';
    case 'sculpt_draw':
    default:
      return 'draw';
  }
}

function ensureTextureCanvasState(params: {
  cache: Map<string, TextureCanvasState>;
  cacheKey: string;
  resolution: number;
  slot: string;
  meshRendererData: Record<string, unknown>;
}) {
  const { cache, cacheKey, resolution, slot, meshRendererData } = params;
  const material = resolveEditorMaterial(meshRendererData);
  const currentPath = material.textureMaps[slot as keyof typeof material.textureMaps]?.assetPath ?? null;
  const existing = cache.get(cacheKey);
  if (
    existing &&
    existing.resolution === resolution &&
    existing.assetPath === currentPath
  ) {
    return existing;
  }

  const canvas = document.createElement('canvas');
  canvas.width = resolution;
  canvas.height = resolution;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    throw new Error('No se pudo crear contexto 2D para texture paint.');
  }

  context.fillStyle = createDefaultCanvasColor(slot, meshRendererData);
  context.fillRect(0, 0, resolution, resolution);

  const currentUrl = buildAssetFileUrl(currentPath);
  if (currentUrl) {
    const image = new Image();
    image.src = currentUrl;
    if (image.complete && image.naturalWidth > 0) {
      context.drawImage(image, 0, 0, resolution, resolution);
    }
  }

  const nextState = {
    canvas,
    context,
    resolution,
    assetPath: currentPath,
  };
  cache.set(cacheKey, nextState);
  return nextState;
}

function applyPaintSnapshot(snapshot: PaintEntitySnapshot, mode: 'before' | 'after') {
  const store = useEngineStore.getState();
  const entity = store.entities.get(snapshot.entityId);
  if (!entity) return;

  const meshRenderer = entity.components.get('MeshRenderer');
  if (!meshRenderer) return;

  const data = mode === 'before' ? snapshot.beforeData : snapshot.afterData;
  if (!data) return;

  const nextComponents = new Map(entity.components);
  nextComponents.set('MeshRenderer', {
    ...meshRenderer,
    data: cloneRecord(data),
  });
  store.updateEntityTransient(snapshot.entityId, { components: nextComponents });
}

export function useSceneViewPaint(params: {
  containerRef: MutableRefObject<HTMLDivElement | null>;
  cameraRef: MutableRefObject<ViewportCamera | null>;
  sceneRef: MutableRefObject<THREE.Scene | null>;
  paintEnabled: boolean;
  tool: string;
  paintMode?: PaintMode;
  paintColor?: string;
  paintSize?: number;
  paintStrength?: number;
  paintTextureSlot?: 'albedo' | 'normal' | 'roughness' | 'metallic' | 'emissive' | 'occlusion' | 'alpha';
  paintTextureResolution?: number;
  paintWeightBone?: string;
  paintWeightMirror?: boolean;
  paintWeightSmooth?: boolean;
  paintWeightNormalize?: boolean;
  paintWeightErase?: boolean;
  sculptSymmetryX?: boolean;
  sculptDyntopo?: boolean;
  sculptRemeshIterations?: number;
  sculptVoxelSize?: number;
}) {
  const {
    containerRef,
    cameraRef,
    sceneRef,
    paintEnabled,
    tool,
    paintMode = 'vertex',
    paintColor,
    paintSize,
    paintStrength,
    paintTextureSlot = 'albedo',
    paintTextureResolution = 1024,
    paintWeightBone = 'Spine',
    paintWeightMirror = true,
    paintWeightSmooth = true,
    paintWeightNormalize = true,
    paintWeightErase = false,
    sculptSymmetryX = true,
    sculptDyntopo = false,
    sculptRemeshIterations = 1,
    sculptVoxelSize = 0.12,
  } = params;

  const [isPainting, setIsPainting] = useState(false);
  const paintHistoryRef = useRef<{ past: PaintStroke[]; future: PaintStroke[] }>({
    past: [],
    future: [],
  });
  const paintStrokeRef = useRef<Map<string, PaintEntitySnapshot> | null>(null);
  const textureCanvasCacheRef = useRef<Map<string, TextureCanvasState>>(new Map());
  const sculptStrokeStateRef = useRef<Map<string, { lastLocalPoint: THREE.Vector3 }>>(new Map());

  const finalizePaintStroke = useCallback(() => {
    const stroke = paintStrokeRef.current;
    if (!stroke || stroke.size === 0) {
      paintStrokeRef.current = null;
      sculptStrokeStateRef.current.clear();
      return;
    }

    const store = useEngineStore.getState();
    const entities: PaintEntitySnapshot[] = [];

    stroke.forEach((snapshot, entityId) => {
      const entity = store.entities.get(entityId);
      const meshRendererData = entity?.components.get('MeshRenderer')?.data;
      snapshot.afterData = cloneRecord(meshRendererData);
      entities.push(snapshot);
    });

    paintHistoryRef.current.past.push({ timestamp: Date.now(), entities });
    if (paintHistoryRef.current.past.length > PAINT_HISTORY_LIMIT) {
      paintHistoryRef.current.past = paintHistoryRef.current.past.slice(-PAINT_HISTORY_LIMIT);
    }
    paintHistoryRef.current.future = [];
    paintStrokeRef.current = null;
    sculptStrokeStateRef.current.clear();
  }, []);

  const undoPaint = useCallback(() => {
    const past = paintHistoryRef.current.past;
    if (past.length === 0) return false;
    const stroke = past.pop();
    if (!stroke) return false;
    stroke.entities.forEach((snapshot) => applyPaintSnapshot(snapshot, 'before'));
    paintHistoryRef.current.future.push(stroke);
    return true;
  }, []);

  const redoPaint = useCallback(() => {
    const future = paintHistoryRef.current.future;
    if (future.length === 0) return false;
    const stroke = future.pop();
    if (!stroke) return false;
    stroke.entities.forEach((snapshot) => applyPaintSnapshot(snapshot, 'after'));
    paintHistoryRef.current.past.push(stroke);
    return true;
  }, []);

  const paintAt = useCallback((event: ReactMouseEvent | MouseEvent) => {
    if (!containerRef.current || !cameraRef.current || !sceneRef.current) return;
    if (!paintEnabled && tool !== 'brush') return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const mouse = new THREE.Vector2((x / rect.width) * 2 - 1, -((y / rect.height) * 2 - 1));
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, cameraRef.current);

    const paintable: THREE.Object3D[] = [];
    sceneRef.current.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        paintable.push(obj);
      }
    });

    const intersections = raycaster.intersectObjects(paintable, true);
    const hit =
      intersections.find((entry) => {
        const candidateEntityId = findPaintEntityId(entry.object);
        if (!candidateEntityId) return false;
        return paintMode !== 'texture' || Boolean(entry.uv);
      }) ??
      intersections.find((entry) => Boolean(findPaintEntityId(entry.object))) ??
      null;
    if (!hit) return;

    const entityId = findPaintEntityId(hit.object);
    if (!entityId) return;

    const store = useEngineStore.getState();
    const entity = store.entities.get(entityId);
    if (!entity) return;

    const meshRenderer = entity.components.get('MeshRenderer');
    if (!meshRenderer) return;

    const meshRendererData = cloneRecord(meshRenderer.data);
    const stroke = paintStrokeRef.current;
    if (stroke && !stroke.has(entityId)) {
      stroke.set(entityId, {
        entityId,
        beforeData: cloneRecord(meshRenderer.data),
        afterData: null,
      });
    }

    const targetMesh = hit.object as THREE.Mesh;
    const worldScale = new THREE.Vector3();
    targetMesh.getWorldScale(worldScale);
    const maxScale = Math.max(worldScale.x, worldScale.y, worldScale.z, 0.0001);
    const localBrushSize = (paintSize ?? 0.5) / maxScale;

    if (paintMode === 'texture') {
      let editableMesh = resolveEditableMesh(meshRendererData);
      if (!editableMesh.uvs || editableMesh.uvs.length !== editableMesh.vertices.length) {
        editableMesh = unwrapMeshPlanar(editableMesh);
        Object.assign(meshRendererData, buildMeshRendererDataWithMesh(meshRendererData, editableMesh));
      }

      const cacheKey = `${entityId}:${paintTextureSlot}`;
      const state = ensureTextureCanvasState({
        cache: textureCanvasCacheRef.current,
        cacheKey,
        resolution: Math.max(128, Math.min(4096, Math.round(paintTextureResolution))),
        slot: paintTextureSlot,
        meshRendererData,
      });

      const uv = hit.uv;
      if (!uv) return;
      const resolution = state.resolution;
      const px = uv.x * resolution;
      const py = (1 - uv.y) * resolution;
      const radiusPx = Math.max(4, resolution * Math.max(0.01, paintSize ?? 0.5) * 0.08);
      const gradient = state.context.createRadialGradient(px, py, 0, px, py, radiusPx);
      gradient.addColorStop(
        0,
        buildTexturePaintColor(paintColor || '#ff4d6d', paintTextureSlot, clampStrength(paintStrength))
      );
      gradient.addColorStop(1, buildTexturePaintColor(paintColor || '#ff4d6d', paintTextureSlot, 0));
      state.context.fillStyle = gradient;
      state.context.beginPath();
      state.context.arc(px, py, radiusPx, 0, Math.PI * 2);
      state.context.fill();

      const currentMaterial = asRecord(meshRendererData.material) ?? {};
      const currentMaps = asRecord(currentMaterial.textureMaps) ?? {};
      const nextDataUrl = state.canvas.toDataURL('image/png');
      const nextData = {
        ...meshRendererData,
        material: {
          ...currentMaterial,
          textureMaps: {
            ...currentMaps,
            [paintTextureSlot]: {
              assetPath: nextDataUrl,
              enabled: true,
            },
          },
        },
      };

      const nextComponents = new Map(entity.components);
      nextComponents.set('MeshRenderer', {
        ...meshRenderer,
        data: nextData,
      });
      store.updateEntityTransient(entityId, { components: nextComponents });
      return;
    }

    const editableMesh = resolveEditableMesh(meshRendererData);
    const worldToLocal = new THREE.Matrix4().copy(targetMesh.matrixWorld).invert();
    const localPoint = hit.point.clone().applyMatrix4(worldToLocal);
    const worldQuaternion = new THREE.Quaternion();
    targetMesh.getWorldQuaternion(worldQuaternion);
    const localBrushNormal = raycaster.ray.direction
      .clone()
      .applyQuaternion(worldQuaternion.clone().invert())
      .multiplyScalar(-1)
      .normalize();
    const center = {
      x: localPoint.x,
      y: localPoint.y,
      z: localPoint.z,
    };

    const sculptBrush = getSculptBrush(paintMode);
    const previousSculptState = sculptStrokeStateRef.current.get(entityId);
    const sculptDelta = previousSculptState
      ? localPoint.clone().sub(previousSculptState.lastLocalPoint)
      : new THREE.Vector3();
    sculptStrokeStateRef.current.set(entityId, {
      lastLocalPoint: localPoint.clone(),
    });

    let nextMesh =
      paintMode === 'weight'
        ? paintMeshWeights({
            mesh: editableMesh,
            center,
            radius: localBrushSize,
            boneName: paintWeightBone,
            strength: clampStrength(paintStrength),
            erase: paintWeightErase,
            mirror: paintWeightMirror,
            smooth: paintWeightSmooth,
            normalize: paintWeightNormalize,
          })
        : paintMeshVertexColors({
            mesh: editableMesh,
            center,
            radius: localBrushSize,
            color: colorToEditable(paintColor || '#ff4d6d'),
            strength: clampStrength(paintStrength),
          });

    if (isSculptPaintMode(paintMode)) {
      nextMesh = sculptMesh({
        mesh: editableMesh,
        brush: sculptBrush,
        center,
        radius: localBrushSize,
        strength: clampStrength(paintStrength),
        delta: {
          x: sculptDelta.x,
          y: sculptDelta.y,
          z: sculptDelta.z,
        },
        brushNormal: {
          x: localBrushNormal.x,
          y: localBrushNormal.y,
          z: localBrushNormal.z,
        },
        symmetryX: sculptSymmetryX,
      });

      if (sculptDyntopo) {
        nextMesh = voxelRemeshMesh(
          nextMesh,
          Math.min(
            Math.max(0.03, sculptVoxelSize),
            Math.max(0.03, localBrushSize * 0.75)
          ),
          Math.max(1, Math.min(3, Math.round(sculptRemeshIterations)))
        );
      }
    }

    const nextData = buildMeshRendererDataWithMesh(meshRendererData, nextMesh);
    const nextComponents = new Map(entity.components);
    nextComponents.set('MeshRenderer', {
      ...meshRenderer,
      data: nextData,
    });
    store.updateEntityTransient(entityId, { components: nextComponents });
  }, [
    cameraRef,
    containerRef,
    paintColor,
    paintEnabled,
    paintMode,
    paintSize,
    paintStrength,
    paintTextureResolution,
    paintTextureSlot,
    paintWeightBone,
    paintWeightErase,
    paintWeightMirror,
    paintWeightNormalize,
    paintWeightSmooth,
    sculptDyntopo,
    sculptRemeshIterations,
    sculptVoxelSize,
    sculptSymmetryX,
    sceneRef,
    tool,
  ]);

  const startPaint = useCallback((event: ReactMouseEvent) => {
    paintStrokeRef.current = new Map();
    sculptStrokeStateRef.current.clear();
    setIsPainting(true);
    paintAt(event);
  }, [paintAt]);

  const continuePaint = useCallback((event: ReactMouseEvent) => {
    if (!isPainting) return;
    paintAt(event);
  }, [isPainting, paintAt]);

  const finishPaint = useCallback(() => {
    if (!isPainting) return false;
    setIsPainting(false);
    finalizePaintStroke();
    return true;
  }, [finalizePaintStroke, isPainting]);

  const cancelPaint = useCallback(() => {
    if (!isPainting) return false;
    setIsPainting(false);
    finalizePaintStroke();
    return true;
  }, [finalizePaintStroke, isPainting]);

  const getLastPastPaintTimestamp = useCallback(() => {
    const past = paintHistoryRef.current.past;
    return past[past.length - 1]?.timestamp ?? -Infinity;
  }, []);

  const getLastFuturePaintTimestamp = useCallback(() => {
    const future = paintHistoryRef.current.future;
    return future[future.length - 1]?.timestamp ?? -Infinity;
  }, []);

  const simulatePaintStroke = useCallback((points: Array<{ x: number; y: number }>) => {
    if (points.length === 0 || !containerRef.current) return false;
    const rect = containerRef.current.getBoundingClientRect();
    paintStrokeRef.current = new Map();
    sculptStrokeStateRef.current.clear();
    for (const point of points) {
      paintAt({
        clientX: rect.left + point.x,
        clientY: rect.top + point.y,
        button: 0,
      } as MouseEvent);
    }
    const painted = paintStrokeRef.current.size > 0;
    finalizePaintStroke();
    return painted;
  }, [containerRef, finalizePaintStroke, paintAt]);

  return {
    isPainting,
    startPaint,
    continuePaint,
    finishPaint,
    cancelPaint,
    undoPaint,
    redoPaint,
    getLastPastPaintTimestamp,
    getLastFuturePaintTimestamp,
    simulatePaintStroke,
  };
}

function colorToEditable(hex: string) {
  const color = new THREE.Color(hex);
  return {
    r: color.r,
    g: color.g,
    b: color.b,
    a: 1,
  };
}

function clampStrength(value: number | undefined) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(1, Math.max(0.01, numeric)) : 0.8;
}
