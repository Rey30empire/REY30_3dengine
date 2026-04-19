import { NextRequest, NextResponse } from 'next/server';
import { engineTelemetry } from '@/engine/telemetry/engineTelemetry';
import { authErrorToResponse, requireSession } from '@/lib/security/auth';
import {
  listScriptRuntimeFaultLedgerPruneAudits,
  listScriptRuntimeFaultLedgerSnapshots,
  listScriptRuntimeForensicsAdminNotifications,
  putScriptRuntimeForensicsAdminNotification,
  type ScriptRuntimeForensicsAdminNotification,
  type ScriptRuntimeFaultLedgerSnapshot,
} from '@/lib/server/script-runtime-artifacts';
import {
  getRuntimeForensicsWebhookConfig,
  listRuntimeForensicsWebhookDeliveries,
} from '@/lib/server/runtime-forensics-webhook';
import {
  calculateRuntimeForensicsWebhookDeliveryFailureRate,
  getRuntimeForensicsPrometheusHealth,
  type RuntimeForensicsPrometheusHealth,
} from '@/lib/server/runtime-forensics-prometheus';
import {
  putRuntimeForensicsPrometheusIncident,
  resolveOpenRuntimeForensicsPrometheusIncidents,
} from '@/lib/server/runtime-forensics-prometheus-incidents';
import { getLatestRuntimeForensicsExternalPrometheusProbeSnapshot } from '@/lib/server/runtime-forensics-prometheus-probe';

function readLimit(request: NextRequest): number {
  const value = Number(new URL(request.url).searchParams.get('limit') || 100);
  if (!Number.isFinite(value)) return 100;
  return Math.max(1, Math.min(100, Math.round(value)));
}

function sessionKey(snapshot: ScriptRuntimeFaultLedgerSnapshot): string {
  return snapshot.sessionId || snapshot.instanceId || 'unknown-session';
}

function buildSessionSummaries(snapshots: ScriptRuntimeFaultLedgerSnapshot[]) {
  const groups = new Map<string, ScriptRuntimeFaultLedgerSnapshot[]>();
  for (const snapshot of snapshots) {
    const key = sessionKey(snapshot);
    groups.set(key, [...(groups.get(key) || []), snapshot]);
  }

  return Array.from(groups.entries())
    .map(([key, entries]) => {
      const ordered = entries.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
      const latest = ordered[0];
      const instanceIds = Array.from(new Set(ordered.map((entry) => entry.instanceId))).sort();
      const p0SnapshotCount = ordered.filter((entry) => entry.p0Count > 0).length;
      return {
        key,
        sessionId: latest?.sessionId || null,
        instanceIds,
        snapshotCount: ordered.length,
        latestAt: latest?.generatedAt || null,
        latestPlayState: latest?.playState || 'unknown',
        latestP0Count: latest?.p0Count || 0,
        maxP0Count: Math.max(0, ...ordered.map((entry) => entry.p0Count)),
        p0SnapshotCount,
        totalItems: ordered.reduce((total, entry) => total + entry.itemCount, 0),
        latestSnapshotId: latest?.id || null,
      };
    })
    .sort((a, b) => String(b.latestAt || '').localeCompare(String(a.latestAt || '')));
}

function readEnvNumber(key: string, fallback: number): number {
  const raw = Number(process.env[key]);
  return Number.isFinite(raw) ? raw : fallback;
}

function evaluateFailureRate(current: number, target: number, warning: number) {
  if (current <= target) return 'ok';
  if (current <= warning) return 'warn';
  return 'error';
}

function buildWebhookDeliverySlo(
  deliveries: Awaited<ReturnType<typeof listRuntimeForensicsWebhookDeliveries>>
) {
  const { failed, total, rate } = calculateRuntimeForensicsWebhookDeliveryFailureRate(deliveries);
  const delivered = deliveries.filter((delivery) => delivery.status === 'delivered').length;
  const objective = readEnvNumber(
    'REY30_SLO_RUNTIME_FORENSICS_WEBHOOK_FAILURE_RATE_TARGET',
    0.05
  );
  const warning = readEnvNumber(
    'REY30_SLO_RUNTIME_FORENSICS_WEBHOOK_FAILURE_RATE_WARN',
    0.1
  );
  return {
    key: 'runtime_forensics_webhook_delivery_failure_rate',
    objective,
    warning,
    current: rate,
    unit: 'ratio',
    status: evaluateFailureRate(rate, objective, warning),
    delivered,
    failed,
    total,
    windowSize: deliveries.length,
  };
}

