import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getDeployStore, getStore } from '@netlify/blobs';
import {
  getScriptsRoot,
  resolveScriptBlobStoreName,
  resolveScriptStorageBackend,
  resolveScriptStorageScope,
} from '@/app/api/scripts/shared';

const LIVE_SESSION_VERSION = 1 as const;
const EXECUTION_LEASE_VERSION = 1 as const;
const LIVE_SESSION_PREFIX = '__runtime_sessions__';
const EXECUTION_LEASE_FILE = '__runtime_execution_lease__.json';
const DEFAULT_HEARTBEAT_TTL_MS = 15_000;
const STALE_RETENTION_MULTIPLIER = 6;
const MAX_EXPOSED_SESSIONS = 6;
const MAX_STORED_SCRIPT_IDS = 12;

export type ScriptRuntimePlayState = 'PLAYING' | 'PAUSED' | 'IDLE';

export interface ScriptRuntimeLiveSessionRecord {
  version: typeof LIVE_SESSION_VERSION;
  instanceId: string;
  sessionId: string;
  userId: string;
  playState: ScriptRuntimePlayState;
  activeEntityScripts: number;
  activeScribNodes: number;
  activeScriptIds: string[];
  heartbeatAt: string;
}

export interface ScriptRuntimeLiveSessionView {
  instanceId: string;
  currentSession: boolean;
  playState: ScriptRuntimePlayState;
  activeEntityScripts: number;
  activeScribNodes: number;
  activeScriptIds: string[];
  heartbeatAt: string;
  stale: boolean;
}

export interface ScriptRuntimeLiveSessionSummary {
  coordinationMode: 'heartbeat-sessions';
  ownershipMode: 'not-required' | 'implicit-local' | 'session-lease';
  heartbeatTtlMs: number;
  storageMode: 'local' | 'shared';
  activeSessions: number;
  playingSessions: number;
  staleSessions: number;
  currentSessionPresent: boolean;
  currentSessionOwnsLease: boolean;
  currentInstanceOwnsLease: boolean;
  lease: ScriptRuntimeExecutionLeaseView;
  sessions: ScriptRuntimeLiveSessionView[];
}

export interface ScriptRuntimeExecutionLeaseRecord {
  version: typeof EXECUTION_LEASE_VERSION;
  instanceId: string;
  sessionId: string;
  userId: string;
  playState: 'PLAYING';
  activeEntityScripts: number;
  activeScribNodes: number;
  activeScriptIds: string[];
  claimedAt: string;
  heartbeatAt: string;
  expiresAt: string;
}

export interface ScriptRuntimeExecutionLeaseView {
  status: 'not-required' | 'local-only' | 'unclaimed' | 'owned' | 'standby';
  ownerInstanceId: string | null;
  ownerPlayState: ScriptRuntimePlayState | null;
  ownerHeartbeatAt: string | null;
  leaseExpiresAt: string | null;
  stale: boolean;
}

function isFsError(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}

function sanitizeSessionSegment(value: string): string {
  const cleaned = value.trim().replace(/[^A-Za-z0-9_-]/g, '_').replace(/_+/g, '_');
  return cleaned.slice(0, 96) || 'runtime';
}

function normalizeScriptIds(value: Iterable<string>): string[] {
  return Array.from(
    new Set(
      Array.from(value)
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, MAX_STORED_SCRIPT_IDS)
    )
  ).sort();
}

function getLiveSessionsRoot(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(getScriptsRoot(env), '.rey30-runtime-sessions');
}

function getBlobKey(sessionId: string, instanceId: string): string {
  const sessionKey = sanitizeSessionSegment(sessionId);
  const instanceKey = sanitizeSessionSegment(instanceId);
  return path.posix.join(LIVE_SESSION_PREFIX, `${sessionKey}__${instanceKey}.json`);
}

function getLeaseBlobKey(): string {
  return path.posix.join(LIVE_SESSION_PREFIX, EXECUTION_LEASE_FILE);
}

function getFilesystemPath(
  sessionId: string,
  instanceId: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  return path.join(getLiveSessionsRoot(env), `${sanitizeSessionSegment(sessionId)}__${sanitizeSessionSegment(instanceId)}.json`);
}

function getLeaseFilesystemPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(getLiveSessionsRoot(env), EXECUTION_LEASE_FILE);
}

