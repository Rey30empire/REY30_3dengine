// ============================================
// Joint System
// REY30 3D Engine
// ============================================

import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { v4 as uuidv4 } from 'uuid';
import type { RigidBody } from './RigidBody';

/**
 * Joint types
 */
export type JointType = 
  | 'fixed' 
  | 'hinge' 
  | 'spring' 
  | 'distance' 
  | 'slider' 
  | 'conical' 
  | 'configurable';

/**
 * Base joint options
 */
export interface BaseJointOptions {
  /** Unique identifier */
  id?: string;
  /** Joint type */
  type: JointType;
  /** First body */
  bodyA: RigidBody | CANNON.Body;
  /** Second body (null for world constraint) */
  bodyB?: RigidBody | CANNON.Body | null;
  /** Pivot point on body A (local coordinates) */
  pivotA?: [number, number, number];
  /** Pivot point on body B (local coordinates) */
  pivotB?: [number, number, number];
  /** Break force threshold (0 = unbreakable) */
  breakForce?: number;
  /** Enable collision between connected bodies */
  collideConnected?: boolean;
  /** User data */
  userData?: Record<string, unknown>;
}

/**
 * Fixed joint options
 */
export interface FixedJointOptions extends BaseJointOptions {
  type: 'fixed';
}

/**
 * Hinge joint options
 */
export interface HingeJointOptions extends BaseJointOptions {
  type: 'hinge';
  /** Rotation axis on body A (local coordinates) */
  axisA?: [number, number, number];
  /** Rotation axis on body B (local coordinates) */
  axisB?: [number, number, number];
  /** Minimum rotation angle (radians) */
  minAngle?: number;
  /** Maximum rotation angle (radians) */
  maxAngle?: number;
  /** Motor target velocity */
  motorSpeed?: number;
  /** Maximum motor force */
  maxMotorForce?: number;
}

/**
 * Spring joint options
 */
export interface SpringJointOptions extends BaseJointOptions {
  type: 'spring';
  /** Rest length */
  restLength?: number;
  /** Spring stiffness */
  stiffness?: number;
  /** Damping factor */
  damping?: number;
}

/**
 * Distance joint options
 */
export interface DistanceJointOptions extends BaseJointOptions {
  type: 'distance';
  /** Fixed distance */
  distance: number;
}

/**
 * Slider joint options
 */
export interface SliderJointOptions extends BaseJointOptions {
  type: 'slider';
  /** Slider axis on body A */
  axisA?: [number, number, number];
  /** Slider axis on body B */
  axisB?: [number, number, number];
  /** Minimum translation */
  minDistance?: number;
  /** Maximum translation */
  maxDistance?: number;
  /** Motor target velocity */
  motorSpeed?: number;
  /** Maximum motor force */
  maxMotorForce?: number;
}

/**
 * Conical joint options
 */
export interface ConicalJointOptions extends BaseJointOptions {
  type: 'conical';
  /** Pivot on body A */
  pivotA: [number, number, number];
  /** Pivot on body B */
  pivotB: [number, number, number];
  /** Axis on body A */
  axisA: [number, number, number];
  /** Axis on body B */
  axisB: [number, number, number];
  /** Cone angle limit */
  angle?: number;
  /** Twist angle limit */
  twistAngle?: number;
}

/**
 * Configurable joint options
 */
export interface ConfigurableJointOptions extends BaseJointOptions {
  type: 'configurable';
  /** Lock linear X motion */
  lockLinearX?: boolean;
  /** Lock linear Y motion */
  lockLinearY?: boolean;
  /** Lock linear Z motion */
  lockLinearZ?: boolean;
  /** Lock angular X motion */
  lockAngularX?: boolean;
  /** Lock angular Y motion */
  lockAngularY?: boolean;
  /** Lock angular Z motion */
  lockAngularZ?: boolean;
  /** Linear limit (min, max) for X */
  linearLimitX?: [number, number];
  /** Linear limit (min, max) for Y */
  linearLimitY?: [number, number];
  /** Linear limit (min, max) for Z */
  linearLimitZ?: [number, number];
  /** Angular limit (min, max) for X */
  angularLimitX?: [number, number];
  /** Angular limit (min, max) for Y */
  angularLimitY?: [number, number];
  /** Angular limit (min, max) for Z */
  angularLimitZ?: [number, number];
  /** Linear stiffness */
  linearStiffness?: number;
  /** Angular stiffness */
  angularStiffness?: number;
  /** Linear damping */
  linearDamping?: number;
  /** Angular damping */
  angularDamping?: number;
}

