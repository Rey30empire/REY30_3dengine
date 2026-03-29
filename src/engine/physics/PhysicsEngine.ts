// ============================================
// Physics Engine - Core Physics System
// REY30 3D Engine
// ============================================

import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { RigidBody, type RigidBodyOptions } from './RigidBody';
import { Collider, type ColliderOptions } from './Collider';
import { CharacterController, type CharacterControllerOptions } from './CharacterController';
import { createJoint, type JointOptions, type Joint } from './Joint';

/**
 * Configuration options for the Physics Engine
 */
export interface PhysicsEngineOptions {
  /** Gravity vector (default: [0, -9.81, 0]) */
  gravity?: [number, number, number];
  /** Fixed timestep for physics simulation (default: 1/60) */
  fixedTimeStep?: number;
  /** Maximum number of steps per frame (default: 3) */
  maxSubSteps?: number;
  /** Enable debug rendering */
  debug?: boolean;
  /** Broadphase algorithm */
  broadphase?: 'naive' | 'sap';
  /** Enable collision events */
  enableCollisionEvents?: boolean;
}

/**
 * Collision event data
 */
export interface CollisionEvent {
  bodyA: RigidBody;
  bodyB: RigidBody;
  contactPoint: THREE.Vector3;
  contactNormal: THREE.Vector3;
  impactVelocity: number;
}

/**
 * Physics debug renderer options
 */
export interface DebugRendererOptions {
  color?: number;
  opacity?: number;
  showColliders?: boolean;
  showConstraints?: boolean;
  showContacts?: boolean;
}

/**
 * Physics Engine - Main physics world manager
 * 
 * @example
 * ```typescript
 * const physics = new PhysicsEngine();
 * physics.initialize({ gravity: [0, -9.81, 0] });
 * 
 * // Create rigid body
 * const body = physics.createRigidBody({
 *   type: 'dynamic',
 *   mass: 1,
 *   position: [0, 10, 0],
 *   shape: { type: 'box', size: [1, 1, 1] }
 * });
 * 
 * // In game loop
 * physics.update(deltaTime);
 * physics.syncThreeJs(threeScene);
 * ```
 */
export class PhysicsEngine {
  private world: CANNON.World | null = null;
  private bodies: Map<string, CANNON.Body> = new Map();
  private bodyToRigidBody: Map<CANNON.Body, RigidBody> = new Map();
  private characterControllers: Map<string, CharacterController> = new Map();
  private jointInstances: Map<string, Joint> = new Map();
  private joints: Map<string, CANNON.Constraint> = new Map();
  
  private fixedTimeStep: number = 1 / 60;
  private maxSubSteps: number = 3;
  private accumulator: number = 0;
  private isInitialized: boolean = false;
  
  private debugRenderer: THREE.LineSegments | null = null;
  private debugEnabled: boolean = false;
  
  private eventTarget: CANNON.EventTarget = new CANNON.EventTarget();
  
  constructor() {}
  
  /**
   * Initialize the physics world
   */
  initialize(options: PhysicsEngineOptions = {}): void {
    const {
      gravity = [0, -9.81, 0],
      fixedTimeStep = 1 / 60,
      maxSubSteps = 3,
      debug = false,
      broadphase = 'sap',
      enableCollisionEvents = true
    } = options;
    
    // Create physics world
    this.world = new CANNON.World();
    this.world.gravity.set(...gravity);
    
    // Configure broadphase
    if (broadphase === 'sap') {
      this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    } else {
      this.world.broadphase = new CANNON.NaiveBroadphase();
    }
    
    // Enable collision events
    if (enableCollisionEvents) {
      this.world.addEventListener('postStep', this.handleCollisions.bind(this));
    }
    
    this.fixedTimeStep = fixedTimeStep;
    this.maxSubSteps = maxSubSteps;
    this.debugEnabled = debug;
    this.isInitialized = true;
    
    console.log('[PhysicsEngine] Initialized with gravity:', gravity);
  }
  