function resolveBlobStore() {
  const backend = resolveScriptStorageBackend();
  const scope = resolveScriptStorageScope();
  const storeName = resolveScriptBlobStoreName();
  if (backend !== 'netlify-blobs') {
    throw new Error('Script runtime live sessions are not configured for Netlify Blobs.');
  }
  return scope === 'global' ? getStore(storeName) : getDeployStore(storeName);
}

function parseLiveSession(raw: unknown): ScriptRuntimeLiveSessionRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const typed = raw as Partial<ScriptRuntimeLiveSessionRecord>;
  if (
    typed.version !== LIVE_SESSION_VERSION ||
    typeof typed.instanceId !== 'string' ||
    typeof typed.sessionId !== 'string' ||
    typeof typed.userId !== 'string' ||
    typeof typed.playState !== 'string' ||
    typeof typed.heartbeatAt !== 'string'
  ) {
    return null;
  }

  const playState: ScriptRuntimePlayState =
    typed.playState === 'PLAYING' || typed.playState === 'PAUSED' || typed.playState === 'IDLE'
      ? typed.playState
      : 'IDLE';

  return {
    version: LIVE_SESSION_VERSION,
    instanceId: typed.instanceId,
    sessionId: typed.sessionId,
    userId: typed.userId,
    playState,
    activeEntityScripts:
      typeof typed.activeEntityScripts === 'number' && Number.isFinite(typed.activeEntityScripts)
        ? Math.max(0, Math.trunc(typed.activeEntityScripts))
        : 0,
    activeScribNodes:
      typeof typed.activeScribNodes === 'number' && Number.isFinite(typed.activeScribNodes)
        ? Math.max(0, Math.trunc(typed.activeScribNodes))
        : 0,
    activeScriptIds: normalizeScriptIds(Array.isArray(typed.activeScriptIds) ? typed.activeScriptIds.filter((item): item is string => typeof item === 'string') : []),
    heartbeatAt: typed.heartbeatAt,
  };
}

function parseExecutionLease(raw: unknown): ScriptRuntimeExecutionLeaseRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const typed = raw as Partial<ScriptRuntimeExecutionLeaseRecord>;
  if (
    typed.version !== EXECUTION_LEASE_VERSION ||
    typeof typed.instanceId !== 'string' ||
    typeof typed.sessionId !== 'string' ||
    typeof typed.userId !== 'string' ||
    typed.playState !== 'PLAYING' ||
    typeof typed.claimedAt !== 'string' ||
    typeof typed.heartbeatAt !== 'string' ||
    typeof typed.expiresAt !== 'string'
  ) {
    return null;
  }

  return {
    version: EXECUTION_LEASE_VERSION,
    instanceId: typed.instanceId,
    sessionId: typed.sessionId,
    userId: typed.userId,
    playState: 'PLAYING',
    activeEntityScripts:
      typeof typed.activeEntityScripts === 'number' && Number.isFinite(typed.activeEntityScripts)
        ? Math.max(0, Math.trunc(typed.activeEntityScripts))
        : 0,
    activeScribNodes:
      typeof typed.activeScribNodes === 'number' && Number.isFinite(typed.activeScribNodes)
        ? Math.max(0, Math.trunc(typed.activeScribNodes))
        : 0,
    activeScriptIds: normalizeScriptIds(
      Array.isArray(typed.activeScriptIds)
        ? typed.activeScriptIds.filter((item): item is string => typeof item === 'string')
        : []
    ),
    claimedAt: typed.claimedAt,
    heartbeatAt: typed.heartbeatAt,
    expiresAt: typed.expiresAt,
  };
}

function resolveHeartbeatTtlMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.REY30_SCRIPT_RUNTIME_HEARTBEAT_TTL_MS || DEFAULT_HEARTBEAT_TTL_MS);
  return Number.isFinite(raw) && raw >= 5_000 ? Math.trunc(raw) : DEFAULT_HEARTBEAT_TTL_MS;
}

function isStale(record: ScriptRuntimeLiveSessionRecord, nowMs: number, ttlMs: number): boolean {
  const heartbeatAtMs = Date.parse(record.heartbeatAt);
  if (!Number.isFinite(heartbeatAtMs)) return true;
  return nowMs - heartbeatAtMs > ttlMs;
}

