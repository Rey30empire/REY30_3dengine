import { NextRequest, NextResponse } from 'next/server';
import {
  getAiChatModeLimit,
  getCapacityPolicy,
  getDistributedRateLimitConfig,
  isInMemoryRateLimitFallbackAllowedInProduction,
  resolveEngineMode,
  type EngineMode,
} from './lib/security/capacity-policy';
import { getClientIp } from './lib/security/client-ip';
import { validateCsrfRequest } from './lib/security/csrf';

type RateBucket = {
  count: number;
  resetAt: number;
};

type RateLimitDecision = {
  key: string;
  limit: number;
  windowMs: number;
  requireDistributedStore: boolean;
  errorMessage: string;
  mode?: EngineMode;
};

class RateLimitBackendUnavailableError extends Error {}

declare global {
  var __rey30RateLimitStore: Map<string, RateBucket> | undefined;
}

function getStore(): Map<string, RateBucket> {
  if (!globalThis.__rey30RateLimitStore) {
    globalThis.__rey30RateLimitStore = new Map<string, RateBucket>();
  }
  return globalThis.__rey30RateLimitStore;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CORS_ALLOWED_METHODS = 'GET,POST,PUT,PATCH,DELETE,OPTIONS';
const CORS_ALLOWED_HEADERS =
  'Content-Type, Authorization, X-Requested-With, X-REY30-CSRF, X-REY30-ENGINE-MODE, X-REY30-OPS-TOKEN, X-REY30-INTEGRATION-ID, X-REY30-TIMESTAMP, X-REY30-NONCE, X-REY30-SIGNATURE';
const API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
const INTEGRATION_PATH_PREFIX = '/api/integrations/';
const SESSION_COOKIE_NAME = 'rey30_session';
const CSRF_EXEMPT_PATHS = new Set(['/api/auth/login', '/api/auth/register']);
const DISTRIBUTED_RATE_LIMIT_PATHS = new Set([
  '/api/ai',
  '/api/ai-agents',
  '/api/ai-chat',
  '/api/llamacpp',
  '/api/mcp',
  '/api/meshy',
  '/api/ollama',
  '/api/openai',
  '/api/runway',
  '/api/simple-mcp',
  '/api/vllm',
]);

function requiresDistributedRateLimit(pathname: string): boolean {
  return DISTRIBUTED_RATE_LIMIT_PATHS.has(pathname);
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === 'localhost' || normalized === '::1' || normalized === '[::1]') return true;
  return normalized.startsWith('127.');
}

function isLocalOriginlessRequest(request: NextRequest): boolean {
  return isLoopbackHostname(request.nextUrl.hostname);
}

