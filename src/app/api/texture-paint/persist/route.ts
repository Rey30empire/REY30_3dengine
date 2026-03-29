import { promises as fs } from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { getAssetRoot, registerAssetFromPath } from '@/engine/assets/pipeline';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import { normalizeProjectKey, sanitizeLibraryName } from '@/lib/server/projectLibrary';

function sanitizeFileStem(value: string, fallback: string) {
  const sanitized = sanitizeLibraryName(value);
  return sanitized.length > 0 ? sanitized : fallback;
}

function resolveProjectKey(request: NextRequest) {
  return normalizeProjectKey(request.headers.get('x-rey30-project'));
}

function resolveExtension(file: File) {
  const nameExt = path.extname(file.name || '').toLowerCase();
  if (nameExt === '.jpg' || nameExt === '.jpeg') return '.jpg';
  if (nameExt === '.webp') return '.webp';
  return '.png';
}

export async function POST(request: NextRequest) {
  try {
    await requireSession(request, 'EDITOR');

    const formData = await request.formData();
    const file = formData.get('file');
    const slot = String(formData.get('slot') || 'albedo').trim() || 'albedo';
    const entityName = String(formData.get('entityName') || 'Entity').trim() || 'Entity';
    const requestedName = String(formData.get('name') || '').trim();
    const projectKey = resolveProjectKey(request);

    if (!(file instanceof File) || file.size <= 0) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }

    const assetRoot = getAssetRoot();
    const dir = path.join(assetRoot, 'texture', 'paint', projectKey);
    await fs.mkdir(dir, { recursive: true });

    const baseName = sanitizeFileStem(
      requestedName || `${entityName}_${slot}`,
      'paint_texture'
    );
    const ext = resolveExtension(file);
    const fileName = `${baseName}_${Date.now()}${ext}`;
    const absolutePath = path.join(dir, fileName);
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(absolutePath, buffer);

    const asset = await registerAssetFromPath({
      absPath: absolutePath,
      name: baseName,
      type: 'texture',
      source: 'texture_paint',
      metadata: {
        texturePaint: true,
        slot,
        entityName,
        projectKey,
        mimeType: file.type || null,
      },
    });

    return NextResponse.json({
      success: true,
      projectKey,
      slot,
      asset,
    });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    console.error('[texture-paint][persist] failed:', error);
    return NextResponse.json(
      { error: 'Failed to persist texture paint asset' },
      { status: 500 }
    );
  }
}
