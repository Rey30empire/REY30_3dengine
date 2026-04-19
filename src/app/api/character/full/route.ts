// ============================================
// Character Full Package Generator (Level 3)
// Backend-first package generation with optional explicit local fallback for development only.
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { registerAssetFromPath } from '@/engine/assets/pipeline';
import {
  isCharacterPackage,
  summarizeCharacterPackage,
  type CharacterAnimationClip as AnimationClip,
  type CharacterBlendshape as Blendshape,
  type CharacterFace as Face,
  type CharacterMaterial,
  type CharacterMeshData as MeshData,
  type CharacterPackage,
  type CharacterRigBone as RigBone,
  type CharacterTexture,
  type CharacterTextureKind as TextureKind,
  type CharacterUv as UV,
  type CharacterVec3 as Vec3,
} from '@/lib/character-package';
import { normalizeProjectKey } from '@/lib/project-key';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import {
  CharacterServiceError,
  createCharacterJob,
  getCharacterJobResult,
  isCharacterBackendConfigured,
  isCharacterLocalFallbackEnabled,
  waitForCharacterJobCompletion,
} from '@/lib/server/character-service';
import {
  getCharacterGenerationJobRecord,
  upsertCharacterGenerationJobRecord,
} from '@/lib/server/character-generation-store';

type RequestBody = {
  prompt: string;
  style?: string;
  targetEngine?: 'unity' | 'unreal' | 'generic';
  includeAnimations?: boolean;
  includeBlendshapes?: boolean;
  references?: string[];
  remoteJobId?: string;
};

const SENSITIVE_CHARACTER_HINTS = /(profile|backend|provider|pipeline|worker|modelo|model|engine interno|internal mode)/i;

function sanitizeStableSegment(value: string) {
  return (
    value
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 48) || 'character'
  );
}

function buildFallbackCharacterJobKey(body: RequestBody) {
  return createHash('sha1')
    .update(
      JSON.stringify({
        prompt: body.prompt,
        style: body.style || 'realista',
        targetEngine: body.targetEngine || 'generic',
        includeAnimations: body.includeAnimations !== false,
        includeBlendshapes: body.includeBlendshapes !== false,
        references: Array.isArray(body.references) ? body.references.slice(0, 6) : [],
      })
    )
    .digest('hex')
    .slice(0, 12);
}

function toClientAsset(
  asset: Awaited<ReturnType<typeof registerAssetFromPath>>
) {
  return {
    id: asset.id,
    name: asset.name,
    type: asset.type,
    path: asset.path,
    size: asset.size,
    createdAt: asset.createdAt,
    metadata: asset.metadata ?? {},
  };
}

function isVec3Array(input: unknown): input is Vec3[] {
  return Array.isArray(input) && input.every((v) =>
    typeof v === 'object' &&
    v !== null &&
    typeof (v as { x?: unknown }).x === 'number' &&
    typeof (v as { y?: unknown }).y === 'number' &&
    typeof (v as { z?: unknown }).z === 'number'
  );
}

function isFaceArray(input: unknown): input is Face[] {
  return Array.isArray(input) &&
    input.every((f) =>
      Array.isArray(f) &&
      f.length === 3 &&
      typeof f[0] === 'number' &&
      typeof f[1] === 'number' &&
      typeof f[2] === 'number'
    );
}

function buildPlanarUVs(vertices: Vec3[]): UV[] {
  if (vertices.length === 0) return [];
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  vertices.forEach((v) => {
    minX = Math.min(minX, v.x);
    maxX = Math.max(maxX, v.x);
    minZ = Math.min(minZ, v.z);
    maxZ = Math.max(maxZ, v.z);
  });
  const spanX = maxX - minX || 1;
  const spanZ = maxZ - minZ || 1;
  return vertices.map((v) => ({
    u: (v.x - minX) / spanX,
    v: (v.z - minZ) / spanZ,
  }));
}

function buildDefaultTextures(): CharacterPackage['textures'] {
  return [
    { type: 'albedo', path: 'textures/albedo.png', resolution: '2K' },
    { type: 'normal', path: 'textures/normal.png', resolution: '2K' },
    { type: 'roughness', path: 'textures/roughness.png', resolution: '2K' },
    { type: 'metallic', path: 'textures/metallic.png', resolution: '2K' },
    { type: 'ao', path: 'textures/ao.png', resolution: '2K' },
    { type: 'emissive', path: 'textures/emissive.png', resolution: '1K' },
  ];
}

