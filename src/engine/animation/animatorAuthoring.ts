import * as THREE from 'three';
import type { Entity, Quaternion as EngineQuaternion, TransformData, Vector3 } from '@/types/engine';
import {
  createDefaultAnimatorEditorState,
  normalizeAnimatorEditorState,
  serializeAnimatorEditorState,
  type AnimationEditorClip,
  type AnimationEditorKeyframe,
  type AnimationEditorKeyframeValue,
  type AnimationEditorTrack,
  type AnimatorEditorState,
  type RigBone,
} from '@/engine/editor/animationEditorState';
import {
  createIdentityTransform,
  createPoseFromSkeleton,
  evaluatePose,
  type AnimationClip as AuthoringClip,
  type BoneChannel,
  type BoneTrack,
  type Pose,
  type Quaternion,
  type Skeleton,
  type Vec3,
} from '@/engine/systems/animation-authoring';

type ParsedTrackBinding = {
  boneId: string;
  channel: BoneChannel;
  axis: 'x' | 'y' | 'z' | 'w' | null;
};

export type AnimatorAuthoringSource = 'editor' | 'defaulted';

export interface AnimatorAuthoringSummary {
  clipCount: number;
  trackCount: number;
  boneCount: number;
  ikChainCount: number;
  constraintCount: number;
  shapeKeyCount: number;
  nlaStripCount: number;
  timelineDuration: number;
  activeClipId: string | null;
  activeClipName: string | null;
  hasRootMotion: boolean;
}

export interface CompiledAnimatorAuthoring {
  source: AnimatorAuthoringSource;
  state: AnimatorEditorState;
  skeleton: Skeleton;
  clips: AuthoringClip[];
  clipLookup: Map<string, AuthoringClip>;
  restPose: Pose;
  rootBoneId: string | null;
  timelineDuration: number;
  summary: AnimatorAuthoringSummary;
}

export interface EvaluatedAnimatorTimeline {
  pose: Pose;
  time: number;
  duration: number;
  activeClipIds: string[];
  activeClipNames: string[];
  activeStripIds: string[];
  activeStripNames: string[];
  primaryClipId: string | null;
  primaryClipName: string | null;
}

export interface GeneratedAnimatorRecord {
  assetId: string;
  entityId: string;
  entityName: string;
  path: string;
  source: AnimatorAuthoringSource;
  state: AnimatorEditorState;
  summary: AnimatorAuthoringSummary;
}

const DEFAULT_POSITION: Vector3 = { x: 0, y: 0, z: 0 };
const DEFAULT_ROTATION: EngineQuaternion = { x: 0, y: 0, z: 0, w: 1 };
const DEFAULT_SCALE: Vector3 = { x: 1, y: 1, z: 1 };
const EPSILON = 1e-5;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function cloneVec3(value: Vec3): Vec3 {
  return { x: value.x, y: value.y, z: value.z };
}

function cloneQuaternion(value: Quaternion): Quaternion {
  return { x: value.x, y: value.y, z: value.z, w: value.w };
}

function lerpNumber(start: number, end: number, alpha: number) {
  return start + (end - start) * alpha;
}

function wrapTime(time: number, duration: number) {
  if (duration <= 0) return 0;
  return ((time % duration) + duration) % duration;
}

function sanitizeFileStem(value: string) {
  return (
    value
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 48) || 'animator'
  );
}

function toQuaternionFromEulerDegrees(euler: Vec3): Quaternion {
  const quaternion = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      THREE.MathUtils.degToRad(euler.x),
      THREE.MathUtils.degToRad(euler.y),
      THREE.MathUtils.degToRad(euler.z),
      'XYZ'
    )
  );
  return {
    x: quaternion.x,
    y: quaternion.y,
    z: quaternion.z,
    w: quaternion.w,
  };
}

function multiplyQuaternions(left: Quaternion, right: Quaternion): Quaternion {
  const result = new THREE.Quaternion(left.x, left.y, left.z, left.w).multiply(
    new THREE.Quaternion(right.x, right.y, right.z, right.w)
  );
  return {
    x: result.x,
    y: result.y,
    z: result.z,
    w: result.w,
  };
}

function invertQuaternion(value: Quaternion): Quaternion {
  const result = new THREE.Quaternion(value.x, value.y, value.z, value.w).invert();
  return {
    x: result.x,
    y: result.y,
    z: result.z,
    w: result.w,
  };
}

