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

async function waitForViewportSettled(page, delayMs = 250) {
  await page.getByTestId('scene-view').first().waitFor({ state: 'visible', timeout: 10000 });
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve(true));
        });
      })
  );
  await page.waitForTimeout(delayMs);
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

function getComboboxForLabel(page, label) {
  return page
    .locator('label', { hasText: label })
    .first()
    .locator('xpath=ancestor::div[contains(@class,"space-y-1")][1]')
    .getByRole('combobox')
    .first();
}

async function captureStableScreenshot(page, screenshotPath) {
  await waitForViewportSettled(page);

  try {
    const dataUrl = await page.evaluate(
      () => window.__REY30_VIEWPORT_TEST__?.captureViewportDataUrl?.({ mimeType: 'image/png' }) ?? null
    );
    if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image/png;base64,')) {
      const base64Payload = dataUrl.slice('data:image/png;base64,'.length);
      fs.writeFileSync(screenshotPath, Buffer.from(base64Payload, 'base64'));
      return 'viewport-data-url';
    }
  } catch {
    // Fall back to Playwright capture only if the viewport bridge cannot export a PNG.
  }

  await page.screenshot({
    path: screenshotPath,
    animations: 'disabled',
    caret: 'hide',
    timeout: 20000,
  });
  return 'page-viewport';
}

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader'],
});

const page = await browser.newPage({ viewport: { width: 1560, height: 980 } });
const consoleErrors = [];
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
page.on('pageerror', (error) => {
  consoleErrors.push(String(error));
});

try {
  await gotoWithRetries(page, baseUrl);
  process.stdout.write('world-smoke:goto\n');
  await page.waitForTimeout(1500);
  await waitForBridge(page);
  process.stdout.write('world-smoke:bridge-ready\n');

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
  process.stdout.write('world-smoke:entity-ready\n');

  await ensureSelection(page, entityId);
  await openPanel(page, 'Materials');
  process.stdout.write('world-smoke:materials-open\n');
  await page.getByRole('button', { name: /Material Metal/ }).click();
  await page.waitForTimeout(500);

  const materialIdAfterApply = await page.evaluate(
    () => window.__REY30_VIEWPORT_TEST__?.getSelectedEntityMaterialId() ?? null
  );

  await openPanel(page, 'World');
  await page.getByText('Visual Presets').waitFor({ state: 'visible', timeout: 10000 });
  process.stdout.write('world-smoke:world-open\n');

  const productEnvironment = await applyWorldPreset(page, 'Product');
  const productCaptureMode = await captureStableScreenshot(
    page,
    path.join(outputDir, 'world-product.png')
  );
  process.stdout.write('world-smoke:product-ready\n');

  const cinematicEnvironment = await applyWorldPreset(page, 'Cinematic');
  const cinematicCaptureMode = await captureStableScreenshot(
    page,
    path.join(outputDir, 'world-cinematic.png')
  );
  process.stdout.write('world-smoke:cinematic-ready\n');

  const toneMappingTrigger = getComboboxForLabel(page, 'Tone Mapping');
  await toneMappingTrigger.click();
  await page.getByRole('option', { name: 'Reinhard' }).click();
  await page.waitForTimeout(500);
  process.stdout.write('world-smoke:tone-mapping-ready\n');

  const reinhardEnvironment = await readEnvironment(page);

  const cameraViewTrigger = getComboboxForLabel(page, 'Camera View');
  await cameraViewTrigger.click();
  await page.getByRole('option', { name: 'Orthographic' }).click();
  await page.waitForTimeout(700);
  process.stdout.write('world-smoke:camera-view-ready\n');

  const orthographicCaptureMode = await captureStableScreenshot(
    page,
    path.join(outputDir, 'world-orthographic.png')
  );
  process.stdout.write('world-smoke:orthographic-ready\n');

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
          (message) =>
            message.includes('Failed to load resource: net::ERR_CONNECTION_REFUSED') &&
            ignoredRequestFailures.length > 0
        )
      : [];
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
      blockingConsoleErrors.length === 0 &&
      blockingRequestFailures.length === 0,
    materialIdAfterApply,
    productEnvironment,
    cinematicEnvironment,
    reinhardEnvironment,
    captureModes: {
      product: productCaptureMode,
      cinematic: cinematicCaptureMode,
      orthographic: orthographicCaptureMode,
    },
    ignoredRequestFailures,
    blockingRequestFailures,
    ignoredConsoleErrors,
    blockingConsoleErrors,
    consoleErrors,
    requestFailures,
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
