import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcessByStdio } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { rm } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import { PrismaClient, UserRole } from '@prisma/client';
import { hashPassword } from '@/lib/security/password';
import { resolveProductionEnv } from '../../scripts/production-env.mjs';

type CookieJar = Map<string, string>;

type JsonResponse<T = unknown> = {
  status: number;
  payload: T;
};

type StartedServer = {
  baseUrl: string;
  child: ChildProcessByStdio<null, Readable, Readable>;
  stop: () => Promise<void>;
  logs: () => string;
};

const HOST = '127.0.0.1';
const START_TIMEOUT_MS = 240_000;
const POLL_INTERVAL_MS = 1_000;
const E2E_PASSWORD = 'E2EPass123!';
const OUTPUT_SCRIPTS_ROOT = path.join(process.cwd(), 'output', 'e2e-http-scripts');

function createCookieJar(): CookieJar {
  return new Map();
}

function splitSetCookieHeader(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(/,(?=\s*[A-Za-z0-9!#$%&'*+.^_`|~-]+=)/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getSetCookieHeaders(response: Response): string[] {
  const headers = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  if (typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie();
  }
  return splitSetCookieHeader(response.headers.get('set-cookie'));
}

function updateCookieJar(cookieJar: CookieJar, response: Response) {
  for (const cookie of getSetCookieHeaders(response)) {
    const firstPart = cookie.split(';', 1)[0] || '';
    const separatorIndex = firstPart.indexOf('=');
    if (separatorIndex <= 0) continue;
    const name = firstPart.slice(0, separatorIndex).trim();
    const value = firstPart.slice(separatorIndex + 1).trim();
    if (!name) continue;
    if (!value) {
      cookieJar.delete(name);
      continue;
    }
    cookieJar.set(name, value);
  }
}

function buildCookieHeader(cookieJar: CookieJar): string {
  return Array.from(cookieJar.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

async function fetchJson<T>(
  baseUrl: string,
  pathName: string,
  options: RequestInit,
  cookieJar?: CookieJar
): Promise<JsonResponse<T>> {
  const headers = new Headers(options.headers || {});
  if (cookieJar && cookieJar.size > 0 && !headers.has('cookie')) {
    headers.set('cookie', buildCookieHeader(cookieJar));
  }

  const response = await fetch(`${baseUrl}${pathName}`, {
    ...options,
    headers,
    cache: 'no-store',
  });

  if (cookieJar) {
    updateCookieJar(cookieJar, response);
  }

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as T) : ({} as T);
  return {
    status: response.status,
    payload,
  };
}

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, HOST, () => {
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

async function waitForReady(
  baseUrl: string,
  child: ChildProcessByStdio<null, Readable, Readable>,
  getLogs: () => string
) {
  const deadline = Date.now() + START_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`production-local exited early with code ${child.exitCode}\n${getLogs()}`);
    }

    try {
      const response = await fetch(`${baseUrl}/api/health/ready`, {
        method: 'GET',
        cache: 'no-store',
      });
      if (response.status === 200) {
        const payload = await response.json();
        if (payload?.ok === true && payload?.status === 'ready') {
          return;
        }
      }
    } catch {
      // Retry until timeout.
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(`Timed out waiting for ${baseUrl}/api/health/ready\n${getLogs()}`);
}

async function startProductionLocalServer(
  root: string,
  productionEnv: Record<string, string>
): Promise<StartedServer> {
  const port = await findFreePort();
  const baseUrl = `http://${HOST}:${port}`;
  const outputLogs: string[] = [];

  const startArgs = ['scripts/start-production-local.mjs', '--skip-build'];
  if (
    process.env.CI === 'true' ||
    process.env.REY30_PRODUCTION_LOCAL_SKIP_DOCKER === 'true'
  ) {
    startArgs.push('--skip-docker');
  }

  const child = spawn(process.execPath, startArgs, {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HOSTNAME: HOST,
      PORT: String(port),
      DATABASE_URL: productionEnv.DATABASE_URL,
      NEXTAUTH_SECRET: productionEnv.NEXTAUTH_SECRET,
      REY30_ENCRYPTION_KEY: productionEnv.REY30_ENCRYPTION_KEY,
      REY30_REGISTRATION_MODE: productionEnv.REY30_REGISTRATION_MODE,
      REY30_REGISTRATION_INVITE_TOKEN: productionEnv.REY30_REGISTRATION_INVITE_TOKEN,
      REY30_BOOTSTRAP_OWNER_TOKEN: productionEnv.REY30_BOOTSTRAP_OWNER_TOKEN,
      REY30_ALLOW_OPEN_REGISTRATION_REMOTE:
        productionEnv.REY30_ALLOW_OPEN_REGISTRATION_REMOTE || 'false',
      REY30_ALLOW_IN_MEMORY_RATE_LIMIT_PRODUCTION:
        productionEnv.REY30_ALLOW_IN_MEMORY_RATE_LIMIT_PRODUCTION || 'true',
      REY30_ALLOWED_ORIGINS: `${baseUrl},http://localhost:${port}`,
      REY30_SCRIPT_ROOT: OUTPUT_SCRIPTS_ROOT,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const appendLogs = (prefix: string, buffer: Buffer) => {
    outputLogs.push(`${prefix}${buffer.toString('utf8')}`);
    if (outputLogs.length > 200) {
      outputLogs.splice(0, outputLogs.length - 200);
    }
  };

  child.stdout.on('data', (chunk) => appendLogs('', chunk));
  child.stderr.on('data', (chunk) => appendLogs('[stderr] ', chunk));

  await waitForReady(baseUrl, child, () => outputLogs.join(''));

  return {
    baseUrl,
    child,
    logs: () => outputLogs.join(''),
    stop: async () => {
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
    },
  };
}

describe.sequential('Production HTTP workflows e2e', () => {
  const productionEnv = resolveProductionEnv({
    root: process.cwd(),
    env: process.env,
    defaultDatabaseUrl: process.env.DATABASE_URL || '',
  });
  const createdEmails: string[] = [];
  let prisma: PrismaClient | null = null;
  let server: StartedServer | null = null;
  let editorEmail = '';

  function getServer(): StartedServer {
    if (!server) {
      throw new Error('E2E server is not started.');
    }
    return server;
  }

  beforeAll(async () => {
    server = await startProductionLocalServer(process.cwd(), productionEnv);
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: productionEnv.DATABASE_URL,
        },
      },
    });

    editorEmail = `e2e-editor-${Date.now()}@localhost`;
    createdEmails.push(editorEmail);

    await prisma.user.upsert({
      where: { email: editorEmail },
      update: {
        name: 'E2E Editor',
        role: UserRole.EDITOR,
        passwordHash: hashPassword(E2E_PASSWORD),
        isActive: true,
      },
      create: {
        email: editorEmail,
        name: 'E2E Editor',
        role: UserRole.EDITOR,
        passwordHash: hashPassword(E2E_PASSWORD),
        isActive: true,
      },
    });
  }, 300_000);

  afterAll(async () => {
    if (!prisma || !server) {
      return;
    }

    for (const email of createdEmails) {
      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });
      if (!user) continue;
      await prisma.authSession.deleteMany({ where: { userId: user.id } });
      await prisma.securityAuditLog.deleteMany({ where: { userId: user.id } }).catch(() => undefined);
      await prisma.user.delete({ where: { id: user.id } });
    }

    await prisma.$disconnect().catch(() => undefined);
    await server.stop();
    await rm(OUTPUT_SCRIPTS_ROOT, { recursive: true, force: true }).catch(() => undefined);
  }, 120_000);

  it('covers invite registration, authenticated session, assets and script read access', async () => {
    const startedServer = getServer();
    const cookieJar = createCookieJar();
    const origin = startedServer.baseUrl;
    const viewerEmail = `e2e-viewer-${Date.now()}@localhost`;
    createdEmails.push(viewerEmail);

    const assetsBefore = await fetchJson<{ error?: string }>(
      startedServer.baseUrl,
      '/api/assets',
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
      },
      cookieJar
    );
    expect(assetsBefore.status).toBe(401);

    const register = await fetchJson<{
      success?: boolean;
      user?: { email: string; role: string };
    }>(
      startedServer.baseUrl,
      '/api/auth/register',
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Origin: origin,
        },
        body: JSON.stringify({
          email: viewerEmail,
          password: E2E_PASSWORD,
          name: 'E2E Viewer',
          inviteToken: productionEnv.REY30_REGISTRATION_INVITE_TOKEN,
        }),
      },
      cookieJar
    );

    expect(register.status).toBe(200);
    expect(register.payload.success).toBe(true);
    expect(register.payload.user?.email).toBe(viewerEmail);
    expect(cookieJar.get('rey30_session')).toBeTruthy();

    const session = await fetchJson<{
      authenticated?: boolean;
      user?: { email: string; role: string };
    }>(
      startedServer.baseUrl,
      '/api/auth/session',
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
      },
      cookieJar
    );

    expect(session.status).toBe(200);
    expect(session.payload.authenticated).toBe(true);
    expect(session.payload.user?.email).toBe(viewerEmail);
    expect(session.payload.user?.role).toBe('VIEWER');
    expect(cookieJar.get('rey30_csrf')).toMatch(/^[a-f0-9]{64}$/i);

    const assetsAfter = await fetchJson<{ assets?: unknown[] }>(
      startedServer.baseUrl,
      '/api/assets',
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
      },
      cookieJar
    );
    expect(assetsAfter.status).toBe(200);
    expect(Array.isArray(assetsAfter.payload.assets)).toBe(true);

    const scriptsReadable = await fetchJson<{ scripts?: Array<{ relativePath: string }> }>(
      startedServer.baseUrl,
      '/api/scripts',
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
      },
      cookieJar
    );
    expect(scriptsReadable.status).toBe(200);
    expect(Array.isArray(scriptsReadable.payload.scripts)).toBe(true);
  }, 120_000);

  it('covers editor login, csrf-protected api-config write and Script Workspace CRUD + compile', async () => {
    const startedServer = getServer();
    const cookieJar = createCookieJar();
    const origin = startedServer.baseUrl;

    const login = await fetchJson<{
      success?: boolean;
      user?: { email: string; role: string };
    }>(
      startedServer.baseUrl,
      '/api/auth/login',
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Origin: origin,
        },
        body: JSON.stringify({
          email: editorEmail,
          password: E2E_PASSWORD,
        }),
      },
      cookieJar
    );

    expect(login.status).toBe(200);
    expect(login.payload.success).toBe(true);
    expect(login.payload.user?.role).toBe('EDITOR');

    const session = await fetchJson<{
      authenticated?: boolean;
      user?: { email: string; role: string };
    }>(
      startedServer.baseUrl,
      '/api/auth/session',
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
      },
      cookieJar
    );
    expect(session.status).toBe(200);
    expect(session.payload.authenticated).toBe(true);
    expect(session.payload.user?.email).toBe(editorEmail);

    const csrfToken = cookieJar.get('rey30_csrf') || '';
    expect(csrfToken).toMatch(/^[a-f0-9]{64}$/i);

    const configRead = await fetchJson<{
      apiConfig?: Record<string, unknown>;
      localConfig?: Record<string, unknown>;
      user?: { role: string };
    }>(
      startedServer.baseUrl,
      '/api/user/api-config',
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
      },
      cookieJar
    );
    expect(configRead.status).toBe(200);
    expect(configRead.payload.user?.role).toBe('EDITOR');
    expect(configRead.payload.apiConfig).toBeTruthy();
    expect(configRead.payload.localConfig).toBeTruthy();

    const configWrite = await fetchJson<{
      apiConfig?: Record<string, unknown>;
      localConfig?: Record<string, unknown>;
    }>(
      startedServer.baseUrl,
      '/api/user/api-config',
      {
        method: 'PUT',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Origin: origin,
          'x-rey30-csrf': csrfToken,
        },
        body: JSON.stringify({
          apiConfig: configRead.payload.apiConfig,
          localConfig: configRead.payload.localConfig,
        }),
      },
      cookieJar
    );
    expect(configWrite.status).toBe(200);
    expect(configWrite.payload.apiConfig).toBeTruthy();
    expect(configWrite.payload.localConfig).toBeTruthy();

    const scriptRelativePath = `e2e_generated/e2e_${Date.now()}.ts`;
    const scriptContent = `export function update(): void {\n  console.log('e2e ok');\n}\n`;

    const scriptCreate = await fetchJson<{
      created?: boolean;
      script?: { relativePath: string; content: string };
    }>(
      startedServer.baseUrl,
      '/api/scripts',
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Origin: origin,
          'x-rey30-csrf': csrfToken,
        },
        body: JSON.stringify({
          directory: 'e2e_generated',
          name: path.basename(scriptRelativePath),
          content: scriptContent,
        }),
      },
      cookieJar
    );

    expect(scriptCreate.status).toBe(200);
    expect(scriptCreate.payload.created).toBe(true);
    expect(scriptCreate.payload.script?.relativePath).toBe(scriptRelativePath);

    const scriptsList = await fetchJson<{
      scripts?: Array<{ relativePath: string }>;
    }>(
      startedServer.baseUrl,
      '/api/scripts',
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
      },
      cookieJar
    );
    expect(scriptsList.status).toBe(200);
    expect(
      scriptsList.payload.scripts?.some((item) => item.relativePath === scriptRelativePath)
    ).toBe(true);

    const scriptRead = await fetchJson<{
      script?: { relativePath: string; content: string };
    }>(
      startedServer.baseUrl,
      `/api/scripts?path=${encodeURIComponent(scriptRelativePath)}`,
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
      },
      cookieJar
    );
    expect(scriptRead.status).toBe(200);
    expect(scriptRead.payload.script?.content).toContain('e2e ok');

    const updatedContent = `${scriptContent}\nexport const marker = 'updated';\n`;
    const scriptSave = await fetchJson<{
      script?: { relativePath: string };
    }>(
      startedServer.baseUrl,
      '/api/scripts',
      {
        method: 'PUT',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Origin: origin,
          'x-rey30-csrf': csrfToken,
        },
        body: JSON.stringify({
          path: scriptRelativePath,
          content: updatedContent,
        }),
      },
      cookieJar
    );
    expect(scriptSave.status).toBe(200);
    expect(scriptSave.payload.script?.relativePath).toBe(scriptRelativePath);

    const compile = await fetchJson<{
      ok?: boolean;
      diagnostics?: Array<{ category: string }>;
    }>(
      startedServer.baseUrl,
      '/api/scripts/compile',
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Origin: origin,
          'x-rey30-csrf': csrfToken,
        },
        body: JSON.stringify({
          path: scriptRelativePath,
        }),
      },
      cookieJar
    );
    expect(compile.status).toBe(200);
    expect(compile.payload.ok).toBe(true);
    expect(
      compile.payload.diagnostics?.filter((item) => item.category === 'error') ?? []
    ).toHaveLength(0);

    const scriptDelete = await fetchJson<{ success?: boolean }>(
      startedServer.baseUrl,
      `/api/scripts?path=${encodeURIComponent(scriptRelativePath)}`,
      {
        method: 'DELETE',
        headers: {
          Accept: 'application/json',
          Origin: origin,
          'x-rey30-csrf': csrfToken,
        },
      },
      cookieJar
    );
    expect(scriptDelete.status).toBe(200);
    expect(scriptDelete.payload.success).toBe(true);

    const missingScript = await fetchJson<{ error?: string }>(
      startedServer.baseUrl,
      `/api/scripts?path=${encodeURIComponent(scriptRelativePath)}`,
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
      },
      cookieJar
    );
    expect(missingScript.status).toBe(404);
  }, 120_000);
});
