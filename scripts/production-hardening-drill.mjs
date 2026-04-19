import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

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
  return `Run the production hardening drill: load probe + backup verify + restore dry-run.

Usage:
  node scripts/production-hardening-drill.mjs --base-url https://app.example.com --ops-token TOKEN

Options:
  --base-url       App base URL. Env: HARDENING_BASE_URL.
  --ops-token      Ops token for protected ops endpoints. Env: REY30_OPS_TOKEN.
  --skip-load      Skip load-capacity step.
  --skip-backup    Skip backup/restore dry-run step.
  --requests       Load requests. Default 120.
  --concurrency    Load concurrency. Default 12.
  --timeout-ms      Per-request load timeout. Default 8000.
  --report-path    Drill report path. Default output/production-hardening-drill/report.json.
`;
}

function ensureBaseUrl(raw) {
  if (!raw || !raw.trim()) {
    throw new Error('Missing --base-url or HARDENING_BASE_URL.');
  }
  const trimmed = raw.trim();
  const withProtocol =
    trimmed.startsWith('http://') || trimmed.startsWith('https://')
      ? trimmed
      : `https://${trimmed}`;
  return withProtocol.replace(/\/+$/, '');
}

function toPositiveInt(raw, fallback) {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

async function writeReport(reportPath, payload) {
  const absolute = path.isAbsolute(reportPath)
    ? reportPath
    : path.join(process.cwd(), reportPath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, JSON.stringify(payload, null, 2), 'utf8');
}

function runNodeScript(scriptPath, args) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
      process.stdout.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
      process.stderr.write(chunk);
    });
    child.on('exit', (code) => {
      resolve({ ok: code === 0, code, stdout, stderr });
    });
  });
}

async function callJson(baseUrl, endpoint, method, opsToken, body) {
  const headers = {
    accept: 'application/json',
    origin: baseUrl,
  };
  if (opsToken) headers['x-rey30-ops-token'] = opsToken;
  if (body) headers['content-type'] = 'application/json';

  const response = await fetch(`${baseUrl}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, payload };
}

function parseLastJsonLine(stdout) {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .reverse();
  for (const line of lines) {
    if (!line.startsWith('{')) continue;
    try {
      return JSON.parse(line);
    } catch {
      // keep scanning
    }
  }
  return null;
}

async function runLoadDrill(params) {
  const reportPath = path.join('output', 'production-hardening-drill', 'load-capacity.json');
  const result = await runNodeScript(path.join('scripts', 'load-capacity.mjs'), [
    '--base-url',
    params.baseUrl,
    '--endpoint',
    params.endpoint,
    '--requests',
    String(params.requests),
    '--concurrency',
    String(params.concurrency),
    '--timeout-ms',
    String(params.timeoutMs),
    '--accepted-statuses',
    params.acceptedStatuses,
    '--report-path',
    reportPath,
  ]);
  return {
    ok: result.ok,
    code: result.code,
    reportPath,
    report: parseLastJsonLine(result.stdout),
  };
}

async function runBackupDrill(params) {
  const created = await callJson(params.baseUrl, '/api/ops/backups', 'POST', params.opsToken, {
    note: `production hardening drill ${new Date().toISOString()}`,
  });
  const backupId = created.payload?.backup?.backupId || created.payload?.backupId || '';
  const verified = backupId
    ? await callJson(params.baseUrl, '/api/ops/backups/verify', 'POST', params.opsToken, {
        backupId,
      })
    : { ok: false, status: 0, payload: { error: 'backupId missing after create' } };
  const restoreDryRun = backupId
    ? await callJson(params.baseUrl, '/api/ops/backups/restore', 'POST', params.opsToken, {
        backupId,
        dryRun: true,
      })
    : { ok: false, status: 0, payload: { error: 'backupId missing after create' } };

  return {
    ok: created.ok && verified.ok && restoreDryRun.ok,
    backupId,
    created,
    verified,
    restoreDryRun,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.has('help') || args.has('h')) {
    process.stdout.write(help());
    return;
  }

  const baseUrl = ensureBaseUrl(args.get('base-url') || process.env.HARDENING_BASE_URL || '');
  const opsToken = args.get('ops-token') || process.env.REY30_OPS_TOKEN || '';
  const reportPath =
    args.get('report-path') ||
    process.env.HARDENING_REPORT_PATH ||
    'output/production-hardening-drill/report.json';
  const requests = toPositiveInt(args.get('requests') || process.env.HARDENING_LOAD_REQUESTS, 120);
  const concurrency = toPositiveInt(
    args.get('concurrency') || process.env.HARDENING_LOAD_CONCURRENCY,
    12
  );
  const timeoutMs = toPositiveInt(
    args.get('timeout-ms') || process.env.HARDENING_LOAD_TIMEOUT_MS,
    8000
  );
  const endpoint = args.get('endpoint') || process.env.HARDENING_LOAD_ENDPOINT || '/api/health/live';
  const acceptedStatuses =
    args.get('accepted-statuses') || process.env.HARDENING_LOAD_ACCEPTED_STATUSES || '200';

  const load = args.has('skip-load')
    ? { ok: true, skipped: true }
    : await runLoadDrill({ baseUrl, endpoint, requests, concurrency, timeoutMs, acceptedStatuses });
  const backup = args.has('skip-backup')
    ? { ok: true, skipped: true }
    : await runBackupDrill({ baseUrl, opsToken });

  const report = {
    ok: Boolean(load.ok && backup.ok),
    generatedAt: new Date().toISOString(),
    baseUrl,
    load,
    backup,
  };
  await writeReport(reportPath, report);
  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (!report.ok) process.exit(1);
}

main().catch((error) => {
  process.stderr.write(`production-hardening-drill failed: ${String(error?.message || error)}\n`);
  process.exit(1);
});
