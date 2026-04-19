import { getMCPGateway } from '@/engine/mcp/MCPGateway';
import type { MCPContext, MCPToolCall, MCPToolResult } from '@/engine/command/types';
import {
  createEditorSessionSnapshot,
  editorSessionSnapshotToStoreState,
  type EditorSessionSnapshot,
} from '@/lib/editor-session-snapshot';
import {
  clearEditorSessionStorageForTest,
  listEditorSessionRecordsForUser,
  readEditorSessionRecord,
  removeEditorSessionRecords,
  type PersistedEditorSessionRecord,
  withEditorSessionWriteLock,
  writeEditorSessionRecord,
} from '@/lib/server/editor-session-storage';
import { useEngineStore } from '@/store/editorStore';

const SESSION_TTL_MS = 2 * 60 * 1000;

const SESSION_MUTATION_TOOL_NAMES = new Set([
  'tool.set_selection',
  'scene.create',
  'scene.open',
  'scene.set_sky',
  'scene.add_fog',
  'scene.set_time_of_day',
  'entity.create',
  'entity.delete',
  'entity.set_transform',
  'entity.add_component',
  'entity.clone',
  'phys.add_collider',
  'phys.add_rigidbody',
  'phys.add_character_controller',
  'render.create_light',
  'game.add_health_component',
]);

export type EditorSessionBridgeRecord = PersistedEditorSessionRecord;

type UpsertClientEditorSessionInput = {
  sessionId?: string;
  userId: string;
  projectKey: string;
  snapshot: EditorSessionSnapshot;
  knownServerMutationVersion: number;
};

type UpsertClientEditorSessionResult = {
  accepted: boolean;
  needsRefresh: boolean;
  record: EditorSessionBridgeRecord;
};

declare global {
  var __rey30EditorSessionLock: Promise<void> | undefined;
}

function nowIso() {
  return new Date().toISOString();
}

function getSessionId(value?: string) {
  return value?.trim() || crypto.randomUUID();
}

function cloneRecord(record: EditorSessionBridgeRecord): EditorSessionBridgeRecord {
  return {
    ...record,
    snapshot: createEditorSessionSnapshot(editorSessionSnapshotToStoreState(record.snapshot)),
  };
}

function snapshotCurrentStore() {
  return createEditorSessionSnapshot(useEngineStore.getState());
}

function restoreStoreFromSnapshot(snapshot: EditorSessionSnapshot) {
  useEngineStore.setState(editorSessionSnapshotToStoreState(snapshot));
}

async function withEditorSessionLock<T>(work: () => Promise<T>): Promise<T> {
  const previous = globalThis.__rey30EditorSessionLock ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chained = previous.finally(() => next);
  globalThis.__rey30EditorSessionLock = chained;
  await previous;
  try {
    return await work();
  } finally {
    release();
    if (globalThis.__rey30EditorSessionLock === chained) {
      globalThis.__rey30EditorSessionLock = undefined;
    }
  }
}

export function resetEditorSessionBridgeForTest() {
  clearEditorSessionStorageForTest();
  globalThis.__rey30EditorSessionLock = undefined;
}

export async function upsertClientEditorSession(
  input: UpsertClientEditorSessionInput
): Promise<UpsertClientEditorSessionResult> {
  const sessionId = getSessionId(input.sessionId);
  return withEditorSessionWriteLock({
    userId: input.userId,
    sessionId,
    work: async () => {
      const existing = readEditorSessionRecord({
        userId: input.userId,
        sessionId,
        ttlMs: SESSION_TTL_MS,
      });
      const timestamp = Date.now();

      if (
        existing &&
        input.knownServerMutationVersion < existing.serverMutationVersion
      ) {
        const refreshed: EditorSessionBridgeRecord = {
          ...existing,
          lastSeenAt: timestamp,
        };
        writeEditorSessionRecord(refreshed);
        return {
          accepted: false,
          needsRefresh: true,
          record: cloneRecord(refreshed),
        };
      }

      const record: EditorSessionBridgeRecord = {
        sessionId,
        userId: input.userId,
        projectKey: input.projectKey,
        snapshot: input.snapshot,
        serverMutationVersion: existing ? existing.serverMutationVersion : 0,
        lastSeenAt: timestamp,
        lastClientSyncAt: nowIso(),
        lastServerMutationAt: existing ? existing.lastServerMutationAt : null,
        updatedBy: 'client',
      };

      writeEditorSessionRecord(record);
      return {
        accepted: true,
        needsRefresh: false,
        record: cloneRecord(record),
      };
    },
  });
}

export function resolveEditorSessionRecord(params: {
  userId: string;
  preferredSessionId?: string | null;
  projectKey?: string | null;
}): EditorSessionBridgeRecord | null {
  if (params.preferredSessionId) {
    const preferred = readEditorSessionRecord({
      userId: params.userId,
      sessionId: params.preferredSessionId,
      ttlMs: SESSION_TTL_MS,
    });
    if (preferred) {
      return cloneRecord(preferred);
    }
  }

  const records = listEditorSessionRecordsForUser({
    userId: params.userId,
    ttlMs: SESSION_TTL_MS,
  });
  let best: EditorSessionBridgeRecord | null = null;
  for (const record of records) {
    if (params.projectKey && record.projectKey !== params.projectKey) continue;
    if (!best || record.lastSeenAt > best.lastSeenAt) {
      best = record;
    }
  }

  if (best) return cloneRecord(best);

  if (!params.projectKey) return null;

  for (const record of records) {
    if (!best || record.lastSeenAt > best.lastSeenAt) {
      best = record;
    }
  }

  return best ? cloneRecord(best) : null;
}

