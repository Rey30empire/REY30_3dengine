import { createToolCall } from '../tools/ToolRegistry';
import { BaseAgent } from './BaseAgent';
import { recommendationInputForTool } from './recommendations';
import type { AgentContext, TaskStep, ToolCall, WorldState } from '../schemas';

export class LightingEnvironmentAgent extends BaseAgent {
  constructor() {
    super('lighting_environment', 'Controls scene fog, lighting and sky mood.', ['lighting', 'environment'], [
      'lighting.adjustLight',
      'environment.configureFog',
      'environment.changeSky',
      'material.change',
    ]);
  }

  planLocalActions(task: TaskStep, _worldState: WorldState, context?: AgentContext): ToolCall[] {
    const text = task.description.toLowerCase();
    const dark = text.includes('oscuro') || text.includes('dark') || task.acceptanceCriteria.some((item) => item.includes('dark'));
    const calls: ToolCall[] = [];
    const fogRecommendation = recommendationInputForTool(context, 'environment.configureFog');
    const skyRecommendation = recommendationInputForTool(context, 'environment.changeSky');
    const lightRecommendation = recommendationInputForTool(context, 'lighting.adjustLight');

    if (
      task.requiredCapabilities.includes('environment.fog') ||
      task.requiredCapabilities.includes('environment.configureFog')
    ) {
      calls.push(
        createToolCall('environment.configureFog', this.role, task.id, {
          enabled: true,
          type: dark ? 'exponential' : 'linear',
          density: dark ? 0.065 : 0.035,
          color: dark ? { r: 0.08, g: 0.1, b: 0.13, a: 1 } : { r: 0.58, g: 0.62, b: 0.68, a: 1 },
          ...(fogRecommendation ?? {}),
        })
      );
    }

    if (
      task.requiredCapabilities.includes('environment.sky') ||
      task.requiredCapabilities.includes('environment.changeSky') ||
      dark
    ) {
      calls.push(
        createToolCall('environment.changeSky', this.role, task.id, {
          skybox: dark ? 'agentic_dark_sky' : 'agentic_cinematic_sky',
          mood: dark ? 'dark' : 'cinematic',
          ...(skyRecommendation ?? {}),
        })
      );
    }

    if (
      task.requiredCapabilities.includes('lighting.adjust') ||
      task.requiredCapabilities.includes('lighting.adjustLight') ||
      dark
    ) {
      calls.push(
        createToolCall('lighting.adjustLight', this.role, task.id, {
          mood: dark ? 'dark' : 'cinematic',
          ambientIntensity: dark ? 0.18 : 0.62,
          directionalLightIntensity: dark ? 0.38 : 1.1,
          ...(lightRecommendation ?? {}),
        })
      );
    }

    return calls;
  }
}
