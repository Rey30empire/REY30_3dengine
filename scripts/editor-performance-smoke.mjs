import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PrismaClient, UserRole } from '@prisma/client';
import { loadWorkspaceEnv } from './env-utils.mjs';
import { chromium } from './playwright-runtime.mjs';
import { createSmokeAuthenticatedContext } from './smoke-auth-session.mjs';

loadWorkspaceEnv();

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  if (key.startsWith('--') && value) {
    args.set(key.slice(2), value);
    index += 1;
  }
}

const baseUrl = args.get('base-url') || 'http://localhost:3000';
const outputDir = args.get('output-dir') || 'output/editor-performance-smoke';
const skipSeedUser = ['1', 'true', 'yes', 'on'].includes(
  String(args.get('skip-seed-user') || '').trim().toLowerCase()
);
const email =
  args.get('smoke-email') ||
  process.env.SMOKE_USER_EMAIL ||
  'editor-performance-smoke@example.com';
const password =
  args.get('smoke-password') ||
  process.env.SMOKE_USER_PASSWORD ||
  'EditorPerformanceSmoke123!';
const prisma = skipSeedUser ? null : new PrismaClient();
const PERFORMANCE_SAMPLE_MIN = Math.max(
  6,
  Number.parseInt(
    String(
      args.get('performance-sample-min') ||
        process.env.REY30_PERFORMANCE_SAMPLE_MIN ||
        (String(process.env.REY30_PERFORMANCE_BUDGET_PROFILE || '').trim().toLowerCase() ===
        'local-single-user'
          ? '6'
          : '10')
    ),
    10
  ) || 10
);
const PERFORMANCE_BROWSER_ARGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--disable-frame-rate-limit',
  '--disable-gpu-vsync',
  '--disable-renderer-backgrounding',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
];
const MANUAL_RENDER_SAMPLE_COUNT = Math.max(
  PERFORMANCE_SAMPLE_MIN,
  Number.parseInt(String(args.get('manual-render-samples') || ''), 10) || PERFORMANCE_SAMPLE_MIN
);
const MANUAL_RENDER_SAMPLE_FRAMES = Math.max(
  5,
  Math.min(120, Number.parseInt(String(args.get('manual-render-frames') || ''), 10) || 30)
);
const SESSION_TTL_DAYS = 14;

fs.mkdirSync(outputDir, { recursive: true });

function hashPassword(rawPassword) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(rawPassword, salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
  });
  return `scrypt$16384$8$1$${salt}$${derived.toString('hex')}`;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function seedEditorUser() {
  if (!prisma) {
    return null;
  }
  const passwordHash = hashPassword(password);
  const user = await prisma.user.upsert({
    where: { email },
    update: {
      name: 'Editor Performance Smoke',
      role: UserRole.EDITOR,
      isActive: true,
      passwordHash,
      lastLoginAt: new Date(),
    },
    create: {
      email,
      name: 'Editor Performance Smoke',
      role: UserRole.EDITOR,
      isActive: true,
      passwordHash,
      lastLoginAt: new Date(),
    },
  });

  await prisma.authSession.deleteMany({ where: { userId: user.id } });
  return user;
}

async function createSeededSession(userId) {
  if (!prisma) {
    throw new Error('Cannot create a seeded local smoke session without Prisma.');
  }

  const sessionToken = crypto.randomBytes(32).toString('hex');
  const csrfToken = crypto.randomBytes(32).toString('hex');
  await prisma.authSession.create({
    data: {
      userId,
      tokenHash: hashToken(sessionToken),
      expiresAt: new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000),
    },
  });

  return {
    sessionToken,
    csrfToken,
  };
}

async function waitForBridge(page) {
  await page.waitForSelector('[data-testid="scene-view"]', { timeout: 30000 });
  await page.waitForFunction(() => typeof window.__REY30_VIEWPORT_TEST__ === 'object', null, {
    timeout: 30000,
  });
}

