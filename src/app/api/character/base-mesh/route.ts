// ============================================
// Character Base Mesh Generator (Level 2)
// Backend-first base mesh generation with optional explicit local fallback for development only.
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { registerAssetFromPath } from '@/engine/assets/pipeline';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import {
  CharacterServiceError,
  generateCharacterBaseMesh,
  isCharacterBackendConfigured,
  isCharacterLocalFallbackEnabled,
} from '@/lib/server/character-service';

type Vec3 = { x: number; y: number; z: number };
type Face = [number, number, number];
type UV = { u: number; v: number };

type MeshData = {
  vertices: Vec3[];
  faces: Face[];
  uvs: UV[];
  metadata: Record<string, unknown>;
};

type RequestBody = {
  prompt: string;
  style?: string;
  targetEngine?: 'unity' | 'unreal' | 'generic';
  references?: string[];
};

type BaseMeshGeneration = {
  mesh: MeshData;
  quality: Record<string, unknown>;
  review: Record<string, unknown>;
};

const SENSITIVE_HINTS = /(profile|backend|provider|pipeline|worker|gpu|cluster|model|internal)/i;

function tokenize(input: string): Set<string> {
  return new Set((input.toLowerCase().match(/[a-z0-9]+/g) || []).filter(Boolean));
}

function containsAny(tokens: Set<string>, candidates: string[]): boolean {
  return candidates.some((candidate) => tokens.has(candidate));
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function addBox(center: Vec3, size: Vec3) {
  const { x, y, z } = center;
  const { x: sx, y: sy, z: sz } = size;
  const hx = sx / 2;
  const hy = sy / 2;
  const hz = sz / 2;
  const verts: Vec3[] = [
    { x: x - hx, y: y - hy, z: z - hz },
    { x: x + hx, y: y - hy, z: z - hz },
    { x: x + hx, y: y + hy, z: z - hz },
    { x: x - hx, y: y + hy, z: z - hz },
    { x: x - hx, y: y - hy, z: z + hz },
    { x: x + hx, y: y - hy, z: z + hz },
    { x: x + hx, y: y + hy, z: z + hz },
    { x: x - hx, y: y + hy, z: z + hz },
  ];
  const faces: Face[] = [
    [0, 1, 2], [0, 2, 3],
    [4, 6, 5], [4, 7, 6],
    [4, 5, 1], [4, 1, 0],
    [3, 2, 6], [3, 6, 7],
    [1, 5, 6], [1, 6, 2],
    [4, 0, 3], [4, 3, 7],
  ];
  return { verts, faces };
}

function mergeParts(parts: Array<{ verts: Vec3[]; faces: Face[] }>): { vertices: Vec3[]; faces: Face[] } {
  const vertices: Vec3[] = [];
  const faces: Face[] = [];
  for (const part of parts) {
    const offset = vertices.length;
    vertices.push(...part.verts);
    faces.push(...part.faces.map(([a, b, c]) => [a + offset, b + offset, c + offset] as Face));
  }
  return { vertices, faces };
}

function buildPlanarUVs(vertices: Vec3[]): UV[] {
  if (vertices.length === 0) return [];
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const vertex of vertices) {
    minX = Math.min(minX, vertex.x);
    maxX = Math.max(maxX, vertex.x);
    minZ = Math.min(minZ, vertex.z);
    maxZ = Math.max(maxZ, vertex.z);
  }
  const spanX = maxX - minX || 1;
  const spanZ = maxZ - minZ || 1;
  return vertices.map((vertex) => ({
    u: (vertex.x - minX) / spanX,
    v: (vertex.z - minZ) / spanZ,
  }));
}

function sanitizeVisibleText(input: unknown, fallback: string): string {
  if (typeof input !== 'string') return fallback;
  const trimmed = input.trim();
  if (!trimmed || SENSITIVE_HINTS.test(trimmed)) return fallback;
  return trimmed;
}

function isVec3Array(input: unknown): input is Vec3[] {
  return (
    Array.isArray(input) &&
    input.every(
      (value) =>
        typeof value === 'object' &&
        value !== null &&
        typeof (value as { x?: unknown }).x === 'number' &&
        typeof (value as { y?: unknown }).y === 'number' &&
        typeof (value as { z?: unknown }).z === 'number'
    )
  );
}

