import {
  type ActionableRecommendation,
  type AgenticEntity,
  type JsonObject,
  type ToolCall,
  type ToolDefinition,
  type UserIntentDomain,
  type WorldState,
  createAgenticId,
} from '../schemas';
import { okToolResult } from './toolResult';

function countByEntityType(entities: AgenticEntity[]): JsonObject {
  return entities.reduce<JsonObject>((counts, entity) => {
    const current = typeof counts[entity.type] === 'number' ? Number(counts[entity.type]) : 0;
    counts[entity.type] = current + 1;
    return counts;
  }, {});
}

function uniqueComponentTypes(entities: AgenticEntity[]): string[] {
  return [
    ...new Set(
      entities.flatMap((entity) =>
        Object.values(entity.components).map((component) => component.type)
      )
    ),
  ].sort();
}

type InspectionIssue = {
  code: string;
  summary: string;
  suggestedDomain: UserIntentDomain;
  suggestedToolNames: string[];
  suggestedCapabilities: string[];
  input: JsonObject;
  priority: ActionableRecommendation['priority'];
};

function findSceneIssues(world: WorldState): InspectionIssue[] {
  const issues: string[] = [];
  const activeScene = world.activeSceneId ? world.scenes[world.activeSceneId] : null;

  if (!activeScene) {
    issues.push('NO_ACTIVE_SCENE');
  }
  if (activeScene && activeScene.entityIds.length === 0) {
    issues.push('ACTIVE_SCENE_EMPTY');
  }
  if (activeScene && activeScene.environment.mood === 'dark' && activeScene.environment.ambientIntensity > 0.35) {
    issues.push('DARK_SCENE_TOO_BRIGHT');
  }
  if (
    activeScene &&
    activeScene.environment.fog?.enabled &&
    activeScene.environment.fog.type === 'exponential' &&
    (activeScene.environment.fog.density ?? 0) <= 0
  ) {
    issues.push('FOG_DENSITY_INVALID');
  }

  return issues.map((code): InspectionIssue => {
    if (code === 'NO_ACTIVE_SCENE') {
      return {
        code,
        summary: 'No active scene exists.',
        suggestedDomain: 'scene',
        suggestedToolNames: ['scene.create'],
        suggestedCapabilities: ['scene.create'],
        input: { name: 'Agentic Working Scene' },
        priority: 'critical',
      };
    }
    if (code === 'ACTIVE_SCENE_EMPTY') {
      return {
        code,
        summary: 'Active scene has no entities.',
        suggestedDomain: 'entity',
        suggestedToolNames: ['entity.create'],
        suggestedCapabilities: ['entity.create'],
        input: { name: 'Scene Anchor', type: 'empty', tags: ['analysis-suggested'] },
        priority: 'normal',
      };
    }
    if (code === 'DARK_SCENE_TOO_BRIGHT') {
      return {
        code,
        summary: 'Scene mood is dark but ambient intensity is high.',
        suggestedDomain: 'lighting',
        suggestedToolNames: ['lighting.adjustLight'],
        suggestedCapabilities: ['lighting.adjustLight'],
        input: { mood: 'dark', ambientIntensity: 0.22, directionalLightIntensity: 0.45 },
        priority: 'critical',
      };
    }
    return {
      code,
      summary: 'Fog is enabled but density is not positive.',
      suggestedDomain: 'environment',
      suggestedToolNames: ['environment.configureFog'],
      suggestedCapabilities: ['environment.configureFog'],
      input: { enabled: true, type: 'exponential', density: 0.045 },
      priority: 'critical',
    };
  });
}

function actionableRecommendations(
  call: ToolCall,
  issues: InspectionIssue[],
  fallbackSummary: string
): ActionableRecommendation[] {
  const sourceIssues = issues.length
    ? issues
    : [
        {
          code: 'NO_BLOCKING_ISSUE',
          summary: fallbackSummary,
          suggestedDomain: 'maintenance' as const,
          suggestedToolNames: ['asset.reindex'],
          suggestedCapabilities: ['asset.reindex'],
          input: { reason: 'analysis-confirmed-maintenance' },
          priority: 'optional' as const,
        },
      ];

  return sourceIssues.map((issue) => ({
    id: createAgenticId('recommendation'),
    approvalKey: `${call.toolName}:${issue.code}:${issue.suggestedToolNames.join('|')}`,
    sourceToolName: call.toolName,
    sourceCallId: call.id,
    summary: issue.summary,
    rationale: issue.code,
    priority: issue.priority,
    suggestedDomain: issue.suggestedDomain,
    suggestedCapabilities: issue.suggestedCapabilities,
    suggestedToolNames: issue.suggestedToolNames,
    input: issue.input,
    confidence: issue.priority === 'critical' ? 0.86 : issue.priority === 'normal' ? 0.72 : 0.55,
    approvalStatus: 'pending',
  }));
}

function recommendationToJson(recommendation: ActionableRecommendation): JsonObject {
  return {
    id: recommendation.id,
    approvalKey: recommendation.approvalKey,
    sourceToolName: recommendation.sourceToolName,
    sourceCallId: recommendation.sourceCallId,
    summary: recommendation.summary,
    rationale: recommendation.rationale,
    priority: recommendation.priority,
    suggestedDomain: recommendation.suggestedDomain,
    suggestedCapabilities: recommendation.suggestedCapabilities,
    suggestedToolNames: recommendation.suggestedToolNames,
    input: recommendation.input,
    confidence: recommendation.confidence,
    approvalStatus: recommendation.approvalStatus,
  };
}

