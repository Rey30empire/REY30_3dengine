import { NextRequest, NextResponse } from 'next/server';
import { listAssetMetadataHistory } from '@/lib/server/asset-browser-state';
import { normalizeProjectKey } from '@/lib/server/projectLibrary';
import { authErrorToResponse, logSecurityEvent, requireSession } from '@/lib/security/auth';

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession(request, 'VIEWER');
    const { searchParams } = new URL(request.url);
    const assetId = (searchParams.get('id') || '').trim() || undefined;
    const assetPath = (searchParams.get('path') || '').trim().replace(/\\/g, '/') || undefined;
    const limit = Number(searchParams.get('limit') || '20');
    const projectKey = normalizeProjectKey(request.headers.get('x-rey30-project'));

    if (!assetId && !assetPath) {
      return NextResponse.json({ error: 'id or path is required' }, { status: 400 });
    }

    const entries = await listAssetMetadataHistory({
      assetId,
      path: assetPath,
      projectKey,
      limit,
    });
    await logSecurityEvent({
      request,
      userId: user.id,
      action: 'assets.history.list',
      status: 'allowed',
      metadata: {
        assetId: assetId || null,
        path: assetPath || null,
        projectKey,
        count: entries.length,
      },
    });
    return NextResponse.json({ entries });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    console.error('[assets][history] list failed:', error);
    return NextResponse.json({ error: 'Failed to list asset history' }, { status: 500 });
  }
}
