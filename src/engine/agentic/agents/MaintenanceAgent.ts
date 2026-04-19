import { createToolCall } from '../tools/ToolRegistry';
import { BaseAgent } from './BaseAgent';
import { recommendationInputForTool } from './recommendations';
import type { AgentContext, TaskStep, ToolCall, WorldState } from '../schemas';

export class MaintenanceAgent extends BaseAgent {
  constructor() {
    super('maintenance', 'Repairs inconsistent scene state and reindexes supporting data.', ['maintenance', 'physics', 'asset'], [
      'scene.analyze',
      'world.inspect',
      'scene.modify',
      'scene.deleteObject',
      'entity.editHierarchy',
      'asset.validate',
      'asset.reindex',
      'physics.fixBasicCollisions',
    ]);
  }

  planLocalActions(task: TaskStep, _worldState: WorldState, context?: AgentContext): ToolCall[] {
    const calls: ToolCall[] = [];
    const physicsRecommendation = recommendationInputForTool(context, 'physics.fixBasicCollisions');
    const reindexRecommendation = recommendationInputForTool(context, 'asset.reindex');
    if (
      task.requiredCapabilities.includes('scene.analyze') ||
      task.requiredCapabilities.includes('world.inspect')
    ) {
      return [
        createToolCall(
          task.requiredCapabilities.includes('world.inspect') ? 'world.inspect' : 'scene.analyze',
          this.role,
          task.id,
          {
            scope: task.requiredCapabilities.includes('world.inspect') ? 'world' : 'active_scene',
            reason: 'ambiguity-preflight',
          }
        ),
      ];
    }
    if (task.requiredCapabilities.includes('physics.fix') || task.description.toLowerCase().includes('colision')) {
      calls.push(createToolCall('physics.fixBasicCollisions', this.role, task.id, {
        preset: 'npc',
        ...(physicsRecommendation ?? {}),
      }));
    }
    calls.push(createToolCall('asset.reindex', this.role, task.id, {
      reason: 'maintenance-pass',
      ...(reindexRecommendation ?? {}),
    }));
    return calls;
  }
}
