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
  runOrchestratedPipeline: (command: string) => Promise<void>;
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
    runOrchestratedPipeline,
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

      if (isManualWorkflow) {
        addChatMessage({
          role: 'assistant',
          content:
            '🛠️ **Modo Manual activo**\n\nEn este modo no ejecuto pipeline automático. Usa Scene Explorer + Scrib Studio para crear y editar, y luego pulsa Render All.',
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
        if (intent.wants3D || intent.wantsCharacter) {
          const mentionsWorldScope =
            intent.lowerCommand.includes('mundo') ||
            intent.lowerCommand.includes('escena') ||
            intent.lowerCommand.includes('scene') ||
            intent.lowerCommand.includes('mapa') ||
            intent.lowerCommand.includes('nivel') ||
            intent.lowerCommand.includes('minijuego') ||
            intent.lowerCommand.includes('gameplay');
          const continueWithPipeline =
            intent.wantsGameStarter || intent.wantsDirectSceneAction || mentionsWorldScope;
          addChatMessage({
            role: 'assistant',
            content:
              continueWithPipeline
                ? '🤖 **AI First activo**\n\nDetecté personaje/3D y también objetivo de juego. Genero personaje real y luego continúo pipeline completo de escena.'
                : '🤖 **AI First activo**\n\nDetecté solicitud de personaje/3D. Voy por ruta real con fallback automático (Meshy -> Profile A/local).',
            metadata: { agentType: 'orchestrator' },
          });
          await generateCharacterAsset(command);
          if (continueWithPipeline) {
            addChatMessage({
              role: 'assistant',
              content: '🧩 **Continuando pipeline**\n\nPersonaje listo (o en fallback). Ahora completo escena, entidades y validación final.',
              metadata: { agentType: 'orchestrator' },
            });
            await runOrchestratedPipeline(command);
          }
          return;
        }

        if (!(intent.wantsGameStarter || intent.wantsDirectSceneAction)) {
          addChatMessage({
            role: 'assistant',
            content:
              '💬 **AI First (chat normal)**\n\nTu mensaje parece conversacional, responderé normal sin ejecutar construcción de escena.',
            metadata: { agentType: 'orchestrator' },
          });
          await requestChatReply(command);
          return;
        }

        addChatMessage({
          role: 'assistant',
          content:
            '🤖 **AI First activo**\n\nRecibí tu prompt y ejecuto pipeline completo (análisis → escena → entidades/scribs → validación composer/runtime).',
          metadata: { agentType: 'orchestrator' },
        });
        await runOrchestratedPipeline(command);
        return;
      }

      if (intent.wantsGameStarter) {
        addChatMessage({
          role: 'assistant',
          content: '🕹️ **Orquestador de juego activado**\n\nVoy a ejecutar un pipeline automático por etapas para montar escena, entidades y gameplay.',
        });
        await runOrchestratedPipeline(command);
        return;
      }

      if (intent.wantsDirectSceneAction) {
        addChatMessage({
          role: 'assistant',
          content: '🧠 **Orquestador activo**\n\nEstoy ejecutando tu orden con pipeline automático de agentes (análisis → construcción → validación).',
          metadata: { agentType: 'orchestrator' },
        });
        await runOrchestratedPipeline(command);
        return;
      }

      if (intent.wantsCharacter) {
        addChatMessage({
          role: 'assistant',
          content: '🧍 **Generación de personaje**\n\nVoy a crear personaje real con fallback automático según tus toggles de APIs.',
          metadata: { agentType: 'orchestrator' },
        });
        await generateCharacterAsset(command);
        return;
      }

      if (intent.wants3D) {
        const meshyReady = await canGenerate3DModel();
        if (!meshyReady) {
          addChatMessage({
            role: 'assistant',
            content: '⚠️ **Configuración requerida**\n\nMeshy no está listo todavía. Puedo crear la base manual y dejar el objeto preparado para su scrib.',
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
    runOrchestratedPipeline,
    setAiProcessing,
  ]);

  return {
    processCommand,
  };
}
