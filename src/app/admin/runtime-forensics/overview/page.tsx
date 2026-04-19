'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, Bell, DatabaseZap, Loader2, RadioTower, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { loadClientAuthSession } from '@/lib/client-auth-session';
import {
  type EditorSessionPayload,
  resolveEditorAccessFromSessionPayload,
} from '@/engine/editor/shell/editorShellAccess';

interface ForensicsSessionSummary {
  key: string;
  sessionId: string | null;
  instanceIds: string[];
  snapshotCount: number;
  latestAt: string | null;
  latestPlayState: string;
  latestP0Count: number;
  maxP0Count: number;
  p0SnapshotCount: number;
  totalItems: number;
  latestSnapshotId: string | null;
}

interface ForensicsOverviewPayload {
  ok: boolean;
  generatedAt: string;
  webhook?: {
    configured: boolean;
    url: string | null;
    signingEnabled: boolean;
  };
  totals?: {
    sessions: number;
    snapshots: number;
    snapshotsWithP0: number;
    activeNotifications: number;
    criticalNotifications: number;
    pruneAudits: number;
    runtimeForensicsEvents: number;
    webhookDeliveries: number;
    webhookDeliveryFailures: number;
    webhookDeliveryFailureRate: number;
  };
  webhookSlo?: {
    key: string;
    objective: number;
    warning: number;
    current: number;
    unit: string;
    status: 'ok' | 'warn' | 'error';
    delivered: number;
    failed: number;
    total: number;
    windowSize: number;
  };
  prometheus?: {
    endpoint: string;
    metricName: string;
    scrapeStatus: 'ok' | 'missing';
    missingSince?: string | null;
    missingDurationMs?: number;
    missingDurationSlo?: {
      key: string;
      objectiveMs: number;
      warningMs: number;
      currentMs: number;
      unit: 'ms';
      status: 'ok' | 'warn' | 'error';
      missingSince: string | null;
    };
    emittedAt: string;
    lastScrapedAt: string;
    lastValue: number;
    sample: string;
    failed: number;
    total: number;
    windowSize: number;
  };
  externalProbe?: {
    checkedAt: string;
    source: 'server' | 'external';
    ok: boolean;
    status: 'ok' | 'missing' | 'error' | 'disabled';
    metricName: string;
    metricsUrl: string | null;
    statusCode: number | null;
    durationMs: number;
    value: number | null;
    sample: string;
    error: string | null;
    alertmanager: {
      configured: boolean;
      url: string | null;
      status: 'ok' | 'error' | 'disabled';
      statusCode: number | null;
      version: string | null;
      error: string | null;
    };
  } | null;
  sessions?: ForensicsSessionSummary[];
}

interface RuntimeForensicsAdminNotification {
  id: string;
  alertId: string;
  createdAt: string;
  acknowledgedAt: string | null;
  level: 'warning' | 'critical';
  indicator: string;
  title: string;
  message: string;
  current: number;
  objective: number;
  source: 'slo';
}

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(String(data?.error || fallback));
  return data as T;
}

function statusTone(count: number) {
  return count > 0
    ? 'border-red-500/30 bg-red-500/10 text-red-100'
    : 'border-green-500/30 bg-green-500/10 text-green-100';
}

function sloTone(status: 'ok' | 'warn' | 'error' | undefined) {
  if (status === 'error') return 'border-red-500/30 bg-red-500/10 text-red-100';
  if (status === 'warn') return 'border-amber-500/30 bg-amber-500/10 text-amber-100';
  return 'border-green-500/30 bg-green-500/10 text-green-100';
}

function formatPercent(value: number | undefined) {
  return `${Math.round((Number(value) || 0) * 1000) / 10}%`;
}

function formatDurationMs(value: number | undefined) {
  const ms = Math.max(0, Number(value) || 0);
  if (ms < 1000) return `${ms} ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${remainder}s`;
}

