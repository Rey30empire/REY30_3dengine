import type { AnimationEditorTrack } from './animationEditorState';

export interface TimelineSelectionBox {
  startTime: number;
  endTime: number;
  startRow: number;
  endRow: number;
}

export function normalizeTimelineSelectionBox(box: TimelineSelectionBox): TimelineSelectionBox {
  return {
    startTime: Math.min(box.startTime, box.endTime),
    endTime: Math.max(box.startTime, box.endTime),
    startRow: Math.min(box.startRow, box.endRow),
    endRow: Math.max(box.startRow, box.endRow),
  };
}

export function collectTimelineSelectionKeyframeIds(
  tracks: AnimationEditorTrack[],
  box: TimelineSelectionBox
) {
  const normalized = normalizeTimelineSelectionBox(box);
  const selectedIds: string[] = [];
  tracks.forEach((track, rowIndex) => {
    if (rowIndex < normalized.startRow || rowIndex > normalized.endRow) {
      return;
    }
    track.keyframes.forEach((keyframe) => {
      if (
        keyframe.time >= normalized.startTime - 1e-6 &&
        keyframe.time <= normalized.endTime + 1e-6
      ) {
        selectedIds.push(keyframe.id);
      }
    });
  });
  return selectedIds;
}

export function buildTimelinePreviewMap(
  tracks: AnimationEditorTrack[],
  selectedKeyframeIds: Iterable<string>,
  deltaSeconds: number,
  duration: number
) {
  const selectedIds = new Set(selectedKeyframeIds);
  const preview = new Map<string, number>();
  tracks.forEach((track) => {
    track.keyframes.forEach((keyframe) => {
      preview.set(
        keyframe.id,
        selectedIds.has(keyframe.id)
          ? Math.max(0, Math.min(duration, keyframe.time + deltaSeconds))
          : keyframe.time
      );
    });
  });
  return preview;
}
