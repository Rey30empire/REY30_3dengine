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
    throw new Error('Missing base URL. Use --base-url or set USAGE_BASE_URL.');
  }
  const trimmed = raw.trim();
  const withProtocol =
    trimmed.startsWith('http://') || trimmed.startsWith('https://')
      ? trimmed
      : `https://${trimmed}`;
  return withProtocol.replace(/\/+$/, '');
}

function toBool(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const normalized = value.toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  return fallback;
}

async function writeReport(reportPath, payload) {
  if (!reportPath) return;
  const absolutePath = path.isAbsolute(reportPath)
    ? reportPath
    : path.join(process.cwd(), reportPath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, JSON.stringify(payload, null, 2), 'utf8');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = ensureBaseUrl(args.get('base-url') || process.env.USAGE_BASE_URL || '');
  const opsToken = args.get('ops-token') || process.env.REY30_OPS_TOKEN || '';
  const failOnWarning = toBool(args.get('fail-on-warning') || process.env.USAGE_FAIL_ON_WARNING, false);
  const period = args.get('period') || process.env.USAGE_PERIOD || '';
  const reportPath = args.get('report-path') || process.env.USAGE_REPORT_PATH || '';

  const requestUrl = `${baseUrl}/api/ops/usage/alerts${period ? `?period=${encodeURIComponent(period)}` : ''}`;
  const headers = { Accept: 'application/json' };
  if (opsToken) {
    headers['x-rey30-ops-token'] = opsToken;
  }

  const response = await fetch(requestUrl, {
    method: 'GET',
    headers,
    cache: 'no-store',
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Usage alert check failed with ${response.status}: ${JSON.stringify(payload)}`);
  }

  const blocked = Number(payload?.counts?.blocked || 0);
  const warning = Number(payload?.counts?.warning || 0);
  const shouldFail = blocked > 0 || (failOnWarning && warning > 0);

  const result = {
    ok: !shouldFail,
    period: payload?.period || period || 'current',
    counts: {
      blocked,
      warning,
      total: Number(payload?.counts?.total || 0),
    },
    failOnWarning,
    generatedAt: new Date().toISOString(),
    payload,
  };

  await writeReport(reportPath, result);
  process.stdout.write(`Usage alerts blocked=${blocked} warning=${warning} failOnWarning=${failOnWarning}\n`);
  process.stdout.write(`${JSON.stringify(result)}\n`);

  if (shouldFail) {
    process.exit(1);
  }
}

main().catch((error) => {
  process.stderr.write(`check-usage-alerts failed: ${String(error?.message || error)}\n`);
  process.exit(1);
});

