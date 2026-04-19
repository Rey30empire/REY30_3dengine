// ============================================
// Character Controller
// REY30 3D Engine
// ============================================

import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { v4 as uuidv4 } from 'uuid';

function createUprightCapsuleRotation(): CANNON.Quaternion {
  const rotation = new CANNON.Quaternion();
  rotation.setFromEuler(0, 0, Math.PI / 2);
  return rotation;
}

/**
 * Character controller options
 */
export interface CharacterControllerOptions {
  /** Character height (including capsule) */
  height?: number;
  /** Character radius */
  radius?: number;
  /** Character mass */
  mass?: number;
  /** Initial position [x, y, z] */
  position?: [number, number, number];
  /** Walking speed */
  walkSpeed?: number;
  /** Running speed */
  runSpeed?: number;
  /** Jump force */
  jumpForce?: number;
  /** Max slope angle in degrees */
  maxSlopeAngle?: number;
  /** Step height for climbing */
  stepOffset?: number;
  /** Friction when grounded */
  groundFriction?: number;
  /** Friction when in air */
  airFriction?: number;
  /** Gravity multiplier */
  gravityMultiplier?: number;
  /** Entity ID for ECS integration */
  entityId?: string;
  /** User data */
  userData?: Record<string, unknown>;
}

/**
 * Ground info structure
 */
export interface GroundInfo {
  /** Is character grounded */
  isGrounded: boolean;
  /** Ground normal */
  normal: THREE.Vector3;
  /** Ground distance */
  distance: number;
  /** Ground rigid body */
  body: CANNON.Body | null;
  /** Ground angle in degrees */
  angle: number;
  /** Can walk on this surface */
  canWalk: boolean;
}

/**
 * Character movement state
 */
export interface CharacterState {
  /** Is walking */
  isWalking: boolean;
  /** Is running */
  isRunning: boolean;
  /** Is jumping */
  isJumping: boolean;
  /** Is grounded */
  isGrounded: boolean;
  /** Is falling */
  isFalling: boolean;
  /** Is crouching */
  isCrouching: boolean;
  /** Current velocity */
  velocity: THREE.Vector3;
  /** Current facing direction */
  facingDirection: THREE.Vector3;
}

/**
 * CharacterController - Physics-based character controller
 * 
 * Provides a robust character controller with walk/run movement,
 * jumping, ground detection, and slope handling.
 * 
 * @example
 * ```typescript
 * const character = new CharacterController(world, {
 *   height: 2,
 *   radius: 0.5,
 *   mass: 80,
 *   walkSpeed: 5,
 *   runSpeed: 10,
 *   jumpForce: 10
 * });
 * 
 * // In game loop
 * character.move([1, 0, 0], 5, deltaTime); // Move forward
 * 
 * if (input.jump && character.isGrounded) {
 *   character.jump(10);
 * }
 * 
 * character.update(deltaTime);
 * ```
 */
export class CharacterController {
  /** Unique identifier */
  readonly id: string;
  
  /** Entity ID for ECS integration */
  entityId: string | null = null;
  
  /** User data */
  userData: Record<string, unknown> = {};
  
  /** Physics body */
  readonly body: CANNON.Body;
  
  /** Character shape */
  readonly shape: CANNON.Shape;
  
  /** Associated Three.js mesh for rendering */
  mesh: THREE.Object3D | null = null;
  
  /** Walking speed */
  walkSpeed: number = 5;
  
  /** Running speed */
  runSpeed: number = 10;
  
  /** Jump force */
  jumpForce: number = 10;
  
  /** Max slope angle in degrees */
  maxSlopeAngle: number = 45;
  
  /** Step height for climbing */
  stepOffset: number = 0.3;
  
  /** Ground friction */
  groundFriction: number = 10;
  
  /** Air friction */
  airFriction: number = 0.5;
  
  /** Gravity multiplier */
  gravityMultiplier: number = 1;
  
  /** Character height */
  readonly height: number;
  
  /** Character radius */
  readonly radius: number;
  
  /** Character mass */
  readonly mass: number;
  
  /** Movement input direction */
  private moveDirection: THREE.Vector3 = new THREE.Vector3();
  
  /** Current speed multiplier */
  private currentSpeed: number = 0;
  
  /** Target velocity for smooth movement */
  private targetVelocity: THREE.Vector3 = new THREE.Vector3();
  