function slerpQuaternion(start: Quaternion, end: Quaternion, alpha: number): Quaternion {
  const from = new THREE.Quaternion(start.x, start.y, start.z, start.w);
  const to = new THREE.Quaternion(end.x, end.y, end.z, end.w);
  const result = new THREE.Quaternion();
  result.slerpQuaternions(from, to, alpha);
  return {
    x: result.x,
    y: result.y,
    z: result.z,
    w: result.w,
  };
}

function applyEasing(alpha: number, easing: AnimationEditorKeyframe['easing']) {
  const clamped = Math.max(0, Math.min(1, alpha));
  switch (easing) {
    case 'easeIn':
      return clamped * clamped;
    case 'easeOut':
      return 1 - (1 - clamped) * (1 - clamped);
    case 'easeInOut':
    case 'bezier':
      return clamped < 0.5
        ? 2 * clamped * clamped
        : 1 - Math.pow(-2 * clamped + 2, 2) / 2;
    default:
      return clamped;
  }
}

function isVec3Value(value: AnimationEditorKeyframeValue): value is Vec3 {
  return isRecord(value) && typeof (value as Record<string, unknown>).w !== 'number';
}

function isQuaternionValue(value: AnimationEditorKeyframeValue): value is Quaternion {
  return isRecord(value) && typeof (value as Record<string, unknown>).w === 'number';
}

function interpolateEditorValues(
  left: AnimationEditorKeyframeValue,
  right: AnimationEditorKeyframeValue,
  alpha: number
): AnimationEditorKeyframeValue {
  if (typeof left === 'number' && typeof right === 'number') {
    return lerpNumber(left, right, alpha);
  }

  if (isQuaternionValue(left) && isQuaternionValue(right)) {
    return slerpQuaternion(left, right, alpha);
  }

  if (isVec3Value(left) && isVec3Value(right)) {
    return {
      x: lerpNumber(left.x, right.x, alpha),
      y: lerpNumber(left.y, right.y, alpha),
      z: lerpNumber(left.z, right.z, alpha),
    };
  }

  return JSON.parse(JSON.stringify(left)) as AnimationEditorKeyframeValue;
}

function sampleEditorTrack(track: AnimationEditorTrack, time: number): AnimationEditorKeyframeValue | null {
  if (track.keyframes.length === 0) return null;
  if (track.keyframes.length === 1 || time <= track.keyframes[0]!.time) {
    return JSON.parse(JSON.stringify(track.keyframes[0]!.value)) as AnimationEditorKeyframeValue;
  }

  for (let index = 0; index < track.keyframes.length - 1; index += 1) {
    const left = track.keyframes[index]!;
    const right = track.keyframes[index + 1]!;
    if (time >= left.time && time <= right.time) {
      const alpha = right.time === left.time
        ? 0
        : applyEasing((time - left.time) / (right.time - left.time), right.easing);
      return interpolateEditorValues(left.value, right.value, alpha);
    }
  }

  return JSON.parse(
    JSON.stringify(track.keyframes[track.keyframes.length - 1]!.value)
  ) as AnimationEditorKeyframeValue;
}

function parseTrackBinding(track: AnimationEditorTrack, bonesByName: Map<string, RigBone>): ParsedTrackBinding | null {
  const property = track.property.trim();
  const channelPrefix = property.split('.')[0] ?? '';
  const channel: BoneChannel | null =
    track.type === 'position' || channelPrefix === 'position'
      ? 'translation'
      : track.type === 'rotation' || channelPrefix === 'rotation'
        ? 'rotation'
        : track.type === 'scale' || channelPrefix === 'scale'
          ? 'scale'
          : null;

  if (!channel) {
    return null;
  }

  const pathParts = track.path.split('/').filter(Boolean);
  const boneName = pathParts[pathParts.length - 1] ?? '';
  const bone = bonesByName.get(boneName);
  if (!bone) {
    return null;
  }

  const axisPart = property.split('.')[1] ?? null;
  const axis =
    axisPart === 'x' || axisPart === 'y' || axisPart === 'z' || axisPart === 'w'
      ? axisPart
      : null;

  return {
    boneId: bone.id,
    channel,
    axis,
  };
}

