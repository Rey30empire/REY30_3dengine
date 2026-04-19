import { createToolCall } from '../tools/ToolRegistry';
import { BaseAgent } from './BaseAgent';
import type { TaskStep, ToolCall, WorldState } from '../schemas';

export class AnimationAgent extends BaseAgent {
  constructor() {
    super('animation', 'Creates and assigns animation clips and states.', ['animation'], [
      'animation.createClip',
      'animation.attachClip',
      'animation.editTimeline',
      'animation.assignState',
    ]);
  }

  planLocalActions(task: TaskStep, _worldState: WorldState): ToolCall[] {
    return [
      createToolCall('animation.createClip', this.role, task.id, {
        name: task.description.toLowerCase().includes('entrada') ? 'Entrance Animation' : 'Idle Patrol',
        duration: task.description.toLowerCase().includes('entrada') ? 1.6 : 1.2,
        metadata: { createdFor: task.id },
      }),
      createToolCall('animation.attachClip', this.role, task.id, {
        animationId: '$lastAnimationId',
        state: task.description.toLowerCase().includes('entrada') ? 'entrance' : 'idle',
      }),
      createToolCall('animation.assignState', this.role, task.id, {
        state: task.description.toLowerCase().includes('entrada') ? 'entrance' : 'idle',
      }),
    ];
  }
}
