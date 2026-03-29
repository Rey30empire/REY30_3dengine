import { describe, expect, it } from 'vitest';
import {
  BUILTIN_GEOMETRY_NODE_RECIPES,
  geometryNodesToModifierStack,
  modifierStackToGeometryNodes,
  parseGeometryNodeGraphDocument,
  serializeGeometryNodeGraphDocument,
  summarizeGeometryNodeGraph,
} from '@/engine/editor/geometryNodesLite';
import {
  createArrayModifier,
  createMirrorModifier,
  createSolidifyModifier,
} from '@/engine/editor/meshModifiers';

describe('geometryNodesLite', () => {
  it('roundtrips modifier stacks into geometry nodes lite and back', () => {
    const source = [
      createMirrorModifier(),
      createSolidifyModifier(0.09),
      createArrayModifier({
        count: 6,
        mode: 'radial',
        axis: 'z',
        radius: 1.8,
        angle: 240,
        rotateInstances: false,
      }),
    ];

    const nodes = modifierStackToGeometryNodes(source);
    const restored = geometryNodesToModifierStack(nodes);

    expect(nodes).toHaveLength(3);
    expect(nodes[2]?.type).toBe('array_radial');
    expect(restored).toHaveLength(3);
    expect(restored[2]?.type).toBe('array');
    expect(restored[2]?.type === 'array' ? restored[2].mode : 'linear').toBe('radial');
    expect(restored[2]?.type === 'array' ? restored[2].axis : 'x').toBe('z');
  });

  it('preserves stable ids when converting modifier stacks into node graphs', () => {
    const source = [
      createMirrorModifier(),
      createSolidifyModifier(0.11),
    ];

    const nodes = modifierStackToGeometryNodes(source);

    expect(nodes[0]?.id).toBe(source[0]?.id);
    expect(nodes[1]?.id).toBe(source[1]?.id);
  });

  it('serializes and parses geometry node graph documents', () => {
    const recipe = BUILTIN_GEOMETRY_NODE_RECIPES.find((entry) => entry.id === 'gn_panel_run');
    expect(recipe).toBeTruthy();

    const serialized = serializeGeometryNodeGraphDocument({
      name: recipe?.name,
      description: recipe?.description,
      nodes: recipe?.nodes ?? [],
    });
    const parsed = parseGeometryNodeGraphDocument(JSON.parse(serialized));

    expect(parsed?.version).toBe(1);
    expect(parsed?.name).toBe('Panel Run');
    expect(parsed?.nodes).toHaveLength(2);
  });

  it('summarizes active node graphs for UI cards', () => {
    const summary = summarizeGeometryNodeGraph(
      BUILTIN_GEOMETRY_NODE_RECIPES.find((entry) => entry.id === 'gn_proxy_lod')?.nodes ?? []
    );

    expect(summary).toContain('2 nodos');
    expect(summary).toContain('Remesh');
  });
});
