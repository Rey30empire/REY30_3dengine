import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import { chromium } from '../../scripts/playwright-runtime.mjs';
import {
  fulfillJson,
  readDownloadText,
  startNextDevServer,
  type StartedServer,
} from './helpers/nextDevServer';

describe.sequential('Agentic server integrity controls browser e2e', () => {
  let server: StartedServer | null = null;
  let browser: Browser | null = null;
  let serverAgenticScenario: {
    page: Page;
    setMutationIndexIntegrityMode: (mode: 'valid' | 'missing' | 'mismatch') => void;
    setMutationIndexBehind: (behind: boolean) => void;
    getMutationIndexRepairCalls: () => number;
    getMutationIndexReindexCalls: () => number;
    getPendingIndexHistoryCalls: () => number;
    getPartialRollbackCalls: () => number;
  } | null = null;

  beforeAll(async () => {
    server = await startNextDevServer(process.cwd());
    browser = await chromium.launch({ headless: true });
  }, 320_000);

  afterAll(async () => {
    await browser?.close();
    await server?.stop();
  }, 30_000);

  it('can opt into the server agentic endpoint from the chat', async () => {
    if (!server || !browser) {
      throw new Error('Browser e2e server did not start.');
    }

    const page = await browser.newPage();
    let remoteSaveCalls = 0;
    let serverAgenticCalls = 0;
    let serverHistoryCalls = 0;
    let remoteBuildCalls = 0;
    let recommendationDecision: 'pending' | 'approved' | 'rejected' = 'pending';
    let executeApprovedCalls = 0;
    let partialRollbackCalls = 0;
    let mutationIndexCalls = 0;
    let mutationIndexRepairCalls = 0;
    let mutationIndexReindexCalls = 0;
    let pendingIndexHistoryCalls = 0;
    let mutationIndexIntegrityMode: 'valid' | 'missing' | 'mismatch' = 'valid';
    let mutationIndexBehind = false;
    const mutationIndexRepairEvents: Array<Record<string, unknown>> = [];
    let partialRollbackApplied = false;
    let latestSaveData: unknown = null;
    const metadata = {
      pipelineId: 'pipeline-browser-server-agentic',
      approved: true,
      iteration: 1,
      status: 'approved',
      steps: [
        {
          id: 'step-server-export',
          title: 'Server export scene',
          agentRole: 'technical_integration',
          status: 'completed',
          evidenceCount: 2,
          errorCount: 0,
        },
      ],
      tools: [
        {
          name: 'build.export',
          successCount: 1,
          failureCount: 0,
        },
      ],
      validation: {
        approved: true,
        confidence: 1,
        matchedRequirements: ['build.export', 'build.artifact.physical'],
        missingRequirements: [],
        incorrectOutputs: [],
        retryInstructions: [],
      },
      runtimeScaffold: {
        createdCamera: true,
        createdPlayer: true,
        entityIds: ['camera-server-e2e', 'player-server-e2e'],
        summaries: [
          'Created runtime export camera.',
          'Created runtime export player with controller and physics.',
        ],
        sourceTool: 'build.export',
      },
      traces: [],
    };

    await page.route('**/api/auth/session', (route) =>
      fulfillJson(route, {
        authenticated: false,
        editorAccess: {
          shellMode: 'product',
          permissions: {
            advancedShell: false,
            admin: false,
            compile: false,
            advancedWorkspaces: false,
            debugTools: false,
            editorSessionBridge: false,
            terminalActions: false,
          },
        },
      })
    );

    await page.route('**/api/editor-project**', async (route) => {
      if (route.request().method() === 'POST') {
        remoteSaveCalls += 1;
        const payload = JSON.parse(route.request().postData() || '{}');
        expect(payload.saveData?.custom?.kind).toBe('editor_project');
        latestSaveData = payload.saveData;
      }

      await fulfillJson(route, {
        success: true,
        projectKey: 'untitled_project',
        slot: 'editor_project_current',
        saveData: latestSaveData,
      });
    });

    await page.route('**/api/agentic**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const mutationIndex = {
        version: 1,
        projectKey: 'untitled_project',
        slot: 'editor_project_current',
        updatedAt: partialRollbackApplied
          ? '2026-04-16T00:02:02.000Z'
          : '2026-04-16T00:02:01.000Z',
        ...(mutationIndexIntegrityMode !== 'missing'
          ? {
              checksum: {
                algorithm: 'sha256',
                value: '2'.repeat(64),
                updatedAt: '2026-04-16T00:02:01.000Z',
              },
            }
          : {}),
        integrityAuditTrail: mutationIndexRepairEvents,
        recommendations: {
          'scene.analyze:NO_BLOCKING_ISSUE:asset.reindex': {
            recommendationId: 'recommendation-maintenance-e2e',
            recommendationKey: 'scene.analyze:NO_BLOCKING_ISSUE:asset.reindex',
            summary: 'Scene structure is inspectable; no blocking scene issue was detected.',
            executions: [
              {
                executionId: `${metadata.pipelineId}-approved-recommendations`,
                sourceExecutionId: metadata.pipelineId,
                toolCalls: [
                  {
                    toolCallId: 'tool-approved-reindex',
                    toolName: 'asset.reindex',
                    evidenceIds: ['evidence-approved-reindex'],
                    targetIds: ['asset-index-e2e'],
                  },
                ],
                partialRollbackAppliedAt: partialRollbackApplied
                  ? '2026-04-16T00:02:02.000Z'
                  : null,
              },
            ],
          },
        },
      };
      if (requestUrl.pathname.includes('/api/agentic/recommendations/mutation-index/export')) {
        const format = requestUrl.searchParams.get('format') === 'markdown' ? 'markdown' : 'json';
        const scope = requestUrl.searchParams.get('scope') === 'audit' ? 'audit' : 'index';
        const recommendationKey = requestUrl.searchParams.get('recommendationKey') || '';
        const checksum = recommendationKey
          ? `sha256:${'1'.repeat(64)}`
          : `sha256:${'2'.repeat(64)}`;
        const integrityStatus = mutationIndexIntegrityMode;
        const body =
          format === 'json'
            ? JSON.stringify(
                scope === 'audit'
                  ? {
                      reportVersion: 1,
                      kind: 'agentic_recommendation_mutation_index_audit',
                      generatedAt: '2026-04-16T00:02:03.000Z',
                      recommendationCount: 1,
                      index: {
                        version: mutationIndex.version,
                        projectKey: mutationIndex.projectKey,
                        slot: mutationIndex.slot,
                        updatedAt: mutationIndex.updatedAt,
                        recommendationCount: 1,
                        checksumValid: integrityStatus === 'valid',
                        checksumStatus: integrityStatus,
                        storedChecksum: mutationIndex.checksum ?? null,
                        computedChecksum: {
                          algorithm: 'sha256',
                          value: integrityStatus === 'mismatch' ? '4'.repeat(64) : '2'.repeat(64),
                        },
                      },
                      integrityAuditCount: mutationIndex.integrityAuditTrail.length,
                      integrityAuditTrail: mutationIndex.integrityAuditTrail,
                    }
                  : {
                      reportVersion: 1,
                      generatedAt: '2026-04-16T00:02:03.000Z',
                      index: {
                        version: mutationIndex.version,
                        projectKey: mutationIndex.projectKey,
                        slot: mutationIndex.slot,
                        updatedAt: mutationIndex.updatedAt,
                        recommendationCount: 1,
                        checksum: {
                          algorithm: 'sha256',
                          value: checksum.split(':')[1],
                        },
                        integrityAuditCount: mutationIndex.integrityAuditTrail.length,
                        integrityAuditTrail: mutationIndex.integrityAuditTrail,
                      },
                      recommendations: [
                        {
                          key: 'scene.analyze:NO_BLOCKING_ISSUE:asset.reindex',
                          recommendationId: 'recommendation-maintenance-e2e',
                          recommendationKey: 'scene.analyze:NO_BLOCKING_ISSUE:asset.reindex',
                          summary: 'Scene structure is inspectable; no blocking scene issue was detected.',
                          executionCount: 1,
                          executions: [
                            {
                              executionId: `${metadata.pipelineId}-approved-recommendations`,
                              sourceExecutionId: metadata.pipelineId,
                              partialRollbackAppliedAt: partialRollbackApplied
                                ? '2026-04-16T00:02:02.000Z'
                                : null,
                              toolCallCount: 1,
                              toolCalls: [
                                {
                                  toolCallId: 'tool-approved-reindex',
                                  toolName: 'asset.reindex',
                                  evidenceIds: ['evidence-approved-reindex'],
                                  targetIds: ['asset-index-e2e'],
                                },
                              ],
                            },
                          ],
                        },
                      ],
                    }
              )
            : [
                scope === 'audit'
                  ? '# Agentic Recommendation Mutation Index Audit'
                  : '# Agentic Recommendation Mutation Index',
                '',
                'Project: untitled_project',
                'Slot: editor_project_current',
                'Recommendation Count: 1',
                scope === 'audit'
                  ? `Checksum Valid: ${integrityStatus === 'valid' ? 'yes' : 'no'} (${integrityStatus})`
                  : `Checksum: ${checksum}`,
                '',
                '## Integrity Audit Trail',
                '',
                mutationIndex.integrityAuditTrail.length
                  ? `- ${mutationIndex.integrityAuditTrail[0].id}`
                  : '- No integrity repair events recorded.',
                '',
                '### scene.analyze:NO_BLOCKING_ISSUE:asset.reindex',
                '- chain: scene.analyze:NO_BLOCKING_ISSUE:asset.reindex -> tool-approved-reindex -> evidence-approved-reindex',
              ].join('\n');
        await route.fulfill({
          status: 200,
          contentType: format === 'json' ? 'application/json' : 'text/markdown',
          headers: {
            'Content-Disposition': `attachment; filename="untitled_project-editor_project_current-recommendation-mutation-index${scope === 'audit' ? '-audit' : ''}.${format === 'json' ? 'json' : 'md'}"`,
            'X-Agentic-Index-Checksum': checksum,
          },
          body,
        });
        return;
      }
      if (
        requestUrl.pathname.includes('/api/agentic/mutation-index/reindex') &&
        route.request().method() === 'POST'
      ) {
        mutationIndexReindexCalls += 1;
        const payload = JSON.parse(route.request().postData() || '{}');
        expect(payload.confirmReindex).toBe(true);
        expect(payload.reason).toContain('reindex_partial');
        expect(payload.executionId).toBe(`${metadata.pipelineId}-approved-recommendations`);
        const previousStatus = mutationIndexIntegrityMode;
        const previousChecksum =
          previousStatus === 'missing'
            ? null
            : {
                algorithm: 'sha256',
                value: '2'.repeat(64),
                updatedAt: '2026-04-16T00:02:01.000Z',
              };
        const previousComputedChecksum = {
          algorithm: 'sha256',
          value: previousStatus === 'mismatch' ? '4'.repeat(64) : '2'.repeat(64),
        };
        const auditEntry = {
          id: `mutation-index-reindex-browser-e2e-${mutationIndexReindexCalls}`,
          action: 'history_reindexed_partial',
          actor: 'user',
          requestedBy: 'browser-e2e-user',
          repairedAt: `2026-04-16T00:02:1${mutationIndexReindexCalls}.000Z`,
          reason: payload.reason,
          previousIntegrityStatus: previousStatus,
          previousChecksum,
          previousComputedChecksum,
        };
        mutationIndexRepairEvents.unshift(auditEntry);
        mutationIndexIntegrityMode = 'valid';
        mutationIndexBehind = false;
        await fulfillJson(route, {
          success: true,
          action: 'reindex_from_history',
          projectKey: 'untitled_project',
          slot: 'editor_project_current',
          previousIntegrity: {
            valid: previousStatus === 'valid',
            status: previousStatus,
            stored: previousChecksum,
            computed: previousComputedChecksum,
          },
          integrity: {
            valid: true,
            status: 'valid',
            stored: {
              algorithm: 'sha256',
              value: '2'.repeat(64),
              updatedAt: '2026-04-16T00:02:11.000Z',
            },
            computed: {
              algorithm: 'sha256',
              value: '2'.repeat(64),
            },
          },
          auditEntry,
          indexedExecutionCount: 1,
          indexedExecutionIds: [`${metadata.pipelineId}-approved-recommendations`],
          recommendationCount: 1,
          index: {
            ...mutationIndex,
            checksum: {
              algorithm: 'sha256',
              value: '2'.repeat(64),
              updatedAt: '2026-04-16T00:02:11.000Z',
            },
            integrityAuditTrail: mutationIndexRepairEvents,
          },
        });
        return;
      }
      if (
        requestUrl.pathname.includes('/api/agentic/recommendations/mutation-index') &&
        route.request().method() === 'POST'
      ) {
        const payload = JSON.parse(route.request().postData() || '{}');
        mutationIndexRepairCalls += 1;
        const previousStatus = mutationIndexIntegrityMode;
        const previousChecksum =
          previousStatus === 'missing'
            ? null
            : {
                algorithm: 'sha256',
                value: '2'.repeat(64),
                updatedAt: '2026-04-16T00:02:01.000Z',
              };
        const previousComputedChecksum = {
          algorithm: 'sha256',
          value: previousStatus === 'mismatch' ? '4'.repeat(64) : '3'.repeat(64),
        };
        const auditEntry = {
          id: `mutation-index-repair-browser-e2e-${previousStatus}-${mutationIndexRepairCalls}`,
          action: 'checksum_recalculated',
          actor: 'user',
          requestedBy: 'browser-e2e-user',
          repairedAt: `2026-04-16T00:02:0${3 + mutationIndexRepairCalls}.000Z`,
          reason: `ui_debug_panel_repair:${previousStatus}`,
          previousIntegrityStatus: previousStatus,
          previousChecksum,
          previousComputedChecksum,
        };
        expect(payload.confirmRepair).toBe(true);
        expect(payload.reason).toContain(`ui_debug_panel_repair:${previousStatus}`);
        mutationIndexRepairEvents.unshift(auditEntry);
        mutationIndexIntegrityMode = 'valid';
        await fulfillJson(route, {
          success: true,
          action: 'repair_checksum',
          projectKey: 'untitled_project',
          slot: 'editor_project_current',
          previousIntegrity: {
            valid: false,
            status: previousStatus,
            stored: previousChecksum,
            computed: previousComputedChecksum,
          },
          integrity: {
            valid: true,
            status: 'valid',
            stored: {
              algorithm: 'sha256',
              value: '2'.repeat(64),
              updatedAt: '2026-04-16T00:02:04.000Z',
            },
            computed: {
              algorithm: 'sha256',
              value: '2'.repeat(64),
            },
          },
          auditEntry,
          index: {
            ...mutationIndex,
            checksum: {
              algorithm: 'sha256',
              value: '2'.repeat(64),
              updatedAt: '2026-04-16T00:02:04.000Z',
            },
            integrityAuditTrail: mutationIndexRepairEvents,
          },
        });
        return;
      }
      if (requestUrl.pathname.includes('/api/agentic/recommendations/mutation-index')) {
        mutationIndexCalls += 1;
        const integrity = mutationIndexIntegrityMode === 'missing'
          ? {
              valid: false,
              status: 'missing',
              stored: null,
              computed: {
                algorithm: 'sha256',
                value: '3'.repeat(64),
              },
            }
          : mutationIndexIntegrityMode === 'mismatch'
            ? {
                valid: false,
                status: 'mismatch',
                stored: {
                  algorithm: 'sha256',
                  value: '2'.repeat(64),
                  updatedAt: '2026-04-16T00:02:01.000Z',
                },
                computed: {
                  algorithm: 'sha256',
                  value: '4'.repeat(64),
                },
              }
            : {
                valid: true,
                status: 'valid',
                stored: {
                  algorithm: 'sha256',
                  value: '2'.repeat(64),
                  updatedAt: '2026-04-16T00:02:01.000Z',
                },
                computed: {
                  algorithm: 'sha256',
                  value: '2'.repeat(64),
                },
              };
        await fulfillJson(route, {
          success: true,
          projectKey: 'untitled_project',
          slot: 'editor_project_current',
          index: mutationIndex,
          integrity,
        });
        return;
      }
      if (requestUrl.pathname.includes('/api/agentic/recommendations/execute-approved')) {
        executeApprovedCalls += 1;
        const payload = JSON.parse(route.request().postData() || '{}');
        expect(payload.executionId).toBe(metadata.pipelineId);
        await fulfillJson(route, {
          success: true,
          approved: true,
          executedApprovedRecommendations: true,
          sourceExecutionId: metadata.pipelineId,
          approvedRecommendationIds: ['recommendation-maintenance-e2e'],
          approvedRecommendationKeys: ['scene.analyze:NO_BLOCKING_ISSUE:asset.reindex'],
          recommendationExecution: {
            sourceExecutionId: metadata.pipelineId,
            recommendationIds: ['recommendation-maintenance-e2e'],
            recommendationKeys: ['scene.analyze:NO_BLOCKING_ISSUE:asset.reindex'],
            recommendations: [
              {
                id: 'recommendation-maintenance-e2e',
                approvalKey: 'scene.analyze:NO_BLOCKING_ISSUE:asset.reindex',
                summary: 'Scene structure is inspectable; no blocking scene issue was detected.',
              },
            ],
            unlockedMutations: [
              {
                toolCallId: 'tool-approved-reindex',
                toolName: 'asset.reindex',
                stepId: 'step-approved-reindex',
                recommendationIds: ['recommendation-maintenance-e2e'],
                recommendationKeys: ['scene.analyze:NO_BLOCKING_ISSUE:asset.reindex'],
                evidenceIds: ['evidence-approved-reindex'],
                targets: [
                  {
                    id: 'asset-index-e2e',
                    type: 'asset',
                    summary: 'Asset index regenerated from approved recommendation.',
                  },
                ],
              },
            ],
            partialRollback: {
              available: true,
              applied: false,
              appliedAt: null,
              recommendationIds: [],
              recommendationKeys: [],
              toolCallIds: [],
              targetIds: [],
            },
          },
          pipeline: {
            id: `${metadata.pipelineId}-approved-recommendations`,
            status: 'approved',
            iteration: 2,
            validation: metadata.validation,
            messageMetadata: {
              ...metadata,
              pipelineId: `${metadata.pipelineId}-approved-recommendations`,
              traces: [
                {
                  eventType: 'recommendation.unlocked_mutation',
                  severity: 'info',
                  actor: 'maintenance',
                  message: 'Approved recommendation unlocked mutation for Apply recommendation: Scene structure is inspectable.',
                  data: {
                    approvedRecommendationIds: ['recommendation-maintenance-e2e'],
                    approvedRecommendationKeys: ['scene.analyze:NO_BLOCKING_ISSUE:asset.reindex'],
                    suggestedToolNames: ['asset.reindex'],
                  },
                  timestamp: '2026-04-16T00:00:01.200Z',
                },
              ],
            },
            runtimeScaffold: metadata.runtimeScaffold,
            artifactPath: 'output/builds/browser-server-agentic/browser-server-agentic-web.zip',
          },
        });
        return;
      }
      if (requestUrl.pathname.includes('/api/agentic/recommendations/rollback-approved')) {
        partialRollbackCalls += 1;
        partialRollbackApplied = true;
        const payload = JSON.parse(route.request().postData() || '{}');
        expect(payload.executionId).toBe(`${metadata.pipelineId}-approved-recommendations`);
        expect(payload.recommendationId).toBe('scene.analyze:NO_BLOCKING_ISSUE:asset.reindex');
        await fulfillJson(route, {
          success: true,
          action: 'partial_rollback',
          projectKey: 'untitled_project',
          slot: 'editor_project_current',
          executionId: `${metadata.pipelineId}-approved-recommendations`,
          recommendationId: payload.recommendationId,
          record: {
            id: `${metadata.pipelineId}-approved-recommendations`,
            userId: 'browser-e2e-user',
            projectKey: 'untitled_project',
            slot: 'editor_project_current',
            prompt: 'exporta esta escena para web',
            approved: true,
            status: 'approved',
            iteration: 2,
            createdAt: '2026-04-16T00:02:00.000Z',
            completedAt: '2026-04-16T00:02:01.000Z',
            artifactPath: null,
            runtimeScaffold: null,
            validation: metadata.validation,
            toolNames: ['asset.reindex'],
            agentRoles: ['maintenance'],
            steps: [
              {
                id: 'step-approved-reindex',
                title: 'Apply recommendation: Scene structure is inspectable',
                agentRole: 'maintenance',
                status: 'completed',
                evidenceCount: 1,
                errorCount: 0,
              },
            ],
            toolStats: [{ name: 'asset.reindex', successCount: 1, failureCount: 0 }],
            traces: [
              {
                eventType: 'recommendation.partial_rollback',
                severity: 'info',
                actor: 'user',
                message: 'Partial rollback applied for approved recommendation execution.',
                timestamp: '2026-04-16T00:02:02.000Z',
              },
            ],
            sharedMemory: { analyses: [], actionableRecommendations: [] },
            toolCalls: [],
            stepCount: 1,
            action: 'approved_recommendations',
            sourceExecutionId: metadata.pipelineId,
            recommendationExecution: {
              sourceExecutionId: metadata.pipelineId,
              recommendationIds: ['recommendation-maintenance-e2e'],
              recommendationKeys: ['scene.analyze:NO_BLOCKING_ISSUE:asset.reindex'],
              recommendations: [
                {
                  id: 'recommendation-maintenance-e2e',
                  approvalKey: 'scene.analyze:NO_BLOCKING_ISSUE:asset.reindex',
                  summary: 'Scene structure is inspectable; no blocking scene issue was detected.',
                },
              ],
              unlockedMutations: [
                {
                  toolCallId: 'tool-approved-reindex',
                  toolName: 'asset.reindex',
                  stepId: 'step-approved-reindex',
                  recommendationIds: ['recommendation-maintenance-e2e'],
                  recommendationKeys: ['scene.analyze:NO_BLOCKING_ISSUE:asset.reindex'],
                  evidenceIds: ['evidence-approved-reindex'],
                  targets: [{ id: 'asset-index-e2e', type: 'asset', summary: 'Asset index regenerated.' }],
                },
              ],
              partialRollback: {
                available: false,
                applied: true,
                appliedAt: '2026-04-16T00:02:02.000Z',
                recommendationIds: ['recommendation-maintenance-e2e'],
                recommendationKeys: ['scene.analyze:NO_BLOCKING_ISSUE:asset.reindex'],
                toolCallIds: ['tool-approved-reindex'],
                targetIds: ['asset-index-e2e'],
              },
            },
            snapshots: { before: true, after: true },
            diff: null,
          },
        });
        return;
      }
      if (requestUrl.pathname.includes('/api/agentic/recommendations/')) {
        const payload = JSON.parse(route.request().postData() || '{}');
        recommendationDecision = payload.decision === 'rejected' ? 'rejected' : 'approved';
        await fulfillJson(route, {
          success: true,
          projectKey: 'untitled_project',
          slot: 'editor_project_current',
          executionId: metadata.pipelineId,
          recommendation: {
            id: 'recommendation-maintenance-e2e',
            approvalKey: 'scene.analyze:NO_BLOCKING_ISSUE:asset.reindex',
            approvalStatus: recommendationDecision,
          },
        });
        return;
      }

      if (route.request().method() === 'GET') {
        serverHistoryCalls += 1;
        const search = requestUrl.searchParams.get('search')?.trim() ?? '';
        const historyFilter = requestUrl.searchParams.get('historyFilter')?.trim() ?? 'all';
        const toolFilter = requestUrl.searchParams.get('toolFilter')?.trim().toLowerCase() ?? '';
        const agentFilter = requestUrl.searchParams.get('agentFilter')?.trim().toLowerCase() ?? '';
        if (historyFilter === 'pending_index') {
          pendingIndexHistoryCalls += 1;
        }
        const traceEvent = requestUrl.searchParams.get('traceEvent')?.trim().toLowerCase() ?? '';
        const traceActor = requestUrl.searchParams.get('traceActor')?.trim().toLowerCase() ?? '';
        const traceSeverity = requestUrl.searchParams.get('traceSeverity')?.trim().toLowerCase() ?? '';
        const limit = Number(requestUrl.searchParams.get('limit') || 8);
        const offset = Number(requestUrl.searchParams.get('offset') || 0);
        const pendingIndexableExecutionIds = mutationIndexBehind
          ? [`${metadata.pipelineId}-approved-recommendations`]
          : [];
        const historyRecord = {
          id: metadata.pipelineId,
          userId: 'browser-e2e-user',
          projectKey: 'untitled_project',
          slot: 'editor_project_current',
          prompt: 'exporta esta escena para web',
          approved: true,
          status: 'approved',
          iteration: 1,
          createdAt: '2026-04-16T00:00:00.000Z',
          completedAt: '2026-04-16T00:00:01.000Z',
          artifactPath: 'output/builds/browser-server-agentic/browser-server-agentic-web.zip',
          runtimeScaffold: metadata.runtimeScaffold,
          validation: metadata.validation,
          toolNames: ['build.export', 'scene.analyze'],
          agentRoles: ['technical_integration', 'maintenance'],
          steps: metadata.steps,
          toolStats: [
            ...metadata.tools,
            {
              name: 'scene.analyze',
              successCount: 1,
              failureCount: 0,
            },
          ],
          traces: [
            {
              eventType: 'intent.parsed',
              severity: 'info',
              actor: 'master_orchestrator',
              message: 'Parsed export intent for browser server run.',
              timestamp: '2026-04-16T00:00:00.100Z',
            },
            {
              eventType: 'tool.completed',
              severity: 'info',
              actor: 'technical_integration',
              message: 'Executed build.export and produced a web artifact.',
              stepId: 'step-server-export',
              toolCallId: 'tool-build-export',
              timestamp: '2026-04-16T00:00:00.700Z',
            },
            {
              eventType: 'tool.completed',
              severity: 'info',
              actor: 'maintenance',
              message: 'Scene analysis completed without mutating world state.',
              stepId: 'step-server-inspect',
              toolCallId: 'tool-scene-analyze',
              timestamp: '2026-04-16T00:00:00.250Z',
            },
          ],
          sharedMemory: {
            analyses: [
              {
                id: 'tool-scene-analyze-analysis',
                toolName: 'scene.analyze',
                callId: 'tool-scene-analyze',
                stepId: 'step-server-inspect',
                agentRole: 'maintenance',
                scope: 'active_scene',
                summary: 'Scene analysis completed without mutating world state.',
                output: {
                  scope: 'active_scene',
                  activeSceneId: 'scene-browser-server-e2e',
                  counts: { scenes: 1, entities: 0, assets: 0 },
                  issues: [],
                },
                actionableRecommendations: [
                  {
                    id: 'recommendation-maintenance-e2e',
                    approvalKey: 'scene.analyze:NO_BLOCKING_ISSUE:asset.reindex',
                    sourceToolName: 'scene.analyze',
                    sourceCallId: 'tool-scene-analyze',
                    summary: 'Scene structure is inspectable; no blocking scene issue was detected.',
                    rationale: 'NO_BLOCKING_ISSUE',
                    priority: 'optional',
                    suggestedDomain: 'maintenance',
                    suggestedCapabilities: ['asset.reindex'],
                    suggestedToolNames: ['asset.reindex'],
                    input: { reason: 'analysis-confirmed-maintenance' },
                    confidence: 0.55,
                    approvalStatus: recommendationDecision,
                  },
                ],
                createdAt: '2026-04-16T00:00:00.250Z',
              },
            ],
            actionableRecommendations: [
              {
                id: 'recommendation-maintenance-e2e',
                approvalKey: 'scene.analyze:NO_BLOCKING_ISSUE:asset.reindex',
                sourceToolName: 'scene.analyze',
                sourceCallId: 'tool-scene-analyze',
                summary: 'Scene structure is inspectable; no blocking scene issue was detected.',
                rationale: 'NO_BLOCKING_ISSUE',
                priority: 'optional',
                suggestedDomain: 'maintenance',
                suggestedCapabilities: ['asset.reindex'],
                suggestedToolNames: ['asset.reindex'],
                input: { reason: 'analysis-confirmed-maintenance' },
                confidence: 0.55,
                approvalStatus: recommendationDecision,
              },
            ],
          },
          toolCalls: [
            {
              callId: 'tool-build-export',
              toolName: 'build.export',
              agentRole: 'technical_integration',
              stepId: 'step-server-export',
              success: true,
              message: 'Executed build.export and produced a web artifact.',
              startedAt: '2026-04-16T00:00:00.500Z',
              completedAt: '2026-04-16T00:00:00.700Z',
              input: { target: 'web' },
              output: { artifactPath: 'output/builds/browser-server-agentic/browser-server-agentic-web.zip' },
              error: null,
              mutatesWorld: true,
              evidenceContract: 'before_after',
              evidence: [
                {
                  id: 'evidence-camera-transform',
                  type: 'component',
                  targetId: 'camera-server-e2e',
                  summary: 'Transform added to Agentic Export Camera.',
                  before: null,
                  after: { position: { x: 0, y: 2, z: 6 }, enabled: true },
                  timestamp: '2026-04-16T00:00:00.650Z',
                },
                {
                  id: 'evidence-large-world-diff',
                  type: 'build',
                  targetId: 'browser-server-agentic',
                  summary: 'Large before/after world diff captured for export.',
                  before: {
                    entities: [],
                    environment: {
                      mood: 'empty',
                      ambientIntensity: 1,
                      directionalLightIntensity: 1.25,
                      fog: null,
                    },
                    export: { cameras: 0, playableControllers: 0, colliders: 0 },
                  },
                  after: {
                    entities: [
                      {
                        id: 'camera-server-e2e',
                        name: 'Agentic Export Camera',
                        components: ['Transform', 'Camera'],
                        transform: { position: { x: 0, y: 2, z: 6 }, rotation: { x: -12, y: 0, z: 0 } },
                      },
                      {
                        id: 'player-server-e2e',
                        name: 'Agentic Export Player',
                        components: ['Transform', 'CharacterController', 'Collider', 'Rigidbody'],
                        transform: { position: { x: 0, y: 1, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
                      },
                    ],
                    environment: {
                      mood: 'runtime_export',
                      ambientIntensity: 0.58,
                      directionalLightIntensity: 0.92,
                      fog: { enabled: false },
                    },
                    export: { cameras: 1, playableControllers: 1, colliders: 1 },
                  },
                  timestamp: '2026-04-16T00:00:00.680Z',
                },
              ],
            },
            {
              callId: 'tool-scene-analyze',
              toolName: 'scene.analyze',
              agentRole: 'maintenance',
              stepId: 'step-server-inspect',
              success: true,
              message: 'Scene analysis completed without mutating world state.',
              startedAt: '2026-04-16T00:00:00.200Z',
              completedAt: '2026-04-16T00:00:00.250Z',
              input: { scope: 'active_scene' },
              output: {
                scope: 'active_scene',
                activeSceneId: 'scene-browser-server-e2e',
                counts: { scenes: 1, entities: 0, assets: 0 },
                issues: [],
                recommendations: ['Proceed with targeted mutating tools only if required.'],
              },
              error: null,
              mutatesWorld: false,
              evidenceContract: 'none',
              evidence: [],
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
              entities: { before: 0, after: 2, delta: 2 },
              assets: { before: 0, after: 0, delta: 0 },
              scribProfiles: { before: 0, after: 0, delta: 0 },
              scribInstances: { before: 0, after: 0, delta: 0 },
            },
            scenes: { added: [], removed: [], changed: [] },
            entities: {
              added: [
                { id: 'camera-server-e2e', name: 'Agentic Export Camera' },
                { id: 'player-server-e2e', name: 'Agentic Export Player' },
              ],
              removed: [],
              changed: [],
            },
            assets: { added: [], removed: [], changed: [] },
            semantic: {
              componentChanges: [
                {
                  entityId: 'camera-server-e2e',
                  entityName: 'Agentic Export Camera',
                  component: 'Transform',
                  changeType: 'added',
                  fields: ['position', 'rotation', 'scale', 'enabled'],
                  fieldChanges: [
                    { field: 'position', before: '(missing)', after: '{"x":0,"y":2,"z":6}' },
                    { field: 'enabled', before: '(missing)', after: 'true' },
                  ],
                  summary: 'Transform agregado en Agentic Export Camera: position, rotation, scale, enabled',
                },
                {
                  entityId: 'player-server-e2e',
                  entityName: 'Agentic Export Player',
                  component: 'Collider',
                  changeType: 'added',
                  fields: ['shape', 'enabled'],
                  fieldChanges: [
                    { field: 'shape', before: '(missing)', after: 'capsule' },
                    { field: 'enabled', before: '(missing)', after: 'true' },
                  ],
                  summary: 'Collider agregado en Agentic Export Player: shape, enabled',
                },
              ],
            },
            rollbackPreview: {
              willRemove: {
                scenes: [],
                entities: [
                  { id: 'camera-server-e2e', name: 'Agentic Export Camera' },
                  { id: 'player-server-e2e', name: 'Agentic Export Player' },
                ],
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
                    entityId: 'camera-server-e2e',
                    entityName: 'Agentic Export Camera',
                    component: 'Transform',
                    changeType: 'added',
                    fields: ['position', 'rotation', 'scale', 'enabled'],
                    fieldChanges: [
                      { field: 'position', before: '(missing)', after: '{"x":0,"y":2,"z":6}' },
                    ],
                    summary: 'Transform agregado en Agentic Export Camera: position, rotation, scale, enabled',
                  },
                ],
              },
            },
          },
        };
        const lightingHistoryRecord = {
          id: `${metadata.pipelineId}-lighting`,
          userId: 'browser-e2e-user',
          projectKey: 'untitled_project',
          slot: 'editor_project_current',
          prompt: 'corrige ambiente oscuro sin exportar',
          approved: false,
          status: 'rejected',
          iteration: 2,
          createdAt: '2026-04-16T00:01:00.000Z',
          completedAt: '2026-04-16T00:01:01.000Z',
          artifactPath: null,
          runtimeScaffold: null,
          validation: {
            approved: false,
            confidence: 0.62,
            matchedRequirements: ['lighting.adjusted'],
            missingRequirements: ['environment.dark'],
            incorrectOutputs: ['scene.too_bright'],
            retryInstructions: ['Lower key light intensity and increase fog density.'],
          },
          toolNames: ['light.adjust'],
          agentRoles: ['lighting_environment'],
          steps: [
            {
              id: 'step-lighting-adjust',
              title: 'Adjust lighting for dark environment',
              agentRole: 'lighting_environment',
              status: 'completed',
              evidenceCount: 1,
              errorCount: 0,
            },
          ],
          toolStats: [
            {
              name: 'light.adjust',
              successCount: 1,
              failureCount: 0,
            },
          ],
          traces: [
            {
              eventType: 'validation.rejected',
              severity: 'warning',
              actor: 'final_delivery_validator',
              message: 'Rejected because the scene remained too bright.',
              timestamp: '2026-04-16T00:01:00.900Z',
            },
          ],
          toolCalls: [
            {
              callId: 'tool-light-adjust',
              toolName: 'light.adjust',
              agentRole: 'lighting_environment',
              stepId: 'step-lighting-adjust',
              success: true,
              message: 'Lowered key light intensity.',
              startedAt: '2026-04-16T00:01:00.300Z',
              completedAt: '2026-04-16T00:01:00.600Z',
              input: { entityId: 'key-light-server-e2e', intensity: 0.9 },
              output: { entityId: 'key-light-server-e2e', intensity: 0.9 },
              error: null,
              mutatesWorld: true,
              evidenceContract: 'before_after',
              evidence: [
                {
                  id: 'evidence-key-light-intensity',
                  type: 'lighting',
                  targetId: 'key-light-server-e2e',
                  summary: 'Key Light intensity changed from 1.5 to 0.9.',
                  before: { intensity: 1.5 },
                  after: { intensity: 0.9 },
                  timestamp: '2026-04-16T00:01:00.550Z',
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
              entities: { before: 2, after: 2, delta: 0 },
              assets: { before: 0, after: 0, delta: 0 },
              scribProfiles: { before: 0, after: 0, delta: 0 },
              scribInstances: { before: 0, after: 0, delta: 0 },
            },
            scenes: { added: [], removed: [], changed: [] },
            entities: { added: [], removed: [], changed: [] },
            assets: { added: [], removed: [], changed: [] },
            semantic: {
              componentChanges: [
                {
                  entityId: 'key-light-server-e2e',
                  entityName: 'Key Light',
                  component: 'Light',
                  changeType: 'changed',
                  fields: ['intensity'],
                  fieldChanges: [
                    { field: 'intensity', before: '1.5', after: '0.9' },
                  ],
                  summary: 'Light cambiado en Key Light: intensity',
                },
              ],
            },
            rollbackPreview: {
              willRemove: {
                scenes: [],
                entities: [],
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
                components: [],
              },
            },
          },
        };
        const approvedHistoryRecord = {
          id: `${metadata.pipelineId}-approved-recommendations`,
          userId: 'browser-e2e-user',
          projectKey: 'untitled_project',
          slot: 'editor_project_current',
          prompt: 'exporta esta escena para web',
          approved: true,
          status: 'approved',
          iteration: 2,
          createdAt: '2026-04-16T00:02:00.000Z',
          completedAt: '2026-04-16T00:02:01.000Z',
          artifactPath: null,
          runtimeScaffold: null,
          validation: metadata.validation,
          toolNames: ['asset.reindex'],
          agentRoles: ['maintenance'],
          steps: [
            {
              id: 'step-approved-reindex',
              title: 'Apply recommendation: Scene structure is inspectable',
              agentRole: 'maintenance',
              status: 'completed',
              evidenceCount: 1,
              errorCount: 0,
            },
          ],
          toolStats: [{ name: 'asset.reindex', successCount: 1, failureCount: 0 }],
          traces: [
            {
              eventType: 'recommendation.unlocked_mutation',
              severity: 'info',
              actor: 'maintenance',
              message: 'Approved recommendation unlocked mutation for Apply recommendation: Scene structure is inspectable.',
              data: {
                approvedRecommendationIds: ['recommendation-maintenance-e2e'],
                approvedRecommendationKeys: ['scene.analyze:NO_BLOCKING_ISSUE:asset.reindex'],
                suggestedToolNames: ['asset.reindex'],
              },
              timestamp: '2026-04-16T00:02:00.500Z',
            },
            ...(partialRollbackApplied
              ? [
                  {
                    eventType: 'recommendation.partial_rollback',
                    severity: 'info',
                    actor: 'user',
                    message: 'Partial rollback applied for approved recommendation execution.',
                    timestamp: '2026-04-16T00:02:02.000Z',
                  },
                ]
              : []),
          ],
          sharedMemory: { analyses: [], actionableRecommendations: [] },
          toolCalls: [
            {
              callId: 'tool-approved-reindex',
              toolName: 'asset.reindex',
              agentRole: 'maintenance',
              stepId: 'step-approved-reindex',
              success: true,
              message: 'Assets reindexed from approved recommendation.',
              startedAt: '2026-04-16T00:02:00.300Z',
              completedAt: '2026-04-16T00:02:00.600Z',
              input: { reason: 'analysis-confirmed-maintenance' },
              output: { indexed: true },
              error: null,
              mutatesWorld: true,
              evidenceContract: 'before_after',
              evidence: [
                {
                  id: 'evidence-approved-reindex',
                  type: 'asset',
                  targetId: 'asset-index-e2e',
                  summary: 'Asset index regenerated from approved recommendation.',
                  before: { indexedAt: null },
                  after: { indexedAt: '2026-04-16T00:02:00.500Z' },
                  timestamp: '2026-04-16T00:02:00.500Z',
                },
              ],
            },
          ],
          stepCount: 1,
          action: 'approved_recommendations',
          sourceExecutionId: metadata.pipelineId,
          recommendationExecution: {
            sourceExecutionId: metadata.pipelineId,
            recommendationIds: ['recommendation-maintenance-e2e'],
            recommendationKeys: ['scene.analyze:NO_BLOCKING_ISSUE:asset.reindex'],
            recommendations: [
              {
                id: 'recommendation-maintenance-e2e',
                approvalKey: 'scene.analyze:NO_BLOCKING_ISSUE:asset.reindex',
                summary: 'Scene structure is inspectable; no blocking scene issue was detected.',
              },
            ],
            unlockedMutations: [
              {
                toolCallId: 'tool-approved-reindex',
                toolName: 'asset.reindex',
                stepId: 'step-approved-reindex',
                recommendationIds: ['recommendation-maintenance-e2e'],
                recommendationKeys: ['scene.analyze:NO_BLOCKING_ISSUE:asset.reindex'],
                evidenceIds: ['evidence-approved-reindex'],
                targets: [{ id: 'asset-index-e2e', type: 'asset', summary: 'Asset index regenerated.' }],
              },
            ],
            partialRollback: {
              available: !partialRollbackApplied,
              applied: partialRollbackApplied,
              appliedAt: partialRollbackApplied ? '2026-04-16T00:02:02.000Z' : null,
              recommendationIds: partialRollbackApplied ? ['recommendation-maintenance-e2e'] : [],
              recommendationKeys: partialRollbackApplied ? ['scene.analyze:NO_BLOCKING_ISSUE:asset.reindex'] : [],
              toolCallIds: partialRollbackApplied ? ['tool-approved-reindex'] : [],
              targetIds: partialRollbackApplied ? ['asset-index-e2e'] : [],
            },
          },
          snapshots: { before: true, after: true },
          diff: {
            hasChanges: true,
            counts: {
              scenes: { before: 1, after: 1, delta: 0 },
              entities: { before: 2, after: 2, delta: 0 },
              assets: { before: 1, after: 1, delta: 0 },
              scribProfiles: { before: 0, after: 0, delta: 0 },
              scribInstances: { before: 0, after: 0, delta: 0 },
            },
            scenes: { added: [], removed: [], changed: [] },
            entities: { added: [], removed: [], changed: [] },
            assets: { added: [], removed: [], changed: [{ id: 'asset-index-e2e', name: 'Asset Index' }] },
            semantic: { componentChanges: [] },
            rollbackPreview: {
              willRemove: { scenes: [], entities: [], assets: [] },
              willRestore: { scenes: [], entities: [], assets: [] },
              willRevert: {
                scenes: [],
                entities: [],
                assets: [{ id: 'asset-index-e2e', name: 'Asset Index' }],
                components: [],
              },
            },
          },
        };
        const allHistory = serverAgenticCalls > 0
          ? [
              historyRecord,
              lightingHistoryRecord,
              ...(executeApprovedCalls > 0 ? [approvedHistoryRecord] : []),
            ]
          : [];
        const filteredHistory = allHistory.filter((record) => {
          const matchesSearch = search
            ? JSON.stringify(record).toLowerCase().includes(search.toLowerCase())
            : true;
          const matchesHistoryFilter =
            historyFilter === 'approved'
              ? record.approved
              : historyFilter === 'rejected'
                ? !record.approved
                : historyFilter === 'replay'
                  ? record.action === 'replay'
                  : historyFilter === 'rollbackable'
                    ? record.snapshots?.before === true
                    : historyFilter === 'pending_index'
                      ? pendingIndexableExecutionIds.includes(record.id)
                      : true;
          const matchesTool =
            !toolFilter ||
            (record.toolNames || []).some((toolName) => toolName.toLowerCase() === toolFilter) ||
            (record.toolStats || []).some((tool) => tool.name.toLowerCase() === toolFilter) ||
            (record.toolCalls || []).some((toolCall) => toolCall.toolName.toLowerCase() === toolFilter);
          const matchesAgent =
            !agentFilter ||
            (record.agentRoles || []).some((agentRole) => agentRole.toLowerCase() === agentFilter) ||
            (record.steps || []).some((step) => step.agentRole.toLowerCase() === agentFilter) ||
            (record.toolCalls || []).some((toolCall) => toolCall.agentRole.toLowerCase() === agentFilter);
          const matchesTrace = (record.traces || []).some((trace) => {
            const matchesEvent = !traceEvent || trace.eventType.toLowerCase().includes(traceEvent);
            const matchesActor = !traceActor || trace.actor.toLowerCase().includes(traceActor);
            const matchesSeverity = !traceSeverity || trace.severity.toLowerCase() === traceSeverity;
            return matchesEvent && matchesActor && matchesSeverity;
          });
          return (
            matchesSearch &&
            matchesHistoryFilter &&
            matchesTool &&
            matchesAgent &&
            (!traceEvent && !traceActor && !traceSeverity ? true : matchesTrace)
          );
        });
        const optionBaseHistory = allHistory.filter((record) => {
          const matchesSearch = search
            ? JSON.stringify(record).toLowerCase().includes(search.toLowerCase())
            : true;
          const matchesHistoryFilter =
            historyFilter === 'approved'
              ? record.approved
              : historyFilter === 'rejected'
                ? !record.approved
                : historyFilter === 'replay'
                  ? record.action === 'replay'
                  : historyFilter === 'rollbackable'
                    ? record.snapshots?.before === true
                    : historyFilter === 'pending_index'
                      ? pendingIndexableExecutionIds.includes(record.id)
                      : true;
          const matchesTrace = (record.traces || []).some((trace) => {
            const matchesEvent = !traceEvent || trace.eventType.toLowerCase().includes(traceEvent);
            const matchesActor = !traceActor || trace.actor.toLowerCase().includes(traceActor);
            const matchesSeverity = !traceSeverity || trace.severity.toLowerCase() === traceSeverity;
            return matchesEvent && matchesActor && matchesSeverity;
          });
          return matchesSearch && matchesHistoryFilter && (!traceEvent && !traceActor && !traceSeverity ? true : matchesTrace);
        });
        const countBaseHistory = allHistory.filter((record) => {
          const matchesSearch = search
            ? JSON.stringify(record).toLowerCase().includes(search.toLowerCase())
            : true;
          const matchesTool =
            !toolFilter ||
            (record.toolNames || []).some((toolName) => toolName.toLowerCase() === toolFilter) ||
            (record.toolStats || []).some((tool) => tool.name.toLowerCase() === toolFilter) ||
            (record.toolCalls || []).some((toolCall) => toolCall.toolName.toLowerCase() === toolFilter);
          const matchesAgent =
            !agentFilter ||
            (record.agentRoles || []).some((agentRole) => agentRole.toLowerCase() === agentFilter) ||
            (record.steps || []).some((step) => step.agentRole.toLowerCase() === agentFilter) ||
            (record.toolCalls || []).some((toolCall) => toolCall.agentRole.toLowerCase() === agentFilter);
          const matchesTrace = (record.traces || []).some((trace) => {
            const matchesEvent = !traceEvent || trace.eventType.toLowerCase().includes(traceEvent);
            const matchesActor = !traceActor || trace.actor.toLowerCase().includes(traceActor);
            const matchesSeverity = !traceSeverity || trace.severity.toLowerCase() === traceSeverity;
            return matchesEvent && matchesActor && matchesSeverity;
          });
          return matchesSearch && matchesTool && matchesAgent && (!traceEvent && !traceActor && !traceSeverity ? true : matchesTrace);
        });
        const filterOptions = {
          tools: [
            ...new Set(
              optionBaseHistory.flatMap((record) => [
                ...(record.toolNames || []),
                ...(record.toolStats || []).map((tool) => tool.name),
                ...(record.toolCalls || []).map((toolCall) => toolCall.toolName),
              ])
            ),
          ].sort(),
          agents: [
            ...new Set(
              optionBaseHistory.flatMap((record) => [
                ...(record.agentRoles || []),
                ...(record.steps || []).map((step) => step.agentRole),
                ...(record.toolCalls || []).map((toolCall) => toolCall.agentRole),
              ])
            ),
          ].sort(),
        };
        const filterCounts = {
          total: countBaseHistory.length,
          approved: countBaseHistory.filter((record) => record.approved).length,
          rejected: countBaseHistory.filter((record) => !record.approved).length,
          replay: countBaseHistory.filter((record) => record.action === 'replay').length,
          rollbackable: countBaseHistory.filter((record) => record.snapshots?.before === true).length,
          pendingIndex: countBaseHistory.filter((record) => pendingIndexableExecutionIds.includes(record.id)).length,
        };
        await fulfillJson(route, {
          success: true,
          projectKey: 'untitled_project',
          slot: 'editor_project_current',
          history: filteredHistory.slice(offset, offset + limit),
          filterOptions,
          filterCounts,
          mutationIndexAudit: {
            repairCount: mutationIndexRepairEvents.length,
            checksumRepairCount: mutationIndexRepairEvents.filter((event) => event.action === 'checksum_recalculated').length,
            historyReindexedFullCount: mutationIndexRepairEvents.filter((event) => event.action === 'history_reindexed_full').length,
            historyReindexedPartialCount: mutationIndexRepairEvents.filter((event) => event.action === 'history_reindexed_partial').length,
            legacyHistoryReindexedCount: mutationIndexRepairEvents.filter((event) => event.action === 'history_reindexed').length,
            latestRepairId: (mutationIndexRepairEvents[0]?.id as string | undefined) ?? null,
            latestRepairAt: (mutationIndexRepairEvents[0]?.repairedAt as string | undefined) ?? null,
            integrityStatus: mutationIndexIntegrityMode,
            integrityValid: mutationIndexIntegrityMode === 'valid',
            recommendationCount: 1,
            lastIndexedExecutionId: mutationIndexBehind
              ? metadata.pipelineId
              : `${metadata.pipelineId}-approved-recommendations`,
            latestIndexableExecutionId: executeApprovedCalls > 0
              ? `${metadata.pipelineId}-approved-recommendations`
              : null,
            pendingIndexableExecutionCount: mutationIndexBehind ? 1 : 0,
            pendingIndexableExecutionIds,
            indexBehind: mutationIndexBehind,
          },
          pagination: {
            limit,
            offset,
            totalRecords: allHistory.length,
            filteredRecords: filteredHistory.length,
            hasPrevious: offset > 0,
            hasNext: offset + limit < filteredHistory.length,
            search,
            historyFilter,
            toolFilter,
            agentFilter,
            traceEvent,
            traceActor,
            traceSeverity,
          },
        });
        return;
      }

      if (route.request().method() === 'PATCH') {
        const payload = JSON.parse(route.request().postData() || '{}');
        expect(payload.action).toBe('replay');
        await fulfillJson(route, {
          success: true,
          approved: true,
          replayedFrom: payload.executionId,
          pipeline: {
            id: `${metadata.pipelineId}-approved-recommendations`,
            messageMetadata: {
              ...metadata,
              pipelineId: `${metadata.pipelineId}-approved-recommendations`,
              traces: [
                {
                  eventType: 'recommendation.unlocked_mutation',
                  severity: 'info',
                  actor: 'maintenance',
                  message: 'Approved recommendation unlocked mutation for Apply recommendation: Scene structure is inspectable.',
                  data: {
                    approvedRecommendationIds: ['recommendation-maintenance-e2e'],
                    approvedRecommendationKeys: ['scene.analyze:NO_BLOCKING_ISSUE:asset.reindex'],
                    suggestedToolNames: ['asset.reindex'],
                  },
                  timestamp: '2026-04-16T00:00:01.200Z',
                },
              ],
            },
            runtimeScaffold: metadata.runtimeScaffold,
            artifactPath: 'output/builds/browser-server-agentic/browser-server-agentic-web.zip',
          },
        });
        return;
      }

      serverAgenticCalls += 1;
      const payload = JSON.parse(route.request().postData() || '{}');
      expect(payload.prompt).toBe('exporta esta escena para web');
      await fulfillJson(route, {
        success: true,
        approved: true,
        persisted: false,
        pipeline: {
          messageMetadata: metadata,
          runtimeScaffold: metadata.runtimeScaffold,
          artifactPath: 'output/builds/browser-server-agentic/browser-server-agentic-web.zip',
        },
      });
    });

    await page.route('**/api/build', async (route) => {
      remoteBuildCalls += 1;
      await fulfillJson(route, { error: 'server agentic mode should not call client build' }, 500);
    });

    await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'AI Chat', exact: true }).click({ timeout: 120_000 });
    await page.getByRole('switch', { name: /ejecución agentic server/i }).first().click();
    await expect
      .poll(() => page.locator('[data-testid="agentic-server-history"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('Historial server');
    await expect
      .poll(() => page.locator('[data-testid="agentic-history-mutation-index-audit-summary"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('reparaciones: 0');
    const [emptyAuditJsonDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('[data-testid="agentic-history-mutation-index-audit-json"]').first().click(),
    ]);
    const emptyAuditJson = JSON.parse(await readDownloadText(emptyAuditJsonDownload));
    expect(emptyAuditJsonDownload.suggestedFilename()).toContain(
      'recommendation-mutation-index-audit.json'
    );
    expect(emptyAuditJson).toMatchObject({
      kind: 'agentic_recommendation_mutation_index_audit',
      integrityAuditCount: 0,
    });

    const input = page.locator('input').last();
    await input.fill('exporta esta escena para web');
    await input.press('Enter');

    const scaffold = page.locator('[data-testid="agentic-runtime-scaffold"]').first();
    await scaffold.waitFor({ state: 'visible', timeout: 120_000 });

    await expect.poll(() => remoteSaveCalls, { timeout: 5_000 }).toBe(1);
    await expect.poll(() => serverAgenticCalls, { timeout: 5_000 }).toBe(1);
    await expect.poll(() => serverHistoryCalls, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);
    expect(remoteBuildCalls).toBe(0);
    await expect.poll(() => scaffold.textContent(), { timeout: 5_000 }).toContain(
      'Runtime export preparado'
    );
    await expect
      .poll(() => page.locator('[data-testid="agentic-server-history"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('exporta esta escena para web');
    await expect
      .poll(() => page.locator('[data-testid="agentic-history-filter-counts"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('total 2');
    await expect
      .poll(() => page.locator('[data-testid="agentic-history-filter-counts"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('aprobados 1');
    await expect
      .poll(() => page.locator('[data-testid="agentic-history-filter-counts"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('rechazados 1');
    await expect
      .poll(() => page.locator('[data-testid="agentic-tool-filter"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('build.export');
    await expect
      .poll(() => page.locator('[data-testid="agentic-tool-filter"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('light.adjust');
    await expect
      .poll(() => page.locator('[data-testid="agentic-agent-filter"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('technical integration');
    await expect
      .poll(() => page.locator('[data-testid="agentic-agent-filter"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('lighting environment');
    await page.getByRole('button', { name: /detalle/i }).first().click();
    await expect
      .poll(() => page.locator('[data-testid="agentic-history-detail"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('snapshots: before / after');
    await page.locator('[data-testid="agentic-report-json"]').first().waitFor({
      state: 'visible',
      timeout: 5_000,
    });
    await page.locator('[data-testid="agentic-report-markdown"]').first().waitFor({
      state: 'visible',
      timeout: 5_000,
    });
    await page.locator('[data-testid="agentic-timeline-json"]').first().waitFor({
      state: 'visible',
      timeout: 5_000,
    });
    await page.locator('[data-testid="agentic-timeline-markdown"]').first().waitFor({
      state: 'visible',
      timeout: 5_000,
    });
    await expect
      .poll(() => page.locator('[data-testid="agentic-execution-timeline"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('Timeline');
    await expect
      .poll(() => page.locator('[data-testid="agentic-execution-timeline"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('Trazas completas: 3');
    await expect
      .poll(() => page.locator('[data-testid="agentic-shared-memory-debug"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('Shared memory');
    await expect
      .poll(() => page.locator('[data-testid="agentic-shared-memory-debug"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('Recommendations: 1');
    await page.locator('[data-testid="agentic-recommendation-approve"]').first().click();
    await expect
      .poll(() => page.locator('[data-testid="agentic-shared-memory-recommendations"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('approved');
    await expect
      .poll(() => page.locator('[data-testid="agentic-run-approved-recommendations"]').first().isEnabled(), {
        timeout: 5_000,
      })
      .toBe(true);
    await page.locator('[data-testid="agentic-run-approved-recommendations"]').first().click();
    await expect.poll(() => executeApprovedCalls, { timeout: 5_000 }).toBe(1);
    await expect
      .poll(() => page.locator('[data-testid="agentic-server-history"] [data-testid=\"agentic-history-detail\"]').count(), {
        timeout: 5_000,
      })
      .toBeGreaterThanOrEqual(1);
    await expect
      .poll(() => page.locator('[data-testid="agentic-history-filter-counts"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('total 3');
    await expect
      .poll(() => page.locator('[data-testid="agentic-history-filter-counts"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('aprobados 2');
    await expect
      .poll(() => page.locator('[data-testid="agentic-tool-filter"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('asset.reindex');
    await expect
      .poll(() => page.getByRole('button', { name: /detalle/i }).count(), {
        timeout: 5_000,
      })
      .toBeGreaterThanOrEqual(3);
    await page.getByRole('button', { name: /detalle/i }).nth(2).click();
    await expect
      .poll(() => page.locator('[data-testid="agentic-recommendation-execution-link"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('Cadena recomendación');
    await expect
      .poll(() => page.locator('[data-testid="agentic-recommendation-execution-link"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('Mutación desbloqueada: asset.reindex');
    await expect.poll(() => mutationIndexCalls, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);
    await page.locator('[data-testid="agentic-mutation-index-refresh"]').first().click();
    await expect
      .poll(() => page.locator('[data-testid="agentic-mutation-index-debug"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('scene.analyze:NO_BLOCKING_ISSUE:asset.reindex → tool-approved-reindex → evidence-approved-reindex');
    await expect
      .poll(() => page.locator('[data-testid="agentic-mutation-index-integrity"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('integrity: valid');
    await page.locator('[data-testid="agentic-mutation-index-json"]').first().waitFor({
      state: 'visible',
      timeout: 5_000,
    });
    await page.locator('[data-testid="agentic-mutation-index-markdown"]').first().waitFor({
      state: 'visible',
      timeout: 5_000,
    });
    const [mutationIndexJsonDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('[data-testid="agentic-mutation-index-json"]').first().click(),
    ]);
    const mutationIndexJsonText = await readDownloadText(mutationIndexJsonDownload);
    const mutationIndexJson = JSON.parse(mutationIndexJsonText);
    expect(mutationIndexJsonDownload.suggestedFilename()).toContain(
      'recommendation-mutation-index.json'
    );
    expect(mutationIndexJson.index.checksum).toEqual({
      algorithm: 'sha256',
      value: '2'.repeat(64),
    });
    expect(mutationIndexJson.recommendations[0]).toMatchObject({
      key: 'scene.analyze:NO_BLOCKING_ISSUE:asset.reindex',
      executions: [
        expect.objectContaining({
          executionId: `${metadata.pipelineId}-approved-recommendations`,
          toolCalls: [
            expect.objectContaining({
              toolCallId: 'tool-approved-reindex',
              evidenceIds: ['evidence-approved-reindex'],
            }),
          ],
        }),
      ],
    });
    const [mutationIndexMarkdownDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('[data-testid="agentic-mutation-index-markdown"]').first().click(),
    ]);
    const mutationIndexMarkdown = await readDownloadText(mutationIndexMarkdownDownload);
    expect(mutationIndexMarkdownDownload.suggestedFilename()).toContain(
      'recommendation-mutation-index.md'
    );
    expect(mutationIndexMarkdown).toContain('# Agentic Recommendation Mutation Index');
    expect(mutationIndexMarkdown).toContain(`Checksum: sha256:${'2'.repeat(64)}`);
    expect(mutationIndexMarkdown).toContain(
      'scene.analyze:NO_BLOCKING_ISSUE:asset.reindex -> tool-approved-reindex -> evidence-approved-reindex'
    );
    const [filteredRecommendationJsonDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('[data-testid="agentic-mutation-index-recommendation-json"]').first().click(),
    ]);
    const filteredRecommendationJson = JSON.parse(await readDownloadText(filteredRecommendationJsonDownload));
    expect(filteredRecommendationJson.index.checksum).toEqual({
      algorithm: 'sha256',
      value: '1'.repeat(64),
    });
    expect(filteredRecommendationJson.recommendations.map((item: { key: string }) => item.key)).toEqual([
      'scene.analyze:NO_BLOCKING_ISSUE:asset.reindex',
    ]);
    const [filteredRecommendationMarkdownDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('[data-testid="agentic-mutation-index-recommendation-markdown"]').first().click(),
    ]);
    const filteredRecommendationMarkdown = await readDownloadText(filteredRecommendationMarkdownDownload);
    expect(filteredRecommendationMarkdown).toContain(`Checksum: sha256:${'1'.repeat(64)}`);
    expect(filteredRecommendationMarkdown).toContain(
      'scene.analyze:NO_BLOCKING_ISSUE:asset.reindex -> tool-approved-reindex -> evidence-approved-reindex'
    );
    serverAgenticScenario = {
      page,
      setMutationIndexIntegrityMode: (mode) => {
        mutationIndexIntegrityMode = mode;
      },
      setMutationIndexBehind: (behind) => {
        mutationIndexBehind = behind;
      },
      getMutationIndexRepairCalls: () => mutationIndexRepairCalls,
      getMutationIndexReindexCalls: () => mutationIndexReindexCalls,
      getPendingIndexHistoryCalls: () => pendingIndexHistoryCalls,
      getPartialRollbackCalls: () => partialRollbackCalls,
    };
  }, 220_000);

  it('repairs mutation index integrity and exercises audit export controls', async () => {
    if (!serverAgenticScenario) {
      throw new Error('Server agentic scenario did not run before integrity controls test.');
    }
    const {
      page,
      setMutationIndexIntegrityMode,
      setMutationIndexBehind,
      getMutationIndexRepairCalls,
      getMutationIndexReindexCalls,
      getPendingIndexHistoryCalls,
    } = serverAgenticScenario;

    await page.locator('[data-testid="workspace-switcher-ai"]').first().click();
    await page.locator('[data-testid="agentic-server-history"]').first().waitFor({
      state: 'visible',
      timeout: 30_000,
    });
    if (!(await page.locator('[data-testid="agentic-mutation-index-refresh"]').first().isVisible().catch(() => false))) {
      await page.getByRole('button', { name: /detalle/i }).first().click();
    }
    await page.locator('[data-testid="agentic-mutation-index-refresh"]').first().waitFor({
      state: 'visible',
      timeout: 30_000,
    });

    setMutationIndexIntegrityMode('missing');
    await page.locator('[data-testid="agentic-mutation-index-refresh"]').first().click();
    await expect
      .poll(() => page.locator('[data-testid="agentic-mutation-index-integrity"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('integrity: missing');
    await expect
      .poll(() => page.locator('[data-testid="agentic-mutation-index-recommendation-count"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('recomendaciones: 1');
    await expect
      .poll(() => page.locator('[data-testid="agentic-mutation-index-integrity-alert"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('Índice incompleto: checksum ausente');
    await expect
      .poll(() => page.locator('[data-testid="agentic-mutation-index-repair"]').first().isVisible(), {
        timeout: 5_000,
      })
      .toBe(true);
    expect(getMutationIndexRepairCalls()).toBe(0);
    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('missing');
      await dialog.accept();
    });
    await page.locator('[data-testid="agentic-mutation-index-repair"]').first().click();
    await expect.poll(() => getMutationIndexRepairCalls(), { timeout: 5_000 }).toBe(1);
    await expect
      .poll(() => page.locator('[data-testid="agentic-mutation-index-integrity"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('integrity: valid');
    await expect
      .poll(() => page.locator('[data-testid="agentic-mutation-index-integrity-alert"]').count(), {
        timeout: 5_000,
      })
      .toBe(0);
    await page.locator('[data-testid="agentic-mutation-index-audit-toggle"]').first().click();
    await expect
      .poll(() => page.locator('[data-testid="agentic-mutation-index-audit-panel"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('Auditoría integridad');
    await expect
      .poll(() => page.locator('[data-testid="agentic-mutation-index-audit-panel"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('mutation-index-repair-browser-e2e');
    setMutationIndexIntegrityMode('mismatch');
    await page.locator('[data-testid="agentic-mutation-index-refresh"]').first().click();
    await expect
      .poll(() => page.locator('[data-testid="agentic-mutation-index-integrity"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('integrity: mismatch');
    await expect
      .poll(() => page.locator('[data-testid="agentic-global-mutation-index-integrity-alert"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('índice mismatch');
    await expect
      .poll(() => page.locator('[data-testid="agentic-mutation-index-integrity-alert"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('Índice corrupto: checksum no coincide');
    await expect
      .poll(() => page.locator('[data-testid="agentic-mutation-index-export-block-reason"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('Export bloqueado: checksum mismatch');
    await expect
      .poll(() => page.locator('[data-testid="agentic-mutation-index-json"]').first().isDisabled(), {
        timeout: 5_000,
      })
      .toBe(true);
    await expect
      .poll(() => page.locator('[data-testid="agentic-mutation-index-markdown"]').first().isDisabled(), {
        timeout: 5_000,
      })
      .toBe(true);
    await expect
      .poll(() => page.locator('[data-testid="agentic-mutation-index-audit-panel"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('previous stored none');
    const [auditJsonDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('[data-testid="agentic-mutation-index-audit-json"]').first().click(),
    ]);
    const auditJson = JSON.parse(await readDownloadText(auditJsonDownload));
    expect(auditJsonDownload.suggestedFilename()).toContain(
      'recommendation-mutation-index-audit.json'
    );
    expect(auditJson).toMatchObject({
      kind: 'agentic_recommendation_mutation_index_audit',
      recommendationCount: 1,
      index: {
        recommendationCount: 1,
        checksumValid: false,
        checksumStatus: 'mismatch',
      },
      integrityAuditCount: 1,
    });
    expect(auditJson).not.toHaveProperty('recommendations');
    const [auditMarkdownDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('[data-testid="agentic-mutation-index-audit-markdown"]').first().click(),
    ]);
    const auditMarkdown = await readDownloadText(auditMarkdownDownload);
    expect(auditMarkdownDownload.suggestedFilename()).toContain(
      'recommendation-mutation-index-audit.md'
    );
    expect(auditMarkdown).toContain('# Agentic Recommendation Mutation Index Audit');
    expect(auditMarkdown).toContain('Recommendation Count: 1');
    expect(auditMarkdown).toContain('Checksum Valid: no (mismatch)');
    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('mismatch');
      await dialog.accept();
    });
    await page.locator('[data-testid="agentic-mutation-index-repair"]').first().click();
    await expect.poll(() => getMutationIndexRepairCalls(), { timeout: 5_000 }).toBe(2);
    await expect
      .poll(() => page.locator('[data-testid="agentic-mutation-index-integrity"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('integrity: valid');
    await expect
      .poll(() => page.locator('[data-testid="agentic-mutation-index-json"]').first().isEnabled(), {
        timeout: 5_000,
      })
      .toBe(true);
    await expect
      .poll(() => page.locator('[data-testid="agentic-mutation-index-audit-panel"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('previous stored 2222222222...222222');
    await expect
      .poll(() => page.locator('[data-testid="agentic-history-mutation-index-audit-summary"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('reparaciones: 2');
    setMutationIndexBehind(true);
    await page.locator('[data-testid="agentic-mutation-index-refresh"]').first().click();
    await expect
      .poll(() => page.locator('[data-testid="agentic-mutation-index-behind"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('atrasado: sí');
    await expect
      .poll(() => page.locator('[data-testid="agentic-history-mutation-index-behind-badge"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('behind · pendientes: 1');
    await expect
      .poll(() => page.locator('[data-testid="agentic-history-mutation-index-pending-ids"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('pipeline-browser-server-agentic-approved-recommendations');
    await expect
      .poll(() => page.locator('[data-testid="agentic-history-filters"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('Pendientes index');
    await page.getByRole('button', { name: 'Pendientes index' }).click();
    await expect.poll(() => getPendingIndexHistoryCalls(), { timeout: 5_000 }).toBeGreaterThanOrEqual(1);
    await expect
      .poll(() => page.locator('[data-testid="agentic-server-history"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('pipeline-browser-server-agentic-approved-recommendations');
    await page.locator('[data-testid="agentic-pending-index-reindex-row"]').first().waitFor({
      state: 'visible',
      timeout: 5_000,
    });
    if (!(await page.locator('[data-testid="agentic-mutation-index-behind-alert"]').first().isVisible().catch(() => false))) {
      await page.getByRole('button', { name: /detalle/i }).first().click();
    }
    await expect
      .poll(() => page.locator('[data-testid="agentic-mutation-index-behind-alert"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('Índice atrasado');
    await expect
      .poll(() => page.locator('[data-testid="agentic-mutation-index-behind-alert"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('pendientes=1');
    await expect
      .poll(() => page.locator('[data-testid="agentic-mutation-index-export-block-reason"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('índice atrasado');
    await expect
      .poll(() => page.locator('[data-testid="agentic-mutation-index-json"]').first().isDisabled(), {
        timeout: 5_000,
      })
      .toBe(true);
    await expect
      .poll(() => page.locator('[data-testid="agentic-history-replay"]').first().isDisabled(), {
        timeout: 5_000,
      })
      .toBe(true);
    expect(getMutationIndexReindexCalls()).toBe(0);
    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('Reindexar solo esta ejecución pendiente');
      await dialog.accept();
    });
    await page.locator('[data-testid="agentic-pending-index-reindex-row"]').first().click();
    await expect.poll(() => getMutationIndexReindexCalls(), { timeout: 5_000 }).toBe(1);
    await page.locator('[data-testid="agentic-history-filters"]').getByRole('button', { name: 'Todo' }).click();
    await expect
      .poll(() => page.locator('[data-testid="agentic-server-history"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('pipeline-browser-server-agentic');
    const approvedHistoryRow = page
      .locator(
        '[data-testid="agentic-history-row"][data-agentic-execution-id="pipeline-browser-server-agentic-approved-recommendations"]'
      )
      .first();
    await approvedHistoryRow.waitFor({ state: 'visible', timeout: 5_000 });
    if (!(await approvedHistoryRow.locator('[data-testid="agentic-mutation-index-behind"]').isVisible().catch(() => false))) {
      await approvedHistoryRow.getByRole('button', { name: /detalle/i }).click();
    }
    await expect
      .poll(() => approvedHistoryRow.locator('[data-testid="agentic-mutation-index-behind"]').textContent(), {
        timeout: 5_000,
      })
      .toContain('atrasado: no');
    await expect
      .poll(() => page.locator('[data-testid="agentic-mutation-index-json"]').first().isEnabled(), {
        timeout: 5_000,
      })
      .toBe(true);
    await expect
      .poll(() => page.locator('[data-testid="agentic-history-mutation-index-audit-summary"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('reparaciones: 3');
    if (!(await approvedHistoryRow.locator('[data-testid="agentic-mutation-index-audit-panel"]').isVisible().catch(() => false))) {
      await approvedHistoryRow.locator('[data-testid="agentic-mutation-index-audit-toggle"]').click();
    }
    await expect
      .poll(() => approvedHistoryRow.locator('[data-testid="agentic-mutation-index-audit-counters"]').textContent(), {
        timeout: 5_000,
      })
      .toContain('checksum 2');
    await expect
      .poll(() => approvedHistoryRow.locator('[data-testid="agentic-mutation-index-audit-counters"]').textContent(), {
        timeout: 5_000,
      })
      .toContain('history_reindexed_partial 1');
    await approvedHistoryRow.locator('[data-testid="agentic-mutation-index-audit-filter-history_reindexed_full"]').click();
    await expect
      .poll(() => approvedHistoryRow.locator('[data-testid="agentic-mutation-index-audit-panel"]').textContent(), {
        timeout: 5_000,
      })
      .toContain('Sin eventos para este filtro de auditoría.');
    await approvedHistoryRow.locator('[data-testid="agentic-mutation-index-audit-filter-history_reindexed_partial"]').click();
    await expect
      .poll(() => approvedHistoryRow.locator('[data-testid="agentic-mutation-index-audit-panel"]').textContent(), {
        timeout: 5_000,
      })
      .toContain('history_reindexed_partial');
    const [filteredAuditJsonDownload] = await Promise.all([
      page.waitForEvent('download'),
      approvedHistoryRow.locator('[data-testid="agentic-mutation-index-audit-filtered-json"]').click(),
    ]);
    const filteredAuditJson = JSON.parse(await readDownloadText(filteredAuditJsonDownload));
    expect(filteredAuditJsonDownload.suggestedFilename()).toContain(
      'mutation-index-audit-history_reindexed_partial.json'
    );
    expect(filteredAuditJson).toMatchObject({
      kind: 'agentic_recommendation_mutation_index_audit_filtered',
      actionFilter: 'history_reindexed_partial',
      filteredAuditCount: 1,
    });
    expect(filteredAuditJson.integrityAuditTrail[0]).toMatchObject({
      action: 'history_reindexed_partial',
    });
    const [filteredAuditMarkdownDownload] = await Promise.all([
      page.waitForEvent('download'),
      approvedHistoryRow.locator('[data-testid="agentic-mutation-index-audit-filtered-markdown"]').click(),
    ]);
    const filteredAuditMarkdown = await readDownloadText(filteredAuditMarkdownDownload);
    expect(filteredAuditMarkdownDownload.suggestedFilename()).toContain(
      'mutation-index-audit-history_reindexed_partial.md'
    );
    expect(filteredAuditMarkdown).toContain('# Agentic Mutation Index Audit Filter');
    expect(filteredAuditMarkdown).toContain('Action Filter: history_reindexed_partial');
    expect(filteredAuditMarkdown).toContain('- action: history_reindexed_partial');
  }, 220_000);

  it('exercises approved recommendation rollback and history controls', async () => {
    if (!serverAgenticScenario) {
      throw new Error('Server agentic scenario did not run before rollback controls test.');
    }
    const { page, getPartialRollbackCalls } = serverAgenticScenario;

    await page.locator('[data-testid="agentic-partial-recommendation-rollback-item"]').first().waitFor({
      state: 'visible',
      timeout: 30_000,
    });
    await page.locator('[data-testid="agentic-partial-recommendation-rollback-item"]').first().click();
    await expect.poll(() => getPartialRollbackCalls(), { timeout: 5_000 }).toBe(1);
    await expect
      .poll(() => page.locator('[data-testid="agentic-recommendation-execution-link"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('rollback parcial aplicado');
    await page.getByRole('button', { name: /detalle/i }).nth(0).click();
    await page.locator('[data-testid="agentic-recommendation-reject"]').first().click();
    await expect
      .poll(() => page.locator('[data-testid="agentic-shared-memory-recommendations"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('rejected');
    await expect
      .poll(() => page.locator('[data-testid="agentic-timeline-tool-diff"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('Diff raw tool call');
    await expect
      .poll(() => page.locator('[data-testid="agentic-timeline-tool-diff"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('Transform added to Agentic Export Camera');
    await expect
      .poll(() => page.locator('[data-testid="agentic-tool-mutates-world-badge"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('mutates world');
    await expect
      .poll(() => page.locator('[data-testid="agentic-before-after-side-by-side"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('Before');
    await expect
      .poll(() => page.locator('[data-testid="agentic-before-after-side-by-side"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('After');
    await expect
      .poll(() => page.locator('[data-testid="agentic-tool-raw-io"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('Input/output raw');
    await expect
      .poll(() => page.locator('[data-testid="agentic-tool-raw-io"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('"target": "web"');
    await page.locator('[data-testid="agentic-timeline-mutation-filter"]').first().selectOption('readonly');
    await expect
      .poll(() => page.locator('[data-testid="agentic-tool-mutates-world-badge"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('read only');
    await page.locator('[data-testid="agentic-timeline-mutation-filter"]').first().selectOption('mutating');
    await expect
      .poll(() => page.locator('[data-testid="agentic-tool-mutates-world-badge"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('mutates world');
    await page.locator('[data-testid="agentic-timeline-mutation-filter"]').first().selectOption('all');
    await expect
      .poll(() => page.locator('[data-testid="agentic-history-diff"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('entities: 0 → 2 (+2)');
    await expect
      .poll(() => page.locator('[data-testid="agentic-history-diff"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('Transform agregado en Agentic Export Camera');
    await expect
      .poll(() => page.locator('[data-testid="agentic-history-diff"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('Transform.position: (missing) -> {"x":0,"y":2,"z":6}');
    await page.locator('[data-testid="agentic-compare-toggle"]').nth(0).click();
    await expect
      .poll(() => page.locator('[data-testid="agentic-execution-comparison"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('selecciona 1');
    await page.locator('[data-testid="agentic-compare-toggle"]').nth(1).click();
    await expect
      .poll(() => page.locator('[data-testid="agentic-execution-comparison"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('Comparación');
    await expect
      .poll(() => page.locator('[data-testid="agentic-execution-comparison"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('Agentes nuevos: lighting_environment');
    await page.locator('[data-testid="agentic-comparison-json"]').first().waitFor({
      state: 'visible',
      timeout: 5_000,
    });
    await page.locator('[data-testid="agentic-comparison-markdown"]').first().waitFor({
      state: 'visible',
      timeout: 5_000,
    });
    await page.locator('[data-testid="agentic-trace-event-filter"]').fill('tool.completed');
    await page.locator('[data-testid="agentic-trace-actor-filter"]').fill('technical_integration');
    await page.locator('[data-testid="agentic-trace-severity-filter"]').selectOption('info');
    await expect
      .poll(() => page.locator('[data-testid="agentic-history-pagination"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('1-1 de 1');
    await page.locator('[data-testid="agentic-history-search-input"]').fill('technical_integration');
    await page
      .locator('[data-testid="agentic-history-search"]')
      .getByRole('button', { name: /buscar/i })
      .click();
    await expect
      .poll(() => page.locator('[data-testid="agentic-history-pagination"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('1-1 de 1');
    await page.locator('[data-testid="agentic-tool-filter"]').selectOption('build.export');
    await page.locator('[data-testid="agentic-agent-filter"]').selectOption('technical_integration');
    await expect
      .poll(() => page.locator('[data-testid="agentic-server-history"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('exporta esta escena para web');
    await page.getByRole('button', { name: /replay/i }).first().click();
    await expect
      .poll(() => page.locator('[data-testid="agentic-server-history"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('Sin ejecuciones para este filtro');
    await page.getByRole('button', { name: /^Rollback/i }).first().click();
    await expect
      .poll(() => page.locator('[data-testid="agentic-server-history"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('exporta esta escena para web');
    await page.getByTitle('Restaurar estado anterior').first().click();
    await expect
      .poll(() => page.locator('[data-testid="agentic-rollback-confirmation"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('Confirmar rollback agentic');
    await expect
      .poll(() => page.locator('[data-testid="agentic-rollback-preview"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('Se eliminará: Agentic Export Camera, Agentic Export Player');
    await expect
      .poll(() => page.locator('[data-testid="agentic-rollback-field-preview"]').first().textContent(), {
        timeout: 5_000,
      })
      .toContain('Agentic Export Camera.Transform.position: {"x":0,"y":2,"z":6} -> (missing)');
    await page.getByRole('button', { name: /cancelar/i }).click();
  }, 320_000);

  it('shows the shell mutation index corruption indicator outside the chat', async () => {
    if (!server || !browser) {
      throw new Error('Browser e2e server did not start.');
    }

    const page = await browser.newPage();
    await page.addInitScript(() => {
      window.localStorage.setItem('rey30.agentic.serverExecution', 'true');
    });
    await page.route('**/api/auth/session', (route) =>
      fulfillJson(route, {
        authenticated: false,
        editorAccess: {
          shellMode: 'product',
          permissions: {
            advancedShell: false,
            admin: false,
            compile: false,
            advancedWorkspaces: false,
            debugTools: false,
            editorSessionBridge: false,
            terminalActions: false,
          },
        },
      })
    );
    await page.route('**/api/agentic**', async (route) => {
      const requestUrl = new URL(route.request().url());
      if (requestUrl.pathname.includes('/api/agentic/mutation-index/status')) {
        await fulfillJson(route, {
          success: true,
          projectKey: 'untitled_project',
          slot: 'editor_project_current',
          checkedAt: '2026-04-16T00:03:00.000Z',
          recommendationCount: 0,
          lastIndexedExecutionId: null,
          latestIndexableExecutionId: null,
          pendingIndexableExecutionCount: 0,
          pendingIndexableExecutionIds: [],
          indexBehind: false,
          mutationIndexAudit: {
            repairCount: 0,
            latestRepairId: null,
            latestRepairAt: null,
            integrityStatus: 'mismatch',
            integrityValid: false,
            recommendationCount: 0,
            lastIndexedExecutionId: null,
            latestIndexableExecutionId: null,
            pendingIndexableExecutionCount: 0,
            pendingIndexableExecutionIds: [],
            indexBehind: false,
          },
          integrity: {
            valid: false,
            status: 'mismatch',
            stored: {
              algorithm: 'sha256',
              value: '2'.repeat(64),
              updatedAt: '2026-04-16T00:02:01.000Z',
            },
            computed: {
              algorithm: 'sha256',
              value: '4'.repeat(64),
            },
          },
        });
        return;
      }
      if (requestUrl.pathname.includes('/api/agentic/recommendations/mutation-index')) {
        await fulfillJson(route, {
          success: true,
          projectKey: 'untitled_project',
          slot: 'editor_project_current',
          index: {
            version: 1,
            projectKey: 'untitled_project',
            slot: 'editor_project_current',
            updatedAt: '2026-04-16T00:02:01.000Z',
            checksum: {
              algorithm: 'sha256',
              value: '2'.repeat(64),
              updatedAt: '2026-04-16T00:02:01.000Z',
            },
            integrityAuditTrail: [],
            recommendations: {},
          },
          integrity: {
            valid: false,
            status: 'mismatch',
            stored: {
              algorithm: 'sha256',
              value: '2'.repeat(64),
              updatedAt: '2026-04-16T00:02:01.000Z',
            },
            computed: {
              algorithm: 'sha256',
              value: '4'.repeat(64),
            },
          },
        });
        return;
      }

      await fulfillJson(route, {
        success: true,
        projectKey: 'untitled_project',
        slot: 'editor_project_current',
        history: [],
        mutationIndexAudit: {
          repairCount: 0,
          latestRepairId: null,
          latestRepairAt: null,
          integrityStatus: 'mismatch',
          integrityValid: false,
          recommendationCount: 0,
          lastIndexedExecutionId: null,
          latestIndexableExecutionId: null,
          pendingIndexableExecutionCount: 0,
          pendingIndexableExecutionIds: [],
          indexBehind: false,
        },
        pagination: {
          limit: 1,
          offset: 0,
          totalRecords: 0,
          filteredRecords: 0,
          hasPrevious: false,
          hasNext: false,
          search: '',
          traceEvent: '',
          traceActor: '',
          traceSeverity: '',
        },
      });
    });

    await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-testid="workspace-switcher-scene"]').first().click({ timeout: 120_000 });
    await expect
      .poll(() => page.locator('[data-testid="agentic-shell-mutation-index-integrity-alert"]').first().textContent(), {
        timeout: 10_000,
      })
      .toContain('Índice mismatch');
    await expect
      .poll(() => page.locator('[data-testid="agentic-statusbar-mutation-index-integrity-alert"]').first().textContent(), {
        timeout: 10_000,
      })
      .toContain('Agentic Index');
    await expect
      .poll(() => page.locator('[data-testid="agentic-statusbar-mutation-index-integrity-alert"]').first().textContent(), {
        timeout: 10_000,
      })
      .toContain('mismatch');
    await expect
      .poll(() => page.locator('[data-testid="agentic-global-mutation-index-integrity-alert"]').count(), {
        timeout: 5_000,
      })
      .toBe(0);
    await page.close();
  }, 180_000);
});
