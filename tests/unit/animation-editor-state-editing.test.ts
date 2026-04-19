import { describe, expect, it } from 'vitest';
import {
  applyAnimatorPoseLibraryEntry,
  bakeCurrentAnimatorPoseToActiveClip,
  bakeCurrentAnimatorPoseRangeToActiveClip,
  copySelectedAnimationKeyframes,
  copyCurrentAnimatorPose,
  createDefaultAnimatorEditorState,
  deleteAnimatorPoseLibraryEntry,
  duplicateActiveAnimationClip,
  findSelectedKeyframeTimeBounds,
  mirrorCurrentAnimatorPose,
  nudgeSelectedAnimationKeyframes,
  offsetAnimationNlaStrip,
  pasteAnimationKeyframesIntoActiveClip,
  reverseActiveAnimationClip,
  scaleSelectedAnimationKeyframes,
  saveCurrentAnimatorPoseToLibrary,
  serializeAnimatorEditorState,
  splitActiveAnimationClipAtTime,
  trimActiveAnimationClipToRange,
  normalizeAnimatorEditorState,
  pasteAnimatorPoseFromClipboard,
  retargetActiveAnimationClipToCurrentRig,
  type AnimatorEditorState,
} from '@/engine/editor/animationEditorState';

function withActiveClip(
  state: AnimatorEditorState,
  updater: (clip: AnimatorEditorState['clips'][number]) => AnimatorEditorState['clips'][number]
) {
  const activeClipIndex = state.clips.findIndex((clip) => clip.id === state.activeClipId);
  const activeClip = state.clips[activeClipIndex];
  if (!activeClip || activeClipIndex < 0) {
    return state;
  }
  const clips = [...state.clips];
  clips[activeClipIndex] = updater(activeClip);
  return {
    ...state,
    clips,
  };
}

