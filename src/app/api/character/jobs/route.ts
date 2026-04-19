import { NextRequest, NextResponse } from 'next/server';
import { normalizeProjectKey } from '@/lib/project-key';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import {
  cancelCharacterJob,
  createCharacterJob,
  getCharacterJobStatus,
  isCharacterBackendConfigured,
  normalizeCharacterTaskStatus,
  type CharacterJobRequest,
  CharacterServiceError,
} from '@/lib/server/character-service';
import {
  getCharacterGenerationJobRecord,
  patchCharacterGenerationJobRecord,
  upsertCharacterGenerationJobRecord,
} from '@/lib/server/character-generation-store';

function isAuthError(error: unknown): boolean {
  const msg = String(error);
  return msg.includes('UNAUTHORIZED') || msg.includes('FORBIDDEN');
}

function serviceUnavailableResponse() {
  return NextResponse.json(
    { success: false, error: 'La creación de personajes no está disponible en esta sesión.' },
    { status: 501 }
  );
}

function sanitizeServiceError(error: unknown, fallback: string) {
  if (error instanceof CharacterServiceError) {
    return NextResponse.json({ success: false, error: fallback }, { status: error.status });
  }
  return NextResponse.json({ success: false, error: fallback }, { status: 500 });
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSession(request, 'EDITOR');
    if (!isCharacterBackendConfigured()) {
      return serviceUnavailableResponse();
    }

    const body = (await request.json()) as CharacterJobRequest;
    const prompt = (body.prompt || '').trim();
    if (!prompt) {
      return NextResponse.json({ success: false, error: 'Prompt requerido.' }, { status: 400 });
    }

    const job = await createCharacterJob({
      prompt,
      style: body.style || 'realista',
      targetEngine: body.targetEngine || 'generic',
      includeAnimations: body.includeAnimations !== false,
      includeBlendshapes: body.includeBlendshapes !== false,
      references: Array.isArray(body.references) ? body.references.slice(0, 6) : [],
    });

    await upsertCharacterGenerationJobRecord({
      jobId: job.jobId,
      userId: user.id,
      projectKey: normalizeProjectKey(request.headers.get('x-rey30-project')),
      prompt,
      style: body.style || 'realista',
      targetEngine: body.targetEngine || 'generic',
      includeAnimations: body.includeAnimations !== false,
      includeBlendshapes: body.includeBlendshapes !== false,
      references: Array.isArray(body.references) ? body.references.slice(0, 6) : [],
      status: job.status,
      progress: job.status === 'queued' ? 0 : 5,
      stage: job.status,
    });

    return NextResponse.json({
      success: true,
      taskId: job.jobId,
      jobId: job.jobId,
      status: job.status,
    });
  } catch (error) {
    if (isAuthError(error)) return authErrorToResponse(error);
    console.error('[character/jobs][POST] failed:', error);
    return sanitizeServiceError(error, 'No se pudo iniciar la creación del personaje.');
  }
}

export async function GET(request: NextRequest) {
  try {
    await requireSession(request, 'VIEWER');

    const { searchParams } = new URL(request.url);
    const jobId = (searchParams.get('jobId') || '').trim();
    if (!jobId) {
      return NextResponse.json({ success: false, error: 'jobId es requerido.' }, { status: 400 });
    }

    const stored = await getCharacterGenerationJobRecord(jobId);
    if (!isCharacterBackendConfigured()) {
      if (stored) {
        return NextResponse.json({
          success: true,
          status: normalizeCharacterTaskStatus(stored.status),
          progress: stored.progress,
          stage: stored.stage,
          error: stored.status === 'failed' ? 'No se pudo completar el personaje.' : null,
          asset: stored.asset,
        });
      }
      return serviceUnavailableResponse();
    }

    const status = await getCharacterJobStatus(jobId);
    await patchCharacterGenerationJobRecord(jobId, (current) => ({
      ...current,
      status: status.status,
      progress: status.progress,
      stage: status.stage,
      error: status.error,
    }));

    const refreshed = await getCharacterGenerationJobRecord(jobId);
    return NextResponse.json({
      success: true,
      status: normalizeCharacterTaskStatus(status.status),
      progress: status.progress,
      stage: status.stage,
      error: status.status === 'failed' ? 'No se pudo completar el personaje.' : null,
      asset: refreshed?.asset ?? stored?.asset ?? null,
    });
  } catch (error) {
    if (isAuthError(error)) return authErrorToResponse(error);
    const { searchParams } = new URL(request.url);
    const jobId = (searchParams.get('jobId') || '').trim();
    const stored = jobId ? await getCharacterGenerationJobRecord(jobId).catch(() => null) : null;
    if (stored) {
      return NextResponse.json({
        success: true,
        status: normalizeCharacterTaskStatus(stored.status),
        progress: stored.progress,
        stage: stored.stage,
        error: stored.status === 'failed' ? 'No se pudo completar el personaje.' : null,
        asset: stored.asset,
      });
    }
    console.error('[character/jobs][GET] failed:', error);
    return sanitizeServiceError(error, 'No se pudo consultar el estado del personaje.');
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireSession(request, 'EDITOR');
    if (!isCharacterBackendConfigured()) {
      return serviceUnavailableResponse();
    }

    const { searchParams } = new URL(request.url);
    const jobId = (searchParams.get('jobId') || '').trim();
    if (!jobId) {
      return NextResponse.json({ success: false, error: 'jobId es requerido.' }, { status: 400 });
    }

    const status = await cancelCharacterJob(jobId);
    await patchCharacterGenerationJobRecord(jobId, (current) => ({
      ...current,
      status: status.status,
      progress: status.progress,
      stage: status.stage,
      error: null,
    }));
    return NextResponse.json({
      success: true,
      status: status.status,
      progress: status.progress,
      stage: status.stage,
    });
  } catch (error) {
    if (isAuthError(error)) return authErrorToResponse(error);
    console.error('[character/jobs][DELETE] failed:', error);
    return sanitizeServiceError(error, 'No se pudo cancelar la creación del personaje.');
  }
}