  /**
   * Set gravity vector
   */
  setGravity(x: number, y: number, z: number): void {
    if (!this.world) return;
    this.world.gravity.set(x, y, z);
  }
  
  /**
   * Get gravity vector
   */
  getGravity(): THREE.Vector3 {
    if (!this.world) return new THREE.Vector3(0, -9.81, 0);
    return new THREE.Vector3(
      this.world.gravity.x,
      this.world.gravity.y,
      this.world.gravity.z
    );
  }
  
  /**
   * Create a rigid body
   */
  createRigidBody(options: RigidBodyOptions): RigidBody;
  
  /**
   * Create a rigid body with shape
   */
  createRigidBody(options: RigidBodyOptions & { shape: ColliderOptions }): RigidBody;
  
  createRigidBody(options: RigidBodyOptions & { shape?: ColliderOptions }): RigidBody {
    if (!this.world) {
      throw new Error('[PhysicsEngine] Not initialized. Call initialize() first.');
    }
    
    const body = new RigidBody(this.world, options);
    this.bodies.set(body.id, body.body);
    this.bodyToRigidBody.set(body.body, body);
    
    // Add shape if provided
    if (options.shape) {
      const collider = new Collider(this.world, options.shape, body.body);
      body.addCollider(collider);
    }
    
    return body;
  }
  
  /**
   * Remove a rigid body
   */
  removeRigidBody(bodyId: string): void {
    const body = this.bodies.get(bodyId);
    if (body && this.world) {
      this.world.removeBody(body);
      this.bodies.delete(bodyId);
      this.bodyToRigidBody.delete(body);
    }
  }
  
  /**
   * Get rigid body by ID
   */
  getRigidBody(bodyId: string): RigidBody | undefined {
    const body = this.bodies.get(bodyId);
    if (!body) return undefined;
    return this.bodyToRigidBody.get(body);
  }
  
  /**
   * Create a character controller
   */
  createCharacterController(options: CharacterControllerOptions): CharacterController {
    if (!this.world) {
      throw new Error('[PhysicsEngine] Not initialized. Call initialize() first.');
    }
    
    const controller = new CharacterController(this.world, options);
    this.characterControllers.set(controller.id, controller);
    
    return controller;
  }
  
  /**
   * Remove a character controller
   */
  removeCharacterController(controllerId: string): void {
    const controller = this.characterControllers.get(controllerId);
    if (controller) {
      controller.destroy();
      this.characterControllers.delete(controllerId);
    }
  }
  
  /**
   * Create a joint between two bodies
   */
  createJoint(options: JointOptions): Joint {
    if (!this.world) {
      throw new Error('[PhysicsEngine] Not initialized. Call initialize() first.');
    }
    
    const joint = createJoint(this.world, options);
    const jointId = options.id || `joint_${Date.now()}`;
    this.joints.set(jointId, joint.constraint);
    this.jointInstances.set(jointId, joint);
    
    return joint;
  }
  
  /**
   * Remove a joint
   */
  removeJoint(jointId: string): void {
    const joint = this.joints.get(jointId);
    if (joint && this.world) {
      this.world.removeConstraint(joint);
      this.joints.delete(jointId);
    }
  }
  
