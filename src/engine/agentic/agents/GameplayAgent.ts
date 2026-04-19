import { createToolCall } from '../tools/ToolRegistry';
import { BaseAgent } from './BaseAgent';
import { recommendationInputForTool } from './recommendations';
import type { AgentContext, TaskStep, ToolCall, WorldState } from '../schemas';

export class GameplayAgent extends BaseAgent {
  constructor() {
    super('gameplay', 'Creates scripts, triggers and simple gameplay behaviors.', ['gameplay'], [
      'script.create',
      'script.attach',
      'script.updateParameters',
      'trigger.register',
    ]);
  }

  planLocalActions(task: TaskStep, _worldState: WorldState, context?: AgentContext): ToolCall[] {
    const patrol = task.description.toLowerCase().includes('patrulla') || task.requiredCapabilities.includes('gameplay.patrol');
    const scriptRecommendation = recommendationInputForTool(context, 'script.create');
    const attachRecommendation = recommendationInputForTool(context, 'script.attach');
    const triggerRecommendation = recommendationInputForTool(context, 'trigger.register');
    return [
      createToolCall('script.create', this.role, task.id, {
        name: patrol ? 'PatrolNpcController' : 'GameplayController',
        behavior: patrol ? 'patrol' : 'generic',
        parameters: patrol
          ? { speed: 2, loop: true, points: [{ x: -2, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }] }
          : {},
        ...(scriptRecommendation ?? {}),
      }),
      createToolCall('script.attach', this.role, task.id, {
        scriptId: '$lastScriptId',
        parameters: patrol
          ? { speed: 2, loop: true, points: [{ x: -2, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }] }
          : {},
        ...(attachRecommendation ?? {}),
      }),
      ...(patrol
        ? [
            createToolCall('trigger.register', this.role, task.id, {
              event: 'onPatrolPointReached',
              action: 'advancePatrolRoute',
              ...(triggerRecommendation ?? {}),
            }),
          ]
        : []),
    ];
  }
}
