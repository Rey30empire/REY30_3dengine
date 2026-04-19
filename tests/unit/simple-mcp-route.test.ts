import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

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

describe('simple mcp route', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns only the reduced MCP surface', async () => {
    requireSessionMock.mockResolvedValue({
      id: 'editor-1',
      role: 'EDITOR',
      email: 'editor@example.com',
      sessionId: 'session-1',
    });

    const { GET } = await import('@/app/api/simple-mcp/route');
    const response = await GET(new NextRequest('http://localhost/api/simple-mcp?action=tools'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(requireSessionMock).toHaveBeenCalledWith(expect.any(NextRequest), 'EDITOR');
    expect(payload.executionMode).toBe('server-curated');
    expect(payload.tools.map((tool: { name: string }) => tool.name)).toEqual([
      'tool.get_engine_state',
      'tool.get_project_tree',
      'tool.search_assets',
      'tool.get_selection',
    ]);
  });

  it('executes reduced tools and blocks tools outside the simple surface', async () => {
    requireSessionMock.mockResolvedValue({
      id: 'editor-1',
      role: 'EDITOR',
      email: 'editor@example.com',
      sessionId: 'session-1',
    });
    executeToolCallMock.mockResolvedValue({
      toolCallId: 'call_1',
      status: 'success',
      result: { entityIds: [] },
    });

    const { POST } = await import('@/app/api/simple-mcp/route');
    const response = await POST(
      new NextRequest('http://localhost/api/simple-mcp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          toolCalls: [
            { id: 'call_1', name: 'tool.get_selection', arguments: {} },
            { id: 'call_2', name: 'tool.get_viewport_camera', arguments: {} },
          ],
        }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(executeToolCallMock).toHaveBeenCalledTimes(1);
    expect(payload.results).toEqual([
      {
        toolCallId: 'call_1',
        status: 'success',
        result: { entityIds: [] },
      },
      {
        toolCallId: 'call_2',
        status: 'error',
        error: 'La herramienta solicitada no está disponible en MCP simple.',
      },
    ]);
  });

  it('returns a small context summary and deprecates prompt planning', async () => {
    requireSessionMock.mockResolvedValue({
      id: 'editor-1',
      role: 'EDITOR',
      email: 'editor@example.com',
      sessionId: 'session-1',
    });

    const { GET, PUT } = await import('@/app/api/simple-mcp/route');
    const contextResponse = await GET(
      new NextRequest('http://localhost/api/simple-mcp?action=context')
    );
    const contextPayload = await contextResponse.json();

    expect(contextResponse.status).toBe(200);
    expect(contextPayload).toEqual({
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
      executionMode: 'server-curated',
    });

    const deprecatedResponse = await PUT(
      new NextRequest('http://localhost/api/simple-mcp', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: 'crear personaje' }),
      })
    );
    const deprecatedPayload = await deprecatedResponse.json();

    expect(deprecatedResponse.status).toBe(410);
    expect(deprecatedPayload.error).toBe(
      'La planeación automática por MCP ahora vive dentro del asistente principal.'
    );
  });
});
