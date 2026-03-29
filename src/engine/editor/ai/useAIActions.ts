'use client';

import type { Dispatch, SetStateAction } from 'react';
import { getAPIConfig } from '@/lib/api-config';
import type { AIMode, Asset, ChatMessage, EngineWorkflowMode } from '@/types/engine';
import type { CapabilityStatus } from './providerStatus';
import type { GenerationTask } from './generationTask';
import { useAIAssetActions } from './useAIAssetActions';
import { useAIChatActions } from './useAIChatActions';

export type { GenerationTask } from './generationTask';

export function useAIActions(params: {
  aiMode: AIMode;
  engineMode: EngineWorkflowMode;
  projectName: string;
  addChatMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  addAsset: (asset: Asset) => void;
  getCapabilityStatus: (config: ReturnType<typeof getAPIConfig>) => Promise<CapabilityStatus>;
  createBasicGameElement: (command: string, options?: { silent?: boolean }) => Promise<string[]>;
  setActiveTask: Dispatch<SetStateAction<GenerationTask | null>>;
}) {
  const {
    aiMode,
    engineMode,
    projectName,
    addChatMessage,
    addAsset,
    getCapabilityStatus,
    createBasicGameElement,
    setActiveTask,
  } = params;

  const chatActions = useAIChatActions({
    aiMode,
    engineMode,
    projectName,
    addChatMessage,
    createBasicGameElement,
  });

  const assetActions = useAIAssetActions({
    projectName,
    addChatMessage,
    addAsset,
    getCapabilityStatus,
    setActiveTask,
  });

  return {
    ...chatActions,
    ...assetActions,
  };
}
