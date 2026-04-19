import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const dbMock = {
  authSession: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  securityAuditLog: {
    create: vi.fn(),
  },
  user: {
    upsert: vi.fn(),
  },
};

const resolveSharedAccessUserFromRequestMock = vi.fn();
const isSharedAccessUserEmailMock = vi.fn((email: string) => email === 'shared@example.com');

vi.mock('@/lib/db', () => ({
  db: dbMock,
}));

vi.mock('@/lib/security/crypto', () => ({
  hashToken: (value: string) => `hash:${value}`,
  isMissingEncryptionSecretError: () => false,
}));

vi.mock('@/lib/security/client-ip', () => ({
  getClientIp: () => null,
}));

vi.mock('@/lib/security/csrf', () => ({
  applyCsrfCookie: vi.fn(),
  clearCsrfCookie: vi.fn(),
}));

vi.mock('@/lib/security/shared-access', () => ({
  resolveSharedAccessUserFromRequest: resolveSharedAccessUserFromRequestMock,
  isSharedAccessUserEmail: isSharedAccessUserEmailMock,
}));

describe('shared access role hardening', () => {
  beforeEach(() => {
    dbMock.authSession.update.mockResolvedValue(undefined);
    dbMock.authSession.delete.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('normalizes a shared-access cookie session to viewer before authorization', async () => {
    dbMock.authSession.findUnique.mockResolvedValue({
      id: 'session-1',
      expiresAt: new Date(Date.now() + 60_000),
      user: {
        id: 'shared-user-1',
        email: 'shared@example.com',
        name: 'Shared User',
        role: 'OWNER',
        isActive: true,
      },
    });
    resolveSharedAccessUserFromRequestMock.mockResolvedValue(null);

    const { getSessionUser, requireSession } = await import('@/lib/security/auth');
    const request = new NextRequest('http://localhost/api/secure', {
      headers: {
        cookie: 'rey30_session=session-cookie',
      },
    });

    const user = await getSessionUser(request);

    expect(user?.role).toBe('VIEWER');
    await expect(requireSession(request, 'VIEWER')).resolves.toMatchObject({
      id: 'shared-user-1',
      role: 'VIEWER',
    });
    await expect(requireSession(request, 'EDITOR')).rejects.toThrow('FORBIDDEN');
  });

  it('normalizes bearer-based shared access to viewer even when the resolved user is owner', async () => {
    dbMock.authSession.findUnique.mockResolvedValue(null);
    resolveSharedAccessUserFromRequestMock.mockResolvedValue({
      id: 'shared-user-1',
      email: 'shared@example.com',
      name: 'Shared User',
      role: 'OWNER',
      isActive: true,
    });

    const { requireSession } = await import('@/lib/security/auth');
    const request = new NextRequest('http://localhost/api/secure', {
      headers: {
        authorization: 'Bearer shared-token',
      },
    });

    await expect(requireSession(request, 'VIEWER')).resolves.toMatchObject({
      id: 'shared-user-1',
      role: 'VIEWER',
    });
    await expect(requireSession(request, 'EDITOR')).rejects.toThrow('FORBIDDEN');
  });
});
