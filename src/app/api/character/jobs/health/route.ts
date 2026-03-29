import { NextRequest, NextResponse } from 'next/server';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';

const REMOTE_BACKEND_URL = (process.env.REY30_CHARACTER_BACKEND_URL || '').trim();

function isAuthError(error: unknown): boolean {
  const msg = String(error);
  return msg.includes('UNAUTHORIZED') || msg.includes('FORBIDDEN');
}

export async function GET(request: NextRequest) {
  try {
    await requireSession(request, 'VIEWER');

    if (!REMOTE_BACKEND_URL) {
      return NextResponse.json(
        {
          success: false,
          configured: false,
          available: false,
          status: 'not_configured',
          message: 'REY30_CHARACTER_BACKEND_URL no configurado.',
        },
        { status: 200 }
      );
    }

    const base = REMOTE_BACKEND_URL.replace(/\/+$/, '');
    const res = await fetch(`${base}/healthz`, { method: 'GET', cache: 'no-store' });
    const data = await res.json().catch(() => ({} as Record<string, unknown>));

    if (!res.ok) {
      return NextResponse.json(
        {
          success: false,
          configured: true,
          available: false,
          status: 'down',
          message: typeof data.detail === 'string' ? data.detail : 'Backend no disponible.',
        },
        { status: 200 }
      );
    }

    return NextResponse.json({
      success: true,
      configured: true,
      available: true,
      status: typeof data.status === 'string' ? data.status : 'ok',
      profile: typeof data.profile === 'string' ? data.profile : 'unknown',
      mode: typeof data.mode === 'string' ? data.mode : 'unknown',
      message: 'Backend de personajes operativo.',
    });
  } catch (error) {
    if (isAuthError(error)) return authErrorToResponse(error);
    console.error('[character/jobs/health][GET] failed:', error);
    return NextResponse.json(
      {
        success: false,
        configured: Boolean(REMOTE_BACKEND_URL),
        available: false,
        status: 'error',
        message: 'Error interno consultando health del backend.',
      },
      { status: 200 }
    );
  }
}
