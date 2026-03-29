// ============================================
// Rigid Body Component
// REY30 3D Engine
// ============================================

import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { v4 as uuidv4 } from 'uuid';
import type { Collider } from './Collider';

/**
 * Rigid body types
 */
export type RigidBodyType = 'static' | 'dynamic' | 'kinematic';

/**
 * Options for creating a rigid body
 */
export interface RigidBodyOptions {
  /** Body type: static, dynamic, or kinematic */
  type?: RigidBodyType;
  /** Mass in kg (only for dynamic bodies) */
  mass?: number;
  /** Initial position [x, y, z] */
  position?: [number, number, number];
  /** Initial rotation as Euler angles [x, y, z] in radians */
  rotation?: [number, number, number];
  /** Initial quaternion [x, y, z, w] */
  quaternion?: [number, number, number, number];
  /** Linear velocity [x, y, z] */
  velocity?: [number, number, number];
  /** Angular velocity [x, y, z] */
  angularVelocity?: [number, number, number];
  /** Linear damping (drag) */
  linearDamping?: number;
  /** Angular damping (rotational drag) */
  angularDamping?: number;
  /** Enable/disable gravity */
  useGravity?: boolean;
  /** Fixed rotation on X axis */
  fixedRotationX?: boolean;
  /** Fixed rotation on Y axis */
  fixedRotationY?: boolean;
  /** Fixed rotation on Z axis */
  fixedRotationZ?: boolean;
  /** Collision group */
  collisionGroup?: number;
  /** Collision mask */
  collisionMask?: number;
  /** Entity ID for ECS integration */
  entityId?: string;
  /** User data */
  userData?: Record<string, unknown>;
}

/**
 * Collision callback data
 */
export interface CollisionCallbackData {
  /** The other body involved in collision */
  body: RigidBody;
  /** Contact point in world coordinates */
  contactPoint: THREE.Vector3;
  /** Contact normal (direction of collision) */
  contactNormal: THREE.Vector3;
  /** Impact velocity */
  impactVelocity: number;
}

/**
 * Trigger callback data
 */
export interface TriggerCallbackData {
  /** The other body that entered/exited trigger */
  body: RigidBody;
  /** Trigger event type */
  event: 'enter' | 'exit' | 'stay';
}

/**
 * RigidBody - Physics body component for entities
 * 
 * Represents a physical body that can be simulated by the physics engine.
 * Supports static, dynamic, and kinematic body types.
 * 
 * @example
 * ```typescript
 * // Create a dynamic rigid body
 * const body = new RigidBody(world, {
 *   type: 'dynamic',
 *   mass: 10,
 *   position: [0, 10, 0],
 *   linearDamping: 0.1
 * });
 * 
 * // Apply forces
 * body.applyForce([0, 100, 0]);
 * body.applyImpulse([0, 50, 0]);
 * 
 * // Listen for collisions
 * body.onCollision = (data) => {
 *   console.log('Collided with:', data.body.id);
 * };
 * ```
 */
export class RigidBody {
  /** Unique identifier */
  readonly id: string;
  
  /** Entity ID for ECS integration */
  entityId: string | null = null;
  
  /** Cannon.js body instance */
  readonly body: CANNON.Body;
  
  /** Associated colliders */
  colliders: Collider[] = [];
  
  /** Associated Three.js mesh for rendering */
  mesh: THREE.Object3D | null = null;
  
  /** User data for custom properties */
  userData: Record<string, unknown> = {};
  
  /** Collision callback */
  onCollision: ((data: CollisionCallbackData) => void) | null = null;
  
  /** Trigger enter callback */
  onTriggerEnter: ((data: TriggerCallbackData) => void) | null = null;
  
  /** Trigger exit callback */
  onTriggerExit: ((data: TriggerCallbackData) => void) | null = null;
  
  /** Trigger stay callback */
  onTriggerStay: ((data: TriggerCallbackData) => void) | null = null;
  
  /** Is this body a trigger? */
  isTrigger: boolean = false;
  
