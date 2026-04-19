import { buildRemoteProject } from '@/engine/editor/buildProjectClient';
import { saveRemoteEditorProject } from '@/engine/editor/editorProjectClient';
import type { BuildReport } from '@/engine/reyplay/types';
import { createEditorProjectSaveData, DEFAULT_EDITOR_PROJECT_SAVE_SLOT } from '@/engine/serialization';
import type {
  EditorBuildExporter,
  EditorBuildExportInput,
  EditorBuildExportResult,
  EditorBuildTarget,
} from './sceneStoreAdapter';

export interface RemoteEditorBuildExporterOptions {
  slot?: string;
}

function failedRemoteReport(
  message: string,
  input?: EditorBuildExportInput,
  code = 'REMOTE_BUILD_FAILED'
): BuildReport {
  return {
    ok: false,
    sceneCount: input?.scenes.length ?? 0,
    assetCount: input?.assets.length ?? 0,
    entityCount: input?.entities.size ?? 0,
    diagnostics: [
      {
        id: `${code.toLowerCase()}-${Date.now()}`,
        stage: 'runtime',
        code,
        level: 'error',
        message,
      },
    ],
    summary: message,
    generatedAt: new Date().toISOString(),
  };
}

export function createRemoteEditorBuildExporter(
  options: RemoteEditorBuildExporterOptions = {}
): EditorBuildExporter {
  return async (target, input): Promise<EditorBuildExportResult> => {
    const slot = options.slot ?? DEFAULT_EDITOR_PROJECT_SAVE_SLOT;
    const saveData = createEditorProjectSaveData(input, { markClean: false });
    const remoteSave = await saveRemoteEditorProject({
      projectName: input.projectName,
      saveData,
      slot,
    });

    if (!remoteSave.response.ok || remoteSave.payload.success !== true) {
      const message =
        remoteSave.payload.error ||
        'No se pudo sincronizar el estado actual del editor antes de exportar.';
      return {
        ok: false,
        target,
        buildId: `remote-save-failed-${Date.now()}`,
        report: failedRemoteReport(message, input, 'REMOTE_SAVE_FAILED'),
        artifacts: [],
        missingDeps: [],
        logs: [`Remote editor project sync failed: ${message}`],
        source: 'remote_editor_project',
      };
    }

    const { response, payload } = await buildRemoteProject({
      projectName: input.projectName,
      target,
      slot,
    });
    const report = payload.report ?? failedRemoteReport(payload.error ?? response.statusText, input);
    return {
      ok: response.ok && payload.ok === true,
      target: (payload.target ?? target) as EditorBuildTarget,
      buildId: payload.buildId ?? `remote-build-${Date.now()}`,
      report,
      artifacts: payload.artifacts ?? [],
      missingDeps: payload.missingDeps ?? [],
      logs: [`Remote editor project save synced to slot "${slot}".`, ...(payload.logs ?? [])],
      source: 'remote_editor_project',
    };
  };
}