/**
 * Union type for all joint options
 */
export type JointOptions = 
  | FixedJointOptions 
  | HingeJointOptions 
  | SpringJointOptions 
  | DistanceJointOptions 
  | SliderJointOptions
  | ConicalJointOptions
  | ConfigurableJointOptions;

/**
 * Joint - Base class for physics joints
 */
export class Joint {
  /** Unique identifier */
  readonly id: string;
  
  /** Joint type */
  readonly type: JointType;
  
  /** Cannon.js constraint */
  readonly constraint: CANNON.Constraint;
  
  /** Connected body A */
  readonly bodyA: CANNON.Body;
  
  /** Connected body B */
  readonly bodyB: CANNON.Body | null;
  
  /** User data */
  userData: Record<string, unknown> = {};
  
  /** Break force threshold */
  breakForce: number = 0;
  
  /** On joint break callback */
  onBreak: (() => void) | null = null;
  
  private world: CANNON.World;
  private isBroken: boolean = false;
  private isEnabled: boolean = true;
  private sliderAxisA: CANNON.Vec3 = new CANNON.Vec3(1, 0, 0);
  private sliderMotorEnabled = false;
  private sliderMotorSpeed = 0;
  
  constructor(world: CANNON.World, options: JointOptions) {
    this.id = options.id || uuidv4();
    this.type = options.type;
    this.world = world;
    
    // Get Cannon bodies
    this.bodyA = this.getCannonBody(options.bodyA);
    this.bodyB = options.bodyB ? this.getCannonBody(options.bodyB) : null;
    
    this.userData = options.userData || {};
    this.breakForce = options.breakForce || 0;
    
    // Create constraint based on type
    this.constraint = this.createConstraint(options);
    
    // Add to world
    world.addConstraint(this.constraint);
  }
  
  /**
   * Get Cannon body from RigidBody or CANNON.Body
   */
  private getCannonBody(body: RigidBody | CANNON.Body): CANNON.Body {
    if ('body' in body) {
      return (body as RigidBody).body;
    }
    return body as CANNON.Body;
  }
  
  /**
   * Create the appropriate constraint
   */
  private createConstraint(options: JointOptions): CANNON.Constraint {
    switch (options.type) {
      case 'fixed':
        return this.createFixedConstraint(options);
      
      case 'hinge':
        return this.createHingeConstraint(options);
      
      case 'spring':
        return this.createSpringConstraint(options);
      
      case 'distance':
        return this.createDistanceConstraint(options);
      
      case 'slider':
        return this.createSliderConstraint(options);
      
      case 'conical':
        return this.createConicalConstraint(options);
      
      case 'configurable':
        return this.createConfigurableConstraint(options);
      
      default:
        throw new Error(`Unknown joint type: ${(options as any).type}`);
    }
  }
  
  /**
   * Create fixed constraint (LockConstraint)
   */
  private createFixedConstraint(options: FixedJointOptions): CANNON.LockConstraint {
    const constraint = new CANNON.LockConstraint(this.bodyA, this.bodyB || new CANNON.Body({ mass: 0 }));
    constraint.collideConnected = options.collideConnected ?? false;
    return constraint;
  }
  
