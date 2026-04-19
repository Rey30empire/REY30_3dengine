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
const benignUnauthorizedPathPrefixes = [
  '/api/materials',
  '/api/modifier-presets',
  '/api/modeler/persist',
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

async function waitForModelerBuiltInPreset(page, presetAlt, timeout = 20000) {
  const presetName = presetAlt.replace(/^Preset built-in\s+/, '').trim();
  const fallbackLabel = presetName.slice(0, 2).toUpperCase();
  const entrySelector = `[data-testid="modeler-built-in-preset-entry"][data-preset-name="${presetName}"]`;
  const entry = page.locator(entrySelector).first();

  await entry.waitFor({ state: 'visible', timeout });
  await entry.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);

  const previewStateHandle = await page.waitForFunction(
    ({ selector, alt, fallback }) => {
      const presetEntry = document.querySelector(selector);
      if (!(presetEntry instanceof HTMLElement)) {
        return false;
      }
      presetEntry.scrollIntoView({ block: 'center', inline: 'nearest' });
      if (presetEntry.querySelector(`img[alt="${alt}"]`)) {
        return 'image';
      }
      const previewSlots = Array.from(presetEntry.querySelectorAll('div'));
      const hasFallback = previewSlots.some(
        (slot) => slot.textContent?.trim() === fallback
      );
      return hasFallback ? 'fallback' : false;
    },
    { selector: entrySelector, alt: presetAlt, fallback: fallbackLabel },
    { timeout }
  );
  const previewState = await previewStateHandle.jsonValue();
  return previewState === 'image' ? 'image' : 'fallback';
}

async function clickWorkspace(page, subtitle) {
  const workspaceButton = page.locator(`button[title^="${subtitle}"]`).first();
  await workspaceButton.waitFor({ state: 'visible', timeout: 15000 });
  await workspaceButton.click();
}

async function openWorkspacePanel(page, { subtitle, panelLabel, readyText, attempts = 3 }) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    await clickWorkspace(page, subtitle);

    if (panelLabel) {
      const panelButton = page.getByRole('button', { name: panelLabel }).last();
      await panelButton.waitFor({ state: 'visible', timeout: 10000 });
      await panelButton.click();
    }

    if (!readyText) {
      await page.waitForTimeout(500);
      return;
    }

    try {
      await page.getByText(readyText).waitFor({ state: 'visible', timeout: 5000 });
      return;
    } catch {
      await page.waitForTimeout(500);
    }
  }

  throw new Error(`No se pudo abrir el workspace '${subtitle}' con el panel '${panelLabel ?? 'default'}'`);
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

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader'],
});

const page = await browser.newPage({ viewport: { width: 1560, height: 980 } });
const consoleErrors = [];
const unauthorizedResponses = [];
const notFoundResponses = [];
const requestFailures = [];
page.on('console', (message) => {
  if (message.type() === 'error') {
    consoleErrors.push(message.text());
  }
});
page.on('requestfailed', (request) => {
  requestFailures.push({
    url: request.url(),
    resourceType: request.resourceType(),
    errorText: request.failure()?.errorText ?? null,
  });
});
page.on('response', (response) => {
  if (response.status() === 401) {
    try {
      unauthorizedResponses.push(new URL(response.url()).pathname);
    } catch {
      unauthorizedResponses.push(response.url());
    }
  }
  if (response.status() === 404) {
    try {
      notFoundResponses.push(new URL(response.url()).pathname);
    } catch {
      notFoundResponses.push(response.url());
    }
  }
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
    throw new Error('No se pudo crear la entidad base para smoke de thumbnails');
  }

  await ensureSelection(page, entityId);

  await openWorkspacePanel(page, {
    subtitle: 'Edicion de materiales y libreria de assets',
    panelLabel: 'Materials',
  });

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
  await openWorkspacePanel(page, {
    subtitle: 'Modelado, paint y materiales sin salir del viewport',
    panelLabel: 'Model',
    readyText: 'Stack presets',
  });
  await ensureSelection(page, entityId);
  const observedBuiltInPresetAlts = [];
  const builtInPreviewModes = {};
  for (const presetAlt of builtInModelerPresetAlts) {
    builtInPreviewModes[presetAlt] = await waitForModelerBuiltInPreset(page, presetAlt);
    observedBuiltInPresetAlts.push(presetAlt);
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
  const unexpectedUnauthorizedResponses = unauthorizedResponses.filter(
    (pathname) =>
      !benignUnauthorizedPathPrefixes.some((prefix) => pathname.startsWith(prefix))
  );
  const unexpectedNotFoundResponses = Array.from(new Set(notFoundResponses));
  const ignoredRequestFailures = requestFailures.filter(
    (failure) =>
      failure.errorText?.includes('ERR_CONNECTION_REFUSED') &&
      failure.url.includes('/_next/webpack-hmr')
  );
  const blockingRequestFailures = requestFailures.filter(
    (failure) => !ignoredRequestFailures.includes(failure)
  );
  const ignoredConsoleErrors =
    blockingRequestFailures.length === 0
      ? consoleErrors.filter(
          (entry) =>
            entry.includes('Failed to load resource: net::ERR_CONNECTION_REFUSED') &&
            ignoredRequestFailures.length > 0
        )
      : [];
  const blockingConsoleErrors = consoleErrors.filter(
    (entry) =>
      !ignoredConsoleErrors.includes(entry) &&
      !entry.includes('status of 401 (Unauthorized)') &&
      !(entry.includes('status of 404 (Not Found)') && unexpectedNotFoundResponses.length === 0)
  );

  await page.screenshot({
    path: path.join(outputDir, 'modeler.png'),
    fullPage: true,
  });

  const report = {
    ok:
      materialIdAfterApply === 'metal' &&
      inspectorPresetImageCount >= materialPresetNames.length &&
      observedBuiltInPresetAlts.length >= builtInModelerPresetAlts.length &&
      customPresetImageCount >= 1 &&
      modifierStackIndicatorCount >= 1 &&
      blockingConsoleErrors.length === 0 &&
      blockingRequestFailures.length === 0 &&
      unexpectedNotFoundResponses.length === 0 &&
      unexpectedUnauthorizedResponses.length === 0,
    materialPresetNames,
    materialIdAfterApply,
    inspectorPresetImageCount,
    builtInModelerPresetAlts,
    observedBuiltInPresetAlts,
    builtInPreviewModes,
    customPresetImageCount,
    modifierStackIndicatorCount,
    serverAuthHintVisible,
    unauthorizedResponses,
    unexpectedUnauthorizedResponses,
    notFoundResponses,
    unexpectedNotFoundResponses,
    ignoredConsoleErrors,
    blockingConsoleErrors,
    ignoredRequestFailures,
    blockingRequestFailures,
    consoleErrors,
    requestFailures,
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