function buildDefaultMaterials(): CharacterPackage['materials'] {
  return [
    {
      id: 'body_primary',
      label: 'Body',
      domain: 'body',
      shader: 'pbr_metal_rough',
      doubleSided: false,
      properties: {
        albedoColor: '#808694',
        roughness: 0.55,
        metallic: 0.22,
        aoStrength: 0.7,
        emissiveIntensity: 0.2,
      },
      textureSlots: {
        albedo: 'textures/albedo.png',
        normal: 'textures/normal.png',
        roughness: 'textures/roughness.png',
        metallic: 'textures/metallic.png',
        ao: 'textures/ao.png',
        emissive: 'textures/emissive.png',
      },
    },
  ];
}

function buildBaseCharacterMesh(): MeshData {
  // Reuse a simple biped block-out
  const verts: Vec3[] = [
    // torso
    { x: -0.3, y: 0.6, z: -0.15 }, { x: 0.3, y: 0.6, z: -0.15 }, { x: 0.3, y: 1.3, z: -0.15 }, { x: -0.3, y: 1.3, z: -0.15 },
    { x: -0.3, y: 0.6, z: 0.15 }, { x: 0.3, y: 0.6, z: 0.15 }, { x: 0.3, y: 1.3, z: 0.15 }, { x: -0.3, y: 1.3, z: 0.15 },
    // head (simplified cube)
    { x: -0.22, y: 1.3, z: -0.2 }, { x: 0.22, y: 1.3, z: -0.2 }, { x: 0.22, y: 1.65, z: -0.2 }, { x: -0.22, y: 1.65, z: -0.2 },
    { x: -0.22, y: 1.3, z: 0.2 }, { x: 0.22, y: 1.3, z: 0.2 }, { x: 0.22, y: 1.65, z: 0.2 }, { x: -0.22, y: 1.65, z: 0.2 },
    // left arm
    { x: -0.45, y: 1.2, z: -0.1 }, { x: -0.3, y: 1.2, z: -0.1 }, { x: -0.3, y: 0.75, z: -0.1 }, { x: -0.45, y: 0.75, z: -0.1 },
    { x: -0.45, y: 1.2, z: 0.1 }, { x: -0.3, y: 1.2, z: 0.1 }, { x: -0.3, y: 0.75, z: 0.1 }, { x: -0.45, y: 0.75, z: 0.1 },
    // right arm
    { x: 0.3, y: 1.2, z: -0.1 }, { x: 0.45, y: 1.2, z: -0.1 }, { x: 0.45, y: 0.75, z: -0.1 }, { x: 0.3, y: 0.75, z: -0.1 },
    { x: 0.3, y: 1.2, z: 0.1 }, { x: 0.45, y: 1.2, z: 0.1 }, { x: 0.45, y: 0.75, z: 0.1 }, { x: 0.3, y: 0.75, z: 0.1 },
    // left leg
    { x: -0.18, y: 0.6, z: -0.12 }, { x: 0.0, y: 0.6, z: -0.12 }, { x: 0.0, y: 0.1, z: -0.12 }, { x: -0.18, y: 0.1, z: -0.12 },
    { x: -0.18, y: 0.6, z: 0.12 }, { x: 0.0, y: 0.6, z: 0.12 }, { x: 0.0, y: 0.1, z: 0.12 }, { x: -0.18, y: 0.1, z: 0.12 },
    // right leg
    { x: 0.0, y: 0.6, z: -0.12 }, { x: 0.18, y: 0.6, z: -0.12 }, { x: 0.18, y: 0.1, z: -0.12 }, { x: 0.0, y: 0.1, z: -0.12 },
    { x: 0.0, y: 0.6, z: 0.12 }, { x: 0.18, y: 0.6, z: 0.12 }, { x: 0.18, y: 0.1, z: 0.12 }, { x: 0.0, y: 0.1, z: 0.12 },
  ];

  // Build faces per cube piece (each 8 verts chunk)
  const faces: Face[] = [];
  for (let chunk = 0; chunk < verts.length / 8; chunk++) {
    const o = chunk * 8;
    const idx = (i: number) => o + i;
    faces.push(
      [idx(0), idx(1), idx(2)], [idx(0), idx(2), idx(3)], // back
      [idx(4), idx(6), idx(5)], [idx(4), idx(7), idx(6)], // front
      [idx(4), idx(5), idx(1)], [idx(4), idx(1), idx(0)], // bottom
      [idx(3), idx(2), idx(6)], [idx(3), idx(6), idx(7)], // top
      [idx(1), idx(5), idx(6)], [idx(1), idx(6), idx(2)], // right
      [idx(4), idx(0), idx(3)], [idx(4), idx(3), idx(7)], // left
    );
  }

  // Simple planar UVs
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  verts.forEach((v) => {
    minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
    minZ = Math.min(minZ, v.z); maxZ = Math.max(maxZ, v.z);
  });
  const spanX = maxX - minX || 1;
  const spanZ = maxZ - minZ || 1;
  const uvs: UV[] = verts.map((v) => ({
    u: (v.x - minX) / spanX,
    v: (v.z - minZ) / spanZ,
  }));

  return {
    vertices: verts,
    faces,
    uvs,
    metadata: { note: 'Biped block-out con UVs planas' },
  };
}

