import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { NextRequest } from 'next/server';
import { createDefaultAutomationPermissions, createDefaultEditorState } from '@/store/editorStore.utils';
import type { EditorSessionSnapshot } from '@/lib/editor-session-snapshot';

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
const executeToolCallMock = vi.fn();
const getContextMock = vi.fn(() => ({
  availableTools: [],
  engineState: {
    version: '1.0.0',
    fps: 60,
    frameTime: 16.67,
    gpuMemory: 0,
    systemMemory: 0,
    openSceneId: null,
    selectedEntityIds: [],
    activeTool: 'select',
    aiMode: 'API',
  },
  projectTree: {
    type: 'folder',
    name: 'Project',
    path: '/',
    children: [],
  },
  constraints: {
    targetFps: 60,
    targetResolution: { width: 1920, height: 1080 },
    maxMemoryMB: 2048,
    allowedExternalAssets: false,
    platforms: ['windows', 'linux', 'macos', 'web'],
  },
  memory: {
    style: '',
    targetAudience: '',
    genre: '',
    artStyle: '',
    previousDecisions: [],
  },
}));

vi.mock('@/lib/security/auth', () => ({
  requireSession: requireSessionMock,
  authErrorToResponse: authErrorToResponseMock,
}));

vi.mock('@/engine/mcp/MCPGateway', () => ({
  getMCPGateway: () => ({
    getContext: getContextMock,
    executeToolCall: executeToolCallMock,
  }),
}));

const ORIGINAL_EDITOR_SESSION_ROOT = process.env.REY30_EDITOR_SESSION_ROOT;
const cleanupDirs = new Set<string>();

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
    engineMode: 'MODE_MANUAL',
    aiMode: 'OFF',
    aiEnabled: false,
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

async function withTempEditorSessionRoot<T>(run: () => Promise<T>) {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'rey30-mcp-route-session-'));
  cleanupDirs.add(tempRoot);
  process.env.REY30_EDITOR_SESSION_ROOT = tempRoot;
  try {
    return await run();
  } finally {
    if (ORIGINAL_EDITOR_SESSION_ROOT === undefined) {
      delete process.env.REY30_EDITOR_SESSION_ROOT;
    } else {
      process.env.REY30_EDITOR_SESSION_ROOT = ORIGINAL_EDITOR_SESSION_ROOT;
    }
  }
}