async function loginThroughUi(page) {
  const result = await page.evaluate(
    async ({ userEmail, userPassword }) => {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          email: userEmail,
          password: userPassword,
        }),
      });

      return {
        status: response.status,
        payload: await response.json().catch(() => ({})),
      };
    },
    {
      userEmail: email,
      userPassword: password,
    }
  );

  if (result.status !== 200 || result.payload?.success !== true) {
    throw new Error(`UI login bootstrap failed: ${JSON.stringify(result)}`);
  }

  await page.waitForFunction(async (expectedEmail) => {
    const response = await fetch('/api/auth/session', { cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    return payload?.authenticated === true && payload?.user?.email === expectedEmail;
  }, email, {
    timeout: 20000,
  });
}

function getPerformanceSampleCount(payload) {
  return Number(payload?.snapshot?.totals?.performanceSamples || 0);
}

function getPerformanceSnapshotSampleCount(snapshot) {
  return Number(snapshot?.totals?.performanceSamples || 0);
}

async function waitForPerformanceSnapshot(page, timeoutMs = 32000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (getPerformanceSnapshotSampleCount(latestTelemetryPostSnapshot) >= PERFORMANCE_SAMPLE_MIN) {
      return latestTelemetryPostSnapshot;
    }

    const payload = await page.evaluate(async () => {
      const response = await fetch('/api/telemetry', { cache: 'no-store' });
      return response.json().catch(() => ({}));
    });

    if (getPerformanceSampleCount(payload) >= PERFORMANCE_SAMPLE_MIN) {
      return payload.snapshot;
    }

    if (getPerformanceSnapshotSampleCount(latestTelemetryPostSnapshot) >= PERFORMANCE_SAMPLE_MIN) {
      return latestTelemetryPostSnapshot;
    }

    await page.waitForTimeout(750);
  }

  if (getPerformanceSnapshotSampleCount(latestTelemetryPostSnapshot) > 0) {
    return latestTelemetryPostSnapshot;
  }

  return null;
}

async function getSessionPayload(page) {
  return page.evaluate(async () => {
    const response = await fetch('/api/auth/session', { cache: 'no-store' });
    return response.json().catch(() => ({}));
  });
}

async function collectManualRenderSamples(page) {
  return page.evaluate(
    async ({ samples, frames }) => {
      const bridge = window.__REY30_VIEWPORT_TEST__;
      if (!bridge || typeof bridge.measureViewportRender !== 'function') {
        return {
          ok: false,
          reason: 'measureViewportRender bridge is not available.',
          requestedSamples: samples,
          frames,
          results: [],
          latestSnapshot: null,
        };
      }
      window.__REY30_DISABLE_VIEWPORT_TELEMETRY__ = true;

      const readCookie = (name) => {
        for (const segment of String(document.cookie || '').split(';')) {
          const [rawName, ...rawValue] = segment.split('=');
          if ((rawName || '').trim() !== name) continue;
          const value = rawValue.join('=').trim();
          return value ? decodeURIComponent(value) : '';
        }
        return '';
      };
      const csrfToken = readCookie('rey30_csrf');
      const headers = {
        'content-type': 'application/json',
      };
      if (/^[a-f0-9]{64}$/i.test(csrfToken)) {
        headers['x-rey30-csrf'] = csrfToken;
      }

      const results = [];
      let latestSnapshot = null;
      bridge.measureViewportRender({ frames: Math.min(frames, 10) });
      await new Promise((resolve) => setTimeout(resolve, 50));

      for (let index = 0; index < samples; index += 1) {
        const measurement = bridge.measureViewportRender({ frames });
        if (!measurement) {
          results.push({
            ok: false,
            status: null,
            reason: 'manual render measurement returned null.',
          });
          continue;
        }

        const response = await fetch('/api/telemetry', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            performance: {
              fps: measurement.fps,
              frameTimeMs: measurement.frameTimeMs,
              cpuTimeMs: measurement.cpuTimeMs,
              gpuTimeMs: measurement.gpuTimeMs,
              drawCalls: measurement.drawCalls,
              triangles: measurement.triangles,
              vertices: measurement.vertices,
              memoryUsedMb: measurement.memoryUsedMb,
              memoryAllocatedMb: measurement.memoryAllocatedMb,
              textures: measurement.textures,
              meshes: measurement.meshes,
              audioBuffers: measurement.audioBuffers,
              objectCount: bridge.getSceneEntityCount?.() ?? 0,
              selectionCount: bridge.getSelectedEntityIds?.().length ?? 0,
              runtimeState: 'IDLE',
              source: measurement.source,
            },
          }),
          cache: 'no-store',
        });
        const payload = await response.json().catch(() => ({}));
        latestSnapshot = payload?.snapshot ?? latestSnapshot;
        results.push({
          ok: response.ok,
          status: response.status,
          performanceSamples: payload?.snapshot?.totals?.performanceSamples ?? 0,
          measurement: {
            fps: measurement.fps,
            frameTimeMs: measurement.frameTimeMs,
            cpuTimeMs: measurement.cpuTimeMs,
            drawCalls: measurement.drawCalls,
            memoryUsedMb: measurement.memoryUsedMb,
          },
        });

        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      return {
        ok: results.length === samples && results.every((result) => result.ok === true),
        requestedSamples: samples,
        frames,
        results,
        latestSnapshot,
      };
    },
    {
      samples: MANUAL_RENDER_SAMPLE_COUNT,
      frames: MANUAL_RENDER_SAMPLE_FRAMES,
    }
  );
}

