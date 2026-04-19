import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getDeployStore, getStore } from '@netlify/blobs';
import type { CompiledScriptRuntimeArtifact } from './script-runtime-compiler';
import {
  assertValidScriptRelativePath,
  getScriptsRoot,
  resolveScriptBlobStoreName,
  resolveScriptStorageBackend,
  resolveScriptStorageScope,
} from '@/app/api/scripts/shared';

const ARTIFACT_VERSION = 1 as const;
const ARTIFACT_PREFIX = '__runtime_artifacts__';
const VERIFICATION_HISTORY_VERSION = 1 as const;
const VERIFICATION_HISTORY_DIR = '.verification-history';
const VERIFICATION_HISTORY_PREFIX = path.posix.join(ARTIFACT_PREFIX, '__verification_history__');
const FAULT_LEDGER_VERSION = 1 as const;
const FAULT_LEDGER_DIR = '.fault-ledger';
const FAULT_LEDGER_PREFIX = path.posix.join(ARTIFACT_PREFIX, '__fault_ledger__');
const FAULT_LEDGER_POLICY_VERSION = 1 as const;
const FAULT_LEDGER_POLICY_FILE = '.fault-ledger-retention-policy.json';
const FAULT_LEDGER_POLICY_BLOB_KEY = path.posix.join(
  ARTIFACT_PREFIX,
  '__fault_ledger_retention_policy__.json'
);
const FAULT_LEDGER_AUDIT_VERSION = 1 as const;
const FAULT_LEDGER_AUDIT_DIR = '.fault-ledger-audit';
const FAULT_LEDGER_AUDIT_PREFIX = path.posix.join(ARTIFACT_PREFIX, '__fault_ledger_audit__');
const RUNTIME_FORENSICS_NOTIFICATION_VERSION = 1 as const;
const RUNTIME_FORENSICS_NOTIFICATION_DIR = '.runtime-forensics-notifications';
const RUNTIME_FORENSICS_NOTIFICATION_PREFIX = path.posix.join(
  ARTIFACT_PREFIX,
  '__runtime_forensics_notifications__'
);
const RUNTIME_FORENSICS_NOTIFICATION_RETENTION_DEFAULT_MAX = 200;
const RUNTIME_FORENSICS_NOTIFICATION_RETENTION_DEFAULT_DAYS = 30;
const FAULT_LEDGER_RETENTION_DEFAULT_MAX = 500;
const FAULT_LEDGER_RETENTION_DEFAULT_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface ScriptRuntimeArtifactStorageInfo {
  backend: 'filesystem' | 'netlify-blobs';
  scope: 'filesystem' | 'deploy' | 'global';
  root?: string;
  storeName?: string;
}

export interface ScriptRuntimeArtifactStorageStatus extends ScriptRuntimeArtifactStorageInfo {
  available: boolean;
  error?: string;
}

interface ScriptRuntimeArtifactDocument extends CompiledScriptRuntimeArtifact {
  version: typeof ARTIFACT_VERSION;
  relativePath: string;
}

export interface ScriptRuntimeArtifactVerificationRecord {
  scriptId: string;
  okCount: number;
  failedCount: number;
  lastStatus: 'ok' | 'failed';
  lastVerifiedAt: string;
  lastMessage: string | null;
}

interface ScriptRuntimeArtifactVerificationDocument
  extends ScriptRuntimeArtifactVerificationRecord {
  version: typeof VERIFICATION_HISTORY_VERSION;
  relativePath: string;
}

export interface ScriptRuntimeFaultLedgerSnapshotItem {
  severity: 'P0' | 'P1' | 'P2';
  source: 'legacy' | 'scrib' | 'node';
  target: string;
  state: string;
  action: string;
  detail: string;
  verificationStatus: 'ok' | 'failed' | null;
  verificationOkCount: number;
  verificationFailedCount: number;
}

export interface ScriptRuntimeFaultLedgerSnapshot {
  id: string;
  instanceId: string;
  sessionId: string | null;
  playState: string;
  generatedAt: string;
  itemCount: number;
  p0Count: number;
  p1Count: number;
  p2Count: number;
  items: ScriptRuntimeFaultLedgerSnapshotItem[];
}

export type ScriptRuntimeFaultLedgerSeverity = ScriptRuntimeFaultLedgerSnapshotItem['severity'];

export interface ScriptRuntimeFaultLedgerSnapshotFilters {
  severities?: ScriptRuntimeFaultLedgerSeverity[];
  target?: string | null;
  from?: string | null;
  to?: string | null;
}

export interface ScriptRuntimeFaultLedgerRetentionPolicy {
  maxSnapshots: number;
  maxAgeDays: number;
  source?: 'defaults' | 'env' | 'admin';
  updatedAt?: string | null;
  updatedBy?: string | null;
}

export interface ScriptRuntimeFaultLedgerPruneCandidate {
  id: string;
  generatedAt: string;
  itemCount: number;
  p0Count: number;
  reason: 'count' | 'age' | 'count+age';
}

export interface ScriptRuntimeFaultLedgerPruneSummary {
  dryRun: boolean;
  deleted: number;
  wouldDelete: number;
  retained: number;
  policy: ScriptRuntimeFaultLedgerRetentionPolicy;
  candidates: ScriptRuntimeFaultLedgerPruneCandidate[];
  auditId?: string | null;
}

export interface ScriptRuntimeFaultLedgerPruneAuditEntry
  extends ScriptRuntimeFaultLedgerPruneSummary {
  id: string;
  createdAt: string;
  actorId: string | null;
  reason: string;
}

export interface ScriptRuntimeForensicsAdminNotification {
  id: string;
  alertId: string;
  createdAt: string;
  acknowledgedAt: string | null;
  level: 'warning' | 'critical';
  indicator: string;
  title: string;
  message: string;
  current: number;
  objective: number;
  createdBy: string | null;
  acknowledgedBy: string | null;
  source: 'slo' | 'manual' | 'imported';
}

export interface ScriptRuntimeForensicsAdminNotificationRetentionPolicy {
  maxNotifications: number;
  maxAgeDays: number;
  source?: 'defaults' | 'env' | 'request';
}

export interface ScriptRuntimeForensicsAdminNotificationPruneCandidate {
  id: string;
  createdAt: string;
  level: ScriptRuntimeForensicsAdminNotification['level'];
  indicator: string;
  reason: 'count' | 'age' | 'count+age';
}

export interface ScriptRuntimeForensicsAdminNotificationPruneSummary {
  dryRun: boolean;
  deleted: number;
  wouldDelete: number;
  retained: number;
  policy: ScriptRuntimeForensicsAdminNotificationRetentionPolicy;
  candidates: ScriptRuntimeForensicsAdminNotificationPruneCandidate[];
}

interface ScriptRuntimeFaultLedgerSnapshotDocument
  extends ScriptRuntimeFaultLedgerSnapshot {
  version: typeof FAULT_LEDGER_VERSION;
}

interface ScriptRuntimeFaultLedgerRetentionPolicyDocument
  extends ScriptRuntimeFaultLedgerRetentionPolicy {
  version: typeof FAULT_LEDGER_POLICY_VERSION;
}

interface ScriptRuntimeFaultLedgerPruneAuditDocument
  extends ScriptRuntimeFaultLedgerPruneAuditEntry {
  version: typeof FAULT_LEDGER_AUDIT_VERSION;
}

