// ============================================
// Collider Component
// REY30 3D Engine
// ============================================

import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { v4 as uuidv4 } from 'uuid';

/**
 * Collider shape types
 */
export type ColliderShapeType = 
  | 'box' 
  | 'sphere' 
  | 'capsule' 
  | 'cylinder' 
  | 'mesh' 
  | 'convexHull'
  | 'plane';

/**
 * Box collider options
 */
export interface BoxColliderOptions {
  type: 'box';
  /** Half extents in each direction [hx, hy, hz] */
  size: [number, number, number];
}

/**
 * Sphere collider options
 */
export interface SphereColliderOptions {
  type: 'sphere';
  /** Radius of the sphere */
  radius: number;
}

/**
 * Capsule collider options
 */
export interface CapsuleColliderOptions {
  type: 'capsule';
  /** Radius of the capsule */
  radius: number;
  /** Height of the capsule (excluding caps) */
  height: number;
  /** Number of segments */
  segments?: number;
}

/**
 * Cylinder collider options
 */
export interface CylinderColliderOptions {
  type: 'cylinder';
  /** Radius of the top */
  radiusTop: number;
  /** Radius of the bottom */
  radiusBottom: number;
  /** Height of the cylinder */
  height: number;
  /** Number of segments */
  segments?: number;
}

/**
 * Mesh collider options
 */
export interface MeshColliderOptions {
  type: 'mesh';
  /** Vertices as flat array [x, y, z, x, y, z, ...] */
  vertices: number[];
  /** Indices for triangles */
  indices?: number[];
}

/**
 * Convex hull collider options
 */
export interface ConvexHullColliderOptions {
  type: 'convexHull';
  /** Array of vertex positions */
  vertices: THREE.Vector3[] | [number, number, number][];
}

/**
 * Plane collider options
 */
export interface PlaneColliderOptions {
  type: 'plane';
}

/**
 * Union type for all collider options
 */
export type ColliderOptions = 
  | BoxColliderOptions 
  | SphereColliderOptions 
  | CapsuleColliderOptions 
  | CylinderColliderOptions 
  | MeshColliderOptions 
  | ConvexHullColliderOptions
  | PlaneColliderOptions;

/**
 * Physics material properties
 */
export interface PhysicsMaterialOptions {
  /** Friction coefficient (0-1) */
  friction?: number;
  /** Restitution (bounciness) (0-1) */
  restitution?: number;
  /** Name for material */
  name?: string;
}

/**
 * Options for creating a collider
 */
export interface CreateColliderOptions {
  /** Shape definition */
  shape: ColliderOptions;
  /** Is this a trigger (no physical collision, just events) */
  isTrigger?: boolean;
  /** Offset from body center [x, y, z] */
  offset?: [number, number, number];
  /** Rotation offset [x, y, z, w] quaternion */
  rotation?: [number, number, number, number];
  /** Scale factor */
  scale?: [number, number, number];
  /** Physics material */
  material?: PhysicsMaterialOptions;
  /** Collision group */
  collisionGroup?: number;
  /** Collision mask */
  collisionMask?: number;
}

/**
 * Collider - Physics shape component
 * 
 * Represents a collision shape that can be attached to a rigid body.
 * Supports various shape types including box, sphere, capsule, cylinder, mesh, and convex hull.
 * 
 * @example
 * ```typescript
 * // Box collider
 * const boxCollider = new Collider(world, {
 *   type: 'box',
 *   size: [1, 1, 1]
 * });
 * 
 * // Sphere collider with material
 * const sphereCollider = new Collider(world, {
 *   type: 'sphere',
 *   radius: 0.5
 * }, body, {
 *   material: { friction: 0.5, restitution: 0.3 }
 * });
 * ```
 */
export class Collider {
  /** Unique identifier */
  readonly id: string;
  
  /** Shape type */
  readonly shapeType: ColliderShapeType;
  
  /** Cannon.js shape */
  readonly shape: CANNON.Shape;
  
  /** Cannon.js physics material */
  material: CANNON.Material | null;
  
  /** Is this a trigger collider */
  isTrigger: boolean = false;
  
  /** Offset from body center */
  offset: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  
  /** Rotation offset */
  rotationOffset: THREE.Quaternion = new THREE.Quaternion();
  
  /** User data */
  userData: Record<string, unknown> = {};
  
  /** Parent body (if attached) */
  body: CANNON.Body | null = null;
  
  private world: CANNON.World | null = null;
  
