import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import path from 'node:path';
import { rm } from 'node:fs/promises';
import { PrismaClient, UserRole } from '@prisma/client';
import { createEditorProjectSaveData, type EditorProjectSaveState } from '@/engine/serialization';
import { hashPassword } from '@/lib/security/password';
import { createDefaultAutomationPermissions, createDefaultEditorState } from '@/store/editorStore.utils';
import { resolveProductionEnv } from '../../scripts/production-env.mjs';
import {
  PRODUCTION_E2E_OUTPUT_SCRIPTS_ROOT,
  startProductionLocalServer,
  type StartedServer,
} from './helpers/productionLocalServer';

type CookieJar = Map<string, string>;

type JsonResponse<T = unknown> = {
  status: number;
  payload: T;
};

const E2E_PASSWORD = 'E2EPass123!';
const OUTPUT_SCRIPTS_ROOT = PRODUCTION_E2E_OUTPUT_SCRIPTS_ROOT;

function createE2EProjectSave(projectName: string) {
  const state: EditorProjectSaveState = {
    projectName,
    projectPath: `C:/Projects/${projectName.replace(/\s+/g, '')}`,
    isDirty: true,
    scenes: [
      {
        id: 'scene-1',
        name: 'Main Scene',
        entities: [],
        rootEntities: [],
        collections: [],
        environment: {
          skybox: 'studio',
          ambientLight: { r: 0.5, g: 0.5, b: 0.5, a: 1 },
          ambientIntensity: 1,
          environmentIntensity: 1,
          environmentRotation: 0,
          directionalLightIntensity: 1.2,
          directionalLightAzimuth: 45,
          directionalLightElevation: 55,
          advancedLighting: {
            shadowQuality: 'high',
            globalIllumination: { enabled: false, intensity: 1, bounceCount: 1 },
            bakedLightmaps: { enabled: false },
          },
          fog: null,
          postProcessing: {
            bloom: { enabled: false, intensity: 0.5, threshold: 0.8, radius: 0.5 },
            ssao: { enabled: false, radius: 0.5, intensity: 1, bias: 0.025 },
            ssr: { enabled: false, intensity: 0.5, maxDistance: 100 },
            colorGrading: {
              enabled: false,
              exposure: 1,
              contrast: 1,
              saturation: 1,
              gamma: 2.2,
              toneMapping: 'aces',
              rendererExposure: 1,
            },
            vignette: { enabled: false, intensity: 0.5, smoothness: 0.5, roundness: 1 },
          },
        },
        createdAt: new Date('2026-04-02T00:00:00.000Z'),
        updatedAt: new Date('2026-04-02T00:00:00.000Z'),
      },
    ],
    activeSceneId: 'scene-1',
    entities: new Map(),
    assets: [],
    engineMode: 'MODE_AI_FIRST',
    aiMode: 'LOCAL',
    aiEnabled: true,
    editor: createDefaultEditorState(),
    automationPermissions: createDefaultAutomationPermissions(),
    profiler: {
      fps: 60,
      frameTime: 16.67,
      cpuTime: 2,
      gpuTime: 3,
      memory: {
        used: 32,
        allocated: 64,
        textures: 1,
        meshes: 1,
        audio: 0,
      },
      drawCalls: 1,
      triangles: 12,
      vertices: 24,
    },
    scribProfiles: new Map(),
    activeScribEntityId: null,
    scribInstances: new Map(),
  };

  return createEditorProjectSaveData(state, { markClean: true });
}

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
      editorAccess?: {
        shellMode?: string;
        permissions?: {
          admin?: boolean;
          advancedShell?: boolean;
          terminalActions?: boolean;
        };
      };
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
    expect(session.payload.editorAccess?.shellMode).toBe('product');
    expect(session.payload.editorAccess?.permissions?.advancedShell).toBe(false);
    expect(session.payload.editorAccess?.permissions?.admin).toBe(false);
    expect(session.payload.editorAccess?.permissions?.terminalActions).toBe(false);
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
      editorAccess?: {
        shellMode?: string;
        permissions?: {
          admin?: boolean;
          advancedShell?: boolean;
          terminalActions?: boolean;
        };
      };
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
    expect(session.payload.editorAccess?.shellMode).toBe('advanced');
    expect(session.payload.editorAccess?.permissions?.advancedShell).toBe(true);
    expect(session.payload.editorAccess?.permissions?.admin).toBe(true);
    expect(session.payload.editorAccess?.permissions?.terminalActions).toBe(false);

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

    const remoteProjectSave = await fetchJson<{
      success?: boolean;
      projectKey?: string;
      summary?: {
        projectName?: string;
        sceneCount?: number;
      };
    }>(
      startedServer.baseUrl,
      '/api/editor-project',
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Origin: origin,
          'x-rey30-csrf': csrfToken,
          'x-rey30-project': 'Bridge Project',
        },
        body: JSON.stringify({
          slot: 'e2e-slot',
          saveData: createE2EProjectSave('Bridge Project'),
        }),
      },
      cookieJar
    );
    expect(remoteProjectSave.status).toBe(200);
    expect(remoteProjectSave.payload.success).toBe(true);
    expect(remoteProjectSave.payload.projectKey).toBe('bridge_project');
    expect(remoteProjectSave.payload.summary?.projectName).toBe('Bridge Project');

    const remoteProjectLoad = await fetchJson<{
      active?: boolean;
      projectKey?: string;
      summary?: {
        projectName?: string;
      } | null;
      saveData?: {
        custom?: {
          kind?: string;
        };
      };
    }>(
      startedServer.baseUrl,
      '/api/editor-project?slot=e2e-slot&projectKey=bridge_project&includeSave=1',
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
      },
      cookieJar
    );
    expect(remoteProjectLoad.status).toBe(200);
    expect(remoteProjectLoad.payload.active).toBe(true);
    expect(remoteProjectLoad.payload.projectKey).toBe('bridge_project');
    expect(remoteProjectLoad.payload.summary?.projectName).toBe('Bridge Project');
    expect(remoteProjectLoad.payload.saveData?.custom?.kind).toBe('editor_project');

    const buildResponse = await fetchJson<{
      ok?: boolean;
      target?: string;
      source?: string;
      projectKey?: string;
      artifacts?: Array<{ kind?: string; path: string }>;
    }>(
      startedServer.baseUrl,
      '/api/build',
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Origin: origin,
          'x-rey30-csrf': csrfToken,
          'x-rey30-project': 'Bridge Project',
        },
        body: JSON.stringify({
          target: 'web',
          slot: 'e2e-slot',
        }),
      },
      cookieJar
    );
    expect(buildResponse.status).toBe(200);
    expect(buildResponse.payload.ok).toBe(true);
    expect(buildResponse.payload.target).toBe('web');
    expect(buildResponse.payload.source).toBe('remote_editor_project');
    expect(buildResponse.payload.projectKey).toBe('bridge_project');
    expect(
      buildResponse.payload.artifacts?.some((artifact) => artifact.path.endsWith('package-manifest.json'))
    ).toBe(true);

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
