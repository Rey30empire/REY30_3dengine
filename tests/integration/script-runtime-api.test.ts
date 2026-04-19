import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { NextRequest } from 'next/server';
import { UserRole } from '@prisma/client';
import { POST as scriptsPost, PUT as scriptsPut } from '@/app/api/scripts/route';
import { POST as scriptsCompilePost } from '@/app/api/scripts/compile/route';
import { GET as scriptsRuntimeGet } from '@/app/api/scripts/runtime/route';
import { db } from '@/lib/db';
import { createSessionForUser, SESSION_COOKIE_NAME } from '@/lib/security/auth';

const cleanupUserIds = new Set<string>();
const cleanupDirs = new Set<string>();
const env = process.env as Record<string, string | undefined>;

function buildAuthedRequest(url: string, token: string, init: RequestInit = {}) {
  const { signal, ...restInit } = init;
  const headers = new Headers(init.headers);
  headers.set('cookie', `${SESSION_COOKIE_NAME}=${token}`);
  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  return new NextRequest(url, {
    ...restInit,
    headers,
    ...(signal ? { signal } : {}),
  });
}

async function createEditorSession() {
  const user = await db.user.create({
    data: {
      email: `script-runtime-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`,
      role: UserRole.EDITOR,
    },
  });
  cleanupUserIds.add(user.id);
  const { token } = await createSessionForUser(user.id);
  return { token, userId: user.id };
}

async function withTempScriptsRoot<T>(run: () => Promise<T>) {
  const previousRoot = env.REY30_SCRIPT_ROOT;
  const previousRuntimeFlag = env.REY30_ENABLE_CUSTOM_SCRIPT_RUNTIME;
  const previousNodeEnv = env.NODE_ENV;
  const scriptsRoot = await mkdtemp(path.join(os.tmpdir(), 'rey30-script-runtime-'));
  cleanupDirs.add(scriptsRoot);
  env.REY30_SCRIPT_ROOT = scriptsRoot;
  env.REY30_ENABLE_CUSTOM_SCRIPT_RUNTIME = 'true';
  env.NODE_ENV = 'development';

  try {
    return await run();
  } finally {
    if (previousRoot === undefined) {
      delete env.REY30_SCRIPT_ROOT;
    } else {
      env.REY30_SCRIPT_ROOT = previousRoot;
    }
    if (previousRuntimeFlag === undefined) {
      delete env.REY30_ENABLE_CUSTOM_SCRIPT_RUNTIME;
    } else {
      env.REY30_ENABLE_CUSTOM_SCRIPT_RUNTIME = previousRuntimeFlag;
    }
    if (previousNodeEnv === undefined) {
      delete env.NODE_ENV;
    } else {
      env.NODE_ENV = previousNodeEnv;
    }
  }
}

afterEach(async () => {
  await Promise.all(
    Array.from(cleanupUserIds).map(async (userId) => {
      await db.user.delete({ where: { id: userId } }).catch(() => undefined);
      cleanupUserIds.delete(userId);
    })
  );

  await Promise.all(
    Array.from(cleanupDirs).map(async (dir) => {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
      cleanupDirs.delete(dir);
    })
  );
});

describe('Script runtime API', () => {
  it('serves only reviewed artifacts and invalidates them after saves', async () => {
    await withTempScriptsRoot(async () => {
      const { token } = await createEditorSession();
      const scriptPath = 'runtime/guarded-script.ts';

      const createResponse = await scriptsPost(
        buildAuthedRequest('http://localhost/api/scripts', token, {
          method: 'POST',
          body: JSON.stringify({
            directory: 'runtime',
            name: 'guarded-script.ts',
            content: 'export function update(ctx) { ctx.setTransform({ x: 1 }); }\n',
          }),
        })
      );
      expect(createResponse.status).toBe(200);

      const compileResponse = await scriptsCompilePost(
        buildAuthedRequest('http://localhost/api/scripts/compile', token, {
          method: 'POST',
          body: JSON.stringify({ path: scriptPath }),
        })
      );
      const compilePayload = await compileResponse.json();

      expect(compileResponse.status).toBe(200);
      expect(compilePayload.ok).toBe(true);
      expect(compilePayload.runtime).toMatchObject({
        reviewedArtifact: true,
        persisted: true,
      });

      const runtimeReadyResponse = await scriptsRuntimeGet(
        buildAuthedRequest(
          `http://localhost/api/scripts/runtime?path=${encodeURIComponent(scriptPath)}`,
          token
        )
      );
      const runtimeReadyPayload = await runtimeReadyResponse.json();

      expect(runtimeReadyResponse.status).toBe(200);
      expect(runtimeReadyPayload.ready).toBe(true);
      expect(typeof runtimeReadyPayload.compiledCode).toBe('string');
      expect(typeof runtimeReadyPayload.runtime.compiledHash).toBe('string');

      const saveResponse = await scriptsPut(
        buildAuthedRequest('http://localhost/api/scripts', token, {
          method: 'PUT',
          body: JSON.stringify({
            path: scriptPath,
            content: 'export function update(ctx) { ctx.setTransform({ x: 2 }); }\n',
          }),
        })
      );
      expect(saveResponse.status).toBe(200);

      const runtimeStaleResponse = await scriptsRuntimeGet(
        buildAuthedRequest(
          `http://localhost/api/scripts/runtime?path=${encodeURIComponent(scriptPath)}`,
          token
        )
      );
      const runtimeStalePayload = await runtimeStaleResponse.json();

      expect(runtimeStaleResponse.status).toBe(409);
      expect(runtimeStalePayload.ready).toBe(false);
      expect(String(runtimeStalePayload.error || '')).toContain('Scrib Studio');
    });
  });

  it('keeps a reviewed artifact available after a route module reload', async () => {
    await withTempScriptsRoot(async () => {
      const { token } = await createEditorSession();
      const scriptPath = 'runtime/restart-survivor.ts';

      const createResponse = await scriptsPost(
        buildAuthedRequest('http://localhost/api/scripts', token, {
          method: 'POST',
          body: JSON.stringify({
            directory: 'runtime',
            name: 'restart-survivor.ts',
            content: 'export function update(ctx) { ctx.setTransform({ x: 3 }); }\n',
          }),
        })
      );
      expect(createResponse.status).toBe(200);

      const compileResponse = await scriptsCompilePost(
        buildAuthedRequest('http://localhost/api/scripts/compile', token, {
          method: 'POST',
          body: JSON.stringify({ path: scriptPath }),
        })
      );
      const compilePayload = await compileResponse.json();

      expect(compileResponse.status).toBe(200);
      expect(compilePayload.runtime).toMatchObject({
        reviewedArtifact: true,
        persisted: true,
      });

      vi.resetModules();

      const { GET: runtimeGetAfterRestart } = await import('@/app/api/scripts/runtime/route');
      const runtimeReadyResponse = await runtimeGetAfterRestart(
        buildAuthedRequest(
          `http://localhost/api/scripts/runtime?path=${encodeURIComponent(scriptPath)}`,
          token
        )
      );
      const runtimeReadyPayload = await runtimeReadyResponse.json();

      expect(runtimeReadyResponse.status).toBe(200);
      expect(runtimeReadyPayload.ready).toBe(true);
      expect(runtimeReadyPayload.runtime.compiledHash).toBe(compilePayload.runtime.compiledHash);
      expect(runtimeReadyPayload.runtime.sourceHash).toBe(compilePayload.runtime.sourceHash);
    });
  });
});