function collectTrackTimes(tracks: AnimationEditorTrack[]): number[] {
  return Array.from(
    new Set(
      tracks.flatMap((track) => track.keyframes.map((keyframe) => readNumber(keyframe.time, 0)))
    )
  ).sort((left, right) => left - right);
}

function defaultChannelValue(channel: BoneChannel, bone: RigBone): Vec3 | Quaternion {
  if (channel === 'translation') {
    return cloneVec3(bone.restPosition);
  }
  if (channel === 'scale') {
    return { x: 1, y: 1, z: 1 };
  }
  return { x: 0, y: 0, z: 0, w: 1 };
}

function resolveSampleAxisValue(
  track: AnimationEditorTrack,
  sampledValue: AnimationEditorKeyframeValue
): number | null {
  if (typeof sampledValue === 'number') {
    return sampledValue;
  }

  const propertyAxis = track.property.split('.')[1];
  if (propertyAxis === 'x' || propertyAxis === 'y' || propertyAxis === 'z' || propertyAxis === 'w') {
    const record = sampledValue as Record<string, unknown>;
    return readNumber(record[propertyAxis], 0);
  }

  return null;
}

function buildBoneTrack(
  clipId: string,
  bone: RigBone,
  channel: BoneChannel,
  tracks: AnimationEditorTrack[]
): BoneTrack | null {
  const times = collectTrackTimes(tracks);
  if (times.length === 0) {
    return null;
  }

  const fullTracks = tracks.filter((track) => track.property.split('.').length === 1);
  const axisTracks = {
    x: tracks.find((track) => track.property.endsWith('.x')) ?? null,
    y: tracks.find((track) => track.property.endsWith('.y')) ?? null,
    z: tracks.find((track) => track.property.endsWith('.z')) ?? null,
    w: tracks.find((track) => track.property.endsWith('.w')) ?? null,
  };

  const keyframes = times.map((time) => {
    const defaults = defaultChannelValue(channel, bone);

    if (channel === 'rotation') {
      const fullValue = fullTracks
        .map((track) => sampleEditorTrack(track, time))
        .find((value) => value !== null) ?? null;

      let quaternionValue: Quaternion | null = isQuaternionValue(fullValue as AnimationEditorKeyframeValue)
        ? cloneQuaternion(fullValue as Quaternion)
        : null;
      const eulerValue: Vec3 = isVec3Value(fullValue as AnimationEditorKeyframeValue)
        ? cloneVec3(fullValue as Vec3)
        : { x: 0, y: 0, z: 0 };

      (['x', 'y', 'z'] as const).forEach((axis) => {
        const sourceTrack = axisTracks[axis];
        if (!sourceTrack) return;
        const sampled = sampleEditorTrack(sourceTrack, time);
        if (sampled === null) return;
        const axisValue = resolveSampleAxisValue(sourceTrack, sampled);
        if (axisValue === null) return;
        eulerValue[axis] = axisValue;
      });

      if (!quaternionValue) {
        quaternionValue = toQuaternionFromEulerDegrees(eulerValue);
      }

      return {
        id: `${clipId}:${bone.id}:${channel}:${time.toFixed(4)}`,
        time,
        value: quaternionValue,
        interpolation: 'slerp' as const,
      };
    }

    const fullValue = fullTracks
      .map((track) => sampleEditorTrack(track, time))
      .find((value) => value !== null) ?? null;

    const vectorValue: Vec3 =
      isVec3Value(fullValue as AnimationEditorKeyframeValue)
        ? cloneVec3(fullValue as Vec3)
        : channel === 'scale'
          ? { x: 1, y: 1, z: 1 }
          : cloneVec3(defaults as Vec3);

    (['x', 'y', 'z'] as const).forEach((axis) => {
      const sourceTrack = axisTracks[axis];
      if (!sourceTrack) return;
      const sampled = sampleEditorTrack(sourceTrack, time);
      if (sampled === null) return;
      const axisValue = resolveSampleAxisValue(sourceTrack, sampled);
      if (axisValue === null) return;
      vectorValue[axis] = axisValue;
    });

    return {
      id: `${clipId}:${bone.id}:${channel}:${time.toFixed(4)}`,
      time,
      value: vectorValue,
      interpolation: 'linear' as const,
    };
  });

  return {
    id: `${clipId}:${bone.id}:${channel}`,
    boneId: bone.id,
    channel,
    keyframes,
  };
}

