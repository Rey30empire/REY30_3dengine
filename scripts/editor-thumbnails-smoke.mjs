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
const outputDir = args.get('output-dir') || 'output/editor-thumbnails-smoke';

fs.mkdirSync(outputDir, { recursive: true });

const materialPresetNames = ['Default', 'Metal', 'Plastic', 'Glass', 'Emissive', 'Clay'];
const builtInModelerPresetAlts = [
  'Preset built-in Mirror Shell',
  'Preset built-in Radial Kit',
  'Preset built-in Proxy LOD',
];

async function waitForBridge(page) {
  await page.waitForSelector('[data-testid="scene-view"]', { timeout: 10000 });
  await page.waitForFunction(() => typeof window.__REY30_VIEWPORT_TEST__ === 'object');
}

async function ensureSelection(page, entityId) {
  await page.evaluate((id) => {
    const api = window.__REY30_VIEWPORT_TEST__;
    api?.setSelectMode();
    api?.selectEntity(id, false);
  }, entityId);
  await page.waitForTimeout(300);
}

async function waitForAltImage(page, alt, state = 'visible') {
  await page.waitForSelector(`img[alt="${alt}"]`, { timeout: 10000, state });
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
    const id = api?.createEntity('cube') ?? null;
    if (id) {
      api?.setSelectMode();
      api?.selectEntity(id, false);
    }
    return id;
  });
  if (!entityId) {
    throw new Error('No se pudo crear la entidad base para smoke de thumbnails');
  }

  await ensureSelection(page, entityId);

  await page.getByRole('button', { name: 'Materials' }).click();
  await page.waitForTimeout(600);

  for (const presetName of materialPresetNames) {
    await waitForAltImage(page, `Material ${presetName}`);
  }

  await page.getByRole('button', { name: /Material Metal/ }).click();
  await page.waitForTimeout(500);
  const materialIdAfterApply = await page.evaluate(
    () => window.__REY30_VIEWPORT_TEST__?.getSelectedEntityMaterialId() ?? null
  );

  await page.screenshot({
    path: path.join(outputDir, 'materials.png'),
    fullPage: true,
  });

  await ensureSelection(page, entityId);
  await page.getByRole('button', { name: 'Inspector' }).click();
  await page.waitForTimeout(400);

  if ((await page.locator('img[alt^="Material actual"]').count()) === 0) {
    await page.getByRole('button', { name: 'MeshRenderer' }).click();
    await page.waitForTimeout(300);
  }

  await waitForAltImage(page, 'Material actual metal');
  await page.getByRole('combobox').filter({ hasText: 'Metal' }).click();
  await page.waitForTimeout(350);
  await waitForAltImage(page, 'Preset Default');
  await waitForAltImage(page, 'Preset Metal');
  const inspectorPresetImageCount = await page.locator('img[alt^="Preset "]').count();
  await page.keyboard.press('Escape');

  await page.screenshot({
    path: path.join(outputDir, 'inspector.png'),
    fullPage: true,
  });

  await ensureSelection(page, entityId);
  await page.getByRole('button', { name: 'Model' }).click();
  await page.waitForTimeout(1400);
  await page.getByText('Stack presets').waitFor({ state: 'visible', timeout: 10000 });

  for (const alt of builtInModelerPresetAlts) {
    await waitForAltImage(page, alt, 'attached');
  }

  await page.locator('button:visible').filter({ hasText: /^Apply$/ }).first().click();
  await page.waitForTimeout(500);
  await page.getByRole('textbox', { name: 'Nombre del preset' }).fill('SmokePreset');
  await page.getByRole('button', { name: 'Save preset' }).click();
  await page.waitForTimeout(1400);
  await waitForAltImage(page, 'Preset local SmokePreset', 'attached');

  const customPresetImageCount = await page.locator('img[alt="Preset local SmokePreset"]').count();
  const modifierStackIndicatorCount = await page.getByText('Modifier stack: 2').count();
  const serverAuthHintVisible = await page
    .getByText('Inicia sesion en Config APIs -> Usuario para guardar meshes y presets persistentes.')
    .count();

  await page.screenshot({
    path: path.join(outputDir, 'modeler.png'),
    fullPage: true,
  });

  const report = {
    ok:
      materialIdAfterApply === 'metal' &&
      inspectorPresetImageCount >= materialPresetNames.length &&
      customPresetImageCount >= 1 &&
      modifierStackIndicatorCount >= 1 &&
      consoleErrors.length === 0,
    materialPresetNames,
    materialIdAfterApply,
    inspectorPresetImageCount,
    builtInModelerPresetAlts,
    customPresetImageCount,
    modifierStackIndicatorCount,
    serverAuthHintVisible,
    consoleErrors,
  };

  fs.writeFileSync(
    path.join(outputDir, 'report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8'
  );

  if (!report.ok) {
    throw new Error(`Smoke de thumbnails falló: ${JSON.stringify(report, null, 2)}`);
  }

  console.log(JSON.stringify(report, null, 2));
} finally {
  await page.close().catch(() => {});
  await browser.close().catch(() => {});
}
