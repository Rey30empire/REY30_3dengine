import {
  createAgenticExecutionReport,
  createAgenticExecutionReportFilename,
  groupAgenticSemanticChanges,
} from '@/engine/editor/ai/agenticExecutionReport';
import {
  compareAgenticExecutions,
  createAgenticExecutionComparisonReport,
  createAgenticExecutionComparisonReportFilename,
} from '@/engine/editor/ai/agenticExecutionComparison';
import {
  createAgenticExecutionTimeline,
  createAgenticExecutionTimelineReport,
  createAgenticExecutionTimelineReportFilename,
} from '@/engine/editor/ai/agenticExecutionTimeline';
import {
  createAgenticRecommendationMutationIndexAuditReport,
  createAgenticRecommendationMutationIndexAuditReportFilename,
  createAgenticRecommendationMutationIndexAuditReportObject,
  createAgenticRecommendationMutationIndexChecksum,
  createAgenticRecommendationMutationIndexReport,
  createAgenticRecommendationMutationIndexReportFilename,
  createAgenticRecommendationMutationIndexReportObject,
} from '@/engine/editor/ai/agenticRecommendationMutationIndexReport';
import type { AgenticExecutionHistoryRecord } from '@/engine/editor/ai/requestClient';
import { describe, expect, it } from 'vitest';

