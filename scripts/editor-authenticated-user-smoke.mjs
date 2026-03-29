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
const outputDir = args.get('output-dir') || 'output/editor-authenticated-user-smoke';
const email = 'editor-auth-ui-smoke@example.com';
const password = 'EditorAuthUiSmoke123!';
const role = UserRole.EDITOR;
const uniqueSuffix = `${Date.now()}`;
const stillName = `AuthUiStill_${uniqueSuffix}`;
const scriptName = `smokes/auth_ui_${uniqueSuffix}.ts`;
const projectName = 'Authenticated User Smoke Project';
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

async function seedEditorUser() {
  const passwordHash = hashPassword(password);
  const user = await prisma.user.upsert({
    where: { email },
    update: {
      name: 'Editor Auth UI Smoke',
      role,
      isActive: true,
      passwordHash,
      lastLoginAt: new Date(),
    },
    create: {
      email,
      name: 'Editor Auth UI Smoke',
      role,
      isActive: true,
      passwordHash,
      lastLoginAt: new Date(),
    },
  });

  await prisma.authSession.deleteMany({ where: { userId: user.id } });

  return user;
}

async function waitForBridge(page) {
  await page.waitForSelector('[data-testid="scene-view"]', { timeout: 30000 });
  await page.waitForFunction(() => typeof window.__REY30_VIEWPORT_TEST__ === 'object', null, {
    timeout: 30000,
  });
}

async function openPanel(page, label) {
  await page.getByRole('button', { name: label, exact: true }).last().click();
  await page.waitForTimeout(500);
}

async function createSelectedCube(page) {
  const entityId = await page.evaluate(() => {
    const api = window.__REY30_VIEWPORT_TEST__;
    const id = api?.createEntity('cube') ?? null;
    if (!id) return null;
    api?.setSelectMode?.();
    api?.selectEntity?.(id, false);
    return id;
  });

  if (!entityId) {
    throw new Error('No se pudo crear la entidad base para el smoke autenticado');
  }

  return entityId;
}

