import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { DEFAULT_API_CONFIG } from '@/lib/api-config';
import { DEFAULT_LOCAL_AI_CONFIG } from '@/lib/local-ai-config';
import type { UserScopedConfig } from '@/lib/security/user-api-config';
import { createDefaultAutomationPermissions, createDefaultEditorState } from '@/store/editorStore.utils';
import type { EditorSessionSnapshot } from '@/lib/editor-session-snapshot';

const requireSessionMock = vi.fn();
const logSecurityEventMock = vi.fn();
const hasRequiredRoleMock = vi.fn((role: string, minimum: string) => {
  const rank = { VIEWER: 1, EDITOR: 2, OWNER: 3 } as const;
  return rank[role as keyof typeof rank] >= rank[minimum as keyof typeof rank];
});
const getUserScopedConfigMock = vi.fn();
const touchProviderUsageMock = vi.fn();
const assertUsageAllowedMock = vi.fn();
const isUsageLimitErrorMock = vi.fn(() => false);
const recordUsageMock = vi.fn();
const normalizeProjectKeyMock = vi.fn((value: string | null) => value || 'untitled_project');
const recordProjectUsageMock = vi.fn();
const createCorrelationIdMock = vi.fn(() => 'corr-test-ai-chat');
const logErrorWithCorrelationMock = vi.fn();
const publicErrorResponseMock = vi.fn((params: { status: number; error: string; correlationId: string }) =>
  Response.json(
    {
      error: params.error,
      correlationId: params.correlationId,
    },
    { status: params.status }
  )
);
const fetchRemoteJsonMock = vi.fn();
const executeMcpToolCallsMock = vi.fn();
const resolveEditorSessionRecordMock = vi.fn();
const applyEditorSessionMutationMock = vi.fn();
const ensureGeneratedScriptInLibraryMock = vi.fn();
type MutableEnv = Record<string, string | undefined>;

vi.mock('@/lib/security/auth', () => ({
  requireSession: requireSessionMock,
  logSecurityEvent: logSecurityEventMock,
  hasRequiredRole: hasRequiredRoleMock,
}));

vi.mock('@/lib/security/user-api-config', () => ({
  getUserScopedConfig: getUserScopedConfigMock,
  touchProviderUsage: touchProviderUsageMock,
}));

vi.mock('@/lib/security/usage-governance', () => ({
  assertUsageAllowed: assertUsageAllowedMock,
  isUsageLimitError: isUsageLimitErrorMock,
  recordUsage: recordUsageMock,
}));

vi.mock('@/lib/security/usage-finops', () => ({
  normalizeProjectKey: normalizeProjectKeyMock,
  recordProjectUsage: recordProjectUsageMock,
}));

vi.mock('@/lib/security/public-error', () => ({
  createCorrelationId: createCorrelationIdMock,
  logErrorWithCorrelation: logErrorWithCorrelationMock,
  publicErrorResponse: publicErrorResponseMock,
}));

vi.mock('@/lib/security/remote-fetch', () => ({
  fetchRemoteJson: fetchRemoteJsonMock,
  RemoteFetchError: class RemoteFetchError extends Error {
    code: string;
    status: number;
    constructor(code: string, message: string, status = 502) {
      super(message);
      this.code = code;
      this.status = status;
    }
  },
}));

vi.mock('@/lib/server/mcp-surface', () => ({
  executeMcpToolCalls: executeMcpToolCallsMock,
}));

vi.mock('@/lib/server/editor-session-bridge', () => ({
  resolveEditorSessionRecord: resolveEditorSessionRecordMock,
  applyEditorSessionMutation: applyEditorSessionMutationMock,
}));

vi.mock('@/lib/server/generated-script-library', () => ({
  ensureGeneratedScriptInLibrary: ensureGeneratedScriptInLibraryMock,
}));

function createScopedConfig(): UserScopedConfig {
  return {
    apiConfig: structuredClone(DEFAULT_API_CONFIG),
    localConfig: structuredClone(DEFAULT_LOCAL_AI_CONFIG),
    hasSecrets: {
      openai: false,
      meshy: false,
      runway: false,
      ollama: false,
      vllm: false,
      llamacpp: false,
    },
  };
}

