export type EngineMode = 'MODE_MANUAL' | 'MODE_HYBRID' | 'MODE_AI_FIRST';

export type CapacityPolicy = {
  globalWindowMs: number;
  globalRequestsPerWindow: number;
  aiChatPerMode: Record<EngineMode, number>;
  authWindowMs: number;
  loginRequestsPerWindow: number;
  registerRequestsPerWindow: number;
};

const DEFAULTS: CapacityPolicy = {
  globalWindowMs: 60_000,
  globalRequestsPerWindow: 120,
  authWindowMs: 10 * 60_000,
  loginRequestsPerWindow: 8,
  registerRequestsPerWindow: 4,
  aiChatPerMode: {
    MODE_MANUAL: 45,
    MODE_HYBRID: 60,
    MODE_AI_FIRST: 25,
  },
};

function asPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function asBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value || !value.trim()) return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

export function isAutomatedTestRuntime(): boolean {
  if (process.env.NODE_ENV === 'test') return true;
  return [
    'VITEST',
    'VITEST_MODE',
    'VITEST_POOL_ID',
    'VITEST_WORKER_ID',
  ].some((key) => {
    const value = process.env[key];
    return typeof value === 'string' && value.trim().length > 0;
  });
}

export function resolveEngineMode(value: string | null | undefined): EngineMode {
  if (value === 'MODE_MANUAL') return 'MODE_MANUAL';
  if (value === 'MODE_AI_FIRST') return 'MODE_AI_FIRST';
  return 'MODE_HYBRID';
}

export function getDistributedRateLimitConfig(): { url: string; token: string } | null {
  const url = (
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.REY30_UPSTASH_REDIS_REST_URL ||
    ''
  ).trim();
  const token = (
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.REY30_UPSTASH_REDIS_REST_TOKEN ||
    ''
  ).trim();

  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ''), token };
}

export function isDistributedRateLimitConfigured(): boolean {
  return getDistributedRateLimitConfig() !== null;
}

export function isInMemoryRateLimitFallbackAllowedInProduction(): boolean {
  return asBoolean(process.env.REY30_ALLOW_IN_MEMORY_RATE_LIMIT_PRODUCTION, false);
}

export function getCapacityPolicy(): CapacityPolicy {
  return {
    globalWindowMs: asPositiveInt(
      process.env.REY30_RATE_LIMIT_WINDOW_MS,
      DEFAULTS.globalWindowMs
    ),
    globalRequestsPerWindow: asPositiveInt(
      process.env.REY30_RATE_LIMIT_MAX_REQUESTS,
      DEFAULTS.globalRequestsPerWindow
    ),
    authWindowMs: asPositiveInt(
      process.env.REY30_RATE_LIMIT_AUTH_WINDOW_MS,
      DEFAULTS.authWindowMs
    ),
    loginRequestsPerWindow: asPositiveInt(
      process.env.REY30_RATE_LIMIT_LOGIN_MAX_REQUESTS,
      DEFAULTS.loginRequestsPerWindow
    ),
    registerRequestsPerWindow: asPositiveInt(
      process.env.REY30_RATE_LIMIT_REGISTER_MAX_REQUESTS,
      DEFAULTS.registerRequestsPerWindow
    ),
    aiChatPerMode: {
      MODE_MANUAL: asPositiveInt(
        process.env.REY30_LIMIT_AI_CHAT_MANUAL_PER_WINDOW,
        DEFAULTS.aiChatPerMode.MODE_MANUAL
      ),
      MODE_HYBRID: asPositiveInt(
        process.env.REY30_LIMIT_AI_CHAT_HYBRID_PER_WINDOW,
        DEFAULTS.aiChatPerMode.MODE_HYBRID
      ),
      MODE_AI_FIRST: asPositiveInt(
        process.env.REY30_LIMIT_AI_CHAT_AI_FIRST_PER_WINDOW,
        DEFAULTS.aiChatPerMode.MODE_AI_FIRST
      ),
    },
  };
}

export function getAiChatModeLimit(mode: EngineMode): number {
  return getCapacityPolicy().aiChatPerMode[mode];
}