async function listAssets(page) {
  return page.evaluate(async () => {
    const response = await fetch('/api/assets', { cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    return payload?.assets ?? [];
  });
}

async function getSessionPayload(page) {
  return page.evaluate(async () => {
    const response = await fetch('/api/auth/session', { cache: 'no-store' });
    return response.json().catch(() => ({}));
  });
}

async function loginThroughUi(page) {
  await openPanel(page, 'Config APIs');
  await page.getByText('Usuario / Config APIs').waitFor({ timeout: 15000 });
  await page.getByText('Sin sesión activa').waitFor({ timeout: 15000 });

  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();

  await page.getByText(new RegExp(`Sesión activa: ${email} \\(${role}\\)`)).waitFor({
    timeout: 20000,
  });
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildValidSmokeScript() {
  return `type SmokeEntity = { name?: string };\n` +
    `type SmokeConfig = { speed?: number };\n` +
    `type SmokeContext = { deltaTime: number; entityId?: string };\n\n` +
    `export function update(context: SmokeContext): void {\n` +
    `  console.log('[auth-ui-smoke] tick', context.deltaTime);\n` +
    `}\n\n` +
    `export default function mount(\n` +
    `  entity: SmokeEntity | undefined,\n` +
    `  config: SmokeConfig | undefined,\n` +
    `  ctx: SmokeContext | undefined\n` +
    `): void {\n` +
    `  if (entity?.name && config?.speed && ctx?.entityId) {\n` +
    `    console.log('[auth-ui-smoke] bind', entity.name, config.speed, ctx.entityId);\n` +
    `  }\n` +
    `}\n`;
}

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader'],
});

const context = await browser.newContext({ viewport: { width: 1560, height: 980 } });
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
  await seedEditorUser();

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await waitForBridge(page);

  await openPanel(page, 'Assets');
  await page.getByText('Inicia sesion en Config APIs -> Usuario para usar Assets.').waitFor({
    timeout: 15000,
  });
  const assetsHintVisibleBeforeLogin = true;

  await openPanel(page, 'Scrib Studio');
  await page.getByText('Inicia sesion en Config APIs -> Usuario para usar Scrib Studio.').waitFor({
    timeout: 15000,
  });
  const scribHintVisibleBeforeLogin = true;

  await loginThroughUi(page);

  await page.screenshot({
    path: path.join(outputDir, 'config-after-login.png'),
    fullPage: true,
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await waitForBridge(page);
  await openPanel(page, 'Config APIs');
  await page.getByText(new RegExp(`Sesión activa: ${email} \\(${role}\\)`)).waitFor({
    timeout: 20000,
  });

  const sessionPayload = await getSessionPayload(page);
  const sessionCookiePresentAfterReload = (await context.cookies(baseUrl)).some(
    (cookie) => cookie.name === 'rey30_session' && typeof cookie.value === 'string' && cookie.value.length > 0
  );

  const entityId = await createSelectedCube(page);
  await page.evaluate((nextProjectName) => {
    window.__REY30_VIEWPORT_TEST__?.setProjectName?.(nextProjectName);
  }, projectName);

  await openPanel(page, 'Compositor');
  await page.getByText('Compositor & Video').waitFor({ timeout: 15000 });
  await page.getByRole('textbox', { name: 'Still name' }).fill(stillName);
  await page.getByRole('button', { name: 'Save still to Assets' }).click();
  await page.getByLabel('Compositor status').getByText(/Still guardado en Assets/).waitFor({
    timeout: 20000,
  });

  const assetsAfterCapture = await listAssets(page);
  const stillAsset = assetsAfterCapture.find(
    (asset) => asset?.metadata?.compositorStill === true && asset?.name === stillName
  );

  await openPanel(page, 'Assets');
  await page.getByText('Inicia sesion en Config APIs -> Usuario para usar Assets.').waitFor({
    state: 'hidden',
    timeout: 15000,
  });
  await page.getByText('Folders').waitFor({ timeout: 15000 });

  await page.screenshot({
    path: path.join(outputDir, 'assets-after-login.png'),
    fullPage: true,
  });

  await openPanel(page, 'Scrib Studio');
  await page.getByText('Inicia sesion en Config APIs -> Usuario para usar Scrib Studio.').waitFor({
    state: 'hidden',
    timeout: 15000,
  });
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByText('Edit Files').waitFor({ timeout: 15000 });
  await page.locator('input[placeholder=\"scribs/movement.scrib.ts\"]').fill(scriptName);
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByText(new RegExp(`Abierto: ${escapeRegex(scriptName)}`)).waitFor({
    timeout: 20000,
  });

  const editorArea = page.getByPlaceholder('Abre un script para editar');
  await editorArea.fill(buildValidSmokeScript());

  await page.getByRole('button', { name: 'save', exact: true }).click();
  await page.getByText(new RegExp(`Guardado: ${escapeRegex(scriptName)}`)).waitFor({
    timeout: 20000,
  });

  await page.getByRole('button', { name: 'compile', exact: true }).click();
  await page.getByText(/^Compilación OK/).first().waitFor({ timeout: 20000 });

  await page.getByRole('button', { name: 'vincular script', exact: true }).click();
  await page.getByText(/Script vinculado a /).waitFor({ timeout: 15000 });

  await page.screenshot({
    path: path.join(outputDir, 'scrib-after-compile.png'),
    fullPage: true,
  });

  const report = {
    ok:
      assetsHintVisibleBeforeLogin &&
      scribHintVisibleBeforeLogin &&
      sessionPayload?.authenticated === true &&
      sessionPayload?.user?.email === email &&
      sessionPayload?.user?.role === role &&
      typeof stillAsset?.path === 'string' &&
      stillAsset.path.includes('/texture/compositor/') &&
      consoleErrors.length === 0,
    baseUrl,
    email,
    role,
    projectName,
    entityId,
    scriptPath: scriptName,
    assetsHintVisibleBeforeLogin,
    scribHintVisibleBeforeLogin,
    sessionAuthenticatedAfterReload: Boolean(sessionPayload?.authenticated),
    sessionCookiePresentAfterReload,
    stillAssetPath: stillAsset?.path ?? null,
    consoleErrors,
  };

  fs.writeFileSync(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  if (!report.ok) {
    process.exitCode = 1;
  }
} finally {
  await context.close().catch(() => undefined);
  await browser.close().catch(() => undefined);
  await prisma.$disconnect().catch(() => undefined);
}
