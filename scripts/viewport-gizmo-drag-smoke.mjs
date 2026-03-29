import fs from 'node:fs';
import path from 'node:path';
import { chromium } from './playwright-runtime.mjs';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const key = process.argv[i];
  const value = process.argv[i + 1];
  if (key.startsWith('--') && value) {
    args.set(key.slice(2), value);
    i += 1;
  }
}

const baseUrl = args.get('base-url') || 'http://127.0.0.1:3000';
const outputDir = args.get('output-dir') || 'output/viewport-smoke';

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

try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  await page.waitForSelector('[data-testid="scene-view"]', { timeout: 10000 });
  await page.waitForFunction(() => typeof window.__REY30_VIEWPORT_TEST__ === 'object');

  const viewport = page.locator('[data-testid="scene-view"]');
  const viewportBox = await viewport.boundingBox();
  if (!viewportBox) {
    throw new Error('No se pudo resolver el viewport');
  }

  const cubeId = await page.evaluate(() => window.__REY30_VIEWPORT_TEST__?.createEntity('cube') ?? null);
  if (!cubeId) {
    throw new Error('No se pudo crear entidad para smoke de gizmo');
  }

  await page.evaluate(({ cubeId }) => {
    window.__REY30_VIEWPORT_TEST__?.setSelectMode();
    window.__REY30_VIEWPORT_TEST__?.setEntityPosition(cubeId, { x: 0, y: 0.6, z: 0 });
    window.__REY30_VIEWPORT_TEST__?.selectEntity(cubeId, false);
    window.__REY30_VIEWPORT_TEST__?.setGizmoMode('translate');
  }, { cubeId });

  await page.waitForTimeout(400);

  const before = await page.evaluate(({ cubeId }) => {
    const api = window.__REY30_VIEWPORT_TEST__;
    const baseAxisPoint = api?.getGizmoAxisScreenPoint('y') ?? null;

    let dragPoint = baseAxisPoint;
    let detectedAxis = baseAxisPoint ? api?.getGizmoAxisAtScreenPoint(baseAxisPoint) ?? null : null;

    if (baseAxisPoint && detectedAxis !== 'y') {
      const offsets = [-24, -16, -10, -6, 0, 6, 10, 16, 24];
      for (const dx of offsets) {
        for (const dy of offsets) {
          const probe = { x: baseAxisPoint.x + dx, y: baseAxisPoint.y + dy };
          const probeAxis = api?.getGizmoAxisAtScreenPoint(probe) ?? null;
          if (probeAxis === 'y') {
            dragPoint = probe;
            detectedAxis = probeAxis;
            break;
          }
        }
        if (detectedAxis === 'y') break;
      }
    }

    return {
      transform: api?.getEntityTransform(cubeId) ?? null,
      axisPoint: dragPoint,
      detectedAxis,
    };
  }, { cubeId });

  if (!before.transform || !before.axisPoint) {
    throw new Error('No se pudo preparar el estado inicial del gizmo');
  }

  const dragStartX = viewportBox.x + before.axisPoint.x;
  const dragStartY = viewportBox.y + before.axisPoint.y;
  const dragEndX = dragStartX;
  const dragEndY = dragStartY - 90;

  await page.mouse.move(dragStartX, dragStartY);
  await page.mouse.down();
  await page.mouse.move(dragEndX, dragEndY, { steps: 14 });
  await page.mouse.up();

  await page.waitForTimeout(250);

  const after = await page.evaluate(({ cubeId }) => ({
    transform: window.__REY30_VIEWPORT_TEST__?.getEntityTransform(cubeId) ?? null,
    selected: window.__REY30_VIEWPORT_TEST__?.getSelectedEntityIds() ?? [],
  }), { cubeId });

  await viewport.screenshot({ path: path.join(outputDir, 'gizmo-drag.png') });

  const beforePosition = before.transform.position;
  const afterPosition = after.transform?.position;
  const delta = afterPosition
    ? {
        x: afterPosition.x - beforePosition.x,
        y: afterPosition.y - beforePosition.y,
        z: afterPosition.z - beforePosition.z,
      }
    : { x: 0, y: 0, z: 0 };

  const movementMagnitude = Math.sqrt(delta.x * delta.x + delta.y * delta.y + delta.z * delta.z);

  const report = {
    ok: Boolean(after.transform) && movementMagnitude > 0.05,
    cubeId,
    before: before.transform,
    after: after.transform,
    selectedIds: after.selected,
    axisPoint: before.axisPoint,
    detectedAxis: before.detectedAxis,
    delta,
    movementMagnitude,
    consoleErrors,
  };

  fs.writeFileSync(path.join(outputDir, 'gizmo-drag-report.json'), JSON.stringify(report, null, 2));
  if (consoleErrors.length) {
    fs.writeFileSync(path.join(outputDir, 'gizmo-drag-console-errors.json'), JSON.stringify(consoleErrors, null, 2));
  }

  if (!after.transform) {
    throw new Error('Smoke gizmo drag falló: no se pudo leer transform final');
  }
  if (movementMagnitude <= 0.05) {
    throw new Error(`Smoke gizmo drag falló: movimiento insuficiente (${movementMagnitude.toFixed(4)})`);
  }
  if (before.detectedAxis !== 'y') {
    throw new Error(`Smoke gizmo drag falló: no se detectó eje Y en el punto de drag (axis=${String(before.detectedAxis)})`);
  }
} finally {
  await page.close();
  await browser.close();
}