describe('animation editor editing helpers', () => {
  it('duplicates the active clip with fresh ids and activates the copy', () => {
    const state = createDefaultAnimatorEditorState('Hero');
    const duplicated = duplicateActiveAnimationClip(state);
    const originalClip = state.clips[0];
    const copiedClip = duplicated.clips.find((clip) => clip.id === duplicated.activeClipId);

    expect(duplicated.clips).toHaveLength(state.clips.length + 1);
    expect(copiedClip).toBeTruthy();
    expect(copiedClip?.id).not.toBe(originalClip?.id);
    expect(copiedClip?.name).toContain(originalClip?.name ?? '');
    expect(copiedClip?.tracks[0]?.id).not.toBe(originalClip?.tracks[0]?.id);
    expect(copiedClip?.tracks[0]?.keyframes[0]?.id).not.toBe(
      originalClip?.tracks[0]?.keyframes[0]?.id
    );
  });

  it('finds selected keyframe bounds and nudges them as a block inside clip limits', () => {
    const state = createDefaultAnimatorEditorState('Hero');
    const track = state.clips[0]?.tracks[0];
    const selectedIds = [track?.keyframes[0]?.id, track?.keyframes[1]?.id].filter(Boolean) as string[];
    const bounds = findSelectedKeyframeTimeBounds(state, selectedIds);
    const nudged = nudgeSelectedAnimationKeyframes(state, selectedIds, 1 / 30);
    const nudgedTrack = nudged.clips[0]?.tracks[0];

    expect(bounds).toEqual({ start: 0, end: 0.75 });
    expect(nudgedTrack?.keyframes[0]?.time).toBeCloseTo(1 / 30, 5);
    expect(nudgedTrack?.keyframes[1]?.time).toBeCloseTo(0.75 + 1 / 30, 5);
    expect(nudgedTrack?.keyframes[2]?.time).toBeCloseTo(1.5, 5);
  });

  it('scales selected keyframes around a pivot without exceeding clip duration', () => {
    const seeded = withActiveClip(createDefaultAnimatorEditorState('Hero'), (clip) => ({
      ...clip,
      tracks: clip.tracks.map((track, index) =>
        index === 0
          ? {
              ...track,
              keyframes: track.keyframes.map((keyframe, keyframeIndex) => ({
                ...keyframe,
                time: [0.25, 0.5, 0.75][keyframeIndex] ?? keyframe.time,
              })),
            }
          : track
      ),
    }));
    const track = seeded.clips[0]?.tracks[0];
    const selectedIds = track?.keyframes.map((keyframe) => keyframe.id) ?? [];
    const scaled = scaleSelectedAnimationKeyframes(seeded, selectedIds, 2, 0.25);
    const scaledTimes = scaled.clips[0]?.tracks[0]?.keyframes.map((keyframe) => keyframe.time);

    expect(scaledTimes).toEqual([0.25, 0.75, 1.25]);
  });

  it('reverses the active clip timing and keeps tracks sorted', () => {
    const seeded = withActiveClip(createDefaultAnimatorEditorState('Hero'), (clip) => ({
      ...clip,
      tracks: clip.tracks.map((track, index) =>
        index === 0
          ? {
              ...track,
              keyframes: track.keyframes.map((keyframe, keyframeIndex) => ({
                ...keyframe,
                time: [0.1, 0.5, 1.2][keyframeIndex] ?? keyframe.time,
              })),
            }
          : track
      ),
    }));
    const reversed = reverseActiveAnimationClip(seeded);
    const reversedTimes = reversed.clips[0]?.tracks[0]?.keyframes.map((keyframe) => keyframe.time);

    expect(reversedTimes?.[0]).toBeCloseTo(0.3, 5);
    expect(reversedTimes?.[1]).toBeCloseTo(1, 5);
    expect(reversedTimes?.[2]).toBeCloseTo(1.4, 5);
  });

  it('trims the active clip to a time range and syncs NLA strip duration', () => {
    const state = createDefaultAnimatorEditorState('Hero');
    const trimmed = trimActiveAnimationClipToRange(state, 0.5, 1.25);
    const trimmedClip = trimmed.clips[0];
    const trimmedStrip = trimmed.nlaStrips[0];

    expect(trimmedClip?.duration).toBeCloseTo(0.75, 5);
    expect(trimmedClip?.tracks[0]?.keyframes.map((keyframe) => keyframe.time)).toEqual([0.25]);
    expect(trimmedClip?.tracks[1]?.keyframes.map((keyframe) => keyframe.time)).toEqual([0.25]);
    expect(trimmedStrip?.start).toBeCloseTo(0, 5);
    expect(trimmedStrip?.end).toBeCloseTo(0.75, 5);
  });

  it('offsets NLA strips while keeping them on the positive timeline', () => {
    const state = createDefaultAnimatorEditorState('Hero');
    const stripId = state.nlaStrips[0]?.id ?? '';
    const offset = offsetAnimationNlaStrip(state, stripId, 0.5);
    const offsetBack = offsetAnimationNlaStrip(offset, stripId, -2);

    expect(offset.nlaStrips[0]?.start).toBeCloseTo(0.5, 5);
    expect(offset.nlaStrips[0]?.end).toBeCloseTo(2, 5);
    expect(offsetBack.nlaStrips[0]?.start).toBeCloseTo(0, 5);
    expect(offsetBack.nlaStrips[0]?.end).toBeCloseTo(1.5, 5);
  });

  it('saves, applies and serializes pose library entries', () => {
    const base = createDefaultAnimatorEditorState('Hero');
    const saved = saveCurrentAnimatorPoseToLibrary(
      {
        ...base,
        shapeKeys: base.shapeKeys.map((shapeKey) =>
          shapeKey.id === 'sk_smile' ? { ...shapeKey, weight: 0.8 } : shapeKey
        ),
      },
      'Happy'
    );
    const poseId = saved.poseLibrary[0]?.id ?? '';
    const mutated = {
      ...saved,
      shapeKeys: saved.shapeKeys.map((shapeKey) =>
        shapeKey.id === 'sk_smile' ? { ...shapeKey, weight: 0 } : shapeKey
      ),
    };
    const applied = applyAnimatorPoseLibraryEntry(mutated, poseId);
    const normalized = normalizeAnimatorEditorState(
      serializeAnimatorEditorState(
        {
          controllerId: null,
          currentAnimation: null,
          parameters: {},
        },
        applied
      ),
      'Hero'
    );

    expect(applied.shapeKeys.find((shapeKey) => shapeKey.id === 'sk_smile')?.weight).toBeCloseTo(
      0.8,
      5
    );
    expect(normalized.poseLibrary).toHaveLength(1);
    expect(normalized.poseLibrary[0]?.name).toBe('Happy');
  });

  it('mirrors left/right pose data and supports deleting saved poses', () => {
    const state = createDefaultAnimatorEditorState('Hero');
    const mirrored = mirrorCurrentAnimatorPose({
      ...state,
      bones: state.bones.map((bone) => {
        if (bone.name === 'Arm_L') {
          return { ...bone, restPosition: { x: -0.5, y: 0.9, z: 0.1 } };
        }
        if (bone.name === 'Arm_R') {
          return { ...bone, restPosition: { x: 0.2, y: 0.7, z: -0.1 } };
        }
        return bone;
      }),
      shapeKeys: state.shapeKeys.map((shapeKey) => {
        if (shapeKey.id === 'sk_blink_l') {
          return { ...shapeKey, weight: 0.25 };
        }
        if (shapeKey.id === 'sk_blink_r') {
          return { ...shapeKey, weight: 0.85 };
        }
        return shapeKey;
      }),
    });
    const saved = saveCurrentAnimatorPoseToLibrary(mirrored, 'Mirrored');
    const poseId = saved.poseLibrary[0]?.id ?? '';
    const deleted = deleteAnimatorPoseLibraryEntry(saved, poseId);

    expect(mirrored.bones.find((bone) => bone.name === 'Arm_L')?.restPosition).toEqual({
      x: -0.2,
      y: 0.7,
      z: -0.1,
    });
    expect(mirrored.bones.find((bone) => bone.name === 'Arm_R')?.restPosition).toEqual({
      x: 0.5,
      y: 0.9,
      z: 0.1,
    });
    expect(
      mirrored.shapeKeys.find((shapeKey) => shapeKey.id === 'sk_blink_l')?.weight
    ).toBeCloseTo(0.85, 5);
    expect(
      mirrored.shapeKeys.find((shapeKey) => shapeKey.id === 'sk_blink_r')?.weight
    ).toBeCloseTo(0.25, 5);
    expect(deleted.poseLibrary).toHaveLength(0);
  });

  it('copies and pastes selected keyframes with relative offsets', () => {
    const state = createDefaultAnimatorEditorState('Hero');
    const selectedIds = [
      state.clips[0]?.tracks[0]?.keyframes[0]?.id,
      state.clips[0]?.tracks[0]?.keyframes[1]?.id,
    ].filter(Boolean) as string[];
    const clipboard = copySelectedAnimationKeyframes(state, selectedIds);
    const pasted = pasteAnimationKeyframesIntoActiveClip(state, clipboard, 0.5);
    const times = pasted.clips[0]?.tracks[0]?.keyframes.map((keyframe) => keyframe.time);

    expect(clipboard?.sourceClipName).toBe('Hero_Idle');
    expect(clipboard?.tracks[0]?.keyframes).toHaveLength(2);
    expect(times).toEqual([0, 0.5, 0.75, 1.25, 1.5]);
  });

  it('splits the active clip at the playhead and activates the new second clip', () => {
    const state = createDefaultAnimatorEditorState('Hero');
    const split = splitActiveAnimationClipAtTime(state, 0.75);
    const leftClip = split.clips.find((clip) => clip.name === 'Hero_Idle');
    const rightClip = split.clips.find((clip) => clip.id === split.activeClipId);

    expect(split.clips).toHaveLength(2);
    expect(leftClip?.duration).toBeCloseTo(0.75, 5);
    expect(rightClip?.name).toContain('Split');
    expect(rightClip?.duration).toBeCloseTo(0.75, 5);
    expect(rightClip?.tracks[0]?.keyframes.map((keyframe) => keyframe.time)).toEqual([0, 0.75]);
    expect(split.nlaStrips[0]?.end).toBeCloseTo(0.75, 5);
  });

  it('copies and pastes the current pose clipboard over bones and shape keys', () => {
    const base = createDefaultAnimatorEditorState('Hero');
    const clipboard = copyCurrentAnimatorPose(
      {
        ...base,
        bones: base.bones.map((bone) =>
          bone.name === 'Head'
            ? { ...bone, restPosition: { x: 0.1, y: 1.2, z: 0.3 } }
            : bone
        ),
        shapeKeys: base.shapeKeys.map((shapeKey) =>
          shapeKey.id === 'sk_smile' ? { ...shapeKey, weight: 0.9 } : shapeKey
        ),
      },
      'Face pose'
    );
    const pasted = pasteAnimatorPoseFromClipboard(
      {
        ...base,
        bones: base.bones.map((bone) =>
          bone.name === 'Head'
            ? { ...bone, restPosition: { x: 0, y: 0.8, z: 0 } }
            : bone
        ),
        shapeKeys: base.shapeKeys.map((shapeKey) =>
          shapeKey.id === 'sk_smile' ? { ...shapeKey, weight: 0 } : shapeKey
        ),
      },
      clipboard
    );

    expect(clipboard.sourceLabel).toBe('Face pose');
    expect(pasted.bones.find((bone) => bone.name === 'Head')?.restPosition).toEqual({
      x: 0.1,
      y: 1.2,
      z: 0.3,
    });
    expect(pasted.shapeKeys.find((shapeKey) => shapeKey.id === 'sk_smile')?.weight).toBeCloseTo(
      0.9,
      5
    );
  });

  it('pastes the current pose clipboard with blend and positional offset', () => {
    const base = createDefaultAnimatorEditorState('Hero');
    const clipboard = copyCurrentAnimatorPose(
      {
        ...base,
        bones: base.bones.map((bone) =>
          bone.name === 'Head'
            ? { ...bone, restPosition: { x: 0.4, y: 1.4, z: 0.2 } }
            : bone
        ),
        shapeKeys: base.shapeKeys.map((shapeKey) =>
          shapeKey.id === 'sk_smile' ? { ...shapeKey, weight: 1 } : shapeKey
        ),
      },
      'Offset pose'
    );
    const pasted = pasteAnimatorPoseFromClipboard(
      {
        ...base,
        bones: base.bones.map((bone) =>
          bone.name === 'Head'
            ? { ...bone, restPosition: { x: 0, y: 1, z: 0 } }
            : bone
        ),
        shapeKeys: base.shapeKeys.map((shapeKey) =>
          shapeKey.id === 'sk_smile' ? { ...shapeKey, weight: 0.2 } : shapeKey
        ),
      },
      clipboard,
      {
        blend: 0.5,
        offset: { x: 0.2, y: 0, z: -0.1 },
      }
    );

    expect(pasted.bones.find((bone) => bone.name === 'Head')?.restPosition.x).toBeCloseTo(0.3, 5);
    expect(pasted.bones.find((bone) => bone.name === 'Head')?.restPosition.y).toBeCloseTo(1.2, 5);
    expect(pasted.bones.find((bone) => bone.name === 'Head')?.restPosition.z).toBeCloseTo(0.05, 5);
    expect(pasted.shapeKeys.find((shapeKey) => shapeKey.id === 'sk_smile')?.weight).toBeCloseTo(
      0.6,
      5
    );
  });

  it('bakes the current pose into position and shape key tracks at the target time', () => {
    const state = createDefaultAnimatorEditorState('Hero');
    const baked = bakeCurrentAnimatorPoseToActiveClip(
      {
        ...state,
        bones: state.bones.map((bone) =>
          bone.name === 'Head'
            ? { ...bone, restPosition: { x: 0.15, y: 1.3, z: -0.05 } }
            : bone
        ),
        shapeKeys: state.shapeKeys.map((shapeKey) =>
          shapeKey.id === 'sk_smile' ? { ...shapeKey, weight: 0.65 } : shapeKey
        ),
      },
      0.5
    );
    const bakedClip = baked.clips[0];
    const headXTrack = bakedClip?.tracks.find(
      (track) => track.path === 'Rig/Head' && track.property === 'position.x'
    );
    const headYTrack = bakedClip?.tracks.find(
      (track) => track.path === 'Rig/Head' && track.property === 'position.y'
    );
    const smileTrack = bakedClip?.tracks.find(
      (track) => track.path === 'ShapeKeys' && track.property === 'shapeKey.sk_smile'
    );

    expect(headXTrack?.keyframes.some((keyframe) => keyframe.time === 0.5 && keyframe.value === 0.15)).toBe(true);
    expect(headYTrack?.keyframes.some((keyframe) => keyframe.time === 0.5 && keyframe.value === 1.3)).toBe(true);
    expect(smileTrack?.keyframes.some((keyframe) => keyframe.time === 0.5 && keyframe.value === 0.65)).toBe(true);
  });

  it('bakes the current pose through a range using the provided step', () => {
    const state = createDefaultAnimatorEditorState('Hero');
    const baked = bakeCurrentAnimatorPoseRangeToActiveClip(
      {
        ...state,
        bones: state.bones.map((bone) =>
          bone.name === 'Head'
            ? { ...bone, restPosition: { x: 0.2, y: 1.25, z: 0.1 } }
            : bone
        ),
      },
      0,
      0.5,
      0.25
    );
    const headXTrack = baked.clips[0]?.tracks.find(
      (track) => track.path === 'Rig/Head' && track.property === 'position.x'
    );
    const bakedTimes = headXTrack?.keyframes
      .filter((keyframe) => keyframe.value === 0.2)
      .map((keyframe) => keyframe.time);

    expect(bakedTimes).toEqual([0, 0.25, 0.5]);
  });

  it('retargets a foreign humanoid clip onto the current rig with compatible bone matching', () => {
    const state = withActiveClip(createDefaultAnimatorEditorState('Hero'), (clip) => ({
      ...clip,
      name: 'Imported Mixamo',
      tracks: [
        {
          id: 'foreign-root',
          name: 'mixamorigHips.position_y',
          path: 'Rig/mixamorigHips',
          property: 'position.y',
          type: 'position',
          color: '#22c55e',
          visible: true,
          locked: false,
          keyframes: [
            { id: 'fk-0', time: 0, value: 0, easing: 'linear' },
            { id: 'fk-1', time: 1, value: 1, easing: 'linear' },
          ],
        },
        {
          id: 'foreign-chest',
          name: 'mixamorigSpine2.rotation_z',
          path: 'Rig/mixamorigSpine2',
          property: 'rotation.z',
          type: 'rotation',
          color: '#3b82f6',
          visible: true,
          locked: false,
          keyframes: [
            { id: 'fc-0', time: 0, value: -4, easing: 'linear' },
            { id: 'fc-1', time: 1, value: 4, easing: 'linear' },
          ],
        },
        {
          id: 'foreign-arm',
          name: 'mixamorigLeftArm.rotation_z',
          path: 'Rig/mixamorigLeftArm',
          property: 'rotation.z',
          type: 'rotation',
          color: '#f59e0b',
          visible: true,
          locked: false,
          keyframes: [
            { id: 'fa-0', time: 0, value: -12, easing: 'linear' },
            { id: 'fa-1', time: 1, value: 12, easing: 'linear' },
          ],
        },
        {
          id: 'foreign-unknown',
          name: 'tentacle.wave',
          path: 'Rig/TentacleA',
          property: 'rotation.x',
          type: 'rotation',
          color: '#ec4899',
          visible: true,
          locked: false,
          keyframes: [{ id: 'ft-0', time: 0, value: 3, easing: 'linear' }],
        },
      ],
    }));

    const result = retargetActiveAnimationClipToCurrentRig(state);
    const retargetedClip = result.state.clips.find((clip) => clip.id === result.retargetedClipId);
    const retargetedPaths = retargetedClip?.tracks.map((track) => track.path);

    expect(result.retargetedClipId).toBeTruthy();
    expect(result.matchedTrackCount).toBe(3);
    expect(result.skippedTrackCount).toBe(1);
    expect(retargetedClip?.name).toContain('Retargeted');
    expect(retargetedPaths).toEqual(['Rig/Root', 'Rig/Chest', 'Rig/Arm_L']);
  });

  it('normalizes retargeted position tracks by target rig scale', () => {
    const tallRigState = withActiveClip(
      {
        ...createDefaultAnimatorEditorState('Hero'),
        bones: createDefaultAnimatorEditorState('Hero').bones.map((bone) => ({
          ...bone,
          restPosition: {
            x: bone.restPosition.x * 1.5,
            y: bone.restPosition.y * 1.5,
            z: bone.restPosition.z * 1.5,
          },
          length: bone.length * 1.5,
        })),
      },
      (clip) => ({
        ...clip,
        name: 'Imported Tall Motion',
        tracks: [
          {
            id: 'foreign-root-z',
            name: 'mixamorigHips.position_z',
            path: 'Rig/mixamorigHips',
            property: 'position.z',
            type: 'position',
            color: '#22c55e',
            visible: true,
            locked: false,
            keyframes: [
              { id: 'fk-0', time: 0, value: 0, easing: 'linear' },
              { id: 'fk-1', time: 1, value: 1, easing: 'linear' },
            ],
          },
        ],
      })
    );

    const result = retargetActiveAnimationClipToCurrentRig(tallRigState);
    const retargetedClip = result.state.clips.find((clip) => clip.id === result.retargetedClipId);
    const rootTrack = retargetedClip?.tracks.find(
      (track) => track.path === 'Rig/Root' && track.property === 'position.z'
    );

    expect(result.positionScale).toBeCloseTo(1.5, 1);
    expect(result.normalizedPositionTrackCount).toBe(1);
    expect(rootTrack?.keyframes[1]?.value).toBeCloseTo(1.5, 1);
  });
});