  /** Active state */
  active: boolean = true;
  
  private world: CANNON.World;
  private bodyType: RigidBodyType;
  
  constructor(world: CANNON.World, options: RigidBodyOptions = {}) {
    this.id = uuidv4();
    this.world = world;
    this.bodyType = options.type || 'dynamic';
    this.entityId = options.entityId || null;
    this.userData = options.userData || {};
    
    // Calculate mass based on type
    let mass = options.mass ?? 1;
    if (this.bodyType === 'static') {
      mass = 0; // Static bodies have zero mass
    } else if (this.bodyType === 'kinematic') {
      mass = 0; // Kinematic bodies also have zero mass
    }
    
    // Create Cannon.js body
    this.body = new CANNON.Body({
      mass,
      position: options.position ? new CANNON.Vec3(...options.position) : undefined,
      quaternion: options.quaternion 
        ? new CANNON.Quaternion(...options.quaternion)
        : options.rotation 
          ? new CANNON.Quaternion().setFromEuler(...options.rotation)
          : undefined,
      velocity: options.velocity ? new CANNON.Vec3(...options.velocity) : undefined,
      angularVelocity: options.angularVelocity 
        ? new CANNON.Vec3(...options.angularVelocity) 
        : undefined,
      linearDamping: options.linearDamping ?? 0.01,
      angularDamping: options.angularDamping ?? 0.01,
      fixedRotation: false,
      collisionFilterGroup: options.collisionGroup,
      collisionFilterMask: options.collisionMask
    });
    
    // Set type-specific properties
    if (this.bodyType === 'kinematic') {
      this.body.type = CANNON.Body.KINEMATIC;
    } else if (this.bodyType === 'static') {
      this.body.type = CANNON.Body.STATIC;
    }
    
    // Fixed rotation
    if (options.fixedRotationX || options.fixedRotationY || options.fixedRotationZ) {
      this.body.fixedRotation = true;
      this.body.updateMassProperties();
    }
    
    // Gravity
    if (options.useGravity === false) {
      this.body.mass = 0;
      this.body.updateMassProperties();
    }
    
    // Store reference to this RigidBody in the Cannon body
    (this.body as any).rigidBodyRef = this;
    
    // Add to world
    world.addBody(this.body);
  }
  
  /**
   * Get body type
   */
  get type(): RigidBodyType {
    return this.bodyType;
  }
  
  /**
   * Get mass
   */
  get mass(): number {
    return this.body.mass;
  }
  
  /**
   * Set mass (only for dynamic bodies)
   */
  set mass(value: number) {
    if (this.bodyType === 'dynamic') {
      this.body.mass = value;
      this.body.updateMassProperties();
    }
  }
  
  /**
   * Get position as THREE.Vector3
   */
  get position(): THREE.Vector3 {
    return new THREE.Vector3(
      this.body.position.x,
      this.body.position.y,
      this.body.position.z
    );
  }
  
  /**
   * Set position
   */
  set position(value: THREE.Vector3) {
    this.body.position.set(value.x, value.y, value.z);
  }
  
  /**
   * Get quaternion as THREE.Quaternion
   */
  get quaternion(): THREE.Quaternion {
    return new THREE.Quaternion(
      this.body.quaternion.x,
      this.body.quaternion.y,
      this.body.quaternion.z,
      this.body.quaternion.w
    );
  }
  
  /**
   * Set quaternion
   */
  set quaternion(value: THREE.Quaternion) {
    this.body.quaternion.set(value.x, value.y, value.z, value.w);
  }
  
  /**
   * Get velocity as THREE.Vector3
   */
  get velocity(): THREE.Vector3 {
    return new THREE.Vector3(
      this.body.velocity.x,
      this.body.velocity.y,
      this.body.velocity.z
    );
  }
  
  /**
   * Set velocity
   */
  set velocity(value: THREE.Vector3) {
    this.body.velocity.set(value.x, value.y, value.z);
  }
  