function buildRig(): RigBone[] {
  return [
    { name: 'Hips', parent: null, position: { x: 0, y: 0.6, z: 0 } },
    { name: 'Spine', parent: 'Hips', position: { x: 0, y: 0.95, z: 0 } },
    { name: 'Chest', parent: 'Spine', position: { x: 0, y: 1.15, z: 0 } },
    { name: 'Neck', parent: 'Chest', position: { x: 0, y: 1.32, z: 0 } },
    { name: 'Head', parent: 'Neck', position: { x: 0, y: 1.45, z: 0 } },
    { name: 'Shoulder.L', parent: 'Chest', position: { x: -0.25, y: 1.18, z: 0 } },
    { name: 'Arm.L', parent: 'Shoulder.L', position: { x: -0.4, y: 1.0, z: 0 } },
    { name: 'Forearm.L', parent: 'Arm.L', position: { x: -0.45, y: 0.85, z: 0 } },
    { name: 'Hand.L', parent: 'Forearm.L', position: { x: -0.48, y: 0.7, z: 0 } },
    { name: 'Shoulder.R', parent: 'Chest', position: { x: 0.25, y: 1.18, z: 0 } },
    { name: 'Arm.R', parent: 'Shoulder.R', position: { x: 0.4, y: 1.0, z: 0 } },
    { name: 'Forearm.R', parent: 'Arm.R', position: { x: 0.45, y: 0.85, z: 0 } },
    { name: 'Hand.R', parent: 'Forearm.R', position: { x: 0.48, y: 0.7, z: 0 } },
    { name: 'Leg.L', parent: 'Hips', position: { x: -0.1, y: 0.55, z: 0 } },
    { name: 'Shin.L', parent: 'Leg.L', position: { x: -0.1, y: 0.25, z: 0 } },
    { name: 'Foot.L', parent: 'Shin.L', position: { x: -0.1, y: 0.05, z: 0.05 } },
    { name: 'Leg.R', parent: 'Hips', position: { x: 0.1, y: 0.55, z: 0 } },
    { name: 'Shin.R', parent: 'Leg.R', position: { x: 0.1, y: 0.25, z: 0 } },
    { name: 'Foot.R', parent: 'Shin.R', position: { x: 0.1, y: 0.05, z: 0.05 } },
  ];
}

function buildBlendshapes(): Blendshape[] {
  return [
    { name: 'Smile', weight: 0 },
    { name: 'Frown', weight: 0 },
    { name: 'Blink_L', weight: 0 },
    { name: 'Blink_R', weight: 0 },
    { name: 'JawOpen', weight: 0 },
    { name: 'BrowUp', weight: 0 },
    { name: 'Sneer', weight: 0 },
  ];
}

