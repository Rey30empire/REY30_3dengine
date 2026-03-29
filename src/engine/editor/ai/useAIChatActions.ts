'use client';

import { useCallback } from 'react';
import type { AIMode, ChatMessage, EngineWorkflowMode } from '@/types/engine';
import { requestAIChat } from './requestClient';

export function useAIChatActions(params: {
  aiMode: AIMode;
  engineMode: EngineWorkflowMode;
  projectName: string;
  addChatMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  createBasicGameElement: (command: string, options?: { silent?: boolean }) => Promise<string[]>;
}) {
  const {
    aiMode,
    engineMode,
    projectName,
    addChatMessage,
    createBasicGameElement,
  } = params;

  const requestChatReply = useCallback(async (command: string) => {
    if (aiMode === 'OFF') {
      await createBasicGameElement(command);
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

    if (!response.ok || !text) {
      addChatMessage({
        role: 'assistant',
        content:
          data?.error && String(data.error).toLowerCase().includes('sesión')
            ? '⚠️ **Debes iniciar sesión**\n\nAbre `Config APIs -> Usuario`, autentícate y guarda tus claves BYOK.'
            : '⚠️ **Chat no configurado**\n\nConfigura tus APIs en `Config APIs -> Usuario` o cambia el routing de chat a Local.',
        metadata: { type: 'config-warning' },
      });
      return;
    }

    addChatMessage({
      role: 'assistant',
      content: text,
      metadata: { agentType: 'orchestrator' },
    });
  }, [addChatMessage, aiMode, createBasicGameElement, engineMode, projectName]);

  return {
    requestChatReply,
  };
}
