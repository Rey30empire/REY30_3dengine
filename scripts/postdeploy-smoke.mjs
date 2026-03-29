import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadWorkspaceEnv } from './env-utils.mjs';

const DEFAULT_TIMEOUT_MS = 12000;
const DEFAULT_RETRIES = 3;
const DEFAULT_RETRY_WAIT_MS = 2000;
const CSRF_COOKIE_NAME = 'rey30_csrf';

loadWorkspaceEnv();

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toBoolean(value) {
  if (value === undefined || value === null) return false;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function ensureBaseUrl(raw) {
  if (!raw || !raw.trim()) {
    throw new Error(
      'Missing base URL. Use --base-url or set SMOKE_BASE_URL/PRODUCTION_BASE_URL/DEPLOY_BASE_URL/VERCEL_URL.'
    );
  }

  const trimmed = raw.trim();
  const withProtocol = trimmed.startsWith('http://') || trimmed.startsWith('https://')
    ? trimmed
    : `https://${trimmed}`;
  return withProtocol.replace(/\/+$/, '');
}

function checkConfiguredFlag(payload) {
  return Object.prototype.hasOwnProperty.call(payload || {}, 'configured');
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidCsrfToken(value) {
  return /^[a-f0-9]{64}$/i.test(String(value || '').trim());
}

function splitSetCookieHeader(value) {
  if (!value) return [];
  return value
    .split(/,(?=\s*[A-Za-z0-9!#$%&'*+.^_`|~-]+=)/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getSetCookieHeaders(response) {
  if (typeof response.headers.getSetCookie === 'function') {
    return response.headers.getSetCookie();
  }
  const combined = response.headers.get('set-cookie');
  return splitSetCookieHeader(combined);
}

function updateCookieJar(cookieJar, response) {
  const values = getSetCookieHeaders(response);
  for (const cookie of values) {
    const firstPart = cookie.split(';', 1)[0] || '';
    const separatorIndex = firstPart.indexOf('=');
    if (separatorIndex <= 0) continue;
    const name = firstPart.slice(0, separatorIndex).trim();
    const value = firstPart.slice(separatorIndex + 1).trim();
    if (!name) continue;
    if (!value) {
      cookieJar.delete(name);
      continue;
    }
    cookieJar.set(name, value);
  }
}

function buildCookieHeader(cookieJar) {
  return Array.from(cookieJar.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

function getCookie(cookieJar, name) {
  return cookieJar.get(name) || '';
}

async function fetchWithTimeout(url, options, timeoutMs, cookieJar) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = new Headers(options?.headers || {});
    if (cookieJar && cookieJar.size > 0 && !headers.has('cookie')) {
      headers.set('cookie', buildCookieHeader(cookieJar));
    }

    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
      cache: 'no-store',
    });

    if (cookieJar) {
      updateCookieJar(cookieJar, response);
    }

    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function parseResponsePayload(response, accept) {
  const text = await response.text();
  if (accept === 'application/json') {
    return JSON.parse(text || '{}');
  }
  return text;
}

function passResult(name, pathName, startedAt, attempt, httpStatus) {
  return {
    name,
    path: pathName,
    status: 'passed',
    attempts: attempt,
    httpStatus,
    durationMs: Date.now() - startedAt,
  };
}

function failResult(name, pathName, startedAt, attempts, error) {
  return {
    name,
    path: pathName,
    status: 'failed',
    attempts,
    durationMs: Date.now() - startedAt,
    error: String(error || 'unknown_error'),
  };
}

function skippedResult(name, pathName, reason) {
  return {
    name,
    path: pathName,
    status: 'skipped',
    attempts: 0,
    durationMs: 0,
    reason,
  };
}

async function runCheck(baseUrl, check, runtime) {
  const startedAt = Date.now();
  let lastError = null;

  for (let attempt = 1; attempt <= runtime.retries; attempt += 1) {
    try {
      const response = await fetchWithTimeout(
        `${baseUrl}${check.path}`,
        { method: 'GET', headers: { Accept: check.accept } },
        runtime.timeoutMs
      );

      if (!check.expectedStatus.includes(response.status)) {
        throw new Error(`Unexpected status ${response.status}. Expected ${check.expectedStatus.join(', ')}`);
      }

      const payload = await parseResponsePayload(response, check.accept);
      const validation = check.validate(payload);
      if (!validation.ok) {
        throw new Error(validation.reason);
      }

      return passResult(check.name, check.path, startedAt, attempt, response.status);
    } catch (error) {
      lastError = error;
      if (attempt < runtime.retries) {
        await sleep(runtime.retryWaitMs);
      }
    }
  }

  return failResult(check.name, check.path, startedAt, runtime.retries, lastError);
}

async function fetchJson(baseUrl, pathName, options, runtime, cookieJar) {
  const response = await fetchWithTimeout(
    `${baseUrl}${pathName}`,
    options,
    runtime.timeoutMs,
    cookieJar
  );
  const payload = await parseResponsePayload(response, 'application/json');
  return { response, payload };
}

async function runAuthenticatedFlow(baseUrl, runtime, args) {
  const email = normalizeEmail(args.get('smoke-email') || process.env.SMOKE_USER_EMAIL);
  const password = String(args.get('smoke-password') || process.env.SMOKE_USER_PASSWORD || '');
  const origin = new URL(baseUrl).origin;
  const requireAuth = toBoolean(
    args.get('require-authenticated-flow') ?? process.env.SMOKE_REQUIRE_AUTHENTICATED_FLOW
  );

  if (!email || !password) {
    if (requireAuth) {
      return [
        failResult(
          'auth-login',
          '/api/auth/login',
          Date.now(),
          0,
          'Authenticated smoke requires SMOKE_USER_EMAIL and SMOKE_USER_PASSWORD.'
        ),
      ];
    }
    return [
      skippedResult(
        'auth-flow',
        '/api/auth/login',
        'No authenticated smoke credentials configured.'
      ),
    ];
  }

  const cookieJar = new Map();
  const results = [];

  const loginStartedAt = Date.now();
  try {
    const { response, payload } = await fetchJson(
      baseUrl,
      '/api/auth/login',
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Origin: origin,
        },
        body: JSON.stringify({ email, password }),
      },
      runtime,
      cookieJar
    );

    if (response.status !== 200 || payload?.success !== true) {
      throw new Error(`Login failed: status=${response.status} payload=${JSON.stringify(payload)}`);
    }

    results.push(passResult('auth-login', '/api/auth/login', loginStartedAt, 1, response.status));
  } catch (error) {
    results.push(failResult('auth-login', '/api/auth/login', loginStartedAt, 1, error));
    return results;
  }

  const sessionStartedAt = Date.now();
  let usagePolicy = null;
  try {
    const { response, payload } = await fetchJson(
      baseUrl,
      '/api/auth/session',
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
      },
      runtime,
      cookieJar
    );

    if (response.status !== 200 || payload?.authenticated !== true) {
      throw new Error(`Session not authenticated: status=${response.status} payload=${JSON.stringify(payload)}`);
    }
    if (normalizeEmail(payload?.user?.email) !== email) {
      throw new Error(`Authenticated user mismatch: expected ${email}, got ${payload?.user?.email || 'unknown'}`);
    }
    if (!isValidCsrfToken(getCookie(cookieJar, CSRF_COOKIE_NAME))) {
      throw new Error('Missing CSRF cookie after authenticated session check.');
    }

    results.push(passResult('auth-session-authenticated', '/api/auth/session', sessionStartedAt, 1, response.status));
  } catch (error) {
    results.push(failResult('auth-session-authenticated', '/api/auth/session', sessionStartedAt, 1, error));
    return results;
  }

  const usageReadStartedAt = Date.now();
  try {
    const { response, payload } = await fetchJson(
      baseUrl,
      '/api/user/usage-policy',
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
      },
      runtime,
      cookieJar
    );

    if (response.status !== 200 || typeof payload?.policy?.monthlyBudgetUsd !== 'number') {
      throw new Error(`Usage policy read failed: status=${response.status} payload=${JSON.stringify(payload)}`);
    }

    usagePolicy = payload.policy;
    results.push(passResult('usage-policy-read', '/api/user/usage-policy', usageReadStartedAt, 1, response.status));
  } catch (error) {
    results.push(failResult('usage-policy-read', '/api/user/usage-policy', usageReadStartedAt, 1, error));
    return results;
  }

  const usageWriteStartedAt = Date.now();
  try {
    const csrfToken = getCookie(cookieJar, CSRF_COOKIE_NAME);
    if (!isValidCsrfToken(csrfToken)) {
      throw new Error('Missing valid CSRF token before authenticated mutation.');
    }

    const { response, payload } = await fetchJson(
      baseUrl,
      '/api/user/usage-policy',
      {
        method: 'PUT',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'x-rey30-csrf': csrfToken,
          Origin: origin,
        },
        body: JSON.stringify({
          monthlyBudgetUsd: usagePolicy.monthlyBudgetUsd,
          hardStopEnabled: usagePolicy.hardStopEnabled,
          warningThresholdRatio: usagePolicy.warningThresholdRatio,
          perProviderBudgets: usagePolicy.perProviderBudgets,
        }),
      },
      runtime,
      cookieJar
    );

    if (response.status !== 200 || typeof payload?.policy?.monthlyBudgetUsd !== 'number') {
      throw new Error(`Usage policy write failed: status=${response.status} payload=${JSON.stringify(payload)}`);
    }

    results.push(passResult('usage-policy-write', '/api/user/usage-policy', usageWriteStartedAt, 1, response.status));
  } catch (error) {
    results.push(failResult('usage-policy-write', '/api/user/usage-policy', usageWriteStartedAt, 1, error));
  }

  return results;
}

