import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PrismaClient, UserRole } from '@prisma/client';
import { loadWorkspaceEnv } from './env-utils.mjs';
import { chromium } from './playwright-runtime.mjs';

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
const outputDir = args.get('output-dir') || 'output/editor-geometry-nodes-smoke';
const email = 'geometry-nodes-smoke@example.com';
const password = 'GeometryNodesSmoke123!';
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
      name: 'Geometry Nodes Smoke',
      role: UserRole.EDITOR,
      isActive: true,
      passwordHash,
      lastLoginAt: new Date(),
    },
    create: {
      email,
      name: 'Geometry Nodes Smoke',
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
  const context = await browser.newContext({ viewport: { width: 1560, height: 980 } });
  const { sessionToken, csrfToken } = await createSeededSession();
  const base = new URL(baseUrl);

  await context.addCookies([
    {
      name: 'rey30_session',
      value: sessionToken,
      url: base.origin,
      httpOnly: true,
      sameSite: 'Lax',
      secure: base.protocol === 'https:',
    },
    {
      name: 'rey30_csrf',
      value: csrfToken,
      url: base.origin,
      httpOnly: false,
      sameSite: 'Lax',
      secure: base.protocol === 'https:',
    },
  ]);

  const sessionResponse = await context.request.get(`${baseUrl}/api/auth/session`);
  if (!sessionResponse.ok()) {
    throw new Error(`Session bootstrap failed: ${sessionResponse.status()}`);
  }
  const payload = await sessionResponse.json().catch(() => ({}));
  if (!payload?.authenticated) {
    throw new Error(`Session bootstrap did not authenticate smoke user: ${JSON.stringify(payload)}`);
  }

  return context;
}

async function waitForBridge(page) {
  await page.waitForSelector('[data-testid="scene-view"]', { timeout: 30000 });
  await page.waitForFunction(() => typeof window.__REY30_VIEWPORT_TEST__ === 'object', null, {
    timeout: 30000,
  });
}

async function openPanel(page, label) {
  await page.getByRole('button', { name: label }).last().click();
  await page.waitForTimeout(500);
}

async function getModifierInfo(page, entityId) {
  return page.evaluate(
    (id) => window.__REY30_VIEWPORT_TEST__?.getEntityModifierInfo(id) ?? null,
    entityId
  );
}

async function waitForModifierCount(page, entityId, count) {
  await page.waitForFunction(
    ({ id, expectedCount }) => {
      const info = window.__REY30_VIEWPORT_TEST__?.getEntityModifierInfo(id);
      return Boolean(info && info.modifierCount === expectedCount);
    },
    { id: entityId, expectedCount: count },
    { timeout: 15000 }
  );
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
    throw new Error('No se pudo crear entidad para smoke de geometry nodes');
  }

  await openPanel(page, 'Model');
  await page.locator('text=Geometry Nodes Lite').first().waitFor({ timeout: 15000 });

  await page.getByRole('button', { name: 'Use geometry recipe Panel Run' }).click();
  await waitForModifierCount(page, entityId, 2);
  const afterUse = await getModifierInfo(page, entityId);

  await page.getByRole('button', { name: 'Export geometry graph JSON' }).click();
  const graphInput = page.getByRole('textbox', { name: 'Geometry Nodes JSON' });
  const exportedGraph = await graphInput.inputValue();

  await page.getByRole('button', { name: 'Clear geometry graph JSON' }).click();
  await graphInput.fill(exportedGraph);
  await page.getByRole('button', { name: 'Import append geometry graph' }).click();
  await waitForModifierCount(page, entityId, 4);
  const afterAppend = await getModifierInfo(page, entityId);

  await page.screenshot({
    path: path.join(outputDir, 'geometry-nodes-panel.png'),
    fullPage: true,
  });
  await page.locator('[data-testid="scene-view"]').screenshot({
    path: path.join(outputDir, 'viewport-geometry-nodes.png'),
  });

  const report = {
    ok:
      afterUse?.modifierCount === 2 &&
      afterUse?.modifierTypes?.join(',') === 'solidify,array' &&
      exportedGraph.includes('"version": 1') &&
      exportedGraph.includes('"nodes"') &&
      afterAppend?.modifierCount === 4 &&
      afterAppend?.modifierTypes?.join(',') === 'solidify,array,solidify,array' &&
      consoleErrors.length === 0,
    afterUse,
    exportedGraphLength: exportedGraph.length,
    exportedGraphPreview: exportedGraph.slice(0, 220),
    afterAppend,
    consoleErrors,
  };

  fs.writeFileSync(
    path.join(outputDir, 'report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8'
  );

  if (!report.ok) {
    throw new Error(`Smoke de geometry nodes fallo: ${JSON.stringify(report, null, 2)}`);
  }

  console.log(JSON.stringify(report, null, 2));
} finally {
  await page.close().catch(() => {});
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
  await prisma.$disconnect().catch(() => {});
}
