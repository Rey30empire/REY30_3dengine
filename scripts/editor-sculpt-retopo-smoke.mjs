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
page.on('console', (message) => {
  if (message.type() === 'error') {
    consoleErrors.push(message.text());
  }
});
page.on('pageerror', (error) => {
  consoleErrors.push(String(error));
});

try {
  console.log('smoke:start');
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.waitForSelector('[data-testid="scene-view"]', { timeout: 10000 });
  await page.waitForFunction(() => typeof window.__REY30_VIEWPORT_TEST__ === 'object');
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

  await page.getByRole('button', { name: 'Paint' }).click();
  await page.waitForTimeout(500);
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
  await page.getByText('Sculpt pipeline').waitFor({ state: 'visible', timeout: 10000 });
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

  const report = {
    ok:
      editorState?.mode === 'sculpt_draw' &&
      editorState?.sculptDyntopo === true &&
      editorState?.sculptMultiresLevels === 1 &&
      Math.abs((editorState?.sculptVoxelSize ?? 0) - 0.12) < 0.001 &&
      (afterMultires?.vertices?.length ?? 0) > (initialMesh?.vertices?.length ?? 0) &&
      (afterVoxel?.faces?.length ?? 0) > (initialMesh?.faces?.length ?? 0) &&
      meshesDiffer(afterMultires, afterVoxel) &&
      consoleErrors.length === 0,
    editorState,
    initialVertices: initialMesh?.vertices?.length ?? 0,
    initialFaces: initialMesh?.faces?.length ?? 0,
    afterMultiresVertices: afterMultires?.vertices?.length ?? 0,
    afterMultiresFaces: afterMultires?.faces?.length ?? 0,
    afterVoxelVertices: afterVoxel?.vertices?.length ?? 0,
    afterVoxelFaces: afterVoxel?.faces?.length ?? 0,
    meshChangedBetweenOps: meshesDiffer(afterMultires, afterVoxel),
    consoleErrors,
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
