import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { DEFAULT_API_CONFIG } from '@/lib/api-config';
import { DEFAULT_LOCAL_AI_CONFIG } from '@/lib/local-ai-config';
import type { UserScopedConfig } from '@/lib/security/user-api-config';

const VALID_CSRF = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const requireSessionMock = vi.fn();
const authErrorToResponseMock = vi.fn((error: unknown) =>
  Response.json(
    { error: String(error).includes('FORBIDDEN') ? 'No tienes permisos para esta acción.' : 'Debes iniciar sesión o usar un token de acceso.' },
    { status: String(error).includes('FORBIDDEN') ? 403 : 401 }
  )
);
const getUserScopedConfigMock = vi.fn();
const readAssistantDurableJobMock = vi.fn();
const syncAssistantPlannerFromJobViewMock = vi.fn();
const buildAssistantEphemeralJobMock = vi.fn((params: Record<string, unknown>) => ({
  jobId: params.taskId,
  projectKey: params.projectKey || 'untitled_project',
  kind: params.kind,
  backend: params.backend,
  status: params.status,
  stage: params.stage || params.status,
  progress: params.progress ?? null,
  persisted: false,
  refreshedFromProvider: params.refreshedFromProvider === true,
  requestedAt: null,
  updatedAt: null,
  readyToFinalize: params.readyToFinalize === true,
  error: params.error ?? null,
  asset:
    params.asset && typeof params.asset === 'object'
      ? {
          kind: params.kind,
          ...(params.asset as Record<string, unknown>),
        }
      : null,
}));

vi.mock('@/lib/security/auth', () => ({
  requireSession: requireSessionMock,
  authErrorToResponse: authErrorToResponseMock,
}));

vi.mock('@/lib/security/user-api-config', () => ({
  getUserScopedConfig: getUserScopedConfigMock,
}));

vi.mock('@/lib/server/assistant-job-surface', () => ({
  readAssistantDurableJob: readAssistantDurableJobMock,
  buildAssistantEphemeralJob: buildAssistantEphemeralJobMock,
}));

vi.mock('@/lib/server/assistant-planner-link', () => ({
  syncAssistantPlannerFromJobView: syncAssistantPlannerFromJobViewMock,
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

function jsonResponse(payload: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json',
    },
  });
}

function withNodeEnv<T>(value: string, run: () => Promise<T>): Promise<T> {
  const previousNodeEnv = process.env.NODE_ENV;
  (process.env as Record<string, string | undefined>).NODE_ENV = value;
  return run().finally(() => {
    (process.env as Record<string, string | undefined>).NODE_ENV = previousNodeEnv;
  });
}