function isFaceArray(input: unknown): input is Face[] {
  return (
    Array.isArray(input) &&
    input.every(
      (value) =>
        Array.isArray(value) &&
        value.length === 3 &&
        typeof value[0] === 'number' &&
        typeof value[1] === 'number' &&
        typeof value[2] === 'number'
    )
  );
}

function deriveLocalProfile(prompt: string, style: string, references: string[]) {
  const promptTokens = tokenize(prompt);
  const styleTokens = tokenize(style);
  const profile = {
    silhouette: 'guardian',
    torsoWidth: 0.56,
    torsoHeight: 0.82,
    torsoDepth: 0.34,
    headSize: 0.31,
    armWidth: 0.15,
    legWidth: 0.17,
    hasCape: false,
    hasHood: false,
    hasHorns: false,
    hasShoulderPlates: true,
    hasBackpack: false,
  };

  if (containsAny(promptTokens, ['robot', 'mech', 'mecha', 'android', 'cyber'])) {
    profile.silhouette = 'sentinel';
    profile.torsoWidth = 0.62;
    profile.torsoDepth = 0.38;
    profile.headSize = 0.28;
    profile.armWidth = 0.17;
    profile.hasBackpack = true;
  } else if (containsAny(promptTokens, ['mage', 'wizard', 'sorcerer', 'caster'])) {
    profile.silhouette = 'mystic';
    profile.torsoWidth = 0.5;
    profile.torsoDepth = 0.28;
    profile.headSize = 0.33;
    profile.armWidth = 0.13;
    profile.hasCape = true;
    profile.hasShoulderPlates = false;
  } else if (containsAny(promptTokens, ['rogue', 'assassin', 'ninja', 'thief'])) {
    profile.silhouette = 'shadow';
    profile.torsoWidth = 0.48;
    profile.torsoDepth = 0.28;
    profile.headSize = 0.3;
    profile.armWidth = 0.12;
    profile.legWidth = 0.15;
    profile.hasCape = true;
    profile.hasHood = true;
    profile.hasShoulderPlates = false;
  } else if (containsAny(promptTokens, ['orc', 'beast', 'monster', 'demon', 'brute'])) {
    profile.silhouette = 'brute';
    profile.torsoWidth = 0.68;
    profile.torsoHeight = 0.9;
    profile.torsoDepth = 0.42;
    profile.headSize = 0.34;
    profile.armWidth = 0.19;
    profile.legWidth = 0.2;
    profile.hasHorns = true;
    profile.hasShoulderPlates = false;
  } else if (containsAny(promptTokens, ['ranger', 'archer', 'hunter', 'sniper'])) {
    profile.silhouette = 'ranger';
    profile.torsoWidth = 0.52;
    profile.torsoDepth = 0.3;
    profile.armWidth = 0.13;
    profile.hasBackpack = true;
    profile.hasShoulderPlates = false;
  }

  if (containsAny(styleTokens, ['stylized', 'toon', 'anime', 'cartoon'])) {
    profile.headSize = clamp(profile.headSize + 0.05, 0.26, 0.4);
    profile.torsoDepth = clamp(profile.torsoDepth * 0.92, 0.24, 0.44);
  }

  if (references.length >= 3) {
    profile.hasBackpack = true;
  }

  return profile;
}