function makePrometheusMissingNotification(
  payload: ForensicsOverviewPayload
): RuntimeForensicsAdminNotification {
  const prometheus = payload.prometheus;
  const metricName =
    prometheus?.metricName || 'rey30_runtime_forensics_webhook_delivery_failure_rate';
  const incidentAt =
    prometheus?.missingSince || prometheus?.emittedAt || payload.generatedAt || new Date().toISOString();
  const currentMs = Number(prometheus?.missingDurationMs || 0);
  const objectiveMs = Number(prometheus?.missingDurationSlo?.objectiveMs || 0);
  return {
    id: `runtime-forensics-prometheus-missing:${metricName}:${incidentAt}`,
    alertId: `runtime_forensics_prometheus_scrape_missing:${metricName}:${incidentAt}`,
    createdAt: incidentAt,
    acknowledgedAt: null,
    level: prometheus?.missingDurationSlo?.status === 'warn' ? 'warning' : 'critical',
    indicator: 'runtime_forensics_prometheus_scrape_missing_duration',
    title: 'Prometheus scrape missing',
    message: `Prometheus no expone ${metricName} en /api/ops/metrics. Duración missing: ${formatDurationMs(currentMs)}.`,
    current: currentMs,
    objective: objectiveMs,
    source: 'slo',
  };
}

