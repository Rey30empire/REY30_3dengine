import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

function parseArgs(argv) {
  const map = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      map.set(key, 'true');
      continue;
    }
    map.set(key, next);
    i += 1;
  }
  return map;
}

function toPositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function ensureBaseUrl(raw) {
  if (!raw || !raw.trim()) {
    throw new Error('Missing base URL. Use --base-url or set CAP_BASE_URL.');
  }
  const trimmed = raw.trim();
  const withProtocol = trimmed.startsWith('http://') || trimmed.startsWith('https://')
    ? trimmed
    : `https://${trimmed}`;
  return withProtocol.replace(/\/+$/, '');
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

async function writeReport(reportPath, report) {
  if (!reportPath) return;
  const absolute = path.isAbsolute(reportPath)
    ? reportPath
    : path.join(process.cwd(), reportPath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, JSON.stringify(report, null, 2), 'utf8');
}

function parseAcceptedStatuses(raw) {
  const list = String(raw || '200')
    .split(',')
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isFinite(v));
  return list.length > 0 ? new Set(list) : new Set([200]);
}

function parseOptionalJson(raw) {
  if (!raw || !raw.trim()) return undefined;
  return raw;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = ensureBaseUrl(args.get('base-url') || process.env.CAP_BASE_URL || '');
  const endpoint = args.get('endpoint') || '/api/health/live';
  const method = String(args.get('method') || 'GET').toUpperCase();
  const requests = toPositiveInt(args.get('requests') || process.env.CAP_REQUESTS, 200);
  const concurrency = toPositiveInt(args.get('concurrency') || process.env.CAP_CONCURRENCY, 20);
  const timeoutMs = toPositiveInt(args.get('timeout-ms') || process.env.CAP_TIMEOUT_MS, 8000);
  const accepted = parseAcceptedStatuses(args.get('accepted-statuses') || process.env.CAP_ACCEPTED_STATUSES);
  const requiredStatus = Number(args.get('require-status') || process.env.CAP_REQUIRE_STATUS || 0);
  const reportPath = args.get('report-path') || process.env.CAP_REPORT_PATH || '';
  const body = parseOptionalJson(args.get('body') || process.env.CAP_BODY || '');
  const engineMode = args.get('engine-mode') || process.env.CAP_ENGINE_MODE || '';
  const sessionCookie = args.get('session-cookie') || process.env.CAP_SESSION_COOKIE || '';

  const url = `${baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  const latencies = [];
  const statusCounts = new Map();
  let completed = 0;
  let dispatched = 0;

  const headers = {
    Accept: 'application/json',
    origin: baseUrl,
  };
  if (body) headers['Content-Type'] = 'application/json';
  if (engineMode) headers['x-rey30-engine-mode'] = engineMode;
  if (sessionCookie) headers.Cookie = `rey30_session=${sessionCookie}`;

  async function oneRequest() {
    const started = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let status = 0;
    try {
      const response = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal,
        cache: 'no-store',
      });
      status = response.status;
      await response.text().catch(() => '');
    } catch {
      status = -1;
    } finally {
      clearTimeout(timeout);
      latencies.push(Date.now() - started);
      statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
      completed += 1;
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, requests) }, async () => {
    while (true) {
      if (dispatched >= requests) return;
      dispatched += 1;
      await oneRequest();
    }
  });

  const startedAt = Date.now();
  await Promise.all(workers);
  const durationMs = Date.now() - startedAt;

  let failures = 0;
  for (const [status, count] of statusCounts) {
    if (!accepted.has(status)) {
      failures += count;
    }
  }

  const requiredStatusCount = requiredStatus
    ? (statusCounts.get(requiredStatus) || 0)
    : 0;

  const report = {
    ok: failures === 0 && (requiredStatus ? requiredStatusCount > 0 : true),
    target: { url, method },
    requests,
    concurrency,
    durationMs,
    throughputRps: Number((requests / Math.max(durationMs / 1000, 0.001)).toFixed(2)),
    latencyMs: {
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      p99: percentile(latencies, 99),
      max: Math.max(0, ...latencies),
    },
    acceptedStatuses: Array.from(accepted).sort((a, b) => a - b),
    requiredStatus: requiredStatus || null,
    requiredStatusCount,
    statusCounts: Object.fromEntries(Array.from(statusCounts.entries()).sort((a, b) => a[0] - b[0])),
    failures,
    generatedAt: new Date().toISOString(),
  };

  await writeReport(reportPath, report);

  process.stdout.write(`Load test ${report.ok ? 'passed' : 'failed'}\n`);
  process.stdout.write(`${JSON.stringify(report)}\n`);

  if (!report.ok) {
    process.exit(1);
  }
}

main().catch((error) => {
  process.stderr.write(`load-capacity failed: ${String(error?.message || error)}\n`);
  process.exit(1);
});
