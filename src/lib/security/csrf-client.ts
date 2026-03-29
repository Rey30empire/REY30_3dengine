const CSRF_COOKIE_NAME = 'rey30_csrf';
const CSRF_HEADER_NAME = 'x-rey30-csrf';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

let csrfFetchInterceptorInstalled = false;

function isValidCsrfTokenFormat(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}

function readCookie(name: string): string | null {
  const all = document.cookie || '';
  if (!all) return null;

  const segments = all.split(';');
  for (const segment of segments) {
    const [rawName, ...rawValue] = segment.split('=');
    if ((rawName || '').trim() !== name) continue;
    const value = rawValue.join('=').trim();
    return value ? decodeURIComponent(value) : null;
  }
  return null;
}

function resolveRequestUrl(input: RequestInfo | URL): URL | null {
  try {
    if (input instanceof Request) {
      return new URL(input.url);
    }
    if (input instanceof URL) {
      return input;
    }
    return new URL(String(input), window.location.origin);
  } catch {
    return null;
  }
}

function mergeHeaders(input: RequestInfo | URL, init?: RequestInit): Headers {
  const headers = new Headers();

  if (input instanceof Request) {
    input.headers.forEach((value, key) => headers.set(key, value));
  }

  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  }

  return headers;
}

export function installCsrfFetchInterceptor(): void {
  if (typeof window === 'undefined' || csrfFetchInterceptorInstalled) return;

  const originalFetch = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (SAFE_METHODS.has(method)) {
      return originalFetch(input, init);
    }

    const url = resolveRequestUrl(input);
    if (!url || url.origin !== window.location.origin) {
      return originalFetch(input, init);
    }

    const token = (readCookie(CSRF_COOKIE_NAME) || '').trim();
    if (!isValidCsrfTokenFormat(token)) {
      return originalFetch(input, init);
    }

    const headers = mergeHeaders(input, init);
    if (!headers.has(CSRF_HEADER_NAME)) {
      headers.set(CSRF_HEADER_NAME, token);
    }

    return originalFetch(input, {
      ...init,
      headers,
    });
  }) as typeof window.fetch;

  csrfFetchInterceptorInstalled = true;
}