export default function RuntimeForensicsOverviewPage() {
  const [editorAccess, setEditorAccess] = useState(() =>
    resolveEditorAccessFromSessionPayload(null)
  );
  const [resolved, setResolved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [probeRunning, setProbeRunning] = useState(false);
  const [message, setMessage] = useState('Cargando overview forense...');
  const [overview, setOverview] = useState<ForensicsOverviewPayload | null>(null);
  const previousPrometheusScrapeStatus = useRef<'ok' | 'missing' | null>(null);

  const canAccessAdmin = resolved && editorAccess.permissions.admin;
  const sessions = overview?.sessions || [];
  const worstSessions = useMemo(
    () =>
      [...sessions].sort(
        (left, right) =>
          right.latestP0Count - left.latestP0Count ||
          right.p0SnapshotCount - left.p0SnapshotCount ||
          String(right.latestAt || '').localeCompare(String(left.latestAt || ''))
      ),
    [sessions]
  );

  useEffect(() => {
    let cancelled = false;
    const loadSession = async () => {
      try {
        const payload = (await loadClientAuthSession()) as EditorSessionPayload;
        if (!cancelled) setEditorAccess(resolveEditorAccessFromSessionPayload(payload));
      } finally {
        if (!cancelled) setResolved(true);
      }
    };
    void loadSession();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadOverview = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/scripts/runtime/fault-ledger/overview?limit=100');
      const payload = await readJson<ForensicsOverviewPayload>(
        response,
        'No se pudo leer el overview forense'
      );
      const scrapeStatus = payload.prometheus?.scrapeStatus || 'missing';
      if (scrapeStatus === 'missing' && previousPrometheusScrapeStatus.current !== 'missing') {
        toast({
          title: 'Prometheus/SLO sin scrape',
          description: 'La métrica webhook failure rate no está visible en /api/ops/metrics.',
          variant: 'destructive',
        });
        void fetch('/api/scripts/runtime/fault-ledger/notifications', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'upsert',
            notification: makePrometheusMissingNotification(payload),
          }),
        })
          .then((notificationResponse) => {
            if (!notificationResponse.ok) throw new Error(`HTTP ${notificationResponse.status}`);
          })
          .catch((error) => {
            setMessage(`Alerta Prometheus missing no persistida: ${String(error)}`);
          });
      }
      previousPrometheusScrapeStatus.current = scrapeStatus;
      setOverview(payload);
      setMessage('Overview forense actualizado.');
    } catch (error) {
      setMessage(`Overview no disponible: ${String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const runExternalProbe = async () => {
    setProbeRunning(true);
    try {
      const response = await fetch('/api/scripts/runtime/fault-ledger/prometheus-probe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'run' }),
      });
      await readJson(response, 'No se pudo ejecutar el probe externo Prometheus/Alertmanager');
      await loadOverview();
      setMessage('Probe externo Prometheus/Alertmanager ejecutado.');
    } catch (error) {
      setMessage(`Probe externo no disponible: ${String(error)}`);
    } finally {
      setProbeRunning(false);
    }
  };

  useEffect(() => {
    if (canAccessAdmin) void loadOverview();
  }, [canAccessAdmin]);

  if (!resolved) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
        <Loader2 className="mr-2 h-4 w-4 animate-spin text-cyan-300" />
        Cargando administracion...
      </div>
    );
  }

  if (!canAccessAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
        <section className="w-full max-w-xl rounded border border-amber-500/30 bg-amber-500/10 p-6">
          <h1 className="text-lg font-semibold">Forensics Overview restringido</h1>
          <p className="mt-2 text-sm text-amber-100">
            Esta superficie requiere permisos administrativos.
          </p>
          <Button className="mt-4" asChild>
            <Link href="/admin">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver
            </Link>
          </Button>
        </section>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-cyan-300" />
              <h1 className="text-sm font-semibold">Forensics Overview</h1>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Resumen multi-sesión de snapshots, SLO notifications, prune audit y telemetría.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => void loadOverview()} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RadioTower className="mr-2 h-4 w-4" />}
              Refrescar
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void runExternalProbe()}
              disabled={probeRunning}
              data-testid="runtime-forensics-overview-run-external-probe"
            >
              {probeRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RadioTower className="mr-2 h-4 w-4" />}
              Probe externo
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link href="/admin/runtime-forensics">
                <DatabaseZap className="mr-2 h-4 w-4" />
                Runtime Forensics
              </Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link href="/admin">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Admin
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="space-y-3 p-3">
        <section className="rounded border border-slate-800 bg-slate-950 p-3 text-xs">
          {message}
        </section>
        {overview?.prometheus?.scrapeStatus === 'missing' && (
          <section
            className="flex items-start gap-2 rounded border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-100"
            data-testid="runtime-forensics-overview-prometheus-alert"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              Alerta admin: scrapeStatus de Prometheus cambió a missing para{' '}
              {overview.prometheus.metricName || 'rey30_runtime_forensics_webhook_delivery_failure_rate'}.
            </div>
          </section>
        )}

        <section className="grid gap-2 md:grid-cols-5">
          <div className="rounded border border-slate-800 bg-slate-900 px-3 py-3 text-xs">
            <div className="text-slate-400">sesiones</div>
            <div className="mt-1 text-2xl font-semibold">{overview?.totals?.sessions ?? 0}</div>
          </div>
          <div className="rounded border border-slate-800 bg-slate-900 px-3 py-3 text-xs">
            <div className="text-slate-400">snapshots</div>
            <div className="mt-1 text-2xl font-semibold">{overview?.totals?.snapshots ?? 0}</div>
          </div>
          <div className={`rounded border px-3 py-3 text-xs ${statusTone(overview?.totals?.snapshotsWithP0 ?? 0)}`}>
            <div className="opacity-80">snapshots con P0</div>
            <div className="mt-1 text-2xl font-semibold">{overview?.totals?.snapshotsWithP0 ?? 0}</div>
          </div>
          <div className={`rounded border px-3 py-3 text-xs ${statusTone(overview?.totals?.activeNotifications ?? 0)}`}>
            <div className="opacity-80">notifications activas</div>
            <div className="mt-1 flex items-center gap-2 text-2xl font-semibold">
              <Bell className="h-5 w-5" />
              {overview?.totals?.activeNotifications ?? 0}
            </div>
          </div>
          <div
            className={`rounded border px-3 py-3 text-xs ${sloTone(
              overview?.webhookSlo?.status
            )}`}
            data-testid="runtime-forensics-overview-webhook-slo"
          >
            <div className="opacity-80">webhook failure rate</div>
            <div className="mt-1 text-2xl font-semibold">
              {formatPercent(overview?.webhookSlo?.current)}
            </div>
            <div className="mt-1 text-[10px] opacity-80">
              failed {overview?.webhookSlo?.failed ?? 0} / total {overview?.webhookSlo?.total ?? 0}
            </div>
          </div>
        </section>

        <section className="rounded border border-slate-800 bg-slate-950 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Sesiones forenses</h2>
            <div className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-300">
              webhook: {overview?.webhook?.configured ? 'configurado' : 'sin configurar'} | firma:{' '}
              {overview?.webhook?.signingEnabled ? 'activa' : 'off'} | SLO:{' '}
              {overview?.webhookSlo?.status || 'ok'}
            </div>
          </div>
          <div
            className={`mt-3 rounded border p-3 text-xs ${sloTone(
              overview?.prometheus?.scrapeStatus === 'ok' ? overview?.webhookSlo?.status : 'error'
            )}`}
            data-testid="runtime-forensics-overview-prometheus-health"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold">Prometheus/SLO health</div>
              <div className="rounded border border-slate-600/50 px-2 py-1 text-[10px]">
                scrape {overview?.prometheus?.scrapeStatus || 'missing'}
              </div>
            </div>
            <div className="mt-2 grid gap-2 md:grid-cols-3">
              <div>
                endpoint: {overview?.prometheus?.endpoint || '/api/ops/metrics'}
              </div>
              <div className="break-all">
                metric: {overview?.prometheus?.metricName || 'n/a'}
              </div>
              <div>
                última: {formatPercent(overview?.prometheus?.lastValue)} |{' '}
                {overview?.prometheus?.lastScrapedAt || 'n/a'}
              </div>
              <div>
                missing: {formatDurationMs(overview?.prometheus?.missingDurationMs)} | SLO{' '}
                {overview?.prometheus?.missingDurationSlo?.status || 'ok'}
              </div>
              <div>
                objetivo:{' '}
                {formatDurationMs(overview?.prometheus?.missingDurationSlo?.objectiveMs)} | warn{' '}
                {formatDurationMs(overview?.prometheus?.missingDurationSlo?.warningMs)}
              </div>
              <div>
                desde: {overview?.prometheus?.missingSince || 'n/a'}
              </div>
            </div>
            <div className="mt-2 break-all rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-[10px] text-slate-300">
              {(overview?.prometheus?.sample || '').split('\n').slice(-1)[0] || 'sin muestra'}
            </div>
            <div
              className="mt-2 rounded border border-slate-700 bg-slate-950 px-2 py-2 text-[11px]"
              data-testid="runtime-forensics-overview-external-probe"
            >
              <div className="font-semibold">
                probe externo:{' '}
                <span className={overview?.externalProbe?.status === 'ok' ? 'text-green-200' : 'text-amber-200'}>
                  {overview?.externalProbe?.status || 'sin ejecutar'}
                </span>
              </div>
              <div className="mt-1 break-all text-slate-300">
                metrics: {overview?.externalProbe?.metricsUrl || 'config pendiente'} | status{' '}
                {overview?.externalProbe?.statusCode ?? 'n/a'} |{' '}
                {overview?.externalProbe?.checkedAt || 'n/a'}
              </div>
              <div className="mt-1 break-all text-slate-300">
                alertmanager:{' '}
                {overview?.externalProbe?.alertmanager?.configured
                  ? `${overview.externalProbe.alertmanager.status} ${overview.externalProbe.alertmanager.url || ''}`
                  : 'no configurado'}
              </div>
              {overview?.externalProbe?.error && (
                <div className="mt-1 break-all text-red-200">{overview.externalProbe.error}</div>
              )}
            </div>
          </div>
          <div className="mt-3 grid gap-2" data-testid="runtime-forensics-overview-sessions">
            {worstSessions.map((session) => (
              <div
                key={session.key}
                className={`rounded border px-3 py-2 text-xs ${statusTone(
                  session.latestP0Count || session.p0SnapshotCount
                )}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="break-all font-mono text-[11px]">{session.key}</div>
                  <div>
                    latest P0 {session.latestP0Count} | max P0 {session.maxP0Count} | snapshots{' '}
                    {session.snapshotCount}
                  </div>
                </div>
                <div className="mt-1 break-all text-[10px] opacity-80">
                  latest: {session.latestAt || 'n/a'} | state {session.latestPlayState} | instances{' '}
                  {session.instanceIds.join(', ') || 'n/a'} | latest snapshot{' '}
                  {session.latestSnapshotId || 'n/a'}
                </div>
              </div>
            ))}
            {worstSessions.length === 0 && (
              <div className="rounded border border-slate-800 bg-slate-900 px-3 py-3 text-xs text-slate-500">
                Sin snapshots forenses todavía.
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
