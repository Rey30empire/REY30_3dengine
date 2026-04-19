import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getDeployStore, getStore } from '@netlify/blobs';
import {
  getScriptsRoot,
  resolveScriptBlobStoreName,
  resolveScriptStorageBackend,
  resolveScriptStorageScope,
} from '@/app/api/scripts/shared';
import { decryptText, encryptText } from '@/lib/security/crypto';
import type { ScriptRuntimeForensicsAdminNotification } from './script-runtime-artifacts';

const ARTIFACT_PREFIX = '__runtime_artifacts__';
const WEBHOOK_VERSION = 1 as const;
const WEBHOOK_ROOT_DIR = '.runtime-forensics-webhook';
const WEBHOOK_PREFIX = path.posix.join(ARTIFACT_PREFIX, '__runtime_forensics_webhook__');
const WEBHOOK_CONFIG_FILE = 'config.json';
const WEBHOOK_DELIVERY_RETENTION_POLICY_FILE = 'delivery-retention-policy.json';
const WEBHOOK_DELIVERIES_DIR = 'deliveries';
const WEBHOOK_DELIVERIES_PREFIX = path.posix.join(WEBHOOK_PREFIX, WEBHOOK_DELIVERIES_DIR);
const WEBHOOK_DELIVERY_PRUNE_AUDITS_DIR = 'delivery-prune-audit';
const WEBHOOK_DELIVERY_PRUNE_AUDITS_PREFIX = path.posix.join(
  WEBHOOK_PREFIX,
  WEBHOOK_DELIVERY_PRUNE_AUDITS_DIR
);
const WEBHOOK_DELIVERY_RETENTION_DEFAULT_MAX = 500;
const WEBHOOK_DELIVERY_RETENTION_DEFAULT_DAYS = 30;
const WEBHOOK_DELIVERY_RETENTION_MAX_CAP = 5_000;
const WEBHOOK_DELIVERY_LIST_MAX = 1_000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type RuntimeForensicsWebhookDeliveryStatus =
  | 'pending'
  | 'delivered'
  | 'failed'
  | 'blocked'
  | 'backoff'
  | 'skipped';

export type RuntimeForensicsWebhookDeliverySource = 'slo' | 'manual-test' | 'retry';

export interface RuntimeForensicsWebhookConfigRecord {
  version: typeof WEBHOOK_VERSION;
  enabled: boolean;
  encryptedUrl: string | null;
  encryptedSecret: string | null;
  hasSecret: boolean;
  allowlistHosts: string[];
  updatedAt: string;
  updatedBy: string | null;
}

export interface RuntimeForensicsWebhookDecryptedConfig {
  enabled: boolean;
  url: string | null;
  secret: string | null;
  hasSecret: boolean;
  allowlistHosts: string[];
  updatedAt: string;
  updatedBy: string | null;
}

export interface RuntimeForensicsWebhookDeliveryRecord {
  version: typeof WEBHOOK_VERSION;
  id: string;
  event: string;
  source: RuntimeForensicsWebhookDeliverySource;
  notificationId: string;
  alertId: string | null;
  notification: ScriptRuntimeForensicsAdminNotification | null;
  status: RuntimeForensicsWebhookDeliveryStatus;
  createdAt: string;
  updatedAt: string;
  lastAttemptAt: string | null;
  nextAttemptAt: string | null;
  deliveredAt: string | null;
  attemptCount: number;
  responseStatus: number | null;
  error: string | null;
  targetUrl: string | null;
  targetHost: string | null;
  payloadDigest: string | null;
  requestedBy: string | null;
}

export interface RuntimeForensicsWebhookDeliveryFilters {
  statuses?: RuntimeForensicsWebhookDeliveryStatus[];
  event?: string | null;
  from?: string | null;
  to?: string | null;
}

export interface RuntimeForensicsWebhookDeliveryRetentionPolicy {
  maxDeliveries: number;
  maxAgeDays: number;
  source?: 'defaults' | 'env' | 'request' | 'admin';
  updatedAt?: string | null;
  updatedBy?: string | null;
}

export interface RuntimeForensicsWebhookDeliveryPruneCandidate {
  id: string;
  createdAt: string;
  status: RuntimeForensicsWebhookDeliveryStatus;
  event: string;
  reason: 'count' | 'age' | 'count+age';
}

