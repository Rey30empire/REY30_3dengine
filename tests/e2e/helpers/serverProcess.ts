import { spawn, type ChildProcessByStdio } from 'node:child_process';
import net from 'node:net';
import type { Readable } from 'node:stream';

export type StartedServer = {
  baseUrl: string;
  child: ChildProcessByStdio<null, Readable, Readable>;
  logs: () => string;
  stop: () => Promise<void>;
};

export const E2E_HOST = '127.0.0.1';
export const DEFAULT_E2E_POLL_INTERVAL_MS = 1_000;

export function findFreePort(host = E2E_HOST): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, host, () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Unable to resolve a free port.'));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

export function spawnNodeServerProcess(params: {
  root: string;
  args: string[];
  env: NodeJS.ProcessEnv;
}): ChildProcessByStdio<null, Readable, Readable> {
  return spawn(process.execPath, params.args, {
    cwd: params.root,
    env: params.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export function createProcessLogBuffer(
  child: ChildProcessByStdio<null, Readable, Readable>,
  maxEntries = 200
) {
  const outputLogs: string[] = [];
  const appendLogs = (prefix: string, buffer: Buffer) => {
    outputLogs.push(`${prefix}${buffer.toString('utf8')}`);
    if (outputLogs.length > maxEntries) {
      outputLogs.splice(0, outputLogs.length - maxEntries);
    }
  };

  child.stdout.on('data', (chunk) => appendLogs('', chunk));
  child.stderr.on('data', (chunk) => appendLogs('[stderr] ', chunk));

  return () => outputLogs.join('');
}

export async function waitForProcessReady(params: {
  baseUrl: string;
  child: ChildProcessByStdio<null, Readable, Readable>;
  getLogs: () => string;
  label: string;
  timeoutMs: number;
  pollIntervalMs?: number;
  check: (baseUrl: string) => Promise<boolean>;
}) {
  const deadline = Date.now() + params.timeoutMs;
  const pollIntervalMs = params.pollIntervalMs ?? DEFAULT_E2E_POLL_INTERVAL_MS;

  while (Date.now() < deadline) {
    if (params.child.exitCode !== null) {
      throw new Error(`${params.label} exited early with code ${params.child.exitCode}\n${params.getLogs()}`);
    }

    try {
      if (await params.check(params.baseUrl)) {
        return;
      }
    } catch {
      // Retry until timeout.
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(`Timed out waiting for ${params.baseUrl}\n${params.getLogs()}`);
}

export async function stopServerProcess(child: ChildProcessByStdio<null, Readable, Readable>) {
  if (child.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        // noop
      }
    }, 10_000);

    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });

    try {
      child.kill('SIGTERM');
    } catch {
      clearTimeout(timeout);
      resolve();
    }
  });
}

export function createStartedServer(params: {
  baseUrl: string;
  child: ChildProcessByStdio<null, Readable, Readable>;
  logs: () => string;
}): StartedServer {
  return {
    baseUrl: params.baseUrl,
    child: params.child,
    logs: params.logs,
    stop: () => stopServerProcess(params.child),
  };
}
