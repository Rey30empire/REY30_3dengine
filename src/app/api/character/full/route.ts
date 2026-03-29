// ============================================
// Character Full Package Generator (Level 3)
// Generates mesh + UVs + textures + rig + blendshapes + base animations (mock/procedural)
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { registerAssetFromPath } from '@/engine/assets/pipeline';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';

type Vec3 = { x: number; y: number; z: number };
type Face = [number, number, number];
type UV = { u: number; v: number };

type MeshData = {
  vertices: Vec3[];
  faces: Face[];
  uvs: UV[];
  metadata: Record<string, unknown>;
};

type RigBone = { name: string; parent: string | null; position: Vec3 };
type Blendshape = { name: string; weight: number };
type AnimationClip = { name: string; duration: number; loop: boolean };

type CharacterPackage = {
  mesh: MeshData;
  rig: { bones: RigBone[]; notes: string };
  blendshapes: Blendshape[];
  textures: Array<{ type: 'albedo' | 'normal' | 'roughness' | 'emissive'; path: string; resolution: string }>;
  animations: AnimationClip[];
  metadata: Record<string, unknown>;
};

type RequestBody = {
  prompt: string;
  style?: string;
  targetEngine?: 'unity' | 'unreal' | 'generic';
  includeAnimations?: boolean;
  includeBlendshapes?: boolean;
  references?: string[];
  remoteJobId?: string;
};

const REMOTE_BACKEND_URL = (process.env.REY30_CHARACTER_BACKEND_URL || '').trim();
const REMOTE_TIMEOUT_MS = Number(process.env.REY30_CHARACTER_BACKEND_TIMEOUT_MS || 120_000);
const REMOTE_POLL_MS = Number(process.env.REY30_CHARACTER_BACKEND_POLL_MS || 1_000);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJsonWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({} as Record<string, unknown>));
    return { response, data };
  } finally {
    clearTimeout(timeout);
  }
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
    { type: 'albedo', path: 'textures/albedo_placeholder.png', resolution: '2K' },
    { type: 'normal', path: 'textures/normal_placeholder.png', resolution: '2K' },
    { type: 'roughness', path: 'textures/roughness_placeholder.png', resolution: '2K' },
    { type: 'emissive', path: 'textures/emissive_placeholder.png', resolution: '1K' },
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
  const notes = typeof remoteRig.notes === 'string' ? remoteRig.notes : 'Imported from Profile A backend.';

  const remoteBlendshapes = Array.isArray(remotePayload.blendshapes)
    ? (remotePayload.blendshapes as Blendshape[])
    : [];
  const remoteAnimations = Array.isArray(remotePayload.animations)
    ? (remotePayload.animations as AnimationClip[])
    : buildAnimations(requestBody.includeAnimations !== false);
  const remoteTextures = Array.isArray(remotePayload.textures)
    ? (remotePayload.textures as CharacterPackage['textures'])
    : buildDefaultTextures();

  return {
    mesh: {
      vertices,
      faces,
      uvs,
      metadata: {
        ...((typeof remoteMesh.metadata === 'object' && remoteMesh.metadata !== null)
          ? (remoteMesh.metadata as Record<string, unknown>)
          : {}),
      },
    },
    rig: {
      bones,
      notes,
    },
    blendshapes: remoteBlendshapes,
    textures: remoteTextures,
    animations: remoteAnimations,
    metadata: {
      prompt: requestBody.prompt,
      style: requestBody.style || 'realista',
      targetEngine: requestBody.targetEngine || 'generic',
      references: Array.isArray(requestBody.references) ? requestBody.references.slice(0, 6) : [],
      generatedAt: new Date().toISOString(),
      version: '0.2',
      source: 'profile-a-backend',
      ...((typeof remotePayload.metadata === 'object' && remotePayload.metadata !== null)
        ? (remotePayload.metadata as Record<string, unknown>)
        : {}),
    },
  };
}

