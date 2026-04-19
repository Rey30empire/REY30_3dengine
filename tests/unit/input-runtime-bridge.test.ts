import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Component, Entity, Scene } from '@/types/engine';
import { InputRuntimeBridge } from '@/engine/input/inputRuntimeBridge';
import { KeyCode } from '@/engine/input/InputManager';
import { useEngineStore } from '@/store/editorStore';
import {
  dispatchKeyboardEvent,
  dispatchMouseButton,
  dispatchMouseMove,
  installInputTestEnvironment,
  resetInputManagerForTests,
} from './input-test-helpers';

function makeTransformComponent(position: { x: number; y: number; z: number }): Component {
  return {
    id: `transform-${position.x}-${position.y}-${position.z}`,
    type: 'Transform',
    enabled: true,
    data: {
      position,
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
    },
  };
}

function makePlayerCameraEntity(): Entity {
  return {
    id: 'player-camera',
    name: 'Player Camera',
    active: true,
    parentId: null,
    children: [],
    tags: ['player'],
    components: new Map([
      ['Transform', makeTransformComponent({ x: 0, y: 1.8, z: 0 })],
      [
        'Camera',
        {
          id: 'camera-component',
          type: 'Camera',
          enabled: true,
          data: {
            fov: 60,
            near: 0.1,
            far: 1000,
            orthographic: false,
            clearColor: { r: 0, g: 0, b: 0, a: 1 },
            isMain: true,
          },
        },
      ],
      [
        'PlayerController',
        {
          id: 'player-controller',
          type: 'PlayerController',
          enabled: true,
          data: {
            speed: 4.5,
            runSpeed: 7,
            jumpForce: 10,
            sensitivity: 1.5,
          },
        },
      ],
    ]),
  };
}

function makeScene(...entities: Entity[]): Scene {
  return {
    id: 'scene-input',
    name: 'Input Scene',
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

describe('InputRuntimeBridge', () => {
  beforeEach(() => {
    installInputTestEnvironment();
    resetInputManagerForTests();
  });

  afterEach(() => {
    useEngineStore.setState({
      scenes: [],
      activeSceneId: null,
      entities: new Map(),
      playRuntimeState: 'IDLE',
      editor: {
        ...useEngineStore.getState().editor,
        viewportCameraEntityId: null,
      },
    });
    resetInputManagerForTests();
    vi.unstubAllGlobals();
  });

  it('writes movement, jump and camera look input into the active player controller', () => {
    const bridge = new InputRuntimeBridge();
    const player = makePlayerCameraEntity();

    useEngineStore.setState({
      scenes: [makeScene(player)],
      activeSceneId: 'scene-input',
      entities: new Map([[player.id, player]]),
      playRuntimeState: 'PLAYING',
      editor: {
        ...useEngineStore.getState().editor,
        viewportCameraEntityId: null,
      },
    });

    dispatchMouseMove(18, -10);
    dispatchKeyboardEvent('keydown', KeyCode.W, 'w');
    dispatchKeyboardEvent('keydown', KeyCode.ShiftLeft, 'Shift');
    bridge.update(1 / 60);

    dispatchKeyboardEvent('keydown', KeyCode.Space, ' ');
    dispatchMouseButton('mousedown', 0);
    bridge.update(1 / 60);

    const updatedPlayer = useEngineStore.getState().entities.get(player.id);
    const controller = updatedPlayer?.components.get('PlayerController')?.data as Record<string, unknown>;
    const moveInput = controller.moveInput as { x: number; y: number; z: number };
    const facingDirection = controller.facingDirection as { x: number; y: number; z: number };

    expect(moveInput.z).toBeGreaterThan(0.9);
    expect(Math.abs(facingDirection.x)).toBeGreaterThan(0.02);
    expect(controller.run).toBe(true);
    expect(controller.sprint).toBe(true);
    expect(controller.jumpRequested).toBe(true);
    expect(controller.attackRequested).toBe(true);
    expect(controller.block).toBe(false);
    expect((controller.lookPitch as number) ?? 0).toBeGreaterThan(0);
    expect(useEngineStore.getState().editor.viewportCameraEntityId).toBe(player.id);

    bridge.reset();
    expect(useEngineStore.getState().editor.viewportCameraEntityId).toBeNull();
  });
});