  constructor(
    world: CANNON.World | null,
    options: ColliderOptions,
    body?: CANNON.Body,
    extraOptions?: CreateColliderOptions
  ) {
    this.id = uuidv4();
    this.world = world;
    this.shapeType = options.type;
    
    // Create shape based on type
    this.shape = this.createShape(options);
    
    // Create material
    if (extraOptions?.material) {
      this.material = new CANNON.Material(extraOptions.material.name || 'default');
      this.material.friction = extraOptions.material.friction ?? 0.3;
      this.material.restitution = extraOptions.material.restitution ?? 0.3;
      
      // Apply material to shape
      this.shape.material = this.material;
      
      // Add contact material to world
      if (world) {
        const defaultMaterial = new CANNON.Material('default');
        const contactMaterial = new CANNON.ContactMaterial(this.material, defaultMaterial, {
          friction: this.material.friction,
          restitution: this.material.restitution
        });
        world.addContactMaterial(contactMaterial);
      }
    } else {
      this.material = null;
    }
    
    // Apply extra options
    if (extraOptions) {
      this.isTrigger = extraOptions.isTrigger ?? false;
      
      if (extraOptions.offset) {
        this.offset.set(...extraOptions.offset);
      }
      
      if (extraOptions.rotation) {
        this.rotationOffset.set(...extraOptions.rotation);
      }
      
      if (extraOptions.collisionGroup !== undefined) {
        this.shape.collisionFilterGroup = extraOptions.collisionGroup;
      }
      
      if (extraOptions.collisionMask !== undefined) {
        this.shape.collisionFilterMask = extraOptions.collisionMask;
      }
    }
    
    // Attach to body if provided
    if (body) {
      this.attachToBody(body);
    }
  }
  
  /**
   * Create Cannon.js shape from options
   */
  private createShape(options: ColliderOptions): CANNON.Shape {
    switch (options.type) {
      case 'box': {
        const [hx, hy, hz] = options.size;
        return new CANNON.Box(new CANNON.Vec3(hx, hy, hz));
      }
      
      case 'sphere': {
        return new CANNON.Sphere(options.radius);
      }
      
      case 'capsule': {
        // Cannon-es doesn't have a capsule, so we create it using cylinders and spheres
        // For simplicity, we'll use a cylinder approximation
        const { radius, height, segments = 8 } = options;
        return new CANNON.Cylinder(radius, radius, height + radius * 2, segments);
      }
      
      case 'cylinder': {
        const { radiusTop, radiusBottom, height, segments = 16 } = options;
        return new CANNON.Cylinder(radiusTop, radiusBottom, height, segments);
      }
      
      case 'mesh': {
        const { vertices, indices } = options;
        const cannonVertices = new CANNON.Vec3();
        const vertexArray: CANNON.Vec3[] = [];
        
        for (let i = 0; i < vertices.length; i += 3) {
          vertexArray.push(new CANNON.Vec3(
            vertices[i],
            vertices[i + 1],
            vertices[i + 2]
          ));
        }
        
        if (indices && indices.length > 0) {
          return new CANNON.Trimesh(
            vertexArray.map(v => [v.x, v.y, v.z]).flat(),
            indices
          );
        } else {
          // Create convex hull if no indices provided
          return new CANNON.ConvexPolyhedron({
            vertices: vertexArray,
            faces: [] // Will be computed automatically
          });
        }
      }
      
      case 'convexHull': {
        const { vertices } = options;
        const cannonVertices: CANNON.Vec3[] = vertices.map(v => {
          if (v instanceof THREE.Vector3) {
            return new CANNON.Vec3(v.x, v.y, v.z);
          }
          return new CANNON.Vec3(v[0], v[1], v[2]);
        });
        
        return new CANNON.ConvexPolyhedron({
          vertices: cannonVertices,
          faces: [] // Will be computed automatically
        });
      }
      
      case 'plane': {
        return new CANNON.Plane();
      }
      
      default:
        throw new Error(`Unknown collider type: ${(options as any).type}`);
    }
  }
  
  /**
   * Attach this collider to a body
   */
  attachToBody(body: CANNON.Body): void {
    if (this.body) {
      this.detachFromBody();
    }
    
    this.body = body;
    
    // Add shape to body with offset
    const offsetVec = new CANNON.Vec3(this.offset.x, this.offset.y, this.offset.z);
    const orientQuat = new CANNON.Quaternion(
      this.rotationOffset.x,
      this.rotationOffset.y,
      this.rotationOffset.z,
      this.rotationOffset.w
    );
    
    body.addShape(this.shape, offsetVec, orientQuat);
  }
  
  /**
   * Detach this collider from its body
   */
  detachFromBody(): void {
    if (this.body) {
      const index = this.body.shapes.indexOf(this.shape);
      if (index > -1) {
        this.body.shapes.splice(index, 1);
        this.body.shapeOffsets.splice(index, 1);
        this.body.shapeOrientations.splice(index, 1);
        this.body.updateMassProperties();
      }
      this.body = null;
    }
  }
  