  /**
   * Perform a raycast
   */
  raycast(
    from: THREE.Vector3,
    to: THREE.Vector3,
    options?: { mask?: number; skipBackfaces?: boolean }
  ): { hit: boolean; point?: THREE.Vector3; normal?: THREE.Vector3; body?: RigidBody; distance?: number } {
    if (!this.world) return { hit: false };
    
    const ray = new CANNON.Ray(
      new CANNON.Vec3(from.x, from.y, from.z),
      new CANNON.Vec3(to.x, to.y, to.z)
    );
    
    ray.mode = CANNON.Ray.CLOSEST;
    ray.skipBackfaces = options?.skipBackfaces ?? true;
    
    const result = new CANNON.RaycastResult();
    ray.intersectWorld(this.world, {
      mode: CANNON.Ray.CLOSEST,
      result: result,
      collisionFilterMask: options?.mask
    });
    
    if (result.hasHit) {
      return {
        hit: true,
        point: new THREE.Vector3(
          result.hitPointWorld.x,
          result.hitPointWorld.y,
          result.hitPointWorld.z
        ),
        normal: new THREE.Vector3(
          result.hitNormalWorld.x,
          result.hitNormalWorld.y,
          result.hitNormalWorld.z
        ),
        body: result.body ? this.bodyToRigidBody.get(result.body as CANNON.Body) : undefined,
        distance: result.distance
      };
    }
    
    return { hit: false };
  }
  
  /**
   * Perform a raycast and get all hits
   */
  raycastAll(
    from: THREE.Vector3,
    to: THREE.Vector3,
    options?: { mask?: number }
  ): Array<{ point: THREE.Vector3; normal: THREE.Vector3; body: RigidBody; distance: number }> {
    if (!this.world) return [];
    
    const results: Array<{ point: THREE.Vector3; normal: THREE.Vector3; body: RigidBody; distance: number }> = [];
    
    const ray = new CANNON.Ray(
      new CANNON.Vec3(from.x, from.y, from.z),
      new CANNON.Vec3(to.x, to.y, to.z)
    );
    
    ray.intersectWorld(this.world, {
      mode: CANNON.Ray.ALL,
      callback: (result: CANNON.RaycastResult) => {
        if (result.hasHit && result.body) {
          results.push({
            point: new THREE.Vector3(
              result.hitPointWorld.x,
              result.hitPointWorld.y,
              result.hitPointWorld.z
            ),
            normal: new THREE.Vector3(
              result.hitNormalWorld.x,
              result.hitNormalWorld.y,
              result.hitNormalWorld.z
            ),
            body: this.bodyToRigidBody.get(result.body as CANNON.Body)!,
            distance: result.distance
          });
        }
      },
      collisionFilterMask: options?.mask
    });
    
    return results.sort((a, b) => a.distance - b.distance);
  }
  
  /**
   * Sphere cast - sweep a sphere along a ray
   */
  sphereCast(
    from: THREE.Vector3,
    to: THREE.Vector3,
    radius: number,
    options?: { mask?: number }
  ): { hit: boolean; point?: THREE.Vector3; normal?: THREE.Vector3; body?: RigidBody; distance?: number } {
    if (!this.world) return { hit: false };
    
    // Create a temporary sphere body
    const sphereShape = new CANNON.Sphere(radius);
    const tempBody = new CANNON.Body({ mass: 0 });
    tempBody.addShape(sphereShape);
    tempBody.position.set(from.x, from.y, from.z);
    
    // Use ray with sphere shape for sweep
    const ray = new CANNON.Ray(
      new CANNON.Vec3(from.x, from.y, from.z),
      new CANNON.Vec3(to.x, to.y, to.z)
    );
    
    const result = new CANNON.RaycastResult();
    
    // Sweep test
    this.world.raycastClosest(
      new CANNON.Vec3(from.x, from.y, from.z),
      new CANNON.Vec3(to.x, to.y, to.z),
      { collisionFilterMask: options?.mask, skipBackfaces: true },
      result
    );
    
    if (result.hasHit) {
      return {
        hit: true,
        point: new THREE.Vector3(
          result.hitPointWorld.x,
          result.hitPointWorld.y,
          result.hitPointWorld.z
        ),
        normal: new THREE.Vector3(
          result.hitNormalWorld.x,
          result.hitNormalWorld.y,
          result.hitNormalWorld.z
        ),
        body: result.body ? this.bodyToRigidBody.get(result.body as CANNON.Body) : undefined,
        distance: result.distance
      };
    }
    
    return { hit: false };
  }
  
