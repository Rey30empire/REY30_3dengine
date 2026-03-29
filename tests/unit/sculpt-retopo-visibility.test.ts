import { describe, expect, it } from 'vitest';
import {
  assignFaceSet,
  clearVertexMask,
  createPlaneMesh,
  getFaceSetId,
  getVisibleFaceIndices,
  hideFaces,
  listMeshEdges,
  listVisibleMeshEdgeIndices,
  maskVertices,
  parseEditableMesh,
  revealFaces,
  selectFaceSet,
} from '@/engine/editor/modelerMesh';
import { paintMeshVertexColors } from '@/engine/editor/paintMesh';
import { sculptMesh } from '@/engine/editor/sculptMesh';

describe('sculpt/retopo visibility metadata', () => {
  it('parses and preserves mask, hidden faces and face sets', () => {
    const parsed = parseEditableMesh({
      vertices: [
        { x: -1, y: 0, z: -1 },
        { x: 1, y: 0, z: -1 },
        { x: 1, y: 0, z: 1 },
        { x: -1, y: 0, z: 1 },
      ],
      faces: [
        [0, 1, 2],
        [0, 2, 3],
      ],
      vertexMask: [1, 0.5, 0, 0],
      hiddenFaces: [1, 99],
      faceSets: [3, 0],
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.vertexMask).toEqual([1, 0.5, 0, 0]);
    expect(parsed?.hiddenFaces).toEqual([1]);
    expect(parsed?.faceSets).toEqual([3, 0]);
  });

  it('hides faces from the visible selection set and can reveal them again', () => {
    const mesh = createPlaneMesh();
    const hidden = hideFaces(mesh, [1]);
    const allEdges = listMeshEdges(hidden);
    const visibleEdges = listVisibleMeshEdgeIndices(hidden).map(
      (edgeIndex) => allEdges[edgeIndex]?.join(':')
    );

    expect(getVisibleFaceIndices(hidden)).toEqual([0]);
    expect(visibleEdges.sort()).toEqual(['0:1', '0:2', '1:2']);

    const revealed = revealFaces(hidden);
    expect(getVisibleFaceIndices(revealed)).toEqual([0, 1]);
    expect(revealed.hiddenFaces).toBeUndefined();
  });

  it('assigns and selects face sets by id', () => {
    const mesh = createPlaneMesh();
    const firstAssigned = assignFaceSet(mesh, [0], 7);
    const bothAssigned = assignFaceSet(firstAssigned, [1], 7);

    expect(getFaceSetId(firstAssigned, 0)).toBe(7);
    expect(getFaceSetId(firstAssigned, 1)).toBe(0);
    expect(selectFaceSet(firstAssigned, 0)).toEqual([0]);
    expect(selectFaceSet(bothAssigned, 0)).toEqual([0, 1]);
  });

  it('prevents sculpt and paint from affecting fully masked vertices', () => {
    const masked = maskVertices(createPlaneMesh(), [0], 1);
    const sculpted = sculptMesh({
      mesh: masked,
      brush: 'draw',
      center: masked.vertices[0] ?? { x: 0, y: 0, z: 0 },
      radius: 0.35,
      strength: 1,
      brushNormal: { x: 0, y: 1, z: 0 },
    });
    const painted = paintMeshVertexColors({
      mesh: masked,
      center: masked.vertices[0] ?? { x: 0, y: 0, z: 0 },
      radius: 0.35,
      color: { r: 0.2, g: 0.8, b: 0.3, a: 1 },
      strength: 1,
    });

    expect(sculpted.vertices[0]).toEqual(masked.vertices[0]);
    expect(painted.vertexColors?.[0]).toEqual({ r: 1, g: 1, b: 1, a: 1 });

    const cleared = clearVertexMask(masked, [0]);
    expect(cleared.vertexMask).toBeUndefined();
  });
});
