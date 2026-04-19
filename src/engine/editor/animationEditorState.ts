import { cloneEditableMesh, type EditableMesh, type EditableVec3 } from './modelerMesh';

export type AnimationEditorTrackType =
  | 'position'
  | 'rotation'
  | 'scale'
  | 'shapeKey'
  | 'custom';

export type AnimationEditorKeyframeValue =
  | number
  | { x: number; y: number; z: number }
  | { x: number; y: number; z: number; w: number };

export interface AnimationEditorKeyframe {
  id: string;
  time: number;
  value: AnimationEditorKeyframeValue;
  easing: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'bezier';
}

export interface AnimationEditorTrack {
  id: string;
  name: string;
  path: string;
  property: string;
  type: AnimationEditorTrackType;
  keyframes: AnimationEditorKeyframe[];
  color: string;
  visible: boolean;
  locked: boolean;
}

export interface AnimationEditorClip {
  id: string;
  name: string;
  duration: number;
  frameRate: number;
  tracks: AnimationEditorTrack[];
  isLooping: boolean;
}

export interface RigBone {
  id: string;
  name: string;
  parentId: string | null;
  restPosition: EditableVec3;
  length: number;
  locked?: boolean;
  visible?: boolean;
}

export interface RigIKChain {
  id: string;
  name: string;
  rootBoneId: string;
  midBoneId: string;
  endBoneId: string;
  target: EditableVec3;
  weight: number;
  enabled: boolean;
}

export interface RigConstraint {
  id: string;
  name: string;
  type: 'copy_rotation' | 'limit_rotation' | 'look_at';
  boneId: string;
  targetBoneId: string | null;
  influence: number;
  enabled: boolean;
}

export interface ShapeKeyTarget {
  id: string;
  name: string;
  category: 'boca' | 'ojos' | 'cejas' | 'misc';
  weight: number;
  muted?: boolean;
}

export interface NlaStrip {
  id: string;
  name: string;
  clipId: string;
  start: number;
  end: number;
  blendMode: 'replace' | 'add';
  muted: boolean;
}

export interface AnimatorPoseBoneSnapshot {
  boneId: string;
  restPosition: EditableVec3;
  length: number;
}

export interface AnimatorPoseShapeKeySnapshot {
  shapeKeyId: string;
  weight: number;
}

export interface AnimatorPoseLibraryEntry {
  id: string;
  name: string;
  createdAt: string;
  bones: AnimatorPoseBoneSnapshot[];
  shapeKeys: AnimatorPoseShapeKeySnapshot[];
}

export interface AnimationKeyframeClipboardKeyframe {
  timeOffset: number;
  value: AnimationEditorKeyframeValue;
  easing: AnimationEditorKeyframe['easing'];
}

export interface AnimationKeyframeClipboardTrack {
  trackId: string;
  name: string;
  path: string;
  property: string;
  type: AnimationEditorTrackType;
  color: string;
  keyframes: AnimationKeyframeClipboardKeyframe[];
}

export interface AnimationKeyframeClipboard {
  sourceClipId: string;
  sourceClipName: string;
  rangeStart: number;
  rangeEnd: number;
  tracks: AnimationKeyframeClipboardTrack[];
}

export interface AnimationPoseClipboard {
  sourceLabel: string;
  bones: AnimatorPoseBoneSnapshot[];
  shapeKeys: AnimatorPoseShapeKeySnapshot[];
}

export interface AnimationPosePasteOptions {
  blend?: number;
  offset?: Partial<EditableVec3> | null;
}

export interface AnimationRetargetResult {
  state: AnimatorEditorState;
  retargetedClipId: string | null;
  matchedTrackCount: number;
  skippedTrackCount: number;
  positionScale: number;
  normalizedPositionTrackCount: number;
}

export interface AnimatorEditorState {
  activeClipId: string | null;
  clips: AnimationEditorClip[];
  bones: RigBone[];
  ikChains: RigIKChain[];
  constraints: RigConstraint[];
  shapeKeys: ShapeKeyTarget[];
  nlaStrips: NlaStrip[];
  poseLibrary: AnimatorPoseLibraryEntry[];
  poseMode: boolean;
  activeBoneId: string | null;
}

const TRACK_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ec4899', '#a855f7'];

const DEFAULT_SHAPE_KEYS: ShapeKeyTarget[] = [
  { id: 'sk_smile', name: 'Smile', category: 'boca', weight: 0 },
  { id: 'sk_frown', name: 'Frown', category: 'boca', weight: 0 },
  { id: 'sk_blink_l', name: 'Blink_L', category: 'ojos', weight: 0 },
  { id: 'sk_blink_r', name: 'Blink_R', category: 'ojos', weight: 0 },
  { id: 'sk_brow_up', name: 'BrowUp', category: 'cejas', weight: 0 },
  { id: 'sk_jaw_open', name: 'JawOpen', category: 'boca', weight: 0 },
];

function estimateAnimatorRigHeight(bones: RigBone[]) {
  if (bones.length === 0) {
    return 1;
  }
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  bones.forEach((bone) => {
    minY = Math.min(minY, bone.restPosition.y);
    maxY = Math.max(maxY, bone.restPosition.y + bone.length);
  });
  return Math.max(0.1, maxY - minY);
}

const DEFAULT_HUMANOID_RIG_HEIGHT = estimateAnimatorRigHeight(buildDefaultHumanoidRig());

function clamp01(value: number | undefined, fallback = 0) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value ?? fallback)) : fallback;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseVec3(value: unknown, fallback: EditableVec3): EditableVec3 {
  const record = asRecord(value);
  return {
    x: Number(record?.x ?? fallback.x),
    y: Number(record?.y ?? fallback.y),
    z: Number(record?.z ?? fallback.z),
  };
}

function isKeyframeValue(value: unknown): value is AnimationEditorKeyframeValue {
  if (typeof value === 'number') return true;
  const record = asRecord(value);
  if (!record) return false;
  return (
    typeof record.x === 'number' &&
    typeof record.y === 'number' &&
    typeof record.z === 'number'
  );
}

function normalizeKeyframe(value: unknown, fallbackTime: number): AnimationEditorKeyframe | null {
  const record = asRecord(value);
  if (!record || !isKeyframeValue(record.value)) return null;
  return {
    id:
      typeof record.id === 'string' && record.id.trim().length > 0
        ? record.id
        : crypto.randomUUID(),
    time: Number.isFinite(record.time) ? Number(record.time) : fallbackTime,
    value: record.value,
    easing:
      record.easing === 'easeIn' ||
      record.easing === 'easeOut' ||
      record.easing === 'easeInOut' ||
      record.easing === 'bezier'
        ? record.easing
        : 'linear',
  };
}

function normalizeTrack(value: unknown, index: number): AnimationEditorTrack | null {
  const record = asRecord(value);
  if (!record) return null;
  const keyframes = Array.isArray(record.keyframes)
    ? record.keyframes
        .map((entry, keyframeIndex) => normalizeKeyframe(entry, keyframeIndex / 30))
        .filter((entry): entry is AnimationEditorKeyframe => Boolean(entry))
        .sort((left, right) => left.time - right.time)
    : [];

  return {
    id:
      typeof record.id === 'string' && record.id.trim().length > 0
        ? record.id
        : crypto.randomUUID(),
    name:
      typeof record.name === 'string' && record.name.trim().length > 0
        ? record.name
        : `Track_${index + 1}`,
    path:
      typeof record.path === 'string' && record.path.trim().length > 0
        ? record.path
        : 'Rig/Root',
    property:
      typeof record.property === 'string' && record.property.trim().length > 0
        ? record.property
        : 'position.y',
    type:
      record.type === 'rotation' ||
      record.type === 'scale' ||
      record.type === 'shapeKey' ||
      record.type === 'custom'
        ? record.type
        : 'position',
    keyframes,
    color:
      typeof record.color === 'string' && record.color.trim().length > 0
        ? record.color
        : TRACK_COLORS[index % TRACK_COLORS.length],
    visible: record.visible !== false,
    locked: record.locked === true,
  };
}

