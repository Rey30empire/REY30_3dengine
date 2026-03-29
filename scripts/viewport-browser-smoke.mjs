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
  if (!viewportBox) throw new Error('No se pudo resolver el viewport');

  const cubeId = await page.evaluate(() => window.__REY30_VIEWPORT_TEST__?.createEntity('cube') ?? null);
  const sphereId = await page.evaluate(() => window.__REY30_VIEWPORT_TEST__?.createEntity('sphere') ?? null);
  if (!cubeId || !sphereId) throw new Error('No se pudieron crear entidades de smoke');

  await page.evaluate(({ cubeId, sphereId }) => {
    window.__REY30_VIEWPORT_TEST__?.setEntityPosition(cubeId, { x: -2, y: 0.6, z: 0 });
    window.__REY30_VIEWPORT_TEST__?.setEntityPosition(sphereId, { x: 2, y: 0.6, z: 0 });
    window.__REY30_VIEWPORT_TEST__?.setSelectMode();
  }, { cubeId, sphereId });
  await page.waitForTimeout(400);

  const projections = await page.evaluate(({ cubeId, sphereId }) => ({
    cubePoint: window.__REY30_VIEWPORT_TEST__?.getEntityScreenPoint(cubeId) ?? null,
    spherePoint: window.__REY30_VIEWPORT_TEST__?.getEntityScreenPoint(sphereId) ?? null,
    cubeBounds: window.__REY30_VIEWPORT_TEST__?.getEntityScreenBounds(cubeId) ?? null,
    sphereBounds: window.__REY30_VIEWPORT_TEST__?.getEntityScreenBounds(sphereId) ?? null,
  }), { cubeId, sphereId });
  if (!projections.cubePoint || !projections.spherePoint) throw new Error('No se pudieron proyectar entidades');
  if (!projections.cubeBounds || !projections.sphereBounds) throw new Error('No se pudieron proyectar bounds de entidades');

  const startX = viewportBox.x + Math.min(projections.cubeBounds.minX, projections.sphereBounds.minX) - 24;
  const startY = viewportBox.y + Math.min(projections.cubeBounds.minY, projections.sphereBounds.minY) - 24;
  const endX = viewportBox.x + Math.max(projections.cubeBounds.maxX, projections.sphereBounds.maxX) + 24;
  const endY = viewportBox.y + Math.max(projections.cubeBounds.maxY, projections.sphereBounds.maxY) + 24;

  await page.keyboard.down('Shift');
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 12 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await page.waitForTimeout(250);

  const selectedIds = await page.evaluate(() => window.__REY30_VIEWPORT_TEST__?.getSelectedEntityIds() ?? []);
  await viewport.screenshot({ path: path.join(outputDir, 'selection.png') });

  await page.evaluate(() => {
    window.__REY30_VIEWPORT_TEST__?.setPaintMode({ color: '#00ff88', size: 1.4, strength: 1 });
  });
  await page.waitForTimeout(250);

  const cubePoint = projections.cubePoint;

  await page.mouse.move(viewportBox.x + cubePoint.x - 16, viewportBox.y + cubePoint.y - 8);
  await page.mouse.down();
  await page.mouse.move(viewportBox.x + cubePoint.x + 18, viewportBox.y + cubePoint.y + 10, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(250);

  const paintInfo = await page.evaluate(({ cubeId }) => window.__REY30_VIEWPORT_TEST__?.getEntityPaintInfo(cubeId) ?? null, { cubeId });
  await viewport.screenshot({ path: path.join(outputDir, 'paint.png') });

  const report = {
    ok: Array.isArray(selectedIds) && selectedIds.length >= 2 && Boolean(paintInfo?.paintedVertices > 0),
    selectedIds,
    paintInfo,
    consoleErrors,
  };
  fs.writeFileSync(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
  if (consoleErrors.length) {
    fs.writeFileSync(path.join(outputDir, 'console-errors.json'), JSON.stringify(consoleErrors, null, 2));
  }

  if (!Array.isArray(selectedIds) || selectedIds.length < 2) {
    throw new Error(`Smoke viewport falló: box drag seleccionó ${selectedIds.length} entidad(es)`);
  }
  if (!paintInfo || paintInfo.paintedVertices <= 0) {
    throw new Error('Smoke viewport falló: paint no dejó vértices coloreados');
  }
} finally {
  await page.close();
  await browser.close();
}
