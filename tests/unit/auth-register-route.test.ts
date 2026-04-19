import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const dbMock = {
  $transaction: vi.fn(),
};

const hashPasswordMock = vi.fn();
const applySessionCookieMock = vi.fn((response) => response);
const createSessionForUserMock = vi.fn();
const isLocalRequestMock = vi.fn();
const logSecurityEventMock = vi.fn();
const shouldGrantLocalDevOwnerMock = vi.fn();
const allowLocalDevOpenRegistrationMock = vi.fn();
const getRegistrationModeMock = vi.fn();
const parseRegistrationAllowlistEmailsMock = vi.fn();

vi.mock('@/lib/db', () => ({
  db: dbMock,
}));

vi.mock('@/lib/security/password', () => ({
  hashPassword: hashPasswordMock,
}));

vi.mock('@/lib/security/auth', () => ({
  applySessionCookie: applySessionCookieMock,
  createSessionForUser: createSessionForUserMock,
  isLocalRequest: isLocalRequestMock,
  logSecurityEvent: logSecurityEventMock,
  shouldGrantLocalDevOwner: shouldGrantLocalDevOwnerMock,
}));

vi.mock('@/lib/security/registration-policy', () => ({
  allowLocalDevOpenRegistration: allowLocalDevOpenRegistrationMock,
  getRegistrationMode: getRegistrationModeMock,
  parseRegistrationAllowlistEmails: parseRegistrationAllowlistEmailsMock,
}));

type EnvSnapshot = Record<
  'REY30_REGISTRATION_INVITE_TOKEN' | 'REY30_BOOTSTRAP_OWNER_TOKEN',
  string | undefined
>;

function snapshotEnv(): EnvSnapshot {
  return {
    REY30_REGISTRATION_INVITE_TOKEN: process.env.REY30_REGISTRATION_INVITE_TOKEN,
    REY30_BOOTSTRAP_OWNER_TOKEN: process.env.REY30_BOOTSTRAP_OWNER_TOKEN,
  };
}

