'use client';

import { useCallback, useEffect, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { useEngineStore } from '@/store/editorStore';
import {
  STORE_OBJECT_PREFIX,
  asRecord,
  readQuaternion,
  readVector3,
} from './sceneView.visuals';
import {
  getVisibleFaceIndices,
  listMeshEdges,
  listVisibleMeshEdgeIndices,
  type EditableMesh,
  type ModelerElementMode,
} from './modelerMesh';
import {
  createModelerHelperGroup,
  disposeModelerHelperGroup,
  MODELER_HELPER_GROUP_NAME,
} from './modelerViewportHelpers';
import { clampSelectableModelerSelection } from './useSceneViewModelerState';
import {
  computeEditableMeshBoundsCenter,
  translateEditableMesh,
} from './pivotTools';

export interface SceneViewModelerPickResult {
  normalizedType: ModelerElementMode;
  nextSelection: number[];
  shouldChangeMode: boolean;
}

export function deriveSceneViewModelerPickResult(params: {
  type: string;
  index: number;
  additive: boolean;
  modelerMode: 'object' | ModelerElementMode;
  selectedModelerElements: number[] | undefined;
  selectedModelerMesh: EditableMesh | null;
}): SceneViewModelerPickResult {
  const {
    type,
    index,
    additive,
    modelerMode,
    selectedModelerElements,
    selectedModelerMesh,
  } = params;

  const normalizedType =
    type === 'vertex' || type === 'edge' || type === 'face' ? type : 'face';
  const maxSelectable =
    normalizedType === 'vertex'
      ? selectedModelerMesh?.vertices.length ?? 0
      : normalizedType === 'edge'
        ? selectedModelerMesh
          ? listMeshEdges(selectedModelerMesh).length
          : 0
        : selectedModelerMesh?.faces.length ?? 0;
  const selectableIds =
    normalizedType === 'vertex'
      ? selectedModelerMesh?.vertices.map((_vertex, vertexIndex) => vertexIndex) ?? []
      : normalizedType === 'edge'
        ? selectedModelerMesh
          ? listVisibleMeshEdgeIndices(selectedModelerMesh)
          : []
        : selectedModelerMesh
          ? getVisibleFaceIndices(selectedModelerMesh)
          : [];

  const currentSelection =
    normalizedType === modelerMode ? selectedModelerElements ?? [0] : [index];
  const requestedSelection = additive
    ? currentSelection.includes(index)
      ? currentSelection.filter((candidate) => candidate !== index)
      : [...currentSelection, index]
    : [index];

  return {
    normalizedType,
    nextSelection: clampSelectableModelerSelection(
      requestedSelection,
      maxSelectable,
      selectableIds
    ),
    shouldChangeMode: normalizedType !== modelerMode,
  };
}

export function useSceneViewModelerInteractions(params: {
  sceneRef: MutableRefObject<THREE.Scene | null>;
  selectedModelerEntityId: string | null;
  selectedModelerMesh: EditableMesh | null;
  selectedOriginMesh: EditableMesh | null;
  modelerMode: 'object' | ModelerElementMode;
  selectedModelerElements: number[] | undefined;
  safeModelerSelection: number[];
  safeModelerSelectionSignature: string;
  selectedModelerMeshSignature: string | null;
  updateEntity: (
    entityId: string,
    patch: {
      components: Map<string, unknown>;
    }
  ) => void;
  setModelerMode: (mode: 'vertex' | 'edge' | 'face' | 'object') => void;
  setModelerSelection: (selection: number[]) => void;
  clearPivotDragState: () => void;
}) {
  const {
    sceneRef,
    selectedModelerEntityId,
    selectedModelerMesh,
    selectedOriginMesh,
    modelerMode,
    selectedModelerElements,
    safeModelerSelection,
    safeModelerSelectionSignature,
    selectedModelerMeshSignature,
    updateEntity,
    setModelerMode,
    setModelerSelection,
    clearPivotDragState,
  } = params;

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const previousGroup = scene.getObjectByName(MODELER_HELPER_GROUP_NAME);
    if (previousGroup?.parent) {
      previousGroup.parent.remove(previousGroup);
      disposeModelerHelperGroup(previousGroup);
    }

    if (!selectedModelerEntityId || !selectedModelerMesh || modelerMode === 'object') {
      return;
    }

    const viewportObject = scene.getObjectByName(
      `${STORE_OBJECT_PREFIX}${selectedModelerEntityId}`
    );
    if (!viewportObject) return;

    const helperGroup = createModelerHelperGroup({
      mesh: selectedModelerMesh,
      mode: modelerMode,
      selectedIndices: safeModelerSelection,
    });
    viewportObject.add(helperGroup);

    return () => {
      if (helperGroup.parent) {
        helperGroup.parent.remove(helperGroup);
      }
      disposeModelerHelperGroup(helperGroup);
    };
  }, [
    modelerMode,
    safeModelerSelection,
    safeModelerSelectionSignature,
    sceneRef,
    selectedModelerEntityId,
    selectedModelerMesh,
    selectedModelerMeshSignature,
  ]);

  const updateEditableMeshOrigin = useCallback((mode: 'originToGeometry' | 'geometryToOrigin') => {
    if (!selectedModelerEntityId || !selectedOriginMesh) {
      return;
    }

    const entity = useEngineStore.getState().entities.get(selectedModelerEntityId);
    if (!entity) return;

    const meshRenderer = entity.components.get('MeshRenderer');
    const transform = entity.components.get('Transform');
    if (!meshRenderer || !transform) return;

    const center = computeEditableMeshBoundsCenter(selectedOriginMesh);
    const meshOffset = center.clone().multiplyScalar(-1);
    const nextMesh = translateEditableMesh(selectedOriginMesh, meshOffset);
    const transformData = asRecord(transform.data);
    const position = readVector3(transformData?.position, new THREE.Vector3());
    const rotation = readQuaternion(transformData?.rotation, new THREE.Quaternion());
    const scale = readVector3(transformData?.scale, new THREE.Vector3(1, 1, 1));
    const nextPosition = position.clone();

    if (mode === 'originToGeometry') {
      const localOffset = center.clone().multiply(scale);
      localOffset.applyQuaternion(rotation);
      nextPosition.add(localOffset);
    }

    const nextComponents = new Map(entity.components);
    nextComponents.set('Transform', {
      ...transform,
      data: {
        position: { x: nextPosition.x, y: nextPosition.y, z: nextPosition.z },
        rotation: { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w },
        scale: { x: scale.x, y: scale.y, z: scale.z },
      },
    });
    nextComponents.set('MeshRenderer', {
      ...meshRenderer,
      data: {
        ...(asRecord(meshRenderer.data) ?? {}),
        meshId: 'custom',
        manualMesh: nextMesh,
      },
    });

    clearPivotDragState();
    updateEntity(selectedModelerEntityId, {
      components: nextComponents as unknown as Map<string, unknown>,
    });
  }, [
    clearPivotDragState,
    selectedModelerEntityId,
    selectedOriginMesh,
    updateEntity,
  ]);

  const handleModelerElementPick = useCallback((
    type: string,
    index: number,
    additive: boolean
  ) => {
    const result = deriveSceneViewModelerPickResult({
      type,
      index,
      additive,
      modelerMode,
      selectedModelerElements,
      selectedModelerMesh,
    });

    if (result.shouldChangeMode) {
      setModelerMode(result.normalizedType);
    }

    setModelerSelection(result.nextSelection);
  }, [
    modelerMode,
    selectedModelerElements,
    selectedModelerMesh,
    setModelerMode,
    setModelerSelection,
  ]);

  return {
    updateEditableMeshOrigin,
    handleModelerElementPick,
  };
}