  /** Ground info cache */
  private _groundInfo: GroundInfo = {
    isGrounded: false,
    normal: new THREE.Vector3(0, 1, 0),
    distance: 0,
    body: null,
    angle: 0,
    canWalk: true
  };
  
  /** Jump state */
  private _isJumping: boolean = false;
  private jumpCooldown: number = 0;
  private readonly jumpCooldownTime: number = 0.1;
  
  /** Crouch state */
  private _isCrouching: boolean = false;
  private originalHeight: number;
  
  /** Character state */
  private _state: CharacterState = {
    isWalking: false,
    isRunning: false,
    isJumping: false,
    isGrounded: false,
    isFalling: false,
    isCrouching: false,
    velocity: new THREE.Vector3(),
    facingDirection: new THREE.Vector3(0, 0, 1)
  };
  
  private world: CANNON.World;
  
  constructor(world: CANNON.World, options: CharacterControllerOptions = {}) {
    this.id = uuidv4();
    this.world = world;
    this.entityId = options.entityId || null;
    this.userData = options.userData || {};
    
    // Dimensions
    this.height = options.height ?? 2;
    this.radius = options.radius ?? 0.5;
    this.mass = options.mass ?? 80;
    this.originalHeight = this.height;
    
    // Movement properties
    this.walkSpeed = options.walkSpeed ?? 5;
    this.runSpeed = options.runSpeed ?? 10;
    this.jumpForce = options.jumpForce ?? 10;
    this.maxSlopeAngle = options.maxSlopeAngle ?? 45;
    this.stepOffset = options.stepOffset ?? 0.3;
    this.groundFriction = options.groundFriction ?? 10;
    this.airFriction = options.airFriction ?? 0.5;
    this.gravityMultiplier = options.gravityMultiplier ?? 1;
    
    // Create capsule shape (using cylinder approximation)
    // Height minus radius for top and bottom caps
    const cylinderHeight = this.height - this.radius * 2;
    this.shape = new CANNON.Cylinder(
      this.radius,
      this.radius,
      Math.max(cylinderHeight, 0.1),
      16
    );
    
    // Create physics body
    this.body = new CANNON.Body({
      mass: this.mass,
      position: options.position 
        ? new CANNON.Vec3(...options.position)
        : new CANNON.Vec3(0, this.height / 2, 0),
      fixedRotation: true, // Prevent rotation
      linearDamping: 0.1,
      angularDamping: 0.99
    });
    
    // Add shape with offset (center the capsule)
    const shapeOffset = new CANNON.Vec3(0, 0, 0);
    this.body.addShape(this.shape, shapeOffset, createUprightCapsuleRotation());
    
    // Add spheres for better capsule collision
    const topSphere = new CANNON.Sphere(this.radius);
    const bottomSphere = new CANNON.Sphere(this.radius);
    this.body.addShape(topSphere, new CANNON.Vec3(0, cylinderHeight / 2, 0));
    this.body.addShape(bottomSphere, new CANNON.Vec3(0, -cylinderHeight / 2, 0));
    
    // Store reference
    (this.body as any).characterController = this;
    
    // Add to world
    world.addBody(this.body);
  }
  
  /**
   * Get current position
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
   * Get velocity
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
   * Get horizontal velocity
   */
  get horizontalVelocity(): THREE.Vector3 {
    return new THREE.Vector3(this.body.velocity.x, 0, this.body.velocity.z);
  }
  
  /**
   * Get vertical velocity
   */
  get verticalVelocity(): number {
    return this.body.velocity.y;
  }
  
  /**
   * Get ground info
   */
  get groundInfo(): GroundInfo {
    return this._groundInfo;
  }
  
  /**
   * Is character grounded
   */
  get isGrounded(): boolean {
    return this._groundInfo.isGrounded;
  }
  
  /**
   * Is character jumping
   */
  get isJumping(): boolean {
    return this._isJumping;
  }
  
  /**
   * Is character falling
   */
  get isFalling(): boolean {
    return !this._groundInfo.isGrounded && this.body.velocity.y < 0;
  }
  
  /**
   * Is character crouching
   */
  get isCrouching(): boolean {
    return this._isCrouching;
  }
  
  /**
   * Get character state
   */
  get state(): CharacterState {
    return { ...this._state };
  }
  
  /**
   * Move the character in a direction
   * @param direction Movement direction [x, y, z] or Vector3 (y is ignored for movement)
   * @param speed Speed multiplier
   * @param deltaTime Frame delta time
   */
  move(direction: [number, number, number] | THREE.Vector3, speed?: number, deltaTime?: number): void;
  
