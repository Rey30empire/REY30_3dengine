// ============================================
// Gallery API (filesystem or Netlify Blobs)
// ============================================

import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import {
  assertValidGalleryRelativePath,
  getGalleryMimeType,
  sanitizeGallerySegment,
} from './shared';
import {
  deleteStoredGalleryFile,
  listStoredGalleryFiles,
  type StoredGalleryFile,
  upsertStoredGalleryFile,
} from '@/lib/server/gallery-storage';

export async function GET(request: NextRequest) {
  try {
    await requireSession(request, 'VIEWER');
    const items = await listStoredGalleryFiles();
    return NextResponse.json({ items });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    console.error('[gallery][GET] failed:', error);
    return NextResponse.json({ error: 'Failed to load gallery', items: [] }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireSession(request, 'EDITOR');
    const formData = await request.formData();
    const requestedCategory = sanitizeGallerySegment(String(formData.get('category') || 'general'));
    const inputFiles = formData.getAll('files').filter((entry) => entry instanceof File) as File[];

    if (inputFiles.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    const written: StoredGalleryFile[] = [];
    for (const [index, file] of inputFiles.entries()) {
      const safeName = `${Date.now()}_${index}_${sanitizeGallerySegment(file.name)}`;
      const relativePath = path.posix.join(requestedCategory, safeName);
      const stored = await upsertStoredGalleryFile({
        relativePath,
        data: Buffer.from(await file.arrayBuffer()),
        contentType: file.type || getGalleryMimeType(safeName),
      });
      written.push(stored);
    }

    return NextResponse.json({ items: written });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    console.error('[gallery][POST] failed:', error);
    return NextResponse.json({ error: 'Failed to upload files' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireSession(request, 'EDITOR');
    const { searchParams } = new URL(request.url);
    const filePathParam = searchParams.get('path');

    if (!filePathParam) {
      return NextResponse.json({ error: 'path query param is required' }, { status: 400 });
    }

    const normalized = assertValidGalleryRelativePath(filePathParam);
    await deleteStoredGalleryFile(normalized);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    if (String(error).includes('Invalid gallery path')) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }
    console.error('[gallery][DELETE] failed:', error);
    return NextResponse.json({ error: 'Failed to delete file' }, { status: 500 });
  }
}
