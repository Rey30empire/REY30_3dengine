// ============================================
// Blend Tree System
// REY30 3D Engine - Animation Module
// ============================================

import { AnimationClip } from './AnimationClip';
import type { Vector3, Quaternion } from '@/types/engine';

/**
 * Blend tree motion for blending
 */
export interface BlendMotion {
  /** Motion name */
  name: string;
  /** Animation clip */
  clip: AnimationClip;
  /** Position in blend space (1D or 2D) */
  position: number | Vector2;
  /** Speed multiplier */
  speed: number;
  /** Mirror animation */
  mirror: boolean;
}

/**
 * 2D Vector for blend space
 */
export interface Vector2 {
  x: number;
  y: number;
}

/**
 * Blend tree type
 */
export enum BlendTreeType {
  /** Single parameter (1D blend) */
  Simple1D = 'simple1d',
  /** Two parameters (2D blend) */
  Simple2D = 'simple2d',
  /** Freeform directional 2D */
  FreeformDirectional2D = 'freeformDirectional2d',
  /** Freeform Cartesian 2D */
  FreeformCartesian2D = 'freeformCartesian2d',
}

/**
 * Blend tree for smooth animation blending
 */
export class BlendTree {
  /** Unique identifier */
  id: string;
  
  /** Blend tree name */
  name: string;
  
  /** Blend tree type */
  type: BlendTreeType;
  
  /** Motions to blend */
  motions: BlendMotion[] = [];
  
  /** Parameter name for 1D blend */
  blendParameter: string = '';
  
  /** Parameter names for 2D blend */
  blendParameterX: string = '';
  blendParameterY: string = '';
  
  /** Whether to compute blend weights automatically */
  autoComputeThresholds: boolean = true;
  
  /** Precomputed weights cache */
  private weightCache: Map<string, number> = new Map();

  constructor(id: string, name: string, type: BlendTreeType = BlendTreeType.Simple1D) {
    this.id = id;
    this.name = name;
    this.type = type;
  }

  private getPositionX(position: number | Vector2): number {
    return typeof position === 'number' ? position : position.x;
  }

  /**
   * Add a motion to the blend tree
   */
  addMotion(motion: BlendMotion): void {
    this.motions.push(motion);
    this.computeThresholds();
  }

  /**
   * Remove a motion by name
   */
  removeMotion(name: string): boolean {
    const index = this.motions.findIndex(m => m.name === name);
    if (index >= 0) {
      this.motions.splice(index, 1);
      this.computeThresholds();
      return true;
    }
    return false;
  }

  /**
   * Get motion by name
   */
  getMotion(name: string): BlendMotion | undefined {
    return this.motions.find(m => m.name === name);
  }

  /**
   * Compute thresholds automatically
   */
  computeThresholds(): void {
    if (!this.autoComputeThresholds) return;
    
    // Thresholds are now based on position values
    // No additional computation needed for basic implementation
  }

  /**
   * Evaluate blend weights for 1D parameter
   */
  evaluate1D(parameterValue: number): Map<string, number> {
    const weights = new Map<string, number>();
    
    if (this.motions.length === 0) return weights;
    
    // Sort motions by position
    const sortedMotions = [...this.motions].sort((a, b) => {
      const posA = this.getPositionX(a.position);
      const posB = this.getPositionX(b.position);
      return posA - posB;
    });
    
    // Find surrounding motions
    let lower = sortedMotions[0];
    let upper = sortedMotions[sortedMotions.length - 1];
    
    for (let i = 0; i < sortedMotions.length - 1; i++) {
      const currentPos = this.getPositionX(sortedMotions[i].position);
      const nextPos = this.getPositionX(sortedMotions[i + 1].position);
      
      if (parameterValue >= currentPos && parameterValue <= nextPos) {
        lower = sortedMotions[i];
        upper = sortedMotions[i + 1];
        break;
      }
    }
    
    const lowerPos = this.getPositionX(lower.position);
    const upperPos = this.getPositionX(upper.position);
    
    if (lower === upper || lowerPos === upperPos) {
      weights.set(lower.name, 1);
      return weights;
    }
    
    // Linear interpolation
    const t = (parameterValue - lowerPos) / (upperPos - lowerPos);
    weights.set(lower.name, 1 - t);
    weights.set(upper.name, t);
    
    return weights;
  }

  /**
   * Evaluate blend weights for 2D parameters
   */
  evaluate2D(paramX: number, paramY: number): Map<string, number> {
    const weights = new Map<string, number>();
    
    if (this.motions.length === 0) return weights;
    
    if (this.type === BlendTreeType.FreeformDirectional2D) {
      return this.evaluateDirectional2D(paramX, paramY);
    }
    
    // Use gradient band interpolation for simple 2D
    return this.evaluateCartesian2D(paramX, paramY);
  }

