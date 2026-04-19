import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

const createCharacterJobMock = vi.fn();
const getCharacterJobStatusMock = vi.fn();
const cancelCharacterJobMock = vi.fn();
const getCharacterJobResultMock = vi.fn();
const isCharacterBackendConfiguredMock = vi.fn(() => true);
const normalizeCharacterTaskStatusMock = vi.fn((status: string) => status);

const getCharacterGenerationJobRecordMock = vi.fn();
const upsertCharacterGenerationJobRecordMock = vi.fn();
const patchCharacterGenerationJobRecordMock = vi.fn();

class MockCharacterServiceError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'CharacterServiceError';
    this.status = status;
  }
}

vi.mock('@/lib/security/auth', () => ({
  requireSession: requireSessionMock,
  authErrorToResponse: authErrorToResponseMock,
}));

vi.mock('@/lib/server/character-service', () => ({
  CharacterServiceError: MockCharacterServiceError,
  createCharacterJob: createCharacterJobMock,
  getCharacterJobStatus: getCharacterJobStatusMock,
  cancelCharacterJob: cancelCharacterJobMock,
  getCharacterJobResult: getCharacterJobResultMock,
  isCharacterBackendConfigured: isCharacterBackendConfiguredMock,
  normalizeCharacterTaskStatus: normalizeCharacterTaskStatusMock,
}));

vi.mock('@/lib/server/character-generation-store', () => ({
  getCharacterGenerationJobRecord: getCharacterGenerationJobRecordMock,
  upsertCharacterGenerationJobRecord: upsertCharacterGenerationJobRecordMock,
  patchCharacterGenerationJobRecord: patchCharacterGenerationJobRecordMock,
}));

describe('character job routes', () => {
  beforeEach(() => {
    requireSessionMock.mockResolvedValue({
      id: 'user-1',
      role: 'EDITOR',
      email: 'editor@example.com',
      sessionId: 'session-1',
    });
    isCharacterBackendConfiguredMock.mockReturnValue(true);
    createCharacterJobMock.mockResolvedValue({
      success: true,
      jobId: 'job_123',
      status: 'queued',
    });
    getCharacterJobStatusMock.mockResolvedValue({
      success: true,
      jobId: 'job_123',
      status: 'completed',
      progress: 100,
      stage: 'done',
      error: null,
    });
    cancelCharacterJobMock.mockResolvedValue({
      success: true,
      jobId: 'job_123',
      status: 'canceled',
      progress: 100,
      stage: 'canceled',
      error: null,
    });
    getCharacterJobResultMock.mockResolvedValue({
      success: true,
      jobId: 'job_123',
      packagePath: 'download/assets/generated-characters/star_forge/job_123',
      payload: { ok: true },
    });
    getCharacterGenerationJobRecordMock.mockResolvedValue(null);
    upsertCharacterGenerationJobRecordMock.mockResolvedValue(undefined);
    patchCharacterGenerationJobRecordMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('stores a durable job ledger entry when a character job starts', async () => {
    const { POST } = await import('@/app/api/character/jobs/route');

    const response = await POST(
      new NextRequest('http://localhost/api/character/jobs', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-rey30-project': 'Star Forge',
        },
        body: JSON.stringify({ prompt: 'crea un guerrero' }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      success: true,
      taskId: 'job_123',
      jobId: 'job_123',
      status: 'queued',
    });
    expect(upsertCharacterGenerationJobRecordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'job_123',
        projectKey: 'star_forge',
        prompt: 'crea un guerrero',
      })
    );
  });

  it('returns the durable finalized asset when backend status is unavailable', async () => {
    isCharacterBackendConfiguredMock.mockReturnValue(false);
    getCharacterGenerationJobRecordMock.mockResolvedValue({
      jobId: 'job_123',
      status: 'completed',
      progress: 100,
      stage: 'completed',
      asset: {
        id: 'asset_1',
        name: 'CharacterPackage_job_123',
        type: 'prefab',
        path: 'download/assets/generated-characters/star_forge/job_123/package.json',
        size: 4096,
        createdAt: '2026-04-03T00:00:00.000Z',
        metadata: {
          characterPackage: true,
        },
      },
      packageSummary: {
        vertexCount: 3,
        triangleCount: 1,
        rigBoneCount: 1,
        blendshapeCount: 0,
        textureCount: 6,
        materialCount: 1,
        animationCount: 1,
        prompt: 'crea un guerrero',
        style: 'realista',
        targetEngine: 'generic',
        generatedAt: '2026-04-03T00:00:00.000Z',
      },
    });

    const { GET } = await import('@/app/api/character/jobs/route');

    const response = await GET(
      new NextRequest('http://localhost/api/character/jobs?jobId=job_123')
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      success: true,
      status: 'completed',
      progress: 100,
      stage: 'completed',
      error: null,
      asset: expect.objectContaining({
        id: 'asset_1',
        path: 'download/assets/generated-characters/star_forge/job_123/package.json',
      }),
    });
  });

  it('returns the stored durable result payload when the backend is unavailable', async () => {
    isCharacterBackendConfiguredMock.mockReturnValue(false);
    getCharacterGenerationJobRecordMock.mockResolvedValue({
      jobId: 'job_123',
      status: 'completed',
      progress: 100,
      stage: 'completed',
      remotePackagePath: 'download/assets/generated-characters/star_forge/job_123',
      packageDirectoryPath: 'download/assets/generated-characters/star_forge/job_123',
      asset: {
        id: 'asset_1',
        name: 'CharacterPackage_job_123',
        type: 'prefab',
        path: 'download/assets/generated-characters/star_forge/job_123/package.json',
        size: 4096,
        createdAt: '2026-04-03T00:00:00.000Z',
        metadata: {
          characterPackage: true,
        },
      },
      packageSummary: {
        vertexCount: 3,
        triangleCount: 1,
        rigBoneCount: 1,
        blendshapeCount: 0,
        textureCount: 6,
        materialCount: 1,
        animationCount: 1,
        prompt: 'crea un guerrero',
        style: 'realista',
        targetEngine: 'generic',
        generatedAt: '2026-04-03T00:00:00.000Z',
      },
    });

    const { GET } = await import('@/app/api/character/jobs/result/route');

    const response = await GET(
      new NextRequest('http://localhost/api/character/jobs/result?jobId=job_123')
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      success: true,
      packagePath: 'download/assets/generated-characters/star_forge/job_123',
      packageDirectoryPath: 'download/assets/generated-characters/star_forge/job_123',
      asset: expect.objectContaining({
        id: 'asset_1',
      }),
      packageSummary: expect.objectContaining({
        animationCount: 1,
      }),
      payload: expect.objectContaining({
        asset: expect.objectContaining({
          id: 'asset_1',
        }),
        summary: expect.objectContaining({
          materialCount: 1,
        }),
      }),
    });
  });
});