function buildSkeleton(state: AnimatorEditorState, entityName: string): Skeleton {
  return {
    id: `${entityName}:skeleton`,
    name: `${entityName} Skeleton`,
    bones: state.bones.map((bone) => ({
      id: bone.id,
      name: bone.name,
      parentId: bone.parentId,
      restTransform: {
        translation: cloneVec3(bone.restPosition),
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: { x: 1, y: 1, z: 1 },
      },
    })),
  };
}

function buildClips(state: AnimatorEditorState, skeleton: Skeleton): AuthoringClip[] {
  const bonesByName = new Map(state.bones.map((bone) => [bone.name, bone]));

  return state.clips.map((clip) => {
    const grouped = new Map<string, AnimationEditorTrack[]>();

    clip.tracks.forEach((track) => {
      const binding = parseTrackBinding(track, bonesByName);
      if (!binding) return;
      const key = `${binding.boneId}:${binding.channel}`;
      const current = grouped.get(key) ?? [];
      current.push(track);
      grouped.set(key, current);
    });

    const authoringTracks = Array.from(grouped.entries())
      .map(([key, tracks]) => {
        const [boneId, channel] = key.split(':') as [string, BoneChannel];
        const bone = state.bones.find((entry) => entry.id === boneId);
        if (!bone) return null;
        return buildBoneTrack(clip.id, bone, channel, tracks);
      })
      .filter((track): track is BoneTrack => Boolean(track));

    return {
      id: clip.id,
      name: clip.name,
      duration: clip.duration,
      frameRate: clip.frameRate,
      tracks: authoringTracks,
      metadata: {
        isLooping: clip.isLooping,
      },
    };
  });
}

function getActiveClip(state: AnimatorEditorState) {
  return state.clips.find((clip) => clip.id === state.activeClipId) ?? state.clips[0] ?? null;
}

function computeTimelineDuration(state: AnimatorEditorState) {
  const nlaDuration = state.nlaStrips.reduce((max, strip) => Math.max(max, strip.end), 0);
  if (nlaDuration > EPSILON) {
    return nlaDuration;
  }
  return Math.max(getActiveClip(state)?.duration ?? 0, 0.1);
}

function hasRootMotion(clipLookup: Map<string, AuthoringClip>, rootBoneId: string | null) {
  if (!rootBoneId) return false;
  return Array.from(clipLookup.values()).some((clip) =>
    clip.tracks.some(
      (track) => track.boneId === rootBoneId && track.channel === 'translation'
    )
  );
}

function applyAdditivePose(basePose: Pose, restPose: Pose, additivePose: Pose): Pose {
  const result: Pose = {
    skeletonId: basePose.skeletonId,
    transforms: {},
  };

  const boneIds = new Set([
    ...Object.keys(basePose.transforms),
    ...Object.keys(additivePose.transforms),
  ]);

  boneIds.forEach((boneId) => {
    const base = basePose.transforms[boneId] ?? createIdentityTransform();
    const rest = restPose.transforms[boneId] ?? createIdentityTransform();
    const additive = additivePose.transforms[boneId] ?? rest;
    const rotationDelta = multiplyQuaternions(invertQuaternion(rest.rotation), additive.rotation);

    result.transforms[boneId] = {
      translation: {
        x: base.translation.x + (additive.translation.x - rest.translation.x),
        y: base.translation.y + (additive.translation.y - rest.translation.y),
        z: base.translation.z + (additive.translation.z - rest.translation.z),
      },
      rotation: multiplyQuaternions(base.rotation, rotationDelta),
      scale: {
        x: base.scale.x * (Math.abs(rest.scale.x) > EPSILON ? additive.scale.x / rest.scale.x : 1),
        y: base.scale.y * (Math.abs(rest.scale.y) > EPSILON ? additive.scale.y / rest.scale.y : 1),
        z: base.scale.z * (Math.abs(rest.scale.z) > EPSILON ? additive.scale.z / rest.scale.z : 1),
      },
    };
  });

  return result;
}

export function createDefaultAnimatorComponentData(
  entityName: string,
  baseData?: Record<string, unknown> | null
) {
  return serializeAnimatorEditorState(
    {
      controllerId: null,
      currentAnimation: null,
      parameters: {},
      ...baseData,
    },
    createDefaultAnimatorEditorState(entityName)
  );
}

