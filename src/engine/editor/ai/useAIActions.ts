'use client';

import type { Dispatch, SetStateAction } from 'react';
import type { AgenticProgressListener } from '@/engine/agentic';
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
  activePlannerPlanId?: string | null;
  addChatMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  addAsset: (asset: Asset) => void;
  getCapabilityStatus: () => Promise<CapabilityStatus>;
  createBasicGameElement: (command: string, options?: { silent?: boolean }) => Promise<string[]>;
  onAgenticProgress?: AgenticProgressListener;
  requireAgenticRecommendationApproval?: boolean;
  setActiveTask: Dispatch<SetStateAction<GenerationTask | null>>;
}) {
  const {
    aiMode,
    engineMode,
    projectName,
    activePlannerPlanId,
    addChatMessage,
    addAsset,
    getCapabilityStatus,
    createBasicGameElement,
    onAgenticProgress,
    requireAgenticRecommendationApproval,
    setActiveTask,
  } = params;

  const chatActions = useAIChatActions({
    aiMode,
    engineMode,
    projectName,
    addChatMessage,
    createBasicGameElement,
    onAgenticProgress,
    requireAgenticRecommendationApproval,
  });

  const assetActions = useAIAssetActions({
    projectName,
    activePlannerPlanId,
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
