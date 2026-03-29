// ============================================
// Gallery file serving route
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import { assertValidGalleryRelativePath, getGalleryMimeType } from '../shared';
import { readStoredGalleryFile } from '@/lib/server/gallery-storage';

export async function GET(request: NextRequest) {
  try {
    await requireSession(request, 'VIEWER');
    const { searchParams } = new URL(request.url);
    const relative = searchParams.get('path') || '';

    if (!relative.trim()) {
      return NextResponse.json({ error: 'path query param is required' }, { status: 400 });
    }

    const normalized = assertValidGalleryRelativePath(relative);
    const file = await readStoredGalleryFile(normalized);
    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    return new NextResponse(Uint8Array.from(file.buffer), {
      headers: {
        'Content-Type': file.metadata.contentType || getGalleryMimeType(normalized),
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    if (String(error).includes('Invalid gallery path')) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }
    console.error('[gallery][file] failed:', error);
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
}
