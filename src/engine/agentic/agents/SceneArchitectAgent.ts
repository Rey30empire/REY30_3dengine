import { createToolCall } from '../tools/ToolRegistry';
import { BaseAgent } from './BaseAgent';
import { recommendationInputForTool } from './recommendations';
import type { AgentContext, TaskStep, ToolCall, WorldState } from '../schemas';

export class SceneArchitectAgent extends BaseAgent {
  constructor() {
    super('scene_architect', 'Creates and reorganizes scene layout and hierarchy.', ['scene', 'layout'], [
      'scene.create',
      'scene.modify',
      'scene.moveObject',
      'scene.groupObjects',
      'scene.duplicateObject',
      'scene.deleteObject',
      'entity.create',
      'entity.editHierarchy',
      'entity.editTransform',
    ]);
  }

  planLocalActions(task: TaskStep, worldState: WorldState, context?: AgentContext): ToolCall[] {
    const calls: ToolCall[] = [];
    const activeScene = worldState.activeSceneId ? worldState.scenes[worldState.activeSceneId] : null;
    const latestAnalysis = context?.sharedMemory.analyses.at(-1);
    const createRecommendation = recommendationInputForTool(context, 'scene.create');
    const modifyRecommendation = recommendationInputForTool(context, 'scene.modify');

    if (!activeScene || task.requiredCapabilities.includes('scene.create')) {
      calls.push(createToolCall('scene.create', this.role, task.id, {
        name: 'Agentic Working Scene',
        ...(createRecommendation ?? {}),
      }));
    }

    if (
      task.requiredCapabilities.includes('scene.layout') ||
      task.requiredCapabilities.includes('scene.groupObjects')
    ) {
      const scene = activeScene;
      const entityIds = scene?.rootEntityIds ?? [];
      calls.push(
        createToolCall('scene.groupObjects', this.role, task.id, {
          sceneId: scene?.id ?? '$activeSceneId',
          name: 'Reorganized Layout',
          entityIds,
        })
      );

      entityIds.slice(0, 4).forEach((entityId, index) => {
        calls.push(
          createToolCall('scene.moveObject', this.role, task.id, {
            entityId,
            transform: {
              position: { x: index * 2 - 3, y: 0, z: index % 2 === 0 ? -1.5 : 1.5 },
            },
          })
        );
      });
    }

    if (!calls.length) {
      calls.push(
        createToolCall('scene.modify', this.role, task.id, {
          metadata: {
            reviewedBy: this.role,
            analysisId: latestAnalysis?.id ?? null,
            analysisIssueCount: latestAnalysis?.output.issues && Array.isArray(latestAnalysis.output.issues)
              ? latestAnalysis.output.issues.length
              : 0,
            actionableRecommendationCount: context?.sharedMemory.actionableRecommendations.length ?? 0,
          },
          ...(modifyRecommendation ?? {}),
        })
      );
    }

    return calls;
  }
}