export function compileAnimatorAuthoring(
  rawData: unknown,
  entityName: string
): CompiledAnimatorAuthoring {
  const source: AnimatorAuthoringSource =
    isRecord(rawData) && isRecord(rawData.editor) ? 'editor' : 'defaulted';
  const state = normalizeAnimatorEditorState(rawData, entityName);
  const skeleton = buildSkeleton(state, entityName);
  const clips = buildClips(state, skeleton);
  const clipLookup = new Map(clips.map((clip) => [clip.id, clip]));
  const rootBoneId = state.bones[0]?.id ?? skeleton.bones[0]?.id ?? null;
  const timelineDuration = computeTimelineDuration(state);
  const restPose = createPoseFromSkeleton(skeleton);
  const activeClip = getActiveClip(state);

  return {
    source,
    state,
    skeleton,
    clips,
    clipLookup,
    restPose,
    rootBoneId,
    timelineDuration,
    summary: {
      clipCount: state.clips.length,
      trackCount: state.clips.reduce((count, clip) => count + clip.tracks.length, 0),
      boneCount: state.bones.length,
      ikChainCount: state.ikChains.length,
      constraintCount: state.constraints.length,
      shapeKeyCount: state.shapeKeys.length,
      nlaStripCount: state.nlaStrips.length,
      timelineDuration,
      activeClipId: activeClip?.id ?? null,
      activeClipName: activeClip?.name ?? null,
      hasRootMotion: hasRootMotion(clipLookup, rootBoneId),
    },
  };
}

export function evaluateCompiledAnimatorTimeline(
  compiled: CompiledAnimatorAuthoring,
  time: number
): EvaluatedAnimatorTimeline {
  const wrappedTime = wrapTime(time, compiled.timelineDuration);
  const hasNlaTimeline = compiled.state.nlaStrips.length > 0;
  const activeStrips = compiled.state.nlaStrips
    .filter((strip) => !strip.muted && wrappedTime >= strip.start && wrappedTime <= strip.end + EPSILON)
    .sort((left, right) => left.start - right.start);

  if (activeStrips.length > 0) {
    let pose = compiled.restPose;

    activeStrips.forEach((strip) => {
      const clip = compiled.clipLookup.get(strip.clipId);
      if (!clip) return;
      const localTime = wrapTime(wrappedTime - strip.start, clip.duration);
      const clipPose = evaluatePose(compiled.skeleton, clip, localTime);
      pose = strip.blendMode === 'add'
        ? applyAdditivePose(pose, compiled.restPose, clipPose)
        : clipPose;
    });

    const primaryClip = compiled.clipLookup.get(activeStrips[0]!.clipId) ?? null;
    return {
      pose,
      time: wrappedTime,
      duration: compiled.timelineDuration,
      activeClipIds: activeStrips.map((strip) => strip.clipId),
      activeClipNames: activeStrips
        .map((strip) => compiled.clipLookup.get(strip.clipId)?.name ?? null)
        .filter((name): name is string => Boolean(name)),
      activeStripIds: activeStrips.map((strip) => strip.id),
      activeStripNames: activeStrips.map((strip) => strip.name),
      primaryClipId: primaryClip?.id ?? null,
      primaryClipName: primaryClip?.name ?? null,
    };
  }

  if (hasNlaTimeline) {
    return {
      pose: compiled.restPose,
      time: wrappedTime,
      duration: compiled.timelineDuration,
      activeClipIds: [],
      activeClipNames: [],
      activeStripIds: [],
      activeStripNames: [],
      primaryClipId: null,
      primaryClipName: null,
    };
  }

  const activeClip = compiled.clipLookup.get(compiled.state.activeClipId ?? '') ?? compiled.clips[0] ?? null;
  if (!activeClip) {
    return {
      pose: compiled.restPose,
      time: 0,
      duration: compiled.timelineDuration,
      activeClipIds: [],
      activeClipNames: [],
      activeStripIds: [],
      activeStripNames: [],
      primaryClipId: null,
      primaryClipName: null,
    };
  }

  const localTime = wrapTime(wrappedTime, activeClip.duration);
  return {
    pose: evaluatePose(compiled.skeleton, activeClip, localTime),
    time: localTime,
    duration: compiled.timelineDuration,
    activeClipIds: [activeClip.id],
    activeClipNames: [activeClip.name],
    activeStripIds: [],
    activeStripNames: [],
    primaryClipId: activeClip.id,
    primaryClipName: activeClip.name,
  };
}