  /**
   * Get angular velocity as THREE.Vector3
   */
  get angularVelocity(): THREE.Vector3 {
    return new THREE.Vector3(
      this.body.angularVelocity.x,
      this.body.angularVelocity.y,
      this.body.angularVelocity.z
    );
  }
  
  /**
   * Set angular velocity
   */
  set angularVelocity(value: THREE.Vector3) {
    this.body.angularVelocity.set(value.x, value.y, value.z);
  }
  
  /**
   * Get linear damping
   */
  get linearDamping(): number {
    return this.body.linearDamping;
  }
  
  /**
   * Set linear damping
   */
  set linearDamping(value: number) {
    this.body.linearDamping = value;
  }
  
  /**
   * Get angular damping
   */
  get angularDamping(): number {
    return this.body.angularDamping;
  }
  
  /**
   * Set angular damping
   */
  set angularDamping(value: number) {
    this.body.angularDamping = value;
  }
  
  /**
   * Add a collider to this body
   */
  addCollider(collider: Collider): void {
    this.colliders.push(collider);
  }
  
  /**
   * Remove a collider from this body
   */
  removeCollider(collider: Collider): void {
    const index = this.colliders.indexOf(collider);
    if (index > -1) {
      this.colliders.splice(index, 1);
    }
  }
  
  /**
   * Apply a force to the body at a given point
   * @param force Force vector [x, y, z]
   * @param worldPoint Point to apply force at (optional, defaults to center of mass)
   */
  applyForce(force: [number, number, number], worldPoint?: [number, number, number]): void {
    const f = new CANNON.Vec3(...force);
    if (worldPoint) {
      const p = new CANNON.Vec3(...worldPoint);
      this.body.applyForce(f, p);
    } else {
      this.body.applyForce(f);
    }
  }
  
  /**
   * Apply a force at a local point on the body
   * @param force Force vector [x, y, z]
   * @param localPoint Local point to apply force at
   */
  applyForceAtLocalPoint(force: [number, number, number], localPoint: [number, number, number]): void {
    const f = new CANNON.Vec3(...force);
    const p = new CANNON.Vec3(...localPoint);
    const worldPoint = new CANNON.Vec3();
    this.body.pointToWorldFrame(p, worldPoint);
    this.body.applyForce(f, worldPoint);
  }
  
  /**
   * Apply an impulse to the body
   * @param impulse Impulse vector [x, y, z]
   * @param worldPoint Point to apply impulse at (optional, defaults to center of mass)
   */
  applyImpulse(impulse: [number, number, number], worldPoint?: [number, number, number]): void {
    const i = new CANNON.Vec3(...impulse);
    if (worldPoint) {
      const p = new CANNON.Vec3(...worldPoint);
      this.body.applyImpulse(i, p);
    } else {
      this.body.applyImpulse(i);
    }
  }
  
  /**
   * Apply an impulse at a local point on the body
   * @param impulse Impulse vector [x, y, z]
   * @param localPoint Local point to apply impulse at
   */
  applyImpulseAtLocalPoint(impulse: [number, number, number], localPoint: [number, number, number]): void {
    const i = new CANNON.Vec3(...impulse);
    const p = new CANNON.Vec3(...localPoint);
    const worldPoint = new CANNON.Vec3();
    this.body.pointToWorldFrame(p, worldPoint);
    this.body.applyImpulse(i, worldPoint);
  }
  
  /**
   * Apply torque to the body
   * @param torque Torque vector [x, y, z]
   */
  applyTorque(torque: [number, number, number]): void {
    this.body.applyTorque(new CANNON.Vec3(...torque));
  }
  
  /**
   * Apply a torque impulse (angular impulse)
   * @param torqueImpulse Angular impulse vector [x, y, z]
   */
  applyTorqueImpulse(torqueImpulse: [number, number, number]): void {
    const t = new CANNON.Vec3(...torqueImpulse);
    const angularImpulse = new CANNON.Vec3();
    t.scale(this.body.invInertia.x, angularImpulse);
    this.body.angularVelocity.vadd(angularImpulse, this.body.angularVelocity);
  }
  
