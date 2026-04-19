'use client';

import { useCallback } from 'react';
import type { ChatMessage } from '@/types/engine';
import { resolveAICommandIntent } from './intentRouter';

export function useAICommandRouter(params: {
  isManualWorkflow: boolean;
  isAIFirstWorkflow: boolean;
  addChatMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  setAiProcessing: (processing: boolean) => void;
  clearInput: () => void;
  requestChatReply: (command: string) => Promise<void>;
  generateImageAsset: (prompt: string) => Promise<void>;
  generateVideoAsset: (prompt: string) => Promise<void>;
  canGenerate3DModel: () => Promise<boolean>;
  generate3DModel: (prompt: string, artStyle?: string) => Promise<boolean>;
  generateCharacterAsset: (prompt: string) => Promise<void>;
  createBasicGameElement: (command: string, options?: { silent?: boolean }) => Promise<string[]>;
}) {
  const {
    isManualWorkflow,
    isAIFirstWorkflow,
    addChatMessage,
    setAiProcessing,
    clearInput,
    requestChatReply,
    generateImageAsset,
    generateVideoAsset,
    canGenerate3DModel,
    generate3DModel,
    generateCharacterAsset,
    createBasicGameElement,
  } = params;

  const processCommand = useCallback(async (command: string) => {
    if (!command.trim()) return;

    addChatMessage({
      role: 'user',
      content: command,
    });

    clearInput();
    setAiProcessing(true);

    try {
      const intent = resolveAICommandIntent(command);
      const mentionsWorldScope =
        intent.lowerCommand.includes('mundo') ||
        intent.lowerCommand.includes('world') ||
        intent.lowerCommand.includes('escena') ||
        intent.lowerCommand.includes('scene') ||
        intent.lowerCommand.includes('mapa') ||
        intent.lowerCommand.includes('nivel') ||
        intent.lowerCommand.includes('level') ||
        intent.lowerCommand.includes('minijuego') ||
        intent.lowerCommand.includes('gameplay') ||
        intent.lowerCommand.includes('juego') ||
        intent.lowerCommand.includes('game') ||
        intent.lowerCommand.includes('proyecto') ||
        intent.lowerCommand.includes('project');
      const wantsSceneCharacterFlow =
        mentionsWorldScope && (intent.wantsCharacter || intent.wants3D);

      if (isManualWorkflow) {
        addChatMessage({
          role: 'assistant',
          content:
            '🛠️ **Modo Manual activo**\n\nEn este modo te acompaño sin crear cambios automáticos. Usa las herramientas del editor para construir y ajustar la escena.',
          metadata: { agentType: 'orchestrator' },
        });
        return;
      }

      if (intent.wantsVideo) {
        addChatMessage({
          role: 'assistant',
          content: `🎬 **Iniciando generación de video**\n\nPrompt: "${command}"`,
        });
        await generateVideoAsset(command);
        return;
      }

      if (intent.wantsImage) {
        addChatMessage({
          role: 'assistant',
          content: `🖼️ **Generando imagen**\n\nPrompt: "${command}"`,
        });
        await generateImageAsset(command);
        return;
      }

      if (isAIFirstWorkflow) {
        if (wantsSceneCharacterFlow) {
          addChatMessage({
            role: 'assistant',
            content:
              '🤖 **Escena con personaje en preparación**\n\nVoy a crear la escena completa con el personaje jugable, rig y animación desde el backend del asistente.',
            metadata: { agentType: 'orchestrator' },
          });
          await requestChatReply(command);
          return;
        }

        if (intent.wants3D || intent.wantsCharacter) {
          const continueWithPipeline =
            intent.wantsGameStarter || intent.wantsDirectSceneAction || mentionsWorldScope;
          addChatMessage({
            role: 'assistant',
            content:
              continueWithPipeline
                ? '🤖 **AI First activo**\n\nVoy a crear el personaje y dejar lista una primera versión del mundo.'
                : '🤖 **AI First activo**\n\nVoy a crear el personaje y completar la versión inicial con la mejor ruta disponible.',
            metadata: { agentType: 'orchestrator' },
          });
          await generateCharacterAsset(command);
          if (continueWithPipeline) {
            addChatMessage({
              role: 'assistant',
              content: '🧩 **Continuando creación**\n\nEl personaje ya quedó encaminado. Ahora termino la escena y los elementos principales.',
              metadata: { agentType: 'orchestrator' },
            });
            await requestChatReply(command);
          }
          return;
        }

        if (!(intent.wantsGameStarter || intent.wantsDirectSceneAction)) {
          addChatMessage({
            role: 'assistant',
            content:
              '💬 **Chat normal**\n\nTu mensaje parece conversacional, así que responderé sin cambiar la escena.',
            metadata: { agentType: 'orchestrator' },
          });
          await requestChatReply(command);
          return;
        }

        addChatMessage({
          role: 'assistant',
          content:
            '🤖 **AI First activo**\n\nRecibí tu prompt y ya estoy preparando la primera versión de la experiencia.',
          metadata: { agentType: 'orchestrator' },
        });
        await requestChatReply(command);
        return;
      }

      if (intent.wantsGameStarter) {
        addChatMessage({
          role: 'assistant',
          content: '🕹️ **Creación de juego activada**\n\nVoy a ejecutar el pedido y preparar una primera base jugable en el editor.',
        });
        await requestChatReply(command);
        return;
      }

      if (intent.wantsDirectSceneAction) {
        addChatMessage({
          role: 'assistant',
          content: '🧠 **Creación en curso**\n\nEstoy aplicando tu pedido directamente sobre la escena activa.',
          metadata: { agentType: 'orchestrator' },
        });
        await requestChatReply(command);
        return;
      }

      if (wantsSceneCharacterFlow) {
        addChatMessage({
          role: 'assistant',
          content:
            '🧍 **Creación de escena con personaje**\n\nVoy a montar la escena completa con el personaje jugable, su rig y la animación inicial.',
          metadata: { agentType: 'orchestrator' },
        });
        await requestChatReply(command);
        return;
      }

      if (intent.wantsCharacter) {
        addChatMessage({
          role: 'assistant',
          content: '🧍 **Generación de personaje**\n\nVoy a crear el personaje y dejarlo listo para usar.',
          metadata: { agentType: 'orchestrator' },
        });
        await generateCharacterAsset(command);
        return;
      }

      if (intent.wants3D) {
        const modelGenerationAvailable = await canGenerate3DModel();
        if (!modelGenerationAvailable) {
          addChatMessage({
            role: 'assistant',
            content: '⚠️ **Generación 3D no disponible**\n\nAhora mismo no puedo completar ese modelo automáticamente. Si quieres, dejo una base editable para seguir trabajando.',
            metadata: { type: 'config-warning' },
          });
          await createBasicGameElement(command);
          return;
        }

        addChatMessage({
          role: 'assistant',
          content: `🎨 **Iniciando generación 3D**\n\nPrompt: "${command}"\nEstilo: ${intent.artStyle}`,
        });
        await generate3DModel(command, intent.artStyle);
        return;
      }

      await requestChatReply(command);
    } catch (error) {
      addChatMessage({
        role: 'assistant',
        content: `❌ **Error:** ${error}`,
        metadata: { type: 'error' },
      });
    } finally {
      setAiProcessing(false);
    }
  }, [
    addChatMessage,
    canGenerate3DModel,
    clearInput,
    createBasicGameElement,
    generateCharacterAsset,
    generate3DModel,
    generateImageAsset,
    generateVideoAsset,
    isAIFirstWorkflow,
    isManualWorkflow,
    requestChatReply,
    setAiProcessing,
  ]);

  return {
    processCommand,
  };
}
