import type { AgenticAsset, ChangeEvidence, JsonObject, ToolCall, ToolDefinition, ToolResult } from '../schemas';
import type { EditorSceneStoreAdapter } from './adapters/sceneStoreAdapter';
import { okToolResult } from './toolResult';

function assetType(value: unknown): AgenticAsset['type'] {
  const allowed: AgenticAsset['type'][] = ['mesh', 'texture', 'material', 'script', 'animation', 'audio', 'scene', 'unknown'];
  return typeof value === 'string' && allowed.includes(value as AgenticAsset['type'])
    ? (value as AgenticAsset['type'])
    : 'unknown';
}

function metadataFromInput(value: unknown): JsonObject {
  return value && typeof value === 'object' ? (value as JsonObject) : {};
}

function issuesFromInput(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((issue): issue is string => typeof issue === 'string') : [];
}

function failedToolResultWithEvidence(
  call: ToolCall,
  message: string,
  evidence: ChangeEvidence[],
  output: JsonObject
): ToolResult {
  const timestamp = new Date().toISOString();
  return {
    callId: call.id,
    toolName: call.toolName,
    success: false,
    message,
    evidence,
    output,
    error: {
      code: 'BUILD_EXPORT_FAILED',
      message,
      recoverable: true,
    },
    startedAt: timestamp,
    completedAt: timestamp,
  };
}

export function createEditorBackedAssetBuildTools(adapter: EditorSceneStoreAdapter): ToolDefinition[] {
  return [
    {
      name: 'asset.import',
      description: 'Import an asset into the editor asset list and mirror it into WorldState.',
      capabilities: ['asset.import'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        const result = adapter.registerAsset(context.world, {
          name: typeof input.name === 'string' ? input.name : 'Imported Asset',
          type: assetType(input.type),
          path: typeof input.path === 'string' ? input.path : '',
          valid: true,
          metadata: metadataFromInput(input.metadata),
        });
        return okToolResult(context.call, 'Editor asset imported.', result.evidence, {
          assetId: result.assetId,
        });
      },
    },
    {
      name: 'asset.register',
      description: 'Register an asset in the editor asset list and WorldState.',
      capabilities: ['asset.register'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        const result = adapter.registerAsset(context.world, {
          id: typeof input.id === 'string' ? input.id : undefined,
          name: typeof input.name === 'string' ? input.name : 'Registered Asset',
          type: assetType(input.type),
          path: typeof input.path === 'string' ? input.path : '',
          valid: input.valid !== false,
          metadata: metadataFromInput(input.metadata),
        });
        return okToolResult(context.call, 'Editor asset registered.', result.evidence, {
          assetId: result.assetId,
        });
      },
    },
    {
      name: 'asset.validate',
      description: 'Validate editor asset references and record a WorldState build report.',
      capabilities: ['asset.validate'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        const evidence = adapter.validateAssets(
          context.world,
          typeof input.scope === 'string' ? input.scope : 'all'
        );
        return okToolResult(context.call, 'Editor asset validation completed.', evidence);
      },
    },
    {
      name: 'asset.reindex',
      description: 'Reindex editor assets and record a WorldState report.',
      capabilities: ['asset.reindex'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        const evidence = adapter.reindexAssets(
          context.world,
          typeof input.reason === 'string' ? input.reason : 'manual'
        );
        return okToolResult(context.call, 'Editor assets reindexed.', evidence);
      },
    },
    {
      name: 'build.validateScene',
      description: 'Run the real ReyPlay editor compile validation.',
      capabilities: ['build.validate'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        const result = adapter.validateBuild(
          context.world,
          typeof input.target === 'string' ? input.target : 'web'
        );
        return okToolResult(context.call, 'Editor scene export validation completed.', result.evidence, {
          reportId: result.reportId,
          issueCount: result.issueCount,
          sceneId: result.sceneId,
        });
      },
    },
    {
      name: 'build.export',
      description: 'Run the ReyPlay physical packaging pipeline and record emitted artifacts.',
      capabilities: ['build.export'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      async execute(input, context) {
        const target = typeof input.target === 'string' ? input.target : 'web';
        const result = await adapter.exportBuild(context.world, target);
        const output = {
          reportId: result.reportId,
          artifactPath: result.artifactPath,
          artifacts: result.artifacts.map((artifact) => ({ ...artifact })),
          missingDeps: result.missingDeps,
          logs: result.logs,
          runtimeScaffold: {
            createdCamera: result.runtimeScaffold.createdCamera,
            createdPlayer: result.runtimeScaffold.createdPlayer,
            entityIds: result.runtimeScaffold.entityIds,
            summaries: result.runtimeScaffold.summaries,
          },
          source: result.source ?? 'not_configured',
          target,
        };
        if (!result.ok) {
          return failedToolResultWithEvidence(
            context.call,
            'Editor build export failed before producing a physical artifact.',
            result.evidence,
            output
          );
        }
        return okToolResult(context.call, 'Editor build export completed.', result.evidence, output);
      },
    },
    {
      name: 'build.generateReport',
      description: 'Generate a build report from the latest editor compile result.',
      capabilities: ['build.report'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        const result = adapter.generateBuildReport(
          context.world,
          typeof input.summary === 'string' ? input.summary : undefined,
          issuesFromInput(input.issues)
        );
        return okToolResult(context.call, 'Editor build report generated.', result.evidence, {
          reportId: result.reportId,
        });
      },
    },
  ];
}