export interface RuntimeForensicsWebhookDeliveryPruneSummary {
  dryRun: boolean;
  deleted: number;
  wouldDelete: number;
  retained: number;
  policy: RuntimeForensicsWebhookDeliveryRetentionPolicy;
  candidates: RuntimeForensicsWebhookDeliveryPruneCandidate[];
  auditId?: string | null;
}

export interface RuntimeForensicsWebhookDeliveryPruneAuditEntry
  extends RuntimeForensicsWebhookDeliveryPruneSummary {
  id: string;
  createdAt: string;
  actorId: string | null;
  reason: string;
}

function getRuntimeArtifactsRoot(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(getScriptsRoot(env), '.rey30-runtime-artifacts');
}

function getWebhookRoot(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(getRuntimeArtifactsRoot(env), WEBHOOK_ROOT_DIR);
}

function getWebhookDeliveriesRoot(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(getWebhookRoot(env), WEBHOOK_DELIVERIES_DIR);
}

function getWebhookDeliveryPruneAuditsRoot(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(getWebhookRoot(env), WEBHOOK_DELIVERY_PRUNE_AUDITS_DIR);
}

function sanitizeSegment(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 140);
  return cleaned || 'webhook';
}

function readRetentionNumber(
  name: string,
  fallback: number,
  env: NodeJS.ProcessEnv = process.env
): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(WEBHOOK_DELIVERY_RETENTION_MAX_CAP, Math.round(value)));
}

export function getRuntimeForensicsWebhookDeliveryRetentionPolicy(
  env: NodeJS.ProcessEnv = process.env
): RuntimeForensicsWebhookDeliveryRetentionPolicy {
  const envConfigured =
    env.REY30_RUNTIME_FORENSICS_WEBHOOK_HISTORY_MAX !== undefined ||
    env.REY30_RUNTIME_FORENSICS_WEBHOOK_HISTORY_DAYS !== undefined;
  return {
    maxDeliveries: readRetentionNumber(
      'REY30_RUNTIME_FORENSICS_WEBHOOK_HISTORY_MAX',
      WEBHOOK_DELIVERY_RETENTION_DEFAULT_MAX,
      env
    ),
    maxAgeDays: readRetentionNumber(
      'REY30_RUNTIME_FORENSICS_WEBHOOK_HISTORY_DAYS',
      WEBHOOK_DELIVERY_RETENTION_DEFAULT_DAYS,
      env
    ),
    source: envConfigured ? 'env' : 'defaults',
    updatedAt: null,
    updatedBy: null,
  };
}

export function normalizeRuntimeForensicsWebhookDeliveryRetentionPolicy(
  policy: Partial<RuntimeForensicsWebhookDeliveryRetentionPolicy>,
  fallback = getRuntimeForensicsWebhookDeliveryRetentionPolicy()
): RuntimeForensicsWebhookDeliveryRetentionPolicy {
  const maxDeliveries = Number(policy.maxDeliveries);
  const maxAgeDays = Number(policy.maxAgeDays);
  return {
    maxDeliveries: Number.isFinite(maxDeliveries)
      ? Math.max(0, Math.min(WEBHOOK_DELIVERY_RETENTION_MAX_CAP, Math.round(maxDeliveries)))
      : fallback.maxDeliveries,
    maxAgeDays: Number.isFinite(maxAgeDays)
      ? Math.max(0, Math.min(WEBHOOK_DELIVERY_RETENTION_MAX_CAP, Math.round(maxAgeDays)))
      : fallback.maxAgeDays,
    source: policy.source || fallback.source || 'defaults',
    updatedAt: typeof policy.updatedAt === 'string' ? policy.updatedAt : fallback.updatedAt || null,
    updatedBy: typeof policy.updatedBy === 'string' ? policy.updatedBy : fallback.updatedBy || null,
  };
}