function normalizeClip(value: unknown, fallbackName: string): AnimationEditorClip | null {
  const record = asRecord(value);
  if (!record) return null;
  const tracks = Array.isArray(record.tracks)
    ? record.tracks
        .map((entry, index) => normalizeTrack(entry, index))
        .filter((entry): entry is AnimationEditorTrack => Boolean(entry))
    : [];

  return {
    id:
      typeof record.id === 'string' && record.id.trim().length > 0
        ? record.id
        : crypto.randomUUID(),
    name:
      typeof record.name === 'string' && record.name.trim().length > 0
        ? record.name
        : fallbackName,
    duration: Number.isFinite(record.duration) ? Math.max(0.1, Number(record.duration)) : 1.5,
    frameRate: Number.isFinite(record.frameRate) ? Math.max(1, Number(record.frameRate)) : 30,
    tracks,
    isLooping: record.isLooping === true,
  };
}

function normalizeBone(value: unknown, index: number): RigBone | null {
  const record = asRecord(value);
  if (!record) return null;
  const fallbackPosition = {
    x: 0,
    y: index * 0.35,
    z: 0,
  };

  return {
    id:
      typeof record.id === 'string' && record.id.trim().length > 0
        ? record.id
        : crypto.randomUUID(),
    name:
      typeof record.name === 'string' && record.name.trim().length > 0
        ? record.name
        : `Bone_${index + 1}`,
    parentId:
      typeof record.parentId === 'string' && record.parentId.trim().length > 0
        ? record.parentId
        : null,
    restPosition: parseVec3(record.restPosition, fallbackPosition),
    length: Number.isFinite(record.length) ? Math.max(0.05, Number(record.length)) : 0.35,
    locked: record.locked === true,
    visible: record.visible !== false,
  };
}

function normalizeShapeKey(value: unknown, index: number): ShapeKeyTarget | null {
  const record = asRecord(value);
  if (!record) return null;
  return {
    id:
      typeof record.id === 'string' && record.id.trim().length > 0
        ? record.id
        : crypto.randomUUID(),
    name:
      typeof record.name === 'string' && record.name.trim().length > 0
        ? record.name
        : `ShapeKey_${index + 1}`,
    category:
      record.category === 'boca' ||
      record.category === 'ojos' ||
      record.category === 'cejas'
        ? record.category
        : 'misc',
    weight: clamp01(Number(record.weight), 0),
    muted: record.muted === true,
  };
}

function normalizeIkChain(value: unknown): RigIKChain | null {
  const record = asRecord(value);
  if (!record) return null;
  if (
    typeof record.rootBoneId !== 'string' ||
    typeof record.midBoneId !== 'string' ||
    typeof record.endBoneId !== 'string'
  ) {
    return null;
  }
  return {
    id:
      typeof record.id === 'string' && record.id.trim().length > 0
        ? record.id
        : crypto.randomUUID(),
    name:
      typeof record.name === 'string' && record.name.trim().length > 0
        ? record.name
        : 'IK Chain',
    rootBoneId: record.rootBoneId,
    midBoneId: record.midBoneId,
    endBoneId: record.endBoneId,
    target: parseVec3(record.target, { x: 0, y: 1, z: 0 }),
    weight: clamp01(Number(record.weight), 1),
    enabled: record.enabled !== false,
  };
}

function normalizeConstraint(value: unknown): RigConstraint | null {
  const record = asRecord(value);
  if (!record || typeof record.boneId !== 'string') return null;
  return {
    id:
      typeof record.id === 'string' && record.id.trim().length > 0
        ? record.id
        : crypto.randomUUID(),
    name:
      typeof record.name === 'string' && record.name.trim().length > 0
        ? record.name
        : 'Constraint',
    type:
      record.type === 'limit_rotation' || record.type === 'look_at'
        ? record.type
        : 'copy_rotation',
    boneId: record.boneId,
    targetBoneId:
      typeof record.targetBoneId === 'string' && record.targetBoneId.trim().length > 0
        ? record.targetBoneId
        : null,
    influence: clamp01(Number(record.influence), 1),
    enabled: record.enabled !== false,
  };
}

function normalizeNlaStrip(value: unknown, clipIds: Set<string>): NlaStrip | null {
  const record = asRecord(value);
  if (!record || typeof record.clipId !== 'string' || !clipIds.has(record.clipId)) return null;
  return {
    id:
      typeof record.id === 'string' && record.id.trim().length > 0
        ? record.id
        : crypto.randomUUID(),
    name:
      typeof record.name === 'string' && record.name.trim().length > 0
        ? record.name
        : 'Strip',
    clipId: record.clipId,
    start: Number.isFinite(record.start) ? Math.max(0, Number(record.start)) : 0,
    end: Number.isFinite(record.end) ? Math.max(0.1, Number(record.end)) : 1,
    blendMode: record.blendMode === 'add' ? 'add' : 'replace',
    muted: record.muted === true,
  };
}

function normalizePoseLibraryEntry(value: unknown): AnimatorPoseLibraryEntry | null {
  const record = asRecord(value);
  if (!record) return null;
  const bones = Array.isArray(record.bones)
    ? record.bones
        .map((entry) => {
          const boneRecord = asRecord(entry);
          if (!boneRecord || typeof boneRecord.boneId !== 'string') {
            return null;
          }
          return {
            boneId: boneRecord.boneId,
            restPosition: parseVec3(boneRecord.restPosition, { x: 0, y: 0, z: 0 }),
            length: Number.isFinite(boneRecord.length) ? Math.max(0.05, Number(boneRecord.length)) : 0.25,
          };
        })
        .filter((entry): entry is AnimatorPoseBoneSnapshot => Boolean(entry))
    : [];
  const shapeKeys = Array.isArray(record.shapeKeys)
    ? record.shapeKeys
        .map((entry) => {
          const shapeKeyRecord = asRecord(entry);
          if (!shapeKeyRecord || typeof shapeKeyRecord.shapeKeyId !== 'string') {
            return null;
          }
          return {
            shapeKeyId: shapeKeyRecord.shapeKeyId,
            weight: clamp01(Number(shapeKeyRecord.weight), 0),
          };
        })
        .filter((entry): entry is AnimatorPoseShapeKeySnapshot => Boolean(entry))
    : [];

  return {
    id:
      typeof record.id === 'string' && record.id.trim().length > 0
        ? record.id
        : crypto.randomUUID(),
    name:
      typeof record.name === 'string' && record.name.trim().length > 0
        ? record.name
        : 'Pose',
    createdAt:
      typeof record.createdAt === 'string' && record.createdAt.trim().length > 0
        ? record.createdAt
        : new Date().toISOString(),
    bones,
    shapeKeys,
  };
}