async function listFilesystemSessions(
  env: NodeJS.ProcessEnv = process.env
): Promise<ScriptRuntimeLiveSessionRecord[]> {
  const root = getLiveSessionsRoot(env);
  const entries = await fs.readdir(root, { withFileTypes: true }).catch((error) => {
    if (isFsError(error, 'ENOENT')) return [];
    throw error;
  });

  const records = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map(async (entry) => {
        try {
          const raw = await fs.readFile(path.join(root, entry.name), 'utf8');
          return parseLiveSession(JSON.parse(raw));
        } catch {
          return null;
        }
      })
  );

  return records.filter((item): item is ScriptRuntimeLiveSessionRecord => Boolean(item));
}

async function listBlobSessions(): Promise<ScriptRuntimeLiveSessionRecord[]> {
  const store = resolveBlobStore();
  const result = await store.list({
    prefix: `${LIVE_SESSION_PREFIX}/`,
  });
  const records = await Promise.all(
    result.blobs.map(async (blob) => {
      try {
        const raw = await store.get(blob.key, { type: 'json' });
        return parseLiveSession(raw);
      } catch {
        return null;
      }
    })
  );
  return records.filter((item): item is ScriptRuntimeLiveSessionRecord => Boolean(item));
}

async function readExecutionLease(): Promise<ScriptRuntimeExecutionLeaseRecord | null> {
  if (resolveScriptStorageBackend() === 'filesystem') {
    try {
      const raw = await fs.readFile(getLeaseFilesystemPath(), 'utf8');
      return parseExecutionLease(JSON.parse(raw));
    } catch (error) {
      if (isFsError(error, 'ENOENT')) return null;
      throw error;
    }
  }

  const store = resolveBlobStore();
  try {
    const raw = await store.get(getLeaseBlobKey(), { type: 'json' });
    return parseExecutionLease(raw);
  } catch {
    return null;
  }
}

async function writeExecutionLease(record: ScriptRuntimeExecutionLeaseRecord): Promise<void> {
  if (resolveScriptStorageBackend() === 'filesystem') {
    const targetPath = getLeaseFilesystemPath();
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, JSON.stringify(record, null, 2), 'utf8');
    return;
  }

  const store = resolveBlobStore();
  await store.setJSON(getLeaseBlobKey(), record);
}

async function deleteExecutionLease(): Promise<void> {
  if (resolveScriptStorageBackend() === 'filesystem') {
    await fs.unlink(getLeaseFilesystemPath()).catch((error) => {
      if (isFsError(error, 'ENOENT')) return;
      throw error;
    });
    return;
  }

  const store = resolveBlobStore();
  await store.delete(getLeaseBlobKey());
}

function isLeaseExpired(record: ScriptRuntimeExecutionLeaseRecord, nowMs: number): boolean {
  const expiresAtMs = Date.parse(record.expiresAt);
  if (!Number.isFinite(expiresAtMs)) return true;
  return nowMs >= expiresAtMs;
}

function buildLeaseView(params: {
  storageMode: 'local' | 'shared';
  currentSessionId?: string | null;
  currentInstanceId?: string | null;
  lease: ScriptRuntimeExecutionLeaseRecord | null;
  nowMs: number;
}): ScriptRuntimeExecutionLeaseView {
  if (params.storageMode === 'local') {
    return {
      status: 'local-only',
      ownerInstanceId: params.currentInstanceId || null,
      ownerPlayState: params.currentInstanceId ? 'PLAYING' : null,
      ownerHeartbeatAt: null,
      leaseExpiresAt: null,
      stale: false,
    };
  }

  if (!params.lease) {
    return {
      status: 'unclaimed',
      ownerInstanceId: null,
      ownerPlayState: null,
      ownerHeartbeatAt: null,
      leaseExpiresAt: null,
      stale: false,
    };
  }

  const stale = isLeaseExpired(params.lease, params.nowMs);
  const currentSessionOwnsLease =
    Boolean(params.currentSessionId) && params.lease.sessionId === params.currentSessionId;
  const currentInstanceOwnsLease =
    Boolean(params.currentInstanceId) && params.lease.instanceId === params.currentInstanceId;

  return {
    status: currentSessionOwnsLease || currentInstanceOwnsLease ? 'owned' : 'standby',
    ownerInstanceId: params.lease.instanceId,
    ownerPlayState: params.lease.playState,
    ownerHeartbeatAt: params.lease.heartbeatAt,
    leaseExpiresAt: params.lease.expiresAt,
    stale,
  };
}

