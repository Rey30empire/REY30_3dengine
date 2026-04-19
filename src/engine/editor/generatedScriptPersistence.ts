'use client';

import {
  buildGeneratedScriptTemplate,
  normalizeGeneratedScriptPath,
} from '@/lib/generated-script-template';

type EnsureGeneratedScriptResult = {
  ok: boolean;
  created: boolean;
  status: number;
  relativePath: string;
  error?: string;
};

type PersistScriptPayload = {
  created?: boolean;
  error?: string;
};

export async function ensureGeneratedScriptFile(
  scriptPath: string,
  prompt: string
): Promise<EnsureGeneratedScriptResult> {
  const { directory, name, relativePath } = normalizeGeneratedScriptPath(scriptPath);
  const content = buildGeneratedScriptTemplate(relativePath, prompt);

  try {
    const response = await fetch('/api/scripts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        directory,
        name,
        content,
        overwrite: false,
        onExists: 'return-existing',
      }),
    });

    const payload = await response.json().catch(() => ({} as PersistScriptPayload));
    if (!response.ok) {
      return {
        ok: false,
        created: false,
        status: response.status,
        relativePath,
        error:
          typeof payload.error === 'string'
            ? payload.error
            : 'No se pudo guardar el script generado.',
      };
    }

    return {
      ok: true,
      created: payload.created !== false,
      status: response.status,
      relativePath,
    };
  } catch (error) {
    return {
      ok: false,
      created: false,
      status: 0,
      relativePath,
      error: String(error),
    };
  }
}
