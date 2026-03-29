// ============================================
// Animation Clip System
// REY30 3D Engine - Animation Module
// ============================================

import * as THREE from 'three';
import type { Vector3, Quaternion } from '@/types/engine';

/**
 * Animation wrap modes
 */
export enum WrapMode {
  /** Play once and stop */
  Once = 'once',
  /** Loop continuously */
  Loop = 'loop',
  /** Ping-pong between start and end */
  PingPong = 'pingpong',
  /** Clamp at last frame forever */
  ClampForever = 'clampforever',
}

/**
 * Animation curve interpolation types
 */
export enum InterpolationType {
  Linear = 'linear',
  Step = 'step',
  Cubic = 'cubic',
  Bezier = 'bezier',
}

/**
 * Keyframe for animation curves
 */
export interface Keyframe<T> {
  /** Time in seconds */
  time: number;
  /** Value at this keyframe */
  value: T;
  /** In tangent for cubic interpolation */
  inTangent?: number | T;
  /** Out tangent for cubic interpolation */
  outTangent?: number | T;
  /** Weight for bezier interpolation */
  weight?: number;
}

/**
 * Animation curve for a single property
 */
export class AnimationCurve<T = number | Vector3 | Quaternion> {
  private keyframes: Keyframe<T>[] = [];
  private interpolationType: InterpolationType = InterpolationType.Linear;

  constructor(interpolation: InterpolationType = InterpolationType.Linear) {
    this.interpolationType = interpolation;
  }

  /**
   * Add a keyframe to the curve
   */
  addKeyframe(keyframe: Keyframe<T>): number {
    const index = this.findInsertionIndex(keyframe.time);
    this.keyframes.splice(index, 0, keyframe);
    return index;
  }