interface ScriptRuntimeForensicsAdminNotificationDocument
  extends ScriptRuntimeForensicsAdminNotification {
  version: typeof RUNTIME_FORENSICS_NOTIFICATION_VERSION;
}

function getRuntimeArtifactsRoot(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(getScriptsRoot(env), '.rey30-runtime-artifacts');
}

function getVerificationHistoryRoot(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(getRuntimeArtifactsRoot(env), VERIFICATION_HISTORY_DIR);
}

function getFaultLedgerRoot(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(getRuntimeArtifactsRoot(env), FAULT_LEDGER_DIR);
}

function getFaultLedgerAuditRoot(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(getRuntimeArtifactsRoot(env), FAULT_LEDGER_AUDIT_DIR);
}

function getRuntimeForensicsNotificationRoot(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(getRuntimeArtifactsRoot(env), RUNTIME_FORENSICS_NOTIFICATION_DIR);
}

function getBlobKey(relativePath: string): string {
  return path.posix.join(ARTIFACT_PREFIX, `${relativePath}.json`);
}

function getVerificationBlobKey(relativePath: string): string {
  return path.posix.join(VERIFICATION_HISTORY_PREFIX, `${relativePath}.json`);
}

function sanitizeLedgerSegment(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 120);
  return cleaned || 'runtime';
}

function buildFaultLedgerSnapshotId(instanceId: string, generatedAt: string): string {
  return `${sanitizeLedgerSegment(instanceId)}-${sanitizeLedgerSegment(generatedAt)}`;
}

function getFaultLedgerBlobKey(id: string): string {
  return path.posix.join(FAULT_LEDGER_PREFIX, `${sanitizeLedgerSegment(id)}.json`);
}

function resolveBlobStore() {
  const backend = resolveScriptStorageBackend();
  const scope = resolveScriptStorageScope();
  const storeName = resolveScriptBlobStoreName();
  if (backend !== 'netlify-blobs') {
    throw new Error('Script runtime artifacts are not configured for Netlify Blobs.');
  }
  return scope === 'global' ? getStore(storeName) : getDeployStore(storeName);
}

export function getScriptRuntimeArtifactStorageInfo(
  env: NodeJS.ProcessEnv = process.env
): ScriptRuntimeArtifactStorageInfo {
  const backend = resolveScriptStorageBackend(env);
  const scope = resolveScriptStorageScope(env);

  if (backend === 'filesystem') {
    return {
      backend,
      scope,
      root: getRuntimeArtifactsRoot(env),
    };
  }

  return {
    backend,
    scope,
    storeName: resolveScriptBlobStoreName(env),
  };
}

export async function getScriptRuntimeArtifactStorageStatus(): Promise<ScriptRuntimeArtifactStorageStatus> {
  const info = getScriptRuntimeArtifactStorageInfo();

  try {
    if (info.backend === 'filesystem' && info.root) {
      await fs.mkdir(info.root, { recursive: true });
      await fs.access(info.root);
    } else {
      const store = resolveBlobStore();
      await store.get('__healthcheck__');
    }

    return {
      ...info,
      available: true,
    };
  } catch (error) {
    return {
      ...info,
      available: false,
      error: String(error),
    };
  }
}

function toArtifactPath(relativePath: string, env: NodeJS.ProcessEnv = process.env): string {
  return path.resolve(getRuntimeArtifactsRoot(env), `${relativePath}.json`);
}

function toVerificationPath(relativePath: string, env: NodeJS.ProcessEnv = process.env): string {
  return path.resolve(getVerificationHistoryRoot(env), `${relativePath}.json`);
}

function toFaultLedgerPath(id: string, env: NodeJS.ProcessEnv = process.env): string {
  return path.resolve(getFaultLedgerRoot(env), `${sanitizeLedgerSegment(id)}.json`);
}

function toFaultLedgerPolicyPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.resolve(getRuntimeArtifactsRoot(env), FAULT_LEDGER_POLICY_FILE);
}

function toFaultLedgerAuditPath(id: string, env: NodeJS.ProcessEnv = process.env): string {
  return path.resolve(getFaultLedgerAuditRoot(env), `${sanitizeLedgerSegment(id)}.json`);
}

function toRuntimeForensicsNotificationPath(
  id: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  return path.resolve(getRuntimeForensicsNotificationRoot(env), `${sanitizeLedgerSegment(id)}.json`);
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
  return Math.max(0, Math.round(value));
}

export function getScriptRuntimeFaultLedgerRetentionPolicy(
  env: NodeJS.ProcessEnv = process.env
): ScriptRuntimeFaultLedgerRetentionPolicy {
  const envConfigured =
    env.REY30_RUNTIME_LEDGER_RETENTION_MAX !== undefined ||
    env.REY30_RUNTIME_LEDGER_RETENTION_DAYS !== undefined;
  return {
    maxSnapshots: readRetentionNumber(
      'REY30_RUNTIME_LEDGER_RETENTION_MAX',
      FAULT_LEDGER_RETENTION_DEFAULT_MAX,
      env
    ),
    maxAgeDays: readRetentionNumber(
      'REY30_RUNTIME_LEDGER_RETENTION_DAYS',
      FAULT_LEDGER_RETENTION_DEFAULT_DAYS,
      env
    ),
    source: envConfigured ? 'env' : 'defaults',
    updatedAt: null,
    updatedBy: null,
  };
}

export function getScriptRuntimeForensicsAdminNotificationRetentionPolicy(
  env: NodeJS.ProcessEnv = process.env
): ScriptRuntimeForensicsAdminNotificationRetentionPolicy {
  const envConfigured =
    env.REY30_RUNTIME_FORENSICS_NOTIFICATION_RETENTION_MAX !== undefined ||
    env.REY30_RUNTIME_FORENSICS_NOTIFICATION_RETENTION_DAYS !== undefined;
  return {
    maxNotifications: readRetentionNumber(
      'REY30_RUNTIME_FORENSICS_NOTIFICATION_RETENTION_MAX',
      RUNTIME_FORENSICS_NOTIFICATION_RETENTION_DEFAULT_MAX,
      env
    ),
    maxAgeDays: readRetentionNumber(
      'REY30_RUNTIME_FORENSICS_NOTIFICATION_RETENTION_DAYS',
      RUNTIME_FORENSICS_NOTIFICATION_RETENTION_DEFAULT_DAYS,
      env
    ),
    source: envConfigured ? 'env' : 'defaults',
  };
}

function toStoredArtifact(
  document: ScriptRuntimeArtifactDocument
): CompiledScriptRuntimeArtifact {
  return {
    version: ARTIFACT_VERSION,
    scriptId: document.relativePath,
    sourceHash: document.sourceHash,
    compiledHash: document.compiledHash,
    compiledCode: document.compiledCode,
    generatedAt: document.generatedAt,
    sourceBytes: document.sourceBytes,
    compiledBytes: document.compiledBytes,
    guardFunction: document.guardFunction,
    compiler: document.compiler,
  };
}

async function getFilesystemArtifact(
  relativePath: string
): Promise<CompiledScriptRuntimeArtifact | null> {
  try {
    const raw = await fs.readFile(toArtifactPath(relativePath), 'utf8');
    const document = JSON.parse(raw) as ScriptRuntimeArtifactDocument;
    if (document.version !== ARTIFACT_VERSION) {
      return null;
    }
    return toStoredArtifact(document);
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'ENOENT'
    ) {
      return null;
    }
    throw error;
  }
}

