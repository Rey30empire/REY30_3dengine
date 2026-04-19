import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';

export type AsyncProviderName = 'openai' | 'meshy' | 'runway';

export type IntegrationEventRecord = {
  id: string;
  integrationId: string;
  eventType: string;
  source: string;
  payload: unknown;
  idempotencyKey: string | null;
  bodyHash: string;
  receivedAt: number;
};

export type ProviderJobRecord = {
  id: string;
  provider: AsyncProviderName;
  userId: string;
  projectKey: string;
  action: string;
  remoteTaskId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'canceled';
  requestedAt: number;
  updatedAt: number;
  requestSummary: Record<string, unknown>;
  result: {
    url?: string;
    thumbnailUrl?: string;
    progress?: number;
    rawStatus?: string;
  };
};

export type RemoteProviderCircuitState = {
  provider: string;
  host: string;
  consecutiveFailures: number;
  updatedAt: number;
  openUntil: number | null;
};

export type IntegrationNonceRecord = {
  id: string;
  integrationId: string;
  nonceKey: string;
  expiresAt: number;
  createdAt: number;
};

export type DurableSecurityAuditRecord = {
  id: string;
  userId: string | null;
  action: string;
  target: string | null;
  status: 'allowed' | 'denied' | 'error';
  ipAddress: string | null;
  userAgent: string | null;
  metadata: string | null;
  createdAt: number;
  persistedBy: 'durable_fallback';
};

function buildDefaultRoot() {
  if (process.env.NODE_ENV === 'test') {
    const poolId = process.env.VITEST_POOL_ID || 'default';
    return path.join(process.cwd(), '.vitest', 'external-integrations', `${process.pid}-${poolId}`);
  }

  return path.join(process.cwd(), 'download', 'external-integrations');
}

export function getExternalIntegrationStorageRoot() {
  return process.env.REY30_EXTERNAL_INTEGRATION_ROOT?.trim() || buildDefaultRoot();
}

function sanitizeSegment(value: string | null | undefined, fallback: string) {
  const sanitized = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 120);
  return sanitized || fallback;
}

function ensureDir(dir: string) {
  mkdirSync(dir, { recursive: true });
}

function removeFileIfExists(filePath: string) {
  try {
    unlinkSync(filePath);
  } catch {
    // noop
  }
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function withWriteLock<T>(params: {
  lockPath: string;
  timeoutMs?: number;
  staleLockMs?: number;
  work: () => Promise<T>;
}) {
  const timeoutMs = params.timeoutMs ?? 2_000;
  const staleLockMs = params.staleLockMs ?? 10_000;
  ensureDir(path.dirname(params.lockPath));
  const deadline = Date.now() + timeoutMs;

  while (true) {
    try {
      mkdirSync(params.lockPath);
      break;
    } catch (error: unknown) {
      const code =
        typeof error === 'object' && error && 'code' in error
          ? String((error as { code?: unknown }).code)
          : '';
      if (code !== 'EEXIST') {
        throw error;
      }

      try {
        const stats = statSync(params.lockPath);
        if (Date.now() - stats.mtimeMs > staleLockMs) {
          rmSync(params.lockPath, { recursive: true, force: true });
          continue;
        }
      } catch {
        // Another actor may have released the lock.
      }

      if (Date.now() >= deadline) {
        throw new Error('EXTERNAL_INTEGRATION_LOCK_TIMEOUT');
      }

      await sleep(25);
    }
  }

  try {
    return await params.work();
  } finally {
    rmSync(params.lockPath, { recursive: true, force: true });
  }
}

function readJsonFile<T>(filePath: string): T | null {
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
  } catch {
    return null;
  }
}

