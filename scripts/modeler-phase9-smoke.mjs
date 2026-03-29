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
const outputDir = args.get('output-dir') || 'output/phase9-modeler-smoke';

fs.mkdirSync(outputDir, { recursive: true });

function movementMagnitude(before, after) {
  if (!before || !after) return 0;
  const dx = after.x - before.x;
  const dy = after.y - before.y;
  const dz = after.z - before.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

async function findModelerHelperPoint(page, type) {
  return page.evaluate((helperType) => {
    const api = window.__REY30_VIEWPORT_TEST__;
    const points = api?.getModelerElementScreenPoints(helperType) ?? [];
    return points[0] ?? null;
  }, type);
}

async function resolveAxisProbe(page, preferredAxes = ['y', 'x', 'z']) {
  return page.evaluate((axes) => {
    const api = window.__REY30_VIEWPORT_TEST__;
    for (const preferredAxis of axes) {
      const baseAxisPoint = api?.getGizmoAxisScreenPoint(preferredAxis) ?? null;
      let dragPoint = baseAxisPoint;
      let detectedAxis = baseAxisPoint ? api?.getGizmoAxisAtScreenPoint(baseAxisPoint) ?? null : null;

      if (baseAxisPoint && detectedAxis !== preferredAxis) {
        const offsets = [-24, -16, -10, -6, 0, 6, 10, 16, 24];
        for (const dx of offsets) {
          for (const dy of offsets) {
            const probe = { x: baseAxisPoint.x + dx, y: baseAxisPoint.y + dy };
            const axis = api?.getGizmoAxisAtScreenPoint(probe) ?? null;
            if (axis === preferredAxis) {
              dragPoint = probe;
              detectedAxis = axis;
              break;
            }
          }
          if (detectedAxis === preferredAxis) break;
        }
      }

      if (dragPoint) {
        return {
          dragPoint,
          detectedAxis: detectedAxis ?? preferredAxis,
        };
      }
    }

    return { dragPoint: null, detectedAxis: null };
  }, preferredAxes);
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

  const viewport = page.locator('[data-testid="scene-view"]');
  const viewportBox = await viewport.boundingBox();
  if (!viewportBox) {
    throw new Error('No se pudo resolver el viewport para smoke de modeler fase 9');
  }

  const cubeId = await page.evaluate(() => {
    const api = window.__REY30_VIEWPORT_TEST__;
    const id = api?.createEntity('cube') ?? null;
    if (id) {
      api?.setSelectMode();
      api?.selectEntity(id, false);
      api?.setModelerMode('face');
      api?.setGizmoMode('translate');
    }
    return id;
  });
  if (!cubeId) {
    throw new Error('No se pudo crear el cubo base para smoke de fase 9');
  }

  await page.waitForTimeout(500);

  const facePoint = await findModelerHelperPoint(page, 'face');
  if (!facePoint) {
    throw new Error('No se pudo localizar un helper de cara');
  }

  await page.mouse.click(viewportBox.x + facePoint.x, viewportBox.y + facePoint.y);
  await page.waitForTimeout(250);

  const selectionAfterFacePick = await page.evaluate(
    () => window.__REY30_VIEWPORT_TEST__?.getModelerSelection() ?? null
  );
  if (!selectionAfterFacePick?.selected?.length) {
    throw new Error('La selección de cara no quedó activa');
  }

  await page.locator('label:has-text("Dup normal") input').fill('0.35');
  const beforeDuplicate = await page.evaluate(
    () => window.__REY30_VIEWPORT_TEST__?.getModelerStats() ?? null
  );
  await page.getByRole('button', { name: 'Duplicate normal' }).click();
  await page.waitForTimeout(250);
  const afterDuplicate = await page.evaluate(
    () => window.__REY30_VIEWPORT_TEST__?.getModelerStats() ?? null
  );

  await page.locator('label:has-text("Knife amt") input').fill('0.75');
  await page.locator('label:has-text("Knife seg") input').fill('3');
  const beforeKnife = await page.evaluate(
    () => window.__REY30_VIEWPORT_TEST__?.getModelerStats() ?? null
  );
  await page.getByRole('button', { name: 'Knife' }).click();
  await page.waitForTimeout(250);
  const afterKnife = await page.evaluate(
    () => window.__REY30_VIEWPORT_TEST__?.getModelerStats() ?? null
  );

  await page.evaluate(() => {
    const api = window.__REY30_VIEWPORT_TEST__;
    api?.setModelerMode('edge');
  });
  await page.waitForTimeout(250);

  const edgePoint = await findModelerHelperPoint(page, 'edge');
  if (!edgePoint) {
    throw new Error('No se pudo localizar un helper de arista');
  }

  await page.mouse.click(viewportBox.x + edgePoint.x, viewportBox.y + edgePoint.y);
  await page.waitForTimeout(250);

  await page.locator('label:has-text("Bevel amt") input').fill('0.22');
  await page.locator('label:has-text("Bevel seg") input').fill('3');
  const beforeBevel = await page.evaluate(
    () => window.__REY30_VIEWPORT_TEST__?.getModelerStats() ?? null
  );
  await page.getByRole('button', { name: 'Bevel' }).click();
  await page.waitForTimeout(250);
  const afterBevel = await page.evaluate(
    () => window.__REY30_VIEWPORT_TEST__?.getModelerStats() ?? null
  );

  await page.evaluate(() => {
    const api = window.__REY30_VIEWPORT_TEST__;
    api?.setModelerMode('face');
    api?.setGizmoMode('scale');
  });
  await page.waitForTimeout(250);

  const scaleFacePoint = await findModelerHelperPoint(page, 'face');
  if (!scaleFacePoint) {
    throw new Error('No se pudo localizar helper de cara para scale');
  }

  await page.mouse.click(viewportBox.x + scaleFacePoint.x, viewportBox.y + scaleFacePoint.y);
  await page.waitForTimeout(250);

  const scaleSelectionVertex = await page.evaluate(() => {
    const api = window.__REY30_VIEWPORT_TEST__;
    return api?.getModelerSelectionVertexIndices()?.[0] ?? null;
  });
  if (scaleSelectionVertex === null) {
    throw new Error('No se pudo resolver un vértice de la selección para scale');
  }

  const beforeScaleVertex = await page.evaluate(
    (index) => window.__REY30_VIEWPORT_TEST__?.getModelerVertexPosition(index) ?? null,
    scaleSelectionVertex
  );
  const scaleAxisProbe = await resolveAxisProbe(page, ['y', 'x', 'z']);
  if (!scaleAxisProbe.dragPoint || !scaleAxisProbe.detectedAxis) {
    throw new Error(`No se pudo resolver un eje para scale (axis=${String(scaleAxisProbe.detectedAxis)})`);
  }

  const scaleStartX = viewportBox.x + scaleAxisProbe.dragPoint.x;
  const scaleStartY = viewportBox.y + scaleAxisProbe.dragPoint.y;
  await page.mouse.move(scaleStartX, scaleStartY);
  await page.mouse.down();
  await page.mouse.move(scaleStartX, scaleStartY - 90, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  const afterScaleVertex = await page.evaluate(
    (index) => window.__REY30_VIEWPORT_TEST__?.getModelerVertexPosition(index) ?? null,
    scaleSelectionVertex
  );

  await page.evaluate(() => {
    const api = window.__REY30_VIEWPORT_TEST__;
    api?.setGizmoMode('rotate');
  });
  await page.waitForTimeout(250);

  const beforeRotateVertex = await page.evaluate(
    (index) => window.__REY30_VIEWPORT_TEST__?.getModelerVertexPosition(index) ?? null,
    scaleSelectionVertex
  );
  const rotateAxisProbe = await resolveAxisProbe(page, ['y', 'x', 'z']);
  if (!rotateAxisProbe.dragPoint || !rotateAxisProbe.detectedAxis) {
    throw new Error(`No se pudo resolver un eje para rotate (axis=${String(rotateAxisProbe.detectedAxis)})`);
  }

  const rotateStartX = viewportBox.x + rotateAxisProbe.dragPoint.x;
  const rotateStartY = viewportBox.y + rotateAxisProbe.dragPoint.y;
  await page.mouse.move(rotateStartX, rotateStartY);
  await page.mouse.down();
  await page.mouse.move(rotateStartX + 110, rotateStartY - 15, { steps: 14 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  const afterRotateVertex = await page.evaluate(
    (index) => window.__REY30_VIEWPORT_TEST__?.getModelerVertexPosition(index) ?? null,
    scaleSelectionVertex
  );

  await viewport.screenshot({ path: path.join(outputDir, 'viewport.png') });
  await page.screenshot({ path: path.join(outputDir, 'fullpage.png'), fullPage: true });

  const report = {
    ok:
      Boolean(afterDuplicate?.faces && beforeDuplicate?.faces && afterDuplicate.faces > beforeDuplicate.faces) &&
      Boolean(afterKnife?.vertices && beforeKnife?.vertices && afterKnife.vertices > beforeKnife.vertices) &&
      Boolean(afterBevel?.vertices && beforeBevel?.vertices && afterBevel.vertices > beforeBevel.vertices) &&
      movementMagnitude(beforeScaleVertex, afterScaleVertex) > 0.02 &&
      movementMagnitude(beforeRotateVertex, afterRotateVertex) > 0.02,
    cubeId,
    selectionAfterFacePick,
    duplicate: {
      before: beforeDuplicate,
      after: afterDuplicate,
    },
    knife: {
      before: beforeKnife,
      after: afterKnife,
    },
    bevel: {
      before: beforeBevel,
      after: afterBevel,
    },
    scale: {
      before: beforeScaleVertex,
      after: afterScaleVertex,
      magnitude: movementMagnitude(beforeScaleVertex, afterScaleVertex),
      axis: scaleAxisProbe.detectedAxis,
    },
    rotate: {
      before: beforeRotateVertex,
      after: afterRotateVertex,
      magnitude: movementMagnitude(beforeRotateVertex, afterRotateVertex),
      axis: rotateAxisProbe.detectedAxis,
    },
    consoleErrors,
  };

  fs.writeFileSync(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
  if (consoleErrors.length > 0) {
    fs.writeFileSync(
      path.join(outputDir, 'console-errors.json'),
      JSON.stringify(consoleErrors, null, 2)
    );
  }

  if (!report.ok) {
    throw new Error(`Smoke fase 9 falló: ${JSON.stringify(report, null, 2)}`);
  }
} finally {
  await page.close();
  await browser.close();
}
