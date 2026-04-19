import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_METRIC = 'rey30_runtime_forensics_webhook_delivery_failure_rate';

function parseArgs(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args.set(key, 'true');
      continue;
    }
    args.set(key, next);
    i += 1;
  }
  return args;
}

function help() {
  return `Runtime forensics Prometheus/Alertmanager probe

Usage:
  node scripts/runtime-forensics-prometheus-probe.mjs --metrics-url http://host/api/ops/metrics --ops-token TOKEN

Options:
  --metrics-url        External URL that Prometheus would scrape.
  --metric-name        Metric to require. Defaults to ${DEFAULT_METRIC}.
  --ops-token          Optional x-rey30-ops-token for protected metrics.
  --alertmanager-url   Optional Alertmanager base URL or /api/v2/status URL.
  --publish-url        Optional REY30 app base URL or full prometheus-probe endpoint.
  --timeout-ms         Request timeout. Default 8000.
  --report-path        JSON report output path.
`;
}

function toPositiveInt(raw, fallback) {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

function redactUrl(raw) {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    for (const key of Array.from(url.searchParams.keys())) {
      if (/token|secret|password|key/i.test(key)) url.searchParams.set(key, 'REDACTED');
    }
    return url.toString();
  } catch {
    return String(raw).replace(/(token|secret|password|key)=([^&\s]+)/gi, '$1=REDACTED');
  }
}

function normalizeAlertmanagerStatusUrl(raw) {
  const trimmed = String(raw || '').replace(/\/+$/, '');
  if (!trimmed) return '';
  if (/\/api\/v2\/status$/i.test(trimmed)) return trimmed;
  return `${trimmed}/api/v2/status`;
}

function normalizePublishUrl(raw) {
  const trimmed = String(raw || '').replace(/\/+$/, '');
  if (!trimmed) return '';
  if (trimmed.endsWith('/api/scripts/runtime/fault-ledger/prometheus-probe')) return trimmed;
  return `${trimmed}/api/scripts/runtime/fault-ledger/prometheus-probe`;
}

function parseMetric(text, metricName) {
  const escaped = metricName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `^(${escaped}(?:\\{[^}]*\\})?)\\s+([-+]?(?:\\d+\\.?\\d*|\\d*\\.\\d+)(?:[eE][-+]?\\d+)?)`,
    'm'
  );
  const match = String(text || '').match(pattern);
  if (!match) return { found: false, value: null, sample: '' };
  const value = Number(match[2]);
  return { found: true, value: Number.isFinite(value) ? value : null, sample: match[0] };
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    return await fetch(url, {
      headers: options.headers,
      method: options.method || 'GET',
      body: options.body,
      cache: 'no-store',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function probeAlertmanager(alertmanagerUrl, timeoutMs) {
  if (!alertmanagerUrl) {
    return {
      configured: false,
      url: null,
      status: 'disabled',
      statusCode: null,
      version: null,
      error: null,
    };
  }
  const url = normalizeAlertmanagerStatusUrl(alertmanagerUrl);
  try {
    const response = await fetchWithTimeout(url, {
      timeoutMs,
      headers: { accept: 'application/json' },
    });
    const payload = await response.json().catch(() => null);
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
      error: String(error?.message || error),
    };
  }
}

async function writeReport(reportPath, report) {
  if (!reportPath) return;
  const absolute = path.isAbsolute(reportPath)
    ? reportPath
    : path.join(process.cwd(), reportPath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, JSON.stringify(report, null, 2), 'utf8');
}

async function publishResult(publishUrl, opsToken, result, timeoutMs) {
  if (!publishUrl) return null;
  const headers = {
    accept: 'application/json',
    'content-type': 'application/json',
  };
  if (opsToken) headers['x-rey30-ops-token'] = opsToken;
  const response = await fetchWithTimeout(normalizePublishUrl(publishUrl), {
    method: 'POST',
    timeoutMs,
    headers,
    body: JSON.stringify({ action: 'publish', result }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, status: response.status, error: JSON.stringify(payload) };
  }
  return { ok: true, status: response.status };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.has('help') || args.has('h')) {
    process.stdout.write(help());
    return;
  }

  const metricsUrl =
    args.get('metrics-url') ||
    process.env.REY30_RUNTIME_FORENSICS_PROMETHEUS_PROBE_URL ||
    process.env.REY30_PROMETHEUS_METRICS_URL ||
    '';
  const metricName =
    args.get('metric-name') ||
    process.env.REY30_RUNTIME_FORENSICS_PROMETHEUS_PROBE_METRIC ||
    DEFAULT_METRIC;
  const opsToken =
    args.get('ops-token') ||
    process.env.REY30_RUNTIME_FORENSICS_PROMETHEUS_PROBE_TOKEN ||
    process.env.REY30_OPS_TOKEN ||
    '';
  const alertmanagerUrl =
    args.get('alertmanager-url') ||
    process.env.REY30_RUNTIME_FORENSICS_ALERTMANAGER_URL ||
    process.env.REY30_ALERTMANAGER_URL ||
    '';
  const publishUrl =
    args.get('publish-url') || process.env.REY30_RUNTIME_FORENSICS_PROBE_PUBLISH_URL || '';
  const timeoutMs = toPositiveInt(
    args.get('timeout-ms') || process.env.REY30_RUNTIME_FORENSICS_PROMETHEUS_PROBE_TIMEOUT_MS,
    8000
  );
  const reportPath =
    args.get('report-path') ||
    process.env.REY30_RUNTIME_FORENSICS_PROMETHEUS_PROBE_REPORT ||
    'output/runtime-forensics-prometheus-probe/report.json';
  const checkedAt = new Date().toISOString();
  const startedAt = Date.now();

  if (!metricsUrl) {
    throw new Error('Missing --metrics-url or REY30_RUNTIME_FORENSICS_PROMETHEUS_PROBE_URL.');
  }

  const headers = { accept: 'text/plain' };
  if (opsToken) headers['x-rey30-ops-token'] = opsToken;

  let result;
  try {
    const response = await fetchWithTimeout(metricsUrl, { timeoutMs, headers });
    const text = await response.text();
    const parsed = parseMetric(text, metricName);
    const alertmanager = await probeAlertmanager(alertmanagerUrl, timeoutMs);
    const status = !response.ok ? 'error' : parsed.found ? 'ok' : 'missing';
    result = {
      id: `external-prometheus-probe:${metricName}:${checkedAt}`,
      checkedAt,
      source: 'external',
      ok: status === 'ok' && alertmanager.status !== 'error',
      status,
      metricName,
      metricsUrl: redactUrl(metricsUrl),
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
    };
  } catch (error) {
    result = {
      id: `external-prometheus-probe:${metricName}:${checkedAt}`,
      checkedAt,
      source: 'external',
      ok: false,
      status: 'error',
      metricName,
      metricsUrl: redactUrl(metricsUrl),
      statusCode: null,
      durationMs: Date.now() - startedAt,
      value: null,
      sample: '',
      error: String(error?.message || error),
      alertmanager: await probeAlertmanager(alertmanagerUrl, timeoutMs),
    };
  }

  const publish = await publishResult(publishUrl, opsToken, result, timeoutMs).catch((error) => ({
    ok: false,
    error: String(error?.message || error),
  }));
  const report = { ...result, publish };
  await writeReport(reportPath, report);
  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (!result.ok || (publish && !publish.ok)) process.exit(1);
}

main().catch((error) => {
  process.stderr.write(`runtime-forensics-prometheus-probe failed: ${String(error?.message || error)}\n`);
  process.exit(1);
});
