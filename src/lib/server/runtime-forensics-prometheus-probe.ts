import { promises as fs } from 'node:fs';
import path from 'node:path';
import { WEBHOOK_FAILURE_RATE_METRIC } from './runtime-forensics-prometheus';

export type RuntimeForensicsExternalPrometheusProbeStatus =
  | 'ok'
  | 'missing'
  | 'error'
  | 'disabled';

export interface RuntimeForensicsAlertmanagerProbeResult {
  configured: boolean;
  url: string | null;
  status: 'ok' | 'error' | 'disabled';
  statusCode: number | null;
  version: string | null;
  error: string | null;
}

export interface RuntimeForensicsExternalPrometheusProbeSnapshot {
  id: string;
  checkedAt: string;
  source: 'server' | 'external';
  ok: boolean;
  status: RuntimeForensicsExternalPrometheusProbeStatus;
  metricName: string;
  metricsUrl: string | null;
  statusCode: number | null;
  durationMs: number;
  value: number | null;
  sample: string;
  error: string | null;
  alertmanager: RuntimeForensicsAlertmanagerProbeResult;
}

export interface RuntimeForensicsExternalPrometheusProbeConfig {
  enabled: boolean;
  source: 'env' | 'disabled';
  metricName: string;
  metricsUrl: string | null;
  alertmanagerUrl: string | null;
  timeoutMs: number;
  tokenConfigured: boolean;
}

const PROBE_ROOT = '.runtime-forensics-prometheus';
const PROBE_DIR = 'external-probe';
const PROBE_VERSION = 1 as const;

interface RuntimeForensicsExternalPrometheusProbeDocument
  extends RuntimeForensicsExternalPrometheusProbeSnapshot {
  version: typeof PROBE_VERSION;
}

function probeRoot() {
  return path.join(process.cwd(), PROBE_ROOT, PROBE_DIR);
}

function latestProbePath() {
  return path.join(probeRoot(), 'latest.json');
}

function historyProbePath(id: string) {
  return path.join(probeRoot(), 'history', `${encodeURIComponent(id)}.json`);
}

function readEnvNumber(key: string, fallback: number): number {
  const value = Number(process.env[key]);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

function readMetricName() {
  return (
    process.env.REY30_RUNTIME_FORENSICS_PROMETHEUS_PROBE_METRIC?.trim() ||
    WEBHOOK_FAILURE_RATE_METRIC
  );
}

function readMetricsUrl() {
  return (
    process.env.REY30_RUNTIME_FORENSICS_PROMETHEUS_PROBE_URL?.trim() ||
    process.env.REY30_PROMETHEUS_METRICS_URL?.trim() ||
    ''
  );
}

function readAlertmanagerUrl() {
  return (
    process.env.REY30_RUNTIME_FORENSICS_ALERTMANAGER_URL?.trim() ||
    process.env.REY30_ALERTMANAGER_URL?.trim() ||
    ''
  );
}

function readOpsToken() {
  return (
    process.env.REY30_RUNTIME_FORENSICS_PROMETHEUS_PROBE_TOKEN?.trim() ||
    process.env.REY30_OPS_TOKEN?.trim() ||
    ''
  );
}

function redactUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    for (const key of Array.from(url.searchParams.keys())) {
      if (/token|secret|password|key/i.test(key)) {
        url.searchParams.set(key, 'REDACTED');
      }
    }
    return url.toString();
  } catch {
    return raw.replace(/(token|secret|password|key)=([^&\s]+)/gi, '$1=REDACTED');
  }
}

function normalizeAlertmanagerStatusUrl(raw: string): string {
  const trimmed = raw.replace(/\/+$/, '');
  if (/\/api\/v2\/status$/i.test(trimmed)) return trimmed;
  return `${trimmed}/api/v2/status`;
}

export function getRuntimeForensicsExternalPrometheusProbeConfig(): RuntimeForensicsExternalPrometheusProbeConfig {
  const metricsUrl = readMetricsUrl();
  const alertmanagerUrl = readAlertmanagerUrl();
  return {
    enabled: Boolean(metricsUrl),
    source: metricsUrl ? 'env' : 'disabled',
    metricName: readMetricName(),
    metricsUrl: redactUrl(metricsUrl),
    alertmanagerUrl: redactUrl(alertmanagerUrl || null),
    timeoutMs: readEnvNumber('REY30_RUNTIME_FORENSICS_PROMETHEUS_PROBE_TIMEOUT_MS', 8000),
    tokenConfigured: Boolean(readOpsToken()),
  };
}

