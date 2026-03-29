import { isIP } from 'node:net';

export type RemoteProvider =
  | 'openai'
  | 'meshy'
  | 'runway'
  | 'ollama'
  | 'vllm'
  | 'llamacpp'
  | 'assets';

export class RemoteFetchError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 502) {
    super(message);
    this.name = 'RemoteFetchError';
    this.code = code;
    this.status = status;
  }
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;

const DEFAULT_PROVIDER_ALLOWLIST: Record<RemoteProvider, string[]> = {
  openai: ['api.openai.com'],
  meshy: ['api.meshy.ai'],
  runway: ['api.dev.runwayml.com'],
  ollama: ['localhost', '127.0.0.1', '::1'],
  vllm: ['localhost', '127.0.0.1', '::1'],
  llamacpp: ['localhost', '127.0.0.1', '::1'],
  assets: [],
};

function asPositiveInt(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function parseAllowlist(raw: string | undefined): string[] {
  return (raw || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .map((entry) => {
      if (entry.includes('://')) {
        try {
          return new URL(entry).hostname.toLowerCase();
        } catch {
          return '';
        }
      }
      return entry;
    })
    .filter(Boolean);
}

function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, '');
}

function getProviderAllowlist(provider: RemoteProvider): string[] {
  const shared = parseAllowlist(process.env.REY30_REMOTE_FETCH_ALLOWLIST);
  const providerEnv = parseAllowlist(
    process.env[`REY30_REMOTE_FETCH_ALLOWLIST_${provider.toUpperCase()}`]
  );
  return Array.from(
    new Set([
      ...DEFAULT_PROVIDER_ALLOWLIST[provider].map((entry) => normalizeHost(entry)),
      ...shared.map((entry) => normalizeHost(entry)),
      ...providerEnv.map((entry) => normalizeHost(entry)),
    ])
  );
}

function hostMatchesAllowlist(host: string, allowlist: string[]): boolean {
  const normalizedHost = normalizeHost(host);
  return allowlist.some((entry) => {
    const normalizedEntry = normalizeHost(entry);
    if (normalizedEntry.startsWith('*.')) {
      const suffix = normalizedEntry.slice(1);
      return normalizedHost.endsWith(suffix);
    }
    return normalizedHost === normalizedEntry;
  });
}

function parseIpv4(host: string): number[] | null {
  const parts = host.split('.');
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => Number(part));
  if (octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    return null;
  }
  return octets;
}

function isIpv4Loopback(host: string): boolean {
  const octets = parseIpv4(host);
  if (!octets) return false;
  return octets[0] === 127;
}

function isIpv4PrivateOrReserved(host: string): boolean {
  const octets = parseIpv4(host);
  if (!octets) return true;

  const [a, b] = octets;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 192 && b === 0) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true;
  return false;
}

function isIpv6Loopback(host: string): boolean {
  const normalized = host.toLowerCase();
  return normalized === '::1' || normalized === '0:0:0:0:0:0:0:1';
}

function isIpv6PrivateOrReserved(host: string): boolean {
  const normalized = host.toLowerCase().split('%')[0];
  if (!normalized) return true;
  if (normalized === '::') return true;
  if (isIpv6Loopback(normalized)) return true;

  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice('::ffff:'.length);
    return isIpv4PrivateOrReserved(mapped);
  }

  const firstHextet = normalized.split(':').find((part) => part.length > 0);
  if (!firstHextet) return false;
  const first = Number.parseInt(firstHextet, 16);
  if (!Number.isFinite(first)) return true;

  // fc00::/7 unique-local address space
  if ((first & 0xfe00) === 0xfc00) return true;
  // fe80::/10 link-local address space
  if ((first & 0xffc0) === 0xfe80) return true;
  return false;
}

