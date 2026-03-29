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

export interface AnimatorEditorState {
  activeClipId: string | null;
  clips: AnimationEditorClip[];
  bones: RigBone[];
  ikChains: RigIKChain[];
  constraints: RigConstraint[];
  shapeKeys: ShapeKeyTarget[];
  nlaStrips: NlaStrip[];
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
      poseMode: state.poseMode,
      activeBoneId: state.activeBoneId,
    },
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
