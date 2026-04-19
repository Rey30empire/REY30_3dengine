'use client';

import { useCallback } from 'react';
import { useEngineStore } from '@/store/editorStore';
import { asRecord } from './sceneView.visuals';
import type { EditableMesh } from './modelerMesh';

export function useSceneViewModelerMeshSync(params: {
  selectedModelerEntityId: string | null;
  updateEntity: (entityId: string, patch: { components: Map<string, unknown> }) => void;
  updateEntityTransient: (entityId: string, patch: { components: Map<string, unknown> }) => void;
}) {
  const { selectedModelerEntityId, updateEntity, updateEntityTransient } = params;

  const syncModelerMeshToStore = useCallback((nextMesh: EditableMesh, commit = false) => {
    const entityId = selectedModelerEntityId;
    if (!entityId) return;

    const entity = useEngineStore.getState().entities.get(entityId);
    if (!entity) return;

    const meshRenderer = entity.components.get('MeshRenderer');
    if (!meshRenderer) return;

    const nextComponents = new Map(entity.components);
    nextComponents.set('MeshRenderer', {
      ...meshRenderer,
      data: {
        ...(asRecord(meshRenderer.data) ?? {}),
        meshId: 'custom',
        manualMesh: nextMesh,
      },
    });

    const patch = {
      components: nextComponents as unknown as Map<string, unknown>,
    };
    if (commit) {
      updateEntity(entityId, patch);
      return;
    }

    updateEntityTransient(entityId, patch);
  }, [selectedModelerEntityId, updateEntity, updateEntityTransient]);

  return { syncModelerMeshToStore };
}
