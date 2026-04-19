import { mkdir, open, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import type { Download, Route } from 'playwright';
import {
  createProcessLogBuffer,
  createStartedServer,
  E2E_HOST,
  findFreePort,
  spawnNodeServerProcess,
  type StartedServer,
  waitForProcessReady,
} from './serverProcess';

export type { StartedServer } from './serverProcess';

const START_TIMEOUT_MS = 180_000;
const DEV_SERVER_LOCK_TIMEOUT_MS = 360_000;

async function acquireNextDevServerLock(root: string): Promise<() => Promise<void>> {
  const lockDir = path.join(root, '.vitest');
  const lockPath = path.join(lockDir, 'next-dev-server.lock');
  const deadline = Date.now() + DEV_SERVER_LOCK_TIMEOUT_MS;
  await mkdir(lockDir, { recursive: true });

  while (Date.now() < deadline) {
    try {
      const handle = await open(lockPath, 'wx');
      await handle.writeFile(
        JSON.stringify(
          {
            pid: process.pid,
            acquiredAt: new Date().toISOString(),
          },
          null,
          2
        )
      );
      await handle.close();
      return async () => {
        await rm(lockPath, { force: true });
      };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }

  throw new Error(`Timed out waiting for exclusive Next dev server lock at ${lockPath}`);
}

export async function startNextDevServer(root: string): Promise<StartedServer> {
  const releaseLock = await acquireNextDevServerLock(root);
  const port = await findFreePort();
  const baseUrl = `http://${E2E_HOST}:${port}`;
  const nextCli = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
  const child = spawnNodeServerProcess({
    root,
    args: [nextCli, 'dev', '--webpack', '-H', E2E_HOST, '-p', String(port)],
    env: {
      ...process.env,
      NODE_ENV: 'development',
      NEXT_TELEMETRY_DISABLED: '1',
    },
  });
  const logs = createProcessLogBuffer(child);

  try {
    await waitForProcessReady({
      baseUrl,
      child,
      getLogs: logs,
      label: 'next dev',
      timeoutMs: START_TIMEOUT_MS,
      check: async (url) => {
        const response = await fetch(url, { cache: 'no-store' });
        return response.status === 200;
      },
    });
  } catch (error) {
    try {
      child.kill('SIGKILL');
    } catch {
      // noop
    }
    await releaseLock();
    throw error;
  }

  const startedServer = createStartedServer({ baseUrl, child, logs });
  return {
    ...startedServer,
    stop: async () => {
      try {
        await startedServer.stop();
      } finally {
        await releaseLock();
      }
    },
  };
}

export function fulfillJson(route: Route, payload: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(payload),
  });
}

export async function readDownloadText(download: Download) {
  const filePath = await download.path();
  if (!filePath) {
    throw new Error(`Download did not expose a local file path: ${download.suggestedFilename()}`);
  }
  return readFile(filePath, 'utf-8');
}
