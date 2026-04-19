'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  AlertTriangle,
  Bell,
  CheckCircle2,
  DatabaseZap,
  Download,
  Loader2,
  RadioTower,
  RotateCcw,
  Save,
  Search,
  Send,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { loadClientAuthSession } from '@/lib/client-auth-session';
import {
  type EditorSessionPayload,
  resolveEditorAccessFromSessionPayload,
} from '@/engine/editor/shell/editorShellAccess';

interface RuntimeFaultLedgerRetentionPolicy {
  maxSnapshots: number;
  maxAgeDays: number;
  source?: 'defaults' | 'env' | 'admin';
  updatedAt?: string | null;
  updatedBy?: string | null;
}

interface RuntimeFaultLedgerPruneCandidate {
  id: string;
  generatedAt: string;
  itemCount: number;
  p0Count: number;
  reason: 'count' | 'age' | 'count+age';
}

interface RuntimeFaultLedgerPruneSummary {
  dryRun: boolean;
  deleted: number;
  wouldDelete: number;
  retained: number;
  policy: RuntimeFaultLedgerRetentionPolicy;
  candidates: RuntimeFaultLedgerPruneCandidate[];
  auditId?: string | null;
}

interface RuntimeFaultLedgerPruneAuditEntry extends RuntimeFaultLedgerPruneSummary {
  id: string;
  createdAt: string;
  actorId: string | null;
  reason: string;
}

interface RuntimeFaultLedgerSnapshot {
  id: string;
  generatedAt: string;
  itemCount: number;
  p0Count: number;
  p1Count: number;
  p2Count: number;
  playState: string;
}

interface FaultLedgerPayload {
  ok: boolean;
  retentionPolicy?: RuntimeFaultLedgerRetentionPolicy;
  prune?: RuntimeFaultLedgerPruneSummary;
  pruneAudit?: RuntimeFaultLedgerPruneAuditEntry[];
  snapshots?: RuntimeFaultLedgerSnapshot[];
}

interface AuditPayload {
  ok: boolean;
  audits?: RuntimeFaultLedgerPruneAuditEntry[];
}

interface TelemetryEvent {
  id: string;
  kind: string;
  value: number;
  at: string;
  tags?: Record<string, string | number | boolean>;
}

interface TelemetrySloAlert {
  id: string;
  level: 'warning' | 'critical';
  indicator: string;
  message: string;
  current: number;
  objective: number;
  at: string;
}

interface TelemetryPayload {
  ok: boolean;
  snapshot?: {
    events?: TelemetryEvent[];
    totals?: {
      runtimeForensicsEvents?: number;
    };
  };
  slo?: {
    alerts?: TelemetrySloAlert[];
  };
}

type UnifiedTimelineItem = {
  id: string;
  at: string;
  type: 'snapshot' | 'audit' | 'telemetry';
  title: string;
  detail: string;
  severity: 'ok' | 'warn' | 'error';
};

type TimelineTypeFilter = 'all' | UnifiedTimelineItem['type'];
type TimelineSeverityFilter = 'all' | UnifiedTimelineItem['severity'];

interface RuntimeForensicsAdminNotification {
  id: string;
  alertId: string;
  createdAt: string;
  acknowledgedAt?: string | null;
  level: TelemetrySloAlert['level'];
  indicator: string;
  title: string;
  message: string;
  current: number;
  objective: number;
}

interface RuntimeForensicsAdminNotificationRetentionPolicy {
  maxNotifications: number;
  maxAgeDays: number;
  source?: 'defaults' | 'env' | 'request';
}

interface RuntimeForensicsAdminNotificationPruneCandidate {
  id: string;
  createdAt: string;
  level: RuntimeForensicsAdminNotification['level'];
  indicator: string;
  reason: 'count' | 'age' | 'count+age';
}

interface RuntimeForensicsAdminNotificationPruneSummary {
  dryRun: boolean;
  deleted: number;
  wouldDelete: number;
  retained: number;
  policy: RuntimeForensicsAdminNotificationRetentionPolicy;
  candidates: RuntimeForensicsAdminNotificationPruneCandidate[];
}

interface AdminNotificationPayload {
  ok: boolean;
  retentionPolicy?: RuntimeForensicsAdminNotificationRetentionPolicy;
  prune?: RuntimeForensicsAdminNotificationPruneSummary;
  notifications?: RuntimeForensicsAdminNotification[];
}

interface RuntimeForensicsWebhookStatus {
  configured: boolean;
  enabled: boolean;
  source: 'env' | 'persisted_config';
  url: string | null;
  host: string | null;
  signingEnabled: boolean;
  hasSecret: boolean;
  allowlistHosts: string[];
  effectiveAllowlist: string[];
  allowlistConfigured: boolean;
  allowlistBlocked: boolean;
  blockedReason: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

interface RuntimeForensicsWebhookDelivery {
  id: string;
  event: string;
  source: 'slo' | 'manual-test' | 'retry';
  notificationId: string;
  alertId: string | null;
  status: 'pending' | 'delivered' | 'failed' | 'blocked' | 'backoff' | 'skipped';
  createdAt: string;
  updatedAt: string;
  lastAttemptAt: string | null;
  nextAttemptAt: string | null;
  deliveredAt: string | null;
  attemptCount: number;
  responseStatus: number | null;
  error: string | null;
  targetHost: string | null;
}

interface RuntimeForensicsWebhookRetentionPolicy {
  maxDeliveries: number;
  maxAgeDays: number;
  source?: 'defaults' | 'env' | 'request' | 'admin';
  updatedAt?: string | null;
  updatedBy?: string | null;
}

interface RuntimeForensicsWebhookPruneCandidate {
  id: string;
  createdAt: string;
  status: RuntimeForensicsWebhookDelivery['status'];
  event: string;
  reason: 'count' | 'age' | 'count+age';
}

interface RuntimeForensicsWebhookPruneSummary {
  dryRun: boolean;
  deleted: number;
  wouldDelete: number;
  retained: number;
  policy: RuntimeForensicsWebhookRetentionPolicy;
  candidates: RuntimeForensicsWebhookPruneCandidate[];
  auditId?: string | null;
}

interface RuntimeForensicsWebhookPruneAuditEntry extends RuntimeForensicsWebhookPruneSummary {
  id: string;
  createdAt: string;
  actorId: string | null;
  reason: string;
}

interface RuntimeForensicsWebhookPayload {
  ok: boolean;
  webhook?: RuntimeForensicsWebhookStatus;
  retentionPolicy?: RuntimeForensicsWebhookRetentionPolicy;
  prune?: RuntimeForensicsWebhookPruneSummary;
  pruneAudit?: RuntimeForensicsWebhookPruneAuditEntry[];
  deliveryCount?: number;
  deliveries?: RuntimeForensicsWebhookDelivery[];
  test?: { delivered?: boolean; error?: string; skipped?: string };
  retry?: { delivered?: boolean; error?: string; skipped?: string; attempted?: number };
}

const TIMELINE_TYPE_FILTERS: Array<{ value: TimelineTypeFilter; label: string }> = [
  { value: 'all', label: 'Todo' },
  { value: 'snapshot', label: 'Snapshots' },
  { value: 'audit', label: 'Prune' },
  { value: 'telemetry', label: 'Telemetry' },
];
const TIMELINE_SEVERITY_FILTERS: Array<{ value: TimelineSeverityFilter; label: string }> = [
  { value: 'all', label: 'Todas' },
  { value: 'error', label: 'Error' },
  { value: 'warn', label: 'Warn' },
  { value: 'ok', label: 'OK' },
];

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(String(data?.error || fallback));
  }
  return data as T;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function formatSloAlertTitle(alert: TelemetrySloAlert): string {
  if (alert.indicator === 'runtime_forensics_p0_reappeared') {
    return 'SLO P0 reaparecido';
  }
  return `SLO ${alert.indicator}`;
}

