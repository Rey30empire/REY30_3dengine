'use client';

import { useCallback } from 'react';
import { useEngineStore } from '@/store/editorStore';
import type { Agent, AgentTask, AgentType, ChatMessage, EngineWorkflowMode } from '@/types/engine';
import { engineTelemetry } from '@/engine/telemetry/engineTelemetry';

type CompileReport = {
  ok: boolean;
  summary: string;
  diagnostics: Array<{ code: string }>;
};

export function useAIOrchestrator(params: {
  engineMode: EngineWorkflowMode;
  addChatMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  addTask: (task: AgentTask) => void;
  updateAgentStatus: (agentId: string, status: Agent['status']) => void;
  updateTask: (taskId: string, updates: Partial<AgentTask>) => void;
  ensureAgentByType: (agentType: AgentType) => string;
  createBasicGameElement: (command: string, options?: { silent?: boolean }) => Promise<string[]>;
  enforceAIGenerationContract: (origin?: 'ai' | 'manual') => string[];
  runReyPlayCompile: () => CompileReport;
  onPipelineStart?: (info: { totalStages: number; firstStageTitle: string }) => void;
  onPipelineStage?: (info: {
    index: number;
    totalStages: number;
    title: string;
    status: 'running' | 'completed' | 'failed';
    error?: string;
  }) => void;
  onPipelineDone?: (info: { failed: boolean }) => void;
}) {
  const {
    engineMode,
    addChatMessage,
    addTask,
    updateAgentStatus,
    updateTask,
    ensureAgentByType,
    createBasicGameElement,
    enforceAIGenerationContract,
    runReyPlayCompile,
    onPipelineStart,
    onPipelineStage,
    onPipelineDone,
  } = params;

  const runOrchestratedPipeline = useCallback(async (command: string) => {
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    type OrchestratorStage = {
      id: string;
      title: string;
      agentType: AgentType;
      commands: string[];
    };

    const lower = command.toLowerCase();
    const hasGameKeyword = ['juego', 'game', 'nivel', 'level', 'arena'].some((keyword) =>
      lower.includes(keyword)
    );
    const wantsDelete =
      lower.includes('elimina') ||
      lower.includes('eliminar') ||
      lower.includes('borra') ||
      lower.includes('borrar') ||
      lower.includes('remove') ||
      lower.includes('delete');
    const wantsMaze = lower.includes('laberinto') || lower.includes('maze');
    const wantsScene =
      lower.includes('escena') ||
      lower.includes('scene') ||
      lower.includes('nivel') ||
      hasGameKeyword;
    const wantsTerrain =
      lower.includes('terreno') ||
      lower.includes('terrain') ||
      lower.includes('isla') ||
      lower.includes('montaña') ||
      lower.includes('montana') ||
      lower.includes('mountain');
    const wantsCharacter =
      lower.includes('personaje') ||
      lower.includes('character') ||
      lower.includes('jugador') ||
      lower.includes('player') ||
      lower.includes('heroe') ||
      lower.includes('héroe');
    const wantsEnemy =
      lower.includes('enemigo') ||
      lower.includes('enemy') ||
      lower.includes('monstruo') ||
      lower.includes('monster') ||
      lower.includes('boss') ||
      lower.includes('lobo') ||
      lower.includes('wolf') ||
      lower.includes('bestia') ||
      lower.includes('creatura') ||
      lower.includes('creature');
    const wantsWeapon =
      lower.includes('arma') ||
      lower.includes('weapon') ||
      lower.includes('espada') ||
      lower.includes('sword');
    const wantsJump =
      lower.includes('salto') ||
      lower.includes('jump') ||
      lower.includes('saltar') ||
      lower.includes('física de salto') ||
      lower.includes('fisica de salto');
    const wantsCameraJump =
      wantsJump && (lower.includes('camara') || lower.includes('cámara') || lower.includes('camera'));
    const isAIFirst = engineMode === 'MODE_AI_FIRST';
    const shouldForceSceneBase = isAIFirst && !wantsDelete && !wantsMaze;

    const stages: OrchestratorStage[] = [
      {
        id: 'analyze',
        title: 'Analizar objetivo del usuario',
        agentType: 'orchestrator',
        commands: [],
      },
    ];

    if (wantsDelete) {
      stages.push({
        id: 'cleanup',
        title: 'Limpiar elementos de escena',
        agentType: 'world_builder',
        commands: [command],
      });
    } else {
      if (wantsMaze) {
        stages.push({
          id: 'maze_scene',
          title: 'Construir escena de laberinto',
          agentType: 'world_builder',
          commands: ['crea una escena de laberinto'],
        });
      } else if (wantsScene || wantsTerrain || shouldForceSceneBase) {
        stages.push({
          id: 'scene_setup',
          title: 'Crear base de escena',
          agentType: wantsTerrain ? 'terrain' : 'world_builder',
          commands: [wantsTerrain ? 'crea una escena base con terreno' : 'crea una escena base'],
        });
      }

      const entityCommands: string[] = [];
      if (isAIFirst) {
        entityCommands.push(command);
      } else {
        if (wantsCharacter) entityCommands.push('crea personaje jugable');
        if (wantsEnemy) {
          entityCommands.push(lower.includes('lobo') || lower.includes('wolf') ? 'crea lobo blanco' : 'crea monstruo');
        }
        if (wantsWeapon) entityCommands.push('crea espada medieval');

        if (
          entityCommands.length === 0 &&
          !wantsScene &&
          !wantsTerrain &&
          !wantsMaze &&
          !wantsJump
        ) {
          entityCommands.push(command);
        }
      }

      if (entityCommands.length === 0 && shouldForceSceneBase) {
        entityCommands.push(command);
      }

      if (entityCommands.length > 0) {
        stages.push({
          id: 'entities',
          title: 'Crear entidades principales',
          agentType: 'model_generator',
          commands: entityCommands,
        });
      }

      if (wantsJump || (isAIFirst && hasGameKeyword)) {
        stages.push({
          id: 'gameplay',
          title: 'Configurar gameplay y físicas',
          agentType: 'gameplay',
          commands: [wantsCameraJump ? 'aplica fisica de salto a camara' : 'aplica fisica de salto'],
        });
      }
    }

    stages.push({
      id: 'validation',
      title: 'Validar escena y estado final',
      agentType: 'optimization',
      commands: [],
    });

    addChatMessage({
      role: 'assistant',
      content: `🧩 **Pipeline automático iniciado**\n\nOrden: "${command}"\nEtapas: ${stages.map((stage) => stage.title).join(' → ')}`,
      metadata: { agentType: 'orchestrator' },
    });
    onPipelineStart?.({
      totalStages: stages.length,
      firstStageTitle: stages[0]?.title || '',
    });

    const stageSummaries: string[] = [];
    let failed = false;

    for (let stageIndex = 0; stageIndex < stages.length; stageIndex += 1) {
      const stage = stages[stageIndex];
      onPipelineStage?.({
        index: stageIndex + 1,
        totalStages: stages.length,
        title: stage.title,
        status: 'running',
      });
      const agentId = ensureAgentByType(stage.agentType);
      const taskId = crypto.randomUUID();
      const task: AgentTask = {
        id: taskId,
        agentId,
        type: stage.id,
        prompt: stage.commands.join(' | ') || stage.title,
        status: 'pending',
        result: null,
        createdAt: new Date(),
      };

      addTask(task);
      updateAgentStatus(agentId, 'working');
      updateTask(taskId, { status: 'processing' });

      try {
        const output: string[] = [];
        if (stage.id === 'analyze') {
          output.push('✓ Prompt analizado y desglosado');
          output.push(`✓ Intenciones detectadas: ${[
            wantsDelete ? 'eliminar' : null,
            wantsMaze ? 'laberinto' : null,
            wantsScene ? 'escena' : null,
            wantsTerrain ? 'terreno' : null,
            wantsCharacter ? 'personaje' : null,
            wantsEnemy ? 'enemigo' : null,
            wantsWeapon ? 'arma' : null,
            wantsJump ? 'salto' : null,
          ].filter(Boolean).join(', ') || 'general'}`);
          output.push(
            `✓ Modo de ejecución: ${
              isAIFirst
                ? 'AI First (prompt único + pipeline completo)'
                : 'Hybrid (IA + edición humana)'
            }`
          );
        } else if (stage.id === 'validation') {
          const state = useEngineStore.getState();
          output.push(`✓ Entidades totales: ${state.entities.size}`);
          output.push(`✓ Selección activa: ${state.editor.selectedEntities.length}`);
          output.push(`✓ Escenas disponibles: ${state.scenes.length}`);
          output.push(...enforceAIGenerationContract('ai'));
          const report = runReyPlayCompile();
          output.push(`✓ Composer/Runtime: ${report.summary}`);
          if (!report.ok && report.diagnostics.length > 0) {
            output.push(
              `⚠️ Diagnósticos: ${report.diagnostics
                .slice(0, 2)
                .map((item) => item.code)
                .join(', ')}`
            );
          }
        } else {
          for (const stageCommand of stage.commands) {
            const commandResults = await createBasicGameElement(stageCommand, { silent: true });
            output.push(...commandResults);
          }
        }

        updateTask(taskId, {
          status: 'completed',
          result: output,
          completedAt: new Date(),
        });
        updateAgentStatus(agentId, 'idle');

        stageSummaries.push(`✓ ${stage.title}`);
        output.slice(0, 3).forEach((line) => stageSummaries.push(`  ${line}`));
        onPipelineStage?.({
          index: stageIndex + 1,
          totalStages: stages.length,
          title: stage.title,
          status: 'completed',
        });
      } catch (error) {
        failed = true;
        updateTask(taskId, {
          status: 'failed',
          error: String(error),
          completedAt: new Date(),
        });
        updateAgentStatus(agentId, 'error');
        stageSummaries.push(`✗ ${stage.title}: ${String(error)}`);
        onPipelineStage?.({
          index: stageIndex + 1,
          totalStages: stages.length,
          title: stage.title,
          status: 'failed',
          error: String(error),
        });
        break;
      }
    }

    addChatMessage({
      role: 'assistant',
      content: failed
        ? `⚠️ **Pipeline con incidencias**\n${stageSummaries.join('\n')}`
        : `✅ **Pipeline completado**\n${stageSummaries.join('\n')}`,
      metadata: { agentType: 'orchestrator' },
    });

    const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt;
    engineTelemetry.recordPromptToSceneDuration(elapsed, {
      mode: engineMode,
      failed,
      stages: stages.length,
      commandLength: command.length,
    });
    onPipelineDone?.({ failed });
  }, [
    addChatMessage,
    addTask,
    createBasicGameElement,
    enforceAIGenerationContract,
    engineMode,
    ensureAgentByType,
    onPipelineDone,
    onPipelineStage,
    onPipelineStart,
    runReyPlayCompile,
    updateAgentStatus,
    updateTask,
  ]);

  return {
    runOrchestratedPipeline,
  };
}
