import { NextRequest, NextResponse } from 'next/server';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import {
  getCharacterJobResult,
  isCharacterBackendConfigured,
  CharacterServiceError,
} from '@/lib/server/character-service';
import {
  getCharacterGenerationJobRecord,
  patchCharacterGenerationJobRecord,
} from '@/lib/server/character-generation-store';

function isAuthError(error: unknown): boolean {
  const msg = String(error);
  return msg.includes('UNAUTHORIZED') || msg.includes('FORBIDDEN');
}

export async function GET(request: NextRequest) {
  try {
    await requireSession(request, 'EDITOR');

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
          packagePath: stored.remotePackagePath,
          packageDirectoryPath: stored.packageDirectoryPath,
          asset: stored.asset,
          packageSummary: stored.packageSummary,
          payload: stored.asset ? { asset: stored.asset, summary: stored.packageSummary } : null,
        });
      }
      return NextResponse.json(
        { success: false, error: 'La creación de personajes no está disponible en esta sesión.' },
        { status: 501 }
      );
    }

    const result = await getCharacterJobResult(jobId);
    await patchCharacterGenerationJobRecord(jobId, (current) => ({
      ...current,
      remotePackagePath: result.packagePath || current.remotePackagePath,
    }));
    const refreshed = await getCharacterGenerationJobRecord(jobId);

    return NextResponse.json({
      success: true,
      packagePath: result.packagePath,
      packageDirectoryPath: refreshed?.packageDirectoryPath ?? stored?.packageDirectoryPath ?? null,
      asset: refreshed?.asset ?? stored?.asset ?? null,
      packageSummary: refreshed?.packageSummary ?? stored?.packageSummary ?? null,
      payload: result.payload,
    });
  } catch (error) {
    if (isAuthError(error)) return authErrorToResponse(error);
    console.error('[character/jobs/result][GET] failed:', error);
    if (error instanceof CharacterServiceError) {
      return NextResponse.json(
        { success: false, error: 'No se pudo obtener el resultado del personaje.' },
        { status: error.status }
      );
    }
    return NextResponse.json(
      { success: false, error: 'No se pudo obtener el resultado del personaje.' },
      { status: 500 }
    );
  }
}
