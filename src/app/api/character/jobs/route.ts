import { NextRequest, NextResponse } from 'next/server';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';

type CharacterJobRequest = {
  prompt?: string;
  style?: string;
  targetEngine?: 'unity' | 'unreal' | 'generic';
  includeAnimations?: boolean;
  includeBlendshapes?: boolean;
  references?: string[];
};

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

export async function POST(request: NextRequest) {
  try {
    await requireSession(request, 'EDITOR');
    if (!REMOTE_BACKEND_URL) {
      return NextResponse.json(
        { success: false, error: 'Character backend no configurado (REY30_CHARACTER_BACKEND_URL).' },
        { status: 501 }
      );
    }

    const body = (await request.json()) as CharacterJobRequest;
    const prompt = (body.prompt || '').trim();
    if (!prompt) {
      return NextResponse.json({ success: false, error: 'Prompt requerido.' }, { status: 400 });
    }

    const response = await fetch(`${getBackendBaseUrl()}/v1/character/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        style: body.style || 'realista',
        targetEngine: body.targetEngine || 'generic',
        includeAnimations: body.includeAnimations !== false,
        includeBlendshapes: body.includeBlendshapes !== false,
        references: Array.isArray(body.references) ? body.references.slice(0, 6) : [],
      }),
      cache: 'no-store',
    });

    const data = await response.json().catch(() => ({} as Record<string, unknown>));
    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: normalizeDetail(data, 'No se pudo iniciar el job de personaje.') },
        { status: response.status }
      );
    }

    return NextResponse.json({
      success: true,
      jobId: data.jobId,
      status: data.status || 'queued',
    });
  } catch (error) {
    if (isAuthError(error)) return authErrorToResponse(error);
    console.error('[character/jobs][POST] failed:', error);
    return NextResponse.json({ success: false, error: 'Error interno al iniciar job.' }, { status: 500 });
  }
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

    const response = await fetch(`${getBackendBaseUrl()}/v1/character/jobs/${encodeURIComponent(jobId)}`, {
      method: 'GET',
      cache: 'no-store',
    });

    const data = await response.json().catch(() => ({} as Record<string, unknown>));
    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: normalizeDetail(data, 'No se pudo consultar el estado del job.') },
        { status: response.status }
      );
    }

    return NextResponse.json({
      success: true,
      jobId,
      status: data.status || 'queued',
      progress: typeof data.progress === 'number' ? data.progress : 0,
      stage: typeof data.stage === 'string' ? data.stage : 'queued',
      error: typeof data.error === 'string' ? data.error : null,
      quality: typeof data.quality === 'object' && data.quality !== null ? data.quality : null,
      resultPath: typeof data.resultPath === 'string' ? data.resultPath : null,
    });
  } catch (error) {
    if (isAuthError(error)) return authErrorToResponse(error);
    console.error('[character/jobs][GET] failed:', error);
    return NextResponse.json({ success: false, error: 'Error interno al consultar job.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireSession(request, 'EDITOR');
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

    const response = await fetch(`${getBackendBaseUrl()}/v1/character/jobs/${encodeURIComponent(jobId)}`, {
      method: 'DELETE',
      cache: 'no-store',
    });

    const data = await response.json().catch(() => ({} as Record<string, unknown>));
    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: normalizeDetail(data, 'No se pudo cancelar el job de personaje.') },
        { status: response.status }
      );
    }

    return NextResponse.json({
      success: true,
      jobId,
      status: typeof data.status === 'string' ? data.status : 'canceled',
      progress: typeof data.progress === 'number' ? data.progress : 100,
      stage: typeof data.stage === 'string' ? data.stage : 'canceled',
    });
  } catch (error) {
    if (isAuthError(error)) return authErrorToResponse(error);
    console.error('[character/jobs][DELETE] failed:', error);
    return NextResponse.json({ success: false, error: 'Error interno al cancelar job.' }, { status: 500 });
  }
}
