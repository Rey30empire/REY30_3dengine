import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { LocalProviderConfigError } from '@/lib/security/local-provider-policy';

const requireSessionMock = vi.fn();
const logSecurityEventMock = vi.fn();
const authErrorToResponseMock = vi.fn(() =>
  NextResponse.json({ error: 'auth error' }, { status: 401 })
);
const getUserScopedConfigMock = vi.fn();
const toClientUserScopedConfigMock = vi.fn();
const saveUserScopedConfigMock = vi.fn();
const isSharedAccessUserEmailMock = vi.fn();
const isMissingEncryptionSecretErrorMock = vi.fn(() => false);
const buildAdminProviderStatusesMock = vi.fn();

vi.mock('@/lib/security/auth', () => ({
  requireSession: requireSessionMock,
  logSecurityEvent: logSecurityEventMock,
  authErrorToResponse: authErrorToResponseMock,
}));

vi.mock('@/lib/security/user-api-config', () => ({
  getUserScopedConfig: getUserScopedConfigMock,
  toClientUserScopedConfig: toClientUserScopedConfigMock,
  saveUserScopedConfig: saveUserScopedConfigMock,
}));

vi.mock('@/lib/security/shared-access', () => ({
  isSharedAccessUserEmail: isSharedAccessUserEmailMock,
}));

vi.mock('@/lib/security/crypto', () => ({
  isMissingEncryptionSecretError: isMissingEncryptionSecretErrorMock,
}));

vi.mock('@/lib/server/admin-provider-status', () => ({
  buildAdminProviderStatuses: buildAdminProviderStatusesMock,
}));

describe('user api config route', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns client config plus aggregated provider statuses on GET', async () => {
    requireSessionMock.mockResolvedValue({
      id: 'viewer-1',
      email: 'viewer@example.com',
      role: 'VIEWER',
    });
    getUserScopedConfigMock.mockResolvedValue({ full: true, hasSecrets: { openai: true } });
    toClientUserScopedConfigMock.mockReturnValue({
      apiConfig: { openai: { enabled: true } },
      localConfig: { ollama: { enabled: true } },
      hasSecrets: { openai: true },
    });
    buildAdminProviderStatusesMock.mockResolvedValue({
      openai: { ok: true, detail: 'Configurado para esta sesión' },
      meshy: { ok: false, detail: 'Desactivado' },
      runway: { ok: false, detail: 'Desactivado' },
      ollama: { ok: true, detail: 'Servidor local activo' },
      vllm: { ok: false, detail: 'Desactivado' },
      llamacpp: { ok: false, detail: 'Desactivado' },
    });
    isSharedAccessUserEmailMock.mockReturnValue(false);

    const { GET } = await import('@/app/api/user/api-config/route');
    const response = await GET(new NextRequest('http://localhost/api/user/api-config'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(requireSessionMock).toHaveBeenCalledWith(expect.any(NextRequest), 'VIEWER');
    expect(getUserScopedConfigMock).toHaveBeenCalledWith('viewer-1');
    expect(toClientUserScopedConfigMock).toHaveBeenCalledWith({
      full: true,
      hasSecrets: { openai: true },
    });
    expect(buildAdminProviderStatusesMock).toHaveBeenCalledWith({
      full: true,
      hasSecrets: { openai: true },
    });
    expect(payload.providerStatuses).toEqual({
      openai: { ok: true, detail: 'Configurado para esta sesión' },
      meshy: { ok: false, detail: 'Desactivado' },
      runway: { ok: false, detail: 'Desactivado' },
      ollama: { ok: true, detail: 'Servidor local activo' },
      vllm: { ok: false, detail: 'Desactivado' },
      llamacpp: { ok: false, detail: 'Desactivado' },
    });
    expect(payload.policy.byok).toBe(true);
  });

  it('returns refreshed aggregated provider statuses on PUT', async () => {
    requireSessionMock.mockResolvedValue({
      id: 'editor-1',
      email: 'editor@example.com',
      role: 'EDITOR',
    });
    saveUserScopedConfigMock.mockResolvedValue({
      apiConfig: { openai: { enabled: true } },
      localConfig: { ollama: { enabled: true } },
      hasSecrets: { openai: true },
    });
    getUserScopedConfigMock.mockResolvedValue({
      full: true,
      hasSecrets: { openai: true },
    });
    buildAdminProviderStatusesMock.mockResolvedValue({
      openai: { ok: true, detail: 'Configurado para esta sesión' },
      meshy: { ok: false, detail: 'Desactivado' },
      runway: { ok: false, detail: 'Desactivado' },
      ollama: { ok: true, detail: 'Servidor local activo' },
      vllm: { ok: false, detail: 'Desactivado' },
      llamacpp: { ok: false, detail: 'Desactivado' },
    });
    isSharedAccessUserEmailMock.mockReturnValue(false);

    const { PUT } = await import('@/app/api/user/api-config/route');
    const response = await PUT(
      new NextRequest('http://localhost/api/user/api-config', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          apiConfig: { openai: { enabled: true } },
          localConfig: { ollama: { enabled: true } },
        }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(requireSessionMock).toHaveBeenCalledWith(expect.any(NextRequest), 'EDITOR');
    expect(saveUserScopedConfigMock).toHaveBeenCalledWith('editor-1', {
      apiConfig: { openai: { enabled: true } },
      localConfig: { ollama: { enabled: true } },
    });
    expect(getUserScopedConfigMock).toHaveBeenCalledWith('editor-1');
    expect(buildAdminProviderStatusesMock).toHaveBeenCalledWith({
      full: true,
      hasSecrets: { openai: true },
    });
    expect(payload.providerStatuses.ollama).toEqual({
      ok: true,
      detail: 'Servidor local activo',
    });
  });

  it('returns 400 when a local provider config violates the loopback policy', async () => {
    requireSessionMock.mockResolvedValue({
      id: 'editor-1',
      email: 'editor@example.com',
      role: 'EDITOR',
    });
    saveUserScopedConfigMock.mockRejectedValue(
      new LocalProviderConfigError(
        'ollama',
        'local_provider_endpoint_not_allowlisted',
        'Ollama solo admite endpoints loopback aprobados.'
      )
    );

    const { PUT } = await import('@/app/api/user/api-config/route');
    const response = await PUT(
      new NextRequest('http://localhost/api/user/api-config', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          apiConfig: { openai: { enabled: true } },
          localConfig: { ollama: { enabled: true, baseUrl: 'http://127.0.0.1:9' } },
        }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toMatchObject({
      error: 'Ollama solo admite endpoints loopback aprobados.',
      code: 'local_provider_endpoint_not_allowlisted',
      provider: 'ollama',
    });
    expect(logSecurityEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'editor-1',
        action: 'user.api_config.write',
        status: 'denied',
        durability: 'critical',
        metadata: expect.objectContaining({
          reason: 'local_provider_endpoint_not_allowlisted',
          provider: 'ollama',
        }),
      })
    );
  });
});
