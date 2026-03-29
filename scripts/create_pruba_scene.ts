import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { useEngineStore } from '../src/store/editorStore';
import { EntityFactory } from '../src/engine/core/ECS';
import type { Component, Entity, Asset } from '../src/types/engine';

const OUTPUT_ROOT = path.resolve(process.cwd(), 'output_Rey30');
const SCENES_DIR = path.join(OUTPUT_ROOT, 'scenes');
const ASSET_MESH_DIR = path.join(OUTPUT_ROOT, 'assets', 'mesh');

function makeTransform(position: { x: number; y: number; z: number }, scale: { x: number; y: number; z: number }) {
  return {
    id: uuidv4(),
    type: 'Transform',
    enabled: true,
    data: {
      position,
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale,
    },
  } satisfies Component;
}

function makeMeshRenderer(meshId: string): Component {
  return {
    id: uuidv4(),
    type: 'MeshRenderer',
    enabled: true,
    data: {
      meshId,
      materialId: null,
      castShadows: true,
      receiveShadows: true,
    },
  } satisfies Component;
}

function makeCamera(): Component {
  return {
    id: uuidv4(),
    type: 'Camera',
    enabled: true,
    data: {
      fov: 60,
      near: 0.1,
      far: 1000,
      orthographic: false,
      clearColor: { r: 0.08, g: 0.08, b: 0.1, a: 1 },
      isMain: true,
    },
  } satisfies Component;
}

function makeLight(): Component {
  return {
    id: uuidv4(),
    type: 'Light',
    enabled: true,
    data: {
      type: 'directional',
      color: { r: 1, g: 1, b: 1 },
      intensity: 1.1,
      shadows: true,
    },
  } satisfies Component;
}

function makePlayerController(): Component {
  return {
    id: uuidv4(),
    type: 'PlayerController',
    enabled: true,
    data: {
      speed: 3,
      jumpForce: 6,
      sensitivity: 1.5,
      canDoubleJump: false,
    },
  } satisfies Component;
}

function makeAnimator(): Component {
  return {
    id: uuidv4(),
    type: 'Animator',
    enabled: true,
    data: {
      controllerId: null,
      currentAnimation: 'Walk',
      parameters: { speed: 1 },
    },
  } satisfies Component;
}

function makeScript(scriptId: string): Component {
  return {
    id: uuidv4(),
    type: 'Script',
    enabled: true,
    data: {
      scriptId,
      parameters: {},
      enabled: true,
    },
  } satisfies Component;
}

function makeHealth(): Component {
  return {
    id: uuidv4(),
    type: 'Health',
    enabled: true,
    data: {
      maxHealth: 100,
      currentHealth: 100,
      invulnerable: false,
      team: 'player',
    },
  } satisfies Component;
}

function attachEntityToScene(sceneId: string, entity: Entity) {
  const store = useEngineStore.getState();
  store.addEntity(entity);
  useEngineStore.setState((state) => ({
    scenes: state.scenes.map((scene) =>
      scene.id === sceneId
        ? {
            ...scene,
            entities: [...scene.entities, entity],
            rootEntities: [...scene.rootEntities, entity.id],
            updatedAt: new Date(),
          }
        : scene
    ),
    isDirty: true,
  }));
}

function serializeEntity(entity: Entity): Record<string, unknown> {
  return {
    id: entity.id,
    name: entity.name,
    parentId: entity.parentId,
    active: entity.active,
    tags: entity.tags,
    components: Array.from(entity.components.values()).map((component) => ({
      id: component.id,
      type: component.type,
      enabled: component.enabled,
      data: component.data,
    })),
    children: entity.children?.map(serializeEntity) || [],
  };
}

async function ensureDirs() {
  await fs.mkdir(SCENES_DIR, { recursive: true });
  await fs.mkdir(ASSET_MESH_DIR, { recursive: true });
}

async function writeCubeMesh(): Promise<{ path: string; size: number } > {
  const mesh = {
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
      [0, 1, 2], [0, 2, 3],
      [4, 6, 5], [4, 7, 6],
      [4, 5, 1], [4, 1, 0],
      [3, 2, 6], [3, 6, 7],
      [1, 5, 6], [1, 6, 2],
      [4, 0, 3], [4, 3, 7],
    ],
    uvs: [
      { u: 0, v: 0 },
      { u: 1, v: 0 },
      { u: 1, v: 1 },
      { u: 0, v: 1 },
      { u: 0, v: 0 },
      { u: 1, v: 0 },
      { u: 1, v: 1 },
      { u: 0, v: 1 },
    ],
    metadata: {
      style: 'roblox-blocky',
      note: 'Procedural cube mesh for blocky characters and props.',
    },
  };

  const targetPath = path.join(ASSET_MESH_DIR, 'roblox_cube.json');
  const content = JSON.stringify(mesh, null, 2);
  await fs.writeFile(targetPath, content, 'utf-8');
  return { path: targetPath, size: Buffer.byteLength(content) };
}