async function writeReportIfNeeded(reportPath, report) {
  if (!reportPath) return;
  const absolutePath = path.isAbsolute(reportPath)
    ? reportPath
    : path.join(process.cwd(), reportPath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, JSON.stringify(report, null, 2), 'utf8');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const allowSelfSigned = toBoolean(
    args.get('allow-self-signed') || process.env.SMOKE_ALLOW_SELF_SIGNED
  );

  if (allowSelfSigned) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  }

  const baseUrl = ensureBaseUrl(
    args.get('base-url') ||
      process.env.SMOKE_BASE_URL ||
      process.env.PRODUCTION_BASE_URL ||
      process.env.DEPLOY_BASE_URL ||
      process.env.VERCEL_URL
  );

  const runtime = {
    timeoutMs: toNumber(args.get('timeout-ms') || process.env.SMOKE_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    retries: toNumber(args.get('retries') || process.env.SMOKE_RETRIES, DEFAULT_RETRIES),
    retryWaitMs: toNumber(
      args.get('retry-wait-ms') || process.env.SMOKE_RETRY_WAIT_MS,
      DEFAULT_RETRY_WAIT_MS
    ),
  };

  const checks = [
    {
      name: 'home',
      path: '/',
      accept: 'text/html',
      expectedStatus: [200],
      validate: (payload) => ({
        ok: typeof payload === 'string' && payload.includes('<html'),
        reason: 'Home route did not return HTML document.',
      }),
    },
    {
      name: 'health-live',
      path: '/api/health/live',
      accept: 'application/json',
      expectedStatus: [200],
      validate: (payload) => ({
        ok: payload?.ok === true && payload?.status === 'live',
        reason: 'Liveness payload is invalid.',
      }),
    },
    {
      name: 'health-ready',
      path: '/api/health/ready',
      accept: 'application/json',
      expectedStatus: [200],
      validate: (payload) => ({
        ok: payload?.ok === true && payload?.status === 'ready',
        reason: `Readiness payload is invalid: ${JSON.stringify(payload)}`,
      }),
    },
    {
      name: 'auth-session',
      path: '/api/auth/session',
      accept: 'application/json',
      expectedStatus: [200],
      validate: (payload) => ({
        ok: typeof payload?.authenticated === 'boolean',
        reason: 'Session payload missing authenticated boolean.',
      }),
    },
    {
      name: 'openai-status',
      path: '/api/openai',
      accept: 'application/json',
      expectedStatus: [200],
      validate: (payload) => ({
        ok: checkConfiguredFlag(payload),
        reason: 'OpenAI status payload missing configured flag.',
      }),
    },
    {
      name: 'meshy-status',
      path: '/api/meshy',
      accept: 'application/json',
      expectedStatus: [200],
      validate: (payload) => ({
        ok: checkConfiguredFlag(payload),
        reason: 'Meshy status payload missing configured flag.',
      }),
    },
    {
      name: 'runway-status',
      path: '/api/runway',
      accept: 'application/json',
      expectedStatus: [200],
      validate: (payload) => ({
        ok: checkConfiguredFlag(payload),
        reason: 'Runway status payload missing configured flag.',
      }),
    },
  ];

  process.stdout.write(`Running post-deploy smoke checks against ${baseUrl}\n`);
  const results = [];

  for (const check of checks) {
    process.stdout.write(`- ${check.name} (${check.path})\n`);
    const result = await runCheck(baseUrl, check, runtime);
    results.push(result);
  }

  process.stdout.write('- authenticated-flow (/api/auth/login -> /api/user/usage-policy)\n');
  const authResults = await runAuthenticatedFlow(baseUrl, runtime, args);
  results.push(...authResults);

  const failed = results.filter((item) => item.status === 'failed');
  const skipped = results.filter((item) => item.status === 'skipped');
  const report = {
    ok: failed.length === 0,
    baseUrl,
    startedAt: new Date().toISOString(),
    allowSelfSigned,
    runtime,
    authenticatedFlow: {
      required: toBoolean(
        args.get('require-authenticated-flow') ?? process.env.SMOKE_REQUIRE_AUTHENTICATED_FLOW
      ),
      configured: Boolean(
        normalizeEmail(args.get('smoke-email') || process.env.SMOKE_USER_EMAIL) &&
        String(args.get('smoke-password') || process.env.SMOKE_USER_PASSWORD || '')
      ),
    },
    checks: results,
    skippedCount: skipped.length,
  };

  const reportPath = args.get('report-path') || process.env.SMOKE_REPORT_PATH || '';
  await writeReportIfNeeded(reportPath, report);

  process.stdout.write('\nSmoke summary:\n');
  for (const result of results) {
    if (result.status === 'passed') {
      process.stdout.write(
        `  PASS ${result.name} status=${result.httpStatus} attempts=${result.attempts} duration=${result.durationMs}ms\n`
      );
    } else if (result.status === 'skipped') {
      process.stdout.write(
        `  SKIP ${result.name} reason=${result.reason}\n`
      );
    } else {
      process.stdout.write(
        `  FAIL ${result.name} attempts=${result.attempts} duration=${result.durationMs}ms error=${result.error}\n`
      );
    }
  }

  if (failed.length > 0) {
    process.stderr.write(`Smoke checks failed: ${failed.map((item) => item.name).join(', ')}\n`);
    process.exit(1);
  }
}

main().catch((error) => {
  process.stderr.write(`postdeploy-smoke failed: ${String(error?.message || error)}\n`);
  process.exit(1);
});
