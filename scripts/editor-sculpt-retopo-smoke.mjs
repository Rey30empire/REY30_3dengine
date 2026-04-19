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
const outputDir = args.get('output-dir') || 'output/editor-sculpt-retopo-smoke';

fs.mkdirSync(outputDir, { recursive: true });

async function waitForBridge(page) {
  await page.waitForSelector('[data-testid="scene-view"]', { timeout: 10000 });
  await page.waitForFunction(() => typeof window.__REY30_VIEWPORT_TEST__ === 'object');
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

async function selectWorkspace(page, label) {
  await page.getByRole('button', { name: label, exact: true }).click();
  await page.waitForTimeout(500);
}

function meshesDiffer(left, right) {
  if (!left || !right) return true;
  if ((left.vertices?.length ?? 0) !== (right.vertices?.length ?? 0)) return true;
  if ((left.faces?.length ?? 0) !== (right.faces?.length ?? 0)) return true;

  const sharedCount = Math.min(left.vertices?.length ?? 0, right.vertices?.length ?? 0);
  for (let index = 0; index < sharedCount; index += 1) {
    const before = left.vertices[index];
    const after = right.vertices[index];
    if (!before || !after) return true;
    if (
      Math.abs(before.x - after.x) > 0.0001 ||
      Math.abs(before.y - after.y) > 0.0001 ||
      Math.abs(before.z - after.z) > 0.0001
    ) {
      return true;
    }
  }

  return false;
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
    consoleErrors.push({
      text: message.text(),
      location: message.location(),
    });
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
  consoleErrors.push({
    text: String(error),
    location: null,
  });
});

try {
  console.log('smoke:start');
  await gotoWithRetries(page, baseUrl);
  await page.waitForTimeout(1500);
  await waitForBridge(page);
  console.log('smoke:bridge-ready');

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
    throw new Error('No se pudo crear entidad para smoke de sculpt/retopo');
  }
  console.log('smoke:entity-ready');

  await selectWorkspace(page, 'Modeling');
  await openPanel(page, 'Paint');
  console.log('smoke:paint-tab');

  await page.evaluate(() => {
    window.__REY30_VIEWPORT_TEST__?.setPaintMode({
      mode: 'sculpt_draw',
      size: 0.55,
      strength: 1,
      sculptDyntopo: true,
      sculptRemeshIterations: 1,
      sculptMultiresLevels: 1,
      sculptVoxelSize: 0.12,
    });
  });
  await page.waitForTimeout(350);
  await page.getByText('Sculpt Draw').waitFor({ state: 'visible', timeout: 10000 });
  await page.getByText('Multires levels').waitFor({ state: 'visible', timeout: 10000 });
  await page.getByText('Voxel size').waitFor({ state: 'visible', timeout: 10000 });
  console.log('smoke:sculpt-ui-ready');

  const editorState = await page.evaluate(
    () => window.__REY30_VIEWPORT_TEST__?.getPaintEditorState() ?? null
  );
  const initialMesh = await page.evaluate(
    () => window.__REY30_VIEWPORT_TEST__?.getSelectedEntityMesh() ?? null
  );
  console.log('smoke:initial-mesh');

  await page.getByRole('button', { name: 'Add detail' }).click();
  await page.waitForTimeout(500);
  const afterMultires = await page.evaluate(
    () => window.__REY30_VIEWPORT_TEST__?.getSelectedEntityMesh() ?? null
  );
  console.log('smoke:after-multires');

  await page.getByRole('button', { name: 'Remesh sculpt' }).click();
  await page.waitForTimeout(600);
  const afterVoxel = await page.evaluate(
    () => window.__REY30_VIEWPORT_TEST__?.getSelectedEntityMesh() ?? null
  );
  console.log('smoke:after-voxel');

  const viewport = page.locator('[data-testid="scene-view"]');

  await page.screenshot({
    path: path.join(outputDir, 'paint-panel.png'),
    fullPage: true,
  });
  await viewport.screenshot({
    path: path.join(outputDir, 'viewport-sculpt.png'),
  });

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
            entry.text.includes('Failed to load resource: net::ERR_CONNECTION_REFUSED') &&
            ignoredRequestFailures.length > 0
        )
      : [];
  const blockingConsoleErrors = consoleErrors.filter(
    (entry) => !ignoredConsoleErrors.includes(entry)
  );

  const report = {
    ok:
      editorState?.mode === 'sculpt_draw' &&
      editorState?.sculptDyntopo === true &&
      editorState?.sculptMultiresLevels === 1 &&
      Math.abs((editorState?.sculptVoxelSize ?? 0) - 0.12) < 0.001 &&
      (afterMultires?.vertices?.length ?? 0) > (initialMesh?.vertices?.length ?? 0) &&
      (afterVoxel?.faces?.length ?? 0) > (initialMesh?.faces?.length ?? 0) &&
      meshesDiffer(afterMultires, afterVoxel) &&
      blockingConsoleErrors.length === 0 &&
      blockingRequestFailures.length === 0,
    editorState,
    initialVertices: initialMesh?.vertices?.length ?? 0,
    initialFaces: initialMesh?.faces?.length ?? 0,
    afterMultiresVertices: afterMultires?.vertices?.length ?? 0,
    afterMultiresFaces: afterMultires?.faces?.length ?? 0,
    afterVoxelVertices: afterVoxel?.vertices?.length ?? 0,
    afterVoxelFaces: afterVoxel?.faces?.length ?? 0,
    meshChangedBetweenOps: meshesDiffer(afterMultires, afterVoxel),
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
    throw new Error(`Smoke de sculpt/retopo falló: ${JSON.stringify(report, null, 2)}`);
  }

  console.log('smoke:ok');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await page.close().catch(() => {});
  await browser.close().catch(() => {});
}
