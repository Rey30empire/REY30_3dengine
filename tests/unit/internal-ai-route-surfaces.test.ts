import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { DEFAULT_API_CONFIG } from '@/lib/api-config';
import { DEFAULT_LOCAL_AI_CONFIG } from '@/lib/local-ai-config';
import type { UserScopedConfig } from '@/lib/security/user-api-config';

const requireSessionMock = vi.fn();
const authErrorToResponseMock = vi.fn((error: unknown) =>
  Response.json(
    { error: String(error).includes('FORBIDDEN') ? 'No tienes permisos para esta acción.' : 'Debes iniciar sesión o usar un token de acceso.' },
    { status: String(error).includes('FORBIDDEN') ? 403 : 401 }
  )
);
const logSecurityEventMock = vi.fn();
const getUserScopedConfigMock = vi.fn();
const touchProviderUsageMock = vi.fn();
const assertUsageAllowedMock = vi.fn();
const recordUsageMock = vi.fn();
const isUsageLimitErrorMock = vi.fn(() => false);
const normalizeProjectKeyMock = vi.fn(() => 'untitled_project');
const recordProjectUsageMock = vi.fn();
const createCorrelationIdMock = vi.fn(() => 'corr-test');
const logErrorWithCorrelationMock = vi.fn();
const publicErrorResponseMock = vi.fn(({ status, error }: { status: number; error: string }) =>
  Response.json({ error }, { status })
);
const fetchRemoteJsonMock = vi.fn();
const fetchRemoteTextMock = vi.fn();

vi.mock('@/lib/security/auth', () => ({
  requireSession: requireSessionMock,
  authErrorToResponse: authErrorToResponseMock,
  logSecurityEvent: logSecurityEventMock,
}));

vi.mock('@/lib/security/user-api-config', () => ({
  getUserScopedConfig: getUserScopedConfigMock,
  touchProviderUsage: touchProviderUsageMock,
}));

vi.mock('@/lib/security/usage-governance', () => ({
  assertUsageAllowed: assertUsageAllowedMock,
  recordUsage: recordUsageMock,
  isUsageLimitError: isUsageLimitErrorMock,
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
  fetchRemoteText: fetchRemoteTextMock,
  RemoteFetchError: class RemoteFetchError extends Error {
    status: number;
    code: string;

    constructor(status: number, code: string) {
      super(code);
      this.status = status;
      this.code = code;
    }
  },
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

describe('internal AI route surfaces', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.unstubAllGlobals();
    delete process.env.REY30_CHARACTER_BACKEND_URL;
  });

  it('provider status routes expose availability without leaking connection details', async () => {
    const config = createScopedConfig();
    config.apiConfig.openai.enabled = true;
    config.apiConfig.openai.apiKey = 'openai-key';
    config.apiConfig.meshy.enabled = true;
    config.apiConfig.meshy.apiKey = 'meshy-key';
    config.apiConfig.runway.enabled = true;
    config.apiConfig.runway.apiKey = 'runway-key';

    requireSessionMock.mockResolvedValue({
      id: 'user-1',
      role: 'EDITOR',
      email: 'editor@example.com',
      sessionId: 'session-1',
    });
    getUserScopedConfigMock.mockResolvedValue(config);

    const { GET: openaiGet } = await import('@/app/api/openai/route');
    const { GET: meshyGet } = await import('@/app/api/meshy/route');
    const { GET: runwayGet } = await import('@/app/api/runway/route');

    const openaiPayload = await (await openaiGet(new NextRequest('http://localhost/api/openai'))).json();
    const meshyPayload = await (await meshyGet(new NextRequest('http://localhost/api/meshy'))).json();
    const runwayPayload = await (await runwayGet(new NextRequest('http://localhost/api/runway'))).json();

    expect(openaiPayload).toEqual({ configured: true, available: true });
    expect(meshyPayload).toEqual({ configured: true, available: true });
    expect(runwayPayload).toEqual({ configured: true, available: true });
    expect('baseUrl' in openaiPayload).toBe(false);
    expect('model' in openaiPayload).toBe(false);
    expect('baseUrl' in meshyPayload).toBe(false);
    expect('baseUrl' in runwayPayload).toBe(false);
    expect('apiVersion' in runwayPayload).toBe(false);
  });

  it('character service routes hide backend-specific fields and raw failures', async () => {
    process.env.REY30_CHARACTER_BACKEND_URL = 'https://character.example.test';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    requireSessionMock.mockResolvedValue({
      id: 'user-1',
      role: 'EDITOR',
      email: 'editor@example.com',
      sessionId: 'session-1',
    });

    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'ok', profile: 'gpu-cluster-a', mode: 'remote' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'failed',
            progress: 100,
            stage: 'failed',
            error: 'GPU worker timeout',
            quality: { score: 0.91 },
            resultPath: '/srv/results/character.glb',
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }
        )
      );

    const { GET: characterHealthGet } = await import('@/app/api/character/jobs/health/route');
    const { GET: characterJobsGet } = await import('@/app/api/character/jobs/route');

    const healthPayload = await (
      await characterHealthGet(new NextRequest('http://localhost/api/character/jobs/health'))
    ).json();
    const statusPayload = await (
      await characterJobsGet(new NextRequest('http://localhost/api/character/jobs?jobId=job_123'))
    ).json();

    expect(healthPayload).toEqual({
      success: true,
      configured: true,
      available: true,
      status: 'ok',
      message: 'La creación de personajes está disponible.',
    });
    expect('profile' in healthPayload).toBe(false);
    expect('mode' in healthPayload).toBe(false);

    expect(statusPayload).toEqual({
      success: true,
      status: 'failed',
      progress: 100,
      stage: 'failed',
      error: 'No se pudo completar el personaje.',
      asset: null,
    });
    expect('jobId' in statusPayload).toBe(false);
    expect('quality' in statusPayload).toBe(false);
    expect('resultPath' in statusPayload).toBe(false);
    expect(JSON.stringify(statusPayload)).not.toContain('GPU worker timeout');
  });
});
