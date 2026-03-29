import { promises as fs } from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { listAssets } from '@/engine/assets/pipeline';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';

function getMimeType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.bmp':
      return 'image/bmp';
    case '.svg':
      return 'image/svg+xml';
    case '.hdr':
      return 'image/vnd.radiance';
    case '.exr':
      return 'image/x-exr';
    case '.glb':
      return 'model/gltf-binary';
    case '.gltf':
      return 'model/gltf+json';
    case '.json':
      return 'application/json';
    case '.mp3':
      return 'audio/mpeg';
    case '.wav':
      return 'audio/wav';
    case '.ogg':
      return 'audio/ogg';
    case '.mp4':
      return 'video/mp4';
    case '.webm':
      return 'video/webm';
    default:
      return 'application/octet-stream';
  }
}

export async function GET(request: NextRequest) {
  try {
    await requireSession(request, 'VIEWER');

    const { searchParams } = new URL(request.url);
    const requestedPath = (searchParams.get('path') || '').trim().replace(/\\/g, '/');
    const requestedId = (searchParams.get('id') || '').trim();

    if (!requestedPath && !requestedId) {
      return NextResponse.json(
        { error: 'path or id query param is required' },
        { status: 400 }
      );
    }

    const assets = await listAssets();
    const asset = assets.find(
      (entry) =>
        (requestedId && entry.id === requestedId) ||
        (requestedPath && entry.path === requestedPath)
    );

    if (!asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    const filePath = path.resolve(process.cwd(), asset.path);
    const relativeToCwd = path.relative(process.cwd(), filePath);
    if (relativeToCwd.startsWith('..') || path.isAbsolute(relativeToCwd)) {
      return NextResponse.json({ error: 'Invalid asset path' }, { status: 400 });
    }

    const content = await fs.readFile(filePath);
    return new NextResponse(content, {
      headers: {
        'Content-Type': getMimeType(asset.path),
        'Cache-Control': asset.type === 'texture' ? 'private, max-age=300' : 'no-store',
      },
    });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    console.error('[assets][file] failed:', error);
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
}
