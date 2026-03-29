import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

function parseArgs(argv) {
  const map = new Map();
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith('--')) {
      positional.push(item);
      continue;
    }
    const key = item.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      map.set(key, 'true');
      continue;
    }
    map.set(key, next);
    i += 1;
  }
  return { map, positional };
}

function ensureBaseUrl(raw) {
  if (!raw || !raw.trim()) {
    throw new Error('Missing base URL. Use --base-url or set BACKUP_BASE_URL.');
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

async function callJson(baseUrl, endpoint, method, opsToken, body) {
  const headers = {
    Accept: 'application/json',
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
  if (!response.ok) {
    throw new Error(`Request ${endpoint} failed with ${response.status}: ${JSON.stringify(payload)}`);
  }

  return payload;
}

async function main() {
  const { map: args, positional } = parseArgs(process.argv.slice(2));
  const command = positional[0] || 'list';
  const baseUrl = ensureBaseUrl(args.get('base-url') || process.env.BACKUP_BASE_URL || '');
  const opsToken = args.get('ops-token') || process.env.REY30_OPS_TOKEN || '';
  const reportPath = args.get('report-path') || '';

  let payload;
  switch (command) {
    case 'create':
      payload = await callJson(baseUrl, '/api/ops/backups', 'POST', opsToken, {
        note: args.get('note') || process.env.BACKUP_NOTE || 'scheduled backup',
      });
      break;
    case 'list':
      payload = await callJson(baseUrl, '/api/ops/backups', 'GET', opsToken);
      break;
    case 'verify':
      payload = await callJson(baseUrl, '/api/ops/backups/verify', 'POST', opsToken, {
        backupId: args.get('backup-id') || '',
      });
      break;
    case 'restore-dry-run':
      payload = await callJson(baseUrl, '/api/ops/backups/restore', 'POST', opsToken, {
        backupId: args.get('backup-id') || '',
        dryRun: true,
      });
      break;
    default:
      throw new Error(`Unknown command "${command}". Use create|list|verify|restore-dry-run`);
  }

  await writeReport(reportPath, payload);
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

main().catch((error) => {
  process.stderr.write(`ops-backup-client failed: ${String(error?.message || error)}\n`);
  process.exit(1);
});
