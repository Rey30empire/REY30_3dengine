export type CharacterVec3 = { x: number; y: number; z: number };
export type CharacterFace = [number, number, number];
export type CharacterUv = { u: number; v: number };
export type CharacterTextureKind =
  | 'albedo'
  | 'normal'
  | 'roughness'
  | 'metallic'
  | 'ao'
  | 'emissive';

export type CharacterMeshData = {
  vertices: CharacterVec3[];
  faces: CharacterFace[];
  uvs: CharacterUv[];
  metadata: Record<string, unknown>;
};

export type CharacterRigBone = {
  name: string;
  parent: string | null;
  position: CharacterVec3;
};

export type CharacterBlendshape = {
  name: string;
  weight: number;
};

export type CharacterAnimationClip = {
  name: string;
  duration: number;
  loop: boolean;
};

export type CharacterTexture = {
  type: CharacterTextureKind;
  path: string;
  resolution: string;
};

export type CharacterMaterial = {
  id: string;
  label: string;
  domain: string;
  shader: string;
  doubleSided: boolean;
  properties: Record<string, unknown>;
  textureSlots: Partial<Record<CharacterTextureKind, string>>;
};

export type CharacterPackage = {
  mesh: CharacterMeshData;
  rig: { bones: CharacterRigBone[]; notes: string };
  blendshapes: CharacterBlendshape[];
  textures: CharacterTexture[];
  materials: CharacterMaterial[];
  animations: CharacterAnimationClip[];
  metadata: Record<string, unknown>;
};

export type CharacterPackageSummary = {
  vertexCount: number;
  triangleCount: number;
  rigBoneCount: number;
  blendshapeCount: number;
  textureCount: number;
  materialCount: number;
  animationCount: number;
  prompt: string | null;
  style: string | null;
  targetEngine: string | null;
  generatedAt: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function isVec3(value: unknown): value is CharacterVec3 {
  const record = asRecord(value);
  return Boolean(
    record &&
      typeof record.x === 'number' &&
      Number.isFinite(record.x) &&
      typeof record.y === 'number' &&
      Number.isFinite(record.y) &&
      typeof record.z === 'number' &&
      Number.isFinite(record.z)
  );
}

function isFace(value: unknown): value is CharacterFace {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((item) => typeof item === 'number' && Number.isInteger(item))
  );
}

function isUv(value: unknown): value is CharacterUv {
  const record = asRecord(value);
  return Boolean(
    record &&
      typeof record.u === 'number' &&
      Number.isFinite(record.u) &&
      typeof record.v === 'number' &&
      Number.isFinite(record.v)
  );
}

export function isCharacterPackage(value: unknown): value is CharacterPackage {
  const record = asRecord(value);
  if (!record) return false;

  const mesh = asRecord(record.mesh);
  const rig = asRecord(record.rig);
  const metadata = asRecord(record.metadata);

  return Boolean(
    mesh &&
      Array.isArray(mesh.vertices) &&
      mesh.vertices.every(isVec3) &&
      Array.isArray(mesh.faces) &&
      mesh.faces.every(isFace) &&
      Array.isArray(mesh.uvs) &&
      mesh.uvs.every(isUv) &&
      asRecord(mesh.metadata) &&
      rig &&
      Array.isArray(rig.bones) &&
      typeof rig.notes === 'string' &&
      Array.isArray(record.blendshapes) &&
      Array.isArray(record.textures) &&
      Array.isArray(record.materials) &&
      Array.isArray(record.animations) &&
      metadata
  );
}

export function summarizeCharacterPackage(pkg: CharacterPackage): CharacterPackageSummary {
  return {
    vertexCount: pkg.mesh.vertices.length,
    triangleCount: pkg.mesh.faces.length,
    rigBoneCount: pkg.rig.bones.length,
    blendshapeCount: pkg.blendshapes.length,
    textureCount: pkg.textures.length,
    materialCount: pkg.materials.length,
    animationCount: pkg.animations.length,
    prompt: typeof pkg.metadata.prompt === 'string' ? pkg.metadata.prompt : null,
    style: typeof pkg.metadata.style === 'string' ? pkg.metadata.style : null,
    targetEngine: typeof pkg.metadata.targetEngine === 'string' ? pkg.metadata.targetEngine : null,
    generatedAt: typeof pkg.metadata.generatedAt === 'string' ? pkg.metadata.generatedAt : null,
  };
}
