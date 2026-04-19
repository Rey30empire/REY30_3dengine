import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import path from 'path';
import type {
  EditorProjectSaveData,
  EditorProjectSaveSummary,
} from '@/engine/serialization';
import { isEditorProjectSaveData, summarizeEditorProjectSaveData } from '@/engine/serialization';
import { normalizeProjectKey, sanitizeProjectKeySegment } from '@/lib/project-key';

export type PersistedEditorProjectRecord = {
  userId: string;
  projectKey: string;
  slot: string;
  updatedAt: number;
  summary: EditorProjectSaveSummary;
  saveData: EditorProjectSaveData;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function buildDefaultStorageRoot() {
  if (process.env.NODE_ENV === 'test') {
    const poolId = process.env.VITEST_POOL_ID || 'default';
    return path.join(process.cwd(), '.vitest', 'editor-projects', `${process.pid}-${poolId}`);
  }

  return path.join(process.cwd(), 'download', 'editor-projects');
}

export function getEditorProjectStorageRoot() {
  return process.env.REY30_EDITOR_PROJECT_ROOT?.trim() || buildDefaultStorageRoot();
}

function sanitizeSlot(value: string | null | undefined) {
  return sanitizeProjectKeySegment(value || 'editor_project_current') || 'editor_project_current';
}

function getUserRoot(userId: string) {
  return path.join(getEditorProjectStorageRoot(), sanitizeProjectKeySegment(userId) || 'anonymous');
}

function getProjectRoot(userId: string, projectKey: string) {
  return path.join(getUserRoot(userId), normalizeProjectKey(projectKey));
}

function getProjectFilePath(userId: string, projectKey: string, slot: string) {
  return path.join(getProjectRoot(userId, projectKey), `${sanitizeSlot(slot)}.json`);
}

function getProjectLockPath(userId: string, projectKey: string, slot: string) {
  return path.join(getProjectRoot(userId, projectKey), `${sanitizeSlot(slot)}.lock`);
}

function ensureProjectRoot(userId: string, projectKey: string) {
  mkdirSync(getProjectRoot(userId, projectKey), { recursive: true });
}

function isPersistedEditorProjectRecord(value: unknown): value is PersistedEditorProjectRecord {
  if (!isRecord(value)) return false;
  return (
    typeof value.userId === 'string' &&
    value.userId.trim().length > 0 &&
    typeof value.projectKey === 'string' &&
    value.projectKey.trim().length > 0 &&
    typeof value.slot === 'string' &&
    value.slot.trim().length > 0 &&
    typeof value.updatedAt === 'number' &&
    Number.isFinite(value.updatedAt) &&
    isRecord(value.summary) &&
    isEditorProjectSaveData(value.saveData)
  );
}

function readRecordFromPath(filePath: string): PersistedEditorProjectRecord | null {
  try {
    const raw = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    return isPersistedEditorProjectRecord(parsed) ? parsed : null;
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

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withEditorProjectWriteLock<T>(params: {
  userId: string;
  projectKey: string;
  slot: string;
  timeoutMs?: number;
  staleLockMs?: number;
  work: () => Promise<T>;
}) {
  const timeoutMs = params.timeoutMs ?? 2_000;
  const staleLockMs = params.staleLockMs ?? 10_000;
  const normalizedProjectKey = normalizeProjectKey(params.projectKey);
  const normalizedSlot = sanitizeSlot(params.slot);
  ensureProjectRoot(params.userId, normalizedProjectKey);

  const lockPath = getProjectLockPath(params.userId, normalizedProjectKey, normalizedSlot);
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
        // Otro actor pudo liberar el lock.
      }

      if (Date.now() >= deadline) {
        throw new Error('EDITOR_PROJECT_LOCK_TIMEOUT');
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

export function readEditorProjectRecord(params: {
  userId: string;
  projectKey: string;
  slot: string;
}) {
  return readRecordFromPath(
    getProjectFilePath(params.userId, normalizeProjectKey(params.projectKey), sanitizeSlot(params.slot))
  );
}

export function writeEditorProjectRecord(record: PersistedEditorProjectRecord) {
  const normalizedProjectKey = normalizeProjectKey(record.projectKey);
  const normalizedSlot = sanitizeSlot(record.slot);
  ensureProjectRoot(record.userId, normalizedProjectKey);
  const targetPath = getProjectFilePath(record.userId, normalizedProjectKey, normalizedSlot);
  const tempPath = `${targetPath}.${process.pid}.tmp`;
  writeFileSync(
    tempPath,
    JSON.stringify(
      {
        ...record,
        projectKey: normalizedProjectKey,
        slot: normalizedSlot,
      },
      null,
      2
    ),
    'utf-8'
  );
  try {
    renameSync(tempPath, targetPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code === 'EEXIST' || code === 'EPERM' || code === 'ENOTEMPTY') {
      rmSync(targetPath, { force: true });
      renameSync(tempPath, targetPath);
      return;
    }
    rmSync(tempPath, { force: true });
    throw error;
  }
}

export function removeEditorProjectRecord(params: {
  userId: string;
  projectKey: string;
  slot: string;
}) {
  const filePath = getProjectFilePath(
    params.userId,
    normalizeProjectKey(params.projectKey),
    sanitizeSlot(params.slot)
  );
  if (!existsSync(filePath)) {
    return false;
  }
  removeFileIfExists(filePath);
  return true;
}

export function buildEditorProjectRecord(params: {
  userId: string;
  projectKey: string;
  slot: string;
  saveData: EditorProjectSaveData;
}) {
  const normalizedProjectKey = normalizeProjectKey(params.projectKey);
  const normalizedSlot = sanitizeSlot(params.slot);
  const summary = summarizeEditorProjectSaveData(params.saveData, normalizedSlot);
  if (!summary) {
    throw new Error('INVALID_EDITOR_PROJECT_SAVE_DATA');
  }

  return {
    userId: params.userId,
    projectKey: normalizedProjectKey,
    slot: normalizedSlot,
    updatedAt: Date.now(),
    summary,
    saveData: params.saveData,
  } satisfies PersistedEditorProjectRecord;
}

export function clearEditorProjectStorageForTest() {
  rmSync(getEditorProjectStorageRoot(), { recursive: true, force: true });
}
