import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  compileScriptRuntimeArtifact,
  hashScriptRuntimeSource,
} from '@/lib/server/script-runtime-compiler';

type BlobEntry = {
  value: unknown;
};

const blobData = new Map<string, BlobEntry>();
const blobStoreMock = {
  get: vi.fn(async (key: string) => blobData.get(key)?.value ?? null),
  setJSON: vi.fn(async (key: string, value: unknown) => {
    blobData.set(key, { value });
  }),
  delete: vi.fn(async (key: string) => {
    blobData.delete(key);
  }),
  list: vi.fn(async (options?: { prefix?: string }) => ({
    blobs: Array.from(blobData.keys())
      .filter((key) => !options?.prefix || key.startsWith(options.prefix))
      .map((key) => ({ key })),
  })),
};

const getStoreMock = vi.fn(() => blobStoreMock);
const getDeployStoreMock = vi.fn(() => blobStoreMock);
const ENV_KEYS = [
  'NETLIFY',
  'CONTEXT',
  'DEPLOY_ID',
  'REY30_SCRIPT_STORAGE_BACKEND',
  'REY30_SCRIPT_BLOB_STORE',
  'REY30_SCRIPT_ROOT',
  'REY30_RUNTIME_LEDGER_RETENTION_MAX',
  'REY30_RUNTIME_LEDGER_RETENTION_DAYS',
] as const;
const previousEnv = new Map<string, string | undefined>();
const cleanupDirs = new Set<string>();

vi.mock('@netlify/blobs', () => ({
  getStore: getStoreMock,
  getDeployStore: getDeployStoreMock,
}));

beforeEach(() => {
  blobData.clear();
  for (const key of ENV_KEYS) {
    previousEnv.set(key, process.env[key]);
    delete process.env[key];
  }
});

afterEach(async () => {
  for (const key of ENV_KEYS) {
    const previousValue = previousEnv.get(key);
    if (previousValue === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = previousValue;
    }
  }

  await Promise.all(
    Array.from(cleanupDirs).map(async (dir) => {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
      cleanupDirs.delete(dir);
    })
  );

  blobData.clear();
  vi.clearAllMocks();
  vi.resetModules();
});

