// ============================================
// Gallery file serving route
// ============================================

import { promises as fs } from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';

const ROOT =
  process.env.REY30_GALLERY_ROOT ||
  path.join(process.env.LOCALAPPDATA || process.cwd(), 'REY30_gallery_store');

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
    case '.mp4':
      return 'video/mp4';
    case '.webm':
      return 'video/webm';
    case '.mp3':
      return 'audio/mpeg';
    case '.wav':
      return 'audio/wav';
    case '.glb':
      return 'model/gltf-binary';
    case '.gltf':
      return 'model/gltf+json';
    case '.json':
      return 'application/json';
    case '.ts':
      return 'text/plain; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}

export async function GET(request: NextRequest) {
  try {
    await requireSession(request, 'VIEWER');
    const { searchParams } = new URL(request.url);
    const relative = (searchParams.get('path') || '').replace(/^\/+/, '');

    if (!relative) {
      return NextResponse.json({ error: 'path query param is required' }, { status: 400 });
    }

    const filePath = path.resolve(ROOT, relative);
    const relativeToRoot = path.relative(ROOT, filePath);
    if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    const content = await fs.readFile(filePath);
    return new NextResponse(content, {
      headers: {
        'Content-Type': getMimeType(relative),
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    console.error('[gallery][file] failed:', error);
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
}