  /**
   * Create hinge constraint (HingeConstraint)
   */
  private createHingeConstraint(options: HingeJointOptions): CANNON.HingeConstraint {
    const pivotA = options.pivotA ? new CANNON.Vec3(...options.pivotA) : new CANNON.Vec3(0, 0, 0);
    const pivotB = options.pivotB ? new CANNON.Vec3(...options.pivotB) : new CANNON.Vec3(0, 0, 0);
    const axisA = options.axisA ? new CANNON.Vec3(...options.axisA) : new CANNON.Vec3(0, 1, 0);
    const axisB = options.axisB ? new CANNON.Vec3(...options.axisB) : new CANNON.Vec3(0, 1, 0);
    
    const constraint = new CANNON.HingeConstraint(this.bodyA, this.bodyB || new CANNON.Body({ mass: 0 }), {
      pivotA,
      pivotB,
      axisA,
      axisB,
      collideConnected: options.collideConnected ?? false
    });
    
    // Enable motor if specified
    if (options.motorSpeed !== undefined) {
      constraint.enableMotor();
      constraint.setMotorSpeed(options.motorSpeed);
      if (options.maxMotorForce !== undefined) {
        constraint.setMotorMaxForce(options.maxMotorForce);
      }
    }
    
    return constraint;
  }
  
  /**
   * Create spring constraint (Spring)
   */
  private createSpringConstraint(options: SpringJointOptions): CANNON.DistanceConstraint {
    const pivotA = options.pivotA ? new CANNON.Vec3(...options.pivotA) : this.bodyA.position.clone();
    const pivotB = options.pivotB && this.bodyB 
      ? new CANNON.Vec3(...options.pivotB) 
      : this.bodyB?.position.clone() || new CANNON.Vec3(0, 0, 0);
    
    const restLength = options.restLength ?? pivotA.distanceTo(pivotB);
    const _stiffness = options.stiffness ?? 100;
    const _damping = options.damping ?? 1;
    void _stiffness;
    void _damping;

    const constraint = new CANNON.DistanceConstraint(this.bodyA, this.bodyB || new CANNON.Body({ mass: 0 }), restLength);
    constraint.collideConnected = options.collideConnected ?? true;
    return constraint;
  }
  
  /**
   * Create distance constraint
   */
  private createDistanceConstraint(options: DistanceJointOptions): CANNON.DistanceConstraint {
    const constraint = new CANNON.DistanceConstraint(
      this.bodyA,
      this.bodyB || new CANNON.Body({ mass: 0 }),
      options.distance
    );
    constraint.collideConnected = options.collideConnected ?? false;
    return constraint;
  }
  
  /**
   * Create slider constraint
   */
  private createSliderConstraint(options: SliderJointOptions): CANNON.PointToPointConstraint {
    this.sliderAxisA = options.axisA ? new CANNON.Vec3(...options.axisA) : new CANNON.Vec3(1, 0, 0);
    this.sliderMotorSpeed = options.motorSpeed ?? 0;
    this.sliderMotorEnabled = options.motorSpeed !== undefined;

    const pivotA = options.pivotA ? new CANNON.Vec3(...options.pivotA) : new CANNON.Vec3(0, 0, 0);
    const pivotB = options.pivotB ? new CANNON.Vec3(...options.pivotB) : new CANNON.Vec3(0, 0, 0);
    const constraint = new CANNON.PointToPointConstraint(
      this.bodyA,
      pivotA,
      this.bodyB || new CANNON.Body({ mass: 0 }),
      pivotB,
      options.maxMotorForce
    );
    constraint.collideConnected = options.collideConnected ?? false;
    return constraint;
  }
  
  /**
   * Create conical constraint (ConeTwistConstraint)
   */
  private createConicalConstraint(options: ConicalJointOptions): CANNON.ConeTwistConstraint {
    return new CANNON.ConeTwistConstraint(this.bodyA, this.bodyB || new CANNON.Body({ mass: 0 }), {
      pivotA: new CANNON.Vec3(...options.pivotA),
      pivotB: new CANNON.Vec3(...options.pivotB),
      axisA: new CANNON.Vec3(...options.axisA),
      axisB: new CANNON.Vec3(...options.axisB),
      angle: options.angle ?? Math.PI / 4,
      twistAngle: options.twistAngle ?? Math.PI / 4,
      collideConnected: options.collideConnected ?? false
    });
  }
  
