import { buildGeneratedScriptTemplate, normalizeGeneratedScriptPath } from '@/lib/generated-script-template';
import { getStoredScript, upsertStoredScript } from './script-storage';

export type EnsureGeneratedScriptLibraryResult = {
  ok: boolean;
  created: boolean;
  relativePath: string;
  assetPath: string;
  error?: string;
};

export async function ensureGeneratedScriptInLibrary(params: {
  scriptPath: string;
  prompt: string;
}): Promise<EnsureGeneratedScriptLibraryResult> {
  const normalized = normalizeGeneratedScriptPath(params.scriptPath);
  const assetPath = `/scripts/${normalized.relativePath}`;

  try {
    const existing = await getStoredScript(normalized.relativePath);
    if (existing) {
      return {
        ok: true,
        created: false,
        relativePath: normalized.relativePath,
        assetPath,
      };
    }

    const content = buildGeneratedScriptTemplate(normalized.relativePath, params.prompt);
    await upsertStoredScript(normalized.relativePath, content);
    return {
      ok: true,
      created: true,
      relativePath: normalized.relativePath,
      assetPath,
    };
  } catch (error) {
    return {
      ok: false,
      created: false,
      relativePath: normalized.relativePath,
      assetPath,
      error: String(error),
    };
  }
}
