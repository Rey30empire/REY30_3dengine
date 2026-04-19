import { createToolCall } from '../tools/ToolRegistry';
import { BaseAgent } from './BaseAgent';
import type { TaskStep, ToolCall, WorldState } from '../schemas';

export class ProjectManagerAgent extends BaseAgent {
  constructor() {
    super('project_manager', 'Coordinates project-level validation and reports.', ['build', 'maintenance'], [
      'build.validateScene',
      'build.generateReport',
    ]);
  }

  planLocalActions(task: TaskStep, _worldState: WorldState): ToolCall[] {
    const calls = [
      createToolCall('build.validateScene', this.role, task.id, { target: 'web' }),
    ];

    if (task.requiredCapabilities.includes('build.report')) {
      calls.push(
        createToolCall('build.generateReport', this.role, task.id, {
          summary: `Project manager report for ${task.title}`,
        })
      );
    }

    return calls;
  }
}
