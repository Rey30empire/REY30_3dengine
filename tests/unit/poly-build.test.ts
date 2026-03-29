import { describe, expect, it } from 'vitest';
import {
  createPlaneMesh,
  listMeshEdges,
  polyBuildEdge,
  type EditableMesh,
} from '@/engine/editor/modelerMesh';

describe('poly build', () => {
  it('builds a new quad strip from a boundary edge', () => {
    const mesh = createPlaneMesh();
    const boundaryEdgeIndex = listMeshEdges(mesh).findIndex(
      ([left, right]) => left === 0 && right === 1
    );

    const result = polyBuildEdge(mesh, boundaryEdgeIndex, 0.25);

    expect(result.ok).toBe(true);
    expect(result.mesh.vertices.length).toBe(mesh.vertices.length + 2);
    expect(result.mesh.faces.length).toBe(mesh.faces.length + 2);
    expect(result.createdEdgeIndex).not.toBeNull();
  });

  it('rejects poly build on an internal edge', () => {
    const mesh = createPlaneMesh();
    const internalEdgeIndex = listMeshEdges(mesh).findIndex(
      ([left, right]) => left === 0 && right === 2
    );

    const result = polyBuildEdge(mesh, internalEdgeIndex, 0.25);

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('borde');
  });

  it('preserves vertex colors and weights on the duplicated edge', () => {
    const mesh: EditableMesh = {
      ...createPlaneMesh(),
      vertexColors: [
        { r: 1, g: 0, b: 0, a: 1 },
        { r: 0, g: 1, b: 0, a: 1 },
        { r: 0, g: 0, b: 1, a: 1 },
        { r: 1, g: 1, b: 0, a: 1 },
      ],
      weightGroups: ['Spine'],
      weights: [[1], [0.75], [0.5], [0.25]],
    };
    const boundaryEdgeIndex = listMeshEdges(mesh).findIndex(
      ([left, right]) => left === 0 && right === 1
    );

    const result = polyBuildEdge(mesh, boundaryEdgeIndex, 0.2);

    expect(result.ok).toBe(true);
    const [newLeft, newRight] = result.createdVertexIndices;
    expect(result.mesh.vertexColors?.[newLeft]).toMatchObject(mesh.vertexColors?.[0] ?? {});
    expect(result.mesh.vertexColors?.[newRight]).toMatchObject(mesh.vertexColors?.[1] ?? {});
    expect(result.mesh.weights?.[newLeft]?.[0]).toBeCloseTo(1, 5);
    expect(result.mesh.weights?.[newRight]?.[0]).toBeCloseTo(0.75, 5);
  });
});
