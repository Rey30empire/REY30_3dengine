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
const outputDir = args.get('output-dir') || 'output/editor-animation-smoke';
const email = 'animation-smoke@example.com';
const password = 'AnimationSmoke123!';
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
      name: 'Animation Smoke',
      role: UserRole.EDITOR,
      isActive: true,
      passwordHash,
      lastLoginAt: new Date(),
    },
    create: {
      email,
      name: 'Animation Smoke',
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

async function waitForAnimatorMatch(page, entityId, matcher, timeout = 15000) {
  await page.waitForFunction(
    ({ id, expected }) => {
      const info = window.__REY30_VIEWPORT_TEST__?.getEntityAnimatorInfo(id);
      if (!info) return false;
      if (typeof expected.hasAnimator === 'boolean' && info.hasAnimator !== expected.hasAnimator) {
        return false;
      }
      if (typeof expected.boneCount === 'number' && info.boneCount !== expected.boneCount) {
        return false;
      }
      if (typeof expected.ikCount === 'number' && info.ikCount !== expected.ikCount) {
        return false;
      }
      if (typeof expected.constraintCount === 'number' && info.constraintCount !== expected.constraintCount) {
        return false;
      }
      if (typeof expected.clipCount === 'number' && info.clipCount !== expected.clipCount) {
        return false;
      }
      if (typeof expected.nlaCount === 'number' && info.nlaCount !== expected.nlaCount) {
        return false;
      }
      if (typeof expected.poseMode === 'boolean' && info.poseMode !== expected.poseMode) {
        return false;
      }
      if (typeof expected.activeClipName === 'string' && info.activeClipName !== expected.activeClipName) {
        return false;
      }
      if (typeof expected.currentAnimation === 'string' && info.currentAnimation !== expected.currentAnimation) {
        return false;
      }
      if (
        typeof expected.nlaNameIncludes === 'string' &&
        !info.nlaNames.some((name) => name.includes(expected.nlaNameIncludes))
      ) {
        return false;
      }
      return true;
    },
    { id: entityId, expected: matcher },
    { timeout }
  );
}

async function getAnimatorInfo(page, entityId) {
  return page.evaluate(
    (id) => window.__REY30_VIEWPORT_TEST__?.getEntityAnimatorInfo(id) ?? null,
    entityId
  );
}

async function getWeightInfo(page, entityId, boneName) {
  return page.evaluate(
    ({ id, bone }) => window.__REY30_VIEWPORT_TEST__?.getEntityWeightInfo(id, bone) ?? null,
    { id: entityId, bone: boneName }
  );
}

async function nudgeSmileShapeKey(page) {
  const smileCard = page.locator('xpath=//span[normalize-space()="Smile"]/ancestor::div[contains(@class,"rounded")][1]');
  const smileSlider = smileCard.getByRole('slider');
  await smileSlider.focus();
  for (let index = 0; index < 12; index += 1) {
    await smileSlider.press('ArrowRight');
  }
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
    throw new Error('No se pudo crear entidad para smoke de animacion');
  }

  await openPanel(page, 'Animation');
  await page.getByRole('button', { name: 'Montar Animator' }).click();

  await waitForAnimatorMatch(page, entityId, { hasAnimator: true });
  const mountedInfo = await getAnimatorInfo(page, entityId);

  await page.getByRole('button', { name: 'Add bone' }).click();
  await waitForAnimatorMatch(
    page,
    entityId,
    { hasAnimator: true, boneCount: mountedInfo.boneCount + 1 }
  );

  await page.getByRole('button', { name: 'Add IK' }).click();
  await waitForAnimatorMatch(
    page,
    entityId,
    { ikCount: mountedInfo.ikCount + 1 }
  );

  await page.getByRole('button', { name: 'Add constraint' }).click();
  await waitForAnimatorMatch(
    page,
    entityId,
    { constraintCount: mountedInfo.constraintCount + 1 }
  );
  const afterRigOps = await getAnimatorInfo(page, entityId);

  await page.getByRole('button', { name: 'Auto weights' }).click();
  await page.waitForFunction(
    ({ id }) => {
      const weight = window.__REY30_VIEWPORT_TEST__?.getEntityWeightInfo(id, 'Arm_L');
      const info = window.__REY30_VIEWPORT_TEST__?.getEntityAnimatorInfo(id);
      return Boolean(
        weight &&
          info &&
          weight.nonZeroVertices > 0 &&
          info.weightGroupCount >= info.boneCount
      );
    },
    { id: entityId },
    { timeout: 15000 }
  );
  const armLeftWeight = await getWeightInfo(page, entityId, 'Arm_L');

  await page.getByRole('button', { name: 'Pose mode' }).click();
  await waitForAnimatorMatch(page, entityId, { poseMode: false });
  const afterPoseToggle = await getAnimatorInfo(page, entityId);

  await page.getByRole('button', { name: 'Anadir clip' }).nth(1).click();
  await waitForAnimatorMatch(
    page,
    entityId,
    {
      clipCount: mountedInfo.clipCount + 1,
      activeClipName: 'Walk Cycle',
      currentAnimation: 'Walk Cycle',
    }
  );
  const afterClipAdd = await getAnimatorInfo(page, entityId);

  await page.getByRole('button', { name: 'Add to NLA' }).click();
  await waitForAnimatorMatch(
    page,
    entityId,
    {
      nlaCount: mountedInfo.nlaCount + 1,
      nlaNameIncludes: 'Walk Cycle',
    }
  );
  const afterNla = await getAnimatorInfo(page, entityId);

  await nudgeSmileShapeKey(page);
  await page.waitForFunction(
    ({ id }) => {
      const info = window.__REY30_VIEWPORT_TEST__?.getEntityAnimatorInfo(id);
      const smile = info?.shapeKeys.find((shapeKey) => shapeKey.name === 'Smile') ?? null;
      return Boolean(smile && smile.weight > 0.05);
    },
    { id: entityId },
    { timeout: 15000 }
  );
  const afterShapeKey = await getAnimatorInfo(page, entityId);

  await page.screenshot({
    path: path.join(outputDir, 'animation-panel.png'),
    fullPage: true,
  });
  await page.locator('[data-testid="scene-view"]').screenshot({
    path: path.join(outputDir, 'viewport-animation.png'),
  });

  const smileWeight = afterShapeKey?.shapeKeys.find((shapeKey) => shapeKey.name === 'Smile')?.weight ?? 0;
  const report = {
    ok:
      mountedInfo?.hasAnimator === true &&
      (mountedInfo?.boneCount ?? 0) >= 8 &&
      (mountedInfo?.ikCount ?? 0) >= 2 &&
      (mountedInfo?.constraintCount ?? 0) >= 2 &&
      (mountedInfo?.shapeKeyCount ?? 0) >= 6 &&
      afterRigOps?.boneCount === (mountedInfo?.boneCount ?? 0) + 1 &&
      afterRigOps?.ikCount === (mountedInfo?.ikCount ?? 0) + 1 &&
      afterRigOps?.constraintCount === (mountedInfo?.constraintCount ?? 0) + 1 &&
      afterPoseToggle?.poseMode === false &&
      (armLeftWeight?.nonZeroVertices ?? 0) > 0 &&
      afterClipAdd?.clipCount === (mountedInfo?.clipCount ?? 0) + 1 &&
      afterClipAdd?.activeClipName === 'Walk Cycle' &&
      afterClipAdd?.currentAnimation === 'Walk Cycle' &&
      afterNla?.nlaCount === (mountedInfo?.nlaCount ?? 0) + 1 &&
      smileWeight > 0.05 &&
      consoleErrors.length === 0,
    mountedInfo,
    afterRigOps,
    armLeftWeight,
    afterPoseToggle,
    afterClipAdd,
    afterNla,
    smileWeight,
    consoleErrors,
  };

  fs.writeFileSync(
    path.join(outputDir, 'report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8'
  );

  if (!report.ok) {
    throw new Error(`Smoke de animacion fallo: ${JSON.stringify(report, null, 2)}`);
  }

  console.log(JSON.stringify(report, null, 2));
} finally {
  await page.close().catch(() => {});
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
  await prisma.$disconnect().catch(() => {});
}