export async function listScriptRuntimeLiveSessions(): Promise<ScriptRuntimeLiveSessionRecord[]> {
  if (resolveScriptStorageBackend() === 'filesystem') {
    return listFilesystemSessions();
  }
  return listBlobSessions();
}

export async function upsertScriptRuntimeLiveSession(params: {
  instanceId: string;
  sessionId: string;
  userId: string;
  playState: ScriptRuntimePlayState;
  activeEntityScripts: number;
  activeScribNodes: number;
  activeScriptIds: string[];
}): Promise<ScriptRuntimeLiveSessionRecord> {
  const record: ScriptRuntimeLiveSessionRecord = {
    version: LIVE_SESSION_VERSION,
    instanceId: params.instanceId.trim(),
    sessionId: params.sessionId.trim(),
    userId: params.userId.trim(),
    playState: params.playState,
    activeEntityScripts: Math.max(0, Math.trunc(params.activeEntityScripts)),
    activeScribNodes: Math.max(0, Math.trunc(params.activeScribNodes)),
    activeScriptIds: normalizeScriptIds(params.activeScriptIds),
    heartbeatAt: new Date().toISOString(),
  };

  if (resolveScriptStorageBackend() === 'filesystem') {
    const targetPath = getFilesystemPath(record.sessionId, record.instanceId);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, JSON.stringify(record, null, 2), 'utf8');
    return record;
  }

  const store = resolveBlobStore();
  await store.setJSON(getBlobKey(record.sessionId, record.instanceId), record);
  return record;
}

export async function registerScriptRuntimeHeartbeat(params: {
  instanceId: string;
  sessionId: string;
  userId: string;
  playState: ScriptRuntimePlayState;
  activeEntityScripts: number;
  activeScribNodes: number;
  activeScriptIds: string[];
}): Promise<{
  heartbeat: ScriptRuntimeLiveSessionRecord;
  lease: ScriptRuntimeExecutionLeaseView;
}> {
  const heartbeat = await upsertScriptRuntimeLiveSession(params);
  const storageMode = resolveScriptStorageBackend() === 'netlify-blobs' ? 'shared' : 'local';
  const nowMs = Date.now();
  const ttlMs = resolveHeartbeatTtlMs();

  if (storageMode === 'local') {
    return {
      heartbeat,
      lease: buildLeaseView({
        storageMode,
        currentSessionId: params.sessionId,
        currentInstanceId: params.instanceId,
        lease: null,
        nowMs,
      }),
    };
  }

  let lease = await readExecutionLease();
  if (lease && isLeaseExpired(lease, nowMs)) {
    await deleteExecutionLease().catch(() => undefined);
    lease = null;
  }

  const currentOwnsLease =
    Boolean(lease) &&
    lease!.sessionId === params.sessionId &&
    lease!.instanceId === params.instanceId;

  if (params.playState === 'PLAYING') {
    if (!lease || currentOwnsLease) {
      lease = {
        version: EXECUTION_LEASE_VERSION,
        instanceId: params.instanceId,
        sessionId: params.sessionId,
        userId: params.userId,
        playState: 'PLAYING',
        activeEntityScripts: heartbeat.activeEntityScripts,
        activeScribNodes: heartbeat.activeScribNodes,
        activeScriptIds: [...heartbeat.activeScriptIds],
        claimedAt: currentOwnsLease ? lease!.claimedAt : heartbeat.heartbeatAt,
        heartbeatAt: heartbeat.heartbeatAt,
        expiresAt: new Date(nowMs + ttlMs).toISOString(),
      };
      await writeExecutionLease(lease);
    }
  } else if (currentOwnsLease) {
    await deleteExecutionLease().catch(() => undefined);
    lease = null;
  }

  return {
    heartbeat,
    lease: buildLeaseView({
      storageMode,
      currentSessionId: params.sessionId,
      currentInstanceId: params.instanceId,
      lease,
      nowMs,
    }),
  };
}

