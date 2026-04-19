import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const cleanupDirs = new Set<string>();
const env = process.env as Record<string, string | undefined>;

async function withTempScriptsRoot<T>(run: () => Promise<T>) {
  const previousRoot = env.REY30_SCRIPT_ROOT;
  const previousTtl = env.REY30_SCRIPT_RUNTIME_HEARTBEAT_TTL_MS;
  const scriptsRoot = await mkdtemp(path.join(os.tmpdir(), 'rey30-runtime-live-'));
  cleanupDirs.add(scriptsRoot);
  env.REY30_SCRIPT_ROOT = scriptsRoot;
  env.REY30_SCRIPT_RUNTIME_HEARTBEAT_TTL_MS = '15000';

  try {
    return await run();
  } finally {
    if (previousRoot === undefined) {
      delete env.REY30_SCRIPT_ROOT;
    } else {
      env.REY30_SCRIPT_ROOT = previousRoot;
    }
    if (previousTtl === undefined) {
      delete env.REY30_SCRIPT_RUNTIME_HEARTBEAT_TTL_MS;
    } else {
      env.REY30_SCRIPT_RUNTIME_HEARTBEAT_TTL_MS = previousTtl;
    }
  }
}

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(
    Array.from(cleanupDirs).map(async (dir) => {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
      cleanupDirs.delete(dir);
    })
  );
});

describe('script runtime live sessions', () => {
  it('summarizes fresh and stale runtime heartbeats', async () => {
    await withTempScriptsRoot(async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-04-04T10:00:00.000Z'));

      const {
        registerScriptRuntimeHeartbeat,
        summarizeScriptRuntimeLiveSessions,
      } = await import('@/lib/server/script-runtime-live-sessions');

      const first = await registerScriptRuntimeHeartbeat({
        instanceId: 'runtime_1',
        sessionId: 'session-1',
        userId: 'editor-1',
        playState: 'PLAYING',
        activeEntityScripts: 2,
        activeScribNodes: 1,
        activeScriptIds: ['runtime/player.ts'],
      });

      vi.setSystemTime(new Date('2026-04-04T10:00:10.000Z'));

      const second = await registerScriptRuntimeHeartbeat({
        instanceId: 'runtime_2',
        sessionId: 'session-2',
        userId: 'editor-2',
        playState: 'IDLE',
        activeEntityScripts: 0,
        activeScribNodes: 0,
        activeScriptIds: [],
      });

      const freshSummary = await summarizeScriptRuntimeLiveSessions({
        currentSessionId: 'session-2',
        currentInstanceId: 'runtime_2',
      });

      expect(first.lease.status).toBe('local-only');
      expect(second.lease.status).toBe('local-only');
      expect(freshSummary.storageMode).toBe('local');
      expect(freshSummary.ownershipMode).toBe('implicit-local');
      expect(freshSummary.activeSessions).toBe(2);
      expect(freshSummary.playingSessions).toBe(1);
      expect(freshSummary.staleSessions).toBe(0);
      expect(freshSummary.currentSessionPresent).toBe(true);
      expect(freshSummary.currentInstanceOwnsLease).toBe(true);
      expect(freshSummary.lease.status).toBe('local-only');
      expect(freshSummary.sessions[0]).toMatchObject({
        instanceId: 'runtime_2',
        currentSession: true,
        stale: false,
      });

      vi.setSystemTime(new Date('2026-04-04T10:00:40.000Z'));

      const staleSummary = await summarizeScriptRuntimeLiveSessions({
        currentSessionId: 'session-2',
        currentInstanceId: 'runtime_2',
      });

      expect(staleSummary.activeSessions).toBe(0);
      expect(staleSummary.playingSessions).toBe(0);
      expect(staleSummary.staleSessions).toBe(2);
      expect(staleSummary.currentSessionPresent).toBe(false);
    });
  });
});
