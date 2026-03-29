import { NextRequest, NextResponse } from 'next/server';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';

const DEPRECATED_MESSAGE =
  'Endpoint legacy deshabilitado. Usa /api/ai-chat con configuración BYOK por usuario.';

export async function POST(request: NextRequest) {
  try {
    await requireSession(request, 'VIEWER');
    return NextResponse.json(
      {
        success: false,
        error: DEPRECATED_MESSAGE,
      },
      { status: 410 }
    );
  } catch (error) {
    return authErrorToResponse(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireSession(request, 'VIEWER');
    return NextResponse.json(
      {
        success: false,
        error: DEPRECATED_MESSAGE,
      },
      { status: 410 }
    );
  } catch (error) {
    return authErrorToResponse(error);
  }
}