function createSessionSnapshot(projectName = 'demo-project'): EditorSessionSnapshot {
  return {
    version: 1,
    projectName,
    projectPath: '',
    isDirty: false,
    scenes: [
      {
        id: 'scene-1',
        name: 'Main Scene',
        rootEntities: [],
        entityIds: [],
        collections: [],
        environment: {
          skybox: 'studio',
          ambientLight: { r: 0.5, g: 0.5, b: 0.5 },
          ambientIntensity: 1,
          environmentIntensity: 1,
          environmentRotation: 0,
          directionalLightIntensity: 1.2,
          directionalLightAzimuth: 45,
          directionalLightElevation: 55,
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
        createdAt: '2026-03-30T00:00:00.000Z',
        updatedAt: '2026-03-30T00:00:00.000Z',
      },
    ],
    activeSceneId: 'scene-1',
    entities: [],
    assets: [],
    engineMode: 'MODE_HYBRID',
    aiMode: 'API',
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
  };
}

async function withNodeEnv<T>(
  nextNodeEnv: string,
  callback: () => Promise<T>
): Promise<T> {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousLocalOwnerMode = process.env.REY30_LOCAL_OWNER_MODE;
  const previousLocalProviderAllowRemote = process.env.REY30_LOCAL_PROVIDER_ALLOW_REMOTE;

  (process.env as MutableEnv).NODE_ENV = nextNodeEnv;
  delete process.env.REY30_LOCAL_OWNER_MODE;
  delete process.env.REY30_LOCAL_PROVIDER_ALLOW_REMOTE;

  try {
    return await callback();
  } finally {
    if (previousNodeEnv === undefined) {
      delete (process.env as MutableEnv).NODE_ENV;
    } else {
      (process.env as MutableEnv).NODE_ENV = previousNodeEnv;
    }

    if (previousLocalOwnerMode === undefined) {
      delete process.env.REY30_LOCAL_OWNER_MODE;
    } else {
      process.env.REY30_LOCAL_OWNER_MODE = previousLocalOwnerMode;
    }

    if (previousLocalProviderAllowRemote === undefined) {
      delete process.env.REY30_LOCAL_PROVIDER_ALLOW_REMOTE;
    } else {
      process.env.REY30_LOCAL_PROVIDER_ALLOW_REMOTE = previousLocalProviderAllowRemote;
    }
  }
}

describe('ai chat route', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns a generic assistant message when routed chat is unavailable in remote mode', async () => {
    const config = createScopedConfig();
    config.apiConfig.routing.chat = 'openai';
    config.apiConfig.openai.enabled = false;
    config.apiConfig.openai.apiKey = '';

    requireSessionMock.mockResolvedValue({
      id: 'user-1',
      role: 'EDITOR',
      email: 'editor@example.com',
      sessionId: 'session-1',
    });
    getUserScopedConfigMock.mockResolvedValue(config);

    const { POST } = await import('@/app/api/ai-chat/route');
    const response = await POST(
      new NextRequest('http://localhost/api/ai-chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: 'hola' }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toBe('El chat del asistente no está disponible para esta sesión.');
    expect(payload.receipt).toMatchObject({
      source: 'provider-chat',
      provider: 'openai',
      outcome: 'provider_unavailable',
      handledSceneAction: false,
      sceneUpdated: false,
    });
    expect(JSON.stringify(payload)).not.toContain('OpenAI');
    expect(fetchRemoteJsonMock).not.toHaveBeenCalled();
  });

  it('returns a generic assistant message when local chat is unavailable', async () => {
    const config = createScopedConfig();
    config.apiConfig.routing.chat = 'local';
    config.localConfig.routing.chat = 'ollama';
    config.localConfig.ollama.enabled = false;
    config.localConfig.vllm.enabled = false;
    config.localConfig.llamacpp.enabled = false;

    requireSessionMock.mockResolvedValue({
      id: 'user-1',
      role: 'EDITOR',
      email: 'editor@example.com',
      sessionId: 'session-1',
    });
    getUserScopedConfigMock.mockResolvedValue(config);

    const { POST } = await import('@/app/api/ai-chat/route');
    const response = await POST(
      new NextRequest('http://localhost/api/ai-chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: 'hola' }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toBe('El chat del asistente no está disponible para esta sesión.');
    expect(payload.receipt).toMatchObject({
      source: 'provider-chat',
      provider: 'llamacpp',
      outcome: 'provider_unavailable',
    });
    expect(JSON.stringify(payload)).not.toContain('Ollama');
    expect(JSON.stringify(payload)).not.toContain('vLLM');
    expect(JSON.stringify(payload)).not.toContain('llama.cpp');
    expect(fetchRemoteJsonMock).not.toHaveBeenCalled();
  });

  it('treats blocked local provider policy as unavailable chat in production', async () => {
    const config = createScopedConfig();
    config.apiConfig.routing.chat = 'local';
    config.localConfig.routing.chat = 'ollama';
    config.localConfig.ollama.enabled = true;

    requireSessionMock.mockResolvedValue({
      id: 'user-1',
      role: 'EDITOR',
      email: 'editor@example.com',
      sessionId: 'session-1',
    });
    getUserScopedConfigMock.mockResolvedValue(config);

    await withNodeEnv('production', async () => {
      const { POST } = await import('@/app/api/ai-chat/route');
      const response = await POST(
        new NextRequest('http://localhost/api/ai-chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ prompt: 'hola' }),
        })
      );
      const payload = await response.json();

      expect(response.status).toBe(409);
      expect(payload.error).toBe('El chat del asistente no está disponible para esta sesión.');
      expect(payload.code).toBe('local_provider_remote_disabled');
      expect(payload.receipt).toMatchObject({
        source: 'provider-chat',
        provider: 'ollama',
        outcome: 'provider_unavailable',
      });
      expect(fetchRemoteJsonMock).not.toHaveBeenCalled();
    });
  });

  it('returns a generic assistant auth message when the session is missing', async () => {
    requireSessionMock.mockRejectedValue(new Error('UNAUTHORIZED'));

    const { POST } = await import('@/app/api/ai-chat/route');
    const response = await POST(
      new NextRequest('http://localhost/api/ai-chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: 'hola' }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error).toBe('Debes iniciar sesión para usar el asistente.');
    expect(payload.receipt).toMatchObject({
      source: 'provider-chat',
      provider: 'none',
      outcome: 'auth_required',
    });
    expect(JSON.stringify(payload)).not.toContain('AI Chat');
  });

  it('handles direct scene actions on the server without calling a remote provider', async () => {
    let entityCounter = 0;

    requireSessionMock.mockResolvedValue({
      id: 'user-1',
      role: 'EDITOR',
      email: 'editor@example.com',
      sessionId: 'session-1',
    });
    resolveEditorSessionRecordMock.mockReturnValue({
      sessionId: 'bridge-1',
      userId: 'user-1',
      projectKey: 'demo-project',
      snapshot: createSessionSnapshot('demo-project'),
      serverMutationVersion: 0,
      lastSeenAt: Date.now(),
      lastClientSyncAt: '2026-03-30T00:00:00.000Z',
      lastServerMutationAt: null,
      updatedBy: 'client',
    });
    applyEditorSessionMutationMock.mockResolvedValue(undefined);
    ensureGeneratedScriptInLibraryMock.mockResolvedValue({
      ok: true,
      created: true,
      relativePath: 'PlayerController.generated.ts',
      assetPath: '/scripts/PlayerController.generated.ts',
    });
    executeMcpToolCallsMock.mockImplementation(async (toolCalls: Array<{ id: string; name: string; arguments?: Record<string, unknown> }>) =>
      toolCalls.map((toolCall) => ({
        toolCallId: toolCall.id,
        status: 'success',
        result:
          toolCall.name === 'scene.create'
            ? { sceneId: 'scene-2', name: 'Nueva Escena' }
            : toolCall.name === 'entity.create'
              ? { entityId: `entity-${++entityCounter}`, name: toolCall.arguments?.name || 'Entity' }
              : {},
      }))
    );

    const { POST } = await import('@/app/api/ai-chat/route');
    const response = await POST(
      new NextRequest('http://localhost/api/ai-chat', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-rey30-project': 'demo-project',
          'x-rey30-editor-session': 'bridge-1',
        },
        body: JSON.stringify({ prompt: 'crea una escena con terreno y jugador' }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.handledSceneAction).toBe(true);
    expect(payload.sceneUpdated).toBe(true);
    expect(payload.receipt).toMatchObject({
      source: 'scene-action',
      provider: 'none',
      outcome: 'handled_scene_action',
      handledSceneAction: true,
      sceneUpdated: true,
    });
    expect(payload.text).toContain('Escena creada');
    expect(payload.text).toContain('Scripts auxiliares registrados');
    expect(JSON.stringify(payload)).not.toContain('PlayerController.generated.ts');
    expect(fetchRemoteJsonMock).not.toHaveBeenCalled();
    expect(getUserScopedConfigMock).not.toHaveBeenCalled();
    expect(recordUsageMock).not.toHaveBeenCalled();
    expect(ensureGeneratedScriptInLibraryMock).toHaveBeenCalledWith({
      scriptPath: '/scripts/PlayerController.generated.ts',
      prompt: 'crea una escena con terreno y jugador',
    });
    expect(applyEditorSessionMutationMock).toHaveBeenCalled();
  });

  it('creates a rigged character scene when the prompt asks for an animated character scene', async () => {
    let entityCounter = 0;

    requireSessionMock.mockResolvedValue({
      id: 'user-1',
      role: 'EDITOR',
      email: 'editor@example.com',
      sessionId: 'session-1',
    });
    resolveEditorSessionRecordMock.mockReturnValue({
      sessionId: 'bridge-1',
      userId: 'user-1',
      projectKey: 'demo-project',
      snapshot: createSessionSnapshot('demo-project'),
      serverMutationVersion: 0,
      lastSeenAt: Date.now(),
      lastClientSyncAt: '2026-03-30T00:00:00.000Z',
      lastServerMutationAt: null,
      updatedBy: 'client',
    });
    applyEditorSessionMutationMock.mockResolvedValue(undefined);
    ensureGeneratedScriptInLibraryMock.mockResolvedValue({
      ok: true,
      created: true,
      relativePath: 'PlayerController.generated.ts',
      assetPath: '/scripts/PlayerController.generated.ts',
    });
    executeMcpToolCallsMock.mockImplementation(
      async (toolCalls: Array<{ id: string; name: string; arguments?: Record<string, unknown> }>) =>
        toolCalls.map((toolCall) => ({
          toolCallId: toolCall.id,
          status: 'success',
          result:
            toolCall.name === 'scene.create'
              ? { sceneId: 'scene-2', name: 'Nueva Escena' }
              : toolCall.name === 'entity.create'
                ? { entityId: `entity-${++entityCounter}`, name: toolCall.arguments?.name || 'Entity' }
                : {},
        }))
    );

    const { POST } = await import('@/app/api/ai-chat/route');
    const response = await POST(
      new NextRequest('http://localhost/api/ai-chat', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-rey30-project': 'demo-project',
          'x-rey30-editor-session': 'bridge-1',
        },
        body: JSON.stringify({
          prompt: 'crea una escena con un personaje caminando, con rig y animacion walk',
        }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.handledSceneAction).toBe(true);
    expect(payload.sceneUpdated).toBe(true);
    expect(payload.receipt).toMatchObject({
      source: 'scene-action',
      provider: 'none',
      outcome: 'handled_scene_action',
    });
    expect(payload.text).toContain('Texturas y piezas del personaje aplicadas');
    expect(payload.text).toContain('Walk Cycle');

    const toolCalls = executeMcpToolCallsMock.mock.calls.flatMap(([calls]) => calls);
    const meshRendererCall = toolCalls.find(
      (toolCall) => toolCall.name === 'entity.add_component' && toolCall.arguments?.componentType === 'MeshRenderer'
    );
    const animatorCall = toolCalls.find(
      (toolCall) => toolCall.name === 'entity.add_component' && toolCall.arguments?.componentType === 'Animator'
    );

    expect(meshRendererCall?.arguments?.data).toMatchObject({
      characterBuilder: {
        baseBodyId: 'mannequin_a',
        skeletonId: 'human_base_v1',
      },
    });
    expect(
      (meshRendererCall?.arguments?.data as { characterBuilder?: { parts?: unknown[] } } | undefined)
        ?.characterBuilder?.parts
    ).toHaveLength(8);
    expect(animatorCall?.arguments?.data).toMatchObject({
      currentAnimation: 'Walk Cycle',
      parameters: {
        locomotion: 'walk',
      },
    });
    expect(fetchRemoteJsonMock).not.toHaveBeenCalled();
  });

  it('returns a permission message instead of mutating the scene for viewer-only access', async () => {
    requireSessionMock.mockResolvedValue({
      id: 'user-1',
      role: 'VIEWER',
      email: 'viewer@example.com',
      sessionId: 'session-1',
    });

    const { POST } = await import('@/app/api/ai-chat/route');
    const response = await POST(
      new NextRequest('http://localhost/api/ai-chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: 'crea un cubo' }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.handledSceneAction).toBe(true);
    expect(payload.sceneUpdated).toBe(false);
    expect(payload.receipt).toMatchObject({
      source: 'scene-action',
      provider: 'none',
      outcome: 'handled_scene_action',
      sceneUpdated: false,
    });
    expect(payload.text).toContain('Permisos insuficientes');
    expect(fetchRemoteJsonMock).not.toHaveBeenCalled();
    expect(executeMcpToolCallsMock).not.toHaveBeenCalled();
  });
});