function writeJsonAtomic(filePath: string, payload: unknown) {
  ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.${process.pid}.tmp`;
  writeFileSync(tempPath, JSON.stringify(payload, null, 2), 'utf-8');
  try {
    renameSync(tempPath, filePath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code === 'EEXIST' || code === 'EPERM' || code === 'ENOTEMPTY') {
      rmSync(filePath, { force: true });
      renameSync(tempPath, filePath);
      return;
    }
    rmSync(tempPath, { force: true });
    throw error;
  }
}

function buildEventPaths(integrationId: string, idempotencyKey: string | null) {
  const root = path.join(
    getExternalIntegrationStorageRoot(),
    'events',
    sanitizeSegment(integrationId, 'integration')
  );
  const recordId = sanitizeSegment(idempotencyKey, uuidv4());
  const filePath = path.join(root, `${recordId}.json`);
  const lockPath = path.join(root, `${recordId}.lock`);
  return { root, recordId, filePath, lockPath };
}

function buildProviderJobPath(
  provider: AsyncProviderName,
  userId: string,
  projectKey: string,
  remoteTaskId: string
) {
  const root = path.join(
    getExternalIntegrationStorageRoot(),
    'providers',
    sanitizeSegment(provider, 'provider'),
    sanitizeSegment(userId, 'user'),
    sanitizeSegment(projectKey, 'untitled_project')
  );
  const filePath = path.join(root, `${sanitizeSegment(remoteTaskId, 'task')}.json`);
  const lockPath = path.join(root, `${sanitizeSegment(remoteTaskId, 'task')}.lock`);
  return { root, filePath, lockPath };
}

function buildCircuitPath(provider: string, host: string) {
  const root = path.join(
    getExternalIntegrationStorageRoot(),
    'circuits',
    sanitizeSegment(provider, 'provider')
  );
  const filePath = path.join(root, `${sanitizeSegment(host, 'host')}.json`);
  const lockPath = path.join(root, `${sanitizeSegment(host, 'host')}.lock`);
  return { root, filePath, lockPath };
}

function buildNoncePath(integrationId: string, nonceKey: string) {
  const root = path.join(
    getExternalIntegrationStorageRoot(),
    'nonces',
    sanitizeSegment(integrationId, 'integration')
  );
  const fileName = sanitizeSegment(nonceKey, 'nonce');
  const filePath = path.join(root, `${fileName}.json`);
  const lockPath = path.join(root, `${fileName}.lock`);
  return { root, filePath, lockPath };
}

function buildSecurityAuditPath(userId: string | null | undefined, recordId: string) {
  const root = path.join(
    getExternalIntegrationStorageRoot(),
    'security-audit',
    sanitizeSegment(userId, 'anonymous')
  );
  const fileName = `${sanitizeSegment(recordId, 'audit')}.json`;
  const filePath = path.join(root, fileName);
  return { root, filePath };
}

export async function persistIntegrationEvent(params: {
  integrationId: string;
  eventType: string;
  source?: string | null;
  payload?: unknown;
  idempotencyKey?: string | null;
  rawBody: string;
}) {
  const normalizedIdempotencyKey = params.idempotencyKey?.trim() || null;
  const { recordId, filePath, lockPath } = buildEventPaths(
    params.integrationId,
    normalizedIdempotencyKey
  );

  return withWriteLock({
    lockPath,
    work: async () => {
      if (normalizedIdempotencyKey && existsSync(filePath)) {
        const existing = readJsonFile<IntegrationEventRecord>(filePath);
        if (existing) {
          return { duplicate: true, record: existing };
        }
      }

      const record: IntegrationEventRecord = {
        id: recordId,
        integrationId: params.integrationId,
        eventType: params.eventType,
        source: String(params.source || '').trim(),
        payload: params.payload,
        idempotencyKey: normalizedIdempotencyKey,
        bodyHash: createHash('sha256').update(params.rawBody, 'utf8').digest('hex'),
        receivedAt: Date.now(),
      };

      writeJsonAtomic(filePath, record);
      return { duplicate: false, record };
    },
  });
}

export function readIntegrationEventRecord(params: {
  integrationId: string;
  recordId: string;
}) {
  const root = path.join(
    getExternalIntegrationStorageRoot(),
    'events',
    sanitizeSegment(params.integrationId, 'integration')
  );
  return readJsonFile<IntegrationEventRecord>(
    path.join(root, `${sanitizeSegment(params.recordId, 'record')}.json`)
  );
}

export async function upsertProviderJobRecord(params: {
  provider: AsyncProviderName;
  userId: string;
  projectKey: string;
  action: string;
  remoteTaskId: string;
  status: ProviderJobRecord['status'];
  requestSummary?: Record<string, unknown>;
  result?: ProviderJobRecord['result'];
}) {
  const { filePath, lockPath } = buildProviderJobPath(
    params.provider,
    params.userId,
    params.projectKey,
    params.remoteTaskId
  );

  return withWriteLock({
    lockPath,
    work: async () => {
      const existing = readJsonFile<ProviderJobRecord>(filePath);
      const now = Date.now();
      const record: ProviderJobRecord = {
        id: existing?.id || `${params.provider}:${sanitizeSegment(params.remoteTaskId, 'task')}`,
        provider: params.provider,
        userId: sanitizeSegment(params.userId, 'user'),
        projectKey: sanitizeSegment(params.projectKey, 'untitled_project'),
        action: params.action,
        remoteTaskId: sanitizeSegment(params.remoteTaskId, 'task'),
        status: params.status,
        requestedAt: existing?.requestedAt || now,
        updatedAt: now,
        requestSummary: {
          ...(existing?.requestSummary || {}),
          ...(params.requestSummary || {}),
        },
        result: {
          ...(existing?.result || {}),
          ...(params.result || {}),
        },
      };
      writeJsonAtomic(filePath, record);
      return record;
    },
  });
}

export function readProviderJobRecord(params: {
  provider: AsyncProviderName;
  userId: string;
  projectKey: string;
  remoteTaskId: string;
}) {
  const { filePath } = buildProviderJobPath(
    params.provider,
    params.userId,
    params.projectKey,
    params.remoteTaskId
  );
  return readJsonFile<ProviderJobRecord>(filePath);
}

export function readRemoteProviderCircuitState(params: {
  provider: string;
  host: string;
}) {
  const { filePath } = buildCircuitPath(params.provider, params.host);
  return readJsonFile<RemoteProviderCircuitState>(filePath);
}

export async function markRemoteProviderCircuitSuccess(params: {
  provider: string;
  host: string;
}) {
  const { filePath, lockPath } = buildCircuitPath(params.provider, params.host);
  return withWriteLock({
    lockPath,
    work: async () => {
      const existing = readJsonFile<RemoteProviderCircuitState>(filePath);
      if (!existing && !existsSync(filePath)) {
        return null;
      }
      const next: RemoteProviderCircuitState = {
        provider: params.provider,
        host: params.host,
        consecutiveFailures: 0,
        updatedAt: Date.now(),
        openUntil: null,
      };
      writeJsonAtomic(filePath, next);
      return next;
    },
  });
}

export async function markRemoteProviderCircuitFailure(params: {
  provider: string;
  host: string;
  threshold: number;
  cooldownMs: number;
}) {
  const { filePath, lockPath } = buildCircuitPath(params.provider, params.host);
  return withWriteLock({
    lockPath,
    work: async () => {
      const existing = readJsonFile<RemoteProviderCircuitState>(filePath);
      const failures = (existing?.consecutiveFailures || 0) + 1;
      const shouldOpen = failures >= Math.max(1, params.threshold);
      const next: RemoteProviderCircuitState = {
        provider: params.provider,
        host: params.host,
        consecutiveFailures: failures,
        updatedAt: Date.now(),
        openUntil: shouldOpen ? Date.now() + Math.max(250, params.cooldownMs) : null,
      };
      writeJsonAtomic(filePath, next);
      return next;
    },
  });
}

export async function reserveIntegrationNonce(params: {
  integrationId: string;
  nonceKey: string;
  expiresAt: number;
}) {
  const { filePath, lockPath } = buildNoncePath(params.integrationId, params.nonceKey);

  return withWriteLock({
    lockPath,
    work: async () => {
      const nowMs = Date.now();
      const existing = readJsonFile<IntegrationNonceRecord>(filePath);
      if (existing && existing.expiresAt > nowMs) {
        return { reserved: false, record: existing };
      }

      const record: IntegrationNonceRecord = {
        id: existing?.id || `${sanitizeSegment(params.integrationId, 'integration')}:${params.nonceKey.slice(0, 24)}`,
        integrationId: sanitizeSegment(params.integrationId, 'integration'),
        nonceKey: params.nonceKey,
        expiresAt: Math.max(params.expiresAt, nowMs + 1_000),
        createdAt: nowMs,
      };

      writeJsonAtomic(filePath, record);
      return { reserved: true, record };
    },
  });
}

export async function persistDurableSecurityAuditLog(params: {
  userId?: string | null;
  action: string;
  target?: string | null;
  status: 'allowed' | 'denied' | 'error';
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: string | null;
  createdAt?: number;
}) {
  const createdAt = Math.max(0, params.createdAt || Date.now());
  const record: DurableSecurityAuditRecord = {
    id: `${createdAt}-${uuidv4()}`,
    userId: params.userId || null,
    action: params.action,
    target: params.target || null,
    status: params.status,
    ipAddress: params.ipAddress || null,
    userAgent: params.userAgent || null,
    metadata: params.metadata || null,
    createdAt,
    persistedBy: 'durable_fallback',
  };

  const { filePath } = buildSecurityAuditPath(record.userId, record.id);
  writeJsonAtomic(filePath, record);
  return record;
}

export function readDurableSecurityAuditLogs(params: {
  userId?: string | null;
  take?: number;
}) {
  const take = Math.max(1, Math.min(500, params.take || 200));
  const root = path.join(
    getExternalIntegrationStorageRoot(),
    'security-audit',
    sanitizeSegment(params.userId, 'anonymous')
  );

  if (!existsSync(root)) {
    return [] as DurableSecurityAuditRecord[];
  }

  const entries = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => readJsonFile<DurableSecurityAuditRecord>(path.join(root, entry.name)))
    .filter((entry): entry is DurableSecurityAuditRecord => entry !== null)
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, take);

  return entries;
}

export async function resetExternalIntegrationStorageForTest() {
  rmSync(getExternalIntegrationStorageRoot(), { recursive: true, force: true });
}

export const __externalIntegrationStoreInternals = {
  sanitizeSegment,
  buildEventPaths,
  buildProviderJobPath,
  buildCircuitPath,
  buildNoncePath,
  buildSecurityAuditPath,
  writeJsonAtomic,
  removeFileIfExists,
};