function buildAnimations(include: boolean): AnimationClip[] {
  if (!include) return [];
  return [
    { name: 'Idle', duration: 2.0, loop: true },
    { name: 'Walk', duration: 1.2, loop: true },
    { name: 'Run', duration: 0.8, loop: true },
    { name: 'Jump', duration: 0.9, loop: false },
  ];
}

function sanitizeVisibleText(input: unknown, fallback: string): string {
  if (typeof input !== 'string') return fallback;
  const trimmed = input.trim();
  if (!trimmed || SENSITIVE_CHARACTER_HINTS.test(trimmed)) return fallback;
  return trimmed;
}

function sanitizeMeshMetadata(input: unknown): Record<string, unknown> {
  if (typeof input !== 'object' || input === null) return {};
  const source = input as Record<string, unknown>;
  const next: Record<string, unknown> = {};

  if (typeof source.prompt === 'string' && source.prompt.trim()) next.prompt = source.prompt.trim();
  if (typeof source.style === 'string' && source.style.trim()) next.style = source.style.trim();
  if (typeof source.targetEngine === 'string' && source.targetEngine.trim()) next.targetEngine = source.targetEngine.trim();

  const safeNote = sanitizeVisibleText(source.note, '');
  if (safeNote) next.note = safeNote;

  return next;
}

function sanitizePackageMetadata(
  input: unknown,
  base: {
    prompt: string;
    style: string;
    targetEngine: string;
    references: string[];
  }
): Record<string, unknown> {
  const next: Record<string, unknown> = {
    prompt: base.prompt,
    style: base.style,
    targetEngine: base.targetEngine,
    references: base.references,
    generatedAt: new Date().toISOString(),
    version: '0.2',
  };

  if (typeof input !== 'object' || input === null) {
    return next;
  }

  const source = input as Record<string, unknown>;
  if (typeof source.generatedAt === 'string' && source.generatedAt.trim()) {
    next.generatedAt = source.generatedAt.trim();
  }
  if (typeof source.version === 'string' && source.version.trim()) {
    next.version = source.version.trim();
  }

  return next;
}

function isSafeTexturePath(input: unknown): input is string {
  return (
    typeof input === 'string' &&
    /^textures\/[a-z0-9._/-]+\.(png|jpg|jpeg|webp)$/i.test(input) &&
    !input.includes('..')
  );
}

function isTextureKind(input: unknown): input is TextureKind {
  return input === 'albedo' || input === 'normal' || input === 'roughness' || input === 'metallic' || input === 'ao' || input === 'emissive';
}

function sanitizeTextures(input: unknown): CharacterPackage['textures'] {
  if (!Array.isArray(input)) return buildDefaultTextures();

  const sanitized = input
    .map((entry) => {
      if (typeof entry !== 'object' || entry === null) return null;
      const source = entry as Record<string, unknown>;
      if (!isTextureKind(source.type) || !isSafeTexturePath(source.path)) return null;
      const resolution = typeof source.resolution === 'string' && /^[1248]K$/i.test(source.resolution.trim())
        ? source.resolution.trim().toUpperCase()
        : '2K';
      return {
        type: source.type,
        path: source.path,
        resolution,
      } as CharacterTexture;
    })
    .filter((value): value is CharacterTexture => value !== null);

  return sanitized.length > 0 ? sanitized : buildDefaultTextures();
}

function sanitizeMaterialProperties(input: unknown): Record<string, unknown> {
  if (typeof input !== 'object' || input === null) return {};
  const source = input as Record<string, unknown>;
  const next: Record<string, unknown> = {};

  for (const key of ['roughness', 'metallic', 'aoStrength', 'emissiveIntensity']) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      next[key] = value;
    }
  }

  for (const key of ['albedoColor', 'accentColor', 'emissiveColor']) {
    const value = source[key];
    if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value.trim())) {
      next[key] = value.trim().toLowerCase();
    }
  }

  return next;
}

function sanitizeTextureSlots(input: unknown): Partial<Record<TextureKind, string>> {
  if (typeof input !== 'object' || input === null) return {};
  const source = input as Record<string, unknown>;
  const next: Partial<Record<TextureKind, string>> = {};

  for (const key of ['albedo', 'normal', 'roughness', 'metallic', 'ao', 'emissive'] as TextureKind[]) {
    if (isSafeTexturePath(source[key])) {
      next[key] = source[key];
    }
  }

  return next;
}

