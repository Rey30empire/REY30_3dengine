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

function decodeDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:(image\/png|image\/jpeg|image\/webp);base64,(.+)$/);
  if (!match) {
    return null;
  }

  const mimeType = match[1];
  const base64 = match[2];
  const ext = mimeType === 'image/jpeg' ? '.jpg' : mimeType === 'image/webp' ? '.webp' : '.png';
  return {
    mimeType,
    ext,
    buffer: Buffer.from(base64, 'base64'),
  };
}

export async function POST(request: NextRequest) {
  try {
    await requireSession(request, 'EDITOR');

    const body = await request.json().catch(() => ({}));
    const mode = body?.mode === 'video_job' ? 'video_job' : 'still';
    const projectKey = resolveProjectKey(request);
    const sceneName = String(body?.sceneName || 'Scene').trim() || 'Scene';
    const requestedName = String(body?.name || '').trim();
    const assetRoot = getAssetRoot();

    if (mode === 'still') {
      const decoded = decodeDataUrl(String(body?.dataUrl || ''));
      if (!decoded || decoded.buffer.length === 0) {
        return NextResponse.json({ error: 'dataUrl image is required' }, { status: 400 });
      }

      const dir = path.join(assetRoot, 'texture', 'compositor', projectKey);
      await fs.mkdir(dir, { recursive: true });

      const baseName = sanitizeFileStem(requestedName || `${sceneName}_still`, 'compositor_still');
      const absolutePath = path.join(dir, `${baseName}_${Date.now()}${decoded.ext}`);
      await fs.writeFile(absolutePath, decoded.buffer);

      const asset = await registerAssetFromPath({
        absPath: absolutePath,
        name: baseName,
        type: 'texture',
        source: 'compositor_still',
        metadata: {
          compositorStill: true,
          sceneName,
          projectKey,
          mimeType: decoded.mimeType,
        },
      });

      return NextResponse.json({
        success: true,
        projectKey,
        asset,
      });
    }

    const documentJson = String(body?.documentJson || '').trim();
    if (!documentJson) {
      return NextResponse.json({ error: 'documentJson is required' }, { status: 400 });
    }

    const dir = path.join(assetRoot, 'video', 'jobs', projectKey);
    await fs.mkdir(dir, { recursive: true });

    const baseName = sanitizeFileStem(requestedName || `${sceneName}_video_job`, 'video_job');
    const absolutePath = path.join(dir, `${baseName}_${Date.now()}.json`);
    await fs.writeFile(absolutePath, documentJson, 'utf-8');

    const asset = await registerAssetFromPath({
      absPath: absolutePath,
      name: baseName,
      type: 'video',
      source: 'compositor_video_job',
      metadata: {
        compositorVideoJob: true,
        sceneName,
        projectKey,
        format: 'json',
      },
    });

    return NextResponse.json({
      success: true,
      projectKey,
      asset,
    });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    console.error('[compositor][persist] failed:', error);
    return NextResponse.json(
      { error: 'Failed to persist compositor asset' },
      { status: 500 }
    );
  }
}
