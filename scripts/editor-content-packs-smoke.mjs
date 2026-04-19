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
const outputDir = args.get('output-dir') || 'output/editor-content-packs-smoke';
const email = 'content-packs-smoke@example.com';
const password = 'ContentPacksSmoke123!';
const smokeAuthMode = (
  args.get('auth-mode') ||
  process.env.REY30_CONTENT_PACKS_SMOKE_AUTH_MODE ||
  (process.env.REY30_LOCAL_OWNER_MODE === 'true' ? 'local-owner' : 'seeded-session')
)
  .trim()
  .toLowerCase();
const useLocalOwnerAuth = smokeAuthMode === 'local-owner';
const localOwnerEmail = (process.env.REY30_LOCAL_OWNER_EMAIL || 'owner@rey30.local')
  .trim()
  .toLowerCase();
const prisma = useLocalOwnerAuth ? null : new PrismaClient();

const CONTENT_PACKS = [
  { id: 'materials_core_pack', name: 'Materials Core Pack' },
  { id: 'vfx_core_pack', name: 'VFX Core Pack' },
  { id: 'animation_starter_pack', name: 'Animation Starter Pack' },
  { id: 'ambient_fx_pack', name: 'Ambient FX Pack' },
  { id: 'boss_arena_pack', name: 'Boss Arena Pack' },
  { id: 'horror_fog_scene_pack', name: 'Horror Fog Scene Pack' },
  { id: 'scifi_material_lab_pack', name: 'Sci-Fi Material Lab Pack' },
  { id: 'animation_demo_stage_pack', name: 'Animation Demo Stage Pack' },
];

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
  if (!prisma) {
    throw new Error('Seeded session requested without Prisma client.');
  }
  const passwordHash = hashPassword(password);
  const user = await prisma.user.upsert({
    where: { email },
    update: {
      name: 'Content Packs Smoke',
      role: UserRole.EDITOR,
      isActive: true,
      passwordHash,
      lastLoginAt: new Date(),
    },
    create: {
      email,
      name: 'Content Packs Smoke',
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
  if (useLocalOwnerAuth) {
    return createSmokeAuthenticatedContext(browser, {
      baseUrl,
      bootstrapLocalOwner: true,
      expectedEmail: localOwnerEmail,
    });
  }

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

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function clickVisibleButtonUntil(page, label, waitFor) {
  const buttons = page.getByRole('button', {
    name: new RegExp(`^${escapeRegex(label)}(?:\\b|\\s|$)`, 'i'),
  });
  const count = await buttons.count();
  let lastError = null;

  for (let index = 0; index < count; index += 1) {
    const candidate = buttons.nth(index);
    if (!(await candidate.isVisible().catch(() => false))) {
      continue;
    }
    try {
      await candidate.click();
      await waitFor();
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(`No se pudo activar "${label}": ${String(lastError?.message || lastError)}`);
}

async function switchWorkspace(page, workspaceLabel, waitFor) {
  await clickVisibleButtonUntil(page, workspaceLabel, waitFor);
  await page.waitForTimeout(500);
}

async function openPanel(page, label, waitFor) {
  await clickVisibleButtonUntil(page, label, waitFor);
  await page.waitForTimeout(500);
}

async function createSelectedCube(page) {
  const entityId = await page.evaluate(() => {
    const api = window.__REY30_VIEWPORT_TEST__;
    const id = api?.createEntity('cube') ?? null;
    if (id) {
      api?.setSelectMode?.();
      api?.selectEntity?.(id, false);
    }
    return id;
  });

  if (!entityId) {
    throw new Error('No se pudo crear la entidad base para smoke de content packs');
  }

  return entityId;
}

async function readVisiblePresetSummary(page, label) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const text = await page.evaluate(() => document.body?.innerText || '');
    const match = text.match(/(\d+)\s+de\s+(\d+)\s+presets visibles/i);
    if (match) {
      return {
        text: match[0],
        visibleCount: Number(match[1]),
        totalCount: Number(match[2]),
      };
    }
    await page.waitForTimeout(250);
  }

  const fallbackText = await page.evaluate(() => document.body?.innerText || '');
  throw new Error(`No se pudo leer el contador de presets para ${label}. Estado visible: ${fallbackText}`);
}

async function getInstalledAddons(page) {
  return page.evaluate(async () => {
    const response = await fetch('/api/addons', { cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    return Array.isArray(payload?.addons) ? payload.addons.map((entry) => entry?.addon ?? entry) : [];
  });
}

async function waitForInstalledAddon(page, addonId) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const addons = await getInstalledAddons(page);
    if (addons.some((addon) => addon?.id === addonId)) {
      return addons;
    }
    await page.waitForTimeout(300);
  }
  throw new Error(`El addon ${addonId} no quedó instalado dentro del tiempo esperado.`);
}

async function installContentPack(page, pack) {
  const title = page.getByText(pack.name, { exact: true }).first();
  await title.waitFor({ timeout: 10000 });
  const card = title.locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]');
  await card.scrollIntoViewIfNeeded();
  const button = card.getByRole('button').first();
  await button.click();
  return waitForInstalledAddon(page, pack.id);
}

async function clickInstalledAddonAction(page, addonName, actionLabel) {
  const titles = page.getByText(addonName, { exact: true });
  const count = await titles.count();
  let installedCard = null;

  for (let index = count - 1; index >= 0; index -= 1) {
    const candidate = titles.nth(index);
    if (!(await candidate.isVisible().catch(() => false))) {
      continue;
    }
    installedCard = candidate.locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]');
    break;
  }

  if (!installedCard) {
    throw new Error(`No se encontró la tarjeta instalada para ${addonName}.`);
  }

  await installedCard.scrollIntoViewIfNeeded();
  const button = installedCard.getByRole('button', { name: new RegExp(`^${escapeRegex(actionLabel)}\\b`, 'i') }).first();
  await button.waitFor({ timeout: 10000 });
  await button.click();
}

async function waitForSelectedMaterial(page, expectedMaterialId) {
  await page.waitForFunction(
    (materialId) => window.__REY30_VIEWPORT_TEST__?.getSelectedEntityMaterialId?.() === materialId,
    expectedMaterialId,
    { timeout: 10000 }
  );
}

async function getSceneEntityCount(page) {
  return page.evaluate(() => window.__REY30_VIEWPORT_TEST__?.getSceneEntityCount?.() ?? 0);
}

async function waitForSceneEntityCount(page, expectedCount) {
  await page.waitForFunction(
    (count) => window.__REY30_VIEWPORT_TEST__?.getSceneEntityCount?.() === count,
    expectedCount,
    { timeout: 10000 }
  );
}

async function getSelectedEntityId(page) {
  return page.evaluate(() => window.__REY30_VIEWPORT_TEST__?.getSelectedEntityIds?.()?.[0] ?? null);
}

async function ensureSelectedEntity(page, entityId) {
  await page.evaluate((selectedEntityId) => {
    window.__REY30_VIEWPORT_TEST__?.setSelectMode?.();
    return window.__REY30_VIEWPORT_TEST__?.selectEntity?.(selectedEntityId, false) ?? false;
  }, entityId);

  await page.waitForFunction(
    (selectedEntityId) =>
      window.__REY30_VIEWPORT_TEST__?.getSelectedEntityIds?.()?.includes(selectedEntityId) ===
      true,
    entityId,
    { timeout: 10000 }
  );
}

async function waitForParticlePreset(page, entityId, expectedPresetId) {
  await page.waitForFunction(
    ([selectedEntityId, presetId]) =>
      window.__REY30_VIEWPORT_TEST__?.getEntitySimulationInfo?.(selectedEntityId)?.particlePresetId ===
      presetId,
    [entityId, expectedPresetId],
    { timeout: 10000 }
  );
}

async function waitForAnimatorClip(page, entityId, expectedClipName) {
  await page.waitForFunction(
    ([selectedEntityId, clipName]) =>
      window.__REY30_VIEWPORT_TEST__?.getEntityAnimatorInfo?.(selectedEntityId)?.clipNames?.includes(
        clipName
      ) === true,
    [entityId, expectedClipName],
    { timeout: 10000 }
  );
}

async function waitForAnimatorReady(page, entityId) {
  await page.waitForFunction(
    (selectedEntityId) =>
      window.__REY30_VIEWPORT_TEST__?.getEntityAnimatorInfo?.(selectedEntityId)?.hasAnimator ===
      true,
    entityId,
    { timeout: 10000 }
  );
}

async function readQuickActionSummary(page, entityId) {
  return page.evaluate((selectedEntityId) => {
    const api = window.__REY30_VIEWPORT_TEST__;
    return {
      selectedEntityId: selectedEntityId ?? null,
      selectedEntityIds: api?.getSelectedEntityIds?.() ?? [],
      materialId: api?.getSelectedEntityMaterialId?.() ?? null,
      simulation: api?.getEntitySimulationInfo?.(selectedEntityId) ?? null,
      animator: api?.getEntityAnimatorInfo?.(selectedEntityId) ?? null,
    };
  }, entityId);
}

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader'],
});

