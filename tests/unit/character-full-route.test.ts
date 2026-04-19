import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import path from 'path';
import type { CharacterJobResult, CharacterJobStatus } from '@/lib/server/character-service';

const requireSessionMock = vi.fn();
const authErrorToResponseMock = vi.fn((error: unknown) =>
  Response.json(
    { error: String(error).includes('FORBIDDEN') ? 'No tienes permisos para esta acción.' : 'Debes iniciar sesión o usar un token de acceso.' },
    { status: String(error).includes('FORBIDDEN') ? 403 : 401 }
  )
);
const registerAssetFromPathMock = vi.fn();
const cpMock = vi.fn();
const mkdirMock = vi.fn();
const readFileMock = vi.fn();
const statMock = vi.fn();
const writeFileMock = vi.fn();
const createCharacterJobMock = vi.fn();
const getCharacterJobResultMock = vi.fn();
const isCharacterBackendConfiguredMock = vi.fn(() => false);
const isCharacterLocalFallbackEnabledMock = vi.fn(() => false);
const waitForCharacterJobCompletionMock = vi.fn();
const getCharacterGenerationJobRecordMock = vi.fn();
const upsertCharacterGenerationJobRecordMock = vi.fn();

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

vi.mock('@/engine/assets/pipeline', () => ({
  registerAssetFromPath: registerAssetFromPathMock,
}));

vi.mock('fs/promises', () => ({
  default: {
    cp: cpMock,
    mkdir: mkdirMock,
    readFile: readFileMock,
    stat: statMock,
    writeFile: writeFileMock,
  },
  cp: cpMock,
  mkdir: mkdirMock,
  readFile: readFileMock,
  stat: statMock,
  writeFile: writeFileMock,
}));

vi.mock('@/lib/server/character-service', () => ({
  CharacterServiceError: MockCharacterServiceError,
  createCharacterJob: createCharacterJobMock,
  getCharacterJobResult: getCharacterJobResultMock,
  isCharacterBackendConfigured: isCharacterBackendConfiguredMock,
  isCharacterLocalFallbackEnabled: isCharacterLocalFallbackEnabledMock,
  waitForCharacterJobCompletion: waitForCharacterJobCompletionMock,
}));

vi.mock('@/lib/server/character-generation-store', () => ({
  getCharacterGenerationJobRecord: getCharacterGenerationJobRecordMock,
  upsertCharacterGenerationJobRecord: upsertCharacterGenerationJobRecordMock,
}));

function completedStatus(): CharacterJobStatus {
  return {
    success: true,
    jobId: 'job_123',
    status: 'completed',
    progress: 100,
    stage: 'done',
    error: null,
  };
}

function remoteResult(): CharacterJobResult {
  return {
    success: true,
    jobId: 'job_123',
    packagePath: path.join(
      process.cwd(),
      'mini-services',
      'character-backend',
      'data',
      'output',
      'character_job_123',
      'package.json'
    ),
    payload: {
      mesh: {
        vertices: [
          { x: 0, y: 0, z: 0 },
          { x: 1, y: 0, z: 0 },
          { x: 0, y: 1, z: 0 },
        ],
        faces: [[0, 1, 2]],
        uvs: [
          { u: 0, v: 0 },
          { u: 1, v: 0 },
          { u: 0, v: 1 },
        ],
        metadata: {
          prompt: 'guerrero',
          style: 'realista',
          targetEngine: 'generic',
          provider: 'secret-provider',
        },
      },
      rig: {
        bones: [{ name: 'Hips', parent: null, position: { x: 0, y: 0, z: 0 } }],
        notes: 'Humanoid rig base (Profile A).',
      },
      blendshapes: [],
      animations: [{ name: 'Idle', duration: 1, loop: true }],
      textures: [
        { type: 'albedo', path: 'textures/albedo.png', resolution: '2K' },
        { type: 'normal', path: 'textures/normal.png', resolution: '2K' },
        { type: 'roughness', path: 'textures/roughness.png', resolution: '2K' },
        { type: 'metallic', path: 'textures/metallic.png', resolution: '2K' },
        { type: 'ao', path: 'textures/ao.png', resolution: '2K' },
        { type: 'emissive', path: 'textures/emissive.png', resolution: '2K' },
      ],
      materials: [
        {
          id: 'body_primary',
          label: 'Guardian Body',
          domain: 'body',
          shader: 'pbr_metal_rough',
          doubleSided: false,
          properties: {
            albedoColor: '#808694',
            emissiveColor: '#40a0ff',
            roughness: 0.48,
            metallic: 0.82,
          },
          textureSlots: {
            albedo: 'textures/albedo.png',
            normal: 'textures/normal.png',
            roughness: 'textures/roughness.png',
            metallic: 'textures/metallic.png',
            ao: 'textures/ao.png',
            emissive: 'textures/emissive.png',
          },
          provider: 'secret-provider',
        },
      ],
      quality: {
        profile: 'A',
        score: 0.97,
      },
      metadata: {
        profile: 'A',
        generatedAt: '2026-03-31T00:00:00.000Z',
        notes: 'Procedural + rig lightweight backend',
      },
    },
  };
}

