import { NextRequest, NextResponse } from 'next/server';
import { authErrorToResponse, logSecurityEvent, requireSession } from '@/lib/security/auth';
import { buildModularCharacterZip } from '@/lib/server/modular-character-service';

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
    const { searchParams } = new URL(request.url);
    const selectedPartIds = (searchParams.get('partIds') || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    const archive = await buildModularCharacterZip({
      ownerId: user.id,
      characterId,
      selectedPartIds,
    });

    await logSecurityEvent({
      request,
      userId: user.id,
      action: 'modular_characters.download_zip',
      status: 'allowed',
      target: characterId,
      metadata: {
        selectedPartCount: selectedPartIds.length,
      },
    });

    return new NextResponse(archive.buffer, {
      headers: {
        'Content-Type': archive.contentType,
        'Content-Disposition': `attachment; filename="${archive.fileName}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    if (isAuthError(error)) return authErrorToResponse(error);
    if (String(error).includes('NOT_FOUND')) {
      return NextResponse.json({ error: 'Personaje modular no encontrado.' }, { status: 404 });
    }
    console.error('[modular-characters][download][GET] failed:', error);
    return NextResponse.json(
      { error: 'No se pudo generar el ZIP del personaje modular.' },
      { status: 500 }
    );
  }
}
