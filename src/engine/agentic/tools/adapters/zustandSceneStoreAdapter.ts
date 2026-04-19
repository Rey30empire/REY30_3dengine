import { useEngineStore } from '@/store/editorStore';
import { createRemoteEditorBuildExporter } from './remoteEditorBuildExporter';
import {
  EditorSceneStoreAdapter,
  type EditorSceneStoreAdapterOptions,
  type EditorStoreApi,
} from './sceneStoreAdapter';

export interface ZustandSceneStoreAdapterOptions extends EditorSceneStoreAdapterOptions {
  store?: EditorStoreApi;
}

export function createZustandSceneStoreAdapter(
  options: ZustandSceneStoreAdapterOptions = {}
): EditorSceneStoreAdapter {
  return new EditorSceneStoreAdapter(
    options.store ?? {
      getState: useEngineStore.getState,
    },
    {
      buildExporter:
        options.buildExporter ??
        (typeof window !== 'undefined' ? createRemoteEditorBuildExporter() : undefined),
    }
  );
}
