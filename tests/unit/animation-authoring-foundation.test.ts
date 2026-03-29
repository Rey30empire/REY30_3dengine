import { describe, expect, it } from 'vitest';
import {
  AnimationEditor,
  evaluatePose,
  type AnimationClip,
  type Skeleton,
} from '@/engine/systems/animation-authoring';

const TEST_SKELETON: Skeleton = {
  id: 'human_base',
  name: 'Human Base',
  bones: [
    {
      id: 'root',
      name: 'Root',
      parentId: null,
      restTransform: {
        translation: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: { x: 1, y: 1, z: 1 },
      },
    },
    {
      id: 'hand_r',
      name: 'Hand R',
      parentId: 'root',
      restTransform: {
        translation: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: { x: 1, y: 1, z: 1 },
      },
    },
  ],
};

function createClip(): AnimationClip {
  return {
    id: 'idle_a',
    name: 'Idle A',
    duration: 1,
    frameRate: 30,
    tracks: [
      {
        id: 'track_hand_translation',
        boneId: 'hand_r',
        channel: 'translation',
        keyframes: [
          {
            id: 'kf0',
            time: 0,
            value: { x: 0, y: 0, z: 0 },
            interpolation: 'linear',
          },
          {
            id: 'kf1',
            time: 1,
            value: { x: 10, y: 0, z: 0 },
            interpolation: 'linear',
          },
        ],
      },
    ],
  };
}

describe('animation authoring foundation', () => {
  it('evaluates interpolated poses and preserves source clips on duplicate', () => {
    const clip = createClip();
    const editor = new AnimationEditor(TEST_SKELETON, [clip]);

    const basePose = evaluatePose(TEST_SKELETON, clip, 0.5);
    expect(basePose.transforms.hand_r.translation.x).toBeCloseTo(5, 5);

    const duplicate = editor.saveAsNewClip('Idle A tweak');
    expect(duplicate?.sourceClipId).toBe('idle_a');

    const edited = editor.editBonesInRange({
      clipId: duplicate!.id,
      boneIds: ['hand_r'],
      range: { start: 0, end: 1 },
      translationOffset: { y: 1 },
    });

    expect(edited).toBe(true);

    const tweakedPose = editor.evaluateCurrentPose(0.5);
    expect(tweakedPose.transforms.hand_r.translation.y).toBeCloseTo(1, 5);
    expect(basePose.transforms.hand_r.translation.y).toBe(0);
  });

  it('supports undo after editing a duplicated clip', () => {
    const editor = new AnimationEditor(TEST_SKELETON, [createClip()]);
    const duplicate = editor.saveAsNewClip('Idle B tweak');

    editor.editBonesInRange({
      clipId: duplicate!.id,
      boneIds: ['hand_r'],
      range: { start: 0, end: 1 },
      translationOffset: { y: 2 },
    });
    expect(editor.evaluateCurrentPose(0.5).transforms.hand_r.translation.y).toBeCloseTo(2, 5);

    expect(editor.undo()).toBe(true);
    expect(editor.evaluateCurrentPose(0.5).transforms.hand_r.translation.y).toBeCloseTo(0, 5);
  });
});
