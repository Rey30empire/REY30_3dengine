import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import {
  createEditorProjectSaveData,
  restoreEditorProjectSaveData,
  type EditorProjectSaveState,
} from '@/engine/serialization';
import { resolveAdvancedLightingSettings, type Entity } from '@/types/engine';
import { createDefaultAutomationPermissions, createDefaultEditorState } from '@/store/editorStore.utils';
import { useEngineStore } from '@/store/editorStore';
import {
  buildEditorProjectRecord,
  readEditorProjectRecord,
  writeEditorProjectRecord,
} from '@/lib/server/editor-project-storage';
import { GET, PATCH, POST } from '@/app/api/agentic/route';
import { PATCH as PATCH_RECOMMENDATION } from '@/app/api/agentic/recommendations/[id]/route';
import { POST as POST_EXECUTE_APPROVED } from '@/app/api/agentic/recommendations/execute-approved/route';
import {
  GET as GET_MUTATION_INDEX,
  POST as POST_MUTATION_INDEX,
} from '@/app/api/agentic/recommendations/mutation-index/route';
import { GET as GET_MUTATION_INDEX_STATUS } from '@/app/api/agentic/mutation-index/status/route';
import { POST as POST_MUTATION_INDEX_REINDEX } from '@/app/api/agentic/mutation-index/reindex/route';
import { GET as GET_MUTATION_INDEX_EXPORT } from '@/app/api/agentic/recommendations/mutation-index/export/route';
import { POST as POST_ROLLBACK_APPROVED } from '@/app/api/agentic/recommendations/rollback-approved/route';
import {
  appendAgenticExecutionHistoryRecord,
  readAgenticRecommendationMutationIndex,
  writeAgenticRecommendationMutationIndexEntry,
  type AgenticExecutionHistoryRecord,
} from '@/lib/server/agentic-execution-history';
import { findRollbackTargetContractFailures } from '@/lib/server/agentic-approved-recommendation-execution';

const { requireSessionMock } = vi.hoisted(() => ({
  requireSessionMock: vi.fn(),
}));

vi.mock('@/lib/security/auth', () => ({
  requireSession: requireSessionMock,
  authErrorToResponse: (error: unknown) =>
    Response.json(
      {
        error: String(error).includes('FORBIDDEN')
          ? 'No tienes permisos para esta acción.'
          : 'Debes iniciar sesión o usar un token de acceso.',
      },
      { status: String(error).includes('FORBIDDEN') ? 403 : 401 }
    ),
}));

const USER_ID = 'agentic-route-user';
const PROJECT_KEY = 'agentic_route_project';
const SLOT = 'agentic-route-slot';
const ORIGINAL_PROJECT_ROOT = process.env.REY30_EDITOR_PROJECT_ROOT;
const ORIGINAL_BUILD_ROOT = process.env.REY30_BUILD_ROOT;
const ORIGINAL_HISTORY_ROOT = process.env.REY30_AGENTIC_HISTORY_ROOT;

let projectRoot = '';
let buildRoot = '';
let historyRoot = '';

function resetEditorStore() {
  useEngineStore.setState({
    projectName: 'Agentic Route Project',
    projectPath: '',
    isDirty: false,
    scenes: [],
    activeSceneId: null,
    entities: new Map(),
    assets: [],
    historyPast: [],
    historyFuture: [],
    lastBuildReport: null,
    buildManifest: null,
    lastCompileSummary: '',
    scribProfiles: new Map(),
    activeScribEntityId: null,
    scribInstances: new Map(),
    agenticMutationIndexAudit: null,
  });
}

function createProjectState(projectName = 'Agentic Route Project'): EditorProjectSaveState {
  return {
    projectName,
    projectPath: `C:/Projects/${projectName.replace(/\s+/g, '')}`,
    isDirty: false,
    scenes: [
      {
        id: 'scene-agentic-route',
        name: 'Agentic Route Scene',
        entities: [],
        rootEntities: [],
        collections: [],
        environment: {
          skybox: 'studio',
          ambientLight: { r: 0.5, g: 0.5, b: 0.5, a: 1 },
          ambientIntensity: 1,
          environmentIntensity: 1,
          environmentRotation: 0,
          directionalLightIntensity: 1.2,
          directionalLightAzimuth: 45,
          directionalLightElevation: 55,
          advancedLighting: resolveAdvancedLightingSettings(),
          fog: null,
          postProcessing: {
            bloom: { enabled: false, intensity: 0.5, threshold: 0.8, radius: 0.5 },
            ssao: { enabled: false, radius: 0.5, intensity: 1, bias: 0.025 },
            ssr: { enabled: false, intensity: 0.5, maxDistance: 100 },
            colorGrading: {
              enabled: false,
              exposure: 1,
              contrast: 1,
              saturation: 1,
              gamma: 2.2,
              toneMapping: 'aces',
              rendererExposure: 1,
            },
            vignette: { enabled: false, intensity: 0.5, smoothness: 0.5, roundness: 1 },
          },
        },
        createdAt: new Date('2026-04-16T00:00:00.000Z'),
        updatedAt: new Date('2026-04-16T00:00:00.000Z'),
      },
    ],
    activeSceneId: 'scene-agentic-route',
    entities: new Map(),
    assets: [],
    engineMode: 'MODE_AI_FIRST',
    aiMode: 'LOCAL',
    aiEnabled: true,
    editor: createDefaultEditorState(),
    automationPermissions: createDefaultAutomationPermissions(),
    profiler: {
      fps: 60,
      frameTime: 16.67,
      cpuTime: 0,
      gpuTime: 0,
      memory: {
        used: 0,
        allocated: 0,
        textures: 0,
        meshes: 0,
        audio: 0,
      },
      drawCalls: 0,
      triangles: 0,
      vertices: 0,
    },
    scribProfiles: new Map(),
    activeScribEntityId: null,
    scribInstances: new Map(),
  };
}

async function seedMismatchedRecommendationMutationIndex(params?: {
  recommendationKey?: string;
  summary?: string;
  corruptedSummary?: string;
}) {
  const recommendationKey = params?.recommendationKey ?? 'scene.analyze:CORRUPT_INDEX:asset.reindex';
  writeAgenticRecommendationMutationIndexEntry({
    userId: USER_ID,
    projectKey: PROJECT_KEY,
    slot: SLOT,
    executionId: 'pipeline-corrupt-index-execution',
    sourceExecutionId: 'pipeline-corrupt-index-source',
    recommendationId: 'recommendation-corrupt-index',
    recommendationKey,
    summary: params?.summary ?? 'Original indexed summary.',
    toolCalls: [
      {
        toolCallId: 'tool-corrupt-index',
        toolName: 'asset.reindex',
        evidenceIds: ['evidence-corrupt-index'],
        targetIds: ['asset-corrupt-index'],
      },
    ],
  });
  const indexPath = path.join(
    historyRoot,
    USER_ID,
    PROJECT_KEY,
    `${SLOT}.recommendation-mutation-index.json`
  );
  const rawIndex = JSON.parse(await readFile(indexPath, 'utf-8')) as {
    recommendations: Record<string, { summary: string }>;
  };
  rawIndex.recommendations[recommendationKey].summary =
    params?.corruptedSummary ?? 'Manual edit after checksum was persisted.';
  await writeFile(indexPath, JSON.stringify(rawIndex, null, 2), 'utf-8');

  return {
    indexPath,
    recommendationKey,
  };
}

function createApprovedRecommendationHistoryRecord(params: {
  id: string;
  sourceExecutionId: string;
  recommendationId: string;
  recommendationKey: string;
  toolCallId: string;
  evidenceId: string;
  targetId: string;
}): AgenticExecutionHistoryRecord {
  return {
    id: params.id,
    userId: USER_ID,
    projectKey: PROJECT_KEY,
    slot: SLOT,
    prompt: 'ejecuta recomendaciones aprobadas',
    approved: true,
    status: 'approved',
    iteration: 1,
    createdAt: '2026-04-16T00:00:00.000Z',
    completedAt: '2026-04-16T00:00:01.000Z',
    artifactPath: null,
    runtimeScaffold: null,
    validation: {
      approved: true,
      confidence: 1,
      matchedRequirements: ['recommendation.approved_execution'],
      missingRequirements: [],
      incorrectOutputs: [],
      retryInstructions: [],
    },
    toolNames: ['asset.reindex'],
    agentRoles: ['maintenance'],
    steps: [
      {
        id: `step-${params.id}`,
        title: 'Execute approved recommendation',
        agentRole: 'maintenance',
        status: 'completed',
        evidenceCount: 1,
        errorCount: 0,
      },
    ],
    toolStats: [{ name: 'asset.reindex', successCount: 1, failureCount: 0 }],
    traces: [],
    sharedMemory: {
      analyses: [],
      actionableRecommendations: [],
    },
    toolCalls: [],
    stepCount: 1,
    action: 'approved_recommendations',
    sourceExecutionId: params.sourceExecutionId,
    recommendationExecution: {
      sourceExecutionId: params.sourceExecutionId,
      recommendationIds: [params.recommendationId],
      recommendationKeys: [params.recommendationKey],
      recommendations: [
        {
          id: params.recommendationId,
          approvalKey: params.recommendationKey,
          summary: 'Approved recommendation history record.',
        },
      ],
      unlockedMutations: [
        {
          toolCallId: params.toolCallId,
          toolName: 'asset.reindex',
          stepId: `step-${params.id}`,
          recommendationIds: [params.recommendationId],
          recommendationKeys: [params.recommendationKey],
          evidenceIds: [params.evidenceId],
          targets: [
            {
              id: params.targetId,
              type: 'asset',
              summary: 'Rollbackable indexed asset target.',
            },
          ],
        },
      ],
      partialRollback: {
        available: true,
        applied: false,
        appliedAt: null,
        recommendationIds: [params.recommendationId],
        recommendationKeys: [params.recommendationKey],
        toolCallIds: [params.toolCallId],
        targetIds: [params.targetId],
      },
    },
    snapshots: {
      before: false,
      after: false,
    },
    diff: null,
  };
}

