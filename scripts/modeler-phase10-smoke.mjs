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
const outputDir = args.get('output-dir') || 'output/phase10-modeler-smoke';

fs.mkdirSync(outputDir, { recursive: true });

const quadStripMesh = {
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

const multiLoopMesh = {
  vertices: [
    { x: -6, y: 0, z: -1 },
    { x: -4, y: 0, z: -1 },
    { x: -4, y: 0, z: 1 },
    { x: -6, y: 0, z: 1 },
    { x: -2, y: 0, z: -1 },
    { x: 0, y: 0, z: -1 },
    { x: 0, y: 0, z: 1 },
    { x: -2, y: 0, z: 1 },
    { x: 2, y: 0, z: -1 },
    { x: 4, y: 0, z: -1 },
    { x: 4, y: 0, z: 1 },
    { x: 2, y: 0, z: 1 },
    { x: 6, y: 0, z: -1 },
    { x: 8, y: 0, z: -1 },
    { x: 8, y: 0, z: 1 },
    { x: 6, y: 0, z: 1 },
  ],
  faces: [
    [0, 1, 2],
    [0, 2, 3],
    [4, 5, 6],
    [4, 6, 7],
    [8, 9, 10],
    [8, 10, 11],
    [12, 13, 14],
    [12, 14, 15],
  ],
};

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
    throw new Error('No se pudo resolver el viewport para smoke de modeler fase 10');
  }

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
    throw new Error('No se pudo crear la entidad base para smoke de fase 10');
  }

  await page.waitForTimeout(400);

  const topologicalSelection = await page.evaluate((mesh) => {
    const api = window.__REY30_VIEWPORT_TEST__;
    const ok = api?.setSelectedEntityMesh(mesh) ?? false;
    if (!ok) return null;

    api?.setModelerMode('edge');
    const edges = api?.getModelerEdges() ?? [];
    const ringSeed = edges.find((edge) => edge.left === 0 && edge.right === 3)?.index ?? -1;
    const loopSeed = edges.find((edge) => edge.left === 0 && edge.right === 1)?.index ?? -1;

    api?.setModelerSelection([ringSeed]);
    return {
      edges,
      ringSeed,
      loopSeed,
    };
  }, quadStripMesh);
  if (!topologicalSelection) {
    throw new Error('No se pudo inyectar mesh de prueba para loop/ring');
  }

  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Ring select' }).click();
  await page.waitForTimeout(250);
  const ringSelection = await page.evaluate(() => {
    const api = window.__REY30_VIEWPORT_TEST__;
    const edges = api?.getModelerEdges() ?? [];
    const selected = api?.getModelerSelection()?.selected ?? [];
    return selected.map((edgeIndex) => {
      const edge = edges.find((candidate) => candidate.index === edgeIndex);
      return edge ? `${edge.left}:${edge.right}` : null;
    }).filter(Boolean);
  });

  await page.evaluate((loopSeed) => {
    const api = window.__REY30_VIEWPORT_TEST__;
    api?.setModelerSelection([loopSeed]);
  }, topologicalSelection.loopSeed);
  await page.waitForTimeout(150);
  await page.getByRole('button', { name: 'Loop select' }).click();
  await page.waitForTimeout(250);
  const loopSelection = await page.evaluate(() => {
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
    api?.setModelerMode('edge');
    const edges = api?.getModelerEdges() ?? [];
    const selection = edges
      .filter((edge) =>
        !(
          (edge.left === 0 && edge.right === 2) ||
          (edge.left === 4 && edge.right === 6) ||
          (edge.left === 8 && edge.right === 10) ||
          (edge.left === 12 && edge.right === 14)
        )
      )
      .map((edge) => edge.index);
    api?.setModelerSelection(selection);
  }, multiLoopMesh);
  await page.waitForTimeout(400);

  await page.locator('label:has-text("Bridge seg") input').fill('2');
  const beforeBridgeLoops = await page.evaluate(
    () => window.__REY30_VIEWPORT_TEST__?.getModelerStats() ?? null
  );
  await page.getByRole('button', { name: 'Bridge loops' }).click();
  await page.waitForTimeout(350);
  const afterBridgeLoops = await page.evaluate(
    () => window.__REY30_VIEWPORT_TEST__?.getModelerStats() ?? null
  );
  await viewport.screenshot({ path: path.join(outputDir, 'bridge-loops.png') });

  const scaleEntityId = await page.evaluate(() => {
    const api = window.__REY30_VIEWPORT_TEST__;
    const id = api?.createEntity('cube') ?? null;
    if (id) {
      api?.selectEntity(id, false);
      api?.setModelerMode('face');
      api?.setGizmoMode('scale');
    }
    return id;
  });
  if (!scaleEntityId) {
    throw new Error('No se pudo crear la entidad de prueba para clamp de scale');
  }

  await page.waitForTimeout(500);
  const facePoint = await findModelerHelperPoint(page, 'face');
  if (!facePoint) {
    throw new Error('No se pudo localizar helper de cara para prueba de scale');
  }

  await page.mouse.click(viewportBox.x + facePoint.x, viewportBox.y + facePoint.y);
  await page.waitForTimeout(250);

  const scaleSelectionVertex = await page.evaluate(() => {
    const api = window.__REY30_VIEWPORT_TEST__;
    return api?.getModelerSelectionVertexIndices()?.[0] ?? null;
  });
  if (scaleSelectionVertex === null) {
    throw new Error('No se pudo resolver un vértice para la prueba de scale clamp');
  }

  const beforeScaleVertex = await page.evaluate(
    (index) => window.__REY30_VIEWPORT_TEST__?.getModelerVertexPosition(index) ?? null,
    scaleSelectionVertex
  );
  const scaleAxisProbe = await resolveAxisProbe(page, ['y', 'x', 'z']);
  if (!scaleAxisProbe.dragPoint || !scaleAxisProbe.detectedAxis) {
    throw new Error(`No se pudo resolver un eje para scale clamp (axis=${String(scaleAxisProbe.detectedAxis)})`);
  }

  const scaleStartX = viewportBox.x + scaleAxisProbe.dragPoint.x;
  const scaleStartY = viewportBox.y + scaleAxisProbe.dragPoint.y;
  await page.mouse.move(scaleStartX, scaleStartY);
  await page.mouse.down();
  await page.mouse.move(scaleStartX, scaleStartY - 320, { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(350);

  const afterScaleVertex = await page.evaluate(
    (index) => window.__REY30_VIEWPORT_TEST__?.getModelerVertexPosition(index) ?? null,
    scaleSelectionVertex
  );
  await viewport.screenshot({ path: path.join(outputDir, 'scale-clamp.png') });
  await page.screenshot({ path: path.join(outputDir, 'fullpage.png'), fullPage: true });

  const scaleMagnitude = movementMagnitude(beforeScaleVertex, afterScaleVertex);
  const report = {
    ok:
      JSON.stringify(loopSelection) === JSON.stringify(['0:1', '1:2']) &&
      JSON.stringify(ringSelection.slice().sort()) === JSON.stringify(['0:3', '1:4', '2:5']) &&
      afterBridgeLoops?.vertices === 24 &&
      afterBridgeLoops?.faces === 40 &&
      scaleMagnitude > 0.05 &&
      scaleMagnitude < 4.5,
    topologicalSelection: {
      loop: loopSelection,
      ring: ringSelection,
    },
    bridgeLoops: {
      before: beforeBridgeLoops,
      after: afterBridgeLoops,
    },
    scaleClamp: {
      before: beforeScaleVertex,
      after: afterScaleVertex,
      magnitude: scaleMagnitude,
      axis: scaleAxisProbe.detectedAxis,
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
    throw new Error(`Smoke fase 10 falló: ${JSON.stringify(report, null, 2)}`);
  }
} finally {
  await page.close();
  await browser.close();
}
