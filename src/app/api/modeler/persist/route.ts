import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { registerAssetFromPath } from '@/engine/assets/pipeline';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';

type Vec3 = { x: number; y: number; z: number };
type Face = [number, number, number];
type Vec2 = { u: number; v: number };

type MeshData = {
  vertices: Vec3[];
  faces: Face[];
  uvs?: Vec2[];
};

type RequestBody = {
  name?: string;
  mesh?: MeshData;
};

function sanitizeName(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
}

export async function POST(request: NextRequest) {
  try {
    await requireSession(request, 'EDITOR');
    const body = (await request.json()) as RequestBody;
    const name = (body.name || 'Mesh').trim();
    const mesh = body.mesh;

    if (!mesh || !Array.isArray(mesh.vertices) || !Array.isArray(mesh.faces)) {
      return NextResponse.json({ success: false, error: 'Mesh inválido' }, { status: 400 });
    }

    const root =
      process.env.REY30_ASSET_ROOT ||
      path.join(process.cwd(), 'download', 'assets', 'mesh');

    await fs.mkdir(root, { recursive: true });
    const filename = `${sanitizeName(name) || 'Mesh'}_${Date.now()}.json`;
    const abs = path.join(root, filename);
    await fs.writeFile(abs, JSON.stringify(mesh, null, 2), 'utf-8');

    const asset = await registerAssetFromPath({
      absPath: abs,
      name: path.parse(abs).name,
      type: 'mesh',
      source: 'manual_modeler',
      metadata: {
        name,
        vertices: mesh.vertices.length,
        faces: mesh.faces.length,
      },
    });

    return NextResponse.json({
      success: true,
      path: asset.path,
      asset,
    });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