function parseDeliveryDateBound(value: string | null | undefined, endOfDay: boolean): number | null {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? `${trimmed}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`
    : trimmed;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeRuntimeForensicsWebhookAllowlist(input: unknown): string[] {
  const raw = Array.isArray(input)
    ? input
    : String(input || '')
        .split(',')
        .map((entry) => entry.trim());
  return Array.from(
    new Set(
      raw
        .map((entry) => {
          const value = String(entry || '').trim().toLowerCase();
          if (!value) return '';
          if (value.includes('://')) {
            try {
              return new URL(value).hostname.toLowerCase();
            } catch {
              return '';
            }
          }
          return value.replace(/[,\s]/g, '');
        })
        .filter(Boolean)
    )
  );
}

export function buildRuntimeForensicsWebhookDeliveryId(params: {
  event: string;
  notificationId: string;
  createdAt?: string | null;
}): string {
  const base = `${params.event}:${params.notificationId}:${params.createdAt || ''}`;
  const digest = createHash('sha256').update(base).digest('hex').slice(0, 12);
  return `${sanitizeSegment(params.event)}-${sanitizeSegment(params.notificationId)}-${digest}`;
}

export function hashRuntimeForensicsWebhookPayload(payload: string): string {
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}

function resolveBlobStore() {
  const backend = resolveScriptStorageBackend();
  const scope = resolveScriptStorageScope();
  const storeName = resolveScriptBlobStoreName();
  if (backend !== 'netlify-blobs') {
    throw new Error('Runtime forensics webhook storage is not configured for Netlify Blobs.');
  }
  return scope === 'global' ? getStore(storeName) : getDeployStore(storeName);
}

function getConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(getWebhookRoot(env), WEBHOOK_CONFIG_FILE);
}

function getConfigBlobKey(): string {
  return path.posix.join(WEBHOOK_PREFIX, WEBHOOK_CONFIG_FILE);
}

function getDeliveryRetentionPolicyPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(getWebhookRoot(env), WEBHOOK_DELIVERY_RETENTION_POLICY_FILE);
}

function getDeliveryRetentionPolicyBlobKey(): string {
  return path.posix.join(WEBHOOK_PREFIX, WEBHOOK_DELIVERY_RETENTION_POLICY_FILE);
}

function getDeliveryPath(id: string, env: NodeJS.ProcessEnv = process.env): string {
  return path.join(getWebhookDeliveriesRoot(env), `${sanitizeSegment(id)}.json`);
}

function getDeliveryBlobKey(id: string): string {
  return path.posix.join(WEBHOOK_DELIVERIES_PREFIX, `${sanitizeSegment(id)}.json`);
}

function getDeliveryPruneAuditPath(id: string, env: NodeJS.ProcessEnv = process.env): string {
  return path.join(getWebhookDeliveryPruneAuditsRoot(env), `${sanitizeSegment(id)}.json`);
}

function getDeliveryPruneAuditBlobKey(id: string): string {
  return path.posix.join(WEBHOOK_DELIVERY_PRUNE_AUDITS_PREFIX, `${sanitizeSegment(id)}.json`);
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8')) as T;
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'ENOENT'
    ) {
      return null;
    }
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function toConfigRecord(value: unknown): RuntimeForensicsWebhookConfigRecord | null {
  const data = value && typeof value === 'object' ? value as RuntimeForensicsWebhookConfigRecord : null;
  if (!data || data.version !== WEBHOOK_VERSION) return null;
  return {
    version: WEBHOOK_VERSION,
    enabled: data.enabled !== false,
    encryptedUrl: typeof data.encryptedUrl === 'string' ? data.encryptedUrl : null,
    encryptedSecret: typeof data.encryptedSecret === 'string' ? data.encryptedSecret : null,
    hasSecret: Boolean(data.hasSecret && data.encryptedSecret),
    allowlistHosts: normalizeRuntimeForensicsWebhookAllowlist(data.allowlistHosts),
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString(),
    updatedBy: typeof data.updatedBy === 'string' ? data.updatedBy : null,
  };
}

function toDeliveryRecord(value: unknown): RuntimeForensicsWebhookDeliveryRecord | null {
  const data =
    value && typeof value === 'object' ? value as Partial<RuntimeForensicsWebhookDeliveryRecord> : null;
  if (!data || data.version !== WEBHOOK_VERSION || typeof data.id !== 'string') return null;
  const now = new Date().toISOString();
  const status: RuntimeForensicsWebhookDeliveryStatus =
    data.status === 'delivered' ||
    data.status === 'failed' ||
    data.status === 'blocked' ||
    data.status === 'backoff' ||
    data.status === 'skipped'
      ? data.status
      : 'pending';
  const source: RuntimeForensicsWebhookDeliverySource =
    data.source === 'manual-test' || data.source === 'retry' ? data.source : 'slo';
  return {
    version: WEBHOOK_VERSION,
    id: data.id,
    event: typeof data.event === 'string' ? data.event : 'runtime_forensics.slo_alert',
    source,
    notificationId: typeof data.notificationId === 'string' ? data.notificationId : data.id,
    alertId: typeof data.alertId === 'string' ? data.alertId : null,
    notification:
      data.notification && typeof data.notification === 'object'
        ? data.notification as ScriptRuntimeForensicsAdminNotification
        : null,
    status,
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : now,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : now,
    lastAttemptAt: typeof data.lastAttemptAt === 'string' ? data.lastAttemptAt : null,
    nextAttemptAt: typeof data.nextAttemptAt === 'string' ? data.nextAttemptAt : null,
    deliveredAt: typeof data.deliveredAt === 'string' ? data.deliveredAt : null,
    attemptCount: Math.max(0, Math.round(Number(data.attemptCount) || 0)),
    responseStatus: Number.isFinite(Number(data.responseStatus)) ? Number(data.responseStatus) : null,
    error: typeof data.error === 'string' ? data.error : null,
    targetUrl: typeof data.targetUrl === 'string' ? data.targetUrl : null,
    targetHost: typeof data.targetHost === 'string' ? data.targetHost : null,
    payloadDigest: typeof data.payloadDigest === 'string' ? data.payloadDigest : null,
    requestedBy: typeof data.requestedBy === 'string' ? data.requestedBy : null,
  };
}