function restoreEnv(snapshot: EnvSnapshot): void {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

describe('Auth register route', () => {
  let envBefore: EnvSnapshot;

  beforeEach(() => {
    envBefore = snapshotEnv();
    hashPasswordMock.mockReturnValue('hashed-password');
    createSessionForUserMock.mockResolvedValue({
      token: 'session-token',
      expiresAt: new Date('2026-03-20T00:00:00.000Z'),
    });
    isLocalRequestMock.mockReturnValue(false);
    shouldGrantLocalDevOwnerMock.mockReturnValue(false);
    allowLocalDevOpenRegistrationMock.mockReturnValue(false);
    getRegistrationModeMock.mockReturnValue('invite_only');
    parseRegistrationAllowlistEmailsMock.mockReturnValue(new Set());
  });

  afterEach(() => {
    restoreEnv(envBefore);
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('rejects invalid payloads before hitting the database', async () => {
    const { POST } = await import('@/app/api/auth/register/route');

    const response = await POST(
      new NextRequest('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'user@example.com',
          password: 'short',
        }),
      })
    );

    expect(response.status).toBe(400);
    expect(dbMock.$transaction).not.toHaveBeenCalled();
    expect(logSecurityEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'auth.register',
        status: 'denied',
        metadata: { reason: 'invalid_payload' },
        durability: 'critical',
      })
    );
  });

  it('blocks registration when invite policy is not satisfied', async () => {
    process.env.REY30_REGISTRATION_INVITE_TOKEN = 'expected-token';

    const { POST } = await import('@/app/api/auth/register/route');
    const response = await POST(
      new NextRequest('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'user@example.com',
          password: 'valid-password-123',
          name: 'User',
        }),
      })
    );

    expect(response.status).toBe(403);
    expect(dbMock.$transaction).not.toHaveBeenCalled();
    expect(logSecurityEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'auth.register',
        status: 'denied',
        metadata: {
          reason: 'registration_policy_blocked',
          mode: 'invite_only',
        },
        durability: 'critical',
      })
    );
  });

  it('blocks allowlist mode when the email is not allowed', async () => {
    getRegistrationModeMock.mockReturnValue('allowlist');
    parseRegistrationAllowlistEmailsMock.mockReturnValue(new Set(['allowed@example.com']));

    const { POST } = await import('@/app/api/auth/register/route');
    const response = await POST(
      new NextRequest('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'blocked@example.com',
          password: 'valid-password-123',
          name: 'Blocked User',
        }),
      })
    );

    expect(response.status).toBe(403);
    expect(dbMock.$transaction).not.toHaveBeenCalled();
  });

  it('creates a viewer session when open registration is allowed locally', async () => {
    allowLocalDevOpenRegistrationMock.mockReturnValue(true);

    dbMock.$transaction.mockImplementation(async (callback) =>
      callback({
        user: {
          findUnique: vi.fn().mockResolvedValue(null),
          count: vi.fn().mockResolvedValue(1),
          create: vi.fn().mockResolvedValue({
            id: 'user-1',
            email: 'new-user@example.com',
            name: 'New User',
            role: 'VIEWER',
          }),
        },
      })
    );

    const { POST } = await import('@/app/api/auth/register/route');
    const response = await POST(
      new NextRequest('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'New-User@example.com',
          password: 'valid-password-123',
          name: 'New User',
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(hashPasswordMock).toHaveBeenCalledWith('valid-password-123');
    expect(createSessionForUserMock).toHaveBeenCalledWith('user-1');
    expect(applySessionCookieMock).toHaveBeenCalled();
    expect(logSecurityEventMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        action: 'auth.register',
        status: 'allowed',
        metadata: { role: 'VIEWER' },
        durability: 'critical',
      })
    );
  });

  it('returns conflict when the email already exists', async () => {
    allowLocalDevOpenRegistrationMock.mockReturnValue(true);

    dbMock.$transaction.mockImplementation(async (callback) =>
      callback({
        user: {
          findUnique: vi.fn().mockResolvedValue({ id: 'existing-user' }),
          count: vi.fn(),
          create: vi.fn(),
        },
      })
    );

    const { POST } = await import('@/app/api/auth/register/route');
    const response = await POST(
      new NextRequest('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'existing@example.com',
          password: 'valid-password-123',
          name: 'Existing User',
        }),
      })
    );

    expect(response.status).toBe(409);
    expect(createSessionForUserMock).not.toHaveBeenCalled();
    expect(logSecurityEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'existing-user',
        action: 'auth.register',
        status: 'denied',
        metadata: { reason: 'email_exists' },
        durability: 'critical',
      })
    );
  });

  it('promotes the first bootstrap registration to owner when the token matches', async () => {
    allowLocalDevOpenRegistrationMock.mockReturnValue(true);
    process.env.REY30_BOOTSTRAP_OWNER_TOKEN = 'bootstrap-secret';

    const createMock = vi.fn().mockResolvedValue({
      id: 'owner-1',
      email: 'owner@example.com',
      name: 'Owner',
      role: 'OWNER',
    });

    dbMock.$transaction.mockImplementation(async (callback) =>
      callback({
        user: {
          findUnique: vi.fn().mockResolvedValue(null),
          count: vi.fn().mockResolvedValue(0),
          create: createMock,
        },
      })
    );

    const { POST } = await import('@/app/api/auth/register/route');
    const response = await POST(
      new NextRequest('http://localhost/api/auth/register', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-rey30-bootstrap-owner-token': 'bootstrap-secret',
        },
        body: JSON.stringify({
          email: 'owner@example.com',
          password: 'valid-password-123',
          name: 'Owner',
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: 'OWNER',
        }),
      })
    );
  });

  it('returns 500 when registration storage fails unexpectedly', async () => {
    allowLocalDevOpenRegistrationMock.mockReturnValue(true);
    dbMock.$transaction.mockRejectedValue(new Error('db down'));

    const { POST } = await import('@/app/api/auth/register/route');
    const response = await POST(
      new NextRequest('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'broken@example.com',
          password: 'valid-password-123',
          name: 'Broken User',
        }),
      })
    );

    expect(response.status).toBe(500);
    expect(logSecurityEventMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: 'auth.register',
        status: 'error',
        durability: 'critical',
      })
    );
  });
});
