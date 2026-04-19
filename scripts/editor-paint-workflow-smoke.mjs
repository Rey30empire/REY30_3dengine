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
const outputDir = args.get('output-dir') || 'output/editor-paint-workflow-smoke';
const projectName = 'Untitled Project';
const email = 'paint-smoke@example.com';
const password = 'PaintSmoke123!';
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
      name: 'Paint Smoke',
      role: UserRole.EDITOR,
      isActive: true,
      passwordHash,
      lastLoginAt: new Date(),
    },
    create: {
      email,
      name: 'Paint Smoke',
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

async function openPanel(page, label) {
  await page.getByRole('button', { name: label }).last().click();
  await page.waitForTimeout(500);
}

async function selectWorkspace(page, label) {
  await page.getByRole('button', { name: label, exact: true }).click();
  await page.waitForTimeout(500);
}

async function dragInViewport(page, from, to) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
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
    throw new Error('No se pudo crear entidad para smoke de paint');
  }

  await selectWorkspace(page, 'Modeling');
  await openPanel(page, 'Paint');

  await page.evaluate(() => {
    window.__REY30_VIEWPORT_TEST__?.setPaintMode({
      mode: 'texture',
      textureSlot: 'albedo',
      textureResolution: 512,
      size: 0.8,
      strength: 1,
      color: '#ff8844',
    });
  });
  await page.waitForTimeout(400);

  const centerPoint = await page.evaluate(
    (id) => window.__REY30_VIEWPORT_TEST__?.getEntityScreenPoint(id) ?? null,
    entityId
  );
  if (!centerPoint) {
    throw new Error('No se pudo resolver punto de pantalla del mesh para texture paint');
  }

  const strokeApplied = await page.evaluate(
    (point) =>
      window.__REY30_VIEWPORT_TEST__?.paintStroke([
        { x: point.x - 18, y: point.y - 10 },
        { x: point.x - 8, y: point.y - 4 },
        { x: point.x, y: point.y },
        { x: point.x + 8, y: point.y + 4 },
        { x: point.x + 18, y: point.y + 10 },
      ]) ?? false,
    centerPoint
  );
  if (!strokeApplied) {
    throw new Error('No se pudo aplicar stroke de texture paint desde el bridge');
  }
  await page.waitForFunction(
    (id) => {
      const info = window.__REY30_VIEWPORT_TEST__?.getEntityTexturePaintInfo(id, 'albedo');
      return Boolean(info?.hasTexture && info?.isDataUrl);
    },
    entityId,
    { timeout: 15000 }
  );
  await page.waitForTimeout(300);

  const textureBeforeSave = await page.evaluate(
    (id) => window.__REY30_VIEWPORT_TEST__?.getEntityTexturePaintInfo(id, 'albedo') ?? null,
    entityId
  );

  await page.getByRole('button', { name: 'Guardar a Assets' }).click();
  await page.waitForFunction(
    (id) => {
      const info = window.__REY30_VIEWPORT_TEST__?.getEntityTexturePaintInfo(id, 'albedo');
      return Boolean(info?.hasTexture && info?.enabled && !info?.isDataUrl);
    },
    entityId,
    { timeout: 10000 }
  );
  await page.waitForTimeout(400);

  const textureAfterSave = await page.evaluate(
    (id) => window.__REY30_VIEWPORT_TEST__?.getEntityTexturePaintInfo(id, 'albedo') ?? null,
    entityId
  );

  await page.evaluate(() => {
    window.__REY30_VIEWPORT_TEST__?.setPaintMode({
      mode: 'weight',
      weightBone: 'Arm_L',
      weightMirror: false,
      weightSmooth: false,
      weightNormalize: true,
    });
  });
  await page.waitForTimeout(400);

  await page.getByRole('button', { name: 'Fill activo' }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Mirror activo' }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Normalize all' }).click();
  await page.waitForTimeout(300);

  const leftWeight = await page.evaluate(
    (id) => window.__REY30_VIEWPORT_TEST__?.getEntityWeightInfo(id, 'Arm_L') ?? null,
    entityId
  );
  const rightWeight = await page.evaluate(
    (id) => window.__REY30_VIEWPORT_TEST__?.getEntityWeightInfo(id, 'Arm_R') ?? null,
    entityId
  );

  await page.screenshot({
    path: path.join(outputDir, 'paint-panel.png'),
    fullPage: true,
  });
  await page.locator('[data-testid="scene-view"]').screenshot({
    path: path.join(outputDir, 'viewport-paint.png'),
  });

  const report = {
    ok:
      Boolean(textureBeforeSave?.hasTexture) &&
      textureBeforeSave?.isDataUrl === true &&
      Boolean(textureAfterSave?.hasTexture) &&
      textureAfterSave?.enabled === true &&
      textureAfterSave?.isDataUrl === false &&
      String(textureAfterSave?.assetPath || '').includes('/texture/paint/') &&
      (leftWeight?.nonZeroVertices ?? 0) > 0 &&
      (rightWeight?.nonZeroVertices ?? 0) > 0 &&
      consoleErrors.length === 0,
    textureBeforeSave,
    textureAfterSave,
    leftWeight,
    rightWeight,
    consoleErrors,
  };

  fs.writeFileSync(
    path.join(outputDir, 'report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8'
  );

  if (!report.ok) {
    throw new Error(`Smoke de texture/weight paint falló: ${JSON.stringify(report, null, 2)}`);
  }

  console.log(JSON.stringify(report, null, 2));
} finally {
  await page.close().catch(() => {});
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
  await prisma.$disconnect().catch(() => {});
}
