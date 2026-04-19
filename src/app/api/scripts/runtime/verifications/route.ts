import { NextRequest, NextResponse } from 'next/server';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import {
  getScriptRuntimeArtifactVerification,
  listScriptRuntimeArtifactVerifications,
} from '@/lib/server/script-runtime-artifacts';
import { assertValidScriptRelativePath, isInvalidScriptPathError } from '../../shared';

const SCRIPT_RUNTIME_VERIFICATIONS_FAILED_MESSAGE =
  'No se pudo leer el historial de verificación del runtime.';
const SCRIPT_RUNTIME_VERIFICATIONS_PATH_INVALID_MESSAGE = 'La ruta del script no es valida.';

function isAuthError(error: unknown): boolean {
  const text = String(error);
  return text.includes('UNAUTHORIZED') || text.includes('FORBIDDEN');
}

export async function GET(request: NextRequest) {
  try {
    await requireSession(request, 'EDITOR');
    const targetPath = new URL(request.url).searchParams.get('path');
    if (targetPath) {
      const normalized = assertValidScriptRelativePath(targetPath);
      const verification = await getScriptRuntimeArtifactVerification(normalized);
      return NextResponse.json({
        ok: true,
        verifications: verification ? [verification] : [],
      });
    }

    return NextResponse.json({
      ok: true,
      verifications: await listScriptRuntimeArtifactVerifications(),
    });
  } catch (error) {
    if (isInvalidScriptPathError(error)) {
      return NextResponse.json(
        { error: SCRIPT_RUNTIME_VERIFICATIONS_PATH_INVALID_MESSAGE },
        { status: 400 }
      );
    }
    if (isAuthError(error)) {
      return authErrorToResponse(error);
    }
    console.error('[scripts][runtime][verifications] failed:', error);
    return NextResponse.json(
      { error: SCRIPT_RUNTIME_VERIFICATIONS_FAILED_MESSAGE },
      { status: 500 }
    );
  }
}
