// ============================================
// Raycast System
// REY30 3D Engine
// ============================================

import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import type { RigidBody } from './RigidBody';

/**
 * Raycast hit result
 */
export interface RaycastHit {
  /** Did the ray hit something */
  hit: boolean;
  /** Hit point in world coordinates */
  point: THREE.Vector3;
  /** Hit normal in world coordinates */
  normal: THREE.Vector3;
  /** Distance from ray origin to hit point */
  distance: number;
  /** The rigid body that was hit */
  body: RigidBody | null;
  /** The collider that was hit */
  collider: CANNON.Shape | null;
  /** Face index (for mesh colliders) */
  faceIndex: number;
}

/**
 * Raycast options
 */
export interface RaycastOptions {
  /** Maximum distance for the ray */
  maxDistance?: number;
  /** Collision group filter */
  collisionGroup?: number;
  /** Collision mask filter */
  collisionMask?: number;
  /** Skip backfacing triangles */
  skipBackfaces?: boolean;
  /** Ignore specific bodies */
  ignoreBodies?: CANNON.Body[];
  /** Only hit triggers */
  triggersOnly?: boolean;
  /** Ignore triggers */
  ignoreTriggers?: boolean;
}

/**
 * Sphere cast options
 */
export interface SphereCastOptions extends RaycastOptions {
  /** Radius of the sphere */
  radius: number;
}

/**
 * Box cast options
 */
export interface BoxCastOptions extends RaycastOptions {
  /** Half extents of the box */
  halfExtents: THREE.Vector3;
}

/**
 * Overlap result
 */
export interface OverlapResult {
  /** Bodies found in overlap */
  bodies: RigidBody[];
  /** Number of colliders found */
  colliderCount: number;
}

/**
 * Raycast utility class
 */
export class Raycaster {
  private world: CANNON.World;
  private bodyToRigidBody: Map<CANNON.Body, RigidBody>;
  
  constructor(world: CANNON.World, bodyToRigidBody: Map<CANNON.Body, RigidBody>) {
    this.world = world;
    this.bodyToRigidBody = bodyToRigidBody;
  }
  
