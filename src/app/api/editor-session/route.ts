import { NextRequest, NextResponse } from 'next/server';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import { isEditorSessionSnapshot } from '@/lib/editor-session-snapshot';
import { normalizeProjectKey } from '@/lib/project-key';
import {
  removeEditorSessionRecord,
  resolveEditorSessionRecord,
  upsertClientEditorSession,
} from '@/lib/server/editor-session-bridge';

function readProjectKey(request: NextRequest, fallback: string) {
  return normalizeProjectKey(request.headers.get('x-rey30-project') || fallback);
}

function isAuthError(error: unknown): boolean {
  const value = String(error || '');
  return value.includes('UNAUTHORIZED') || value.includes('FORBIDDEN');
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession(request, 'EDITOR');
    const sessionId = request.nextUrl.searchParams.get('sessionId');
    const projectKey = request.nextUrl.searchParams.get('projectKey');
    const includeSnapshot = request.nextUrl.searchParams.get('includeSnapshot') === '1';
    const session = resolveEditorSessionRecord({
      userId: user.id,
      preferredSessionId: sessionId,
      projectKey,
    });

    return NextResponse.json({
      success: true,
      active: Boolean(session),
      session: session
        ? {
            sessionId: session.sessionId,
            projectKey: session.projectKey,
            serverMutationVersion: session.serverMutationVersion,
            lastClientSyncAt: session.lastClientSyncAt,
            lastServerMutationAt: session.lastServerMutationAt,
          }
        : null,
      snapshot: includeSnapshot && session ? session.snapshot : undefined,
    });
  } catch (error) {
    if (isAuthError(error)) {
      return authErrorToResponse(error);
    }
    return NextResponse.json(
      {
        success: false,
        error: 'No se pudo consultar la sesión activa del editor.',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSession(request, 'EDITOR');
    const body = (await request.json().catch(() => ({}))) as {
      sessionId?: string;
      knownServerMutationVersion?: number;
      snapshot?: unknown;
    };

    if (!isEditorSessionSnapshot(body.snapshot)) {
      return NextResponse.json(
        {
          success: false,
          error: 'La sesión del editor no es válida.',
        },
        { status: 400 }
      );
    }

    const result = await upsertClientEditorSession({
      sessionId: body.sessionId,
      userId: user.id,
      projectKey: readProjectKey(request, body.snapshot.projectName),
      snapshot: body.snapshot,
      knownServerMutationVersion:
        typeof body.knownServerMutationVersion === 'number' && Number.isFinite(body.knownServerMutationVersion)
          ? Math.max(0, Math.floor(body.knownServerMutationVersion))
          : 0,
    });

    return NextResponse.json({
      success: true,
      accepted: result.accepted,
      needsRefresh: result.needsRefresh,
      sessionId: result.record.sessionId,
      projectKey: result.record.projectKey,
      serverMutationVersion: result.record.serverMutationVersion,
      snapshot: result.needsRefresh ? result.record.snapshot : undefined,
    });
  } catch (error) {
    if (isAuthError(error)) {
      return authErrorToResponse(error);
    }
    return NextResponse.json(
      {
        success: false,
        error: 'No se pudo sincronizar la sesión del editor.',
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireSession(request, 'EDITOR');
    const sessionId = request.nextUrl.searchParams.get('sessionId');
    const removed = removeEditorSessionRecord({
      userId: user.id,
      sessionId,
    });

    return NextResponse.json({
      success: true,
      removed,
    });
  } catch (error) {
    if (isAuthError(error)) {
      return authErrorToResponse(error);
    }
    return NextResponse.json(
      {
        success: false,
        error: 'No se pudo cerrar la sesión del editor.',
      },
      { status: 500 }
    );
  }
}