export function buildDefaultHumanoidRig(): RigBone[] {
  const bones: Array<Omit<RigBone, 'id'>> = [
    { name: 'Root', parentId: null, restPosition: { x: 0, y: 0, z: 0 }, length: 0.25 },
    { name: 'Spine', parentId: 'Root', restPosition: { x: 0, y: 0.35, z: 0 }, length: 0.35 },
    { name: 'Chest', parentId: 'Spine', restPosition: { x: 0, y: 0.72, z: 0 }, length: 0.3 },
    { name: 'Head', parentId: 'Chest', restPosition: { x: 0, y: 1.05, z: 0 }, length: 0.22 },
    { name: 'Arm_L', parentId: 'Chest', restPosition: { x: -0.38, y: 0.82, z: 0 }, length: 0.36 },
    { name: 'Arm_R', parentId: 'Chest', restPosition: { x: 0.38, y: 0.82, z: 0 }, length: 0.36 },
    { name: 'Leg_L', parentId: 'Root', restPosition: { x: -0.18, y: -0.45, z: 0 }, length: 0.48 },
    { name: 'Leg_R', parentId: 'Root', restPosition: { x: 0.18, y: -0.45, z: 0 }, length: 0.48 },
  ];

  const ids = new Map<string, string>();
  bones.forEach((bone) => {
    ids.set(bone.name, crypto.randomUUID());
  });

  return bones.map((bone) => ({
    id: ids.get(bone.name)!,
    ...bone,
    parentId: bone.parentId ? ids.get(bone.parentId) ?? null : null,
    visible: true,
    locked: false,
  }));
}

function buildDefaultClip(entityName: string): AnimationEditorClip {
  return {
    id: crypto.randomUUID(),
    name: `${entityName}_Idle`,
    duration: 1.5,
    frameRate: 30,
    isLooping: true,
    tracks: [
      {
        id: crypto.randomUUID(),
        name: 'Root.PositionY',
        path: 'Rig/Root',
        property: 'position.y',
        type: 'position',
        color: TRACK_COLORS[0],
        visible: true,
        locked: false,
        keyframes: [
          { id: crypto.randomUUID(), time: 0, value: 0, easing: 'easeInOut' },
          { id: crypto.randomUUID(), time: 0.75, value: 0.06, easing: 'easeInOut' },
          { id: crypto.randomUUID(), time: 1.5, value: 0, easing: 'easeInOut' },
        ],
      },
      {
        id: crypto.randomUUID(),
        name: 'Chest.RotationZ',
        path: 'Rig/Chest',
        property: 'rotation.z',
        type: 'rotation',
        color: TRACK_COLORS[1],
        visible: true,
        locked: false,
        keyframes: [
          { id: crypto.randomUUID(), time: 0, value: -3, easing: 'linear' },
          { id: crypto.randomUUID(), time: 0.75, value: 3, easing: 'linear' },
          { id: crypto.randomUUID(), time: 1.5, value: -3, easing: 'linear' },
        ],
      },
    ],
  };
}

function createDefaultIkChains(bones: RigBone[]): RigIKChain[] {
  const byName = new Map(bones.map((bone) => [bone.name, bone.id]));
  const leftArm = byName.get('Arm_L');
  const chest = byName.get('Chest');
  const leftLeg = byName.get('Leg_L');
  const root = byName.get('Root');
  if (!leftArm || !chest || !leftLeg || !root) return [];
  return [
    {
      id: crypto.randomUUID(),
      name: 'Arm Reach',
      rootBoneId: chest,
      midBoneId: leftArm,
      endBoneId: leftArm,
      target: { x: -0.7, y: 0.9, z: 0.2 },
      weight: 1,
      enabled: true,
    },
    {
      id: crypto.randomUUID(),
      name: 'Foot Plant',
      rootBoneId: root,
      midBoneId: leftLeg,
      endBoneId: leftLeg,
      target: { x: -0.2, y: -0.95, z: 0.05 },
      weight: 1,
      enabled: true,
    },
  ];
}

function createDefaultConstraints(bones: RigBone[]): RigConstraint[] {
  const byName = new Map(bones.map((bone) => [bone.name, bone.id]));
  const head = byName.get('Head');
  const chest = byName.get('Chest');
  const armL = byName.get('Arm_L');
  const armR = byName.get('Arm_R');
  const entries: Array<RigConstraint | null> = [
    head && chest
      ? {
          id: crypto.randomUUID(),
          name: 'Head Look',
          type: 'look_at',
          boneId: head,
          targetBoneId: chest,
          influence: 0.65,
          enabled: true,
        }
      : null,
    armL && armR
      ? {
          id: crypto.randomUUID(),
          name: 'Arms Copy Rot',
          type: 'copy_rotation',
          boneId: armR,
          targetBoneId: armL,
          influence: 0.35,
          enabled: false,
        }
      : null,
  ];
  return entries.filter((entry): entry is RigConstraint => Boolean(entry));
}

export function createLibraryClip(name: string): AnimationEditorClip {
  const normalized = name.toLowerCase();
  if (normalized.includes('walk')) {
    return {
      id: crypto.randomUUID(),
      name,
      duration: 1.2,
      frameRate: 30,
      isLooping: true,
      tracks: [
        {
          id: crypto.randomUUID(),
          name: 'Root.PositionZ',
          path: 'Rig/Root',
          property: 'position.z',
          type: 'position',
          color: TRACK_COLORS[0],
          visible: true,
          locked: false,
          keyframes: [
            { id: crypto.randomUUID(), time: 0, value: 0, easing: 'linear' },
            { id: crypto.randomUUID(), time: 0.6, value: 0.5, easing: 'linear' },
            { id: crypto.randomUUID(), time: 1.2, value: 1, easing: 'linear' },
          ],
        },
      ],
    };
  }
  if (normalized.includes('run')) {
    return {
      id: crypto.randomUUID(),
      name,
      duration: 0.8,
      frameRate: 30,
      isLooping: true,
      tracks: [
        {
          id: crypto.randomUUID(),
          name: 'Root.PositionZ',
          path: 'Rig/Root',
          property: 'position.z',
          type: 'position',
          color: TRACK_COLORS[2],
          visible: true,
          locked: false,
          keyframes: [
            { id: crypto.randomUUID(), time: 0, value: 0, easing: 'linear' },
            { id: crypto.randomUUID(), time: 0.4, value: 0.8, easing: 'linear' },
            { id: crypto.randomUUID(), time: 0.8, value: 1.6, easing: 'linear' },
          ],
        },
      ],
    };
  }
  return buildDefaultClip(name);
}

export function createDefaultAnimatorEditorState(entityName: string): AnimatorEditorState {
  const bones = buildDefaultHumanoidRig();
  const clip = buildDefaultClip(entityName);
  return {
    activeClipId: clip.id,
    clips: [clip],
    bones,
    ikChains: createDefaultIkChains(bones),
    constraints: createDefaultConstraints(bones),
    shapeKeys: DEFAULT_SHAPE_KEYS.map((entry) => ({ ...entry })),
    nlaStrips: [
      {
        id: crypto.randomUUID(),
        name: `${clip.name}_Base`,
        clipId: clip.id,
        start: 0,
        end: clip.duration,
        blendMode: 'replace',
        muted: false,
      },
    ],
    poseLibrary: [],
    poseMode: true,
    activeBoneId: bones[1]?.id ?? null,
  };
}