  /**
   * Perform a single raycast
   * Returns the closest hit
   */
  raycast(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    options: RaycastOptions = {}
  ): RaycastHit {
    const {
      maxDistance = 100,
      collisionMask,
      skipBackfaces = true,
      ignoreBodies = []
    } = options;
    
    // Calculate end point
    const endPoint = origin.clone().add(direction.clone().multiplyScalar(maxDistance));
    
    // Create ray
    const rayFrom = new CANNON.Vec3(origin.x, origin.y, origin.z);
    const rayTo = new CANNON.Vec3(endPoint.x, endPoint.y, endPoint.z);
    const ray = new CANNON.Ray(rayFrom, rayTo);
    
    // Setup result
    const result = new CANNON.RaycastResult();
    
    // Perform raycast
    ray.intersectWorld(this.world, {
      mode: CANNON.Ray.CLOSEST,
      result: result,
      skipBackfaces,
      collisionFilterMask: collisionMask
    });
    
    // Check if should ignore this body
    if (result.hasHit && result.body && ignoreBodies.includes(result.body)) {
      // Try to find next hit
      return this.raycastNext(origin, direction, result.distance, options);
    }
    
    // Build result
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
        distance: result.distance,
        body: result.body ? this.bodyToRigidBody.get(result.body) || null : null,
        collider: result.shape || null,
        faceIndex: result.hitFaceIndex ?? -1
      };
    }
    
    // No hit
    return {
      hit: false,
      point: new THREE.Vector3(),
      normal: new THREE.Vector3(),
      distance: Infinity,
      body: null,
      collider: null,
      faceIndex: -1
    };
  }
  
  /**
   * Find next hit after a certain distance
   */
  private raycastNext(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    minDistance: number,
    options: RaycastOptions
  ): RaycastHit {
    // Offset origin past the ignored hit
    const newOrigin = origin.clone().add(direction.clone().multiplyScalar(minDistance + 0.001));
    return this.raycast(newOrigin, direction, { ...options, maxDistance: (options.maxDistance || 100) - minDistance });
  }
  
  /**
   * Perform raycast and get all hits
   */
  raycastAll(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    options: RaycastOptions = {}
  ): RaycastHit[] {
    const {
      maxDistance = 100,
      collisionMask,
      skipBackfaces = true
    } = options;
    
    const hits: RaycastHit[] = [];
    const endPoint = origin.clone().add(direction.clone().multiplyScalar(maxDistance));
    
    const rayFrom = new CANNON.Vec3(origin.x, origin.y, origin.z);
    const rayTo = new CANNON.Vec3(endPoint.x, endPoint.y, endPoint.z);
    const ray = new CANNON.Ray(rayFrom, rayTo);
    
    ray.intersectWorld(this.world, {
      mode: CANNON.Ray.ALL,
      skipBackfaces,
      collisionFilterMask: collisionMask,
      callback: (result: CANNON.RaycastResult) => {
        if (result.hasHit) {
          hits.push({
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
            distance: result.distance,
            body: result.body ? this.bodyToRigidBody.get(result.body) || null : null,
            collider: result.shape || null,
            faceIndex: result.hitFaceIndex ?? -1
          });
        }
      }
    });
    
    // Sort by distance
    return hits.sort((a, b) => a.distance - b.distance);
  }
  
  /**
   * Sphere cast - sweep a sphere along a ray
   */
  sphereCast(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    radius: number,
    options: RaycastOptions = {}
  ): RaycastHit {
    const {
      maxDistance = 100,
      collisionMask,
      skipBackfaces = true
    } = options;
    
    // Create a temporary sphere body for the sweep
    const sphereShape = new CANNON.Sphere(radius);
    const tempBody = new CANNON.Body({ mass: 0 });
    tempBody.addShape(sphereShape);
    tempBody.position.set(origin.x, origin.y, origin.z);
    
    const endPoint = origin.clone().add(direction.clone().normalize().multiplyScalar(maxDistance));
    
    const rayFrom = new CANNON.Vec3(origin.x, origin.y, origin.z);
    const rayTo = new CANNON.Vec3(endPoint.x, endPoint.y, endPoint.z);
    const ray = new CANNON.Ray(rayFrom, rayTo);
    
    const result = new CANNON.RaycastResult();
    
    // Perform sweep test (simplified using raycast with radius consideration)
    ray.intersectWorld(this.world, {
      mode: CANNON.Ray.CLOSEST,
      result: result,
      skipBackfaces,
      collisionFilterMask: collisionMask
    });
    
    if (result.hasHit) {
      // Adjust point for sphere radius
      const hitPoint = new THREE.Vector3(
        result.hitPointWorld.x,
        result.hitPointWorld.y,
        result.hitPointWorld.z
      );
      const normal = new THREE.Vector3(
        result.hitNormalWorld.x,
        result.hitNormalWorld.y,
        result.hitNormalWorld.z
      );
      
      // Move point outward by radius along normal
      const adjustedPoint = hitPoint.clone().add(normal.clone().multiplyScalar(radius));
      
      return {
        hit: true,
        point: adjustedPoint,
        normal,
        distance: result.distance - radius,
        body: result.body ? this.bodyToRigidBody.get(result.body) || null : null,
        collider: result.shape || null,
        faceIndex: result.hitFaceIndex ?? -1
      };
    }
    
    return {
      hit: false,
      point: new THREE.Vector3(),
      normal: new THREE.Vector3(),
      distance: Infinity,
      body: null,
      collider: null,
      faceIndex: -1
    };
  }
  
  /**
   * Box cast - sweep a box along a ray
   */
  boxCast(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    halfExtents: THREE.Vector3,
    options: RaycastOptions = {}
  ): RaycastHit {
    const {
      maxDistance = 100,
      collisionMask
    } = options;
    
    // Simplified box cast using multiple raycasts at corners
    const halfSize = Math.max(halfExtents.x, halfExtents.y, halfExtents.z);
    return this.sphereCast(origin, direction, halfSize, { ...options, maxDistance, collisionMask });
  }
  
  /**
   * Capsule cast - sweep a capsule along a ray
   */
  capsuleCast(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    radius: number,
    height: number,
    options: RaycastOptions = {}
  ): RaycastHit {
    const {
      maxDistance = 100,
      collisionMask
    } = options;
    
    // Simplified capsule cast
    const effectiveRadius = Math.max(radius, height / 2);
    return this.sphereCast(origin, direction, effectiveRadius, { ...options, maxDistance, collisionMask });
  }
  
  /**
   * Overlap sphere - find all bodies within a sphere
   */
  overlapSphere(
    position: THREE.Vector3,
    radius: number,
    options: RaycastOptions = {}
  ): OverlapResult {
    const { collisionMask } = options;
    const bodies: RigidBody[] = [];
    const center = new CANNON.Vec3(position.x, position.y, position.z);
    
    // Iterate through all bodies
    this.world.bodies.forEach((body) => {
      // Check collision mask
      if (collisionMask !== undefined && body.shapes.length > 0) {
        const shape = body.shapes[0];
        if ((shape.collisionFilterMask & collisionMask) === 0) {
          return;
        }
      }
      
      // Calculate distance from sphere center to body
      const distance = body.position.distanceTo(center);
      
      // Get body radius approximation
      let bodyRadius = 0;
      body.shapes.forEach((shape) => {
        if (shape instanceof CANNON.Sphere) {
          bodyRadius = Math.max(bodyRadius, shape.radius);
        } else if (shape instanceof CANNON.Box) {
          const he = shape.halfExtents;
          bodyRadius = Math.max(bodyRadius, Math.sqrt(he.x * he.x + he.y * he.y + he.z * he.z));
        } else if (shape instanceof CANNON.Cylinder) {
          bodyRadius = Math.max(bodyRadius, Math.max(shape.radiusTop, shape.radiusBottom));
        }
      });
      
      // Check if within sphere
      if (distance < radius + bodyRadius) {
        const rigidBody = this.bodyToRigidBody.get(body);
        if (rigidBody) {
          bodies.push(rigidBody);
        }
      }
    });
    
    return {
      bodies,
      colliderCount: bodies.length
    };
  }
  
  /**
   * Overlap box - find all bodies within a box
   */
  overlapBox(
    position: THREE.Vector3,
    halfExtents: THREE.Vector3,
    options: RaycastOptions = {}
  ): OverlapResult {
    const { collisionMask } = options;
    const bodies: RigidBody[] = [];
    const center = new CANNON.Vec3(position.x, position.y, position.z);
    
    // Iterate through all bodies
    this.world.bodies.forEach((body) => {
      // Check collision mask
      if (collisionMask !== undefined && body.shapes.length > 0) {
        const shape = body.shapes[0];
        if ((shape.collisionFilterMask & collisionMask) === 0) {
          return;
        }
      }
      
      // Simple AABB overlap check
      const bp = body.position;
      let bodyRadius = 0;
      
      body.shapes.forEach((shape) => {
        if (shape instanceof CANNON.Sphere) {
          bodyRadius = Math.max(bodyRadius, shape.radius);
        } else if (shape instanceof CANNON.Box) {
          const he = shape.halfExtents;
          bodyRadius = Math.max(bodyRadius, Math.sqrt(he.x * he.x + he.y * he.y + he.z * he.z));
        }
      });
      
      // Check AABB overlap
      const inX = Math.abs(bp.x - center.x) < halfExtents.x + bodyRadius;
      const inY = Math.abs(bp.y - center.y) < halfExtents.y + bodyRadius;
      const inZ = Math.abs(bp.z - center.z) < halfExtents.z + bodyRadius;
      
      if (inX && inY && inZ) {
        const rigidBody = this.bodyToRigidBody.get(body);
        if (rigidBody) {
          bodies.push(rigidBody);
        }
      }
    });
    
    return {
      bodies,
      colliderCount: bodies.length
    };
  }
  
  /**
   * Overlap capsule - find all bodies within a capsule
   */
  overlapCapsule(
    position: THREE.Vector3,
    radius: number,
    height: number,
    options: RaycastOptions = {}
  ): OverlapResult {
    // Simplified as sphere overlap
    return this.overlapSphere(position, Math.max(radius, height / 2), options);
  }
  
  /**
   * Check line of sight between two points
   */
  lineOfSight(
    from: THREE.Vector3,
    to: THREE.Vector3,
    options: RaycastOptions = {}
  ): { visible: boolean; obstructedBy: RigidBody | null; hitPoint: THREE.Vector3 | null } {
    const direction = to.clone().sub(from).normalize();
    const distance = from.distanceTo(to);
    
    const hit = this.raycast(from, direction, {
      ...options,
      maxDistance: distance
    });
    
    if (hit.hit && hit.distance < distance) {
      return {
        visible: false,
        obstructedBy: hit.body,
        hitPoint: hit.point
      };
    }
    
    return {
      visible: true,
      obstructedBy: null,
      hitPoint: null
    };
  }
  
  /**
   * Raycast from screen point (for picking)
   */
  screenPointToRay(
    screenX: number,
    screenY: number,
    camera: THREE.Camera,
    options: RaycastOptions = {}
  ): RaycastHit {
    // Convert screen coordinates to NDC
    const ndcX = (screenX * 2) - 1;
    const ndcY = -(screenY * 2) + 1;
    
    // Create ray from camera
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    
    return this.raycast(
      raycaster.ray.origin,
      raycaster.ray.direction,
      options
    );
  }
  
  /**
   * Batch raycast - perform multiple raycasts efficiently
   */
  batchRaycast(
    rays: Array<{ origin: THREE.Vector3; direction: THREE.Vector3 }>,
    options: RaycastOptions = {}
  ): RaycastHit[] {
    return rays.map(({ origin, direction }) => 
      this.raycast(origin, direction, options)
    );
  }
}

