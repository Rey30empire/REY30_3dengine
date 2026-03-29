import { NextRequest, NextResponse } from 'next/server';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';

const REMOTE_BACKEND_URL = (process.env.REY30_CHARACTER_BACKEND_URL || '').trim();

function getBackendBaseUrl(): string {
  return REMOTE_BACKEND_URL.replace(/\/+$/, '');
}

function isAuthError(error: unknown): boolean {
  const msg = String(error);
  return msg.includes('UNAUTHORIZED') || msg.includes('FORBIDDEN');
}

function normalizeDetail(data: Record<string, unknown>, fallback: string): string {
  if (typeof data.error === 'string' && data.error.trim().length > 0) return data.error;
  if (typeof data.detail === 'string' && data.detail.trim().length > 0) return data.detail;
  return fallback;
}

export async function GET(request: NextRequest) {
  try {
    await requireSession(request, 'VIEWER');
    if (!REMOTE_BACKEND_URL) {
      return NextResponse.json(
        { success: false, error: 'Character backend no configurado (REY30_CHARACTER_BACKEND_URL).' },
        { status: 501 }
      );
    }

    const { searchParams } = new URL(request.url);
    const jobId = (searchParams.get('jobId') || '').trim();
    if (!jobId) {
      return NextResponse.json({ success: false, error: 'jobId es requerido.' }, { status: 400 });
    }

    const response = await fetch(
      `${getBackendBaseUrl()}/v1/character/jobs/${encodeURIComponent(jobId)}/result`,
      { method: 'GET', cache: 'no-store' }
    );

    const data = await response.json().catch(() => ({} as Record<string, unknown>));
    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: normalizeDetail(data, 'No se pudo obtener el resultado del job.') },
        { status: response.status }
      );
    }

    return NextResponse.json({
      success: true,
      jobId,
      packagePath: data.packagePath || '',
      payload: data.payload || {},
    });
  } catch (error) {
    if (isAuthError(error)) return authErrorToResponse(error);
    console.error('[character/jobs/result][GET] failed:', error);
    return NextResponse.json({ success: false, error: 'Error interno al obtener resultado.' }, { status: 500 });
  }
}
