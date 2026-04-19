import { createToolCall } from '../tools/ToolRegistry';
import { BaseAgent } from './BaseAgent';
import { recommendationInputForTool } from './recommendations';
import type { AgentContext, TaskStep, ToolCall, WorldState } from '../schemas';

export class ModelingAgent extends BaseAgent {
  constructor() {
    super('modeling', 'Creates scene entities, primitive model placeholders and material assignments.', ['entity', 'modeling', 'asset', 'material'], [
      'entity.create',
      'entity.assignComponent',
      'entity.editTransform',
      'material.create',
      'material.change',
      'asset.import',
      'asset.register',
    ]);
  }

  planLocalActions(task: TaskStep, _worldState: WorldState, context?: AgentContext): ToolCall[] {
    const wantsNpc = task.description.toLowerCase().includes('npc') || task.requiredCapabilities.includes('entity.npc');
    const calls: ToolCall[] = [];
    const entityRecommendation = recommendationInputForTool(context, 'entity.create');
    const materialRecommendation = recommendationInputForTool(context, 'material.create');

    if (wantsNpc) {
      calls.push(
        createToolCall('entity.create', this.role, task.id, {
          name: 'Patrol NPC',
          type: 'npc',
          tags: ['npc', 'patrol-target'],
          metadata: { createdFor: task.id },
          ...(entityRecommendation ?? {}),
        }),
        createToolCall('entity.assignComponent', this.role, task.id, {
          entityId: '$lastEntityId',
          componentType: 'MeshRenderer',
          data: { mesh: 'agentic_capsule_proxy', material: 'npc_default' },
        })
      );
      return calls;
    }

    if (task.description.toLowerCase().includes('city')) {
      for (let index = 0; index < 5; index += 1) {
        calls.push(
          createToolCall('entity.create', this.role, task.id, {
            name: `Futuristic Building ${index + 1}`,
            type: 'mesh',
            tags: ['city', 'futuristic'],
            metadata: { blockIndex: index },
            ...(index === 0 && entityRecommendation ? entityRecommendation : {}),
          })
        );
      }
      return calls;
    }

    calls.push(
      createToolCall('entity.create', this.role, task.id, {
        name: 'Agentic Mesh Placeholder',
        type: 'mesh',
        tags: ['agentic-generated'],
        ...(entityRecommendation ?? {}),
      })
    );
    if (materialRecommendation) {
      calls.push(createToolCall('material.create', this.role, task.id, materialRecommendation));
    }
    return calls;
  }
}