function toDeliveryRetentionPolicy(
  value: unknown
): RuntimeForensicsWebhookDeliveryRetentionPolicy | null {
  const data = value && typeof value === 'object'
    ? value as Partial<RuntimeForensicsWebhookDeliveryRetentionPolicy> & { version?: unknown }
    : null;
  if (!data || data.version !== WEBHOOK_VERSION) return null;
  return normalizeRuntimeForensicsWebhookDeliveryRetentionPolicy({
    maxDeliveries: data.maxDeliveries,
    maxAgeDays: data.maxAgeDays,
    source:
      data.source === 'admin' ||
      data.source === 'env' ||
      data.source === 'request' ||
      data.source === 'defaults'
        ? data.source
        : 'admin',
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : null,
    updatedBy: typeof data.updatedBy === 'string' ? data.updatedBy : null,
  });
}

function toPruneAuditEntry(value: unknown): RuntimeForensicsWebhookDeliveryPruneAuditEntry | null {
  const data =
    value && typeof value === 'object'
      ? value as Partial<RuntimeForensicsWebhookDeliveryPruneAuditEntry> & { version?: unknown }
      : null;
  if (!data || data.version !== WEBHOOK_VERSION || typeof data.id !== 'string') return null;
  const policy = normalizeRuntimeForensicsWebhookDeliveryRetentionPolicy(data.policy || {});
  const candidates = Array.isArray(data.candidates)
    ? data.candidates.flatMap((candidate): RuntimeForensicsWebhookDeliveryPruneCandidate[] => {
        if (!candidate || typeof candidate !== 'object') return [];
        const item = candidate as Partial<RuntimeForensicsWebhookDeliveryPruneCandidate>;
        if (typeof item.id !== 'string') return [];
        const status: RuntimeForensicsWebhookDeliveryStatus =
          item.status === 'pending' ||
          item.status === 'delivered' ||
          item.status === 'failed' ||
          item.status === 'blocked' ||
          item.status === 'backoff' ||
          item.status === 'skipped'
            ? item.status
            : 'failed';
        return [
          {
            id: item.id,
            createdAt: typeof item.createdAt === 'string' ? item.createdAt : '',
            status,
            event: typeof item.event === 'string' ? item.event : 'runtime_forensics.slo_alert',
            reason:
              item.reason === 'count' || item.reason === 'age' || item.reason === 'count+age'
                ? item.reason
                : 'age',
          },
        ];
      })
    : [];
  return {
    id: data.id,
    auditId: typeof data.auditId === 'string' ? data.auditId : data.id,
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : new Date().toISOString(),
    actorId: typeof data.actorId === 'string' ? data.actorId : null,
    reason: typeof data.reason === 'string' ? data.reason : 'manual-prune',
    dryRun: Boolean(data.dryRun),
    deleted: Math.max(0, Math.round(Number(data.deleted) || 0)),
    wouldDelete: Math.max(0, Math.round(Number(data.wouldDelete) || 0)),
    retained: Math.max(0, Math.round(Number(data.retained) || 0)),
    policy,
    candidates,
  };
}

export async function getRuntimeForensicsWebhookConfigRecord(): Promise<RuntimeForensicsWebhookConfigRecord | null> {
  if (resolveScriptStorageBackend() === 'filesystem') {
    return toConfigRecord(await readJsonFile(getConfigPath()));
  }
  const store = resolveBlobStore();
  const document = await store.get(getConfigBlobKey(), { type: 'json' });
  return toConfigRecord(document);
}

