import { NextRequest, NextResponse } from 'next/server';
import { authErrorToResponse, logSecurityEvent, requireSession } from '@/lib/security/auth';
import { readModularCharacterPart } from '@/lib/server/modular-character-service';

function isAuthError(error: unknown) {
  const message = String(error);
  return message.includes('UNAUTHORIZED') || message.includes('FORBIDDEN');
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ characterId: string; partId: string }> }
) {
  try {
    const user = await requireSession(request, 'VIEWER');
    const { characterId, partId } = await context.params;
    const file = await readModularCharacterPart({
      ownerId: user.id,
      characterId,
      partId,
    });

    await logSecurityEvent({
      request,
      userId: user.id,
      action: 'modular_characters.download_part',
      status: 'allowed',
      target: `${characterId}:${partId}`,
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
      return NextResponse.json({ error: 'Parte modular no encontrada.' }, { status: 404 });
    }
    console.error('[modular-characters][part-download][GET] failed:', error);
    return NextResponse.json(
      { error: 'No se pudo descargar la parte solicitada.' },
      { status: 500 }
    );
  }
}