export function normalizeAnimatorEditorState(
  rawData: unknown,
  entityName: string
): AnimatorEditorState {
  const record = asRecord(rawData);
  const editor = asRecord(record?.editor);
  if (!editor) {
    return createDefaultAnimatorEditorState(entityName);
  }

  const clips = Array.isArray(editor.clips)
    ? editor.clips
        .map((entry, index) => normalizeClip(entry, `${entityName}_Clip_${index + 1}`))
        .filter((entry): entry is AnimationEditorClip => Boolean(entry))
    : [];
  const normalizedClips = clips.length > 0 ? clips : createDefaultAnimatorEditorState(entityName).clips;
  const clipIds = new Set(normalizedClips.map((clip) => clip.id));
  const bones = Array.isArray(editor.bones)
    ? editor.bones
        .map((entry, index) => normalizeBone(entry, index))
        .filter((entry): entry is RigBone => Boolean(entry))
    : [];
  const normalizedBones = bones.length > 0 ? bones : buildDefaultHumanoidRig();

  return {
    activeClipId:
      typeof editor.activeClipId === 'string' && clipIds.has(editor.activeClipId)
        ? editor.activeClipId
        : normalizedClips[0]?.id ?? null,
    clips: normalizedClips,
    bones: normalizedBones,
    ikChains: Array.isArray(editor.ikChains)
      ? editor.ikChains
          .map((entry) => normalizeIkChain(entry))
          .filter((entry): entry is RigIKChain => Boolean(entry))
      : createDefaultIkChains(normalizedBones),
    constraints: Array.isArray(editor.constraints)
      ? editor.constraints
          .map((entry) => normalizeConstraint(entry))
          .filter((entry): entry is RigConstraint => Boolean(entry))
      : createDefaultConstraints(normalizedBones),
    shapeKeys: Array.isArray(editor.shapeKeys)
      ? editor.shapeKeys
          .map((entry, index) => normalizeShapeKey(entry, index))
          .filter((entry): entry is ShapeKeyTarget => Boolean(entry))
      : DEFAULT_SHAPE_KEYS.map((entry) => ({ ...entry })),
    nlaStrips: Array.isArray(editor.nlaStrips)
      ? editor.nlaStrips
          .map((entry) => normalizeNlaStrip(entry, clipIds))
          .filter((entry): entry is NlaStrip => Boolean(entry))
      : [],
    poseLibrary: Array.isArray(editor.poseLibrary)
      ? editor.poseLibrary
          .map((entry) => normalizePoseLibraryEntry(entry))
          .filter((entry): entry is AnimatorPoseLibraryEntry => Boolean(entry))
      : [],
    poseMode: editor.poseMode !== false,
    activeBoneId:
      typeof editor.activeBoneId === 'string' &&
      normalizedBones.some((bone) => bone.id === editor.activeBoneId)
        ? editor.activeBoneId
        : normalizedBones[0]?.id ?? null,
  };
}

export function serializeAnimatorEditorState(
  baseData: Record<string, unknown> | null | undefined,
  state: AnimatorEditorState
) {
  return {
    controllerId:
      typeof baseData?.controllerId === 'string' || baseData?.controllerId === null
        ? baseData.controllerId
        : null,
    currentAnimation:
      state.clips.find((clip) => clip.id === state.activeClipId)?.name ??
      (typeof baseData?.currentAnimation === 'string' ? baseData.currentAnimation : null),
    parameters:
      baseData?.parameters && typeof baseData.parameters === 'object'
        ? baseData.parameters
        : {},
    editor: {
      activeClipId: state.activeClipId,
      clips: state.clips,
      bones: state.bones,
      ikChains: state.ikChains,
      constraints: state.constraints,
      shapeKeys: state.shapeKeys,
      nlaStrips: state.nlaStrips,
      poseLibrary: state.poseLibrary,
      poseMode: state.poseMode,
      activeBoneId: state.activeBoneId,
    },
  };
}

function clampTime(value: number, duration: number) {
  return Math.max(0, Math.min(duration, value));
}

function cloneKeyframeValue(value: AnimationEditorKeyframeValue): AnimationEditorKeyframeValue {
  if (typeof value === 'number') {
    return value;
  }
  return { ...value };
}

function scaleKeyframeValue(
  value: AnimationEditorKeyframeValue,
  scale: number
): AnimationEditorKeyframeValue {
  if (typeof value === 'number') {
    return value * scale;
  }
  if ('w' in value) {
    return { ...value };
  }
  return {
    x: value.x * scale,
    y: value.y * scale,
    z: value.z * scale,
  };
}

function cloneKeyframe(keyframe: AnimationEditorKeyframe): AnimationEditorKeyframe {
  return {
    ...keyframe,
    id: crypto.randomUUID(),
    value: cloneKeyframeValue(keyframe.value),
  };
}

function cloneTrack(track: AnimationEditorTrack): AnimationEditorTrack {
  return {
    ...track,
    id: crypto.randomUUID(),
    keyframes: track.keyframes.map((keyframe) => cloneKeyframe(keyframe)),
  };
}

function sortTrackKeyframes(track: AnimationEditorTrack): AnimationEditorTrack {
  return {
    ...track,
    keyframes: [...track.keyframes].sort((left, right) => left.time - right.time),
  };
}

function updateActiveClipInState(
  state: AnimatorEditorState,
  updater: (clip: AnimationEditorClip) => AnimationEditorClip
) {
  const clipIndex = state.clips.findIndex((clip) => clip.id === state.activeClipId);
  if (clipIndex < 0) {
    return state;
  }
  const activeClip = state.clips[clipIndex];
  const nextClip = updater(activeClip);
  if (nextClip === activeClip) {
    return state;
  }
  const clips = [...state.clips];
  clips[clipIndex] = nextClip;
  return {
    ...state,
    clips,
  };
}

function buildDuplicatedClipName(state: AnimatorEditorState, clipName: string) {
  const existingNames = new Set(state.clips.map((clip) => clip.name));
  let candidate = `${clipName} Copy`;
  let suffix = 2;
  while (existingNames.has(candidate)) {
    candidate = `${clipName} Copy ${suffix}`;
    suffix += 1;
  }
  return candidate;
}

export function findActiveAnimatorClip(state: AnimatorEditorState): AnimationEditorClip | null {
  return state.clips.find((clip) => clip.id === state.activeClipId) ?? null;
}

export function findSelectedKeyframeTimeBounds(
  state: AnimatorEditorState,
  selectedKeyframeIds: Iterable<string>
) {
  const clip = findActiveAnimatorClip(state);
  if (!clip) {
    return null;
  }
  const selectedIds = new Set(selectedKeyframeIds);
  if (selectedIds.size === 0) {
    return null;
  }
  const times = clip.tracks.flatMap((track) =>
    track.keyframes
      .filter((keyframe) => selectedIds.has(keyframe.id))
      .map((keyframe) => keyframe.time)
  );
  if (times.length === 0) {
    return null;
  }
  return {
    start: Math.min(...times),
    end: Math.max(...times),
  };
}

export function clampSelectedKeyframeDelta(
  bounds: { start: number; end: number } | null,
  duration: number,
  deltaSeconds: number
) {
  if (!bounds) {
    return 0;
  }
  return Math.max(-bounds.start, Math.min(deltaSeconds, duration - bounds.end));
}

export function duplicateActiveAnimationClip(state: AnimatorEditorState): AnimatorEditorState {
  const clip = findActiveAnimatorClip(state);
  if (!clip) {
    return state;
  }
  const duplicatedClip: AnimationEditorClip = {
    ...clip,
    id: crypto.randomUUID(),
    name: buildDuplicatedClipName(state, clip.name),
    tracks: clip.tracks.map((track) => cloneTrack(track)),
  };
  return {
    ...state,
    activeClipId: duplicatedClip.id,
    clips: [...state.clips, duplicatedClip],
  };
}

export function reverseActiveAnimationClip(state: AnimatorEditorState): AnimatorEditorState {
  return updateActiveClipInState(state, (clip) => ({
    ...clip,
    tracks: clip.tracks.map((track) =>
      sortTrackKeyframes({
        ...track,
        keyframes: track.keyframes.map((keyframe) => ({
          ...keyframe,
          time: clampTime(clip.duration - keyframe.time, clip.duration),
          value: cloneKeyframeValue(keyframe.value),
        })),
      })
    ),
  }));
}