  move(
    direction: [number, number, number] | THREE.Vector3,
    speed: number = this.walkSpeed,
    deltaTime: number = 0
  ): void {
    // Parse direction
    let dir: THREE.Vector3;
    if (Array.isArray(direction)) {
      dir = new THREE.Vector3(direction[0], 0, direction[2]);
    } else {
      dir = new THREE.Vector3(direction.x, 0, direction.z);
    }
    
    // Normalize and apply speed
    if (dir.lengthSq() > 0) {
      dir.normalize();
      this.moveDirection.copy(dir);
      this.currentSpeed = speed;
      
      // Update facing direction
      this._state.facingDirection.copy(dir);
    } else {
      this.currentSpeed = 0;
    }
  }
  
  /**
   * Move towards a target position
   */
  moveTo(target: THREE.Vector3, speed?: number, deltaTime?: number): void {
    const direction = target.clone().sub(this.position);
    direction.y = 0;
    this.move(direction, speed, deltaTime);
  }
  
  /**
   * Make the character jump
   * @param force Optional jump force override
   */
  jump(force?: number): boolean {
    if (!this._groundInfo.isGrounded || this._isJumping || this.jumpCooldown > 0) {
      return false;
    }
    
    const jumpForce = force ?? this.jumpForce;
    this.body.velocity.y = jumpForce;
    this._isJumping = true;
    this.jumpCooldown = this.jumpCooldownTime;
    
    return true;
  }
  
  /**
   * Force stop jump
   */
  stopJump(): void {
    if (this.body.velocity.y > 0) {
      this.body.velocity.y *= 0.5;
    }
  }
  
  /**
   * Crouch
   */
  crouch(): void {
    if (!this._isCrouching) {
      this._isCrouching = true;
      // Reduce height for crouch
      this.updateColliderHeight(this.originalHeight * 0.5);
    }
  }
  
  /**
   * Stand up
   */
  stand(): void {
    if (this._isCrouching) {
      this._isCrouching = false;
      this.updateColliderHeight(this.originalHeight);
    }
  }
  
  /**
   * Toggle crouch
   */
  toggleCrouch(): void {
    if (this._isCrouching) {
      this.stand();
    } else {
      this.crouch();
    }
  }
  
  /**
   * Update collider height
   */
  private updateColliderHeight(newHeight: number): void {
    // Remove old shapes
    this.body.shapes.forEach(() => {
      this.body.removeShape(this.body.shapes[0]);
    });
    
    // Add new shapes with new height
    const cylinderHeight = newHeight - this.radius * 2;
    const newShape = new CANNON.Cylinder(
      this.radius,
      this.radius,
      Math.max(cylinderHeight, 0.1),
      16
    );
    this.body.addShape(newShape, new CANNON.Vec3(0, 0, 0), createUprightCapsuleRotation());
    
    const topSphere = new CANNON.Sphere(this.radius);
    const bottomSphere = new CANNON.Sphere(this.radius);
    this.body.addShape(topSphere, new CANNON.Vec3(0, cylinderHeight / 2, 0));
    this.body.addShape(bottomSphere, new CANNON.Vec3(0, -cylinderHeight / 2, 0));
  }
  
  /**
   * Check ground status
   */
  private checkGround(): void {
    const rayFrom = new CANNON.Vec3(
      this.body.position.x,
      this.body.position.y - this.height / 2 + this.radius,
      this.body.position.z
    );
    const rayTo = new CANNON.Vec3(
      this.body.position.x,
      this.body.position.y - this.height / 2 + this.radius - this.stepOffset - 0.01,
      this.body.position.z
    );
    
    const result = new CANNON.RaycastResult();
    const ray = new CANNON.Ray(rayFrom, rayTo);
    
    ray.intersectWorld(this.world, {
      mode: CANNON.Ray.CLOSEST,
      result: result,
      skipBackfaces: true,
      collisionFilterMask: -1 // All groups
    });
    
    if (result.hasHit) {
      this._groundInfo.isGrounded = true;
      this._groundInfo.distance = result.distance;
      this._groundInfo.body = result.body;
      
      // Calculate normal
      this._groundInfo.normal.set(
        result.hitNormalWorld.x,
        result.hitNormalWorld.y,
        result.hitNormalWorld.z
      );
      
      // Calculate slope angle
      const upVector = new THREE.Vector3(0, 1, 0);
      this._groundInfo.angle = Math.acos(this._groundInfo.normal.dot(upVector)) * (180 / Math.PI);
      
      // Check if can walk on slope
      this._groundInfo.canWalk = this._groundInfo.angle <= this.maxSlopeAngle;
    } else {
      this._groundInfo.isGrounded = false;
      this._groundInfo.distance = Infinity;
      this._groundInfo.body = null;
      this._groundInfo.normal.set(0, 1, 0);
      this._groundInfo.angle = 0;
      this._groundInfo.canWalk = true;
    }
  }
  