export function parsePrometheusMetricSample(text: string, metricName: string) {
  const escaped = metricName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `^(${escaped}(?:\\{[^}]*\\})?)\\s+([-+]?(?:\\d+\\.?\\d*|\\d*\\.\\d+)(?:[eE][-+]?\\d+)?)`,
    'm'
  );
  const match = text.match(pattern);
  if (!match) {
    return {
      found: false,
      value: null as number | null,
      sample: '',
    };
  }
  const value = Number(match[2]);
  return {
    found: true,
    value: Number.isFinite(value) ? value : null,
    sample: match[0],
  };
}

async function fetchWithTimeout(
  url: string,
  options: { headers?: Record<string, string>; timeoutMs: number }
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    return await fetch(url, {
      headers: options.headers,
      cache: 'no-store',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function probeAlertmanager(params: {
  alertmanagerUrl: string;
  timeoutMs: number;
}): Promise<RuntimeForensicsAlertmanagerProbeResult> {
  if (!params.alertmanagerUrl) {
    return {
      configured: false,
      url: null,
      status: 'disabled',
      statusCode: null,
      version: null,
      error: null,
    };
  }

  const url = normalizeAlertmanagerStatusUrl(params.alertmanagerUrl);
  try {
    const response = await fetchWithTimeout(url, {
      timeoutMs: params.timeoutMs,
      headers: { accept: 'application/json' },
    });
    const payload = (await response.json().catch(() => null)) as
      | { versionInfo?: { version?: string } }
      | null;
    return {
      configured: true,
      url: redactUrl(url),
      status: response.ok ? 'ok' : 'error',
      statusCode: response.status,
      version: payload?.versionInfo?.version || null,
      error: response.ok ? null : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      configured: true,
      url: redactUrl(url),
      status: 'error',
      statusCode: null,
      version: null,
      error: String(error instanceof Error ? error.message : error),
    };
  }
}

function normalizePublishedProbeSnapshot(
  input: Partial<RuntimeForensicsExternalPrometheusProbeSnapshot>
): RuntimeForensicsExternalPrometheusProbeSnapshot {
  const checkedAt = String(input.checkedAt || new Date().toISOString());
  const metricName = String(input.metricName || readMetricName());
  const status: RuntimeForensicsExternalPrometheusProbeStatus =
    input.status === 'ok' ||
    input.status === 'missing' ||
    input.status === 'error' ||
    input.status === 'disabled'
      ? input.status
      : 'error';
  const id = String(
    input.id || `external-prometheus-probe:${metricName}:${checkedAt}`
  );
  const alertmanager = input.alertmanager || {
    configured: false,
    url: null,
    status: 'disabled' as const,
    statusCode: null,
    version: null,
    error: null,
  };
  return {
    id,
    checkedAt,
    source: input.source === 'server' ? 'server' : 'external',
    ok: input.ok === true && status === 'ok' && alertmanager.status !== 'error',
    status,
    metricName,
    metricsUrl: redactUrl(input.metricsUrl || null),
    statusCode:
      typeof input.statusCode === 'number' && Number.isFinite(input.statusCode)
        ? input.statusCode
        : null,
    durationMs: Math.max(0, Math.round(Number(input.durationMs) || 0)),
    value:
      typeof input.value === 'number' && Number.isFinite(input.value)
        ? input.value
        : null,
    sample: String(input.sample || ''),
    error: input.error ? String(input.error) : null,
    alertmanager: {
      configured: Boolean(alertmanager.configured),
      url: redactUrl(alertmanager.url || null),
      status:
        alertmanager.status === 'ok' || alertmanager.status === 'error'
          ? alertmanager.status
          : 'disabled',
      statusCode:
        typeof alertmanager.statusCode === 'number' &&
        Number.isFinite(alertmanager.statusCode)
          ? alertmanager.statusCode
          : null,
      version: alertmanager.version ? String(alertmanager.version) : null,
      error: alertmanager.error ? String(alertmanager.error) : null,
    },
  };
}

export async function putRuntimeForensicsExternalPrometheusProbeSnapshot(
  input: Partial<RuntimeForensicsExternalPrometheusProbeSnapshot>
): Promise<RuntimeForensicsExternalPrometheusProbeSnapshot> {
  const snapshot = normalizePublishedProbeSnapshot(input);
  const document: RuntimeForensicsExternalPrometheusProbeDocument = {
    ...snapshot,
    version: PROBE_VERSION,
  };
  await fs.mkdir(path.dirname(historyProbePath(snapshot.id)), { recursive: true });
  await fs.writeFile(historyProbePath(snapshot.id), JSON.stringify(document, null, 2), 'utf8');
  await fs.writeFile(latestProbePath(), JSON.stringify(document, null, 2), 'utf8');
  return snapshot;
}

function toSnapshot(
  document: RuntimeForensicsExternalPrometheusProbeDocument
): RuntimeForensicsExternalPrometheusProbeSnapshot | null {
  if (document.version !== PROBE_VERSION) return null;
  return normalizePublishedProbeSnapshot(document);
}

export async function getLatestRuntimeForensicsExternalPrometheusProbeSnapshot(): Promise<RuntimeForensicsExternalPrometheusProbeSnapshot | null> {
  try {
    const raw = await fs.readFile(latestProbePath(), 'utf8');
    return toSnapshot(JSON.parse(raw) as RuntimeForensicsExternalPrometheusProbeDocument);
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'ENOENT'
    ) {
      return null;
    }
    throw error;
  }
}

export async function runRuntimeForensicsExternalPrometheusProbe(params?: {
  metricsUrl?: string;
  alertmanagerUrl?: string;
  metricName?: string;
  opsToken?: string;
  timeoutMs?: number;
  persist?: boolean;
  checkedAt?: string;
}): Promise<RuntimeForensicsExternalPrometheusProbeSnapshot> {
  const checkedAt = params?.checkedAt || new Date().toISOString();
  const metricName = params?.metricName || readMetricName();
  const metricsUrl = params?.metricsUrl || readMetricsUrl();
  const alertmanagerUrl = params?.alertmanagerUrl ?? readAlertmanagerUrl();
  const timeoutMs =
    params?.timeoutMs ||
    readEnvNumber('REY30_RUNTIME_FORENSICS_PROMETHEUS_PROBE_TIMEOUT_MS', 8000);
  const opsToken = params?.opsToken ?? readOpsToken();
  const startedAt = Date.now();

  if (!metricsUrl) {
    const snapshot = normalizePublishedProbeSnapshot({
      id: `external-prometheus-probe:${metricName}:${checkedAt}`,
      checkedAt,
      source: 'server',
      ok: false,
      status: 'disabled',
      metricName,
      metricsUrl: null,
      statusCode: null,
      durationMs: 0,
      value: null,
      sample: '',
      error:
        'REY30_RUNTIME_FORENSICS_PROMETHEUS_PROBE_URL or REY30_PROMETHEUS_METRICS_URL is not configured.',
      alertmanager: await probeAlertmanager({ alertmanagerUrl, timeoutMs }),
    });
    return params?.persist === false
      ? snapshot
      : putRuntimeForensicsExternalPrometheusProbeSnapshot(snapshot);
  }

  try {
    const headers: Record<string, string> = { accept: 'text/plain' };
    if (opsToken) {
      headers['x-rey30-ops-token'] = opsToken;
    }
    const response = await fetchWithTimeout(metricsUrl, { headers, timeoutMs });
    const text = await response.text();
    const parsed = parsePrometheusMetricSample(text, metricName);
    const alertmanager = await probeAlertmanager({ alertmanagerUrl, timeoutMs });
    const status: RuntimeForensicsExternalPrometheusProbeStatus = !response.ok
      ? 'error'
      : parsed.found
        ? 'ok'
        : 'missing';
    const snapshot = normalizePublishedProbeSnapshot({
      id: `external-prometheus-probe:${metricName}:${checkedAt}`,
      checkedAt,
      source: 'server',
      ok: status === 'ok' && alertmanager.status !== 'error',
      status,
      metricName,
      metricsUrl,
      statusCode: response.status,
      durationMs: Date.now() - startedAt,
      value: parsed.value,
      sample: parsed.sample,
      error:
        status === 'error'
          ? `HTTP ${response.status}`
          : status === 'missing'
            ? `Metric ${metricName} was not found in external scrape.`
            : null,
      alertmanager,
    });
    return params?.persist === false
      ? snapshot
      : putRuntimeForensicsExternalPrometheusProbeSnapshot(snapshot);
  } catch (error) {
    const alertmanager = await probeAlertmanager({ alertmanagerUrl, timeoutMs });
    const snapshot = normalizePublishedProbeSnapshot({
      id: `external-prometheus-probe:${metricName}:${checkedAt}`,
      checkedAt,
      source: 'server',
      ok: false,
      status: 'error',
      metricName,
      metricsUrl,
      statusCode: null,
      durationMs: Date.now() - startedAt,
      value: null,
      sample: '',
      error: String(error instanceof Error ? error.message : error),
      alertmanager,
    });
    return params?.persist === false
      ? snapshot
      : putRuntimeForensicsExternalPrometheusProbeSnapshot(snapshot);
  }
}
