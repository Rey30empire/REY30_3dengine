import type {
  AnimationClip,
  BoneChannel,
  BoneChannelValue,
  BoneEditRange,
  BoneTrack,
  BoneTransform,
  ClipBlendRequest,
  CurveSample,
  Keyframe,
  Pose,
  Quaternion,
  Skeleton,
  TimelineRange,
  Vec3,
} from './types';
import {
  cloneClip,
  cloneQuaternion,
  cloneTransform,
  cloneVec3,
  createIdentityTransform,
  createPoseFromSkeleton,
} from './types';

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function sortKeyframes(track: BoneTrack) {
  track.keyframes.sort((left, right) => left.time - right.time);
}

function isQuaternion(value: BoneChannelValue): value is Quaternion {
  return typeof (value as Quaternion).w === 'number';
}

function lerpNumber(start: number, end: number, alpha: number) {
  return start + (end - start) * alpha;
}

function lerpVec3(start: Vec3, end: Vec3, alpha: number): Vec3 {
  return {
    x: lerpNumber(start.x, end.x, alpha),
    y: lerpNumber(start.y, end.y, alpha),
    z: lerpNumber(start.z, end.z, alpha),
  };
}

function normalizeQuaternion(value: Quaternion): Quaternion {
  const length = Math.hypot(value.x, value.y, value.z, value.w) || 1;
  return {
    x: value.x / length,
    y: value.y / length,
    z: value.z / length,
    w: value.w / length,
  };
}

function slerpQuaternion(start: Quaternion, end: Quaternion, alpha: number): Quaternion {
  let from = normalizeQuaternion(start);
  let to = normalizeQuaternion(end);
  let dot = from.x * to.x + from.y * to.y + from.z * to.z + from.w * to.w;

  if (dot < 0) {
    to = { x: -to.x, y: -to.y, z: -to.z, w: -to.w };
    dot = -dot;
  }

  if (dot > 0.9995) {
    return normalizeQuaternion({
      x: lerpNumber(from.x, to.x, alpha),
      y: lerpNumber(from.y, to.y, alpha),
      z: lerpNumber(from.z, to.z, alpha),
      w: lerpNumber(from.w, to.w, alpha),
    });
  }

  const theta0 = Math.acos(clamp(dot, -1, 1));
  const theta = theta0 * alpha;
  const sinTheta = Math.sin(theta);
  const sinTheta0 = Math.sin(theta0);
  const s0 = Math.cos(theta) - (dot * sinTheta) / sinTheta0;
  const s1 = sinTheta / sinTheta0;

  return normalizeQuaternion({
    x: s0 * from.x + s1 * to.x,
    y: s0 * from.y + s1 * to.y,
    z: s0 * from.z + s1 * to.z,
    w: s0 * from.w + s1 * to.w,
  });
}

export function interpolateKeyframes(
  left: Keyframe,
  right: Keyframe,
  channel: BoneChannel,
  time: number
): BoneChannelValue {
  if (left.interpolation === 'step' || left.time === right.time) {
    return JSON.parse(JSON.stringify(left.value));
  }

  const alpha = clamp((time - left.time) / (right.time - left.time), 0, 1);
  if (channel === 'rotation' && isQuaternion(left.value) && isQuaternion(right.value)) {
    return slerpQuaternion(left.value, right.value, alpha);
  }
  return lerpVec3(left.value as Vec3, right.value as Vec3, alpha);
}

function sampleTrack(track: BoneTrack, time: number): BoneChannelValue | null {
  if (track.keyframes.length === 0 || track.muted) return null;
  if (track.keyframes.length === 1 || time <= track.keyframes[0]!.time) {
    return JSON.parse(JSON.stringify(track.keyframes[0]!.value));
  }

  for (let index = 0; index < track.keyframes.length - 1; index += 1) {
    const left = track.keyframes[index]!;
    const right = track.keyframes[index + 1]!;
    if (time >= left.time && time <= right.time) {
      return interpolateKeyframes(left, right, track.channel, time);
    }
  }

  return JSON.parse(JSON.stringify(track.keyframes[track.keyframes.length - 1]!.value));
}

export function evaluatePose(
  skeleton: Skeleton,
  clip: AnimationClip,
  time: number,
  options?: { maskedBoneIds?: string[] }
): Pose {
  const pose = createPoseFromSkeleton(skeleton);
  const masked = new Set(options?.maskedBoneIds ?? []);
  const wrappedTime = clip.duration > 0 ? ((time % clip.duration) + clip.duration) % clip.duration : 0;

  clip.tracks.forEach((track) => {
    if (masked.size > 0 && !masked.has(track.boneId)) return;
    const sample = sampleTrack(track, wrappedTime);
    if (!sample) return;
    const transform = pose.transforms[track.boneId] ?? cloneTransform(createIdentityTransform());
    if (track.channel === 'translation') {
      transform.translation = cloneVec3(sample as Vec3);
    } else if (track.channel === 'rotation') {
      transform.rotation = cloneQuaternion(sample as Quaternion);
    } else {
      transform.scale = cloneVec3(sample as Vec3);
    }
    pose.transforms[track.boneId] = transform;
  });

  return pose;
}