describe('script runtime artifacts storage', () => {
  it('persists filesystem runtime artifacts across module reloads', async () => {
    const scriptsRoot = await mkdtemp(path.join(os.tmpdir(), 'rey30-runtime-artifacts-'));
    cleanupDirs.add(scriptsRoot);
    process.env.REY30_SCRIPT_ROOT = scriptsRoot;

    const sourceText = 'export function update(ctx) { ctx.setTransform({ x: 7 }); }\n';
    const compiled = compileScriptRuntimeArtifact({
      scriptId: 'runtime/restartable.ts',
      sourceText,
    });
    expect(compiled.ok).toBe(true);
    expect(compiled.artifact).toBeTruthy();

    const {
      getScriptRuntimeArtifact,
      getScriptRuntimeArtifactStorageStatus,
      putScriptRuntimeArtifact,
    } = await import('@/lib/server/script-runtime-artifacts');

    await putScriptRuntimeArtifact('runtime/restartable.ts', compiled.artifact!);

    const status = await getScriptRuntimeArtifactStorageStatus();
    expect(status).toMatchObject({
      available: true,
      backend: 'filesystem',
      scope: 'filesystem',
    });

    const beforeRestart = await getScriptRuntimeArtifact('runtime/restartable.ts');
    expect(beforeRestart?.compiledHash).toBe(compiled.artifact?.compiledHash);

    vi.resetModules();

    const { getScriptRuntimeArtifact: getAfterRestart } = await import(
      '@/lib/server/script-runtime-artifacts'
    );
    const afterRestart = await getAfterRestart('runtime/restartable.ts');
    expect(afterRestart).toMatchObject({
      scriptId: 'runtime/restartable.ts',
      sourceHash: hashScriptRuntimeSource(sourceText),
      compiledHash: compiled.artifact?.compiledHash,
      generatedAt: compiled.artifact?.generatedAt,
    });
  });

  it('round-trips runtime artifacts through a production global blob store', async () => {
    process.env.NETLIFY = 'true';
    process.env.CONTEXT = 'production';
    process.env.REY30_SCRIPT_BLOB_STORE = 'custom-runtime-store';

    const sourceText = 'export function update(ctx) { ctx.setTransform({ x: 2 }); }\n';
    const compiled = compileScriptRuntimeArtifact({
      scriptId: 'runtime/blobbed.ts',
      sourceText,
    });
    expect(compiled.artifact).toBeTruthy();

    const {
      deleteScriptRuntimeArtifact,
      getScriptRuntimeArtifact,
      getScriptRuntimeArtifactStorageStatus,
      putScriptRuntimeArtifact,
    } = await import('@/lib/server/script-runtime-artifacts');

    const status = await getScriptRuntimeArtifactStorageStatus();
    expect(status).toMatchObject({
      available: true,
      backend: 'netlify-blobs',
      scope: 'global',
      storeName: 'custom-runtime-store',
    });

    await putScriptRuntimeArtifact('runtime/blobbed.ts', compiled.artifact!);
    expect(getStoreMock).toHaveBeenCalledWith('custom-runtime-store');
    expect(getDeployStoreMock).not.toHaveBeenCalled();

    const loaded = await getScriptRuntimeArtifact('runtime/blobbed.ts');
    expect(loaded?.compiledHash).toBe(compiled.artifact?.compiledHash);
    expect(loaded?.sourceHash).toBe(hashScriptRuntimeSource(sourceText));

    await deleteScriptRuntimeArtifact('runtime/blobbed.ts');
    expect(await getScriptRuntimeArtifact('runtime/blobbed.ts')).toBeNull();
  });

  it('persists verification history across filesystem module reloads', async () => {
    const scriptsRoot = await mkdtemp(path.join(os.tmpdir(), 'rey30-runtime-verifications-'));
    cleanupDirs.add(scriptsRoot);
    process.env.REY30_SCRIPT_ROOT = scriptsRoot;

    const {
      getScriptRuntimeArtifactVerification,
      listScriptRuntimeArtifactVerifications,
      recordScriptRuntimeArtifactVerification,
    } = await import('@/lib/server/script-runtime-artifacts');

    await recordScriptRuntimeArtifactVerification('scribs/movement.scrib.ts', {
      ok: true,
      message: 'compile ok',
      verifiedAt: '2026-04-18T00:00:00.000Z',
    });
    const failed = await recordScriptRuntimeArtifactVerification('scribs/movement.scrib.ts', {
      ok: false,
      message: 'compile failed',
      verifiedAt: '2026-04-18T00:01:00.000Z',
    });

    expect(failed).toMatchObject({
      scriptId: 'scribs/movement.scrib.ts',
      okCount: 1,
      failedCount: 1,
      lastStatus: 'failed',
      lastMessage: 'compile failed',
    });

    vi.resetModules();

    const {
      getScriptRuntimeArtifactVerification: getAfterReload,
      listScriptRuntimeArtifactVerifications: listAfterReload,
    } = await import('@/lib/server/script-runtime-artifacts');
    expect(await getAfterReload('scribs/movement.scrib.ts')).toMatchObject({
      okCount: 1,
      failedCount: 1,
      lastStatus: 'failed',
    });
    expect(await listAfterReload()).toContainEqual(
      expect.objectContaining({ scriptId: 'scribs/movement.scrib.ts' })
    );
    expect(await listScriptRuntimeArtifactVerifications()).toContainEqual(
      expect.objectContaining({ scriptId: 'scribs/movement.scrib.ts' })
    );
    expect(await getScriptRuntimeArtifactVerification('scribs/movement.scrib.ts')).toMatchObject({
      okCount: 1,
      failedCount: 1,
    });
  });

  it('round-trips verification history through a production global blob store', async () => {
    process.env.NETLIFY = 'true';
    process.env.CONTEXT = 'production';
    process.env.REY30_SCRIPT_BLOB_STORE = 'custom-runtime-store';

    const {
      getScriptRuntimeArtifactVerification,
      listScriptRuntimeArtifactVerifications,
      recordScriptRuntimeArtifactVerification,
    } = await import('@/lib/server/script-runtime-artifacts');

    await recordScriptRuntimeArtifactVerification('scribs/collider.scrib.ts', {
      ok: true,
      message: 'ok',
      verifiedAt: '2026-04-18T00:00:00.000Z',
    });

    expect(getStoreMock).toHaveBeenCalledWith('custom-runtime-store');
    expect(await getScriptRuntimeArtifactVerification('scribs/collider.scrib.ts')).toMatchObject({
      scriptId: 'scribs/collider.scrib.ts',
      okCount: 1,
      failedCount: 0,
      lastStatus: 'ok',
    });
    expect(await listScriptRuntimeArtifactVerifications()).toContainEqual(
      expect.objectContaining({ scriptId: 'scribs/collider.scrib.ts' })
    );
  });

  it('persists runtime fault ledger snapshots on filesystem storage', async () => {
    const scriptsRoot = await mkdtemp(path.join(os.tmpdir(), 'rey30-runtime-ledger-'));
    cleanupDirs.add(scriptsRoot);
    process.env.REY30_SCRIPT_ROOT = scriptsRoot;

    const {
      listScriptRuntimeFaultLedgerSnapshots,
      putScriptRuntimeFaultLedgerSnapshot,
      scriptRuntimeFaultLedgerSnapshotsToCsv,
    } = await import('@/lib/server/script-runtime-artifacts');

    const snapshot = await putScriptRuntimeFaultLedgerSnapshot({
      instanceId: 'runtime-instance-1',
      sessionId: 'session-1',
      playState: 'PLAYING',
      generatedAt: '2026-04-18T00:00:00.000Z',
      items: [
        {
          severity: 'P0',
          source: 'scrib',
          target: 'scribs/movement.scrib.ts',
          state: 'runtime en backoff',
          action: 'verificar artifact',
          detail: 'HTTP 409',
          verificationStatus: 'failed',
          verificationOkCount: 0,
          verificationFailedCount: 1,
        },
      ],
    });

    expect(snapshot).toMatchObject({
      instanceId: 'runtime-instance-1',
      sessionId: 'session-1',
      itemCount: 1,
      p0Count: 1,
    });

    vi.resetModules();
    const { listScriptRuntimeFaultLedgerSnapshots: listAfterReload } = await import(
      '@/lib/server/script-runtime-artifacts'
    );
    expect(await listAfterReload()).toContainEqual(
      expect.objectContaining({
        id: snapshot.id,
        itemCount: 1,
        p0Count: 1,
      })
    );
    expect(await listScriptRuntimeFaultLedgerSnapshots()).toContainEqual(
      expect.objectContaining({ id: snapshot.id })
    );
    const csv = scriptRuntimeFaultLedgerSnapshotsToCsv([snapshot]);
    expect(csv).toContain('snapshotId');
    expect(csv).toContain('scribs/movement.scrib.ts');
  });

  it('filters runtime fault ledger snapshots for server-side CSV exports', async () => {
    const {
      filterScriptRuntimeFaultLedgerSnapshots,
      scriptRuntimeFaultLedgerSnapshotsToCsv,
    } = await import('@/lib/server/script-runtime-artifacts');

    const snapshots = [
      {
        id: 'snap-1',
        instanceId: 'runtime-1',
        sessionId: 'session-1',
        playState: 'PLAYING',
        generatedAt: '2026-04-18T12:00:00.000Z',
        itemCount: 2,
        p0Count: 1,
        p1Count: 1,
        p2Count: 0,
        items: [
          {
            severity: 'P0' as const,
            source: 'scrib' as const,
            target: 'scribs/movement.scrib.ts',
            state: 'runtime en backoff',
            action: 'verificar artifact',
            detail: 'HTTP 409',
            verificationStatus: 'failed' as const,
            verificationOkCount: 0,
            verificationFailedCount: 1,
          },
          {
            severity: 'P1' as const,
            source: 'legacy' as const,
            target: 'scripts/legacy.ts',
            state: 'artifact stale',
            action: 'verificar artifact',
            detail: 'hash mismatch',
            verificationStatus: null,
            verificationOkCount: 0,
            verificationFailedCount: 0,
          },
        ],
      },
      {
        id: 'snap-2',
        instanceId: 'runtime-1',
        sessionId: 'session-1',
        playState: 'PLAYING',
        generatedAt: '2026-04-16T12:00:00.000Z',
        itemCount: 1,
        p0Count: 1,
        p1Count: 0,
        p2Count: 0,
        items: [
          {
            severity: 'P0' as const,
            source: 'scrib' as const,
            target: 'scribs/collider.scrib.ts',
            state: 'runtime en backoff',
            action: 'verificar artifact',
            detail: 'HTTP 409',
            verificationStatus: 'failed' as const,
            verificationOkCount: 0,
            verificationFailedCount: 1,
          },
        ],
      },
    ];

    const filtered = filterScriptRuntimeFaultLedgerSnapshots(snapshots, {
      severities: ['P0'],
      target: 'movement',
      from: '2026-04-18',
      to: '2026-04-18',
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]).toMatchObject({
      id: 'snap-1',
      itemCount: 1,
      p0Count: 1,
      p1Count: 0,
    });
    const csv = scriptRuntimeFaultLedgerSnapshotsToCsv(filtered);
    expect(csv).toContain('scribs/movement.scrib.ts');
    expect(csv).not.toContain('scripts/legacy.ts');
    expect(csv).not.toContain('scribs/collider.scrib.ts');
  });

  it('prunes old runtime fault ledger snapshots by retention policy', async () => {
    const scriptsRoot = await mkdtemp(path.join(os.tmpdir(), 'rey30-runtime-ledger-retention-'));
    cleanupDirs.add(scriptsRoot);
    process.env.REY30_SCRIPT_ROOT = scriptsRoot;
    process.env.REY30_RUNTIME_LEDGER_RETENTION_MAX = '2';
    process.env.REY30_RUNTIME_LEDGER_RETENTION_DAYS = '0';

    const {
      listScriptRuntimeFaultLedgerSnapshots,
      putScriptRuntimeFaultLedgerSnapshot,
    } = await import('@/lib/server/script-runtime-artifacts');

    for (const generatedAt of [
      '2026-04-18T00:00:00.000Z',
      '2026-04-18T00:01:00.000Z',
      '2026-04-18T00:02:00.000Z',
    ]) {
      await putScriptRuntimeFaultLedgerSnapshot({
        instanceId: 'runtime-instance-1',
        sessionId: 'session-1',
        playState: 'PLAYING',
        generatedAt,
        items: [],
      });
    }

    const snapshots = await listScriptRuntimeFaultLedgerSnapshots(10);
    expect(snapshots.map((snapshot) => snapshot.generatedAt)).toEqual([
      '2026-04-18T00:02:00.000Z',
      '2026-04-18T00:01:00.000Z',
    ]);
  });

  it('persists editable retention policy and prune audit entries', async () => {
    const scriptsRoot = await mkdtemp(path.join(os.tmpdir(), 'rey30-runtime-ledger-audit-'));
    cleanupDirs.add(scriptsRoot);
    process.env.REY30_SCRIPT_ROOT = scriptsRoot;

    const {
      getConfiguredScriptRuntimeFaultLedgerRetentionPolicy,
      listScriptRuntimeFaultLedgerPruneAudits,
      listScriptRuntimeFaultLedgerSnapshots,
      pruneScriptRuntimeFaultLedgerSnapshots,
      putScriptRuntimeFaultLedgerRetentionPolicy,
      putScriptRuntimeFaultLedgerSnapshot,
    } = await import('@/lib/server/script-runtime-artifacts');

    await putScriptRuntimeFaultLedgerRetentionPolicy({
      maxSnapshots: 0,
      maxAgeDays: 0,
      updatedBy: 'editor-1',
      updatedAt: '2026-04-18T00:00:00.000Z',
    });

    for (const generatedAt of [
      '2026-04-18T00:00:00.000Z',
      '2026-04-18T00:01:00.000Z',
      '2026-04-18T00:02:00.000Z',
    ]) {
      await putScriptRuntimeFaultLedgerSnapshot({
        instanceId: 'runtime-instance-1',
        sessionId: 'session-1',
        playState: 'PLAYING',
        generatedAt,
        items: [],
      });
    }

    const policy = await putScriptRuntimeFaultLedgerRetentionPolicy({
      maxSnapshots: 1,
      maxAgeDays: 0,
      updatedBy: 'editor-1',
      updatedAt: '2026-04-18T00:03:00.000Z',
    });

    expect(await getConfiguredScriptRuntimeFaultLedgerRetentionPolicy()).toMatchObject({
      maxSnapshots: 1,
      maxAgeDays: 0,
      source: 'admin',
      updatedBy: 'editor-1',
    });

    const dryRun = await pruneScriptRuntimeFaultLedgerSnapshots({
      policy,
      dryRun: true,
      actorId: 'editor-1',
      reason: 'test-dry-run',
      now: Date.parse('2026-04-18T00:04:00.000Z'),
    });
    expect(dryRun).toMatchObject({
      dryRun: true,
      deleted: 0,
      wouldDelete: 2,
      retained: 3,
    });
    expect(await listScriptRuntimeFaultLedgerSnapshots(10)).toHaveLength(3);

    const actual = await pruneScriptRuntimeFaultLedgerSnapshots({
      policy,
      actorId: 'editor-1',
      reason: 'test-prune',
      now: Date.parse('2026-04-18T00:05:00.000Z'),
    });
    expect(actual).toMatchObject({
      dryRun: false,
      deleted: 2,
      wouldDelete: 2,
      retained: 1,
    });
    expect(await listScriptRuntimeFaultLedgerSnapshots(10)).toHaveLength(1);
    expect(await listScriptRuntimeFaultLedgerPruneAudits(10)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ dryRun: true, reason: 'test-dry-run' }),
        expect.objectContaining({ dryRun: false, reason: 'test-prune' }),
      ])
    );
  });

  it('persists runtime forensics admin notifications and exports CSV', async () => {
    const scriptsRoot = await mkdtemp(path.join(os.tmpdir(), 'rey30-runtime-notifications-'));
    cleanupDirs.add(scriptsRoot);
    process.env.REY30_SCRIPT_ROOT = scriptsRoot;

    const {
      acknowledgeScriptRuntimeForensicsAdminNotification,
      listScriptRuntimeForensicsAdminNotifications,
      pruneScriptRuntimeForensicsAdminNotifications,
      putScriptRuntimeForensicsAdminNotification,
      scriptRuntimeForensicsAdminNotificationsToCsv,
    } = await import('@/lib/server/script-runtime-artifacts');

    const notification = await putScriptRuntimeForensicsAdminNotification({
      id: 'runtime-forensics-slo:slo-1',
      alertId: 'slo-1',
      createdAt: '2026-04-18T00:00:00.000Z',
      level: 'critical',
      indicator: 'runtime_forensics_p0_reappeared',
      title: 'SLO P0 reaparecido',
      message: 'P0 reaparecido',
      current: 2,
      objective: 0,
      createdBy: 'editor-1',
    });

    expect(notification).toMatchObject({
      acknowledgedAt: null,
      level: 'critical',
      source: 'slo',
    });

    await acknowledgeScriptRuntimeForensicsAdminNotification({
      id: notification.id,
      acknowledgedAt: '2026-04-18T00:01:00.000Z',
      acknowledgedBy: 'editor-1',
    });

    vi.resetModules();
    const { listScriptRuntimeForensicsAdminNotifications: listAfterReload } = await import(
      '@/lib/server/script-runtime-artifacts'
    );
    const notifications = await listAfterReload(10);
    expect(notifications).toContainEqual(
      expect.objectContaining({
        id: notification.id,
        acknowledgedAt: '2026-04-18T00:01:00.000Z',
        acknowledgedBy: 'editor-1',
      })
    );
    expect(await listScriptRuntimeForensicsAdminNotifications(10)).toContainEqual(
      expect.objectContaining({ id: notification.id })
    );

    const csv = scriptRuntimeForensicsAdminNotificationsToCsv(notifications);
    expect(csv).toContain('alertId');
    expect(csv).toContain('SLO P0 reaparecido');

    await putScriptRuntimeForensicsAdminNotification({
      id: 'runtime-forensics-slo:slo-2',
      alertId: 'slo-2',
      createdAt: '2026-04-18T00:02:00.000Z',
      level: 'warning',
      indicator: 'runtime_forensics_p0_reappeared',
      title: 'SLO P0 reaparecido',
      message: 'P0 reaparecido otra vez',
      current: 1,
      objective: 0,
      createdBy: 'editor-1',
    });
    await putScriptRuntimeForensicsAdminNotification({
      id: 'runtime-forensics-slo:slo-3',
      alertId: 'slo-3',
      createdAt: '2026-04-18T00:03:00.000Z',
      level: 'critical',
      indicator: 'runtime_forensics_p0_reappeared',
      title: 'SLO P0 reaparecido',
      message: 'P0 reaparecido tercera vez',
      current: 3,
      objective: 0,
      createdBy: 'editor-1',
    });

    const dryRun = await pruneScriptRuntimeForensicsAdminNotifications({
      dryRun: true,
      policy: { maxNotifications: 1, maxAgeDays: 0 },
    });
    expect(dryRun).toMatchObject({
      dryRun: true,
      deleted: 0,
      wouldDelete: 2,
      retained: 3,
    });

    const actual = await pruneScriptRuntimeForensicsAdminNotifications({
      policy: { maxNotifications: 1, maxAgeDays: 0 },
    });
    expect(actual).toMatchObject({
      dryRun: false,
      deleted: 2,
      wouldDelete: 2,
      retained: 1,
    });
    expect(await listScriptRuntimeForensicsAdminNotifications(10)).toEqual([
      expect.objectContaining({ id: 'runtime-forensics-slo:slo-3' }),
    ]);
  });
});
