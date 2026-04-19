import { createToolCall } from '../tools/ToolRegistry';
import { BaseAgent } from './BaseAgent';
import { recommendationInputForTool } from './recommendations';
import type { AgentContext, TaskStep, ToolCall, WorldState } from '../schemas';

export class PhysicsAgent extends BaseAgent {
  constructor() {
    super('physics', 'Adds and repairs colliders, rigidbodies and physics presets.', ['physics'], [
      'physics.addCollider',
      'physics.adjustRigidbody',
      'physics.fixBasicCollisions',
      'physics.applyPreset',
      'entity.assignComponent',
    ]);
  }

  planLocalActions(task: TaskStep, _worldState: WorldState, context?: AgentContext): ToolCall[] {
    const fixRecommendation = recommendationInputForTool(context, 'physics.fixBasicCollisions');
    const colliderRecommendation = recommendationInputForTool(context, 'physics.addCollider');
    const rigidbodyRecommendation = recommendationInputForTool(context, 'physics.adjustRigidbody');
    const presetRecommendation = recommendationInputForTool(context, 'physics.applyPreset');

    if (task.requiredCapabilities.includes('physics.fix')) {
      return [
        createToolCall('physics.fixBasicCollisions', this.role, task.id, {
          preset: 'npc',
          ...(fixRecommendation ?? {}),
        }),
      ];
    }

    return [
      createToolCall('physics.addCollider', this.role, task.id, {
        colliderType: 'capsule',
        ...(colliderRecommendation ?? {}),
      }),
      createToolCall('physics.adjustRigidbody', this.role, task.id, {
        mass: 1,
        useGravity: true,
        ...(rigidbodyRecommendation ?? {}),
      }),
      createToolCall('physics.applyPreset', this.role, task.id, {
        preset: 'npc',
        ...(presetRecommendation ?? {}),
      }),
    ];
  }
}