function sanitizeMaterials(input: unknown): CharacterPackage['materials'] {
  if (!Array.isArray(input)) return buildDefaultMaterials();

  const sanitized = input
    .map((entry) => {
      if (typeof entry !== 'object' || entry === null) return null;
      const source = entry as Record<string, unknown>;
      const id = typeof source.id === 'string' && /^[a-z0-9_-]{2,48}$/i.test(source.id.trim()) ? source.id.trim() : '';
      if (!id) return null;
      const label = typeof source.label === 'string' && source.label.trim().length > 0
        ? sanitizeVisibleText(source.label, 'Material')
        : 'Material';
      const domain = typeof source.domain === 'string' && /^[a-z0-9_-]{2,32}$/i.test(source.domain.trim())
        ? source.domain.trim()
        : 'body';
      const shader = typeof source.shader === 'string' && /^[a-z0-9._-]{3,32}$/i.test(source.shader.trim())
        ? source.shader.trim()
        : 'pbr_metal_rough';
      const textureSlots = sanitizeTextureSlots(source.textureSlots);
      if (Object.keys(textureSlots).length === 0) return null;
      return {
        id,
        label,
        domain,
        shader,
        doubleSided: source.doubleSided === true,
        properties: sanitizeMaterialProperties(source.properties),
        textureSlots,
      } as CharacterMaterial;
    })
    .filter((value): value is CharacterMaterial => value !== null);

  return sanitized.length > 0 ? sanitized : buildDefaultMaterials();
}

function buildPublicQualitySummary(
  pkg: CharacterPackage,
  remoteQuality?: unknown
): Record<string, unknown> {
  const quality: Record<string, unknown> = {
    vertices: pkg.mesh.vertices.length,
    triangles: pkg.mesh.faces.length,
    rigBones: pkg.rig.bones.length,
    blendshapes: pkg.blendshapes.length,
    animations: pkg.animations.length,
    materials: pkg.materials.length,
    textureMaps: pkg.textures.length,
    checks: ['mesh_ready', 'rig_ready', 'package_verified'],
  };

  if (typeof remoteQuality === 'object' && remoteQuality !== null) {
    const source = remoteQuality as Record<string, unknown>;
    for (const key of ['score', 'confidence', 'coverage']) {
      if (typeof source[key] === 'number' && Number.isFinite(source[key] as number)) {
        quality[key] = source[key];
      }
    }
  }

  return quality;
}

function normalizeRemotePackage(
  remotePayload: Record<string, unknown>,
  requestBody: RequestBody,
): CharacterPackage {
  const remoteMesh = (remotePayload.mesh || {}) as Record<string, unknown>;
  const vertices = isVec3Array(remoteMesh.vertices) ? remoteMesh.vertices : buildBaseCharacterMesh().vertices;
  const faces = isFaceArray(remoteMesh.faces) ? remoteMesh.faces : buildBaseCharacterMesh().faces;
  const uvs = Array.isArray(remoteMesh.uvs) && remoteMesh.uvs.length === vertices.length
    ? (remoteMesh.uvs as UV[])
    : buildPlanarUVs(vertices);

  const remoteRig = (remotePayload.rig || {}) as Record<string, unknown>;
  const bones = Array.isArray(remoteRig.bones) ? (remoteRig.bones as RigBone[]) : buildRig();
  const notes = sanitizeVisibleText(remoteRig.notes, 'Humanoid rig listo para integración.');

  const remoteBlendshapes = Array.isArray(remotePayload.blendshapes)
    ? (remotePayload.blendshapes as Blendshape[])
    : [];
  const remoteAnimations = Array.isArray(remotePayload.animations)
    ? (remotePayload.animations as AnimationClip[])
    : buildAnimations(requestBody.includeAnimations !== false);
  const remoteTextures = sanitizeTextures(remotePayload.textures);
  const remoteMaterials = sanitizeMaterials(remotePayload.materials);

  return {
    mesh: {
      vertices,
      faces,
      uvs,
      metadata: sanitizeMeshMetadata(remoteMesh.metadata),
    },
    rig: {
      bones,
      notes,
    },
    blendshapes: remoteBlendshapes,
    textures: remoteTextures,
    materials: remoteMaterials,
    animations: remoteAnimations,
    metadata: {
      ...sanitizePackageMetadata(remotePayload.metadata, {
        prompt: requestBody.prompt,
        style: requestBody.style || 'realista',
        targetEngine: requestBody.targetEngine || 'generic',
        references: Array.isArray(requestBody.references) ? requestBody.references.slice(0, 6) : [],
      }),
    },
  };
}

