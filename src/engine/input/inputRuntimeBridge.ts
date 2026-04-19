'use client';

import * as THREE from 'three';
import type { Entity, Quaternion, Vector3 } from '@/types/engine';
import { useEngineStore } from '@/store/editorStore';
import { InputManager } from './InputManager';

type StoreState = ReturnType<typeof useEngineStore.getState>;

interface LookState {
  yaw: number;
  pitch: number;
}

const DEFAULT_POSITION: Vector3 = { x: 0, y: 0, z: 0 };
const DEFAULT_ROTATION: Quaternion = { x: 0, y: 0, z: 0, w: 1 };
const DEFAULT_FACING: Vector3 = { x: 0, y: 0, z: 1 };
const DEFAULT_MOUSE_LOOK_SENSITIVITY = 0.0025;
const DEFAULT_GAMEPAD_LOOK_SPEED = Math.PI * 1.25;
const MAX_LOOK_PITCH = Math.PI * 0.45;
const EPSILON = 1e-4;

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function readVector3(value: unknown, fallback: Vector3): Vector3 {
  if (!value || typeof value !== 'object') return { ...fallback };
  const candidate = value as Partial<Vector3>;
  return {
    x: readNumber(candidate.x, fallback.x),
    y: readNumber(candidate.y, fallback.y),
    z: readNumber(candidate.z, fallback.z),
  };
}

function readQuaternion(value: unknown, fallback: Quaternion): Quaternion {
  if (!value || typeof value !== 'object') return { ...fallback };
  const candidate = value as Partial<Quaternion>;
  return {
    x: readNumber(candidate.x, fallback.x),
    y: readNumber(candidate.y, fallback.y),
    z: readNumber(candidate.z, fallback.z),
    w: readNumber(candidate.w, fallback.w),
  };
}

function approximatelyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= EPSILON;
}

