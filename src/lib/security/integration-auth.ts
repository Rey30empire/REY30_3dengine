import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getDistributedRateLimitConfig } from './capacity-policy';
import { reserveIntegrationNonce } from '@/lib/server/external-integration-store';

type IntegrationCredential = {
  id: string;
  token: string;
  secret: string;
  scopes: string[];
};

export type VerifiedIntegration = {
  id: string;
  scopes: string[];
};

const DEFAULT_MAX_SKEW_SECONDS = 300;

class IntegrationAuthError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function getMaxSkewSeconds(): number {
  const raw = Number(process.env.REY30_INTEGRATION_MAX_SKEW_SEC || '');
  if (Number.isFinite(raw) && raw > 0) {
    return Math.floor(raw);
  }
  return DEFAULT_MAX_SKEW_SECONDS;
}

function parseScopes(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeCredential(input: unknown): IntegrationCredential | null {
  if (!input || typeof input !== 'object') return null;
  const obj = input as Record<string, unknown>;
  const id = String(obj.id || '').trim();
  const token = String(obj.token || '').trim();
  const secret = String(obj.secret || '').trim();
  const scopes = parseScopes(obj.scopes);
  if (!id || !token || !secret || scopes.length === 0) return null;
  return { id, token, secret, scopes };
}

function parseJsonCredentials(raw: string): IntegrationCredential[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeCredential)
      .filter((item): item is IntegrationCredential => !!item);
  } catch {
    return [];
  }
}

function getConfiguredCredentials(): IntegrationCredential[] {
  const fromJson = String(process.env.REY30_INTEGRATION_CREDENTIALS || '').trim();
  if (fromJson) {
    const creds = parseJsonCredentials(fromJson);
    if (creds.length > 0) return creds;
  }

  const singleId = String(process.env.REY30_INTEGRATION_ID || '').trim();
  const singleToken = String(process.env.REY30_INTEGRATION_TOKEN || '').trim();
  const singleSecret = String(process.env.REY30_INTEGRATION_SECRET || '').trim();
  const singleScopes = parseScopes(process.env.REY30_INTEGRATION_SCOPES || '');
  if (singleId && singleToken && singleSecret && singleScopes.length > 0) {
    return [
      {
        id: singleId,
        token: singleToken,
        secret: singleSecret,
        scopes: singleScopes,
      },
    ];
  }

  if (process.env.NODE_ENV === 'test') {
    return [
      {
        id: 'test-integration',
        token: 'test-integration-token',
        secret: 'test-integration-secret',
        scopes: ['events:write'],
      },
    ];
  }

  return [];
}

function safeCompare(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function extractBearerToken(request: NextRequest): string {
  const auth = request.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return '';
  return auth.slice('Bearer '.length).trim();
}

function requireHeader(request: NextRequest, name: string): string {
  const value = request.headers.get(name);
  if (!value || !value.trim()) {
    throw new IntegrationAuthError(401, 'missing_header', `Missing header: ${name}`);
  }
  return value.trim();
}

function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function canonicalPayload(params: {
  method: string;
  path: string;
  timestamp: string;
  nonce: string;
  bodyHash: string;
}): string {
  return [
    params.method.toUpperCase(),
    params.path,
    params.timestamp,
    params.nonce,
    params.bodyHash,
  ].join('\n');
}

function signPayload(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

function assertFreshTimestamp(timestampRaw: string): number {
  const timestamp = Number(timestampRaw);
  if (!Number.isFinite(timestamp)) {
    throw new IntegrationAuthError(401, 'invalid_timestamp', 'Invalid integration timestamp.');
  }

  const now = Math.floor(Date.now() / 1000);
  const skew = Math.abs(now - Math.floor(timestamp));
  const maxSkew = getMaxSkewSeconds();
  if (skew > maxSkew) {
    throw new IntegrationAuthError(401, 'timestamp_skew', 'Integration timestamp is outside allowed skew.');
  }

  return Math.floor(timestamp);
}

function buildNonceStoreKey(integrationId: string, nonce: string): string {
  return sha256Hex(`${integrationId}:${nonce}`);
}

async function reserveDistributedNonce(params: {
  integrationId: string;
  nonce: string;
  expiresAt: number;
}): Promise<{ reserved: boolean } | null> {
  const config = getDistributedRateLimitConfig();
  if (!config) return null;

  const ttlMs = Math.max(1_000, params.expiresAt - Date.now());
  const endpoint = `${config.url}/pipeline`;
  const nonceKey = `rey30:integration_nonce:${buildNonceStoreKey(params.integrationId, params.nonce)}`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        ['SET', nonceKey, String(params.expiresAt), 'PX', ttlMs, 'NX'],
      ]),
      cache: 'no-store',
    });
  } catch (error) {
    throw new IntegrationAuthError(
      503,
      'nonce_store_unavailable',
      'Distributed integration nonce store unavailable.'
    );
  }

  if (!response.ok) {
    throw new IntegrationAuthError(
      503,
      'nonce_store_unavailable',
      'Distributed integration nonce store unavailable.'
    );
  }

  const payload = (await response.json().catch(() => null)) as Array<{ result?: unknown; error?: unknown }> | null;
  const command = payload?.[0];
  if (command?.error) {
    throw new IntegrationAuthError(
      503,
      'nonce_store_unavailable',
      'Distributed integration nonce store unavailable.'
    );
  }

  if (command?.result === 'OK') {
    return { reserved: true };
  }

  if (command?.result === null) {
    return { reserved: false };
  }

  throw new IntegrationAuthError(
    503,
    'nonce_store_unavailable',
    'Distributed integration nonce store unavailable.'
  );
}