export function decryptRuntimeForensicsWebhookConfig(
  record: RuntimeForensicsWebhookConfigRecord
): RuntimeForensicsWebhookDecryptedConfig {
  const url = record.encryptedUrl ? decryptText(record.encryptedUrl) : '';
  const secret = record.encryptedSecret ? decryptText(record.encryptedSecret) : '';
  return {
    enabled: record.enabled,
    url: url || null,
    secret: secret || null,
    hasSecret: Boolean(secret),
    allowlistHosts: record.allowlistHosts,
    updatedAt: record.updatedAt,
    updatedBy: record.updatedBy,
  };
}

export async function putRuntimeForensicsWebhookConfig(params: {
  enabled: boolean;
  url?: string | null;
  preserveUrl?: boolean;
  secret?: string | null;
  preserveSecret?: boolean;
  allowlistHosts?: unknown;
  updatedBy?: string | null;
}): Promise<RuntimeForensicsWebhookConfigRecord> {
  const existing = await getRuntimeForensicsWebhookConfigRecord();
  const encryptedSecret =
    params.preserveSecret && params.secret === undefined
      ? existing?.encryptedSecret || null
      : params.secret
        ? encryptText(params.secret)
        : null;
  const record: RuntimeForensicsWebhookConfigRecord = {
    version: WEBHOOK_VERSION,
    enabled: Boolean(params.enabled),
    encryptedUrl:
      params.preserveUrl && params.url === undefined
        ? existing?.encryptedUrl || null
        : params.url
          ? encryptText(params.url.trim())
          : null,
    encryptedSecret,
    hasSecret: Boolean(encryptedSecret),
    allowlistHosts: normalizeRuntimeForensicsWebhookAllowlist(params.allowlistHosts),
    updatedAt: new Date().toISOString(),
    updatedBy: params.updatedBy || null,
  };
  if (resolveScriptStorageBackend() === 'filesystem') {
    await writeJsonFile(getConfigPath(), record);
  } else {
    await resolveBlobStore().setJSON(getConfigBlobKey(), record);
  }
  return record;
}

export async function deleteRuntimeForensicsWebhookConfig(): Promise<void> {
  if (resolveScriptStorageBackend() === 'filesystem') {
    await fs.unlink(getConfigPath()).catch((error) => {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: unknown }).code === 'ENOENT'
      ) {
        return;
      }
      throw error;
    });
  } else {
    await resolveBlobStore().delete(getConfigBlobKey());
  }
}

async function getStoredRuntimeForensicsWebhookDeliveryRetentionPolicy(): Promise<
  RuntimeForensicsWebhookDeliveryRetentionPolicy | null
> {
  if (resolveScriptStorageBackend() === 'filesystem') {
    return toDeliveryRetentionPolicy(await readJsonFile(getDeliveryRetentionPolicyPath()));
  }
  const document = await resolveBlobStore().get(getDeliveryRetentionPolicyBlobKey(), { type: 'json' });
  return toDeliveryRetentionPolicy(document);
}

export async function getConfiguredRuntimeForensicsWebhookDeliveryRetentionPolicy(): Promise<
  RuntimeForensicsWebhookDeliveryRetentionPolicy
> {
  return (
    (await getStoredRuntimeForensicsWebhookDeliveryRetentionPolicy()) ||
    getRuntimeForensicsWebhookDeliveryRetentionPolicy()
  );
}

export async function putRuntimeForensicsWebhookDeliveryRetentionPolicy(params: {
  maxDeliveries: number;
  maxAgeDays: number;
  updatedBy?: string | null;
  updatedAt?: string;
}): Promise<RuntimeForensicsWebhookDeliveryRetentionPolicy> {
  const policy = normalizeRuntimeForensicsWebhookDeliveryRetentionPolicy({
    maxDeliveries: params.maxDeliveries,
    maxAgeDays: params.maxAgeDays,
    source: 'admin',
    updatedAt: params.updatedAt || new Date().toISOString(),
    updatedBy: params.updatedBy || null,
  });
  const document = {
    version: WEBHOOK_VERSION,
    ...policy,
  };
  if (resolveScriptStorageBackend() === 'filesystem') {
    await writeJsonFile(getDeliveryRetentionPolicyPath(), document);
  } else {
    await resolveBlobStore().setJSON(getDeliveryRetentionPolicyBlobKey(), document);
  }
  return policy;
}

