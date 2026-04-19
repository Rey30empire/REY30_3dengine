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
const outputDir = args.get('output-dir') || 'output/editor-compositor-smoke';
const email = 'compositor-smoke@example.com';
const password = 'CompositorSmoke123!';
const projectName = 'Compositor Smoke Project';
const projectKey = 'compositor_smoke_project';
const smokeRunId = crypto.randomBytes(4).toString('hex');
const stillName = `SmokeStill_${smokeRunId}`;
const videoJobName = `SmokeVideoJob_${smokeRunId}`;
const prisma = new PrismaClient();

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

function generateCsrfToken() {
  return crypto.randomBytes(32).toString('hex');
}

function nextSessionExpiry() {
  return new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
}

async function createSeededSession() {
  const passwordHash = hashPassword(password);
  const user = await prisma.user.upsert({
    where: { email },
    update: {
      name: 'Compositor Smoke',
      role: UserRole.EDITOR,
      isActive: true,
      passwordHash,
      lastLoginAt: new Date(),
    },
    create: {
      email,
      name: 'Compositor Smoke',
      role: UserRole.EDITOR,
      isActive: true,
      passwordHash,
      lastLoginAt: new Date(),
    },
  });

  await prisma.authSession.deleteMany({ where: { userId: user.id } });

  const sessionToken = crypto.randomBytes(32).toString('hex');
  await prisma.authSession.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(sessionToken),
      expiresAt: nextSessionExpiry(),
    },
  });

  return {
    sessionToken,
    csrfToken: generateCsrfToken(),
  };
}

async function createAuthenticatedContext(browser) {
  return createSmokeAuthenticatedContext(browser, {
    baseUrl,
    createSeededSession,
    expectedEmail: email,
  });
}

async function waitForBridge(page) {
  await page.waitForSelector('[data-testid="scene-view"]', { timeout: 30000 });
  await page.waitForFunction(() => typeof window.__REY30_VIEWPORT_TEST__ === 'object', null, {
    timeout: 30000,
  });
}

async function waitForViewportSettled(page, delayMs = 250) {
  await page.getByTestId('scene-view').first().waitFor({ state: 'visible', timeout: 15000 });
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve(true));
        });
      })
  );
  await page.waitForTimeout(delayMs);
}

async function captureViewportScreenshot(page, screenshotPath) {
  await waitForViewportSettled(page);

  try {
    const dataUrl = await page.evaluate(
      () => window.__REY30_VIEWPORT_TEST__?.captureViewportDataUrl?.({ mimeType: 'image/png' }) ?? null
    );
    if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image/png;base64,')) {
      const base64Payload = dataUrl.slice('data:image/png;base64,'.length);
      fs.writeFileSync(screenshotPath, Buffer.from(base64Payload, 'base64'));
      return 'viewport-data-url';
    }
  } catch {
    // Fall back to Playwright capture if bridge export is unavailable.
  }

  await page.locator('[data-testid="scene-view"]').first().screenshot({
    path: screenshotPath,
    animations: 'disabled',
    caret: 'hide',
    timeout: 15000,
  });
  return 'scene-view-locator';
}

async function capturePanelScreenshot(page, screenshotPath) {
  await waitForViewportSettled(page);

  try {
    await page.screenshot({
      path: screenshotPath,
      animations: 'disabled',
      caret: 'hide',
      timeout: 20000,
    });
    return 'page-viewport';
  } catch {
    return captureViewportScreenshot(page, screenshotPath);
  }
}

async function selectWorkspace(page, label) {
  const workspaceButton = page.getByRole('button', { name: label }).first();
  await workspaceButton.waitFor({ state: 'visible', timeout: 15000 });
  await workspaceButton.click();
  await page.waitForTimeout(350);
}

