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

function ensureBaseUrl(raw) {
  if (!raw || !raw.trim()) {
    throw new Error('Missing base URL. Use --base-url or set OBS_BASE_URL.');
  }
  const trimmed = raw.trim();
  const withProtocol = trimmed.startsWith('http://') || trimmed.startsWith('https://')
    ? trimmed
    : `https://${trimmed}`;
  return withProtocol.replace(/\/+$/, '');
}

function bool(value) {
  return value === 'true' || value === '1' || value === 'yes';
}

async function writeReport(reportPath, report) {
  if (!reportPath) return;
  const absolutePath = path.isAbsolute(reportPath)
    ? reportPath
    : path.join(process.cwd(), reportPath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, JSON.stringify(report, null, 2), 'utf8');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = ensureBaseUrl(args.get('base-url') || process.env.OBS_BASE_URL);
  const opsToken = args.get('ops-token') || process.env.REY30_OPS_TOKEN || '';
  const failOnWarn = bool(args.get('fail-on-warn') || process.env.OBS_FAIL_ON_WARN || 'false');
  const reportPath = args.get('report-path') || process.env.OBS_REPORT_PATH || '';

  const headers = { Accept: 'application/json' };
  if (opsToken) {
    headers['x-rey30-ops-token'] = opsToken;
  }

  const response = await fetch(`${baseUrl}/api/ops/slo`, {
    method: 'GET',
    headers,
    cache: 'no-store',
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`SLO monitor failed with ${response.status}: ${text}`);
  }

  const payload = await response.json();
  const status = String(payload?.slo?.overallStatus || 'unknown');
  const activeAlerts = Array.isArray(payload?.slo?.alerts) ? payload.slo.alerts.length : 0;

  const report = {
    ok: status === 'ok' || (!failOnWarn && status === 'warn'),
    baseUrl,
    status,
    activeAlerts,
    generatedAt: new Date().toISOString(),
    payload,
  };

  await writeReport(reportPath, report);

  process.stdout.write(
    `SLO status=${status} activeAlerts=${activeAlerts} failOnWarn=${failOnWarn ? 'true' : 'false'}\n`
  );

  if (status === 'error' || (failOnWarn && status === 'warn')) {
    process.exit(1);
  }
}

main().catch((error) => {
  process.stderr.write(`monitor-slo failed: ${String(error?.message || error)}\n`);
  process.exit(1);
});