export function trimActiveAnimationClipToRange(
  state: AnimatorEditorState,
  startTime: number,
  endTime: number
): AnimatorEditorState {
  const clip = findActiveAnimatorClip(state);
  if (!clip) {
    return state;
  }
  const clampedStart = clampTime(Math.min(startTime, endTime), clip.duration);
  const clampedEnd = clampTime(Math.max(startTime, endTime), clip.duration);
  const nextDuration = Math.max(1 / clip.frameRate, clampedEnd - clampedStart);
  const nextState = updateActiveClipInState(state, (target) => ({
    ...target,
    duration: nextDuration,
    tracks: target.tracks.map((track) =>
      sortTrackKeyframes({
        ...track,
        keyframes: track.keyframes
          .filter(
            (keyframe) =>
              keyframe.time >= clampedStart - 1e-6 && keyframe.time <= clampedEnd + 1e-6
          )
          .map((keyframe) => ({
            ...keyframe,
            time: clampTime(keyframe.time - clampedStart, nextDuration),
            value: cloneKeyframeValue(keyframe.value),
          })),
      })
    ),
  }));
  return {
    ...nextState,
    nlaStrips: nextState.nlaStrips.map((strip) =>
      strip.clipId === clip.id
        ? {
            ...strip,
            end: strip.start + nextDuration,
          }
        : strip
    ),
  };
}

export function nudgeSelectedAnimationKeyframes(
  state: AnimatorEditorState,
  selectedKeyframeIds: Iterable<string>,
  deltaSeconds: number
): AnimatorEditorState {
  const clip = findActiveAnimatorClip(state);
  const bounds = findSelectedKeyframeTimeBounds(state, selectedKeyframeIds);
  if (!clip || !bounds) {
    return state;
  }
  const actualDelta = clampSelectedKeyframeDelta(bounds, clip.duration, deltaSeconds);
  if (Math.abs(actualDelta) < 1e-6) {
    return state;
  }
  const selectedIds = new Set(selectedKeyframeIds);
  return updateActiveClipInState(state, (target) => ({
    ...target,
    tracks: target.tracks.map((track) =>
      sortTrackKeyframes({
        ...track,
        keyframes: track.keyframes.map((keyframe) =>
          selectedIds.has(keyframe.id)
            ? {
                ...keyframe,
                time: clampTime(keyframe.time + actualDelta, target.duration),
                value: cloneKeyframeValue(keyframe.value),
              }
            : keyframe
        ),
      })
    ),
  }));
}

export function scaleSelectedAnimationKeyframes(
  state: AnimatorEditorState,
  selectedKeyframeIds: Iterable<string>,
  factor: number,
  pivotTime: number
): AnimatorEditorState {
  const clip = findActiveAnimatorClip(state);
  const bounds = findSelectedKeyframeTimeBounds(state, selectedKeyframeIds);
  if (!clip || !bounds || !Number.isFinite(factor) || factor <= 0) {
    return state;
  }
  const selectedIds = new Set(selectedKeyframeIds);
  if (selectedIds.size < 2) {
    return state;
  }
  const pivot = Math.max(bounds.start, Math.min(bounds.end, pivotTime));
  const leftSpan = pivot - bounds.start;
  const rightSpan = bounds.end - pivot;
  const maxGrowLeft = leftSpan > 1e-6 ? pivot / leftSpan : Number.POSITIVE_INFINITY;
  const maxGrowRight =
    rightSpan > 1e-6 ? (clip.duration - pivot) / rightSpan : Number.POSITIVE_INFINITY;
  const maxGrow = Math.min(maxGrowLeft, maxGrowRight);
  const effectiveFactor = factor > 1 ? Math.min(factor, maxGrow) : Math.max(0.05, factor);
  if (!Number.isFinite(effectiveFactor) || effectiveFactor <= 0) {
    return state;
  }
  return updateActiveClipInState(state, (target) => ({
    ...target,
    tracks: target.tracks.map((track) =>
      sortTrackKeyframes({
        ...track,
        keyframes: track.keyframes.map((keyframe) =>
          selectedIds.has(keyframe.id)
            ? {
                ...keyframe,
                time: clampTime(
                  pivot + (keyframe.time - pivot) * effectiveFactor,
                  target.duration
                ),
                value: cloneKeyframeValue(keyframe.value),
              }
            : keyframe
        ),
      })
    ),
  }));
}

export function offsetAnimationNlaStrip(
  state: AnimatorEditorState,
  stripId: string,
  deltaSeconds: number
): AnimatorEditorState {
  const strip = state.nlaStrips.find((entry) => entry.id === stripId);
  if (!strip) {
    return state;
  }
  const actualDelta = Math.max(-strip.start, deltaSeconds);
  if (Math.abs(actualDelta) < 1e-6) {
    return state;
  }
  return {
    ...state,
    nlaStrips: state.nlaStrips.map((entry) =>
      entry.id === stripId
        ? {
            ...entry,
            start: entry.start + actualDelta,
            end: entry.end + actualDelta,
          }
        : entry
    ),
  };
}

function buildNextPoseLibraryName(state: AnimatorEditorState) {
  const existingNames = new Set(state.poseLibrary.map((entry) => entry.name));
  let index = state.poseLibrary.length + 1;
  let candidate = `Pose ${index}`;
  while (existingNames.has(candidate)) {
    index += 1;
    candidate = `Pose ${index}`;
  }
  return candidate;
}

function clonePoseLibraryEntry(entry: AnimatorPoseLibraryEntry): AnimatorPoseLibraryEntry {
  return {
    ...entry,
    bones: entry.bones.map((bone) => ({
      ...bone,
      restPosition: { ...bone.restPosition },
    })),
    shapeKeys: entry.shapeKeys.map((shapeKey) => ({ ...shapeKey })),
  };
}

function buildTrackNameFromPath(path: string, property: string) {
  const segments = path.split('/');
  const leaf = segments[segments.length - 1] || path;
  return `${leaf}.${property.replace('.', '_')}`;
}

function inferTrackTypeFromProperty(property: string): AnimationEditorTrackType {
  if (property.startsWith('rotation.')) return 'rotation';
  if (property.startsWith('scale.')) return 'scale';
  if (property.startsWith('shapeKey.')) return 'shapeKey';
  if (property.startsWith('position.')) return 'position';
  return 'custom';
}

