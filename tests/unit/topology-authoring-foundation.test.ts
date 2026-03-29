import { describe, expect, it } from 'vitest';
import { InitializeTopologyBrushSystem } from '@/engine/systems/topology-authoring';

describe('topology authoring foundation', () => {
  it('creates a parametric template preview and converts it to editable mesh', () => {
    const system = InitializeTopologyBrushSystem();

    system.ActivateTemplateMode('chair');
    system.BeginStroke({
      screenX: 10,
      screenY: 10,
      timestamp: 0,
      worldPosition: { x: 0, y: 0, z: 0 },
    });
    system.EndStroke({
      screenX: 12,
      screenY: 12,
      timestamp: 16,
      worldPosition: { x: 0.1, y: 0, z: 0.1 },
    });

    expect(system.snapshot().currentSuggestion?.hypotheses[0]?.kind).toBe('template_proxy');

    system.AcceptIntentSuggestion();

    const snapshot = system.snapshot();
    const converted = system.ConvertTemplateToEditableMesh('chair');

    expect(snapshot.mesh.vertices.length).toBeGreaterThan(0);
    expect(snapshot.mesh.faces.length).toBeGreaterThan(0);
    expect(converted.editableMesh.faces.length).toBeGreaterThan(0);
    expect(system.ValidateTopology()).toEqual([]);
  });

  it('creates edges in intent-driven mode', () => {
    const system = InitializeTopologyBrushSystem();
    system.ActivateIntentDrivenMode();

    system.BeginStroke({
      screenX: 0,
      screenY: 0,
      timestamp: 0,
      worldPosition: { x: 0, y: 0, z: 0 },
    });
    system.EndStroke({
      screenX: 24,
      screenY: 0,
      timestamp: 16,
      worldPosition: { x: 1, y: 0, z: 0 },
    });

    expect(system.snapshot().currentSuggestion?.hypotheses[0]?.kind).toBe('create_edge');

    system.AcceptIntentSuggestion();

    const snapshot = system.snapshot();
    expect(snapshot.mesh.vertices.length).toBeGreaterThanOrEqual(2);
    expect(snapshot.mesh.edges.length).toBeGreaterThanOrEqual(1);
  });
});
