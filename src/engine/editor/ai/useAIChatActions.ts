'use client';

import { useCallback } from 'react';
import {
  editorSessionSnapshotToStoreState,
  isEditorSessionSnapshot,
} from '@/lib/editor-session-snapshot';
import type { AgenticProgressListener } from '@/engine/agentic';
import { useEngineStore } from '@/store/editorStore';
import type { AIMode, ChatMessage, EngineWorkflowMode } from '@/types/engine';
import { resolveAICommandIntent } from './intentRouter';
import { requestAIChat, requestEditorSessionState } from './requestClient';
import {
  runAgenticEditorCommand,
  runServerAgenticEditorCommand,
  shouldUseServerAgenticExecution,
} from './agenticCommandBridge';

export function useAIChatActions(params: {
  aiMode: AIMode;
  engineMode: EngineWorkflowMode;
  projectName: string;
  addChatMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  createBasicGameElement: (command: string, options?: { silent?: boolean }) => Promise<string[]>;
  onAgenticProgress?: AgenticProgressListener;
  requireAgenticRecommendationApproval?: boolean;
}) {
  const {
    aiMode,
    engineMode,
    projectName,
    addChatMessage,
    createBasicGameElement,
    onAgenticProgress,
    requireAgenticRecommendationApproval,
  } = params;

  const requestChatReply = useCallback(async (command: string) => {
    const intent = resolveAICommandIntent(command);

    if (aiMode === 'OFF') {
      await createBasicGameElement(command);
      return;
    }

    const agenticResult = shouldUseServerAgenticExecution()
      ? await runServerAgenticEditorCommand(command, {
          onProgress: onAgenticProgress,
          projectName,
          requireRecommendationApproval: requireAgenticRecommendationApproval,
        })
      : await runAgenticEditorCommand(command, {
          onProgress: onAgenticProgress,
          requireRecommendationApproval: requireAgenticRecommendationApproval,
        });
    if (agenticResult.handled) {
      addChatMessage({
        role: 'assistant',
        content: agenticResult.message,
        metadata: {
          agentType: 'orchestrator',
          type: agenticResult.approved ? undefined : 'warning',
          agenticPipeline: agenticResult.metadata,
        },
      });
      return;
    }

    const { response, data, text } = await requestAIChat({
      command,
      engineMode,
      projectName: projectName || 'untitled_project',
    });

    if (response.status === 429) {
      const retryAfter = Number(data?.retryAfterSeconds || 0);
      const mode = String(data?.mode || engineMode);
      addChatMessage({
        role: 'assistant',
        content:
          `⚠️ **Límite temporal alcanzado (${mode})**\n\n` +
          `Espera ${retryAfter > 0 ? `${retryAfter}s` : 'unos segundos'} y vuelve a intentar.`,
        metadata: { type: 'config-warning' },
      });
      return;
    }

    const handledSceneAction = data?.handledSceneAction === true;

    if (response.ok && handledSceneAction) {
      if (data.sceneUpdated) {
        const sessionState = await requestEditorSessionState({
          projectName: projectName || 'untitled_project',
          includeSnapshot: true,
        });

        if (
          sessionState.response.ok &&
          sessionState.data.active &&
          isEditorSessionSnapshot(sessionState.data.snapshot)
        ) {
          useEngineStore.setState(editorSessionSnapshotToStoreState(sessionState.data.snapshot));
        }
      }

      addChatMessage({
        role: 'assistant',
        content: text || '✅ **Completado**\nSe aplicaron cambios en la escena.',
        metadata: { agentType: 'orchestrator' },
      });
      return;
    }

    if (response.ok && (intent.wantsGameStarter || intent.wantsDirectSceneAction)) {
      await createBasicGameElement(command);
      return;
    }

    if (!response.ok || !text) {
      addChatMessage({
        role: 'assistant',
        content:
          data?.error && String(data.error).toLowerCase().includes('sesión')
            ? '⚠️ **Debes iniciar sesión**\n\nInicia sesión para usar el asistente.'
            : '⚠️ **Asistente no disponible**\n\nEsta sesión todavía no tiene acceso al chat inteligente.',
        metadata: { type: 'config-warning' },
      });
      return;
    }

    addChatMessage({
      role: 'assistant',
      content: text,
      metadata: { agentType: 'orchestrator' },
    });
  }, [
    addChatMessage,
    aiMode,
    createBasicGameElement,
    engineMode,
    onAgenticProgress,
    projectName,
    requireAgenticRecommendationApproval,
  ]);

  return {
    requestChatReply,
  };
}