  /**
   * Handle step offset (climbing)
   */
  private handleStepOffset(): void {
    if (!this.moveDirection || this.moveDirection.lengthSq() === 0) return;
    
    // Check for step in front
    const forward = this.moveDirection.clone().normalize();
    const stepCheckHeight = this.stepOffset;
    
    const rayFrom = new CANNON.Vec3(
      this.body.position.x + forward.x * this.radius,
      this.body.position.y - this.height / 2 + this.radius + stepCheckHeight,
      this.body.position.z + forward.z * this.radius
    );
    const rayTo = new CANNON.Vec3(
      rayFrom.x,
      rayFrom.y - stepCheckHeight * 2,
      rayFrom.z
    );
    
    const result = new CANNON.RaycastResult();
    const ray = new CANNON.Ray(rayFrom, rayTo);
    
    ray.intersectWorld(this.world, {
      mode: CANNON.Ray.CLOSEST,
      result: result
    });
    
    // If no ground in front at step level, check for step
    if (!result.hasHit && this._groundInfo.isGrounded) {
      // Check for obstacle
      const obstacleFrom = new CANNON.Vec3(
        this.body.position.x,
        this.body.position.y - this.height / 2 + this.radius + stepCheckHeight,
        this.body.position.z
      );
      const obstacleTo = new CANNON.Vec3(
        obstacleFrom.x + forward.x * (this.radius + 0.1),
        obstacleFrom.y,
        obstacleFrom.z + forward.z * (this.radius + 0.1)
      );
      
      const obstacleResult = new CANNON.RaycastResult();
      const obstacleRay = new CANNON.Ray(obstacleFrom, obstacleTo);
      
      obstacleRay.intersectWorld(this.world, {
        mode: CANNON.Ray.CLOSEST,
        result: obstacleResult
      });
      
      if (obstacleResult.hasHit) {
        // Step up
        this.body.position.y += stepCheckHeight;
      }
    }
  }
  
  /**
   * Update character controller
   * @param deltaTime Frame delta time
   */
  update(deltaTime: number): void {
    // Update jump cooldown
    if (this.jumpCooldown > 0) {
      this.jumpCooldown -= deltaTime;
    }
    
    // Check ground
    this.checkGround();
    
    // Handle step offset
    this.handleStepOffset();
    
    // Calculate target velocity
    if (this.moveDirection.lengthSq() > 0 && this.currentSpeed > 0) {
      this.targetVelocity.set(
        this.moveDirection.x * this.currentSpeed,
        this.body.velocity.y,
        this.moveDirection.z * this.currentSpeed
      );
    } else {
      this.targetVelocity.set(0, this.body.velocity.y, 0);
    }
    
    // Apply slope adjustment
    if (this._groundInfo.isGrounded && !this._groundInfo.canWalk) {
      // Slide down slope
      const slideDir = this._groundInfo.normal.clone();
      slideDir.y = 0;
      slideDir.normalize();
      this.targetVelocity.x += slideDir.x * 2;
      this.targetVelocity.z += slideDir.z * 2;
    }
    
    // Apply movement with friction
    const friction = this._groundInfo.isGrounded ? this.groundFriction : this.airFriction;
    const lerpFactor = 1 - Math.exp(-friction * deltaTime);
    
    this.body.velocity.x = THREE.MathUtils.lerp(
      this.body.velocity.x,
      this.targetVelocity.x,
      lerpFactor
    );
    this.body.velocity.z = THREE.MathUtils.lerp(
      this.body.velocity.z,
      this.targetVelocity.z,
      lerpFactor
    );
    
    // Apply gravity multiplier
    if (!this._groundInfo.isGrounded) {
      this.body.velocity.y -= (this.gravityMultiplier - 1) * 9.81 * deltaTime;
    }
    
    // Update jump state
    if (this._isJumping && this.body.velocity.y <= 0) {
      this._isJumping = false;
    }
    
    // Update character state
    this.updateState();
    
    // Sync mesh if attached
    if (this.mesh) {
      this.syncMesh(this.mesh);
    }
  }
  