export function summarizeAnimatorAuthoring(summary: AnimatorAuthoringSummary) {
  const clipsLabel = `${summary.clipCount} clip${summary.clipCount === 1 ? '' : 's'}`;
  const nlaLabel = `${summary.nlaStripCount} NLA strip${summary.nlaStripCount === 1 ? '' : 's'}`;
  const rootMotionLabel = summary.hasRootMotion ? 'root motion' : 'pose only';
  return `${clipsLabel}, ${summary.trackCount} tracks, ${nlaLabel}, ${rootMotionLabel}`;
}

export function createGeneratedAnimatorRecord(entity: Entity): GeneratedAnimatorRecord | null {
  const animator = entity.components.get('Animator');
  if (!animator?.enabled || !isRecord(animator.data)) {
    return null;
  }

  const compiled = compileAnimatorAuthoring(animator.data, entity.name);
  const safeEntityName = sanitizeFileStem(entity.name || entity.id);
  return {
    assetId: `generated-animation-${entity.id}`,
    entityId: entity.id,
    entityName: entity.name,
    path: `generated-animation-${safeEntityName}-${entity.id}.json`,
    source: compiled.source,
    state: compiled.state,
    summary: compiled.summary,
  };
}

export function applyAnimatorPoseToTransform(
  authoredTransform: TransformData,
  rootRestTransform: Pose['transforms'][string] | undefined,
  rootPoseTransform: Pose['transforms'][string] | undefined
): TransformData {
  if (!rootRestTransform || !rootPoseTransform) {
    return {
      position: { ...authoredTransform.position },
      rotation: { ...authoredTransform.rotation },
      scale: { ...authoredTransform.scale },
    };
  }

  const positionDelta = {
    x: rootPoseTransform.translation.x - rootRestTransform.translation.x,
    y: rootPoseTransform.translation.y - rootRestTransform.translation.y,
    z: rootPoseTransform.translation.z - rootRestTransform.translation.z,
  };
  const rotationDelta = multiplyQuaternions(
    invertQuaternion(rootRestTransform.rotation),
    rootPoseTransform.rotation
  );
  const nextRotation = multiplyQuaternions(authoredTransform.rotation, rotationDelta);

  return {
    position: {
      x: authoredTransform.position.x + positionDelta.x,
      y: authoredTransform.position.y + positionDelta.y,
      z: authoredTransform.position.z + positionDelta.z,
    },
    rotation: nextRotation,
    scale: { ...authoredTransform.scale },
  };
}

export function normalizeRuntimeTransform(value: unknown): TransformData {
  const data = isRecord(value) ? value : {};
  return {
    position: {
      x: readNumber(data.position && isRecord(data.position) ? data.position.x : undefined, DEFAULT_POSITION.x),
      y: readNumber(data.position && isRecord(data.position) ? data.position.y : undefined, DEFAULT_POSITION.y),
      z: readNumber(data.position && isRecord(data.position) ? data.position.z : undefined, DEFAULT_POSITION.z),
    },
    rotation: {
      x: readNumber(data.rotation && isRecord(data.rotation) ? data.rotation.x : undefined, DEFAULT_ROTATION.x),
      y: readNumber(data.rotation && isRecord(data.rotation) ? data.rotation.y : undefined, DEFAULT_ROTATION.y),
      z: readNumber(data.rotation && isRecord(data.rotation) ? data.rotation.z : undefined, DEFAULT_ROTATION.z),
      w: readNumber(data.rotation && isRecord(data.rotation) ? data.rotation.w : undefined, DEFAULT_ROTATION.w),
    },
    scale: {
      x: readNumber(data.scale && isRecord(data.scale) ? data.scale.x : undefined, DEFAULT_SCALE.x),
      y: readNumber(data.scale && isRecord(data.scale) ? data.scale.y : undefined, DEFAULT_SCALE.y),
      z: readNumber(data.scale && isRecord(data.scale) ? data.scale.z : undefined, DEFAULT_SCALE.z),
    },
  };
}
