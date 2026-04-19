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
const registerAssetFromPathMock = vi.fn();
const mkdirMock = vi.fn();
const writeFileMock = vi.fn();
const generateCharacterBaseMeshMock = vi.fn();
const isCharacterBackendConfiguredMock = vi.fn(() => false);
const isCharacterLocalFallbackEnabledMock = vi.fn(() => false);

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
    mkdir: mkdirMock,
    writeFile: writeFileMock,
  },
  mkdir: mkdirMock,
  writeFile: writeFileMock,
}));

vi.mock('@/lib/server/character-service', () => ({
  CharacterServiceError: MockCharacterServiceError,
  generateCharacterBaseMesh: generateCharacterBaseMeshMock,
  isCharacterBackendConfigured: isCharacterBackendConfiguredMock,
  isCharacterLocalFallbackEnabled: isCharacterLocalFallbackEnabledMock,
}));

describe('character base mesh route', () => {
  beforeEach(() => {
    requireSessionMock.mockResolvedValue({
      id: 'user-1',
      role: 'EDITOR',
      email: 'editor@example.com',
      sessionId: 'session-1',
    });
    registerAssetFromPathMock.mockResolvedValue({ id: 'asset_1' });
    mkdirMock.mockResolvedValue(undefined);
    writeFileMock.mockResolvedValue(undefined);
    isCharacterBackendConfiguredMock.mockReturnValue(false);
    isCharacterLocalFallbackEnabledMock.mockReturnValue(false);
    generateCharacterBaseMeshMock.mockResolvedValue({
      success: true,
      mesh: {
        vertices: [
          { x: 0, y: 0, z: 0 },
          { x: 1, y: 0, z: 0 },
          { x: 0, y: 1, z: 0 },
        ],
        faces: [[0, 1, 2]],
        metadata: {
          note: 'provider mesh',
          provider: 'secret',
        },
      },
      quality: {
        score: 0.93,
        coverage: 0.88,
        worstSeverity: 'warn',
        profile: 'A',
      },
      review: {
        summary: 'Profile A mesh review',
        focusAreas: ['silueta', 'hombros'],
        retopoRecommended: true,
      },
      metadata: {
        silhouette: 'sentinel',
        profile: 'A',
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns 503 when no backend is configured and explicit local fallback is disabled', async () => {
    const { POST } = await import('@/app/api/character/base-mesh/route');

    const response = await POST(
      new NextRequest('http://localhost/api/character/base-mesh', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: 'crea un guerrero' }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toEqual({
      success: false,
      error: 'La generación de malla base no está disponible en esta sesión.',
    });
    expect(generateCharacterBaseMeshMock).not.toHaveBeenCalled();
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it('uses explicit local fallback only when enabled', async () => {
    isCharacterLocalFallbackEnabledMock.mockReturnValue(true);

    const { POST } = await import('@/app/api/character/base-mesh/route');

    const response = await POST(
      new NextRequest('http://localhost/api/character/base-mesh', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: 'crea un orc brutish con cuernos', style: 'stylized' }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.review.retopoRecommended).toBe(true);
    expect(payload.quality.checks).toEqual(['mesh_ready', 'uv_ready', 'review_ready']);
    expect(registerAssetFromPathMock).toHaveBeenCalledTimes(1);
    expect(writeFileMock).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(payload)).not.toContain('backend');
    expect(JSON.stringify(payload)).not.toContain('provider');
  });

  it('sanitizes backend details on successful remote generation', async () => {
    isCharacterBackendConfiguredMock.mockReturnValue(true);

    const { POST } = await import('@/app/api/character/base-mesh/route');

    const response = await POST(
      new NextRequest('http://localhost/api/character/base-mesh', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: 'crea un robot guardia', style: 'realista' }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(generateCharacterBaseMeshMock).toHaveBeenCalledTimes(1);
    expect(payload.mesh.metadata.note).toBe('Base mesh lista para retopo y refinado.');
    expect(payload.mesh.metadata.silhouette).toBe('sentinel');
    expect(payload.review.summary).toBe('Base mesh lista para retopo y refinado.');
    expect(payload.review.focusAreas).toEqual(['silueta', 'hombros']);
    expect(payload.quality.score).toBe(0.93);
    expect(payload.quality.coverage).toBe(0.88);
    expect(payload.quality.worstSeverity).toBe('warn');
    expect(JSON.stringify(payload)).not.toContain('Profile A');
    expect(JSON.stringify(payload)).not.toContain('provider');
  });

  it('returns a sanitized backend error when remote generation fails and fallback is disabled', async () => {
    isCharacterBackendConfiguredMock.mockReturnValue(true);
    generateCharacterBaseMeshMock.mockRejectedValue(new MockCharacterServiceError(502, 'GPU worker timeout'));

    const { POST } = await import('@/app/api/character/base-mesh/route');

    const response = await POST(
      new NextRequest('http://localhost/api/character/base-mesh', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: 'crea un guardia' }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload).toEqual({
      success: false,
      error: 'No se pudo completar la malla base.',
    });
    expect(JSON.stringify(payload)).not.toContain('GPU');
  });
});