function seedBehindRecommendationMutationIndex() {
  const indexedRecommendationKey = 'scene.analyze:INDEXED_OLD:asset.reindex';
  const unindexedRecommendationKey = 'scene.analyze:UNINDEXED_NEW:asset.reindex';
  writeAgenticRecommendationMutationIndexEntry({
    userId: USER_ID,
    projectKey: PROJECT_KEY,
    slot: SLOT,
    executionId: 'pipeline-indexed-approved-old',
    sourceExecutionId: 'pipeline-indexed-source-old',
    recommendationId: 'recommendation-indexed-old',
    recommendationKey: indexedRecommendationKey,
    summary: 'Old indexed recommendation.',
    toolCalls: [
      {
        toolCallId: 'tool-indexed-old',
        toolName: 'asset.reindex',
        evidenceIds: ['evidence-indexed-old'],
        targetIds: ['asset-indexed-old'],
      },
    ],
  });
  appendAgenticExecutionHistoryRecord(
    createApprovedRecommendationHistoryRecord({
      id: 'pipeline-indexed-approved-old',
      sourceExecutionId: 'pipeline-indexed-source-old',
      recommendationId: 'recommendation-indexed-old',
      recommendationKey: indexedRecommendationKey,
      toolCallId: 'tool-indexed-old',
      evidenceId: 'evidence-indexed-old',
      targetId: 'asset-indexed-old',
    })
  );
  appendAgenticExecutionHistoryRecord(
    createApprovedRecommendationHistoryRecord({
      id: 'pipeline-approved-new-unindexed',
      sourceExecutionId: 'pipeline-approved-source-new',
      recommendationId: 'recommendation-new-unindexed',
      recommendationKey: unindexedRecommendationKey,
      toolCallId: 'tool-new-unindexed',
      evidenceId: 'evidence-new-unindexed',
      targetId: 'asset-new-unindexed',
    })
  );

  return {
    indexedRecommendationKey,
    unindexedRecommendationKey,
    indexedExecutionId: 'pipeline-indexed-approved-old',
    unindexedExecutionId: 'pipeline-approved-new-unindexed',
  };
}

