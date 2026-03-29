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
const outputDir = args.get('output-dir') || 'output/phase12-modeler-smoke';

fs.mkdirSync(outputDir, { recursive: true });

const stripMesh = {
  vertices: [
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: 2, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 },
    { x: 1, y: 1, z: 0 },
    { x: 2, y: 1, z: 0 },
  ],
  faces: [
    [0, 1, 4],
    [0, 4, 3],
    [1, 2, 5],
    [1, 5, 4],
  ],
};

const disconnectedPlanes = {
  vertices: [
    { x: -3, y: 0, z: -1 },
    { x: -1, y: 0, z: -1 },
    { x: -1, y: 0, z: 1 },
    { x: -3, y: 0, z: 1 },
    { x: 1, y: 0, z: -1 },
    { x: 3, y: 0, z: -1 },
    { x: 3, y: 0, z: 1 },
    { x: 1, y: 0, z: 1 },
  ],
  faces: [
    [0, 1, 2],
    [0, 2, 3],
    [4, 5, 6],
    [4, 6, 7],
  ],
};

function createGridMesh(size = 4, spacing = 1) {
  const vertices = [];
  const faces = [];

  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      vertices.push({
        x: column * spacing,
        y: row * spacing,
        z: 0,
      });
    }
  }

  const vertexIndex = (column, row) => row * size + column;
  for (let row = 0; row + 1 < size; row += 1) {
    for (let column = 0; column + 1 < size; column += 1) {
      const a = vertexIndex(column, row);
      const b = vertexIndex(column + 1, row);
      const c = vertexIndex(column + 1, row + 1);
      const d = vertexIndex(column, row + 1);
      faces.push([a, b, c], [a, c, d]);
    }
  }

  return { vertices, faces };
}

const gridMesh = createGridMesh();

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader'],
});

const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
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
    }
    return id;
  });
  if (!baseEntityId) {
    throw new Error('No se pudo crear la entidad base para smoke de fase 12');
  }

  await page.waitForTimeout(400);

  await page.evaluate((mesh) => {
    const api = window.__REY30_VIEWPORT_TEST__;
    api?.setSelectedEntityMesh(mesh);
    api?.setModelerMode('vertex');
    api?.setModelerSelection([0, 2]);
  }, stripMesh);
  await page.waitForTimeout(300);

  await page.getByRole('button', { name: 'Path select' }).click();
  await page.waitForTimeout(200);
  const vertexPathSelection = await page.evaluate(
    () => window.__REY30_VIEWPORT_TEST__?.getModelerSelection()?.selected ?? []
  );

  await page.getByRole('button', { name: 'Path', exact: true }).click();
  await page.waitForTimeout(150);
  const beforePathSlideVertex = await page.evaluate(
    () => window.__REY30_VIEWPORT_TEST__?.getModelerVertexPosition(1) ?? null
  );
  await page.getByRole('button', { name: 'Slide +' }).click();
  await page.waitForTimeout(250);
  const afterPathSlideVertex = await page.evaluate(
    () => window.__REY30_VIEWPORT_TEST__?.getModelerVertexPosition(1) ?? null
  );

  await page.evaluate((mesh) => {
    const api = window.__REY30_VIEWPORT_TEST__;
    api?.setSelectedEntityMesh(mesh);
    api?.setModelerMode('edge');
    const edges = api?.getModelerEdges() ?? [];
    const start = edges.find((edge) => edge.left === 0 && edge.right === 1)?.index ?? -1;
    const end = edges.find((edge) => edge.left === 4 && edge.right === 5)?.index ?? -1;
    api?.setModelerSelection(start >= 0 && end >= 0 ? [start, end] : []);
  }, stripMesh);
  await page.waitForTimeout(300);

  await page.getByRole('button', { name: 'Path select' }).click();
  await page.waitForTimeout(200);
  const edgePathSelection = await page.evaluate(() => {
    const api = window.__REY30_VIEWPORT_TEST__;
    const edges = api?.getModelerEdges() ?? [];
    const selected = api?.getModelerSelection()?.selected ?? [];
    return selected.map((edgeIndex) => {
      const edge = edges.find((candidate) => candidate.index === edgeIndex);
      return edge ? `${edge.left}:${edge.right}` : null;
    }).filter(Boolean);
  });

  await page.evaluate((mesh) => {
    const api = window.__REY30_VIEWPORT_TEST__;
    api?.setSelectedEntityMesh(mesh);
    api?.setModelerMode('face');
    api?.setModelerSelection([0]);
  }, disconnectedPlanes);
  await page.waitForTimeout(300);

  await page.getByRole('button', { name: 'Island' }).click();
  await page.waitForTimeout(200);
  const islandSelection = await page.evaluate(
    () => window.__REY30_VIEWPORT_TEST__?.getModelerSelection()?.selected ?? []
  );

  await page.evaluate((mesh) => {
    const api = window.__REY30_VIEWPORT_TEST__;
    api?.setSelectedEntityMesh(mesh);
    api?.setModelerMode('face');
    api?.setModelerSelection([8]);
  }, gridMesh);
  await page.waitForTimeout(300);

  await page.getByRole('spinbutton', { name: 'Region step', exact: true }).fill('1');
  await page.getByRole('button', { name: 'Grow region' }).click();
  await page.waitForTimeout(200);
  const grownSelection = await page.evaluate(
    () => window.__REY30_VIEWPORT_TEST__?.getModelerSelection()?.selected ?? []
  );

  await page.evaluate((faceCount) => {
    const api = window.__REY30_VIEWPORT_TEST__;
    api?.setModelerSelection(Array.from({ length: faceCount }, (_unused, index) => index));
  }, gridMesh.faces.length);
  await page.waitForTimeout(150);
  await page.getByRole('button', { name: 'Shrink region' }).click();
  await page.waitForTimeout(200);
  const shrunkSelection = await page.evaluate(
    () => window.__REY30_VIEWPORT_TEST__?.getModelerSelection()?.selected ?? []
  );

  await page.screenshot({ path: path.join(outputDir, 'fullpage.png'), fullPage: true });

  const report = {
    ok:
      JSON.stringify(vertexPathSelection) === JSON.stringify([0, 1, 2]) &&
      edgePathSelection.length >= 2 &&
      JSON.stringify(islandSelection) === JSON.stringify([0, 1]) &&
      grownSelection.length > 1 &&
      shrunkSelection.length > 0 &&
      shrunkSelection.length < gridMesh.faces.length &&
      afterPathSlideVertex?.x > beforePathSlideVertex?.x &&
      afterPathSlideVertex?.z === beforePathSlideVertex?.z &&
      consoleErrors.length === 0,
    vertexPathSelection,
    pathSlide: {
      before: beforePathSlideVertex,
      after: afterPathSlideVertex,
    },
    edgePathSelection,
    islandSelection,
    grownSelection,
    shrunkSelection,
    consoleErrors,
  };

  fs.writeFileSync(
    path.join(outputDir, 'report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8'
  );

  if (!report.ok) {
    throw new Error(`Smoke fase 12 falló: ${JSON.stringify(report, null, 2)}`);
  }

  console.log(JSON.stringify(report, null, 2));
} finally {
  await page.close().catch(() => {});
  await browser.close().catch(() => {});
}
