'use client';

import { useEffect, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { useEngineStore } from '@/store/editorStore';
import type { EnvironmentSettings } from '@/types/engine';
import { STORE_OBJECT_PREFIX } from './sceneView.visuals';
import {
  createPrimitiveMesh,
  getSelectionVertexIndices,
  listMeshEdges,
  parseEditableMesh,
  type EditableMesh,
} from './modelerMesh';
import { summarizeMeshWeights } from './paintMesh';
import type { GizmoAxis, GizmoMode, TransformTools } from './gizmos';
import { MODELER_HELPER_GROUP_NAME } from './modelerViewportHelpers';
import type { ViewportCamera } from './viewportCamera';
import { applyWorldLookPreset, type WorldLookPresetName } from './worldPipeline';
import { normalizeAnimatorEditorState } from './animationEditorState';
import { parseMeshModifierStack, summarizeMeshModifierStack } from './meshModifiers';

interface EntityTransformSnapshot {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number };
  scale: { x: number; y: number; z: number };
}

interface EntityAnimatorSnapshot {
  hasAnimator: boolean;
  currentAnimation: string | null;
  activeClipId: string | null;
  activeClipName: string | null;
  clipCount: number;
  trackCount: number;
  boneCount: number;
  ikCount: number;
  constraintCount: number;
  shapeKeyCount: number;
  nlaCount: number;
  poseMode: boolean;
  activeBoneName: string | null;
  clipNames: string[];
  nlaNames: string[];
  weightGroupCount: number;
  shapeKeys: Array<{ name: string; weight: number }>;
}

interface EntitySimulationSnapshot {
  hasCollider: boolean;
  colliderType: string | null;
  hasColliderHelper: boolean;
  hasRigidbody: boolean;
  mass: number | null;
  useGravity: boolean | null;
  isKinematic: boolean | null;
  hasParticleSystem: boolean;
  particleRate: number | null;
  particleMaxParticles: number | null;
  particleLooping: boolean | null;
  hasParticleHelper: boolean;
}

interface EntityModifierStackSnapshot {
  modifierCount: number;
  modifierTypes: string[];
  modifierLabels: string[];
  summary: string;
}

interface ViewportCaptureOptions {
  mimeType?: 'image/png' | 'image/jpeg' | 'image/webp';
  quality?: number;
}