async function main() {
  await ensureDirs();

  const store = useEngineStore.getState();
  store.setProjectName('pruba lk');
  useEngineStore.setState({ projectPath: OUTPUT_ROOT, isDirty: true });

  const scene = store.createScene('pruba lk');

  const meshFile = await writeCubeMesh();
  const meshAssetId = uuidv4();
  const meshAsset: Asset = {
    id: meshAssetId,
    name: 'roblox_cube',
    type: 'mesh',
    path: path.relative(process.cwd(), meshFile.path).replace(/\\/g, '/'),
    size: meshFile.size,
    createdAt: new Date(),
    metadata: {
      style: 'roblox',
      format: 'json',
    },
  };
  store.addAsset(meshAsset);

  const scriptAsset: Asset = {
    id: uuidv4(),
    name: 'RobloxWalker.ts',
    type: 'script',
    path: 'scripts/RobloxWalker.ts',
    size: 0,
    createdAt: new Date(),
    metadata: {
      purpose: 'simple-walk-loop',
    },
  };
  store.addAsset(scriptAsset);

  // Ground
  const ground = EntityFactory.create('Ground');
  ground.components.set('Transform', makeTransform({ x: 0, y: -0.1, z: 0 }, { x: 12, y: 0.2, z: 12 }));
  ground.components.set('MeshRenderer', makeMeshRenderer(meshAssetId));
  ground.tags.push('ground');
  attachEntityToScene(scene.id, ground);

  // Character
  const character = EntityFactory.create('RobloxCharacter');
  character.components.set('Transform', makeTransform({ x: 0, y: 1.2, z: 0 }, { x: 0.9, y: 1.6, z: 0.6 }));
  character.components.set('MeshRenderer', makeMeshRenderer(meshAssetId));
  character.components.set('PlayerController', makePlayerController());
  character.components.set('Animator', makeAnimator());
  character.components.set('Script', makeScript('RobloxWalker.ts'));
  character.components.set('Health', makeHealth());
  character.tags.push('player', 'roblox');
  attachEntityToScene(scene.id, character);

  // Camera
  const camera = EntityFactory.create('MainCamera');
  camera.components.set('Transform', makeTransform({ x: 0, y: 4, z: 8 }, { x: 1, y: 1, z: 1 }));
  camera.components.set('Camera', makeCamera());
  camera.tags.push('camera');
  attachEntityToScene(scene.id, camera);

  // Light
  const light = EntityFactory.create('SunLight');
  light.components.set('Transform', makeTransform({ x: 6, y: 10, z: 4 }, { x: 1, y: 1, z: 1 }));
  light.components.set('Light', makeLight());
  light.tags.push('light');
  attachEntityToScene(scene.id, light);

  // Serialize scene with components preserved
  const serialized = {
    id: scene.id,
    name: scene.name,
    entities: scene.entities.map(serializeEntity),
    rootEntities: scene.rootEntities,
    environment: scene.environment,
    createdAt: scene.createdAt instanceof Date ? scene.createdAt.toISOString() : scene.createdAt,
    updatedAt: new Date().toISOString(),
  };

  const sceneFileName = 'pruba_lk.scene.json';
  const scenePath = path.join(SCENES_DIR, sceneFileName);
  await fs.writeFile(scenePath, JSON.stringify(serialized, null, 2), 'utf-8');

  const projectSummary = {
    name: 'pruba lk',
    projectPath: OUTPUT_ROOT,
    scenePath: path.relative(process.cwd(), scenePath).replace(/\\/g, '/'),
    assets: store.assets.map((asset) => ({
      ...asset,
      createdAt: asset.createdAt instanceof Date ? asset.createdAt.toISOString() : asset.createdAt,
    })),
    createdAt: new Date().toISOString(),
  };

  await fs.writeFile(path.join(OUTPUT_ROOT, 'project.json'), JSON.stringify(projectSummary, null, 2), 'utf-8');

  // Run compile validation
  const report = store.runReyPlayCompile();

  console.log('Scene created:', scene.name);
  console.log('Scene file:', scenePath);
  console.log('Compile ok:', report.ok);
  console.log('Compile summary:', report.summary);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
