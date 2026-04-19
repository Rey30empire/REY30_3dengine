import { NextRequest, NextResponse } from 'next/server';
import { normalizeProjectKey } from '@/lib/server/projectLibrary';
import { rollbackAssetMetadataHistory } from '@/lib/server/asset-browser-state';
import { authErrorToResponse, logSecurityEvent, requireSession } from '@/lib/security/auth';

export async function POST(request: NextRequest) {
  let actorId: string | null = null;
  try {
    const user = await requireSession(request, 'EDITOR');
    actorId = user.id;
    const body = await request.json().catch(() => ({}));
    const entryId = typeof body?.entryId === 'string' ? body.entryId.trim() : '';
    const projectKey = normalizeProjectKey(request.headers.get('x-rey30-project'));

    if (!entryId) {
      return NextResponse.json({ error: 'entryId is required' }, { status: 400 });
    }

    const asset = await rollbackAssetMetadataHistory({
      entryId,
      userId: user.id,
      projectKey,
    });
    if (!asset) {
      return NextResponse.json({ error: 'History entry not found or rollback failed' }, { status: 404 });
    }

    await logSecurityEvent({
      request,
      userId: user.id,
      action: 'assets.history.rollback',
      status: 'allowed',
      metadata: {
        entryId,
        projectKey,
        assetId: asset.id,
        path: asset.path,
      },
    });
    return NextResponse.json({ success: true, asset });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    await logSecurityEvent({
      request,
      userId: actorId,
      action: 'assets.history.rollback',
      status: 'error',
      metadata: { error: String(error) },
    });
    console.error('[assets][history][rollback] failed:', error);
    return NextResponse.json({ error: 'Failed to rollback asset history' }, { status: 500 });
  }
}
