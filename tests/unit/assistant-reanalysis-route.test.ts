import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { NextRequest } from 'next/server';
import {
  createEditorProjectSaveData,
  type EditorProjectSaveState,
} from '@/engine/serialization';
import { createDefaultAutomationPermissions, createDefaultEditorState } from '@/store/editorStore.utils';
import {
  buildEditorProjectRecord,
  writeEditorProjectRecord,
} from '@/lib/server/editor-project-storage';

const requireSessionMock = vi.fn();
const authErrorToResponseMock = vi.fn((error: unknown) =>
  Response.json(
    {
      error: String(error).includes('FORBIDDEN')
        ? 'No tienes permisos para esta acción.'
        : 'Debes iniciar sesión o usar un token de acceso.',
    },
    { status: String(error).includes('FORBIDDEN') ? 403 : 401 }
  )
);

vi.mock('@/lib/security/auth', () => ({
  requireSession: requireSessionMock,
  authErrorToResponse: authErrorToResponseMock,
}));

const ORIGINAL_EDITOR_PROJECT_ROOT = process.env.REY30_EDITOR_PROJECT_ROOT;
const ORIGINAL_REANALYSIS_ROOT = process.env.REY30_REVIEW_REANALYSIS_ROOT;
const ORIGINAL_AI_AGENT_PLAN_ROOT = process.env.REY30_AI_AGENT_PLAN_ROOT;
const cleanupDirs = new Set<string>();

function createProjectState(projectName = 'Corrected Agentic Project'): EditorProjectSaveState {
  const cameraEntity = {
    id: 'camera-review',
    name: 'Review Camera',
    components: new Map(),
    parentId: null,
    children: [],
    active: true,
    tags: [],
  };
  const npcEntity = {
    id: 'npc-review',
    name: 'Review NPC',
    components: new Map(),
    parentId: null,
    children: [],
    active: true,
    tags: [],
  };

  return {
    projectName,
    projectPath: `C:/Projects/${projectName.replace(/\s+/g, '')}`,
    isDirty: false,
    scenes: [
      {
        id: 'scene-review-p2',
        name: 'Review P2 Scene',
        entities: [cameraEntity, npcEntity],
        rootEntities: ['camera-review', 'npc-review'],
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
          advancedLighting: {
            shadowQuality: 'medium',
            globalIllumination: { enabled: false, intensity: 1, bounceCount: 1 },
            bakedLightmaps: { enabled: false },
          },
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
        createdAt: new Date('2026-04-17T00:00:00.000Z'),
        updatedAt: new Date('2026-04-17T00:00:00.000Z'),
      },
    ],
    activeSceneId: 'scene-review-p2',
    entities: new Map([
      ['camera-review', cameraEntity],
      ['npc-review', npcEntity],
    ]),
    assets: [
      {
        id: 'asset-review-doc',
        name: 'review-blockout.glb',
        type: 'mesh',
        path: 'download/assets/mesh/uploads/review-blockout.glb',
        size: 2048,
        createdAt: new Date('2026-04-17T00:00:00.000Z'),
        metadata: { projectKey: 'corrected_agentic_project' },
      },
    ],
    engineMode: 'MODE_AI_FIRST',
    aiMode: 'LOCAL',
    aiEnabled: true,
    editor: createDefaultEditorState(),
    automationPermissions: createDefaultAutomationPermissions(),
    profiler: {
      fps: 60,
      frameTime: 16.67,
      cpuTime: 2,
      gpuTime: 3,
      memory: {
        used: 32,
        allocated: 64,
        textures: 1,
        meshes: 1,
        audio: 0,
      },
      drawCalls: 1,
      triangles: 12,
      vertices: 24,
    },
    scribProfiles: new Map(),
    activeScribEntityId: null,
    scribInstances: new Map(),
  };
}