describe('agentic route', () => {
  beforeEach(async () => {
    resetEditorStore();
    vi.clearAllMocks();
    requireSessionMock.mockResolvedValue({
      id: USER_ID,
      role: 'EDITOR',
      email: 'agentic-route@example.com',
      sessionId: 'agentic-route-session',
    });
    projectRoot = await mkdtemp(path.join(os.tmpdir(), 'rey30-agentic-projects-'));
    buildRoot = await mkdtemp(path.join(os.tmpdir(), 'rey30-agentic-builds-'));
    historyRoot = await mkdtemp(path.join(os.tmpdir(), 'rey30-agentic-history-'));
    process.env.REY30_EDITOR_PROJECT_ROOT = projectRoot;
    process.env.REY30_BUILD_ROOT = buildRoot;
    process.env.REY30_AGENTIC_HISTORY_ROOT = historyRoot;
  });

  afterEach(async () => {
    if (ORIGINAL_PROJECT_ROOT === undefined) {
      delete process.env.REY30_EDITOR_PROJECT_ROOT;
    } else {
      process.env.REY30_EDITOR_PROJECT_ROOT = ORIGINAL_PROJECT_ROOT;
    }
    if (ORIGINAL_BUILD_ROOT === undefined) {
      delete process.env.REY30_BUILD_ROOT;
    } else {
      process.env.REY30_BUILD_ROOT = ORIGINAL_BUILD_ROOT;
    }
    if (ORIGINAL_HISTORY_ROOT === undefined) {
      delete process.env.REY30_AGENTIC_HISTORY_ROOT;
    } else {
      process.env.REY30_AGENTIC_HISTORY_ROOT = ORIGINAL_HISTORY_ROOT;
    }
    await rm(projectRoot, { recursive: true, force: true });
    await rm(buildRoot, { recursive: true, force: true });
    await rm(historyRoot, { recursive: true, force: true });
  });

  it('loads a remote editor save, runs local agentic export, validates the artifact and persists the mutated project', async () => {
    useEngineStore.setState({
      projectName: 'Global Store Must Not Be Mutated',
      scenes: [],
      activeSceneId: null,
      entities: new Map(),
      assets: [],
    });
    const saveData = createEditorProjectSaveData(createProjectState(), { markClean: true });
    writeEditorProjectRecord(
      buildEditorProjectRecord({
        userId: USER_ID,
        projectKey: PROJECT_KEY,
        slot: SLOT,
        saveData,
      })
    );

    const response = await POST(
      new NextRequest(`http://localhost/api/agentic?slot=${SLOT}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-rey30-project': PROJECT_KEY,
        },
        body: JSON.stringify({
          prompt: 'exporta esta escena para web',
          maxIterations: 1,
        }),
      })
    );
    const payload = await response.json();
    const artifactPath = payload.pipeline?.artifactPath;
    const stored = readEditorProjectRecord({
      userId: USER_ID,
      projectKey: PROJECT_KEY,
      slot: SLOT,
    });
    const restored = stored ? restoreEditorProjectSaveData(stored.saveData) : null;
    const storedEntities = restored ? Array.from(restored.entities.values()) : [];

    expect(response.status).toBe(200);
    expect(payload.approved).toBe(true);
    expect(payload.persisted).toBe(true);
    expect(payload.pipeline.validation.matchedRequirements).toContain('build.export');
    expect(payload.pipeline.validation.matchedRequirements).toContain('build.artifact.physical');
    expect(payload.pipeline.runtimeScaffold).toMatchObject({
      createdCamera: true,
      createdPlayer: true,
      sourceTool: 'build.export',
    });
    expect(typeof artifactPath).toBe('string');
    expect(artifactPath).toMatch(/\.zip$/);
    expect((await readFile(path.resolve(process.cwd(), artifactPath))).byteLength).toBeGreaterThan(0);
    expect(storedEntities.some((entity) => entity.name === 'Agentic Export Camera')).toBe(true);
    expect(storedEntities.some((entity) => entity.name === 'Agentic Export Player')).toBe(true);
    expect(useEngineStore.getState().projectName).toBe('Global Store Must Not Be Mutated');
    expect(useEngineStore.getState().entities.size).toBe(0);

    const historyResponse = await GET(
      new NextRequest(`http://localhost/api/agentic?slot=${SLOT}&projectKey=${PROJECT_KEY}&limit=5`, {
        method: 'GET',
      })
    );
    const historyPayload = await historyResponse.json();

    expect(historyResponse.status).toBe(200);
    expect(historyPayload.success).toBe(true);
    expect(historyPayload.history).toHaveLength(1);
    expect(historyPayload.history[0]).toMatchObject({
      projectKey: PROJECT_KEY,
      slot: SLOT,
      prompt: 'exporta esta escena para web',
      approved: true,
      artifactPath,
      action: 'run',
      sourceExecutionId: null,
      snapshots: {
        before: true,
        after: true,
      },
      stepCount: expect.any(Number),
    });
    expect(historyPayload.history[0].toolNames).toContain('build.export');
    expect(historyPayload.history[0].agentRoles).toContain('technical_integration');
    expect(historyPayload.history[0].steps[0]).toMatchObject({
      agentRole: 'technical_integration',
      status: 'completed',
    });
    expect(
      historyPayload.history[0].toolStats.find((tool: { name: string }) => tool.name === 'build.export')
    ).toMatchObject({
      name: 'build.export',
      successCount: 1,
    });
    expect(historyPayload.history[0].traces.length).toBeGreaterThan(0);
    expect(historyPayload.history[0].traces.map((trace: { eventType: string }) => trace.eventType)).toEqual(
      expect.arrayContaining([expect.stringContaining('tool')])
    );
    expect(historyPayload.history[0].toolCalls.length).toBeGreaterThan(0);
    expect(historyPayload.history[0].toolCalls[0].evidence.length).toBeGreaterThan(0);
    expect(historyPayload.history[0].toolCalls[0].mutatesWorld).toBe(true);
    expect(historyPayload.history[0].toolCalls[0].evidenceContract).toBe('before_after');
    expect(historyPayload.pagination).toMatchObject({
      offset: 0,
      totalRecords: 1,
      filteredRecords: 1,
      hasNext: false,
    });
    expect(historyPayload.filterOptions).toMatchObject({
      tools: expect.arrayContaining(['build.export']),
      agents: expect.arrayContaining(['technical_integration']),
    });
    expect(historyPayload.filterCounts).toMatchObject({
      total: 1,
      approved: 1,
      rejected: 0,
      pendingIndex: 0,
    });
    expect(historyPayload.mutationIndexAudit).toMatchObject({
      repairCount: 0,
      latestRepairId: null,
      latestRepairAt: null,
      integrityStatus: 'valid',
      integrityValid: true,
    });
    expect(historyPayload.history[0].diff).toMatchObject({
      hasChanges: true,
      counts: {
        entities: {
          before: 0,
          after: expect.any(Number),
          delta: expect.any(Number),
        },
      },
    });
    expect(historyPayload.history[0].diff.entities.added.map((item: { name: string }) => item.name)).toEqual(
      expect.arrayContaining(['Agentic Export Camera', 'Agentic Export Player'])
    );
    expect(
      historyPayload.history[0].diff.semantic.componentChanges.map((item: { summary: string }) => item.summary)
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Transform agregado en Agentic Export Camera'),
      ])
    );
    const cameraTransformChange = historyPayload.history[0].diff.semantic.componentChanges.find(
      (item: { summary: string }) => item.summary.includes('Transform agregado en Agentic Export Camera')
    );
    expect(cameraTransformChange?.fieldChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'position',
          before: '(missing)',
          after: expect.stringContaining('"x"'),
        }),
      ])
    );
    expect(historyPayload.history[0].diff.rollbackPreview.willRemove.entities.map((item: { name: string }) => item.name)).toEqual(
      expect.arrayContaining(['Agentic Export Camera', 'Agentic Export Player'])
    );

    const searchedHistoryResponse = await GET(
      new NextRequest(`http://localhost/api/agentic?slot=${SLOT}&projectKey=${PROJECT_KEY}&limit=1&offset=0&search=technical_integration`, {
        method: 'GET',
      })
    );
    const searchedHistoryPayload = await searchedHistoryResponse.json();

    expect(searchedHistoryResponse.status).toBe(200);
    expect(searchedHistoryPayload.history).toHaveLength(1);
    expect(searchedHistoryPayload.pagination).toMatchObject({
      limit: 1,
      offset: 0,
      totalRecords: 1,
      filteredRecords: 1,
      search: 'technical_integration',
    });

    const traceFilteredHistoryResponse = await GET(
      new NextRequest(`http://localhost/api/agentic?slot=${SLOT}&projectKey=${PROJECT_KEY}&limit=1&offset=0&traceEvent=tool.completed&traceActor=technical_integration&traceSeverity=info`, {
        method: 'GET',
      })
    );
    const traceFilteredHistoryPayload = await traceFilteredHistoryResponse.json();

    expect(traceFilteredHistoryResponse.status).toBe(200);
    expect(traceFilteredHistoryPayload.history).toHaveLength(1);
    expect(traceFilteredHistoryPayload.pagination).toMatchObject({
      filteredRecords: 1,
      traceEvent: 'tool.completed',
      traceActor: 'technical_integration',
      traceSeverity: 'info',
    });

    const rollbackResponse = await PATCH(
      new NextRequest(`http://localhost/api/agentic?slot=${SLOT}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'x-rey30-project': PROJECT_KEY,
        },
        body: JSON.stringify({
          action: 'rollback',
          executionId: historyPayload.history[0].id,
        }),
      })
    );
    const rollbackPayload = await rollbackResponse.json();
    const rolledBack = readEditorProjectRecord({
      userId: USER_ID,
      projectKey: PROJECT_KEY,
      slot: SLOT,
    });
    const rolledBackState = rolledBack ? restoreEditorProjectSaveData(rolledBack.saveData) : null;

    expect(rollbackResponse.status).toBe(200);
    expect(rollbackPayload).toMatchObject({
      success: true,
      action: 'rollback',
      restoredFrom: historyPayload.history[0].id,
    });
    expect(rolledBackState ? Array.from(rolledBackState.entities.values()) : []).toHaveLength(0);

    const replayResponse = await PATCH(
      new NextRequest(`http://localhost/api/agentic?slot=${SLOT}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'x-rey30-project': PROJECT_KEY,
        },
        body: JSON.stringify({
          action: 'replay',
          executionId: historyPayload.history[0].id,
          maxIterations: 1,
        }),
      })
    );
    const replayPayload = await replayResponse.json();
    const replayHistoryResponse = await GET(
      new NextRequest(`http://localhost/api/agentic?slot=${SLOT}&projectKey=${PROJECT_KEY}&limit=5`, {
        method: 'GET',
      })
    );
    const replayHistoryPayload = await replayHistoryResponse.json();

    expect(replayResponse.status).toBe(200);
    expect(replayPayload.approved).toBe(true);
    expect(replayPayload.replayedFrom).toBe(historyPayload.history[0].id);
    expect(replayHistoryPayload.history[0]).toMatchObject({
      action: 'replay',
      sourceExecutionId: historyPayload.history[0].id,
      snapshots: {
        before: true,
        after: true,
      },
      diff: {
        hasChanges: true,
      },
    });
  });

  it('persists recommendation approval decisions without replaying the execution', async () => {
    const recommendation = {
      id: 'recommendation-route',
      approvalKey: 'scene.analyze:NO_BLOCKING_ISSUE:asset.reindex',
      sourceToolName: 'scene.analyze',
      sourceCallId: 'tool-scene-analyze-route',
      summary: 'Scene can be reindexed safely.',
      rationale: 'NO_BLOCKING_ISSUE',
      priority: 'optional' as const,
      suggestedDomain: 'maintenance',
      suggestedCapabilities: ['asset.reindex'],
      suggestedToolNames: ['asset.reindex'],
      input: { reason: 'route-test' },
      confidence: 0.6,
      approvalStatus: 'pending' as const,
    };
    const record: AgenticExecutionHistoryRecord = {
      id: 'pipeline-route-recommendations',
      userId: USER_ID,
      projectKey: PROJECT_KEY,
      slot: SLOT,
      prompt: 'analiza la escena antes de tocarla',
      approved: false,
      status: 'rejected',
      iteration: 1,
      createdAt: '2026-04-16T00:00:00.000Z',
      completedAt: '2026-04-16T00:00:01.000Z',
      artifactPath: null,
      runtimeScaffold: null,
      validation: {
        approved: false,
        confidence: 0.7,
        matchedRequirements: ['scene.analyze'],
        missingRequirements: ['recommendation.approval'],
        incorrectOutputs: [],
        retryInstructions: ['Approve or reject recommendations before mutation.'],
      },
      toolNames: ['scene.analyze'],
      agentRoles: ['maintenance'],
      steps: [
        {
          id: 'step-scene-analyze-route',
          title: 'Analyze scene before mutation',
          agentRole: 'maintenance',
          status: 'completed',
          evidenceCount: 0,
          errorCount: 0,
        },
      ],
      toolStats: [{ name: 'scene.analyze', successCount: 1, failureCount: 0 }],
      traces: [],
      sharedMemory: {
        analyses: [
          {
            id: 'analysis-route',
            toolName: 'scene.analyze',
            callId: 'tool-scene-analyze-route',
            stepId: 'step-scene-analyze-route',
            agentRole: 'maintenance',
            scope: 'active_scene',
            summary: 'Scene analysis completed.',
            output: { issues: [] },
            actionableRecommendations: [recommendation],
            createdAt: '2026-04-16T00:00:00.500Z',
          },
        ],
        actionableRecommendations: [recommendation],
      },
      toolCalls: [],
      stepCount: 1,
      action: 'run',
      sourceExecutionId: null,
      snapshots: {
        before: true,
        after: true,
      },
      diff: null,
    };
    appendAgenticExecutionHistoryRecord(record);

    const response = await PATCH_RECOMMENDATION(
      new NextRequest(
        `http://localhost/api/agentic/recommendations/${encodeURIComponent(recommendation.id)}?projectKey=${PROJECT_KEY}&slot=${SLOT}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            decision: 'approved',
            executionId: record.id,
          }),
        }
      ),
      { params: Promise.resolve({ id: recommendation.id }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.executionId).toBe(record.id);
    expect(payload.recommendation).toMatchObject({
      id: recommendation.id,
      approvalStatus: 'approved',
    });
    expect(payload.record.action).toBe('run');
    expect(payload.record.sourceExecutionId).toBeNull();
    expect(payload.record.traces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: 'recommendation.approved',
          actor: 'user',
          data: expect.objectContaining({
            recommendationId: recommendation.id,
            approvalKey: recommendation.approvalKey,
            decision: 'approved',
          }),
        }),
      ])
    );

    const historyResponse = await GET(
      new NextRequest(`http://localhost/api/agentic?slot=${SLOT}&projectKey=${PROJECT_KEY}&limit=5`, {
        method: 'GET',
      })
    );
    const historyPayload = await historyResponse.json();

    expect(historyResponse.status).toBe(200);
    expect(historyPayload.history).toHaveLength(1);
    expect(historyPayload.history[0].id).toBe(record.id);
    expect(historyPayload.history[0].action).toBe('run');
    expect(historyPayload.history[0].sharedMemory.actionableRecommendations[0]).toMatchObject({
      id: recommendation.id,
      approvalStatus: 'approved',
    });
    expect(historyPayload.history[0].sharedMemory.analyses[0].actionableRecommendations[0]).toMatchObject({
      id: recommendation.id,
      approvalStatus: 'approved',
    });

    const rejectionResponse = await PATCH_RECOMMENDATION(
      new NextRequest(
        `http://localhost/api/agentic/recommendations/${encodeURIComponent(recommendation.approvalKey)}?projectKey=${PROJECT_KEY}&slot=${SLOT}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            status: 'reject',
            executionId: record.id,
          }),
        }
      ),
      { params: Promise.resolve({ id: recommendation.approvalKey }) }
    );
    const rejectionPayload = await rejectionResponse.json();

    expect(rejectionResponse.status).toBe(200);
    expect(rejectionPayload.recommendation).toMatchObject({
      id: recommendation.id,
      approvalStatus: 'rejected',
    });
    expect(rejectionPayload.record.action).toBe('run');
    expect(rejectionPayload.record.traces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: 'recommendation.rejected',
          actor: 'user',
          data: expect.objectContaining({
            recommendationId: recommendation.id,
            approvalKey: recommendation.approvalKey,
            decision: 'rejected',
          }),
        }),
      ])
    );
  });

  it('executes approved recommendations through the dedicated endpoint and supports partial rollback', async () => {
    const darkState = createProjectState('Agentic Approved Recommendations');
    darkState.scenes = darkState.scenes.map((scene) => ({
      ...scene,
      environment: {
        ...scene.environment,
        mood: 'dark',
        ambientIntensity: 0.9,
        directionalLightIntensity: 1.2,
      },
    }));
    const saveData = createEditorProjectSaveData(darkState, { markClean: true });
    writeEditorProjectRecord(
      buildEditorProjectRecord({
        userId: USER_ID,
        projectKey: PROJECT_KEY,
        slot: SLOT,
        saveData,
      })
    );

    const recommendation = {
      id: 'recommendation-dark-lighting-route',
      approvalKey: 'scene.analyze:DARK_SCENE_TOO_BRIGHT:lighting.adjustLight',
      sourceToolName: 'scene.analyze',
      sourceCallId: 'tool-scene-analyze-dark-route',
      summary: 'Dark scene is too bright.',
      rationale: 'DARK_SCENE_TOO_BRIGHT',
      priority: 'normal' as const,
      suggestedDomain: 'lighting',
      suggestedCapabilities: ['lighting.adjustLight'],
      suggestedToolNames: ['lighting.adjustLight'],
      input: { ambientIntensity: 0.22, directionalLightIntensity: 0.45 },
      confidence: 0.9,
      approvalStatus: 'approved' as const,
    };
    const sourceRecord: AgenticExecutionHistoryRecord = {
      id: 'pipeline-route-approved-source',
      userId: USER_ID,
      projectKey: PROJECT_KEY,
      slot: SLOT,
      prompt: 'corrige esta escena porque el pedido pedía ambiente oscuro y quedó demasiado iluminada',
      approved: false,
      status: 'rejected',
      iteration: 1,
      createdAt: '2026-04-16T00:00:00.000Z',
      completedAt: '2026-04-16T00:00:01.000Z',
      artifactPath: null,
      runtimeScaffold: null,
      validation: {
        approved: false,
        confidence: 0.7,
        matchedRequirements: ['scene.analyze'],
        missingRequirements: ['recommendation.approval'],
        incorrectOutputs: [],
        retryInstructions: ['Approve lighting recommendation before mutation.'],
      },
      toolNames: ['scene.analyze'],
      agentRoles: ['maintenance'],
      steps: [
        {
          id: 'step-dark-analyze-route',
          title: 'Analyze scene before mutation',
          agentRole: 'maintenance',
          status: 'completed',
          evidenceCount: 0,
          errorCount: 0,
        },
      ],
      toolStats: [{ name: 'scene.analyze', successCount: 1, failureCount: 0 }],
      traces: [],
      sharedMemory: {
        analyses: [
          {
            id: 'analysis-dark-route',
            toolName: 'scene.analyze',
            callId: 'tool-scene-analyze-dark-route',
            stepId: 'step-dark-analyze-route',
            agentRole: 'maintenance',
            scope: 'active_scene',
            summary: 'Dark scene is too bright.',
            output: { issues: ['DARK_SCENE_TOO_BRIGHT'] },
            actionableRecommendations: [recommendation],
            createdAt: '2026-04-16T00:00:00.500Z',
          },
        ],
        actionableRecommendations: [recommendation],
      },
      toolCalls: [],
      stepCount: 1,
      action: 'run',
      sourceExecutionId: null,
      recommendationExecution: null,
      snapshots: {
        before: true,
        after: true,
      },
      diff: null,
    };
    appendAgenticExecutionHistoryRecord(sourceRecord);

    const executeResponse = await POST_EXECUTE_APPROVED(
      new NextRequest('http://localhost/api/agentic/recommendations/execute-approved', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-rey30-project': PROJECT_KEY,
        },
        body: JSON.stringify({
          executionId: sourceRecord.id,
          slot: SLOT,
          maxIterations: 3,
        }),
      })
    );
    const executePayload = await executeResponse.json();
    const executedRecord = executePayload.historyRecord as AgenticExecutionHistoryRecord;
    const adjustedProject = readEditorProjectRecord({
      userId: USER_ID,
      projectKey: PROJECT_KEY,
      slot: SLOT,
    });
    const adjustedState = adjustedProject ? restoreEditorProjectSaveData(adjustedProject.saveData) : null;

    expect(executeResponse.status).toBe(200);
    expect(executePayload.executedApprovedRecommendations).toBe(true);
    expect(executedRecord).toMatchObject({
      action: 'approved_recommendations',
      sourceExecutionId: sourceRecord.id,
      recommendationExecution: {
        sourceExecutionId: sourceRecord.id,
        recommendationKeys: [recommendation.approvalKey],
      },
    });
    expect(executedRecord.recommendationExecution?.unlockedMutations[0]).toMatchObject({
      toolName: 'lighting.adjustLight',
      recommendationKeys: [recommendation.approvalKey],
    });
    const mutationIndex = readAgenticRecommendationMutationIndex({
      userId: USER_ID,
      projectKey: PROJECT_KEY,
      slot: SLOT,
    });
    expect(mutationIndex.recommendations[recommendation.approvalKey]).toMatchObject({
      recommendationId: recommendation.id,
      recommendationKey: recommendation.approvalKey,
      executions: [
        expect.objectContaining({
          executionId: executedRecord.id,
          sourceExecutionId: sourceRecord.id,
          toolCalls: expect.arrayContaining([
            expect.objectContaining({
              toolName: 'lighting.adjustLight',
              evidenceIds: expect.arrayContaining([expect.any(String)]),
            }),
          ]),
          partialRollbackAppliedAt: null,
        }),
      ],
    });
    expect(mutationIndex.checksum).toMatchObject({
      algorithm: 'sha256',
      value: expect.stringMatching(/^[a-f0-9]{64}$/),
      updatedAt: expect.any(String),
    });
    const mutationIndexResponse = await GET_MUTATION_INDEX(
      new NextRequest(
        `http://localhost/api/agentic/recommendations/mutation-index?projectKey=${PROJECT_KEY}&slot=${SLOT}&recommendationKey=${encodeURIComponent(recommendation.approvalKey)}`,
        {
          method: 'GET',
          headers: {
            'x-rey30-project': PROJECT_KEY,
          },
        }
      )
    );
    const mutationIndexPayload = await mutationIndexResponse.json();
    expect(mutationIndexResponse.status).toBe(200);
    expect(mutationIndexPayload).toMatchObject({
      success: true,
      projectKey: PROJECT_KEY,
      slot: SLOT,
      recommendationKey: recommendation.approvalKey,
      integrity: {
        valid: true,
        status: 'valid',
        stored: expect.objectContaining({
          algorithm: 'sha256',
        }),
        computed: expect.objectContaining({
          algorithm: 'sha256',
        }),
      },
      index: {
        recommendations: {
          [recommendation.approvalKey]: expect.objectContaining({
            executions: [
              expect.objectContaining({
                executionId: executedRecord.id,
                toolCalls: expect.arrayContaining([
                  expect.objectContaining({
                    toolName: 'lighting.adjustLight',
                    evidenceIds: expect.arrayContaining([expect.any(String)]),
                  }),
                ]),
              }),
            ],
          }),
        },
      },
    });
    const mutationIndexExportJsonResponse = await GET_MUTATION_INDEX_EXPORT(
      new NextRequest(
        `http://localhost/api/agentic/recommendations/mutation-index/export?projectKey=${PROJECT_KEY}&slot=${SLOT}&format=json`,
        {
          method: 'GET',
          headers: {
            'x-rey30-project': PROJECT_KEY,
          },
        }
      )
    );
    const mutationIndexExportJson = await mutationIndexExportJsonResponse.json();
    const mutationIndexExportMarkdownResponse = await GET_MUTATION_INDEX_EXPORT(
      new NextRequest(
        `http://localhost/api/agentic/recommendations/mutation-index/export?projectKey=${PROJECT_KEY}&slot=${SLOT}&format=markdown`,
        {
          method: 'GET',
          headers: {
            'x-rey30-project': PROJECT_KEY,
          },
        }
      )
    );
    const mutationIndexExportMarkdown = await mutationIndexExportMarkdownResponse.text();
    expect(mutationIndexExportJsonResponse.status).toBe(200);
    expect(mutationIndexExportJsonResponse.headers.get('content-disposition')).toContain(
      'recommendation-mutation-index.json'
    );
    expect(mutationIndexExportJsonResponse.headers.get('x-agentic-index-checksum')).toMatch(
      /^sha256:[a-f0-9]{64}$/
    );
    expect(mutationIndexExportJson.index.checksum).toMatchObject({
      algorithm: 'sha256',
      value: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(mutationIndexExportJson.recommendations[0]).toMatchObject({
      key: recommendation.approvalKey,
      executions: [
        expect.objectContaining({
          executionId: executedRecord.id,
          toolCalls: expect.arrayContaining([
            expect.objectContaining({
              toolName: 'lighting.adjustLight',
            }),
          ]),
        }),
      ],
    });
    expect(mutationIndexExportMarkdownResponse.status).toBe(200);
    expect(mutationIndexExportMarkdownResponse.headers.get('content-type')).toContain('text/markdown');
    expect(mutationIndexExportMarkdown).toContain(recommendation.approvalKey);
    expect(mutationIndexExportMarkdown).toContain('Checksum: sha256:');
    expect(mutationIndexExportMarkdown).toContain('chain:');
    const filteredExportResponse = await GET_MUTATION_INDEX_EXPORT(
      new NextRequest(
        `http://localhost/api/agentic/recommendations/mutation-index/export?projectKey=${PROJECT_KEY}&slot=${SLOT}&format=json&recommendationKey=${encodeURIComponent(recommendation.approvalKey)}`,
        {
          method: 'GET',
          headers: {
            'x-rey30-project': PROJECT_KEY,
          },
        }
      )
    );
    const filteredExportJson = await filteredExportResponse.json();
    expect(filteredExportResponse.status).toBe(200);
    expect(filteredExportJson.index).toMatchObject({
      recommendationCount: 1,
      checksum: expect.objectContaining({
        algorithm: 'sha256',
      }),
    });
    expect(filteredExportJson.index.storedChecksum).toBeNull();
    expect(filteredExportJson.index.checksumValid).toBe(true);
    expect(filteredExportJson.recommendations.map((item: { key: string }) => item.key)).toEqual([
      recommendation.approvalKey,
    ]);
    expect(adjustedState?.scenes[0].environment.ambientIntensity).toBe(0.18);
    expect(adjustedState?.scenes[0].environment.directionalLightIntensity).toBe(0.38);

    const rollbackResponse = await POST_ROLLBACK_APPROVED(
      new NextRequest('http://localhost/api/agentic/recommendations/rollback-approved', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-rey30-project': PROJECT_KEY,
        },
        body: JSON.stringify({
          executionId: executedRecord.id,
          slot: SLOT,
        }),
      })
    );
    const rollbackPayload = await rollbackResponse.json();
    const rolledBackProject = readEditorProjectRecord({
      userId: USER_ID,
      projectKey: PROJECT_KEY,
      slot: SLOT,
    });
    const rolledBackState = rolledBackProject ? restoreEditorProjectSaveData(rolledBackProject.saveData) : null;

    expect(rollbackResponse.status).toBe(200);
    expect(rollbackPayload).toMatchObject({
      success: true,
      action: 'partial_rollback',
      executionId: executedRecord.id,
    });
    expect(rollbackPayload.record.recommendationExecution.partialRollback).toMatchObject({
      available: false,
      applied: true,
      recommendationKeys: [recommendation.approvalKey],
    });
    expect(rollbackPayload.record.traces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: 'recommendation.partial_rollback',
          actor: 'user',
        }),
      ])
    );
    const rollbackIndex = readAgenticRecommendationMutationIndex({
      userId: USER_ID,
      projectKey: PROJECT_KEY,
      slot: SLOT,
    });
    expect(
      rollbackIndex.recommendations[recommendation.approvalKey].executions[0].partialRollbackAppliedAt
    ).toEqual(expect.any(String));
    expect(rolledBackState?.scenes[0].environment.ambientIntensity).toBe(0.9);
    expect(rolledBackState?.scenes[0].environment.directionalLightIntensity).toBe(1.2);
  });

  it('exposes mutationIndexAudit mismatch state from the agentic history contract', async () => {
    await seedMismatchedRecommendationMutationIndex({
      recommendationKey: 'scene.analyze:MISMATCH_CONTRACT:asset.reindex',
      summary: 'Contract indexed summary.',
      corruptedSummary: 'Contract summary edited after checksum persisted.',
    });

    const historyResponse = await GET(
      new NextRequest(`http://localhost/api/agentic?projectKey=${PROJECT_KEY}&slot=${SLOT}&limit=1`, {
        method: 'GET',
        headers: {
          'x-rey30-project': PROJECT_KEY,
        },
      })
    );
    const historyPayload = await historyResponse.json();

    expect(historyResponse.status).toBe(200);
    expect(historyPayload.success).toBe(true);
    expect(historyPayload.mutationIndexAudit).toMatchObject({
      repairCount: 0,
      latestRepairId: null,
      latestRepairAt: null,
      integrityStatus: 'mismatch',
      integrityValid: false,
    });
  });

  it('returns lightweight mutation index status without loading execution history', async () => {
    await seedMismatchedRecommendationMutationIndex({
      recommendationKey: 'scene.analyze:MISMATCH_STATUS:asset.reindex',
      summary: 'Status indexed summary.',
      corruptedSummary: 'Status summary edited after checksum persisted.',
    });

    const statusResponse = await GET_MUTATION_INDEX_STATUS(
      new NextRequest(
        `http://localhost/api/agentic/mutation-index/status?projectKey=${PROJECT_KEY}&slot=${SLOT}`,
        {
          method: 'GET',
          headers: {
            'x-rey30-project': PROJECT_KEY,
          },
        }
      )
    );
    const statusPayload = await statusResponse.json();

    expect(statusResponse.status).toBe(200);
    expect(statusPayload).toMatchObject({
      success: true,
      projectKey: PROJECT_KEY,
      slot: SLOT,
      recommendationCount: 1,
      lastIndexedExecutionId: 'pipeline-corrupt-index-execution',
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
        recommendationCount: 1,
        lastIndexedExecutionId: 'pipeline-corrupt-index-execution',
        latestIndexableExecutionId: null,
        pendingIndexableExecutionCount: 0,
        pendingIndexableExecutionIds: [],
        indexBehind: false,
      },
      integrity: {
        valid: false,
        status: 'mismatch',
      },
    });
    expect(statusPayload.checkedAt).toEqual(expect.any(String));
    expect(statusPayload).not.toHaveProperty('history');
    expect(statusPayload).not.toHaveProperty('index');
    expect(statusPayload.integrity.stored.value).not.toBe(statusPayload.integrity.computed.value);
  });

  it('marks mutation index status as behind when latest approved execution is not indexed', async () => {
    const recommendationKey = 'scene.analyze:INDEX_BEHIND:asset.reindex';
    writeAgenticRecommendationMutationIndexEntry({
      userId: USER_ID,
      projectKey: PROJECT_KEY,
      slot: SLOT,
      executionId: 'pipeline-indexed-approved-old',
      sourceExecutionId: 'pipeline-indexed-source-old',
      recommendationId: 'recommendation-indexed-old',
      recommendationKey,
      summary: 'Old indexed recommendation.',
      toolCalls: [
        {
          toolCallId: 'tool-indexed-old',
          toolName: 'asset.reindex',
          evidenceIds: ['evidence-indexed-old'],
          targetIds: ['asset-indexed-old'],
        },
      ],
    });
    appendAgenticExecutionHistoryRecord(
      createApprovedRecommendationHistoryRecord({
        id: 'pipeline-indexed-approved-old',
        sourceExecutionId: 'pipeline-indexed-source-old',
        recommendationId: 'recommendation-indexed-old',
        recommendationKey,
        toolCallId: 'tool-indexed-old',
        evidenceId: 'evidence-indexed-old',
        targetId: 'asset-indexed-old',
      })
    );
    appendAgenticExecutionHistoryRecord(
      createApprovedRecommendationHistoryRecord({
        id: 'pipeline-approved-new-unindexed',
        sourceExecutionId: 'pipeline-approved-source-new',
        recommendationId: 'recommendation-new-unindexed',
        recommendationKey: 'scene.analyze:NEW_UNINDEXED:asset.reindex',
        toolCallId: 'tool-new-unindexed',
        evidenceId: 'evidence-new-unindexed',
        targetId: 'asset-new-unindexed',
      })
    );

    const statusResponse = await GET_MUTATION_INDEX_STATUS(
      new NextRequest(
        `http://localhost/api/agentic/mutation-index/status?projectKey=${PROJECT_KEY}&slot=${SLOT}`,
        {
          method: 'GET',
          headers: {
            'x-rey30-project': PROJECT_KEY,
          },
        }
      )
    );
    const statusPayload = await statusResponse.json();

    expect(statusResponse.status).toBe(200);
    expect(statusPayload).toMatchObject({
      success: true,
      recommendationCount: 1,
      lastIndexedExecutionId: 'pipeline-indexed-approved-old',
      latestIndexableExecutionId: 'pipeline-approved-new-unindexed',
      pendingIndexableExecutionCount: 1,
      pendingIndexableExecutionIds: ['pipeline-approved-new-unindexed'],
      indexBehind: true,
      mutationIndexAudit: {
        recommendationCount: 1,
        lastIndexedExecutionId: 'pipeline-indexed-approved-old',
        latestIndexableExecutionId: 'pipeline-approved-new-unindexed',
        pendingIndexableExecutionCount: 1,
        pendingIndexableExecutionIds: ['pipeline-approved-new-unindexed'],
        indexBehind: true,
      },
      integrity: {
        valid: true,
        status: 'valid',
      },
    });
  });

  it('filters pending index history server-side using mutation index status', async () => {
    const seeded = seedBehindRecommendationMutationIndex();

    const historyResponse = await GET(
      new NextRequest(
        `http://localhost/api/agentic?projectKey=${PROJECT_KEY}&slot=${SLOT}&historyFilter=pending_index&limit=10`,
        {
          method: 'GET',
          headers: {
            'x-rey30-project': PROJECT_KEY,
          },
        }
      )
    );
    const historyPayload = await historyResponse.json();

    expect(historyResponse.status).toBe(200);
    expect(historyPayload).toMatchObject({
      success: true,
      mutationIndexAudit: {
        indexBehind: true,
        pendingIndexableExecutionCount: 1,
        pendingIndexableExecutionIds: [seeded.unindexedExecutionId],
      },
      pagination: {
        totalRecords: 2,
        filteredRecords: 1,
        historyFilter: 'pending_index',
      },
      filterCounts: {
        total: 2,
        approved: 2,
        rejected: 0,
        pendingIndex: 1,
      },
    });
    expect(historyPayload.history.map((record: { id: string }) => record.id)).toEqual([
      seeded.unindexedExecutionId,
    ]);
  });

  it('filters history by tool and agent server-side', async () => {
    appendAgenticExecutionHistoryRecord(
      createApprovedRecommendationHistoryRecord({
        id: 'pipeline-maintenance-tool-filter',
        sourceExecutionId: 'pipeline-maintenance-source',
        recommendationId: 'recommendation-maintenance-filter',
        recommendationKey: 'scene.analyze:MAINTENANCE_FILTER:asset.reindex',
        toolCallId: 'tool-maintenance-filter',
        evidenceId: 'evidence-maintenance-filter',
        targetId: 'asset-maintenance-filter',
      })
    );
    appendAgenticExecutionHistoryRecord({
      ...createApprovedRecommendationHistoryRecord({
        id: 'pipeline-lighting-tool-filter',
        sourceExecutionId: 'pipeline-lighting-source',
        recommendationId: 'recommendation-lighting-filter',
        recommendationKey: 'scene.analyze:LIGHTING_FILTER:lighting.adjust',
        toolCallId: 'tool-lighting-filter',
        evidenceId: 'evidence-lighting-filter',
        targetId: 'light-lighting-filter',
      }),
      toolNames: ['lighting.adjust'],
      agentRoles: ['lighting_environment'],
      toolStats: [{ name: 'lighting.adjust', successCount: 1, failureCount: 0 }],
      steps: [
        {
          id: 'step-lighting-tool-filter',
          title: 'Adjust lighting',
          agentRole: 'lighting_environment',
          status: 'completed',
          evidenceCount: 1,
          errorCount: 0,
        },
      ],
    });

    const filteredResponse = await GET(
      new NextRequest(
        `http://localhost/api/agentic?projectKey=${PROJECT_KEY}&slot=${SLOT}&toolFilter=lighting.adjust&agentFilter=lighting_environment&limit=10`,
        {
          method: 'GET',
          headers: {
            'x-rey30-project': PROJECT_KEY,
          },
        }
      )
    );
    const filteredPayload = await filteredResponse.json();

    expect(filteredResponse.status).toBe(200);
    expect(filteredPayload).toMatchObject({
      success: true,
      pagination: {
        totalRecords: 2,
        filteredRecords: 1,
        toolFilter: 'lighting.adjust',
        agentFilter: 'lighting_environment',
      },
      filterOptions: {
        tools: expect.arrayContaining(['asset.reindex', 'lighting.adjust']),
        agents: expect.arrayContaining(['maintenance', 'lighting_environment']),
      },
      filterCounts: {
        total: 1,
        approved: 1,
        rejected: 0,
      },
    });
    expect(filteredPayload.history.map((record: { id: string }) => record.id)).toEqual([
      'pipeline-lighting-tool-filter',
    ]);
  });

  it('blocks mutation index export when the index is behind approved recommendation history', async () => {
    seedBehindRecommendationMutationIndex();

    const exportResponse = await GET_MUTATION_INDEX_EXPORT(
      new NextRequest(
        `http://localhost/api/agentic/recommendations/mutation-index/export?projectKey=${PROJECT_KEY}&slot=${SLOT}&format=json`,
        {
          method: 'GET',
          headers: {
            'x-rey30-project': PROJECT_KEY,
          },
        }
      )
    );
    const payload = await exportResponse.json();

    expect(exportResponse.status).toBe(409);
    expect(exportResponse.headers.get('x-agentic-index-behind')).toBe('true');
    expect(payload).toMatchObject({
      success: false,
      code: 'AGENTIC_RECOMMENDATION_MUTATION_INDEX_BEHIND',
      mutationIndexAudit: {
        indexBehind: true,
        pendingIndexableExecutionCount: 1,
        pendingIndexableExecutionIds: ['pipeline-approved-new-unindexed'],
        lastIndexedExecutionId: 'pipeline-indexed-approved-old',
        latestIndexableExecutionId: 'pipeline-approved-new-unindexed',
      },
    });
  });

  it('blocks replay when the recommendation mutation index is behind', async () => {
    const seeded = seedBehindRecommendationMutationIndex();

    const replayResponse = await PATCH(
      new NextRequest(`http://localhost/api/agentic?projectKey=${PROJECT_KEY}&slot=${SLOT}`, {
        method: 'PATCH',
        headers: {
          'x-rey30-project': PROJECT_KEY,
        },
        body: JSON.stringify({
          action: 'replay',
          executionId: seeded.indexedExecutionId,
        }),
      })
    );
    const payload = await replayResponse.json();

    expect(replayResponse.status).toBe(409);
    expect(payload).toMatchObject({
      success: false,
      code: 'AGENTIC_RECOMMENDATION_MUTATION_INDEX_BEHIND',
      executionId: seeded.indexedExecutionId,
      mutationIndexAudit: {
        indexBehind: true,
        pendingIndexableExecutionCount: 1,
        pendingIndexableExecutionIds: [seeded.unindexedExecutionId],
        lastIndexedExecutionId: seeded.indexedExecutionId,
        latestIndexableExecutionId: seeded.unindexedExecutionId,
      },
    });
  });

  it('blocks approved recommendation execution when the recommendation mutation index is behind', async () => {
    const seeded = seedBehindRecommendationMutationIndex();

    const executeResponse = await POST_EXECUTE_APPROVED(
      new NextRequest('http://localhost/api/agentic/recommendations/execute-approved', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-rey30-project': PROJECT_KEY,
        },
        body: JSON.stringify({
          executionId: seeded.indexedExecutionId,
          slot: SLOT,
          maxIterations: 3,
        }),
      })
    );
    const payload = await executeResponse.json();

    expect(executeResponse.status).toBe(409);
    expect(payload).toMatchObject({
      success: false,
      code: 'AGENTIC_RECOMMENDATION_MUTATION_INDEX_BEHIND',
      executionId: seeded.indexedExecutionId,
      mutationIndexAudit: {
        indexBehind: true,
        pendingIndexableExecutionCount: 1,
        pendingIndexableExecutionIds: [seeded.unindexedExecutionId],
        lastIndexedExecutionId: seeded.indexedExecutionId,
        latestIndexableExecutionId: seeded.unindexedExecutionId,
      },
    });
  });

  it('rejects reindex requests on the legacy checksum repair route', async () => {
    const response = await POST_MUTATION_INDEX(
      new NextRequest('http://localhost/api/agentic/recommendations/mutation-index', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-rey30-project': PROJECT_KEY,
        },
        body: JSON.stringify({
          action: 'reindex_from_history',
          confirmReindex: true,
          confirmRepair: true,
          projectKey: PROJECT_KEY,
          slot: SLOT,
        }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toMatchObject({
      success: false,
      code: 'AGENTIC_RECOMMENDATION_MUTATION_INDEX_REINDEX_WRONG_ENDPOINT',
      projectKey: PROJECT_KEY,
      slot: SLOT,
    });
  });

  it('reindexes a behind recommendation mutation index from history with explicit confirmation', async () => {
    const seeded = seedBehindRecommendationMutationIndex();

    const reindexResponse = await POST_MUTATION_INDEX_REINDEX(
      new NextRequest(
        `http://localhost/api/agentic/mutation-index/reindex?projectKey=${PROJECT_KEY}&slot=${SLOT}`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-rey30-project': PROJECT_KEY,
          },
          body: JSON.stringify({
            confirmReindex: true,
            reason: 'unit_test_reindex_behind',
          }),
        }
      )
    );
    const reindexPayload = await reindexResponse.json();

    expect(reindexResponse.status).toBe(200);
    expect(reindexPayload).toMatchObject({
      success: true,
      action: 'reindex_from_history',
      indexedExecutionCount: 2,
      recommendationCount: 2,
      auditEntry: {
        action: 'history_reindexed_full',
        reason: 'unit_test_reindex_behind',
      },
    });
    expect(Object.keys(reindexPayload.index.recommendations)).toEqual(
      expect.arrayContaining([seeded.indexedRecommendationKey, seeded.unindexedRecommendationKey])
    );

    const statusResponse = await GET_MUTATION_INDEX_STATUS(
      new NextRequest(
        `http://localhost/api/agentic/mutation-index/status?projectKey=${PROJECT_KEY}&slot=${SLOT}`,
        {
          method: 'GET',
          headers: {
            'x-rey30-project': PROJECT_KEY,
          },
        }
      )
    );
    const statusPayload = await statusResponse.json();

    expect(statusResponse.status).toBe(200);
    expect(statusPayload).toMatchObject({
      recommendationCount: 2,
      lastIndexedExecutionId: seeded.unindexedExecutionId,
      latestIndexableExecutionId: seeded.unindexedExecutionId,
      pendingIndexableExecutionCount: 0,
      pendingIndexableExecutionIds: [],
      indexBehind: false,
      mutationIndexAudit: {
        recommendationCount: 2,
        historyReindexedFullCount: 1,
        historyReindexedPartialCount: 0,
        pendingIndexableExecutionCount: 0,
        pendingIndexableExecutionIds: [],
        indexBehind: false,
        latestRepairId: expect.stringContaining('mutation-index-reindex-'),
      },
    });
  });

  it('partially reindexes a single approved recommendation execution by executionId', async () => {
    const seeded = seedBehindRecommendationMutationIndex();
    const newerPendingExecutionId = 'pipeline-approved-newer-unindexed';
    appendAgenticExecutionHistoryRecord(
      createApprovedRecommendationHistoryRecord({
        id: newerPendingExecutionId,
        sourceExecutionId: 'pipeline-approved-source-newer',
        recommendationId: 'recommendation-newer-unindexed',
        recommendationKey: 'scene.analyze:NEWER_UNINDEXED:asset.reindex',
        toolCallId: 'tool-newer-unindexed',
        evidenceId: 'evidence-newer-unindexed',
        targetId: 'asset-newer-unindexed',
      })
    );

    const reindexResponse = await POST_MUTATION_INDEX_REINDEX(
      new NextRequest(
        `http://localhost/api/agentic/mutation-index/reindex?projectKey=${PROJECT_KEY}&slot=${SLOT}`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-rey30-project': PROJECT_KEY,
          },
          body: JSON.stringify({
            executionId: seeded.unindexedExecutionId,
            confirmReindex: true,
            reason: 'unit_test_partial_reindex',
          }),
        }
      )
    );
    const reindexPayload = await reindexResponse.json();

    expect(reindexResponse.status).toBe(200);
    expect(reindexPayload).toMatchObject({
      success: true,
      action: 'reindex_from_history',
      indexedExecutionCount: 1,
      indexedExecutionIds: [seeded.unindexedExecutionId],
      recommendationCount: 2,
      auditEntry: {
        action: 'history_reindexed_partial',
        reason: 'unit_test_partial_reindex',
      },
    });
    expect(Object.keys(reindexPayload.index.recommendations)).toEqual(
      expect.arrayContaining([seeded.indexedRecommendationKey, seeded.unindexedRecommendationKey])
    );
    expect(reindexPayload.index.recommendations).not.toHaveProperty('scene.analyze:NEWER_UNINDEXED:asset.reindex');

    const statusResponse = await GET_MUTATION_INDEX_STATUS(
      new NextRequest(
        `http://localhost/api/agentic/mutation-index/status?projectKey=${PROJECT_KEY}&slot=${SLOT}`,
        {
          method: 'GET',
          headers: {
            'x-rey30-project': PROJECT_KEY,
          },
        }
      )
    );
    const statusPayload = await statusResponse.json();

    expect(statusResponse.status).toBe(200);
    expect(statusPayload).toMatchObject({
      recommendationCount: 2,
      lastIndexedExecutionId: seeded.unindexedExecutionId,
      latestIndexableExecutionId: newerPendingExecutionId,
      pendingIndexableExecutionCount: 1,
      pendingIndexableExecutionIds: [newerPendingExecutionId],
      indexBehind: true,
      mutationIndexAudit: {
        historyReindexedFullCount: 0,
        historyReindexedPartialCount: 1,
      },
    });
  });

  it('rejects mutation index export when the persisted checksum no longer matches', async () => {
    await seedMismatchedRecommendationMutationIndex();

    const exportResponse = await GET_MUTATION_INDEX_EXPORT(
      new NextRequest(
        `http://localhost/api/agentic/recommendations/mutation-index/export?projectKey=${PROJECT_KEY}&slot=${SLOT}&format=json`,
        {
          method: 'GET',
          headers: {
            'x-rey30-project': PROJECT_KEY,
          },
        }
      )
    );
    const payload = await exportResponse.json();
    const inspectResponse = await GET_MUTATION_INDEX(
      new NextRequest(
        `http://localhost/api/agentic/recommendations/mutation-index?projectKey=${PROJECT_KEY}&slot=${SLOT}`,
        {
          method: 'GET',
          headers: {
            'x-rey30-project': PROJECT_KEY,
          },
        }
      )
    );
    const inspectPayload = await inspectResponse.json();

    expect(exportResponse.status).toBe(409);
    expect(exportResponse.headers.get('x-agentic-index-checksum-valid')).toBe('false');
    expect(payload).toMatchObject({
      success: false,
      code: 'AGENTIC_RECOMMENDATION_MUTATION_INDEX_CHECKSUM_INVALID',
      integrity: {
        valid: false,
        status: 'mismatch',
        stored: expect.objectContaining({
          algorithm: 'sha256',
        }),
        computed: expect.objectContaining({
          algorithm: 'sha256',
        }),
      },
    });
    expect(payload.integrity.stored.value).not.toBe(payload.integrity.computed.value);
    expect(inspectResponse.status).toBe(200);
    expect(inspectPayload.integrity).toMatchObject({
      valid: false,
      status: 'mismatch',
    });
    const auditExportResponse = await GET_MUTATION_INDEX_EXPORT(
      new NextRequest(
        `http://localhost/api/agentic/recommendations/mutation-index/export?projectKey=${PROJECT_KEY}&slot=${SLOT}&format=json&scope=audit`,
        {
          method: 'GET',
          headers: {
            'x-rey30-project': PROJECT_KEY,
          },
        }
      )
    );
    const auditExportPayload = await auditExportResponse.json();
    const auditMarkdownResponse = await GET_MUTATION_INDEX_EXPORT(
      new NextRequest(
        `http://localhost/api/agentic/recommendations/mutation-index/export?projectKey=${PROJECT_KEY}&slot=${SLOT}&format=markdown&scope=audit`,
        {
          method: 'GET',
          headers: {
            'x-rey30-project': PROJECT_KEY,
          },
        }
      )
    );
    const auditMarkdown = await auditMarkdownResponse.text();
    expect(auditExportResponse.status).toBe(200);
    expect(auditExportResponse.headers.get('content-disposition')).toContain(
      'recommendation-mutation-index-audit.json'
    );
    expect(auditExportResponse.headers.get('x-agentic-index-checksum-valid')).toBe('false');
    expect(auditExportPayload).toMatchObject({
      kind: 'agentic_recommendation_mutation_index_audit',
      index: {
        checksumValid: false,
        checksumStatus: 'mismatch',
      },
    });
    expect(auditExportPayload).not.toHaveProperty('recommendations');
    expect(auditMarkdownResponse.status).toBe(200);
    expect(auditMarkdownResponse.headers.get('content-disposition')).toContain(
      'recommendation-mutation-index-audit.md'
    );
    expect(auditMarkdown).toContain('# Agentic Recommendation Mutation Index Audit');
    expect(auditMarkdown).toContain('Checksum Valid: no (mismatch)');
  });

  it('repairs a mutation index with missing checksum only after explicit confirmation', async () => {
    writeAgenticRecommendationMutationIndexEntry({
      userId: USER_ID,
      projectKey: PROJECT_KEY,
      slot: SLOT,
      executionId: 'pipeline-missing-index-execution',
      sourceExecutionId: 'pipeline-missing-index-source',
      recommendationId: 'recommendation-missing-index',
      recommendationKey: 'scene.analyze:MISSING_INDEX:asset.reindex',
      summary: 'Missing checksum indexed summary.',
      toolCalls: [
        {
          toolCallId: 'tool-missing-index',
          toolName: 'asset.reindex',
          evidenceIds: ['evidence-missing-index'],
          targetIds: ['asset-missing-index'],
        },
      ],
    });
    const indexPath = path.join(
      historyRoot,
      USER_ID,
      PROJECT_KEY,
      `${SLOT}.recommendation-mutation-index.json`
    );
    const rawIndex = JSON.parse(await readFile(indexPath, 'utf-8')) as {
      checksum?: unknown;
      integrityAuditTrail?: unknown[];
    };
    delete rawIndex.checksum;
    await writeFile(indexPath, JSON.stringify(rawIndex, null, 2), 'utf-8');

    const missingInspectResponse = await GET_MUTATION_INDEX(
      new NextRequest(
        `http://localhost/api/agentic/recommendations/mutation-index?projectKey=${PROJECT_KEY}&slot=${SLOT}`,
        {
          method: 'GET',
          headers: {
            'x-rey30-project': PROJECT_KEY,
          },
        }
      )
    );
    const missingInspectPayload = await missingInspectResponse.json();
    expect(missingInspectPayload.integrity).toMatchObject({
      valid: false,
      status: 'missing',
    });

    const rejectedRepairResponse = await POST_MUTATION_INDEX(
      new NextRequest('http://localhost/api/agentic/recommendations/mutation-index', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-rey30-project': PROJECT_KEY,
        },
        body: JSON.stringify({
          projectKey: PROJECT_KEY,
          slot: SLOT,
          confirmRepair: false,
        }),
      })
    );
    expect(rejectedRepairResponse.status).toBe(400);
    expect(readAgenticRecommendationMutationIndex({
      userId: USER_ID,
      projectKey: PROJECT_KEY,
      slot: SLOT,
    }).checksum).toBeUndefined();

    const repairResponse = await POST_MUTATION_INDEX(
      new NextRequest('http://localhost/api/agentic/recommendations/mutation-index', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-rey30-project': PROJECT_KEY,
        },
        body: JSON.stringify({
          projectKey: PROJECT_KEY,
          slot: SLOT,
          confirmRepair: true,
          reason: 'unit_test_missing_checksum_repair',
        }),
      })
    );
    const repairPayload = await repairResponse.json();
    const repairedIndex = readAgenticRecommendationMutationIndex({
      userId: USER_ID,
      projectKey: PROJECT_KEY,
      slot: SLOT,
    });

    expect(repairResponse.status).toBe(200);
    expect(repairPayload).toMatchObject({
      success: true,
      action: 'repair_checksum',
      previousIntegrity: {
        valid: false,
        status: 'missing',
      },
      integrity: {
        valid: true,
        status: 'valid',
      },
      auditEntry: {
        action: 'checksum_recalculated',
        actor: 'user',
        requestedBy: USER_ID,
        reason: 'unit_test_missing_checksum_repair',
        previousIntegrityStatus: 'missing',
        previousChecksum: null,
      },
      index: {
        checksum: expect.objectContaining({
          algorithm: 'sha256',
          value: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      },
    });
    expect(repairedIndex.checksum).toMatchObject({
      algorithm: 'sha256',
      value: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(repairedIndex.integrityAuditTrail?.[0]).toMatchObject({
      action: 'checksum_recalculated',
      previousIntegrityStatus: 'missing',
      reason: 'unit_test_missing_checksum_repair',
    });
    const repairedHistoryResponse = await GET(
      new NextRequest(`http://localhost/api/agentic?projectKey=${PROJECT_KEY}&slot=${SLOT}`, {
        method: 'GET',
        headers: {
          'x-rey30-project': PROJECT_KEY,
        },
      })
    );
    const repairedHistoryPayload = await repairedHistoryResponse.json();
    expect(repairedHistoryResponse.status).toBe(200);
    expect(repairedHistoryPayload.mutationIndexAudit).toMatchObject({
      repairCount: 1,
      latestRepairId: repairedIndex.integrityAuditTrail?.[0]?.id,
      latestRepairAt: repairedIndex.integrityAuditTrail?.[0]?.repairedAt,
      integrityStatus: 'valid',
      integrityValid: true,
    });
  });

  it('blocks unsafe approved recommendation execution with 409 and leaves the project intact', async () => {
    const unsafeState = createProjectState('Agentic Unsafe Approved Recommendation');
    const anchorEntity: Entity = {
      id: 'entity-unsafe-anchor-route',
      name: 'Unsafe Anchor',
      components: new Map([
        [
          'Transform',
          {
            id: 'transform-unsafe-anchor-route',
            type: 'Transform',
            enabled: true,
            data: {
              position: { x: 0, y: 0, z: 0 },
              rotation: { x: 0, y: 0, z: 0, w: 1 },
              scale: { x: 1, y: 1, z: 1 },
            },
          },
        ],
      ]),
      children: [],
      parentId: null,
      active: true,
      tags: ['test-anchor'],
    };
    unsafeState.entities = new Map([[anchorEntity.id, anchorEntity]]);
    unsafeState.scenes = unsafeState.scenes.map((scene) => ({
      ...scene,
      entities: [anchorEntity],
      rootEntities: [anchorEntity.id],
    }));
    const saveData = createEditorProjectSaveData(unsafeState, { markClean: true });
    writeEditorProjectRecord(
      buildEditorProjectRecord({
        userId: USER_ID,
        projectKey: PROJECT_KEY,
        slot: SLOT,
        saveData,
      })
    );
    const originalSaveDataJson = JSON.stringify(saveData);

    const recommendation = {
      id: 'recommendation-unsafe-reindex-route',
      approvalKey: 'scene.analyze:NO_BLOCKING_ISSUE:asset.reindex',
      sourceToolName: 'scene.analyze',
      sourceCallId: 'tool-scene-analyze-unsafe-route',
      summary: 'Scene has no blocking issue; reindex assets.',
      rationale: 'NO_BLOCKING_ISSUE',
      priority: 'optional' as const,
      suggestedDomain: 'maintenance',
      suggestedCapabilities: ['asset.reindex'],
      suggestedToolNames: ['asset.reindex'],
      input: { reason: 'unsafe-reindex-contract-test' },
      confidence: 0.75,
      approvalStatus: 'approved' as const,
    };
    const sourceRecord: AgenticExecutionHistoryRecord = {
      id: 'pipeline-route-unsafe-approved-source',
      userId: USER_ID,
      projectKey: PROJECT_KEY,
      slot: SLOT,
      prompt: 'modifica esta escena',
      approved: false,
      status: 'rejected',
      iteration: 1,
      createdAt: '2026-04-16T00:10:00.000Z',
      completedAt: '2026-04-16T00:10:01.000Z',
      artifactPath: null,
      runtimeScaffold: null,
      validation: {
        approved: false,
        confidence: 0.7,
        matchedRequirements: ['scene.analyze'],
        missingRequirements: ['recommendation.approval'],
        incorrectOutputs: [],
        retryInstructions: ['Approve maintenance recommendation before mutation.'],
      },
      toolNames: ['scene.analyze'],
      agentRoles: ['maintenance'],
      steps: [
        {
          id: 'step-unsafe-analyze-route',
          title: 'Analyze scene before mutation',
          agentRole: 'maintenance',
          status: 'completed',
          evidenceCount: 0,
          errorCount: 0,
        },
      ],
      toolStats: [{ name: 'scene.analyze', successCount: 1, failureCount: 0 }],
      traces: [],
      sharedMemory: {
        analyses: [
          {
            id: 'analysis-unsafe-route',
            toolName: 'scene.analyze',
            callId: 'tool-scene-analyze-unsafe-route',
            stepId: 'step-unsafe-analyze-route',
            agentRole: 'maintenance',
            scope: 'active_scene',
            summary: 'Scene has no blocking issue; reindex assets.',
            output: { issues: ['NO_BLOCKING_ISSUE'] },
            actionableRecommendations: [recommendation],
            createdAt: '2026-04-16T00:10:00.500Z',
          },
        ],
        actionableRecommendations: [recommendation],
      },
      toolCalls: [],
      stepCount: 1,
      action: 'run',
      sourceExecutionId: null,
      recommendationExecution: null,
      snapshots: {
        before: true,
        after: true,
      },
      diff: null,
    };
    appendAgenticExecutionHistoryRecord(sourceRecord);

    const executeResponse = await POST_EXECUTE_APPROVED(
      new NextRequest('http://localhost/api/agentic/recommendations/execute-approved', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-rey30-project': PROJECT_KEY,
        },
        body: JSON.stringify({
          executionId: sourceRecord.id,
          slot: SLOT,
          maxIterations: 3,
        }),
      })
    );
    const executePayload = await executeResponse.json();
    const projectAfterBlockedExecution = readEditorProjectRecord({
      userId: USER_ID,
      projectKey: PROJECT_KEY,
      slot: SLOT,
    });
    const mutationIndex = readAgenticRecommendationMutationIndex({
      userId: USER_ID,
      projectKey: PROJECT_KEY,
      slot: SLOT,
    });

    expect(executeResponse.status).toBe(409);
    expect(executePayload).toMatchObject({
      success: false,
      approved: false,
      persisted: false,
      code: 'MUTATING_TOOL_ROLLBACK_TARGET_CONTRACT_FAILED',
      sourceExecutionId: sourceRecord.id,
      approvedRecommendationKeys: [recommendation.approvalKey],
      rollbackTargetFailures: [
        expect.objectContaining({
          toolName: 'asset.reindex',
          recommendationKeys: [recommendation.approvalKey],
        }),
      ],
      recommendationExecution: {
        sourceExecutionId: sourceRecord.id,
        recommendationKeys: [recommendation.approvalKey],
        unlockedMutations: [
          expect.objectContaining({
            toolName: 'asset.reindex',
            evidenceIds: expect.arrayContaining([expect.any(String)]),
            targets: [],
          }),
        ],
      },
    });
    expect(JSON.stringify(projectAfterBlockedExecution?.saveData)).toBe(originalSaveDataJson);
    expect(mutationIndex.recommendations).toEqual({});
  });

  it('detects mutating recommendation links without rollbackable targets before persistence', () => {
    const failures = findRollbackTargetContractFailures({
      sourceExecutionId: 'source-with-unsafe-mutation',
      recommendationIds: ['rec-unsafe'],
      recommendationKeys: ['scene.analyze:UNSAFE:asset.reindex'],
      recommendations: [
        {
          id: 'rec-unsafe',
          approvalKey: 'scene.analyze:UNSAFE:asset.reindex',
          summary: 'Unsafe mutation recommendation.',
        },
      ],
      unlockedMutations: [
        {
          toolCallId: 'tool-unsafe',
          toolName: 'asset.reindex',
          stepId: 'step-unsafe',
          recommendationIds: ['rec-unsafe'],
          recommendationKeys: ['scene.analyze:UNSAFE:asset.reindex'],
          evidenceIds: ['evidence-build-report-only'],
          targets: [],
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
    });

    expect(failures).toEqual([
      expect.objectContaining({
        toolCallId: 'tool-unsafe',
        toolName: 'asset.reindex',
        reason: expect.stringContaining('rollbackable target'),
      }),
    ]);
  });
});