declare global {
  interface Window {
    __REY30_VIEWPORT_TEST__?: {
      createEntity: (kind: 'cube' | 'sphere' | 'light' | 'camera') => string | null;
      selectEntity: (entityId: string | null, additive?: boolean) => boolean;
      setEntityPosition: (entityId: string, position: { x: number; y: number; z: number }) => boolean;
      getEntityTransform: (entityId: string) => EntityTransformSnapshot | null;
      getEntityScreenPoint: (entityId: string) => { x: number; y: number } | null;
      getEntityScreenBounds: (entityId: string) => { minX: number; minY: number; maxX: number; maxY: number } | null;
      getModelerElementScreenPoints: (type: 'vertex' | 'edge' | 'face') => Array<{ index: number; x: number; y: number }>;
      getModelerSelection: () => { mode: string; selected: number[] };
      setModelerMode: (mode: 'object' | 'vertex' | 'edge' | 'face') => boolean;
      setModelerSelection: (selection: number[]) => boolean;
      setSelectedEntityMesh: (mesh: unknown) => boolean;
      getSelectedEntityMesh: () => EditableMesh | null;
      getSelectedEntityMaterialId: () => string | null;
      getSelectedEntityPreviewState: () => { checkerPreview: boolean; checkerScale: number } | null;
      getModelerEdges: () => Array<{ index: number; left: number; right: number }>;
      getModelerSelectionVertexIndices: () => number[];
      getModelerStats: () => { vertices: number; faces: number; edges: number } | null;
      getModelerVertexPosition: (index: number) => { x: number; y: number; z: number } | null;
      getSceneEntityCount: () => number;
      getGizmoAxisScreenPoint: (axis: GizmoAxis) => { x: number; y: number } | null;
      getGizmoAxisAtScreenPoint: (point: { x: number; y: number }) => GizmoAxis | null;
      getSelectedEntityIds: () => string[];
      setGizmoMode: (mode: GizmoMode) => boolean;
      setSnapSettings: (options: {
        enabled?: boolean;
        target?: 'grid' | 'vertex' | 'surface';
      }) => boolean;
      setViewportDisplayOptions: (options: {
        showColliders?: boolean;
        showLights?: boolean;
      }) => boolean;
      getSnapState: () => {
        enabled: boolean;
        target: 'grid' | 'vertex' | 'surface';
      };
      setPaintMode: (options?: {
        mode?:
          | 'vertex'
          | 'texture'
          | 'weight'
          | 'sculpt_draw'
          | 'sculpt_clay'
          | 'sculpt_grab'
          | 'sculpt_smooth'
          | 'sculpt_crease';
        color?: string;
        size?: number;
        strength?: number;
        textureSlot?: 'albedo' | 'normal' | 'roughness' | 'metallic' | 'emissive' | 'occlusion' | 'alpha';
        textureResolution?: number;
        weightBone?: string;
        weightMirror?: boolean;
        weightSmooth?: boolean;
        weightNormalize?: boolean;
        weightErase?: boolean;
        sculptSymmetryX?: boolean;
        sculptDyntopo?: boolean;
        sculptRemeshIterations?: number;
        sculptMultiresLevels?: number;
        sculptVoxelSize?: number;
      }) => boolean;
      paintStroke: (points: Array<{ x: number; y: number }>) => boolean;
      setSelectMode: () => boolean;
      getEntityPaintInfo: (entityId: string) => { hasColor: boolean; paintedVertices: number; totalVertices: number } | null;
      getEntityTexturePaintInfo: (
        entityId: string,
        slot?: 'albedo' | 'normal' | 'roughness' | 'metallic' | 'emissive' | 'occlusion' | 'alpha'
      ) => { hasTexture: boolean; enabled: boolean; isDataUrl: boolean; assetPath: string | null } | null;
      getEntityWeightInfo: (
        entityId: string,
        boneName?: string
      ) => {
        groupIndex: number;
        boneName: string;
        nonZeroVertices: number;
        maxWeight: number;
        averageWeight: number;
      } | null;
      getEntityAnimatorInfo: (entityId: string) => EntityAnimatorSnapshot | null;
      getEntitySimulationInfo: (entityId: string) => EntitySimulationSnapshot | null;
      getEntityModifierInfo: (entityId: string) => EntityModifierStackSnapshot | null;
      captureViewportDataUrl: (options?: ViewportCaptureOptions) => string | null;
      setProjectName: (name: string) => boolean;
      getProjectName: () => string;
      getPaintEditorState: () => {
        enabled: boolean;
        mode:
          | 'vertex'
          | 'texture'
          | 'weight'
          | 'sculpt_draw'
          | 'sculpt_clay'
          | 'sculpt_grab'
          | 'sculpt_smooth'
          | 'sculpt_crease';
        color: string;
        size: number;
        strength: number;
        textureSlot: 'albedo' | 'normal' | 'roughness' | 'metallic' | 'emissive' | 'occlusion' | 'alpha';
        textureResolution: number;
        weightBone: string;
        weightMirror: boolean;
        weightSmooth: boolean;
        weightNormalize: boolean;
        weightErase: boolean;
        sculptSymmetryX: boolean;
        sculptDyntopo: boolean;
        sculptRemeshIterations: number;
        sculptMultiresLevels: number;
        sculptVoxelSize: number;
      };
      getActiveSceneEnvironment: () => EnvironmentSettings | null;
      applyWorldLookPreset: (presetName: WorldLookPresetName) => boolean;
    };
  }
}

function getEntityObject(scene: THREE.Scene | null, entityId: string): THREE.Object3D | null {
  if (!scene) return null;
  return scene.getObjectByName(`${STORE_OBJECT_PREFIX}${entityId}`) ?? null;
}

function getEntityMeshData(entityId: string) {
  const store = useEngineStore.getState();
  const entity = store.entities.get(entityId);
  if (!entity) return null;

  const meshRendererData = entity.components.get('MeshRenderer')?.data;
  const meshRecord =
    meshRendererData && typeof meshRendererData === 'object'
      ? (meshRendererData as Record<string, unknown>)
      : null;
  if (!meshRecord) return null;

  return {
    entity,
    meshRecord,
    mesh:
      parseEditableMesh(meshRecord.manualMesh ?? meshRecord.customMesh) ??
      createPrimitiveMesh(typeof meshRecord.meshId === 'string' ? meshRecord.meshId : 'cube'),
  };
}

function getEntityAnimatorData(entityId: string) {
  const store = useEngineStore.getState();
  const entity = store.entities.get(entityId);
  if (!entity) return null;

  const animatorComponent = entity.components.get('Animator') ?? null;
  const animatorRecord =
    animatorComponent?.data && typeof animatorComponent.data === 'object'
      ? (animatorComponent.data as Record<string, unknown>)
      : null;

  return {
    entity,
    animatorComponent,
    animatorRecord,
    animatorState: animatorRecord
      ? normalizeAnimatorEditorState(animatorRecord, entity.name)
      : null,
  };
}

