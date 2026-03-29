import { describe, expect, it } from 'vitest';
import { createPlaneMesh } from '@/engine/editor/modelerMesh';
import {
  applyMeshModifierStack,
  buildMeshModifierPreviewMetrics,
  buildMeshModifierSignature,
  cloneMeshModifier,
  cloneMeshModifierStack,
  createArrayModifier,
  createDecimateModifier,
  createMirrorModifier,
  createSolidifyModifier,
  parseMeshModifierPresetLibraryDocument,
  parseMeshModifierStackDocument,
  parseMeshModifierStack,
  sanitizeMeshModifier,
  serializeMeshModifierPresetLibraryDocument,
  serializeMeshModifierStackDocument,
  summarizeMeshModifierStack,
} from '@/engine/editor/meshModifiers';

describe('meshModifiers', () => {
  it('parses stored modifier stacks and ignores invalid entries', () => {
    const modifiers = parseMeshModifierStack([
      { type: 'mirror_x', enabled: true },
      { type: 'array', count: 4, mode: 'radial', radius: 2, axis: 'y' },
      { type: 'invalid' },
    ]);

    expect(modifiers).toHaveLength(2);
    expect(modifiers[0]?.type).toBe('mirror_x');
    expect(modifiers[1]?.type).toBe('array');
  });

  it('applies modifier stacks in order to produce a derived mesh', () => {
    const mesh = createPlaneMesh();
    const modifiers = [
      createMirrorModifier(),
      createSolidifyModifier(0.15),
      createArrayModifier({
        count: 3,
        mode: 'radial',
        axis: 'y',
        radius: 2,
        angle: 360,
        rotateInstances: true,
      }),
      createDecimateModifier(0.75),
    ];

    const derived = applyMeshModifierStack(mesh, modifiers);

    expect(derived.vertices.length).toBeGreaterThan(mesh.vertices.length);
    expect(derived.faces.length).toBeGreaterThan(mesh.faces.length);
  });

  it('changes the modifier signature when configuration changes', () => {
    const base = buildMeshModifierSignature([
      createArrayModifier({ count: 3, mode: 'linear', offset: { x: 2, y: 0, z: 0 } }),
    ]);
    const changed = buildMeshModifierSignature([
      createArrayModifier({ count: 5, mode: 'linear', offset: { x: 2, y: 0, z: 0 } }),
    ]);

    expect(base).not.toBe(changed);
  });

  it('sanitizes edited modifier parameters back into safe ranges', () => {
    const array = sanitizeMeshModifier({
      ...createArrayModifier(),
      count: 1,
      radius: -4,
      angle: 999,
      offset: { x: 4000, y: -4000, z: Number.NaN },
    });
    const remesh = sanitizeMeshModifier({
      id: 'remesh_test',
      type: 'remesh',
      enabled: true,
      iterations: 99,
      relaxStrength: 5,
    });
    const decimate = sanitizeMeshModifier({
      ...createDecimateModifier(),
      ratio: 0,
    });

    expect(array.type).toBe('array');
    expect(array.type === 'array' ? array.count : 0).toBe(2);
    expect(array.type === 'array' ? array.radius : 0).toBe(0);
    expect(array.type === 'array' ? array.angle : 0).toBe(360);
    expect(array.type === 'array' ? array.offset?.x : 0).toBe(1000);
    expect(array.type === 'array' ? array.offset?.y : 0).toBe(-1000);
    expect(array.type === 'array' ? array.offset?.z : 0).toBe(0);
    expect(remesh.type === 'remesh' ? remesh.iterations : 0).toBe(3);
    expect(remesh.type === 'remesh' ? remesh.relaxStrength : 0).toBe(1);
    expect(decimate.type === 'decimate' ? decimate.ratio : 0).toBe(0.1);
  });

  it('duplicates modifiers with fresh ids while preserving config', () => {
    const original = createArrayModifier({
      count: 5,
      mode: 'radial',
      axis: 'z',
      radius: 3,
      angle: 180,
      rotateInstances: false,
    });
    const duplicate = cloneMeshModifier(original);
    const stackDuplicate = cloneMeshModifierStack([original])[0];

    expect(duplicate.id).not.toBe(original.id);
    expect(duplicate.type).toBe('array');
    expect(duplicate.type === 'array' ? duplicate.count : 0).toBe(5);
    expect(duplicate.type === 'array' ? duplicate.axis : 'x').toBe('z');
    expect(stackDuplicate?.id).not.toBe(original.id);
  });

  it('serializes and parses stack documents for transfer', () => {
    const source = [
      createMirrorModifier(),
      createSolidifyModifier(0.25),
      createDecimateModifier(0.8),
    ];
    const serialized = serializeMeshModifierStackDocument({
      modifiers: source,
      name: 'Hard surface pass',
      description: 'Mirror + shell + cleanup',
    });
    const parsed = parseMeshModifierStackDocument(JSON.parse(serialized));

    expect(parsed?.version).toBe(1);
    expect(parsed?.name).toBe('Hard surface pass');
    expect(parsed?.description).toBe('Mirror + shell + cleanup');
    expect(parsed?.modifiers).toHaveLength(3);
    expect(parsed?.modifiers[0]?.id).not.toBe(source[0]?.id);
  });

  it('summarizes a modifier stack for preset previews', () => {
    const summary = summarizeMeshModifierStack([
      createMirrorModifier(),
      createSolidifyModifier(0.1),
      createDecimateModifier(0.7),
    ]);

    expect(summary).toContain('3 modifiers');
    expect(summary).toContain('Mirror X');
    expect(summary).toContain('Solidify');
  });

  it('serializes and parses preset libraries for bulk transfer', () => {
    const serialized = serializeMeshModifierPresetLibraryDocument({
      name: 'User Library',
      presets: [
        {
          name: 'Mirror Shell',
          description: 'Symmetry plus shell',
          modifiers: [createMirrorModifier(), createSolidifyModifier(0.08)],
        },
        {
          name: 'Cleanup',
          modifiers: [createDecimateModifier(0.7)],
        },
      ],
    });
    const parsed = parseMeshModifierPresetLibraryDocument(JSON.parse(serialized));

    expect(parsed?.name).toBe('User Library');
    expect(parsed?.presets).toHaveLength(2);
    expect(parsed?.presets[0]?.name).toBe('Mirror Shell');
    expect(parsed?.presets[0]?.modifiers[0]?.id).toBeTruthy();
  });

  it('builds preview metrics for quick geometric preset cards', () => {
    const base = createPlaneMesh();
    const metrics = buildMeshModifierPreviewMetrics(base, [
      createMirrorModifier(),
      createSolidifyModifier(0.1),
    ]);

    expect(metrics.baseVertices).toBe(base.vertices.length);
    expect(metrics.vertices).toBeGreaterThan(metrics.baseVertices);
    expect(metrics.faces).toBeGreaterThan(metrics.baseFaces);
  });
});