function validateRemoteUrl(url: string, provider: RemoteProvider): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new RemoteFetchError('invalid_remote_url', 'Remote URL is invalid', 400);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new RemoteFetchError('invalid_remote_protocol', 'Remote URL protocol is not allowed', 400);
  }

  if (parsed.username || parsed.password) {
    throw new RemoteFetchError('invalid_remote_credentials', 'Remote URL cannot include credentials', 400);
  }

  const host = normalizeHost(parsed.hostname);
  const allowlist = getProviderAllowlist(provider);
  if (allowlist.length === 0) {
    throw new RemoteFetchError(
      'host_allowlist_not_configured',
      `Remote host allowlist is not configured for provider: ${provider}`,
      503
    );
  }

  const ipVersion = isIP(host);
  if (ipVersion === 4) {
    if (isIpv4Loopback(host)) {
      if (!hostMatchesAllowlist(host, allowlist)) {
        throw new RemoteFetchError('loopback_not_allowlisted', 'Loopback host is not allowlisted', 403);
      }
      return parsed;
    }
    if (isIpv4PrivateOrReserved(host)) {
      throw new RemoteFetchError('blocked_private_ip', 'Private or reserved IP addresses are blocked', 403);
    }
    if (!hostMatchesAllowlist(host, allowlist)) {
      throw new RemoteFetchError('host_not_allowlisted', 'Remote host is not allowlisted', 403);
    }
    return parsed;
  }

  if (ipVersion === 6) {
    if (isIpv6Loopback(host)) {
      if (!hostMatchesAllowlist(host, allowlist)) {
        throw new RemoteFetchError('loopback_not_allowlisted', 'Loopback host is not allowlisted', 403);
      }
      return parsed;
    }
    if (isIpv6PrivateOrReserved(host)) {
      throw new RemoteFetchError('blocked_private_ipv6', 'Private/link-local IPv6 addresses are blocked', 403);
    }
    if (!hostMatchesAllowlist(host, allowlist)) {
      throw new RemoteFetchError('host_not_allowlisted', 'Remote host is not allowlisted', 403);
    }
    return parsed;
  }

  if (!hostMatchesAllowlist(host, allowlist)) {
    throw new RemoteFetchError('host_not_allowlisted', 'Remote host is not allowlisted', 403);
  }

  return parsed;
}

async function readBytesWithinLimit(response: Response, maxBytes: number): Promise<Uint8Array> {
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new RemoteFetchError('remote_response_too_large', 'Remote response exceeded size limit', 502);
  }

  if (!response.body) {
    return new Uint8Array();
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytesRead = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    bytesRead += value.byteLength;
    if (bytesRead > maxBytes) {
      throw new RemoteFetchError('remote_response_too_large', 'Remote response exceeded size limit', 502);
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(bytesRead);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return merged;
}

async function fetchRemoteBody(params: {
  provider: RemoteProvider;
  url: string;
  init?: RequestInit;
  timeoutMs?: number;
  maxBytes?: number;
}): Promise<{ response: Response; bytes: Uint8Array }> {
  const parsedUrl = validateRemoteUrl(params.url, params.provider);
  const timeoutMs = asPositiveInt(process.env.REY30_REMOTE_FETCH_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  const maxBytes = asPositiveInt(process.env.REY30_REMOTE_FETCH_MAX_BYTES, DEFAULT_MAX_BYTES);
  const effectiveTimeoutMs = params.timeoutMs && params.timeoutMs > 0 ? params.timeoutMs : timeoutMs;
  const effectiveMaxBytes = params.maxBytes && params.maxBytes > 0 ? params.maxBytes : maxBytes;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), effectiveTimeoutMs);

  try {
    const response = await fetch(parsedUrl.toString(), {
      ...(params.init || {}),
      signal: controller.signal,
    });
    const bytes = await readBytesWithinLimit(response, effectiveMaxBytes);
    return { response, bytes };
  } catch (error) {
    if (error instanceof RemoteFetchError) {
      throw error;
    }
    if (error instanceof Error && error.name === 'AbortError') {
      throw new RemoteFetchError('remote_timeout', 'Remote request timed out', 504);
    }
    throw new RemoteFetchError('remote_request_failed', 'Remote request failed', 502);
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchRemoteText(params: {
  provider: RemoteProvider;
  url: string;
  init?: RequestInit;
  timeoutMs?: number;
  maxBytes?: number;
}): Promise<{ response: Response; text: string }> {
  const { response, bytes } = await fetchRemoteBody(params);
  const decoder = new TextDecoder();
  return { response, text: decoder.decode(bytes) };
}

export async function fetchRemoteBytes(params: {
  provider: RemoteProvider;
  url: string;
  init?: RequestInit;
  timeoutMs?: number;
  maxBytes?: number;
}): Promise<{ response: Response; bytes: Uint8Array }> {
  return fetchRemoteBody(params);
}

export async function fetchRemoteJson<T = Record<string, unknown>>(params: {
  provider: RemoteProvider;
  url: string;
  init?: RequestInit;
  timeoutMs?: number;
  maxBytes?: number;
}): Promise<{ response: Response; data: T | null; rawText: string }> {
  const { response, text } = await fetchRemoteText(params);
  if (!text.trim()) {
    return { response, data: null, rawText: text };
  }

  try {
    return {
      response,
      data: JSON.parse(text) as T,
      rawText: text,
    };
  } catch {
    throw new RemoteFetchError('remote_invalid_json', 'Remote response is not valid JSON', 502);
  }
}