function makeAdminNotificationFromAlert(
  alert: TelemetrySloAlert
): RuntimeForensicsAdminNotification {
  return {
    id: `runtime-forensics-slo:${alert.id}`,
    alertId: alert.id,
    createdAt: alert.at,
    acknowledgedAt: null,
    level: alert.level,
    indicator: alert.indicator,
    title: formatSloAlertTitle(alert),
    message:
      alert.message ||
      `Valor ${alert.current} sobre objetivo ${alert.objective} en ${alert.indicator}.`,
    current: alert.current,
    objective: alert.objective,
  };
}

function readTimelineDateBound(value: string, endOfDay: boolean): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? `${trimmed}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`
    : trimmed;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function RuntimeForensicsAdminPage() {
  const [editorAccess, setEditorAccess] = useState(() =>
    resolveEditorAccessFromSessionPayload(null)
  );
  const [resolved, setResolved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [policySaving, setPolicySaving] = useState(false);
  const [dryRunning, setDryRunning] = useState(false);
  const [pruning, setPruning] = useState(false);
  const [notificationDryRunning, setNotificationDryRunning] = useState(false);
  const [notificationPruning, setNotificationPruning] = useState(false);
  const [exporting, setExporting] = useState<'csv' | 'json' | null>(null);
  const [notificationExporting, setNotificationExporting] = useState<'csv' | 'json' | null>(null);
  const [webhookExporting, setWebhookExporting] = useState<'csv' | 'json' | null>(null);
  const [webhookAuditExporting, setWebhookAuditExporting] = useState<'csv' | 'json' | null>(null);
  const [webhookDryRunning, setWebhookDryRunning] = useState(false);
  const [webhookPruning, setWebhookPruning] = useState(false);
  const [message, setMessage] = useState('Cargando runtime forensics...');
  const [policy, setPolicy] = useState<RuntimeFaultLedgerRetentionPolicy | null>(null);
  const [policyDraft, setPolicyDraft] = useState({ maxSnapshots: '', maxAgeDays: '' });
  const [snapshots, setSnapshots] = useState<RuntimeFaultLedgerSnapshot[]>([]);
  const [prune, setPrune] = useState<RuntimeFaultLedgerPruneSummary | null>(null);
  const [audit, setAudit] = useState<RuntimeFaultLedgerPruneAuditEntry[]>([]);
  const [telemetryEvents, setTelemetryEvents] = useState<TelemetryEvent[]>([]);
  const [telemetryAlerts, setTelemetryAlerts] = useState<TelemetrySloAlert[]>([]);
  const [adminNotifications, setAdminNotifications] = useState<
    RuntimeForensicsAdminNotification[]
  >([]);
  const [notificationPolicy, setNotificationPolicy] =
    useState<RuntimeForensicsAdminNotificationRetentionPolicy | null>(null);
  const [notificationPolicyDraft, setNotificationPolicyDraft] = useState({
    maxNotifications: '',
    maxAgeDays: '',
  });
  const [notificationPrune, setNotificationPrune] =
    useState<RuntimeForensicsAdminNotificationPruneSummary | null>(null);
  const [notificationsLoaded, setNotificationsLoaded] = useState(false);
  const [timelineTypeFilter, setTimelineTypeFilter] = useState<TimelineTypeFilter>('all');
  const [timelineSeverityFilter, setTimelineSeverityFilter] =
    useState<TimelineSeverityFilter>('all');
  const [timelineDateFrom, setTimelineDateFrom] = useState('');
  const [timelineDateTo, setTimelineDateTo] = useState('');
  const [auditFilters, setAuditFilters] = useState({
    actor: '',
    reason: '',
    from: '',
    to: '',
  });
  const [webhookStatus, setWebhookStatus] = useState<RuntimeForensicsWebhookStatus | null>(null);
  const [webhookDeliveries, setWebhookDeliveries] = useState<RuntimeForensicsWebhookDelivery[]>(
    []
  );
  const [webhookRetentionPolicy, setWebhookRetentionPolicy] =
    useState<RuntimeForensicsWebhookRetentionPolicy | null>(null);
  const [webhookRetentionDraft, setWebhookRetentionDraft] = useState({
    maxDeliveries: '',
    maxAgeDays: '',
  });
  const [webhookPrune, setWebhookPrune] =
    useState<RuntimeForensicsWebhookPruneSummary | null>(null);
  const [webhookPruneAudit, setWebhookPruneAudit] = useState<
    RuntimeForensicsWebhookPruneAuditEntry[]
  >([]);
  const [webhookPolicySaving, setWebhookPolicySaving] = useState(false);
  const [webhookFilters, setWebhookFilters] = useState({
    status: 'all',
    event: '',
    from: '',
    to: '',
  });
  const [webhookAuditFilters, setWebhookAuditFilters] = useState({
    actor: '',
    reason: '',
    from: '',
    to: '',
  });
  const [webhookDraft, setWebhookDraft] = useState({
    enabled: true,
    url: '',
    secret: '',
    allowlistHosts: '',
  });
  const [webhookBusy, setWebhookBusy] = useState(false);

  const canAccessAdmin = resolved && editorAccess.permissions.admin;
  const runtimeSloAlerts = useMemo(
    () =>
      telemetryAlerts.filter((alert) => alert.indicator === 'runtime_forensics_p0_reappeared'),
    [telemetryAlerts]
  );
  const activeAdminNotifications = useMemo(
    () => adminNotifications.filter((notification) => !notification.acknowledgedAt),
    [adminNotifications]
  );

  const persistAdminNotification = async (notification: RuntimeForensicsAdminNotification) => {
    const response = await fetch('/api/scripts/runtime/fault-ledger/notifications', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'upsert', notification }),
    });
    const payload = await readJson<AdminNotificationPayload>(
      response,
      'No se pudo persistir la notificación admin'
    );
    if (payload.notifications) setAdminNotifications(payload.notifications);
  };

  useEffect(() => {
    if (!notificationsLoaded || runtimeSloAlerts.length === 0) return;
    const existingAlertIds = new Set(adminNotifications.map((notification) => notification.alertId));
    const newAlerts = runtimeSloAlerts.filter((alert) => !existingAlertIds.has(alert.id));
    if (newAlerts.length === 0) return;

    newAlerts.forEach((alert) => {
      toast({
        title: formatSloAlertTitle(alert),
        description:
          alert.message ||
          `P0 reaparecidos: ${alert.current}. Objetivo SLO: ${alert.objective}.`,
        variant: 'destructive',
      });
    });

    setAdminNotifications((current) => {
      const currentAlertIds = new Set(current.map((notification) => notification.alertId));
      const additions = newAlerts
        .filter((alert) => !currentAlertIds.has(alert.id))
        .map(makeAdminNotificationFromAlert);
      if (additions.length === 0) return current;
      additions.forEach((notification) => {
        void persistAdminNotification(notification).catch((error) => {
          setMessage(`Notificación admin no persistida: ${String(error)}`);
        });
      });
      return [...additions, ...current].slice(0, 50);
    });
  }, [adminNotifications, notificationsLoaded, runtimeSloAlerts]);

  useEffect(() => {
    let cancelled = false;
    const loadSession = async () => {
      try {
        const payload = (await loadClientAuthSession()) as EditorSessionPayload;
        if (!cancelled) {
          setEditorAccess(resolveEditorAccessFromSessionPayload(payload));
        }
      } finally {
        if (!cancelled) {
          setResolved(true);
        }
      }
    };
    void loadSession();
    return () => {
      cancelled = true;
    };
  }, []);

  const applyLedgerPayload = (payload: FaultLedgerPayload) => {
    if (payload.retentionPolicy) {
      setPolicy(payload.retentionPolicy);
      setPolicyDraft({
        maxSnapshots: String(payload.retentionPolicy.maxSnapshots),
        maxAgeDays: String(payload.retentionPolicy.maxAgeDays),
      });
    }
    if (payload.snapshots) setSnapshots(payload.snapshots);
    if (payload.prune) setPrune(payload.prune);
    if (payload.pruneAudit) setAudit(payload.pruneAudit);
  };

  const applyWebhookPayload = (payload: RuntimeForensicsWebhookPayload) => {
    if (payload.webhook) {
      setWebhookStatus(payload.webhook);
      setWebhookDraft((current) => ({
        ...current,
        enabled: payload.webhook?.enabled ?? true,
        allowlistHosts: (payload.webhook?.allowlistHosts || []).join(', '),
      }));
    }
    if (payload.deliveries) setWebhookDeliveries(payload.deliveries);
    if (payload.pruneAudit) setWebhookPruneAudit(payload.pruneAudit);
    if (payload.retentionPolicy) {
      setWebhookRetentionPolicy(payload.retentionPolicy);
      setWebhookRetentionDraft({
        maxDeliveries: String(payload.retentionPolicy.maxDeliveries),
        maxAgeDays: String(payload.retentionPolicy.maxAgeDays),
      });
    }
    if (payload.prune) setWebhookPrune(payload.prune);
  };

  const buildWebhookQuery = (limit: string) => {
    const params = new URLSearchParams({ limit });
    if (webhookFilters.status !== 'all') params.set('status', webhookFilters.status);
    if (webhookFilters.event.trim()) params.set('event', webhookFilters.event.trim());
    if (webhookFilters.from) params.set('from', webhookFilters.from);
    if (webhookFilters.to) params.set('to', webhookFilters.to);
    return params.toString();
  };

  const buildWebhookPanelQuery = (limit: string) => {
    const params = new URLSearchParams(buildWebhookQuery(limit));
    if (webhookAuditFilters.actor.trim()) params.set('auditActor', webhookAuditFilters.actor.trim());
    if (webhookAuditFilters.reason.trim()) params.set('auditReason', webhookAuditFilters.reason.trim());
    if (webhookAuditFilters.from) params.set('auditFrom', webhookAuditFilters.from);
    if (webhookAuditFilters.to) params.set('auditTo', webhookAuditFilters.to);
    return params.toString();
  };

  const buildWebhookAuditExportQuery = (format: 'csv' | 'json') => {
    const params = new URLSearchParams({ format, limit: '100' });
    if (webhookAuditFilters.actor.trim()) params.set('actor', webhookAuditFilters.actor.trim());
    if (webhookAuditFilters.reason.trim()) params.set('reason', webhookAuditFilters.reason.trim());
    if (webhookAuditFilters.from) params.set('from', webhookAuditFilters.from);
    if (webhookAuditFilters.to) params.set('to', webhookAuditFilters.to);
    return params.toString();
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const auditParams = new URLSearchParams({ limit: '50' });
      if (auditFilters.actor.trim()) auditParams.set('actor', auditFilters.actor.trim());
      if (auditFilters.reason.trim()) auditParams.set('reason', auditFilters.reason.trim());
      if (auditFilters.from) auditParams.set('from', auditFilters.from);
      if (auditFilters.to) auditParams.set('to', auditFilters.to);
      const [ledgerResponse, auditResponse, notificationsResponse] = await Promise.all([
        fetch('/api/scripts/runtime/fault-ledger?limit=50'),
        fetch(`/api/scripts/runtime/fault-ledger/audit?${auditParams.toString()}`),
        fetch('/api/scripts/runtime/fault-ledger/notifications?limit=50'),
      ]);
      const ledgerPayload = await readJson<FaultLedgerPayload>(
        ledgerResponse,
        'No se pudo leer el ledger forense'
      );
      const auditPayload = await readJson<AuditPayload>(
        auditResponse,
        'No se pudo leer auditoría forense'
      );
      const notificationPayload = await readJson<AdminNotificationPayload>(
        notificationsResponse,
        'No se pudo leer notifications admin'
      );
      applyLedgerPayload(ledgerPayload);
      setAudit(auditPayload.audits || ledgerPayload.pruneAudit || []);
      setAdminNotifications(notificationPayload.notifications || []);
      if (notificationPayload.retentionPolicy) {
        setNotificationPolicy(notificationPayload.retentionPolicy);
        setNotificationPolicyDraft({
          maxNotifications: String(notificationPayload.retentionPolicy.maxNotifications),
          maxAgeDays: String(notificationPayload.retentionPolicy.maxAgeDays),
        });
      }
      if (notificationPayload.prune) setNotificationPrune(notificationPayload.prune);
      setNotificationsLoaded(true);
      const webhookResponse = await fetch(
        `/api/scripts/runtime/fault-ledger/webhook?${buildWebhookPanelQuery('25')}`
      ).catch(() => null);
      if (webhookResponse?.ok) {
        applyWebhookPayload(
          await webhookResponse.json() as RuntimeForensicsWebhookPayload
        );
      }
      const telemetryResponse = await fetch('/api/telemetry').catch(() => null);
      if (telemetryResponse?.ok) {
        const telemetryPayload = await telemetryResponse.json() as TelemetryPayload;
        setTelemetryEvents(
          (telemetryPayload.snapshot?.events || []).filter(
            (event) => event.kind === 'runtime_forensics_event'
          )
        );
        setTelemetryAlerts(telemetryPayload.slo?.alerts || []);
      }
      setMessage('Runtime forensics actualizado.');
    } catch (error) {
      setMessage(`Runtime forensics no disponible: ${String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canAccessAdmin) void loadData();
  }, [canAccessAdmin]);

  const savePolicy = async () => {
    setPolicySaving(true);
    try {
      const response = await fetch('/api/scripts/runtime/fault-ledger', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'update-retention-policy',
          retentionPolicy: {
            maxSnapshots: Number(policyDraft.maxSnapshots),
            maxAgeDays: Number(policyDraft.maxAgeDays),
          },
        }),
      });
      applyLedgerPayload(
        await readJson<FaultLedgerPayload>(response, 'No se pudo guardar la política')
      );
      setMessage('Política forense guardada.');
    } catch (error) {
      setMessage(`Política no guardada: ${String(error)}`);
    } finally {
      setPolicySaving(false);
    }
  };

  const runPrune = async (dryRun: boolean) => {
    if (dryRun) setDryRunning(true);
    else setPruning(true);
    try {
      const response = await fetch('/api/scripts/runtime/fault-ledger?limit=50', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: dryRun ? 'dry-run-prune' : 'prune' }),
      });
      applyLedgerPayload(
        await readJson<FaultLedgerPayload>(response, 'No se pudo ejecutar prune')
      );
      setMessage(dryRun ? 'Dry run prune completado.' : 'Prune forense ejecutado.');
    } catch (error) {
      setMessage(`Prune no ejecutado: ${String(error)}`);
    } finally {
      if (dryRun) setDryRunning(false);
      else setPruning(false);
    }
  };

  const exportAudit = async (format: 'csv' | 'json') => {
    setExporting(format);
    try {
      const params = new URLSearchParams({ format, limit: '100' });
      if (auditFilters.actor.trim()) params.set('actor', auditFilters.actor.trim());
      if (auditFilters.reason.trim()) params.set('reason', auditFilters.reason.trim());
      if (auditFilters.from) params.set('from', auditFilters.from);
      if (auditFilters.to) params.set('to', auditFilters.to);
      const response = await fetch(`/api/scripts/runtime/fault-ledger/audit?${params.toString()}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      downloadBlob(await response.blob(), `runtime-fault-ledger-prune-audit.${format}`);
      setMessage(`Audit prune exportado como ${format.toUpperCase()}.`);
    } catch (error) {
      setMessage(`Audit prune no exportado: ${String(error)}`);
    } finally {
      setExporting(null);
    }
  };

  const exportNotifications = async (format: 'csv' | 'json') => {
    setNotificationExporting(format);
    try {
      const response = await fetch(
        `/api/scripts/runtime/fault-ledger/notifications?format=${format}&limit=100`
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      downloadBlob(await response.blob(), `runtime-forensics-admin-notifications.${format}`);
      setMessage(`Admin notifications exportadas como ${format.toUpperCase()}.`);
    } catch (error) {
      setMessage(`Admin notifications no exportadas: ${String(error)}`);
    } finally {
      setNotificationExporting(null);
    }
  };

  const runNotificationPrune = async (dryRun: boolean) => {
    if (dryRun) setNotificationDryRunning(true);
    else setNotificationPruning(true);
    try {
      const response = await fetch('/api/scripts/runtime/fault-ledger/notifications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: dryRun ? 'dry-run-prune' : 'prune',
          retentionPolicy: {
            maxNotifications: Number(notificationPolicyDraft.maxNotifications),
            maxAgeDays: Number(notificationPolicyDraft.maxAgeDays),
          },
        }),
      });
      const payload = await readJson<AdminNotificationPayload>(
        response,
        'No se pudo ejecutar prune de notifications'
      );
      if (payload.notifications) setAdminNotifications(payload.notifications);
      if (payload.retentionPolicy) {
        setNotificationPolicy(payload.retentionPolicy);
        setNotificationPolicyDraft({
          maxNotifications: String(payload.retentionPolicy.maxNotifications),
          maxAgeDays: String(payload.retentionPolicy.maxAgeDays),
        });
      }
      if (payload.prune) setNotificationPrune(payload.prune);
      setMessage(
        dryRun
          ? 'Dry run de admin notifications completado.'
          : 'Prune de admin notifications ejecutado.'
      );
    } catch (error) {
      setMessage(`Prune de admin notifications no ejecutado: ${String(error)}`);
    } finally {
      if (dryRun) setNotificationDryRunning(false);
      else setNotificationPruning(false);
    }
  };

  const runWebhookAction = async (
    body: Record<string, unknown>,
    successMessage: string
  ) => {
    setWebhookBusy(true);
    try {
      const response = await fetch(`/api/scripts/runtime/fault-ledger/webhook?${buildWebhookPanelQuery('25')}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await readJson<RuntimeForensicsWebhookPayload>(
        response,
        'No se pudo ejecutar acción webhook'
      );
      applyWebhookPayload(payload);
      setWebhookDraft((current) => ({ ...current, secret: '', url: '' }));
      setMessage(successMessage);
    } catch (error) {
      setMessage(`Webhook no actualizado: ${String(error)}`);
    } finally {
      setWebhookBusy(false);
    }
  };

  const saveWebhookConfig = () =>
    runWebhookAction(
      {
        action: 'update-config',
        enabled: webhookDraft.enabled,
        ...(webhookDraft.url.trim() ? { url: webhookDraft.url.trim() } : {}),
        ...(webhookDraft.secret.trim() ? { secret: webhookDraft.secret.trim() } : {}),
        allowlistHosts: webhookDraft.allowlistHosts,
      },
      'Config webhook guardada.'
    );

  const testWebhook = () =>
    runWebhookAction({ action: 'test' }, 'Webhook test ejecutado y registrado.');

  const retryWebhookDue = () =>
    runWebhookAction({ action: 'retry-due' }, 'Retry webhook ejecutado para entregas vencidas.');

  const retryWebhookDelivery = (id: string) =>
    runWebhookAction({ action: 'retry', id }, 'Retry webhook ejecutado.');

  const exportWebhookDeliveries = async (format: 'csv' | 'json') => {
    setWebhookExporting(format);
    try {
      const response = await fetch(
        `/api/scripts/runtime/fault-ledger/webhook?${buildWebhookQuery('200')}&format=${format}`
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      downloadBlob(await response.blob(), `runtime-forensics-webhook-deliveries.${format}`);
      setMessage(`Historial webhook exportado como ${format.toUpperCase()}.`);
    } catch (error) {
      setMessage(`Historial webhook no exportado: ${String(error)}`);
    } finally {
      setWebhookExporting(null);
    }
  };

  const saveWebhookRetentionPolicy = async () => {
    setWebhookPolicySaving(true);
    try {
      const response = await fetch(`/api/scripts/runtime/fault-ledger/webhook?${buildWebhookPanelQuery('25')}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'update-retention-policy',
          retentionPolicy: {
            maxDeliveries: Number(webhookRetentionDraft.maxDeliveries),
            maxAgeDays: Number(webhookRetentionDraft.maxAgeDays),
          },
        }),
      });
      const payload = await readJson<RuntimeForensicsWebhookPayload>(
        response,
        'No se pudo guardar la retención webhook'
      );
      applyWebhookPayload(payload);
      setMessage('Retención webhook guardada en storage forense.');
    } catch (error) {
      setMessage(`Retención webhook no guardada: ${String(error)}`);
    } finally {
      setWebhookPolicySaving(false);
    }
  };

  const runWebhookPrune = async (dryRun: boolean) => {
    if (dryRun) setWebhookDryRunning(true);
    else setWebhookPruning(true);
    try {
      const response = await fetch(`/api/scripts/runtime/fault-ledger/webhook?${buildWebhookPanelQuery('25')}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: dryRun ? 'dry-run-prune' : 'prune',
        }),
      });
      const payload = await readJson<RuntimeForensicsWebhookPayload>(
        response,
        'No se pudo ejecutar prune del historial webhook'
      );
      applyWebhookPayload(payload);
      setMessage(
        dryRun
          ? 'Dry run del historial webhook completado.'
          : 'Prune del historial webhook ejecutado.'
      );
    } catch (error) {
      setMessage(`Prune del historial webhook no ejecutado: ${String(error)}`);
    } finally {
      if (dryRun) setWebhookDryRunning(false);
      else setWebhookPruning(false);
    }
  };

  const exportWebhookPruneAudit = async (format: 'csv' | 'json') => {
    setWebhookAuditExporting(format);
    try {
      const response = await fetch(
        `/api/scripts/runtime/fault-ledger/webhook/prune-audit?${buildWebhookAuditExportQuery(format)}`
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      downloadBlob(await response.blob(), `runtime-forensics-webhook-prune-audit.${format}`);
      setMessage(`Audit webhook prune exportado como ${format.toUpperCase()}.`);
    } catch (error) {
      setMessage(`Audit webhook prune no exportado: ${String(error)}`);
    } finally {
      setWebhookAuditExporting(null);
    }
  };

  const p0Total = useMemo(
    () => snapshots.reduce((total, snapshot) => total + snapshot.p0Count, 0),
    [snapshots]
  );

  const unifiedTimeline = useMemo<UnifiedTimelineItem[]>(() => {
    const snapshotItems = snapshots.map((snapshot) => ({
      id: `snapshot:${snapshot.id}`,
      at: snapshot.generatedAt,
      type: 'snapshot' as const,
      title: `Snapshot ledger | P0 ${snapshot.p0Count}`,
      detail: `${snapshot.playState} | items ${snapshot.itemCount} | P1 ${snapshot.p1Count} | P2 ${snapshot.p2Count}`,
      severity: snapshot.p0Count > 0 ? 'error' as const : 'ok' as const,
    }));
    const auditItems = audit.map((entry) => ({
      id: `audit:${entry.id}`,
      at: entry.createdAt,
      type: 'audit' as const,
      title: `${entry.dryRun ? 'Dry run prune' : 'Prune'} | would ${entry.wouldDelete}`,
      detail: `deleted ${entry.deleted} | retained ${entry.retained} | reason ${entry.reason}`,
      severity: entry.deleted > 0 ? 'warn' as const : 'ok' as const,
    }));
    const telemetryItems = telemetryEvents.map((event) => ({
      id: `telemetry:${event.id}`,
      at: event.at,
      type: 'telemetry' as const,
      title: `Telemetry ${String(event.tags?.action || 'runtime_forensics')}`,
      detail: Object.entries(event.tags || {})
        .map(([key, value]) => `${key}=${String(value)}`)
        .join(' | '),
      severity: event.tags?.action === 'p0_reappeared' ? 'error' as const : 'ok' as const,
    }));
    return [...snapshotItems, ...auditItems, ...telemetryItems].sort((left, right) =>
      right.at.localeCompare(left.at)
    );
  }, [audit, snapshots, telemetryEvents]);

  const filteredUnifiedTimeline = useMemo(
    () => {
      const fromMs = readTimelineDateBound(timelineDateFrom, false);
      const toMs = readTimelineDateBound(timelineDateTo, true);
      return unifiedTimeline
        .filter((item) => timelineTypeFilter === 'all' || item.type === timelineTypeFilter)
        .filter(
          (item) =>
            timelineSeverityFilter === 'all' || item.severity === timelineSeverityFilter
        )
        .filter((item) => {
          const itemMs = Date.parse(item.at);
          if (fromMs !== null && Number.isFinite(itemMs) && itemMs < fromMs) return false;
          if (toMs !== null && Number.isFinite(itemMs) && itemMs > toMs) return false;
          return true;
        })
        .slice(0, 30);
    },
    [
      timelineDateFrom,
      timelineDateTo,
      timelineSeverityFilter,
      timelineTypeFilter,
      unifiedTimeline,
    ]
  );

  const acknowledgeAdminNotification = (id: string) => {
    const acknowledgedAt = new Date().toISOString();
    setAdminNotifications((current) =>
      current.map((notification) =>
        notification.id === id ? { ...notification, acknowledgedAt } : notification
      )
    );
    void fetch('/api/scripts/runtime/fault-ledger/notifications', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'acknowledge', id }),
    })
      .then((response) =>
        readJson<AdminNotificationPayload>(response, 'No se pudo marcar la notificación')
      )
      .then((payload) => {
        if (payload.notifications) setAdminNotifications(payload.notifications);
      })
      .catch((error) => {
        setMessage(`Notificación admin no marcada: ${String(error)}`);
      });
  };

  const acknowledgeAllAdminNotifications = () => {
    const acknowledgedAt = new Date().toISOString();
    const ids = activeAdminNotifications.map((notification) => notification.id);
    setAdminNotifications((current) =>
      current.map((notification) =>
        notification.acknowledgedAt ? notification : { ...notification, acknowledgedAt }
      )
    );
    void fetch('/api/scripts/runtime/fault-ledger/notifications', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'acknowledge-all', ids }),
    })
      .then((response) =>
        readJson<AdminNotificationPayload>(response, 'No se pudieron marcar las notificaciones')
      )
      .then((payload) => {
        if (payload.notifications) setAdminNotifications(payload.notifications);
      })
      .catch((error) => {
        setMessage(`Notifications admin no marcadas: ${String(error)}`);
      });
  };

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
          <h1 className="text-lg font-semibold">Runtime Forensics restringido</h1>
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
              <h1 className="text-sm font-semibold">Runtime Forensics</h1>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Ledger, retención, prune audit y exports forenses del runtime.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => void loadData()} disabled={loading}>
              <Search className="mr-2 h-4 w-4" />
              Refrescar
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link href="/admin/runtime-forensics/overview">
                <DatabaseZap className="mr-2 h-4 w-4" />
                Overview
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

      <main className="grid gap-3 p-3 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <section className="rounded border border-slate-800 bg-slate-950 p-3">
          <div className="flex items-center gap-2">
            <DatabaseZap className="h-4 w-4 text-cyan-300" />
            <h2 className="text-sm font-semibold">Política y acciones</h2>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Input
              value={policyDraft.maxSnapshots}
              onChange={(event) =>
                setPolicyDraft((current) => ({ ...current, maxSnapshots: event.target.value }))
              }
              type="number"
              min={0}
              className="border-slate-700 bg-slate-900 text-xs"
              data-testid="admin-runtime-forensics-policy-max"
              aria-label="Máximo snapshots"
            />
            <Input
              value={policyDraft.maxAgeDays}
              onChange={(event) =>
                setPolicyDraft((current) => ({ ...current, maxAgeDays: event.target.value }))
              }
              type="number"
              min={0}
              className="border-slate-700 bg-slate-900 text-xs"
              data-testid="admin-runtime-forensics-policy-days"
              aria-label="Máximo días"
            />
          </div>
          <div className="mt-2 text-xs text-slate-400">
            actual: {policy?.maxSnapshots ?? 'n/a'} snapshots / {policy?.maxAgeDays ?? 'n/a'} días
            | fuente: {policy?.source || 'n/a'}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void savePolicy()} disabled={policySaving}>
              {policySaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Guardar política
            </Button>
            <Button size="sm" variant="outline" onClick={() => void runPrune(true)} disabled={dryRunning}>
              {dryRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              Dry run prune
            </Button>
            <Button size="sm" variant="outline" onClick={() => void runPrune(false)} disabled={pruning}>
              {pruning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Prune now
            </Button>
          </div>
          <div className="mt-3 rounded border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-300">
            {message}
          </div>
          <div
            className="mt-3 rounded border border-slate-800 bg-slate-900 p-3 text-xs"
            data-testid="admin-runtime-forensics-webhook-panel"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-semibold text-slate-100">
                <RadioTower className="h-4 w-4 text-cyan-300" />
                Webhook SLO
              </div>
              <div
                className={[
                  'rounded border px-2 py-1 text-[10px]',
                  webhookStatus?.allowlistBlocked
                    ? 'border-red-500/40 bg-red-500/10 text-red-100'
                    : webhookStatus?.configured
                      ? 'border-green-500/40 bg-green-500/10 text-green-100'
                      : 'border-amber-500/40 bg-amber-500/10 text-amber-100',
                ].join(' ')}
                data-testid="admin-runtime-forensics-webhook-status"
              >
                {webhookStatus?.configured ? 'configurado' : 'sin configurar'} |{' '}
                {webhookStatus?.signingEnabled ? 'firma activa' : 'sin firma'}
              </div>
            </div>
            {webhookStatus?.allowlistBlocked && (
              <div
                className="mt-2 flex items-start gap-2 rounded border border-red-500/40 bg-red-500/10 px-2 py-2 text-red-100"
                data-testid="admin-runtime-forensics-webhook-allowlist-alert"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  Webhook configurado pero bloqueado por allowlist: {webhookStatus.blockedReason}. Host:{' '}
                  {webhookStatus.host || 'n/a'}.
                </div>
              </div>
            )}
            <div className="mt-2 grid gap-2 md:grid-cols-[80px_minmax(0,1fr)]">
              <label className="flex items-center gap-2 text-[10px] text-slate-300">
                <input
                  type="checkbox"
                  checked={webhookDraft.enabled}
                  onChange={(event) =>
                    setWebhookDraft((current) => ({ ...current, enabled: event.target.checked }))
                  }
                  className="h-3 w-3"
                  data-testid="admin-runtime-forensics-webhook-enabled"
                />
                activo
              </label>
              <Input
                value={webhookDraft.url}
                onChange={(event) =>
                  setWebhookDraft((current) => ({ ...current, url: event.target.value }))
                }
                placeholder={webhookStatus?.url || 'https://hooks.example.test/rey30'}
                className="h-8 border-slate-700 bg-slate-950 text-xs"
                data-testid="admin-runtime-forensics-webhook-url"
                aria-label="Webhook URL"
              />
              <div className="text-[10px] text-slate-500">secret</div>
              <Input
                value={webhookDraft.secret}
                onChange={(event) =>
                  setWebhookDraft((current) => ({ ...current, secret: event.target.value }))
                }
                placeholder={webhookStatus?.hasSecret ? 'write-only: preservado' : 'opcional'}
                type="password"
                className="h-8 border-slate-700 bg-slate-950 text-xs"
                data-testid="admin-runtime-forensics-webhook-secret"
                aria-label="Webhook signing secret"
              />
              <div className="text-[10px] text-slate-500">allowlist</div>
              <Input
                value={webhookDraft.allowlistHosts}
                onChange={(event) =>
                  setWebhookDraft((current) => ({
                    ...current,
                    allowlistHosts: event.target.value,
                  }))
                }
                placeholder="hooks.example.test, *.company.test"
                className="h-8 border-slate-700 bg-slate-950 text-xs"
                data-testid="admin-runtime-forensics-webhook-allowlist"
                aria-label="Webhook allowlist"
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => void saveWebhookConfig()}
                disabled={webhookBusy}
                data-testid="admin-runtime-forensics-webhook-save"
              >
                <Save className="mr-2 h-4 w-4" />
                Guardar webhook
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void testWebhook()}
                disabled={webhookBusy || !webhookStatus?.configured}
                data-testid="admin-runtime-forensics-webhook-test"
              >
                <Send className="mr-2 h-4 w-4" />
                Test
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void retryWebhookDue()}
                disabled={webhookBusy}
                data-testid="admin-runtime-forensics-webhook-retry-due"
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Retry due
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void exportWebhookDeliveries('csv')}
                disabled={webhookExporting !== null || webhookDeliveries.length === 0}
                data-testid="admin-runtime-forensics-webhook-export-csv"
              >
                <Download className="mr-2 h-4 w-4" />
                CSV
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void exportWebhookDeliveries('json')}
                disabled={webhookExporting !== null || webhookDeliveries.length === 0}
                data-testid="admin-runtime-forensics-webhook-export-json"
              >
                <Download className="mr-2 h-4 w-4" />
                JSON
              </Button>
            </div>
            <div className="mt-2 text-[10px] text-slate-400">
              fuente: {webhookStatus?.source || 'n/a'} | host:{' '}
              {webhookStatus?.host || 'n/a'} | allowlist efectiva:{' '}
              {(webhookStatus?.effectiveAllowlist || []).join(', ') || 'vacía'}
            </div>
            <div className="mt-2 grid gap-2 md:grid-cols-[110px_minmax(0,1fr)_130px_130px_auto]">
              <select
                value={webhookFilters.status}
                onChange={(event) =>
                  setWebhookFilters((current) => ({ ...current, status: event.target.value }))
                }
                className="h-8 rounded border border-slate-700 bg-slate-950 px-2 text-[10px] text-slate-100"
                data-testid="admin-runtime-forensics-webhook-filter-status"
                aria-label="Filtrar webhook por status"
              >
                <option value="all">status: todo</option>
                <option value="delivered">delivered</option>
                <option value="backoff">backoff</option>
                <option value="blocked">blocked</option>
                <option value="failed">failed</option>
                <option value="pending">pending</option>
                <option value="skipped">skipped</option>
              </select>
              <Input
                value={webhookFilters.event}
                onChange={(event) =>
                  setWebhookFilters((current) => ({ ...current, event: event.target.value }))
                }
                placeholder="evento"
                className="h-8 border-slate-700 bg-slate-950 text-[10px]"
                data-testid="admin-runtime-forensics-webhook-filter-event"
                aria-label="Filtrar webhook por evento"
              />
              <Input
                value={webhookFilters.from}
                onChange={(event) =>
                  setWebhookFilters((current) => ({ ...current, from: event.target.value }))
                }
                type="date"
                className="h-8 border-slate-700 bg-slate-950 text-[10px]"
                data-testid="admin-runtime-forensics-webhook-filter-from"
                aria-label="Filtrar webhook desde"
              />
              <Input
                value={webhookFilters.to}
                onChange={(event) =>
                  setWebhookFilters((current) => ({ ...current, to: event.target.value }))
                }
                type="date"
                className="h-8 border-slate-700 bg-slate-950 text-[10px]"
                data-testid="admin-runtime-forensics-webhook-filter-to"
                aria-label="Filtrar webhook hasta"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => void loadData()}
                disabled={loading}
                data-testid="admin-runtime-forensics-webhook-filter-apply"
              >
                <Search className="mr-2 h-4 w-4" />
                Filtrar
              </Button>
            </div>
            <div className="mt-2 grid gap-2 md:grid-cols-[90px_90px_minmax(0,1fr)]">
              <Input
                value={webhookRetentionDraft.maxDeliveries}
                onChange={(event) =>
                  setWebhookRetentionDraft((current) => ({
                    ...current,
                    maxDeliveries: event.target.value,
                  }))
                }
                type="number"
                min={0}
                className="h-8 border-slate-700 bg-slate-950 text-[10px]"
                data-testid="admin-runtime-forensics-webhook-retention-max"
                aria-label="Máximo historial webhook"
              />
              <Input
                value={webhookRetentionDraft.maxAgeDays}
                onChange={(event) =>
                  setWebhookRetentionDraft((current) => ({
                    ...current,
                    maxAgeDays: event.target.value,
                  }))
                }
                type="number"
                min={0}
                className="h-8 border-slate-700 bg-slate-950 text-[10px]"
                data-testid="admin-runtime-forensics-webhook-retention-days"
                aria-label="Máximo días historial webhook"
              />
              <div className="flex flex-wrap gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-2 text-[10px]"
                  onClick={() => void saveWebhookRetentionPolicy()}
                  disabled={webhookPolicySaving}
                  data-testid="admin-runtime-forensics-webhook-retention-save"
                >
                  {webhookPolicySaving ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Save className="h-3 w-3" />
                  )}
                  Guardar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-2 text-[10px]"
                  onClick={() => void runWebhookPrune(true)}
                  disabled={webhookDryRunning}
                  data-testid="admin-runtime-forensics-webhook-dry-run"
                >
                  {webhookDryRunning ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Search className="h-3 w-3" />
                  )}
                  Dry run
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-2 text-[10px]"
                  onClick={() => void runWebhookPrune(false)}
                  disabled={webhookPruning}
                  data-testid="admin-runtime-forensics-webhook-prune"
                >
                  {webhookPruning ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Trash2 className="h-3 w-3" />
                  )}
                  Prune
                </Button>
              </div>
            </div>
            <div
              className="mt-1 text-[10px] text-slate-400"
              data-testid="admin-runtime-forensics-webhook-retention"
            >
              retención webhook: {webhookRetentionPolicy?.maxDeliveries ?? 'n/a'} entregas /{' '}
              {webhookRetentionPolicy?.maxAgeDays ?? 'n/a'} días | fuente:{' '}
              {webhookRetentionPolicy?.source || 'n/a'}
              {webhookRetentionPolicy?.updatedAt
                ? ` | guardada ${webhookRetentionPolicy.updatedAt}`
                : ''}
              {webhookPrune
                ? webhookPrune.dryRun
                  ? ` | dry run: ${webhookPrune.wouldDelete} candidatos, ${webhookPrune.retained} retenidas`
                  : ` | último prune: ${webhookPrune.deleted} borradas, ${webhookPrune.retained} retenidas`
                : ''}
            </div>
            {webhookPrune && webhookPrune.candidates.length > 0 && (
              <div
                className="mt-2 space-y-1"
                data-testid="admin-runtime-forensics-webhook-prune-candidates"
              >
                {webhookPrune.candidates.slice(0, 3).map((candidate) => (
                  <div
                    key={candidate.id}
                    className="break-all rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[10px] text-slate-300"
                  >
                    {candidate.reason}: {candidate.createdAt} | {candidate.status} |{' '}
                    {candidate.event} | {candidate.id}
                  </div>
                ))}
              </div>
            )}
            <div className="mt-2 grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_130px_130px_auto_auto_auto]">
              <Input
                value={webhookAuditFilters.actor}
                onChange={(event) =>
                  setWebhookAuditFilters((current) => ({ ...current, actor: event.target.value }))
                }
                placeholder="actor audit"
                className="h-8 border-slate-700 bg-slate-950 text-[10px]"
                data-testid="admin-runtime-forensics-webhook-audit-actor"
                aria-label="Filtrar audit webhook por actor"
              />
              <Input
                value={webhookAuditFilters.reason}
                onChange={(event) =>
                  setWebhookAuditFilters((current) => ({ ...current, reason: event.target.value }))
                }
                placeholder="razón audit"
                className="h-8 border-slate-700 bg-slate-950 text-[10px]"
                data-testid="admin-runtime-forensics-webhook-audit-reason"
                aria-label="Filtrar audit webhook por razón"
              />
              <Input
                value={webhookAuditFilters.from}
                onChange={(event) =>
                  setWebhookAuditFilters((current) => ({ ...current, from: event.target.value }))
                }
                type="date"
                className="h-8 border-slate-700 bg-slate-950 text-[10px]"
                data-testid="admin-runtime-forensics-webhook-audit-from"
                aria-label="Filtrar audit webhook desde"
              />
              <Input
                value={webhookAuditFilters.to}
                onChange={(event) =>
                  setWebhookAuditFilters((current) => ({ ...current, to: event.target.value }))
                }
                type="date"
                className="h-8 border-slate-700 bg-slate-950 text-[10px]"
                data-testid="admin-runtime-forensics-webhook-audit-to"
                aria-label="Filtrar audit webhook hasta"
              />
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-2 text-[10px]"
                onClick={() => void loadData()}
                disabled={loading}
                data-testid="admin-runtime-forensics-webhook-audit-filter-apply"
              >
                <Search className="h-3 w-3" />
                Filtrar audit
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-2 text-[10px]"
                onClick={() => void exportWebhookPruneAudit('csv')}
                disabled={webhookAuditExporting !== null || webhookPruneAudit.length === 0}
                data-testid="admin-runtime-forensics-webhook-audit-export-csv"
              >
                <Download className="h-3 w-3" />
                CSV audit
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-2 text-[10px]"
                onClick={() => void exportWebhookPruneAudit('json')}
                disabled={webhookAuditExporting !== null || webhookPruneAudit.length === 0}
                data-testid="admin-runtime-forensics-webhook-audit-export-json"
              >
                <Download className="h-3 w-3" />
                JSON audit
              </Button>
            </div>
            {webhookPruneAudit.length > 0 && (
              <div
                className="mt-2 space-y-1"
                data-testid="admin-runtime-forensics-webhook-prune-audit"
              >
                {webhookPruneAudit.slice(0, 3).map((entry) => (
                  <div
                    key={entry.id}
                    className="break-all rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[10px] text-slate-300"
                  >
                    audit {entry.reason}: {entry.createdAt} | actor {entry.actorId || 'n/a'} |
                    would {entry.wouldDelete} | deleted {entry.deleted}
                  </div>
                ))}
              </div>
            )}
            <div className="mt-2 space-y-1" data-testid="admin-runtime-forensics-webhook-history">
              {webhookDeliveries.slice(0, 4).map((delivery) => (
                <div
                  key={delivery.id}
                  className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[10px] text-slate-300"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="break-all font-mono">{delivery.status} | {delivery.id}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-[10px]"
                      onClick={() => void retryWebhookDelivery(delivery.id)}
                      disabled={webhookBusy || delivery.status === 'delivered'}
                    >
                      Retry
                    </Button>
                  </div>
                  <div className="mt-0.5 break-all opacity-80">
                    attempts {delivery.attemptCount} | next {delivery.nextAttemptAt || 'n/a'} |
                    host {delivery.targetHost || 'n/a'} | error {delivery.error || 'n/a'}
                  </div>
                </div>
              ))}
              {webhookDeliveries.length === 0 && (
                <div className="rounded border border-slate-700 bg-slate-950 px-2 py-2 text-[10px] text-slate-500">
                  Sin entregas webhook registradas.
                </div>
              )}
            </div>
          </div>
          {prune && (
            <div className="mt-3 rounded border border-slate-800 bg-slate-900 p-3 text-xs text-slate-300">
              <div className="font-medium text-slate-100">
                {prune.dryRun ? 'Dry run' : 'Prune'} | would {prune.wouldDelete} | deleted {prune.deleted} | retained {prune.retained}
              </div>
              <div className="mt-2 space-y-1">
                {prune.candidates.slice(0, 6).map((candidate) => (
                  <div key={candidate.id} className="break-all rounded border border-slate-700 bg-slate-950 px-2 py-1">
                    {candidate.reason}: {candidate.generatedAt} | P0 {candidate.p0Count} | {candidate.id}
                  </div>
                ))}
                {prune.candidates.length === 0 && <div className="text-slate-500">Sin candidatos.</div>}
              </div>
            </div>
          )}
        </section>

        <section className="rounded border border-slate-800 bg-slate-950 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Prune audit log</h2>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => void exportAudit('csv')} disabled={exporting !== null}>
                <Download className="mr-2 h-4 w-4" />
                CSV
              </Button>
              <Button size="sm" variant="outline" onClick={() => void exportAudit('json')} disabled={exporting !== null}>
                <Download className="mr-2 h-4 w-4" />
                JSON
              </Button>
            </div>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-4">
            <Input
              value={auditFilters.actor}
              onChange={(event) =>
                setAuditFilters((current) => ({ ...current, actor: event.target.value }))
              }
              placeholder="actor"
              className="border-slate-700 bg-slate-900 text-xs"
              data-testid="admin-runtime-forensics-audit-actor"
              aria-label="Filtrar auditoría por actor"
            />
            <Input
              value={auditFilters.reason}
              onChange={(event) =>
                setAuditFilters((current) => ({ ...current, reason: event.target.value }))
              }
              placeholder="razón"
              className="border-slate-700 bg-slate-900 text-xs"
              data-testid="admin-runtime-forensics-audit-reason"
              aria-label="Filtrar auditoría por razón"
            />
            <Input
              value={auditFilters.from}
              onChange={(event) =>
                setAuditFilters((current) => ({ ...current, from: event.target.value }))
              }
              type="date"
              className="border-slate-700 bg-slate-900 text-xs"
              data-testid="admin-runtime-forensics-audit-from"
              aria-label="Filtrar auditoría desde"
            />
            <Input
              value={auditFilters.to}
              onChange={(event) =>
                setAuditFilters((current) => ({ ...current, to: event.target.value }))
              }
              type="date"
              className="border-slate-700 bg-slate-900 text-xs"
              data-testid="admin-runtime-forensics-audit-to"
              aria-label="Filtrar auditoría hasta"
            />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <div className="rounded border border-slate-800 bg-slate-900 px-3 py-2">snapshots: {snapshots.length}</div>
            <div className="rounded border border-slate-800 bg-slate-900 px-3 py-2">P0 total: {p0Total}</div>
            <div className="rounded border border-slate-800 bg-slate-900 px-3 py-2">audits: {audit.length}</div>
          </div>
          {runtimeSloAlerts.length > 0 && (
            <div className="mt-3 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">
              SLO alerta: P0 reaparecidos exceden el umbral de runtime forensics.
            </div>
          )}
          {(adminNotifications.length > 0 || runtimeSloAlerts.length > 0) && (
            <div
              className="mt-3 rounded border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-100"
              data-testid="admin-runtime-forensics-notifications"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-semibold text-red-50">
                  <Bell className="h-4 w-4" />
                  Admin notifications | {activeAdminNotifications.length} activa(s) |{' '}
                  {adminNotifications.length} total
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 border-red-400/40 bg-red-950/40 px-2 text-[10px] text-red-50 hover:bg-red-900/50"
                    onClick={() => void exportNotifications('csv')}
                    disabled={notificationExporting !== null || adminNotifications.length === 0}
                    data-testid="admin-runtime-forensics-notifications-export-csv"
                  >
                    <Download className="h-3 w-3" />
                    CSV
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 border-red-400/40 bg-red-950/40 px-2 text-[10px] text-red-50 hover:bg-red-900/50"
                    onClick={() => void exportNotifications('json')}
                    disabled={notificationExporting !== null || adminNotifications.length === 0}
                    data-testid="admin-runtime-forensics-notifications-export-json"
                  >
                    <Download className="h-3 w-3" />
                    JSON
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 border-red-400/40 bg-red-950/40 px-2 text-[10px] text-red-50 hover:bg-red-900/50"
                    onClick={acknowledgeAllAdminNotifications}
                    disabled={activeAdminNotifications.length === 0}
                    data-testid="admin-runtime-forensics-notifications-ack-all"
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    Marcar leídas
                  </Button>
                </div>
              </div>
              <div className="mt-2 space-y-1">
                {activeAdminNotifications.slice(0, 4).map((notification) => (
                  <div
                    key={notification.id}
                    className="rounded border border-red-400/20 bg-slate-950/70 px-2 py-1.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-medium text-red-50">
                          {notification.title} | {notification.level}
                        </div>
                        <div className="mt-0.5 text-[10px] text-red-100/80">
                          {notification.createdAt} | actual {notification.current} | objetivo{' '}
                          {notification.objective}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 border-red-400/40 bg-red-950/40 px-2 text-[10px] text-red-50 hover:bg-red-900/50"
                        onClick={() => acknowledgeAdminNotification(notification.id)}
                        data-testid="admin-runtime-forensics-notification-ack"
                      >
                        OK
                      </Button>
                    </div>
                    <div className="mt-1 break-all text-[10px] text-red-100/90">
                      {notification.message}
                    </div>
                  </div>
                ))}
                {activeAdminNotifications.length === 0 && (
                  <div className="rounded border border-red-400/20 bg-slate-950/70 px-2 py-1.5 text-[10px] text-red-100/80">
                    Sin notifications activas. El historial persistente queda disponible para export.
                  </div>
                )}
              </div>
              <div className="mt-2 grid gap-2 md:grid-cols-[90px_90px_minmax(0,1fr)]">
                <Input
                  value={notificationPolicyDraft.maxNotifications}
                  onChange={(event) =>
                    setNotificationPolicyDraft((current) => ({
                      ...current,
                      maxNotifications: event.target.value,
                    }))
                  }
                  type="number"
                  min={0}
                  className="h-7 border-red-400/30 bg-slate-950/70 text-[10px] text-red-50"
                  data-testid="admin-runtime-forensics-notifications-retention-max"
                  aria-label="Máximo notifications forenses"
                />
                <Input
                  value={notificationPolicyDraft.maxAgeDays}
                  onChange={(event) =>
                    setNotificationPolicyDraft((current) => ({
                      ...current,
                      maxAgeDays: event.target.value,
                    }))
                  }
                  type="number"
                  min={0}
                  className="h-7 border-red-400/30 bg-slate-950/70 text-[10px] text-red-50"
                  data-testid="admin-runtime-forensics-notifications-retention-days"
                  aria-label="Máximo días notifications forenses"
                />
                <div className="flex flex-wrap gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 border-red-400/40 bg-red-950/40 px-2 text-[10px] text-red-50 hover:bg-red-900/50"
                    onClick={() => void runNotificationPrune(true)}
                    disabled={notificationDryRunning}
                    data-testid="admin-runtime-forensics-notifications-dry-run"
                  >
                    {notificationDryRunning ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Search className="h-3 w-3" />
                    )}
                    Dry run
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 border-red-400/40 bg-red-950/40 px-2 text-[10px] text-red-50 hover:bg-red-900/50"
                    onClick={() => void runNotificationPrune(false)}
                    disabled={notificationPruning}
                    data-testid="admin-runtime-forensics-notifications-prune"
                  >
                    {notificationPruning ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                    Prune
                  </Button>
                </div>
              </div>
              <div
                className="mt-1 text-[10px] text-red-100/80"
                data-testid="admin-runtime-forensics-notifications-retention"
              >
                retención: {notificationPolicy?.maxNotifications ?? 'n/a'} notifications /{' '}
                {notificationPolicy?.maxAgeDays ?? 'n/a'} días | fuente:{' '}
                {notificationPolicy?.source || 'n/a'}
                {notificationPrune
                  ? notificationPrune.dryRun
                    ? ` | dry run: ${notificationPrune.wouldDelete} candidatos, ${notificationPrune.retained} retenidas`
                    : ` | último prune: ${notificationPrune.deleted} borradas, ${notificationPrune.retained} retenidas`
                  : ''}
              </div>
              {notificationPrune && notificationPrune.candidates.length > 0 && (
                <div
                  className="mt-2 space-y-1"
                  data-testid="admin-runtime-forensics-notifications-prune-candidates"
                >
                  {notificationPrune.candidates.slice(0, 3).map((candidate) => (
                    <div
                      key={candidate.id}
                      className="break-all rounded border border-red-400/20 bg-slate-950/70 px-2 py-1 text-[10px]"
                    >
                      {candidate.reason}: {candidate.createdAt} | {candidate.indicator} |{' '}
                      {candidate.id}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="mt-3 rounded border border-slate-800 bg-slate-900 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-semibold text-slate-100">Timeline unificado</h3>
              <div className="grid grid-cols-4 overflow-hidden rounded border border-slate-700">
                {TIMELINE_TYPE_FILTERS.map((option) => (
                  <Button
                    key={option.value}
                    size="sm"
                    variant={timelineTypeFilter === option.value ? 'default' : 'ghost'}
                    className="h-7 rounded-none px-2 text-[10px]"
                    onClick={() => setTimelineTypeFilter(option.value)}
                    data-testid={`admin-runtime-forensics-timeline-filter-${option.value}`}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="mt-2 grid gap-2 md:grid-cols-[minmax(0,1fr)_130px_130px]">
              <div className="grid grid-cols-4 overflow-hidden rounded border border-slate-700">
                {TIMELINE_SEVERITY_FILTERS.map((option) => (
                  <Button
                    key={option.value}
                    size="sm"
                    variant={timelineSeverityFilter === option.value ? 'default' : 'ghost'}
                    className="h-7 rounded-none px-2 text-[10px]"
                    onClick={() => setTimelineSeverityFilter(option.value)}
                    data-testid={`admin-runtime-forensics-timeline-severity-${option.value}`}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
              <Input
                value={timelineDateFrom}
                onChange={(event) => setTimelineDateFrom(event.target.value)}
                type="date"
                className="h-7 border-slate-700 bg-slate-950 text-[10px]"
                data-testid="admin-runtime-forensics-timeline-from"
                aria-label="Filtrar timeline desde"
              />
              <Input
                value={timelineDateTo}
                onChange={(event) => setTimelineDateTo(event.target.value)}
                type="date"
                className="h-7 border-slate-700 bg-slate-950 text-[10px]"
                data-testid="admin-runtime-forensics-timeline-to"
                aria-label="Filtrar timeline hasta"
              />
            </div>
            <div className="mt-2 space-y-1" data-testid="admin-runtime-forensics-timeline">
              {filteredUnifiedTimeline.map((item) => (
                <div
                  key={item.id}
                  className={[
                    'rounded border px-2 py-1 text-xs',
                    item.severity === 'error'
                      ? 'border-red-500/30 bg-red-500/10 text-red-100'
                      : item.severity === 'warn'
                        ? 'border-amber-500/30 bg-amber-500/10 text-amber-100'
                        : 'border-slate-700 bg-slate-950 text-slate-300',
                  ].join(' ')}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded border border-slate-600/50 px-1 text-[10px]">{item.type}</span>
                    <span>{item.at}</span>
                    <span className="font-medium">{item.title}</span>
                  </div>
                  <div className="mt-0.5 break-all text-[10px] opacity-80">{item.detail}</div>
                </div>
              ))}
              {filteredUnifiedTimeline.length === 0 && (
                <div className="rounded border border-slate-800 bg-slate-950 px-2 py-2 text-xs text-slate-500">
                  Sin eventos para timeline.
                </div>
              )}
            </div>
          </div>
          <div className="mt-3 space-y-2">
            {audit.slice(0, 12).map((entry) => (
              <div key={entry.id} className="rounded border border-slate-800 bg-slate-900 px-3 py-2 text-xs">
                <div className="font-medium text-slate-100">
                  {entry.dryRun ? 'dry run' : 'prune'} | {entry.createdAt}
                </div>
                <div className="mt-1 text-slate-400">
                  actor: {entry.actorId || 'n/a'} | reason: {entry.reason} | would {entry.wouldDelete} | deleted {entry.deleted}
                </div>
              </div>
            ))}
            {audit.length === 0 && (
              <div className="rounded border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-500">
                Sin auditorías de prune todavía.
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
