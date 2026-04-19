import { createHash } from 'node:crypto';
import ts from 'typescript';
import { assertSafeScriptContent } from '@/engine/gameplay/script-sandbox';
import {
  instrumentSandboxRuntimeGuards,
  SANDBOX_GUARD_FUNCTION_NAME,
} from '@/engine/gameplay/script-guard';

export interface ScriptRuntimeCompileDiagnostic {
  category: 'error' | 'warning' | 'message' | 'suggestion';
  code: number;
  text: string;
  line?: number;
  column?: number;
}

export interface CompiledScriptRuntimeArtifact {
  version: 1;
  scriptId: string;
  sourceHash: string;
  compiledHash: string;
  compiledCode: string;
  generatedAt: string;
  sourceBytes: number;
  compiledBytes: number;
  guardFunction: string;
  compiler: {
    target: 'ES2020';
    module: 'CommonJS';
    policyVersion: 1;
  };
}

export interface ScriptRuntimeCompileResult {
  ok: boolean;
  diagnostics: ScriptRuntimeCompileDiagnostic[];
  sourceHash: string;
  artifact?: CompiledScriptRuntimeArtifact;
}

const SCRIPT_SANDBOX_DIAGNOSTIC_CODE = 9501;
const SCRIPT_SOURCE_SIZE_DIAGNOSTIC_CODE = 9502;
const SCRIPT_COMPILED_SIZE_DIAGNOSTIC_CODE = 9503;
const DEFAULT_MAX_SCRIPT_SOURCE_BYTES = 128_000;
const DEFAULT_MAX_SCRIPT_COMPILED_BYTES = 256_000;

function parsePositiveEnvInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function flattenDiagnostics(
  diagnostics: readonly ts.Diagnostic[]
): ScriptRuntimeCompileDiagnostic[] {
  return diagnostics.map((item) => {
    const detail: ScriptRuntimeCompileDiagnostic = {
      category:
        item.category === ts.DiagnosticCategory.Error
          ? 'error'
          : item.category === ts.DiagnosticCategory.Warning
            ? 'warning'
            : item.category === ts.DiagnosticCategory.Suggestion
              ? 'suggestion'
              : 'message',
      code: item.code,
      text: ts.flattenDiagnosticMessageText(item.messageText, '\n'),
    };

    if (item.file && typeof item.start === 'number') {
      const location = item.file.getLineAndCharacterOfPosition(item.start);
      detail.line = location.line + 1;
      detail.column = location.character + 1;
    }

    return detail;
  });
}

function hashUtf8(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function createSandboxDiagnostic(error: unknown): ScriptRuntimeCompileDiagnostic {
  const message = String((error as { message?: unknown })?.message ?? error);
  const locationMatch = message.match(/at\s+(\d+):(\d+)/i);
  const text = message
    .replace(/^\[Sandbox:[^\]]+\]\s*/i, '')
    .replace(/\s+at\s+\d+:\d+\s*$/i, '')
    .trim();

  return {
    category: 'error',
    code: SCRIPT_SANDBOX_DIAGNOSTIC_CODE,
    text: text || 'El script viola la política del sandbox.',
    line: locationMatch ? Number(locationMatch[1]) : undefined,
    column: locationMatch ? Number(locationMatch[2]) : undefined,
  };
}

function createSizeDiagnostic(code: number, text: string): ScriptRuntimeCompileDiagnostic {
  return {
    category: 'error',
    code,
    text,
  };
}

export function hashScriptRuntimeSource(content: string): string {
  return hashUtf8(content);
}

export function compileScriptRuntimeArtifact(params: {
  scriptId: string;
  sourceText: string;
  env?: NodeJS.ProcessEnv;
}): ScriptRuntimeCompileResult {
  const sourceText = params.sourceText;
  const env = params.env || process.env;
  const diagnostics: ScriptRuntimeCompileDiagnostic[] = [];
  const sourceBytes = Buffer.byteLength(sourceText, 'utf8');
  const maxSourceBytes = parsePositiveEnvInt(
    env.REY30_SCRIPT_SOURCE_MAX_BYTES,
    DEFAULT_MAX_SCRIPT_SOURCE_BYTES
  );
  const maxCompiledBytes = parsePositiveEnvInt(
    env.REY30_SCRIPT_COMPILED_MAX_BYTES,
    DEFAULT_MAX_SCRIPT_COMPILED_BYTES
  );
  const sourceHash = hashScriptRuntimeSource(sourceText);

  if (sourceBytes > maxSourceBytes) {
    diagnostics.push(
      createSizeDiagnostic(
        SCRIPT_SOURCE_SIZE_DIAGNOSTIC_CODE,
        `El script supera el límite de ${maxSourceBytes} bytes permitido por el runtime.`
      )
    );
  }

  try {
    assertSafeScriptContent(params.scriptId, sourceText);
  } catch (error) {
    diagnostics.push(createSandboxDiagnostic(error));
  }

  const transpiled = ts.transpileModule(sourceText, {
    fileName: params.scriptId,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      strict: true,
      jsx: ts.JsxEmit.ReactJSX,
      skipLibCheck: true,
    },
  });

  diagnostics.push(...flattenDiagnostics(transpiled.diagnostics || []));

  const hasErrors = diagnostics.some((item) => item.category === 'error');
  if (hasErrors) {
    return {
      ok: false,
      diagnostics,
      sourceHash,
    };
  }

  const compiledCode = instrumentSandboxRuntimeGuards(
    params.scriptId,
    transpiled.outputText
  );
  const compiledBytes = Buffer.byteLength(compiledCode, 'utf8');
  if (compiledBytes > maxCompiledBytes) {
    diagnostics.push(
      createSizeDiagnostic(
        SCRIPT_COMPILED_SIZE_DIAGNOSTIC_CODE,
        `El artefacto compilado supera el límite de ${maxCompiledBytes} bytes permitido por el runtime.`
      )
    );
    return {
      ok: false,
      diagnostics,
      sourceHash,
    };
  }

  return {
    ok: true,
    diagnostics,
    sourceHash,
    artifact: {
      version: 1,
      scriptId: params.scriptId,
      sourceHash,
      compiledHash: hashUtf8(compiledCode),
      compiledCode,
      generatedAt: new Date().toISOString(),
      sourceBytes,
      compiledBytes,
      guardFunction: SANDBOX_GUARD_FUNCTION_NAME,
      compiler: {
        target: 'ES2020',
        module: 'CommonJS',
        policyVersion: 1,
      },
    },
  };
}

