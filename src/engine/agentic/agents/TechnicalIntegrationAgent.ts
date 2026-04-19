import { createToolCall } from '../tools/ToolRegistry';
import { BaseAgent } from './BaseAgent';
import { recommendationInputForTool } from './recommendations';
import type { AgentContext, TaskStep, ToolCall, WorldState } from '../schemas';

export class TechnicalIntegrationAgent extends BaseAgent {
  constructor() {
    super('technical_integration', 'Validates export readiness and produces build artifacts.', ['build', 'asset'], [
      'build.validateScene',
      'build.export',
      'build.generateReport',
      'asset.validate',
      'asset.reindex',
    ]);
  }

  planLocalActions(task: TaskStep, _worldState: WorldState, context?: AgentContext): ToolCall[] {
    const assetValidationRecommendation = recommendationInputForTool(context, 'asset.validate');
    const sceneValidationRecommendation = recommendationInputForTool(context, 'build.validateScene');
    const exportRecommendation = recommendationInputForTool(context, 'build.export');
    const reportRecommendation = recommendationInputForTool(context, 'build.generateReport');
    const calls: ToolCall[] = [
      createToolCall('asset.validate', this.role, task.id, {
        scope: 'scene',
        ...(assetValidationRecommendation ?? {}),
      }),
      createToolCall('build.validateScene', this.role, task.id, {
        target: 'web',
        ...(sceneValidationRecommendation ?? {}),
      }),
    ];

    if (task.requiredCapabilities.includes('build.export')) {
      calls.push(createToolCall('build.export', this.role, task.id, {
        target: 'web',
        ...(exportRecommendation ?? {}),
      }));
    }

    calls.push(
      createToolCall('build.generateReport', this.role, task.id, {
        summary: `Technical integration checked ${task.title}`,
        ...(reportRecommendation ?? {}),
      })
    );

    return calls;
  }
}