async function assertNonceUnused(integrationId: string, nonce: string, timestampSeconds: number): Promise<void> {
  const maxSkewMs = getMaxSkewSeconds() * 1000;
  const timestampMs = timestampSeconds * 1000;
  const expiresAt = Math.max(Date.now() + maxSkewMs, timestampMs + maxSkewMs);

  const distributedReservation = await reserveDistributedNonce({
    integrationId,
    nonce,
    expiresAt,
  });
  if (distributedReservation) {
    if (!distributedReservation.reserved) {
      throw new IntegrationAuthError(401, 'replay_detected', 'Integration nonce has already been used.');
    }
    return;
  }

  const fileReservation = await reserveIntegrationNonce({
    integrationId,
    nonceKey: buildNonceStoreKey(integrationId, nonce),
    expiresAt,
  });
  if (!fileReservation.reserved) {
    throw new IntegrationAuthError(401, 'replay_detected', 'Integration nonce has already been used.');
  }
}

function getCredentialById(id: string): IntegrationCredential | null {
  const credential = getConfiguredCredentials().find((item) => item.id === id);
  return credential || null;
}

function assertScope(credential: IntegrationCredential, requiredScope: string): void {
  if (credential.scopes.includes(requiredScope)) return;
  throw new IntegrationAuthError(403, 'missing_scope', `Missing required scope: ${requiredScope}`);
}

function sanitizeSignature(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized.startsWith('sha256=')) {
    return normalized.slice('sha256='.length);
  }
  return normalized;
}

export async function authenticateIntegrationRequest(params: {
  request: NextRequest;
  rawBody: string;
  requiredScope: string;
}): Promise<VerifiedIntegration> {
  const { request, rawBody, requiredScope } = params;

  const configured = getConfiguredCredentials();
  if (configured.length === 0) {
    throw new IntegrationAuthError(503, 'integration_not_configured', 'Integration credentials are not configured.');
  }

  const integrationId = requireHeader(request, 'x-rey30-integration-id');
  const nonce = requireHeader(request, 'x-rey30-nonce');
  const timestampRaw = requireHeader(request, 'x-rey30-timestamp');
  const signature = sanitizeSignature(requireHeader(request, 'x-rey30-signature'));
  const bearerToken = extractBearerToken(request);
  if (!bearerToken) {
    throw new IntegrationAuthError(401, 'missing_bearer', 'Missing bearer token.');
  }

  const credential = getCredentialById(integrationId);
  if (!credential) {
    throw new IntegrationAuthError(401, 'invalid_integration', 'Unknown integration id.');
  }

  if (!safeCompare(bearerToken, credential.token)) {
    throw new IntegrationAuthError(401, 'invalid_token', 'Invalid integration token.');
  }

  assertScope(credential, requiredScope);
  const timestampSeconds = assertFreshTimestamp(timestampRaw);

  const bodyHash = sha256Hex(rawBody);
  const payload = canonicalPayload({
    method: request.method,
    path: request.nextUrl.pathname,
    timestamp: String(timestampSeconds),
    nonce,
    bodyHash,
  });
  const expectedSignature = signPayload(payload, credential.secret);

  if (!safeCompare(signature, expectedSignature)) {
    throw new IntegrationAuthError(401, 'invalid_signature', 'Invalid integration signature.');
  }

  await assertNonceUnused(integrationId, nonce, timestampSeconds);

  return {
    id: credential.id,
    scopes: credential.scopes,
  };
}

export function integrationAuthErrorToResponse(error: unknown): NextResponse {
  if (error instanceof IntegrationAuthError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
      },
      { status: error.status }
    );
  }

  return NextResponse.json(
    {
      error: 'Integration authentication failed.',
      code: 'integration_auth_error',
    },
    { status: 500 }
  );
}