function buildLocalBaseMesh(prompt: string, style: string, references: string[]): BaseMeshGeneration {
  const profile = deriveLocalProfile(prompt, style, references);
  const torsoCenterY = 0.82 + (profile.torsoHeight - 0.82) * 0.45;
  const headCenterY = torsoCenterY + profile.torsoHeight * 0.65;
  const armCenterY = torsoCenterY + profile.torsoHeight * 0.12;

  const parts: Array<{ verts: Vec3[]; faces: Face[] }> = [
    addBox({ x: 0, y: torsoCenterY, z: 0 }, { x: profile.torsoWidth, y: profile.torsoHeight, z: profile.torsoDepth }),
    addBox({ x: 0, y: headCenterY, z: 0 }, { x: profile.headSize, y: profile.headSize * 1.02, z: profile.headSize * 0.9 }),
    addBox({ x: -0.16, y: 0.35, z: 0 }, { x: profile.legWidth, y: 0.72, z: 0.18 }),
    addBox({ x: 0.16, y: 0.35, z: 0 }, { x: profile.legWidth, y: 0.72, z: 0.18 }),
    addBox({ x: -(profile.torsoWidth * 0.68), y: armCenterY, z: 0 }, { x: profile.armWidth, y: 0.58, z: 0.16 }),
    addBox({ x: profile.torsoWidth * 0.68, y: armCenterY, z: 0 }, { x: profile.armWidth, y: 0.58, z: 0.16 }),
    addBox({ x: -0.16, y: 0.02, z: 0.06 }, { x: profile.legWidth + 0.03, y: 0.14, z: 0.28 }),
    addBox({ x: 0.16, y: 0.02, z: 0.06 }, { x: profile.legWidth + 0.03, y: 0.14, z: 0.28 }),
  ];

  if (profile.hasShoulderPlates) {
    parts.push(addBox({ x: -(profile.torsoWidth * 0.58), y: torsoCenterY + profile.torsoHeight * 0.32, z: 0 }, { x: 0.2, y: 0.14, z: 0.22 }));
    parts.push(addBox({ x: profile.torsoWidth * 0.58, y: torsoCenterY + profile.torsoHeight * 0.32, z: 0 }, { x: 0.2, y: 0.14, z: 0.22 }));
  }
  if (profile.hasCape) {
    parts.push(addBox({ x: 0, y: torsoCenterY + profile.torsoHeight * 0.08, z: -0.16 }, { x: profile.torsoWidth * 0.92, y: 0.88, z: 0.05 }));
  }
  if (profile.hasHood) {
    parts.push(addBox({ x: 0, y: headCenterY + 0.03, z: -0.02 }, { x: profile.headSize * 0.94, y: profile.headSize * 0.78, z: profile.headSize * 0.94 }));
  }
  if (profile.hasHorns) {
    parts.push(addBox({ x: -0.08, y: headCenterY + profile.headSize * 0.48, z: -0.02 }, { x: 0.05, y: 0.16, z: 0.05 }));
    parts.push(addBox({ x: 0.08, y: headCenterY + profile.headSize * 0.48, z: -0.02 }, { x: 0.05, y: 0.16, z: 0.05 }));
  }
  if (profile.hasBackpack) {
    parts.push(addBox({ x: 0, y: torsoCenterY + 0.02, z: -0.2 }, { x: profile.torsoWidth * 0.45, y: profile.torsoHeight * 0.36, z: 0.1 }));
  }

  const merged = mergeParts(parts);
  const mesh: MeshData = {
    vertices: merged.vertices,
    faces: merged.faces,
    uvs: buildPlanarUVs(merged.vertices),
    metadata: {
      prompt,
      style,
      silhouette: profile.silhouette,
      note: 'Base mesh lista para retopo y refinado.',
    },
  };

  const review = {
    summary: `Base mesh lista para retopo y refinado (${profile.silhouette}).`,
    focusAreas: [
      'silueta',
      'hombros',
      'manos',
      profile.silhouette === 'brute' || profile.silhouette === 'sentinel' ? 'volumen de torso' : 'zona facial',
    ],
    retopoRecommended: true,
  };

  const quality = {
    vertices: mesh.vertices.length,
    triangles: mesh.faces.length,
    checks: ['mesh_ready', 'uv_ready', 'review_ready'],
  };

  return { mesh, quality, review };
}

