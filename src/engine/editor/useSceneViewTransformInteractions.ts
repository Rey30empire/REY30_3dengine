'use client';

import { useCallback, useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import type { TransformTools } from './gizmos';
import { getSelectionCenter, type EditableMesh, type ModelerElementMode } from './modelerMesh';
import { STORE_OBJECT_PREFIX } from './sceneView.visuals';

interface ModelerDragState {
  entityId: string;
  mode: ModelerElementMode;
  selection: number[];
  startMesh: EditableMesh;
  vertexIndices: number[];
  worldMatrix: THREE.Matrix4;
  worldMatrixInverse: THREE.Matrix4;
  startPosition: THREE.Vector3;
  startQuaternion: THREE.Quaternion;
  startScale: THREE.Vector3;
  maxDistanceFromCenter: number;
}

interface ObjectPivotDragTarget {
  object: THREE.Object3D;
  startWorldMatrix: THREE.Matrix4;
  parentWorldMatrixInverse: THREE.Matrix4;
}

interface ObjectPivotDragState {
  startPosition: THREE.Vector3;
  startQuaternion: THREE.Quaternion;
  startScale: THREE.Vector3;
  targets: ObjectPivotDragTarget[];
}

const MODELER_GIZMO_PROXY_NAME = '__modeler_gizmo_proxy';
const OBJECT_PIVOT_GIZMO_PROXY_NAME = '__object_pivot_gizmo_proxy';
const MODELER_SUBELEMENT_SCALE_MIN = 0.25;
const MODELER_SUBELEMENT_SCALE_MAX = 3.5;
const MODELER_SUBELEMENT_DISTANCE_LIMIT_MULTIPLIER = 3.5;

export type SceneViewTransformAttachmentMode =
  | 'modeler-subselection'
  | 'selection-center-pivot'
  | 'selected-entity'
  | 'detach';

export function deriveSceneViewTransformAttachmentMode(params: {
  modelerSubSelectionActive: boolean;
  selectedModelerEntityId: string | null;
  hasSelectedModelerMesh: boolean;
  selectedEntityCount: number;
  pivotMode: 'objectOrigin' | 'selectionCenter';
}): SceneViewTransformAttachmentMode {
  const {
    modelerSubSelectionActive,
    selectedModelerEntityId,
    hasSelectedModelerMesh,
    selectedEntityCount,
    pivotMode,
  } = params;

  if (
    modelerSubSelectionActive &&
    Boolean(selectedModelerEntityId) &&
    hasSelectedModelerMesh
  ) {
    return 'modeler-subselection';
  }

  if (selectedEntityCount === 0) {
    return selectedModelerEntityId ? 'selected-entity' : 'detach';
  }

  if (pivotMode === 'selectionCenter') {
    return 'selection-center-pivot';
  }

  return 'selected-entity';
}

export function useSceneViewTransformInteractions(params: {
  sceneRef: MutableRefObject<THREE.Scene | null>;
  transformToolsRef: MutableRefObject<TransformTools | null>;
  selectedEntities: string[];
  selectedModelerEntityId: string | null;
  selectedModelerMesh: EditableMesh | null;
  selectedModelerVertexIndices: number[];
  safeModelerSelection: number[];
  selectedModelerMeshSignature: string | null;
  safeModelerSelectionSignature: string;
  modelerMode: 'object' | ModelerElementMode;
  modelerSubSelectionActive: boolean;
  pivotMode: 'objectOrigin' | 'selectionCenter';
  transformSpace: 'world' | 'local';
  gizmoMode: 'translate' | 'rotate' | 'scale';
  syncModelerMeshToStore: (nextMesh: EditableMesh, commit?: boolean) => void;
  syncObjectTransformToStore: (
    object: THREE.Object3D | null,
    options?: { commit?: boolean }
  ) => void;
}) {
  const {
    sceneRef,
    transformToolsRef,
    selectedEntities,
    selectedModelerEntityId,
    selectedModelerMesh,
    selectedModelerVertexIndices,
    safeModelerSelection,
    selectedModelerMeshSignature,
    safeModelerSelectionSignature,
    modelerMode,
    modelerSubSelectionActive,
    pivotMode,
    transformSpace,
    gizmoMode,
    syncModelerMeshToStore,
    syncObjectTransformToStore,
  } = params;

  const attachmentMode = useMemo(
    () =>
      deriveSceneViewTransformAttachmentMode({
        modelerSubSelectionActive,
        selectedModelerEntityId,
        hasSelectedModelerMesh: Boolean(selectedModelerMesh),
        selectedEntityCount: selectedEntities.length,
        pivotMode,
      }),
    [
      modelerSubSelectionActive,
      pivotMode,
      selectedEntities.length,
      selectedModelerEntityId,
      selectedModelerMesh,
    ]
  );

  const modelerGizmoTargetRef = useRef<THREE.Object3D | null>(null);
  const modelerDragStateRef = useRef<ModelerDragState | null>(null);
  const objectPivotGizmoTargetRef = useRef<THREE.Object3D | null>(null);
  const objectPivotDragStateRef = useRef<ObjectPivotDragState | null>(null);

  const isModelerGizmoProxy = useCallback(
    (object: THREE.Object3D | null) => object?.userData?.modelerGizmoProxy === true,
    []
  );
  const isObjectPivotProxy = useCallback(
    (object: THREE.Object3D | null) => object?.userData?.objectPivotGizmoProxy === true,
    []
  );

  useEffect(() => {
    const scene = sceneRef.current;
    const gizmo = transformToolsRef.current?.gizmo;
    if (!scene || !gizmo) return;

    if (attachmentMode !== 'modeler-subselection') {
      modelerDragStateRef.current = null;
      if (modelerGizmoTargetRef.current?.parent) {
        modelerGizmoTargetRef.current.parent.remove(modelerGizmoTargetRef.current);
      }
      modelerGizmoTargetRef.current = null;

      if (attachmentMode === 'selected-entity' && selectedModelerEntityId) {
        const entityTarget = scene.getObjectByName(
          `${STORE_OBJECT_PREFIX}${selectedModelerEntityId}`
        );
        if (entityTarget?.visible) {
          gizmo.attach(entityTarget);
          return;
        }
      }

      if (selectedEntities.length === 0) {
        gizmo.detach();
      }
      return;
    }

    if (!selectedModelerEntityId || !selectedModelerMesh) {
      return;
    }

    const viewportObject = scene.getObjectByName(
      `${STORE_OBJECT_PREFIX}${selectedModelerEntityId}`
    );
    if (!viewportObject) return;

    let proxy = modelerGizmoTargetRef.current;
    if (!proxy) {
      proxy = new THREE.Object3D();
      proxy.name = MODELER_GIZMO_PROXY_NAME;
      proxy.userData.modelerGizmoProxy = true;
      scene.add(proxy);
      modelerGizmoTargetRef.current = proxy;
    }

    if (!modelerDragStateRef.current) {
      const selectionCenter = getSelectionCenter(
        selectedModelerMesh,
        modelerMode as ModelerElementMode,
        safeModelerSelection
      );
      const worldCenter = new THREE.Vector3(
        selectionCenter.x,
        selectionCenter.y,
        selectionCenter.z
      );
      viewportObject.localToWorld(worldCenter);

      const worldQuaternion = new THREE.Quaternion();
      viewportObject.getWorldQuaternion(worldQuaternion);

      proxy.position.copy(worldCenter);
      proxy.quaternion.copy(worldQuaternion);
      proxy.scale.set(1, 1, 1);
    }

    if (gizmo.getTarget() !== proxy) {
      gizmo.attach(proxy);
    }
  }, [
    attachmentMode,
    modelerMode,
    safeModelerSelection,
    safeModelerSelectionSignature,
    sceneRef,
    selectedEntities.length,
    selectedModelerEntityId,
    selectedModelerMesh,
    selectedModelerMeshSignature,
    transformToolsRef,
  ]);

  useEffect(() => {
    return () => {
      if (modelerGizmoTargetRef.current?.parent) {
        modelerGizmoTargetRef.current.parent.remove(modelerGizmoTargetRef.current);
      }
      modelerGizmoTargetRef.current = null;
      modelerDragStateRef.current = null;
      if (objectPivotGizmoTargetRef.current?.parent) {
        objectPivotGizmoTargetRef.current.parent.remove(objectPivotGizmoTargetRef.current);
      }
      objectPivotGizmoTargetRef.current = null;
      objectPivotDragStateRef.current = null;
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    const gizmo = transformToolsRef.current?.gizmo;
    if (!scene || !gizmo) return;
    if (attachmentMode === 'modeler-subselection') return;

    const selectedObjects = selectedEntities
      .map((entityId) => scene.getObjectByName(`${STORE_OBJECT_PREFIX}${entityId}`))
      .filter((object): object is THREE.Object3D => Boolean(object));

    if (selectedObjects.length === 0) {
      objectPivotDragStateRef.current = null;
      if (gizmo.getTarget() && isObjectPivotProxy(gizmo.getTarget())) {
        gizmo.detach();
      }
      return;
    }

    if (attachmentMode !== 'selection-center-pivot') {
      objectPivotDragStateRef.current = null;
      const nextTarget = selectedObjects[0] ?? null;
      if (nextTarget && gizmo.getTarget() !== nextTarget) {
        gizmo.attach(nextTarget);
      }
      return;
    }

    let proxy = objectPivotGizmoTargetRef.current;
    if (!proxy) {
      proxy = new THREE.Object3D();
      proxy.name = OBJECT_PIVOT_GIZMO_PROXY_NAME;
      proxy.userData.objectPivotGizmoProxy = true;
      scene.add(proxy);
      objectPivotGizmoTargetRef.current = proxy;
    }

    if (!objectPivotDragStateRef.current) {
      const bounds = new THREE.Box3();
      selectedObjects.forEach((object) => bounds.expandByObject(object));
      const center = bounds.getCenter(new THREE.Vector3());
      const orientation =
        transformSpace === 'local' && selectedObjects.length === 1
          ? selectedObjects[0].getWorldQuaternion(new THREE.Quaternion())
          : new THREE.Quaternion();

      proxy.position.copy(center);
      proxy.quaternion.copy(orientation);
      proxy.scale.set(1, 1, 1);
    }

    if (gizmo.getTarget() !== proxy) {
      gizmo.attach(proxy);
    }
  }, [
    attachmentMode,
    isObjectPivotProxy,
    sceneRef,
    selectedEntities,
    transformSpace,
    transformToolsRef,
  ]);

  const handleModelerGizmoDragStart = useCallback((target: THREE.Object3D) => {
    if (!selectedModelerEntityId || !selectedModelerMesh || modelerMode === 'object') {
      return;
    }

    const scene = sceneRef.current;
    if (!scene) return;

    const viewportObject = scene.getObjectByName(
      `${STORE_OBJECT_PREFIX}${selectedModelerEntityId}`
    );
    if (!viewportObject) return;

    viewportObject.updateMatrixWorld(true);
    const maxDistanceFromCenter = selectedModelerVertexIndices.reduce((maxDistance, vertexIndex) => {
      const sourceVertex = selectedModelerMesh.vertices[vertexIndex];
      if (!sourceVertex) return maxDistance;
      const worldPoint = new THREE.Vector3(
        sourceVertex.x,
        sourceVertex.y,
        sourceVertex.z
      ).applyMatrix4(viewportObject.matrixWorld);
      return Math.max(maxDistance, worldPoint.distanceTo(target.position));
    }, 0);
    modelerDragStateRef.current = {
      entityId: selectedModelerEntityId,
      mode: modelerMode as ModelerElementMode,
      selection: [...safeModelerSelection],
      startMesh: {
        vertices: selectedModelerMesh.vertices.map((vertex) => ({ ...vertex })),
        faces: selectedModelerMesh.faces.map((face) => [...face] as [number, number, number]),
        uvs: selectedModelerMesh.uvs?.map((uv) => ({ ...uv })),
      },
      vertexIndices: [...selectedModelerVertexIndices],
      worldMatrix: viewportObject.matrixWorld.clone(),
      worldMatrixInverse: viewportObject.matrixWorld.clone().invert(),
      startPosition: target.position.clone(),
      startQuaternion: target.quaternion.clone(),
      startScale: target.scale.clone(),
      maxDistanceFromCenter,
    };
  }, [
    modelerMode,
    safeModelerSelection,
    sceneRef,
    selectedModelerEntityId,
    selectedModelerMesh,
    selectedModelerVertexIndices,
  ]);

  const applyModelerGizmoTransform = useCallback((target: THREE.Object3D, commit: boolean) => {
    const dragState = modelerDragStateRef.current;
    if (!dragState) return;

    const translationDelta = target.position.clone().sub(dragState.startPosition);
    const rotationDelta = target.quaternion
      .clone()
      .multiply(dragState.startQuaternion.clone().invert());
    const scaleDelta = new THREE.Vector3(
      dragState.startScale.x !== 0 ? target.scale.x / dragState.startScale.x : 1,
      dragState.startScale.y !== 0 ? target.scale.y / dragState.startScale.y : 1,
      dragState.startScale.z !== 0 ? target.scale.z / dragState.startScale.z : 1
    );
    const clampedScaleDelta = new THREE.Vector3(
      THREE.MathUtils.clamp(scaleDelta.x, MODELER_SUBELEMENT_SCALE_MIN, MODELER_SUBELEMENT_SCALE_MAX),
      THREE.MathUtils.clamp(scaleDelta.y, MODELER_SUBELEMENT_SCALE_MIN, MODELER_SUBELEMENT_SCALE_MAX),
      THREE.MathUtils.clamp(scaleDelta.z, MODELER_SUBELEMENT_SCALE_MIN, MODELER_SUBELEMENT_SCALE_MAX)
    );
    const scaleFrame =
      transformSpace === 'local'
        ? dragState.startQuaternion.clone()
        : new THREE.Quaternion();
    const inverseScaleFrame = scaleFrame.clone().invert();
    const maxSelectionDistance = Math.max(
      dragState.maxDistanceFromCenter * MODELER_SUBELEMENT_DISTANCE_LIMIT_MULTIPLIER,
      1.5
    );

    const nextMesh: EditableMesh = {
      vertices: dragState.startMesh.vertices.map((vertex) => ({ ...vertex })),
      faces: dragState.startMesh.faces.map((face) => [...face] as [number, number, number]),
      uvs: dragState.startMesh.uvs?.map((uv) => ({ ...uv })),
    };

    dragState.vertexIndices.forEach((vertexIndex) => {
      const sourceVertex = dragState.startMesh.vertices[vertexIndex];
      if (!sourceVertex) return;

      let worldPoint = new THREE.Vector3(
        sourceVertex.x,
        sourceVertex.y,
        sourceVertex.z
      ).applyMatrix4(dragState.worldMatrix);

      switch (gizmoMode) {
        case 'rotate': {
          worldPoint = worldPoint
            .sub(dragState.startPosition)
            .applyQuaternion(rotationDelta)
            .add(dragState.startPosition);
          break;
        }
        case 'scale': {
          const scaledPoint = worldPoint
            .clone()
            .sub(dragState.startPosition)
            .applyQuaternion(inverseScaleFrame);
          scaledPoint.set(
            scaledPoint.x * clampedScaleDelta.x,
            scaledPoint.y * clampedScaleDelta.y,
            scaledPoint.z * clampedScaleDelta.z
          );
          if (scaledPoint.length() > maxSelectionDistance) {
            scaledPoint.setLength(maxSelectionDistance);
          }
          worldPoint = scaledPoint
            .applyQuaternion(scaleFrame)
            .add(dragState.startPosition);
          break;
        }
        case 'translate':
        default:
          worldPoint.add(translationDelta);
          break;
      }

      const localPoint = worldPoint.applyMatrix4(dragState.worldMatrixInverse);
      nextMesh.vertices[vertexIndex] = {
        x: localPoint.x,
        y: localPoint.y,
        z: localPoint.z,
      };
    });

    syncModelerMeshToStore(nextMesh, commit);
  }, [gizmoMode, syncModelerMeshToStore, transformSpace]);

  const handleModelerGizmoDragEnd = useCallback((target: THREE.Object3D | null) => {
    if (!target || !isModelerGizmoProxy(target)) {
      modelerDragStateRef.current = null;
      return;
    }

    applyModelerGizmoTransform(target, true);
    modelerDragStateRef.current = null;
  }, [applyModelerGizmoTransform, isModelerGizmoProxy]);

  const handlePivotDragStart = useCallback((target: THREE.Object3D) => {
    const scene = sceneRef.current;
    if (!scene || !isObjectPivotProxy(target)) {
      return;
    }

    const selectedObjects = selectedEntities
      .map((entityId) => scene.getObjectByName(`${STORE_OBJECT_PREFIX}${entityId}`))
      .filter((object): object is THREE.Object3D => Boolean(object));
    if (selectedObjects.length === 0) {
      objectPivotDragStateRef.current = null;
      return;
    }

    const identityMatrix = new THREE.Matrix4();
    objectPivotDragStateRef.current = {
      startPosition: target.position.clone(),
      startQuaternion: target.quaternion.clone(),
      startScale: target.scale.clone(),
      targets: selectedObjects.map((object) => {
        object.updateMatrixWorld(true);
        const parentWorldMatrixInverse = object.parent
          ? object.parent.matrixWorld.clone().invert()
          : identityMatrix.clone();
        return {
          object,
          startWorldMatrix: object.matrixWorld.clone(),
          parentWorldMatrixInverse,
        };
      }),
    };
  }, [isObjectPivotProxy, sceneRef, selectedEntities]);

  const applyPivotProxyTransform = useCallback((target: THREE.Object3D, commit: boolean) => {
    const dragState = objectPivotDragStateRef.current;
    if (!dragState || !isObjectPivotProxy(target)) {
      return;
    }

    const translationDelta = target.position.clone().sub(dragState.startPosition);
    const rotationDelta = target.quaternion
      .clone()
      .multiply(dragState.startQuaternion.clone().invert());
    const scaleDelta = new THREE.Vector3(
      dragState.startScale.x !== 0 ? target.scale.x / dragState.startScale.x : 1,
      dragState.startScale.y !== 0 ? target.scale.y / dragState.startScale.y : 1,
      dragState.startScale.z !== 0 ? target.scale.z / dragState.startScale.z : 1
    );
    const clampedScaleDelta = new THREE.Vector3(
      THREE.MathUtils.clamp(scaleDelta.x, 0.1, 10),
      THREE.MathUtils.clamp(scaleDelta.y, 0.1, 10),
      THREE.MathUtils.clamp(scaleDelta.z, 0.1, 10)
    );

    const pivotMatrix = new THREE.Matrix4().makeTranslation(
      dragState.startPosition.x,
      dragState.startPosition.y,
      dragState.startPosition.z
    );
    const inversePivotMatrix = new THREE.Matrix4().makeTranslation(
      -dragState.startPosition.x,
      -dragState.startPosition.y,
      -dragState.startPosition.z
    );
    const translationMatrix = new THREE.Matrix4().makeTranslation(
      translationDelta.x,
      translationDelta.y,
      translationDelta.z
    );
    const rotationMatrix = new THREE.Matrix4().makeRotationFromQuaternion(rotationDelta);
    const scaleFrameQuaternion =
      transformSpace === 'local'
        ? dragState.startQuaternion
        : new THREE.Quaternion();
    const scaleFrameMatrix = new THREE.Matrix4().makeRotationFromQuaternion(scaleFrameQuaternion);
    const inverseScaleFrameMatrix = scaleFrameMatrix.clone().invert();
    const scaleMatrix = new THREE.Matrix4().makeScale(
      clampedScaleDelta.x,
      clampedScaleDelta.y,
      clampedScaleDelta.z
    );

    dragState.targets.forEach(({ object, startWorldMatrix, parentWorldMatrixInverse }) => {
      let nextWorldMatrix = startWorldMatrix.clone();

      switch (gizmoMode) {
        case 'rotate':
          nextWorldMatrix = pivotMatrix
            .clone()
            .multiply(rotationMatrix)
            .multiply(inversePivotMatrix)
            .multiply(startWorldMatrix);
          break;
        case 'scale':
          nextWorldMatrix = pivotMatrix
            .clone()
            .multiply(scaleFrameMatrix)
            .multiply(scaleMatrix)
            .multiply(inverseScaleFrameMatrix)
            .multiply(inversePivotMatrix)
            .multiply(startWorldMatrix);
          break;
        case 'translate':
        default:
          nextWorldMatrix = translationMatrix.clone().multiply(startWorldMatrix);
          break;
      }

      const nextLocalMatrix = parentWorldMatrixInverse.clone().multiply(nextWorldMatrix);
      const nextPosition = new THREE.Vector3();
      const nextQuaternion = new THREE.Quaternion();
      const nextScale = new THREE.Vector3();
      nextLocalMatrix.decompose(nextPosition, nextQuaternion, nextScale);

      object.position.copy(nextPosition);
      object.quaternion.copy(nextQuaternion);
      object.scale.copy(nextScale);
      object.updateMatrixWorld(true);
      syncObjectTransformToStore(object, { commit });
    });
  }, [gizmoMode, isObjectPivotProxy, syncObjectTransformToStore, transformSpace]);

  const handlePivotDragEnd = useCallback((target: THREE.Object3D | null) => {
    if (!target || !isObjectPivotProxy(target)) {
      objectPivotDragStateRef.current = null;
      return;
    }

    applyPivotProxyTransform(target, true);
    objectPivotDragStateRef.current = null;
  }, [applyPivotProxyTransform, isObjectPivotProxy]);

  const clearPivotDragState = useCallback(() => {
    objectPivotDragStateRef.current = null;
  }, []);

  const customTransformHandlers = useMemo(
    () => ({
      isCustomTarget: (object: THREE.Object3D | null) =>
        isModelerGizmoProxy(object) || isObjectPivotProxy(object),
      onStart: (target: THREE.Object3D) => {
        if (isModelerGizmoProxy(target)) {
          handleModelerGizmoDragStart(target);
          return;
        }
        handlePivotDragStart(target);
      },
      onChange: (target: THREE.Object3D) => {
        if (isModelerGizmoProxy(target)) {
          applyModelerGizmoTransform(target, false);
          return;
        }
        applyPivotProxyTransform(target, false);
      },
      onEnd: (target: THREE.Object3D | null) => {
        if (isModelerGizmoProxy(target)) {
          handleModelerGizmoDragEnd(target);
          return;
        }
        handlePivotDragEnd(target);
      },
    }),
    [
      applyModelerGizmoTransform,
      applyPivotProxyTransform,
      handleModelerGizmoDragEnd,
      handleModelerGizmoDragStart,
      handlePivotDragEnd,
      handlePivotDragStart,
      isModelerGizmoProxy,
      isObjectPivotProxy,
    ]
  );

  return {
    clearPivotDragState,
    customTransformHandlers,
  };
}