function createRecord(): AgenticExecutionHistoryRecord {
  return {
    id: 'pipeline-report-test',
    userId: 'report-user',
    projectKey: 'report_project',
    slot: 'editor_project_current',
    prompt: 'exporta esta escena para web',
    approved: true,
    status: 'approved',
    iteration: 1,
    createdAt: '2026-04-16T00:00:00.000Z',
    completedAt: '2026-04-16T00:00:01.000Z',
    artifactPath: 'output/builds/report.zip',
    runtimeScaffold: {
      createdCamera: true,
      createdPlayer: true,
      entityIds: ['camera-report'],
      summaries: ['Created runtime export camera.'],
      sourceTool: 'build.export',
    },
    validation: {
      approved: true,
      confidence: 1,
      matchedRequirements: ['build.export', 'build.artifact.physical'],
      missingRequirements: [],
      incorrectOutputs: [],
      retryInstructions: [],
    },
    toolNames: ['build.export'],
    agentRoles: ['technical_integration'],
    steps: [
      {
        id: 'step-report',
        title: 'Server export scene',
        agentRole: 'technical_integration',
        status: 'completed',
        evidenceCount: 2,
        errorCount: 0,
      },
    ],
    toolStats: [
      {
        name: 'build.export',
        successCount: 1,
        failureCount: 0,
      },
    ],
    traces: [
      {
        eventType: 'intent.parsed',
        severity: 'info',
        actor: 'master_orchestrator',
        message: 'Parsed export intent for report test.',
        timestamp: '2026-04-16T00:00:00.100Z',
      },
      {
        eventType: 'tool.completed',
        severity: 'info',
        actor: 'technical_integration',
        message: 'Executed build.export and produced report.zip.',
        stepId: 'step-report',
        toolCallId: 'tool-report-export',
        timestamp: '2026-04-16T00:00:00.700Z',
      },
    ],
    sharedMemory: {
      analyses: [
        {
          id: 'analysis-report',
          toolName: 'scene.analyze',
          callId: 'tool-scene-analyze-report',
          stepId: 'step-report',
          agentRole: 'maintenance',
          scope: 'active_scene',
          summary: 'Scene analysis completed without mutating world state.',
          output: { scope: 'active_scene', issues: [] },
          actionableRecommendations: [
            {
              id: 'recommendation-report',
              approvalKey: 'scene.analyze:NO_BLOCKING_ISSUE:asset.reindex',
              sourceToolName: 'scene.analyze',
              sourceCallId: 'tool-scene-analyze-report',
              summary: 'Scene structure is inspectable.',
              rationale: 'NO_BLOCKING_ISSUE',
              priority: 'optional',
              suggestedDomain: 'maintenance',
              suggestedCapabilities: ['asset.reindex'],
              suggestedToolNames: ['asset.reindex'],
              input: { reason: 'analysis-confirmed-maintenance' },
              confidence: 0.55,
              approvalStatus: 'pending',
            },
          ],
          createdAt: '2026-04-16T00:00:00.200Z',
        },
      ],
      actionableRecommendations: [
        {
          id: 'recommendation-report',
          approvalKey: 'scene.analyze:NO_BLOCKING_ISSUE:asset.reindex',
          sourceToolName: 'scene.analyze',
          sourceCallId: 'tool-scene-analyze-report',
          summary: 'Scene structure is inspectable.',
          rationale: 'NO_BLOCKING_ISSUE',
          priority: 'optional',
          suggestedDomain: 'maintenance',
          suggestedCapabilities: ['asset.reindex'],
          suggestedToolNames: ['asset.reindex'],
          input: { reason: 'analysis-confirmed-maintenance' },
          confidence: 0.55,
          approvalStatus: 'pending',
        },
      ],
    },
    toolCalls: [
      {
        callId: 'tool-report-export',
        toolName: 'build.export',
        agentRole: 'technical_integration',
        stepId: 'step-report',
        success: true,
        message: 'Executed build.export and produced report.zip.',
        startedAt: '2026-04-16T00:00:00.500Z',
        completedAt: '2026-04-16T00:00:00.700Z',
        input: { target: 'web' },
        output: { artifactPath: 'output/builds/report.zip' },
        error: null,
        mutatesWorld: true,
        evidenceContract: 'before_after',
        evidence: [
          {
            id: 'evidence-report-transform',
            type: 'component',
            targetId: 'camera-report',
            summary: 'Transform added to Agentic Export Camera.',
            before: null,
            after: { position: { x: 0, y: 2, z: 6 } },
            timestamp: '2026-04-16T00:00:00.650Z',
          },
        ],
      },
    ],
    stepCount: 1,
    action: 'run',
    sourceExecutionId: null,
    snapshots: {
      before: true,
      after: true,
    },
    diff: {
      hasChanges: true,
      counts: {
        scenes: { before: 1, after: 1, delta: 0 },
        entities: { before: 0, after: 1, delta: 1 },
        assets: { before: 0, after: 0, delta: 0 },
        scribProfiles: { before: 0, after: 0, delta: 0 },
        scribInstances: { before: 0, after: 0, delta: 0 },
      },
      scenes: { added: [], removed: [], changed: [] },
      entities: {
        added: [{ id: 'camera-report', name: 'Agentic Export Camera' }],
        removed: [],
        changed: [],
      },
      assets: { added: [], removed: [], changed: [] },
      semantic: {
        componentChanges: [
          {
            entityId: 'camera-report',
            entityName: 'Agentic Export Camera',
            component: 'Transform',
            changeType: 'added',
            fields: ['position'],
            fieldChanges: [
              { field: 'position', before: '(missing)', after: '{"x":0,"y":2,"z":6}' },
            ],
            summary: 'Transform agregado en Agentic Export Camera: position',
          },
        ],
      },
      rollbackPreview: {
        willRemove: {
          scenes: [],
          entities: [{ id: 'camera-report', name: 'Agentic Export Camera' }],
          assets: [],
        },
        willRestore: {
          scenes: [],
          entities: [],
          assets: [],
        },
        willRevert: {
          scenes: [],
          entities: [],
          assets: [],
          components: [
            {
              entityId: 'camera-report',
              entityName: 'Agentic Export Camera',
              component: 'Transform',
              changeType: 'added',
              fields: ['position'],
              fieldChanges: [
                { field: 'position', before: '(missing)', after: '{"x":0,"y":2,"z":6}' },
              ],
              summary: 'Transform agregado en Agentic Export Camera: position',
            },
          ],
        },
      },
    },
  };
}

