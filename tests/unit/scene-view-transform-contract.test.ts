import { describe, expect, it } from 'vitest';
import { createCubeMesh } from '@/engine/editor/modelerMesh';
import { deriveSceneViewModelerPickResult } from '@/engine/editor/useSceneViewModelerInteractions';
import { deriveSceneViewTransformAttachmentMode } from '@/engine/editor/useSceneViewTransformInteractions';

describe('scene view transform contract', () => {
  it('gives modeler subselection priority over selection-center pivot', () => {
    expect(
      deriveSceneViewTransformAttachmentMode({
        modelerSubSelectionActive: true,
        selectedModelerEntityId: 'entity_1',
        hasSelectedModelerMesh: true,
        selectedEntityCount: 2,
        pivotMode: 'selectionCenter',
      })
    ).toBe('modeler-subselection');
  });

  it('uses selection-center pivot when there is object selection and no modeler subselection', () => {
    expect(
      deriveSceneViewTransformAttachmentMode({
        modelerSubSelectionActive: false,
        selectedModelerEntityId: null,
        hasSelectedModelerMesh: false,
        selectedEntityCount: 2,
        pivotMode: 'selectionCenter',
      })
    ).toBe('selection-center-pivot');
  });

  it('detaches when nothing is selected', () => {
    expect(
      deriveSceneViewTransformAttachmentMode({
        modelerSubSelectionActive: false,
        selectedModelerEntityId: null,
        hasSelectedModelerMesh: false,
        selectedEntityCount: 0,
        pivotMode: 'objectOrigin',
      })
    ).toBe('detach');
  });
});

describe('scene view modeler pick contract', () => {
  it('switches mode and clamps picks to visible faces only', () => {
    const mesh = createCubeMesh();
    mesh.hiddenFaces = [0, 1];

    const result = deriveSceneViewModelerPickResult({
      type: 'face',
      index: 0,
      additive: false,
      modelerMode: 'vertex',
      selectedModelerElements: [5],
      selectedModelerMesh: mesh,
    });

    expect(result.normalizedType).toBe('face');
    expect(result.shouldChangeMode).toBe(true);
    expect(result.nextSelection).toEqual([2]);
  });

  it('toggles additive picks inside the active mode', () => {
    const result = deriveSceneViewModelerPickResult({
      type: 'vertex',
      index: 2,
      additive: true,
      modelerMode: 'vertex',
      selectedModelerElements: [1, 2],
      selectedModelerMesh: createCubeMesh(),
    });

    expect(result.normalizedType).toBe('vertex');
    expect(result.shouldChangeMode).toBe(false);
    expect(result.nextSelection).toEqual([1]);
  });
});
