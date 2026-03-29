import { NextRequest, NextResponse } from 'next/server';
import { authErrorToResponse, logSecurityEvent, requireSession } from '@/lib/security/auth';
import { getModularCharacterApiResponse } from '@/lib/server/modular-character-service';

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
    const response = await getModularCharacterApiResponse({
      ownerId: user.id,
      characterId,
    });

    await logSecurityEvent({
      request,
      userId: user.id,
      action: 'modular_characters.detail',
      status: 'allowed',
      target: characterId,
    });

    return NextResponse.json(response);
  } catch (error) {
    if (isAuthError(error)) return authErrorToResponse(error);
    if (String(error).includes('NOT_FOUND')) {
      return NextResponse.json({ error: 'Personaje modular no encontrado.' }, { status: 404 });
    }
    console.error('[modular-characters][detail][GET] failed:', error);
    return NextResponse.json(
      { error: 'No se pudo cargar el personaje modular.' },
      { status: 500 }
    );
  }
}
