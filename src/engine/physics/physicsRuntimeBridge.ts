'use client';

import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import type { Component, Entity, Quaternion, RigidbodyData, Scene, TransformData, Vector3 } from '@/types/engine';
import { useEngineStore } from '@/store/editorStore';
import { CharacterController } from './CharacterController';
import { Collider, type ColliderOptions } from './Collider';
import { RigidBody, type RigidBodyType } from './RigidBody';

type StoreState = ReturnType<typeof useEngineStore.getState>;

type PhysicsBinding = RigidBodyBinding | CharacterControllerBinding;

type PhysicsBindingKind = 'rigidbody' | 'controller';

interface PhysicsBindingBase {
  kind: PhysicsBindingKind;
  entityId: string;
}

interface RigidBodyBinding extends PhysicsBindingBase {
  kind: 'rigidbody';
  bodyType: RigidBodyType;
  rigidBody: RigidBody;
  colliders: Collider[];
}

interface CharacterControllerBinding extends PhysicsBindingBase {
  kind: 'controller';
  controller: CharacterController;
  jumpConsumed: boolean;
}

interface EntitySnapshot {
  components: Map<string, Component | null>;
}

const DEFAULT_POSITION: Vector3 = { x: 0, y: 0, z: 0 };
const DEFAULT_SCALE: Vector3 = { x: 1, y: 1, z: 1 };
const DEFAULT_ROTATION: Quaternion = { x: 0, y: 0, z: 0, w: 1 };
const FIXED_TIME_STEP = 1 / 60;
const MAX_SUB_STEPS = 4;
const EPSILON = 1e-4;

function deepClone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function cloneComponent(component: Component | null): Component | null {
  if (!component) return null;
  return {
    ...component,
    data: deepClone(component.data),
  };
}

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

function quaternionApproximatelyEqual(a: Quaternion, b: Quaternion): boolean {
  return approximatelyEqual(a.x, b.x)
    && approximatelyEqual(a.y, b.y)
    && approximatelyEqual(a.z, b.z)
    && approximatelyEqual(a.w, b.w);
}

function clampPositive(value: number, fallback: number): number {
  return value > 0 ? value : fallback;
}

function getComponent(entity: Entity, componentType: string): Component | null {
  return entity.components.get(componentType) ?? null;
}

function getTransformData(entity: Entity): TransformData {
  const component = getComponent(entity, 'Transform');
  const data = component?.data as Partial<TransformData> | undefined;
  return {
    position: readVector3(data?.position, DEFAULT_POSITION),
    rotation: readQuaternion(data?.rotation, DEFAULT_ROTATION),
    scale: readVector3(data?.scale, DEFAULT_SCALE),
  };
}

function getRigidbodyData(entity: Entity): RigidbodyData | null {
  const component = getComponent(entity, 'Rigidbody');
  if (!component || !component.enabled) return null;
  const data = component.data as Partial<RigidbodyData>;
  return {
    mass: readNumber(data.mass, 1),
    drag: readNumber(data.drag, 0.01),
    angularDrag: readNumber(data.angularDrag, 0.05),
    useGravity: readBoolean(data.useGravity, true),
    isKinematic: readBoolean(data.isKinematic, false),
    velocity: readVector3(data.velocity, DEFAULT_POSITION),
    angularVelocity: readVector3(data.angularVelocity, DEFAULT_POSITION),
  };
}

function getColliderData(entity: Entity): Record<string, unknown> | null {
  const component = getComponent(entity, 'Collider');
  if (!component || !component.enabled) return null;
  return component.data as Record<string, unknown>;
}

function getPlayerControllerData(entity: Entity): Record<string, unknown> | null {
  const component = getComponent(entity, 'PlayerController');
  if (!component || !component.enabled) return null;
  return component.data as Record<string, unknown>;
}

function getActiveScene(state: StoreState): Scene | null {
  if (!state.activeSceneId) return null;
  return state.scenes.find((scene) => scene.id === state.activeSceneId) ?? null;
}

