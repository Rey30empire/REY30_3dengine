export type Vec3 = { x: number; y: number; z: number };
export type Quaternion = { x: number; y: number; z: number; w: number };

export interface BoneTransform {
  translation: Vec3;
  rotation: Quaternion;
  scale: Vec3;
}

export interface Bone {
  id: string;
  name: string;
  parentId: string | null;
  restTransform: BoneTransform;
}

export interface Skeleton {
  id: string;
  name: string;
  bones: Bone[];
}

export interface Pose {
  skeletonId: string;
  transforms: Record<string, BoneTransform>;
}

export type BoneChannel = 'translation' | 'rotation' | 'scale';
export type KeyframeInterpolation = 'step' | 'linear' | 'slerp';
export type BoneChannelValue = Vec3 | Quaternion;

export interface Keyframe<TValue = BoneChannelValue> {
  id: string;
  time: number;
  value: TValue;
  interpolation: KeyframeInterpolation;
}

export interface BoneTrack {
  id: string;
  boneId: string;
  channel: BoneChannel;
  keyframes: Keyframe[];
  muted?: boolean;
  locked?: boolean;
}

export interface AnimationClip {
  id: string;
  name: string;
  duration: number;
  frameRate: number;
  tracks: BoneTrack[];
  sourceClipId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface TimelineRange {
  start: number;
  end: number;
}

export interface CurveSample {
  time: number;
  value: number;
}

export interface BoneEditRange {
  clipId: string;
  boneIds: string[];
  range: TimelineRange;
  translationOffset?: Partial<Vec3>;
  rotationOverride?: Quaternion;
  scaleMultiplier?: Partial<Vec3>;
}

export interface ClipBlendRequest {
  sourceClipId: string;
  targetClipId: string;
  destinationStartTime: number;
  sourceRange: TimelineRange;
  boneIds?: string[];
}

export function createVec3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

export function createQuaternion(x = 0, y = 0, z = 0, w = 1): Quaternion {
  return { x, y, z, w };
}

export function createIdentityTransform(): BoneTransform {
  return {
    translation: createVec3(),
    rotation: createQuaternion(),
    scale: createVec3(1, 1, 1),
  };
}

export function cloneVec3(value: Vec3): Vec3 {
  return { ...value };
}

export function cloneQuaternion(value: Quaternion): Quaternion {
  return { ...value };
}

export function cloneTransform(transform: BoneTransform): BoneTransform {
  return {
    translation: cloneVec3(transform.translation),
    rotation: cloneQuaternion(transform.rotation),
    scale: cloneVec3(transform.scale),
  };
}

export function cloneKeyframe<TValue>(keyframe: Keyframe<TValue>): Keyframe<TValue> {
  return {
    ...keyframe,
    value:
      typeof keyframe.value === 'object' && keyframe.value !== null
        ? JSON.parse(JSON.stringify(keyframe.value))
        : keyframe.value,
  };
}

export function cloneTrack(track: BoneTrack): BoneTrack {
  return {
    ...track,
    keyframes: track.keyframes.map((keyframe) => cloneKeyframe(keyframe)),
  };
}

export function cloneClip(clip: AnimationClip): AnimationClip {
  return {
    ...clip,
    metadata: clip.metadata ? { ...clip.metadata } : undefined,
    tracks: clip.tracks.map((track) => cloneTrack(track)),
  };
}

export function createPoseFromSkeleton(skeleton: Skeleton): Pose {
  return {
    skeletonId: skeleton.id,
    transforms: Object.fromEntries(
      skeleton.bones.map((bone) => [bone.id, cloneTransform(bone.restTransform)])
    ),
  };
}