export async function deleteScriptRuntimeLiveSession(params: {
  instanceId: string;
  sessionId: string;
}): Promise<void> {
  if (resolveScriptStorageBackend() === 'filesystem') {
    const targetPath = getFilesystemPath(params.sessionId, params.instanceId);
    await fs.unlink(targetPath).catch((error) => {
      if (isFsError(error, 'ENOENT')) return;
      throw error;
    });
    return;
  }

  const store = resolveBlobStore();
  await store.delete(getBlobKey(params.sessionId, params.instanceId));
}

export async function summarizeScriptRuntimeLiveSessions(params: {
  currentSessionId?: string | null;
  currentInstanceId?: string | null;
  env?: NodeJS.ProcessEnv;
} = {}): Promise<ScriptRuntimeLiveSessionSummary> {
  const env = params.env ?? process.env;
  const ttlMs = resolveHeartbeatTtlMs(env);
  const nowMs = Date.now();
  const records = await listScriptRuntimeLiveSessions();
  const staleThresholdMs = ttlMs * STALE_RETENTION_MULTIPLIER;
  const staleRecords = records.filter((record) => isStale(record, nowMs, ttlMs));

  await Promise.all(
    staleRecords
      .filter((record) => {
        const heartbeatAtMs = Date.parse(record.heartbeatAt);
        return !Number.isFinite(heartbeatAtMs) || nowMs - heartbeatAtMs > staleThresholdMs;
      })
      .map((record) =>
        deleteScriptRuntimeLiveSession({
          sessionId: record.sessionId,
          instanceId: record.instanceId,
        }).catch(() => undefined)
      )
  );

  const sessions = [...records]
    .sort((left, right) => right.heartbeatAt.localeCompare(left.heartbeatAt))
    .slice(0, MAX_EXPOSED_SESSIONS)
    .map<ScriptRuntimeLiveSessionView>((record) => ({
      instanceId: record.instanceId,
      currentSession: Boolean(params.currentSessionId && record.sessionId === params.currentSessionId),
      playState: record.playState,
      activeEntityScripts: record.activeEntityScripts,
      activeScribNodes: record.activeScribNodes,
      activeScriptIds: [...record.activeScriptIds],
      heartbeatAt: record.heartbeatAt,
      stale: isStale(record, nowMs, ttlMs),
    }));

  const activeSessions = records.filter((record) => !isStale(record, nowMs, ttlMs)).length;
  const playingSessions = records.filter(
    (record) => !isStale(record, nowMs, ttlMs) && record.playState === 'PLAYING'
  ).length;
  const staleSessions = records.filter((record) => isStale(record, nowMs, ttlMs)).length;
  const storageMode = resolveScriptStorageBackend(env) === 'netlify-blobs' ? 'shared' : 'local';
  let lease = storageMode === 'shared' ? await readExecutionLease().catch(() => null) : null;
  if (lease && isLeaseExpired(lease, nowMs)) {
    await deleteExecutionLease().catch(() => undefined);
    lease = null;
  }
  const leaseView = buildLeaseView({
    storageMode,
    currentSessionId: params.currentSessionId,
    currentInstanceId: params.currentInstanceId,
    lease,
    nowMs,
  });
  const currentSessionOwnsLease =
    storageMode === 'local'
      ? Boolean(params.currentSessionId)
      : leaseView.status === 'owned' &&
        Boolean(params.currentSessionId && lease?.sessionId === params.currentSessionId);
  const currentInstanceOwnsLease =
    storageMode === 'local'
      ? Boolean(params.currentInstanceId)
      : leaseView.status === 'owned' &&
        Boolean(params.currentInstanceId && lease?.instanceId === params.currentInstanceId);

  return {
    coordinationMode: 'heartbeat-sessions',
    ownershipMode: storageMode === 'shared' ? 'session-lease' : 'implicit-local',
    heartbeatTtlMs: ttlMs,
    storageMode,
    activeSessions,
    playingSessions,
    staleSessions,
    currentSessionPresent: records.some(
      (record) =>
        Boolean(params.currentSessionId) &&
        record.sessionId === params.currentSessionId &&
        !isStale(record, nowMs, ttlMs)
    ),
    currentSessionOwnsLease,
    currentInstanceOwnsLease,
    lease: leaseView,
    sessions,
  };
}
