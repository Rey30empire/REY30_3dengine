import { type AgenticAsset, type JsonObject, type ToolDefinition } from '../schemas';
import { okToolResult } from './toolResult';

function assetType(value: unknown): AgenticAsset['type'] {
  const allowed: AgenticAsset['type'][] = ['mesh', 'texture', 'material', 'script', 'animation', 'audio', 'scene', 'unknown'];
  return typeof value === 'string' && allowed.includes(value as AgenticAsset['type'])
    ? (value as AgenticAsset['type'])
    : 'unknown';
}

export function createAssetBuildTools(): ToolDefinition[] {
  return [
    {
      name: 'asset.import',
      description: 'Import an asset reference into the agentic world state.',
      capabilities: ['asset.import'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        const result = context.world.registerAsset({
          name: typeof input.name === 'string' ? input.name : 'Imported Asset',
          type: assetType(input.type),
          path: typeof input.path === 'string' ? input.path : '',
          valid: true,
          metadata:
            input.metadata && typeof input.metadata === 'object'
              ? (input.metadata as JsonObject)
              : {},
        });
        return okToolResult(context.call, 'Asset imported.', [result.evidence], {
          assetId: result.asset.id,
        });
      },
    },
    {
      name: 'asset.register',
      description: 'Register an already available asset.',
      capabilities: ['asset.register'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        const result = context.world.registerAsset({
          name: typeof input.name === 'string' ? input.name : 'Registered Asset',
          type: assetType(input.type),
          path: typeof input.path === 'string' ? input.path : '',
          valid: input.valid !== false,
          metadata:
            input.metadata && typeof input.metadata === 'object'
              ? (input.metadata as JsonObject)
              : {},
        });
        return okToolResult(context.call, 'Asset registered.', [result.evidence], {
          assetId: result.asset.id,
        });
      },
    },
    {
      name: 'asset.validate',
      description: 'Validate registered assets in the world state.',
      capabilities: ['asset.validate'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        const state = context.world.getSnapshot();
        const invalidAssets = Object.values(state.assets).filter((asset) => !asset.valid || !asset.path);
        const result = context.world.addBuildReport({
          status: invalidAssets.length ? 'invalid' : 'valid',
          summary: invalidAssets.length
            ? `${invalidAssets.length} asset references need attention.`
            : 'All registered assets are valid.',
          issues: invalidAssets.map((asset) => `Invalid asset: ${asset.name}`),
        });
        return okToolResult(context.call, 'Asset validation completed.', [result.evidence], {
          invalidCount: invalidAssets.length,
          requestedScope: typeof input.scope === 'string' ? input.scope : 'all',
        });
      },
    },
    {
      name: 'asset.reindex',
      description: 'Generate an asset reindex report.',
      capabilities: ['asset.reindex'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        const assetCount = Object.keys(context.world.getSnapshot().assets).length;
        const result = context.world.addBuildReport({
          status: 'valid',
          summary: `Reindexed ${assetCount} assets.`,
          issues: [],
        });
        return okToolResult(context.call, 'Assets reindexed.', [result.evidence], {
          assetCount,
          reason: typeof input.reason === 'string' ? input.reason : 'manual',
        });
      },
    },
    {
      name: 'build.validateScene',
      description: 'Validate that the active scene is exportable.',
      capabilities: ['build.validate'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        const state = context.world.getSnapshot();
        const scene = state.activeSceneId ? state.scenes[state.activeSceneId] : null;
        const issues = scene ? [] : ['No active scene exists.'];
        if (scene && scene.entityIds.length === 0) {
          issues.push('Active scene has no entities.');
        }
        const result = context.world.addBuildReport({
          status: issues.length ? 'invalid' : 'valid',
          summary: issues.length ? 'Scene is not exportable yet.' : 'Scene is exportable.',
          issues,
        });
        return okToolResult(context.call, 'Scene export validation completed.', [result.evidence], {
          issueCount: issues.length,
          sceneId: scene?.id ?? '',
          requestedTarget: typeof input.target === 'string' ? input.target : 'web',
        });
      },
    },
    {
      name: 'build.export',
      description: 'Record an export artifact for the active scene.',
      capabilities: ['build.export'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        const target = typeof input.target === 'string' ? input.target : 'web';
        const result = context.world.addBuildReport({
          status: 'exported',
          summary: `Exported agentic scene for ${target}.`,
          issues: [],
          artifactPath: `output/agentic/${target}/manifest.json`,
        });
        return okToolResult(context.call, 'Build export completed.', [result.evidence], {
          artifactPath: result.report.artifactPath ?? '',
          target,
        });
      },
    },
    {
      name: 'build.generateReport',
      description: 'Generate a build or pipeline report.',
      capabilities: ['build.report'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        const result = context.world.addBuildReport({
          status: 'valid',
          summary: typeof input.summary === 'string' ? input.summary : 'Agentic pipeline report generated.',
          issues: Array.isArray(input.issues)
            ? input.issues.filter((issue): issue is string => typeof issue === 'string')
            : [],
        });
        return okToolResult(context.call, 'Build report generated.', [result.evidence], {
          reportId: result.report.id,
        });
      },
    },
  ];
}
