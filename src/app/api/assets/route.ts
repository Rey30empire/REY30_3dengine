import { NextRequest, NextResponse } from 'next/server';
import { importAssetFromUrl, listAssets, type PipelineAssetType } from '@/engine/assets/pipeline';
import { RemoteFetchError } from '@/lib/security/remote-fetch';
import { authErrorToResponse, logSecurityEvent, requireSession } from '@/lib/security/auth';

const VALID_TYPES: PipelineAssetType[] = [
  'mesh',
  'texture',
  'material',
  'modifier_preset',
  'audio',
  'video',
  'script',
  'prefab',
  'scene',
  'animation',
  'font',
  'other',
];

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession(request, 'VIEWER');
    const assets = await listAssets();
    await logSecurityEvent({
      request,
      userId: user.id,
      action: 'assets.list',
      status: 'allowed',
    });
    return NextResponse.json({ assets });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    console.error('[assets] list failed:', error);
    return NextResponse.json({ error: 'Failed to list assets' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let actorId: string | null = null;
  let requestedUrl = '';
  try {
    const user = await requireSession(request, 'EDITOR');
    actorId = user.id;
    const body = await request.json();
    const url: string | undefined = body?.url;
    const name: string | undefined = body?.name;
    const type = body?.type as PipelineAssetType | undefined;
    requestedUrl = typeof url === 'string' ? url : '';

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'url is required' }, { status: 400 });
    }

    if (type && !VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: 'Invalid asset type' }, { status: 400 });
    }

    const asset = await importAssetFromUrl({
      url,
      name,
      type,
    });

    await logSecurityEvent({
      request,
      userId: user.id,
      action: 'assets.import',
      status: 'allowed',
      metadata: {
        type: type || 'auto',
      },
    });

    return NextResponse.json({ asset });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    if (error instanceof RemoteFetchError) {
      await logSecurityEvent({
        request,
        userId: actorId,
        action: 'assets.import',
        status: 'denied',
        metadata: {
          reason: error.code,
          host: safeHostFromUrl(requestedUrl),
        },
      });
      console.warn('[security][assets][import-blocked]', {
        code: error.code,
        status: error.status,
        host: safeHostFromUrl(requestedUrl),
      });
      return NextResponse.json(
        {
          error: 'Asset URL blocked by security policy.',
          code: error.code,
        },
        { status: error.status }
      );
    }

    await logSecurityEvent({
      request,
      userId: actorId,
      action: 'assets.import',
      status: 'error',
      metadata: {
        error: String(error),
        host: safeHostFromUrl(requestedUrl),
      },
    });
    console.error('[assets] import failed:', error);
    return NextResponse.json({ error: 'Asset import failed' }, { status: 500 });
  }
}

function safeHostFromUrl(rawUrl: string): string | null {
  if (!rawUrl) return null;
  try {
    return new URL(rawUrl).hostname;
  } catch {
    return null;
  }
}