  /**
   * Set collider offset
   */
  setOffset(x: number, y: number, z: number): void {
    this.offset.set(x, y, z);
    
    // Update body shape offset if attached
    if (this.body) {
      const index = this.body.shapes.indexOf(this.shape);
      if (index > -1) {
        this.body.shapeOffsets[index].set(x, y, z);
      }
    }
  }
  
  /**
   * Set rotation offset
   */
  setRotationOffset(x: number, y: number, z: number, w: number): void {
    this.rotationOffset.set(x, y, z, w);
    
    // Update body shape rotation if attached
    if (this.body) {
      const index = this.body.shapes.indexOf(this.shape);
      if (index > -1) {
        this.body.shapeOrientations[index].set(x, y, z, w);
      }
    }
  }
  
  /**
   * Set physics material properties
   */
  setMaterial(options: PhysicsMaterialOptions): void {
    if (!this.material) {
      this.material = new CANNON.Material(options.name || 'custom');
      this.shape.material = this.material;
    }
    
    this.material.friction = options.friction ?? 0.3;
    this.material.restitution = options.restitution ?? 0.3;
  }
  
  /**
   * Get friction coefficient
   */
  get friction(): number {
    return this.material?.friction ?? 0.3;
  }
  
  /**
   * Set friction coefficient
   */
  set friction(value: number) {
    if (this.material) {
      this.material.friction = value;
    }
  }
  
  /**
   * Get restitution (bounciness)
   */
  get restitution(): number {
    return this.material?.restitution ?? 0.3;
  }
  
  /**
   * Set restitution
   */
  set restitution(value: number) {
    if (this.material) {
      this.material.restitution = value;
    }
  }
  
  /**
   * Set collision group
   */
  setCollisionGroup(group: number): void {
    this.shape.collisionFilterGroup = group;
  }
  
  /**
   * Set collision mask
   */
  setCollisionMask(mask: number): void {
    this.shape.collisionFilterMask = mask;
  }
  
  /**
   * Get bounding box
   */
  getBoundingBox(): { min: THREE.Vector3; max: THREE.Vector3 } {
    const aabb = new CANNON.AABB();
    this.shape.calculateWorldAABB(
      this.body?.position || new CANNON.Vec3(),
      this.body?.quaternion || new CANNON.Quaternion(),
      aabb.lowerBound,
      aabb.upperBound
    );
    
    return {
      min: new THREE.Vector3(aabb.lowerBound.x, aabb.lowerBound.y, aabb.lowerBound.z),
      max: new THREE.Vector3(aabb.upperBound.x, aabb.upperBound.y, aabb.upperBound.z)
    };
  }
  
  /**
   * Get bounding sphere radius
   */
  getBoundingRadius(): number {
    if (this.shape instanceof CANNON.Sphere) {
      return this.shape.radius;
    } else if (this.shape instanceof CANNON.Box) {
      const he = this.shape.halfExtents;
      return Math.sqrt(he.x * he.x + he.y * he.y + he.z * he.z);
    } else if (this.shape instanceof CANNON.Cylinder) {
      return Math.max(this.shape.radiusTop, this.shape.radiusBottom);
    }
    
    // Default approximation
    return 1;
  }
  
  /**
   * Check if a point is inside the collider
   */
  containsPoint(point: THREE.Vector3): boolean {
    if (!this.body) return false;

    const aabb = this.getBoundingBox();
    return (
      point.x >= aabb.min.x &&
      point.x <= aabb.max.x &&
      point.y >= aabb.min.y &&
      point.y <= aabb.max.y &&
      point.z >= aabb.min.z &&
      point.z <= aabb.max.z
    );
  }
  
  /**
   * Get closest point on collider surface to a given point
   */
  closestPointToPoint(point: THREE.Vector3): THREE.Vector3 {
    // Simple approximation - transform point to local space
    if (!this.body) return point.clone();
    
    const localPoint = this.worldToLocal(point);
    let closest: THREE.Vector3;
    
    if (this.shape instanceof CANNON.Sphere) {
      const dir = localPoint.clone().normalize();
      closest = dir.multiplyScalar(this.shape.radius);
    } else if (this.shape instanceof CANNON.Box) {
      const he = this.shape.halfExtents;
      closest = new THREE.Vector3(
        Math.max(-he.x, Math.min(he.x, localPoint.x)),
        Math.max(-he.y, Math.min(he.y, localPoint.y)),
        Math.max(-he.z, Math.min(he.z, localPoint.z))
      );
    } else {
      closest = localPoint;
    }
    
    return this.localToWorld(closest);
  }
  
