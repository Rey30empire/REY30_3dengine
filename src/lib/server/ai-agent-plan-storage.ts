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
import { isAgentPlannerRecord, type AgentPlannerRecord } from '@/engine/ai/agentPlanner';
import { normalizeProjectKey, sanitizeProjectKeySegment } from '@/lib/project-key';

type PersistedAgentPlannerRecord = {
  userId: string;
  projectKey: string;
  updatedAt: number;
  plan: AgentPlannerRecord;
};

type LatestAgentPlannerPointer = {
  planId: string;
  updatedAt: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function buildDefaultStorageRoot() {
  if (process.env.NODE_ENV === 'test') {
    const poolId = process.env.VITEST_POOL_ID || 'default';
    return path.join(process.cwd(), '.vitest', 'ai-agent-plans', `${process.pid}-${poolId}`);
  }
  return path.join(process.cwd(), 'download', 'ai-agent-plans');
}

export function getAIAgentPlanStorageRoot() {
  return process.env.REY30_AI_AGENT_PLAN_ROOT?.trim() || buildDefaultStorageRoot();
}

function getUserRoot(userId: string) {
  return path.join(getAIAgentPlanStorageRoot(), sanitizeProjectKeySegment(userId) || 'anonymous');
}

function getProjectRoot(userId: string, projectKey: string) {
  return path.join(getUserRoot(userId), normalizeProjectKey(projectKey));
}

function getPlanFilePath(userId: string, projectKey: string, planId: string) {
  return path.join(
    getProjectRoot(userId, projectKey),
    `${sanitizeProjectKeySegment(planId) || 'plan'}.json`
  );
}

function getLatestPointerPath(userId: string, projectKey: string) {
  return path.join(getProjectRoot(userId, projectKey), 'latest.json');
}

function getProjectLockPath(userId: string, projectKey: string) {
  return path.join(getProjectRoot(userId, projectKey), '.planner.lock');
}

function ensureProjectRoot(userId: string, projectKey: string) {
  mkdirSync(getProjectRoot(userId, projectKey), { recursive: true });
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

function isPersistedAgentPlannerRecord(value: unknown): value is PersistedAgentPlannerRecord {
  if (!isRecord(value)) return false;
  return (
    typeof value.userId === 'string' &&
    typeof value.projectKey === 'string' &&
    typeof value.updatedAt === 'number' &&
    isAgentPlannerRecord(value.plan)
  );
}

function isLatestAgentPlannerPointer(value: unknown): value is LatestAgentPlannerPointer {
  if (!isRecord(value)) return false;
  return typeof value.planId === 'string' && typeof value.updatedAt === 'number';
}

function readJsonFile<T>(filePath: string, validate: (value: unknown) => value is T): T | null {
  try {
    const raw = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    return validate(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeJsonFileAtomic(targetPath: string, value: unknown) {
  const tempPath = `${targetPath}.${process.pid}.tmp`;
  mkdirSync(path.dirname(targetPath), { recursive: true });
  writeFileSync(tempPath, JSON.stringify(value, null, 2), 'utf-8');
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

export async function withAIAgentPlanWriteLock<T>(params: {
  userId: string;
  projectKey: string;
  timeoutMs?: number;
  staleLockMs?: number;
  work: () => Promise<T>;
}) {
  const timeoutMs = params.timeoutMs ?? 2_000;
  const staleLockMs = params.staleLockMs ?? 10_000;
  const normalizedProjectKey = normalizeProjectKey(params.projectKey);
  ensureProjectRoot(params.userId, normalizedProjectKey);
  const lockPath = getProjectLockPath(params.userId, normalizedProjectKey);
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
        // another writer released the lock
      }

      if (Date.now() >= deadline) {
        throw new Error('AI_AGENT_PLAN_LOCK_TIMEOUT');
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

export function readAIAgentPlannerRecord(params: {
  userId: string;
  projectKey: string;
  planId: string;
}) {
  return readJsonFile(
    getPlanFilePath(params.userId, normalizeProjectKey(params.projectKey), params.planId),
    isPersistedAgentPlannerRecord
  )?.plan ?? null;
}

export function readLatestAIAgentPlannerRecord(params: {
  userId: string;
  projectKey: string;
}) {
  const pointer = readJsonFile(
    getLatestPointerPath(params.userId, normalizeProjectKey(params.projectKey)),
    isLatestAgentPlannerPointer
  );
  if (!pointer) {
    return null;
  }
  return readAIAgentPlannerRecord({
    userId: params.userId,
    projectKey: params.projectKey,
    planId: pointer.planId,
  });
}

export async function writeAIAgentPlannerRecord(params: {
  userId: string;
  projectKey: string;
  plan: AgentPlannerRecord;
}) {
  const normalizedProjectKey = normalizeProjectKey(params.projectKey);
  ensureProjectRoot(params.userId, normalizedProjectKey);
  const persisted: PersistedAgentPlannerRecord = {
    userId: params.userId,
    projectKey: normalizedProjectKey,
    updatedAt: Date.now(),
    plan: {
      ...params.plan,
      projectKey: normalizedProjectKey,
    },
  };

  writeJsonFileAtomic(
    getPlanFilePath(params.userId, normalizedProjectKey, params.plan.planId),
    persisted
  );
  writeJsonFileAtomic(getLatestPointerPath(params.userId, normalizedProjectKey), {
    planId: params.plan.planId,
    updatedAt: persisted.updatedAt,
  } satisfies LatestAgentPlannerPointer);
  return persisted.plan;
}

export async function updateAIAgentPlannerRecord(params: {
  userId: string;
  projectKey: string;
  planId: string;
  update: (current: AgentPlannerRecord) => AgentPlannerRecord;
}) {
  return withAIAgentPlanWriteLock({
    userId: params.userId,
    projectKey: params.projectKey,
    work: async () => {
      const current = readAIAgentPlannerRecord(params);
      if (!current) {
        return null;
      }
      const next = params.update(current);
      return writeAIAgentPlannerRecord({
        userId: params.userId,
        projectKey: params.projectKey,
        plan: next,
      });
    },
  });
}

export function removeAIAgentPlannerRecord(params: {
  userId: string;
  projectKey: string;
  planId: string;
}) {
  const normalizedProjectKey = normalizeProjectKey(params.projectKey);
  const filePath = getPlanFilePath(params.userId, normalizedProjectKey, params.planId);
  if (!existsSync(filePath)) {
    return false;
  }
  removeFileIfExists(filePath);
  const latest = readJsonFile(
    getLatestPointerPath(params.userId, normalizedProjectKey),
    isLatestAgentPlannerPointer
  );
  if (latest?.planId === params.planId) {
    removeFileIfExists(getLatestPointerPath(params.userId, normalizedProjectKey));
  }
  return true;
}

export function clearAIAgentPlanStorageForTest() {
  rmSync(getAIAgentPlanStorageRoot(), { recursive: true, force: true });
}
