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
import type { EditorSessionSnapshot } from '@/lib/editor-session-snapshot';

export type PersistedEditorSessionRecord = {
  sessionId: string;
  userId: string;
  projectKey: string;
  snapshot: EditorSessionSnapshot;
  serverMutationVersion: number;
  lastSeenAt: number;
  lastClientSyncAt: string;
  lastServerMutationAt: string | null;
  updatedBy: 'client' | 'server';
};

function sanitizeSegment(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9_\-.]/g, '_');
}

function buildDefaultStorageRoot() {
  if (process.env.NODE_ENV === 'test') {
    const poolId = process.env.VITEST_POOL_ID || 'default';
    return path.join(process.cwd(), '.vitest', 'editor-sessions', `${process.pid}-${poolId}`);
  }

  return path.join(process.cwd(), 'download', 'editor-sessions');
}

export function getEditorSessionStorageRoot() {
  return (
    process.env.REY30_EDITOR_SESSION_ROOT?.trim() ||
    buildDefaultStorageRoot()
  );
}

function getUserRoot(userId: string) {
  return path.join(getEditorSessionStorageRoot(), sanitizeSegment(userId));
}

function getSessionFilePath(userId: string, sessionId: string) {
  return path.join(getUserRoot(userId), `${sanitizeSegment(sessionId)}.json`);
}

function getSessionLockPath(userId: string, sessionId: string) {
  return path.join(getUserRoot(userId), `${sanitizeSegment(sessionId)}.lock`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isPersistedRecord(value: unknown): value is PersistedEditorSessionRecord {
  if (!isRecord(value)) return false;
  return (
    typeof value.sessionId === 'string' &&
    value.sessionId.trim().length > 0 &&
    typeof value.userId === 'string' &&
    value.userId.trim().length > 0 &&
    typeof value.projectKey === 'string' &&
    value.projectKey.trim().length > 0 &&
    isRecord(value.snapshot) &&
    typeof value.serverMutationVersion === 'number' &&
    Number.isFinite(value.serverMutationVersion) &&
    typeof value.lastSeenAt === 'number' &&
    Number.isFinite(value.lastSeenAt) &&
    typeof value.lastClientSyncAt === 'string' &&
    (value.lastServerMutationAt === null || typeof value.lastServerMutationAt === 'string') &&
    (value.updatedBy === 'client' || value.updatedBy === 'server')
  );
}

function readRecordFromPath(filePath: string): PersistedEditorSessionRecord | null {
  try {
    const raw = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    return isPersistedRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function removeFileIfExists(filePath: string) {
  try {
    unlinkSync(filePath);
  } catch {
    // noop
  }
}

function isExpired(record: PersistedEditorSessionRecord, ttlMs: number) {
  return record.lastSeenAt + ttlMs < Date.now();
}

function ensureUserRoot(userId: string) {
  mkdirSync(getUserRoot(userId), { recursive: true });
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withEditorSessionWriteLock<T>(params: {
  userId: string;
  sessionId: string;
  timeoutMs?: number;
  staleLockMs?: number;
  work: () => Promise<T>;
}): Promise<T> {
  const timeoutMs = params.timeoutMs ?? 2_000;
  const staleLockMs = params.staleLockMs ?? 10_000;
  ensureUserRoot(params.userId);

  const lockPath = getSessionLockPath(params.userId, params.sessionId);
  const deadline = Date.now() + timeoutMs;

  while (true) {
    try {
      mkdirSync(lockPath);
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
        const stats = statSync(lockPath);
        if (Date.now() - stats.mtimeMs > staleLockMs) {
          rmSync(lockPath, { recursive: true, force: true });
          continue;
        }
      } catch {
        // Otro actor pudo liberar el lock entre lecturas.
      }

      if (Date.now() >= deadline) {
        throw new Error('EDITOR_SESSION_LOCK_TIMEOUT');
      }

      await sleep(25);
    }
  }

  try {
    return await params.work();
  } finally {
    rmSync(lockPath, { recursive: true, force: true });
  }
}

export function readEditorSessionRecord(params: {
  userId: string;
  sessionId: string;
  ttlMs: number;
}): PersistedEditorSessionRecord | null {
  const filePath = getSessionFilePath(params.userId, params.sessionId);
  const record = readRecordFromPath(filePath);
  if (!record) {
    return null;
  }

  if (record.userId !== params.userId || isExpired(record, params.ttlMs)) {
    removeFileIfExists(filePath);
    return null;
  }

  return record;
}

export function listEditorSessionRecordsForUser(params: {
  userId: string;
  ttlMs: number;
}): PersistedEditorSessionRecord[] {
  const userRoot = getUserRoot(params.userId);
  if (!existsSync(userRoot)) {
    return [];
  }

  const fileNames = readdirSync(userRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
    .map((entry) => entry.name);

  const records: PersistedEditorSessionRecord[] = [];
  for (const fileName of fileNames) {
    const filePath = path.join(userRoot, fileName);
    const record = readRecordFromPath(filePath);
    if (!record || record.userId !== params.userId || isExpired(record, params.ttlMs)) {
      removeFileIfExists(filePath);
      continue;
    }
    records.push(record);
  }

  return records;
}

export function writeEditorSessionRecord(record: PersistedEditorSessionRecord) {
  ensureUserRoot(record.userId);
  const targetPath = getSessionFilePath(record.userId, record.sessionId);
  const tempPath = `${targetPath}.${process.pid}.tmp`;
  writeFileSync(tempPath, JSON.stringify(record, null, 2), 'utf-8');
  renameSync(tempPath, targetPath);
}

export function removeEditorSessionRecords(params: {
  userId: string;
  sessionId?: string | null;
}) {
  if (params.sessionId) {
    const targetPath = getSessionFilePath(params.userId, params.sessionId);
    if (!existsSync(targetPath)) {
      return false;
    }
    removeFileIfExists(targetPath);
    return true;
  }

  const userRoot = getUserRoot(params.userId);
  if (!existsSync(userRoot)) {
    return false;
  }

  rmSync(userRoot, { recursive: true, force: true });
  return true;
}

export function clearEditorSessionStorageForTest() {
  rmSync(getEditorSessionStorageRoot(), { recursive: true, force: true });
}
