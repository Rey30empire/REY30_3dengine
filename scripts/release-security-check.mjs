import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'crypto';

const DEFAULT_TIMEOUT_MS = 12000;
const DEFAULT_RETRIES = 2;
const DEFAULT_RETRY_WAIT_MS = 1000;

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

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toBool(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).trim().toLowerCase() === 'true';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureBaseUrl(raw) {
  if (!raw || !raw.trim()) {
    throw new Error(
      'Missing base URL. Use --base-url or set RELEASE_BASE_URL/SMOKE_BASE_URL/DEPLOY_BASE_URL/VERCEL_URL.'
    );
  }
  const trimmed = raw.trim();
  const withProtocol = trimmed.startsWith('http://') || trimmed.startsWith('https://')
    ? trimmed
    : `https://${trimmed}`;
  return withProtocol.replace(/\/+$/, '');
}

function ensureOrigin(raw, fallbackUrl) {
  if (!raw || !raw.trim()) {
    return new URL(fallbackUrl).origin;
  }
  return new URL(raw.trim()).origin;
}

function ensurePath(raw, fallbackPath) {
  const value = String(raw || fallbackPath).trim();
  if (!value) return fallbackPath;
  return value.startsWith('/') ? value : `/${value}`;
}

function validateHeaders(response, expected) {
  for (const [header, validator] of Object.entries(expected)) {
    const value = response.headers.get(header);
    const result = validator(value || '');
    if (!result.ok) {
      return { ok: false, reason: `${header}: ${result.reason}` };
    }
  }
  return { ok: true };
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

async function runCheck(baseUrl, check, runtime) {
  const startedAt = Date.now();
  let lastError = null;

  for (let attempt = 1; attempt <= runtime.retries; attempt += 1) {
    try {
      const response = await fetchWithTimeout(`${baseUrl}${check.path}`, check.request, runtime.timeoutMs);
      const raw = await response.text();
      let payload = null;
      try {
        payload = raw ? JSON.parse(raw) : null;
      } catch {
        payload = raw;
      }

      const validation = check.validate({ response, payload, raw });
      if (!validation.ok) {
        throw new Error(validation.reason || 'validation_failed');
      }

      return {
        name: check.name,
        status: 'passed',
        attempts: attempt,
        httpStatus: response.status,
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      lastError = error;
      if (attempt < runtime.retries) {
        await sleep(runtime.retryWaitMs);
      }
    }
  }

  return {
    name: check.name,
    status: 'failed',
    attempts: runtime.retries,
    durationMs: Date.now() - startedAt,
    error: String(lastError?.message || lastError || 'unknown_error'),
  };
}

async function writeReportIfNeeded(reportPath, report) {
  if (!reportPath) return;
  const absolute = path.isAbsolute(reportPath)
    ? reportPath
    : path.join(process.cwd(), reportPath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, JSON.stringify(report, null, 2), 'utf8');
}

function includesToken(value, token) {
  return value
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .includes(token.toLowerCase());
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function hmacSha256Hex(value, secret) {
  return crypto.createHmac('sha256', secret).update(value, 'utf8').digest('hex');
}

function canonicalSignaturePayload(params) {
  return [
    params.method.toUpperCase(),
    params.path,
    params.timestamp,
    params.nonce,
    params.bodyHash,
  ].join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = ensureBaseUrl(
    args.get('base-url') ||
      process.env.RELEASE_BASE_URL ||
      process.env.SMOKE_BASE_URL ||
      process.env.DEPLOY_BASE_URL ||
      process.env.VERCEL_URL
  );
  const allowedOrigin = ensureOrigin(args.get('allowed-origin'), baseUrl);
  const blockedOrigin = ensureOrigin(args.get('blocked-origin') || 'https://evil.invalid', baseUrl);
  const expectHsts = toBool(args.get('expect-hsts') || process.env.RELEASE_EXPECT_HSTS, true);
  const integrationId = String(args.get('integration-id') || process.env.REY30_INTEGRATION_ID || '').trim();
  const integrationToken = String(args.get('integration-token') || process.env.REY30_INTEGRATION_TOKEN || '').trim();
  const integrationSecret = String(args.get('integration-secret') || process.env.REY30_INTEGRATION_SECRET || '').trim();
  const integrationPath = ensurePath(
    args.get('integration-path') ||
      process.env.REY30_INTEGRATION_ENDPOINT_PATH ||
      '/api/integrations/events',
    '/api/integrations/events'
  );
  const integrationEnabled = Boolean(integrationId && integrationToken && integrationSecret);

  const runtime = {
    timeoutMs: toNumber(args.get('timeout-ms') || process.env.RELEASE_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    retries: toNumber(args.get('retries') || process.env.RELEASE_RETRIES, DEFAULT_RETRIES),
    retryWaitMs: toNumber(
      args.get('retry-wait-ms') || process.env.RELEASE_RETRY_WAIT_MS,
      DEFAULT_RETRY_WAIT_MS
    ),
  };

  const checks = [
    {
      name: 'health-ready',
      path: '/api/health/ready',
      request: { method: 'GET', headers: { Accept: 'application/json' } },
      validate: ({ response, payload }) => {
        if (response.status !== 200) {
          return { ok: false, reason: `Expected 200, got ${response.status}` };
        }
        if (payload?.ok !== true || payload?.status !== 'ready') {
          return {
            ok: false,
            reason: `Expected ok=true and status=ready, got ${JSON.stringify(payload)}`,
          };
        }
        return { ok: true };
      },
    },
    {
      name: 'api-security-headers',
      path: '/api/health/live',
      request: { method: 'GET', headers: { Accept: 'application/json' } },
      validate: ({ response, payload }) => {
        if (response.status !== 200 || payload?.ok !== true) {
          return { ok: false, reason: `Expected 200 + ok=true, got ${response.status}` };
        }
        const expected = {
          'x-content-type-options': (value) => ({
            ok: value.toLowerCase() === 'nosniff',
            reason: `expected nosniff, got "${value}"`,
          }),
          'referrer-policy': (value) => ({
            ok: value.toLowerCase() === 'strict-origin-when-cross-origin',
            reason: `expected strict-origin-when-cross-origin, got "${value}"`,
          }),
          'x-frame-options': (value) => ({
            ok: value.toUpperCase() === 'DENY',
            reason: `expected DENY, got "${value}"`,
          }),
          'permissions-policy': (value) => ({
            ok: value.includes('camera=()'),
            reason: `expected camera=(), got "${value}"`,
          }),
          'cross-origin-resource-policy': (value) => ({
            ok: value.toLowerCase() === 'same-origin',
            reason: `expected same-origin, got "${value}"`,
          }),
          'cross-origin-opener-policy': (value) => ({
            ok: value.toLowerCase() === 'same-origin',
            reason: `expected same-origin, got "${value}"`,
          }),
          'content-security-policy': (value) => ({
            ok: value.includes("default-src 'none'"),
            reason: `expected API CSP, got "${value}"`,
          }),
        };
        const headerCheck = validateHeaders(response, expected);
        if (!headerCheck.ok) return headerCheck;

        if (expectHsts) {
          const hsts = response.headers.get('strict-transport-security') || '';
          if (!hsts.toLowerCase().includes('max-age=31536000')) {
            return { ok: false, reason: `strict-transport-security missing/invalid: "${hsts}"` };
          }
        }
        return { ok: true };
      },
    },
    {
      name: 'preflight-allowed-origin',
      path: '/api/auth/login',
      request: {
        method: 'OPTIONS',
        headers: {
          Origin: allowedOrigin,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'content-type',
        },
      },
      validate: ({ response }) => {
        if (response.status !== 204) {
          return { ok: false, reason: `Expected 204, got ${response.status}` };
        }
        const expected = {
          'access-control-allow-origin': (value) => ({
            ok: value === allowedOrigin,
            reason: `expected "${allowedOrigin}", got "${value}"`,
          }),
          'access-control-allow-credentials': (value) => ({
            ok: value.toLowerCase() === 'true',
            reason: `expected true, got "${value}"`,
          }),
          'access-control-allow-methods': (value) => ({
            ok: includesToken(value, 'POST'),
            reason: `expected POST in methods, got "${value}"`,
          }),
          vary: (value) => ({
            ok: includesToken(value, 'Origin'),
            reason: `expected Origin in Vary, got "${value}"`,
          }),
        };
        return validateHeaders(response, expected);
      },
    },
    {
      name: 'mutating-without-origin-blocked',
      path: '/api/auth/login',
      request: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      },
      validate: ({ response, payload }) => {
        if (response.status !== 403) {
          return { ok: false, reason: `Expected 403, got ${response.status}` };
        }
        const err = String(payload?.error || '');
        return {
          ok: err.toLowerCase().includes('forbidden'),
          reason: `Expected forbidden error payload, got "${JSON.stringify(payload)}"`,
        };
      },
    },
    {
      name: 'mutating-disallowed-origin-blocked',
      path: '/api/auth/login',
      request: {
        method: 'POST',
        headers: {
          Origin: blockedOrigin,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      },
      validate: ({ response }) => ({
        ok: response.status === 403,
        reason: `Expected 403 for disallowed origin, got ${response.status}`,
      }),
    },
    {
      name: 'mutating-allowed-origin-passes-origin-gate',
      path: '/api/auth/login',
      request: {
        method: 'POST',
        headers: {
          Origin: allowedOrigin,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      },
      validate: ({ response }) => {
        if (response.status === 403) {
          return { ok: false, reason: 'Origin gate still blocking allowed origin (403).' };
        }
        if (![400, 401].includes(response.status)) {
          return { ok: false, reason: `Expected 400/401 after passing origin gate, got ${response.status}` };
        }
        return { ok: true };
      },
    },
    {
      name: 'safe-get-without-origin-allowed',
      path: '/api/auth/session',
      request: { method: 'GET', headers: { Accept: 'application/json' } },
      validate: ({ response, payload }) => ({
        ok: response.status === 200 && typeof payload?.authenticated === 'boolean',
        reason: `Expected 200 and authenticated flag, got status=${response.status}`,
      }),
    },
  ];

  if (integrationEnabled) {
    const ts = String(Math.floor(Date.now() / 1000));
    const makeSignedRequest = (params) => {
      const body = JSON.stringify({
        eventType: 'security.release.check',
        source: 'release-security-check',
        payload: {
          check: params.name,
          at: new Date().toISOString(),
        },
      });
      const nonce = crypto.randomUUID();
      const bodyHash = sha256Hex(body);
      const canonical = canonicalSignaturePayload({
        method: 'POST',
        path: integrationPath,
        timestamp: ts,
        nonce,
        bodyHash,
      });
      const validSignature = hmacSha256Hex(canonical, integrationSecret);
      const signature = params.invalidSignature ? 'sha256=deadbeef' : `sha256=${validSignature}`;
      return {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${integrationToken}`,
          'Content-Type': 'application/json',
          'x-rey30-integration-id': integrationId,
          'x-rey30-timestamp': ts,
          'x-rey30-nonce': nonce,
          'x-rey30-signature': signature,
        },
        body,
      };
    };

    checks.push(
      {
        name: 'integration-signed-request-without-origin-allowed',
        path: integrationPath,
        request: makeSignedRequest({
          name: 'integration-signed-request-without-origin-allowed',
          invalidSignature: false,
        }),
        validate: ({ response, payload }) => ({
          ok: response.status === 200 && payload?.ok === true,
          reason: `Expected 200 + ok=true for signed integration request, got status=${response.status}`,
        }),
      },
      {
        name: 'integration-invalid-signature-rejected',
        path: integrationPath,
        request: makeSignedRequest({
          name: 'integration-invalid-signature-rejected',
          invalidSignature: true,
        }),
        validate: ({ response, payload }) => ({
          ok: response.status === 401 && payload?.code === 'invalid_signature',
          reason: `Expected 401 invalid_signature, got status=${response.status}, payload=${JSON.stringify(payload)}`,
        }),
      }
    );
  }

  process.stdout.write(`Running release security checks against ${baseUrl}\n`);
  process.stdout.write(`Allowed origin: ${allowedOrigin}\n`);
  process.stdout.write(`Blocked origin: ${blockedOrigin}\n`);
  process.stdout.write(`Integration checks: ${integrationEnabled ? 'enabled' : 'skipped (missing integration credentials)'}\n`);
  const results = [];

  for (const check of checks) {
    process.stdout.write(`- ${check.name}\n`);
    const result = await runCheck(baseUrl, check, runtime);
    results.push(result);
  }

  const failed = results.filter((item) => item.status === 'failed');
  const report = {
    ok: failed.length === 0,
    baseUrl,
    allowedOrigin,
    blockedOrigin,
    expectHsts,
    integrationEnabled,
    runtime,
    finishedAt: new Date().toISOString(),
    checks: results,
  };

  await writeReportIfNeeded(
    args.get('report-path') || process.env.RELEASE_REPORT_PATH || '',
    report
  );

  process.stdout.write('\nSecurity summary:\n');
  for (const result of results) {
    if (result.status === 'passed') {
      process.stdout.write(
        `  PASS ${result.name} status=${result.httpStatus} attempts=${result.attempts} duration=${result.durationMs}ms\n`
      );
    } else {
      process.stdout.write(
        `  FAIL ${result.name} attempts=${result.attempts} duration=${result.durationMs}ms error=${result.error}\n`
      );
    }
  }

  if (failed.length > 0) {
    process.stderr.write(`Release security checks failed: ${failed.map((item) => item.name).join(', ')}\n`);
    process.exit(1);
  }
}

main().catch((error) => {
  process.stderr.write(`release-security-check failed: ${String(error?.message || error)}\n`);
  process.exit(1);
});