/**
 * Layer mask constants for raycasting
 */
export const RaycastLayers = {
  DEFAULT: 1,
  STATIC: 2,
  DYNAMIC: 4,
  KINEMATIC: 8,
  TRIGGER: 16,
  CHARACTER: 32,
  VEHICLE: 64,
  PROJECTILE: 128,
  ALL: -1
} as const;

/**
 * Helper function to create a raycast from two points
 */
export function createRayFromPoints(
  start: THREE.Vector3,
  end: THREE.Vector3
): { origin: THREE.Vector3; direction: THREE.Vector3; distance: number } {
  const direction = end.clone().sub(start);
  const distance = direction.length();
  direction.normalize();
  
  return {
    origin: start.clone(),
    direction,
    distance
  };
}

/**
 * Helper to perform a raycast in a cone pattern
 */
export function coneRaycast(
  raycaster: Raycaster,
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  coneAngle: number,
  rayCount: number,
  options: RaycastOptions = {}
  ): RaycastHit[] {
  const hits: RaycastHit[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  
  // Create perpendicular vectors
  let right = new THREE.Vector3().crossVectors(direction, up);
  if (right.lengthSq() < 0.001) {
    right.set(1, 0, 0);
  }
  right.normalize();
  
  const perpendicular = new THREE.Vector3().crossVectors(right, direction).normalize();
  
  for (let i = 0; i < rayCount; i++) {
    const angle = (i / rayCount) * Math.PI * 2;
    const offsetAngle = coneAngle * Math.random(); // Random angle within cone
    
    // Calculate ray direction
    const rotatedRight = right.clone().multiplyScalar(Math.cos(angle) * Math.sin(offsetAngle));
    const rotatedPerp = perpendicular.clone().multiplyScalar(Math.sin(angle) * Math.sin(offsetAngle));
    const forward = direction.clone().multiplyScalar(Math.cos(offsetAngle));
    
    const rayDirection = rotatedRight.add(rotatedPerp).add(forward).normalize();
    
    const hit = raycaster.raycast(origin, rayDirection, options);
    if (hit.hit) {
      hits.push(hit);
    }
  }
  
  return hits.sort((a, b) => a.distance - b.distance);
}
