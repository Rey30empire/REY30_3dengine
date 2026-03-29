import { describe, expect, it } from 'vitest';
import {
  createPlaneMesh,
  subdivideMesh,
  voxelRemeshMesh,
} from '@/engine/editor/modelerMesh';

describe('sculpt advanced helpers', () => {
  it('subdivideMesh adds multires detail while preserving the surface footprint', () => {
    const mesh = createPlaneMesh();
    const subdivided = subdivideMesh(mesh, 2);

    expect(subdivided.vertices.length).toBeGreaterThan(mesh.vertices.length);
    expect(subdivided.faces.length).toBeGreaterThan(mesh.faces.length);
    expect(subdivided.vertices.some((vertex) => Math.abs(vertex.y) > 0.0001)).toBe(false);
  });

  it('voxelRemeshMesh produces a denser, welded sculpt-friendly mesh', () => {
    const mesh = createPlaneMesh();
    const remeshed = voxelRemeshMesh(mesh, 0.08, 2);

    expect(remeshed.vertices.length).toBeGreaterThan(mesh.vertices.length);
    expect(remeshed.faces.length).toBeGreaterThan(mesh.faces.length);
    expect(remeshed.faces.every((face) => new Set(face).size === 3)).toBe(true);
  });
});
