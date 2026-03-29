// ============================================
// Character Base Mesh Generator (Level 2)
// Accepts text + reference URLs and produces a procedural base mesh JSON.
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { registerAssetFromPath } from '@/engine/assets/pipeline';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';

type Vec3 = { x: number; y: number; z: number };
type Face = [number, number, number];
type MeshData = {
  vertices: Vec3[];
  faces: Face[];
  uvs?: { u: number; v: number }[];
  metadata: Record<string, unknown>;
};

type RequestBody = {
  prompt: string;
  style?: string;
  references?: string[];
};

function addBox(center: Vec3, size: Vec3) {
  const { x, y, z } = center;
  const { x: sx, y: sy, z: sz } = size;
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
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
    [0, 1, 2], [0, 2, 3], // back
    [4, 6, 5], [4, 7, 6], // front
    [4, 5, 1], [4, 1, 0], // bottom
    [3, 2, 6], [3, 6, 7], // top
    [1, 5, 6], [1, 6, 2], // right
    [4, 0, 3], [4, 3, 7], // left
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

function planarUVs(mesh: { vertices: Vec3[] }): { u: number; v: number }[] {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  mesh.vertices.forEach((v) => {
    minX = Math.min(minX, v.x);
    maxX = Math.max(maxX, v.x);
    minZ = Math.min(minZ, v.z);
    maxZ = Math.max(maxZ, v.z);
  });
  const spanX = maxX - minX || 1;
  const spanZ = maxZ - minZ || 1;
  return mesh.vertices.map((v) => ({
    u: (v.x - minX) / spanX,
    v: (v.z - minZ) / spanZ,
  }));
}

function buildBaseMesh(prompt: string, style: string | undefined, references: string[]): MeshData {
  const parts: Array<{ verts: Vec3[]; faces: Face[] }> = [];
  // Torso
  parts.push(addBox({ x: 0, y: 0.85, z: 0 }, { x: 0.55, y: 0.8, z: 0.32 }));
  // Head
  parts.push(addBox({ x: 0, y: 1.35, z: 0 }, { x: 0.32, y: 0.32, z: 0.28 }));
  // Legs
  parts.push(addBox({ x: -0.15, y: 0.35, z: 0 }, { x: 0.16, y: 0.7, z: 0.18 }));
  parts.push(addBox({ x: 0.15, y: 0.35, z: 0 }, { x: 0.16, y: 0.7, z: 0.18 }));
  // Arms
  parts.push(addBox({ x: -0.38, y: 0.95, z: 0 }, { x: 0.14, y: 0.55, z: 0.16 }));
  parts.push(addBox({ x: 0.38, y: 0.95, z: 0 }, { x: 0.14, y: 0.55, z: 0.16 }));
  // Hands
  parts.push(addBox({ x: -0.38, y: 0.62, z: 0 }, { x: 0.14, y: 0.16, z: 0.16 }));
  parts.push(addBox({ x: 0.38, y: 0.62, z: 0 }, { x: 0.14, y: 0.16, z: 0.16 }));
  // Feet
  parts.push(addBox({ x: -0.15, y: 0.0, z: 0.05 }, { x: 0.18, y: 0.14, z: 0.28 }));
  parts.push(addBox({ x: 0.15, y: 0.0, z: 0.05 }, { x: 0.18, y: 0.14, z: 0.28 }));

  const merged = mergeParts(parts);
  const uvs = planarUVs(merged);

  return {
    vertices: merged.vertices,
    faces: merged.faces,
    uvs,
    metadata: {
      prompt,
      style: style || 'auto',
      references,
      notes: 'Base mesh procedural biped; listo para retopo y detallado.',
    },
  };
}

async function persistMesh(mesh: MeshData, prompt: string) {
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

    const style = body.style || 'realista';
    const references = Array.isArray(body.references) ? body.references.slice(0, 4) : [];

    const mesh = buildBaseMesh(prompt, style, references);
    const pathSaved = await persistMesh(mesh, prompt);
    await registerAssetFromPath({
      absPath: pathSaved,
      name: path.parse(pathSaved).name,
      type: 'mesh',
      source: 'ai_level2_base_mesh',
      metadata: {
        prompt,
        style,
        references,
      },
    });

    const quality = {
      vertices: mesh.vertices.length,
      triangles: mesh.faces.length,
      issues: ['Revisar proporciones y realizar retopo si es necesario'],
    };

    return NextResponse.json({
      success: true,
      summary: `Malla base generada (estilo ${style}).`,
      mesh,
      path: path.relative(process.cwd(), pathSaved).replace(/\\/g, '/'),
      quality,
    });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    console.error('Base mesh error', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
