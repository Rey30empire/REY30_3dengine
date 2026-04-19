import { describe, expect, it } from 'vitest';
import { createCubeMesh } from '@/engine/editor/modelerMesh';
import {
  deriveSceneViewModelerState,
} from '@/engine/editor/useSceneViewModelerState';

describe('scene view modeler state', () => {
  it('clamps face selection to visible ids and preserves topology readiness only in object mode', () => {
    const mesh = createCubeMesh();
    mesh.hiddenFaces = [0, 1];

    const result = deriveSceneViewModelerState({
      selectedModelerEntityId: 'entity_1',
      selectedModelerMesh: mesh,
      modelerMode: 'face',
      selectedModelerElements: [0, 1, 2],
      topologyViewportEnabled: true,
    });

    expect(result.safeModelerSelection).toEqual([2]);
    expect(result.modelerSubSelectionActive).toBe(true);
    expect(result.topologyViewportReady).toBe(false);
    expect(result.selectedModelerVertexIndices.length).toBeGreaterThan(0);
    expect(result.selectedModelerMeshSignature).toBeTruthy();
    expect(result.safeModelerSelectionSignature).toBe('2');
  });

  it('enables topology viewport only when object mode has a selected modeler entity', () => {
    const result = deriveSceneViewModelerState({
      selectedModelerEntityId: 'entity_2',
      selectedModelerMesh: createCubeMesh(),
      modelerMode: 'object',
      selectedModelerElements: undefined,
      topologyViewportEnabled: true,
    });

    expect(result.safeModelerSelection).toEqual([]);
    expect(result.selectedModelerVertexIndices).toEqual([]);
    expect(result.modelerSubSelectionActive).toBe(false);
    expect(result.topologyViewportReady).toBe(true);
    expect(result.safeModelerSelectionSignature).toBe('');
  });
});
