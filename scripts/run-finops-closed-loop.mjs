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
  const reportPath = args.get('report-path') || process.env.FINOPS_CLOSED_LOOP_REPORT_PATH || '';
  const webhookUrl = args.get('webhook-url') || process.env.ALERT_WEBHOOK_URL || '';
  const dryRun = toBool(args.get('dry-run') || process.env.FINOPS_CLOSED_LOOP_DRY_RUN, true);
  const force = toBool(args.get('force') || process.env.FINOPS_CLOSED_LOOP_FORCE, false);
  const maxActions = Number(args.get('max-actions') || process.env.FINOPS_CLOSED_LOOP_MAX_ACTIONS || 0);
  const failOnFailedActions = toBool(
    args.get('fail-on-failed-actions') || process.env.FINOPS_FAIL_ON_FAILED_ACTIONS,
    true
  );

  const endpoint = `${baseUrl}/api/ops/usage/closed-loop`;
  const headers = {
    'content-type': 'application/json',
    Accept: 'application/json',
    origin: baseUrl,
  };
  if (opsToken) headers['x-rey30-ops-token'] = opsToken;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      period: period || undefined,
      months: Number.isFinite(months) && months > 0 ? months : 6,
      dryRun,
      force,
      maxActions: Number.isFinite(maxActions) && maxActions > 0 ? maxActions : undefined,
    }),
    cache: 'no-store',
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Closed-loop endpoint failed ${response.status}: ${JSON.stringify(payload)}`);
  }

  const failed = Number(payload?.actionsFailed || 0);
  const applied = Number(payload?.actionsApplied || 0);
  const skipped = Number(payload?.actionsSkipped || 0);
  const planned = Number(payload?.actionsPlanned || 0);
  const shouldFail = failOnFailedActions && failed > 0;

  const report = {
    ok: !shouldFail,
    dryRun,
    force,
    period: payload?.period || period || 'current',
    actions: {
      planned,
      applied,
      skipped,
      failed,
    },
    control: payload?.control || null,
    generatedAt: new Date().toISOString(),
    payload,
  };

  await writeReport(reportPath, report);

  process.stdout.write(
    `FinOps closed-loop planned=${planned} applied=${applied} skipped=${skipped} failed=${failed} dryRun=${dryRun}\n`
  );
  process.stdout.write(`${JSON.stringify(report)}\n`);

  if (shouldFail && webhookUrl) {
    await sendWebhook(webhookUrl, {
      source: 'rey30-finops-closed-loop',
      severity: 'critical',
      message: `Closed-loop execution reported failed actions (${failed}).`,
      period: report.period,
      generatedAt: report.generatedAt,
    });
  }

  if (shouldFail) {
    process.exit(1);
  }
}

main().catch((error) => {
  process.stderr.write(`run-finops-closed-loop failed: ${String(error?.message || error)}\n`);
  process.exit(1);
});