  /**
   * Update character state
   */
  private updateState(): void {
    const horizontalSpeed = Math.sqrt(
      this.body.velocity.x * this.body.velocity.x +
      this.body.velocity.z * this.body.velocity.z
    );
    
    this._state.isGrounded = this._groundInfo.isGrounded;
    this._state.isJumping = this._isJumping;
    this._state.isFalling = this.isFalling;
    this._state.isCrouching = this._isCrouching;
    this._state.isWalking = this._groundInfo.isGrounded && horizontalSpeed > 0.1 && horizontalSpeed < this.runSpeed * 0.8;
    this._state.isRunning = this._groundInfo.isGrounded && horizontalSpeed >= this.runSpeed * 0.8;
    this._state.velocity.set(
      this.body.velocity.x,
      this.body.velocity.y,
      this.body.velocity.z
    );
  }
  
  /**
   * Apply force to character
   */
  applyForce(force: [number, number, number]): void {
    this.body.applyForce(new CANNON.Vec3(...force));
  }
  
  /**
   * Apply impulse to character
   */
  applyImpulse(impulse: [number, number, number]): void {
    this.body.applyImpulse(new CANNON.Vec3(...impulse));
  }
  
  /**
   * Set character position
   */
  setPosition(x: number, y: number, z: number): void {
    this.body.position.set(x, y, z);
    this.body.velocity.set(0, 0, 0);
    this.body.angularVelocity.set(0, 0, 0);
  }
  
  /**
   * Teleport character
   */
  teleport(position: THREE.Vector3): void {
    this.setPosition(position.x, position.y, position.z);
  }
  
  /**
   * Set walk speed
   */
  setWalkSpeed(speed: number): void {
    this.walkSpeed = speed;
  }
  
  /**
   * Set run speed
   */
  setRunSpeed(speed: number): void {
    this.runSpeed = speed;
  }
  
  /**
   * Set jump force
   */
  setJumpForce(force: number): void {
    this.jumpForce = force;
  }
  
  /**
   * Set max slope angle
   */
  setMaxSlopeAngle(angle: number): void {
    this.maxSlopeAngle = angle;
  }
  
  /**
   * Set step offset
   */
  setStepOffset(offset: number): void {
    this.stepOffset = offset;
  }
  
  /**
   * Sync Three.js mesh with character position
   */
  syncMesh(mesh: THREE.Object3D): void {
    mesh.position.copy(this.position);
    // Apply facing direction rotation
    const angle = Math.atan2(this._state.facingDirection.x, this._state.facingDirection.z);
    mesh.rotation.y = angle;
  }
  
  /**
   * Get forward direction
   */
  getForward(): THREE.Vector3 {
    return this._state.facingDirection.clone();
  }
  
  /**
   * Get right direction
   */
  getRight(): THREE.Vector3 {
    const forward = this._state.facingDirection;
    return new THREE.Vector3(-forward.z, 0, forward.x).normalize();
  }
  
  /**
   * Face a direction
   */
  faceDirection(direction: THREE.Vector3): void {
    if (direction.lengthSq() > 0) {
      direction.y = 0;
      direction.normalize();
      this._state.facingDirection.copy(direction);
    }
  }
  
  /**
   * Face a point in world space
   */
  facePoint(point: THREE.Vector3): void {
    const direction = point.clone().sub(this.position);
    this.faceDirection(direction);
  }
  
  /**
   * Serialize to JSON
   */
  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      height: this.height,
      radius: this.radius,
      mass: this.mass,
      position: [this.body.position.x, this.body.position.y, this.body.position.z],
      velocity: [this.body.velocity.x, this.body.velocity.y, this.body.velocity.z],
      walkSpeed: this.walkSpeed,
      runSpeed: this.runSpeed,
      jumpForce: this.jumpForce,
      maxSlopeAngle: this.maxSlopeAngle,
      stepOffset: this.stepOffset,
      entityId: this.entityId,
      userData: this.userData,
      state: {
        isGrounded: this._state.isGrounded,
        isJumping: this._state.isJumping,
        isCrouching: this._state.isCrouching,
        facingDirection: [this._state.facingDirection.x, this._state.facingDirection.y, this._state.facingDirection.z]
      }
    };
  }
  
  /**
   * Destroy character controller
   */
  destroy(): void {
    this.world.removeBody(this.body);
    this.mesh = null;
  }
}
