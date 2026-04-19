import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PrismaClient, UserRole } from '@prisma/client';
import { loadWorkspaceEnv } from './env-utils.mjs';
import { chromium } from './playwright-runtime.mjs';
import { verifySmokeAuthenticatedSession } from './smoke-auth-session.mjs';

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
const outputDir = args.get('output-dir') || 'output/editor-project-library-smoke';
const projectName = 'Untitled Project';
const stamp = Date.now();
const materialName = `SmokeMaterial_${stamp}`;
const presetName = `SmokePreset_${stamp}`;
const materialId = `smoke_material_${stamp}`;
const email = 'library-smoke@example.com';
const password = 'LibrarySmoke123!';
const prisma = new PrismaClient();

fs.mkdirSync(outputDir, { recursive: true });

async function waitForBridge(page) {
  await page.waitForSelector('[data-testid="scene-view"]', { timeout: 10000 });
  await page.waitForFunction(() => typeof window.__REY30_VIEWPORT_TEST__ === 'object');
}

async function gotoWithRetries(page, url, attempts = 5) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      return;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await page.waitForTimeout(750);
      }
    }
  }
  throw lastError;
}

async function openPanel(page, label) {
  await page.getByRole('button', { name: label }).last().click();
  await page.waitForTimeout(500);
}

async function waitForServerPresetEntry(page, presetName) {
  const serverLibrarySection = page.getByTestId('modeler-server-library');
  await serverLibrarySection.waitFor({ state: 'visible', timeout: 10000 });

  const refreshButton = serverLibrarySection.getByTestId('modeler-server-library-refresh');
  if (await refreshButton.isVisible().catch(() => false)) {
    await refreshButton.click();
  }

  const presetEntry = serverLibrarySection
    .getByTestId('modeler-server-preset-entry')
    .filter({ hasText: presetName })
    .first();

  let lastState = '';
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const serverLibraryState = await page.evaluate((name) => {
      const section = document.querySelector('[data-testid="modeler-server-library"]');
      if (!(section instanceof HTMLElement)) {
        return {
          hasPreset: false,
          text: '',
        };
      }

      const entries = Array.from(
        section.querySelectorAll('[data-testid="modeler-server-preset-entry"]')
      );
      const hasPreset = entries.some((entry) => entry.textContent?.includes(name));

      return {
        hasPreset,
        text: section.textContent?.trim() || '',
      };
    }, presetName);

    if (serverLibraryState?.hasPreset && (await presetEntry.isVisible().catch(() => false))) {
      return presetEntry;
    }

    if (typeof serverLibraryState?.text === 'string' && serverLibraryState.text.trim().length > 0) {
      lastState = serverLibraryState.text.trim();
    }

    await page.waitForTimeout(250);
  }

  const fallbackText = ((await serverLibrarySection.textContent()) || '').trim();
  throw new Error(
    `Server library no cargó el preset ${presetName}. Estado: ${lastState || fallbackText}`
  );
}

function exactText(text) {
  return new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
}

async function findLastVisible(locator) {
  const count = await locator.count();
  for (let index = count - 1; index >= 0; index -= 1) {
    const candidate = locator.nth(index);
    if (await candidate.isVisible().catch(() => false)) {
      return candidate;
    }
  }
  return locator.last();
}

async function waitForAssetButton(page, label, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const buttons = page.locator('button').filter({ hasText: label });
    if ((await buttons.count()) >= 1) {
      return true;
    }
    await page.waitForTimeout(250);
  }
  return false;
}

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
      name: 'Library Smoke',
      role: UserRole.EDITOR,
      isActive: true,
      passwordHash,
      lastLoginAt: new Date(),
    },
    create: {
      email,
      name: 'Library Smoke',
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
  const { sessionToken, csrfToken } = await createSeededSession();
  const context = await browser.newContext({ viewport: { width: 1560, height: 980 } });
  const base = new URL(baseUrl);

  await verifySmokeAuthenticatedSession(context, {
    baseUrl,
    sessionToken,
    csrfToken,
    expectedEmail: email,
  });

  const authedHeaders = {
    origin: base.origin,
    'x-rey30-project': projectName,
    'x-rey30-csrf': csrfToken,
  };

  const materialResponse = await context.request.post(`${baseUrl}/api/materials`, {
    headers: {
      ...authedHeaders,
      'content-type': 'application/json',
    },
    data: {
      name: materialName,
      scope: 'project',
      material: {
        id: materialId,
        roughness: 0.22,
        metallic: 0.82,
        emissiveIntensity: 0,
      },
    },
  });
  if (!materialResponse.ok()) {
    throw new Error(`Material seed failed: ${materialResponse.status()} ${await materialResponse.text()}`);
  }

  const presetResponse = await context.request.post(`${baseUrl}/api/modifier-presets`, {
    headers: {
      ...authedHeaders,
      'content-type': 'application/json',
    },
    data: {
      name: presetName,
      scope: 'shared',
      description: 'Smoke preset for project library validation',
      modifiers: [
        { type: 'mirror_x', enabled: true },
        { type: 'solidify', enabled: true, thickness: 0.08 },
      ],
    },
  });
  if (!presetResponse.ok()) {
    throw new Error(`Modifier preset seed failed: ${presetResponse.status()} ${await presetResponse.text()}`);
  }

  return context;
}

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader'],
});