export function blendPoses(
  basePose: Pose,
  overlayPose: Pose,
  weight: number,
  maskedBoneIds?: string[]
): Pose {
  const alpha = clamp(weight, 0, 1);
  const masked = new Set(maskedBoneIds ?? []);
  const result: Pose = {
    skeletonId: basePose.skeletonId,
    transforms: {},
  };

  const boneIds = new Set([
    ...Object.keys(basePose.transforms),
    ...Object.keys(overlayPose.transforms),
  ]);

  boneIds.forEach((boneId) => {
    const base = basePose.transforms[boneId] ?? createIdentityTransform();
    const overlay = overlayPose.transforms[boneId] ?? base;
    if (masked.size > 0 && !masked.has(boneId)) {
      result.transforms[boneId] = cloneTransform(base);
      return;
    }
    result.transforms[boneId] = {
      translation: lerpVec3(base.translation, overlay.translation, alpha),
      rotation: slerpQuaternion(base.rotation, overlay.rotation, alpha),
      scale: lerpVec3(base.scale, overlay.scale, alpha),
    };
  });

  return result;
}

export class TimelineController {
  currentTime = 0;
  zoom = 1;
  playbackRate = 1;
  isPlaying = false;
  selectedRange: TimelineRange | null = null;

  constructor(public duration: number, public frameRate: number) {}

  scrubTo(time: number) {
    this.currentTime = clamp(time, 0, this.duration);
    return this.currentTime;
  }

  setSelectionRange(range: TimelineRange | null) {
    this.selectedRange = range;
    return this.selectedRange;
  }

  advance(deltaSeconds: number) {
    if (!this.isPlaying) return this.currentTime;
    const next = this.currentTime + deltaSeconds * this.playbackRate;
    if (this.duration <= 0) {
      this.currentTime = 0;
      return this.currentTime;
    }
    this.currentTime = ((next % this.duration) + this.duration) % this.duration;
    return this.currentTime;
  }
}

export class UndoRedoStack<TSnapshot> {
  private past: TSnapshot[] = [];
  private future: TSnapshot[] = [];

  push(snapshot: TSnapshot) {
    this.past.push(JSON.parse(JSON.stringify(snapshot)) as TSnapshot);
    this.future = [];
  }

  undo(current: TSnapshot) {
    const previous = this.past.pop();
    if (!previous) return null;
    this.future.push(JSON.parse(JSON.stringify(current)) as TSnapshot);
    return JSON.parse(JSON.stringify(previous)) as TSnapshot;
  }

  redo(current: TSnapshot) {
    const next = this.future.pop();
    if (!next) return null;
    this.past.push(JSON.parse(JSON.stringify(current)) as TSnapshot);
    return JSON.parse(JSON.stringify(next)) as TSnapshot;
  }
}

export class AnimationPlayer {
  activeClipId: string | null = null;
  playing = false;
  playbackRate = 1;
  currentTime = 0;

  constructor(
    private readonly skeleton: Skeleton,
    private readonly clipLookup: () => Map<string, AnimationClip>
  ) {}

  play(clipId: string) {
    this.activeClipId = clipId;
    this.playing = true;
    this.currentTime = 0;
  }

  stop() {
    this.playing = false;
    this.currentTime = 0;
  }

  seek(time: number) {
    const clip = this.activeClipId ? this.clipLookup().get(this.activeClipId) ?? null : null;
    this.currentTime = clip ? clamp(time, 0, clip.duration) : 0;
    return this.currentTime;
  }

  update(deltaSeconds: number) {
    if (!this.playing || !this.activeClipId) return this.evaluateCurrentPose();
    const clip = this.clipLookup().get(this.activeClipId) ?? null;
    if (!clip) return createPoseFromSkeleton(this.skeleton);
    this.currentTime = clip.duration > 0
      ? ((this.currentTime + deltaSeconds * this.playbackRate) % clip.duration + clip.duration) % clip.duration
      : 0;
    return evaluatePose(this.skeleton, clip, this.currentTime);
  }

  evaluateCurrentPose() {
    const clip = this.activeClipId ? this.clipLookup().get(this.activeClipId) ?? null : null;
    return clip ? evaluatePose(this.skeleton, clip, this.currentTime) : createPoseFromSkeleton(this.skeleton);
  }
}

