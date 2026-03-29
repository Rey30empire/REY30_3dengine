import { describe, expect, it } from 'vitest';
import {
  acceptTopologyIntentStroke,
  applyTopologyAutoWeld,
  applyTopologyCleanup,
  applyTopologyRelax,
  applyTopologySymmetry,
  createTopologyTemplateEditableMesh,
} from '@/engine/editor/modelerTopologyBridge';
import { createPlaneMesh, type EditableMesh } from '@/engine/editor/modelerMesh';

describe('modeler topology bridge', () => {
  it('creates parametric templates directly as editable meshes', () => {
    const mesh = createTopologyTemplateEditableMesh('chair', {
      width: 1.8,
      height: 1.4,
      depth: 1.2,
    });

    expect(mesh.vertices.length).toBeGreaterThan(0);
    expect(mesh.faces.length).toBeGreaterThan(0);
  });

  it('applies cleanup, relax and symmetry through topology helpers', () => {
    const base = createPlaneMesh();
    const cleaned = applyTopologyCleanup(base);
    const relaxed = applyTopologyRelax(cleaned);
    const mirrored = applyTopologySymmetry(relaxed, 'x');

    expect(cleaned.faces.length).toBeGreaterThan(0);
    expect(relaxed.vertices.length).toBe(cleaned.vertices.length);
    expect(mirrored.vertices.length).toBeGreaterThan(relaxed.vertices.length);
  });

  it('accepts intent strokes and auto welds duplicates', () => {
    const bridgeResult = acceptTopologyIntentStroke({
      mode: 'intent_driven',
      stroke: [
        { x: -0.5, y: 0, z: 0 },
        { x: 0.5, y: 0, z: 0 },
      ],
    });

    expect(bridgeResult.suggestionKind).toBe('create_edge');
    expect(bridgeResult.editableMesh?.faces.length ?? 0).toBeGreaterThanOrEqual(0);

    const duplicateMesh: EditableMesh = {
      vertices: [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 1, y: 1, z: 0 },
        { x: 0, y: 1, z: 0 },
        { x: 0.0001, y: 0, z: 0 },
      ],
      faces: [
        [0, 1, 2],
        [4, 2, 3],
      ],
    };

    const welded = applyTopologyAutoWeld(duplicateMesh, 0.01);
    expect(welded.vertices.length).toBeLessThan(duplicateMesh.vertices.length);
  });

  it('positions template strokes around the viewport hit point', () => {
    const result = acceptTopologyIntentStroke({
      mode: 'template',
      templateType: 'chair',
      stroke: [{ x: 4, y: 2, z: -3 }],
    });

    const vertices = result.editableMesh?.vertices ?? [];
    expect(result.suggestionKind).toBe('template_proxy');
    expect(vertices.some((vertex) => vertex.x > 3)).toBe(true);
    expect(vertices.some((vertex) => vertex.y > 1)).toBe(true);
    expect(vertices.some((vertex) => vertex.z < -2)).toBe(true);
  });
});
