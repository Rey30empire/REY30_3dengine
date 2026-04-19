import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import {
  persistDurableSecurityAuditLog,
  resetExternalIntegrationStorageForTest,
} from '@/lib/server/external-integration-store';

const requireSessionMock = vi.fn();
const logSecurityEventMock = vi.fn();
const authErrorToResponseMock = vi.fn(() =>
  NextResponse.json({ error: 'auth error' }, { status: 401 })
);

const dbMock = {
  securityAuditLog: {
    findMany: vi.fn(),
  },
};

vi.mock('@/lib/db', () => ({
  db: dbMock,
}));

vi.mock('@/lib/security/auth', () => ({
  requireSession: requireSessionMock,
  logSecurityEvent: logSecurityEventMock,
  authErrorToResponse: authErrorToResponseMock,
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

describe('user security logs route', () => {
  let envBefore: EnvSnapshot;
  let tempRoot: string;

  beforeEach(async () => {
    envBefore = snapshotEnv();
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'rey30-security-logs-'));
    process.env.REY30_EXTERNAL_INTEGRATION_ROOT = tempRoot;
  });

  afterEach(async () => {
    restoreEnv(envBefore);
    await resetExternalIntegrationStorageForTest();
    await rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns durable fallback logs when the database query fails', async () => {
    requireSessionMock.mockResolvedValue({
      id: 'editor-1',
      email: 'editor@example.com',
      role: 'EDITOR',
    });
    dbMock.securityAuditLog.findMany.mockRejectedValue(new Error('db down'));

    await persistDurableSecurityAuditLog({
      userId: 'editor-1',
      action: 'auth.login',
      status: 'allowed',
      ipAddress: '127.0.0.1',
      metadata: JSON.stringify({ persisted: 'fallback' }),
      createdAt: Date.parse('2026-04-14T19:00:00.000Z'),
    });

    const { GET } = await import('@/app/api/user/security-logs/route');
    const response = await GET(new NextRequest('http://localhost/api/user/security-logs'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.logs).toHaveLength(1);
    expect(payload.logs[0]).toMatchObject({
      action: 'auth.login',
      status: 'allowed',
      ipAddress: '127.0.0.1',
      metadata: expect.stringContaining('"persisted":"fallback"'),
    });
  });
});
