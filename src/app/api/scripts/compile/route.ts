import path from 'path';
import ts from 'typescript';
import { NextRequest, NextResponse } from 'next/server';
import { getStoredScript, resolveScriptVirtualFileName } from '@/lib/server/script-storage';
import { assertValidScriptRelativePath, isInvalidScriptPathError } from '../shared';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';

interface CompileRequestBody {
  path?: string;
  content?: string;
}

interface CompileDiagnostic {
  category: 'error' | 'warning' | 'message' | 'suggestion';
  code: number;
  text: string;
  file?: string;
  line?: number;
  column?: number;
}

function toCategory(category: ts.DiagnosticCategory): CompileDiagnostic['category'] {
  switch (category) {
    case ts.DiagnosticCategory.Error:
      return 'error';
    case ts.DiagnosticCategory.Warning:
      return 'warning';
    case ts.DiagnosticCategory.Suggestion:
      return 'suggestion';
    default:
      return 'message';
  }
}

function formatDiagnostics(diagnostics: readonly ts.Diagnostic[]): CompileDiagnostic[] {
  return diagnostics.map((item) => {
    const text = ts.flattenDiagnosticMessageText(item.messageText, '\n');
    const detail: CompileDiagnostic = {
      category: toCategory(item.category),
      code: item.code,
      text,
    };

    if (item.file && typeof item.start === 'number') {
      const location = item.file.getLineAndCharacterOfPosition(item.start);
      detail.file = path.normalize(item.file.fileName);
      detail.line = location.line + 1;
      detail.column = location.character + 1;
    }

    return detail;
  });
}

export async function POST(request: NextRequest) {
  try {
    await requireSession(request, 'EDITOR');
    const body = (await request.json()) as CompileRequestBody;

    let fileName = 'inline-script.ts';
    let sourceText = '';

    if (body.path) {
      const normalized = assertValidScriptRelativePath(body.path);
      fileName = resolveScriptVirtualFileName(normalized);
      if (typeof body.content === 'string') {
        sourceText = body.content;
      } else {
        const script = await getStoredScript(normalized);
        if (!script) {
          return NextResponse.json(
            {
              error: 'Script not found',
              path: normalized,
            },
            { status: 404 }
          );
        }

        fileName = resolveScriptVirtualFileName(script.relativePath);
        sourceText = script.content;
      }
    } else if (typeof body.content === 'string') {
      sourceText = body.content;
    } else {
      return NextResponse.json({ error: 'path or content is required' }, { status: 400 });
    }

    const result = ts.transpileModule(sourceText, {
      fileName,
      reportDiagnostics: true,
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        strict: true,
        jsx: ts.JsxEmit.ReactJSX,
        skipLibCheck: true,
      },
    });

    const diagnostics = formatDiagnostics(result.diagnostics || []);
    const hasErrors = diagnostics.some((item) => item.category === 'error');

    return NextResponse.json({
      ok: !hasErrors,
      fileName,
      diagnostics,
      outputSize: result.outputText.length,
      sourceSize: sourceText.length,
    });
  } catch (error) {
    if (isInvalidScriptPathError(error)) {
      return NextResponse.json({ error: 'Invalid script path' }, { status: 400 });
    }
    if (String(error).includes('UNAUTHORIZED') || String(error).includes('FORBIDDEN')) {
      return authErrorToResponse(error);
    }
    console.error('[scripts][compile] failed:', error);
    return NextResponse.json({ error: 'Failed to compile script' }, { status: 500 });
  }
}
