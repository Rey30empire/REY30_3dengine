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
const outputDir = args.get('output-dir') || 'output/editor-simulation-smoke';
const email = 'simulation-smoke@example.com';
const password = 'SimulationSmoke123!';
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
      name: 'Simulation Smoke',
      role: UserRole.EDITOR,
      isActive: true,
      passwordHash,
      lastLoginAt: new Date(),
    },
    create: {
      email,
      name: 'Simulation Smoke',
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

async function getSimulationInfo(page, entityId) {
  return page.evaluate(
    (id) => window.__REY30_VIEWPORT_TEST__?.getEntitySimulationInfo(id) ?? null,
    entityId
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
      api?.setViewportDisplayOptions({ showColliders: true });
    }
    return id;
  });

  if (!entityId) {
    throw new Error('No se pudo crear entidad para smoke de simulacion');
  }

  await openPanel(page, 'Inspector');
  await page.getByRole('button', { name: 'Add Collider' }).click();
  await page.getByRole('button', { name: 'Add Rigidbody' }).click();
  await page.getByRole('button', { name: 'Add ParticleSystem' }).click();

  await page.waitForFunction(
    ({ id }) => {
      const info = window.__REY30_VIEWPORT_TEST__?.getEntitySimulationInfo(id);
      return Boolean(
        info &&
          info.hasCollider &&
          info.hasRigidbody &&
          info.hasParticleSystem &&
          info.hasParticleHelper &&
          info.hasColliderHelper
      );
    },
    { id: entityId },
    { timeout: 15000 }
  );

  const simulationInfo = await getSimulationInfo(page, entityId);

  await page.screenshot({
    path: path.join(outputDir, 'simulation-inspector.png'),
    fullPage: true,
  });
  await page.locator('[data-testid="scene-view"]').screenshot({
    path: path.join(outputDir, 'viewport-simulation.png'),
  });

  const report = {
    ok:
      simulationInfo?.hasCollider === true &&
      simulationInfo?.colliderType === 'box' &&
      simulationInfo?.hasColliderHelper === true &&
      simulationInfo?.hasRigidbody === true &&
      simulationInfo?.mass === 1 &&
      simulationInfo?.useGravity === true &&
      simulationInfo?.isKinematic === false &&
      simulationInfo?.hasParticleSystem === true &&
      simulationInfo?.particleRate === 24 &&
      simulationInfo?.particleMaxParticles === 800 &&
      simulationInfo?.particleLooping === true &&
      simulationInfo?.hasParticleHelper === true &&
      consoleErrors.length === 0,
    simulationInfo,
    consoleErrors,
  };

  fs.writeFileSync(
    path.join(outputDir, 'report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8'
  );

  if (!report.ok) {
    throw new Error(`Smoke de simulacion fallo: ${JSON.stringify(report, null, 2)}`);
  }

  console.log(JSON.stringify(report, null, 2));
} finally {
  await page.close().catch(() => {});
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
  await prisma.$disconnect().catch(() => {});
}