function projectWorldPointToContainer(
  point: THREE.Vector3,
  camera: ViewportCamera | null,
  container: HTMLDivElement | null
): { x: number; y: number } | null {
  if (!camera || !container) return null;

  const projected = point.clone().project(camera);
  if (!Number.isFinite(projected.x) || !Number.isFinite(projected.y) || !Number.isFinite(projected.z)) {
    return null;
  }

  const rect = container.getBoundingClientRect();
  return {
    x: ((projected.x + 1) / 2) * rect.width,
    y: ((1 - projected.y) / 2) * rect.height,
  };
}

export function useSceneViewTestBridge(params: {
  containerRef: MutableRefObject<HTMLDivElement | null>;
  sceneRef: MutableRefObject<THREE.Scene | null>;
  cameraRef: MutableRefObject<ViewportCamera | null>;
  transformToolsRef: MutableRefObject<TransformTools | null>;
  createManualEntity: (kind: 'cube' | 'sphere' | 'light' | 'camera') => string;
  simulatePaintStroke: (points: Array<{ x: number; y: number }>) => boolean;
  captureViewportDataUrl: (options?: ViewportCaptureOptions) => string | null;
}) {
  const {
    containerRef,
    sceneRef,
    cameraRef,
    transformToolsRef,
    createManualEntity,
    simulatePaintStroke,
    captureViewportDataUrl,
  } = params;

  useEffect(() => {
    window.__REY30_VIEWPORT_TEST__ = {
      createEntity: (kind) => createManualEntity(kind),
      selectEntity: (entityId, additive = false) => {
        const store = useEngineStore.getState();
        store.selectEntity(entityId, additive);

        if (!transformToolsRef.current) return true;
        if (entityId === null) {
          transformToolsRef.current.gizmo.detach();
          return true;
        }

        const target = getEntityObject(sceneRef.current, entityId);
        if (target) {
          transformToolsRef.current.gizmo.attach(target);
        }
        return true;
      },
      setEntityPosition: (entityId, position) => {
        const store = useEngineStore.getState();
        const entity = store.entities.get(entityId);
        if (!entity) return false;

        const components = new Map(entity.components);
        const transform = components.get('Transform');
        if (!transform) return false;

        transform.data = {
          ...(transform.data || {}),
          position,
        };

        components.set('Transform', transform);
        store.updateEntity(entityId, { components });
        return true;
      },
      getEntityTransform: (entityId) => {
        const object = getEntityObject(sceneRef.current, entityId);
        if (!object) return null;

        return {
          position: { x: object.position.x, y: object.position.y, z: object.position.z },
          rotation: { x: object.quaternion.x, y: object.quaternion.y, z: object.quaternion.z, w: object.quaternion.w },
          scale: { x: object.scale.x, y: object.scale.y, z: object.scale.z },
        };
      },
      getEntityScreenPoint: (entityId) => {
        const object = getEntityObject(sceneRef.current, entityId);
        if (!object) return null;

        const worldPosition = new THREE.Vector3();
        object.getWorldPosition(worldPosition);
        return projectWorldPointToContainer(worldPosition, cameraRef.current, containerRef.current);
      },
      getEntityScreenBounds: (entityId) => {
        if (!containerRef.current || !cameraRef.current) return null;

        const object = getEntityObject(sceneRef.current, entityId);
        if (!object) return null;

        const box = new THREE.Box3().setFromObject(object);
        if (box.isEmpty()) return null;

        const corners = [
          new THREE.Vector3(box.min.x, box.min.y, box.min.z),
          new THREE.Vector3(box.min.x, box.min.y, box.max.z),
          new THREE.Vector3(box.min.x, box.max.y, box.min.z),
          new THREE.Vector3(box.min.x, box.max.y, box.max.z),
          new THREE.Vector3(box.max.x, box.min.y, box.min.z),
          new THREE.Vector3(box.max.x, box.min.y, box.max.z),
          new THREE.Vector3(box.max.x, box.max.y, box.min.z),
          new THREE.Vector3(box.max.x, box.max.y, box.max.z),
        ];

        let minX = Number.POSITIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;
        let hasPoint = false;

        for (const corner of corners) {
          const projectedPoint = projectWorldPointToContainer(corner, cameraRef.current, containerRef.current);
          if (!projectedPoint) continue;
          minX = Math.min(minX, projectedPoint.x);
          minY = Math.min(minY, projectedPoint.y);
          maxX = Math.max(maxX, projectedPoint.x);
          maxY = Math.max(maxY, projectedPoint.y);
          hasPoint = true;
        }

        if (!hasPoint) return null;

        return { minX, minY, maxX, maxY };
      },
      getModelerElementScreenPoints: (type) => {
        const scene = sceneRef.current;
        if (!scene) return [];

        const helperRoot = scene.getObjectByName(MODELER_HELPER_GROUP_NAME);
        if (!helperRoot) return [];

        const screenPoints: Array<{ index: number; x: number; y: number }> = [];
        helperRoot.traverse((object) => {
          if (!object.userData?.modelerSelectable) return;
          if (object.userData.modelerElementType !== type) return;
          const worldPosition = new THREE.Vector3();
          object.getWorldPosition(worldPosition);
          const screenPoint = projectWorldPointToContainer(
            worldPosition,
            cameraRef.current,
            containerRef.current
          );
          if (!screenPoint) return;
          screenPoints.push({
            index: object.userData.modelerIndex,
            x: screenPoint.x,
            y: screenPoint.y,
          });
        });
        return screenPoints.sort((left, right) => left.index - right.index);
      },
      getModelerSelection: () => ({
        mode: useEngineStore.getState().editor.modelerMode ?? 'face',
        selected: [...(useEngineStore.getState().editor.modelerSelectedElements ?? [0])],
      }),
      setModelerMode: (mode) => {
        const store = useEngineStore.getState();
        store.setModelerMode(mode);
        return true;
      },
      setModelerSelection: (selection) => {
        const store = useEngineStore.getState();
        store.setModelerSelection(selection);
        return true;
      },
      setSelectedEntityMesh: (mesh) => {
        const store = useEngineStore.getState();
        const entityId = store.editor.selectedEntities.length === 1
          ? store.editor.selectedEntities[0]
          : null;
        if (!entityId) return false;

        const entity = store.entities.get(entityId);
        if (!entity) return false;

        const parsedMesh = parseEditableMesh(mesh);
        if (!parsedMesh) return false;

        const meshRenderer = entity.components.get('MeshRenderer');
        if (!meshRenderer) return false;

        const nextComponents = new Map(entity.components);
        nextComponents.set('MeshRenderer', {
          ...meshRenderer,
          data: {
            ...(meshRenderer.data && typeof meshRenderer.data === 'object'
              ? (meshRenderer.data as Record<string, unknown>)
              : {}),
            meshId: 'custom',
            manualMesh: parsedMesh,
          },
        });

        store.updateEntity(entityId, { components: nextComponents });
        return true;
      },
      getSelectedEntityMesh: () => {
        const store = useEngineStore.getState();
        const entityId = store.editor.selectedEntities.length === 1
          ? store.editor.selectedEntities[0]
          : null;
        if (!entityId) return null;

        const entity = store.entities.get(entityId);
        if (!entity) return null;

        const meshRendererData = entity.components.get('MeshRenderer')?.data;
        const meshRecord =
          meshRendererData && typeof meshRendererData === 'object'
            ? (meshRendererData as Record<string, unknown>)
            : null;
        const mesh = parseEditableMesh(meshRecord?.manualMesh ?? meshRecord?.customMesh)
          ?? createPrimitiveMesh(
            typeof meshRecord?.meshId === 'string' ? meshRecord.meshId : 'cube'
          );

        return {
          vertices: mesh.vertices.map((vertex) => ({ ...vertex })),
          faces: mesh.faces.map((face) => [...face] as [number, number, number]),
          uvs: mesh.uvs?.map((uv) => ({ ...uv })),
          seamEdges: mesh.seamEdges?.map((edge) => [...edge] as [number, number]),
          vertexColors: mesh.vertexColors?.map((color) => ({ ...color })),
          weightGroups: mesh.weightGroups ? [...mesh.weightGroups] : undefined,
          weights: mesh.weights?.map((row) => [...row]),
          vertexMask: mesh.vertexMask ? [...mesh.vertexMask] : undefined,
          hiddenFaces: mesh.hiddenFaces ? [...mesh.hiddenFaces] : undefined,
          faceSets: mesh.faceSets ? [...mesh.faceSets] : undefined,
        };
      },
      getSelectedEntityMaterialId: () => {
        const store = useEngineStore.getState();
        const entityId = store.editor.selectedEntities.length === 1
          ? store.editor.selectedEntities[0]
          : null;
        if (!entityId) return null;

        const entity = store.entities.get(entityId);
        if (!entity) return null;

        const meshRendererData = entity.components.get('MeshRenderer')?.data;
        const meshRecord =
          meshRendererData && typeof meshRendererData === 'object'
            ? (meshRendererData as Record<string, unknown>)
            : null;
        return typeof meshRecord?.materialId === 'string' ? meshRecord.materialId : 'default';
      },
      getSelectedEntityPreviewState: () => {
        const store = useEngineStore.getState();
        const entityId = store.editor.selectedEntities.length === 1
          ? store.editor.selectedEntities[0]
          : null;
        if (!entityId) return null;

        const entity = store.entities.get(entityId);
        if (!entity) return null;

        const meshRendererData = entity.components.get('MeshRenderer')?.data;
        const meshRecord =
          meshRendererData && typeof meshRendererData === 'object'
            ? (meshRendererData as Record<string, unknown>)
            : null;
        const checkerScale = Number(meshRecord?.checkerScale);
        return {
          checkerPreview: Boolean(meshRecord?.checkerPreview),
          checkerScale: Number.isFinite(checkerScale) ? checkerScale : 8,
        };
      },
      getModelerEdges: () => {
        const store = useEngineStore.getState();
        const entityId = store.editor.selectedEntities.length === 1
          ? store.editor.selectedEntities[0]
          : null;
        if (!entityId) return [];

        const entity = store.entities.get(entityId);
        if (!entity) return [];

        const meshRendererData = entity.components.get('MeshRenderer')?.data;
        const meshRecord =
          meshRendererData && typeof meshRendererData === 'object'
            ? (meshRendererData as Record<string, unknown>)
            : null;
        const mesh = parseEditableMesh(meshRecord?.manualMesh ?? meshRecord?.customMesh)
          ?? createPrimitiveMesh(
            typeof meshRecord?.meshId === 'string' ? meshRecord.meshId : 'cube'
          );

        return listMeshEdges(mesh).map(([left, right], index) => ({
          index,
          left,
          right,
        }));
      },
      getModelerSelectionVertexIndices: () => {
        const store = useEngineStore.getState();
        const mode = store.editor.modelerMode ?? 'face';
        if (mode === 'object') return [];
        const entityId = store.editor.selectedEntities.length === 1
          ? store.editor.selectedEntities[0]
          : null;
        if (!entityId) return [];

        const entity = store.entities.get(entityId);
        if (!entity) return [];

        const meshRendererData = entity.components.get('MeshRenderer')?.data;
        const meshRecord =
          meshRendererData && typeof meshRendererData === 'object'
            ? (meshRendererData as Record<string, unknown>)
            : null;
        const mesh = parseEditableMesh(meshRecord?.manualMesh ?? meshRecord?.customMesh)
          ?? createPrimitiveMesh(
            typeof meshRecord?.meshId === 'string' ? meshRecord.meshId : 'cube'
          );

        return getSelectionVertexIndices(
          mesh,
          mode,
          store.editor.modelerSelectedElements ?? [0]
        );
      },
      getModelerStats: () => {
        const store = useEngineStore.getState();
        const entityId = store.editor.selectedEntities.length === 1
          ? store.editor.selectedEntities[0]
          : null;
        if (!entityId) return null;

        const entity = store.entities.get(entityId);
        if (!entity) return null;

        const meshRendererData = entity.components.get('MeshRenderer')?.data;
        const meshRecord =
          meshRendererData && typeof meshRendererData === 'object'
            ? (meshRendererData as Record<string, unknown>)
            : null;
        const mesh = parseEditableMesh(meshRecord?.manualMesh ?? meshRecord?.customMesh)
          ?? createPrimitiveMesh(
            typeof meshRecord?.meshId === 'string' ? meshRecord.meshId : 'cube'
          );

        return {
          vertices: mesh.vertices.length,
          faces: mesh.faces.length,
          edges: listMeshEdges(mesh).length,
        };
      },
      getModelerVertexPosition: (index) => {
        const store = useEngineStore.getState();
        const entityId = store.editor.selectedEntities.length === 1
          ? store.editor.selectedEntities[0]
          : null;
        if (!entityId) return null;

        const entity = store.entities.get(entityId);
        if (!entity) return null;

        const meshRendererData = entity.components.get('MeshRenderer')?.data;
        const meshRecord =
          meshRendererData && typeof meshRendererData === 'object'
            ? (meshRendererData as Record<string, unknown>)
            : null;
        const mesh = parseEditableMesh(meshRecord?.manualMesh ?? meshRecord?.customMesh)
          ?? createPrimitiveMesh(
            typeof meshRecord?.meshId === 'string' ? meshRecord.meshId : 'cube'
          );
        const vertex = mesh.vertices[index];
        return vertex ? { x: vertex.x, y: vertex.y, z: vertex.z } : null;
      },
      getSceneEntityCount: () => useEngineStore.getState().entities.size,
      getGizmoAxisScreenPoint: (axis) => {
        const gizmo = transformToolsRef.current?.gizmo;
        if (!gizmo) return null;

        const worldPoint = gizmo.getAxisWorldPoint(axis);
        if (!worldPoint) return null;

        return projectWorldPointToContainer(worldPoint, cameraRef.current, containerRef.current);
      },
      getGizmoAxisAtScreenPoint: (point) => {
        if (!containerRef.current || !cameraRef.current || !transformToolsRef.current) return null;

        const mouse = new THREE.Vector2(
          (point.x / containerRef.current.clientWidth) * 2 - 1,
          -((point.y / containerRef.current.clientHeight) * 2 - 1)
        );

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, cameraRef.current);

        const gizmo = transformToolsRef.current.gizmo;
        const gizmoObjects: THREE.Object3D[] = [];
        gizmo.object.traverse((obj) => {
          gizmoObjects.push(obj);
        });
        const intersects = raycaster.intersectObjects(gizmoObjects, true);

        return gizmo.getHoveredAxis(raycaster) ??
          (intersects.length > 0 ? gizmo.getAxisFromIntersection(intersects[0].object) : null);
      },
      getSelectedEntityIds: () => [...useEngineStore.getState().editor.selectedEntities],
      setGizmoMode: (mode) => {
        const store = useEngineStore.getState();
        store.setGizmoMode(mode);
        transformToolsRef.current?.gizmo.setMode(mode);
        return true;
      },
      setSnapSettings: (options) => {
        const store = useEngineStore.getState();
        if (typeof options.enabled === 'boolean') {
          store.setSnapEnabled(options.enabled);
        }
        if (options.target) {
          store.setSnapTarget(options.target);
        }
        return true;
      },
      setViewportDisplayOptions: (options) => {
        const store = useEngineStore.getState();
        if (typeof options.showColliders === 'boolean') {
          store.setShowColliders(options.showColliders);
        }
        if (typeof options.showLights === 'boolean') {
          store.setShowLights(options.showLights);
        }
        return true;
      },
      getSnapState: () => {
        const editor = useEngineStore.getState().editor;
        return {
          enabled: Boolean(editor.snapEnabled),
          target: (editor.snapTarget ?? 'grid') as 'grid' | 'vertex' | 'surface',
        };
      },
      setPaintMode: (options) => {
        const store = useEngineStore.getState();
        store.setEditorTool('brush');
        store.setPaintEnabled(true);
        store.setPaintMode(options?.mode ?? 'vertex');
        if (options?.color) store.setPaintColor(options.color);
        if (typeof options?.size === 'number') store.setPaintSize(options.size);
        if (typeof options?.strength === 'number') store.setPaintStrength(options.strength);
        if (options?.textureSlot) store.setPaintTextureSlot(options.textureSlot);
        if (typeof options?.textureResolution === 'number') {
          store.setPaintTextureResolution(options.textureResolution);
        }
        if (options?.weightBone) store.setPaintWeightBone(options.weightBone);
        if (typeof options?.weightMirror === 'boolean') {
          store.setPaintWeightMirror(options.weightMirror);
        }
        if (typeof options?.weightSmooth === 'boolean') {
          store.setPaintWeightSmooth(options.weightSmooth);
        }
        if (typeof options?.weightNormalize === 'boolean') {
          store.setPaintWeightNormalize(options.weightNormalize);
        }
        if (typeof options?.weightErase === 'boolean') {
          store.setPaintWeightErase(options.weightErase);
        }
        if (typeof options?.sculptSymmetryX === 'boolean') {
          store.setSculptSymmetryX(options.sculptSymmetryX);
        }
        if (typeof options?.sculptDyntopo === 'boolean') {
          store.setSculptDyntopo(options.sculptDyntopo);
        }
        if (typeof options?.sculptRemeshIterations === 'number') {
          store.setSculptRemeshIterations(options.sculptRemeshIterations);
        }
        if (typeof options?.sculptMultiresLevels === 'number') {
          store.setSculptMultiresLevels(options.sculptMultiresLevels);
        }
        if (typeof options?.sculptVoxelSize === 'number') {
          store.setSculptVoxelSize(options.sculptVoxelSize);
        }
        return true;
      },
      paintStroke: (points) => simulatePaintStroke(points),
      setSelectMode: () => {
        const store = useEngineStore.getState();
        store.setEditorTool('select');
        store.setPaintEnabled(false);
        return true;
      },
      getEntityPaintInfo: (entityId) => {
        const resolved = getEntityMeshData(entityId);
        if (!resolved) return null;

        const paintedVertices = (resolved.mesh.vertexColors ?? []).reduce((count, color) => {
          const isPainted =
            Math.abs((color?.r ?? 1) - 1) > 0.001 ||
            Math.abs((color?.g ?? 1) - 1) > 0.001 ||
            Math.abs((color?.b ?? 1) - 1) > 0.001 ||
            Math.abs((color?.a ?? 1) - 1) > 0.001;
          return count + (isPainted ? 1 : 0);
        }, 0);
        return {
          hasColor: paintedVertices > 0,
          paintedVertices,
          totalVertices: resolved.mesh.vertices.length,
        };
      },
      getEntityTexturePaintInfo: (entityId, slot = 'albedo') => {
        const resolved = getEntityMeshData(entityId);
        const meshRecord = resolved?.meshRecord;
        const material = meshRecord?.material && typeof meshRecord.material === 'object'
          ? (meshRecord.material as Record<string, unknown>)
          : null;
        const textureMaps = material?.textureMaps && typeof material.textureMaps === 'object'
          ? (material.textureMaps as Record<string, unknown>)
          : null;
        const slotRecord = textureMaps?.[slot] && typeof textureMaps[slot] === 'object'
          ? (textureMaps[slot] as Record<string, unknown>)
          : null;
        const assetPath =
          typeof slotRecord?.assetPath === 'string' && slotRecord.assetPath.trim().length > 0
            ? slotRecord.assetPath.trim()
            : null;

        return {
          hasTexture: Boolean(assetPath),
          enabled: Boolean(slotRecord?.enabled),
          isDataUrl: Boolean(assetPath?.startsWith('data:')),
          assetPath,
        };
      },
      getEntityWeightInfo: (entityId, boneName = 'Spine') => {
        const resolved = getEntityMeshData(entityId);
        if (!resolved) return null;
        const summary = summarizeMeshWeights(resolved.mesh, boneName);
        return {
          boneName,
          ...summary,
        };
      },
      getEntityAnimatorInfo: (entityId) => {
        const resolved = getEntityAnimatorData(entityId);
        if (!resolved) return null;

        const state = resolved.animatorState;
        const activeClip = state?.clips.find((clip) => clip.id === state.activeClipId) ?? state?.clips[0] ?? null;
        const meshData = getEntityMeshData(entityId);

        return {
          hasAnimator: Boolean(resolved.animatorComponent && state),
          currentAnimation:
            resolved.animatorRecord && typeof resolved.animatorRecord.currentAnimation === 'string'
              ? resolved.animatorRecord.currentAnimation
              : null,
          activeClipId: state?.activeClipId ?? null,
          activeClipName: activeClip?.name ?? null,
          clipCount: state?.clips.length ?? 0,
          trackCount: activeClip?.tracks.length ?? 0,
          boneCount: state?.bones.length ?? 0,
          ikCount: state?.ikChains.length ?? 0,
          constraintCount: state?.constraints.length ?? 0,
          shapeKeyCount: state?.shapeKeys.length ?? 0,
          nlaCount: state?.nlaStrips.length ?? 0,
          poseMode: Boolean(state?.poseMode),
          activeBoneName:
            state?.bones.find((bone) => bone.id === state.activeBoneId)?.name ?? null,
          clipNames: state?.clips.map((clip) => clip.name) ?? [],
          nlaNames: state?.nlaStrips.map((strip) => strip.name) ?? [],
          weightGroupCount: meshData?.mesh.weightGroups?.length ?? 0,
          shapeKeys:
            state?.shapeKeys.map((shapeKey) => ({
              name: shapeKey.name,
              weight: shapeKey.weight,
            })) ?? [],
        };
      },
      getEntitySimulationInfo: (entityId) => {
        const store = useEngineStore.getState();
        const entity = store.entities.get(entityId);
        if (!entity) return null;

        const colliderData =
          entity.components.get('Collider')?.data &&
          typeof entity.components.get('Collider')?.data === 'object'
            ? (entity.components.get('Collider')?.data as Record<string, unknown>)
            : null;
        const rigidbodyData =
          entity.components.get('Rigidbody')?.data &&
          typeof entity.components.get('Rigidbody')?.data === 'object'
            ? (entity.components.get('Rigidbody')?.data as Record<string, unknown>)
            : null;
        const particleData =
          entity.components.get('ParticleSystem')?.data &&
          typeof entity.components.get('ParticleSystem')?.data === 'object'
            ? (entity.components.get('ParticleSystem')?.data as Record<string, unknown>)
            : null;
        const object = getEntityObject(sceneRef.current, entityId);

        return {
          hasCollider: Boolean(entity.components.get('Collider')),
          colliderType:
            colliderData && typeof colliderData.type === 'string' ? colliderData.type : null,
          hasColliderHelper: Boolean(object?.getObjectByName('__collider_helper')),
          hasRigidbody: Boolean(entity.components.get('Rigidbody')),
          mass:
            rigidbodyData && typeof rigidbodyData.mass === 'number' ? rigidbodyData.mass : null,
          useGravity:
            rigidbodyData && typeof rigidbodyData.useGravity === 'boolean'
              ? rigidbodyData.useGravity
              : null,
          isKinematic:
            rigidbodyData && typeof rigidbodyData.isKinematic === 'boolean'
              ? rigidbodyData.isKinematic
              : null,
          hasParticleSystem: Boolean(entity.components.get('ParticleSystem')),
          particleRate:
            particleData && typeof particleData.rate === 'number' ? particleData.rate : null,
          particleMaxParticles:
            particleData && typeof particleData.maxParticles === 'number'
              ? particleData.maxParticles
              : null,
          particleLooping:
            particleData && typeof particleData.looping === 'boolean'
              ? particleData.looping
              : null,
          hasParticleHelper: Boolean(object?.getObjectByName('__particle_helper')),
        };
      },
      getEntityModifierInfo: (entityId) => {
        const resolved = getEntityMeshData(entityId);
        if (!resolved) return null;

        const modifiers = parseMeshModifierStack(resolved.meshRecord.modifiers);
        return {
          modifierCount: modifiers.length,
          modifierTypes: modifiers.map((modifier) => modifier.type),
          modifierLabels: modifiers.map((modifier) => modifier.label ?? modifier.type),
          summary: summarizeMeshModifierStack(modifiers),
        };
      },
      captureViewportDataUrl: (options) => captureViewportDataUrl(options),
      setProjectName: (name) => {
        useEngineStore.getState().setProjectName(name);
        return true;
      },
      getProjectName: () => useEngineStore.getState().projectName,
      getPaintEditorState: () => {
        const editor = useEngineStore.getState().editor;
        return {
          enabled: Boolean(editor.paintEnabled || editor.tool === 'brush'),
          mode: editor.paintMode ?? 'vertex',
          color: editor.paintColor ?? '#ff4d6d',
          size: editor.paintSize ?? 0.5,
          strength: editor.paintStrength ?? 0.8,
          textureSlot: editor.paintTextureSlot ?? 'albedo',
          textureResolution: editor.paintTextureResolution ?? 1024,
          weightBone: editor.paintWeightBone ?? 'Spine',
          weightMirror: Boolean(editor.paintWeightMirror),
          weightSmooth: Boolean(editor.paintWeightSmooth),
          weightNormalize: Boolean(editor.paintWeightNormalize),
          weightErase: Boolean(editor.paintWeightErase),
          sculptSymmetryX: Boolean(editor.sculptSymmetryX),
          sculptDyntopo: Boolean(editor.sculptDyntopo),
          sculptRemeshIterations: editor.sculptRemeshIterations ?? 1,
          sculptMultiresLevels: editor.sculptMultiresLevels ?? 1,
          sculptVoxelSize: editor.sculptVoxelSize ?? 0.12,
        };
      },
      getActiveSceneEnvironment: () => {
        const store = useEngineStore.getState();
        const scene = store.scenes.find((candidate) => candidate.id === store.activeSceneId) ?? null;
        return scene ? structuredClone(scene.environment) : null;
      },
      applyWorldLookPreset: (presetName) => {
        const store = useEngineStore.getState();
        const scene = store.scenes.find((candidate) => candidate.id === store.activeSceneId) ?? null;
        if (!scene) return false;
        store.updateScene(scene.id, {
          environment: applyWorldLookPreset(scene.environment, presetName),
        });
        return true;
      },
    };

    return () => {
      delete window.__REY30_VIEWPORT_TEST__;
    };
  }, [
    cameraRef,
    captureViewportDataUrl,
    containerRef,
    createManualEntity,
    sceneRef,
    simulatePaintStroke,
    transformToolsRef,
  ]);
}
