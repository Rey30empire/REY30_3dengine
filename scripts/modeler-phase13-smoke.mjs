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

const baseUrl = args.get('base-url') || 'http://127.0.0.1:3000';
const outputDir = args.get('output-dir') || 'output/phase13-modeler-smoke';

fs.mkdirSync(outputDir, { recursive: true });

const planeMesh = {
  vertices: [
    { x: -0.75, y: 0, z: -0.75 },
    { x: 0.75, y: 0, z: -0.75 },
    { x: 0.75, y: 0, z: 0.75 },
    { x: -0.75, y: 0, z: 0.75 },
  ],
  faces: [
    [0, 1, 2],
    [0, 2, 3],
  ],
};

function getUvBounds(mesh) {
  const uvs = mesh?.uvs ?? [];
  if (uvs.length === 0) {
    return null;
  }

  return {
    minU: Math.min(...uvs.map((uv) => uv.u)),
    maxU: Math.max(...uvs.map((uv) => uv.u)),
    minV: Math.min(...uvs.map((uv) => uv.v)),
    maxV: Math.max(...uvs.map((uv) => uv.v)),
  };
}

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader'],
});

const page = await browser.newPage({ viewport: { width: 1440, height: 1024 } });
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
  await page.waitForSelector('[data-testid="scene-view"]', { timeout: 10000 });
  await page.waitForFunction(() => typeof window.__REY30_VIEWPORT_TEST__ === 'object');

  await page.getByRole('button', { name: 'Model' }).click();
  await page.waitForTimeout(400);

  const baseEntityId = await page.evaluate(() => {
    const api = window.__REY30_VIEWPORT_TEST__;
    const id = api?.createEntity('cube') ?? null;
    if (id) {
      api?.setSelectMode();
      api?.selectEntity(id, false);
      api?.setSelectedEntityMesh({
        vertices: [
          { x: -0.75, y: 0, z: -0.75 },
          { x: 0.75, y: 0, z: -0.75 },
          { x: 0.75, y: 0, z: 0.75 },
          { x: -0.75, y: 0, z: 0.75 },
        ],
        faces: [
          [0, 1, 2],
          [0, 2, 3],
        ],
      });
      api?.setModelerMode('face');
      api?.setModelerSelection([0]);
    }
    return id;
  });
  if (!baseEntityId) {
    throw new Error('No se pudo crear la entidad base para smoke de fase 13');
  }

  await page.waitForTimeout(500);

  await page.getByRole('spinbutton', { name: 'Normal tol' }).fill('5');
  await page.getByRole('button', { name: 'Select normal' }).click();
  await page.waitForTimeout(250);
  const normalSelection = await page.evaluate(
    () => window.__REY30_VIEWPORT_TEST__?.getModelerSelection()?.selected ?? []
  );

  await page.getByRole('button', { name: 'Project UV' }).click();
  await page.waitForTimeout(250);
  const projectedMesh = await page.evaluate(
    () => window.__REY30_VIEWPORT_TEST__?.getSelectedEntityMesh() ?? null
  );

  await page.getByRole('spinbutton', { name: 'UV offset U' }).fill('0.25');
  await page.getByRole('spinbutton', { name: 'UV offset V' }).fill('-0.15');
  await page.getByRole('button', { name: 'Move UV' }).click();
  await page.waitForTimeout(250);
  const movedMesh = await page.evaluate(
    () => window.__REY30_VIEWPORT_TEST__?.getSelectedEntityMesh() ?? null
  );

  await page.getByRole('spinbutton', { name: 'UV scale U' }).fill('0.5');
  await page.getByRole('spinbutton', { name: 'UV scale V' }).fill('0.5');
  await page.getByRole('button', { name: 'Scale UV' }).click();
  await page.waitForTimeout(250);
  const scaledMesh = await page.evaluate(
    () => window.__REY30_VIEWPORT_TEST__?.getSelectedEntityMesh() ?? null
  );

  await page.getByRole('spinbutton', { name: 'UV rotate' }).fill('90');
  await page.getByRole('button', { name: 'Rotate UV' }).click();
  await page.waitForTimeout(250);
  const rotatedMesh = await page.evaluate(
    () => window.__REY30_VIEWPORT_TEST__?.getSelectedEntityMesh() ?? null
  );

  await page.getByRole('spinbutton', { name: 'UV pad' }).fill('0.05');
  await page.getByRole('button', { name: 'Fit UV' }).click();
  await page.waitForTimeout(250);
  const fittedMesh = await page.evaluate(
    () => window.__REY30_VIEWPORT_TEST__?.getSelectedEntityMesh() ?? null
  );

  await page.getByRole('textbox', { name: 'Material ID' }).fill('metal_blue');
  await page.getByRole('button', { name: 'Apply material' }).click();
  await page.waitForTimeout(300);
  const materialId = await page.evaluate(
    () => window.__REY30_VIEWPORT_TEST__?.getSelectedEntityMaterialId() ?? null
  );

  await page.screenshot({ path: path.join(outputDir, 'uv-material.png'), fullPage: true });
  await page.screenshot({ path: path.join(outputDir, 'fullpage.png'), fullPage: true });

  const projectedBounds = getUvBounds(projectedMesh);
  const movedBounds = getUvBounds(movedMesh);
  const scaledBounds = getUvBounds(scaledMesh);
  const fittedBounds = getUvBounds(fittedMesh);

  const projectedVertex0 = projectedMesh?.uvs?.[0] ?? null;
  const movedVertex0 = movedMesh?.uvs?.[0] ?? null;
  const rotatedVertex0 = rotatedMesh?.uvs?.[0] ?? null;

  const report = {
    ok:
      JSON.stringify(normalSelection) === JSON.stringify([0, 1]) &&
      projectedMesh?.uvs?.length === planeMesh.vertices.length &&
      movedVertex0?.u > projectedVertex0?.u &&
      movedVertex0?.v < projectedVertex0?.v &&
      scaledBounds &&
      projectedBounds &&
      scaledBounds.maxU - scaledBounds.minU < projectedBounds.maxU - projectedBounds.minU &&
      rotatedVertex0 &&
      Math.abs(rotatedVertex0.u - movedVertex0.u) > 0.05 &&
      fittedBounds &&
      Math.abs(fittedBounds.minU - 0.05) < 0.02 &&
      Math.abs(fittedBounds.maxU - 0.95) < 0.02 &&
      Math.abs(fittedBounds.minV - 0.05) < 0.02 &&
      Math.abs(fittedBounds.maxV - 0.95) < 0.02 &&
      materialId === 'metal_blue' &&
      consoleErrors.length === 0,
    normalSelection,
    materialId,
    projectedVertex0,
    movedVertex0,
    rotatedVertex0,
    projectedBounds,
    movedBounds,
    scaledBounds,
    fittedBounds,
    consoleErrors,
  };

  fs.writeFileSync(
    path.join(outputDir, 'report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8'
  );

  if (!report.ok) {
    throw new Error(`Smoke fase 13 falló: ${JSON.stringify(report, null, 2)}`);
  }

  console.log(JSON.stringify(report, null, 2));
} finally {
  await page.close().catch(() => {});
  await browser.close().catch(() => {});
}