function getActiveSceneEntities(state: StoreState): Entity[] {
  const activeScene = getActiveScene(state);
  if (!activeScene) return [];

  const seen = new Set<string>();
  return activeScene.entities
    .map((entity) => state.entities.get(entity.id) ?? entity)
    .filter((entity) => {
      if (seen.has(entity.id)) return false;
      seen.add(entity.id);
      return true;
    });
}

function isPhysicsEntity(entity: Entity): boolean {
  return Boolean(
    (getComponent(entity, 'Collider')?.enabled)
    || (getComponent(entity, 'Rigidbody')?.enabled)
    || (getComponent(entity, 'PlayerController')?.enabled)
  );
}

function toQuaternion(value: Quaternion): THREE.Quaternion {
  return new THREE.Quaternion(value.x, value.y, value.z, value.w);
}

function toPosition(value: Vector3): THREE.Vector3 {
  return new THREE.Vector3(value.x, value.y, value.z);
}

function rotationFromFacing(facing: Vector3, fallback: Quaternion, pitch = 0): Quaternion {
  if (Math.abs(facing.x) <= EPSILON && Math.abs(facing.z) <= EPSILON) {
    return fallback;
  }
  const yaw = Math.atan2(facing.x, facing.z);
  const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
  return {
    x: rotation.x,
    y: rotation.y,
    z: rotation.z,
    w: rotation.w,
  };
}

export class PhysicsRuntimeBridge {
  private world: CANNON.World | null = null;
  private bindings = new Map<string, PhysicsBinding>();
  private authoredSnapshots = new Map<string, EntitySnapshot>();
  private structureSignature = '';
  private accumulator = 0;

  get isActive(): boolean {
    return this.bindings.size > 0 || this.authoredSnapshots.size > 0;
  }

  reset(): void {
    this.disposeRuntime(true);
  }

  update(deltaTime: number): void {
    if (deltaTime <= 0) return;

    const state = useEngineStore.getState();
    if (state.playRuntimeState !== 'PLAYING') {
      return;
    }

    this.ensureRuntime(state);
    if (!this.world || this.bindings.size === 0) {
      return;
    }

    this.applyRuntimeInputs(state);

    this.accumulator += deltaTime;
    let steps = 0;

    while (this.accumulator >= FIXED_TIME_STEP && steps < MAX_SUB_STEPS) {
      this.stepControllers(FIXED_TIME_STEP);
      this.applyGravityOverrides();
      this.world.step(FIXED_TIME_STEP);
      this.accumulator -= FIXED_TIME_STEP;
      steps += 1;
    }

    this.syncSimulationToStore();
  }

  private ensureRuntime(state: StoreState): void {
    const entities = getActiveSceneEntities(state).filter(isPhysicsEntity);
    const signature = this.buildStructureSignature(state.activeSceneId, entities);

    if (signature === this.structureSignature && this.world) {
      return;
    }

    this.disposeRuntime(false);

    if (!state.activeSceneId || entities.length === 0) {
      this.structureSignature = signature;
      return;
    }

    this.world = new CANNON.World();
    this.world.gravity.set(0, -9.81, 0);
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.allowSleep = true;
    this.accumulator = 0;

    for (const entity of entities) {
      this.authoredSnapshots.set(entity.id, this.captureSnapshot(entity));
      const controllerData = getPlayerControllerData(entity);
      if (controllerData) {
        this.bindings.set(entity.id, this.createCharacterControllerBinding(entity, controllerData));
        continue;
      }
      this.bindings.set(entity.id, this.createRigidBodyBinding(entity));
    }

    this.structureSignature = signature;
  }