export function removeEditorSessionRecord(params: {
  userId: string;
  sessionId?: string | null;
}) {
  return removeEditorSessionRecords(params);
}

export async function getEditorSessionContext(params: {
  userId: string;
  preferredSessionId?: string | null;
  projectKey?: string | null;
}): Promise<{ session: EditorSessionBridgeRecord | null; context: MCPContext | null }> {
  const record = resolveEditorSessionRecord(params);
  if (!record) {
    return { session: null, context: null };
  }

  return withEditorSessionLock(async () => {
    const previous = snapshotCurrentStore();
    try {
      restoreStoreFromSnapshot(record.snapshot);
      const context = getMCPGateway().getContext();
      return {
        session: resolveEditorSessionRecord({
          userId: params.userId,
          preferredSessionId: record.sessionId,
          projectKey: params.projectKey,
        }),
        context,
      };
    } finally {
      restoreStoreFromSnapshot(previous);
    }
  });
}

export async function executeEditorSessionToolCalls(params: {
  userId: string;
  preferredSessionId?: string | null;
  projectKey?: string | null;
  toolCalls: MCPToolCall[];
}): Promise<{
  session: EditorSessionBridgeRecord | null;
  results: MCPToolResult[];
  mutated: boolean;
}> {
  const record = resolveEditorSessionRecord(params);
  if (!record) {
    return {
      session: null,
      results: [],
      mutated: false,
    };
  }

  return withEditorSessionLock(async () => {
    return withEditorSessionWriteLock({
      userId: params.userId,
      sessionId: record.sessionId,
      work: async () => {
        const liveRecord = readEditorSessionRecord({
          userId: params.userId,
          sessionId: record.sessionId,
          ttlMs: SESSION_TTL_MS,
        });
        if (!liveRecord) {
          return { session: null, results: [], mutated: false };
        }

        const previous = snapshotCurrentStore();
        let mutated = false;
        try {
          restoreStoreFromSnapshot(liveRecord.snapshot);
          const gateway = getMCPGateway();
          const results: MCPToolResult[] = [];
          for (const toolCall of params.toolCalls) {
            const result = await gateway.executeToolCall(toolCall);
            results.push(result);
            if (result.status === 'success' && SESSION_MUTATION_TOOL_NAMES.has(toolCall.name)) {
              mutated = true;
            }
          }

          const nextSnapshot = snapshotCurrentStore();
          const nextRecord: EditorSessionBridgeRecord = {
            ...liveRecord,
            snapshot: nextSnapshot,
            lastSeenAt: Date.now(),
            updatedBy: 'server',
            lastServerMutationAt: mutated ? nowIso() : liveRecord.lastServerMutationAt,
            serverMutationVersion: mutated
              ? liveRecord.serverMutationVersion + 1
              : liveRecord.serverMutationVersion,
          };
          writeEditorSessionRecord(nextRecord);
          return {
            session: cloneRecord(nextRecord),
            results,
            mutated,
          };
        } finally {
          restoreStoreFromSnapshot(previous);
        }
      },
    });
  });
}

export async function applyEditorSessionMutation<T>(params: {
  userId: string;
  preferredSessionId?: string | null;
  projectKey?: string | null;
  mutate: () => Promise<T> | T;
}): Promise<{
  session: EditorSessionBridgeRecord | null;
  result: T | null;
  mutated: boolean;
}> {
  const record = resolveEditorSessionRecord(params);
  if (!record) {
    return {
      session: null,
      result: null,
      mutated: false,
    };
  }

  return withEditorSessionLock(async () => {
    return withEditorSessionWriteLock({
      userId: params.userId,
      sessionId: record.sessionId,
      work: async () => {
        const liveRecord = readEditorSessionRecord({
          userId: params.userId,
          sessionId: record.sessionId,
          ttlMs: SESSION_TTL_MS,
        });
        if (!liveRecord) {
          return {
            session: null,
            result: null,
            mutated: false,
          };
        }

        const previous = snapshotCurrentStore();
        try {
          restoreStoreFromSnapshot(liveRecord.snapshot);
          const result = await params.mutate();
          const nextSnapshot = snapshotCurrentStore();
          const nextRecord: EditorSessionBridgeRecord = {
            ...liveRecord,
            snapshot: nextSnapshot,
            lastSeenAt: Date.now(),
            updatedBy: 'server',
            lastServerMutationAt: nowIso(),
            serverMutationVersion: liveRecord.serverMutationVersion + 1,
          };
          writeEditorSessionRecord(nextRecord);
          return {
            session: cloneRecord(nextRecord),
            result,
            mutated: true,
          };
        } finally {
          restoreStoreFromSnapshot(previous);
        }
      },
    });
  });
}
