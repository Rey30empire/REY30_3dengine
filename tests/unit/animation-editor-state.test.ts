import { describe, expect, it } from 'vitest';
import { createPrimitiveMesh } from '@/engine/editor/modelerMesh';
import {
  applyAutoWeightsFromRig,
  createDefaultAnimatorEditorState,
  createLibraryClip,
  normalizeAnimatorEditorState,
  serializeAnimatorEditorState,
} from '@/engine/editor/animationEditorState';

describe('animation editor state helpers', () => {
  it('creates a persistent default rig/clip package', () => {
    const state = createDefaultAnimatorEditorState('Hero');
    const serialized = serializeAnimatorEditorState(
      {
        controllerId: null,
        currentAnimation: null,
        parameters: {},
      },
      state
    );
    const normalized = normalizeAnimatorEditorState(serialized, 'Hero');

    expect(normalized.clips).toHaveLength(1);
    expect(normalized.activeClipId).toBe(normalized.clips[0]?.id ?? null);
    expect(normalized.bones.length).toBeGreaterThanOrEqual(4);
    expect(normalized.ikChains.length).toBeGreaterThan(0);
    expect(normalized.constraints.length).toBeGreaterThan(0);
    expect(normalized.shapeKeys.length).toBeGreaterThan(0);
    expect(normalized.poseMode).toBe(true);
  });

  it('builds library clips with stable locomotion timing', () => {
    const walk = createLibraryClip('Walk Cycle');
    const run = createLibraryClip('Run Cycle');

    expect(walk.isLooping).toBe(true);
    expect(walk.duration).toBeCloseTo(1.2, 4);
    expect(walk.tracks[0]?.property).toBe('position.z');
    expect(run.duration).toBeCloseTo(0.8, 4);
    expect(run.tracks[0]?.property).toBe('position.z');
  });

  it('auto-weights a mesh from the rig and keeps rows normalized', () => {
    const state = createDefaultAnimatorEditorState('Hero');
    const weighted = applyAutoWeightsFromRig(createPrimitiveMesh('cube'), state.bones);

    expect(weighted.weightGroups).toEqual(state.bones.map((bone) => bone.name));
    expect(weighted.weights).toHaveLength(weighted.vertices.length);
    expect(weighted.weights?.every((row) => row.length === state.bones.length)).toBe(true);
    expect(weighted.weights?.every((row) => {
      const total = row.reduce((sum, value) => sum + value, 0);
      return Math.abs(total - 1) < 0.0001;
    })).toBe(true);
  });
});
