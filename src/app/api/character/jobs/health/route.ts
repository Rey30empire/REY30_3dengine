import { NextRequest, NextResponse } from 'next/server';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import { getCharacterServiceHealth } from '@/lib/server/character-service';

function isAuthError(error: unknown): boolean {
  const msg = String(error);
  return msg.includes('UNAUTHORIZED') || msg.includes('FORBIDDEN');
}

export async function GET(request: NextRequest) {
  try {
    await requireSession(request, 'VIEWER');
    return NextResponse.json(await getCharacterServiceHealth(), { status: 200 });
  } catch (error) {
    if (isAuthError(error)) return authErrorToResponse(error);
    console.error('[character/jobs/health][GET] failed:', error);
    return NextResponse.json(
      {
        success: false,
        configured: Boolean((process.env.REY30_CHARACTER_BACKEND_URL || '').trim()),
        available: false,
        status: 'error',
        message: 'No se pudo verificar la creación de personajes.',
      },
      { status: 200 }
    );
  }
}
