import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FinalDeliveryValidatorAgent,
  IntentAnalyzer,
  WorldStateManager,
  type PipelineExecutionState,
  type ToolResult,
} from '@/engine/agentic';
import { createNodeArtifactVerifier } from '@/engine/agentic/validation/nodeArtifactVerifier';
import type { UserIntent } from '@/engine/agentic/schemas';

function now() {
  return '2026-04-16T00:00:00.000Z';
}

function toolResult(toolName: string, output: ToolResult['output'] = {}): ToolResult {
  return {
    callId: `${toolName}-call`,
    toolName,
    success: true,
    message: `${toolName} completed.`,
    evidence: [],
    output,
    startedAt: now(),
    completedAt: now(),
  };
}

function pipelineState(intent: UserIntent, toolResults: ToolResult[]): PipelineExecutionState {
  return {
    pipelineId: 'pipeline-validator-build',
    status: 'validating',
    iteration: 1,
    originalRequest: intent.originalInput,
    intent,
    stepResults: [
      {
        stepId: 'step-build',
        agentRole: 'technical_integration',
        status: 'completed',
        toolCalls: [],
        toolResults,
        evidenceIds: [],
        errors: [],
        startedAt: now(),
        completedAt: now(),
      },
    ],
    toolResults,
    validationReports: [],
    sharedMemory: {
      analyses: [],
      actionableRecommendations: [],
    },
    traces: [],
    createdAt: now(),
    updatedAt: now(),
  };
}

describe('agentic final delivery validator', () => {
  it('rejects build.export when no physical artifact metadata was produced', () => {
    const validator = new FinalDeliveryValidatorAgent();
    const intent = new IntentAnalyzer().parseUserIntent('exporta esta escena para web');
    const state = pipelineState(intent, [
      toolResult('build.validateScene', { issueCount: 0, sceneId: 'scene-1' }),
      toolResult('build.export', {
        artifactPath: '',
        artifacts: [],
        missingDeps: [],
        logs: ['Export said done, but emitted no artifact.'],
        target: 'web',
      }),
    ]);

    const requirements = validator.analyzeOriginalRequest(intent);
    const report = validator.generateValidationReport(
      requirements,
      state,
      new WorldStateManager().getSnapshot()
    );

    expect(report.approved).toBe(false);
    expect(report.matchedRequirements).toContain('build.export');
    expect(report.incorrectOutputs).toContain('build.export.no_physical_artifacts');
    expect(report.retryInstructions).toContain(
      'Run build.export again and require a bundle, installer, or manifest artifact with size metadata.'
    );
  });

  it('approves build.export only when artifact output, exported WorldState report, and disk file agree', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'agentic-validator-artifact-'));
    const artifactFile = path.join(tempRoot, 'validator-project-web.zip');
    await writeFile(artifactFile, 'physical artifact bytes', 'utf-8');
    const artifactPath = path.relative(process.cwd(), artifactFile).replace(/\\/g, '/');
    try {
      const validator = new FinalDeliveryValidatorAgent(createNodeArtifactVerifier());
      const intent = new IntentAnalyzer().parseUserIntent('exporta esta escena para web');
      const world = new WorldStateManager();
      world.addBuildReport({
        status: 'exported',
        summary: `Exported editor scene for web: ${artifactPath}.`,
        issues: [],
        artifactPath,
      });
      const state = pipelineState(intent, [
        toolResult('build.validateScene', { issueCount: 0, sceneId: 'scene-1' }),
        toolResult('build.export', {
          artifactPath,
          artifacts: [
            {
              id: 'artifact-bundle',
              target: 'web',
              path: artifactPath,
              size: 2048,
              createdAt: now(),
              kind: 'bundle',
            },
            {
              id: 'artifact-manifest',
              target: 'web',
              path: 'output/builds/validator-project/stage/manifest.json',
              size: 512,
              createdAt: now(),
              kind: 'manifest',
            },
          ],
          missingDeps: [],
          logs: ['Physical web bundle packaged.'],
          source: 'local_node_build_pipeline',
          target: 'web',
        }),
      ]);

      const requirements = validator.analyzeOriginalRequest(intent);
      const report = validator.generateValidationReport(requirements, state, world.getSnapshot());

      expect(report.approved).toBe(true);
      expect(report.matchedRequirements).toContain('build.artifact.physical');
      expect(report.matchedRequirements).toContain('world.build_report.exported_artifact');
      expect(report.evidenceReviewed).toContain(`artifact:${artifactPath}`);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('rejects build.export when Node verification cannot find the reported artifact', () => {
    const intent = new IntentAnalyzer().parseUserIntent('exporta esta escena para web');
    const artifactPath = 'output/builds/missing-validator-project/missing-web.zip';
    const world = new WorldStateManager();
    world.addBuildReport({
      status: 'exported',
      summary: `Exported editor scene for web: ${artifactPath}.`,
      issues: [],
      artifactPath,
    });
    const state = pipelineState(intent, [
      toolResult('build.validateScene', { issueCount: 0, sceneId: 'scene-1' }),
      toolResult('build.export', {
        artifactPath,
        artifacts: [
          {
            id: 'artifact-bundle',
            target: 'web',
            path: artifactPath,
            size: 2048,
            createdAt: now(),
            kind: 'bundle',
          },
          {
            id: 'artifact-manifest',
            target: 'web',
            path: 'output/builds/validator-project/stage/manifest.json',
            size: 512,
            createdAt: now(),
            kind: 'manifest',
          },
        ],
        missingDeps: [],
        logs: ['Physical web bundle packaged.'],
        source: 'local_node_build_pipeline',
        target: 'web',
      }),
    ]);

    const validatingAgent = new FinalDeliveryValidatorAgent(createNodeArtifactVerifier());
    const requirements = validatingAgent.analyzeOriginalRequest(intent);
    const report = validatingAgent.generateValidationReport(
      requirements,
      state,
      world.getSnapshot()
    );

    expect(report.approved).toBe(false);
    expect(report.incorrectOutputs).toContain('build.export.artifact_missing_on_disk');
    expect(report.retryInstructions).toContain(
      'Run build.export again because the reported artifact is missing or empty on disk.'
    );
  });

  it('rejects any delivery with a mutating tool evidence contract failure', () => {
    const validator = new FinalDeliveryValidatorAgent();
    const intent = new IntentAnalyzer().parseUserIntent('crea una escena base');
    const state = pipelineState(intent, [
      {
        callId: 'scene.create-call',
        toolName: 'scene.create',
        success: false,
        message: 'Mutating tool omitted before/after evidence.',
        evidence: [
          {
            id: 'evidence-scene-create-incomplete',
            type: 'scene',
            targetId: 'scene-1',
            summary: 'Scene was created but evidence lacked before/after.',
            timestamp: now(),
          },
        ],
        output: { sceneId: 'scene-1' },
        error: {
          code: 'MUTATING_TOOL_EVIDENCE_CONTRACT_FAILED',
          message: 'Mutating tool scene.create must emit before/after evidence.',
          recoverable: true,
        },
        startedAt: now(),
        completedAt: now(),
      },
    ]);

    const requirements = validator.analyzeOriginalRequest(intent);
    const report = validator.generateValidationReport(
      requirements,
      state,
      new WorldStateManager().getSnapshot()
    );

    expect(report.approved).toBe(false);
    expect(report.incorrectOutputs).toContain('tool.evidence_contract_failed:scene.create');
    expect(report.retryInstructions).toContain('Fix scene.create to emit before/after evidence before retrying.');
  });
});