  /**
   * Evaluate directional 2D blend
   */
  private evaluateDirectional2D(paramX: number, paramY: number): Map<string, number> {
    const weights = new Map<string, number>();
    
    // Calculate distance-weighted blend
    const distances: { name: string; distance: number; weight: number }[] = [];
    let totalWeight = 0;
    
    for (const motion of this.motions) {
      const pos = this.getPosition2D(motion);
      const dx = paramX - pos.x;
      const dy = paramY - pos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // Use inverse distance weighting
      const weight = distance < 0.001 ? 1 : 1 / distance;
      distances.push({ name: motion.name, distance, weight });
      totalWeight += weight;
    }
    
    // Normalize weights
    for (const item of distances) {
      weights.set(item.name, item.weight / totalWeight);
    }
    
    return weights;
  }

  /**
   * Evaluate Cartesian 2D blend
   */
  private evaluateCartesian2D(paramX: number, paramY: number): Map<string, number> {
    const weights = new Map<string, number>();
    
    if (this.motions.length === 0) return weights;
    
    // Find the 4 closest motions for bilinear interpolation
    const motions = this.motions.map(m => ({
      motion: m,
      pos: this.getPosition2D(m),
    }));
    
    // Sort by distance to find nearest neighbors
    motions.sort((a, b) => {
      const distA = Math.sqrt(Math.pow(paramX - a.pos.x, 2) + Math.pow(paramY - a.pos.y, 2));
      const distB = Math.sqrt(Math.pow(paramX - b.pos.x, 2) + Math.pow(paramY - b.pos.y, 2));
      return distA - distB;
    });
    
    // Use inverse distance weighting for smoother blending
    let totalWeight = 0;
    const blendMotions = motions.slice(0, Math.min(4, motions.length));
    
    for (const item of blendMotions) {
      const dist = Math.sqrt(Math.pow(paramX - item.pos.x, 2) + Math.pow(paramY - item.pos.y, 2));
      const weight = dist < 0.001 ? 1 : 1 / (dist * dist);
      weights.set(item.motion.name, weight);
      totalWeight += weight;
    }
    
    // Normalize
    for (const [name, weight] of weights) {
      weights.set(name, weight / totalWeight);
    }
    
    return weights;
  }

  /**
   * Get 2D position from motion
   */
  private getPosition2D(motion: BlendMotion): Vector2 {
    if (typeof motion.position === 'number') {
      return { x: motion.position, y: 0 };
    }
    return motion.position;
  }

  /**
   * Sample all motions and blend result
   */
  sample(time: number, paramValue: number | Vector2): Map<string, Map<string, unknown>> {
    // Get blend weights
    let weights: Map<string, number>;
    
    if (this.type === BlendTreeType.Simple1D) {
      weights = this.evaluate1D(paramValue as number);
    } else {
      const param = paramValue as Vector2;
      weights = this.evaluate2D(param.x, param.y);
    }
    
    // Blend sampled values
    const result = new Map<string, Map<string, unknown>>();
    
    for (const motion of this.motions) {
      const weight = weights.get(motion.name) || 0;
      if (weight <= 0) continue;
      
      const sampled = motion.clip.sample(time * motion.speed);
      
      for (const [target, properties] of sampled) {
        if (!result.has(target)) {
          result.set(target, new Map());
        }
        
        for (const [property, value] of properties) {
          const existing = result.get(target)!.get(property);
          
          if (existing === undefined) {
            result.get(target)!.set(property, this.scaleValue(value, weight));
          } else {
            result.get(target)!.set(property, this.blendValues(existing, value, weight));
          }
        }
      }
    }
    
    return result;
  }

  /**
   * Blend two values
   */
  private blendValues(a: unknown, b: unknown, weight: number): unknown {
    if (typeof a === 'number' && typeof b === 'number') {
      return a + b * weight;
    }
    
    if (this.isVector3(a) && this.isVector3(b)) {
      return {
        x: a.x + b.x * weight,
        y: a.y + b.y * weight,
        z: a.z + b.z * weight,
      };
    }
    
    if (this.isQuaternion(a) && this.isQuaternion(b)) {
      // For quaternion blending, we need to use slerp
      // Simplified weighted addition here
      return {
        x: a.x + b.x * weight,
        y: a.y + b.y * weight,
        z: a.z + b.z * weight,
        w: a.w + b.w * weight,
      };
    }
    
    return a;
  }

  /**
   * Scale a value by weight
   */
  private scaleValue(value: unknown, weight: number): unknown {
    if (typeof value === 'number') {
      return value * weight;
    }
    
    if (this.isVector3(value)) {
      return {
        x: value.x * weight,
        y: value.y * weight,
        z: value.z * weight,
      };
    }
    
    if (this.isQuaternion(value)) {
      return {
        x: value.x * weight,
        y: value.y * weight,
        z: value.z * weight,
        w: value.w * weight,
      };
    }
    
    return value;
  }