function assetTypes(world: WorldState): JsonObject {
  return Object.values(world.assets).reduce<JsonObject>((counts, asset) => {
    const current = typeof counts[asset.type] === 'number' ? Number(counts[asset.type]) : 0;
    counts[asset.type] = current + 1;
    return counts;
  }, {});
}

export function createInspectionTools(): ToolDefinition[] {
  return [
    {
      name: 'scene.analyze',
      description: 'Inspect the active scene and world state without mutating project data.',
      capabilities: ['scene.analyze', 'world.inspect'],
      mutatesWorld: false,
      evidenceContract: 'none',
      execute(input, context) {
        const world = context.world.getSnapshot();
        const activeScene = world.activeSceneId ? world.scenes[world.activeSceneId] : null;
        const entities = Object.values(world.entities);
        const activeSceneEntityIds = activeScene?.entityIds ?? [];
        const activeSceneEntities = activeSceneEntityIds
          .map((entityId) => world.entities[entityId])
          .filter((entity): entity is AgenticEntity => Boolean(entity));
        const scope = typeof input.scope === 'string' ? input.scope : 'active_scene';
        const issues = findSceneIssues(world);
        const recommendations = issues.length
          ? issues.map((issue) => `Resolve: ${issue.summary}`)
          : ['Scene structure is inspectable; proceed with targeted mutating tools only if the user request requires changes.'];
        const actionable = actionableRecommendations(
          context.call,
          issues,
          'Scene structure is inspectable; no blocking scene issue was detected.'
        );

        return okToolResult(context.call, 'Scene analysis completed without mutating world state.', [], {
          scope,
          activeSceneId: activeScene?.id ?? null,
          activeSceneName: activeScene?.name ?? null,
          counts: {
            scenes: Object.keys(world.scenes).length,
            entities: entities.length,
            activeSceneEntities: activeSceneEntities.length,
            materials: Object.keys(world.materials).length,
            assets: Object.keys(world.assets).length,
            scripts: Object.keys(world.scripts).length,
            animations: Object.keys(world.animations).length,
            buildReports: Object.keys(world.buildReports).length,
          },
          entityTypes: countByEntityType(activeSceneEntities.length ? activeSceneEntities : entities),
          componentTypes: uniqueComponentTypes(activeSceneEntities.length ? activeSceneEntities : entities),
          environment: activeScene
            ? {
                mood: activeScene.environment.mood,
                fogEnabled: activeScene.environment.fog?.enabled === true,
                ambientIntensity: activeScene.environment.ambientIntensity,
                directionalLightIntensity: activeScene.environment.directionalLightIntensity,
              }
            : null,
          issues: issues.map((issue) => issue.summary),
          recommendations,
          actionableRecommendations: actionable.map(recommendationToJson),
        });
      },
    },
    {
      name: 'world.inspect',
      description: 'Inspect the global agentic world state without focusing on or mutating the active scene.',
      capabilities: ['world.inspect'],
      mutatesWorld: false,
      evidenceContract: 'none',
      execute(input, context) {
        const world = context.world.getSnapshot();
        const entities = Object.values(world.entities);
        const scenes = Object.values(world.scenes);
        const emptyScenes = scenes.filter((scene) => scene.entityIds.length === 0);
        const issues: InspectionIssue[] = [];

        if (!scenes.length) {
          issues.push({
            code: 'WORLD_HAS_NO_SCENES',
            summary: 'World has no scenes.',
            suggestedDomain: 'scene',
            suggestedToolNames: ['scene.create'],
            suggestedCapabilities: ['scene.create'],
            input: { name: 'Agentic Working Scene' },
            priority: 'critical',
          });
        }
        if (emptyScenes.length > 0) {
          issues.push({
            code: 'WORLD_HAS_EMPTY_SCENES',
            summary: `${emptyScenes.length} scene(s) have no entities.`,
            suggestedDomain: 'entity',
            suggestedToolNames: ['entity.create'],
            suggestedCapabilities: ['entity.create'],
            input: { name: 'Scene Anchor', type: 'empty', tags: ['world-inspection-suggested'] },
            priority: 'normal',
          });
        }

        const actionable = actionableRecommendations(
          context.call,
          issues,
          'World state is inspectable; no blocking global issue was detected.'
        );

        return okToolResult(context.call, 'World inspection completed without mutating world state.', [], {
          scope: typeof input.scope === 'string' ? input.scope : 'world',
          activeSceneId: world.activeSceneId,
          counts: {
            scenes: scenes.length,
            entities: entities.length,
            materials: Object.keys(world.materials).length,
            assets: Object.keys(world.assets).length,
            scripts: Object.keys(world.scripts).length,
            animations: Object.keys(world.animations).length,
            buildReports: Object.keys(world.buildReports).length,
          },
          sceneSummaries: scenes.map((scene) => ({
            id: scene.id,
            name: scene.name,
            entityCount: scene.entityIds.length,
            mood: scene.environment.mood,
          })),
          entityTypes: countByEntityType(entities),
          assetTypes: assetTypes(world),
          componentTypes: uniqueComponentTypes(entities),
          issues: issues.map((issue) => issue.summary),
          recommendations: issues.length
            ? issues.map((issue) => `Resolve: ${issue.summary}`)
            : ['World state is inspectable; no blocking global issue was detected.'],
          actionableRecommendations: actionable.map(recommendationToJson),
        });
      },
    },
  ];
}
