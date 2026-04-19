import { describe, expect, it } from 'vitest';

import {
  buildTimelinePreviewMap,
  collectTimelineSelectionKeyframeIds,
} from '@/engine/editor/animationTimelineInteractions';
import type { AnimationEditorTrack } from '@/engine/editor/animationEditorState';

const tracks: AnimationEditorTrack[] = [
  {
    id: 'track_root',
    name: 'Root.position.x',
    path: 'Rig/Root',
    property: 'position.x',
    type: 'position',
    color: '#38bdf8',
    visible: true,
    locked: false,
    keyframes: [
      { id: 'kf_a', time: 0.1, value: 0, easing: 'linear' },
      { id: 'kf_b', time: 0.8, value: 1, easing: 'linear' },
      { id: 'kf_c', time: 1.4, value: 2, easing: 'linear' },
    ],
  },
  {
    id: 'track_arm',
    name: 'Arm_L.rotation.z',
    path: 'Rig/Arm_L',
    property: 'rotation.z',
    type: 'rotation',
    color: '#f97316',
    visible: true,
    locked: false,
    keyframes: [
      { id: 'kf_d', time: 0.3, value: 0.1, easing: 'linear' },
      { id: 'kf_e', time: 1.1, value: 0.5, easing: 'linear' },
    ],
  },
];

describe('animation timeline interactions', () => {
  it('collects keyframes across time and row selection boxes', () => {
    const selection = collectTimelineSelectionKeyframeIds(tracks, {
      startTime: 0.2,
      endTime: 1.2,
      startRow: 0,
      endRow: 1,
    });

    expect(selection).toEqual(['kf_b', 'kf_d', 'kf_e']);
  });

  it('builds preview positions for dragged keyframes and clamps to clip duration', () => {
    const preview = buildTimelinePreviewMap(tracks, ['kf_b', 'kf_e'], 0.75, 1.5);

    expect(preview.get('kf_a')).toBeCloseTo(0.1, 5);
    expect(preview.get('kf_b')).toBeCloseTo(1.5, 5);
    expect(preview.get('kf_c')).toBeCloseTo(1.4, 5);
    expect(preview.get('kf_d')).toBeCloseTo(0.3, 5);
    expect(preview.get('kf_e')).toBeCloseTo(1.5, 5);
  });
});
