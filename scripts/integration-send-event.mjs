import crypto from 'crypto';
import { readFile } from 'node:fs/promises';

const DEFAULT_ENDPOINT_PATH = '/api/integrations/events';
const DEFAULT_TIMEOUT_MS = 15000;

function parseArgs(argv) {
  const map = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current.startsWith('--')) continue;
    const key = current.slice(2);
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

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).trim().toLowerCase() === 'true';
}

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function ensureBaseUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) {
    throw new Error('Missing base URL. Use --base-url or set RELEASE_BASE_URL/SMOKE_BASE_URL.');
  }
  const withProtocol = value.startsWith('http://') || value.startsWith('https://')
    ? value
    : `https://${value}`;
  return withProtocol.replace(/\/+$/, '');
}

function ensureEndpointPath(raw) {
  const value = String(raw || DEFAULT_ENDPOINT_PATH).trim();
  if (!value) return DEFAULT_ENDPOINT_PATH;
  return value.startsWith('/') ? value : `/${value}`;
}

function requireValue(name, value) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    throw new Error(`Missing required value: ${name}`);
  }
  return normalized;
}

function parseJsonString(label, value) {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
}

async function resolvePayload(args) {
  const payloadJson = args.get('payload-json') || '';
  const payloadFile = args.get('payload-file') || '';
  if (payloadJson && payloadFile) {
    throw new Error('Use only one of --payload-json or --payload-file.');
  }
  if (payloadJson) {
    return parseJsonString('payload-json', payloadJson);
  }
  if (payloadFile) {
    const raw = await readFile(payloadFile, 'utf8');
    return parseJsonString('payload-file', raw);
  }
  return {};
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function hmacSha256Hex(value, secret) {
  return crypto.createHmac('sha256', secret).update(value, 'utf8').digest('hex');
}

function buildCanonicalPayload(params) {
  return [
    'POST',
    params.path,
    params.timestamp,
    params.nonce,
    params.bodyHash,
  ].join('\n');
}

function maybeMask(value, show) {
  if (show) return value;
  if (!value) return '';
  if (value.length <= 8) return '****';
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      cache: 'no-store',
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const showSecrets = toBool(args.get('show-secrets'), false);
  const dryRun = toBool(args.get('dry-run'), false);
  const timeoutMs = toNumber(args.get('timeout-ms') || process.env.INTEGRATION_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);

  const baseUrl = ensureBaseUrl(
    args.get('base-url') ||
      process.env.RELEASE_BASE_URL ||
      process.env.SMOKE_BASE_URL
  );
  const endpointPath = ensureEndpointPath(args.get('endpoint-path') || process.env.REY30_INTEGRATION_ENDPOINT_PATH);

  const integrationId = requireValue(
    'integration-id',
    args.get('integration-id') || process.env.REY30_INTEGRATION_ID
  );
  const token = requireValue(
    'token',
    args.get('token') || process.env.REY30_INTEGRATION_TOKEN
  );
  const secret = requireValue(
    'secret',
    args.get('secret') || process.env.REY30_INTEGRATION_SECRET
  );

  const eventType = requireValue(
    'event-type',
    args.get('event-type') || process.env.REY30_INTEGRATION_EVENT_TYPE || 'integration.ping'
  );
  const source = String(args.get('source') || process.env.REY30_INTEGRATION_EVENT_SOURCE || 'backend').trim();
  const idempotencyKey = String(args.get('idempotency-key') || '').trim();
  const nonce = String(args.get('nonce') || crypto.randomUUID()).trim();
  const timestamp = String(
    args.get('timestamp') || Math.floor(Date.now() / 1000)
  ).trim();
  const signaturePrefix = String(args.get('signature-prefix') || 'sha256').trim().toLowerCase();

  const payload = await resolvePayload(args);
  const bodyObject = {
    eventType,
    source,
    payload,
    ...(idempotencyKey ? { idempotencyKey } : {}),
  };
  const body = JSON.stringify(bodyObject);
  const bodyHash = sha256Hex(body);
  const canonical = buildCanonicalPayload({
    path: endpointPath,
    timestamp,
    nonce,
    bodyHash,
  });
  const signatureRaw = hmacSha256Hex(canonical, secret);
  const signature = signaturePrefix ? `${signaturePrefix}=${signatureRaw}` : signatureRaw;

  const requestSummary = {
    baseUrl,
    endpointPath,
    integrationId,
    token: maybeMask(token, showSecrets),
    secret: maybeMask(secret, showSecrets),
    timestamp,
    nonce,
    bodyHash,
    signature: maybeMask(signature, showSecrets),
    dryRun,
  };

  process.stdout.write(`Integration request summary:\n${JSON.stringify(requestSummary, null, 2)}\n`);
  process.stdout.write(`Request body:\n${body}\n`);

  if (dryRun) {
    process.stdout.write('Dry run enabled. Request was not sent.\n');
    return;
  }

  const url = `${baseUrl}${endpointPath}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'x-rey30-integration-id': integrationId,
    'x-rey30-timestamp': timestamp,
    'x-rey30-nonce': nonce,
    'x-rey30-signature': signature,
  };

  const response = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers,
      body,
    },
    timeoutMs
  );

  const responseText = await response.text();
  let payloadResponse = responseText;
  try {
    payloadResponse = JSON.parse(responseText || '{}');
  } catch {
    payloadResponse = responseText;
  }

  process.stdout.write(`Response status: ${response.status}\n`);
  process.stdout.write(`Response body:\n${typeof payloadResponse === 'string' ? payloadResponse : JSON.stringify(payloadResponse, null, 2)}\n`);

  if (!response.ok) {
    process.exit(1);
  }
}

main().catch((error) => {
  process.stderr.write(`integration-send-event failed: ${String(error?.message || error)}\n`);
  process.exit(1);
});