  private buildStructureSignature(activeSceneId: string | null, entities: Entity[]): string {
    const parts = entities
      .map((entity) => {
        const transform = getTransformData(entity);
        const collider = getColliderData(entity);
        const rigidbody = getRigidbodyData(entity);
        const controller = getPlayerControllerData(entity);
        const staticTransform =
          !rigidbody && !controller
            ? `${transform.position.x},${transform.position.y},${transform.position.z},${transform.rotation.x},${transform.rotation.y},${transform.rotation.z},${transform.rotation.w}`
            : 'runtime';

        return JSON.stringify({
          entityId: entity.id,
          staticTransform,
          scale: transform.scale,
          collider: collider ? {
            type: collider.type,
            isTrigger: collider.isTrigger,
            center: collider.center,
            size: collider.size,
            radius: collider.radius,
            height: collider.height,
          } : null,
          rigidbody: rigidbody ? {
            mass: rigidbody.mass,
            drag: rigidbody.drag,
            angularDrag: rigidbody.angularDrag,
            useGravity: rigidbody.useGravity,
            isKinematic: rigidbody.isKinematic,
          } : null,
          controller: controller ? {
            mass: controller.mass,
            speed: controller.speed,
            runSpeed: controller.runSpeed,
            jumpForce: controller.jumpForce,
            height: controller.height,
            radius: controller.radius,
            stepOffset: controller.stepOffset,
            slopeLimit: controller.slopeLimit,
          } : null,
        });
      })
      .sort();

    return `${activeSceneId ?? 'no-scene'}::${parts.join(';')}`;
  }

  private captureSnapshot(entity: Entity): EntitySnapshot {
    return {
      components: new Map([
        ['Transform', cloneComponent(getComponent(entity, 'Transform'))],
        ['Rigidbody', cloneComponent(getComponent(entity, 'Rigidbody'))],
        ['PlayerController', cloneComponent(getComponent(entity, 'PlayerController'))],
      ]),
    };
  }

  private createRigidBodyBinding(entity: Entity): RigidBodyBinding {
    if (!this.world) {
      throw new Error('Physics runtime world is not initialized.');
    }

    const transform = getTransformData(entity);
    const rigidbodyData = getRigidbodyData(entity);
    const colliderData = getColliderData(entity);
    const bodyType = rigidbodyData?.isKinematic
      ? 'kinematic'
      : rigidbodyData && rigidbodyData.mass <= 0
        ? 'static'
        : rigidbodyData
          ? 'dynamic'
          : 'static';

    const rigidBody = new RigidBody(this.world, {
      entityId: entity.id,
      type: bodyType,
      mass: bodyType === 'dynamic' ? clampPositive(rigidbodyData?.mass ?? 1, 1) : 0,
      position: [transform.position.x, transform.position.y, transform.position.z],
      quaternion: [
        transform.rotation.x,
        transform.rotation.y,
        transform.rotation.z,
        transform.rotation.w,
      ],
      velocity: [
        rigidbodyData?.velocity.x ?? 0,
        rigidbodyData?.velocity.y ?? 0,
        rigidbodyData?.velocity.z ?? 0,
      ],
      angularVelocity: [
        rigidbodyData?.angularVelocity.x ?? 0,
        rigidbodyData?.angularVelocity.y ?? 0,
        rigidbodyData?.angularVelocity.z ?? 0,
      ],
      linearDamping: rigidbodyData?.drag ?? 0.01,
      angularDamping: rigidbodyData?.angularDrag ?? 0.05,
      useGravity: true,
    });

    const colliderOptions = this.makeColliderOptions(colliderData, transform.scale);
    const colliderCenter = readVector3(colliderData?.center, DEFAULT_POSITION);
    const collider = new Collider(
      this.world,
      colliderOptions,
      rigidBody.body,
      {
        shape: colliderOptions,
        isTrigger: readBoolean(colliderData?.isTrigger, false),
        offset: [
          colliderCenter.x * transform.scale.x,
          colliderCenter.y * transform.scale.y,
          colliderCenter.z * transform.scale.z,
        ],
      }
    );

    if (readBoolean(colliderData?.isTrigger, false)) {
      rigidBody.body.collisionResponse = false;
    }

    rigidBody.addCollider(collider);

    return {
      kind: 'rigidbody',
      entityId: entity.id,
      bodyType,
      rigidBody,
      colliders: [collider],
    };
  }