function normalizeBoneNameToken(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function inferHumanoidSlot(name: string):
  | 'root'
  | 'spine'
  | 'chest'
  | 'head'
  | 'arm_l'
  | 'arm_r'
  | 'leg_l'
  | 'leg_r'
  | 'hand_l'
  | 'hand_r'
  | null {
  const normalized = normalizeBoneNameToken(name);
  const isLeft =
    normalized.includes('left') ||
    normalized.endsWith('l') ||
    normalized.includes('arml') ||
    normalized.includes('legl') ||
    normalized.includes('handl');
  const isRight =
    normalized.includes('right') ||
    normalized.endsWith('r') ||
    normalized.includes('armr') ||
    normalized.includes('legr') ||
    normalized.includes('handr');

  if (
    normalized.includes('root') ||
    normalized.includes('hips') ||
    normalized.includes('pelvis')
  ) {
    return 'root';
  }
  if (
    normalized.includes('upperchest') ||
    normalized.includes('chest') ||
    normalized.includes('spine2')
  ) {
    return 'chest';
  }
  if (normalized.includes('spine')) {
    return 'spine';
  }
  if (normalized.includes('head') || normalized.includes('neck')) {
    return 'head';
  }
  if (normalized.includes('hand')) {
    return isLeft ? 'hand_l' : isRight ? 'hand_r' : null;
  }
  if (
    normalized.includes('arm') ||
    normalized.includes('shoulder') ||
    normalized.includes('upperarm') ||
    normalized.includes('lowerarm') ||
    normalized.includes('forearm')
  ) {
    return isLeft ? 'arm_l' : isRight ? 'arm_r' : null;
  }
  if (
    normalized.includes('leg') ||
    normalized.includes('thigh') ||
    normalized.includes('calf') ||
    normalized.includes('foot')
  ) {
    return isLeft ? 'leg_l' : isRight ? 'leg_r' : null;
  }
  return null;
}

function upsertTrackKeyframe(
  track: AnimationEditorTrack,
  time: number,
  value: AnimationEditorKeyframeValue,
  easing: AnimationEditorKeyframe['easing'] = 'linear'
): AnimationEditorTrack {
  const existingIndex = track.keyframes.findIndex((keyframe) => Math.abs(keyframe.time - time) < 1e-6);
  const keyframes = [...track.keyframes];
  if (existingIndex >= 0) {
    keyframes[existingIndex] = {
      ...keyframes[existingIndex],
      value: cloneKeyframeValue(value),
      easing,
    };
  } else {
    keyframes.push({
      id: crypto.randomUUID(),
      time,
      value: cloneKeyframeValue(value),
      easing,
    });
  }
  return sortTrackKeyframes({
    ...track,
    keyframes,
  });
}

function buildNextSplitClipName(state: AnimatorEditorState, clipName: string) {
  const existingNames = new Set(state.clips.map((clip) => clip.name));
  let index = 2;
  let candidate = `${clipName} Split ${index}`;
  while (existingNames.has(candidate)) {
    index += 1;
    candidate = `${clipName} Split ${index}`;
  }
  return candidate;
}

function buildRetargetedClipName(state: AnimatorEditorState, clipName: string) {
  const existingNames = new Set(state.clips.map((clip) => clip.name));
  let candidate = `${clipName} Retargeted`;
  let suffix = 2;
  while (existingNames.has(candidate)) {
    candidate = `${clipName} Retargeted ${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function buildTargetRigBoneLookup(bones: RigBone[]) {
  const byExact = new Map<string, RigBone>();
  const bySlot = new Map<string, RigBone>();
  bones.forEach((bone) => {
    byExact.set(normalizeBoneNameToken(bone.name), bone);
    const slot = inferHumanoidSlot(bone.name);
    if (slot && !bySlot.has(slot)) {
      bySlot.set(slot, bone);
    }
  });
  return {
    byExact,
    bySlot,
  };
}

export function saveCurrentAnimatorPoseToLibrary(
  state: AnimatorEditorState,
  requestedName?: string | null
): AnimatorEditorState {
  const nextName =
    typeof requestedName === 'string' && requestedName.trim().length > 0
      ? requestedName.trim()
      : buildNextPoseLibraryName(state);
  const nextEntry: AnimatorPoseLibraryEntry = {
    id: crypto.randomUUID(),
    name: nextName,
    createdAt: new Date().toISOString(),
    bones: state.bones.map((bone) => ({
      boneId: bone.id,
      restPosition: { ...bone.restPosition },
      length: bone.length,
    })),
    shapeKeys: state.shapeKeys.map((shapeKey) => ({
      shapeKeyId: shapeKey.id,
      weight: clamp01(shapeKey.weight, 0),
    })),
  };
  return {
    ...state,
    poseLibrary: [...state.poseLibrary, nextEntry],
  };
}

export function applyAnimatorPoseLibraryEntry(
  state: AnimatorEditorState,
  poseId: string
): AnimatorEditorState {
  const poseEntry = state.poseLibrary.find((entry) => entry.id === poseId);
  if (!poseEntry) {
    return state;
  }
  const pose = clonePoseLibraryEntry(poseEntry);
  const boneMap = new Map(pose.bones.map((bone) => [bone.boneId, bone]));
  const shapeKeyMap = new Map(pose.shapeKeys.map((shapeKey) => [shapeKey.shapeKeyId, shapeKey]));
  return {
    ...state,
    bones: state.bones.map((bone) => {
      const snapshot = boneMap.get(bone.id);
      return snapshot
        ? {
            ...bone,
            restPosition: { ...snapshot.restPosition },
            length: snapshot.length,
          }
        : bone;
    }),
    shapeKeys: state.shapeKeys.map((shapeKey) => {
      const snapshot = shapeKeyMap.get(shapeKey.id);
      return snapshot
        ? {
            ...shapeKey,
            weight: clamp01(snapshot.weight, 0),
          }
        : shapeKey;
    }),
  };
}

export function deleteAnimatorPoseLibraryEntry(
  state: AnimatorEditorState,
  poseId: string
): AnimatorEditorState {
  if (!state.poseLibrary.some((entry) => entry.id === poseId)) {
    return state;
  }
  return {
    ...state,
    poseLibrary: state.poseLibrary.filter((entry) => entry.id !== poseId),
  };
}

function findMirrorTokenPair(name: string) {
  const pairs: Array<[string, string]> = [
    ['_L', '_R'],
    ['_R', '_L'],
    ['.L', '.R'],
    ['.R', '.L'],
    [' left', ' right'],
    [' right', ' left'],
    ['_l', '_r'],
    ['_r', '_l'],
  ];
  for (const [from, to] of pairs) {
    if (name.includes(from)) {
      return {
        mirroredName: name.replace(from, to),
        directional: true,
      };
    }
  }
  return {
    mirroredName: name,
    directional: false,
  };
}

export function mirrorCurrentAnimatorPose(state: AnimatorEditorState): AnimatorEditorState {
  const bonesByName = new Map(state.bones.map((bone) => [bone.name, bone]));
  const nextBones = state.bones.map((bone) => {
    const mirrorInfo = findMirrorTokenPair(bone.name);
    if (!mirrorInfo.directional) {
      return bone;
    }
    const mirroredBone = bonesByName.get(mirrorInfo.mirroredName);
    if (!mirroredBone) {
      return bone;
    }
    return {
      ...bone,
      restPosition: {
        x: -mirroredBone.restPosition.x,
        y: mirroredBone.restPosition.y,
        z: mirroredBone.restPosition.z,
      },
      length: mirroredBone.length,
    };
  });

  const shapeKeysByName = new Map(state.shapeKeys.map((shapeKey) => [shapeKey.name, shapeKey]));
  const nextShapeKeys = state.shapeKeys.map((shapeKey) => {
    const mirrorInfo = findMirrorTokenPair(shapeKey.name);
    if (!mirrorInfo.directional) {
      return shapeKey;
    }
    const mirroredShapeKey = shapeKeysByName.get(mirrorInfo.mirroredName);
    if (!mirroredShapeKey) {
      return shapeKey;
    }
    return {
      ...shapeKey,
      weight: clamp01(mirroredShapeKey.weight, 0),
    };
  });

  return {
    ...state,
    bones: nextBones,
    shapeKeys: nextShapeKeys,
  };
}

export function copySelectedAnimationKeyframes(
  state: AnimatorEditorState,
  selectedKeyframeIds: Iterable<string>
): AnimationKeyframeClipboard | null {
  const clip = findActiveAnimatorClip(state);
  const bounds = findSelectedKeyframeTimeBounds(state, selectedKeyframeIds);
  if (!clip || !bounds) {
    return null;
  }
  const selectedIds = new Set(selectedKeyframeIds);
  const tracks = clip.tracks
    .map((track) => {
      const keyframes = track.keyframes
        .filter((keyframe) => selectedIds.has(keyframe.id))
        .map((keyframe) => ({
          timeOffset: keyframe.time - bounds.start,
          value: cloneKeyframeValue(keyframe.value),
          easing: keyframe.easing,
        }));
      if (keyframes.length === 0) {
        return null;
      }
      return {
        trackId: track.id,
        name: track.name,
        path: track.path,
        property: track.property,
        type: track.type,
        color: track.color,
        keyframes,
      };
    })
    .filter((track): track is AnimationKeyframeClipboardTrack => Boolean(track));
  if (tracks.length === 0) {
    return null;
  }
  return {
    sourceClipId: clip.id,
    sourceClipName: clip.name,
    rangeStart: bounds.start,
    rangeEnd: bounds.end,
    tracks,
  };
}

export function copyCurrentAnimatorPose(
  state: AnimatorEditorState,
  sourceLabel = 'Current Pose'
): AnimationPoseClipboard {
  return {
    sourceLabel,
    bones: state.bones.map((bone) => ({
      boneId: bone.id,
      restPosition: { ...bone.restPosition },
      length: bone.length,
    })),
    shapeKeys: state.shapeKeys.map((shapeKey) => ({
      shapeKeyId: shapeKey.id,
      weight: clamp01(shapeKey.weight, 0),
    })),
  };
}

export function pasteAnimatorPoseFromClipboard(
  state: AnimatorEditorState,
  clipboard: AnimationPoseClipboard | null | undefined,
  options?: AnimationPosePasteOptions
): AnimatorEditorState {
  if (!clipboard) {
    return state;
  }
  const blend = clamp01(options?.blend, 1);
  const offset = {
    x: Number(options?.offset?.x ?? 0),
    y: Number(options?.offset?.y ?? 0),
    z: Number(options?.offset?.z ?? 0),
  };
  const boneMap = new Map(clipboard.bones.map((bone) => [bone.boneId, bone]));
  const shapeKeyMap = new Map(clipboard.shapeKeys.map((shapeKey) => [shapeKey.shapeKeyId, shapeKey]));
  return {
    ...state,
    bones: state.bones.map((bone) => {
      const snapshot = boneMap.get(bone.id);
      return snapshot
        ? {
            ...bone,
            restPosition: {
              x: bone.restPosition.x + (snapshot.restPosition.x + offset.x - bone.restPosition.x) * blend,
              y: bone.restPosition.y + (snapshot.restPosition.y + offset.y - bone.restPosition.y) * blend,
              z: bone.restPosition.z + (snapshot.restPosition.z + offset.z - bone.restPosition.z) * blend,
            },
            length: bone.length + (snapshot.length - bone.length) * blend,
          }
        : bone;
    }),
    shapeKeys: state.shapeKeys.map((shapeKey) => {
      const snapshot = shapeKeyMap.get(shapeKey.id);
      return snapshot
        ? {
            ...shapeKey,
            weight: clamp01(shapeKey.weight + (snapshot.weight - shapeKey.weight) * blend, 0),
          }
        : shapeKey;
    }),
  };
}

export function pasteAnimationKeyframesIntoActiveClip(
  state: AnimatorEditorState,
  clipboard: AnimationKeyframeClipboard | null | undefined,
  targetTime: number
): AnimatorEditorState {
  const clip = findActiveAnimatorClip(state);
  if (!clip || !clipboard || clipboard.tracks.length === 0) {
    return state;
  }
  return updateActiveClipInState(state, (activeClip) => {
    const nextTracks = [...activeClip.tracks];
    clipboard.tracks.forEach((clipboardTrack) => {
      const trackIndex = nextTracks.findIndex(
        (track) =>
          track.id === clipboardTrack.trackId ||
          (track.path === clipboardTrack.path &&
            track.property === clipboardTrack.property &&
            track.type === clipboardTrack.type)
      );
      const targetTrack =
        trackIndex >= 0
          ? nextTracks[trackIndex]
          : {
              id: crypto.randomUUID(),
              name: clipboardTrack.name,
              path: clipboardTrack.path,
              property: clipboardTrack.property,
              type: clipboardTrack.type,
              color: clipboardTrack.color,
              visible: true,
              locked: false,
              keyframes: [],
            };
      const mergedTrack = sortTrackKeyframes({
        ...targetTrack,
        keyframes: [
          ...targetTrack.keyframes,
          ...clipboardTrack.keyframes.map((keyframe) => ({
            id: crypto.randomUUID(),
            time: clampTime(targetTime + keyframe.timeOffset, activeClip.duration),
            value: cloneKeyframeValue(keyframe.value),
            easing: keyframe.easing,
          })),
        ],
      });
      if (trackIndex >= 0) {
        nextTracks[trackIndex] = mergedTrack;
      } else {
        nextTracks.push(mergedTrack);
      }
    });
    return {
      ...activeClip,
      tracks: nextTracks,
    };
  });
}

export function splitActiveAnimationClipAtTime(
  state: AnimatorEditorState,
  splitTime: number
): AnimatorEditorState {
  const clip = findActiveAnimatorClip(state);
  if (!clip) {
    return state;
  }
  const clampedSplit = clampTime(splitTime, clip.duration);
  const minDuration = 1 / clip.frameRate;
  if (clampedSplit <= minDuration || clampedSplit >= clip.duration - minDuration) {
    return state;
  }
  const rightDuration = clip.duration - clampedSplit;
  const nextClipId = crypto.randomUUID();
  const rightClip: AnimationEditorClip = {
    ...clip,
    id: nextClipId,
    name: buildNextSplitClipName(state, clip.name),
    duration: rightDuration,
    tracks: clip.tracks.map((track) => ({
      ...track,
      id: crypto.randomUUID(),
      keyframes: track.keyframes
        .filter((keyframe) => keyframe.time >= clampedSplit - 1e-6)
        .map((keyframe) => ({
          ...keyframe,
          id: crypto.randomUUID(),
          time: clampTime(keyframe.time - clampedSplit, rightDuration),
          value: cloneKeyframeValue(keyframe.value),
        })),
    })),
  };
  const nextState = updateActiveClipInState(state, (activeClip) => ({
    ...activeClip,
    duration: clampedSplit,
    tracks: activeClip.tracks.map((track) =>
      sortTrackKeyframes({
        ...track,
        keyframes: track.keyframes
          .filter((keyframe) => keyframe.time <= clampedSplit + 1e-6)
          .map((keyframe) => ({
            ...keyframe,
            value: cloneKeyframeValue(keyframe.value),
          })),
      })
    ),
  }));
  const clips = [...nextState.clips, rightClip];
  return {
    ...nextState,
    activeClipId: rightClip.id,
    clips,
    nlaStrips: nextState.nlaStrips.map((strip) =>
      strip.clipId === clip.id
        ? {
            ...strip,
            end: strip.start + clampedSplit,
          }
        : strip
    ),
  };
}

export function bakeCurrentAnimatorPoseToActiveClip(
  state: AnimatorEditorState,
  time: number
): AnimatorEditorState {
  const clip = findActiveAnimatorClip(state);
  if (!clip) {
    return state;
  }
  const clampedTime = clampTime(time, clip.duration);
  return updateActiveClipInState(state, (activeClip) => {
    const trackEntries = [...activeClip.tracks];
    const ensureTrack = (
      path: string,
      property: string,
      valueType: AnimationEditorTrackType,
      color: string
    ) => {
      const existing = trackEntries.find(
        (track) => track.path === path && track.property === property && track.type === valueType
      );
      if (existing) {
        return existing;
      }
      const nextTrack: AnimationEditorTrack = {
        id: crypto.randomUUID(),
        name: buildTrackNameFromPath(path, property),
        path,
        property,
        type: valueType,
        color,
        visible: true,
        locked: false,
        keyframes: [],
      };
      trackEntries.push(nextTrack);
      return nextTrack;
    };

    state.bones.forEach((bone, boneIndex) => {
      const path = `Rig/${bone.name}`;
      const color = TRACK_COLORS[boneIndex % TRACK_COLORS.length];
      const properties: Array<[string, number]> = [
        ['position.x', bone.restPosition.x],
        ['position.y', bone.restPosition.y],
        ['position.z', bone.restPosition.z],
      ];
      properties.forEach(([property, value]) => {
        const track = ensureTrack(path, property, inferTrackTypeFromProperty(property), color);
        const bakedTrack = upsertTrackKeyframe(track, clampedTime, value);
        const index = trackEntries.findIndex((entry) => entry.id === track.id);
        trackEntries[index] = bakedTrack;
      });
    });

    state.shapeKeys.forEach((shapeKey) => {
      const property = `shapeKey.${shapeKey.id}`;
      const track = ensureTrack('ShapeKeys', property, 'shapeKey', '#ec4899');
      const bakedTrack = upsertTrackKeyframe(track, clampedTime, shapeKey.weight);
      const index = trackEntries.findIndex((entry) => entry.id === track.id);
      trackEntries[index] = bakedTrack;
    });

    return {
      ...activeClip,
      tracks: trackEntries.map((track) => sortTrackKeyframes(track)),
    };
  });
}

export function bakeCurrentAnimatorPoseRangeToActiveClip(
  state: AnimatorEditorState,
  startTime: number,
  endTime: number,
  stepSeconds?: number
): AnimatorEditorState {
  const clip = findActiveAnimatorClip(state);
  if (!clip) {
    return state;
  }
  const start = clampTime(Math.min(startTime, endTime), clip.duration);
  const end = clampTime(Math.max(startTime, endTime), clip.duration);
  const step =
    Number.isFinite(stepSeconds) && (stepSeconds ?? 0) > 0
      ? Number(stepSeconds)
      : 1 / clip.frameRate;
  if (Math.abs(end - start) < 1e-6) {
    return bakeCurrentAnimatorPoseToActiveClip(state, start);
  }
  let nextState = state;
  let cursor = start;
  let iterations = 0;
  while (cursor <= end + 1e-6 && iterations < 4096) {
    nextState = bakeCurrentAnimatorPoseToActiveClip(nextState, cursor);
    cursor += step;
    iterations += 1;
  }
  const bakedEnd = start + step * Math.max(0, iterations - 1);
  if (Math.abs(bakedEnd - end) > 1e-6) {
    nextState = bakeCurrentAnimatorPoseToActiveClip(nextState, end);
  }
  return nextState;
}

export function retargetActiveAnimationClipToCurrentRig(
  state: AnimatorEditorState
): AnimationRetargetResult {
  const clip = findActiveAnimatorClip(state);
  if (!clip) {
    return {
      state,
      retargetedClipId: null,
      matchedTrackCount: 0,
      skippedTrackCount: 0,
      positionScale: 1,
      normalizedPositionTrackCount: 0,
    };
  }
  const targetLookup = buildTargetRigBoneLookup(state.bones);
  const positionScale = estimateAnimatorRigHeight(state.bones) / DEFAULT_HUMANOID_RIG_HEIGHT;
  const retargetedTracks: AnimationEditorTrack[] = [];
  let matchedTrackCount = 0;
  let skippedTrackCount = 0;
  let normalizedPositionTrackCount = 0;

  clip.tracks.forEach((track) => {
    if (!track.path.startsWith('Rig/')) {
      const clonedTrack = cloneTrack(track);
      if (track.type === 'position' && Math.abs(positionScale - 1) > 1e-6) {
        clonedTrack.keyframes = clonedTrack.keyframes.map((keyframe) => ({
          ...keyframe,
          value: scaleKeyframeValue(keyframe.value, positionScale),
        }));
        normalizedPositionTrackCount += 1;
      }
      retargetedTracks.push(clonedTrack);
      matchedTrackCount += 1;
      return;
    }
    const sourceBoneName = track.path.split('/').pop() ?? track.path;
    const exactTarget = targetLookup.byExact.get(normalizeBoneNameToken(sourceBoneName)) ?? null;
    const slot = inferHumanoidSlot(sourceBoneName);
    const slotTarget = slot ? targetLookup.bySlot.get(slot) ?? null : null;
    const targetBone = exactTarget ?? slotTarget;
    if (!targetBone) {
      skippedTrackCount += 1;
      return;
    }
    const shouldScaleTrack = track.type === 'position' && Math.abs(positionScale - 1) > 1e-6;
    retargetedTracks.push({
      ...track,
      id: crypto.randomUUID(),
      name: buildTrackNameFromPath(`Rig/${targetBone.name}`, track.property),
      path: `Rig/${targetBone.name}`,
      keyframes: track.keyframes.map((keyframe) => ({
        ...keyframe,
        id: crypto.randomUUID(),
        value: shouldScaleTrack
          ? scaleKeyframeValue(keyframe.value, positionScale)
          : cloneKeyframeValue(keyframe.value),
      })),
    });
    if (shouldScaleTrack) {
      normalizedPositionTrackCount += 1;
    }
    matchedTrackCount += 1;
  });

  if (retargetedTracks.length === 0) {
    return {
      state,
      retargetedClipId: null,
      matchedTrackCount: 0,
      skippedTrackCount,
      positionScale,
      normalizedPositionTrackCount: 0,
    };
  }

  const retargetedClip: AnimationEditorClip = {
    ...clip,
    id: crypto.randomUUID(),
    name: buildRetargetedClipName(state, clip.name),
    tracks: retargetedTracks,
  };

  return {
    state: {
      ...state,
      activeClipId: retargetedClip.id,
      clips: [...state.clips, retargetedClip],
    },
    retargetedClipId: retargetedClip.id,
    matchedTrackCount,
    skippedTrackCount,
    positionScale,
    normalizedPositionTrackCount,
  };
}

function distance(a: EditableVec3, b: EditableVec3) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function normalizeWeights(values: number[]) {
  const total = values.reduce((sum, value) => sum + Math.max(0, value), 0);
  if (total <= 1e-6) {
    return values.map(() => 0);
  }
  return values.map((value) => Math.max(0, value) / total);
}

export function applyAutoWeightsFromRig(mesh: EditableMesh, bones: RigBone[]) {
  const next = cloneEditableMesh(mesh);
  if (bones.length === 0 || next.vertices.length === 0) {
    return next;
  }

  next.weightGroups = bones.map((bone) => bone.name);
  next.weights = next.vertices.map((vertex) => {
    const seeded = bones.map((bone) => {
      let score = 1 / Math.max(0.05, distance(vertex, bone.restPosition));
      if (bone.name.endsWith('_L') && vertex.x > 0) {
        score *= 0.15;
      }
      if (bone.name.endsWith('_R') && vertex.x < 0) {
        score *= 0.15;
      }
      if (bone.name === 'Head' && vertex.y < 0.4) {
        score *= 0.25;
      }
      if ((bone.name === 'Leg_L' || bone.name === 'Leg_R') && vertex.y > 0.35) {
        score *= 0.2;
      }
      if ((bone.name === 'Arm_L' || bone.name === 'Arm_R') && vertex.y < 0.15) {
        score *= 0.25;
      }
      return score;
    });
    return normalizeWeights(seeded);
  });

  return next;
}