async function persistPrometheusMissingNotification(
  prometheus: RuntimeForensicsPrometheusHealth,
  generatedAt: string
): Promise<ScriptRuntimeForensicsAdminNotification | null> {
  if (prometheus.scrapeStatus !== 'missing') return null;
  const incidentAt = prometheus.missingSince || prometheus.emittedAt || generatedAt;
  const metricName = prometheus.metricName;
  const severity = prometheus.missingDurationSlo.status === 'warn' ? 'warning' : 'critical';
  await putRuntimeForensicsPrometheusIncident({
    id: `prometheus-missing:${metricName}:${incidentAt}`,
    metricName,
    status: 'open',
    missingSince: incidentAt,
    resolvedAt: null,
    lastSeenAt: generatedAt,
    durationMs: prometheus.missingDurationMs,
    severity,
  }).catch(() => null);
  return putScriptRuntimeForensicsAdminNotification({
    id: `runtime-forensics-prometheus-missing:${metricName}:${incidentAt}`,
    alertId: `runtime_forensics_prometheus_scrape_missing:${metricName}:${incidentAt}`,
    createdAt: incidentAt,
    acknowledgedAt: null,
    level: severity,
    indicator: 'runtime_forensics_prometheus_scrape_missing_duration',
    title: 'Prometheus scrape missing',
    message: `Prometheus no expone ${metricName} en /api/ops/metrics.`,
    current: prometheus.missingDurationMs,
    objective: prometheus.missingDurationSlo.objectiveMs,
    createdBy: 'system:runtime-forensics-overview',
    acknowledgedBy: null,
    source: 'slo',
  }).catch(() => null);
}

async function autoResolvePrometheusMissingIncidents(
  prometheus: RuntimeForensicsPrometheusHealth,
  generatedAt: string
) {
  if (prometheus.scrapeStatus !== 'ok') return [];
  return resolveOpenRuntimeForensicsPrometheusIncidents({
    metricName: prometheus.metricName,
    resolvedAt: generatedAt,
  }).catch(() => []);
}

export async function GET(request: NextRequest) {
  try {
    await requireSession(request, 'EDITOR');
    const limit = readLimit(request);
    const [snapshots, notifications, pruneAudits, webhookDeliveries, externalProbe] = await Promise.all([
      listScriptRuntimeFaultLedgerSnapshots(limit),
      listScriptRuntimeForensicsAdminNotifications(limit),
      listScriptRuntimeFaultLedgerPruneAudits(25),
      listRuntimeForensicsWebhookDeliveries(limit),
      getLatestRuntimeForensicsExternalPrometheusProbeSnapshot(),
    ]);
    const sessions = buildSessionSummaries(snapshots);
    const webhookSlo = buildWebhookDeliverySlo(webhookDeliveries);
    const generatedAt = new Date().toISOString();
    const prometheus = getRuntimeForensicsPrometheusHealth(webhookDeliveries, generatedAt);
    const [prometheusNotification, resolvedPrometheusIncidents] = await Promise.all([
      persistPrometheusMissingNotification(prometheus, generatedAt),
      autoResolvePrometheusMissingIncidents(prometheus, generatedAt),
    ]);
    const visibleNotifications = prometheusNotification
      ? [
          prometheusNotification,
          ...notifications.filter((notification) => notification.id !== prometheusNotification.id),
        ]
      : notifications;
    const telemetry = engineTelemetry.getSnapshot();
    const runtimeForensicsEvents = (telemetry.events || []).filter(
      (event) => event.kind === 'runtime_forensics_event'
    );

    return NextResponse.json({
      ok: true,
      generatedAt,
      webhook: await getRuntimeForensicsWebhookConfig(),
      totals: {
        sessions: sessions.length,
        snapshots: snapshots.length,
        snapshotsWithP0: snapshots.filter((snapshot) => snapshot.p0Count > 0).length,
        activeNotifications: visibleNotifications.filter((notification) => !notification.acknowledgedAt)
          .length,
        criticalNotifications: visibleNotifications.filter(
          (notification) => notification.level === 'critical'
        ).length,
        pruneAudits: pruneAudits.length,
        runtimeForensicsEvents: runtimeForensicsEvents.length,
        webhookDeliveries: webhookDeliveries.length,
        webhookDeliveryFailures: webhookSlo.failed,
        webhookDeliveryFailureRate: webhookSlo.current,
      },
      webhookSlo,
      prometheus,
      externalProbe,
      resolvedPrometheusIncidentCount: resolvedPrometheusIncidents.length,
      resolvedPrometheusIncidents,
      sessions,
      notifications: visibleNotifications.slice(0, 10),
      pruneAudits: pruneAudits.slice(0, 10),
      telemetryEvents: runtimeForensicsEvents.slice(-25).reverse(),
    });
  } catch (error) {
    return authErrorToResponse(error);
  }
}