  private createCharacterControllerBinding(
    entity: Entity,
    controllerData: Record<string, unknown>
  ): CharacterControllerBinding {
    if (!this.world) {
      throw new Error('Physics runtime world is not initialized.');
    }

    const transform = getTransformData(entity);
    const walkSpeed = clampPositive(
      readNumber(controllerData.speed, readNumber(controllerData.walkSpeed, 4.5)),
      4.5
    );
    const runSpeed = clampPositive(readNumber(controllerData.runSpeed, walkSpeed * 1.6), walkSpeed * 1.6);

    const controller = new CharacterController(this.world, {
      entityId: entity.id,
      mass: clampPositive(readNumber(controllerData.mass, 1), 1),
      height: clampPositive(readNumber(controllerData.height, 1.8), 1.8),
      radius: clampPositive(readNumber(controllerData.radius, 0.35), 0.35),
      position: [transform.position.x, transform.position.y, transform.position.z],
      walkSpeed,
      runSpeed,
      jumpForce: clampPositive(readNumber(controllerData.jumpForce, 10), 10),
      maxSlopeAngle: clampPositive(readNumber(controllerData.slopeLimit, 45), 45),
      stepOffset: clampPositive(readNumber(controllerData.stepOffset, 0.4), 0.4),
    });

    controller.setPosition(transform.position.x, transform.position.y, transform.position.z);

    return {
      kind: 'controller',
      entityId: entity.id,
      controller,
      jumpConsumed: false,
    };
  }

  private makeColliderOptions(
    colliderData: Record<string, unknown> | null,
    scale: Vector3
  ): ColliderOptions {
    const type = typeof colliderData?.type === 'string' ? colliderData.type : 'box';
    const rawSize = readVector3(colliderData?.size, {
      x: 1,
      y: 1,
      z: 1,
    });
    const maxScale = Math.max(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z), 1);

    if (type === 'sphere') {
      return {
        type: 'sphere',
        radius: clampPositive(readNumber(colliderData?.radius, Math.max(rawSize.x, rawSize.y, rawSize.z) * 0.5) * maxScale, 0.5),
      };
    }

    if (type === 'capsule') {
      const radius = clampPositive(readNumber(colliderData?.radius, Math.max(rawSize.x, rawSize.z) * 0.25) * maxScale, 0.25);
      const fullHeight = clampPositive(readNumber(colliderData?.height, rawSize.y) * Math.abs(scale.y), radius * 2 + 0.1);
      return {
        type: 'capsule',
        radius,
        height: Math.max(fullHeight - radius * 2, 0.1),
      };
    }

    if (type === 'cylinder') {
      const radius = clampPositive(readNumber(colliderData?.radius, Math.max(rawSize.x, rawSize.z) * 0.5) * maxScale, 0.5);
      return {
        type: 'cylinder',
        radiusTop: radius,
        radiusBottom: radius,
        height: clampPositive(readNumber(colliderData?.height, rawSize.y) * Math.abs(scale.y), 0.5),
      };
    }

