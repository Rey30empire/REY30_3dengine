import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { NextRequest } from 'next/server';
import { readProviderJobRecord, resetExternalIntegrationStorageForTest } from '@/lib/server/external-integration-store';
import { DEFAULT_API_CONFIG } from '@/lib/api-config';
import { DEFAULT_LOCAL_AI_CONFIG } from '@/lib/local-ai-config';
import type { UserScopedConfig } from '@/lib/security/user-api-config';

const requireSessionMock = vi.fn();
const logSecurityEventMock = vi.fn();
const getUserScopedConfigMock = vi.fn();
const touchProviderUsageMock = vi.fn();
const assertUsageAllowedMock = vi.fn();
const recordUsageMock = vi.fn();
const isUsageLimitErrorMock = vi.fn(() => false);
const normalizeProjectKeyMock = vi.fn((value?: string | null) =>
  String(value || 'untitled_project')
    .trim()
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .toLowerCase() || 'untitled_project'
);
const recordProjectUsageMock = vi.fn();
const createCorrelationIdMock = vi.fn(() => 'corr-provider-jobs');
const logErrorWithCorrelationMock = vi.fn();
const publicErrorResponseMock = vi.fn(
  ({ status, error }: { status: number; error: string }) =>
    Response.json({ error }, { status })
);
const fetchRemoteJsonMock = vi.fn();
const fetchRemoteTextMock = vi.fn();

