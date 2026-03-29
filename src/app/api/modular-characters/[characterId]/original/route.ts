import { NextRequest, NextResponse } from 'next/server';
import { authErrorToResponse, logSecurityEvent, requireSession } from '@/lib/security/auth';
import { readModularCharacterOriginal } from '@/lib/server/modular-character-service';

function isAuthError(error: unknown) {
  const message = String(error);
  return message.includes('UNAUTHORIZED') || message.includes('FORBIDDEN');
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ characterId: string }> }
) {
  try {
    const user = await requireSession(request, 'VIEWER');
    const { characterId } = await context.params;
    const file = await readModularCharacterOriginal({
      ownerId: user.id,
      characterId,
    });

    await logSecurityEvent({
      request,
      userId: user.id,
      action: 'modular_characters.download_original',
      status: 'allowed',
      target: characterId,
    });

    return new NextResponse(new Uint8Array(file.buffer), {
      headers: {
        'Content-Type': file.contentType,
        'Content-Disposition': `attachment; filename="${file.fileName}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    if (isAuthError(error)) return authErrorToResponse(error);
    if (String(error).includes('NOT_FOUND')) {
      return NextResponse.json({ error: 'Archivo original no encontrado.' }, { status: 404 });
    }
    console.error('[modular-characters][original][GET] failed:', error);
    return NextResponse.json(
      { error: 'No se pudo descargar el archivo original.' },
      { status: 500 }
    );
  }
}