    return {
      type: 'box',
      size: [
        clampPositive((Math.abs(rawSize.x) * Math.abs(scale.x)) * 0.5, 0.5),
        clampPositive((Math.abs(rawSize.y) * Math.abs(scale.y)) * 0.5, 0.5),
        clampPositive((Math.abs(rawSize.z) * Math.abs(scale.z)) * 0.5, 0.5),
      ],
    };
  }

  private applyRuntimeInputs(state: StoreState): void {
    for (const binding of this.bindings.values()) {
      const entity = state.entities.get(binding.entityId);
      if (!entity) continue;

      if (binding.kind === 'rigidbody') {
        this.applyRigidBodyInputs(binding, entity);
        continue;
      }

      this.applyCharacterControllerInputs(binding, entity);
    }
  }

  private applyRigidBodyInputs(binding: RigidBodyBinding, entity: Entity): void {
    const transform = getTransformData(entity);
    const rigidbodyData = getRigidbodyData(entity);

    binding.rigidBody.body.linearDamping = rigidbodyData?.drag ?? binding.rigidBody.body.linearDamping;
    binding.rigidBody.body.angularDamping = rigidbodyData?.angularDrag ?? binding.rigidBody.body.angularDamping;

    if (binding.bodyType === 'kinematic') {
      binding.rigidBody.position = toPosition(transform.position);
      binding.rigidBody.quaternion = toQuaternion(transform.rotation);
    }

    if (binding.bodyType !== 'static' && rigidbodyData) {
      binding.rigidBody.velocity = toPosition(rigidbodyData.velocity);
      binding.rigidBody.angularVelocity = toPosition(rigidbodyData.angularVelocity);
      binding.rigidBody.wake();
    }
  }

  private applyCharacterControllerInputs(binding: CharacterControllerBinding, entity: Entity): void {
    const data = getPlayerControllerData(entity);
    if (!data) return;

    const walkSpeed = clampPositive(readNumber(data.speed, readNumber(data.walkSpeed, binding.controller.walkSpeed)), binding.controller.walkSpeed);
    const runSpeed = clampPositive(readNumber(data.runSpeed, Math.max(walkSpeed * 1.6, walkSpeed)), Math.max(walkSpeed * 1.6, walkSpeed));
    binding.controller.setWalkSpeed(walkSpeed);
    binding.controller.setRunSpeed(runSpeed);
    binding.controller.setJumpForce(clampPositive(readNumber(data.jumpForce, binding.controller.jumpForce), binding.controller.jumpForce));
    binding.controller.setStepOffset(clampPositive(readNumber(data.stepOffset, binding.controller.stepOffset), binding.controller.stepOffset));
    binding.controller.setMaxSlopeAngle(clampPositive(readNumber(data.slopeLimit, binding.controller.maxSlopeAngle), binding.controller.maxSlopeAngle));

    const moveInput = this.readMovementInput(data);
    const hasMovementInput = Math.abs(moveInput.x) > EPSILON || Math.abs(moveInput.z) > EPSILON;
    const facingDirection = readVector3(data.facingDirection, { x: 0, y: 0, z: 1 });
    if (Math.abs(moveInput.x) <= EPSILON && Math.abs(moveInput.z) <= EPSILON) {
      binding.controller.faceDirection(new THREE.Vector3(facingDirection.x, 0, facingDirection.z));
    }
    const wantsRun = readBoolean(data.run, readBoolean(data.sprint, readBoolean(data.isRunning, false)));
    binding.controller.move(
      new THREE.Vector3(moveInput.x, 0, moveInput.z),
      wantsRun ? binding.controller.runSpeed : binding.controller.walkSpeed
    );

    const wantsCrouch = readBoolean(data.crouch, readBoolean(data.crouching, readBoolean(data.isCrouching, false)));
    if (wantsCrouch) {
      binding.controller.crouch();
    } else {
      binding.controller.stand();
    }

    const wantsJump = readBoolean(data.jumpRequested, readBoolean(data.jump, readBoolean(data.requestJump, false)));
    if (hasMovementInput || wantsJump) {
      binding.controller.body.wakeUp();
    }
    binding.jumpConsumed = wantsJump && binding.controller.jump(readNumber(data.jumpForce, binding.controller.jumpForce));
  }

  private readMovementInput(data: Record<string, unknown>): Vector3 {
    const candidates = [
      data.moveInput,
      data.inputVector,
      data.desiredMovement,
      data.movement,
    ];

    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== 'object') continue;
      const vector = readVector3(candidate, DEFAULT_POSITION);
      if (!vectorApproximatelyEqual(vector, DEFAULT_POSITION)) {
        return vector;
      }
    }

    return { ...DEFAULT_POSITION };
  }

  private stepControllers(deltaTime: number): void {
    for (const binding of this.bindings.values()) {
      if (binding.kind === 'controller') {
        binding.controller.update(deltaTime);
      }
    }
  }

  private applyGravityOverrides(): void {
    if (!this.world) return;

    const gravity = this.world.gravity;
    const state = useEngineStore.getState();

    for (const binding of this.bindings.values()) {
      const entity = state.entities.get(binding.entityId);
      if (!entity) continue;

      if (binding.kind === 'rigidbody') {
        const rigidbody = getRigidbodyData(entity);
        if (!rigidbody || rigidbody.useGravity || binding.bodyType !== 'dynamic') continue;
        const mass = binding.rigidBody.body.mass;
        if (mass <= 0) continue;
        binding.rigidBody.body.applyForce(
          new CANNON.Vec3(-gravity.x * mass, -gravity.y * mass, -gravity.z * mass),
          binding.rigidBody.body.position
        );
        continue;
      }

      const controllerData = getPlayerControllerData(entity);
      if (!controllerData || readBoolean(controllerData.useGravity, true)) continue;
      const mass = binding.controller.body.mass;
      if (mass <= 0) continue;
      binding.controller.body.applyForce(
        new CANNON.Vec3(-gravity.x * mass, -gravity.y * mass, -gravity.z * mass),
        binding.controller.body.position
      );
    }
  }

  private syncSimulationToStore(): void {
    const store = useEngineStore.getState();

    for (const binding of this.bindings.values()) {
      const entity = store.entities.get(binding.entityId);
      if (!entity) continue;

      const nextComponents = new Map(entity.components);
      let changed = false;

      if (binding.kind === 'rigidbody') {
        changed = this.patchRigidbodyEntity(binding, nextComponents) || changed;
      } else {
        changed = this.patchCharacterControllerEntity(binding, nextComponents) || changed;
      }

      if (changed) {
        store.updateEntityTransient(binding.entityId, { components: nextComponents });
      }
    }
  }

  private patchRigidbodyEntity(binding: RigidBodyBinding, components: Map<string, Component>): boolean {
    let changed = false;
    const transformComponent = components.get('Transform');
    if (transformComponent && binding.bodyType !== 'static') {
      const currentTransform = transformComponent.data as Partial<TransformData>;
      const nextPosition = {
        x: binding.rigidBody.body.position.x,
        y: binding.rigidBody.body.position.y,
        z: binding.rigidBody.body.position.z,
      };
      const nextRotation = {
        x: binding.rigidBody.body.quaternion.x,
        y: binding.rigidBody.body.quaternion.y,
        z: binding.rigidBody.body.quaternion.z,
        w: binding.rigidBody.body.quaternion.w,
      };
      const currentPosition = readVector3(currentTransform.position, DEFAULT_POSITION);
      const currentRotation = readQuaternion(currentTransform.rotation, DEFAULT_ROTATION);

      if (!vectorApproximatelyEqual(currentPosition, nextPosition)
        || !quaternionApproximatelyEqual(currentRotation, nextRotation)) {
        components.set('Transform', {
          ...transformComponent,
          data: {
            ...currentTransform,
            position: nextPosition,
            rotation: nextRotation,
            scale: readVector3(currentTransform.scale, DEFAULT_SCALE),
          },
        });
        changed = true;
      }
    }

    const rigidbodyComponent = components.get('Rigidbody');
    if (rigidbodyComponent) {
      const rigidbodyData = rigidbodyComponent.data as Record<string, unknown>;
      const nextVelocity = {
        x: binding.rigidBody.body.velocity.x,
        y: binding.rigidBody.body.velocity.y,
        z: binding.rigidBody.body.velocity.z,
      };
      const nextAngularVelocity = {
        x: binding.rigidBody.body.angularVelocity.x,
        y: binding.rigidBody.body.angularVelocity.y,
        z: binding.rigidBody.body.angularVelocity.z,
      };
      const currentVelocity = readVector3(rigidbodyData.velocity, DEFAULT_POSITION);
      const currentAngularVelocity = readVector3(rigidbodyData.angularVelocity, DEFAULT_POSITION);

      if (!vectorApproximatelyEqual(currentVelocity, nextVelocity)
        || !vectorApproximatelyEqual(currentAngularVelocity, nextAngularVelocity)) {
        components.set('Rigidbody', {
          ...rigidbodyComponent,
          data: {
            ...rigidbodyData,
            velocity: nextVelocity,
            angularVelocity: nextAngularVelocity,
          },
        });
        changed = true;
      }
    }

    return changed;
  }

  private patchCharacterControllerEntity(
    binding: CharacterControllerBinding,
    components: Map<string, Component>
  ): boolean {
    let changed = false;
    const transformComponent = components.get('Transform');
    if (transformComponent) {
      const currentTransform = transformComponent.data as Partial<TransformData>;
      const controllerState = binding.controller.state;
      const hasCamera = components.get('Camera')?.enabled === true;
      const controllerPitch = hasCamera
        ? readNumber((components.get('PlayerController')?.data as Record<string, unknown> | undefined)?.lookPitch, 0)
        : 0;
      const nextPosition = {
        x: binding.controller.body.position.x,
        y: binding.controller.body.position.y,
        z: binding.controller.body.position.z,
      };
      const currentPosition = readVector3(currentTransform.position, DEFAULT_POSITION);
      const nextRotation = rotationFromFacing(
        {
          x: controllerState.facingDirection.x,
          y: controllerState.facingDirection.y,
          z: controllerState.facingDirection.z,
        },
        readQuaternion(currentTransform.rotation, DEFAULT_ROTATION),
        controllerPitch
      );
      const currentRotation = readQuaternion(currentTransform.rotation, DEFAULT_ROTATION);

      if (!vectorApproximatelyEqual(currentPosition, nextPosition)
        || !quaternionApproximatelyEqual(currentRotation, nextRotation)) {
        components.set('Transform', {
          ...transformComponent,
          data: {
            ...currentTransform,
            position: nextPosition,
            rotation: nextRotation,
            scale: readVector3(currentTransform.scale, DEFAULT_SCALE),
          },
        });
        changed = true;
      }
    }

    const controllerComponent = components.get('PlayerController');
    if (controllerComponent) {
      const controllerData = controllerComponent.data as Record<string, unknown>;
      const controllerState = binding.controller.state;
      const nextVelocity = {
        x: controllerState.velocity.x,
        y: controllerState.velocity.y,
        z: controllerState.velocity.z,
      };
      const nextFacing = {
        x: controllerState.facingDirection.x,
        y: controllerState.facingDirection.y,
        z: controllerState.facingDirection.z,
      };
      const currentVelocity = readVector3(controllerData.velocity, DEFAULT_POSITION);
      const currentFacing = readVector3(controllerData.facingDirection, { x: 0, y: 0, z: 1 });

      if (!vectorApproximatelyEqual(currentVelocity, nextVelocity)
        || !vectorApproximatelyEqual(currentFacing, nextFacing)
        || readBoolean(controllerData.isGrounded) !== controllerState.isGrounded
        || readBoolean(controllerData.isJumping) !== controllerState.isJumping
        || readBoolean(controllerData.isFalling) !== controllerState.isFalling
        || readBoolean(controllerData.isWalking) !== controllerState.isWalking
        || readBoolean(controllerData.isRunning) !== controllerState.isRunning
        || readBoolean(controllerData.isCrouching) !== controllerState.isCrouching
        || (binding.jumpConsumed && readBoolean(controllerData.jumpRequested, false))) {
        components.set('PlayerController', {
          ...controllerComponent,
          data: {
            ...controllerData,
            velocity: nextVelocity,
            facingDirection: nextFacing,
            isGrounded: controllerState.isGrounded,
            isJumping: controllerState.isJumping,
            isFalling: controllerState.isFalling,
            isWalking: controllerState.isWalking,
            isRunning: controllerState.isRunning,
            isCrouching: controllerState.isCrouching,
            jumpRequested: binding.jumpConsumed ? false : readBoolean(controllerData.jumpRequested, false),
          },
        });
        changed = true;
      }
      binding.jumpConsumed = false;
    }

    return changed;
  }

  private disposeRuntime(restoreAuthoredState: boolean): void {
    if (restoreAuthoredState) {
      this.restoreAuthoredState();
    }

    for (const binding of this.bindings.values()) {
      if (binding.kind === 'rigidbody') {
        binding.colliders.forEach((collider) => collider.destroy());
        binding.rigidBody.destroy();
        continue;
      }
      binding.controller.destroy();
    }

    this.bindings.clear();
    this.authoredSnapshots.clear();
    this.world = null;
    this.structureSignature = '';
    this.accumulator = 0;
  }

  private restoreAuthoredState(): void {
    if (this.authoredSnapshots.size === 0) return;

    const store = useEngineStore.getState();
    for (const [entityId, snapshot] of this.authoredSnapshots.entries()) {
      const entity = store.entities.get(entityId);
      if (!entity) continue;

      const nextComponents = new Map(entity.components);
      snapshot.components.forEach((component, key) => {
        if (component) {
          nextComponents.set(key, cloneComponent(component)!);
        } else {
          nextComponents.delete(key);
        }
      });

      store.updateEntityTransient(entityId, { components: nextComponents });
    }
  }
}

export const physicsRuntimeBridge = new PhysicsRuntimeBridge();