  /**
   * Set the body position
   */
  setPosition(x: number, y: number, z: number): void {
    this.body.position.set(x, y, z);
  }
  
  /**
   * Set the body rotation from Euler angles
   */
  setRotation(x: number, y: number, z: number): void {
    this.body.quaternion.setFromEuler(x, y, z);
  }
  
  /**
   * Set the body quaternion
   */
  setQuaternion(x: number, y: number, z: number, w: number): void {
    this.body.quaternion.set(x, y, z, w);
  }
  
  /**
   * Set linear velocity
   */
  setVelocity(x: number, y: number, z: number): void {
    this.body.velocity.set(x, y, z);
  }
  
  /**
   * Set angular velocity
   */
  setAngularVelocity(x: number, y: number, z: number): void {
    this.body.angularVelocity.set(x, y, z);
  }
  
  /**
   * Get velocity at a world point
   */
  getVelocityAtPoint(worldPoint: THREE.Vector3): THREE.Vector3 {
    const v = new CANNON.Vec3();
    this.body.getVelocityAtWorldPoint(
      new CANNON.Vec3(worldPoint.x, worldPoint.y, worldPoint.z),
      v
    );
    return new THREE.Vector3(v.x, v.y, v.z);
  }
  
  /**
   * Convert a world point to local point
   */
  worldToLocal(worldPoint: THREE.Vector3): THREE.Vector3 {
    const result = new CANNON.Vec3();
    this.body.pointToLocalFrame(
      new CANNON.Vec3(worldPoint.x, worldPoint.y, worldPoint.z),
      result
    );
    return new THREE.Vector3(result.x, result.y, result.z);
  }
  
  /**
   * Convert a local point to world point
   */
  localToWorld(localPoint: THREE.Vector3): THREE.Vector3 {
    const result = new CANNON.Vec3();
    this.body.pointToWorldFrame(
      new CANNON.Vec3(localPoint.x, localPoint.y, localPoint.z),
      result
    );
    return new THREE.Vector3(result.x, result.y, result.z);
  }
  
  /**
   * Convert a world direction to local direction
   */
  worldToLocalDirection(worldDir: THREE.Vector3): THREE.Vector3 {
    const result = new CANNON.Vec3();
    this.body.vectorToLocalFrame(
      new CANNON.Vec3(worldDir.x, worldDir.y, worldDir.z),
      result
    );
    return new THREE.Vector3(result.x, result.y, result.z);
  }
  
  /**
   * Convert a local direction to world direction
   */
  localToWorldDirection(localDir: THREE.Vector3): THREE.Vector3 {
    const result = new CANNON.Vec3();
    this.body.vectorToWorldFrame(
      new CANNON.Vec3(localDir.x, localDir.y, localDir.z),
      result
    );
    return new THREE.Vector3(result.x, result.y, result.z);
  }
  
  /**
   * Get the center of mass in world coordinates
   */
  getCenterOfMass(): THREE.Vector3 {
    return new THREE.Vector3(
      this.body.position.x + (this.body.shapeOffsets[0]?.x || 0),
      this.body.position.y + (this.body.shapeOffsets[0]?.y || 0),
      this.body.position.z + (this.body.shapeOffsets[0]?.z || 0)
    );
  }
  
  /**
   * Get AABB (Axis Aligned Bounding Box)
   */
  getAABB(): { min: THREE.Vector3; max: THREE.Vector3 } {
    const aabb = new CANNON.AABB();
    this.body.aabb = aabb;
    
    return {
      min: new THREE.Vector3(aabb.lowerBound.x, aabb.lowerBound.y, aabb.lowerBound.z),
      max: new THREE.Vector3(aabb.upperBound.x, aabb.upperBound.y, aabb.upperBound.z)
    };
  }
  
  /**
   * Sleep the body (stop simulation)
   */
  sleep(): void {
    this.body.sleep();
  }
  
  /**
   * Wake the body (resume simulation)
   */
  wake(): void {
    this.body.wakeUp();
  }
  
