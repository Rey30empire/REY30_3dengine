import type {
  EditorAccessMatrix,
  EditorSessionAccessMode,
  EditorSessionRole,
} from '@/lib/security/editor-access';

export interface ClientAuthSessionPayload {
  authenticated?: boolean;
  accessMode?: EditorSessionAccessMode;
  user?: {
    id?: string;
    email?: string;
    name?: string | null;
    role?: EditorSessionRole | string | null;
  };
  editorAccess?: Partial<EditorAccessMatrix> | null;
  policy?: unknown;
}

type LoadClientAuthSessionOptions = {
  forceRefresh?: boolean;
  maxAgeMs?: number;
  maxAttempts?: number;
  retryDelayMs?: number;
};

const DEFAULT_MAX_AGE_MS = 10_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 250;

let cachedPayload: ClientAuthSessionPayload | null = null;
let cachedAt = 0;
let inflightRequest: Promise<ClientAuthSessionPayload> | null = null;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isFresh(maxAgeMs: number) {
  return Boolean(cachedPayload) && Date.now() - cachedAt <= maxAgeMs;
}

function prime(payload: ClientAuthSessionPayload) {
  cachedPayload = payload;
  cachedAt = Date.now();
  return payload;
}

export function clearClientAuthSessionCache() {
  cachedPayload = null;
  cachedAt = 0;
  inflightRequest = null;
}

export function primeClientAuthSessionCache(payload: ClientAuthSessionPayload) {
  return prime(payload);
}

export async function loadClientAuthSession(
  options: LoadClientAuthSessionOptions = {}
): Promise<ClientAuthSessionPayload> {
  const {
    forceRefresh = false,
    maxAgeMs = DEFAULT_MAX_AGE_MS,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  } = options;

  if (!forceRefresh && isFresh(maxAgeMs)) {
    return cachedPayload ?? {};
  }

  if (!forceRefresh && inflightRequest) {
    return inflightRequest;
  }

  const request = (async () => {
    let lastPayload: ClientAuthSessionPayload = cachedPayload ?? {};

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await fetch('/api/auth/session', {
          method: 'GET',
          cache: 'no-store',
        });
        const payload = (await response.json().catch(() => ({}))) as ClientAuthSessionPayload;
        lastPayload = payload;

        if (response.ok) {
          return prime(payload);
        }
      } catch {
        if (cachedPayload) {
          return cachedPayload;
        }
      }

      if (attempt < maxAttempts) {
        await sleep(retryDelayMs);
      }
    }

    if (cachedPayload) {
      return cachedPayload;
    }

    return lastPayload;
  })();

  inflightRequest = request.finally(() => {
    if (inflightRequest === request) {
      inflightRequest = null;
    }
  });

  return inflightRequest;
}
