import fs from 'node:fs';
import path from 'node:path';
import { chromium } from './playwright-runtime.mjs';

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
const outputDir = args.get('output-dir') || 'output/editor-world-pipeline-smoke';

fs.mkdirSync(outputDir, { recursive: true });

async function waitForBridge(page) {
  await page.waitForSelector('[data-testid="scene-view"]', { timeout: 10000 });
  await page.waitForFunction(() => typeof window.__REY30_VIEWPORT_TEST__ === 'object');
}

async function openPanel(page, label) {
  await page.getByRole('button', { name: label }).last().click();
  await page.waitForTimeout(500);
}

async function ensureSelection(page, entityId) {
  await page.evaluate((id) => {
    const api = window.__REY30_VIEWPORT_TEST__;
    api?.setSelectMode();
    api?.selectEntity(id, false);
  }, entityId);
  await page.waitForTimeout(300);
}

async function readEnvironment(page) {
  return page.evaluate(() => window.__REY30_VIEWPORT_TEST__?.getActiveSceneEnvironment() ?? null);
}

async function applyWorldPreset(page, label) {
  await page.getByRole('button', { name: label }).click();
  await page.waitForTimeout(700);
  return readEnvironment(page);
}

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader'],
});

const page = await browser.newPage({ viewport: { width: 1560, height: 980 } });
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
    const id = api?.createEntity('sphere') ?? null;
    if (id) {
      api?.setEntityPosition(id, { x: 0, y: 0.75, z: 0 });
      api?.setSelectMode();
      api?.selectEntity(id, false);
    }
    return id;
  });
  if (!entityId) {
    throw new Error('No se pudo crear la entidad base para smoke de world pipeline');
  }

  await ensureSelection(page, entityId);
  await openPanel(page, 'Materials');
  await page.getByRole('button', { name: /Material Metal/ }).click();
  await page.waitForTimeout(500);

  const materialIdAfterApply = await page.evaluate(
    () => window.__REY30_VIEWPORT_TEST__?.getSelectedEntityMaterialId() ?? null
  );

  await openPanel(page, 'World');
  await page.getByText('Visual Presets').waitFor({ state: 'visible', timeout: 10000 });

  const productEnvironment = await applyWorldPreset(page, 'Product');
  await page.screenshot({
    path: path.join(outputDir, 'world-product.png'),
    fullPage: true,
  });

  const cinematicEnvironment = await applyWorldPreset(page, 'Cinematic');
  await page.screenshot({
    path: path.join(outputDir, 'world-cinematic.png'),
    fullPage: true,
  });

  const toneMappingTrigger = page.getByRole('combobox').last();
  await toneMappingTrigger.click();
  await page.getByRole('option', { name: 'Reinhard' }).click();
  await page.waitForTimeout(500);

  const reinhardEnvironment = await readEnvironment(page);

  const cameraViewTrigger = page.getByRole('combobox').filter({ hasText: 'Perspective' }).first();
  await cameraViewTrigger.click();
  await page.getByRole('option', { name: 'Orthographic' }).click();
  await page.waitForTimeout(700);

  await page.screenshot({
    path: path.join(outputDir, 'world-orthographic.png'),
    fullPage: true,
  });

  const ignoredConsoleErrors = consoleErrors.filter(
    (message) =>
      message.includes('/_next/webpack-hmr') &&
      message.includes('ERR_CONNECTION_REFUSED')
  );
  const blockingConsoleErrors = consoleErrors.filter(
    (message) => !ignoredConsoleErrors.includes(message)
  );

  const report = {
    ok:
      materialIdAfterApply === 'metal' &&
      productEnvironment?.postProcessing?.ssao?.enabled === true &&
      productEnvironment?.postProcessing?.ssr?.enabled === true &&
      productEnvironment?.postProcessing?.colorGrading?.rendererExposure === 1.08 &&
      cinematicEnvironment?.fog?.enabled === true &&
      cinematicEnvironment?.postProcessing?.colorGrading?.rendererExposure === 0.96 &&
      reinhardEnvironment?.postProcessing?.colorGrading?.toneMapping === 'reinhard' &&
      blockingConsoleErrors.length === 0,
    materialIdAfterApply,
    productEnvironment,
    cinematicEnvironment,
    reinhardEnvironment,
    ignoredConsoleErrors,
    blockingConsoleErrors,
    consoleErrors,
  };

  fs.writeFileSync(
    path.join(outputDir, 'report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8'
  );

  if (!report.ok) {
    throw new Error(`Smoke world pipeline falló: ${JSON.stringify(report, null, 2)}`);
  }

  console.log(JSON.stringify(report, null, 2));
} finally {
  await page.close().catch(() => {});
  await browser.close().catch(() => {});
}
