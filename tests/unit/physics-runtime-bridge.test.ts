import { afterEach, describe, expect, it } from 'vitest';
import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import type { Component, Entity, Scene } from '@/types/engine';
import { PhysicsRuntimeBridge } from '@/engine/physics/physicsRuntimeBridge';
import { RigidBody } from '@/engine/physics/RigidBody';
import { useEngineStore } from '@/store/editorStore';

function makeTransformComponent(position: { x: number; y: number; z: number }): Component {
  return {
    id: `transform-${position.x}-${position.y}-${position.z}`,
    type: 'Transform' as const,
    enabled: true,
    data: {
      position,
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
    },
  };
}

function makeFloorEntity(): Entity {
  const components: [string, Component][] = [
    ['Transform', makeTransformComponent({ x: 0, y: -0.5, z: 0 })],
    [
      'Collider',
      {
        id: 'floor-collider',
        type: 'Collider',
        enabled: true,
        data: {
          type: 'box',
          isTrigger: false,
          center: { x: 0, y: 0, z: 0 },
          size: { x: 20, y: 1, z: 20 },
        },
      },
    ],
  ];
  return {
    id: 'floor',
    name: 'Floor',
    active: true,
    parentId: null,
    children: [],
    tags: ['ground'],
    components: new Map(components),
  };
}

function makeDynamicBoxEntity(): Entity {
  const components: [string, Component][] = [
    ['Transform', makeTransformComponent({ x: 0, y: 3, z: 0 })],
    [
      'Collider',
      {
        id: 'box-collider',
        type: 'Collider',
        enabled: true,
        data: {
          type: 'box',
          isTrigger: false,
          center: { x: 0, y: 0, z: 0 },
          size: { x: 1, y: 1, z: 1 },
        },
      },
    ],
    [
      'Rigidbody',
      {
        id: 'box-rigidbody',
        type: 'Rigidbody',
        enabled: true,
        data: {
          mass: 1,
          drag: 0.01,
          angularDrag: 0.05,
          useGravity: true,
          isKinematic: false,
          velocity: { x: 0, y: 0, z: 0 },
          angularVelocity: { x: 0, y: 0, z: 0 },
        },
      },
    ],
  ];
  return {
    id: 'box',
    name: 'Box',
    active: true,
    parentId: null,
    children: [],
    tags: ['physics'],
    components: new Map(components),
  };
}

function makePlayerEntity(): Entity {
  const components: [string, Component][] = [
    ['Transform', makeTransformComponent({ x: 0, y: 3, z: 0 })],
    [
      'PlayerController',
      {
        id: 'player-controller',
        type: 'PlayerController',
        enabled: true,
        data: {
          speed: 4.5,
          jumpForce: 10,
          height: 1.8,
          radius: 0.35,
          stepOffset: 0.4,
          slopeLimit: 45,
          jumpRequested: false,
        },
      },
    ],
  ];
  return {
    id: 'player',
    name: 'Player',
    active: true,
    parentId: null,
    children: [],
    tags: ['player'],
    components: new Map(components),
  };
}

function makeScene(...entities: Entity[]): Scene {
  return {
    id: 'scene-physics',
    name: 'Physics Test Scene',
    entities,
    rootEntities: entities.map((entity) => entity.id),
    environment: {
      skybox: null,
      ambientLight: { r: 0.2, g: 0.2, b: 0.2, a: 1 },
      fog: null,
      postProcessing: {
        bloom: { enabled: false, intensity: 0, threshold: 0, radius: 0 },
        ssao: { enabled: false, radius: 0, intensity: 0, bias: 0 },
        ssr: { enabled: false, intensity: 0, maxDistance: 0 },
        colorGrading: { enabled: false, exposure: 1, contrast: 1, saturation: 1, gamma: 1 },
        vignette: { enabled: false, intensity: 0, smoothness: 0, roundness: 0 },
      },
    },
    createdAt: new Date('2026-04-03T12:00:00.000Z'),
    updatedAt: new Date('2026-04-03T12:00:00.000Z'),
  };
}

function setPhysicsState(...entities: Entity[]) {
  useEngineStore.setState({
    scenes: [makeScene(...entities)],
    activeSceneId: 'scene-physics',
    entities: new Map(entities.map((entity) => [entity.id, entity])),
    playRuntimeState: 'PLAYING',
  });
}

