import { NextRequest, NextResponse } from 'next/server';
import type { ModularCharacterCreatePayload } from '@/engine/modular-character';
import { authErrorToResponse, logSecurityEvent, requireSession } from '@/lib/security/auth';
import { createModularCharacter, listModularCharacters } from '@/lib/server/modular-character-service';
import { validateIncomingSourceFiles } from './shared';

function isAuthError(error: unknown) {
  const message = String(error);
  return message.includes('UNAUTHORIZED') || message.includes('FORBIDDEN');
}

function readFiles(formData: FormData, key: string) {
  return formData.getAll(key).filter((entry): entry is File => entry instanceof File);
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession(request, 'VIEWER');
    const response = await listModularCharacters(user.id);
    await logSecurityEvent({
      request,
      userId: user.id,
      action: 'modular_characters.list',
      status: 'allowed',
    });
    return NextResponse.json(response);
  } catch (error) {
    if (isAuthError(error)) return authErrorToResponse(error);
    console.error('[modular-characters][GET] failed:', error);
    return NextResponse.json(
      { error: 'No se pudo cargar la biblioteca modular.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSession(request, 'EDITOR');
    const formData = await request.formData();
    const payloadRaw = formData.get('payload');
    if (typeof payloadRaw !== 'string' || payloadRaw.trim().length === 0) {
      return NextResponse.json({ error: 'payload es requerido.' }, { status: 400 });
    }

    const payload = JSON.parse(payloadRaw) as ModularCharacterCreatePayload;
    const sourceFiles = readFiles(formData, 'sourceFiles');
    const partFiles = readFiles(formData, 'partFiles');
    const previewFile = readFiles(formData, 'previewFile')[0] || null;

    const validation = validateIncomingSourceFiles(sourceFiles);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.message }, { status: 400 });
    }

    if (!payload.name?.trim()) {
      return NextResponse.json({ error: 'Debes indicar un nombre de personaje.' }, { status: 400 });
    }

    if (!payload.assignments || payload.assignments.length === 0) {
      return NextResponse.json(
        { error: 'Debes guardar al menos una parte modular antes de exportar.' },
        { status: 400 }
      );
    }

    if (partFiles.length === 0) {
      return NextResponse.json(
        { error: 'No se recibieron archivos GLB fragmentados para guardar.' },
        { status: 400 }
      );
    }

    const response = await createModularCharacter({
      ownerId: user.id,
      payload,
      sourceFiles,
      partFiles,
      previewFile,
    });

    await logSecurityEvent({
      request,
      userId: user.id,
      action: 'modular_characters.create',
      status: 'allowed',
      metadata: {
        characterName: payload.name,
        assignmentCount: payload.assignments.length,
        sourceFormat: payload.analysis.sourceFormat,
      },
    });

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    if (isAuthError(error)) return authErrorToResponse(error);
    console.error('[modular-characters][POST] failed:', error);
    return NextResponse.json(
      { error: 'No se pudo guardar el personaje modular.' },
      { status: 500 }
    );
  }
}