async function clickButtonByText(page, label, settleMs = 250) {
  await page.waitForFunction(
    (expectedLabel) =>
      Array.from(document.querySelectorAll('button')).some((button) => {
        if (!(button instanceof HTMLButtonElement)) {
          return false;
        }
        return (
          !button.disabled &&
          button.offsetParent !== null &&
          button.textContent?.trim().includes(expectedLabel)
        );
      }),
    label,
    { timeout: 20000 }
  );

  const clicked = await page.evaluate((expectedLabel) => {
    const candidate = Array.from(document.querySelectorAll('button')).find((button) => {
      if (!(button instanceof HTMLButtonElement)) {
        return false;
      }
      return (
        !button.disabled &&
        button.offsetParent !== null &&
        button.textContent?.trim().includes(expectedLabel)
      );
    });

    if (!(candidate instanceof HTMLButtonElement)) {
      return false;
    }

    candidate.click();
    return true;
  }, label);

  if (!clicked) {
    throw new Error(`No se pudo activar el boton ${label}`);
  }

  await page.waitForTimeout(settleMs);
}

async function openPanel(page, { workspaceLabel, panelLabel, contentLabel, readyLabel, recover }) {
  if (workspaceLabel) {
    await selectWorkspace(page, workspaceLabel);
  }

  const panelButtons = page.getByRole('button', { name: panelLabel, exact: true });
  const panelButtonCount = await panelButtons.count();
  const panelButton = panelButtons.first();
  await panelButton.waitFor({ state: 'visible', timeout: 15000 });

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await panelButton.click();

    try {
      const readyTarget = readyLabel
        ? page.getByLabel(readyLabel)
        : page.getByText(contentLabel);
      await readyTarget.waitFor({ timeout: 5000 });
      return;
    } catch {
      if (recover) {
        await recover(page, attempt);
      }
      if (workspaceLabel) {
        await selectWorkspace(page, workspaceLabel);
      }
      await page.waitForTimeout(400);
    }
  }

  throw new Error(
    `No se pudo abrir el panel ${panelLabel} con el contenido ${contentLabel}`
  );
}

async function getEnvironment(page) {
  return page.evaluate(() => window.__REY30_VIEWPORT_TEST__?.getActiveSceneEnvironment?.() ?? null);
}

async function listAssets(page) {
  return page.evaluate(async () => {
    const response = await fetch('/api/assets', { cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    return payload?.assets ?? [];
  });
}

async function readAssetFile(page, assetPath) {
  return page.evaluate(async (targetPath) => {
    const response = await fetch(`/api/assets/file?path=${encodeURIComponent(targetPath)}`, {
      cache: 'no-store',
    });
    return response.text();
  }, assetPath);
}

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader'],
});

const context = await createAuthenticatedContext(browser);
const page = await context.newPage();
const consoleErrors = [];

page.on('console', (message) => {
  if (message.type() === 'error') {
    consoleErrors.push(message.text());
  }
});

page.on('pageerror', (error) => {
  consoleErrors.push(String(error));
});