describe('assistant generate route', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('returns opaque task tokens and resolves them server-side for the same user', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const config = createScopedConfig();
    config.apiConfig.openai.enabled = true;
    config.apiConfig.openai.apiKey = 'openai-key';
    config.apiConfig.openai.capabilities.video = true;

    requireSessionMock.mockResolvedValue({
      id: 'user-1',
      role: 'EDITOR',
      email: 'editor@example.com',
      sessionId: 'session-1',
    });
    getUserScopedConfigMock.mockResolvedValue(config);
    fetchMock.mockResolvedValueOnce(jsonResponse({ videoId: 'video_job_123' }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'processing' }));

    const { POST, GET } = await import('@/app/api/assistant/generate/route');

    const postResponse = await POST(
      new NextRequest('http://localhost/api/assistant/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'video',
          prompt: 'crea un trailer corto',
          planId: 'plan_bridge_1',
        }),
      })
    );
    const postPayload = await postResponse.json();

    expect(postResponse.status).toBe(200);
    expect(postPayload.success).toBe(true);
    expect(typeof postPayload.taskToken).toBe('string');
    expect(postPayload.taskToken).not.toContain('video_job_123');
    expect(postPayload.taskToken).not.toContain('openai');
    expect(postPayload.taskToken).not.toContain('runway');
    expect(postPayload.job).toMatchObject({
      jobId: 'video_job_123',
      projectKey: 'untitled_project',
      status: 'queued',
    });
    expect(syncAssistantPlannerFromJobViewMock).toHaveBeenCalledWith({
      userId: 'user-1',
      planId: 'plan_bridge_1',
      job: expect.objectContaining({
        jobId: 'video_job_123',
        status: 'queued',
      }),
    });

    const statusResponse = await GET(
      new NextRequest(
        `http://localhost/api/assistant/generate?taskToken=${encodeURIComponent(postPayload.taskToken)}`
      )
    );
    const statusPayload = await statusResponse.json();

    expect(statusResponse.status).toBe(200);
    expect(statusPayload.success).toBe(true);
    expect(statusPayload.status).toBe('processing');
    expect(statusPayload.job).toMatchObject({
      jobId: 'video_job_123',
      backend: 'openai-video',
      projectKey: 'untitled_project',
    });
    expect(syncAssistantPlannerFromJobViewMock).toHaveBeenLastCalledWith({
      userId: 'user-1',
      planId: 'plan_bridge_1',
      job: expect.objectContaining({
        jobId: 'video_job_123',
        status: 'processing',
      }),
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0] ?? '')).toContain(
      '/api/openai?action=videoStatus&videoId=video_job_123'
    );
    const secondCallHeaders = fetchMock.mock.calls[1]?.[1]?.headers as Headers;
    expect(secondCallHeaders.get('x-rey30-project')).toBe('untitled_project');
  });

  it('rejects encrypted task tokens when another user tries to reuse them', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const config = createScopedConfig();
    config.apiConfig.openai.enabled = true;
    config.apiConfig.openai.apiKey = 'openai-key';
    config.apiConfig.openai.capabilities.video = true;

    requireSessionMock
      .mockResolvedValueOnce({
        id: 'user-1',
        role: 'EDITOR',
        email: 'editor@example.com',
        sessionId: 'session-1',
      })
      .mockResolvedValueOnce({
        id: 'user-2',
        role: 'EDITOR',
        email: 'other@example.com',
        sessionId: 'session-2',
      });
    getUserScopedConfigMock.mockResolvedValue(config);
    fetchMock.mockResolvedValueOnce(jsonResponse({ videoId: 'video_job_123' }));

    const { POST, GET } = await import('@/app/api/assistant/generate/route');

    const postResponse = await POST(
      new NextRequest('http://localhost/api/assistant/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'video', prompt: 'crea un trailer corto' }),
      })
    );
    const postPayload = await postResponse.json();

    const statusResponse = await GET(
      new NextRequest(
        `http://localhost/api/assistant/generate?taskToken=${encodeURIComponent(postPayload.taskToken)}`
      )
    );
    const statusPayload = await statusResponse.json();

    expect(statusResponse.status).toBe(400);
    expect(statusPayload.error).toBe('taskToken inválido.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sanitizes provider failures on generation start', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const config = createScopedConfig();
    config.apiConfig.openai.enabled = true;
    config.apiConfig.openai.apiKey = 'openai-key';
    config.apiConfig.openai.capabilities.video = true;

    requireSessionMock.mockResolvedValue({
      id: 'user-1',
      role: 'EDITOR',
      email: 'editor@example.com',
      sessionId: 'session-1',
    });
    getUserScopedConfigMock.mockResolvedValue(config);
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'OpenAI quota exceeded' }, 503));

    const { POST } = await import('@/app/api/assistant/generate/route');

    const response = await POST(
      new NextRequest('http://localhost/api/assistant/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'video', prompt: 'crea un trailer corto' }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error).toBe('No se pudo iniciar la generación de video.');
    expect(JSON.stringify(payload)).not.toContain('quota');
    expect(JSON.stringify(payload)).not.toContain('OpenAI');
  });

  it('forwards origin, proxy, cookie, and csrf headers to unsafe internal POST requests', async () => {
    const { proxy } = await import('@/proxy');
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      (globalThis as { __rey30RateLimitStore?: Map<string, unknown> }).__rey30RateLimitStore = new Map();
      const proxyResponse = await withNodeEnv('production', async () =>
        proxy(
          new NextRequest(String(input), {
            method: init?.method || 'GET',
            headers: new Headers(init?.headers),
            body: typeof init?.body === 'string' ? init.body : undefined,
          })
        )
      );

      expect(proxyResponse.status).toBe(200);
      return jsonResponse({ videoId: 'video_job_123' });
    });
    vi.stubGlobal('fetch', fetchMock);

    const config = createScopedConfig();
    config.apiConfig.openai.enabled = true;
    config.apiConfig.openai.apiKey = 'openai-key';
    config.apiConfig.openai.capabilities.video = true;

    requireSessionMock.mockResolvedValue({
      id: 'user-1',
      role: 'EDITOR',
      email: 'editor@example.com',
      sessionId: 'session-1',
    });
    getUserScopedConfigMock.mockResolvedValue(config);

    const { POST } = await import('@/app/api/assistant/generate/route');

    const response = await POST(
      new NextRequest('http://localhost/api/assistant/generate', {
        method: 'POST',
        headers: {
          origin: 'https://rey30.example.com',
          'x-forwarded-host': 'rey30.example.com',
          'x-forwarded-proto': 'https',
          'x-rey30-csrf': VALID_CSRF,
          cookie: `rey30_session=session_123; rey30_csrf=${VALID_CSRF}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ kind: 'video', prompt: 'crea un trailer corto' }),
      })
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const forwardedHeaders = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(forwardedHeaders.get('origin')).toBe('https://rey30.example.com');
    expect(forwardedHeaders.get('x-forwarded-host')).toBe('rey30.example.com');
    expect(forwardedHeaders.get('x-forwarded-proto')).toBe('https');
    expect(forwardedHeaders.get('x-rey30-csrf')).toBe(VALID_CSRF);
    expect(forwardedHeaders.get('cookie')).toContain(`rey30_csrf=${VALID_CSRF}`);
  });

  it('sanitizes failed character status details while preserving the task state', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const config = createScopedConfig();

    requireSessionMock.mockResolvedValue({
      id: 'user-1',
      role: 'EDITOR',
      email: 'editor@example.com',
      sessionId: 'session-1',
    });
    getUserScopedConfigMock.mockResolvedValue(config);
    fetchMock.mockResolvedValueOnce(jsonResponse({ jobId: 'character_job_123', status: 'queued' }));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ status: 'failed', progress: 100, stage: 'failed', error: 'GPU worker timeout' })
    );

    const { POST, GET } = await import('@/app/api/assistant/generate/route');

    const startResponse = await POST(
      new NextRequest('http://localhost/api/assistant/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'character', prompt: 'crea un guerrero' }),
      })
    );
    const startPayload = await startResponse.json();

    const statusResponse = await GET(
      new NextRequest(
        `http://localhost/api/assistant/generate?taskToken=${encodeURIComponent(startPayload.taskToken)}`
      )
    );
    const statusPayload = await statusResponse.json();

    expect(statusResponse.status).toBe(200);
    expect(statusPayload.status).toBe('failed');
    expect(statusPayload.error).toBe('No se pudo completar el personaje.');
    expect(JSON.stringify(statusPayload)).not.toContain('GPU worker timeout');
  });

  it('falls back to the durable job state when provider refresh fails', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const config = createScopedConfig();
    config.apiConfig.openai.enabled = true;
    config.apiConfig.openai.apiKey = 'openai-key';
    config.apiConfig.openai.capabilities.video = true;

    requireSessionMock.mockResolvedValue({
      id: 'user-1',
      role: 'EDITOR',
      email: 'editor@example.com',
      sessionId: 'session-1',
    });
    getUserScopedConfigMock.mockResolvedValue(config);
    fetchMock.mockResolvedValueOnce(jsonResponse({ videoId: 'video_job_123' }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'provider timeout' }, 503));
    readAssistantDurableJobMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        jobId: 'video_job_123',
        projectKey: 'untitled_project',
        kind: 'video',
        backend: 'openai-video',
        status: 'processing',
        stage: 'queued',
        progress: null,
        persisted: true,
        refreshedFromProvider: false,
        requestedAt: '2026-04-04T10:00:00.000Z',
        updatedAt: '2026-04-04T10:01:00.000Z',
        readyToFinalize: false,
        error: null,
        asset: null,
      });

    const { POST, GET } = await import('@/app/api/assistant/generate/route');

    const startResponse = await POST(
      new NextRequest('http://localhost/api/assistant/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'video', prompt: 'crea un trailer corto' }),
      })
    );
    const startPayload = await startResponse.json();

    const statusResponse = await GET(
      new NextRequest(
        `http://localhost/api/assistant/generate?taskToken=${encodeURIComponent(startPayload.taskToken)}`
      )
    );
    const statusPayload = await statusResponse.json();

    expect(statusResponse.status).toBe(200);
    expect(statusPayload.status).toBe('processing');
    expect(statusPayload.job).toMatchObject({
      persisted: true,
      refreshedFromProvider: false,
      jobId: 'video_job_123',
    });
  });

  it('syncs finalized character results back into the planner bridge', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const config = createScopedConfig();

    requireSessionMock.mockResolvedValue({
      id: 'user-1',
      role: 'EDITOR',
      email: 'editor@example.com',
      sessionId: 'session-1',
    });
    getUserScopedConfigMock.mockResolvedValue(config);
    fetchMock.mockResolvedValueOnce(jsonResponse({ jobId: 'character_job_123', status: 'queued' }));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        asset: {
          path: 'packages/hero_package.glb',
        },
        packagePath: 'packages/hero_package.glb',
        packageSummary: {
          files: 3,
        },
      })
    );

    const { POST } = await import('@/app/api/assistant/generate/route');

    const startResponse = await POST(
      new NextRequest('http://localhost/api/assistant/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'character',
          prompt: 'crea un guerrero',
          planId: 'plan_bridge_character',
        }),
      })
    );
    const startPayload = await startResponse.json();

    const finalizeResponse = await POST(
      new NextRequest('http://localhost/api/assistant/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'character',
          operation: 'finalize',
          prompt: 'crea un guerrero',
          planId: 'plan_bridge_character',
          taskToken: startPayload.taskToken,
        }),
      })
    );
    const finalizePayload = await finalizeResponse.json();

    expect(finalizeResponse.status).toBe(200);
    expect(finalizePayload.status).toBe('completed');
    expect(finalizePayload.asset).toMatchObject({
      kind: 'character',
      path: 'packages/hero_package.glb',
    });
    expect(finalizePayload.job).toMatchObject({
      jobId: 'character_job_123',
      status: 'completed',
      stage: 'finalized',
      asset: {
        kind: 'character',
        path: 'packages/hero_package.glb',
      },
    });
    expect(syncAssistantPlannerFromJobViewMock).toHaveBeenLastCalledWith({
      userId: 'user-1',
      planId: 'plan_bridge_character',
      job: expect.objectContaining({
        jobId: 'character_job_123',
        status: 'completed',
        stage: 'finalized',
        asset: {
          kind: 'character',
          path: 'packages/hero_package.glb',
        },
      }),
    });
  });

  it('forwards origin, proxy, cookie, and csrf headers to unsafe internal DELETE requests', async () => {
    const { proxy } = await import('@/proxy');
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = String(init?.method || 'GET').toUpperCase();
      if (method === 'DELETE') {
        (globalThis as { __rey30RateLimitStore?: Map<string, unknown> }).__rey30RateLimitStore = new Map();
        const proxyResponse = await withNodeEnv('production', async () =>
          proxy(
            new NextRequest(String(input), {
              method,
              headers: new Headers(init?.headers),
            })
          )
        );
        expect(proxyResponse.status).toBe(200);
        return jsonResponse({ status: 'canceled', stage: 'canceled', progress: 100 });
      }

      return jsonResponse({ jobId: 'character_job_123', status: 'queued' });
    });
    vi.stubGlobal('fetch', fetchMock);

    const config = createScopedConfig();

    requireSessionMock.mockResolvedValue({
      id: 'user-1',
      role: 'EDITOR',
      email: 'editor@example.com',
      sessionId: 'session-1',
    });
    getUserScopedConfigMock.mockResolvedValue(config);

    const { POST, DELETE } = await import('@/app/api/assistant/generate/route');

    const startResponse = await POST(
      new NextRequest('http://localhost/api/assistant/generate', {
        method: 'POST',
        headers: {
          origin: 'https://rey30.example.com',
          'x-forwarded-host': 'rey30.example.com',
          'x-forwarded-proto': 'https',
          'x-rey30-csrf': VALID_CSRF,
          cookie: `rey30_session=session_123; rey30_csrf=${VALID_CSRF}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ kind: 'character', prompt: 'crea un guerrero' }),
      })
    );
    const startPayload = await startResponse.json();

    const cancelResponse = await DELETE(
      new NextRequest(
        `http://localhost/api/assistant/generate?taskToken=${encodeURIComponent(startPayload.taskToken)}`,
        {
          method: 'DELETE',
          headers: {
            origin: 'https://rey30.example.com',
            'x-forwarded-host': 'rey30.example.com',
            'x-forwarded-proto': 'https',
            'x-rey30-csrf': VALID_CSRF,
            cookie: `rey30_session=session_123; rey30_csrf=${VALID_CSRF}`,
          },
        }
      )
    );

    expect(cancelResponse.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const forwardedHeaders = fetchMock.mock.calls[1]?.[1]?.headers as Headers;
    expect(forwardedHeaders.get('origin')).toBe('https://rey30.example.com');
    expect(forwardedHeaders.get('x-forwarded-host')).toBe('rey30.example.com');
    expect(forwardedHeaders.get('x-forwarded-proto')).toBe('https');
    expect(forwardedHeaders.get('x-rey30-csrf')).toBe(VALID_CSRF);
    expect(forwardedHeaders.get('cookie')).toContain(`rey30_csrf=${VALID_CSRF}`);
  });
});