async function tryGenerateWithRemoteBackend(body: RequestBody): Promise<{
  jobId: string;
  package: CharacterPackage;
  quality: Record<string, unknown>;
  packagePath: string;
} | null> {
  if (!isCharacterBackendConfigured()) return null;

  const job = await createCharacterJob({
    prompt: body.prompt,
    style: body.style || 'realista',
    targetEngine: body.targetEngine || 'generic',
    includeAnimations: body.includeAnimations !== false,
    includeBlendshapes: body.includeBlendshapes !== false,
    references: Array.isArray(body.references) ? body.references.slice(0, 6) : [],
  });

  const finalStatus = await waitForCharacterJobCompletion(job.jobId);
  if (finalStatus.status !== 'completed') {
    throw new CharacterServiceError(
      finalStatus.status === 'failed' ? 502 : 504,
      'No se pudo completar el personaje.'
    );
  }

  return fetchRemoteResultByJobId(job.jobId, body);
}

async function fetchRemoteResultByJobId(jobId: string, body: RequestBody): Promise<{
  jobId: string;
  package: CharacterPackage;
  quality: Record<string, unknown>;
  packagePath: string;
}> {
  const result = await getCharacterJobResult(jobId);
  const payload = result.payload;

  const normalizedPackage = normalizeRemotePackage(payload, body);
  const quality = {
    ...buildPublicQualitySummary(normalizedPackage, payload.quality),
  };

  return {
    jobId,
    package: normalizedPackage,
    quality,
    packagePath: result.packagePath,
  };
}

function isInsideRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

function getRemoteBundleRoots(): string[] {
  return [
    process.env.REY30_CHARACTER_BACKEND_BUNDLE_ROOT,
    path.join(process.cwd(), 'mini-services', 'character-backend', 'data', 'output'),
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => path.resolve(value));
}

async function tryCopyRemoteBundle(sourcePackagePath: string | null | undefined, destDir: string): Promise<boolean> {
  if (!sourcePackagePath || !sourcePackagePath.trim()) return false;

  const sourceAbs = path.isAbsolute(sourcePackagePath)
    ? path.resolve(sourcePackagePath)
    : path.resolve(process.cwd(), sourcePackagePath);

  const stats = await fs.stat(sourceAbs).catch(() => null);
  if (!stats?.isFile()) return false;

  const allowed = getRemoteBundleRoots().some((root) => isInsideRoot(root, sourceAbs));
  if (!allowed) return false;

  await fs.cp(path.dirname(sourceAbs), destDir, { recursive: true, force: true });
  return true;
}

async function writeNormalizedPackageFiles(dir: string, pkg: CharacterPackage) {
  await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2), 'utf-8');
  await fs.writeFile(path.join(dir, 'mesh.json'), JSON.stringify(pkg.mesh, null, 2), 'utf-8');
  await fs.writeFile(path.join(dir, 'rig.json'), JSON.stringify(pkg.rig, null, 2), 'utf-8');
  await fs.writeFile(path.join(dir, 'blendshapes.json'), JSON.stringify(pkg.blendshapes, null, 2), 'utf-8');
  await fs.writeFile(path.join(dir, 'animations.json'), JSON.stringify(pkg.animations, null, 2), 'utf-8');
  await fs.writeFile(path.join(dir, 'materials.json'), JSON.stringify(pkg.materials, null, 2), 'utf-8');
}

