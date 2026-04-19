import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getSessionUserMock = vi.fn();
const isSharedAccessUserEmailMock = vi.fn();
const getUserScopedConfigMock = vi.fn();
const deriveAssistantSurfaceStatusMock = vi.fn();
const createAnonymousAssistantSurfaceStatusMock = vi.fn();
const buildAssistantSurfaceDiagnosticsMock = vi.fn();

vi.mock('@/lib/security/auth', () => ({
  getSessionUser: getSessionUserMock,
}));

vi.mock('@/lib/security/shared-access', () => ({
  isSharedAccessUserEmail: isSharedAccessUserEmailMock,
}));

vi.mock('@/lib/security/user-api-config', () => ({
  getUserScopedConfig: getUserScopedConfigMock,
}));

vi.mock('@/lib/security/assistant-surface', () => ({
  createAnonymousAssistantSurfaceStatus: createAnonymousAssistantSurfaceStatusMock,
  deriveAssistantSurfaceStatus: deriveAssistantSurfaceStatusMock,
}));

vi.mock('@/lib/server/assistant-diagnostics', () => ({
  buildAssistantSurfaceDiagnostics: buildAssistantSurfaceDiagnosticsMock,
}));

describe('assistant status route', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns a safe product payload when the session is anonymous', async () => {
    getSessionUserMock.mockResolvedValue(null);
    createAnonymousAssistantSurfaceStatusMock.mockReturnValue({
      authenticated: false,
      experience: 'product',
      access: {
        advancedTools: false,
        configurationAccess: false,
      },
      assistant: {
        available: false,
        capabilities: {
          chat: { remote: false, local: false },
          image: false,
          video: { standard: false, cinematic: false },
          model3D: false,
          character: false,
        },
      },
    });

    const { GET } = await import('@/app/api/assistant/status/route');
    const response = await GET(new NextRequest('http://localhost/api/assistant/status'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      authenticated: false,
      experience: 'product',
      access: {
        advancedTools: false,
        configurationAccess: false,
      },
      assistant: {
        available: false,
        capabilities: {
          chat: { remote: false, local: false },
          image: false,
          video: { standard: false, cinematic: false },
          model3D: false,
          character: false,
        },
      },
    });
    expect(getUserScopedConfigMock).not.toHaveBeenCalled();
    expect(deriveAssistantSurfaceStatusMock).not.toHaveBeenCalled();
    expect(createAnonymousAssistantSurfaceStatusMock).toHaveBeenCalledTimes(1);
    expect(buildAssistantSurfaceDiagnosticsMock).not.toHaveBeenCalled();
  });

  it('derives the assistant surface from the authenticated session and scoped config', async () => {
    getSessionUserMock.mockResolvedValue({
      id: 'user-1',
      email: 'editor@example.com',
      role: 'EDITOR',
    });
    isSharedAccessUserEmailMock.mockReturnValue(false);
    getUserScopedConfigMock.mockResolvedValue({ configId: 'scoped-config' });
    deriveAssistantSurfaceStatusMock.mockReturnValue({
      authenticated: true,
      experience: 'advanced',
      access: {
        advancedTools: true,
        configurationAccess: true,
      },
      assistant: {
        available: true,
        capabilities: {
          chat: { remote: true, local: false },
          image: true,
          video: { standard: true, cinematic: false },
          model3D: true,
          character: true,
        },
      },
    });

    const { GET } = await import('@/app/api/assistant/status/route');
    const response = await GET(new NextRequest('http://localhost/api/assistant/status'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(getUserScopedConfigMock).toHaveBeenCalledWith('user-1');
    expect(isSharedAccessUserEmailMock).toHaveBeenCalledWith('editor@example.com');
    expect(deriveAssistantSurfaceStatusMock).toHaveBeenCalledWith({
      config: { configId: 'scoped-config' },
      role: 'EDITOR',
      sharedAccess: false,
    });
    expect(payload.assistant.available).toBe(true);
    expect(payload.access.advancedTools).toBe(true);
  });

  it('can include generic diagnostics without exposing internal routes to the client', async () => {
    getSessionUserMock.mockResolvedValue({
      id: 'user-1',
      email: 'editor@example.com',
      role: 'EDITOR',
    });
    isSharedAccessUserEmailMock.mockReturnValue(false);
    getUserScopedConfigMock.mockResolvedValue({ configId: 'scoped-config' });
    deriveAssistantSurfaceStatusMock.mockReturnValue({
      authenticated: true,
      experience: 'advanced',
      access: {
        advancedTools: true,
        configurationAccess: true,
      },
      assistant: {
        available: true,
        capabilities: {
          chat: { remote: true, local: false },
          image: true,
          video: { standard: true, cinematic: true },
          model3D: true,
          character: true,
        },
      },
    });
    buildAssistantSurfaceDiagnosticsMock.mockResolvedValue({
      checkedAt: '2026-03-30T12:00:00.000Z',
      assistant: {
        available: true,
        level: 'ok',
        requiresSignIn: false,
        message: 'Asistente listo para crear y revisar.',
      },
      automation: {
        available: true,
        restricted: false,
        level: 'ok',
        message: 'Edición automática disponible.',
      },
      characters: {
        available: true,
        configured: true,
        restricted: false,
        level: 'ok',
        message: 'Creación de personajes disponible.',
      },
    });

    const { GET } = await import('@/app/api/assistant/status/route');
    const response = await GET(
      new NextRequest('http://localhost/api/assistant/status?includeDiagnostics=1')
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(buildAssistantSurfaceDiagnosticsMock).toHaveBeenCalledTimes(1);
    expect(buildAssistantSurfaceDiagnosticsMock.mock.calls[0]?.[0]).toMatchObject({
      authenticated: true,
      experience: 'advanced',
      access: {
        advancedTools: true,
        configurationAccess: true,
      },
      assistant: {
        available: true,
        capabilities: {
          chat: { remote: true, local: false },
          image: true,
          video: { standard: true, cinematic: true },
          model3D: true,
          character: true,
        },
      },
    });
    expect(payload.diagnostics).toEqual({
      checkedAt: '2026-03-30T12:00:00.000Z',
      assistant: {
        available: true,
        level: 'ok',
        requiresSignIn: false,
        message: 'Asistente listo para crear y revisar.',
      },
      automation: {
        available: true,
        restricted: false,
        level: 'ok',
        message: 'Edición automática disponible.',
      },
      characters: {
        available: true,
        configured: true,
        restricted: false,
        level: 'ok',
        message: 'Creación de personajes disponible.',
      },
    });
  });
});