async function putFilesystemArtifact(
  relativePath: string,
  artifact: CompiledScriptRuntimeArtifact
): Promise<void> {
  const target = toArtifactPath(relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const document: ScriptRuntimeArtifactDocument = {
    ...artifact,
    version: ARTIFACT_VERSION,
    relativePath,
  };
  await fs.writeFile(target, JSON.stringify(document, null, 2), 'utf8');
}

async function deleteFilesystemArtifact(relativePath: string): Promise<void> {
  await fs.unlink(toArtifactPath(relativePath)).catch((error) => {
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
}

function toStoredVerification(
  document: ScriptRuntimeArtifactVerificationDocument
): ScriptRuntimeArtifactVerificationRecord | null {
  if (document.version !== VERIFICATION_HISTORY_VERSION) return null;
  return {
    scriptId: document.relativePath,
    okCount: Math.max(0, Number(document.okCount) || 0),
    failedCount: Math.max(0, Number(document.failedCount) || 0),
    lastStatus: document.lastStatus === 'ok' ? 'ok' : 'failed',
    lastVerifiedAt: document.lastVerifiedAt,
    lastMessage: document.lastMessage || null,
  };
}

async function getFilesystemVerification(
  relativePath: string
): Promise<ScriptRuntimeArtifactVerificationRecord | null> {
  try {
    const raw = await fs.readFile(toVerificationPath(relativePath), 'utf8');
    return toStoredVerification(
      JSON.parse(raw) as ScriptRuntimeArtifactVerificationDocument
    );
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'ENOENT'
    ) {
      return null;
    }
    throw error;
  }
}

async function putFilesystemVerification(
  relativePath: string,
  record: ScriptRuntimeArtifactVerificationRecord
): Promise<void> {
  const target = toVerificationPath(relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const document: ScriptRuntimeArtifactVerificationDocument = {
    ...record,
    version: VERIFICATION_HISTORY_VERSION,
    relativePath,
  };
  await fs.writeFile(target, JSON.stringify(document, null, 2), 'utf8');
}

async function listFilesystemVerificationPaths(
  dir = getVerificationHistoryRoot(),
  prefix = ''
): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch((error) => {
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
  const paths: string[] = [];
  for (const entry of entries) {
    const nextPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      paths.push(...(await listFilesystemVerificationPaths(fullPath, nextPrefix)));
    } else if (entry.isFile() && nextPrefix.endsWith('.json')) {
      paths.push(nextPrefix.slice(0, -'.json'.length));
    }
  }
  return paths;
}

async function listFilesystemVerifications(): Promise<ScriptRuntimeArtifactVerificationRecord[]> {
  const paths = await listFilesystemVerificationPaths();
  const records = await Promise.all(paths.map((item) => getFilesystemVerification(item)));
  return records.filter(Boolean) as ScriptRuntimeArtifactVerificationRecord[];
}

function toStoredFaultLedgerSnapshot(
  document: ScriptRuntimeFaultLedgerSnapshotDocument
): ScriptRuntimeFaultLedgerSnapshot | null {
  if (document.version !== FAULT_LEDGER_VERSION) return null;
  const items = Array.isArray(document.items) ? document.items : [];
  return {
    id: document.id,
    instanceId: document.instanceId,
    sessionId: document.sessionId || null,
    playState: document.playState || 'unknown',
    generatedAt: document.generatedAt,
    itemCount: Math.max(0, Number(document.itemCount) || items.length),
    p0Count: Math.max(0, Number(document.p0Count) || 0),
    p1Count: Math.max(0, Number(document.p1Count) || 0),
    p2Count: Math.max(0, Number(document.p2Count) || 0),
    items,
  };
}

function normalizeRetentionPolicy(
  policy: Partial<ScriptRuntimeFaultLedgerRetentionPolicy>,
  fallback = getScriptRuntimeFaultLedgerRetentionPolicy()
): ScriptRuntimeFaultLedgerRetentionPolicy {
  const maxSnapshots = Math.max(
    0,
    Math.min(10_000, Math.round(Number(policy.maxSnapshots ?? fallback.maxSnapshots) || 0))
  );
  const maxAgeDays = Math.max(
    0,
    Math.min(3_650, Math.round(Number(policy.maxAgeDays ?? fallback.maxAgeDays) || 0))
  );
  return {
    maxSnapshots,
    maxAgeDays,
    source: policy.source || fallback.source || 'defaults',
    updatedAt: policy.updatedAt ?? fallback.updatedAt ?? null,
    updatedBy: policy.updatedBy ?? fallback.updatedBy ?? null,
  };
}

function toStoredRetentionPolicy(
  document: ScriptRuntimeFaultLedgerRetentionPolicyDocument
): ScriptRuntimeFaultLedgerRetentionPolicy | null {
  if (document.version !== FAULT_LEDGER_POLICY_VERSION) return null;
  return normalizeRetentionPolicy(document, getScriptRuntimeFaultLedgerRetentionPolicy());
}

function toStoredPruneAuditEntry(
  document: ScriptRuntimeFaultLedgerPruneAuditDocument
): ScriptRuntimeFaultLedgerPruneAuditEntry | null {
  if (document.version !== FAULT_LEDGER_AUDIT_VERSION) return null;
  return {
    id: document.id,
    createdAt: document.createdAt,
    actorId: document.actorId || null,
    reason: document.reason || 'manual',
    dryRun: Boolean(document.dryRun),
    deleted: Math.max(0, Number(document.deleted) || 0),
    wouldDelete: Math.max(0, Number(document.wouldDelete) || 0),
    retained: Math.max(0, Number(document.retained) || 0),
    policy: normalizeRetentionPolicy(document.policy),
    candidates: Array.isArray(document.candidates) ? document.candidates : [],
    auditId: document.auditId || document.id,
  };
}

function normalizeRuntimeForensicsAdminNotification(
  input: Partial<ScriptRuntimeForensicsAdminNotification>
): ScriptRuntimeForensicsAdminNotification {
  const createdAt = String(input.createdAt || new Date().toISOString());
  const indicator = String(input.indicator || 'runtime_forensics');
  const alertId = String(input.alertId || input.id || `${indicator}:${createdAt}`);
  const id = String(input.id || `runtime-forensics:${alertId}`);
  const level = input.level === 'warning' ? 'warning' : 'critical';
  const acknowledgedAt =
    typeof input.acknowledgedAt === 'string' && input.acknowledgedAt.trim()
      ? input.acknowledgedAt
      : null;

  return {
    id,
    alertId,
    createdAt,
    acknowledgedAt,
    level,
    indicator,
    title: String(input.title || indicator),
    message: String(input.message || ''),
    current: Number.isFinite(Number(input.current)) ? Number(input.current) : 0,
    objective: Number.isFinite(Number(input.objective)) ? Number(input.objective) : 0,
    createdBy: input.createdBy ? String(input.createdBy) : null,
    acknowledgedBy: acknowledgedAt && input.acknowledgedBy ? String(input.acknowledgedBy) : null,
    source:
      input.source === 'manual' || input.source === 'imported' ? input.source : 'slo',
  };
}

function normalizeRuntimeForensicsAdminNotificationRetentionPolicy(
  policy: Partial<ScriptRuntimeForensicsAdminNotificationRetentionPolicy>,
  fallback = getScriptRuntimeForensicsAdminNotificationRetentionPolicy()
): ScriptRuntimeForensicsAdminNotificationRetentionPolicy {
  const maxNotifications = Math.max(
    0,
    Math.min(
      10_000,
      Math.round(Number(policy.maxNotifications ?? fallback.maxNotifications) || 0)
    )
  );
  const maxAgeDays = Math.max(
    0,
    Math.min(3_650, Math.round(Number(policy.maxAgeDays ?? fallback.maxAgeDays) || 0))
  );
  return {
    maxNotifications,
    maxAgeDays,
    source: policy.source || fallback.source || 'defaults',
  };
}

function toStoredRuntimeForensicsAdminNotification(
  document: ScriptRuntimeForensicsAdminNotificationDocument
): ScriptRuntimeForensicsAdminNotification | null {
  if (document.version !== RUNTIME_FORENSICS_NOTIFICATION_VERSION) return null;
  return normalizeRuntimeForensicsAdminNotification(document);
}

async function getFilesystemFaultLedgerSnapshot(
  id: string
): Promise<ScriptRuntimeFaultLedgerSnapshot | null> {
  try {
    const raw = await fs.readFile(toFaultLedgerPath(id), 'utf8');
    return toStoredFaultLedgerSnapshot(
      JSON.parse(raw) as ScriptRuntimeFaultLedgerSnapshotDocument
    );
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'ENOENT'
    ) {
      return null;
    }
    throw error;
  }
}

async function putFilesystemFaultLedgerSnapshot(
  snapshot: ScriptRuntimeFaultLedgerSnapshot
): Promise<void> {
  const target = toFaultLedgerPath(snapshot.id);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const document: ScriptRuntimeFaultLedgerSnapshotDocument = {
    ...snapshot,
    version: FAULT_LEDGER_VERSION,
  };
  await fs.writeFile(target, JSON.stringify(document, null, 2), 'utf8');
}

async function deleteFilesystemFaultLedgerSnapshot(id: string): Promise<void> {
  await fs.unlink(toFaultLedgerPath(id)).catch((error) => {
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
}

async function listFilesystemFaultLedgerSnapshots(): Promise<ScriptRuntimeFaultLedgerSnapshot[]> {
  const entries = await fs.readdir(getFaultLedgerRoot(), { withFileTypes: true }).catch((error) => {
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
  const ids = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name.slice(0, -'.json'.length));
  const snapshots = await Promise.all(ids.map((id) => getFilesystemFaultLedgerSnapshot(id)));
  return snapshots.filter(Boolean) as ScriptRuntimeFaultLedgerSnapshot[];
}

async function getFilesystemFaultLedgerRetentionPolicy(): Promise<ScriptRuntimeFaultLedgerRetentionPolicy | null> {
  try {
    const raw = await fs.readFile(toFaultLedgerPolicyPath(), 'utf8');
    return toStoredRetentionPolicy(
      JSON.parse(raw) as ScriptRuntimeFaultLedgerRetentionPolicyDocument
    );
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'ENOENT'
    ) {
      return null;
    }
    throw error;
  }
}

async function putFilesystemFaultLedgerRetentionPolicy(
  policy: ScriptRuntimeFaultLedgerRetentionPolicy
): Promise<void> {
  const target = toFaultLedgerPolicyPath();
  await fs.mkdir(path.dirname(target), { recursive: true });
  const document: ScriptRuntimeFaultLedgerRetentionPolicyDocument = {
    ...policy,
    version: FAULT_LEDGER_POLICY_VERSION,
  };
  await fs.writeFile(target, JSON.stringify(document, null, 2), 'utf8');
}

async function putFilesystemFaultLedgerPruneAudit(
  entry: ScriptRuntimeFaultLedgerPruneAuditEntry
): Promise<void> {
  const target = toFaultLedgerAuditPath(entry.id);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const document: ScriptRuntimeFaultLedgerPruneAuditDocument = {
    ...entry,
    version: FAULT_LEDGER_AUDIT_VERSION,
  };
  await fs.writeFile(target, JSON.stringify(document, null, 2), 'utf8');
}

async function getFilesystemFaultLedgerPruneAudit(
  id: string
): Promise<ScriptRuntimeFaultLedgerPruneAuditEntry | null> {
  try {
    const raw = await fs.readFile(toFaultLedgerAuditPath(id), 'utf8');
    return toStoredPruneAuditEntry(JSON.parse(raw) as ScriptRuntimeFaultLedgerPruneAuditDocument);
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'ENOENT'
    ) {
      return null;
    }
    throw error;
  }
}

async function listFilesystemFaultLedgerPruneAudits(): Promise<ScriptRuntimeFaultLedgerPruneAuditEntry[]> {
  const entries = await fs.readdir(getFaultLedgerAuditRoot(), { withFileTypes: true }).catch((error) => {
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
  const ids = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name.slice(0, -'.json'.length));
  const audits = await Promise.all(ids.map((id) => getFilesystemFaultLedgerPruneAudit(id)));
  return audits.filter(Boolean) as ScriptRuntimeFaultLedgerPruneAuditEntry[];
}

async function getFilesystemRuntimeForensicsAdminNotification(
  id: string
): Promise<ScriptRuntimeForensicsAdminNotification | null> {
  try {
    const raw = await fs.readFile(toRuntimeForensicsNotificationPath(id), 'utf8');
    return toStoredRuntimeForensicsAdminNotification(
      JSON.parse(raw) as ScriptRuntimeForensicsAdminNotificationDocument
    );
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'ENOENT'
    ) {
      return null;
    }
    throw error;
  }
}

async function putFilesystemRuntimeForensicsAdminNotification(
  notification: ScriptRuntimeForensicsAdminNotification
): Promise<void> {
  const target = toRuntimeForensicsNotificationPath(notification.id);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const document: ScriptRuntimeForensicsAdminNotificationDocument = {
    ...notification,
    version: RUNTIME_FORENSICS_NOTIFICATION_VERSION,
  };
  await fs.writeFile(target, JSON.stringify(document, null, 2), 'utf8');
}

async function deleteFilesystemRuntimeForensicsAdminNotification(id: string): Promise<void> {
  await fs.unlink(toRuntimeForensicsNotificationPath(id)).catch((error) => {
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
}

async function listFilesystemRuntimeForensicsAdminNotifications(): Promise<ScriptRuntimeForensicsAdminNotification[]> {
  const entries = await fs
    .readdir(getRuntimeForensicsNotificationRoot(), { withFileTypes: true })
    .catch((error) => {
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
  const ids = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name.slice(0, -'.json'.length));
  const notifications = await Promise.all(
    ids.map((id) => getFilesystemRuntimeForensicsAdminNotification(id))
  );
  return notifications.filter(Boolean) as ScriptRuntimeForensicsAdminNotification[];
}

async function getBlobArtifact(
  relativePath: string
): Promise<CompiledScriptRuntimeArtifact | null> {
  const store = resolveBlobStore();
  const document = await store.get(getBlobKey(relativePath), { type: 'json' });
  if (!document || typeof document !== 'object') return null;
  const typed = document as ScriptRuntimeArtifactDocument;
  if (typed.version !== ARTIFACT_VERSION) return null;
  return toStoredArtifact(typed);
}

async function putBlobArtifact(
  relativePath: string,
  artifact: CompiledScriptRuntimeArtifact
): Promise<void> {
  const store = resolveBlobStore();
  const document: ScriptRuntimeArtifactDocument = {
    ...artifact,
    version: ARTIFACT_VERSION,
    relativePath,
  };
  await store.setJSON(getBlobKey(relativePath), document);
}

async function deleteBlobArtifact(relativePath: string): Promise<void> {
  const store = resolveBlobStore();
  await store.delete(getBlobKey(relativePath));
}

async function getBlobVerification(
  relativePath: string
): Promise<ScriptRuntimeArtifactVerificationRecord | null> {
  const store = resolveBlobStore();
  const document = await store.get(getVerificationBlobKey(relativePath), { type: 'json' });
  if (!document || typeof document !== 'object') return null;
  return toStoredVerification(document as ScriptRuntimeArtifactVerificationDocument);
}

async function putBlobVerification(
  relativePath: string,
  record: ScriptRuntimeArtifactVerificationRecord
): Promise<void> {
  const store = resolveBlobStore();
  const document: ScriptRuntimeArtifactVerificationDocument = {
    ...record,
    version: VERIFICATION_HISTORY_VERSION,
    relativePath,
  };
  await store.setJSON(getVerificationBlobKey(relativePath), document);
}

async function listBlobVerifications(): Promise<ScriptRuntimeArtifactVerificationRecord[]> {
  const store = resolveBlobStore() as ReturnType<typeof resolveBlobStore> & {
    list?: (options?: { prefix?: string }) => Promise<{ blobs?: Array<{ key: string }> }>;
  };
  if (typeof store.list !== 'function') return [];
  const listed = await store.list({ prefix: VERIFICATION_HISTORY_PREFIX });
  const keys = (listed.blobs || [])
    .map((blob) => blob.key)
    .filter((key) => key.endsWith('.json'));
  const records = await Promise.all(
    keys.map(async (key) => {
      const document = await store.get(key, { type: 'json' });
      return document && typeof document === 'object'
        ? toStoredVerification(document as ScriptRuntimeArtifactVerificationDocument)
        : null;
    })
  );
  return records.filter(Boolean) as ScriptRuntimeArtifactVerificationRecord[];
}

async function getBlobFaultLedgerSnapshot(
  id: string
): Promise<ScriptRuntimeFaultLedgerSnapshot | null> {
  const store = resolveBlobStore();
  const document = await store.get(getFaultLedgerBlobKey(id), { type: 'json' });
  if (!document || typeof document !== 'object') return null;
  return toStoredFaultLedgerSnapshot(document as ScriptRuntimeFaultLedgerSnapshotDocument);
}

async function putBlobFaultLedgerSnapshot(
  snapshot: ScriptRuntimeFaultLedgerSnapshot
): Promise<void> {
  const store = resolveBlobStore();
  const document: ScriptRuntimeFaultLedgerSnapshotDocument = {
    ...snapshot,
    version: FAULT_LEDGER_VERSION,
  };
  await store.setJSON(getFaultLedgerBlobKey(snapshot.id), document);
}

async function deleteBlobFaultLedgerSnapshot(id: string): Promise<void> {
  const store = resolveBlobStore();
  await store.delete(getFaultLedgerBlobKey(id));
}

async function listBlobFaultLedgerSnapshots(): Promise<ScriptRuntimeFaultLedgerSnapshot[]> {
  const store = resolveBlobStore() as ReturnType<typeof resolveBlobStore> & {
    list?: (options?: { prefix?: string }) => Promise<{ blobs?: Array<{ key: string }> }>;
  };
  if (typeof store.list !== 'function') return [];
  const listed = await store.list({ prefix: FAULT_LEDGER_PREFIX });
  const keys = (listed.blobs || [])
    .map((blob) => blob.key)
    .filter((key) => key.endsWith('.json'));
  const snapshots = await Promise.all(
    keys.map(async (key) => {
      const document = await store.get(key, { type: 'json' });
      return document && typeof document === 'object'
        ? toStoredFaultLedgerSnapshot(document as ScriptRuntimeFaultLedgerSnapshotDocument)
        : null;
    })
  );
  return snapshots.filter(Boolean) as ScriptRuntimeFaultLedgerSnapshot[];
}

async function getBlobFaultLedgerRetentionPolicy(): Promise<ScriptRuntimeFaultLedgerRetentionPolicy | null> {
  const store = resolveBlobStore();
  const document = await store.get(FAULT_LEDGER_POLICY_BLOB_KEY, { type: 'json' });
  if (!document || typeof document !== 'object') return null;
  return toStoredRetentionPolicy(document as ScriptRuntimeFaultLedgerRetentionPolicyDocument);
}

async function putBlobFaultLedgerRetentionPolicy(
  policy: ScriptRuntimeFaultLedgerRetentionPolicy
): Promise<void> {
  const store = resolveBlobStore();
  const document: ScriptRuntimeFaultLedgerRetentionPolicyDocument = {
    ...policy,
    version: FAULT_LEDGER_POLICY_VERSION,
  };
  await store.setJSON(FAULT_LEDGER_POLICY_BLOB_KEY, document);
}

function getFaultLedgerAuditBlobKey(id: string): string {
  return path.posix.join(FAULT_LEDGER_AUDIT_PREFIX, `${sanitizeLedgerSegment(id)}.json`);
}

function getRuntimeForensicsNotificationBlobKey(id: string): string {
  return path.posix.join(
    RUNTIME_FORENSICS_NOTIFICATION_PREFIX,
    `${sanitizeLedgerSegment(id)}.json`
  );
}

async function putBlobFaultLedgerPruneAudit(
  entry: ScriptRuntimeFaultLedgerPruneAuditEntry
): Promise<void> {
  const store = resolveBlobStore();
  const document: ScriptRuntimeFaultLedgerPruneAuditDocument = {
    ...entry,
    version: FAULT_LEDGER_AUDIT_VERSION,
  };
  await store.setJSON(getFaultLedgerAuditBlobKey(entry.id), document);
}

async function listBlobFaultLedgerPruneAudits(): Promise<ScriptRuntimeFaultLedgerPruneAuditEntry[]> {
  const store = resolveBlobStore() as ReturnType<typeof resolveBlobStore> & {
    list?: (options?: { prefix?: string }) => Promise<{ blobs?: Array<{ key: string }> }>;
  };
  if (typeof store.list !== 'function') return [];
  const listed = await store.list({ prefix: FAULT_LEDGER_AUDIT_PREFIX });
  const keys = (listed.blobs || [])
    .map((blob) => blob.key)
    .filter((key) => key.endsWith('.json'));
  const audits = await Promise.all(
    keys.map(async (key) => {
      const document = await store.get(key, { type: 'json' });
      return document && typeof document === 'object'
        ? toStoredPruneAuditEntry(document as ScriptRuntimeFaultLedgerPruneAuditDocument)
        : null;
    })
  );
  return audits.filter(Boolean) as ScriptRuntimeFaultLedgerPruneAuditEntry[];
}

async function getBlobRuntimeForensicsAdminNotification(
  id: string
): Promise<ScriptRuntimeForensicsAdminNotification | null> {
  const store = resolveBlobStore();
  const document = await store.get(getRuntimeForensicsNotificationBlobKey(id), { type: 'json' });
  if (!document || typeof document !== 'object') return null;
  return toStoredRuntimeForensicsAdminNotification(
    document as ScriptRuntimeForensicsAdminNotificationDocument
  );
}

async function putBlobRuntimeForensicsAdminNotification(
  notification: ScriptRuntimeForensicsAdminNotification
): Promise<void> {
  const store = resolveBlobStore();
  const document: ScriptRuntimeForensicsAdminNotificationDocument = {
    ...notification,
    version: RUNTIME_FORENSICS_NOTIFICATION_VERSION,
  };
  await store.setJSON(getRuntimeForensicsNotificationBlobKey(notification.id), document);
}

async function deleteBlobRuntimeForensicsAdminNotification(id: string): Promise<void> {
  const store = resolveBlobStore();
  await store.delete(getRuntimeForensicsNotificationBlobKey(id));
}

async function listBlobRuntimeForensicsAdminNotifications(): Promise<ScriptRuntimeForensicsAdminNotification[]> {
  const store = resolveBlobStore() as ReturnType<typeof resolveBlobStore> & {
    list?: (options?: { prefix?: string }) => Promise<{ blobs?: Array<{ key: string }> }>;
  };
  if (typeof store.list !== 'function') return [];
  const listed = await store.list({ prefix: RUNTIME_FORENSICS_NOTIFICATION_PREFIX });
  const keys = (listed.blobs || [])
    .map((blob) => blob.key)
    .filter((key) => key.endsWith('.json'));
  const notifications = await Promise.all(
    keys.map(async (key) => {
      const document = await store.get(key, { type: 'json' });
      return document && typeof document === 'object'
        ? toStoredRuntimeForensicsAdminNotification(
            document as ScriptRuntimeForensicsAdminNotificationDocument
          )
        : null;
    })
  );
  return notifications.filter(Boolean) as ScriptRuntimeForensicsAdminNotification[];
}

export async function getScriptRuntimeArtifact(
  relativePath: string
): Promise<CompiledScriptRuntimeArtifact | null> {
  const normalized = assertValidScriptRelativePath(relativePath);
  if (resolveScriptStorageBackend() === 'filesystem') {
    return getFilesystemArtifact(normalized);
  }
  return getBlobArtifact(normalized);
}

export async function putScriptRuntimeArtifact(
  relativePath: string,
  artifact: CompiledScriptRuntimeArtifact
): Promise<void> {
  const normalized = assertValidScriptRelativePath(relativePath);
  if (resolveScriptStorageBackend() === 'filesystem') {
    await putFilesystemArtifact(normalized, artifact);
    return;
  }
  await putBlobArtifact(normalized, artifact);
}

export async function deleteScriptRuntimeArtifact(relativePath: string): Promise<void> {
  const normalized = assertValidScriptRelativePath(relativePath);
  if (resolveScriptStorageBackend() === 'filesystem') {
    await deleteFilesystemArtifact(normalized);
    return;
  }
  await deleteBlobArtifact(normalized);
}

export async function getScriptRuntimeArtifactVerification(
  relativePath: string
): Promise<ScriptRuntimeArtifactVerificationRecord | null> {
  const normalized = assertValidScriptRelativePath(relativePath);
  if (resolveScriptStorageBackend() === 'filesystem') {
    return getFilesystemVerification(normalized);
  }
  return getBlobVerification(normalized);
}

export async function listScriptRuntimeArtifactVerifications(): Promise<
  ScriptRuntimeArtifactVerificationRecord[]
> {
  const records =
    resolveScriptStorageBackend() === 'filesystem'
      ? await listFilesystemVerifications()
      : await listBlobVerifications();
  return records.sort((a, b) => a.scriptId.localeCompare(b.scriptId));
}

export async function recordScriptRuntimeArtifactVerification(
  relativePath: string,
  params: {
    ok: boolean;
    message?: string | null;
    verifiedAt?: string;
  }
): Promise<ScriptRuntimeArtifactVerificationRecord> {
  const normalized = assertValidScriptRelativePath(relativePath);
  const current = await getScriptRuntimeArtifactVerification(normalized);
  const next: ScriptRuntimeArtifactVerificationRecord = {
    scriptId: normalized,
    okCount: (current?.okCount || 0) + (params.ok ? 1 : 0),
    failedCount: (current?.failedCount || 0) + (params.ok ? 0 : 1),
    lastStatus: params.ok ? 'ok' : 'failed',
    lastVerifiedAt: params.verifiedAt || new Date().toISOString(),
    lastMessage: params.message || null,
  };

  if (resolveScriptStorageBackend() === 'filesystem') {
    await putFilesystemVerification(normalized, next);
  } else {
    await putBlobVerification(normalized, next);
  }
  return next;
}

function normalizeFaultLedgerItem(
  item: ScriptRuntimeFaultLedgerSnapshotItem
): ScriptRuntimeFaultLedgerSnapshotItem {
  const severity =
    item.severity === 'P0' || item.severity === 'P1' || item.severity === 'P2'
      ? item.severity
      : 'P2';
  const source =
    item.source === 'legacy' || item.source === 'scrib' || item.source === 'node'
      ? item.source
      : 'legacy';
  return {
    severity,
    source,
    target: String(item.target || 'runtime').slice(0, 300),
    state: String(item.state || 'unknown').slice(0, 200),
    action: String(item.action || 'inspect').slice(0, 80),
    detail: String(item.detail || '').slice(0, 1_000),
    verificationStatus:
      item.verificationStatus === 'ok' || item.verificationStatus === 'failed'
        ? item.verificationStatus
        : null,
    verificationOkCount: Math.max(0, Number(item.verificationOkCount) || 0),
    verificationFailedCount: Math.max(0, Number(item.verificationFailedCount) || 0),
  };
}

function parseLedgerDateBound(value: string | null | undefined, endOfDay: boolean): number | null {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? `${trimmed}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`
    : trimmed;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function recomputeFaultLedgerSnapshotCounts(
  snapshot: ScriptRuntimeFaultLedgerSnapshot,
  items: ScriptRuntimeFaultLedgerSnapshotItem[]
): ScriptRuntimeFaultLedgerSnapshot {
  return {
    ...snapshot,
    itemCount: items.length,
    p0Count: items.filter((item) => item.severity === 'P0').length,
    p1Count: items.filter((item) => item.severity === 'P1').length,
    p2Count: items.filter((item) => item.severity === 'P2').length,
    items,
  };
}

export function filterScriptRuntimeFaultLedgerSnapshots(
  snapshots: ScriptRuntimeFaultLedgerSnapshot[],
  filters: ScriptRuntimeFaultLedgerSnapshotFilters = {}
): ScriptRuntimeFaultLedgerSnapshot[] {
  const severities = new Set(
    (filters.severities || []).filter(
      (severity): severity is ScriptRuntimeFaultLedgerSeverity =>
        severity === 'P0' || severity === 'P1' || severity === 'P2'
    )
  );
  const targetFilter = String(filters.target || '').trim().toLowerCase();
  const fromMs = parseLedgerDateBound(filters.from, false);
  const toMs = parseLedgerDateBound(filters.to, true);

  return snapshots.flatMap((snapshot) => {
    const generatedAtMs = Date.parse(snapshot.generatedAt);
    if (fromMs !== null && Number.isFinite(generatedAtMs) && generatedAtMs < fromMs) {
      return [];
    }
    if (toMs !== null && Number.isFinite(generatedAtMs) && generatedAtMs > toMs) {
      return [];
    }

    const hasItemFilters = severities.size > 0 || targetFilter.length > 0;
    if (!hasItemFilters) return [snapshot];

    const items = snapshot.items.filter((item) => {
      if (severities.size > 0 && !severities.has(item.severity)) return false;
      if (targetFilter && !item.target.toLowerCase().includes(targetFilter)) return false;
      return true;
    });
    return items.length > 0 ? [recomputeFaultLedgerSnapshotCounts(snapshot, items)] : [];
  });
}

async function listAllScriptRuntimeFaultLedgerSnapshots(): Promise<ScriptRuntimeFaultLedgerSnapshot[]> {
  const snapshots =
    resolveScriptStorageBackend() === 'filesystem'
      ? await listFilesystemFaultLedgerSnapshots()
      : await listBlobFaultLedgerSnapshots();
  return snapshots.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
}

async function deleteScriptRuntimeFaultLedgerSnapshot(id: string): Promise<void> {
  if (resolveScriptStorageBackend() === 'filesystem') {
    await deleteFilesystemFaultLedgerSnapshot(id);
  } else {
    await deleteBlobFaultLedgerSnapshot(id);
  }
}

export async function getConfiguredScriptRuntimeFaultLedgerRetentionPolicy(): Promise<ScriptRuntimeFaultLedgerRetentionPolicy> {
  const stored =
    resolveScriptStorageBackend() === 'filesystem'
      ? await getFilesystemFaultLedgerRetentionPolicy()
      : await getBlobFaultLedgerRetentionPolicy();
  return stored || getScriptRuntimeFaultLedgerRetentionPolicy();
}

export async function putScriptRuntimeFaultLedgerRetentionPolicy(params: {
  maxSnapshots: number;
  maxAgeDays: number;
  updatedBy?: string | null;
  updatedAt?: string;
}): Promise<ScriptRuntimeFaultLedgerRetentionPolicy> {
  const policy = normalizeRetentionPolicy({
    maxSnapshots: params.maxSnapshots,
    maxAgeDays: params.maxAgeDays,
    source: 'admin',
    updatedAt: params.updatedAt || new Date().toISOString(),
    updatedBy: params.updatedBy || null,
  });
  if (resolveScriptStorageBackend() === 'filesystem') {
    await putFilesystemFaultLedgerRetentionPolicy(policy);
  } else {
    await putBlobFaultLedgerRetentionPolicy(policy);
  }
  return policy;
}

async function putScriptRuntimeFaultLedgerPruneAudit(
  entry: ScriptRuntimeFaultLedgerPruneAuditEntry
): Promise<void> {
  if (resolveScriptStorageBackend() === 'filesystem') {
    await putFilesystemFaultLedgerPruneAudit(entry);
  } else {
    await putBlobFaultLedgerPruneAudit(entry);
  }
}

export async function listScriptRuntimeFaultLedgerPruneAudits(
  limit = 20
): Promise<ScriptRuntimeFaultLedgerPruneAuditEntry[]> {
  const audits =
    resolveScriptStorageBackend() === 'filesystem'
      ? await listFilesystemFaultLedgerPruneAudits()
      : await listBlobFaultLedgerPruneAudits();
  return audits
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, Math.max(1, Math.min(100, limit)));
}

export function scriptRuntimeFaultLedgerPruneAuditsToCsv(
  audits: ScriptRuntimeFaultLedgerPruneAuditEntry[]
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
    'maxSnapshots',
    'maxAgeDays',
    'candidateCount',
    'candidateIds',
  ];
  const rows = audits.map((entry) => [
    entry.id,
    entry.createdAt,
    entry.actorId || '',
    entry.reason,
    entry.dryRun,
    entry.deleted,
    entry.wouldDelete,
    entry.retained,
    entry.policy.maxSnapshots,
    entry.policy.maxAgeDays,
    entry.candidates.length,
    entry.candidates.map((candidate) => candidate.id).join('|'),
  ]);
  return [headers, ...rows].map((row) => row.map(escapeCsvValue).join(',')).join('\n');
}

async function getScriptRuntimeForensicsAdminNotification(
  id: string
): Promise<ScriptRuntimeForensicsAdminNotification | null> {
  if (resolveScriptStorageBackend() === 'filesystem') {
    return getFilesystemRuntimeForensicsAdminNotification(id);
  }
  return getBlobRuntimeForensicsAdminNotification(id);
}

async function listAllScriptRuntimeForensicsAdminNotifications(): Promise<ScriptRuntimeForensicsAdminNotification[]> {
  const notifications =
    resolveScriptStorageBackend() === 'filesystem'
      ? await listFilesystemRuntimeForensicsAdminNotifications()
      : await listBlobRuntimeForensicsAdminNotifications();
  return notifications.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function deleteScriptRuntimeForensicsAdminNotification(id: string): Promise<void> {
  if (resolveScriptStorageBackend() === 'filesystem') {
    await deleteFilesystemRuntimeForensicsAdminNotification(id);
  } else {
    await deleteBlobRuntimeForensicsAdminNotification(id);
  }
}

export async function putScriptRuntimeForensicsAdminNotification(
  input: Partial<ScriptRuntimeForensicsAdminNotification>
): Promise<ScriptRuntimeForensicsAdminNotification> {
  const notification = normalizeRuntimeForensicsAdminNotification(input);
  if (resolveScriptStorageBackend() === 'filesystem') {
    await putFilesystemRuntimeForensicsAdminNotification(notification);
  } else {
    await putBlobRuntimeForensicsAdminNotification(notification);
  }
  await pruneScriptRuntimeForensicsAdminNotifications({
    now: Date.now(),
    protectedIds: new Set([notification.id]),
  });
  return notification;
}

export async function acknowledgeScriptRuntimeForensicsAdminNotification(params: {
  id: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string | null;
}): Promise<ScriptRuntimeForensicsAdminNotification | null> {
  const existing = await getScriptRuntimeForensicsAdminNotification(params.id);
  if (!existing) return null;
  return putScriptRuntimeForensicsAdminNotification({
    ...existing,
    acknowledgedAt: params.acknowledgedAt || new Date().toISOString(),
    acknowledgedBy: params.acknowledgedBy || null,
  });
}

export async function listScriptRuntimeForensicsAdminNotifications(
  limit = 50
): Promise<ScriptRuntimeForensicsAdminNotification[]> {
  return (await listAllScriptRuntimeForensicsAdminNotifications()).slice(
    0,
    Math.max(1, Math.min(100, limit))
  );
}

export async function pruneScriptRuntimeForensicsAdminNotifications(params: {
  policy?: Partial<ScriptRuntimeForensicsAdminNotificationRetentionPolicy>;
  now?: number;
  protectedIds?: Set<string>;
  dryRun?: boolean;
} = {}): Promise<ScriptRuntimeForensicsAdminNotificationPruneSummary> {
  const policy = normalizeRuntimeForensicsAdminNotificationRetentionPolicy(
    params.policy || {}
  );
  const now = params.now ?? Date.now();
  const protectedIds = params.protectedIds || new Set<string>();
  const notifications = await listAllScriptRuntimeForensicsAdminNotifications();
  const cutoffMs = policy.maxAgeDays > 0 ? now - policy.maxAgeDays * MS_PER_DAY : null;
  const candidates = notifications.flatMap(
    (notification, index): ScriptRuntimeForensicsAdminNotificationPruneCandidate[] => {
      if (protectedIds.has(notification.id)) return [];
      const overCountLimit = policy.maxNotifications > 0 && index >= policy.maxNotifications;
      const createdAtMs = Date.parse(notification.createdAt);
      const overAgeLimit =
        cutoffMs !== null && Number.isFinite(createdAtMs) && createdAtMs < cutoffMs;
      if (!overCountLimit && !overAgeLimit) return [];
      return [
        {
          id: notification.id,
          createdAt: notification.createdAt,
          level: notification.level,
          indicator: notification.indicator,
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
    await Promise.all(candidates.map((candidate) => deleteScriptRuntimeForensicsAdminNotification(candidate.id)));
  }

  return {
    dryRun: Boolean(params.dryRun),
    deleted: params.dryRun ? 0 : candidates.length,
    wouldDelete: candidates.length,
    retained: params.dryRun
      ? notifications.length
      : Math.max(0, notifications.length - candidates.length),
    policy,
    candidates,
  };
}

export function scriptRuntimeForensicsAdminNotificationsToCsv(
  notifications: ScriptRuntimeForensicsAdminNotification[]
): string {
  const headers = [
    'id',
    'alertId',
    'createdAt',
    'acknowledgedAt',
    'level',
    'indicator',
    'title',
    'message',
    'current',
    'objective',
    'createdBy',
    'acknowledgedBy',
    'source',
  ];
  const rows = notifications.map((notification) => [
    notification.id,
    notification.alertId,
    notification.createdAt,
    notification.acknowledgedAt || '',
    notification.level,
    notification.indicator,
    notification.title,
    notification.message,
    notification.current,
    notification.objective,
    notification.createdBy || '',
    notification.acknowledgedBy || '',
    notification.source,
  ]);
  return [headers, ...rows].map((row) => row.map(escapeCsvValue).join(',')).join('\n');
}

export async function pruneScriptRuntimeFaultLedgerSnapshots(params: {
  policy?: ScriptRuntimeFaultLedgerRetentionPolicy;
  now?: number;
  protectedIds?: Set<string>;
  dryRun?: boolean;
  actorId?: string | null;
  reason?: string;
} = {}): Promise<ScriptRuntimeFaultLedgerPruneSummary> {
  const policy = params.policy || (await getConfiguredScriptRuntimeFaultLedgerRetentionPolicy());
  const now = params.now ?? Date.now();
  const protectedIds = params.protectedIds || new Set<string>();
  const snapshots = await listAllScriptRuntimeFaultLedgerSnapshots();
  const cutoffMs = policy.maxAgeDays > 0 ? now - policy.maxAgeDays * MS_PER_DAY : null;
  const candidates = snapshots
    .flatMap((snapshot, index): ScriptRuntimeFaultLedgerPruneCandidate[] => {
      if (protectedIds.has(snapshot.id)) return [];
      const overCountLimit = policy.maxSnapshots > 0 && index >= policy.maxSnapshots;
      const generatedAtMs = Date.parse(snapshot.generatedAt);
      const overAgeLimit =
        cutoffMs !== null && Number.isFinite(generatedAtMs) && generatedAtMs < cutoffMs;
      if (!overCountLimit && !overAgeLimit) return [];
      return [
        {
          id: snapshot.id,
          generatedAt: snapshot.generatedAt,
          itemCount: snapshot.itemCount,
          p0Count: snapshot.p0Count,
          reason:
            overCountLimit && overAgeLimit
              ? 'count+age'
              : overCountLimit
                ? 'count'
                : 'age',
        },
      ];
    });

  if (!params.dryRun) {
    await Promise.all(candidates.map((item) => deleteScriptRuntimeFaultLedgerSnapshot(item.id)));
  }

  const createdAt = new Date(now).toISOString();
  const auditId = `${params.dryRun ? 'dry-run' : 'prune'}-${sanitizeLedgerSegment(createdAt)}`;
  const summary: ScriptRuntimeFaultLedgerPruneSummary = {
    dryRun: Boolean(params.dryRun),
    deleted: params.dryRun ? 0 : candidates.length,
    wouldDelete: candidates.length,
    retained: params.dryRun
      ? snapshots.length
      : Math.max(0, snapshots.length - candidates.length),
    policy,
    candidates,
    auditId,
  };

  await putScriptRuntimeFaultLedgerPruneAudit({
    ...summary,
    id: auditId,
    auditId,
    createdAt,
    actorId: params.actorId || null,
    reason: params.reason || (params.dryRun ? 'manual-dry-run' : 'manual-prune'),
  });

  return summary;
}

export async function putScriptRuntimeFaultLedgerSnapshot(params: {
  instanceId: string;
  sessionId?: string | null;
  playState?: string;
  generatedAt?: string;
  items: ScriptRuntimeFaultLedgerSnapshotItem[];
}): Promise<ScriptRuntimeFaultLedgerSnapshot> {
  const generatedAt = params.generatedAt || new Date().toISOString();
  const instanceId = sanitizeLedgerSegment(params.instanceId || 'runtime');
  const items = (params.items || []).map(normalizeFaultLedgerItem);
  const snapshot: ScriptRuntimeFaultLedgerSnapshot = {
    id: buildFaultLedgerSnapshotId(instanceId, generatedAt),
    instanceId,
    sessionId: params.sessionId || null,
    playState: String(params.playState || 'unknown'),
    generatedAt,
    itemCount: items.length,
    p0Count: items.filter((item) => item.severity === 'P0').length,
    p1Count: items.filter((item) => item.severity === 'P1').length,
    p2Count: items.filter((item) => item.severity === 'P2').length,
    items,
  };

  if (resolveScriptStorageBackend() === 'filesystem') {
    await putFilesystemFaultLedgerSnapshot(snapshot);
  } else {
    await putBlobFaultLedgerSnapshot(snapshot);
  }
  await pruneScriptRuntimeFaultLedgerSnapshots({
    policy: await getConfiguredScriptRuntimeFaultLedgerRetentionPolicy(),
    now: Date.now(),
    protectedIds: new Set([snapshot.id]),
    reason: 'auto-retention-after-snapshot',
  });
  return snapshot;
}

export async function listScriptRuntimeFaultLedgerSnapshots(
  limit = 20
): Promise<ScriptRuntimeFaultLedgerSnapshot[]> {
  return (await listAllScriptRuntimeFaultLedgerSnapshots()).slice(
    0,
    Math.max(1, Math.min(100, limit))
  );
}

function escapeCsvValue(value: unknown): string {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

export function scriptRuntimeFaultLedgerSnapshotsToCsv(
  snapshots: ScriptRuntimeFaultLedgerSnapshot[]
): string {
  const headers = [
    'snapshotId',
    'generatedAt',
    'instanceId',
    'sessionId',
    'playState',
    'snapshotItemCount',
    'snapshotP0Count',
    'snapshotP1Count',
    'snapshotP2Count',
    'severity',
    'source',
    'target',
    'state',
    'action',
    'detail',
    'verificationStatus',
    'verificationOkCount',
    'verificationFailedCount',
  ];
  const rows = snapshots.flatMap((snapshot) => {
    const items = snapshot.items.length > 0
      ? snapshot.items
      : [{
          severity: '',
          source: '',
          target: '',
          state: '',
          action: '',
          detail: '',
          verificationStatus: null,
          verificationOkCount: 0,
          verificationFailedCount: 0,
        }];
    return items.map((item) => [
      snapshot.id,
      snapshot.generatedAt,
      snapshot.instanceId,
      snapshot.sessionId || '',
      snapshot.playState,
      snapshot.itemCount,
      snapshot.p0Count,
      snapshot.p1Count,
      snapshot.p2Count,
      item.severity,
      item.source,
      item.target,
      item.state,
      item.action,
      item.detail,
      item.verificationStatus || '',
      item.verificationOkCount,
      item.verificationFailedCount,
    ]);
  });
  return [headers, ...rows].map((row) => row.map(escapeCsvValue).join(',')).join('\n');
}