describe('mcp route', () => {
  afterEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    await import('@/lib/server/editor-session-bridge').then(({ resetEditorSessionBridgeForTest }) => {
      resetEditorSessionBridgeForTest();
    });
    await Promise.all(
      Array.from(cleanupDirs).map(async (dir) => {
        await rm(dir, { recursive: true, force: true }).catch(() => undefined);
        cleanupDirs.delete(dir);
      })
    );
  });

  it('requires editor access and returns registry-backed tools with route availability', async () => {
    requireSessionMock.mockResolvedValue({
      id: 'editor-1',
      role: 'EDITOR',
      email: 'editor@example.com',
      sessionId: 'session-1',
    });

    const { GET } = await import('@/app/api/mcp/route');
    const response = await GET(new NextRequest('http://localhost/api/mcp?action=tools'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(requireSessionMock).toHaveBeenCalledWith(expect.any(NextRequest), 'EDITOR');
    expect(payload.executionMode).toBe('server-curated');
    expect(payload.categories).toContain('tool');
    expect(payload.tools.find((tool: { name: string }) => tool.name === 'tool.get_engine_state'))
      .toMatchObject({ availableInRoute: true, category: 'tool' });
    expect(payload.tools.find((tool: { name: string }) => tool.name === 'scene.create'))
      .toMatchObject({
        availableInRoute: true,
        category: 'scene',
        requiresActiveEditorSession: true,
      });
    expect(payload.tools.find((tool: { name: string }) => tool.name === 'render.create_light'))
      .toMatchObject({
        availableInRoute: true,
        category: 'render',
        requiresActiveEditorSession: true,
      });
  });

  it('executes compatible tools and blocks editor-session actions', async () => {
    requireSessionMock.mockResolvedValue({
      id: 'editor-1',
      role: 'EDITOR',
      email: 'editor@example.com',
      sessionId: 'session-1',
    });
    executeToolCallMock.mockResolvedValue({
      toolCallId: 'call_1',
      status: 'success',
      result: { fps: 60 },
    });

    const { POST } = await import('@/app/api/mcp/route');
    const response = await POST(
      new NextRequest('http://localhost/api/mcp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          toolCalls: [
            { id: 'call_1', name: 'tool.get_engine_state', arguments: {} },
            { id: 'call_2', name: 'scene.create', arguments: { name: 'Demo' } },
          ],
        }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(executeToolCallMock).toHaveBeenCalledTimes(1);
    expect(executeToolCallMock).toHaveBeenCalledWith({
      id: 'call_1',
      name: 'tool.get_engine_state',
      arguments: {},
    });
    expect(payload.results).toEqual([
      {
        toolCallId: 'call_1',
        status: 'success',
        result: { fps: 60 },
      },
      {
        toolCallId: 'call_2',
        status: 'error',
        error: 'Esta herramienta requiere una sesión activa del editor.',
      },
    ]);
  });

  it('executes scene mutations against the active editor session when available', async () => {
    await withTempEditorSessionRoot(async () => {
      requireSessionMock.mockResolvedValue({
        id: 'editor-1',
        role: 'EDITOR',
        email: 'editor@example.com',
        sessionId: 'session-1',
      });
      executeToolCallMock.mockResolvedValue({
        toolCallId: 'call_1',
        status: 'success',
        result: { sceneId: 'scene-2', name: 'Demo' },
      });

      const { upsertClientEditorSession } = await import('@/lib/server/editor-session-bridge');
      await upsertClientEditorSession({
        sessionId: 'bridge-1',
        userId: 'editor-1',
        projectKey: 'demo-project',
        snapshot: createSessionSnapshot('demo-project'),
        knownServerMutationVersion: 0,
      });

      const { POST } = await import('@/app/api/mcp/route');
      const response = await POST(
        new NextRequest('http://localhost/api/mcp', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-rey30-project': 'demo-project',
            'x-rey30-editor-session': 'bridge-1',
          },
          body: JSON.stringify({
            toolCalls: [{ id: 'call_1', name: 'scene.create', arguments: { name: 'Demo' } }],
          }),
        })
      );
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(executeToolCallMock).toHaveBeenCalledWith({
        id: 'call_1',
        name: 'scene.create',
        arguments: { name: 'Demo' },
      });
      expect(payload.results).toEqual([
        {
          toolCallId: 'call_1',
          status: 'success',
          result: { sceneId: 'scene-2', name: 'Demo' },
        },
      ]);
    });
  });

  it('rejects invalid tool call payloads and deprecates MCP prompt planning', async () => {
    requireSessionMock.mockResolvedValue({
      id: 'editor-1',
      role: 'EDITOR',
      email: 'editor@example.com',
      sessionId: 'session-1',
    });

    const { POST, PUT } = await import('@/app/api/mcp/route');
    const invalidResponse = await POST(
      new NextRequest('http://localhost/api/mcp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ toolCalls: [{ id: 'bad' }] }),
      })
    );
    const invalidPayload = await invalidResponse.json();

    expect(invalidResponse.status).toBe(400);
    expect(invalidPayload.error).toBe('La herramienta #1 no es válida.');

    const deprecatedResponse = await PUT(
      new NextRequest('http://localhost/api/mcp', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: 'haz un nivel' }),
      })
    );
    const deprecatedPayload = await deprecatedResponse.json();

    expect(deprecatedResponse.status).toBe(410);
    expect(deprecatedPayload.error).toBe(
      'La planeación automática por MCP ahora vive dentro del asistente principal.'
    );
  });
});
