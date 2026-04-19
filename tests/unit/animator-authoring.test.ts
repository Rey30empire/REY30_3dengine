import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  compileAnimatorAuthoring,
  createDefaultAnimatorComponentData,
  createGeneratedAnimatorRecord,
  evaluateCompiledAnimatorTimeline,
} from '@/engine/animation/animatorAuthoring';
import {
  createDefaultAnimatorEditorState,
  createLibraryClip,
  serializeAnimatorEditorState,
  type AnimationEditorClip,
} from '@/engine/editor/animationEditorState';
import type { Entity } from '@/types/engine';

function createAdditiveChestClip(): AnimationEditorClip {
  return {
    id: 'clip-additive-chest',
    name: 'Chest Add',
    duration: 1.2,
    frameRate: 30,
    isLooping: true,
    tracks: [
      {
        id: 'track-chest-rotation-z',
        name: 'Chest.RotationZ',
        path: 'Rig/Chest',
        property: 'rotation.z',
        type: 'rotation',
        color: '#f59e0b',
        visible: true,
        locked: false,
        keyframes: [
          { id: 'kf-0', time: 0, value: 0, easing: 'linear' },
          { id: 'kf-1', time: 0.6, value: 24, easing: 'linear' },
          { id: 'kf-2', time: 1.2, value: 0, easing: 'linear' },
        ],
      },
    ],
  };
}

describe('animator authoring bridge', () => {
  it('compiles editor animator state into reproducible clips and NLA playback', () => {
    const baseState = createDefaultAnimatorEditorState('Hero');
    const walkClip = createLibraryClip('Walk Cycle');
    const additiveClip = createAdditiveChestClip();
    const serialized = serializeAnimatorEditorState(
      {
        controllerId: null,
        currentAnimation: walkClip.name,
        parameters: { locomotion: 'walk' },
      },
      {
        ...baseState,
        activeClipId: walkClip.id,
        clips: [walkClip, additiveClip],
        nlaStrips: [
          {
            id: 'strip-walk',
            name: 'Walk Main',
            clipId: walkClip.id,
            start: 0,
            end: walkClip.duration,
            blendMode: 'replace',
            muted: false,
          },
          {
            id: 'strip-add',
            name: 'Chest Add',
            clipId: additiveClip.id,
            start: 0,
            end: additiveClip.duration,
            blendMode: 'add',
            muted: false,
          },
        ],
      }
    );

    const compiled = compileAnimatorAuthoring(serialized, 'Hero');
    const evaluation = evaluateCompiledAnimatorTimeline(compiled, 0.6);
    const chestBoneId = compiled.state.bones.find((bone) => bone.name === 'Chest')?.id;
    const chestRotation = chestBoneId
      ? evaluation.pose.transforms[chestBoneId]?.rotation
      : null;
    const chestEuler = chestRotation
      ? new THREE.Euler().setFromQuaternion(
          new THREE.Quaternion(
            chestRotation.x,
            chestRotation.y,
            chestRotation.z,
            chestRotation.w
          ),
          'XYZ'
        )
      : null;

    expect(compiled.summary.clipCount).toBe(2);
    expect(compiled.summary.nlaStripCount).toBe(2);
    expect(compiled.summary.hasRootMotion).toBe(true);
    expect(evaluation.primaryClipName).toBe('Walk Cycle');
    expect(evaluation.activeClipNames).toEqual(['Walk Cycle', 'Chest Add']);
    expect(
      evaluation.pose.transforms[compiled.rootBoneId!]?.translation.z ?? 0
    ).toBeCloseTo(0.5, 1);
    expect(Math.abs(THREE.MathUtils.radToDeg(chestEuler?.z ?? 0))).toBeGreaterThan(20);
  });

  it('creates generated animation records with stable asset metadata', () => {
    const entity: Entity = {
      id: 'entity-hero',
      name: 'Hero',
      parentId: null,
      children: [],
      active: true,
      tags: ['player'],
      components: new Map([
        [
          'Animator',
          {
            id: 'animator-hero',
            type: 'Animator',
            enabled: true,
            data: createDefaultAnimatorComponentData('Hero'),
          },
        ],
      ]),
    };

    const generated = createGeneratedAnimatorRecord(entity);

    expect(generated).toMatchObject({
      assetId: 'generated-animation-entity-hero',
      entityId: 'entity-hero',
      entityName: 'Hero',
      path: 'generated-animation-Hero-entity-hero.json',
      source: 'editor',
    });
    expect(generated?.summary.clipCount).toBeGreaterThanOrEqual(1);
    expect(generated?.summary.trackCount).toBeGreaterThanOrEqual(1);
  });
});