function normalizeRemoteBaseMesh(
  remote: {
    mesh: Record<string, unknown>;
    quality: Record<string, unknown>;
    review: Record<string, unknown>;
    metadata: Record<string, unknown>;
  },
  body: { prompt: string; style: string; references: string[]; targetEngine: string }
): BaseMeshGeneration {
  const fallback = buildLocalBaseMesh(body.prompt, body.style, body.references);
  const vertices = isVec3Array(remote.mesh.vertices) ? remote.mesh.vertices : fallback.mesh.vertices;
  const faces = isFaceArray(remote.mesh.faces) ? remote.mesh.faces : fallback.mesh.faces;
  const uvs =
    Array.isArray(remote.mesh.uvs) && remote.mesh.uvs.length === vertices.length
      ? (remote.mesh.uvs as UV[])
      : buildPlanarUVs(vertices);

  const metadata: Record<string, unknown> = {
    prompt: body.prompt,
    style: body.style,
    targetEngine: body.targetEngine,
    references: body.references,
  };

  const note = sanitizeVisibleText(
    (remote.mesh.metadata as Record<string, unknown> | undefined)?.note ??
      remote.review.summary,
    'Base mesh lista para retopo y refinado.'
  );
  if (note) {
    metadata.note = note;
  }

  const silhouette = typeof remote.metadata.silhouette === 'string' ? remote.metadata.silhouette.trim() : '';
  if (/^[a-z0-9_-]{2,32}$/i.test(silhouette)) {
    metadata.silhouette = silhouette;
  }

  const quality: Record<string, unknown> = {
    vertices: vertices.length,
    triangles: faces.length,
    checks: ['mesh_ready', 'uv_ready', 'review_ready'],
  };
  for (const key of ['score', 'coverage']) {
    const value = remote.quality[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      quality[key] = value;
    }
  }
  if (remote.quality.worstSeverity === 'info' || remote.quality.worstSeverity === 'warn' || remote.quality.worstSeverity === 'error') {
    quality.worstSeverity = remote.quality.worstSeverity;
  }

  const focusAreas = Array.isArray(remote.review.focusAreas)
    ? remote.review.focusAreas.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, 6)
    : [];
  const review: Record<string, unknown> = {
    summary: sanitizeVisibleText(remote.review.summary, 'Base mesh lista para retopo y refinado.'),
    focusAreas: focusAreas.length > 0 ? focusAreas : fallback.review.focusAreas,
    retopoRecommended: remote.review.retopoRecommended !== false,
  };

  return {
    mesh: {
      vertices,
      faces,
      uvs,
      metadata,
    },
    quality,
    review,
  };
}

async function persistMesh(mesh: MeshData) {
  const root = process.env.REY30_ASSET_ROOT || path.join(process.cwd(), 'download', 'assets', 'mesh');
  await fs.mkdir(root, { recursive: true });
  const filename = `BaseMesh_${Date.now()}.json`;
  const abs = path.join(root, filename);
  await fs.writeFile(abs, JSON.stringify(mesh, null, 2), 'utf-8');
  return abs;
}

export async function POST(request: NextRequest) {
  try {
    await requireSession(request, 'EDITOR');
    const body = (await request.json()) as RequestBody;
    const prompt = body.prompt?.trim();
    if (!prompt) {
      return NextResponse.json({ success: false, error: 'Prompt requerido' }, { status: 400 });
    }

    const style = body.style?.trim() || 'realista';
    const references = Array.isArray(body.references) ? body.references.slice(0, 6) : [];
    const targetEngine = body.targetEngine || 'generic';
    const backendConfigured = isCharacterBackendConfigured();
    const fallbackEnabled = isCharacterLocalFallbackEnabled();

    if (!backendConfigured && !fallbackEnabled) {
      return NextResponse.json(
        { success: false, error: 'La generación de malla base no está disponible en esta sesión.' },
        { status: 503 }
      );
    }

    let generation: BaseMeshGeneration | null = null;

    if (backendConfigured) {
      try {
        const remote = await generateCharacterBaseMesh({
          prompt,
          style,
          targetEngine,
          includeAnimations: false,
          includeBlendshapes: false,
          references,
        });
        generation = normalizeRemoteBaseMesh(remote, { prompt, style, references, targetEngine });
      } catch (error) {
        console.error('Character base mesh backend error', error);
        if (!fallbackEnabled) {
          const status = error instanceof CharacterServiceError ? error.status : 502;
          return NextResponse.json(
            { success: false, error: 'No se pudo completar la malla base.' },
            { status }
          );
        }
      }
    }

    if (!generation) {
      generation = buildLocalBaseMesh(prompt, style, references);
    }

    const savedPath = await persistMesh(generation.mesh);
    await registerAssetFromPath({
      absPath: savedPath,
      name: path.parse(savedPath).name,
      type: 'mesh',
      source: 'character_base_mesh',
      metadata: {
        prompt,
        style,
        references,
        targetEngine,
      },
    });

    return NextResponse.json({
      success: true,
      summary: `Malla base generada (${style}).`,
      mesh: generation.mesh,
      review: generation.review,
      quality: generation.quality,
      path: path.relative(process.cwd(), savedPath).replace(/\\/g, '/'),
    });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    console.error('Base mesh error', error);
    return NextResponse.json({ success: false, error: 'No se pudo completar la malla base.' }, { status: 500 });
  }
}