describe('agentic execution report', () => {
  it('exports a complete JSON report for a history record', () => {
    const report = JSON.parse(
      createAgenticExecutionReport(createRecord(), 'json', '2026-04-16T00:00:02.000Z')
    );

    expect(report.execution.prompt).toBe('exporta esta escena para web');
    expect(report.plan.steps[0]).toMatchObject({
      title: 'Server export scene',
      agentRole: 'technical_integration',
    });
    expect(report.tools.stats[0]).toMatchObject({
      name: 'build.export',
      successCount: 1,
    });
    expect(report.tools.calls[0]).toMatchObject({
      callId: 'tool-report-export',
      toolName: 'build.export',
    });
    expect(report.tools.calls[0].evidence[0].summary).toContain('Transform added');
    expect(report.diff.semantic.componentChanges[0].fieldChanges[0]).toMatchObject({
      field: 'position',
      before: '(missing)',
    });
    expect(report.traces[0]).toMatchObject({
      eventType: 'intent.parsed',
      actor: 'master_orchestrator',
    });
    expect(report.rollbackPreview.willRemove.entities[0].name).toBe('Agentic Export Camera');
  });

  it('exports a Markdown report grouped by entity and component', () => {
    const record = createRecord();
    const markdown = createAgenticExecutionReport(record, 'markdown', '2026-04-16T00:00:02.000Z');
    const groups = groupAgenticSemanticChanges(record.diff?.semantic.componentChanges ?? []);

    expect(createAgenticExecutionReportFilename(record, 'markdown')).toBe(
      'pipeline-report-test-agentic-report.md'
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].entityName).toBe('Agentic Export Camera');
    expect(markdown).toContain('## Plan');
    expect(markdown).toContain('## Tool Calls Raw Diff');
    expect(markdown).toContain('## Traces');
    expect(markdown).toContain('- [completed] Server export scene (technical_integration)');
    expect(markdown).toContain('Transform added to Agentic Export Camera');
    expect(markdown).toContain('Transform.position: (missing) -> {"x":0,"y":2,"z":6}');
    expect(markdown).toContain('Will remove entities: Agentic Export Camera');
  });

  it('builds a timeline that keeps intent, plan, tools, diff, validation and full trace events visible', () => {
    const record = createRecord();
    const approvalKey = 'scene.analyze:NO_BLOCKING_ISSUE:asset.reindex';
    if (record.sharedMemory) {
      record.sharedMemory.actionableRecommendations = record.sharedMemory.actionableRecommendations.map((recommendation) => ({
        ...recommendation,
        approvalStatus: recommendation.approvalKey === approvalKey ? 'approved' : recommendation.approvalStatus,
      }));
      record.sharedMemory.analyses = record.sharedMemory.analyses.map((analysis) => ({
        ...analysis,
        actionableRecommendations: analysis.actionableRecommendations.map((recommendation) => ({
          ...recommendation,
          approvalStatus: recommendation.approvalKey === approvalKey ? 'approved' : recommendation.approvalStatus,
        })),
      }));
    }
    record.traces = [
      ...record.traces,
      {
        eventType: 'recommendation.unlocked_mutation',
        severity: 'info',
        actor: 'maintenance',
        message: 'Approved recommendation unlocked mutation for Apply recommendation: Scene structure is inspectable.',
        stepId: 'step-report',
        data: {
          stepTitle: 'Apply recommendation: Scene structure is inspectable.',
          approvedRecommendationIds: ['recommendation-report'],
          approvedRecommendationKeys: [approvalKey],
          approvedRecommendationSummaries: ['Scene structure is inspectable.'],
          suggestedToolNames: ['asset.reindex'],
        },
        timestamp: '2026-04-16T00:00:00.800Z',
      },
    ];
    const timeline = createAgenticExecutionTimeline(record);

    expect(timeline.map((item) => item.phase)).toEqual(
      expect.arrayContaining(['intent', 'plan', 'agent', 'tool', 'memory', 'approval', 'diff', 'validation', 'trace'])
    );
    expect(timeline.find((item) => item.phase === 'intent')?.detail).toBe(
      'exporta esta escena para web'
    );
    expect(timeline.filter((item) => item.phase === 'trace')).toHaveLength(3);
    expect(timeline.find((item) => item.phase === 'trace')?.detail).toContain(
      'Parsed export intent'
    );
    expect(timeline.find((item) => item.phase === 'approval')).toMatchObject({
      title: 'Approved recommendation unlocked mutation',
      detail: expect.stringContaining(approvalKey),
      rawData: expect.objectContaining({
        approvedRecommendationKeys: [approvalKey],
        suggestedToolNames: ['asset.reindex'],
      }),
    });
    expect(timeline.find((item) => item.toolCallId === 'tool-report-export')?.rawDiff?.[0]).toMatchObject({
      summary: 'Transform added to Agentic Export Camera.',
    });

    const timelineJson = JSON.parse(
      createAgenticExecutionTimelineReport(record, 'json', '2026-04-16T00:00:02.000Z')
    );
    const timelineMarkdown = createAgenticExecutionTimelineReport(
      record,
      'markdown',
      '2026-04-16T00:00:02.000Z'
    );

    expect(createAgenticExecutionTimelineReportFilename(createRecord(), 'markdown')).toBe(
      'pipeline-report-test-agentic-timeline.md'
    );
    expect(
      timelineJson.timeline.find((item: { toolCallId?: string }) => item.toolCallId === 'tool-report-export')
    ).toMatchObject({
      mutatesWorld: true,
      evidenceContract: 'before_after',
      rawInput: { target: 'web' },
      rawOutput: { artifactPath: 'output/builds/report.zip' },
    });
    expect(timelineJson.sharedMemory.actionableRecommendations[0]).toMatchObject({
      approvalStatus: 'approved',
      approvalKey: 'scene.analyze:NO_BLOCKING_ISSUE:asset.reindex',
    });
    expect(timelineJson.timeline.find((item: { phase?: string }) => item.phase === 'approval')).toMatchObject({
      rawData: expect.objectContaining({
        approvedRecommendationKeys: [approvalKey],
      }),
    });
    expect(timelineMarkdown).toContain('## Timeline');
    expect(timelineMarkdown).toContain('## Shared Memory');
    expect(timelineMarkdown).toContain('toolCallId: tool-report-export');
    expect(timelineMarkdown).toContain('input: {"target":"web"}');
    expect(timelineMarkdown).toContain('recommendation.unlocked_mutation');
    expect(timelineMarkdown).toContain(approvalKey);
  });

  it('exports the recommendation mutation index as JSON and Markdown', () => {
    const index = {
      version: 1 as const,
      projectKey: 'report_project',
      slot: 'editor_project_current',
      updatedAt: '2026-04-16T00:00:03.000Z',
      integrityAuditTrail: [
        {
          id: 'mutation-index-repair-report-test',
          action: 'checksum_recalculated' as const,
          actor: 'user' as const,
          requestedBy: 'report-user',
          repairedAt: '2026-04-16T00:00:03.500Z',
          reason: 'unit_report_repair',
          previousIntegrityStatus: 'missing' as const,
          previousChecksum: null,
          previousComputedChecksum: {
            algorithm: 'sha256' as const,
            value: '3'.repeat(64),
          },
        },
      ],
      recommendations: {
        'scene.analyze:NO_BLOCKING_ISSUE:asset.reindex': {
          recommendationId: 'recommendation-report',
          recommendationKey: 'scene.analyze:NO_BLOCKING_ISSUE:asset.reindex',
          summary: 'Scene structure is inspectable.',
          executions: [
            {
              executionId: 'pipeline-report-test-approved',
              sourceExecutionId: 'pipeline-report-test',
              toolCalls: [
                {
                  toolCallId: 'tool-report-reindex',
                  toolName: 'asset.reindex',
                  evidenceIds: ['evidence-report-reindex'],
                  targetIds: ['asset-index-report'],
                },
              ],
              partialRollbackAppliedAt: null,
            },
          ],
        },
      },
    };
    const reportObject = createAgenticRecommendationMutationIndexReportObject(
      index,
      '2026-04-16T00:00:04.000Z'
    );
    const reportJson = JSON.parse(
      createAgenticRecommendationMutationIndexReport(index, 'json', '2026-04-16T00:00:04.000Z')
    );
    const reportMarkdown = createAgenticRecommendationMutationIndexReport(
      index,
      'markdown',
      '2026-04-16T00:00:04.000Z'
    );
    const auditReportObject = createAgenticRecommendationMutationIndexAuditReportObject(
      index,
      '2026-04-16T00:00:04.000Z'
    );
    const auditReportJson = JSON.parse(
      createAgenticRecommendationMutationIndexAuditReport(
        index,
        'json',
        '2026-04-16T00:00:04.000Z'
      )
    );
    const auditReportMarkdown = createAgenticRecommendationMutationIndexAuditReport(
      index,
      'markdown',
      '2026-04-16T00:00:04.000Z'
    );
    const checksum = createAgenticRecommendationMutationIndexChecksum(index);
    const checksumFromEquivalentOrder = createAgenticRecommendationMutationIndexChecksum({
      ...index,
      recommendations: {
        'scene.analyze:NO_BLOCKING_ISSUE:asset.reindex': {
          ...index.recommendations['scene.analyze:NO_BLOCKING_ISSUE:asset.reindex'],
        },
      },
    });

    expect(createAgenticRecommendationMutationIndexReportFilename(index, 'markdown')).toBe(
      'report_project-editor_project_current-recommendation-mutation-index.md'
    );
    expect(createAgenticRecommendationMutationIndexAuditReportFilename(index, 'json')).toBe(
      'report_project-editor_project_current-recommendation-mutation-index-audit.json'
    );
    expect(checksum).toMatchObject({
      algorithm: 'sha256',
      value: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(checksumFromEquivalentOrder).toEqual(checksum);
    expect(reportObject.index).toMatchObject({
      projectKey: 'report_project',
      recommendationCount: 1,
      checksum,
      integrityAuditCount: 1,
      integrityAuditTrail: [
        expect.objectContaining({
          id: 'mutation-index-repair-report-test',
          previousIntegrityStatus: 'missing',
          reason: 'unit_report_repair',
        }),
      ],
    });
    expect(reportJson.recommendations[0]).toMatchObject({
      key: 'scene.analyze:NO_BLOCKING_ISSUE:asset.reindex',
      executions: [
        expect.objectContaining({
          executionId: 'pipeline-report-test-approved',
          toolCalls: [
            expect.objectContaining({
              toolCallId: 'tool-report-reindex',
              evidenceIds: ['evidence-report-reindex'],
            }),
          ],
        }),
      ],
    });
    expect(reportMarkdown).toContain('# Agentic Recommendation Mutation Index');
    expect(reportMarkdown).toContain(`Checksum: ${checksum.algorithm}:${checksum.value}`);
    expect(reportMarkdown).toContain('## Integrity Audit Trail');
    expect(reportMarkdown).toContain('mutation-index-repair-report-test');
    expect(reportMarkdown).toContain('previousIntegrityStatus: missing');
    expect(reportMarkdown).toContain(
      'chain: scene.analyze:NO_BLOCKING_ISSUE:asset.reindex -> tool-report-reindex -> evidence-report-reindex'
    );
    expect(auditReportObject).toMatchObject({
      kind: 'agentic_recommendation_mutation_index_audit',
      recommendationCount: 1,
      index: {
        projectKey: 'report_project',
        recommendationCount: 1,
      },
      integrityAuditCount: 1,
    });
    expect(auditReportJson).not.toHaveProperty('recommendations');
    expect(auditReportJson.integrityAuditTrail[0]).toMatchObject({
      id: 'mutation-index-repair-report-test',
      previousIntegrityStatus: 'missing',
    });
    expect(auditReportMarkdown).toContain('# Agentic Recommendation Mutation Index Audit');
    expect(auditReportMarkdown).toContain('Recommendation Count: 1');
    expect(auditReportMarkdown).toContain('mutation-index-repair-report-test');
    expect(auditReportMarkdown).not.toContain('## Recommendations');
  });

  it('compares two executions by tools, agents, trace volume and resulting world counts', () => {
    const first = createRecord();
    const second: AgenticExecutionHistoryRecord = {
      ...createRecord(),
      id: 'pipeline-report-test-lighting',
      prompt: 'corrige ambiente oscuro',
      approved: false,
      status: 'rejected',
      artifactPath: null,
      validation: {
        approved: false,
        confidence: 0.55,
        matchedRequirements: ['lighting.adjusted'],
        missingRequirements: ['environment.dark'],
        incorrectOutputs: ['scene.too_bright'],
        retryInstructions: ['Reduce light intensity.'],
      },
      toolNames: ['light.adjust'],
      agentRoles: ['lighting_environment'],
      toolStats: [{ name: 'light.adjust', successCount: 1, failureCount: 0 }],
      toolCalls: [
        ...first.toolCalls,
        {
          callId: 'tool-light-adjust',
          toolName: 'light.adjust',
          agentRole: 'lighting_environment',
          stepId: 'step-lighting',
          success: true,
          message: 'Lowered key light intensity.',
          startedAt: '2026-04-16T00:00:01.000Z',
          completedAt: '2026-04-16T00:00:01.050Z',
          input: { entityId: 'key-light', intensity: 0.9 },
          output: { entityId: 'key-light', intensity: 0.9 },
          error: null,
          mutatesWorld: true,
          evidenceContract: 'before_after',
          evidence: [
            {
              id: 'evidence-light-intensity',
              type: 'lighting',
              targetId: 'key-light',
              summary: 'Key Light intensity changed.',
              before: { intensity: 1.5 },
              after: { intensity: 0.9 },
              timestamp: '2026-04-16T00:00:01.025Z',
            },
          ],
        },
      ],
      traces: [
        ...first.traces,
        {
          eventType: 'validation.rejected',
          severity: 'warning',
          actor: 'final_delivery_validator',
          message: 'Rejected because scene remained too bright.',
          timestamp: '2026-04-16T00:00:01.100Z',
        },
      ],
      diff: first.diff
        ? {
            ...first.diff,
            counts: {
              ...first.diff.counts,
              entities: { before: 0, after: 2, delta: 2 },
            },
            semantic: {
              componentChanges: [
                ...first.diff.semantic.componentChanges,
                {
                  entityId: 'key-light',
                  entityName: 'Key Light',
                  component: 'Light',
                  changeType: 'changed',
                  fields: ['intensity'],
                  fieldChanges: [{ field: 'intensity', before: '1.5', after: '0.9' }],
                  summary: 'Light cambiado en Key Light: intensity',
                },
              ],
            },
          }
        : null,
    };

    const comparison = compareAgenticExecutions(first, second);

    expect(comparison.approvalChanged).toBe(true);
    expect(comparison.traceDelta).toBe(1);
    expect(comparison.toolCallDelta).toBe(1);
    expect(comparison.evidenceDelta).toBe(1);
    expect(comparison.counts.entities).toBe(1);
    expect(comparison.tools.onlyRight).toEqual(['light.adjust']);
    expect(comparison.agents.onlyRight).toEqual(['lighting_environment']);
    expect(comparison.semantic.onlyRight).toEqual(['Light cambiado en Key Light: intensity']);
    expect(comparison.validation.missing.onlyRight).toEqual(['environment.dark']);

    const jsonReport = JSON.parse(
      createAgenticExecutionComparisonReport(
        first,
        second,
        'json',
        '2026-04-16T00:00:02.000Z'
      )
    );
    const markdownReport = createAgenticExecutionComparisonReport(
      first,
      second,
      'markdown',
      '2026-04-16T00:00:02.000Z'
    );

    expect(createAgenticExecutionComparisonReportFilename(first, second, 'markdown')).toBe(
      'pipeline-report-test-vs-pipeline-report-test-lighting-agentic-comparison.md'
    );
    expect(jsonReport.comparison.tools.onlyRight).toEqual(['light.adjust']);
    expect(jsonReport.right.toolCalls[1].evidence[0].summary).toBe('Key Light intensity changed.');
    expect(markdownReport).toContain('## Raw Tool Evidence');
    expect(markdownReport).toContain('light.adjust');
  });
});