export async function getRuntimeForensicsWebhookDelivery(
  id: string
): Promise<RuntimeForensicsWebhookDeliveryRecord | null> {
  if (resolveScriptStorageBackend() === 'filesystem') {
    return toDeliveryRecord(await readJsonFile(getDeliveryPath(id)));
  }
  const document = await resolveBlobStore().get(getDeliveryBlobKey(id), { type: 'json' });
  return toDeliveryRecord(document);
}

export async function putRuntimeForensicsWebhookDelivery(
  input: RuntimeForensicsWebhookDeliveryRecord
): Promise<RuntimeForensicsWebhookDeliveryRecord> {
  const record = toDeliveryRecord({
    ...input,
    version: WEBHOOK_VERSION,
    updatedAt: input.updatedAt || new Date().toISOString(),
  });
  if (!record) {
    throw new Error('Invalid runtime forensics webhook delivery record.');
  }
  if (resolveScriptStorageBackend() === 'filesystem') {
    await writeJsonFile(getDeliveryPath(record.id), record);
  } else {
    await resolveBlobStore().setJSON(getDeliveryBlobKey(record.id), record);
  }
  await pruneRuntimeForensicsWebhookDeliveries({
    protectedIds: new Set([record.id]),
  });
  return record;
}

export async function deleteRuntimeForensicsWebhookDelivery(id: string): Promise<void> {
  if (resolveScriptStorageBackend() === 'filesystem') {
    await fs.unlink(getDeliveryPath(id)).catch((error) => {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: unknown }).code === 'ENOENT'
      ) {
        return;
      }
      throw error;
    });
  } else {
    await resolveBlobStore().delete(getDeliveryBlobKey(id));
  }
}

async function listAllFilesystemDeliveries(): Promise<RuntimeForensicsWebhookDeliveryRecord[]> {
  const entries = await fs.readdir(getWebhookDeliveriesRoot(), { withFileTypes: true }).catch((error) => {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'ENOENT'
    ) {
      return [];
    }
    throw error;
  });
  const deliveries = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => getRuntimeForensicsWebhookDelivery(entry.name.slice(0, -'.json'.length)))
  );
  return deliveries.filter(Boolean) as RuntimeForensicsWebhookDeliveryRecord[];
}

async function listAllFilesystemDeliveryPruneAudits(): Promise<
  RuntimeForensicsWebhookDeliveryPruneAuditEntry[]
> {
  const entries = await fs.readdir(getWebhookDeliveryPruneAuditsRoot(), { withFileTypes: true }).catch((error) => {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'ENOENT'
    ) {
      return [];
    }
    throw error;
  });
  const audits = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => readJsonFile(getDeliveryPruneAuditPath(entry.name.slice(0, -'.json'.length))))
  );
  return audits.map(toPruneAuditEntry).filter(Boolean) as RuntimeForensicsWebhookDeliveryPruneAuditEntry[];
}

async function listAllBlobDeliveries(): Promise<RuntimeForensicsWebhookDeliveryRecord[]> {
  const store = resolveBlobStore() as ReturnType<typeof resolveBlobStore> & {
    list?: (options?: { prefix?: string }) => Promise<{ blobs?: Array<{ key: string }> }>;
  };
  if (typeof store.list !== 'function') return [];
  const listed = await store.list({ prefix: WEBHOOK_DELIVERIES_PREFIX });
  const deliveries = await Promise.all(
    (listed.blobs || [])
      .map((blob) => blob.key)
      .filter((key) => key.endsWith('.json'))
      .map(async (key) => toDeliveryRecord(await store.get(key, { type: 'json' })))
  );
  return deliveries.filter(Boolean) as RuntimeForensicsWebhookDeliveryRecord[];
}

async function listAllBlobDeliveryPruneAudits(): Promise<
  RuntimeForensicsWebhookDeliveryPruneAuditEntry[]
> {
  const store = resolveBlobStore() as ReturnType<typeof resolveBlobStore> & {
    list?: (options?: { prefix?: string }) => Promise<{ blobs?: Array<{ key: string }> }>;
  };
  if (typeof store.list !== 'function') return [];
  const listed = await store.list({ prefix: WEBHOOK_DELIVERY_PRUNE_AUDITS_PREFIX });
  const audits = await Promise.all(
    (listed.blobs || [])
      .map((blob) => blob.key)
      .filter((key) => key.endsWith('.json'))
      .map(async (key) => toPruneAuditEntry(await store.get(key, { type: 'json' })))
  );
  return audits.filter(Boolean) as RuntimeForensicsWebhookDeliveryPruneAuditEntry[];
}