  /**
   * Overlap sphere - find all bodies within a sphere
   */
  overlapSphere(
    position: THREE.Vector3,
    radius: number
  ): RigidBody[] {
    if (!this.world) return [];
    
    const results: RigidBody[] = [];
    const sphere = new CANNON.Sphere(radius);
    const pos = new CANNON.Vec3(position.x, position.y, position.z);
    
    // Iterate through all bodies and check distance
    this.bodies.forEach((body) => {
      const distance = body.position.distanceTo(pos);
      const bodyRadius = this.getBoundingRadius(body);
      
      if (distance < radius + bodyRadius) {
        const rigidBody = this.bodyToRigidBody.get(body);
        if (rigidBody) results.push(rigidBody);
      }
    });
    
    return results;
  }
  
  /**
   * Overlap box - find all bodies within a box
   */
  overlapBox(
    position: THREE.Vector3,
    halfExtents: THREE.Vector3,
    rotation?: THREE.Quaternion
  ): RigidBody[] {
    if (!this.world) return [];
    
    const results: RigidBody[] = [];
    const box = new CANNON.Box(new CANNON.Vec3(
      halfExtents.x,
      halfExtents.y,
      halfExtents.z
    ));
    
    // Simple AABB check for now
    this.bodies.forEach((body) => {
      const bodyPos = new THREE.Vector3(body.position.x, body.position.y, body.position.z);
      const boxPos = position;
      
      // Simple distance check
      if (bodyPos.distanceTo(boxPos) < halfExtents.length() * 2) {
        const rigidBody = this.bodyToRigidBody.get(body);
        if (rigidBody) results.push(rigidBody);
      }
    });
    
    return results;
  }
  
  /**
   * Update physics simulation
   */
  update(deltaTime: number): void {
    if (!this.world || !this.isInitialized) return;
    
    // Fixed timestep accumulator
    this.accumulator += deltaTime;
    
    const steps = Math.floor(this.accumulator / this.fixedTimeStep);
    const clampedSteps = Math.min(steps, this.maxSubSteps);
    
    for (let i = 0; i < clampedSteps; i++) {
      this.world.step(this.fixedTimeStep, deltaTime, this.maxSubSteps);
    }
    
    this.accumulator -= clampedSteps * this.fixedTimeStep;
    
    // Update character controllers
    this.characterControllers.forEach((controller) => {
      controller.update(deltaTime);
    });
  }
  
  /**
   * Sync Three.js meshes with physics bodies
   */
  syncThreeJs(scene: THREE.Scene): void {
    this.bodies.forEach((body, id) => {
      const rigidBody = this.bodyToRigidBody.get(body);
      if (rigidBody && rigidBody.mesh) {
        rigidBody.mesh.position.set(
          body.position.x,
          body.position.y,
          body.position.z
        );
        rigidBody.mesh.quaternion.set(
          body.quaternion.x,
          body.quaternion.y,
          body.quaternion.z,
          body.quaternion.w
        );
      }
    });
  }
  
  /**
   * Sync a single Three.js mesh with its physics body
   */
  syncMesh(mesh: THREE.Object3D, body: RigidBody): void {
    mesh.position.set(
      body.position.x,
      body.position.y,
      body.position.z
    );
    mesh.quaternion.set(
      body.quaternion.x,
      body.quaternion.y,
      body.quaternion.z,
      body.quaternion.w
    );
  }
  
  /**
   * Set mesh for a rigid body (for automatic sync)
   */
  setBodyMesh(bodyId: string, mesh: THREE.Object3D): void {
    const rigidBody = this.getRigidBody(bodyId);
    if (rigidBody) {
      rigidBody.mesh = mesh;
    }
  }
  