const browser = await chromium.launch({
  headless: true,
  args: PERFORMANCE_BROWSER_ARGS,
});

let context = null;
let page = null;
const consoleErrors = [];
const telemetryResponses = [];
const requestFailures = [];
let latestTelemetryPostSnapshot = null;
let manualRenderSampling = null;

try {
  const seededUser = skipSeedUser ? null : await seedEditorUser();
  context =
    seededUser && !skipSeedUser
      ? await createSmokeAuthenticatedContext(browser, {
          baseUrl,
          expectedEmail: email,
          viewport: { width: 1560, height: 980 },
          createSeededSession: () => createSeededSession(seededUser.id),
        })
      : await browser.newContext({ viewport: { width: 1560, height: 980 } });
  page = await context.newPage();

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  page.on('pageerror', (error) => {
    consoleErrors.push(String(error));
  });

  page.on('response', async (response) => {
    if (!response.url().includes('/api/telemetry')) return;
    const entry = {
      url: response.url(),
      method: response.request().method(),
      status: response.status(),
    };

    if (entry.method === 'POST' && entry.status === 200) {
      const payload = await response.json().catch(() => null);
      const snapshot = payload?.snapshot ?? null;
      entry.performanceSamples = getPerformanceSnapshotSampleCount(snapshot);
      if (snapshot?.budgets) {
        latestTelemetryPostSnapshot = snapshot;
      }
    }

    telemetryResponses.push(entry);
  });

  page.on('requestfailed', (request) => {
    requestFailures.push({
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      errorText: request.failure()?.errorText ?? null,
    });
  });

  // Local rehearsal uses a seeded cookie because production cookies are Secure on HTTP.
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await waitForBridge(page);
  if (skipSeedUser) {
    await loginThroughUi(page);
  }
  await page.bringToFront().catch(() => undefined);
  await page.waitForTimeout(3000);

  const sessionPayload = await getSessionPayload(page);
  manualRenderSampling = await collectManualRenderSamples(page);
  const manualRenderSnapshot =
    getPerformanceSnapshotSampleCount(manualRenderSampling?.latestSnapshot) >=
    PERFORMANCE_SAMPLE_MIN
      ? manualRenderSampling.latestSnapshot
      : null;
  if (manualRenderSnapshot?.budgets) {
    latestTelemetryPostSnapshot = manualRenderSnapshot;
  }
  const performanceSnapshot = manualRenderSnapshot || (await waitForPerformanceSnapshot(page));
  const performanceSampleCount = Number(
    performanceSnapshot?.totals?.performanceSamples || 0
  );

  const report = {
    ok:
      sessionPayload?.authenticated === true &&
      sessionPayload?.user?.email === email &&
      performanceSampleCount >= PERFORMANCE_SAMPLE_MIN &&
      consoleErrors.length === 0,
    baseUrl,
    email,
    skipSeedUser,
    performanceSampleMin: PERFORMANCE_SAMPLE_MIN,
    performanceBrowserArgs: PERFORMANCE_BROWSER_ARGS,
    manualRenderSampleCount: MANUAL_RENDER_SAMPLE_COUNT,
    manualRenderSampleFrames: MANUAL_RENDER_SAMPLE_FRAMES,
    performanceSampleCount,
    sessionPayload,
    performanceSnapshot,
    manualRenderSampling,
    telemetryResponses,
    requestFailures,
    consoleErrors,
  };

  fs.writeFileSync(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  if (!report.ok) {
    process.exitCode = 1;
  }
} finally {
  await context?.close().catch(() => undefined);
  await browser.close().catch(() => undefined);
  await prisma?.$disconnect().catch(() => undefined);
}
