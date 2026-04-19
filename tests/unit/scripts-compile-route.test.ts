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
const getStoredScriptMock = vi.fn();
const resolveScriptVirtualFileNameMock = vi.fn((value: string) => `C:/repo/scripts/${value}`);
const putScriptRuntimeArtifactMock = vi.fn();
const recordScriptRuntimeArtifactVerificationMock = vi.fn(
  async (scriptId: string, params: { ok: boolean; message?: string | null }) => ({
    scriptId,
    okCount: params.ok ? 1 : 0,
    failedCount: params.ok ? 0 : 1,
    lastStatus: params.ok ? 'ok' : 'failed',
    lastVerifiedAt: '2026-04-18T00:00:00.000Z',
    lastMessage: params.message || null,
  })
);
const assertValidScriptRelativePathMock = vi.fn((value: string) => value);
const isInvalidScriptPathErrorMock = vi.fn(() => false);

vi.mock('@/lib/security/auth', () => ({
  requireSession: requireSessionMock,
  authErrorToResponse: authErrorToResponseMock,
}));

vi.mock('@/lib/server/script-storage', () => ({
  getStoredScript: getStoredScriptMock,
  resolveScriptVirtualFileName: resolveScriptVirtualFileNameMock,
}));

vi.mock('@/lib/server/script-runtime-artifacts', () => ({
  putScriptRuntimeArtifact: putScriptRuntimeArtifactMock,
  recordScriptRuntimeArtifactVerification: recordScriptRuntimeArtifactVerificationMock,
}));

vi.mock('@/app/api/scripts/shared', () => ({
  assertValidScriptRelativePath: assertValidScriptRelativePathMock,
  isInvalidScriptPathError: isInvalidScriptPathErrorMock,
}));

describe('scripts compile route', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns a reduced review payload without file metadata', async () => {
    requireSessionMock.mockResolvedValue({
      id: 'editor-1',
      role: 'EDITOR',
      email: 'editor@example.com',
      sessionId: 'session-1',
    });

    const { POST } = await import('@/app/api/scripts/compile/route');
    const response = await POST(
      new NextRequest('http://localhost/api/scripts/compile', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          content: 'export const broken = ;',
        }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(false);
    expect(payload.summary).toBe('Se detectaron ajustes por revisar en el script.');
    expect(Array.isArray(payload.diagnostics)).toBe(true);
    expect(payload.diagnostics[0]).not.toHaveProperty('file');
    expect(payload).not.toHaveProperty('fileName');
    expect(payload).not.toHaveProperty('outputSize');
    expect(payload).not.toHaveProperty('sourceSize');
  });

  it('returns sanitized missing-script and input errors', async () => {
    requireSessionMock.mockResolvedValue({
      id: 'editor-1',
      role: 'EDITOR',
      email: 'editor@example.com',
      sessionId: 'session-1',
    });
    getStoredScriptMock.mockResolvedValue(null);

    const { POST } = await import('@/app/api/scripts/compile/route');

    const missingResponse = await POST(
      new NextRequest('http://localhost/api/scripts/compile', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: 'scribs/missing.ts' }),
      })
    );
    const missingPayload = await missingResponse.json();

    expect(missingResponse.status).toBe(404);
    expect(missingPayload).toEqual({
      error: 'El script solicitado no existe.',
    });
    expect(JSON.stringify(missingPayload)).not.toContain('path');

    const inputResponse = await POST(
      new NextRequest('http://localhost/api/scripts/compile', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
    );
    const inputPayload = await inputResponse.json();

    expect(inputResponse.status).toBe(400);
    expect(inputPayload.error).toBe('Debes indicar la ruta o el contenido del script.');
  });

  it('surfaces sandbox review errors without persisting a runtime artifact', async () => {
    requireSessionMock.mockResolvedValue({
      id: 'editor-1',
      role: 'EDITOR',
      email: 'editor@example.com',
      sessionId: 'session-1',
    });

    const { POST } = await import('@/app/api/scripts/compile/route');
    const response = await POST(
      new NextRequest('http://localhost/api/scripts/compile', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          path: 'scribs/unsafe.ts',
          content: `export function update() { return globalThis['process']; }`,
        }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(false);
    expect(payload.runtime).toMatchObject({
      reviewedArtifact: false,
      persisted: false,
      verification: expect.objectContaining({
        scriptId: 'scribs/unsafe.ts',
        lastStatus: 'failed',
      }),
    });
    expect(
      payload.diagnostics.some(
        (item: { code: number; text: string }) =>
          item.code === 9501 || /sandbox/i.test(item.text)
      )
    ).toBe(true);
    expect(putScriptRuntimeArtifactMock).not.toHaveBeenCalled();
  });

  it('delegates auth failures to the shared auth response', async () => {
    requireSessionMock.mockRejectedValue(new Error('FORBIDDEN'));

    const { POST } = await import('@/app/api/scripts/compile/route');
    const response = await POST(
      new NextRequest('http://localhost/api/scripts/compile', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: 'export const value = 1;' }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toBe('No tienes permisos para esta acción.');
    expect(authErrorToResponseMock).toHaveBeenCalled();
  });

  it('persists a reviewed runtime artifact when a saved script compiles cleanly', async () => {
    requireSessionMock.mockResolvedValue({
      id: 'editor-1',
      role: 'EDITOR',
      email: 'editor@example.com',
      sessionId: 'session-1',
    });

    const { POST } = await import('@/app/api/scripts/compile/route');
    const response = await POST(
      new NextRequest('http://localhost/api/scripts/compile', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          path: 'scribs/guarded-runtime.ts',
          content: 'export function update(ctx) { ctx.setTransform({ x: 1 }); }',
        }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.runtime).toMatchObject({
      reviewedArtifact: true,
      persisted: true,
      policy: expect.objectContaining({
        requiresReviewedArtifact: true,
      }),
    });
    expect(typeof payload.runtime.sourceHash).toBe('string');
    expect(typeof payload.runtime.compiledHash).toBe('string');
    expect(putScriptRuntimeArtifactMock).toHaveBeenCalledWith(
      'scribs/guarded-runtime.ts',
      expect.objectContaining({
        sourceHash: payload.runtime.sourceHash,
        compiledHash: payload.runtime.compiledHash,
      })
    );
    expect(recordScriptRuntimeArtifactVerificationMock).toHaveBeenCalledWith(
      'scribs/guarded-runtime.ts',
      expect.objectContaining({
        ok: true,
        message: 'El script está listo para usarse.',
      })
    );
  });
});
