import { NextRequest, NextResponse } from 'next/server';
import {
  authErrorToResponse,
  logSecurityEvent,
  requireSession,
} from '@/lib/security/auth';
import { getStoredScript } from '@/lib/server/script-storage';
import {
  deleteScriptRuntimeArtifact,
  getScriptRuntimeArtifact,
  getScriptRuntimeArtifactStorageInfo,
} from '@/lib/server/script-runtime-artifacts';
import { hashScriptRuntimeSource } from '@/lib/server/script-runtime-compiler';
import { getScriptRuntimePolicy } from '@/lib/security/script-runtime-policy';
import { getScriptStorageInfo } from '@/lib/server/script-storage';
import { summarizeScriptRuntimeLiveSessions } from '@/lib/server/script-runtime-live-sessions';
import { getScriptRuntimeOperationalSemantics } from '@/lib/server/script-runtime-semantics';
import { assertValidScriptRelativePath, isInvalidScriptPathError } from '../shared';

const SCRIPT_RUNTIME_PATH_REQUIRED_MESSAGE = 'Debes indicar la ruta del script.';
const SCRIPT_RUNTIME_PATH_INVALID_MESSAGE = 'La ruta del script no es valida.';
const SCRIPT_RUNTIME_NOT_FOUND_MESSAGE = 'El script solicitado no existe.';
const SCRIPT_RUNTIME_DISABLED_MESSAGE =
  'El runtime personalizado no está disponible en este entorno.';
const SCRIPT_RUNTIME_REVIEW_REQUIRED_MESSAGE =
  'Debes revisar el script en Scrib Studio antes de ejecutarlo.';
const SCRIPT_RUNTIME_FETCH_FAILED_MESSAGE =
  'No se pudo preparar el script para el runtime.';

function isAuthError(error: unknown): boolean {
  const text = String(error);
  return text.includes('UNAUTHORIZED') || text.includes('FORBIDDEN');
}

export async function GET(request: NextRequest) {
  let actorUserId: string | null = null;

  try {
    const user = await requireSession(request, 'EDITOR');
    actorUserId = user.id;
    const policy = getScriptRuntimePolicy();
    if (!policy.enabled) {
      await logSecurityEvent({
        request,
        userId: actorUserId,
        action: 'scripts.runtime.fetch',
        status: 'denied',
        metadata: { reason: policy.reason || 'runtime_disabled' },
      });
      return NextResponse.json(
        {
          error: SCRIPT_RUNTIME_DISABLED_MESSAGE,
          policy,
        },
        { status: 503 }
      );
    }

    const targetPath = new URL(request.url).searchParams.get('path');
    const currentInstanceId = new URL(request.url).searchParams.get('instanceId');
    if (!targetPath) {
      return NextResponse.json(
        { error: SCRIPT_RUNTIME_PATH_REQUIRED_MESSAGE },
        { status: 400 }
      );
    }

    const normalized = assertValidScriptRelativePath(targetPath);
    const semantics = getScriptRuntimeOperationalSemantics({
      policy,
      scriptStorage: getScriptStorageInfo(),
      runtimeArtifacts: getScriptRuntimeArtifactStorageInfo(),
    });
    const [script, artifact, live] = await Promise.all([
      getStoredScript(normalized),
      getScriptRuntimeArtifact(normalized),
      summarizeScriptRuntimeLiveSessions({
        currentSessionId: user.sessionId,
        currentInstanceId,
      }).catch(() => null),
    ]);

    if (!script) {
      await logSecurityEvent({
        request,
        userId: actorUserId,
        action: 'scripts.runtime.fetch',
        target: normalized,
        status: 'denied',
        metadata: { reason: 'script_missing' },
      });
      return NextResponse.json(
        { error: SCRIPT_RUNTIME_NOT_FOUND_MESSAGE },
        { status: 404 }
      );
    }

    if (!artifact) {
      await logSecurityEvent({
        request,
        userId: actorUserId,
        action: 'scripts.runtime.fetch',
        target: normalized,
        status: 'denied',
        metadata: { reason: 'artifact_missing' },
      });
      return NextResponse.json(
        {
          error: SCRIPT_RUNTIME_REVIEW_REQUIRED_MESSAGE,
          ready: false,
          policy,
          runtime: semantics,
          live,
        },
        { status: 409 }
      );
    }

    const sourceHash = hashScriptRuntimeSource(script.content);
    if (artifact.sourceHash !== sourceHash) {
      await Promise.resolve(deleteScriptRuntimeArtifact(normalized)).catch(() => undefined);
      await logSecurityEvent({
        request,
        userId: actorUserId,
        action: 'scripts.runtime.fetch',
        target: normalized,
        status: 'denied',
        metadata: { reason: 'artifact_stale' },
      });
      return NextResponse.json(
        {
          error: SCRIPT_RUNTIME_REVIEW_REQUIRED_MESSAGE,
          ready: false,
          policy,
          runtime: semantics,
          live,
        },
        { status: 409 }
      );
    }

    await logSecurityEvent({
      request,
      userId: actorUserId,
      action: 'scripts.runtime.fetch',
      target: normalized,
      status: 'allowed',
      metadata: {
        compiledHash: artifact.compiledHash,
        generatedAt: artifact.generatedAt,
      },
    });

    return NextResponse.json({
      ok: true,
      ready: true,
      policy,
      runtime: {
        scriptId: normalized,
        sourceHash: artifact.sourceHash,
        compiledHash: artifact.compiledHash,
        generatedAt: artifact.generatedAt,
        ...semantics,
      },
      live,
      compiledCode: artifact.compiledCode,
    });
  } catch (error) {
    if (isInvalidScriptPathError(error)) {
      return NextResponse.json(
        { error: SCRIPT_RUNTIME_PATH_INVALID_MESSAGE },
        { status: 400 }
      );
    }
    if (isAuthError(error)) {
      return authErrorToResponse(error);
    }
    await logSecurityEvent({
      request,
      userId: actorUserId,
      action: 'scripts.runtime.fetch',
      status: 'error',
      metadata: { error: String(error) },
    });
    console.error('[scripts][runtime] failed:', error);
    return NextResponse.json(
      { error: SCRIPT_RUNTIME_FETCH_FAILED_MESSAGE },
      { status: 500 }
    );
  }
}