describe('PhysicsRuntimeBridge', () => {
  afterEach(() => {
    useEngineStore.setState({
      scenes: [],
      activeSceneId: null,
      entities: new Map(),
      playRuntimeState: 'IDLE',
    });
  });

  it('simulates rigidbody motion and restores authored state on reset', () => {
    const bridge = new PhysicsRuntimeBridge();
    setPhysicsState(makeFloorEntity(), makeDynamicBoxEntity());

    for (let i = 0; i < 180; i += 1) {
      bridge.update(1 / 60);
    }

    const simulatedBox = useEngineStore.getState().entities.get('box');
    const transform = simulatedBox?.components.get('Transform')?.data as {
      position: { x: number; y: number; z: number };
    };
    const rigidbody = simulatedBox?.components.get('Rigidbody')?.data as {
      velocity: { x: number; y: number; z: number };
    };

    expect(transform.position.y).toBeGreaterThan(0.45);
    expect(transform.position.y).toBeLessThan(0.8);
    expect(Math.abs(rigidbody.velocity.y)).toBeLessThan(0.2);

    bridge.reset();

    const restoredBox = useEngineStore.getState().entities.get('box');
    const restoredTransform = restoredBox?.components.get('Transform')?.data as {
      position: { x: number; y: number; z: number };
    };
    const restoredRigidbody = restoredBox?.components.get('Rigidbody')?.data as {
      velocity: { x: number; y: number; z: number };
    };

    expect(restoredTransform.position).toEqual({ x: 0, y: 3, z: 0 });
    expect(restoredRigidbody.velocity).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('grounds the player controller and consumes jump requests through runtime simulation', () => {
    const bridge = new PhysicsRuntimeBridge();
    setPhysicsState(makeFloorEntity(), makePlayerEntity());

    for (let i = 0; i < 240; i += 1) {
      bridge.update(1 / 60);
    }

    let player = useEngineStore.getState().entities.get('player');
    let transform = player?.components.get('Transform')?.data as {
      position: { x: number; y: number; z: number };
    };
    let controller = player?.components.get('PlayerController')?.data as Record<string, unknown>;

    expect(transform.position.y).toBeGreaterThan(0.8);
    expect(transform.position.y).toBeLessThan(1.05);
    expect(controller.isGrounded).toBe(true);

    const nextComponents = new Map(player!.components);
    nextComponents.set('PlayerController', {
      ...player!.components.get('PlayerController')!,
      data: {
        ...controller,
        jumpRequested: true,
      },
    });
    useEngineStore.getState().updateEntityTransient('player', { components: nextComponents });

    bridge.update(1 / 60);

    player = useEngineStore.getState().entities.get('player');
    controller = player?.components.get('PlayerController')?.data as Record<string, unknown>;

    expect(controller.jumpRequested).toBe(false);
    expect(readNumber(controller.velocity, 'y')).toBeGreaterThan(0);
  });

  it('wakes a grounded character controller when movement input arrives after settling', () => {
    const bridge = new PhysicsRuntimeBridge();
    setPhysicsState(makeFloorEntity(), makePlayerEntity());

    for (let i = 0; i < 240; i += 1) {
      bridge.update(1 / 60);
    }

    const settledPlayer = useEngineStore.getState().entities.get('player');
    const settledComponents = new Map(settledPlayer!.components);
    const settledController = settledPlayer?.components.get('PlayerController')?.data as Record<string, unknown>;
    settledComponents.set('PlayerController', {
      ...settledPlayer!.components.get('PlayerController')!,
      data: {
        ...settledController,
        moveInput: { x: 0, y: 0, z: 1 },
      },
    });
    useEngineStore.getState().updateEntityTransient('player', { components: settledComponents });

    for (let i = 0; i < 120; i += 1) {
      bridge.update(1 / 60);
    }

    const movedPlayer = useEngineStore.getState().entities.get('player');
    const movedTransform = movedPlayer?.components.get('Transform')?.data as {
      position: { x: number; y: number; z: number };
    };
    const movedController = movedPlayer?.components.get('PlayerController')?.data as Record<string, unknown>;

    expect(readNumber(movedController.velocity, 'z')).toBeGreaterThan(0.5);
    expect(movedTransform.position.z).toBeGreaterThan(0.1);
  });
});

describe('RigidBody', () => {
  it('syncFromMesh writes position and rotation back into the cannon body', () => {
    const world = new CANNON.World();
    const rigidBody = new RigidBody(world, { type: 'dynamic', mass: 1 });
    const mesh = new THREE.Object3D();
    mesh.position.set(4, 2, -3);
    mesh.quaternion.setFromEuler(new THREE.Euler(0, Math.PI / 4, 0));

    rigidBody.syncFromMesh(mesh);

    expect(rigidBody.body.position.x).toBeCloseTo(4);
    expect(rigidBody.body.position.y).toBeCloseTo(2);
    expect(rigidBody.body.position.z).toBeCloseTo(-3);
    expect(rigidBody.body.quaternion.y).toBeCloseTo(mesh.quaternion.y);
    expect(rigidBody.body.quaternion.w).toBeCloseTo(mesh.quaternion.w);

    rigidBody.destroy();
  });
});

function readNumber(
  value: unknown,
  axis: 'x' | 'y' | 'z'
): number {
  if (!value || typeof value !== 'object') return 0;
  const candidate = value as Partial<Record<typeof axis, number>>;
  return typeof candidate[axis] === 'number' ? candidate[axis]! : 0;
}