vi.mock('@/lib/security/auth', () => ({
  requireSession: requireSessionMock,
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
  const config = {
    apiConfig: structuredClone(DEFAULT_API_CONFIG),
    localConfig: structuredClone(DEFAULT_LOCAL_AI_CONFIG),
    hasSecrets: {
      openai: true,
      meshy: true,
      runway: true,
      ollama: false,
      vllm: false,
      llamacpp: false,
    },
  } satisfies UserScopedConfig;

  config.apiConfig.openai.enabled = true;
  config.apiConfig.openai.apiKey = 'openai-key';
  config.apiConfig.meshy.enabled = true;
  config.apiConfig.meshy.apiKey = 'meshy-key';
  config.apiConfig.runway.enabled = true;
  config.apiConfig.runway.apiKey = 'runway-key';

  return config;
}

function buildJsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('provider job persistence', () => {
  let tempRoot = '';

  afterEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    await resetExternalIntegrationStorageForTest();
    if (tempRoot) {
      await rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
      tempRoot = '';
    }
    delete process.env.REY30_EXTERNAL_INTEGRATION_ROOT;
  });

  async function withTempRoot<T>(run: () => Promise<T>) {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'rey30-provider-jobs-'));
    process.env.REY30_EXTERNAL_INTEGRATION_ROOT = tempRoot;
    return run();
  }

  it('persists and updates OpenAI video jobs', async () => {
    await withTempRoot(async () => {
      requireSessionMock.mockResolvedValue({
        id: 'user-1',
        role: 'EDITOR',
        email: 'editor@example.com',
        sessionId: 'session-1',
      });
      getUserScopedConfigMock.mockResolvedValue(createScopedConfig());

      fetchRemoteJsonMock
        .mockResolvedValueOnce({
          response: buildJsonResponse({ id: 'video_job_123', status: 'queued' }),
          data: { id: 'video_job_123', status: 'queued' },
          rawText: '{"id":"video_job_123","status":"queued"}',
        })
        .mockResolvedValueOnce({
          response: buildJsonResponse({
            id: 'video_job_123',
            status: 'completed',
            url: 'https://cdn.example.com/video.mp4',
          }),
          data: {
            id: 'video_job_123',
            status: 'completed',
            url: 'https://cdn.example.com/video.mp4',
          },
          rawText: '{"id":"video_job_123","status":"completed"}',
        });

      const { POST, GET } = await import('@/app/api/openai/route');

      const createResponse = await POST(
        new NextRequest('http://localhost/api/openai', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-rey30-project': 'Star Forge',
          },
          body: JSON.stringify({
            action: 'video',
            prompt: 'Generate a reveal shot',
          }),
        })
      );
      expect(createResponse.status).toBe(200);

      let record = readProviderJobRecord({
        provider: 'openai',
        userId: 'user-1',
        projectKey: 'star_forge',
        remoteTaskId: 'video_job_123',
      });
      expect(record).toMatchObject({
        provider: 'openai',
        action: 'video',
        status: 'queued',
      });

      const statusResponse = await GET(
        new NextRequest('http://localhost/api/openai?action=videoStatus&videoId=video_job_123', {
          headers: {
            'x-rey30-project': 'Star Forge',
          },
        })
      );
      expect(statusResponse.status).toBe(200);

      record = readProviderJobRecord({
        provider: 'openai',
        userId: 'user-1',
        projectKey: 'star_forge',
        remoteTaskId: 'video_job_123',
      });
      expect(record).toMatchObject({
        status: 'completed',
        result: {
          url: 'https://cdn.example.com/video.mp4',
        },
      });
    });
  });

  it('persists and updates Runway video jobs', async () => {
    await withTempRoot(async () => {
      requireSessionMock.mockResolvedValue({
        id: 'user-1',
        role: 'EDITOR',
        email: 'editor@example.com',
        sessionId: 'session-1',
      });
      getUserScopedConfigMock.mockResolvedValue(createScopedConfig());

      fetchRemoteJsonMock
        .mockResolvedValueOnce({
          response: buildJsonResponse({ id: 'runway_task_123', status: 'queued' }),
          data: { id: 'runway_task_123', status: 'queued' },
          rawText: '{"id":"runway_task_123","status":"queued"}',
        })
        .mockResolvedValueOnce({
          response: buildJsonResponse({
            id: 'runway_task_123',
            status: 'completed',
            output: [{ url: 'https://cdn.example.com/runway.mp4' }],
          }),
          data: {
            id: 'runway_task_123',
            status: 'completed',
            output: [{ url: 'https://cdn.example.com/runway.mp4' }],
          },
          rawText: '{"id":"runway_task_123","status":"completed"}',
        });

      const { POST, GET } = await import('@/app/api/runway/route');

      const createResponse = await POST(
        new NextRequest('http://localhost/api/runway', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-rey30-project': 'Star Forge',
          },
          body: JSON.stringify({
            action: 'textToVideo',
            promptText: 'A cinematic mech orbit',
          }),
        })
      );
      expect(createResponse.status).toBe(200);

      let record = readProviderJobRecord({
        provider: 'runway',
        userId: 'user-1',
        projectKey: 'star_forge',
        remoteTaskId: 'runway_task_123',
      });
      expect(record).toMatchObject({
        provider: 'runway',
        action: 'textToVideo',
        status: 'queued',
      });

      const statusResponse = await GET(
        new NextRequest('http://localhost/api/runway?taskId=runway_task_123', {
          headers: {
            'x-rey30-project': 'Star Forge',
          },
        })
      );
      expect(statusResponse.status).toBe(200);

      record = readProviderJobRecord({
        provider: 'runway',
        userId: 'user-1',
        projectKey: 'star_forge',
        remoteTaskId: 'runway_task_123',
      });
      expect(record).toMatchObject({
        status: 'completed',
        result: {
          url: 'https://cdn.example.com/runway.mp4',
        },
      });
    });
  });

  it('persists and updates Meshy async jobs', async () => {
    await withTempRoot(async () => {
      requireSessionMock.mockResolvedValue({
        id: 'user-1',
        role: 'EDITOR',
        email: 'editor@example.com',
        sessionId: 'session-1',
      });
      getUserScopedConfigMock.mockResolvedValue(createScopedConfig());

      fetchRemoteTextMock
        .mockResolvedValueOnce({
          response: buildJsonResponse({ result: 'meshy_task_123', status: 'queued' }),
          text: '{"result":"meshy_task_123","status":"queued"}',
        })
        .mockResolvedValueOnce({
          response: buildJsonResponse({
            status: 'completed',
            model_urls: { glb: 'https://cdn.example.com/meshy.glb' },
            thumbnail_url: 'https://cdn.example.com/meshy.png',
            progress: 100,
          }),
          text: JSON.stringify({
            status: 'completed',
            model_urls: { glb: 'https://cdn.example.com/meshy.glb' },
            thumbnail_url: 'https://cdn.example.com/meshy.png',
            progress: 100,
          }),
        });

      const { POST, GET } = await import('@/app/api/meshy/route');

      const createResponse = await POST(
        new NextRequest('http://localhost/api/meshy', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-rey30-project': 'Star Forge',
          },
          body: JSON.stringify({
            mode: 'preview',
            prompt: 'Stylized mech',
          }),
        })
      );
      expect(createResponse.status).toBe(200);

      let record = readProviderJobRecord({
        provider: 'meshy',
        userId: 'user-1',
        projectKey: 'star_forge',
        remoteTaskId: 'meshy_task_123',
      });
      expect(record).toMatchObject({
        provider: 'meshy',
        action: 'preview',
        status: 'queued',
      });

      const statusResponse = await GET(
        new NextRequest('http://localhost/api/meshy?taskId=meshy_task_123', {
          headers: {
            'x-rey30-project': 'Star Forge',
          },
        })
      );
      expect(statusResponse.status).toBe(200);

      record = readProviderJobRecord({
        provider: 'meshy',
        userId: 'user-1',
        projectKey: 'star_forge',
        remoteTaskId: 'meshy_task_123',
      });
      expect(record).toMatchObject({
        status: 'completed',
        result: {
          url: 'https://cdn.example.com/meshy.glb',
          thumbnailUrl: 'https://cdn.example.com/meshy.png',
          progress: 100,
        },
      });
    });
  });
});