  /**
   * Convert world point to local (collider) space
   */
  worldToLocal(worldPoint: THREE.Vector3): THREE.Vector3 {
    if (!this.body) return worldPoint.clone();
    
    const result = new CANNON.Vec3();
    this.body.pointToLocalFrame(
      new CANNON.Vec3(worldPoint.x, worldPoint.y, worldPoint.z),
      result
    );
    
    // Apply offset
    result.x -= this.offset.x;
    result.y -= this.offset.y;
    result.z -= this.offset.z;
    
    return new THREE.Vector3(result.x, result.y, result.z);
  }
  
  /**
   * Convert local (collider) point to world space
   */
  localToWorld(localPoint: THREE.Vector3): THREE.Vector3 {
    if (!this.body) return localPoint.clone();
    
    const point = new CANNON.Vec3(
      localPoint.x + this.offset.x,
      localPoint.y + this.offset.y,
      localPoint.z + this.offset.z
    );
    
    const result = new CANNON.Vec3();
    this.body.pointToWorldFrame(point, result);
    
    return new THREE.Vector3(result.x, result.y, result.z);
  }
  
  /**
   * Create collider from Three.js geometry
   */
  static fromGeometry(
    world: CANNON.World | null,
    geometry: THREE.BufferGeometry,
    body?: CANNON.Body,
    options?: CreateColliderOptions
  ): Collider {
    const position = geometry.getAttribute('position');
    const index = geometry.getIndex();
    
    const vertices: number[] = [];
    const indices: number[] = [];
    
    if (position) {
      for (let i = 0; i < position.count; i++) {
        vertices.push(
          position.getX(i),
          position.getY(i),
          position.getZ(i)
        );
      }
    }
    
    if (index) {
      for (let i = 0; i < index.count; i++) {
        indices.push(index.getX(i));
      }
    }
    
    return new Collider(world, {
      type: 'mesh',
      vertices,
      indices: indices.length > 0 ? indices : undefined
    }, body, options);
  }
  
  /**
   * Create box collider
   */
  static createBox(
    world: CANNON.World | null,
    halfExtents: [number, number, number],
    body?: CANNON.Body,
    options?: CreateColliderOptions
  ): Collider {
    return new Collider(world, {
      type: 'box',
      size: halfExtents
    }, body, options);
  }
  
  /**
   * Create sphere collider
   */
  static createSphere(
    world: CANNON.World | null,
    radius: number,
    body?: CANNON.Body,
    options?: CreateColliderOptions
  ): Collider {
    return new Collider(world, {
      type: 'sphere',
      radius
    }, body, options);
  }
  
  /**
   * Create capsule collider
   */
  static createCapsule(
    world: CANNON.World | null,
    radius: number,
    height: number,
    body?: CANNON.Body,
    options?: CreateColliderOptions
  ): Collider {
    return new Collider(world, {
      type: 'capsule',
      radius,
      height
    }, body, options);
  }
  
  /**
   * Create cylinder collider
   */
  static createCylinder(
    world: CANNON.World | null,
    radiusTop: number,
    radiusBottom: number,
    height: number,
    body?: CANNON.Body,
    options?: CreateColliderOptions
  ): Collider {
    return new Collider(world, {
      type: 'cylinder',
      radiusTop,
      radiusBottom,
      height
    }, body, options);
  }
  
  /**
   * Serialize to JSON
   */
  toJSON(): Record<string, unknown> {
    const result: Record<string, unknown> = {
      id: this.id,
      type: this.shapeType,
      isTrigger: this.isTrigger,
      offset: [this.offset.x, this.offset.y, this.offset.z],
      rotationOffset: [this.rotationOffset.x, this.rotationOffset.y, this.rotationOffset.z, this.rotationOffset.w],
      friction: this.friction,
      restitution: this.restitution,
      userData: this.userData
    };
    
    // Add shape-specific data
    if (this.shape instanceof CANNON.Box) {
      result.size = [this.shape.halfExtents.x, this.shape.halfExtents.y, this.shape.halfExtents.z];
    } else if (this.shape instanceof CANNON.Sphere) {
      result.radius = this.shape.radius;
    } else if (this.shape instanceof CANNON.Cylinder) {
      result.radiusTop = this.shape.radiusTop;
      result.radiusBottom = this.shape.radiusBottom;
      result.height = this.shape.height;
    }
    
    return result;
  }
  
  /**
   * Destroy this collider
   */
  destroy(): void {
    this.detachFromBody();
    this.body = null;
    this.world = null;
  }
}
