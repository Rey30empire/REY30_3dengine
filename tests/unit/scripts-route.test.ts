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
const deleteStoredScriptMock = vi.fn();
const getStoredScriptMock = vi.fn();
const listStoredScriptsMock = vi.fn();
const upsertStoredScriptMock = vi.fn();
const deleteScriptRuntimeArtifactMock = vi.fn();
const isInvalidScriptPathErrorMock = vi.fn(() => false);
const normalizeRelativePathMock = vi.fn((value: string) => value);
const normalizeScriptRelativePathMock = vi.fn((value: string) => value);
const normalizeScriptNameMock = vi.fn((value: string) => value.trim());

vi.mock('@/lib/security/auth', () => ({
  requireSession: requireSessionMock,
  authErrorToResponse: authErrorToResponseMock,
}));

vi.mock('@/lib/server/script-storage', () => ({
  deleteStoredScript: deleteStoredScriptMock,
  getStoredScript: getStoredScriptMock,
  listStoredScripts: listStoredScriptsMock,
  upsertStoredScript: upsertStoredScriptMock,
}));

vi.mock('@/lib/server/script-runtime-artifacts', () => ({
  deleteScriptRuntimeArtifact: deleteScriptRuntimeArtifactMock,
}));

vi.mock('@/app/api/scripts/shared', () => ({
  isInvalidScriptPathError: isInvalidScriptPathErrorMock,
  normalizeRelativePath: normalizeRelativePathMock,
  normalizeScriptRelativePath: normalizeScriptRelativePathMock,
  normalizeScriptName: normalizeScriptNameMock,
}));

describe('scripts route', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns a reduced list payload without storage internals', async () => {
    requireSessionMock.mockResolvedValue({
      id: 'editor-1',
      role: 'EDITOR',
      email: 'editor@example.com',
      sessionId: 'session-1',
    });
    listStoredScriptsMock.mockResolvedValue([
      {
        name: 'movement.scrib.ts',
        relativePath: 'scribs/movement.scrib.ts',
        size: 128,
        modifiedAt: '2026-03-30T22:00:00.000Z',
      },
    ]);

    const { GET } = await import('@/app/api/scripts/route');
    const response = await GET(new NextRequest('http://localhost/api/scripts'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.scripts).toHaveLength(1);
    expect(payload).not.toHaveProperty('root');
    expect(payload).not.toHaveProperty('backend');
  });

  it('returns sanitized missing-script and invalid-path errors', async () => {
    requireSessionMock.mockResolvedValue({
      id: 'editor-1',
      role: 'EDITOR',
      email: 'editor@example.com',
      sessionId: 'session-1',
    });
    getStoredScriptMock.mockResolvedValue(null);

    const { GET } = await import('@/app/api/scripts/route');
    const notFoundResponse = await GET(
      new NextRequest('http://localhost/api/scripts?path=scribs/missing.ts')
    );
    const notFoundPayload = await notFoundResponse.json();

    expect(notFoundResponse.status).toBe(404);
    expect(notFoundPayload).toEqual({
      error: 'El script solicitado no existe.',
    });
    expect(JSON.stringify(notFoundPayload)).not.toContain('path');

    isInvalidScriptPathErrorMock.mockReturnValueOnce(true);
    listStoredScriptsMock.mockRejectedValueOnce(new Error('Invalid script path'));
    const invalidResponse = await GET(new NextRequest('http://localhost/api/scripts'));
    const invalidPayload = await invalidResponse.json();

    expect(invalidResponse.status).toBe(400);
    expect(invalidPayload).toEqual({
      error: 'La ruta del script no es valida.',
      scripts: [],
    });
  });

  it('returns sanitized conflict and save-input errors', async () => {
    requireSessionMock.mockResolvedValue({
      id: 'editor-1',
      role: 'EDITOR',
      email: 'editor@example.com',
      sessionId: 'session-1',
    });
    normalizeScriptNameMock.mockReturnValue('demo.ts');
    getStoredScriptMock.mockResolvedValue({
      name: 'demo.ts',
      relativePath: 'demo.ts',
      size: 12,
      modifiedAt: '2026-03-30T22:00:00.000Z',
      content: 'export const demo = true;',
    });

    const { POST, PUT } = await import('@/app/api/scripts/route');
    const conflictResponse = await POST(
      new NextRequest('http://localhost/api/scripts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'demo.ts', content: 'export const demo = true;' }),
      })
    );
    const conflictPayload = await conflictResponse.json();

    expect(conflictResponse.status).toBe(409);
    expect(conflictPayload.error).toBe('Ya existe un script con ese nombre.');

    const saveInputResponse = await PUT(
      new NextRequest('http://localhost/api/scripts', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: 'demo.ts' }),
      })
    );
    const saveInputPayload = await saveInputResponse.json();

    expect(saveInputResponse.status).toBe(400);
    expect(saveInputPayload.error).toBe('Debes indicar la ruta y el contenido del script.');
  });
});