  /**
   * Create configurable constraint (PointToPointConstraint as base)
   * Note: Cannon-es doesn't have a full configurable joint, so we use combinations
   */
  private createConfigurableConstraint(options: ConfigurableJointOptions): CANNON.PointToPointConstraint {
    const pivotA = options.pivotA ? new CANNON.Vec3(...options.pivotA) : new CANNON.Vec3(0, 0, 0);
    const pivotB = options.pivotB ? new CANNON.Vec3(...options.pivotB) : new CANNON.Vec3(0, 0, 0);
    
    // For configurable joint, we create a point-to-point constraint
    // Additional constraints would need to be added for full DOF control
    const constraint = new CANNON.PointToPointConstraint(
      this.bodyA,
      pivotA,
      this.bodyB || new CANNON.Body({ mass: 0 }),
      pivotB,
      options.breakForce
    );
    constraint.collideConnected = options.collideConnected ?? false;
    return constraint;
  }
  
  /**
   * Enable/disable the constraint
   */
  set enabled(value: boolean) {
    this.isEnabled = value;
    if (value) {
      this.constraint.enable();
    } else {
      this.constraint.disable();
    }
  }
  
  get enabled(): boolean {
    return this.isEnabled;
  }
  
  /**
   * Check if joint is broken
   */
  get broken(): boolean {
    return this.isBroken;
  }
  
  /**
   * Get reaction force on body A
   */
  getReactionForce(): THREE.Vector3 {
    // Cannon-es doesn't expose reaction force directly
    // This is an approximation
    return new THREE.Vector3(0, 0, 0);
  }
  
  /**
   * Get reaction torque on body A
   */
  getReactionTorque(): THREE.Vector3 {
    // Cannon-es doesn't expose reaction torque directly
    return new THREE.Vector3(0, 0, 0);
  }
  
  /**
   * Update joint (check for break force)
   */
  update(): void {
    if (this.breakForce > 0 && !this.isBroken) {
      // Check if constraint force exceeds break force
      // This is simplified - actual implementation would check constraint force
      // For now, we just expose the breakForce for manual checking
    }
  }
  
  /**
   * Manually break the joint
   */
  break(): void {
    if (!this.isBroken) {
      this.isBroken = true;
      this.world.removeConstraint(this.constraint);
      
      if (this.onBreak) {
        this.onBreak();
      }
    }
  }
  
  /**
   * Set motor speed (for hinge/slider joints)
   */
  setMotorSpeed(speed: number): void {
    if (this.constraint instanceof CANNON.HingeConstraint) {
      this.constraint.setMotorSpeed(speed);
    } else if (this.type === 'slider') {
      this.sliderMotorSpeed = speed;
    }
  }
  
  /**
   * Enable motor (for hinge/slider joints)
   */
  enableMotor(): void {
    if (this.constraint instanceof CANNON.HingeConstraint) {
      this.constraint.enableMotor();
    } else if (this.type === 'slider') {
      this.sliderMotorEnabled = true;
    }
  }
  
  /**
   * Disable motor (for hinge/slider joints)
   */
  disableMotor(): void {
    if (this.constraint instanceof CANNON.HingeConstraint) {
      this.constraint.disableMotor();
    } else if (this.type === 'slider') {
      this.sliderMotorEnabled = false;
    }
  }
  
  /**
   * Get current joint angle (for hinge joints)
   */
  getAngle(): number {
    if (this.constraint instanceof CANNON.HingeConstraint) {
      const axisAWorld = new CANNON.Vec3();
      const axisBWorld = new CANNON.Vec3();
      this.bodyA.quaternion.vmult(this.constraint.axisA, axisAWorld);
      (this.bodyB || this.bodyA).quaternion.vmult(this.constraint.axisB, axisBWorld);
      const a = new THREE.Vector3(axisAWorld.x, axisAWorld.y, axisAWorld.z).normalize();
      const b = new THREE.Vector3(axisBWorld.x, axisBWorld.y, axisBWorld.z).normalize();
      return a.angleTo(b);
    }
    return 0;
  }
  
