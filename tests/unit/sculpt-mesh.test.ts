import { describe, expect, it } from 'vitest';
import { createPlaneMesh } from '@/engine/editor/modelerMesh';
import { sculptMesh } from '@/engine/editor/sculptMesh';

describe('sculptMesh', () => {
  it('draw brush pushes vertices along the surface normal', () => {
    const mesh = createPlaneMesh();
    const sculpted = sculptMesh({
      mesh,
      brush: 'draw',
      center: { x: -0.5, y: 0, z: -0.5 },
      radius: 0.4,
      strength: 1,
      brushNormal: { x: 0, y: 1, z: 0 },
    });

    expect(sculpted.vertices[0]?.y ?? 0).toBeGreaterThan(mesh.vertices[0]?.y ?? 0);
  });

  it('grab brush moves the affected region with the drag delta', () => {
    const mesh = createPlaneMesh();
    const sculpted = sculptMesh({
      mesh,
      brush: 'grab',
      center: { x: -0.5, y: 0, z: -0.5 },
      radius: 0.4,
      strength: 1,
      delta: { x: 0.2, y: 0, z: 0.1 },
    });

    expect(sculpted.vertices[0]?.x ?? 0).toBeGreaterThan(mesh.vertices[0]?.x ?? 0);
    expect(sculpted.vertices[0]?.z ?? 0).toBeGreaterThan(mesh.vertices[0]?.z ?? 0);
  });

  it('mirrors the sculpt stroke on the X axis when symmetry is enabled', () => {
    const mesh = createPlaneMesh();
    const sculpted = sculptMesh({
      mesh,
      brush: 'crease',
      center: { x: -0.5, y: 0, z: -0.5 },
      radius: 0.4,
      strength: 1,
      brushNormal: { x: 0, y: 1, z: 0 },
      symmetryX: true,
    });

    expect(sculpted.vertices[0]?.y ?? 0).toBeGreaterThan(mesh.vertices[0]?.y ?? 0);
    expect(sculpted.vertices[1]?.y ?? 0).toBeGreaterThan(mesh.vertices[1]?.y ?? 0);
  });
});
