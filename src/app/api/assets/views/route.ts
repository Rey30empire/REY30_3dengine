import { NextRequest, NextResponse } from 'next/server';
import {
  deleteAssetBrowserView,
  listAssetBrowserViews,
  upsertAssetBrowserView,
} from '@/lib/server/asset-browser-state';
import { normalizeProjectKey } from '@/lib/server/projectLibrary';
import { authErrorToResponse, logSecurityEvent, requireSession } from '@/lib/security/auth';

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession(request, 'VIEWER');
    const projectKey = normalizeProjectKey(request.headers.get('x-rey30-project'));
    const views = await listAssetBrowserViews({
      userId: user.id,
      projectKey,
    });
    await logSecurityEvent({
      request,
      userId: user.id,
      action: 'assets.views.list',
      status: 'allowed',
      metadata: { projectKey, count: views.length },
    });
    return NextResponse.json({ views });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    console.error('[assets][views] list failed:', error);
    return NextResponse.json({ error: 'Failed to list asset views' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let actorId: string | null = null;
  try {
    const user = await requireSession(request, 'EDITOR');
    actorId = user.id;
    const projectKey = normalizeProjectKey(request.headers.get('x-rey30-project'));
    const body = await request.json().catch(() => ({}));
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const id = typeof body?.id === 'string' ? body.id.trim() : undefined;
    const filter = body?.filter && typeof body.filter === 'object' ? body.filter : {};

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const view = await upsertAssetBrowserView({
      id,
      userId: user.id,
      projectKey,
      name,
      filter,
    });
    await logSecurityEvent({
      request,
      userId: user.id,
      action: 'assets.views.save',
      status: 'allowed',
      metadata: { projectKey, viewId: view.id },
    });
    return NextResponse.json({ success: true, view });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    await logSecurityEvent({
      request,
      userId: actorId,
      action: 'assets.views.save',
      status: 'error',
      metadata: { error: String(error) },
    });
    console.error('[assets][views] save failed:', error);
    return NextResponse.json({ error: 'Failed to save asset view' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  let actorId: string | null = null;
  try {
    const user = await requireSession(request, 'EDITOR');
    actorId = user.id;
    const projectKey = normalizeProjectKey(request.headers.get('x-rey30-project'));
    const { searchParams } = new URL(request.url);
    const id = (searchParams.get('id') || '').trim();
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const deleted = await deleteAssetBrowserView({
      id,
      userId: user.id,
      projectKey,
    });
    if (!deleted) {
      return NextResponse.json({ error: 'Saved view not found' }, { status: 404 });
    }

    await logSecurityEvent({
      request,
      userId: user.id,
      action: 'assets.views.delete',
      status: 'allowed',
      metadata: { projectKey, viewId: id },
    });
    return NextResponse.json({ success: true, id });
  } catch (error) {
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    await logSecurityEvent({
      request,
      userId: actorId,
      action: 'assets.views.delete',
      status: 'error',
      metadata: { error: String(error) },
    });
    console.error('[assets][views] delete failed:', error);
    return NextResponse.json({ error: 'Failed to delete asset view' }, { status: 500 });
  }
}