async function withTempRoots<T>(run: () => Promise<T>) {
  const editorRoot = await mkdtemp(path.join(os.tmpdir(), 'rey30-editor-project-reanalysis-'));
  const reanalysisRoot = await mkdtemp(path.join(os.tmpdir(), 'rey30-review-reanalysis-'));
  const aiAgentPlanRoot = await mkdtemp(path.join(os.tmpdir(), 'rey30-ai-agent-plan-reanalysis-'));
  cleanupDirs.add(editorRoot);
  cleanupDirs.add(reanalysisRoot);
  cleanupDirs.add(aiAgentPlanRoot);
  process.env.REY30_EDITOR_PROJECT_ROOT = editorRoot;
  process.env.REY30_REVIEW_REANALYSIS_ROOT = reanalysisRoot;
  process.env.REY30_AI_AGENT_PLAN_ROOT = aiAgentPlanRoot;
  try {
    return await run();
  } finally {
    if (ORIGINAL_EDITOR_PROJECT_ROOT === undefined) {
      delete process.env.REY30_EDITOR_PROJECT_ROOT;
    } else {
      process.env.REY30_EDITOR_PROJECT_ROOT = ORIGINAL_EDITOR_PROJECT_ROOT;
    }
    if (ORIGINAL_REANALYSIS_ROOT === undefined) {
      delete process.env.REY30_REVIEW_REANALYSIS_ROOT;
    } else {
      process.env.REY30_REVIEW_REANALYSIS_ROOT = ORIGINAL_REANALYSIS_ROOT;
    }
    if (ORIGINAL_AI_AGENT_PLAN_ROOT === undefined) {
      delete process.env.REY30_AI_AGENT_PLAN_ROOT;
    } else {
      process.env.REY30_AI_AGENT_PLAN_ROOT = ORIGINAL_AI_AGENT_PLAN_ROOT;
    }
  }
}

function persistCorrectedProject() {
  const saveData = createEditorProjectSaveData(createProjectState(), { markClean: true });
  writeEditorProjectRecord(
    buildEditorProjectRecord({
      userId: 'editor-1',
      projectKey: 'Corrected Agentic Project',
      slot: 'p2',
      saveData,
    })
  );
}