const context = await createAuthenticatedContext(browser);
const page = await context.newPage();
const consoleErrors = [];
const failingResponses = [];

page.on('console', (message) => {
  if (message.type() === 'error') {
    consoleErrors.push(message.text());
  }
});

page.on('response', (response) => {
  if (response.status() < 400) {
    return;
  }

  failingResponses.push({
    url: response.url(),
    status: response.status(),
    resourceType: response.request().resourceType(),
    method: response.request().method(),
  });
});

page.on('pageerror', (error) => {
  consoleErrors.push(String(error));
});

try {
  await gotoWithRetries(page, baseUrl);
  await page.waitForTimeout(1500);
  await waitForBridge(page);

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
    throw new Error('No se pudo crear la entidad base para smoke de biblioteca');
  }

  await openPanel(page, 'Materials');
  const materialLibraryRefreshButton = page.getByRole('button', { name: 'Refresh', exact: true }).last();
  if (await materialLibraryRefreshButton.isVisible().catch(() => false)) {
    await materialLibraryRefreshButton.click();
  }
  const materialTitle = await findLastVisible(page.getByText(exactText(materialName)));
  await materialTitle.waitFor({ state: 'attached', timeout: 10000 });
  const materialCard = materialTitle.locator('xpath=ancestor::div[contains(@class,"rounded-md")][1]');
  await materialCard.getByRole('button', { name: 'Apply' }).click();
  await page.waitForTimeout(400);
  const selectedMaterialId = await page.evaluate(
    () => window.__REY30_VIEWPORT_TEST__?.getSelectedEntityMaterialId() ?? null
  );

  await page.screenshot({
    path: path.join(outputDir, 'materials-library.png'),
    fullPage: true,
  });

  await openPanel(page, 'Model');
  const serverPresetEntry = await waitForServerPresetEntry(page, presetName);
  const serverPresetVisible = await serverPresetEntry.isVisible();
  await serverPresetEntry.getByTestId('modeler-server-preset-apply').click();
  await page.waitForTimeout(700);
  const modifierStackIndicatorCount = await page.getByText('Modifier stack: 2').count();

  await page.screenshot({
    path: path.join(outputDir, 'modeler-library.png'),
    fullPage: true,
  });

  await openPanel(page, 'Assets');
  await page.getByText('Folders', { exact: true }).waitFor({ timeout: 15000 });
  const clearFiltersButton = page.getByRole('button', { name: 'Limpiar filtros' });
  await clearFiltersButton.click();
  await page.waitForTimeout(250);
  const searchInput = page.getByPlaceholder(/Buscar nombre, tags, path\.\.\.|Search assets\.\.\./);

  await searchInput.fill(materialName);
  const assetMaterialListed = await waitForAssetButton(page, materialName);
  const materialBadgeVisible = (await page.getByText('Project Library').count()) >= 1;

  await searchInput.fill(presetName);
  const assetPresetListed = await waitForAssetButton(page, presetName);
  const presetBadgeVisible = (await page.getByText('Shared Library').count()) >= 1;

  await page.screenshot({
    path: path.join(outputDir, 'assets-library.png'),
    fullPage: true,
  });

  const report = {
    ok:
      selectedMaterialId === materialId &&
      serverPresetVisible &&
      modifierStackIndicatorCount >= 1 &&
    assetMaterialListed &&
      assetPresetListed &&
      consoleErrors.length === 0,
    email,
    projectName,
    materialName,
    materialId,
    selectedMaterialId,
    presetName,
    serverPresetVisible,
    modifierStackIndicatorCount,
    assetMaterialListed,
    materialBadgeVisible,
    assetPresetListed,
    presetBadgeVisible,
    failingResponses,
    consoleErrors,
  };

  fs.writeFileSync(
    path.join(outputDir, 'report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8'
  );

  if (!report.ok) {
    throw new Error(`Smoke project library falló: ${JSON.stringify(report, null, 2)}`);
  }

  console.log(JSON.stringify(report, null, 2));
} finally {
  await page.close().catch(() => {});
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
  await prisma.$disconnect().catch(() => {});
}
