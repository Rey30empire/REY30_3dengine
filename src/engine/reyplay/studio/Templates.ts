import { v4 as uuidv4 } from 'uuid';
import type { Component, Entity } from '@/types/engine';
import { createStarterTerrainData } from '@/engine/scene/terrainAuthoring';

export type TemplateStarter = 'base' | 'arena' | 'platformer';

export interface StarterTemplate {
  id: TemplateStarter;
  label: string;
  description: string;
  recommendedObjects: string[];
}

export const STARTER_TEMPLATES = [
  {
    id: 'base',
    label: 'Escena Base',
    description: 'Escena en blanco con eje origen y cámara.',
    recommendedObjects: ['terrain', 'player', 'camera', 'light'],
  },
  {
    id: 'arena',
    label: 'Arena Simple',
    description: 'Arena circular mínima y punto de juego.',
    recommendedObjects: ['arena-terrain', 'player', 'enemy-spawn', 'light'],
  },
  {
    id: 'platformer',
    label: 'Plataformas',
    description: 'Conjunto base para juego de movimiento y saltos.',
    recommendedObjects: ['platform-terrain', 'player', 'camera'],
  },
] as const;

function createTransformComponent(): Component {
  return {
    id: uuidv4(),
    type: 'Transform',
    enabled: true,
    data: {
      position: { x: 0, y: 0.5, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
    },
  };
}

function createMeshRenderer(meshId: string, materialId = 'default'): Component {
  return {
    id: uuidv4(),
    type: 'MeshRenderer',
    enabled: true,
    data: {
      meshId,
      materialId,
      castShadows: true,
      receiveShadows: true,
    },
  };
}

function createLightComponent(): Component {
  return {
    id: uuidv4(),
    type: 'Light',
    enabled: true,
    data: {
      type: 'directional',
      color: { r: 1, g: 1, b: 1 },
      intensity: 1.2,
      shadows: true,
    },
  };
}

export function makeStarterTerrain(name = 'Terrain Starter') {
  const components = new Map<string, Component>();
  components.set('Transform', createTransformComponent());
  components.set('Terrain', {
    id: uuidv4(),
    type: 'Terrain',
    enabled: true,
    data: createStarterTerrainData() as unknown as Record<string, unknown>,
  });

  return {
    id: uuidv4(),
    name,
    components,
    children: [],
    parentId: null,
    active: true,
    tags: ['terrain', 'starter'],
  } as Entity;
}

export function makeStarterPlayer(name = 'Player') {
  const components = new Map<string, Component>();
  components.set('Transform', createTransformComponent());
  components.set('MeshRenderer', createMeshRenderer('mesh-placeholder', 'material-player'));
  components.set('Rigidbody', {
    id: uuidv4(),
    type: 'Rigidbody',
    enabled: true,
    data: {
      mass: 1,
      drag: 0,
      angularDrag: 0.05,
      useGravity: true,
      isKinematic: false,
      velocity: { x: 0, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 },
    },
  });
  components.set('Collider', {
    id: uuidv4(),
    type: 'Collider',
    enabled: true,
    data: {
      type: 'capsule',
      isTrigger: false,
      center: { x: 0, y: 0.5, z: 0 },
      radius: 0.25,
      height: 1.4,
    },
  });
  components.set('Health', {
    id: uuidv4(),
    type: 'Health',
    enabled: true,
    data: {
      maxHealth: 100,
      currentHealth: 100,
      invulnerable: false,
      team: 'player',
    },
  });

  return {
    id: uuidv4(),
    name,
    components,
    children: [],
    parentId: null,
    active: true,
    tags: ['player', 'starter'],
  } as Entity;
}

export function makeStarterCamera(name = 'Main Camera') {
  const components = new Map<string, Component>();
  const transform = createTransformComponent();
  (transform.data as Record<string, Record<string, number>>).position = {
    x: 0,
    y: 3,
    z: 6,
  };

  components.set('Transform', transform);
  components.set('Camera', {
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
  });

  return {
    id: uuidv4(),
    name,
    components,
    children: [],
    parentId: null,
    active: true,
    tags: ['camera', 'starter'],
  } as Entity;
}

export function makeStarterLight(name = 'Directional Light') {
  const components = new Map<string, Component>();
  const transform = createTransformComponent();
  (transform.data as Record<string, Record<string, number>>).position = {
    x: 6,
    y: 10,
    z: 4,
  };

  components.set('Transform', transform);
  components.set('Light', createLightComponent());

  return {
    id: uuidv4(),
    name,
    components,
    children: [],
    parentId: null,
    active: true,
    tags: ['light', 'starter'],
  } as Entity;
}

export function getStarterEntitiesForTemplate(template: TemplateStarter): Entity[] {
  if (template === 'arena') {
    return [
      makeStarterTerrain('Arena Terrain'),
      makeStarterPlayer('Player One'),
      makeStarterLight(),
      makeStarterCamera(),
    ];
  }

  if (template === 'platformer') {
    return [
      makeStarterTerrain('Platform Terrain'),
      makeStarterPlayer('Hero'),
      makeStarterCamera(),
    ];
  }

  return [
    makeStarterTerrain('Base Terrain'),
    makeStarterPlayer('Player'),
    makeStarterLight(),
    makeStarterCamera(),
  ];
}
