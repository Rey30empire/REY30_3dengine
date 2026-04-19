import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildAgenticPipelineMessageMetadata,
  canRunAgenticEditorCommand,
  formatAgenticEditorResult,
  runAgenticEditorCommand,
  runServerAgenticEditorCommand,
} from '@/engine/editor/ai/agenticCommandBridge';
import { createEditorProjectSaveData } from '@/engine/serialization';
import type { AgenticPipelineProgressEvent, PipelineExecutionState, ToolResult } from '@/engine/agentic';
import type { AgenticPipelineMessageMetadata } from '@/types/engine';
import { useEngineStore } from '@/store/editorStore';

function resetEditorStore() {
  useEngineStore.setState({
    projectName: 'Agentic Bridge Test',
    projectPath: '',
    isDirty: false,
    scenes: [],
    activeSceneId: null,
    entities: new Map(),
    assets: [],
    historyPast: [],
    historyFuture: [],
  });
}

describe('agentic command bridge', () => {
  beforeEach(() => {
    resetEditorStore();
  });

  it('detects supported editor commands without hijacking asset-only prompts', () => {
    expect(canRunAgenticEditorCommand('añade niebla, mejora la iluminación y reorganiza esta escena')).toBe(true);
    expect(canRunAgenticEditorCommand('crea un NPC con patrulla simple y colisiones correctas')).toBe(true);
    expect(canRunAgenticEditorCommand('crea una ciudad futurista')).toBe(true);
    expect(canRunAgenticEditorCommand('genera un personaje rigged en glb para descargar')).toBe(false);
    expect(canRunAgenticEditorCommand('hola, que puedes hacer?')).toBe(false);
  });

  it('runs a supported command through the editor-backed orchestrator', async () => {
    const progressEvents: AgenticPipelineProgressEvent[] = [];
    const result = await runAgenticEditorCommand(
      'añade niebla, mejora la iluminación y reorganiza esta escena',
      {
        onProgress: (event) => progressEvents.push(event),
      }
    );
    const store = useEngineStore.getState();
    const scene = store.activeSceneId ? store.scenes.find((item) => item.id === store.activeSceneId) : null;
    const progressStatuses = progressEvents.map((event) => event.status);

    expect(result.handled).toBe(true);
    expect(result.approved).toBe(true);
    expect(result.message).toContain('Pipeline agentic completado');
    expect(result.metadata?.approved).toBe(true);
    expect(result.metadata?.steps.length).toBeGreaterThan(0);
    expect(result.metadata?.tools.some((tool) => tool.name === 'environment.configureFog')).toBe(true);
    expect(result.metadata?.validation?.approved).toBe(true);
    expect(result.metadata?.traces.length).toBeGreaterThan(0);
    expect(progressStatuses).toContain('started');
    expect(progressStatuses).toContain('planning');
    expect(progressStatuses).toContain('step_running');
    expect(progressStatuses).toContain('validating');
    expect(progressStatuses).toContain('completed');
    expect(progressEvents.at(-1)?.completedSteps).toBe(progressEvents.at(-1)?.totalSteps);
    expect(scene?.environment.fog?.enabled).toBe(true);
  });

  it('creates a simple futuristic city through modeling tools', async () => {
    const result = await runAgenticEditorCommand('crea una ciudad futurista');
    const buildings = Array.from(useEngineStore.getState().entities.values()).filter((entity) =>
      entity.tags.includes('city')
    );

    expect(result.handled).toBe(true);
    expect(result.approved).toBe(true);
    expect(buildings.length).toBeGreaterThanOrEqual(5);
  });

  it('surfaces runtime scaffold metadata produced by build.export', () => {
    const toolResult: ToolResult = {
      callId: 'tool-call-export',
      toolName: 'build.export',
      success: true,
      message: 'Editor build export completed.',
      evidence: [],
      output: {
        artifactPath: 'output/builds/demo/demo-web.zip',
        artifacts: [],
        missingDeps: [],
        runtimeScaffold: {
          createdCamera: true,
          createdPlayer: true,
          entityIds: ['camera-1', 'player-1'],
          summaries: [
            'Created runtime export camera.',
            'Created runtime export player with controller and physics.',
          ],
        },
      },
      startedAt: '2026-04-16T00:00:00.000Z',
      completedAt: '2026-04-16T00:00:00.000Z',
    };
    const state: PipelineExecutionState = {
      pipelineId: 'pipeline-export-metadata',
      status: 'approved',
      iteration: 1,
      originalRequest: 'exporta esta escena',
      stepResults: [
        {
          stepId: 'step-export',
          agentRole: 'technical_integration',
          status: 'completed',
          toolCalls: [],
          toolResults: [toolResult],
          evidenceIds: [],
          errors: [],
          startedAt: '2026-04-16T00:00:00.000Z',
          completedAt: '2026-04-16T00:00:00.000Z',
        },
      ],
      toolResults: [toolResult],
      validationReports: [
        {
          id: 'validation-export',
          approved: true,
          confidence: 1,
          matchedRequirements: ['build.export', 'build.artifact.physical'],
          missingRequirements: [],
          incorrectOutputs: [],
          warnings: [],
          retryInstructions: [],
          evidenceReviewed: [],
          createdAt: '2026-04-16T00:00:00.000Z',
        },
      ],
      finalDecision: {
        approved: true,
        reportId: 'validation-export',
        reason: 'Final state matches the requested requirements.',
        nextPlanRequired: false,
        retryInstructions: [],
      },
      sharedMemory: {
        analyses: [],
        actionableRecommendations: [],
      },
      traces: [],
      createdAt: '2026-04-16T00:00:00.000Z',
      updatedAt: '2026-04-16T00:00:00.000Z',
    };

    const metadata = buildAgenticPipelineMessageMetadata(state);
    const message = formatAgenticEditorResult({ command: 'exporta esta escena', state });

    expect(metadata.runtimeScaffold?.createdCamera).toBe(true);
    expect(metadata.runtimeScaffold?.createdPlayer).toBe(true);
    expect(metadata.runtimeScaffold?.entityIds).toEqual(['camera-1', 'player-1']);
    expect(message).toContain('Runtime export añadido');
  });

  it('can run an opt-in server agentic command and reload the persisted remote project', async () => {
    const persistedSaveData = createEditorProjectSaveData(
      {
        ...useEngineStore.getState(),
        projectName: 'Server Persisted Agentic Project',
      },
      { markClean: true }
    );
    const metadata = {
      pipelineId: 'pipeline-server-agentic',
      approved: true,
      iteration: 1,
      status: 'approved',
      steps: [
        {
          id: 'step-export',
          title: 'Export scene',
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
        entityIds: ['camera-server', 'player-server'],
        summaries: ['Created runtime export camera.', 'Created runtime export player with controller and physics.'],
        sourceTool: 'build.export',
      },
      traces: [],
    } satisfies AgenticPipelineMessageMetadata;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/editor-project' && init?.method === 'POST') {
        return Response.json({
          success: true,
          projectKey: 'agentic_bridge_test',
          slot: 'editor_project_current',
        });
      }
      if (url === '/api/agentic' && init?.method === 'POST') {
        return Response.json({
          success: true,
          approved: true,
          persisted: true,
          pipeline: {
            messageMetadata: metadata,
            runtimeScaffold: metadata.runtimeScaffold,
            artifactPath: 'output/builds/server-agentic/server-agentic-web.zip',
          },
        });
      }
      if (url.startsWith('/api/editor-project?') && init?.method !== 'POST') {
        return Response.json({
          success: true,
          active: true,
          saveData: persistedSaveData,
        });
      }
      return Response.json({ error: 'unexpected request' }, { status: 500 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await runServerAgenticEditorCommand('exporta esta escena para web', {
      projectName: 'Agentic Bridge Test',
      maxIterations: 1,
    });

    expect(result.handled).toBe(true);
    expect(result.approved).toBe(true);
    expect(result.message).toContain('Pipeline agentic server completado');
    expect(result.metadata?.runtimeScaffold?.createdCamera).toBe(true);
    expect(result.metadata?.runtimeScaffold?.createdPlayer).toBe(true);
    expect(useEngineStore.getState().projectName).toBe('Server Persisted Agentic Project');
    expect(fetchMock).toHaveBeenCalledWith('/api/editor-project', expect.objectContaining({ method: 'POST' }));
    expect(fetchMock).toHaveBeenCalledWith('/api/agentic', expect.objectContaining({ method: 'POST' }));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/editor-project?'), expect.any(Object));
  });
});