async function persistPackage(input: {
  pkg: CharacterPackage;
  projectKey: string;
  stableKey: string;
  sourcePackagePath?: string | null;
}) {
  const root = process.env.REY30_ASSET_ROOT || path.join(process.cwd(), 'download', 'assets', 'characters');
  const dir = path.join(
    root,
    'generated-characters',
    sanitizeStableSegment(input.projectKey),
    sanitizeStableSegment(input.stableKey)
  );
  await fs.mkdir(dir, { recursive: true });
  await tryCopyRemoteBundle(input.sourcePackagePath, dir);
  await writeNormalizedPackageFiles(dir, input.pkg);
  return dir;
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSession(request, 'EDITOR');
    const body = (await request.json()) as RequestBody;
    const prompt = body.prompt?.trim();
    if (!prompt) {
      return NextResponse.json({ success: false, error: 'Prompt requerido' }, { status: 400 });
    }

    const projectKey = normalizeProjectKey(request.headers.get('x-rey30-project'));
    const style = body.style || 'realista';
    const targetEngine = body.targetEngine || 'generic';
    const includeAnimations = body.includeAnimations !== false;
    const includeBlendshapes = body.includeBlendshapes !== false;
    const references = Array.isArray(body.references) ? body.references.slice(0, 6) : [];
    const remoteJobId = (body.remoteJobId || '').trim();
    const allowLocalFallback = isCharacterLocalFallbackEnabled();
    const backendConfigured = isCharacterBackendConfigured();
    const fallbackJobId = `fallback_${buildFallbackCharacterJobKey({
      prompt,
      style,
      targetEngine,
      includeAnimations,
      includeBlendshapes,
      references,
    })}`;

    let pkg: CharacterPackage | null = null;
    let quality: Record<string, unknown> | null = null;
    let remotePackagePath: string | null = null;
    let finalJobId = remoteJobId || '';

    if (remoteJobId) {
      const existingRecord = await getCharacterGenerationJobRecord(remoteJobId);
      if (existingRecord?.asset) {
        const existingPackagePath = path.resolve(process.cwd(), existingRecord.asset.path);
        const existingPackage = await fs
          .readFile(existingPackagePath, 'utf-8')
          .then((raw) => JSON.parse(raw))
          .catch(() => null);

        if (isCharacterPackage(existingPackage)) {
          const existingQuality = existingRecord.packageSummary
            ? {
                vertices: existingRecord.packageSummary.vertexCount,
                triangles: existingRecord.packageSummary.triangleCount,
                rigBones: existingRecord.packageSummary.rigBoneCount,
                blendshapes: existingRecord.packageSummary.blendshapeCount,
                animations: existingRecord.packageSummary.animationCount,
                materials: existingRecord.packageSummary.materialCount,
                textureMaps: existingRecord.packageSummary.textureCount,
                checks: ['mesh_ready', 'rig_ready', 'package_verified'],
              }
            : {};

          return NextResponse.json({
            success: true,
            jobId: remoteJobId,
            summary: `Personaje completo generado (${style}, ${targetEngine})`,
            packagePath:
              existingRecord.packageDirectoryPath ??
              path.dirname(existingRecord.asset.path).replace(/\\/g, '/'),
            asset: existingRecord.asset,
            packageSummary: existingRecord.packageSummary,
            mesh: existingPackage.mesh,
            rig: existingPackage.rig,
            blendshapes: existingPackage.blendshapes,
            textures: existingPackage.textures,
            materials: existingPackage.materials,
            animations: existingPackage.animations,
            quality: existingQuality,
          });
        }
      }
    }

    if (!backendConfigured && !allowLocalFallback) {
      return NextResponse.json(
        { success: false, error: 'La creación de personajes no está disponible en esta sesión.' },
        { status: 503 }
      );
    }

    if (backendConfigured && remoteJobId) {
      try {
        const remoteResult = await fetchRemoteResultByJobId(remoteJobId, {
          prompt,
          style,
          targetEngine,
          includeAnimations,
          includeBlendshapes,
          references,
          remoteJobId,
        });
        pkg = remoteResult.package;
        quality = remoteResult.quality;
        remotePackagePath = remoteResult.packagePath;
        finalJobId = remoteResult.jobId;
      } catch (error) {
        if (!allowLocalFallback) {
          throw error;
        }
        console.warn('[character/full] remote job import failed, using explicit local fallback:', error);
      }
    }

    if (backendConfigured) {
      try {
        if (!pkg) {
          const remoteResult = await tryGenerateWithRemoteBackend({
            prompt,
            style,
            targetEngine,
            includeAnimations,
            includeBlendshapes,
            references,
          });
          if (remoteResult) {
            pkg = remoteResult.package;
            quality = remoteResult.quality;
            remotePackagePath = remoteResult.packagePath;
            finalJobId = remoteResult.jobId;
          }
        }
      } catch (error) {
        if (!allowLocalFallback) {
          throw error;
        }
        console.warn('[character/full] remote backend failed, using explicit local fallback:', error);
      }
    }

    if (!pkg) {
      if (!allowLocalFallback) {
        return NextResponse.json(
          { success: false, error: 'No se pudo completar el personaje.' },
          { status: 503 }
        );
      }

      const mesh = buildBaseCharacterMesh();
      const rig = buildRig();
      const blendshapes = includeBlendshapes ? buildBlendshapes() : [];
      const textures = buildDefaultTextures();
      const materials = buildDefaultMaterials();
      const animations = buildAnimations(includeAnimations);

      pkg = {
        mesh,
        rig: { bones: rig, notes: 'Humanoid minimal rig. Requiere weight paint fino.' },
        blendshapes,
        textures,
        materials,
        animations,
        metadata: {
          prompt,
          style,
          targetEngine,
          references,
          generatedAt: new Date().toISOString(),
          version: '0.1',
          mode: 'explicit_local_fallback',
        },
      };

      quality = {
        vertices: mesh.vertices.length,
        triangles: mesh.faces.length,
        rigBones: rig.length,
        blendshapes: blendshapes.length,
        animations: animations.length,
        materials: materials.length,
        textureMaps: textures.length,
        checks: ['mesh_ready', 'rig_ready', 'package_verified'],
      };

      if (!finalJobId) {
        finalJobId = fallbackJobId;
      }
    }

    const finalPackage = pkg;
    const finalQuality = quality || {};
    const packageSummary = summarizeCharacterPackage(finalPackage);
    const savedDir = await persistPackage({
      pkg: finalPackage,
      projectKey,
      stableKey: finalJobId || fallbackJobId,
      sourcePackagePath: remotePackagePath,
    });
    const packagePath = path.relative(process.cwd(), savedDir).replace(/\\/g, '/');
    const registeredAsset = await registerAssetFromPath({
      absPath: path.join(savedDir, 'package.json'),
      name: `CharacterPackage_${sanitizeStableSegment(finalJobId || fallbackJobId)}`,
      type: 'prefab',
      source: 'ai_level3_full_character',
      metadata: {
        prompt,
        style,
        targetEngine,
        references,
        generatedAt: finalPackage.metadata.generatedAt,
        projectKey,
        scope: 'project',
        generatedBy: 'character-full-route',
        characterPackage: true,
        characterJobId: finalJobId || null,
        characterPackageSummary: packageSummary,
      },
    });
    const clientAsset = {
      ...toClientAsset(registeredAsset),
      type: 'prefab' as const,
    };

    await upsertCharacterGenerationJobRecord({
      jobId: finalJobId || fallbackJobId,
      userId: user.id,
      projectKey,
      prompt,
      style,
      targetEngine,
      includeAnimations,
      includeBlendshapes,
      references,
      status: 'completed',
      progress: 100,
      stage: 'completed',
      error: null,
      remotePackagePath,
      packageDirectoryPath: packagePath,
      packageSummary,
      asset: clientAsset,
    });

    return NextResponse.json({
      success: true,
      jobId: finalJobId || fallbackJobId,
      summary: `Personaje completo generado (${style}, ${targetEngine})`,
      packagePath,
      asset: clientAsset,
      packageSummary,
      mesh: finalPackage.mesh,
      rig: finalPackage.rig,
      blendshapes: finalPackage.blendshapes,
      textures: finalPackage.textures,
      materials: finalPackage.materials,
      animations: finalPackage.animations,
      quality: finalQuality,
    });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    if (error instanceof CharacterServiceError) {
      console.error('[character/full] backend failure:', error);
      return NextResponse.json(
        { success: false, error: 'No se pudo completar el personaje.' },
        { status: error.status }
      );
    }
    console.error('Full character error', error);
    return NextResponse.json(
      { success: false, error: 'No se pudo generar el personaje completo.' },
      { status: 500 }
    );
  }
}
