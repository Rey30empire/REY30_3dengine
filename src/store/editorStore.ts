import { create } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { subscribeWithSelector } from 'zustand/middleware';
import type { Entity } from '@/types/engine';
import type { EngineStore } from './editorStore.types';
import { createAISlice } from './slices/aiSlice';
import { createEditorSlice } from './slices/editorSlice';
import { createProjectSlice } from './slices/projectSlice';
import { createRuntimeSlice } from './slices/runtimeSlice';

const createEngineStoreSlices = (...args: Parameters<typeof createProjectSlice>): EngineStore => ({
  ...createProjectSlice(...args),
  ...createEditorSlice(...args),
  ...createAISlice(...args),
  ...createRuntimeSlice(...args),
});

export type EngineStoreApi = StoreApi<EngineStore>;

export function createIsolatedEngineStore(
  initialState?: Partial<EngineStore>
): EngineStoreApi {
  const store = createStore<EngineStore>()(subscribeWithSelector(createEngineStoreSlices));
  if (initialState) {
    store.setState(initialState, false);
  }
  return store;
}

export const useEngineStore = create<EngineStore>()(
  subscribeWithSelector(createEngineStoreSlices)
);

export type { EngineStore, HistoryEntry } from './editorStore.types';

export const useActiveScene = () =>
  useEngineStore((state) =>
    state.scenes.find((scene) => scene.id === state.activeSceneId)
  );

export const useSelectedEntities = () =>
  useEngineStore((state) =>
    state.editor.selectedEntities
      .map((id) => state.entities.get(id))
      .filter((entity): entity is Entity => Boolean(entity))
  );

export const useAIMode = () => useEngineStore((state) => state.aiMode);
export const useEngineWorkflowMode = () => useEngineStore((state) => state.engineMode);
export const useScribInstances = () => useEngineStore((state) => state.scribInstances);
export const useIsAIEnabled = () => useEngineStore((state) => state.aiEnabled);

export const useChat = () =>
  useEngineStore((state) => ({
    messages: state.chatMessages,
    isProcessing: state.isAiProcessing,
    addMessage: state.addChatMessage,
    clear: state.clearChat,
    setProcessing: state.setAiProcessing,
  }));
