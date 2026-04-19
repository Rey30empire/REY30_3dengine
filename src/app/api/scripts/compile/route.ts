import { NextRequest, NextResponse } from 'next/server';
import { getStoredScript, resolveScriptVirtualFileName } from '@/lib/server/script-storage';
import {
  putScriptRuntimeArtifact,
  recordScriptRuntimeArtifactVerification,
} from '@/lib/server/script-runtime-artifacts';
import {
  compileScriptRuntimeArtifact,
  type ScriptRuntimeCompileDiagnostic,
} from '@/lib/server/script-runtime-compiler';
import { getScriptRuntimePolicy } from '@/lib/security/script-runtime-policy';
import { assertValidScriptRelativePath, isInvalidScriptPathError } from '../shared';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';

interface CompileRequestBody {
  path?: string;
  content?: string;
}

const SCRIPT_COMPILE_NOT_FOUND_MESSAGE = 'El script solicitado no existe.';
const SCRIPT_COMPILE_INPUT_REQUIRED_MESSAGE =
  'Debes indicar la ruta o el contenido del script.';
const SCRIPT_COMPILE_INVALID_PATH_MESSAGE = 'La ruta del script no es valida.';
const SCRIPT_COMPILE_FAILED_MESSAGE = 'No se pudo revisar el script.';
const SCRIPT_COMPILE_READY_SUMMARY = 'El script está listo para usarse.';
const SCRIPT_COMPILE_REVIEW_SUMMARY = 'Se detectaron ajustes por revisar en el script.';

function summarizeDiagnostics(diagnostics: ScriptRuntimeCompileDiagnostic[]): string {
  return diagnostics.some((item) => item.category === 'error')
    ? SCRIPT_COMPILE_REVIEW_SUMMARY
    : SCRIPT_COMPILE_READY_SUMMARY;
}

export async function POST(request: NextRequest) {
  try {
    await requireSession(request, 'EDITOR');
    const body = (await request.json()) as CompileRequestBody;

    let fileName = 'inline-script.ts';
    let sourceText = '';
    let targetPath: string | null = null;

    if (body.path) {
      const normalized = assertValidScriptRelativePath(body.path);
      targetPath = normalized;
      fileName = resolveScriptVirtualFileName(normalized);
      if (typeof body.content === 'string') {
        sourceText = body.content;
      } else {
        const script = await getStoredScript(normalized);
        if (!script) {
          return NextResponse.json(
            { error: SCRIPT_COMPILE_NOT_FOUND_MESSAGE },
            { status: 404 }
          );
        }

        fileName = resolveScriptVirtualFileName(script.relativePath);
        sourceText = script.content;
      }
    } else if (typeof body.content === 'string') {
      sourceText = body.content;
    } else {
      return NextResponse.json(
        { error: SCRIPT_COMPILE_INPUT_REQUIRED_MESSAGE },
        { status: 400 }
      );
    }

    const runtimeCompile = compileScriptRuntimeArtifact({
      scriptId: fileName,
      sourceText,
    });
    const diagnostics = runtimeCompile.diagnostics;
    const hasErrors = diagnostics.some((item) => item.category === 'error');

    if (!hasErrors && targetPath && runtimeCompile.artifact) {
      await putScriptRuntimeArtifact(targetPath, runtimeCompile.artifact);
    }
    const summary = summarizeDiagnostics(diagnostics);
    const verification = targetPath
      ? await recordScriptRuntimeArtifactVerification(targetPath, {
          ok: !hasErrors,
          message: summary,
          verifiedAt: runtimeCompile.artifact?.generatedAt,
        }).catch((error) => {
          console.warn('[scripts][compile] verification history was not persisted:', error);
          return null;
        })
      : null;

    return NextResponse.json({
      ok: !hasErrors,
      diagnostics,
      summary,
      runtime: {
        policy: getScriptRuntimePolicy(),
        reviewedArtifact: !hasErrors && Boolean(runtimeCompile.artifact),
        sourceHash: runtimeCompile.sourceHash,
        compiledHash: runtimeCompile.artifact?.compiledHash || null,
        generatedAt: runtimeCompile.artifact?.generatedAt || null,
        persisted: Boolean(targetPath && !hasErrors && runtimeCompile.artifact),
        verification,
      },
    });
  } catch (error) {
    if (isInvalidScriptPathError(error)) {
      return NextResponse.json({ error: SCRIPT_COMPILE_INVALID_PATH_MESSAGE }, { status: 400 });
    }
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    console.error('[scripts][compile] failed:', error);
    return NextResponse.json({ error: SCRIPT_COMPILE_FAILED_MESSAGE }, { status: 500 });
  }
}
