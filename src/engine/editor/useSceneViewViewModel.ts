'use client';

import { useMemo } from 'react';
import type { CameraMode } from './EditorToolbar';
import { useSceneViewModelerState } from './useSceneViewModelerState';
import { asRecord } from './sceneView.visuals';
import {
  createPrimitiveMesh,
  parseEditableMesh,
  type EditableMesh,
} from './modelerMesh';
import { resolveEditableMeshFromEntity } from './pivotTools';
import type { EditorState, Entity, Scene } from '@/types/engine';
import type { TemplateType } from '@/engine/systems/topology-authoring';

export interface SceneViewBaseModel {
  cameraMode: CameraMode;
  snapTarget: 'grid' | 'vertex' | 'surface';
  virtualCameraEntity: Entity | null;
  selectedModelerEntityId: string | null;
  selectedModelerEntity: Entity | null;
  selectedOriginMesh: EditableMesh | null;
  canAdjustOrigin: boolean;
  selectedModelerMesh: EditableMesh | null;
  topologyViewportEnabled: boolean;
  topologyViewportMode: 'template' | 'intent_driven';
  topologyViewportTemplateType: TemplateType;
  modelerMode: 'object' | 'vertex' | 'edge' | 'face';
}

export function deriveSceneViewBaseModel(params: {
  activeScene: Scene | null;
  editor: EditorState;
}): SceneViewBaseModel {
  const { activeScene, editor } = params;
  const cameraMode = (editor.viewportCameraMode ?? 'perspective') as CameraMode;
  const snapTarget = (editor.snapTarget ?? 'grid') as 'grid' | 'vertex' | 'surface';
  const virtualCameraEntity = editor.viewportCameraEntityId
    ? activeScene?.entities.find((entity) => entity.id === editor.viewportCameraEntityId) ?? null
    : null;
  const selectedModelerEntityId =
    editor.selectedEntities.length === 1 ? editor.selectedEntities[0] : null;
  const selectedModelerEntity = selectedModelerEntityId
    ? activeScene?.entities.find((entity) => entity.id === selectedModelerEntityId) ?? null
    : null;
  const selectedModelerMeshData = asRecord(
    selectedModelerEntity?.components.get('MeshRenderer')?.data
  );
  const selectedModelerMeshId =
    typeof selectedModelerMeshData?.meshId === 'string'
      ? selectedModelerMeshData.meshId
      : 'cube';
  const selectedOriginMesh = resolveEditableMeshFromEntity(selectedModelerEntity);
  const selectedModelerMesh = (() => {
    const editableMesh = parseEditableMesh(
      selectedModelerMeshData?.manualMesh ?? selectedModelerMeshData?.customMesh
    );
    if (editableMesh) return editableMesh;
    return selectedModelerEntity?.components.has('MeshRenderer')
      ? createPrimitiveMesh(selectedModelerMeshId)
      : null;
  })();

  return {
    cameraMode,
    snapTarget,
    virtualCameraEntity,
    selectedModelerEntityId,
    selectedModelerEntity,
    selectedOriginMesh,
    canAdjustOrigin: Boolean(selectedModelerEntity && selectedOriginMesh),
    selectedModelerMesh,
    topologyViewportEnabled: Boolean(editor.topologyViewportEnabled),
    topologyViewportMode: editor.topologyViewportMode ?? 'intent_driven',
    topologyViewportTemplateType: (editor.topologyViewportTemplateType ?? 'chair') as TemplateType,
    modelerMode: (editor.modelerMode ?? 'face') as 'object' | 'vertex' | 'edge' | 'face',
  };
}

export function useSceneViewViewModel(params: {
  activeScene: Scene | null;
  editor: EditorState;
}) {
  const { activeScene, editor } = params;

  const baseModel = useMemo(
    () => deriveSceneViewBaseModel({ activeScene, editor }),
    [activeScene, editor]
  );

  const modelerState = useSceneViewModelerState({
    selectedModelerEntityId: baseModel.selectedModelerEntityId,
    selectedModelerMesh: baseModel.selectedModelerMesh,
    modelerMode: baseModel.modelerMode,
    selectedModelerElements: editor.modelerSelectedElements,
    topologyViewportEnabled: baseModel.topologyViewportEnabled,
  });

  return {
    ...baseModel,
    ...modelerState,
  };
}
