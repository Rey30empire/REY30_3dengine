import { buildProjectFromState } from '@/engine/reyplay/build/buildPipeline';
import type {
  EditorBuildExporter,
  EditorBuildExportResult,
} from './sceneStoreAdapter';

export function createNodeEditorBuildExporter(): EditorBuildExporter {
  return async (target, input): Promise<EditorBuildExportResult> => {
    const result = await buildProjectFromState(target, input);
    return {
      ...result,
      source: 'local_node_build_pipeline',
    };
  };
}