  /**
   * Create debug renderer
   */
  createDebugRenderer(scene: THREE.Scene, options: DebugRendererOptions = {}): void {
    if (this.debugRenderer) {
      scene.remove(this.debugRenderer);
    }
    
    const {
      color = 0x00ff00,
      opacity = 0.5,
      showColliders = true
    } = options;
    
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.LineBasicMaterial({
      color,
      opacity,
      transparent: true
    });
    
    this.debugRenderer = new THREE.LineSegments(geometry, material);
    scene.add(this.debugRenderer);
    this.debugEnabled = true;
  }
  
  /**
   * Update debug renderer
   */
  updateDebugRenderer(): void {
    if (!this.debugRenderer || !this.world) return;
    
    const vertices: number[] = [];
    
    this.bodies.forEach((body) => {
      body.shapes.forEach((shape) => {
        this.drawShapeDebug(body, shape, vertices);
      });
    });
    
    const geometry = this.debugRenderer.geometry as THREE.BufferGeometry;
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(vertices, 3)
    );
  }
  
  /**
   * Draw shape debug lines
   */
  private drawShapeDebug(body: CANNON.Body, shape: CANNON.Shape, vertices: number[]): void {
    const shapeOffset = (shape as any).offset || new CANNON.Vec3(0, 0, 0);
    const shapeQuat = (shape as any).orientation || new CANNON.Quaternion(0, 0, 0, 1);
    
    if (shape instanceof CANNON.Box) {
      const hx = shape.halfExtents.x;
      const hy = shape.halfExtents.y;
      const hz = shape.halfExtents.z;
      
      const corners = [
        [-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz],
        [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]
      ];
      
      const edges = [
        [0, 1], [1, 2], [2, 3], [3, 0],
        [4, 5], [5, 6], [6, 7], [7, 4],
        [0, 4], [1, 5], [2, 6], [3, 7]
      ];
      
      edges.forEach(([a, b]) => {
        const worldA = new CANNON.Vec3(...corners[a] as [number, number, number]);
        const worldB = new CANNON.Vec3(...corners[b] as [number, number, number]);
        
        shapeQuat.vmult(worldA, worldA);
        shapeQuat.vmult(worldB, worldB);
        worldA.vadd(shapeOffset, worldA);
        worldB.vadd(shapeOffset, worldB);
        body.quaternion.vmult(worldA, worldA);
        body.quaternion.vmult(worldB, worldB);
        worldA.vadd(body.position, worldA);
        worldB.vadd(body.position, worldB);
        
        vertices.push(worldA.x, worldA.y, worldA.z);
        vertices.push(worldB.x, worldB.y, worldB.z);
      });
    } else if (shape instanceof CANNON.Sphere) {
      const segments = 8;
      const radius = shape.radius;
      
      for (let i = 0; i < segments; i++) {
        const theta1 = (i / segments) * Math.PI * 2;
        const theta2 = ((i + 1) / segments) * Math.PI * 2;
        
        // XY circle
        vertices.push(
          body.position.x + radius * Math.cos(theta1),
          body.position.y + radius * Math.sin(theta1),
          body.position.z
        );
        vertices.push(
          body.position.x + radius * Math.cos(theta2),
          body.position.y + radius * Math.sin(theta2),
          body.position.z
        );
        
        // XZ circle
        vertices.push(
          body.position.x + radius * Math.cos(theta1),
          body.position.y,
          body.position.z + radius * Math.sin(theta1)
        );
        vertices.push(
          body.position.x + radius * Math.cos(theta2),
          body.position.y,
          body.position.z + radius * Math.sin(theta2)
        );
        
        // YZ circle
        vertices.push(
          body.position.x,
          body.position.y + radius * Math.cos(theta1),
          body.position.z + radius * Math.sin(theta1)
        );
        vertices.push(
          body.position.x,
          body.position.y + radius * Math.cos(theta2),
          body.position.z + radius * Math.sin(theta2)
        );
      }
    }
  }
  
  /**
   * Handle collision events
   */
  private handleCollisions(): void {
    this.bodies.forEach((body) => {
      const rigidBody = this.bodyToRigidBody.get(body);
      if (!rigidBody) return;
      
      body.addEventListener('collide', (event: { body: CANNON.Body; contact: CANNON.ContactEquation }) => {
        const otherBody = event.body;
        const otherRigidBody = this.bodyToRigidBody.get(otherBody);
        
        if (otherRigidBody && rigidBody.onCollision) {
          const contactPoint = event.contact.bi.position.clone();
          contactPoint.vadd(event.contact.bj.position, contactPoint);
          contactPoint.scale(0.5, contactPoint);
          
          rigidBody.onCollision({
            body: otherRigidBody,
            contactPoint: new THREE.Vector3(
              contactPoint.x,
              contactPoint.y,
              contactPoint.z
            ),
            contactNormal: new THREE.Vector3(
              event.contact.ni.x,
              event.contact.ni.y,
              event.contact.ni.z
            ),
            impactVelocity: 0
          });
        }
      });
    });
  }
  
  /**
   * Get bounding radius of a body
   */
  private getBoundingRadius(body: CANNON.Body): number {
    let maxRadius = 0;
    body.shapes.forEach((shape) => {
      if (shape instanceof CANNON.Sphere) {
        maxRadius = Math.max(maxRadius, shape.radius);
      } else if (shape instanceof CANNON.Box) {
        const he = shape.halfExtents;
        maxRadius = Math.max(maxRadius, Math.sqrt(he.x * he.x + he.y * he.y + he.z * he.z));
      } else if (shape instanceof CANNON.Cylinder) {
        maxRadius = Math.max(maxRadius, Math.max(shape.radiusTop, shape.radiusBottom));
      }
    });
    return maxRadius;
  }
  
  /**
   * Get all rigid bodies
   */
  getAllRigidBodies(): RigidBody[] {
    return Array.from(this.bodyToRigidBody.values());
  }
  
  /**
   * Get all character controllers
   */
  getAllCharacterControllers(): CharacterController[] {
    return Array.from(this.characterControllers.values());
  }
  
  /**
   * Clear all physics objects
   */
  clear(): void {
    if (!this.world) return;
    
    this.bodies.forEach((body, id) => {
      this.world!.removeBody(body);
    });
    
    this.bodies.clear();
    this.bodyToRigidBody.clear();
    this.characterControllers.forEach((controller) => controller.destroy());
    this.characterControllers.clear();
    this.joints.forEach((joint) => this.world!.removeConstraint(joint));
    this.joints.clear();
  }
  
  /**
   * Destroy physics engine
   */
  destroy(): void {
    this.clear();
    this.world = null;
    this.isInitialized = false;
    
    if (this.debugRenderer && this.debugRenderer.parent) {
      this.debugRenderer.parent.remove(this.debugRenderer);
      this.debugRenderer.geometry.dispose();
      (this.debugRenderer.material as THREE.Material).dispose();
      this.debugRenderer = null;
    }
  }
  
  /**
   * Check if engine is initialized
   */
  get initialized(): boolean {
    return this.isInitialized;
  }
  
  /**
   * Get Cannon.js world instance
   */
  getWorld(): CANNON.World | null {
    return this.world;
  }
  
  /**
   * Subscribe to physics events
   */
  on(event: string, callback: (data: unknown) => void): () => void {
    const listener: EventListener = (evt) => callback((evt as CustomEvent).detail);
    this.eventTarget.addEventListener(event, listener);
    return () => this.eventTarget.removeEventListener(event, listener);
  }
  
  /**
   * Emit physics event
   */
  emit(event: string, data?: unknown): void {
    this.eventTarget.dispatchEvent(new CustomEvent(event, { detail: data }));
  }
}

// Export singleton for convenience
export const physicsEngine = new PhysicsEngine();
