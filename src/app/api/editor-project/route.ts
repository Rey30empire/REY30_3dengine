import { NextRequest, NextResponse } from 'next/server';
import type { EditorProjectSaveData } from '@/engine/serialization';
import { DEFAULT_EDITOR_PROJECT_SAVE_SLOT, isEditorProjectSaveData } from '@/engine/serialization';
import { normalizeProjectKey } from '@/lib/project-key';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import {
  buildEditorProjectRecord,
  readEditorProjectRecord,
  removeEditorProjectRecord,
  withEditorProjectWriteLock,
  writeEditorProjectRecord,
} from '@/lib/server/editor-project-storage';

function readProjectKey(request: NextRequest, fallback: string | null | undefined) {
  const fromHeader = request.headers.get('x-rey30-project');
  const fromQuery = request.nextUrl.searchParams.get('projectKey');
  return normalizeProjectKey(fromHeader || fromQuery || fallback);
}

function readSlot(request: NextRequest, fallback?: string | null) {
  return request.nextUrl.searchParams.get('slot')?.trim() || fallback?.trim() || DEFAULT_EDITOR_PROJECT_SAVE_SLOT;
}

function isAuthError(error: unknown): boolean {
  const value = String(error || '');
  return value.includes('UNAUTHORIZED') || value.includes('FORBIDDEN');
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession(request, 'EDITOR');
    const slot = readSlot(request);
    const projectKey = readProjectKey(request, null);
    const includeSave = request.nextUrl.searchParams.get('includeSave') === '1';
    const record = readEditorProjectRecord({
      userId: user.id,
      projectKey,
      slot,
    });

    return NextResponse.json({
      success: true,
      active: Boolean(record),
      projectKey,
      slot,
      summary: record?.summary ?? null,
      updatedAt: record?.updatedAt ?? null,
      saveData: includeSave ? record?.saveData : undefined,
    });
  } catch (error) {
    if (isAuthError(error)) {
      return authErrorToResponse(error);
    }
    return NextResponse.json(
      {
        success: false,
        error: 'No se pudo consultar el save remoto del proyecto.',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSession(request, 'EDITOR');
    const body = (await request.json().catch(() => ({}))) as {
      slot?: string;
      saveData?: unknown;
    };

    if (!isEditorProjectSaveData(body.saveData)) {
      return NextResponse.json(
        {
          success: false,
          error: 'El save remoto del proyecto no es válido.',
        },
        { status: 400 }
      );
    }

    const slot = readSlot(request, body.slot);
    const projectKey = readProjectKey(
      request,
      body.saveData.custom.snapshot.session.projectName || body.saveData.playerName || undefined
    );

    const record = await withEditorProjectWriteLock({
      userId: user.id,
      projectKey,
      slot,
      work: async () => {
        const next = buildEditorProjectRecord({
          userId: user.id,
          projectKey,
          slot,
          saveData: body.saveData as EditorProjectSaveData,
        });
        writeEditorProjectRecord(next);
        return next;
      },
    });

    return NextResponse.json({
      success: true,
      projectKey: record.projectKey,
      slot: record.slot,
      summary: record.summary,
      updatedAt: record.updatedAt,
    });
  } catch (error) {
    if (isAuthError(error)) {
      return authErrorToResponse(error);
    }
    return NextResponse.json(
      {
        success: false,
        error: 'No se pudo guardar el proyecto en el backend.',
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireSession(request, 'EDITOR');
    const slot = readSlot(request);
    const projectKey = readProjectKey(request, null);
    const removed = await withEditorProjectWriteLock({
      userId: user.id,
      projectKey,
      slot,
      work: async () =>
        removeEditorProjectRecord({
          userId: user.id,
          projectKey,
          slot,
        }),
    });

    return NextResponse.json({
      success: true,
      removed,
      projectKey,
      slot,
    });
  } catch (error) {
    if (isAuthError(error)) {
      return authErrorToResponse(error);
    }
    return NextResponse.json(
      {
        success: false,
        error: 'No se pudo eliminar el save remoto del proyecto.',
      },
      { status: 500 }
    );
  }
}
