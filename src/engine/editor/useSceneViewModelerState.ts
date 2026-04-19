'use client';

import { useMemo } from 'react';
import {
  buildEditableMeshSignature,
  getSelectionVertexIndices,
  getVisibleFaceIndices,
  listMeshEdges,
  listVisibleMeshEdgeIndices,
  type EditableMesh,
  type ModelerElementMode,
} from './modelerMesh';

function clampModelerSelection(indices: number[], max: number) {
  if (max <= 0) return [];
  const next = Array.from(new Set(indices.filter((index) => index >= 0 && index < max)));
  return next.length > 0 ? next : [0];
}

export function clampSelectableModelerSelection(
  indices: number[],
  max: number,
  selectableIds: number[]
) {
  const clamped = clampModelerSelection(indices, max);
  const allowed = new Set(selectableIds);
  const filtered = clamped.filter((index) => allowed.has(index));
  if (filtered.length > 0) {
    return filtered;
  }
  return selectableIds.length > 0 ? [selectableIds[0]!] : [];
}

export interface SceneViewModelerDerivedState {
  safeModelerSelection: number[];
  selectedModelerVertexIndices: number[];
  modelerSubSelectionActive: boolean;
  topologyViewportReady: boolean;
  selectedModelerMeshSignature: string | null;
  safeModelerSelectionSignature: string;
}

export function deriveSceneViewModelerState(params: {
  selectedModelerEntityId: string | null;
  selectedModelerMesh: EditableMesh | null;
  modelerMode: 'object' | ModelerElementMode;
  selectedModelerElements: number[] | undefined;
  topologyViewportEnabled: boolean;
}): SceneViewModelerDerivedState {
  const {
    selectedModelerEntityId,
    selectedModelerMesh,
    modelerMode,
    selectedModelerElements,
    topologyViewportEnabled,
  } = params;

  const modelerSelectableIds =
    modelerMode === 'vertex'
      ? selectedModelerMesh?.vertices.map((_vertex, index) => index) ?? []
      : modelerMode === 'edge'
        ? selectedModelerMesh
          ? listVisibleMeshEdgeIndices(selectedModelerMesh)
          : []
        : modelerMode === 'face'
          ? selectedModelerMesh
            ? getVisibleFaceIndices(selectedModelerMesh)
            : []
          : [];

  const modelerSelectableCount =
    modelerMode === 'vertex'
      ? selectedModelerMesh?.vertices.length ?? 0
      : modelerMode === 'edge'
        ? selectedModelerMesh
          ? listMeshEdges(selectedModelerMesh).length
          : 0
        : modelerMode === 'face'
          ? selectedModelerMesh?.faces.length ?? 0
          : 0;

  const safeModelerSelection = clampSelectableModelerSelection(
    selectedModelerElements ?? [0],
    modelerSelectableCount,
    modelerSelectableIds
  );

  const selectedModelerVertexIndices =
    selectedModelerMesh && modelerMode !== 'object'
      ? getSelectionVertexIndices(
          selectedModelerMesh,
          modelerMode as ModelerElementMode,
          safeModelerSelection
        )
      : [];

  const modelerSubSelectionActive =
    Boolean(selectedModelerEntityId) &&
    Boolean(selectedModelerMesh) &&
    modelerMode !== 'object' &&
    selectedModelerVertexIndices.length > 0;

  const topologyViewportReady =
    topologyViewportEnabled &&
    Boolean(selectedModelerEntityId) &&
    Boolean(selectedModelerMesh) &&
    modelerMode === 'object';

  const selectedModelerMeshSignature = selectedModelerMesh
    ? buildEditableMeshSignature(selectedModelerMesh)
    : null;

  return {
    safeModelerSelection,
    selectedModelerVertexIndices,
    modelerSubSelectionActive,
    topologyViewportReady,
    selectedModelerMeshSignature,
    safeModelerSelectionSignature: safeModelerSelection.join(':'),
  };
}

export function useSceneViewModelerState(params: {
  selectedModelerEntityId: string | null;
  selectedModelerMesh: EditableMesh | null;
  modelerMode: 'object' | ModelerElementMode;
  selectedModelerElements: number[] | undefined;
  topologyViewportEnabled: boolean;
}) {
  const {
    selectedModelerEntityId,
    selectedModelerMesh,
    modelerMode,
    selectedModelerElements,
    topologyViewportEnabled,
  } = params;

  return useMemo(
    () =>
      deriveSceneViewModelerState({
        selectedModelerEntityId,
        selectedModelerMesh,
        modelerMode,
        selectedModelerElements,
        topologyViewportEnabled,
      }),
    [
      modelerMode,
      selectedModelerElements,
      selectedModelerEntityId,
      selectedModelerMesh,
      topologyViewportEnabled,
    ]
  );
}
