import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { NextRequest } from 'next/server';
import {
  readDurableSecurityAuditLogs,
  resetExternalIntegrationStorageForTest,
} from '@/lib/server/external-integration-store';

const dbMock = {
  securityAuditLog: {
    create: vi.fn(),
  },
  authSession: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  user: {
    upsert: vi.fn(),
  },
};

vi.mock('@/lib/db', () => ({
  db: dbMock,
}));

vi.mock('@/lib/security/crypto', () => ({
  hashToken: (value: string) => `hash:${value}`,
  isMissingEncryptionSecretError: () => false,
}));

vi.mock('@/lib/security/client-ip', () => ({
  getClientIp: () => '127.0.0.1',
}));

vi.mock('@/lib/security/csrf', () => ({
  applyCsrfCookie: vi.fn(),
  clearCsrfCookie: vi.fn(),
}));

vi.mock('@/lib/security/shared-access', () => ({
  resolveSharedAccessUserFromRequest: vi.fn(),
  isSharedAccessUserEmail: vi.fn(() => false),
}));

type EnvSnapshot = Record<'REY30_EXTERNAL_INTEGRATION_ROOT', string | undefined>;

function snapshotEnv(): EnvSnapshot {
  return {
    REY30_EXTERNAL_INTEGRATION_ROOT: process.env.REY30_EXTERNAL_INTEGRATION_ROOT,
  };
}

function restoreEnv(snapshot: EnvSnapshot): void {
  if (snapshot.REY30_EXTERNAL_INTEGRATION_ROOT === undefined) {
    delete process.env.REY30_EXTERNAL_INTEGRATION_ROOT;
  } else {
    process.env.REY30_EXTERNAL_INTEGRATION_ROOT = snapshot.REY30_EXTERNAL_INTEGRATION_ROOT;
  }
}

describe('auth audit logging fallback', () => {
  let envBefore: EnvSnapshot;
  let tempRoot: string;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    envBefore = snapshotEnv();
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'rey30-audit-fallback-'));
    process.env.REY30_EXTERNAL_INTEGRATION_ROOT = tempRoot;
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    restoreEnv(envBefore);
    await resetExternalIntegrationStorageForTest();
    await rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
    warnSpy.mockRestore();
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('persists critical audit events to the durable fallback when the database write fails', async () => {
    dbMock.securityAuditLog.create.mockRejectedValue(new Error('db down'));

    const { logSecurityEvent } = await import('@/lib/security/auth');
    await logSecurityEvent({
      request: new NextRequest('http://localhost/api/auth/login', {
        headers: { 'user-agent': 'vitest-agent' },
      }),
      userId: 'user-1',
      action: 'auth.login',
      status: 'allowed',
      metadata: { reason: 'ok' },
      durability: 'critical',
    });

    const fallbackLogs = readDurableSecurityAuditLogs({ userId: 'user-1', take: 10 });
    expect(fallbackLogs).toHaveLength(1);
    expect(fallbackLogs[0]).toMatchObject({
      userId: 'user-1',
      action: 'auth.login',
      status: 'allowed',
      ipAddress: '127.0.0.1',
      userAgent: 'vitest-agent',
      persistedBy: 'durable_fallback',
    });
    expect(fallbackLogs[0]?.metadata).toContain('"reason":"ok"');
  });

  it('keeps non-critical audit events as best-effort only', async () => {
    dbMock.securityAuditLog.create.mockRejectedValue(new Error('db down'));

    const { logSecurityEvent } = await import('@/lib/security/auth');
    await logSecurityEvent({
      request: new NextRequest('http://localhost/api/auth/session'),
      userId: 'user-1',
      action: 'auth.session',
      status: 'error',
      metadata: { reason: 'lookup_failed' },
    });

    const fallbackLogs = readDurableSecurityAuditLogs({ userId: 'user-1', take: 10 });
    expect(fallbackLogs).toHaveLength(0);
  });
});
