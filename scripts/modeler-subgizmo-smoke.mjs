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
const outputDir = args.get('output-dir') || 'output/phase8-modeler-smoke';

fs.mkdirSync(outputDir, { recursive: true });

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

function movementMagnitude(before, after) {
  if (!before || !after) return 0;
  const dx = after.x - before.x;
  const dy = after.y - before.y;
  const dz = after.z - before.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.waitForSelector('[data-testid="scene-view"]', { timeout: 10000 });
  await page.waitForFunction(() => typeof window.__REY30_VIEWPORT_TEST__ === 'object');

  const viewport = page.locator('[data-testid="scene-view"]');
  const viewportBox = await viewport.boundingBox();
  if (!viewportBox) {
    throw new Error('No se pudo resolver el viewport para smoke de modeler');
  }

  await page.getByRole('button', { name: 'Model' }).click();
  await page.waitForTimeout(300);

  const cubeId = await page.evaluate(() => {
    const api = window.__REY30_VIEWPORT_TEST__;
    const id = api?.createEntity('cube') ?? null;
    if (id) {
      api?.setSelectMode();
      api?.selectEntity(id, false);
      api?.setGizmoMode('translate');
      api?.setModelerMode('vertex');
    }
    return id;
  });
  if (!cubeId) {
    throw new Error('No se pudo crear la entidad base para smoke del modelador');
  }

  await page.waitForTimeout(500);

  const vertexProbe = await page.evaluate(() => {
    const api = window.__REY30_VIEWPORT_TEST__;
    const points = api?.getModelerElementScreenPoints('vertex') ?? [];
    const point = points.find((entry) => entry.index === 0) ?? points[0] ?? null;
    return {
      point,
      stats: api?.getModelerStats() ?? null,
      vertex: point ? api?.getModelerVertexPosition(point.index) : null,
    };
  });

  if (!vertexProbe.point || !vertexProbe.vertex) {
    throw new Error('No se pudo localizar un helper de vértice para smoke del sub-gizmo');
  }

  await page.mouse.click(
    viewportBox.x + vertexProbe.point.x,
    viewportBox.y + vertexProbe.point.y
  );
  await page.waitForTimeout(250);

  const selectionAfterPick = await page.evaluate(() => window.__REY30_VIEWPORT_TEST__?.getModelerSelection() ?? null);
  if (!selectionAfterPick?.selected?.includes(vertexProbe.point.index)) {
    throw new Error(`La selección de vértice no quedó activa (vertex=${vertexProbe.point.index})`);
  }

  const axisProbe = await page.evaluate(() => {
    const api = window.__REY30_VIEWPORT_TEST__;
    const baseAxisPoint = api?.getGizmoAxisScreenPoint('y') ?? null;
    let dragPoint = baseAxisPoint;
    let detectedAxis = baseAxisPoint ? api?.getGizmoAxisAtScreenPoint(baseAxisPoint) ?? null : null;

    if (baseAxisPoint && detectedAxis !== 'y') {
      const offsets = [-24, -16, -10, -6, 0, 6, 10, 16, 24];
      for (const dx of offsets) {
        for (const dy of offsets) {
          const probe = { x: baseAxisPoint.x + dx, y: baseAxisPoint.y + dy };
          const axis = api?.getGizmoAxisAtScreenPoint(probe) ?? null;
          if (axis === 'y') {
            dragPoint = probe;
            detectedAxis = axis;
            break;
          }
        }
        if (detectedAxis === 'y') break;
      }
    }

    return { dragPoint, detectedAxis };
  });

  if (!axisProbe.dragPoint || axisProbe.detectedAxis !== 'y') {
    throw new Error(`No se pudo resolver el eje Y del gizmo de sub-elemento (axis=${String(axisProbe.detectedAxis)})`);
  }

  const dragStartX = viewportBox.x + axisProbe.dragPoint.x;
  const dragStartY = viewportBox.y + axisProbe.dragPoint.y;
  await page.mouse.move(dragStartX, dragStartY);
  await page.mouse.down();
  await page.mouse.move(dragStartX, dragStartY - 90, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  const afterDrag = await page.evaluate(({ index }) => {
    const api = window.__REY30_VIEWPORT_TEST__;
    return {
      vertex: api?.getModelerVertexPosition(index) ?? null,
      stats: api?.getModelerStats() ?? null,
      selection: api?.getModelerSelection() ?? null,
    };
  }, { index: vertexProbe.point.index });

  await page.evaluate(() => window.__REY30_VIEWPORT_TEST__?.setModelerMode('face'));
  await page.waitForTimeout(250);

  const beforeRip = await page.evaluate(() => window.__REY30_VIEWPORT_TEST__?.getModelerStats() ?? null);
  await page.getByRole('button', { name: 'Rip' }).click();
  await page.waitForTimeout(250);
  const afterRip = await page.evaluate(() => window.__REY30_VIEWPORT_TEST__?.getModelerStats() ?? null);

  const beforeSeparate = await page.evaluate(() => ({
    stats: window.__REY30_VIEWPORT_TEST__?.getModelerStats() ?? null,
    entityCount: window.__REY30_VIEWPORT_TEST__?.getSceneEntityCount() ?? 0,
  }));
  await page.getByRole('button', { name: 'Separate' }).click();
  await page.waitForTimeout(300);
  const afterSeparate = await page.evaluate(() => ({
    stats: window.__REY30_VIEWPORT_TEST__?.getModelerStats() ?? null,
    entityCount: window.__REY30_VIEWPORT_TEST__?.getSceneEntityCount() ?? 0,
  }));

  await page.evaluate(() => window.__REY30_VIEWPORT_TEST__?.setModelerMode('object'));
  await page.waitForTimeout(250);

  const beforeSolidify = await page.evaluate(() => window.__REY30_VIEWPORT_TEST__?.getModelerStats() ?? null);
  await page.getByRole('button', { name: 'Solidify' }).click();
  await page.waitForTimeout(300);
  const afterSolidify = await page.evaluate(() => window.__REY30_VIEWPORT_TEST__?.getModelerStats() ?? null);

  await viewport.screenshot({ path: path.join(outputDir, 'viewport.png') });
  await page.screenshot({ path: path.join(outputDir, 'fullpage.png'), fullPage: true });

  const report = {
    ok:
      movementMagnitude(vertexProbe.vertex, afterDrag.vertex) > 0.05 &&
      Boolean(afterRip?.vertices && beforeRip?.vertices && afterRip.vertices > beforeRip.vertices) &&
      afterSeparate.entityCount === beforeSeparate.entityCount + 1 &&
      Boolean(
        afterSeparate.stats?.faces &&
          beforeSeparate.stats?.faces &&
          afterSeparate.stats.faces === beforeSeparate.stats.faces - 1
      ) &&
      Boolean(
        afterSolidify?.vertices &&
          beforeSolidify?.vertices &&
          afterSolidify.vertices >= beforeSolidify.vertices * 2
      ),
    cubeId,
    selectionAfterPick,
    vertexDrag: {
      before: vertexProbe.vertex,
      after: afterDrag.vertex,
      magnitude: movementMagnitude(vertexProbe.vertex, afterDrag.vertex),
      axis: axisProbe.detectedAxis,
    },
    rip: {
      before: beforeRip,
      after: afterRip,
    },
    separate: {
      before: beforeSeparate,
      after: afterSeparate,
    },
    solidify: {
      before: beforeSolidify,
      after: afterSolidify,
    },
    consoleErrors,
  };

  fs.writeFileSync(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
  if (consoleErrors.length) {
    fs.writeFileSync(
      path.join(outputDir, 'console-errors.json'),
      JSON.stringify(consoleErrors, null, 2)
    );
  }

  if (!report.ok) {
    throw new Error(`Smoke modeler falló: ${JSON.stringify(report, null, 2)}`);
  }
} finally {
  await page.close();
  await browser.close();
}
