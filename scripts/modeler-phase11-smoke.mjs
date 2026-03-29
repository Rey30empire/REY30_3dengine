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
const outputDir = args.get('output-dir') || 'output/phase11-modeler-smoke';

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

const relaxMesh = {
  vertices: [
    { x: 0, y: 0, z: 0 },
    { x: 2, y: 0, z: 0 },
    { x: 2, y: 0, z: 2 },
    { x: 0, y: 0, z: 2 },
    { x: 1.6, y: 0, z: 1 },
  ],
  faces: [
    [0, 1, 4],
    [1, 2, 4],
    [2, 3, 4],
    [3, 0, 4],
  ],
};

function createScrollMesh(columns = 8, rows = 8, spacing = 0.35) {
  const vertices = [];
  const faces = [];
  const originX = -((columns - 1) * spacing) / 2;
  const originZ = -((rows - 1) * spacing) / 2;

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      vertices.push({
        x: originX + column * spacing,
        y: 0,
        z: originZ + row * spacing,
      });
    }
  }

  const vertexIndex = (column, row) => row * columns + column;

  for (let row = 0; row + 1 < rows; row += 1) {
    for (let column = 0; column + 1 < columns; column += 1) {
      const a = vertexIndex(column, row);
      const b = vertexIndex(column + 1, row);
      const c = vertexIndex(column + 1, row + 1);
      const d = vertexIndex(column, row + 1);
      faces.push([a, b, c], [a, c, d]);
    }
  }

  return { vertices, faces };
}

const scrollMesh = createScrollMesh();

function movementMagnitude(before, after) {
  if (!before || !after) return 0;
  const dx = after.x - before.x;
  const dy = after.y - before.y;
  const dz = after.z - before.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

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
    throw new Error('No se pudo crear la entidad base para smoke de fase 11');
  }

  await page.waitForTimeout(400);

  await page.evaluate((mesh) => {
    const api = window.__REY30_VIEWPORT_TEST__;
    api?.setSelectedEntityMesh(mesh);
    api?.setModelerMode('vertex');
    api?.setModelerSelection([1]);
  }, planeMesh);
  await page.waitForTimeout(300);

  await page.getByRole('spinbutton', { name: 'Slide amt', exact: true }).fill('0.5');
  const beforeSlideVertex = await page.evaluate(
    () => window.__REY30_VIEWPORT_TEST__?.getModelerVertexPosition(1) ?? null
  );
  await page.getByRole('button', { name: 'Slide +' }).click();
  await page.waitForTimeout(250);
  const afterSlideVertex = await page.evaluate(
    () => window.__REY30_VIEWPORT_TEST__?.getModelerVertexPosition(1) ?? null
  );

  await page.evaluate((mesh) => {
    const api = window.__REY30_VIEWPORT_TEST__;
    api?.setSelectedEntityMesh(mesh);
    api?.setModelerMode('vertex');
    api?.setModelerSelection([4]);
  }, relaxMesh);
  await page.waitForTimeout(300);

  await page.getByRole('spinbutton', { name: 'Relax', exact: true }).fill('0.5');
  await page.getByRole('spinbutton', { name: 'Relax it', exact: true }).fill('1');
  const beforeRelaxVertex = await page.evaluate(
    () => window.__REY30_VIEWPORT_TEST__?.getModelerVertexPosition(4) ?? null
  );
  await page.getByRole('button', { name: 'Relax' }).click();
  await page.waitForTimeout(250);
  const afterRelaxVertex = await page.evaluate(
    () => window.__REY30_VIEWPORT_TEST__?.getModelerVertexPosition(4) ?? null
  );
  await page.screenshot({ path: path.join(outputDir, 'slide-relax.png'), fullPage: true });

  const collapseSeed = await page.evaluate((mesh) => {
    const api = window.__REY30_VIEWPORT_TEST__;
    api?.setSelectedEntityMesh(mesh);
    api?.setModelerMode('edge');
    const edgeIndex =
      api?.getModelerEdges()?.find((edge) => edge.left === 0 && edge.right === 1)?.index ?? -1;
    api?.setModelerSelection(edgeIndex >= 0 ? [edgeIndex] : []);
    return edgeIndex;
  }, planeMesh);
  if (collapseSeed < 0) {
    throw new Error('No se pudo resolver la arista para Collapse');
  }

  await page.waitForTimeout(300);
  const beforeCollapseStats = await page.evaluate(
    () => window.__REY30_VIEWPORT_TEST__?.getModelerStats() ?? null
  );
  await page.getByRole('button', { name: 'Collapse' }).click();
  await page.waitForTimeout(250);
  const afterCollapseStats = await page.evaluate(
    () => window.__REY30_VIEWPORT_TEST__?.getModelerStats() ?? null
  );

  await page.evaluate((mesh) => {
    const api = window.__REY30_VIEWPORT_TEST__;
    api?.setSelectedEntityMesh(mesh);
    api?.setModelerMode('vertex');
    api?.setModelerSelection([0]);
  }, scrollMesh);
  await page.waitForTimeout(400);

  const scrollArea = page.locator('[data-testid="modeler-scroll-area"]');
  const scrollProgress = page.locator('[data-testid="modeler-scroll-progress"]');
  await scrollArea.hover();
  const beforeScrollProgress = Number(
    (await scrollProgress.getAttribute('data-progress')) ?? '0'
  );
  await page.mouse.wheel(0, 1600);
  await page.waitForTimeout(500);
  const afterScrollProgress = Number(
    (await scrollProgress.getAttribute('data-progress')) ?? '0'
  );
  await scrollArea.screenshot({ path: path.join(outputDir, 'scroll-roll.png') });
  await page.screenshot({ path: path.join(outputDir, 'fullpage.png'), fullPage: true });

  const report = {
    ok:
      movementMagnitude(beforeSlideVertex, afterSlideVertex) > 0.05 &&
      afterRelaxVertex?.x < beforeRelaxVertex?.x &&
      afterCollapseStats?.vertices === 3 &&
      afterCollapseStats?.faces === 1 &&
      afterScrollProgress > beforeScrollProgress + 10 &&
      consoleErrors.length === 0,
    slide: {
      before: beforeSlideVertex,
      after: afterSlideVertex,
      magnitude: movementMagnitude(beforeSlideVertex, afterSlideVertex),
    },
    relax: {
      before: beforeRelaxVertex,
      after: afterRelaxVertex,
      magnitude: movementMagnitude(beforeRelaxVertex, afterRelaxVertex),
    },
    collapse: {
      before: beforeCollapseStats,
      after: afterCollapseStats,
    },
    scrollRoll: {
      beforeProgress: beforeScrollProgress,
      afterProgress: afterScrollProgress,
    },
    consoleErrors,
  };

  fs.writeFileSync(
    path.join(outputDir, 'report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8'
  );

  if (!report.ok) {
    throw new Error(`Smoke fase 11 falló: ${JSON.stringify(report, null, 2)}`);
  }

  console.log(JSON.stringify(report, null, 2));
} finally {
  await page.close().catch(() => {});
  await browser.close().catch(() => {});
}