async function listAllRuntimeForensicsWebhookDeliveries(): Promise<RuntimeForensicsWebhookDeliveryRecord[]> {
  const deliveries =
    resolveScriptStorageBackend() === 'filesystem'
      ? await listAllFilesystemDeliveries()
      : await listAllBlobDeliveries();
  return deliveries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function listRuntimeForensicsWebhookDeliveries(
  limit = 50
): Promise<RuntimeForensicsWebhookDeliveryRecord[]> {
  return (await listAllRuntimeForensicsWebhookDeliveries())
    .slice(0, Math.max(1, Math.min(WEBHOOK_DELIVERY_LIST_MAX, limit)));
}

async function putRuntimeForensicsWebhookDeliveryPruneAudit(
  entry: RuntimeForensicsWebhookDeliveryPruneAuditEntry
): Promise<void> {
  const document = {
    version: WEBHOOK_VERSION,
    ...entry,
  };
  if (resolveScriptStorageBackend() === 'filesystem') {
    await writeJsonFile(getDeliveryPruneAuditPath(entry.id), document);
  } else {
    await resolveBlobStore().setJSON(getDeliveryPruneAuditBlobKey(entry.id), document);
  }
}

export async function listRuntimeForensicsWebhookDeliveryPruneAudits(
  limit = 20
): Promise<RuntimeForensicsWebhookDeliveryPruneAuditEntry[]> {
  const audits =
    resolveScriptStorageBackend() === 'filesystem'
      ? await listAllFilesystemDeliveryPruneAudits()
      : await listAllBlobDeliveryPruneAudits();
  return audits
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, Math.max(1, Math.min(100, limit)));
}

export function filterRuntimeForensicsWebhookDeliveries(
  deliveries: RuntimeForensicsWebhookDeliveryRecord[],
  filters: RuntimeForensicsWebhookDeliveryFilters = {}
): RuntimeForensicsWebhookDeliveryRecord[] {
  const statuses = new Set(
    (filters.statuses || []).filter(
      (status): status is RuntimeForensicsWebhookDeliveryStatus =>
        status === 'pending' ||
        status === 'delivered' ||
        status === 'failed' ||
        status === 'blocked' ||
        status === 'backoff' ||
        status === 'skipped'
    )
  );
  const eventFilter = String(filters.event || '').trim().toLowerCase();
  const fromMs = parseDeliveryDateBound(filters.from, false);
  const toMs = parseDeliveryDateBound(filters.to, true);

  return deliveries.filter((delivery) => {
    if (statuses.size > 0 && !statuses.has(delivery.status)) return false;
    if (eventFilter && !delivery.event.toLowerCase().includes(eventFilter)) return false;
    const createdAtMs = Date.parse(delivery.createdAt);
    if (fromMs !== null && Number.isFinite(createdAtMs) && createdAtMs < fromMs) return false;
    if (toMs !== null && Number.isFinite(createdAtMs) && createdAtMs > toMs) return false;
    return true;
  });
}

