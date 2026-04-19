import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const requireSessionMock = vi.fn();
const logSecurityEventMock = vi.fn(async () => undefined);
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
const listScriptRuntimeFaultLedgerSnapshotsMock = vi.fn();
const putScriptRuntimeFaultLedgerSnapshotMock = vi.fn();
const getConfiguredScriptRuntimeFaultLedgerRetentionPolicyMock = vi.fn(async () => ({
  maxSnapshots: 500,
  maxAgeDays: 30,
  source: 'defaults',
}));
const listScriptRuntimeFaultLedgerPruneAuditsMock = vi.fn(async () => [] as unknown[]);
const putScriptRuntimeFaultLedgerRetentionPolicyMock = vi.fn(async () => ({
  maxSnapshots: 250,
  maxAgeDays: 14,
  source: 'admin',
  updatedAt: '2026-04-18T00:00:00.000Z',
  updatedBy: 'editor-1',
}));
const pruneScriptRuntimeFaultLedgerSnapshotsMock = vi.fn(async (params?: { dryRun?: boolean }) => ({
  dryRun: Boolean(params?.dryRun),
  deleted: params?.dryRun ? 0 : 2,
  wouldDelete: 2,
  retained: 3,
  policy: { maxSnapshots: 500, maxAgeDays: 30, source: 'defaults' },
  candidates: [
    {
      id: 'snap-old',
      generatedAt: '2026-04-17T00:00:00.000Z',
      itemCount: 1,
      p0Count: 1,
      reason: 'age',
    },
  ],
  auditId: params?.dryRun ? 'dry-run-1' : 'prune-1',
}));
const filterScriptRuntimeFaultLedgerSnapshotsMock = vi.fn((snapshots: unknown[]) => snapshots);
const scriptRuntimeFaultLedgerSnapshotsToCsvMock = vi.fn(() => 'snapshotId,target\nsnap-1,scribs/movement.scrib.ts\n');
const scriptRuntimeFaultLedgerPruneAuditsToCsvMock = vi.fn(() => 'id,reason\naudit-1,manual-prune\n');
const listScriptRuntimeForensicsAdminNotificationsMock = vi.fn(async () => [] as unknown[]);
const putScriptRuntimeForensicsAdminNotificationMock = vi.fn(async (notification: unknown) => ({
  id: 'runtime-forensics-slo:slo-1',
  alertId: 'slo-1',
  createdAt: '2026-04-18T00:00:00.000Z',
  acknowledgedAt: null,
  level: 'critical',
  indicator: 'runtime_forensics_p0_reappeared',
  title: 'SLO P0 reaparecido',
  message: 'P0 reaparecido',
  current: 2,
  objective: 0,
  createdBy: 'editor-1',
  acknowledgedBy: null,
  source: 'slo',
  ...(notification as object),
}));
const acknowledgeScriptRuntimeForensicsAdminNotificationMock = vi.fn(async (params: { id: string }) => ({
  id: params.id,
  alertId: 'slo-1',
  createdAt: '2026-04-18T00:00:00.000Z',
  acknowledgedAt: '2026-04-18T00:01:00.000Z',
  level: 'critical',
  indicator: 'runtime_forensics_p0_reappeared',
  title: 'SLO P0 reaparecido',
  message: 'P0 reaparecido',
  current: 2,
  objective: 0,
  createdBy: 'editor-1',
  acknowledgedBy: 'editor-1',
  source: 'slo',
}));
const scriptRuntimeForensicsAdminNotificationsToCsvMock = vi.fn(() => 'id,title\nruntime-forensics-slo:slo-1,SLO P0 reaparecido\n');
const getScriptRuntimeForensicsAdminNotificationRetentionPolicyMock = vi.fn(() => ({
  maxNotifications: 200,
  maxAgeDays: 30,
  source: 'defaults',
}));
const pruneScriptRuntimeForensicsAdminNotificationsMock = vi.fn(async (params?: { dryRun?: boolean }) => ({
  dryRun: Boolean(params?.dryRun),
  deleted: params?.dryRun ? 0 : 1,
  wouldDelete: 1,
  retained: 2,
  policy: { maxNotifications: 2, maxAgeDays: 14, source: 'request' },
  candidates: [
    {
      id: 'runtime-forensics-slo:old',
      createdAt: '2026-04-01T00:00:00.000Z',
      level: 'critical',
      indicator: 'runtime_forensics_p0_reappeared',
      reason: 'age',
    },
  ],
}));
const getRuntimeForensicsWebhookConfigMock = vi.fn(() => ({
  configured: true,
  enabled: true,
  source: 'persisted_config',
  url: 'https://hooks.example.test/rey30',
  host: 'hooks.example.test',
  signingEnabled: true,
  hasSecret: true,
  allowlistHosts: ['hooks.example.test'],
  effectiveAllowlist: ['hooks.example.test'],
  allowlistConfigured: true,
  allowlistBlocked: false,
  blockedReason: null,
  updatedAt: '2026-04-18T02:00:00.000Z',
  updatedBy: 'owner-1',
}));
const sendRuntimeForensicsWebhookMock = vi.fn(async () => ({
  configured: true,
  delivered: true,
  status: 202,
}));
const listRuntimeForensicsWebhookDeliveriesMock = vi.fn(async () => [] as unknown[]);
const filterRuntimeForensicsWebhookDeliveriesMock = vi.fn((deliveries: unknown[]) => deliveries);
const getConfiguredRuntimeForensicsWebhookDeliveryRetentionPolicyMock = vi.fn(async () => ({
  maxDeliveries: 500,
  maxAgeDays: 30,
  source: 'defaults',
}));
const listRuntimeForensicsWebhookDeliveryPruneAuditsMock = vi.fn(async () => [] as unknown[]);
const normalizeRuntimeForensicsWebhookDeliveryRetentionPolicyMock = vi.fn((policy: {
  maxDeliveries?: number;
  maxAgeDays?: number;
  source?: string;
}) => ({
  maxDeliveries: Number.isFinite(Number(policy.maxDeliveries)) ? Number(policy.maxDeliveries) : 500,
  maxAgeDays: Number.isFinite(Number(policy.maxAgeDays)) ? Number(policy.maxAgeDays) : 30,
  source: policy.source || 'request',
}));
const pruneRuntimeForensicsWebhookDeliveriesMock = vi.fn(async (params?: {
  dryRun?: boolean;
  policy?: unknown;
  actorId?: string | null;
  reason?: string;
}) => ({
  dryRun: Boolean(params?.dryRun),
  deleted: params?.dryRun ? 0 : 1,
  wouldDelete: 1,
  retained: 1,
  policy: params?.policy || { maxDeliveries: 500, maxAgeDays: 30, source: 'defaults' },
  candidates: [
    {
      id: 'delivery-old',
      createdAt: '2026-04-01T00:00:00.000Z',
      status: 'blocked',
      event: 'runtime_forensics.slo_alert',
      reason: 'age',
    },
  ],
  auditId: 'webhook-prune-audit-1',
}));
const putRuntimeForensicsWebhookDeliveryRetentionPolicyMock = vi.fn(async () => ({
  maxDeliveries: 10,
  maxAgeDays: 7,
  source: 'admin',
  updatedAt: '2026-04-18T03:00:00.000Z',
  updatedBy: 'owner-1',
}));
const putRuntimeForensicsWebhookConfigMock = vi.fn(async () => ({
  enabled: true,
  url: 'https://hooks.example.test/rey30',
}));
const deleteRuntimeForensicsWebhookConfigMock = vi.fn(async () => undefined);
const normalizeRuntimeForensicsWebhookAllowlistMock = vi.fn((input: unknown) =>
  String(input || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
);
const retryRuntimeForensicsWebhookDeliveryMock = vi.fn(async () => ({
  configured: true,
  delivered: true,
  status: 202,
}));
const retryRuntimeForensicsWebhookDeliveriesMock = vi.fn(async () => ({
  attempted: 1,
  delivered: 1,
  failed: 0,
  results: [{ configured: true, delivered: true, status: 202 }],
}));
const runtimeForensicsWebhookDeliveriesToCsvMock = vi.fn(
  () => 'id,status\ndelivery-1,backoff\n'
);
const runtimeForensicsWebhookDeliveryPruneAuditsToCsvMock = vi.fn(
  () => 'id,reason\nwebhook-audit-1,manual-prune\n'
);
const putRuntimeForensicsPrometheusIncidentMock = vi.fn(async (incident: unknown) => incident);
const resolveOpenRuntimeForensicsPrometheusIncidentsMock = vi.fn(async () => [] as unknown[]);
const listRuntimeForensicsPrometheusIncidentsMock = vi.fn(async () => [] as unknown[]);
const runtimeForensicsPrometheusIncidentsToCsvMock = vi.fn(
  () => 'id,metricName,status\nincident-1,rey30_runtime_forensics_webhook_delivery_failure_rate,open\n'
);
const getRuntimeForensicsExternalPrometheusProbeConfigMock = vi.fn(() => ({
  enabled: true,
  source: 'env',
  metricName: 'rey30_runtime_forensics_webhook_delivery_failure_rate',
  metricsUrl: 'https://app.example.test/api/ops/metrics',
  alertmanagerUrl: 'https://alertmanager.example.test/api/v2/status',
  timeoutMs: 8000,
  tokenConfigured: true,
}));
const getLatestRuntimeForensicsExternalPrometheusProbeSnapshotMock = vi.fn(
  async () => null as unknown
);
const runRuntimeForensicsExternalPrometheusProbeMock = vi.fn(async () => ({
  id: 'external-prometheus-probe:metric:2026-04-18T02:00:00.000Z',
  checkedAt: '2026-04-18T02:00:00.000Z',
  source: 'server',
  ok: true,
  status: 'ok',
  metricName: 'rey30_runtime_forensics_webhook_delivery_failure_rate',
  metricsUrl: 'https://app.example.test/api/ops/metrics',
  statusCode: 200,
  durationMs: 25,
  value: 0,
  sample: 'rey30_runtime_forensics_webhook_delivery_failure_rate 0',
  error: null,
  alertmanager: {
    configured: true,
    url: 'https://alertmanager.example.test/api/v2/status',
    status: 'ok',
    statusCode: 200,
    version: '0.27.0',
    error: null,
  },
}));
const putRuntimeForensicsExternalPrometheusProbeSnapshotMock = vi.fn(
  async (snapshot: unknown) => ({
    id: 'external-prometheus-probe:published',
    ...(snapshot as object),
  })
);

vi.mock('@/lib/security/auth', () => ({
  requireSession: requireSessionMock,
  authErrorToResponse: authErrorToResponseMock,
  logSecurityEvent: logSecurityEventMock,
}));

vi.mock('@/lib/server/script-runtime-artifacts', () => ({
  acknowledgeScriptRuntimeForensicsAdminNotification: acknowledgeScriptRuntimeForensicsAdminNotificationMock,
  filterScriptRuntimeFaultLedgerSnapshots: filterScriptRuntimeFaultLedgerSnapshotsMock,
  getConfiguredScriptRuntimeFaultLedgerRetentionPolicy: getConfiguredScriptRuntimeFaultLedgerRetentionPolicyMock,
  getScriptRuntimeForensicsAdminNotificationRetentionPolicy: getScriptRuntimeForensicsAdminNotificationRetentionPolicyMock,
  listScriptRuntimeForensicsAdminNotifications: listScriptRuntimeForensicsAdminNotificationsMock,
  listScriptRuntimeFaultLedgerPruneAudits: listScriptRuntimeFaultLedgerPruneAuditsMock,
  listScriptRuntimeFaultLedgerSnapshots: listScriptRuntimeFaultLedgerSnapshotsMock,
  pruneScriptRuntimeFaultLedgerSnapshots: pruneScriptRuntimeFaultLedgerSnapshotsMock,
  pruneScriptRuntimeForensicsAdminNotifications: pruneScriptRuntimeForensicsAdminNotificationsMock,
  putScriptRuntimeForensicsAdminNotification: putScriptRuntimeForensicsAdminNotificationMock,
  putScriptRuntimeFaultLedgerRetentionPolicy: putScriptRuntimeFaultLedgerRetentionPolicyMock,
  putScriptRuntimeFaultLedgerSnapshot: putScriptRuntimeFaultLedgerSnapshotMock,
  scriptRuntimeForensicsAdminNotificationsToCsv: scriptRuntimeForensicsAdminNotificationsToCsvMock,
  scriptRuntimeFaultLedgerPruneAuditsToCsv: scriptRuntimeFaultLedgerPruneAuditsToCsvMock,
  scriptRuntimeFaultLedgerSnapshotsToCsv: scriptRuntimeFaultLedgerSnapshotsToCsvMock,
}));

vi.mock('@/lib/server/runtime-forensics-webhook', () => ({
  deleteRuntimeForensicsWebhookConfig: deleteRuntimeForensicsWebhookConfigMock,
  filterRuntimeForensicsWebhookDeliveries: filterRuntimeForensicsWebhookDeliveriesMock,
  getConfiguredRuntimeForensicsWebhookDeliveryRetentionPolicy: getConfiguredRuntimeForensicsWebhookDeliveryRetentionPolicyMock,
  getRuntimeForensicsWebhookConfig: getRuntimeForensicsWebhookConfigMock,
  listRuntimeForensicsWebhookDeliveryPruneAudits: listRuntimeForensicsWebhookDeliveryPruneAuditsMock,
  listRuntimeForensicsWebhookDeliveries: listRuntimeForensicsWebhookDeliveriesMock,
  normalizeRuntimeForensicsWebhookAllowlist: normalizeRuntimeForensicsWebhookAllowlistMock,
  normalizeRuntimeForensicsWebhookDeliveryRetentionPolicy: normalizeRuntimeForensicsWebhookDeliveryRetentionPolicyMock,
  pruneRuntimeForensicsWebhookDeliveries: pruneRuntimeForensicsWebhookDeliveriesMock,
  putRuntimeForensicsWebhookConfig: putRuntimeForensicsWebhookConfigMock,
  putRuntimeForensicsWebhookDeliveryRetentionPolicy: putRuntimeForensicsWebhookDeliveryRetentionPolicyMock,
  retryRuntimeForensicsWebhookDeliveries: retryRuntimeForensicsWebhookDeliveriesMock,
  retryRuntimeForensicsWebhookDelivery: retryRuntimeForensicsWebhookDeliveryMock,
  runtimeForensicsWebhookDeliveryPruneAuditsToCsv: runtimeForensicsWebhookDeliveryPruneAuditsToCsvMock,
  runtimeForensicsWebhookDeliveriesToCsv: runtimeForensicsWebhookDeliveriesToCsvMock,
  sendRuntimeForensicsWebhook: sendRuntimeForensicsWebhookMock,
}));

vi.mock('@/lib/server/runtime-forensics-prometheus-incidents', () => ({
  listRuntimeForensicsPrometheusIncidents: listRuntimeForensicsPrometheusIncidentsMock,
  putRuntimeForensicsPrometheusIncident: putRuntimeForensicsPrometheusIncidentMock,
  resolveOpenRuntimeForensicsPrometheusIncidents: resolveOpenRuntimeForensicsPrometheusIncidentsMock,
  runtimeForensicsPrometheusIncidentsToCsv: runtimeForensicsPrometheusIncidentsToCsvMock,
}));

vi.mock('@/lib/server/runtime-forensics-prometheus-probe', () => ({
  getLatestRuntimeForensicsExternalPrometheusProbeSnapshot:
    getLatestRuntimeForensicsExternalPrometheusProbeSnapshotMock,
  getRuntimeForensicsExternalPrometheusProbeConfig:
    getRuntimeForensicsExternalPrometheusProbeConfigMock,
  putRuntimeForensicsExternalPrometheusProbeSnapshot:
    putRuntimeForensicsExternalPrometheusProbeSnapshotMock,
  runRuntimeForensicsExternalPrometheusProbe:
    runRuntimeForensicsExternalPrometheusProbeMock,
}));

describe('scripts runtime fault ledger route', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('exports historical fault ledger snapshots as server-side CSV', async () => {
    requireSessionMock.mockResolvedValue({
      id: 'editor-1',
      role: 'EDITOR',
      email: 'editor@example.com',
      sessionId: 'session-1',
    });
    const snapshots = [
      {
        id: 'snap-1',
        instanceId: 'runtime-1',
        sessionId: 'session-1',
        playState: 'PLAYING',
        generatedAt: '2026-04-18T00:00:00.000Z',
        itemCount: 1,
        p0Count: 1,
        p1Count: 0,
        p2Count: 0,
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
      },
    ];
    listScriptRuntimeFaultLedgerSnapshotsMock.mockResolvedValue(snapshots);

    const { GET } = await import('@/app/api/scripts/runtime/fault-ledger/route');
    const response = await GET(
      new NextRequest(
        'http://localhost/api/scripts/runtime/fault-ledger?format=csv&limit=3&severity=P0&target=movement&from=2026-04-18&to=2026-04-18'
      )
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/csv');
    expect(response.headers.get('content-disposition')).toContain(
      'runtime-fault-ledger-history.csv'
    );
    expect(await response.text()).toContain('scribs/movement.scrib.ts');
    expect(listScriptRuntimeFaultLedgerSnapshotsMock).toHaveBeenCalledWith(3);
    expect(filterScriptRuntimeFaultLedgerSnapshotsMock).toHaveBeenCalledWith(snapshots, {
      severities: ['P0'],
      target: 'movement',
      from: '2026-04-18',
      to: '2026-04-18',
    });
    expect(scriptRuntimeFaultLedgerSnapshotsToCsvMock).toHaveBeenCalledWith(snapshots);
  });

  it('exports filtered historical fault ledger snapshots as JSON', async () => {
    requireSessionMock.mockResolvedValue({
      id: 'editor-1',
      role: 'EDITOR',
      email: 'editor@example.com',
      sessionId: 'session-1',
    });
    const snapshots = [
      {
        id: 'snap-1',
        instanceId: 'runtime-1',
        sessionId: 'session-1',
        playState: 'PLAYING',
        generatedAt: '2026-04-18T00:00:00.000Z',
        itemCount: 1,
        p0Count: 1,
        p1Count: 0,
        p2Count: 0,
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
      },
    ];
    listScriptRuntimeFaultLedgerSnapshotsMock.mockResolvedValue(snapshots);

    const { GET } = await import('@/app/api/scripts/runtime/fault-ledger/route');
    const response = await GET(
      new NextRequest(
        'http://localhost/api/scripts/runtime/fault-ledger?format=json&limit=5&severity=P0&target=movement'
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('content-disposition')).toContain(
      'runtime-fault-ledger-history.json'
    );
    expect(body).toMatchObject({
      ok: true,
      filters: {
        severities: ['P0'],
        target: 'movement',
      },
      retentionPolicy: {
        maxSnapshots: 500,
        maxAgeDays: 30,
      },
      snapshots,
    });
    expect(listScriptRuntimeFaultLedgerSnapshotsMock).toHaveBeenCalledWith(5);
    expect(filterScriptRuntimeFaultLedgerSnapshotsMock).toHaveBeenCalledWith(
      snapshots,
      expect.objectContaining({
        severities: ['P0'],
        target: 'movement',
      })
    );
  });

  it('prunes historical fault ledger snapshots on request', async () => {
    requireSessionMock.mockResolvedValue({
      id: 'editor-1',
      role: 'EDITOR',
      email: 'editor@example.com',
      sessionId: 'session-1',
    });
    listScriptRuntimeFaultLedgerSnapshotsMock.mockResolvedValue([]);

    const { POST } = await import('@/app/api/scripts/runtime/fault-ledger/route');
    const response = await POST(
      new NextRequest('http://localhost/api/scripts/runtime/fault-ledger?limit=7', {
        method: 'POST',
        body: JSON.stringify({ action: 'prune' }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(pruneScriptRuntimeFaultLedgerSnapshotsMock).toHaveBeenCalledWith({
      actorId: 'editor-1',
      reason: 'manual-prune',
    });
    expect(logSecurityEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'editor-1',
        action: 'runtime.forensics.prune_execute',
        durability: 'critical',
      })
    );
    expect(listScriptRuntimeFaultLedgerSnapshotsMock).toHaveBeenCalledWith(7);
    expect(body).toMatchObject({
      ok: true,
      prune: {
        deleted: 2,
        wouldDelete: 2,
        retained: 3,
      },
      retentionPolicy: {
        maxSnapshots: 500,
        maxAgeDays: 30,
      },
      snapshots: [],
    });
  });

  it('dry-runs historical fault ledger pruning without deleting snapshots', async () => {
    requireSessionMock.mockResolvedValue({
      id: 'editor-1',
      role: 'EDITOR',
      email: 'editor@example.com',
      sessionId: 'session-1',
    });
    listScriptRuntimeFaultLedgerSnapshotsMock.mockResolvedValue([]);

    const { POST } = await import('@/app/api/scripts/runtime/fault-ledger/route');
    const response = await POST(
      new NextRequest('http://localhost/api/scripts/runtime/fault-ledger?limit=7', {
        method: 'POST',
        body: JSON.stringify({ action: 'dry-run-prune' }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(pruneScriptRuntimeFaultLedgerSnapshotsMock).toHaveBeenCalledWith({
      dryRun: true,
      actorId: 'editor-1',
      reason: 'manual-dry-run',
    });
    expect(logSecurityEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'editor-1',
        action: 'runtime.forensics.prune_dry_run',
        durability: 'critical',
      })
    );
    expect(body).toMatchObject({
      ok: true,
      prune: {
        dryRun: true,
        deleted: 0,
        wouldDelete: 2,
      },
    });
  });

  it('updates the runtime fault ledger retention policy from admin UI', async () => {
    requireSessionMock.mockResolvedValue({
      id: 'editor-1',
      role: 'EDITOR',
      email: 'editor@example.com',
      sessionId: 'session-1',
    });

    const { POST } = await import('@/app/api/scripts/runtime/fault-ledger/route');
    const response = await POST(
      new NextRequest('http://localhost/api/scripts/runtime/fault-ledger', {
        method: 'POST',
        body: JSON.stringify({
          action: 'update-retention-policy',
          retentionPolicy: {
            maxSnapshots: 250,
            maxAgeDays: 14,
          },
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(putScriptRuntimeFaultLedgerRetentionPolicyMock).toHaveBeenCalledWith({
      maxSnapshots: 250,
      maxAgeDays: 14,
      updatedBy: 'editor-1',
    });
    expect(logSecurityEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'editor-1',
        action: 'runtime.forensics.retention_policy_update',
        durability: 'critical',
      })
    );
    expect(body).toMatchObject({
      ok: true,
      retentionPolicy: {
        maxSnapshots: 250,
        maxAgeDays: 14,
        source: 'admin',
      },
    });
  });

  it('exports prune audit log as CSV and JSON', async () => {
    requireSessionMock.mockResolvedValue({
      id: 'editor-1',
      role: 'EDITOR',
      email: 'editor@example.com',
      sessionId: 'session-1',
    });
    const audits = [
      {
        id: 'audit-1',
        auditId: 'audit-1',
        createdAt: '2026-04-18T00:00:00.000Z',
        actorId: 'editor-1',
        reason: 'manual-prune',
        dryRun: false,
        deleted: 1,
        wouldDelete: 1,
        retained: 2,
        policy: { maxSnapshots: 2, maxAgeDays: 30 },
        candidates: [],
      },
      {
        id: 'audit-2',
        auditId: 'audit-2',
        createdAt: '2026-04-16T00:00:00.000Z',
        actorId: 'editor-2',
        reason: 'manual-dry-run',
        dryRun: true,
        deleted: 0,
        wouldDelete: 1,
        retained: 3,
        policy: { maxSnapshots: 2, maxAgeDays: 30 },
        candidates: [],
      },
    ];
    listScriptRuntimeFaultLedgerPruneAuditsMock.mockResolvedValue(audits);

    const { GET } = await import('@/app/api/scripts/runtime/fault-ledger/audit/route');
    const csvResponse = await GET(
      new NextRequest(
        'http://localhost/api/scripts/runtime/fault-ledger/audit?format=csv&limit=9&actor=editor-1&reason=prune&from=2026-04-18&to=2026-04-18'
      )
    );
    expect(csvResponse.status).toBe(200);
    expect(csvResponse.headers.get('content-type')).toContain('text/csv');
    expect(csvResponse.headers.get('content-disposition')).toContain(
      'runtime-fault-ledger-prune-audit.csv'
    );
    expect(await csvResponse.text()).toContain('manual-prune');
    expect(listScriptRuntimeFaultLedgerPruneAuditsMock).toHaveBeenCalledWith(100);
    expect(scriptRuntimeFaultLedgerPruneAuditsToCsvMock).toHaveBeenCalledWith([audits[0]]);

    const jsonResponse = await GET(
      new NextRequest(
        'http://localhost/api/scripts/runtime/fault-ledger/audit?format=json&limit=9&actor=editor-1&reason=prune&from=2026-04-18&to=2026-04-18'
      )
    );
    const body = await jsonResponse.json();
    expect(jsonResponse.status).toBe(200);
    expect(jsonResponse.headers.get('content-disposition')).toContain(
      'runtime-fault-ledger-prune-audit.json'
    );
    expect(body).toMatchObject({
      ok: true,
      filters: {
        actor: 'editor-1',
        reason: 'prune',
        from: '2026-04-18',
        to: '2026-04-18',
      },
      auditCount: 1,
      audits: [audits[0]],
    });
  });

  it('summarizes the multi-session runtime forensics overview', async () => {
    requireSessionMock.mockResolvedValue({
      id: 'editor-1',
      role: 'EDITOR',
      email: 'editor@example.com',
      sessionId: 'session-1',
    });
    listScriptRuntimeFaultLedgerSnapshotsMock.mockResolvedValue([
      {
        id: 'snap-session-a-new',
        instanceId: 'runtime-a',
        sessionId: 'session-a',
        playState: 'PLAYING',
        generatedAt: '2026-04-18T02:00:00.000Z',
        itemCount: 2,
        p0Count: 2,
        p1Count: 0,
        p2Count: 0,
        items: [],
      },
      {
        id: 'snap-session-a-old',
        instanceId: 'runtime-a',
        sessionId: 'session-a',
        playState: 'IDLE',
        generatedAt: '2026-04-18T01:00:00.000Z',
        itemCount: 1,
        p0Count: 0,
        p1Count: 1,
        p2Count: 0,
        items: [],
      },
      {
        id: 'snap-session-b',
        instanceId: 'runtime-b',
        sessionId: 'session-b',
        playState: 'PAUSED',
        generatedAt: '2026-04-17T23:00:00.000Z',
        itemCount: 3,
        p0Count: 1,
        p1Count: 1,
        p2Count: 1,
        items: [],
      },
    ]);
    listScriptRuntimeForensicsAdminNotificationsMock.mockResolvedValue([
      {
        id: 'runtime-forensics-slo:slo-1',
        alertId: 'slo-1',
        createdAt: '2026-04-18T02:00:00.000Z',
        acknowledgedAt: null,
        level: 'critical',
        indicator: 'runtime_forensics_p0_reappeared',
        title: 'SLO P0 reaparecido',
        message: 'P0 reaparecido',
        current: 2,
        objective: 0,
        createdBy: 'editor-1',
        acknowledgedBy: null,
        source: 'slo',
      },
    ]);
    listScriptRuntimeFaultLedgerPruneAuditsMock.mockResolvedValue([
      {
        id: 'audit-1',
        auditId: 'audit-1',
        createdAt: '2026-04-18T00:00:00.000Z',
        actorId: 'editor-1',
        reason: 'manual-prune',
        dryRun: false,
        deleted: 1,
        wouldDelete: 1,
        retained: 2,
        policy: { maxSnapshots: 2, maxAgeDays: 30 },
        candidates: [],
      },
    ]);
    const { engineTelemetry } = await import('@/engine/telemetry/engineTelemetry');
    engineTelemetry.reset();
    engineTelemetry.recordRuntimeForensicsEvent({ action: 'p0_reappeared', count: 2 });

    const { GET } = await import('@/app/api/scripts/runtime/fault-ledger/overview/route');
    const response = await GET(
      new NextRequest('http://localhost/api/scripts/runtime/fault-ledger/overview?limit=25')
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(listScriptRuntimeFaultLedgerSnapshotsMock).toHaveBeenCalledWith(25);
    expect(listScriptRuntimeForensicsAdminNotificationsMock).toHaveBeenCalledWith(25);
    expect(listScriptRuntimeFaultLedgerPruneAuditsMock).toHaveBeenCalledWith(25);
    expect(listRuntimeForensicsWebhookDeliveriesMock).toHaveBeenCalledWith(25);
    expect(body).toMatchObject({
      ok: true,
      webhook: {
        configured: true,
        signingEnabled: true,
      },
      totals: {
        sessions: 2,
        snapshots: 3,
        snapshotsWithP0: 2,
        activeNotifications: 1,
        criticalNotifications: 1,
        pruneAudits: 1,
        runtimeForensicsEvents: 1,
        webhookDeliveries: 0,
        webhookDeliveryFailures: 0,
        webhookDeliveryFailureRate: 0,
      },
      webhookSlo: {
        key: 'runtime_forensics_webhook_delivery_failure_rate',
        status: 'ok',
        current: 0,
      },
      prometheus: {
        endpoint: '/api/ops/metrics',
        metricName: 'rey30_runtime_forensics_webhook_delivery_failure_rate',
        scrapeStatus: 'ok',
        missingSince: null,
        missingDurationMs: 0,
        missingDurationSlo: {
          key: 'runtime_forensics_prometheus_scrape_missing_duration',
          status: 'ok',
          currentMs: 0,
        },
        lastValue: 0,
      },
      resolvedPrometheusIncidentCount: 0,
    });
    expect(resolveOpenRuntimeForensicsPrometheusIncidentsMock).toHaveBeenCalledWith({
      metricName: 'rey30_runtime_forensics_webhook_delivery_failure_rate',
      resolvedAt: expect.any(String),
    });
    expect(putRuntimeForensicsPrometheusIncidentMock).not.toHaveBeenCalled();
    expect(body.sessions).toContainEqual(
      expect.objectContaining({
        key: 'session-a',
        latestSnapshotId: 'snap-session-a-new',
        latestP0Count: 2,
        maxP0Count: 2,
        p0SnapshotCount: 1,
        totalItems: 3,
      })
    );
    expect(body.telemetryEvents[0]).toMatchObject({
      kind: 'runtime_forensics_event',
      tags: {
        action: 'p0_reappeared',
        count: 2,
      },
    });
  });

  it('persists Prometheus missing incidents from the overview', async () => {
    requireSessionMock.mockResolvedValue({
      id: 'editor-1',
      role: 'EDITOR',
      email: 'editor@example.com',
      sessionId: 'session-1',
    });
    vi.doMock('@/lib/server/runtime-forensics-prometheus', () => ({
      calculateRuntimeForensicsWebhookDeliveryFailureRate: vi.fn(() => ({
        failed: 0,
        total: 0,
        rate: 0,
      })),
      getRuntimeForensicsPrometheusHealth: vi.fn(() => ({
        endpoint: '/api/ops/metrics',
        metricName: 'rey30_runtime_forensics_webhook_delivery_failure_rate',
        scrapeStatus: 'missing',
        missingSince: '2026-04-18T02:28:00.000Z',
        missingDurationMs: 120_000,
        missingDurationSlo: {
          key: 'runtime_forensics_prometheus_scrape_missing_duration',
          objectiveMs: 0,
          warningMs: 60_000,
          currentMs: 120_000,
          unit: 'ms',
          status: 'error',
          missingSince: '2026-04-18T02:28:00.000Z',
        },
        emittedAt: '2026-04-18T02:30:00.000Z',
        lastScrapedAt: '2026-04-18T02:30:00.000Z',
        lastValue: 0,
        sample: '',
        failed: 0,
        total: 0,
        windowSize: 0,
      })),
    }));
    listScriptRuntimeFaultLedgerSnapshotsMock.mockResolvedValue([]);
    listScriptRuntimeForensicsAdminNotificationsMock.mockResolvedValue([]);
    listScriptRuntimeFaultLedgerPruneAuditsMock.mockResolvedValue([]);
    listRuntimeForensicsWebhookDeliveriesMock.mockResolvedValue([]);

    const { GET } = await import('@/app/api/scripts/runtime/fault-ledger/overview/route');
    const response = await GET(
      new NextRequest('http://localhost/api/scripts/runtime/fault-ledger/overview?limit=25')
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      prometheus: {
        scrapeStatus: 'missing',
        missingDurationMs: 120_000,
      },
      totals: {
        activeNotifications: 1,
        criticalNotifications: 1,
      },
    });
    expect(putRuntimeForensicsPrometheusIncidentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'prometheus-missing:rey30_runtime_forensics_webhook_delivery_failure_rate:2026-04-18T02:28:00.000Z',
        status: 'open',
        durationMs: 120_000,
        severity: 'critical',
      })
    );
    expect(putScriptRuntimeForensicsAdminNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        indicator: 'runtime_forensics_prometheus_scrape_missing_duration',
        current: 120_000,
      })
    );
    expect(resolveOpenRuntimeForensicsPrometheusIncidentsMock).not.toHaveBeenCalled();
  });

  it('exports Prometheus missing incidents as CSV and JSON', async () => {
    requireSessionMock.mockResolvedValue({
      id: 'editor-1',
      role: 'EDITOR',
      email: 'editor@example.com',
      sessionId: 'session-1',
    });
    const incidents = [
      {
        id: 'incident-1',
        metricName: 'rey30_runtime_forensics_webhook_delivery_failure_rate',
        status: 'resolved',
        missingSince: '2026-04-18T02:28:00.000Z',
        resolvedAt: '2026-04-18T02:31:00.000Z',
        lastSeenAt: '2026-04-18T02:31:00.000Z',
        durationMs: 180_000,
        severity: 'critical',
      },
    ];
    listRuntimeForensicsPrometheusIncidentsMock.mockResolvedValue(incidents);

    const { GET } = await import(
      '@/app/api/scripts/runtime/fault-ledger/prometheus-incidents/route'
    );
    const csvResponse = await GET(
      new NextRequest(
        'http://localhost/api/scripts/runtime/fault-ledger/prometheus-incidents?format=csv&limit=7'
      )
    );
    const jsonResponse = await GET(
      new NextRequest(
        'http://localhost/api/scripts/runtime/fault-ledger/prometheus-incidents?format=json&limit=7'
      )
    );
    const jsonBody = await jsonResponse.json();

    expect(csvResponse.status).toBe(200);
    expect(csvResponse.headers.get('content-type')).toContain('text/csv');
    expect(csvResponse.headers.get('content-disposition')).toContain(
      'runtime-forensics-prometheus-incidents.csv'
    );
    expect(await csvResponse.text()).toContain('incident-1');
    expect(jsonResponse.status).toBe(200);
    expect(jsonResponse.headers.get('content-disposition')).toContain(
      'runtime-forensics-prometheus-incidents.json'
    );
    expect(jsonBody).toMatchObject({
      ok: true,
      incidentCount: 1,
      incidents,
    });
    expect(listRuntimeForensicsPrometheusIncidentsMock).toHaveBeenCalledWith(7);
    expect(runtimeForensicsPrometheusIncidentsToCsvMock).toHaveBeenCalledWith(incidents);
  });

  it('runs and publishes external Prometheus probe snapshots', async () => {
    requireSessionMock.mockResolvedValue({
      id: 'editor-1',
      role: 'EDITOR',
      email: 'editor@example.com',
      sessionId: 'session-1',
    });
    getLatestRuntimeForensicsExternalPrometheusProbeSnapshotMock.mockResolvedValue({
      id: 'external-prometheus-probe:latest',
      checkedAt: '2026-04-18T02:00:00.000Z',
      status: 'ok',
    });

    const { GET, POST } = await import(
      '@/app/api/scripts/runtime/fault-ledger/prometheus-probe/route'
    );
    const getResponse = await GET(
      new NextRequest('http://localhost/api/scripts/runtime/fault-ledger/prometheus-probe')
    );
    const getBody = await getResponse.json();

    expect(getResponse.status).toBe(200);
    expect(getBody).toMatchObject({
      ok: true,
      config: {
        enabled: true,
        metricsUrl: 'https://app.example.test/api/ops/metrics',
      },
      latest: {
        id: 'external-prometheus-probe:latest',
      },
    });

    const runResponse = await POST(
      new NextRequest('http://localhost/api/scripts/runtime/fault-ledger/prometheus-probe', {
        method: 'POST',
        body: JSON.stringify({ action: 'run' }),
      })
    );
    const runBody = await runResponse.json();

    expect(runResponse.status).toBe(200);
    expect(runRuntimeForensicsExternalPrometheusProbeMock).toHaveBeenCalled();
    expect(runBody).toMatchObject({
      ok: true,
      latest: {
        status: 'ok',
        sample: 'rey30_runtime_forensics_webhook_delivery_failure_rate 0',
      },
    });

    const publishResponse = await POST(
      new NextRequest('http://localhost/api/scripts/runtime/fault-ledger/prometheus-probe', {
        method: 'POST',
        body: JSON.stringify({
          action: 'publish',
          result: {
            checkedAt: '2026-04-18T03:00:00.000Z',
            status: 'ok',
            metricName: 'rey30_runtime_forensics_webhook_delivery_failure_rate',
          },
        }),
      })
    );
    const publishBody = await publishResponse.json();

    expect(publishResponse.status).toBe(200);
    expect(putRuntimeForensicsExternalPrometheusProbeSnapshotMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'external',
        status: 'ok',
      })
    );
    expect(publishBody).toMatchObject({
      ok: true,
      latest: {
        id: 'external-prometheus-probe:published',
        source: 'external',
      },
    });
  });

  it('persists, acknowledges, and exports admin notifications', async () => {
    requireSessionMock.mockResolvedValue({
      id: 'editor-1',
      role: 'EDITOR',
      email: 'editor@example.com',
      sessionId: 'session-1',
    });
    const notifications = [
      {
        id: 'runtime-forensics-slo:slo-1',
        alertId: 'slo-1',
        createdAt: '2026-04-18T00:00:00.000Z',
        acknowledgedAt: null,
        level: 'critical',
        indicator: 'runtime_forensics_p0_reappeared',
        title: 'SLO P0 reaparecido',
        message: 'P0 reaparecido',
        current: 2,
        objective: 0,
        createdBy: 'editor-1',
        acknowledgedBy: null,
        source: 'slo',
      },
    ];
    listScriptRuntimeForensicsAdminNotificationsMock.mockResolvedValue(notifications);

    const { GET, POST } = await import('@/app/api/scripts/runtime/fault-ledger/notifications/route');
    const listResponse = await GET(
      new NextRequest('http://localhost/api/scripts/runtime/fault-ledger/notifications?limit=7')
    );
    const listBody = await listResponse.json();
    expect(listResponse.status).toBe(200);
    expect(listScriptRuntimeForensicsAdminNotificationsMock).toHaveBeenCalledWith(7);
    expect(listBody).toMatchObject({
      ok: true,
      retentionPolicy: {
        maxNotifications: 200,
        maxAgeDays: 30,
      },
      notificationCount: 1,
      notifications,
    });

    const csvResponse = await GET(
      new NextRequest('http://localhost/api/scripts/runtime/fault-ledger/notifications?format=csv')
    );
    expect(csvResponse.status).toBe(200);
    expect(csvResponse.headers.get('content-disposition')).toContain(
      'runtime-forensics-admin-notifications.csv'
    );
    expect(await csvResponse.text()).toContain('SLO P0 reaparecido');
    expect(scriptRuntimeForensicsAdminNotificationsToCsvMock).toHaveBeenCalledWith(notifications);

    const jsonResponse = await GET(
      new NextRequest('http://localhost/api/scripts/runtime/fault-ledger/notifications?format=json')
    );
    expect(jsonResponse.status).toBe(200);
    expect(jsonResponse.headers.get('content-disposition')).toContain(
      'runtime-forensics-admin-notifications.json'
    );
    expect(await jsonResponse.json()).toMatchObject({
      ok: true,
      notificationCount: 1,
      notifications,
    });

    const persistResponse = await POST(
      new NextRequest('http://localhost/api/scripts/runtime/fault-ledger/notifications', {
        method: 'POST',
        body: JSON.stringify({
          action: 'upsert',
          notification: {
            id: 'runtime-forensics-slo:slo-1',
            alertId: 'slo-1',
            level: 'critical',
            indicator: 'runtime_forensics_p0_reappeared',
            title: 'SLO P0 reaparecido',
            message: 'P0 reaparecido',
            current: 2,
            objective: 0,
          },
        }),
      })
    );
    expect(persistResponse.status).toBe(200);
    expect(putScriptRuntimeForensicsAdminNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'runtime-forensics-slo:slo-1',
        alertId: 'slo-1',
        createdBy: 'editor-1',
      })
    );

    const ackResponse = await POST(
      new NextRequest('http://localhost/api/scripts/runtime/fault-ledger/notifications', {
        method: 'POST',
        body: JSON.stringify({
          action: 'acknowledge',
          id: 'runtime-forensics-slo:slo-1',
        }),
      })
    );
    expect(ackResponse.status).toBe(200);
    expect(acknowledgeScriptRuntimeForensicsAdminNotificationMock).toHaveBeenCalledWith({
      id: 'runtime-forensics-slo:slo-1',
      acknowledgedBy: 'editor-1',
    });

    const dryRunResponse = await POST(
      new NextRequest('http://localhost/api/scripts/runtime/fault-ledger/notifications', {
        method: 'POST',
        body: JSON.stringify({
          action: 'dry-run-prune',
          retentionPolicy: {
            maxNotifications: 2,
            maxAgeDays: 14,
          },
        }),
      })
    );
    expect(dryRunResponse.status).toBe(200);
    expect(pruneScriptRuntimeForensicsAdminNotificationsMock).toHaveBeenCalledWith({
      dryRun: true,
      policy: {
        maxNotifications: 2,
        maxAgeDays: 14,
        source: 'request',
      },
    });
    expect(await dryRunResponse.json()).toMatchObject({
      ok: true,
      prune: {
        dryRun: true,
        wouldDelete: 1,
      },
    });
  });

  it('sends SLO admin notifications through the idempotent webhook sender', async () => {
    requireSessionMock.mockResolvedValue({
      id: 'editor-1',
      role: 'EDITOR',
      email: 'editor@example.com',
      sessionId: 'session-1',
    });
    const notification = {
      id: 'runtime-forensics-slo:slo-2',
      alertId: 'slo-2',
      createdAt: '2026-04-18T02:00:00.000Z',
      acknowledgedAt: null,
      level: 'critical',
      indicator: 'runtime_forensics_p0_reappeared',
      title: 'SLO P0 reaparecido',
      message: 'P0 reaparecido',
      current: 3,
      objective: 0,
      createdBy: 'editor-1',
      acknowledgedBy: null,
      source: 'slo',
    };
    putScriptRuntimeForensicsAdminNotificationMock.mockResolvedValue(notification);
    listScriptRuntimeForensicsAdminNotificationsMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([notification])
      .mockResolvedValueOnce([notification])
      .mockResolvedValueOnce([notification]);

    const { POST } = await import('@/app/api/scripts/runtime/fault-ledger/notifications/route');
    const firstResponse = await POST(
      new NextRequest('http://localhost/api/scripts/runtime/fault-ledger/notifications', {
        method: 'POST',
        body: JSON.stringify({
          action: 'upsert',
          notification: {
            id: notification.id,
            alertId: notification.alertId,
            level: 'critical',
            indicator: notification.indicator,
            title: notification.title,
            message: notification.message,
            current: notification.current,
            objective: notification.objective,
          },
        }),
      })
    );
    const firstBody = await firstResponse.json();

    expect(firstResponse.status).toBe(200);
    expect(sendRuntimeForensicsWebhookMock).toHaveBeenCalledOnce();
    expect(sendRuntimeForensicsWebhookMock).toHaveBeenCalledWith({ notification });
    expect(firstBody.webhook).toMatchObject({
      configured: true,
      delivered: true,
      status: 202,
    });

    const duplicateResponse = await POST(
      new NextRequest('http://localhost/api/scripts/runtime/fault-ledger/notifications', {
        method: 'POST',
        body: JSON.stringify({
          action: 'upsert',
          notification: {
            id: notification.id,
            alertId: notification.alertId,
            level: 'critical',
            indicator: notification.indicator,
            title: notification.title,
            message: notification.message,
            current: notification.current,
            objective: notification.objective,
          },
        }),
      })
    );
    const duplicateBody = await duplicateResponse.json();

    expect(duplicateResponse.status).toBe(200);
    expect(sendRuntimeForensicsWebhookMock).toHaveBeenCalledTimes(2);
    expect(duplicateBody.webhook).toMatchObject({
      configured: true,
      delivered: true,
      status: 202,
    });
  });

  it('reads, updates, tests, and retries runtime forensics webhook config', async () => {
    requireSessionMock.mockResolvedValue({
      id: 'owner-1',
      role: 'OWNER',
      email: 'owner@example.com',
      sessionId: 'session-1',
    });
    const { engineTelemetry } = await import('@/engine/telemetry/engineTelemetry');
    engineTelemetry.reset();
    listRuntimeForensicsWebhookDeliveriesMock.mockResolvedValue([
      {
        id: 'delivery-1',
        event: 'runtime_forensics.slo_alert',
        status: 'backoff',
        attemptCount: 1,
        nextAttemptAt: '2026-04-18T02:10:00.000Z',
      },
    ]);

    const { GET, POST } = await import('@/app/api/scripts/runtime/fault-ledger/webhook/route');
    const getResponse = await GET(
      new NextRequest('http://localhost/api/scripts/runtime/fault-ledger/webhook?limit=12')
    );
    const getBody = await getResponse.json();

    expect(getResponse.status).toBe(200);
    expect(listRuntimeForensicsWebhookDeliveriesMock).toHaveBeenCalledWith(12);
    expect(getBody).toMatchObject({
      ok: true,
      webhook: {
        configured: true,
        signingEnabled: true,
      },
      deliveries: [
        {
          id: 'delivery-1',
          status: 'backoff',
        },
      ],
    });

    const csvResponse = await GET(
      new NextRequest('http://localhost/api/scripts/runtime/fault-ledger/webhook?format=csv')
    );
    expect(csvResponse.status).toBe(200);
    expect(csvResponse.headers.get('content-disposition')).toContain(
      'runtime-forensics-webhook-deliveries.csv'
    );
    expect(await csvResponse.text()).toContain('delivery-1');
    expect(runtimeForensicsWebhookDeliveriesToCsvMock).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: 'delivery-1' })])
    );

    const jsonResponse = await GET(
      new NextRequest(
        'http://localhost/api/scripts/runtime/fault-ledger/webhook?format=json&status=backoff&event=slo&from=2026-04-18&to=2026-04-18'
      )
    );
    expect(jsonResponse.status).toBe(200);
    expect(jsonResponse.headers.get('content-disposition')).toContain(
      'runtime-forensics-webhook-deliveries.json'
    );
    expect(await jsonResponse.json()).toMatchObject({
      ok: true,
      filters: {
        statuses: ['backoff'],
        event: 'slo',
        from: '2026-04-18',
        to: '2026-04-18',
      },
      retentionPolicy: {
        maxDeliveries: 500,
        maxAgeDays: 30,
      },
      deliveries: [expect.objectContaining({ id: 'delivery-1' })],
    });
    expect(filterRuntimeForensicsWebhookDeliveriesMock).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: 'delivery-1' })]),
      {
        statuses: ['backoff'],
        event: 'slo',
        from: '2026-04-18',
        to: '2026-04-18',
      }
    );

    const webhookAudits = [
      {
        id: 'webhook-audit-1',
        auditId: 'webhook-audit-1',
        createdAt: '2026-04-18T02:00:00.000Z',
        actorId: 'owner-1',
        reason: 'manual-prune',
        dryRun: false,
        deleted: 1,
        wouldDelete: 1,
        retained: 2,
        policy: { maxDeliveries: 2, maxAgeDays: 30 },
        candidates: [],
      },
      {
        id: 'webhook-audit-2',
        auditId: 'webhook-audit-2',
        createdAt: '2026-04-16T02:00:00.000Z',
        actorId: 'owner-2',
        reason: 'manual-dry-run',
        dryRun: true,
        deleted: 0,
        wouldDelete: 1,
        retained: 3,
        policy: { maxDeliveries: 2, maxAgeDays: 30 },
        candidates: [],
      },
    ];
    listRuntimeForensicsWebhookDeliveryPruneAuditsMock.mockResolvedValue(webhookAudits);

    const { GET: GET_PRUNE_AUDIT } = await import(
      '@/app/api/scripts/runtime/fault-ledger/webhook/prune-audit/route'
    );

    const auditCsvResponse = await GET_PRUNE_AUDIT(
      new NextRequest(
        'http://localhost/api/scripts/runtime/fault-ledger/webhook/prune-audit?format=csv&limit=9&actor=owner-1&reason=prune&from=2026-04-18&to=2026-04-18'
      )
    );
    expect(auditCsvResponse.status).toBe(200);
    expect(auditCsvResponse.headers.get('content-type')).toContain('text/csv');
    expect(auditCsvResponse.headers.get('content-disposition')).toContain(
      'runtime-forensics-webhook-prune-audit.csv'
    );
    expect(await auditCsvResponse.text()).toContain('manual-prune');
    expect(runtimeForensicsWebhookDeliveryPruneAuditsToCsvMock).toHaveBeenCalledWith([
      webhookAudits[0],
    ]);

    const auditJsonResponse = await GET_PRUNE_AUDIT(
      new NextRequest(
        'http://localhost/api/scripts/runtime/fault-ledger/webhook/prune-audit?format=json&limit=9&actor=owner-1&reason=prune&from=2026-04-18&to=2026-04-18'
      )
    );
    const auditJsonBody = await auditJsonResponse.json();
    expect(auditJsonResponse.status).toBe(200);
    expect(auditJsonResponse.headers.get('content-disposition')).toContain(
      'runtime-forensics-webhook-prune-audit.json'
    );
    expect(auditJsonBody).toMatchObject({
      ok: true,
      filters: {
        actor: 'owner-1',
        reason: 'prune',
        from: '2026-04-18',
        to: '2026-04-18',
      },
      auditCount: 1,
      audits: [webhookAudits[0]],
    });

    const updateResponse = await POST(
      new NextRequest('http://localhost/api/scripts/runtime/fault-ledger/webhook', {
        method: 'POST',
        body: JSON.stringify({
          action: 'update-config',
          enabled: true,
          url: 'https://hooks.example.test/rey30',
          secret: 'new-secret',
          allowlistHosts: 'hooks.example.test',
        }),
      })
    );
    expect(updateResponse.status).toBe(200);
    expect(putRuntimeForensicsWebhookConfigMock).toHaveBeenCalledWith({
      enabled: true,
      url: 'https://hooks.example.test/rey30',
      preserveUrl: false,
      secret: 'new-secret',
      preserveSecret: false,
      allowlistHosts: ['hooks.example.test'],
      updatedBy: 'owner-1',
    });
    expect(logSecurityEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'owner-1',
        action: 'runtime.forensics.webhook_config_update',
        target: 'scripts.runtime.fault-ledger.webhook',
        durability: 'critical',
      })
    );
    expect(engineTelemetry.getSnapshot().events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'runtime_forensics_event',
          tags: expect.objectContaining({ action: 'webhook_config_update' }),
        }),
      ])
    );

    const retentionResponse = await POST(
      new NextRequest('http://localhost/api/scripts/runtime/fault-ledger/webhook', {
        method: 'POST',
        body: JSON.stringify({
          action: 'update-retention-policy',
          retentionPolicy: {
            maxDeliveries: 10,
            maxAgeDays: 7,
          },
        }),
      })
    );
    expect(retentionResponse.status).toBe(200);
    expect(putRuntimeForensicsWebhookDeliveryRetentionPolicyMock).toHaveBeenCalledWith({
      maxDeliveries: 10,
      maxAgeDays: 7,
      updatedBy: 'owner-1',
    });
    expect(await retentionResponse.json()).toMatchObject({
      ok: true,
      retentionPolicy: {
        maxDeliveries: 10,
        maxAgeDays: 7,
        source: 'admin',
      },
    });

    const testResponse = await POST(
      new NextRequest('http://localhost/api/scripts/runtime/fault-ledger/webhook', {
        method: 'POST',
        body: JSON.stringify({ action: 'test' }),
      })
    );
    expect(testResponse.status).toBe(200);
    expect(sendRuntimeForensicsWebhookMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'runtime_forensics.webhook_test',
        source: 'manual-test',
        requestedBy: 'owner-1',
        force: true,
      })
    );

    const retryResponse = await POST(
      new NextRequest('http://localhost/api/scripts/runtime/fault-ledger/webhook', {
        method: 'POST',
        body: JSON.stringify({ action: 'retry', id: 'delivery-1' }),
      })
    );
    expect(retryResponse.status).toBe(200);
    expect(retryRuntimeForensicsWebhookDeliveryMock).toHaveBeenCalledWith({
      id: 'delivery-1',
      requestedBy: 'owner-1',
      force: true,
    });

    const retryDueResponse = await POST(
      new NextRequest('http://localhost/api/scripts/runtime/fault-ledger/webhook', {
        method: 'POST',
        body: JSON.stringify({ action: 'retry-due' }),
      })
    );
    expect(retryDueResponse.status).toBe(200);
    expect(retryRuntimeForensicsWebhookDeliveriesMock).toHaveBeenCalledWith({
      requestedBy: 'owner-1',
    });

    const dryRunPruneResponse = await POST(
      new NextRequest('http://localhost/api/scripts/runtime/fault-ledger/webhook', {
        method: 'POST',
        body: JSON.stringify({
          action: 'dry-run-prune',
          retentionPolicy: {
            maxDeliveries: 10,
            maxAgeDays: 7,
          },
        }),
      })
    );
    expect(dryRunPruneResponse.status).toBe(200);
    expect(pruneRuntimeForensicsWebhookDeliveriesMock).toHaveBeenCalledWith({
      dryRun: true,
      policy: {
        maxDeliveries: 10,
        maxAgeDays: 7,
        source: 'request',
      },
      actorId: 'owner-1',
      reason: 'manual-dry-run',
    });
    expect(logSecurityEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'owner-1',
        action: 'runtime.forensics.webhook_history_prune_dry_run',
        target: 'scripts.runtime.fault-ledger.webhook',
        durability: 'critical',
      })
    );

    const pruneResponse = await POST(
      new NextRequest('http://localhost/api/scripts/runtime/fault-ledger/webhook', {
        method: 'POST',
        body: JSON.stringify({ action: 'prune' }),
      })
    );
    expect(pruneResponse.status).toBe(200);
    expect(pruneRuntimeForensicsWebhookDeliveriesMock).toHaveBeenCalledWith({
      dryRun: false,
      actorId: 'owner-1',
      reason: 'manual-prune',
    });
    expect(await pruneResponse.json()).toMatchObject({
      ok: true,
      prune: {
        deleted: 1,
        wouldDelete: 1,
      },
    });

    const resetResponse = await POST(
      new NextRequest('http://localhost/api/scripts/runtime/fault-ledger/webhook', {
        method: 'POST',
        body: JSON.stringify({ action: 'reset-config' }),
      })
    );
    expect(resetResponse.status).toBe(200);
    expect(deleteRuntimeForensicsWebhookConfigMock).toHaveBeenCalledOnce();
    expect(logSecurityEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'owner-1',
        action: 'runtime.forensics.webhook_config_reset',
        target: 'scripts.runtime.fault-ledger.webhook',
        durability: 'critical',
      })
    );
  });
});