describe('character full route', () => {
  beforeEach(() => {
    registerAssetFromPathMock.mockResolvedValue({
      id: 'asset_1',
      name: 'CharacterPackage_job_123',
      type: 'prefab',
      path: 'download/assets/generated-characters/star_forge/job_123/package.json',
      size: 4096,
      createdAt: '2026-04-03T00:00:00.000Z',
      metadata: {
        characterPackage: true,
        characterJobId: 'job_123',
      },
    });
    cpMock.mockResolvedValue(undefined);
    mkdirMock.mockResolvedValue(undefined);
    readFileMock.mockResolvedValue(JSON.stringify(remoteResult().payload));
    statMock.mockResolvedValue({ isFile: () => true });
    writeFileMock.mockResolvedValue(undefined);
    getCharacterGenerationJobRecordMock.mockResolvedValue(null);
    upsertCharacterGenerationJobRecordMock.mockResolvedValue(undefined);
    requireSessionMock.mockResolvedValue({
      id: 'user-1',
      role: 'EDITOR',
      email: 'editor@example.com',
      sessionId: 'session-1',
    });
    isCharacterBackendConfiguredMock.mockReturnValue(false);
    isCharacterLocalFallbackEnabledMock.mockReturnValue(false);
    createCharacterJobMock.mockResolvedValue({ success: true, jobId: 'job_123', status: 'queued' });
    waitForCharacterJobCompletionMock.mockResolvedValue(completedStatus());
    getCharacterJobResultMock.mockResolvedValue(remoteResult());
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns 503 when no backend is configured and explicit local fallback is disabled', async () => {
    const { POST } = await import('@/app/api/character/full/route');

    const response = await POST(
      new NextRequest('http://localhost/api/character/full', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: 'crea un guerrero' }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toEqual({
      success: false,
      error: 'La creación de personajes no está disponible en esta sesión.',
    });
    expect(createCharacterJobMock).not.toHaveBeenCalled();
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it('uses explicit local fallback only when enabled', async () => {
    isCharacterLocalFallbackEnabledMock.mockReturnValue(true);

    const { POST } = await import('@/app/api/character/full/route');

    const response = await POST(
      new NextRequest('http://localhost/api/character/full', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: 'crea un guerrero', includeAnimations: true }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.asset).toEqual(
      expect.objectContaining({
        id: 'asset_1',
        type: 'prefab',
      })
    );
    expect(payload.rig.notes).toContain('Humanoid');
    expect(JSON.stringify(payload)).not.toContain('backend');
    expect(JSON.stringify(payload)).not.toContain('Profile A');
    expect(payload.quality.checks).toEqual(['mesh_ready', 'rig_ready', 'package_verified']);
    expect(registerAssetFromPathMock).toHaveBeenCalledTimes(1);
    expect(writeFileMock).toHaveBeenCalled();
  });

  it('sanitizes backend details on successful remote generation', async () => {
    isCharacterBackendConfiguredMock.mockReturnValue(true);

    const { POST } = await import('@/app/api/character/full/route');

    const response = await POST(
      new NextRequest('http://localhost/api/character/full', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: 'crea un guerrero', includeAnimations: true }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.jobId).toBe('job_123');
    expect(createCharacterJobMock).toHaveBeenCalledTimes(1);
    expect(waitForCharacterJobCompletionMock).toHaveBeenCalledWith('job_123');
    expect(getCharacterJobResultMock).toHaveBeenCalledWith('job_123');
    expect(payload.rig.notes).toBe('Humanoid rig listo para integración.');
    expect(payload.quality.score).toBe(0.97);
    expect(payload.quality.profile).toBeUndefined();
    expect(payload.quality.materials).toBe(1);
    expect(payload.quality.textureMaps).toBe(6);
    expect(payload.quality.checks).toEqual(['mesh_ready', 'rig_ready', 'package_verified']);
    expect(payload.materials).toHaveLength(1);
    expect(payload.materials[0].textureSlots.albedo).toBe('textures/albedo.png');
    expect(payload.materials[0].provider).toBeUndefined();
    expect(payload.asset).toEqual(
      expect.objectContaining({
        id: 'asset_1',
        path: 'download/assets/generated-characters/star_forge/job_123/package.json',
      })
    );
    expect(payload.packageSummary).toEqual(
      expect.objectContaining({
        materialCount: 1,
        textureCount: 6,
        animationCount: 1,
      })
    );
    expect(cpMock).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(payload)).not.toContain('Profile A');
    expect(JSON.stringify(payload)).not.toContain('provider');
  });

  it('returns a sanitized backend error when remote generation fails and fallback is disabled', async () => {
    isCharacterBackendConfiguredMock.mockReturnValue(true);
    createCharacterJobMock.mockRejectedValue(new MockCharacterServiceError(502, 'GPU worker timeout'));

    const { POST } = await import('@/app/api/character/full/route');

    const response = await POST(
      new NextRequest('http://localhost/api/character/full', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: 'crea un guerrero' }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload).toEqual({
      success: false,
      error: 'No se pudo completar el personaje.',
    });
    expect(JSON.stringify(payload)).not.toContain('GPU');
  });

  it('reuses a finalized durable asset when the same remote job is finalized again', async () => {
    isCharacterBackendConfiguredMock.mockReturnValue(true);
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
          characterJobId: 'job_123',
        },
      },
      packageDirectoryPath: 'download/assets/generated-characters/star_forge/job_123',
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
        generatedAt: '2026-03-31T00:00:00.000Z',
      },
    });
    readFileMock.mockResolvedValue(JSON.stringify(remoteResult().payload));

    const { POST } = await import('@/app/api/character/full/route');

    const response = await POST(
      new NextRequest('http://localhost/api/character/full', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: 'crea un guerrero', remoteJobId: 'job_123' }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.jobId).toBe('job_123');
    expect(payload.asset.id).toBe('asset_1');
    expect(payload.packageSummary.materialCount).toBe(1);
    expect(createCharacterJobMock).not.toHaveBeenCalled();
    expect(registerAssetFromPathMock).not.toHaveBeenCalled();
    expect(upsertCharacterGenerationJobRecordMock).not.toHaveBeenCalled();
  });
});