async function delay(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCompletedReanalysis(GET: (request: NextRequest) => Promise<Response>, jobId: string) {
  let completedPayload: any = null;
  for (let index = 0; index < 20; index += 1) {
    await delay(20);
    const getResponse = await GET(
      new NextRequest(
        `http://localhost/api/assistant/reanalysis?projectKey=corrected_agentic_project&slot=p2&jobId=${jobId}`
      )
    );
    completedPayload = await getResponse.json();
    if (completedPayload.job?.status === 'completed') {
      break;
    }
  }
  return completedPayload;
}

function reanalysisJobPath(jobId: string) {
  return path.join(
    process.env.REY30_REVIEW_REANALYSIS_ROOT!,
    'editor-1',
    'corrected_agentic_project',
    `${jobId}.json`
  );
}

describe('assistant review reanalysis route', () => {
  afterEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    await Promise.all(
      Array.from(cleanupDirs).map(async (dir) => {
        await rm(dir, { recursive: true, force: true }).catch(() => undefined);
        cleanupDirs.delete(dir);
      })
    );
  });

  it('creates a persisted non-blocking reanalysis job and exposes a reviewable scope', async () => {
    await withTempRoots(async () => {
      requireSessionMock.mockResolvedValue({
        id: 'editor-1',
        role: 'EDITOR',
        email: 'editor@example.com',
        sessionId: 'session-1',
      });
      persistCorrectedProject();

      const { GET, POST } = await import('@/app/api/assistant/reanalysis/route');
      const response = await POST(
        new NextRequest('http://localhost/api/assistant/reanalysis?projectKey=Corrected%20Agentic%20Project', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            slot: 'p2',
            originalDocuments: [
              {
                id: 'original-agentic-brief',
                title: 'Brief original agentic',
                kind: 'markdown',
                content:
                  'El sistema debe usar orquestador multiagente, tools reales, timeline, validacion final estricta y auditoria trazable antes de mutar escenas 3D.',
              },
            ],
            detectedScope: {
              summary: 'P2 review to reanalysis debe producir un scope revisable sin mutar el proyecto.',
              focusAreas: ['persisted reanalysis job', 'reviewable scope', 'validation gate'],
              constraints: ['no bloquear el request', 'no mutar escenas ni assets'],
              exclusions: ['no ejecutar cambios agentic automaticamente'],
              confidence: 0.84,
              source: 'p2-recommendation',
            },
            reason: 'P2 review-to-reanalysis',
          }),
        })
      );
      const payload = await response.json();

      expect(response.status).toBe(202);
      expect(payload).toMatchObject({
        success: true,
        accepted: true,
        nonBlocking: true,
        projectKey: 'corrected_agentic_project',
        slot: 'p2',
        job: {
          status: 'queued',
          scope: null,
          projectRevision: {
            summary: {
              projectName: 'Corrected Agentic Project',
              sceneCount: 1,
              entityCount: 2,
              assetCount: 1,
            },
          },
        },
      });
      expect(payload.statusUrl).toContain('/api/assistant/reanalysis?projectKey=corrected_agentic_project');

      const completedPayload = await waitForCompletedReanalysis(GET, payload.job.id);

      expect(completedPayload.job).toMatchObject({
        id: payload.job.id,
        status: 'completed',
        scope: {
          status: 'draft_review',
          riskLevel: 'high',
          projectRevision: {
            checksum: {
              algorithm: 'sha256',
              value: expect.any(String),
            },
          },
          detectedScope: {
            summary: 'P2 review to reanalysis debe producir un scope revisable sin mutar el proyecto.',
          },
        },
      });
      expect(completedPayload.job.scope.reviewBlocks.map((block: { id: string }) => block.id)).toEqual(
        expect.arrayContaining([
          'corrected_project_revision',
          'original_documents_alignment',
          'detected_scope_review',
          'risk_gate',
          'acceptance_gate',
        ])
      );
      expect(completedPayload.job.scope.documents[0]).toMatchObject({
        id: 'original-agentic-brief',
        title: 'Brief original agentic',
        checksum: {
          algorithm: 'sha256',
          value: expect.any(String),
        },
      });

      const listResponse = await GET(
        new NextRequest('http://localhost/api/assistant/reanalysis?projectKey=corrected_agentic_project')
      );
      const listPayload = await listResponse.json();

      expect(listResponse.status).toBe(200);
      expect(listPayload.jobs).toHaveLength(1);
      expect(listPayload.jobs[0]).toHaveProperty('id', payload.job.id);
    });
  });

  it('rejects reanalysis when the corrected project is not persisted', async () => {
    await withTempRoots(async () => {
      requireSessionMock.mockResolvedValue({
        id: 'editor-1',
        role: 'EDITOR',
        email: 'editor@example.com',
        sessionId: 'session-1',
      });

      const { POST } = await import('@/app/api/assistant/reanalysis/route');
      const response = await POST(
        new NextRequest('http://localhost/api/assistant/reanalysis?projectKey=MissingProject', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            slot: 'p2',
            originalDocuments: [{ title: 'Brief', content: 'scope original' }],
            detectedScope: { summary: 'scope detectado' },
          }),
        })
      );
      const payload = await response.json();

      expect(response.status).toBe(409);
      expect(payload).toMatchObject({
        success: false,
        code: 'CORRECTED_PROJECT_NOT_FOUND',
      });
    });
  });

  it('persists block decisions and creates a P2 planner from approved blocks only', async () => {
    await withTempRoots(async () => {
      requireSessionMock.mockResolvedValue({
        id: 'editor-1',
        role: 'EDITOR',
        email: 'editor@example.com',
        sessionId: 'session-1',
      });
      persistCorrectedProject();

      const { GET, PATCH, POST } = await import('@/app/api/assistant/reanalysis/route');
      const createResponse = await POST(
        new NextRequest('http://localhost/api/assistant/reanalysis?projectKey=Corrected%20Agentic%20Project', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            slot: 'p2',
            originalDocuments: [
              {
                id: 'p2-doc',
                title: 'P2 scope original',
                kind: 'markdown',
                content:
                  'P2 debe persistir decisiones, conectar bloques aprobados al planner y evitar ejecutar bloques rechazados.',
              },
            ],
            detectedScope: {
              summary: 'Scope P2 revisable',
              focusAreas: ['persisted decisions', 'planner connection'],
              constraints: ['solo bloques aprobados'],
              confidence: 0.9,
            },
          }),
        })
      );
      const createPayload = await createResponse.json();
      const completedPayload = await waitForCompletedReanalysis(GET, createPayload.job.id);
      expect(completedPayload.job.status).toBe('completed');

      const approveProjectResponse = await PATCH(
        new NextRequest('http://localhost/api/assistant/reanalysis?projectKey=corrected_agentic_project', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'decide_block',
            jobId: createPayload.job.id,
            blockId: 'corrected_project_revision',
            decision: 'approved',
            note: 'Project corregido confirmado.',
          }),
        })
      );
      const approveProjectPayload = await approveProjectResponse.json();
      expect(approveProjectResponse.status).toBe(200);
      expect(approveProjectPayload.decision).toMatchObject({
        blockId: 'corrected_project_revision',
        decision: 'approved',
        decidedBy: 'editor@example.com',
      });

      const rejectRiskResponse = await PATCH(
        new NextRequest('http://localhost/api/assistant/reanalysis?projectKey=corrected_agentic_project', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'decide_block',
            jobId: createPayload.job.id,
            blockId: 'risk_gate',
            decision: 'rejected',
            note: 'No convertir riesgo en tarea ejecutable.',
          }),
        })
      );
      expect(rejectRiskResponse.status).toBe(200);

      const approveFocusResponse = await PATCH(
        new NextRequest('http://localhost/api/assistant/reanalysis?projectKey=corrected_agentic_project', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'decide_block',
            jobId: createPayload.job.id,
            blockId: 'focus_1_persisted_decisions',
            decision: 'approved',
          }),
        })
      );
      expect(approveFocusResponse.status).toBe(200);

      const plannerResponse = await PATCH(
        new NextRequest('http://localhost/api/assistant/reanalysis?projectKey=corrected_agentic_project', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'create_planner_from_approved_scope',
            jobId: createPayload.job.id,
            approvedBlockIds: ['focus_1_persisted_decisions'],
          }),
        })
      );
      const plannerPayload = await plannerResponse.json();

      expect(plannerResponse.status).toBe(200);
      expect(plannerPayload.tasks.map((task: { blockId: string }) => task.blockId)).toEqual([
        'focus_1_persisted_decisions',
      ]);
      expect(plannerPayload.tasks.map((task: { blockId: string }) => task.blockId)).not.toContain('risk_gate');
      expect(plannerPayload.tasks.map((task: { blockId: string }) => task.blockId)).not.toContain('corrected_project_revision');
      expect(plannerPayload.plan).toMatchObject({
        projectKey: 'corrected_agentic_project',
        selectedLevel: 'level1_copilot',
        customTasks: [
          expect.objectContaining({
            taskId: 'p2_task_focus_1_persisted_decisions',
            stageId: 'custom_p2_task_focus_1_persisted_decisions',
            sourceBlockId: 'focus_1_persisted_decisions',
            status: 'pending',
          }),
        ],
      });
      expect(plannerPayload.plan.prompt).toContain('Convertir SOLO estos bloques aprobados');
      expect(plannerPayload.plan.stages.map((stage: { stageId: string }) => stage.stageId)).toEqual([
        'custom_p2_task_focus_1_persisted_decisions',
      ]);
      expect(plannerPayload.plan.checkpoints.join('\n')).toContain('Ejecutar solo customTasks aprobadas');
      expect(plannerPayload.job.plannerLink).toMatchObject({
        planId: plannerPayload.plan.planId,
        approvedBlockIds: ['focus_1_persisted_decisions'],
      });
    });
  });

  it('manually retries failed and stale processing reanalysis jobs', async () => {
    await withTempRoots(async () => {
      requireSessionMock.mockResolvedValue({
        id: 'editor-1',
        role: 'EDITOR',
        email: 'editor@example.com',
        sessionId: 'session-1',
      });
      persistCorrectedProject();

      const { GET, PATCH, POST } = await import('@/app/api/assistant/reanalysis/route');
      const createResponse = await POST(
        new NextRequest('http://localhost/api/assistant/reanalysis?projectKey=Corrected%20Agentic%20Project', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            slot: 'p2',
            originalDocuments: [{ title: 'Brief', content: 'Reanalizar scope con retry manual.' }],
            detectedScope: { summary: 'Scope con retry', focusAreas: ['retry'] },
          }),
        })
      );
      const createPayload = await createResponse.json();
      await waitForCompletedReanalysis(GET, createPayload.job.id);

      const filePath = reanalysisJobPath(createPayload.job.id);
      const persisted = JSON.parse(await readFile(filePath, 'utf-8'));
      await writeFile(
        filePath,
        JSON.stringify(
          {
            ...persisted,
            status: 'failed',
            scope: null,
            error: 'forced failure for retry test',
            completedAt: new Date('2026-04-17T00:10:00.000Z').toISOString(),
          },
          null,
          2
        ),
        'utf-8'
      );

      const failedRetryResponse = await PATCH(
        new NextRequest('http://localhost/api/assistant/reanalysis?projectKey=corrected_agentic_project', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'retry',
            jobId: createPayload.job.id,
          }),
        })
      );
      const failedRetryPayload = await failedRetryResponse.json();

      expect(failedRetryResponse.status).toBe(200);
      expect(failedRetryPayload.job).toMatchObject({
        status: 'completed',
        error: null,
        scope: {
          status: 'draft_review',
        },
      });

      const afterFailedRetry = JSON.parse(await readFile(filePath, 'utf-8'));
      await writeFile(
        filePath,
        JSON.stringify(
          {
            ...afterFailedRetry,
            status: 'processing',
            scope: null,
            error: null,
            startedAt: new Date('2026-04-17T00:00:00.000Z').toISOString(),
            completedAt: null,
          },
          null,
          2
        ),
        'utf-8'
      );

      const staleRetryResponse = await PATCH(
        new NextRequest('http://localhost/api/assistant/reanalysis?projectKey=corrected_agentic_project', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'retry',
            jobId: createPayload.job.id,
            staleAfterMs: 0,
          }),
        })
      );
      const staleRetryPayload = await staleRetryResponse.json();

      expect(staleRetryResponse.status).toBe(200);
      expect(staleRetryPayload.job).toMatchObject({
        status: 'completed',
        scope: {
          status: 'draft_review',
        },
      });
    });
  });

  it('rejects empty original documents before creating a job', async () => {
    await withTempRoots(async () => {
      requireSessionMock.mockResolvedValue({
        id: 'editor-1',
        role: 'EDITOR',
        email: 'editor@example.com',
        sessionId: 'session-1',
      });
      persistCorrectedProject();

      const { POST } = await import('@/app/api/assistant/reanalysis/route');
      const response = await POST(
        new NextRequest('http://localhost/api/assistant/reanalysis?projectKey=Corrected%20Agentic%20Project', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            slot: 'p2',
            originalDocuments: [],
            detectedScope: { summary: 'scope detectado' },
          }),
        })
      );
      const payload = await response.json();

      expect(response.status).toBe(400);
      expect(payload).toMatchObject({
        success: false,
        code: 'ORIGINAL_DOCUMENTS_REQUIRED',
      });
    });
  });
});
