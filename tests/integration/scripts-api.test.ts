import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { NextRequest } from 'next/server';
import { UserRole } from '@prisma/client';
import { GET as scriptsGet, POST as scriptsPost } from '@/app/api/scripts/route';
import { db } from '@/lib/db';
import { createSessionForUser, SESSION_COOKIE_NAME } from '@/lib/security/auth';

const cleanupUserIds = new Set<string>();
const cleanupDirs = new Set<string>();

function buildAuthedRequest(url: string, token: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const signal = init.signal ?? undefined;
  headers.set('cookie', `${SESSION_COOKIE_NAME}=${token}`);
  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  return new NextRequest(url, {
    ...init,
    headers,
    signal,
  });
}

async function createEditorSession() {
  const user = await db.user.create({
    data: {
      email: `scripts-api-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`,
      role: UserRole.EDITOR,
    },
  });
  cleanupUserIds.add(user.id);

  const { token } = await createSessionForUser(user.id);
  return { token, userId: user.id };
}

async function withTempScriptsRoot<T>(run: (scriptsRoot: string) => Promise<T>) {
  const previousRoot = process.env.REY30_SCRIPT_ROOT;
  const scriptsRoot = await mkdtemp(path.join(os.tmpdir(), 'rey30-scripts-api-'));
  cleanupDirs.add(scriptsRoot);
  process.env.REY30_SCRIPT_ROOT = scriptsRoot;

  try {
    return await run(scriptsRoot);
  } finally {
    if (previousRoot === undefined) {
      delete process.env.REY30_SCRIPT_ROOT;
    } else {
      process.env.REY30_SCRIPT_ROOT = previousRoot;
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

describe('Scripts API', () => {
  it('creates scripts idempotently when onExists=return-existing', async () => {
    await withTempScriptsRoot(async (scriptsRoot) => {
      const { token } = await createEditorSession();
      const body = {
        directory: 'generated',
        name: 'PlayerController.generated.ts',
        content: 'export const playerControllerVersion = 1;\n',
        onExists: 'return-existing',
      };

      const createResponse = await scriptsPost(
        buildAuthedRequest('http://localhost/api/scripts', token, {
          method: 'POST',
          body: JSON.stringify(body),
        })
      );
      const createPayload = await createResponse.json();

      expect(createResponse.status).toBe(200);
      expect(createPayload.created).toBe(true);
      expect(createPayload.script.relativePath).toBe('generated/PlayerController.generated.ts');

      const secondResponse = await scriptsPost(
        buildAuthedRequest('http://localhost/api/scripts', token, {
          method: 'POST',
          body: JSON.stringify(body),
        })
      );
      const secondPayload = await secondResponse.json();

      expect(secondResponse.status).toBe(200);
      expect(secondPayload.created).toBe(false);
      expect(secondPayload.script.content).toBe(body.content);

      const readResponse = await scriptsGet(
        buildAuthedRequest(
          `http://localhost/api/scripts?path=${encodeURIComponent('generated/PlayerController.generated.ts')}`,
          token
        )
      );
      const readPayload = await readResponse.json();

      expect(readResponse.status).toBe(200);
      expect(readPayload.script.content).toBe(body.content);

      const diskContent = await readFile(
        path.join(scriptsRoot, 'generated', 'PlayerController.generated.ts'),
        'utf-8'
      );
      expect(diskContent).toBe(body.content);
    });
  });

  it('keeps 409 conflict behavior for explicit create-only requests', async () => {
    await withTempScriptsRoot(async () => {
      const { token } = await createEditorSession();
      const body = {
        name: 'conflict-script.ts',
        content: 'export const value = 1;\n',
      };

      const firstResponse = await scriptsPost(
        buildAuthedRequest('http://localhost/api/scripts', token, {
          method: 'POST',
          body: JSON.stringify(body),
        })
      );
      expect(firstResponse.status).toBe(200);

      const secondResponse = await scriptsPost(
        buildAuthedRequest('http://localhost/api/scripts', token, {
          method: 'POST',
          body: JSON.stringify(body),
        })
      );
      const secondPayload = await secondResponse.json();

      expect(secondResponse.status).toBe(409);
      expect(String(secondPayload.error || '')).toContain('already exists');
    });
  });
});