export async function pruneRuntimeForensicsWebhookDeliveries(params: {
  policy?: Partial<RuntimeForensicsWebhookDeliveryRetentionPolicy>;
  now?: number;
  protectedIds?: Set<string>;
  dryRun?: boolean;
  actorId?: string | null;
  reason?: string;
} = {}): Promise<RuntimeForensicsWebhookDeliveryPruneSummary> {
  const policy = params.policy
    ? normalizeRuntimeForensicsWebhookDeliveryRetentionPolicy(params.policy)
    : await getConfiguredRuntimeForensicsWebhookDeliveryRetentionPolicy();
  const now = params.now ?? Date.now();
  const protectedIds = params.protectedIds || new Set<string>();
  const deliveries = await listAllRuntimeForensicsWebhookDeliveries();
  const cutoffMs = policy.maxAgeDays > 0 ? now - policy.maxAgeDays * MS_PER_DAY : null;
  const candidates = deliveries.flatMap(
    (delivery, index): RuntimeForensicsWebhookDeliveryPruneCandidate[] => {
      if (protectedIds.has(delivery.id)) return [];
      const overCountLimit = policy.maxDeliveries > 0 && index >= policy.maxDeliveries;
      const createdAtMs = Date.parse(delivery.createdAt);
      const overAgeLimit =
        cutoffMs !== null && Number.isFinite(createdAtMs) && createdAtMs < cutoffMs;
      if (!overCountLimit && !overAgeLimit) return [];
      return [
        {
          id: delivery.id,
          createdAt: delivery.createdAt,
          status: delivery.status,
          event: delivery.event,
          reason:
            overCountLimit && overAgeLimit
              ? 'count+age'
              : overCountLimit
                ? 'count'
                : 'age',
        },
      ];
    }
  );

  if (!params.dryRun) {
    await Promise.all(candidates.map((candidate) => deleteRuntimeForensicsWebhookDelivery(candidate.id)));
  }

  const createdAt = new Date(now).toISOString();
  const auditId = `webhook-${params.dryRun ? 'dry-run' : 'prune'}-${sanitizeSegment(createdAt)}`;
  const summary: RuntimeForensicsWebhookDeliveryPruneSummary = {
    dryRun: Boolean(params.dryRun),
    deleted: params.dryRun ? 0 : candidates.length,
    wouldDelete: candidates.length,
    retained: params.dryRun
      ? deliveries.length
      : Math.max(0, deliveries.length - candidates.length),
    policy,
    candidates,
    auditId: params.actorId !== undefined || params.reason ? auditId : null,
  };

  if (params.actorId !== undefined || params.reason) {
    await putRuntimeForensicsWebhookDeliveryPruneAudit({
      ...summary,
      id: auditId,
      auditId,
      createdAt,
      actorId: params.actorId || null,
      reason: params.reason || (params.dryRun ? 'manual-dry-run' : 'manual-prune'),
    });
  }

  return summary;
}

export async function listRuntimeForensicsWebhookDeliveriesReadyForRetry(
  limit = 25,
  now = Date.now()
): Promise<RuntimeForensicsWebhookDeliveryRecord[]> {
  return (await listRuntimeForensicsWebhookDeliveries(200))
    .filter((delivery) => {
      if (delivery.status !== 'backoff' && delivery.status !== 'failed' && delivery.status !== 'blocked') {
        return false;
      }
      if (!delivery.notification) return false;
      if (!delivery.nextAttemptAt) return delivery.status !== 'blocked';
      const nextMs = Date.parse(delivery.nextAttemptAt);
      return Number.isFinite(nextMs) && nextMs <= now;
    })
    .slice(0, Math.max(1, Math.min(50, limit)));
}

function escapeCsvValue(value: unknown): string {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function runtimeForensicsWebhookDeliveriesToCsv(
  deliveries: RuntimeForensicsWebhookDeliveryRecord[]
): string {
  const headers = [
    'id',
    'event',
    'source',
    'notificationId',
    'alertId',
    'status',
    'createdAt',
    'updatedAt',
    'lastAttemptAt',
    'nextAttemptAt',
    'deliveredAt',
    'attemptCount',
    'responseStatus',
    'targetHost',
    'payloadDigest',
    'requestedBy',
    'error',
  ];
  const rows = deliveries.map((delivery) => [
    delivery.id,
    delivery.event,
    delivery.source,
    delivery.notificationId,
    delivery.alertId || '',
    delivery.status,
    delivery.createdAt,
    delivery.updatedAt,
    delivery.lastAttemptAt || '',
    delivery.nextAttemptAt || '',
    delivery.deliveredAt || '',
    delivery.attemptCount,
    delivery.responseStatus ?? '',
    delivery.targetHost || '',
    delivery.payloadDigest || '',
    delivery.requestedBy || '',
    delivery.error || '',
  ]);
  return [headers, ...rows].map((row) => row.map(escapeCsvValue).join(',')).join('\n');
}

export function runtimeForensicsWebhookDeliveryPruneAuditsToCsv(
  audits: RuntimeForensicsWebhookDeliveryPruneAuditEntry[]
): string {
  const headers = [
    'id',
    'createdAt',
    'actorId',
    'reason',
    'dryRun',
    'deleted',
    'wouldDelete',
    'retained',
    'maxDeliveries',
    'maxAgeDays',
    'candidateCount',
  ];
  const rows = audits.map((audit) => [
    audit.id,
    audit.createdAt,
    audit.actorId || '',
    audit.reason,
    audit.dryRun,
    audit.deleted,
    audit.wouldDelete,
    audit.retained,
    audit.policy.maxDeliveries,
    audit.policy.maxAgeDays,
    audit.candidates.length,
  ]);
  return [headers, ...rows].map((row) => row.map(escapeCsvValue).join(',')).join('\n');
}