try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await waitForBridge(page);

  const sceneInfo = await page.evaluate(() => {
    const api = window.__REY30_VIEWPORT_TEST__;
    const existing = api?.getActiveScene?.() ?? null;
    if (existing?.id) {
      api?.setActiveScene?.(existing.id);
      return existing;
    }

    const created = api?.createScene?.('Escena Principal') ?? null;
    if (created?.id) {
      api?.setActiveScene?.(created.id);
    }
    return created;
  });

  if (!sceneInfo?.id) {
    throw new Error('No se pudo crear o activar una escena para el smoke de compositor');
  }
  await page.waitForFunction(
    (sceneId) => window.__REY30_VIEWPORT_TEST__?.getActiveScene?.()?.id === sceneId,
    sceneInfo.id,
    { timeout: 15000 }
  );
  await page.waitForTimeout(800);

  const entityId = await page.evaluate(() => {
    const api = window.__REY30_VIEWPORT_TEST__;
    const id = api?.createEntity('cube') ?? null;
    if (id) {
      api?.setSelectMode();
      api?.selectEntity(id, false);
    }
    return id;
  });

  if (!entityId) {
    throw new Error('No se pudo crear entidad para smoke de compositor');
  }

  await page.evaluate((nextProjectName) => {
    const api = window.__REY30_VIEWPORT_TEST__;
    api?.setProjectName?.(nextProjectName);
  }, projectName);

  await openPanel(page, {
    workspaceLabel: 'Scene',
    panelLabel: 'Compositor',
    contentLabel: 'Compositor & Video',
    readyLabel: 'Compositor status',
    recover: async (panelPage) => {
      await panelPage.evaluate(() => {
        const api = window.__REY30_VIEWPORT_TEST__;
        const existing = api?.getActiveScene?.() ?? null;
        if (existing?.id) {
          api?.setActiveScene?.(existing.id);
          return existing;
        }
        const created = api?.createScene?.('Escena Principal') ?? null;
        if (created?.id) {
          api?.setActiveScene?.(created.id);
        }
        return created;
      });
      await panelPage.waitForTimeout(800);
    },
  });
  await page.evaluate((nextProjectName) => {
    const api = window.__REY30_VIEWPORT_TEST__;
    api?.setProjectName?.(nextProjectName);
  }, projectName);
  await page.waitForFunction(
    (nextProjectName) => window.__REY30_VIEWPORT_TEST__?.getProjectName?.() === nextProjectName,
    projectName,
    { timeout: 15000 }
  );
  await page.getByText(new RegExp(`Proyecto:\\s*${projectName}`)).waitFor({ timeout: 15000 });
  await clickButtonByText(page, 'World', 400);
  await clickButtonByText(page, 'Compositor', 300);
  await page.getByLabel('Compositor status').waitFor({ timeout: 15000 });

  await clickButtonByText(page, 'Trailer Punch', 500);
  const environment = await getEnvironment(page);

  await page.getByRole('textbox', { name: 'Still name' }).fill(stillName);
  await clickButtonByText(page, 'Save still to Assets', 400);
  await page.getByLabel('Compositor status').getByText(/Still guardado en Assets/).waitFor({
    timeout: 20000,
  });

  await page.getByRole('textbox', { name: 'Video job name' }).fill(videoJobName);
  await clickButtonByText(page, 'Queue video job', 400);
  await page.getByLabel('Compositor status').getByText(/Job de video persistido/).waitFor({
    timeout: 20000,
  });

  const assets = await listAssets(page);
  const stillAsset = assets.find(
    (asset) => asset?.metadata?.compositorStill === true && asset?.name === stillName
  );
  const jobAsset = assets.find(
    (asset) => asset?.metadata?.compositorVideoJob === true && asset?.name === videoJobName
  );

  const jobJson = jobAsset?.path ? await readAssetFile(page, jobAsset.path) : '';
  const resolvedProjectKey =
    (typeof stillAsset?.metadata?.projectKey === 'string' && stillAsset.metadata.projectKey) ||
    (typeof jobAsset?.metadata?.projectKey === 'string' && jobAsset.metadata.projectKey) ||
    null;

  const panelCaptureMode = await capturePanelScreenshot(
    page,
    path.join(outputDir, 'compositor-panel.png')
  );
  const viewportCaptureMode = await captureViewportScreenshot(
    page,
    path.join(outputDir, 'viewport-compositor.png')
  );

  const report = {
    ok:
      environment?.postProcessing?.bloom?.enabled === true &&
      environment?.postProcessing?.vignette?.enabled === true &&
      typeof resolvedProjectKey === 'string' &&
      resolvedProjectKey.length > 0 &&
      typeof stillAsset?.path === 'string' &&
      stillAsset.path.includes(`/texture/compositor/${resolvedProjectKey}/`) &&
      typeof jobAsset?.path === 'string' &&
      jobAsset.path.includes(`/video/jobs/${resolvedProjectKey}/`) &&
      jobJson.includes('"sceneName":') &&
      jobJson.includes('"posterFrameAssetPath":') &&
      jobJson.includes(stillName) &&
      consoleErrors.length === 0,
    projectName,
    projectKey,
    resolvedProjectKey,
    smokeRunId,
    stillName,
    videoJobName,
    environment,
    stillAssetPath: stillAsset?.path ?? null,
    jobAssetPath: jobAsset?.path ?? null,
    jobJsonPreview: jobJson.slice(0, 260),
    captureModes: {
      panel: panelCaptureMode,
      viewport: viewportCaptureMode,
    },
    consoleErrors,
  };

  fs.writeFileSync(
    path.join(outputDir, 'report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8'
  );

  if (!report.ok) {
    throw new Error(`Smoke de compositor fallo: ${JSON.stringify(report, null, 2)}`);
  }

  console.log(JSON.stringify(report, null, 2));
} finally {
  await page.close().catch(() => {});
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
  await prisma.$disconnect().catch(() => {});
}
