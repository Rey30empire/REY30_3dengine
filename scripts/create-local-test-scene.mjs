import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const OUTPUT_ROOT = path.resolve(process.cwd(), 'output_Rey30');
const SCENES_DIR = path.join(OUTPUT_ROOT, 'scenes');
const MESH_DIR = path.join(OUTPUT_ROOT, 'assets', 'mesh');
const REPORT_DIR = path.resolve(process.cwd(), 'output', 'create-scene-smoke');

function nowIso() {
  return new Date().toISOString();
}

function component(type, data) {
  return {
    id: randomUUID(),
    type,
    enabled: true,
    data,
  };
}

function transform(position, scale = { x: 1, y: 1, z: 1 }, rotation = { x: 0, y: 0, z: 0, w: 1 }) {
  return component('Transform', { position, rotation, scale });
}

function meshRenderer(meshId, materialId) {
  return component('MeshRenderer', {
    meshId,
    materialId,
    castShadows: true,
    receiveShadows: true,
  });
}

function entity(name, components, tags = []) {
  return {
    id: randomUUID(),
    name,
    parentId: null,
    active: true,
    tags,
    components,
    children: [],
  };
}

async function writeSmokeMesh() {
  const mesh = {
    id: 'rey30_smoke_cube_mesh',
    kind: 'procedural_mesh',
    vertices: [
      { x: -0.5, y: -0.5, z: -0.5 },
      { x: 0.5, y: -0.5, z: -0.5 },
      { x: 0.5, y: 0.5, z: -0.5 },
      { x: -0.5, y: 0.5, z: -0.5 },
      { x: -0.5, y: -0.5, z: 0.5 },
      { x: 0.5, y: -0.5, z: 0.5 },
      { x: 0.5, y: 0.5, z: 0.5 },
      { x: -0.5, y: 0.5, z: 0.5 },
    ],
    faces: [
      [0, 1, 2],
      [0, 2, 3],
      [4, 6, 5],
      [4, 7, 6],
      [4, 5, 1],
      [4, 1, 0],
      [3, 2, 6],
      [3, 6, 7],
      [1, 5, 6],
      [1, 6, 2],
      [4, 0, 3],
      [4, 3, 7],
    ],
    metadata: {
      generatedBy: 'scripts/create-local-test-scene.mjs',
      purpose: 'local scene smoke test',
    },
  };

  const filePath = path.join(MESH_DIR, 'rey30_smoke_cube_mesh.json');
  await writeFile(filePath, `${JSON.stringify(mesh, null, 2)}\n`, 'utf8');
  return {
    id: mesh.id,
    path: path.relative(process.cwd(), filePath).replace(/\\/g, '/'),
  };
}

async function main() {
  await mkdir(SCENES_DIR, { recursive: true });
  await mkdir(MESH_DIR, { recursive: true });
  await mkdir(REPORT_DIR, { recursive: true });

  const createdAt = nowIso();
  const mesh = await writeSmokeMesh();
  const sceneId = randomUUID();
  const sceneName = 'REY30 Local Smoke Scene';

  const entities = [
    entity(
      'SmokeTestGround',
      [
        transform({ x: 0, y: -0.08, z: 0 }, { x: 10, y: 0.16, z: 10 }),
        meshRenderer(mesh.id, 'mat_ground_obsidian'),
      ],
      ['ground', 'smoke-test']
    ),
    entity(
      'SmokeTestHeroBlock',
      [
        transform({ x: 0, y: 1.0, z: 0 }, { x: 0.9, y: 1.8, z: 0.7 }),
        meshRenderer(mesh.id, 'mat_hero_cyan'),
        component('Health', { maxHealth: 100, currentHealth: 100, team: 'player' }),
      ],
      ['player', 'smoke-test']
    ),
    entity(
      'SmokeTestNeonPillarA',
      [
        transform({ x: -2.25, y: 0.85, z: -1.8 }, { x: 0.28, y: 1.7, z: 0.28 }),
        meshRenderer(mesh.id, 'mat_neon_blue'),
      ],
      ['prop', 'smoke-test']
    ),
    entity(
      'SmokeTestNeonPillarB',
      [
        transform({ x: 2.25, y: 0.85, z: -1.8 }, { x: 0.28, y: 1.7, z: 0.28 }),
        meshRenderer(mesh.id, 'mat_neon_orange'),
      ],
      ['prop', 'smoke-test']
    ),
    entity(
      'SmokeTestCamera',
      [
        transform({ x: 0, y: 3.5, z: 6.5 }),
        component('Camera', {
          fov: 55,
          near: 0.1,
          far: 500,
          orthographic: false,
          clearColor: { r: 0.03, g: 0.05, b: 0.08, a: 1 },
          isMain: true,
        }),
      ],
      ['camera', 'smoke-test']
    ),
    entity(
      'SmokeTestKeyLight',
      [
        transform({ x: 3.5, y: 6, z: 4 }),
        component('Light', {
          type: 'directional',
          color: { r: 1, g: 0.96, b: 0.88 },
          intensity: 1.35,
          shadows: true,
        }),
      ],
      ['light', 'smoke-test']
    ),
  ];

  const scene = {
    id: sceneId,
    name: sceneName,
    entities,
    rootEntities: entities.map((entry) => entry.id),
    environment: {
      skybox: null,
      ambientColor: { r: 0.06, g: 0.09, b: 0.14 },
      fog: {
        enabled: true,
        color: { r: 0.04, g: 0.07, b: 0.12 },
        density: 0.012,
      },
    },
    createdAt,
    updatedAt: createdAt,
    metadata: {
      generatedBy: 'smoke:create-scene',
      meshPath: mesh.path,
    },
  };

  const scenePath = path.join(SCENES_DIR, 'rey30_local_smoke_scene.scene.json');
  await writeFile(scenePath, `${JSON.stringify(scene, null, 2)}\n`, 'utf8');

  const parsed = JSON.parse(await readFile(scenePath, 'utf8'));
  const componentCount = parsed.entities.reduce(
    (total, entry) => total + (Array.isArray(entry.components) ? entry.components.length : 0),
    0
  );
  const ok =
    parsed.name === sceneName &&
    parsed.entities.length === 6 &&
    parsed.rootEntities.length === 6 &&
    componentCount >= 12;

  const report = {
    ok,
    sceneName,
    sceneId,
    entityCount: parsed.entities.length,
    componentCount,
    scenePath: path.relative(process.cwd(), scenePath).replace(/\\/g, '/'),
    meshPath: mesh.path,
    createdAt,
  };
  const reportPath = path.join(REPORT_DIR, 'report.json');
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  if (!ok) {
    throw new Error('La escena de prueba no paso la validacion local.');
  }

  process.stdout.write(`scene-smoke-ok ${JSON.stringify(report)}\n`);
}

main().catch((error) => {
  process.stderr.write(`create-local-test-scene failed: ${String(error?.message || error)}\n`);
  process.exit(1);
});
