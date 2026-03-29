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
const outputDir = args.get('output-dir') || 'output/phase14-modeler-smoke';

fs.mkdirSync(outputDir, { recursive: true });

const stripMesh = {
  vertices: [
    { x: -1.5, y: 0, z: -0.8 },
    { x: 0, y: 0, z: -0.8 },
    { x: 1.5, y: 0, z: -0.8 },
    { x: -1.5, y: 0, z: 0.8 },
    { x: 0, y: 0, z: 0.8 },
    { x: 1.5, y: 0, z: 0.8 },
  ],
  faces: [
    [0, 1, 4],
    [0, 4, 3],
    [1, 2, 5],
    [1, 5, 4],
  ],
};

function getUvBounds(mesh, faceIndices) {
  const vertexIndices = Array.from(
    new Set(faceIndices.flatMap((faceIndex) => mesh?.faces?.[faceIndex] ?? []))
  );
  const uvs = vertexIndices
    .map((vertexIndex) => mesh?.uvs?.[vertexIndex] ?? null)
    .filter(Boolean);
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

  const baseEntityId = await page.evaluate((mesh) => {
    const api = window.__REY30_VIEWPORT_TEST__;
    const id = api?.createEntity('cube') ?? null;
    if (id) {
      api?.setSelectMode();
      api?.selectEntity(id, false);
      api?.setSelectedEntityMesh(mesh);
      api?.setModelerMode('edge');
      const edges = api?.getModelerEdges() ?? [];
      const seamEdgeIndex =
        edges.find((edge) => edge.left === 1 && edge.right === 4)?.index ?? -1;
      api?.setModelerSelection(seamEdgeIndex >= 0 ? [seamEdgeIndex] : []);
    }
    return id;
  }, stripMesh);
  if (!baseEntityId) {
    throw new Error('No se pudo crear la entidad base para smoke de fase 14');
  }

  await page.waitForTimeout(400);

  await page.getByRole('button', { name: 'Mark seam' }).click();
  await page.waitForTimeout(250);
  const markedMesh = await page.evaluate(
    () => window.__REY30_VIEWPORT_TEST__?.getSelectedEntityMesh() ?? null
  );

  await page.evaluate(() => {
    const api = window.__REY30_VIEWPORT_TEST__;
    api?.setModelerMode('face');
    api?.setModelerSelection([0]);
  });
  await page.waitForTimeout(250);

  await page.getByRole('button', { name: 'UV island' }).click();
  await page.waitForTimeout(250);
  const uvIslandSelection = await page.evaluate(
    () => window.__REY30_VIEWPORT_TEST__?.getModelerSelection()?.selected ?? []
  );

  await page.getByRole('button', { name: 'Pack islands' }).click();
  await page.waitForTimeout(300);
  const packedMesh = await page.evaluate(
    () => window.__REY30_VIEWPORT_TEST__?.getSelectedEntityMesh() ?? null
  );

  await page.getByRole('spinbutton', { name: 'Checker scale' }).fill('12');
  await page.getByRole('button', { name: 'Checker on' }).click();
  await page.waitForTimeout(300);
  const previewState = await page.evaluate(
    () => window.__REY30_VIEWPORT_TEST__?.getSelectedEntityPreviewState() ?? null
  );

  await page.screenshot({ path: path.join(outputDir, 'checker-islands.png'), fullPage: true });
  await page.screenshot({ path: path.join(outputDir, 'fullpage.png'), fullPage: true });

  const leftBounds = getUvBounds(packedMesh, [0, 1]);
  const rightBounds = getUvBounds(packedMesh, [2, 3]);

  const report = {
    ok:
      (markedMesh?.seamEdges?.length ?? 0) >= 1 &&
      JSON.stringify(uvIslandSelection) === JSON.stringify([0, 1]) &&
      (packedMesh?.vertices?.length ?? 0) > stripMesh.vertices.length &&
      (packedMesh?.seamEdges?.length ?? 0) >= 2 &&
      leftBounds &&
      rightBounds &&
      leftBounds.maxU < rightBounds.minU &&
      previewState?.checkerPreview === true &&
      previewState?.checkerScale === 12 &&
      consoleErrors.length === 0,
    seamCountAfterMark: markedMesh?.seamEdges?.length ?? 0,
    uvIslandSelection,
    packedVertices: packedMesh?.vertices?.length ?? 0,
    packedSeamCount: packedMesh?.seamEdges?.length ?? 0,
    leftBounds,
    rightBounds,
    previewState,
    consoleErrors,
  };

  fs.writeFileSync(
    path.join(outputDir, 'report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8'
  );

  if (!report.ok) {
    throw new Error(`Smoke fase 14 falló: ${JSON.stringify(report, null, 2)}`);
  }

  console.log(JSON.stringify(report, null, 2));
} finally {
  await page.close().catch(() => {});
  await browser.close().catch(() => {});
}