function normalizeRemoteError(data: Record<string, unknown>, fallback: string): string {
  if (typeof data.error === 'string' && data.error.trim().length > 0) return data.error;
  if (typeof data.detail === 'string' && data.detail.trim().length > 0) return data.detail;
  return fallback;
}

async function tryGenerateWithRemoteBackend(body: RequestBody): Promise<{
  package: CharacterPackage;
  quality: Record<string, unknown>;
} | null> {
  if (!REMOTE_BACKEND_URL) return null;
  const base = REMOTE_BACKEND_URL.replace(/\/+$/, '');

  const { response: createRes, data: createData } = await fetchJsonWithTimeout(
    `${base}/v1/character/jobs`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: body.prompt,
        style: body.style || 'realista',
        targetEngine: body.targetEngine || 'generic',
        includeAnimations: body.includeAnimations !== false,
        includeBlendshapes: body.includeBlendshapes !== false,
        references: Array.isArray(body.references) ? body.references.slice(0, 6) : [],
      }),
    },
    15_000,
  );

  if (!createRes.ok) {
    const message = normalizeRemoteError(createData, 'Failed to create remote character job');
    throw new Error(`Profile A backend rejected job: ${message}`);
  }

  const jobId = typeof createData.jobId === 'string' ? createData.jobId : '';
  if (!jobId) {
    throw new Error('Profile A backend returned an invalid job id');
  }

  const deadline = Date.now() + REMOTE_TIMEOUT_MS;
  let lastStatus: Record<string, unknown> = {};

  while (Date.now() < deadline) {
    const { response: statusRes, data: statusData } = await fetchJsonWithTimeout(
      `${base}/v1/character/jobs/${encodeURIComponent(jobId)}`,
      { method: 'GET' },
      10_000,
    );
    if (!statusRes.ok) {
      const message = normalizeRemoteError(statusData, 'Failed to poll remote character job');
      throw new Error(`Profile A backend polling failed: ${message}`);
    }
    lastStatus = statusData;
    const status = typeof statusData.status === 'string' ? statusData.status : 'unknown';
    if (status === 'completed') {
      break;
    }
    if (status === 'failed') {
      const message =
        typeof statusData.error === 'string' && statusData.error.trim().length > 0
          ? statusData.error
          : 'Remote backend marked job as failed';
      throw new Error(`Profile A backend failed: ${message}`);
    }
    await sleep(REMOTE_POLL_MS);
  }

  if ((lastStatus.status || '') !== 'completed') {
    throw new Error('Profile A backend timeout waiting for character generation');
  }

  return fetchRemoteResultByJobId(jobId, body);
}

async function fetchRemoteResultByJobId(jobId: string, body: RequestBody): Promise<{
  package: CharacterPackage;
  quality: Record<string, unknown>;
}> {
  const base = REMOTE_BACKEND_URL.replace(/\/+$/, '');

  const { response: resultRes, data: resultData } = await fetchJsonWithTimeout(
    `${base}/v1/character/jobs/${encodeURIComponent(jobId)}/result`,
    { method: 'GET' },
    10_000,
  );
  if (!resultRes.ok) {
    const message = normalizeRemoteError(resultData, 'Failed to fetch remote character result');
    throw new Error(`Profile A backend result failed: ${message}`);
  }

  const payload =
    typeof resultData.payload === 'object' && resultData.payload !== null
      ? (resultData.payload as Record<string, unknown>)
      : {};

  const normalizedPackage = normalizeRemotePackage(payload, body);
  const quality = {
    vertices: normalizedPackage.mesh.vertices.length,
    triangles: normalizedPackage.mesh.faces.length,
    rigBones: normalizedPackage.rig.bones.length,
    blendshapes: normalizedPackage.blendshapes.length,
    animations: normalizedPackage.animations.length,
    checks: ['profile_a_backend', 'procedural_mesh', 'rigged_package'],
    ...(typeof payload.quality === 'object' && payload.quality !== null
      ? (payload.quality as Record<string, unknown>)
      : {}),
  };

  return {
    package: normalizedPackage,
    quality,
  };
}