function vectorApproximatelyEqual(a: Vector3, b: Vector3): boolean {
  return approximatelyEqual(a.x, b.x)
    && approximatelyEqual(a.y, b.y)
    && approximatelyEqual(a.z, b.z);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function hasEnabledComponent(entity: Entity, componentType: string): boolean {
  return entity.components.get(componentType)?.enabled === true;
}

function getPlayerControllerData(entity: Entity): Record<string, unknown> | null {
  const component = entity.components.get('PlayerController');
  if (!component?.enabled) return null;
  return component.data as Record<string, unknown>;
}

function getTransformData(entity: Entity): Record<string, unknown> {
  return (entity.components.get('Transform')?.data as Record<string, unknown>) ?? {};
}

function getActiveSceneEntities(state: StoreState): Entity[] {
  if (!state.activeSceneId) return [];
  const activeScene = state.scenes.find((scene) => scene.id === state.activeSceneId);
  if (!activeScene) return [];

  const seen = new Set<string>();
  return activeScene.entities
    .map((entity) => state.entities.get(entity.id) ?? entity)
    .filter((entity) => {
      if (!entity.active || seen.has(entity.id)) return false;
      seen.add(entity.id);
      return true;
    });
}

function resolveControlledEntity(entities: Entity[]): Entity | null {
  const controllers = entities.filter((entity) => hasEnabledComponent(entity, 'PlayerController'));
  if (controllers.length === 0) return null;
  return controllers.find((entity) => entity.tags.includes('player')) ?? controllers[0] ?? null;
}

function resolveControlledCameraEntity(entity: Entity | null): Entity | null {
  if (!entity) return null;
  return hasEnabledComponent(entity, 'Camera') ? entity : null;
}

function readLookState(entity: Entity, controllerData: Record<string, unknown>): LookState {
  const transform = getTransformData(entity);
  const rotation = readQuaternion(transform.rotation, DEFAULT_ROTATION);
  const quaternion = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
  const euler = new THREE.Euler().setFromQuaternion(quaternion, 'YXZ');

  return {
    yaw: readNumber(controllerData.lookYaw, euler.y),
    pitch: clamp(readNumber(controllerData.lookPitch, euler.x), -MAX_LOOK_PITCH, MAX_LOOK_PITCH),
  };
}

function rotateMovementByYaw(moveX: number, moveY: number, yaw: number): Vector3 {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return {
    x: moveX * cos + moveY * sin,
    y: 0,
    z: moveY * cos - moveX * sin,
  };
}

export class InputRuntimeBridge {
  private initialized = false;
  private lookStateByEntity = new Map<string, LookState>();
  private controlledEntityId: string | null = null;
  private appliedViewportCameraEntityId: string | null = null;
  private previousViewportCameraEntityId: string | null = null;

  constructor() {
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      this.ensureInitialized();
    }
  }

  get isActive(): boolean {
    return this.controlledEntityId !== null
      || this.appliedViewportCameraEntityId !== null
      || this.lookStateByEntity.size > 0;
  }

  reset(): void {
    const store = useEngineStore.getState();
    if (this.appliedViewportCameraEntityId !== null) {
      store.setViewportCameraEntity(this.previousViewportCameraEntityId);
    }

    this.lookStateByEntity.clear();
    this.controlledEntityId = null;
    this.appliedViewportCameraEntityId = null;
    this.previousViewportCameraEntityId = null;

    InputManager.clearTransientState();
  }

  update(deltaTime: number): void {
    if (deltaTime < 0) return;
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    const state = useEngineStore.getState();
    if (state.playRuntimeState !== 'PLAYING') {
      return;
    }

    this.ensureInitialized();
    const mouseDelta = InputManager.mouseDelta;
    InputManager.update(deltaTime);

    const entities = getActiveSceneEntities(state);
    const controlledEntity = resolveControlledEntity(entities);
    if (!controlledEntity) {
      this.syncViewportCamera(null);
      this.controlledEntityId = null;
      return;
    }

    if (this.controlledEntityId && this.controlledEntityId !== controlledEntity.id) {
      this.clearControlledInput(this.controlledEntityId);
    }
    this.controlledEntityId = controlledEntity.id;

    const controlledCamera = resolveControlledCameraEntity(controlledEntity);
    this.syncViewportCamera(controlledCamera);
    this.applyControlledInput(controlledEntity, mouseDelta, deltaTime);
  }

  private ensureInitialized(): void {
    if (this.initialized) return;
    InputManager.initialize(document.body as HTMLElement);
    this.initialized = true;
  }

  private syncViewportCamera(cameraEntity: Entity | null): void {
    const store = useEngineStore.getState();

    if (!cameraEntity) {
      if (this.appliedViewportCameraEntityId !== null) {
        store.setViewportCameraEntity(this.previousViewportCameraEntityId);
        this.appliedViewportCameraEntityId = null;
        this.previousViewportCameraEntityId = null;
      }
      return;
    }

    if (this.appliedViewportCameraEntityId === cameraEntity.id) {
      return;
    }

    if (store.editor.viewportCameraEntityId !== null) {
      return;
    }

    this.previousViewportCameraEntityId = store.editor.viewportCameraEntityId ?? null;
    this.appliedViewportCameraEntityId = cameraEntity.id;
    store.setViewportCameraEntity(cameraEntity.id);
  }

  private applyControlledInput(
    entity: Entity,
    mouseDelta: { x: number; y: number },
    deltaTime: number
  ): void {
    const controllerComponent = entity.components.get('PlayerController');
    if (!controllerComponent?.enabled) return;

    const controllerData = controllerComponent.data as Record<string, unknown>;
    const actionLookX = InputManager.getActionValue('lookX');
    const actionLookY = InputManager.getActionValue('lookY');
    const sensitivity = Math.max(readNumber(controllerData.sensitivity, 1), 0.05);
    const lookDeltaX = actionLookX !== 0
      ? actionLookX * DEFAULT_GAMEPAD_LOOK_SPEED * sensitivity * deltaTime
      : mouseDelta.x * DEFAULT_MOUSE_LOOK_SENSITIVITY * sensitivity;
    const lookDeltaY = actionLookY !== 0
      ? actionLookY * DEFAULT_GAMEPAD_LOOK_SPEED * sensitivity * deltaTime
      : -mouseDelta.y * DEFAULT_MOUSE_LOOK_SENSITIVITY * sensitivity;

    const previousLook = this.lookStateByEntity.get(entity.id) ?? readLookState(entity, controllerData);
    const nextLook: LookState = {
      yaw: previousLook.yaw + lookDeltaX,
      pitch: clamp(previousLook.pitch + lookDeltaY, -MAX_LOOK_PITCH, MAX_LOOK_PITCH),
    };
    this.lookStateByEntity.set(entity.id, nextLook);

    const moveX = InputManager.getActionValue('moveX');
    const moveY = InputManager.getActionValue('moveY');
    const moveInput = rotateMovementByYaw(moveX, moveY, nextLook.yaw);
    const facingDirection = {
      x: Math.sin(nextLook.yaw),
      y: 0,
      z: Math.cos(nextLook.yaw),
    };
    const sprint = InputManager.getAction('sprint').active;
    const crouch = InputManager.getAction('crouch').active;
    const jumpRequested = InputManager.getAction('jump').justPressed;
    const attackRequested = InputManager.getAction('attack').justPressed;
    const heavyAttackRequested = InputManager.getAction('heavyAttack').justPressed;
    const block = InputManager.getAction('block').active;
    const parryRequested = InputManager.getAction('parry').justPressed;
    const lockTargetRequested = InputManager.getAction('lockTarget').justPressed;
    const lookInput = { x: lookDeltaX, y: lookDeltaY, z: 0 };

    const currentMoveInput = readVector3(controllerData.moveInput, DEFAULT_POSITION);
    const currentLookInput = readVector3(controllerData.lookInput, DEFAULT_POSITION);
    const currentFacingDirection = readVector3(controllerData.facingDirection, DEFAULT_FACING);
    const currentLookYaw = readNumber(controllerData.lookYaw, nextLook.yaw);
    const currentLookPitch = readNumber(controllerData.lookPitch, nextLook.pitch);
    const currentRun = readBoolean(controllerData.run, readBoolean(controllerData.sprint, false));
    const currentCrouch = readBoolean(controllerData.crouch, false);
    const currentJumpRequested = readBoolean(controllerData.jumpRequested, false);
    const currentAttackRequested = readBoolean(controllerData.attackRequested, false);
    const currentHeavyAttackRequested = readBoolean(controllerData.heavyAttackRequested, false);
    const currentBlock = readBoolean(controllerData.block, false);
    const currentParryRequested = readBoolean(controllerData.parryRequested, false);
    const currentLockTargetRequested = readBoolean(controllerData.lockTargetRequested, false);

    const changed = !vectorApproximatelyEqual(currentMoveInput, moveInput)
      || !vectorApproximatelyEqual(currentLookInput, lookInput)
      || !vectorApproximatelyEqual(currentFacingDirection, facingDirection)
      || !approximatelyEqual(currentLookYaw, nextLook.yaw)
      || !approximatelyEqual(currentLookPitch, nextLook.pitch)
      || currentRun !== sprint
      || currentCrouch !== crouch
      || currentJumpRequested !== jumpRequested
      || currentAttackRequested !== attackRequested
      || currentHeavyAttackRequested !== heavyAttackRequested
      || currentBlock !== block
      || currentParryRequested !== parryRequested
      || currentLockTargetRequested !== lockTargetRequested;

    if (!changed) {
      return;
    }

    const nextComponents = new Map(entity.components);
    nextComponents.set('PlayerController', {
      ...controllerComponent,
      data: {
        ...controllerData,
        moveInput,
        inputVector: moveInput,
        desiredMovement: moveInput,
        facingDirection,
        lookInput,
        lookYaw: nextLook.yaw,
        lookPitch: nextLook.pitch,
        run: sprint,
        sprint,
        crouch,
        jumpRequested,
        attackRequested,
        heavyAttackRequested,
        block,
        parryRequested,
        lockTargetRequested,
      },
    });

    useEngineStore.getState().updateEntityTransient(entity.id, { components: nextComponents });
  }

  private clearControlledInput(entityId: string): void {
    const store = useEngineStore.getState();
    const entity = store.entities.get(entityId);
    const controllerComponent = entity?.components.get('PlayerController');
    if (!entity || !controllerComponent?.enabled) {
      return;
    }

    const controllerData = controllerComponent.data as Record<string, unknown>;
    const nextComponents = new Map(entity.components);
    nextComponents.set('PlayerController', {
      ...controllerComponent,
      data: {
        ...controllerData,
        moveInput: { ...DEFAULT_POSITION },
        inputVector: { ...DEFAULT_POSITION },
        desiredMovement: { ...DEFAULT_POSITION },
        lookInput: { ...DEFAULT_POSITION },
        run: false,
        sprint: false,
        crouch: false,
        jumpRequested: false,
        attackRequested: false,
        heavyAttackRequested: false,
        block: false,
        parryRequested: false,
        lockTargetRequested: false,
      },
    });

    store.updateEntityTransient(entityId, { components: nextComponents });
  }
}

export const inputRuntimeBridge = new InputRuntimeBridge();