  /**
   * Type guards
   */
  private isVector3(value: unknown): value is Vector3 {
    return typeof value === 'object' && value !== null && 
           'x' in value && 'y' in value && 'z' in value && !('w' in value);
  }

  private isQuaternion(value: unknown): value is Quaternion {
    return typeof value === 'object' && value !== null && 
           'x' in value && 'y' in value && 'z' in value && 'w' in value;
  }

  /**
   * Get total duration (weighted average)
   */
  getDuration(paramValue: number | Vector2): number {
    let weights: Map<string, number>;
    
    if (this.type === BlendTreeType.Simple1D) {
      weights = this.evaluate1D(paramValue as number);
    } else {
      const param = paramValue as Vector2;
      weights = this.evaluate2D(param.x, param.y);
    }
    
    let totalDuration = 0;
    let totalWeight = 0;
    
    for (const motion of this.motions) {
      const weight = weights.get(motion.name) || 0;
      totalDuration += motion.clip.duration * weight;
      totalWeight += weight;
    }
    
    return totalWeight > 0 ? totalDuration / totalWeight : 0;
  }

  /**
   * Create a simple 1D blend tree for locomotion
   */
  static createLocomotionTree(
    idle: AnimationClip,
    walk: AnimationClip,
    run: AnimationClip
  ): BlendTree {
    const tree = new BlendTree('locomotion', 'Locomotion', BlendTreeType.Simple1D);
    tree.blendParameter = 'speed';
    
    tree.addMotion({
      name: 'idle',
      clip: idle,
      position: 0,
      speed: 1,
      mirror: false,
    });
    
    tree.addMotion({
      name: 'walk',
      clip: walk,
      position: 0.5,
      speed: 1,
      mirror: false,
    });
    
    tree.addMotion({
      name: 'run',
      clip: run,
      position: 1,
      speed: 1.2,
      mirror: false,
    });
    
    return tree;
  }

  /**
   * Create a 2D blend tree for movement direction
   */
  static createMovementTree(
    idle: AnimationClip,
    walkForward: AnimationClip,
    walkBackward: AnimationClip,
    walkLeft: AnimationClip,
    walkRight: AnimationClip
  ): BlendTree {
    const tree = new BlendTree('movement', 'Movement', BlendTreeType.FreeformDirectional2D);
    tree.blendParameterX = 'moveX';
    tree.blendParameterY = 'moveY';
    
    tree.addMotion({
      name: 'idle',
      clip: idle,
      position: { x: 0, y: 0 },
      speed: 1,
      mirror: false,
    });
    
    tree.addMotion({
      name: 'walkForward',
      clip: walkForward,
      position: { x: 0, y: 1 },
      speed: 1,
      mirror: false,
    });
    
    tree.addMotion({
      name: 'walkBackward',
      clip: walkBackward,
      position: { x: 0, y: -1 },
      speed: 1,
      mirror: false,
    });
    
    tree.addMotion({
      name: 'walkLeft',
      clip: walkLeft,
      position: { x: -1, y: 0 },
      speed: 1,
      mirror: false,
    });
    
    tree.addMotion({
      name: 'walkRight',
      clip: walkRight,
      position: { x: 1, y: 0 },
      speed: 1,
      mirror: false,
    });
    
    return tree;
  }

  /**
   * Serialize to JSON
   */
  toJSON(): BlendTreeJSON {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      motions: this.motions.map(m => ({
        name: m.name,
        clipId: m.clip.id,
        position: m.position,
        speed: m.speed,
        mirror: m.mirror,
      })),
      blendParameter: this.blendParameter,
      blendParameterX: this.blendParameterX,
      blendParameterY: this.blendParameterY,
    };
  }

  /**
   * Create from JSON with clip lookup
   */
  static fromJSON(data: BlendTreeJSON, clips: Map<string, AnimationClip>): BlendTree {
    const tree = new BlendTree(data.id, data.name, data.type as BlendTreeType);
    tree.blendParameter = data.blendParameter;
    tree.blendParameterX = data.blendParameterX;
    tree.blendParameterY = data.blendParameterY;
    
    for (const motionData of data.motions) {
      const clip = clips.get(motionData.clipId);
      if (clip) {
        tree.addMotion({
          name: motionData.name,
          clip,
          position: motionData.position as number | Vector2,
          speed: motionData.speed,
          mirror: motionData.mirror,
        });
      }
    }
    
    return tree;
  }
}

/**
 * Blend tree JSON representation
 */
export interface BlendTreeJSON {
  id: string;
  name: string;
  type: string;
  motions: Array<{
    name: string;
    clipId: string;
    position: number | Vector2;
    speed: number;
    mirror: boolean;
  }>;
  blendParameter: string;
  blendParameterX: string;
  blendParameterY: string;
}