function setSecurityHeaders(response: NextResponse, isProduction: boolean): NextResponse {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('Content-Security-Policy', API_CSP);
  if (isProduction) {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  return response;
}

function getAllowedOrigins(request: NextRequest): Set<string> {
  const allowed = new Set<string>();
  allowed.add(request.nextUrl.origin);

  const forwardedHost = request.headers.get('x-forwarded-host');
  const host = forwardedHost || request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') || request.nextUrl.protocol.replace(':', '');
  if (host && proto) {
    allowed.add(`${proto}://${host}`);
  }

  const fromEnv = (process.env.REY30_ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  for (const origin of fromEnv) {
    allowed.add(origin);
  }

  return allowed;
}

function isOriginAllowed(request: NextRequest, origin: string): boolean {
  try {
    const parsed = new URL(origin);
    return getAllowedOrigins(request).has(parsed.origin);
  } catch {
    return false;
  }
}

function setCorsHeaders(response: NextResponse, origin: string): NextResponse {
  const vary = response.headers.get('Vary');
  const varyValues = new Set(
    (vary || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  );
  varyValues.add('Origin');
  response.headers.set('Vary', Array.from(varyValues).join(', '));
  response.headers.set('Access-Control-Allow-Origin', origin);
  response.headers.set('Access-Control-Allow-Credentials', 'true');
  response.headers.set('Access-Control-Allow-Methods', CORS_ALLOWED_METHODS);
  response.headers.set('Access-Control-Allow-Headers', CORS_ALLOWED_HEADERS);
  return response;
}

function hasIntegrationHeaderBundle(request: NextRequest): boolean {
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) {
    return false;
  }

  const integrationId = request.headers.get('x-rey30-integration-id');
  const timestamp = request.headers.get('x-rey30-timestamp');
  const nonce = request.headers.get('x-rey30-nonce');
  const signature = request.headers.get('x-rey30-signature');

  return Boolean(
    integrationId?.trim() &&
    timestamp?.trim() &&
    nonce?.trim() &&
    signature?.trim()
  );
}

function json(request: NextRequest, status: number, payload: Record<string, unknown>): NextResponse {
  const response = new NextResponse(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
  setSecurityHeaders(response, process.env.NODE_ENV === 'production');
  const origin = request.headers.get('origin');
  if (origin && isOriginAllowed(request, origin)) {
    setCorsHeaders(response, origin);
  }
  return response;
}

function isAllowedRequestOrigin(request: NextRequest): { ok: boolean; origin: string | null } {
  const origin = request.headers.get('origin');
  if (!origin) {
    return {
      ok:
        SAFE_METHODS.has(request.method) ||
        canBypassOriginForIntegration(request),
      origin: null,
    };
  }
  return { ok: isOriginAllowed(request, origin), origin };
}

function canBypassOriginForIntegration(request: NextRequest): boolean {
  if (!request.nextUrl.pathname.startsWith(INTEGRATION_PATH_PREFIX)) {
    return false;
  }
  return hasIntegrationHeaderBundle(request);
}

function requiresCsrfValidation(request: NextRequest): boolean {
  if (SAFE_METHODS.has(request.method)) return false;
  const pathname = request.nextUrl.pathname;
  if (!pathname.startsWith('/api/')) return false;
  if (pathname.startsWith(INTEGRATION_PATH_PREFIX)) return false;
  if (CSRF_EXEMPT_PATHS.has(pathname)) return false;
  return Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);
}

function applyInMemoryRateLimit(key: string, windowMs: number): { count: number; resetAt: number } {
  const now = Date.now();
  const store = getStore();
  const current = store.get(key);
  if (!current || current.resetAt <= now) {
    const next = { count: 1, resetAt: now + windowMs };
    store.set(key, next);
    return next;
  }
  current.count += 1;
  return current;
}

function getRateLimitDecision(request: NextRequest): RateLimitDecision {
  const policy = getCapacityPolicy();
  const pathname = request.nextUrl.pathname;
  const clientIp = getClientIp(request) || 'unknown';

  if (pathname === '/api/auth/login') {
    return {
      key: `auth_login:${clientIp}`,
      limit: policy.loginRequestsPerWindow,
      windowMs: policy.authWindowMs,
      requireDistributedStore: true,
      errorMessage: 'Too many login attempts',
    };
  }

  if (pathname === '/api/auth/register') {
    return {
      key: `auth_register:${clientIp}`,
      limit: policy.registerRequestsPerWindow,
      windowMs: policy.authWindowMs,
      requireDistributedStore: true,
      errorMessage: 'Too many registration attempts',
    };
  }

  if (pathname === '/api/ai-chat') {
    const engineMode = resolveEngineMode(request.headers.get('x-rey30-engine-mode'));
    const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value?.slice(0, 20) || '';
    return {
      key: `ai_chat:${sessionToken || clientIp}:${engineMode}`,
      limit: getAiChatModeLimit(engineMode),
      windowMs: policy.globalWindowMs,
      requireDistributedStore: true,
      errorMessage: 'AI chat rate limit exceeded for current mode',
      mode: engineMode,
    };
  }

  return {
    key: `${clientIp}:${pathname}`,
    limit: policy.globalRequestsPerWindow,
    windowMs: policy.globalWindowMs,
    requireDistributedStore: requiresDistributedRateLimit(pathname),
    errorMessage: 'Too many requests',
  };
}

async function applyUpstashRateLimit(
  key: string,
  windowMs: number
): Promise<{ count: number; resetAt: number } | null> {
  const config = getDistributedRateLimitConfig();
  if (!config) return null;

  const ttlSeconds = Math.max(1, Math.ceil(windowMs / 1000));
  const endpoint = `${config.url}/pipeline`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        ['INCR', key],
        ['EXPIRE', key, ttlSeconds, 'NX'],
        ['PTTL', key],
      ]),
    });

    if (!response.ok) {
      throw new Error(`Upstash status ${response.status}`);
    }

    const payload = await response.json() as Array<{ result?: unknown }>;
    const count = Number(payload?.[0]?.result ?? 0);
    const ttlMs = Number(payload?.[2]?.result ?? windowMs);
    const resetAt = Date.now() + (Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : windowMs);
    return {
      count: Number.isFinite(count) && count > 0 ? count : 1,
      resetAt,
    };
  } catch (error) {
    console.warn('[rate-limit] Upstash unavailable, falling back to memory store', error);
    return null;
  }
}

