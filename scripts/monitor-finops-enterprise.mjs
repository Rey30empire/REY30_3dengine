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

function toBool(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function ensureBaseUrl(raw) {
  if (!raw || !raw.trim()) {
    throw new Error('Missing base URL. Use --base-url or FINOPS_BASE_URL');
  }
  const trimmed = raw.trim();
  const withProtocol =
    trimmed.startsWith('http://') || trimmed.startsWith('https://')
      ? trimmed
      : `https://${trimmed}`;
  return withProtocol.replace(/\/+$/, '');
}

async function writeReport(reportPath, payload) {
  if (!reportPath) return;
  const absolutePath = path.isAbsolute(reportPath)
    ? reportPath
    : path.join(process.cwd(), reportPath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, JSON.stringify(payload, null, 2), 'utf8');
}

async function sendWebhook(webhookUrl, payload) {
  if (!webhookUrl) return;
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Webhook failed (${response.status}): ${body}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = ensureBaseUrl(args.get('base-url') || process.env.FINOPS_BASE_URL || '');
  const opsToken = args.get('ops-token') || process.env.REY30_OPS_TOKEN || '';
  const period = args.get('period') || process.env.FINOPS_PERIOD || '';
  const months = Number(args.get('months') || process.env.FINOPS_MONTHS || 6);
  const reportPath = args.get('report-path') || process.env.FINOPS_REPORT_PATH || '';
  const webhookUrl = args.get('webhook-url') || process.env.ALERT_WEBHOOK_URL || '';
  const failOnCritical = toBool(args.get('fail-on-critical') || process.env.FINOPS_FAIL_ON_CRITICAL, true);
  const failOnHigh = toBool(args.get('fail-on-high') || process.env.FINOPS_FAIL_ON_HIGH, false);
  const failOnWarning = toBool(args.get('fail-on-warning') || process.env.FINOPS_FAIL_ON_WARNING, false);
  const failOnPending = toBool(args.get('fail-on-pending') || process.env.FINOPS_FAIL_ON_PENDING, false);

  const endpoint =
    `${baseUrl}/api/ops/usage/enterprise` +
    `?months=${encodeURIComponent(String(Number.isFinite(months) ? months : 6))}` +
    (period ? `&period=${encodeURIComponent(period)}` : '');
  const incidentsEndpoint =
    `${baseUrl}/api/ops/usage/incidents` +
    `?months=${encodeURIComponent(String(Number.isFinite(months) ? months : 6))}` +
    (period ? `&period=${encodeURIComponent(period)}` : '');

  const headers = { Accept: 'application/json' };
  if (opsToken) headers['x-rey30-ops-token'] = opsToken;

  const [response, incidentsResponse] = await Promise.all([
    fetch(endpoint, {
      method: 'GET',
      headers,
      cache: 'no-store',
    }),
    fetch(incidentsEndpoint, {
      method: 'GET',
      headers,
      cache: 'no-store',
    }),
  ]);

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Enterprise FinOps endpoint failed ${response.status}: ${JSON.stringify(payload)}`);
  }
  const incidentsPayload = await incidentsResponse.json().catch(() => ({}));
  if (!incidentsResponse.ok) {
    throw new Error(
      `Enterprise FinOps incidents endpoint failed ${incidentsResponse.status}: ${JSON.stringify(incidentsPayload)}`
    );
  }

  const critical = Number(payload?.totals?.criticalAlerts || 0);
  const warning = Number(payload?.totals?.warningAlerts || 0);
  const pending = Number(payload?.totals?.pendingApprovals || 0);
  const incidentCritical = Number(incidentsPayload?.totals?.critical || 0);
  const incidentHigh = Number(incidentsPayload?.totals?.high || 0);

  const shouldFail =
    (failOnCritical && (critical > 0 || incidentCritical > 0)) ||
    (failOnHigh && incidentHigh > 0) ||
    (failOnWarning && warning > 0) ||
    (failOnPending && pending > 0);

  const report = {
    ok: !shouldFail,
    period: payload?.period || period || 'current',
    months: payload?.months || months,
    totals: {
      critical,
      warning,
      pending,
      users: Number(payload?.totals?.users || 0),
      monthlySpendUsd: Number(payload?.totals?.monthlySpendUsd || 0),
    },
    incidents: {
      critical: incidentCritical,
      high: incidentHigh,
      medium: Number(incidentsPayload?.totals?.medium || 0),
      low: Number(incidentsPayload?.totals?.low || 0),
      total: Number(incidentsPayload?.totals?.incidents || 0),
    },
    failPolicy: {
      failOnCritical,
      failOnHigh,
      failOnWarning,
      failOnPending,
    },
    generatedAt: new Date().toISOString(),
    payload,
    incidentsPayload,
  };

  await writeReport(reportPath, report);

  process.stdout.write(
    `FinOps enterprise monitor critical=${critical} warning=${warning} pending=${pending} incidentHigh=${incidentHigh}\n`
  );
  process.stdout.write(`${JSON.stringify(report)}\n`);

  if (shouldFail && webhookUrl) {
    await sendWebhook(webhookUrl, {
      source: 'rey30-finops-enterprise-monitor',
      severity: critical > 0 || incidentCritical > 0 ? 'critical' : 'warning',
      message:
        `FinOps monitor detected incidents.` +
        ` critical=${critical} warning=${warning} pendingApprovals=${pending} incidentHigh=${incidentHigh}`,
      period: report.period,
      generatedAt: report.generatedAt,
    });
  }

  if (shouldFail) {
    process.exit(1);
  }
}

main().catch((error) => {
  process.stderr.write(`monitor-finops-enterprise failed: ${String(error?.message || error)}\n`);
  process.exit(1);
});