export class CurveEditor {
  sampleTrack(track: BoneTrack, duration: number, samples = 32): CurveSample[] {
    const resolvedSamples = Math.max(2, samples);
    return Array.from({ length: resolvedSamples }, (_unused, index) => {
      const time = duration <= 0 ? 0 : (index / (resolvedSamples - 1)) * duration;
      const value = sampleTrack(track, time);
      if (!value) return { time, value: 0 };
      if (isQuaternion(value)) {
        return { time, value: value.w };
      }
      return { time, value: value.y };
    });
  }
}

export class AnimationSerializer {
  static serializeClip(clip: AnimationClip) {
    return JSON.stringify(clip);
  }

  static deserializeClip(serialized: string): AnimationClip {
    return JSON.parse(serialized) as AnimationClip;
  }

  static serializeSession(params: {
    skeleton: Skeleton;
    clips: AnimationClip[];
    activeClipId: string | null;
  }) {
    return JSON.stringify(params);
  }
}

export class AnimationEditor {
  readonly timeline: TimelineController;
  readonly curveEditor = new CurveEditor();
  readonly history = new UndoRedoStack<AnimationClip>();
  readonly player: AnimationPlayer;
  readonly clips = new Map<string, AnimationClip>();
  selectedBoneIds: string[] = [];
  activeClipId: string | null = null;

  constructor(public readonly skeleton: Skeleton, initialClips: AnimationClip[] = []) {
    initialClips.forEach((clip) => this.clips.set(clip.id, cloneClip(clip)));
    const firstClip = initialClips[0] ? cloneClip(initialClips[0]) : null;
    this.activeClipId = firstClip?.id ?? null;
    this.timeline = new TimelineController(firstClip?.duration ?? 0, firstClip?.frameRate ?? 30);
    this.player = new AnimationPlayer(this.skeleton, () => this.clips);
    if (this.activeClipId) {
      this.player.play(this.activeClipId);
      this.timeline.scrubTo(0);
      this.timeline.isPlaying = false;
      this.player.stop();
    }
  }

  addClip(clip: AnimationClip) {
    this.clips.set(clip.id, cloneClip(clip));
    if (!this.activeClipId) {
      this.activeClipId = clip.id;
      this.timeline.duration = clip.duration;
      this.timeline.frameRate = clip.frameRate;
    }
  }

  getWorkingClip(clipId = this.activeClipId) {
    return clipId ? this.clips.get(clipId) ?? null : null;
  }

  selectBone(boneId: string, additive = false) {
    this.selectedBoneIds = additive
      ? Array.from(new Set([...this.selectedBoneIds, boneId]))
      : [boneId];
    return this.selectedBoneIds;
  }

  duplicateClip(sourceClipId: string, newName: string) {
    const source = this.getWorkingClip(sourceClipId);
    if (!source) return null;
    const duplicate = cloneClip(source);
    duplicate.id = crypto.randomUUID();
    duplicate.name = newName;
    duplicate.sourceClipId = source.id;
    this.addClip(duplicate);
    this.activeClipId = duplicate.id;
    this.timeline.duration = duplicate.duration;
    this.timeline.frameRate = duplicate.frameRate;
    return duplicate;
  }

  insertKeyframe(params: {
    clipId?: string;
    boneId: string;
    channel: BoneChannel;
    time: number;
    value: BoneChannelValue;
    interpolation?: Keyframe['interpolation'];
  }) {
    const clip = this.getWorkingClip(params.clipId);
    if (!clip) return null;
    this.history.push(clip);
    let track = clip.tracks.find(
      (entry) => entry.boneId === params.boneId && entry.channel === params.channel
    );
    if (!track) {
      track = {
        id: crypto.randomUUID(),
        boneId: params.boneId,
        channel: params.channel,
        keyframes: [],
      };
      clip.tracks.push(track);
    }

    track.keyframes.push({
      id: crypto.randomUUID(),
      time: params.time,
      value: JSON.parse(JSON.stringify(params.value)),
      interpolation: params.interpolation ?? (params.channel === 'rotation' ? 'slerp' : 'linear'),
    });
    sortKeyframes(track);
    return track;
  }

  deleteKeyframes(params: {
    clipId?: string;
    trackId: string;
    keyframeIds: string[];
  }) {
    const clip = this.getWorkingClip(params.clipId);
    if (!clip) return false;
    this.history.push(clip);
    clip.tracks = clip.tracks.map((track) =>
      track.id === params.trackId
        ? {
            ...track,
            keyframes: track.keyframes.filter((entry) => !params.keyframeIds.includes(entry.id)),
          }
        : track
    );
    return true;
  }