async function consumeRateLimitBucket(
  key: string,
  windowMs: number,
  allowMemoryFallback: boolean
): Promise<{ count: number; resetAt: number }> {
  const distributed = await applyUpstashRateLimit(key, windowMs);
  if (distributed) return distributed;
  if (!allowMemoryFallback) {
    throw new RateLimitBackendUnavailableError('Distributed rate limit backend unavailable.');
  }
  return applyInMemoryRateLimit(key, windowMs);
}

async function applyRateLimit(request: NextRequest): Promise<NextResponse | null> {
  if (request.method === 'OPTIONS') return null;

  const isProduction = process.env.NODE_ENV === 'production';
  const pathname = request.nextUrl.pathname;
  const decision = getRateLimitDecision(request);
  const allowMemoryFallback =
    !isProduction ||
    isLocalOriginlessRequest(request) ||
    !decision.requireDistributedStore ||
    isInMemoryRateLimitFallbackAllowedInProduction();

  let bucket: { count: number; resetAt: number };
  try {
    bucket = await consumeRateLimitBucket(
      `rey30:rl:${decision.key}`,
      decision.windowMs,
      allowMemoryFallback
    );
  } catch (error) {
    if (error instanceof RateLimitBackendUnavailableError) {
      return json(request, 503, {
        error: 'Protected API rate limit backend unavailable',
        code: 'RATE_LIMIT_BACKEND_UNAVAILABLE',
        detail:
          'Configure REY30_UPSTASH_REDIS_REST_URL and REY30_UPSTASH_REDIS_REST_TOKEN, or set REY30_ALLOW_IN_MEMORY_RATE_LIMIT_PRODUCTION=true only for a single-node deployment.',
      });
    }
    throw error;
  }

  if (bucket.count > decision.limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - Date.now()) / 1000));
    const response = json(request, 429, {
      error: decision.errorMessage,
      mode: decision.mode,
      limit: decision.limit,
      windowMs: decision.windowMs,
      retryAfterSeconds,
    });
    response.headers.set('Retry-After', String(retryAfterSeconds));
    return response;
  }

  return null;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction) {
    if (pathname === '/api/terminal') {
      return json(request, 404, { error: 'Not found' });
    }

    const originCheck = isAllowedRequestOrigin(request);
    if (!originCheck.ok) {
      console.warn('[security][origin-blocked]', {
        path: pathname,
        method: request.method,
        origin: request.headers.get('origin') || null,
        ip: getClientIp(request) || 'unknown',
      });
      return json(request, 403, { error: 'Forbidden origin' });
    }

    if (request.method === 'OPTIONS') {
      const preflight = new NextResponse(null, { status: 204 });
      setSecurityHeaders(preflight, true);
      if (originCheck.origin) {
        setCorsHeaders(preflight, originCheck.origin);
      }
      return preflight;
    }
  }

  if (requiresCsrfValidation(request)) {
    const csrf = validateCsrfRequest(request);
    if (!csrf.ok) {
      console.warn('[security][csrf-blocked]', {
        path: pathname,
        method: request.method,
        reason: csrf.reason || 'unknown',
        ip: getClientIp(request) || 'unknown',
      });
      return json(request, 403, { error: 'CSRF validation failed' });
    }
  }

  const rateLimited = await applyRateLimit(request);
  if (rateLimited) return rateLimited;

  const response = NextResponse.next();
  setSecurityHeaders(response, isProduction);
  const origin = request.headers.get('origin');
  if (origin && isOriginAllowed(request, origin)) {
    setCorsHeaders(response, origin);
  }
  return response;
}

export const config = {
  matcher: ['/api/:path*'],
};