  /**
   * Check if body is sleeping
   */
  get isSleeping(): boolean {
    return this.body.sleepState === CANNON.Body.SLEEPING;
  }
  
  /**
   * Enable/disable sleeping
   */
  set allowSleep(value: boolean) {
    this.body.allowSleep = value;
  }
  
  get allowSleep(): boolean {
    return this.body.allowSleep;
  }
  
  /**
   * Set sleep speed threshold
   */
  set sleepSpeedLimit(value: number) {
    this.body.sleepSpeedLimit = value;
  }
  
  get sleepSpeedLimit(): number {
    return this.body.sleepSpeedLimit;
  }
  
  /**
   * Set sleep time threshold
   */
  set sleepTimeLimit(value: number) {
    this.body.sleepTimeLimit = value;
  }
  
  get sleepTimeLimit(): number {
    return this.body.sleepTimeLimit;
  }
  
  /**
   * Set collision filter group
   */
  setCollisionGroup(group: number): void {
    this.body.collisionFilterGroup = group;
  }
  
  /**
   * Set collision filter mask
   */
  setCollisionMask(mask: number): void {
    this.body.collisionFilterMask = mask;
  }
  
  /**
   * Set whether this body responds to gravity
   */
  set useGravity(value: boolean) {
    if (value) {
      // Restore mass for gravity
      if (this.bodyType === 'dynamic' && this.body.mass === 0) {
        this.body.mass = 1;
        this.body.updateMassProperties();
      }
    } else {
      // Disable gravity by setting mass to 0 temporarily
      this.body.mass = 0;
      this.body.updateMassProperties();
    }
  }
  
  /**
   * Check if the body has been moved since last frame
   */
  get hasMoved(): boolean {
    return this.body.sleepState !== CANNON.Body.SLEEPING;
  }
  
  /**
   * Sync a Three.js mesh with this body
   */
  syncMesh(mesh: THREE.Object3D): void {
    mesh.position.copy(this.position);
    mesh.quaternion.copy(this.quaternion);
  }
  
  /**
   * Update this body from a Three.js mesh
   */
  syncFromMesh(mesh: THREE.Object3D): void {
    this.position.copy(mesh.position);
    this.quaternion.copy(mesh.quaternion);
  }
  
  /**
   * Destroy this rigid body
   */
  destroy(): void {
    this.world.removeBody(this.body);
    this.colliders = [];
    this.mesh = null;
    this.onCollision = null;
    this.onTriggerEnter = null;
    this.onTriggerExit = null;
    this.onTriggerStay = null;
  }
  
  /**
   * Serialize to JSON
   */
  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      type: this.bodyType,
      mass: this.mass,
      position: [this.body.position.x, this.body.position.y, this.body.position.z],
      quaternion: [this.body.quaternion.x, this.body.quaternion.y, this.body.quaternion.z, this.body.quaternion.w],
      velocity: [this.body.velocity.x, this.body.velocity.y, this.body.velocity.z],
      angularVelocity: [this.body.angularVelocity.x, this.body.angularVelocity.y, this.body.angularVelocity.z],
      linearDamping: this.linearDamping,
      angularDamping: this.angularDamping,
      entityId: this.entityId,
      userData: this.userData,
      isTrigger: this.isTrigger,
      active: this.active
    };
  }
  
  /**
   * Create from JSON
   */
  static fromJSON(world: CANNON.World, data: Record<string, unknown>): RigidBody {
    const body = new RigidBody(world, {
      type: data.type as RigidBodyType,
      mass: data.mass as number,
      position: data.position as [number, number, number],
      quaternion: data.quaternion as [number, number, number, number],
      velocity: data.velocity as [number, number, number],
      angularVelocity: data.angularVelocity as [number, number, number],
      linearDamping: data.linearDamping as number,
      angularDamping: data.angularDamping as number,
      entityId: data.entityId as string,
      userData: data.userData as Record<string, unknown>
    });
    
    body.isTrigger = data.isTrigger as boolean;
    body.active = data.active as boolean;
    
    return body;
  }
}