  moveKeyframe(params: {
    clipId?: string;
    trackId: string;
    keyframeId: string;
    nextTime: number;
  }) {
    const clip = this.getWorkingClip(params.clipId);
    if (!clip) return false;
    this.history.push(clip);
    clip.tracks.forEach((track) => {
      if (track.id !== params.trackId) return;
      track.keyframes = track.keyframes.map((entry) =>
        entry.id === params.keyframeId
          ? { ...entry, time: clamp(params.nextTime, 0, clip.duration) }
          : entry
      );
      sortKeyframes(track);
    });
    return true;
  }

  editBonesInRange(request: BoneEditRange) {
    const clip = this.getWorkingClip(request.clipId);
    if (!clip) return false;
    this.history.push(clip);
    const included = new Set(request.boneIds);

    clip.tracks.forEach((track) => {
      if (!included.has(track.boneId) || track.locked) return;
      track.keyframes = track.keyframes.map((keyframe) => {
        if (keyframe.time < request.range.start || keyframe.time > request.range.end) {
          return keyframe;
        }
        if (track.channel === 'translation' && request.translationOffset && !isQuaternion(keyframe.value)) {
          return {
            ...keyframe,
            value: {
              x: keyframe.value.x + (request.translationOffset.x ?? 0),
              y: keyframe.value.y + (request.translationOffset.y ?? 0),
              z: keyframe.value.z + (request.translationOffset.z ?? 0),
            },
          };
        }
        if (track.channel === 'rotation' && request.rotationOverride && isQuaternion(keyframe.value)) {
          return {
            ...keyframe,
            value: cloneQuaternion(request.rotationOverride),
          };
        }
        if (track.channel === 'scale' && request.scaleMultiplier && !isQuaternion(keyframe.value)) {
          return {
            ...keyframe,
            value: {
              x: keyframe.value.x * (request.scaleMultiplier.x ?? 1),
              y: keyframe.value.y * (request.scaleMultiplier.y ?? 1),
              z: keyframe.value.z * (request.scaleMultiplier.z ?? 1),
            },
          };
        }
        return keyframe;
      });
    });

    return true;
  }

  blendClipSegment(request: ClipBlendRequest) {
    const source = this.getWorkingClip(request.sourceClipId);
    const target = this.getWorkingClip(request.targetClipId);
    if (!source || !target) return false;
    this.history.push(target);

    const sourceTracks = source.tracks.filter((track) =>
      request.boneIds && request.boneIds.length > 0 ? request.boneIds.includes(track.boneId) : true
    );

    sourceTracks.forEach((sourceTrack) => {
      let targetTrack = target.tracks.find(
        (entry) =>
          entry.boneId === sourceTrack.boneId &&
          entry.channel === sourceTrack.channel
      );
      if (!targetTrack) {
        targetTrack = {
          id: crypto.randomUUID(),
          boneId: sourceTrack.boneId,
          channel: sourceTrack.channel,
          keyframes: [],
        };
        target.tracks.push(targetTrack);
      }

      const rangeDuration = request.sourceRange.end - request.sourceRange.start;
      const inserted = sourceTrack.keyframes
        .filter(
          (keyframe) =>
            keyframe.time >= request.sourceRange.start &&
            keyframe.time <= request.sourceRange.end
        )
        .map((keyframe) => ({
          ...keyframe,
          id: crypto.randomUUID(),
          time:
            request.destinationStartTime +
            (rangeDuration <= 0 ? 0 : keyframe.time - request.sourceRange.start),
          value: JSON.parse(JSON.stringify(keyframe.value)),
        }));

      targetTrack.keyframes = [
        ...targetTrack.keyframes.filter(
          (keyframe) =>
            keyframe.time < request.destinationStartTime ||
            keyframe.time > request.destinationStartTime + rangeDuration
        ),
        ...inserted,
      ];
      sortKeyframes(targetTrack);
    });

    target.sourceClipId = target.sourceClipId ?? request.targetClipId;
    return true;
  }

  saveAsNewClip(name: string) {
    const active = this.getWorkingClip();
    if (!active) return null;
    return this.duplicateClip(active.id, name);
  }

  evaluateCurrentPose(time = this.timeline.currentTime) {
    const clip = this.getWorkingClip();
    return clip ? evaluatePose(this.skeleton, clip, time) : createPoseFromSkeleton(this.skeleton);
  }

  undo() {
    const active = this.getWorkingClip();
    if (!active) return false;
    const previous = this.history.undo(active);
    if (!previous || !this.activeClipId) return false;
    this.clips.set(this.activeClipId, previous);
    return true;
  }

  redo() {
    const active = this.getWorkingClip();
    if (!active) return false;
    const next = this.history.redo(active);
    if (!next || !this.activeClipId) return false;
    this.clips.set(this.activeClipId, next);
    return true;
  }
}