  /**
   * Remove keyframe at index
   */
  removeKeyframe(index: number): boolean {
    if (index >= 0 && index < this.keyframes.length) {
      this.keyframes.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Get all keyframes
   */
  getKeyframes(): Keyframe<T>[] {
    return [...this.keyframes];
  }

  /**
   * Get keyframe count
   */
  get keyframeCount(): number {
    return this.keyframes.length;
  }

  /**
   * Evaluate the curve at a given time
   */
  evaluate(time: number): T | null {
    if (this.keyframes.length === 0) return null;
    if (this.keyframes.length === 1) return this.keyframes[0].value;

    // Find surrounding keyframes
    let i = 0;
    while (i < this.keyframes.length - 1 && this.keyframes[i + 1].time < time) {
      i++;
    }

    const kf1 = this.keyframes[i];
    const kf2 = this.keyframes[Math.min(i + 1, this.keyframes.length - 1)];

    if (kf1.time >= time) return kf1.value;
    if (kf2.time <= time) return kf2.value;

    // Calculate interpolation factor
    const duration = kf2.time - kf1.time;
    const t = duration > 0 ? (time - kf1.time) / duration : 0;

    return this.interpolate(kf1, kf2, t);
  }

  /**
   * Interpolate between two keyframes
   */
  private interpolate(kf1: Keyframe<T>, kf2: Keyframe<T>, t: number): T {
    switch (this.interpolationType) {
      case InterpolationType.Step:
        return kf1.value;
      
      case InterpolationType.Cubic:
        return this.cubicInterpolate(kf1, kf2, t);
      
      case InterpolationType.Bezier:
        return this.bezierInterpolate(kf1, kf2, t);
      
      case InterpolationType.Linear:
      default:
        return this.linearInterpolate(kf1.value, kf2.value, t);
    }
  }

  /**
   * Linear interpolation
   */
  private linearInterpolate(a: T, b: T, t: number): T {
    if (typeof a === 'number' && typeof b === 'number') {
      return (a + (b - a) * t) as T;
    }
    
    // Vector3 interpolation
    if (this.isVector3(a) && this.isVector3(b)) {
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        z: a.z + (b.z - a.z) * t,
      } as T;
    }
    
    // Quaternion interpolation (slerp)
    if (this.isQuaternion(a) && this.isQuaternion(b)) {
      const qa = new THREE.Quaternion(a.x, a.y, a.z, a.w);
      const qb = new THREE.Quaternion(b.x, b.y, b.z, b.w);
      const result = qa.slerp(qb, t);
      return { x: result.x, y: result.y, z: result.z, w: result.w } as T;
    }
    
    return a;
  }

  /**
   * Cubic interpolation with tangents
   */
  private cubicInterpolate(kf1: Keyframe<T>, kf2: Keyframe<T>, t: number): T {
    // Hermite interpolation
    const t2 = t * t;
    const t3 = t2 * t;
    
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;

    const dt = kf2.time - kf1.time;
    
    if (typeof kf1.value === 'number' && typeof kf2.value === 'number') {
      const p0 = kf1.value;
      const p1 = kf2.value;
      const m0 = (kf1.outTangent as number || 0) * dt;
      const m1 = (kf2.inTangent as number || 0) * dt;
      
      return (h00 * p0 + h10 * m0 + h01 * p1 + h11 * m1) as T;
    }
    
    return this.linearInterpolate(kf1.value, kf2.value, t);
  }

  /**
   * Bezier interpolation
   */
  private bezierInterpolate(kf1: Keyframe<T>, kf2: Keyframe<T>, t: number): T {
    // Simplified bezier - use cubic for now
    return this.cubicInterpolate(kf1, kf2, t);
  }

  /**
   * Find insertion index for a new keyframe
   */
  private findInsertionIndex(time: number): number {
    for (let i = 0; i < this.keyframes.length; i++) {
      if (this.keyframes[i].time > time) {
        return i;
      }
    }
    return this.keyframes.length;
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
   * Reduce keyframes using Ramer-Douglas-Peucker algorithm
   */
  reduceKeyframes(tolerance: number = 0.01): void {
    if (this.keyframes.length <= 2) return;

    const reduced = this.rdpSimplify(this.keyframes, tolerance);
    this.keyframes = reduced;
  }

  /**
   * Ramer-Douglas-Peucker simplification
   */
  private rdpSimplify(points: Keyframe<T>[], epsilon: number): Keyframe<T>[] {
    if (points.length <= 2) return points;

    let maxDist = 0;
    let maxIndex = 0;

    const first = points[0];
    const last = points[points.length - 1];

    for (let i = 1; i < points.length - 1; i++) {
      const dist = this.perpendicularDistance(points[i], first, last);
      if (dist > maxDist) {
        maxDist = dist;
        maxIndex = i;
      }
    }

    if (maxDist > epsilon) {
      const left = this.rdpSimplify(points.slice(0, maxIndex + 1), epsilon);
      const right = this.rdpSimplify(points.slice(maxIndex), epsilon);
      return [...left.slice(0, -1), ...right];
    }

    return [first, last];
  }

  /**
   * Calculate perpendicular distance for RDP
   */
  private perpendicularDistance(point: Keyframe<T>, lineStart: Keyframe<T>, lineEnd: Keyframe<T>): number {
    // Simplified for numeric values
    if (typeof point.value === 'number' && typeof lineStart.value === 'number' && typeof lineEnd.value === 'number') {
      const dx = lineEnd.time - lineStart.time;
      const dy = lineEnd.value - lineStart.value;
      const norm = Math.sqrt(dx * dx + dy * dy);
      
      if (norm === 0) return Math.abs(point.value - lineStart.value);
      
      return Math.abs(dy * point.time - dx * point.value + lineEnd.time * lineStart.value - lineEnd.value * lineStart.time) / norm;
    }
    
    return 0;
  }

  /**
   * Serialize curve to JSON
   */
  toJSON(): { keyframes: Keyframe<T>[]; interpolation: InterpolationType } {
    return {
      keyframes: this.keyframes,
      interpolation: this.interpolationType,
    };
  }

  /**
   * Create curve from JSON
   */
  static fromJSON<T>(data: { keyframes: Keyframe<T>[]; interpolation: InterpolationType }): AnimationCurve<T> {
    const curve = new AnimationCurve<T>(data.interpolation);
    data.keyframes.forEach(kf => curve.addKeyframe(kf));
    return curve;
  }
}

/**
 * Animation track targeting a single bone/property
 */
export interface AnimationTrack {
  /** Target bone/node name */
  target: string;
  /** Property path (e.g., 'position', 'rotation', 'scale') */
  property: 'position' | 'rotation' | 'scale' | string;
  /** Animation curve */
  curve: AnimationCurve;
}

/**
 * Animation clip definition
 */
export class AnimationClip {
  /** Unique identifier */
  id: string;
  
  /** Clip name */
  name: string;
  
  /** Duration in seconds */
  duration: number = 0;
  
  /** Frame rate (frames per second) */
  frameRate: number = 30;
  
  /** Wrap mode */
  wrapMode: WrapMode = WrapMode.Loop;
  
  /** Animation tracks */
  tracks: AnimationTrack[] = [];
  
  /** Animation events */
  events: AnimationEvent[] = [];
  
  /** Three.js animation clip reference */
  threeClip: THREE.AnimationClip | null = null;

  constructor(id: string, name: string) {
    this.id = id;
    this.name = name;
  }

  /**
   * Add a track to the clip
   */
  addTrack(track: AnimationTrack): void {
    this.tracks.push(track);
    this.recalculateDuration();
  }

  /**
   * Remove a track
   */
  removeTrack(target: string, property: string): boolean {
    const index = this.tracks.findIndex(t => t.target === target && t.property === property);
    if (index >= 0) {
      this.tracks.splice(index, 1);
      this.recalculateDuration();
      return true;
    }
    return false;
  }

  /**
   * Get track by target and property
   */
  getTrack(target: string, property: string): AnimationTrack | undefined {
    return this.tracks.find(t => t.target === target && t.property === property);
  }

  /**
   * Add animation event
   */
  addEvent(event: AnimationEvent): void {
    this.events.push(event);
    this.events.sort((a, b) => a.time - b.time);
  }

  /**
   * Get events in time range
   */
  getEventsInRange(startTime: number, endTime: number): AnimationEvent[] {
    return this.events.filter(e => e.time >= startTime && e.time <= endTime);
  }

  /**
   * Recalculate duration from tracks
   */
  private recalculateDuration(): void {
    let maxTime = 0;
    
    for (const track of this.tracks) {
      const keyframes = track.curve.getKeyframes();
      if (keyframes.length > 0) {
        const lastKeyframe = keyframes[keyframes.length - 1];
        maxTime = Math.max(maxTime, lastKeyframe.time);
      }
    }
    
    this.duration = maxTime;
  }

  /**
   * Sample the clip at a specific time
   */
  sample(time: number): Map<string, Map<string, unknown>> {
    const result = new Map<string, Map<string, unknown>>();
    
    // Normalize time based on wrap mode
    const normalizedTime = this.normalizeTime(time);
    
    for (const track of this.tracks) {
      if (!result.has(track.target)) {
        result.set(track.target, new Map());
      }
      
      const value = track.curve.evaluate(normalizedTime);
      if (value !== null) {
        result.get(track.target)!.set(track.property, value);
      }
    }
    
    return result;
  }

  /**
   * Normalize time based on wrap mode
   */
  normalizeTime(time: number): number {
    if (this.duration <= 0) return 0;

    switch (this.wrapMode) {
      case WrapMode.Once:
        return Math.min(time, this.duration);
      
      case WrapMode.ClampForever:
        return Math.max(0, Math.min(time, this.duration));
      
      case WrapMode.Loop:
        return ((time % this.duration) + this.duration) % this.duration;
      
      case WrapMode.PingPong:
        const cycle = Math.floor(time / this.duration);
        const t = time % this.duration;
        return cycle % 2 === 0 ? t : this.duration - t;
      
      default:
        return time;
    }
  }

  /**
   * Create clip from Three.js AnimationClip
   */
  static fromThreeClip(threeClip: THREE.AnimationClip): AnimationClip {
    const clip = new AnimationClip(
      threeClip.uuid || threeClip.name,
      threeClip.name
    );
    
    clip.duration = threeClip.duration;
    clip.threeClip = threeClip;
    
    // Convert Three.js tracks
    for (const track of threeClip.tracks) {
      const targetName = track.name.split('.')[0];
      const propertyName = track.name.split('.')[1] || 'value';
      
      const curve = new AnimationCurve(
        track.getInterpolation?.() === THREE.InterpolateDiscrete 
          ? InterpolationType.Step 
          : InterpolationType.Linear
      );
      
      // Create keyframes from track
      const times = (track as THREE.KeyframeTrack).times;
      const values = (track as THREE.KeyframeTrack).values;
      
      // Determine value size
      const valueSize = track.getValueSize();
      
      for (let i = 0; i < times.length; i++) {
        const time = times[i];
        
        if (valueSize === 1) {
          curve.addKeyframe({ time, value: values[i] });
        } else if (valueSize === 3) {
          curve.addKeyframe({
            time,
            value: {
              x: values[i * 3],
              y: values[i * 3 + 1],
              z: values[i * 3 + 2],
            },
          });
        } else if (valueSize === 4) {
          curve.addKeyframe({
            time,
            value: {
              x: values[i * 4],
              y: values[i * 4 + 1],
              z: values[i * 4 + 2],
              w: values[i * 4 + 3],
            },
          });
        }
      }
      
      clip.addTrack({
        target: targetName,
        property: propertyName,
        curve,
      });
    }
    
    return clip;
  }

  /**
   * Convert to Three.js AnimationClip
   */
  toThreeClip(): THREE.AnimationClip {
    if (this.threeClip) return this.threeClip;
    
    const threeTracks: THREE.KeyframeTrack[] = [];
    
    for (const track of this.tracks) {
      const keyframes = track.curve.getKeyframes();
      if (keyframes.length === 0) continue;
      
      const times = keyframes.map(kf => kf.time);
      const firstValue = keyframes[0].value;
      
      let threeTrack: THREE.KeyframeTrack;
      
      if (typeof firstValue === 'number') {
        const values = keyframes.map(kf => kf.value as number);
        threeTrack = new THREE.NumberKeyframeTrack(
          `${track.target}.${track.property}`,
          times,
          values
        );
      } else if ('w' in (firstValue as Quaternion)) {
        // Quaternion
        const values: number[] = [];
        keyframes.forEach(kf => {
          const q = kf.value as Quaternion;
          values.push(q.x, q.y, q.z, q.w);
        });
        threeTrack = new THREE.QuaternionKeyframeTrack(
          `${track.target}.${track.property}`,
          times,
          values
        );
      } else {
        // Vector3
        const values: number[] = [];
        keyframes.forEach(kf => {
          const v = kf.value as Vector3;
          values.push(v.x, v.y, v.z);
        });
        threeTrack = new THREE.VectorKeyframeTrack(
          `${track.target}.${track.property}`,
          times,
          values
        );
      }
      
      threeTracks.push(threeTrack);
    }
    
    const clip = new THREE.AnimationClip(this.name, this.duration, threeTracks);
    this.threeClip = clip;
    return clip;
  }

  /**
   * Load animation clip from GLTF/GLB
   */
  static async loadFromGLTF(url: string): Promise<AnimationClip[]> {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const loader = new GLTFLoader();
    
    return new Promise((resolve, reject) => {
      loader.load(
        url,
        (gltf) => {
          const clips = gltf.animations.map(anim => AnimationClip.fromThreeClip(anim));
          resolve(clips);
        },
        undefined,
        (error) => reject(error)
      );
    });
  }

  /**
   * Create a simple idle animation
   */
  static createIdleAnimation(duration: number = 2): AnimationClip {
    const clip = new AnimationClip('idle', 'Idle');
    clip.duration = duration;
    clip.wrapMode = WrapMode.Loop;
    
    // Subtle breathing animation
    const breathCurve = new AnimationCurve<number>(InterpolationType.Cubic);
    breathCurve.addKeyframe({ time: 0, value: 0, outTangent: 1 });
    breathCurve.addKeyframe({ time: duration / 2, value: 0.02, inTangent: 1, outTangent: -1 });
    breathCurve.addKeyframe({ time: duration, value: 0, inTangent: -1 });
    
    clip.addTrack({
      target: 'spine',
      property: 'position.y',
      curve: breathCurve,
    });
    
    return clip;
  }

  /**
   * Create a walk cycle animation
   */
  static createWalkAnimation(duration: number = 1): AnimationClip {
    const clip = new AnimationClip('walk', 'Walk');
    clip.duration = duration;
    clip.wrapMode = WrapMode.Loop;
    
    // Leg swing
    const legCurve = new AnimationCurve<number>(InterpolationType.Linear);
    const steps = 8;
    for (let i = 0; i <= steps; i++) {
      const angle = Math.sin((i / steps) * Math.PI * 2) * 0.5;
      legCurve.addKeyframe({ time: (i / steps) * duration, value: angle });
    }
    
    clip.addTrack({
      target: 'leftLeg',
      property: 'rotation.x',
      curve: legCurve,
    });
    
    // Opposite phase for right leg
    const rightLegCurve = new AnimationCurve<number>(InterpolationType.Linear);
    for (let i = 0; i <= steps; i++) {
      const angle = Math.sin((i / steps) * Math.PI * 2 + Math.PI) * 0.5;
      rightLegCurve.addKeyframe({ time: (i / steps) * duration, value: angle });
    }
    
    clip.addTrack({
      target: 'rightLeg',
      property: 'rotation.x',
      curve: rightLegCurve,
    });
    
    // Arm swing (opposite to legs)
    clip.addTrack({
      target: 'leftArm',
      property: 'rotation.x',
      curve: rightLegCurve,
    });
    
    clip.addTrack({
      target: 'rightArm',
      property: 'rotation.x',
      curve: legCurve,
    });
    
    return clip;
  }

  /**
   * Serialize to JSON
   */
  toJSON(): AnimationClipJSON {
    return {
      id: this.id,
      name: this.name,
      duration: this.duration,
      frameRate: this.frameRate,
      wrapMode: this.wrapMode,
      tracks: this.tracks.map(t => ({
        target: t.target,
        property: t.property,
        curve: t.curve.toJSON(),
      })),
      events: this.events,
    };
  }

  /**
   * Create from JSON
   */
  static fromJSON(data: AnimationClipJSON): AnimationClip {
    const clip = new AnimationClip(data.id, data.name);
    clip.duration = data.duration;
    clip.frameRate = data.frameRate;
    clip.wrapMode = data.wrapMode as WrapMode;
    
    for (const trackData of data.tracks) {
      clip.addTrack({
        target: trackData.target,
        property: trackData.property,
        curve: AnimationCurve.fromJSON<number | Vector3 | Quaternion>(trackData.curve),
      });
    }
    
    clip.events = data.events;
    
    return clip;
  }
}

/**
 * Animation event triggered at specific frames
 */
export interface AnimationEvent {
  /** Time in seconds when event fires */
  time: number;
  /** Event name/identifier */
  name: string;
  /** Optional callback function */
  callback?: () => void;
  /** Custom data */
  data?: Record<string, unknown>;
}

/**
 * Animation clip JSON representation
 */
export interface AnimationClipJSON {
  id: string;
  name: string;
  duration: number;
  frameRate: number;
  wrapMode: string;
  tracks: Array<{
    target: string;
    property: string;
    curve: { keyframes: Keyframe<number | Vector3 | Quaternion>[]; interpolation: InterpolationType };
  }>;
  events: AnimationEvent[];
}