const context = await createAuthenticatedContext(browser);
const page = await context.newPage();
const consoleErrors = [];
const ignoredConsoleErrors = [];

function shouldIgnoreConsoleError(text) {
  return text === 'Failed to load resource: net::ERR_CONNECTION_REFUSED';
}

page.on('console', (message) => {
  if (message.type() === 'error') {
    const text = message.text();
    if (shouldIgnoreConsoleError(text)) {
      ignoredConsoleErrors.push(text);
      return;
    }
    consoleErrors.push(text);
  }
});

page.on('pageerror', (error) => {
  consoleErrors.push(String(error));
});

try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await waitForBridge(page);
  const entityId = await createSelectedCube(page);

  await switchWorkspace(page, 'Materials', async () => {
    await page.getByRole('heading', { name: 'Material Editor' }).waitFor({ timeout: 3000 });
  });
  const materialSummary = await readVisiblePresetSummary(page, 'materials');
  await page.screenshot({
    path: path.join(outputDir, 'materials-presets.png'),
    fullPage: true,
  });

  await openPanel(page, 'Inspector', async () => {
    await page
      .getByText('Selección activa y stack de componentes.', { exact: true })
      .waitFor({ timeout: 3000 });
  });
  await page.getByRole('button', { name: 'Add ParticleSystem', exact: true }).click();
  const particleSummary = await readVisiblePresetSummary(page, 'particles');
  await page.screenshot({
    path: path.join(outputDir, 'particle-presets.png'),
    fullPage: true,
  });

  await switchWorkspace(page, 'Scripting', async () => {
    await page.getByRole('heading', { name: 'Scrib Studio' }).waitFor({ timeout: 3000 });
  });
  await openPanel(page, 'Addons', async () => {
    await page
      .getByRole('heading', { name: 'Instalar funciones al motor' })
      .waitFor({ timeout: 3000 });
  });

  for (const pack of CONTENT_PACKS) {
    await page.getByText(pack.name, { exact: true }).first().waitFor({ timeout: 10000 });
  }

  const installedSets = [];
  for (const pack of CONTENT_PACKS) {
    installedSets.push(await installContentPack(page, pack));
  }

  await page.screenshot({
    path: path.join(outputDir, 'content-packs.png'),
    fullPage: true,
  });

  await ensureSelectedEntity(page, entityId);

  await clickInstalledAddonAction(page, 'Materials Core Pack', 'Steel');
  await waitForSelectedMaterial(page, 'steel');

  await clickInstalledAddonAction(page, 'VFX Core Pack', 'Bonfire');
  await waitForParticlePreset(page, entityId, 'bonfire');

  await clickInstalledAddonAction(page, 'Ambient FX Pack', 'Mist');
  await waitForParticlePreset(page, entityId, 'mist');

  await clickInstalledAddonAction(page, 'Animation Starter Pack', 'Montar Rig');
  await waitForAnimatorReady(page, entityId);
  await clickInstalledAddonAction(page, 'Animation Starter Pack', 'Walk Cycle');
  await waitForAnimatorClip(page, entityId, 'Walk Cycle');

  const quickActionSummary = await readQuickActionSummary(page, entityId);

  await page.screenshot({
    path: path.join(outputDir, 'content-pack-actions.png'),
    fullPage: true,
  });

  let expectedEntityCount = await getSceneEntityCount(page);

  await clickInstalledAddonAction(page, 'Materials Core Pack', 'Crear Steel Prop');
  expectedEntityCount += 1;
  await waitForSceneEntityCount(page, expectedEntityCount);
  await waitForSelectedMaterial(page, 'steel');
  const steelHelperId = await getSelectedEntityId(page);
  const steelHelperSummary = await readQuickActionSummary(page, steelHelperId);

  await clickInstalledAddonAction(page, 'VFX Core Pack', 'Crear Bonfire Helper');
  expectedEntityCount += 1;
  await waitForSceneEntityCount(page, expectedEntityCount);
  const bonfireHelperId = await getSelectedEntityId(page);
  await waitForParticlePreset(page, bonfireHelperId, 'bonfire');
  const bonfireHelperSummary = await readQuickActionSummary(page, bonfireHelperId);

  await clickInstalledAddonAction(page, 'Ambient FX Pack', 'Crear Mist Volume');
  expectedEntityCount += 1;
  await waitForSceneEntityCount(page, expectedEntityCount);
  const mistHelperId = await getSelectedEntityId(page);
  await waitForParticlePreset(page, mistHelperId, 'mist');
  const mistHelperSummary = await readQuickActionSummary(page, mistHelperId);

  await clickInstalledAddonAction(page, 'Animation Starter Pack', 'Crear Walk Dummy');
  expectedEntityCount += 1;
  await waitForSceneEntityCount(page, expectedEntityCount);
  const walkDummyId = await getSelectedEntityId(page);
  await waitForAnimatorClip(page, walkDummyId, 'Walk Cycle');
  const walkDummySummary = await readQuickActionSummary(page, walkDummyId);

  await clickInstalledAddonAction(page, 'Materials Core Pack', 'Crear Material Showcase');
  expectedEntityCount += 5;
  await waitForSceneEntityCount(page, expectedEntityCount);
  const materialShowcaseId = await getSelectedEntityId(page);
  await waitForSelectedMaterial(page, 'steel');
  const materialShowcaseSummary = await readQuickActionSummary(page, materialShowcaseId);

  await clickInstalledAddonAction(page, 'VFX Core Pack', 'Crear Campfire Scene');
  expectedEntityCount += 5;
  await waitForSceneEntityCount(page, expectedEntityCount);
  const campfireSceneId = await getSelectedEntityId(page);
  await waitForParticlePreset(page, campfireSceneId, 'bonfire');
  const campfireSceneSummary = await readQuickActionSummary(page, campfireSceneId);

  await clickInstalledAddonAction(page, 'Ambient FX Pack', 'Crear Atmosphere Scene');
  expectedEntityCount += 5;
  await waitForSceneEntityCount(page, expectedEntityCount);
  const atmosphereSceneId = await getSelectedEntityId(page);
  await waitForParticlePreset(page, atmosphereSceneId, 'mist');
  const atmosphereSceneSummary = await readQuickActionSummary(page, atmosphereSceneId);

  await clickInstalledAddonAction(page, 'Animation Starter Pack', 'Crear Walk Stage');
  expectedEntityCount += 4;
  await waitForSceneEntityCount(page, expectedEntityCount);
  const walkStageId = await getSelectedEntityId(page);
  await waitForAnimatorClip(page, walkStageId, 'Walk Cycle');
  const walkStageSummary = await readQuickActionSummary(page, walkStageId);

  await clickInstalledAddonAction(page, 'Boss Arena Pack', 'Crear Boss Arena');
  expectedEntityCount += 6;
  await waitForSceneEntityCount(page, expectedEntityCount);
  const bossArenaId = await getSelectedEntityId(page);
  await waitForSelectedMaterial(page, 'lava');
  const bossArenaSummary = await readQuickActionSummary(page, bossArenaId);

  await clickInstalledAddonAction(page, 'Horror Fog Scene Pack', 'Crear Horror Fog Scene');
  expectedEntityCount += 6;
  await waitForSceneEntityCount(page, expectedEntityCount);
  const horrorFogId = await getSelectedEntityId(page);
  await waitForParticlePreset(page, horrorFogId, 'mist');
  const horrorFogSummary = await readQuickActionSummary(page, horrorFogId);

  await clickInstalledAddonAction(page, 'Sci-Fi Material Lab Pack', 'Crear Sci-Fi Material Lab');
  expectedEntityCount += 6;
  await waitForSceneEntityCount(page, expectedEntityCount);
  const scifiLabId = await getSelectedEntityId(page);
  await waitForSelectedMaterial(page, 'mercury');
  const scifiLabSummary = await readQuickActionSummary(page, scifiLabId);

  await clickInstalledAddonAction(page, 'Animation Demo Stage Pack', 'Crear Animation Demo Stage');
  expectedEntityCount += 5;
  await waitForSceneEntityCount(page, expectedEntityCount);
  const animationDemoStageId = await getSelectedEntityId(page);
  await waitForAnimatorClip(page, animationDemoStageId, 'Run Cycle');
  const animationDemoStageSummary = await readQuickActionSummary(page, animationDemoStageId);

  await page.screenshot({
    path: path.join(outputDir, 'scene-pack-actions.png'),
    fullPage: true,
  });

  const installedAddons = installedSets[installedSets.length - 1] ?? (await getInstalledAddons(page));
  const installedContentPackIds = installedAddons
    .map((addon) => addon?.id)
    .filter((addonId) => CONTENT_PACKS.some((pack) => pack.id === addonId));

  const report = {
    ok:
      materialSummary.totalCount >= 24 &&
      materialSummary.visibleCount >= 24 &&
      particleSummary.totalCount >= 30 &&
      particleSummary.visibleCount >= 30 &&
      CONTENT_PACKS.every((pack) => installedContentPackIds.includes(pack.id)) &&
      quickActionSummary.materialId === 'steel' &&
      quickActionSummary.simulation?.particlePresetId === 'mist' &&
      quickActionSummary.simulation?.particleSimulationBackend === 'gpu' &&
      quickActionSummary.animator?.hasAnimator === true &&
      quickActionSummary.animator?.clipNames?.includes('Walk Cycle') === true &&
      steelHelperSummary.materialId === 'steel' &&
      bonfireHelperSummary.simulation?.particlePresetId === 'bonfire' &&
      mistHelperSummary.simulation?.particlePresetId === 'mist' &&
      walkDummySummary.animator?.clipNames?.includes('Walk Cycle') === true &&
      materialShowcaseSummary.materialId === 'steel' &&
      campfireSceneSummary.simulation?.particlePresetId === 'bonfire' &&
      atmosphereSceneSummary.simulation?.particlePresetId === 'mist' &&
      walkStageSummary.animator?.clipNames?.includes('Walk Cycle') === true &&
      bossArenaSummary.materialId === 'lava' &&
      horrorFogSummary.simulation?.particlePresetId === 'mist' &&
      scifiLabSummary.materialId === 'mercury' &&
      animationDemoStageSummary.animator?.clipNames?.includes('Run Cycle') === true &&
      consoleErrors.length === 0,
    materialSummary,
    particleSummary,
    contentPacks: CONTENT_PACKS,
    authMode: smokeAuthMode,
    installedContentPackIds,
    quickActionSummary,
    helperCreationSummary: {
      finalEntityCount: expectedEntityCount,
      steelHelper: steelHelperSummary,
      bonfireHelper: bonfireHelperSummary,
      mistHelper: mistHelperSummary,
      walkDummy: walkDummySummary,
    },
    scenePackSummary: {
      materialShowcase: materialShowcaseSummary,
      campfireScene: campfireSceneSummary,
      atmosphereScene: atmosphereSceneSummary,
      walkStage: walkStageSummary,
      bossArena: bossArenaSummary,
      horrorFogScene: horrorFogSummary,
      scifiMaterialLab: scifiLabSummary,
      animationDemoStage: animationDemoStageSummary,
    },
    ignoredConsoleErrors,
    consoleErrors,
  };

  fs.writeFileSync(
    path.join(outputDir, 'report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8'
  );

  if (!report.ok) {
    throw new Error(`Smoke de content packs fallo: ${JSON.stringify(report, null, 2)}`);
  }

  console.log(JSON.stringify(report, null, 2));
} finally {
  await page.close().catch(() => {});
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
  await prisma?.$disconnect().catch(() => {});
}
