import { isIP } from 'node:net';
import {
  markRemoteProviderCircuitFailure,
  markRemoteProviderCircuitSuccess,
  readRemoteProviderCircuitState,
} from '@/lib/server/external-integration-store';

export type RemoteProvider =
  | 'openai'
  | 'meshy'
  | 'runway'
  | 'ollama'
  | 'vllm'
  | 'llamacpp'
  | 'assets'
  | 'webhook';

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
const DEFAULT_RETRY_ATTEMPTS = 3;
const DEFAULT_RETRY_BASE_MS = 250;
const DEFAULT_CIRCUIT_THRESHOLD = 3;
const DEFAULT_CIRCUIT_COOLDOWN_MS = 15_000;

const DEFAULT_PROVIDER_ALLOWLIST: Record<RemoteProvider, string[]> = {
  openai: ['api.openai.com'],
  meshy: ['api.meshy.ai'],
  runway: ['api.dev.runwayml.com'],
  ollama: ['localhost', '127.0.0.1', '::1'],
  vllm: ['localhost', '127.0.0.1', '::1'],
  llamacpp: ['localhost', '127.0.0.1', '::1'],
  assets: [],
  webhook: [],
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

function getRetryAttempts(): number {
  return Math.max(1, asPositiveInt(process.env.REY30_REMOTE_FETCH_RETRY_ATTEMPTS, DEFAULT_RETRY_ATTEMPTS));
}

function getRetryBaseMs(): number {
  return Math.max(50, asPositiveInt(process.env.REY30_REMOTE_FETCH_RETRY_BASE_MS, DEFAULT_RETRY_BASE_MS));
}

function getCircuitThreshold(): number {
  return Math.max(
    1,
    asPositiveInt(process.env.REY30_REMOTE_FETCH_CIRCUIT_THRESHOLD, DEFAULT_CIRCUIT_THRESHOLD)
  );
}

function getCircuitCooldownMs(): number {
  return Math.max(
    250,
    asPositiveInt(process.env.REY30_REMOTE_FETCH_CIRCUIT_COOLDOWN_MS, DEFAULT_CIRCUIT_COOLDOWN_MS)
  );
}

function getProviderAllowlist(provider: RemoteProvider, additionalAllowlist: string[] = []): string[] {
  const shared = parseAllowlist(process.env.REY30_REMOTE_FETCH_ALLOWLIST);
  const providerEnv = parseAllowlist(
    process.env[`REY30_REMOTE_FETCH_ALLOWLIST_${provider.toUpperCase()}`]
  );
  return Array.from(
    new Set([
      ...DEFAULT_PROVIDER_ALLOWLIST[provider].map((entry) => normalizeHost(entry)),
      ...shared.map((entry) => normalizeHost(entry)),
      ...providerEnv.map((entry) => normalizeHost(entry)),
      ...additionalAllowlist.map((entry) => normalizeHost(entry)),
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

export function getRemoteProviderAllowlistForDiagnostics(
  provider: RemoteProvider,
  additionalAllowlist: string[] = []
): string[] {
  return getProviderAllowlist(provider, additionalAllowlist);
}

export function isRemoteProviderHostAllowlisted(params: {
  provider: RemoteProvider;
  host: string;
  additionalAllowlist?: string[];
}): boolean {
  return hostMatchesAllowlist(
    params.host,
    getProviderAllowlist(params.provider, params.additionalAllowlist || [])
  );
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

function shouldRetryStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

function shouldRetryError(error: RemoteFetchError): boolean {
  return (
    error.code === 'remote_request_failed' ||
    error.code === 'remote_timeout' ||
    error.code === 'remote_response_too_large'
  );
}

function parseRetryAfterMs(response: Response): number | null {
  const raw = response.headers.get('retry-after');
  if (!raw) return null;
  const asNumber = Number(raw);
  if (Number.isFinite(asNumber) && asNumber >= 0) {
    return Math.max(0, Math.round(asNumber * 1000));
  }
  const parsedDate = Date.parse(raw);
  if (Number.isFinite(parsedDate)) {
    return Math.max(0, parsedDate - Date.now());
  }
  return null;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function assertCircuitClosed(provider: RemoteProvider, host: string) {
  const state = readRemoteProviderCircuitState({ provider, host });
  if (state?.openUntil && state.openUntil > Date.now()) {
    throw new RemoteFetchError('provider_circuit_open', 'Remote provider circuit is open', 503);
  }
}

function validateRemoteUrl(
  url: string,
  provider: RemoteProvider,
  additionalAllowlist: string[] = []
): URL {
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
  const allowlist = getProviderAllowlist(provider, additionalAllowlist);
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
  additionalAllowlist?: string[];
}): Promise<{ response: Response; bytes: Uint8Array }> {
  const parsedUrl = validateRemoteUrl(
    params.url,
    params.provider,
    params.additionalAllowlist || []
  );
  const normalizedHost = normalizeHost(parsedUrl.hostname);
  await assertCircuitClosed(params.provider, normalizedHost);
  const timeoutMs = asPositiveInt(process.env.REY30_REMOTE_FETCH_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  const maxBytes = asPositiveInt(process.env.REY30_REMOTE_FETCH_MAX_BYTES, DEFAULT_MAX_BYTES);
  const retryAttempts = getRetryAttempts();
  const retryBaseMs = getRetryBaseMs();
  const effectiveTimeoutMs = params.timeoutMs && params.timeoutMs > 0 ? params.timeoutMs : timeoutMs;
  const effectiveMaxBytes = params.maxBytes && params.maxBytes > 0 ? params.maxBytes : maxBytes;
  const circuitThreshold = getCircuitThreshold();
  const circuitCooldownMs = getCircuitCooldownMs();

  let lastRetryableResponseStatus: number | null = null;
  let lastRetryableError: RemoteFetchError | null = null;

  for (let attempt = 1; attempt <= retryAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), effectiveTimeoutMs);

    try {
      const response = await fetch(parsedUrl.toString(), {
        ...(params.init || {}),
        signal: controller.signal,
      });
      const bytes = await readBytesWithinLimit(response, effectiveMaxBytes);

      if (response.ok) {
        await markRemoteProviderCircuitSuccess({
          provider: params.provider,
          host: normalizedHost,
        });
        return { response, bytes };
      }

      if (shouldRetryStatus(response.status) && attempt < retryAttempts) {
        lastRetryableResponseStatus = response.status;
        const retryAfterMs = parseRetryAfterMs(response);
        const delayMs =
          retryAfterMs !== null
            ? retryAfterMs
            : retryBaseMs * Math.max(1, 2 ** (attempt - 1));
        await sleep(delayMs);
        continue;
      }

      if (shouldRetryStatus(response.status)) {
        await markRemoteProviderCircuitFailure({
          provider: params.provider,
          host: normalizedHost,
          threshold: circuitThreshold,
          cooldownMs: circuitCooldownMs,
        });
      } else {
        await markRemoteProviderCircuitSuccess({
          provider: params.provider,
          host: normalizedHost,
        });
      }

      return { response, bytes };
    } catch (error) {
      let normalizedError: RemoteFetchError;
      if (error instanceof RemoteFetchError) {
        normalizedError = error;
      } else if (error instanceof Error && error.name === 'AbortError') {
        normalizedError = new RemoteFetchError('remote_timeout', 'Remote request timed out', 504);
      } else {
        normalizedError = new RemoteFetchError('remote_request_failed', 'Remote request failed', 502);
      }

      if (shouldRetryError(normalizedError) && attempt < retryAttempts) {
        lastRetryableError = normalizedError;
        const delayMs = retryBaseMs * Math.max(1, 2 ** (attempt - 1));
        await sleep(delayMs);
        continue;
      }

      if (shouldRetryError(normalizedError)) {
        await markRemoteProviderCircuitFailure({
          provider: params.provider,
          host: normalizedHost,
          threshold: circuitThreshold,
          cooldownMs: circuitCooldownMs,
        });
      }

      throw normalizedError;
    } finally {
      clearTimeout(timer);
    }
  }

  if (lastRetryableError) {
    throw lastRetryableError;
  }

  throw new RemoteFetchError(
    'remote_request_failed',
    lastRetryableResponseStatus
      ? `Remote request failed with status ${lastRetryableResponseStatus}`
      : 'Remote request failed',
    lastRetryableResponseStatus || 502
  );
}

export async function fetchRemoteText(params: {
  provider: RemoteProvider;
  url: string;
  init?: RequestInit;
  timeoutMs?: number;
  maxBytes?: number;
  additionalAllowlist?: string[];
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
  additionalAllowlist?: string[];
}): Promise<{ response: Response; bytes: Uint8Array }> {
  return fetchRemoteBody(params);
}

export async function fetchRemoteJson<T = Record<string, unknown>>(params: {
  provider: RemoteProvider;
  url: string;
  init?: RequestInit;
  timeoutMs?: number;
  maxBytes?: number;
  additionalAllowlist?: string[];
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