async function persistPackage(pkg: CharacterPackage) {
  const root = process.env.REY30_ASSET_ROOT || path.join(process.cwd(), 'download', 'assets', 'characters');
  const dir = path.join(root, `Character_${Date.now()}`);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2), 'utf-8');
  await fs.writeFile(path.join(dir, 'mesh.json'), JSON.stringify(pkg.mesh, null, 2), 'utf-8');
  await fs.writeFile(path.join(dir, 'rig.json'), JSON.stringify(pkg.rig, null, 2), 'utf-8');
  await fs.writeFile(path.join(dir, 'blendshapes.json'), JSON.stringify(pkg.blendshapes, null, 2), 'utf-8');
  await fs.writeFile(path.join(dir, 'animations.json'), JSON.stringify(pkg.animations, null, 2), 'utf-8');
  return dir;
}

export async function POST(request: NextRequest) {
  try {
    await requireSession(request, 'EDITOR');
    const body = (await request.json()) as RequestBody;
    const prompt = body.prompt?.trim();
    if (!prompt) {
      return NextResponse.json({ success: false, error: 'Prompt requerido' }, { status: 400 });
    }

    const style = body.style || 'realista';
    const targetEngine = body.targetEngine || 'generic';
    const includeAnimations = body.includeAnimations !== false;
    const includeBlendshapes = body.includeBlendshapes !== false;
    const references = Array.isArray(body.references) ? body.references.slice(0, 6) : [];
    const remoteJobId = (body.remoteJobId || '').trim();

    let pkg: CharacterPackage | null = null;
    let quality: Record<string, unknown> | null = null;
    let source: 'profile-a-backend' | 'local-fallback' = 'local-fallback';

    if (REMOTE_BACKEND_URL && remoteJobId) {
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
        source = 'profile-a-backend';
      } catch (error) {
        console.warn('[character/full] remote job import failed, using local fallback:', error);
      }
    }

    if (REMOTE_BACKEND_URL) {
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
            source = 'profile-a-backend';
          }
        }
      } catch (error) {
        console.warn('[character/full] remote backend failed, using local fallback:', error);
      }
    }

    if (!pkg) {
      const mesh = buildBaseCharacterMesh();
      const rig = buildRig();
      const blendshapes = includeBlendshapes ? buildBlendshapes() : [];
      const textures = buildDefaultTextures();
      const animations = buildAnimations(includeAnimations);

      pkg = {
        mesh,
        rig: { bones: rig, notes: 'Humanoid minimal rig. Requiere weight paint fino.' },
        blendshapes,
        textures,
        animations,
        metadata: {
          prompt,
          style,
          targetEngine,
          references,
          generatedAt: new Date().toISOString(),
          version: '0.1',
          source: 'local-fallback',
        },
      };

      quality = {
        vertices: mesh.vertices.length,
        triangles: mesh.faces.length,
        rigBones: rig.length,
        blendshapes: blendshapes.length,
        animations: animations.length,
        checks: ['polycount < 10k', 'uvs planar', 'rig humanoid básico'],
      };
    }

    const finalPackage = pkg;
    const finalQuality = quality || {};

    const savedDir = await persistPackage(finalPackage);
    await registerAssetFromPath({
      absPath: path.join(savedDir, 'package.json'),
      name: `CharacterPackage_${Date.now()}`,
      type: 'prefab',
      source: 'ai_level3_full_character',
      metadata: {
        prompt,
        style,
        targetEngine,
        references,
        generatedAt: finalPackage.metadata.generatedAt,
        backendSource: source,
      },
    });

    return NextResponse.json({
      success: true,
      summary: `Personaje completo generado (style=${style}, target=${targetEngine}, source=${source})`,
      packagePath: path.relative(process.cwd(), savedDir).replace(/\\/g, '/'),
      mesh: finalPackage.mesh,
      rig: finalPackage.rig,
      blendshapes: finalPackage.blendshapes,
      textures: finalPackage.textures,
      animations: finalPackage.animations,
      quality: finalQuality,
      backendSource: source,
    });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    console.error('Full character error', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