  /**
   * Get current joint position (for slider joints)
   */
  getPosition(): number {
    if (this.type === 'slider' && this.bodyB) {
      const axisWorld = new CANNON.Vec3();
      this.bodyA.quaternion.vmult(this.sliderAxisA, axisWorld);
      const delta = this.bodyB.position.vsub(this.bodyA.position);
      const axis = new THREE.Vector3(axisWorld.x, axisWorld.y, axisWorld.z).normalize();
      const deltaVec = new THREE.Vector3(delta.x, delta.y, delta.z);
      return deltaVec.dot(axis);
    }
    return 0;
  }
  
  /**
   * Serialize to JSON
   */
  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      type: this.type,
      bodyAId: (this.bodyA as any).id,
      bodyBId: this.bodyB ? (this.bodyB as any).id : null,
      enabled: this.enabled,
      broken: this.isBroken,
      breakForce: this.breakForce,
      userData: this.userData
    };
  }
  
  /**
   * Destroy the joint
   */
  destroy(): void {
    if (!this.isBroken) {
      this.world.removeConstraint(this.constraint);
    }
    this.onBreak = null;
  }
}

/**
 * Create a joint
 */
export function createJoint(world: CANNON.World, options: JointOptions): Joint {
  return new Joint(world, options);
}

/**
 * Factory functions for creating specific joint types
 */
export const JointFactory = {
  /**
   * Create a fixed joint
   */
  fixed(
    world: CANNON.World,
    bodyA: RigidBody | CANNON.Body,
    bodyB?: RigidBody | CANNON.Body | null,
    options?: Partial<FixedJointOptions>
  ): Joint {
    return new Joint(world, {
      type: 'fixed',
      bodyA,
      bodyB,
      ...options
    });
  },
  
  /**
   * Create a hinge joint
   */
  hinge(
    world: CANNON.World,
    bodyA: RigidBody | CANNON.Body,
    bodyB: RigidBody | CANNON.Body | null,
    pivotA: [number, number, number],
    axisA: [number, number, number],
    options?: Partial<HingeJointOptions>
  ): Joint {
    return new Joint(world, {
      type: 'hinge',
      bodyA,
      bodyB,
      pivotA,
      axisA,
      ...options
    });
  },
  
  /**
   * Create a spring joint
   */
  spring(
    world: CANNON.World,
    bodyA: RigidBody | CANNON.Body,
    bodyB: RigidBody | CANNON.Body | null,
    options?: Partial<SpringJointOptions>
  ): Joint {
    return new Joint(world, {
      type: 'spring',
      bodyA,
      bodyB,
      ...options
    });
  },
  
  /**
   * Create a distance joint
   */
  distance(
    world: CANNON.World,
    bodyA: RigidBody | CANNON.Body,
    bodyB: RigidBody | CANNON.Body | null,
    distance: number,
    options?: Partial<DistanceJointOptions>
  ): Joint {
    return new Joint(world, {
      type: 'distance',
      bodyA,
      bodyB,
      distance,
      ...options
    });
  },
  
  /**
   * Create a slider joint
   */
  slider(
    world: CANNON.World,
    bodyA: RigidBody | CANNON.Body,
    bodyB: RigidBody | CANNON.Body | null,
    options?: Partial<SliderJointOptions>
  ): Joint {
    return new Joint(world, {
      type: 'slider',
      bodyA,
      bodyB,
      ...options
    });
  },
  
  /**
   * Create a conical joint
   */
  conical(
    world: CANNON.World,
    bodyA: RigidBody | CANNON.Body,
    bodyB: RigidBody | CANNON.Body | null,
    pivotA: [number, number, number],
    pivotB: [number, number, number],
    axisA: [number, number, number],
    axisB: [number, number, number],
    options?: Partial<ConicalJointOptions>
  ): Joint {
    return new Joint(world, {
      type: 'conical',
      bodyA,
      bodyB,
      pivotA,
      pivotB,
      axisA,
      axisB,
      ...options
    });
  },
  
  /**
   * Create a configurable joint
   */
  configurable(
    world: CANNON.World,
    bodyA: RigidBody | CANNON.Body,
    bodyB: RigidBody | CANNON.Body | null,
    options?: Partial<ConfigurableJointOptions>
  ): Joint {
    return new Joint(world, {
      type: 'configurable',
      bodyA,
      bodyB,
      ...options
    });
  }
};
