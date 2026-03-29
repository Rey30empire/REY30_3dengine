// ============================================
// Advanced Camera System for 3D Engine
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// ============================================

import * as THREE from 'three';

// ============================================
// ENUMS & INTERFACES
// ============================================

/**
 * Camera projection types
 */
export enum CameraType {
  PERSPECTIVE = 'perspective',
  ORTHOGRAPHIC = 'orthographic',
  CINEMATIC = 'cinematic'
}

/**
 * Depth of Field settings
 */
export interface DOFSettings {
  enabled: boolean;
  focusDistance: number;
  focalLength: number;
  fStop: number;
  bokehScale: number;
}

/**
 * Motion Blur settings
 */
export interface MotionBlurSettings {
  enabled: boolean;
  intensity: number;
  samples: number;
  maxBlur: number;
}

/**
 * Camera configuration
 */
export interface CameraConfig {
  type: CameraType;
  fov: number;
  near: number;
  far: number;
  orthoSize?: number;
  
  // Post-process
  dof: DOFSettings;
  motionBlur: MotionBlurSettings;
  exposure: number;
  
  // Cinematic
  aspectRatio?: number;
  focalLength?: number;
  sensorSize?: THREE.Vector2;
  lensShift?: THREE.Vector2;
  
  // Advanced
  useJitteredProjection: boolean;
  useObliqueNearPlane: boolean;
}

/**
 * Default DOF settings
 */
export const defaultDOFSettings: DOFSettings = {
  enabled: false,
  focusDistance: 10,
  focalLength: 50,
  fStop: 2.8,
  bokehScale: 1.0
};

/**
 * Default Motion Blur settings
 */
export const defaultMotionBlurSettings: MotionBlurSettings = {
  enabled: false,
  intensity: 0.5,
  samples: 8,
  maxBlur: 0.05
};

/**
 * Camera shake settings
 */
export interface CameraShakeConfig {
  amplitude: THREE.Vector3;
  frequency: number;
  duration: number;
  decay: number;
  seed?: number;
}

/**
 * Camera kick settings
 */
export interface CameraKickConfig {
  recoil: THREE.Vector3;
  recoverySpeed: number;
  recoveryCurve?: (t: number) => number;
}

/**
 * FOV kick settings
 */
export interface FOVKickConfig {
  targetFOV: number;
  transitionSpeed: number;
  recoverySpeed: number;
}

/**
 * Smoothing types for camera movement
 */
export enum SmoothingType {
  NONE = 'none',
  LERP = 'lerp',
  SMOOTH_DAMP = 'smooth_damp',
  EXPONENTIAL = 'exponential'
}

/**
 * Camera blend mode
 */
export enum BlendMode {
  CUT = 'cut',
  LINEAR = 'linear',
  EASE_IN = 'ease_in',
  EASE_OUT = 'ease_out',
  EASE_IN_OUT = 'ease_in_out'
}

// ============================================
// CAMERA BEHAVIORS
// ============================================

/**
 * Orbit Camera Behavior
 */
export class OrbitCamera {
  private target: THREE.Object3D | THREE.Vector3 | null = null;
  private distance: number = 10;
  private minDistance: number = 1;
  private maxDistance: number = 100;
  private polarAngle: number = Math.PI / 4;
  private minPolarAngle: number = 0.1;
  private maxPolarAngle: number = Math.PI - 0.1;
  private azimuthAngle: number = 0;
  private damping: number = 0.1;
  private autoRotate: boolean = false;
  private autoRotateSpeed: number = 2.0;
  
  private targetPosition: THREE.Vector3 = new THREE.Vector3();
  private currentDistance: number = 10;
  private currentPolar: number = Math.PI / 4;
  private currentAzimuth: number = 0;
  
  private panSpeed: number = 1.0;
  private rotateSpeed: number = 1.0;
  private zoomSpeed: number = 1.0;

  constructor(config?: {
    target?: THREE.Object3D | THREE.Vector3;
    distance?: number;
    minDistance?: number;
    maxDistance?: number;
    minPolarAngle?: number;
    maxPolarAngle?: number;
    damping?: number;
    autoRotate?: boolean;
    autoRotateSpeed?: number;
  }) {
    if (config) {
      if (config.target) this.setTarget(config.target);
      if (config.distance !== undefined) this.distance = config.distance;
      if (config.minDistance !== undefined) this.minDistance = config.minDistance;
      if (config.maxDistance !== undefined) this.maxDistance = config.maxDistance;
      if (config.minPolarAngle !== undefined) this.minPolarAngle = config.minPolarAngle;
      if (config.maxPolarAngle !== undefined) this.maxPolarAngle = config.maxPolarAngle;
      if (config.damping !== undefined) this.damping = config.damping;
      if (config.autoRotate !== undefined) this.autoRotate = config.autoRotate;
      if (config.autoRotateSpeed !== undefined) this.autoRotateSpeed = config.autoRotateSpeed;
    }
    
    this.currentDistance = this.distance;
    this.currentPolar = this.polarAngle;
    this.currentAzimuth = this.azimuthAngle;
  }

  setTarget(target: THREE.Object3D | THREE.Vector3): void {
    this.target = target;
    if (target instanceof THREE.Vector3) {
      this.targetPosition.copy(target);
    } else {
      this.targetPosition.copy(target.position);
    }
  }

  getTarget(): THREE.Object3D | THREE.Vector3 | null {
    return this.target;
  }

  setDistance(distance: number): void {
    this.distance = THREE.MathUtils.clamp(distance, this.minDistance, this.maxDistance);
  }

  setPolarAngle(angle: number): void {
    this.polarAngle = THREE.MathUtils.clamp(angle, this.minPolarAngle, this.maxPolarAngle);
  }

  setAzimuthAngle(angle: number): void {
    this.azimuthAngle = angle;
  }

  pan(deltaX: number, deltaY: number): void {
    const offset = new THREE.Vector3();
    
    offset.setFromSphericalCoords(1, this.currentPolar, this.currentAzimuth);
    const right = new THREE.Vector3().crossVectors(offset, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    
    this.targetPosition.addScaledVector(right, -deltaX * this.panSpeed);
    this.targetPosition.addScaledVector(up, deltaY * this.panSpeed);
  }

  rotate(deltaX: number, deltaY: number): void {
    this.azimuthAngle -= deltaX * this.rotateSpeed * 0.01;
    this.polarAngle += deltaY * this.rotateSpeed * 0.01;
    this.polarAngle = THREE.MathUtils.clamp(this.polarAngle, this.minPolarAngle, this.maxPolarAngle);
  }

  zoom(delta: number): void {
    this.distance *= 1 + delta * this.zoomSpeed * 0.01;
    this.distance = THREE.MathUtils.clamp(this.distance, this.minDistance, this.maxDistance);
  }

  update(camera: THREE.Camera, deltaTime: number): void {
    // Update target position
    if (this.target && this.target instanceof THREE.Object3D) {
      this.targetPosition.copy(this.target.position);
    }

    // Auto rotate
    if (this.autoRotate) {
      this.azimuthAngle += this.autoRotateSpeed * deltaTime * (Math.PI / 180);
    }

    // Apply damping
    const t = 1 - Math.pow(this.damping, deltaTime);
    this.currentDistance = THREE.MathUtils.lerp(this.currentDistance, this.distance, t);
    this.currentPolar = THREE.MathUtils.lerp(this.currentPolar, this.polarAngle, t);
    this.currentAzimuth = THREE.MathUtils.lerp(this.currentAzimuth, this.azimuthAngle, t);

    // Calculate camera position
    const position = new THREE.Vector3();
    position.setFromSphericalCoords(this.currentDistance, this.currentPolar, this.currentAzimuth);
    position.add(this.targetPosition);

    camera.position.copy(position);
    camera.lookAt(this.targetPosition);
  }

  dispose(): void {
    this.target = null;
  }
}

/**
 * Follow Camera Behavior
 */
export class FollowCamera {
  private target: THREE.Object3D | null = null;
  private offset: THREE.Vector3 = new THREE.Vector3(0, 5, -10);
  private smoothing: SmoothingType = SmoothingType.SMOOTH_DAMP;
  private smoothTime: number = 0.3;
  private lookAhead: number = 2.0;
  private deadZone: THREE.Vector2 = new THREE.Vector2(0.1, 0.1);
  
  private velocity: THREE.Vector3 = new THREE.Vector3();
  private targetPosition: THREE.Vector3 = new THREE.Vector3();
  private currentLookAt: THREE.Vector3 = new THREE.Vector3();
  
  // Smooth damp internal state
  private positionVelocity: THREE.Vector3 = new THREE.Vector3();
  private rotationVelocity: THREE.Vector3 = new THREE.Vector3();

  constructor(config?: {
    offset?: THREE.Vector3;
    smoothing?: SmoothingType;
    smoothTime?: number;
    lookAhead?: number;
    deadZone?: THREE.Vector2;
  }) {
    if (config) {
      if (config.offset) this.offset.copy(config.offset);
      if (config.smoothing) this.smoothing = config.smoothing;
      if (config.smoothTime !== undefined) this.smoothTime = config.smoothTime;
      if (config.lookAhead !== undefined) this.lookAhead = config.lookAhead;
      if (config.deadZone) this.deadZone.copy(config.deadZone);
    }
  }

  setTarget(target: THREE.Object3D): void {
    this.target = target;
  }

  setOffset(offset: THREE.Vector3): void {
    this.offset.copy(offset);
  }

  private smoothDamp(
    current: THREE.Vector3,
    target: THREE.Vector3,
    velocity: THREE.Vector3,
    smoothTime: number,
    deltaTime: number
  ): THREE.Vector3 {
    const omega = 2 / smoothTime;
    const x = omega * deltaTime;
    const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    
    const change = new THREE.Vector3().subVectors(current, target);
    const temp = change.clone().multiplyScalar(omega).add(velocity).multiplyScalar(deltaTime);
    velocity.copy(change).addScaledVector(velocity, deltaTime).multiplyScalar(omega).multiplyScalar(exp);
    
    return target.clone().add(change.add(temp).multiplyScalar(1 - exp));
  }

  update(camera: THREE.Camera, deltaTime: number): void {
    if (!this.target) return;

    // Calculate desired position
    const desiredPosition = this.offset.clone();
    desiredPosition.applyQuaternion(this.target.quaternion);
    desiredPosition.add(this.target.position);

    // Apply dead zone
    const diff = new THREE.Vector3().subVectors(desiredPosition, this.targetPosition);
    if (Math.abs(diff.x) > this.deadZone.x) {
      this.targetPosition.x = desiredPosition.x;
    }
    if (Math.abs(diff.y) > this.deadZone.y) {
      this.targetPosition.y = desiredPosition.y;
    }

    // Apply smoothing
    let newPosition: THREE.Vector3;
    switch (this.smoothing) {
      case SmoothingType.NONE:
        newPosition = desiredPosition;
        break;
      case SmoothingType.LERP:
        newPosition = camera.position.clone().lerp(desiredPosition, 1 - Math.pow(0.001, deltaTime));
        break;
      case SmoothingType.SMOOTH_DAMP:
        newPosition = this.smoothDamp(
          camera.position,
          desiredPosition,
          this.positionVelocity,
          this.smoothTime,
          deltaTime
        );
        break;
      case SmoothingType.EXPONENTIAL:
        newPosition = camera.position.clone().lerp(desiredPosition, 1 - Math.pow(0.01, deltaTime));
        break;
      default:
        newPosition = desiredPosition;
    }

    camera.position.copy(newPosition);

    // Calculate look-at with look-ahead
    const lookAtTarget = this.target.position.clone();
    const targetVelocity =
      (this.target as THREE.Object3D & { velocity?: THREE.Vector3 }).velocity ??
      (this.target.userData.velocity instanceof THREE.Vector3 ? this.target.userData.velocity : undefined);
    if (targetVelocity) {
      lookAtTarget.addScaledVector(targetVelocity, this.lookAhead);
    }
    
    this.currentLookAt.lerp(lookAtTarget, 1 - Math.pow(0.1, deltaTime));
    camera.lookAt(this.currentLookAt);
  }

  dispose(): void {
    this.target = null;
  }
}

/**
 * First Person Camera Behavior
 */
export class FirstPersonCamera {
  private yaw: number = 0;
  private pitch: number = 0;
  private smoothing: number = 0.1;
  private sensitivity: number = 0.002;
  
  private headBobEnabled: boolean = true;
  private headBobIntensity: number = 0.05;
  private headBobSpeed: number = 10;
  private headBobTimer: number = 0;
  
  private swayEnabled: boolean = true;
  private swayIntensity: number = 0.02;
  private swaySpeed: number = 2;
  
  private minYaw: number = -Infinity;
  private maxYaw: number = Infinity;
  private minPitch: number = -Math.PI / 2 + 0.1;
  private maxPitch: number = Math.PI / 2 - 0.1;
  
  private targetYaw: number = 0;
  private targetPitch: number = 0;
  private currentYaw: number = 0;
  private currentPitch: number = 0;

  constructor(config?: {
    sensitivity?: number;
    smoothing?: number;
    headBob?: { enabled?: boolean; intensity?: number; speed?: number };
    sway?: { enabled?: boolean; intensity?: number; speed?: number };
    pitchLimits?: { min?: number; max?: number };
  }) {
    if (config) {
      if (config.sensitivity !== undefined) this.sensitivity = config.sensitivity;
      if (config.smoothing !== undefined) this.smoothing = config.smoothing;
      if (config.headBob) {
        if (config.headBob.enabled !== undefined) this.headBobEnabled = config.headBob.enabled;
        if (config.headBob.intensity !== undefined) this.headBobIntensity = config.headBob.intensity;
        if (config.headBob.speed !== undefined) this.headBobSpeed = config.headBob.speed;
      }
      if (config.sway) {
        if (config.sway.enabled !== undefined) this.swayEnabled = config.sway.enabled;
        if (config.sway.intensity !== undefined) this.swayIntensity = config.sway.intensity;
        if (config.sway.speed !== undefined) this.swaySpeed = config.sway.speed;
      }
      if (config.pitchLimits) {
        if (config.pitchLimits.min !== undefined) this.minPitch = config.pitchLimits.min;
        if (config.pitchLimits.max !== undefined) this.maxPitch = config.pitchLimits.max;
      }
    }
  }

  setRotation(yaw: number, pitch: number): void {
    this.yaw = yaw;
    this.pitch = THREE.MathUtils.clamp(pitch, this.minPitch, this.maxPitch);
    this.targetYaw = this.yaw;
    this.targetPitch = this.pitch;
    this.currentYaw = this.yaw;
    this.currentPitch = this.pitch;
  }

  rotate(deltaX: number, deltaY: number): void {
    this.targetYaw -= deltaX * this.sensitivity;
    this.targetPitch -= deltaY * this.sensitivity;
    this.targetPitch = THREE.MathUtils.clamp(this.targetPitch, this.minPitch, this.maxPitch);
  }

  setSensitivity(sensitivity: number): void {
    this.sensitivity = sensitivity;
  }

  update(camera: THREE.Camera, deltaTime: number, velocity?: THREE.Vector3): void {
    // Apply smoothing
    const t = 1 - Math.pow(this.smoothing, deltaTime);
    this.currentYaw = THREE.MathUtils.lerp(this.currentYaw, this.targetYaw, t);
    this.currentPitch = THREE.MathUtils.lerp(this.currentPitch, this.targetPitch, t);

    // Build rotation quaternion
    const euler = new THREE.Euler(this.currentPitch, this.currentYaw, 0, 'YXZ');
    camera.quaternion.setFromEuler(euler);

    // Head bob
    if (this.headBobEnabled && velocity && velocity.length() > 0.1) {
      this.headBobTimer += deltaTime * this.headBobSpeed;
      const bobOffset = new THREE.Vector3(
        Math.sin(this.headBobTimer * 0.5) * this.headBobIntensity * 0.5,
        Math.abs(Math.sin(this.headBobTimer)) * this.headBobIntensity,
        0
      );
      bobOffset.applyQuaternion(camera.quaternion);
      camera.position.add(bobOffset);
    }

    // Sway
    if (this.swayEnabled) {
      const swayOffset = new THREE.Vector3(
        Math.sin(this.headBobTimer * this.swaySpeed) * this.swayIntensity,
        Math.cos(this.headBobTimer * this.swaySpeed * 0.7) * this.swayIntensity * 0.5,
        0
      );
      swayOffset.applyQuaternion(camera.quaternion);
      camera.position.add(swayOffset);
    }
  }

  getYaw(): number {
    return this.currentYaw;
  }

  getPitch(): number {
    return this.currentPitch;
  }

  dispose(): void {}
}

/**
 * Third Person Camera Behavior
 */
export class ThirdPersonCamera {
  private target: THREE.Object3D | null = null;
  private shoulderOffset: THREE.Vector3 = new THREE.Vector3(0.5, 0.5, 0);
  private distance: number = 5;
  private minDistance: number = 1;
  private maxDistance: number = 20;
  
  private yaw: number = 0;
  private pitch: number = Math.PI / 6;
  private minPitch: number = -Math.PI / 4;
  private maxPitch: number = Math.PI / 3;
  
  private smoothing: number = 0.15;
  private collisionRadius: number = 0.3;
  private collisionLayers: number = 0xFFFFFFFF;
  
  private zoomLevels: number[] = [2, 5, 10];
  private currentZoomLevel: number = 1;
  
  // Cover system
  private coverMode: boolean = false;
  private coverOffset: THREE.Vector3 = new THREE.Vector3(1, 0, 0);
  
  private currentPosition: THREE.Vector3 = new THREE.Vector3();
  private raycaster: THREE.Raycaster = new THREE.Raycaster();

  constructor(config?: {
    shoulderOffset?: THREE.Vector3;
    distance?: number;
    minDistance?: number;
    maxDistance?: number;
    smoothing?: number;
    collisionRadius?: number;
    zoomLevels?: number[];
  }) {
    if (config) {
      if (config.shoulderOffset) this.shoulderOffset.copy(config.shoulderOffset);
      if (config.distance !== undefined) this.distance = config.distance;
      if (config.minDistance !== undefined) this.minDistance = config.minDistance;
      if (config.maxDistance !== undefined) this.maxDistance = config.maxDistance;
      if (config.smoothing !== undefined) this.smoothing = config.smoothing;
      if (config.collisionRadius !== undefined) this.collisionRadius = config.collisionRadius;
      if (config.zoomLevels) this.zoomLevels = config.zoomLevels;
    }
  }

  setTarget(target: THREE.Object3D): void {
    this.target = target;
  }

  rotate(deltaX: number, deltaY: number, sensitivity: number = 0.005): void {
    this.yaw -= deltaX * sensitivity;
    this.pitch += deltaY * sensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch, this.minPitch, this.maxPitch);
  }

  zoom(delta: number): void {
    if (delta > 0) {
      this.currentZoomLevel = Math.min(this.currentZoomLevel + 1, this.zoomLevels.length - 1);
    } else {
      this.currentZoomLevel = Math.max(this.currentZoomLevel - 1, 0);
    }
    this.distance = this.zoomLevels[this.currentZoomLevel];
  }

  setCoverMode(enabled: boolean, offset?: THREE.Vector3): void {
    this.coverMode = enabled;
    if (offset) this.coverOffset.copy(offset);
  }

  private checkCollision(from: THREE.Vector3, to: THREE.Vector3, scene: THREE.Scene): number {
    const direction = new THREE.Vector3().subVectors(to, from).normalize();
    const maxDist = from.distanceTo(to);
    
    this.raycaster.set(from, direction);
    this.raycaster.far = maxDist;
    
    const intersects = this.raycaster.intersectObjects(scene.children, true);
    
    if (intersects.length > 0) {
      return Math.max(0, intersects[0].distance - this.collisionRadius);
    }
    
    return maxDist;
  }

  update(camera: THREE.Camera, deltaTime: number, scene?: THREE.Scene): void {
    if (!this.target) return;

    // Calculate desired position
    const desiredPosition = new THREE.Vector3();
    
    // Get offset in character space
    const offset = this.coverMode ? this.coverOffset : this.shoulderOffset;
    const worldOffset = offset.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    
    // Calculate camera position
    const targetPos = this.target.position.clone().add(worldOffset);
    const spherical = new THREE.Spherical(this.distance, Math.PI / 2 - this.pitch, this.yaw);
    desiredPosition.setFromSpherical(spherical).add(targetPos);

    // Collision detection
    if (scene) {
      const collisionDist = this.checkCollision(targetPos, desiredPosition, scene);
      spherical.radius = Math.min(collisionDist, this.distance);
      desiredPosition.setFromSpherical(spherical).add(targetPos);
    }

    // Apply smoothing
    const t = 1 - Math.pow(this.smoothing, deltaTime);
    this.currentPosition.lerp(desiredPosition, t);

    camera.position.copy(this.currentPosition);
    camera.lookAt(targetPos);
  }

  dispose(): void {
    this.target = null;
  }
}

/**
 * Cinematic Camera Behavior
 */
export class CinematicCamera {
  private dollyTrack: THREE.Curve<THREE.Vector3> | null = null;
  private dollyProgress: number = 0;
  private dollySpeed: number = 0.1;
  
  private craneTarget: THREE.Vector3 | null = null;
  private craneHeight: number = 0;
  private craneArmLength: number = 10;
  
  private focusTarget: THREE.Object3D | THREE.Vector3 | null = null;
  private currentFocus: THREE.Vector3 = new THREE.Vector3();
  
  private shake: CameraShake | null = null;
  
  // Keyframes
  private keyframes: CinematicKeyframe[] = [];
  private currentKeyframe: number = 0;
  private keyframeTime: number = 0;
  
  private isPlaying: boolean = false;
  private loop: boolean = false;

  constructor() {}

  setDollyTrack(track: THREE.Curve<THREE.Vector3>): void {
    this.dollyTrack = track;
    this.dollyProgress = 0;
  }

  setCraneShot(target: THREE.Vector3, height: number, armLength: number): void {
    this.craneTarget = target.clone();
    this.craneHeight = height;
    this.craneArmLength = armLength;
  }

  setFocusTarget(target: THREE.Object3D | THREE.Vector3): void {
    this.focusTarget = target;
  }

  addKeyframe(keyframe: CinematicKeyframe): void {
    this.keyframes.push(keyframe);
    this.keyframes.sort((a, b) => a.time - b.time);
  }

  clearKeyframes(): void {
    this.keyframes = [];
    this.currentKeyframe = 0;
    this.keyframeTime = 0;
  }

  play(loop: boolean = false): void {
    this.isPlaying = true;
    this.loop = loop;
    this.keyframeTime = 0;
    this.currentKeyframe = 0;
  }

  stop(): void {
    this.isPlaying = false;
  }

  shakeCamera(config: CameraShakeConfig): void {
    this.shake = new CameraShake(config);
  }

  update(camera: THREE.Camera, deltaTime: number): void {
    if (!this.isPlaying) return;

    this.keyframeTime += deltaTime;

    // Find current keyframe pair
    let k1: CinematicKeyframe | null = null;
    let k2: CinematicKeyframe | null = null;
    
    for (let i = 0; i < this.keyframes.length - 1; i++) {
      if (this.keyframeTime >= this.keyframes[i].time && 
          this.keyframeTime < this.keyframes[i + 1].time) {
        k1 = this.keyframes[i];
        k2 = this.keyframes[i + 1];
        break;
      }
    }

    if (k1 && k2) {
      const t = (this.keyframeTime - k1.time) / (k2.time - k1.time);
      const eased = k1.easing ? k1.easing(t) : t;

      // Interpolate position
      if (k1.position && k2.position) {
        camera.position.lerpVectors(k1.position, k2.position, eased);
      }

      // Interpolate rotation
      if (k1.rotation && k2.rotation) {
        camera.quaternion.slerpQuaternions(
          new THREE.Quaternion().setFromEuler(k1.rotation),
          new THREE.Quaternion().setFromEuler(k2.rotation),
          eased
        );
      }

      // Interpolate FOV
      if (k1.fov !== undefined && k2.fov !== undefined && camera instanceof THREE.PerspectiveCamera) {
        camera.fov = THREE.MathUtils.lerp(k1.fov, k2.fov, eased);
        camera.updateProjectionMatrix();
      }

      // Focus pull
      if (k1.focus && k2.focus) {
        this.currentFocus.lerpVectors(k1.focus, k2.focus, eased);
        camera.lookAt(this.currentFocus);
      }
    }

    // Check for end
    if (this.keyframeTime >= (this.keyframes[this.keyframes.length - 1]?.time || 0)) {
      if (this.loop) {
        this.keyframeTime = 0;
      } else {
        this.isPlaying = false;
      }
    }

    // Apply shake
    if (this.shake) {
      this.shake.update(camera, deltaTime);
      if (this.shake.isFinished()) {
        this.shake = null;
      }
    }
  }

  dispose(): void {
    this.dollyTrack = null;
    this.focusTarget = null;
    this.shake = null;
  }
}

/**
 * Cinematic keyframe
 */
export interface CinematicKeyframe {
  time: number;
  position?: THREE.Vector3;
  rotation?: THREE.Euler;
  fov?: number;
  focus?: THREE.Vector3;
  easing?: (t: number) => number;
}

/**
 * Free Camera Behavior
 */
export class FreeCamera {
  private moveSpeed: number = 10;
  private turboMultiplier: number = 3;
  private sensitivity: number = 0.002;
  private smoothing: number = 0.1;
  
  private yaw: number = 0;
  private pitch: number = 0;
  private targetYaw: number = 0;
  private targetPitch: number = 0;
  
  private velocity: THREE.Vector3 = new THREE.Vector3();
  private targetVelocity: THREE.Vector3 = new THREE.Vector3();
  
  private moveForward: boolean = false;
  private moveBackward: boolean = false;
  private moveLeft: boolean = false;
  private moveRight: boolean = false;
  private moveUp: boolean = false;
  private moveDown: boolean = false;
  private turbo: boolean = false;

  constructor(config?: {
    moveSpeed?: number;
    turboMultiplier?: number;
    sensitivity?: number;
    smoothing?: number;
  }) {
    if (config) {
      if (config.moveSpeed !== undefined) this.moveSpeed = config.moveSpeed;
      if (config.turboMultiplier !== undefined) this.turboMultiplier = config.turboMultiplier;
      if (config.sensitivity !== undefined) this.sensitivity = config.sensitivity;
      if (config.smoothing !== undefined) this.smoothing = config.smoothing;
    }
  }

  setMovement(forward: boolean, backward: boolean, left: boolean, right: boolean, up: boolean, down: boolean): void {
    this.moveForward = forward;
    this.moveBackward = backward;
    this.moveLeft = left;
    this.moveRight = right;
    this.moveUp = up;
    this.moveDown = down;
  }

  setTurbo(turbo: boolean): void {
    this.turbo = turbo;
  }

  rotate(deltaX: number, deltaY: number): void {
    this.targetYaw -= deltaX * this.sensitivity;
    this.targetPitch -= deltaY * this.sensitivity;
    this.targetPitch = THREE.MathUtils.clamp(this.targetPitch, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
  }

  update(camera: THREE.Camera, deltaTime: number): void {
    // Smooth rotation
    const rt = 1 - Math.pow(this.smoothing, deltaTime);
    this.yaw = THREE.MathUtils.lerp(this.yaw, this.targetYaw, rt);
    this.pitch = THREE.MathUtils.lerp(this.pitch, this.targetPitch, rt);

    // Calculate direction
    const direction = new THREE.Vector3();
    if (this.moveForward) direction.z -= 1;
    if (this.moveBackward) direction.z += 1;
    if (this.moveLeft) direction.x -= 1;
    if (this.moveRight) direction.x += 1;
    if (this.moveUp) direction.y += 1;
    if (this.moveDown) direction.y -= 1;
    
    if (direction.length() > 0) {
      direction.normalize();
      
      // Rotate direction by camera yaw
      const rotatedDir = direction.clone();
      const cos = Math.cos(this.yaw);
      const sin = Math.sin(this.yaw);
      const newX = rotatedDir.x * cos - rotatedDir.z * sin;
      const newZ = rotatedDir.x * sin + rotatedDir.z * cos;
      rotatedDir.x = newX;
      rotatedDir.z = newZ;
      
      const speed = this.moveSpeed * (this.turbo ? this.turboMultiplier : 1);
      this.targetVelocity.copy(rotatedDir).multiplyScalar(speed);
    } else {
      this.targetVelocity.set(0, 0, 0);
    }

    // Smooth velocity
    this.velocity.lerp(this.targetVelocity, rt);

    // Apply movement
    camera.position.addScaledVector(this.velocity, deltaTime);

    // Apply rotation
    const euler = new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ');
    camera.quaternion.setFromEuler(euler);
  }

  dispose(): void {}
}

// ============================================
// CAMERA EFFECTS
// ============================================

/**
 * Camera Shake Effect
 */
export class CameraShake {
  private amplitude: THREE.Vector3;
  private frequency: number;
  private duration: number;
  private decay: number;
  private seed: number;
  
  private time: number = 0;
  private originalPosition: THREE.Vector3 = new THREE.Vector3();
  private isPlaying: boolean = false;

  constructor(config: CameraShakeConfig) {
    this.amplitude = config.amplitude.clone();
    this.frequency = config.frequency;
    this.duration = config.duration;
    this.decay = config.decay;
    this.seed = config.seed ?? Math.random() * 1000;
    this.isPlaying = true;
  }

  update(camera: THREE.Camera, deltaTime: number): void {
    if (!this.isPlaying) return;

    this.time += deltaTime;
    
    if (this.time >= this.duration) {
      this.isPlaying = false;
      return;
    }

    // Calculate decay factor
    const decayFactor = Math.exp(-this.decay * this.time);
    
    // Calculate shake offset using noise-like function
    const offset = new THREE.Vector3(
      this.noise(this.time * this.frequency, this.seed) * this.amplitude.x,
      this.noise(this.time * this.frequency, this.seed + 100) * this.amplitude.y,
      this.noise(this.time * this.frequency, this.seed + 200) * this.amplitude.z
    ).multiplyScalar(decayFactor);

    camera.position.add(offset);
  }

  private noise(t: number, seed: number): number {
    return Math.sin(t + seed) * Math.cos(t * 0.5 + seed * 0.7) * Math.sin(t * 0.25 + seed * 1.3);
  }

  isFinished(): boolean {
    return !this.isPlaying;
  }

  stop(): void {
    this.isPlaying = false;
  }
}

/**
 * Camera Kick Effect (Recoil)
 */
export class CameraKick {
  private recoil: THREE.Vector3;
  private recoverySpeed: number;
  private recoveryCurve: (t: number) => number;
  
  private currentKick: THREE.Vector3 = new THREE.Vector3();
  private recoveryTime: number = 0;
  private isRecovering: boolean = false;

  constructor(config: CameraKickConfig) {
    this.recoil = config.recoil.clone();
    this.recoverySpeed = config.recoverySpeed;
    this.recoveryCurve = config.recoveryCurve ?? ((t: number) => t * t * (3 - 2 * t)); // Smooth step
  }

  kick(): void {
    this.currentKick.add(this.recoil);
    this.recoveryTime = 0;
    this.isRecovering = true;
  }

  update(camera: THREE.Camera, deltaTime: number): void {
    if (!this.isRecovering) return;

    this.recoveryTime += deltaTime * this.recoverySpeed;
    
    if (this.recoveryTime >= 1) {
      this.currentKick.set(0, 0, 0);
      this.isRecovering = false;
      return;
    }

    const t = this.recoveryCurve(this.recoveryTime);
    const kickAmount = this.recoil.clone().multiplyScalar(1 - t);
    
    // Apply rotation kick
    const euler = new THREE.Euler(
      kickAmount.x,
      kickAmount.y,
      kickAmount.z,
      'YXZ'
    );
    camera.quaternion.multiply(new THREE.Quaternion().setFromEuler(euler));
  }

  isFinished(): boolean {
    return !this.isRecovering;
  }
}

/**
 * Field of View Kick Effect
 */
export class FOVKick {
  private targetFOV: number;
  private transitionSpeed: number;
  private recoverySpeed: number;
  
  private originalFOV: number = 60;
  private currentFOV: number = 60;
  private isKicked: boolean = false;
  private transitionTime: number = 0;

  constructor(config: FOVKickConfig) {
    this.targetFOV = config.targetFOV;
    this.transitionSpeed = config.transitionSpeed;
    this.recoverySpeed = config.recoverySpeed;
  }

  setOriginalFOV(fov: number): void {
    this.originalFOV = fov;
    if (!this.isKicked) {
      this.currentFOV = fov;
    }
  }

  kick(): void {
    this.isKicked = true;
    this.transitionTime = 0;
  }

  recover(): void {
    this.isKicked = false;
    this.transitionTime = 0;
  }

  update(camera: THREE.PerspectiveCamera, deltaTime: number): void {
    this.transitionTime += deltaTime;
    
    const targetFOV = this.isKicked ? this.targetFOV : this.originalFOV;
    const speed = this.isKicked ? this.transitionSpeed : this.recoverySpeed;
    const t = Math.min(1, this.transitionTime * speed);
    
    // Smooth interpolation
    this.currentFOV = THREE.MathUtils.lerp(this.currentFOV, targetFOV, t * 0.1);
    
    camera.fov = this.currentFOV;
    camera.updateProjectionMatrix();
  }

  isFinished(): boolean {
    return !this.isKicked && Math.abs(this.currentFOV - this.originalFOV) < 0.1;
  }
}

// ============================================
// CAMERA STACK
// ============================================

/**
 * Camera Stack Entry
 */
interface CameraStackEntry {
  camera: THREE.Camera;
  priority: number;
  blendWeight: number;
  blendMode: BlendMode;
}

/**
 * Camera Stack for blending between multiple cameras
 */
export class CameraStack {
  private cameras: CameraStackEntry[] = [];
  private activeCamera: THREE.Camera | null = null;
  private blendDuration: number = 1;
  private blendTime: number = 0;
  private isBlending: boolean = false;
  
  private tempPosition: THREE.Vector3 = new THREE.Vector3();
  private tempQuaternion: THREE.Quaternion = new THREE.Quaternion();
  private tempScale: THREE.Vector3 = new THREE.Vector3();

  addCamera(camera: THREE.Camera, priority: number = 0, blendMode: BlendMode = BlendMode.LINEAR): void {
    this.cameras.push({
      camera,
      priority,
      blendWeight: 0,
      blendMode
    });
    this.sortCameras();
  }

  removeCamera(camera: THREE.Camera): void {
    this.cameras = this.cameras.filter(entry => entry.camera !== camera);
  }

  setCameraPriority(camera: THREE.Camera, priority: number): void {
    const entry = this.cameras.find(e => e.camera === camera);
    if (entry) {
      entry.priority = priority;
      this.sortCameras();
    }
  }

  private sortCameras(): void {
    this.cameras.sort((a, b) => b.priority - a.priority);
  }

  blendTo(camera: THREE.Camera, duration: number = 1): void {
    const entry = this.cameras.find(e => e.camera === camera);
    if (entry) {
      // Set all weights to 0 except target
      this.cameras.forEach(e => {
        e.blendWeight = e.camera === camera ? 1 : 0;
      });
      
      this.activeCamera = camera;
      this.blendDuration = duration;
      this.blendTime = 0;
      this.isBlending = true;
    }
  }

  private easeFunction(mode: BlendMode, t: number): number {
    switch (mode) {
      case BlendMode.CUT:
        return t >= 1 ? 1 : 0;
      case BlendMode.LINEAR:
        return t;
      case BlendMode.EASE_IN:
        return t * t;
      case BlendMode.EASE_OUT:
        return t * (2 - t);
      case BlendMode.EASE_IN_OUT:
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      default:
        return t;
    }
  }

  update(deltaTime: number): void {
    if (this.isBlending && this.activeCamera) {
      this.blendTime += deltaTime;
      const t = Math.min(1, this.blendTime / this.blendDuration);
      
      // For now, just use the active camera directly
      if (t >= 1) {
        this.isBlending = false;
      }
    }
  }

  getActiveCamera(): THREE.Camera | null {
    return this.activeCamera || (this.cameras.length > 0 ? this.cameras[0].camera : null);
  }

  getBlendedTransform(): { position: THREE.Vector3; quaternion: THREE.Quaternion } {
    const active = this.getActiveCamera();
    if (!active) {
      return {
        position: new THREE.Vector3(),
        quaternion: new THREE.Quaternion()
      };
    }
    
    active.updateMatrixWorld();
    active.matrixWorld.decompose(this.tempPosition, this.tempQuaternion, this.tempScale);
    
    return {
      position: this.tempPosition.clone(),
      quaternion: this.tempQuaternion.clone()
    };
  }

  dispose(): void {
    this.cameras = [];
    this.activeCamera = null;
  }
}

// ============================================
// CAMERA RIG
// ============================================

/**
 * Dolly Track Point
 */
export interface DollyTrackPoint {
  position: THREE.Vector3;
  time: number;
}

/**
 * Camera Rig for cinematic shots
 */
export class CameraRig {
  private dollyTrack: DollyTrackPoint[] = [];
  private dollyCurve: THREE.CatmullRomCurve3 | null = null;
  private dollyProgress: number = 0;
  private dollyPlaying: boolean = false;
  
  // Crane
  private craneBasePosition: THREE.Vector3 = new THREE.Vector3();
  private craneArmLength: number = 5;
  private craneAngle: number = 0;
  private craneHeight: number = 3;
  
  // Steadicam simulation
  private steadicamDamping: number = 0.95;
  private steadicamVelocity: THREE.Vector3 = new THREE.Vector3();
  private steadicamTarget: THREE.Vector3 = new THREE.Vector3();
  
  private camera: THREE.Camera | null = null;

  constructor() {}

  // Dolly Track Methods
  addDollyPoint(point: THREE.Vector3, time?: number): void {
    this.dollyTrack.push({
      position: point.clone(),
      time: time ?? this.dollyTrack.length
    });
    this.updateDollyCurve();
  }

  setDollyTrack(points: THREE.Vector3[]): void {
    this.dollyTrack = points.map((p, i) => ({
      position: p.clone(),
      time: i
    }));
    this.updateDollyCurve();
  }

  private updateDollyCurve(): void {
    if (this.dollyTrack.length >= 2) {
      const points = this.dollyTrack.map(p => p.position);
      this.dollyCurve = new THREE.CatmullRomCurve3(points);
    }
  }

  startDolly(): void {
    this.dollyProgress = 0;
    this.dollyPlaying = true;
  }

  stopDolly(): void {
    this.dollyPlaying = false;
  }

  setDollyProgress(progress: number): void {
    this.dollyProgress = THREE.MathUtils.clamp(progress, 0, 1);
  }

  // Crane Methods
  setCranePosition(base: THREE.Vector3, armLength: number, height: number): void {
    this.craneBasePosition.copy(base);
    this.craneArmLength = armLength;
    this.craneHeight = height;
  }

  setCraneAngle(angle: number): void {
    this.craneAngle = angle;
  }

  // Steadicam Methods
  setSteadicamTarget(target: THREE.Vector3): void {
    this.steadicamTarget.copy(target);
  }

  setSteadicamDamping(damping: number): void {
    this.steadicamDamping = THREE.MathUtils.clamp(damping, 0, 1);
  }

  attachCamera(camera: THREE.Camera): void {
    this.camera = camera;
  }

  detachCamera(): void {
    this.camera = null;
  }

  update(deltaTime: number, mode: 'dolly' | 'crane' | 'steadicam'): void {
    if (!this.camera) return;

    switch (mode) {
      case 'dolly':
        this.updateDolly(deltaTime);
        break;
      case 'crane':
        this.updateCrane(deltaTime);
        break;
      case 'steadicam':
        this.updateSteadicam(deltaTime);
        break;
    }
  }

  private updateDolly(deltaTime: number): void {
    if (!this.dollyCurve || !this.dollyPlaying) return;

    this.dollyProgress += deltaTime * 0.1;
    
    if (this.dollyProgress >= 1) {
      this.dollyProgress = 0;
      this.dollyPlaying = false;
    }

    const position = this.dollyCurve.getPoint(this.dollyProgress);
    this.camera!.position.copy(position);
  }

  private updateCrane(_deltaTime: number): void {
    if (!this.camera) return;

    // Calculate crane arm position
    const armPosition = new THREE.Vector3(
      Math.cos(this.craneAngle) * this.craneArmLength,
      this.craneHeight,
      Math.sin(this.craneAngle) * this.craneArmLength
    );

    this.camera.position.copy(this.craneBasePosition).add(armPosition);
    this.camera.lookAt(this.craneBasePosition);
  }

  private updateSteadicam(deltaTime: number): void {
    if (!this.camera) return;

    // Apply damping to movement
    this.steadicamVelocity.lerp(
      new THREE.Vector3().subVectors(this.steadicamTarget, this.camera.position),
      1 - this.steadicamDamping
    );

    this.camera.position.add(this.steadicamVelocity.multiplyScalar(deltaTime * 2));
  }

  dispose(): void {
    this.dollyTrack = [];
    this.dollyCurve = null;
    this.camera = null;
  }
}

// ============================================
// FRUSTUM CULLING
// ============================================

/**
 * Frustum Culling System
 */
export class FrustumCulling {
  private frustum: THREE.Frustum = new THREE.Frustum();
  private projScreenMatrix: THREE.Matrix4 = new THREE.Matrix4();
  private planes: THREE.Plane[] = [];
  
  // Portal culling
  private portals: Map<string, THREE.Object3D> = new Map();

  constructor() {
    // Initialize 6 planes
    for (let i = 0; i < 6; i++) {
      this.planes.push(new THREE.Plane());
    }
  }

  updateFromCamera(camera: THREE.Camera): void {
    // Update projection-screen matrix
    this.projScreenMatrix.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );
    
    // Extract frustum planes
    this.frustum.setFromProjectionMatrix(this.projScreenMatrix);
    
    // Copy planes
    for (let i = 0; i < 6; i++) {
      this.planes[i].copy(this.frustum.planes[i]);
    }
  }

  isObjectVisible(object: THREE.Object3D): boolean {
    // Get object's bounding sphere or box
    const boundingSphere = this.getBoundingSphere(object);
    
    if (!boundingSphere) {
      return true; // Assume visible if no bounds
    }

    // Test against all 6 planes
    for (let i = 0; i < 6; i++) {
      const plane = this.planes[i];
      const distance = plane.distanceToPoint(boundingSphere.center);
      
      if (distance < -boundingSphere.radius) {
        return false; // Outside
      }
    }

    return true; // Inside or intersecting
  }

  private getBoundingSphere(object: THREE.Object3D): THREE.Sphere | null {
    // Try to get bounding sphere from geometry
    object.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry) {
        child.geometry.computeBoundingSphere();
      }
    });

    // Create a simple bounding sphere based on position
    return new THREE.Sphere(object.position, 1);
  }

  cullObjects(objects: THREE.Object3D[]): THREE.Object3D[] {
    return objects.filter(obj => this.isObjectVisible(obj));
  }

  // Portal culling
  addPortal(id: string, portal: THREE.Object3D): void {
    this.portals.set(id, portal);
  }

  removePortal(id: string): void {
    this.portals.delete(id);
  }

  isPortalVisible(portalId: string): boolean {
    const portal = this.portals.get(portalId);
    if (!portal) return false;
    return this.isObjectVisible(portal);
  }

  getVisiblePortals(): string[] {
    const visible: string[] = [];
    this.portals.forEach((portal, id) => {
      if (this.isObjectVisible(portal)) {
        visible.push(id);
      }
    });
    return visible;
  }

  // Debug
  getPlanes(): THREE.Plane[] {
    return this.planes;
  }

  getFrustum(): THREE.Frustum {
    return this.frustum;
  }
}

// ============================================
// CAMERA MANAGER
// ============================================

/**
 * Camera wrapper with metadata
 */
interface CameraEntry {
  camera: THREE.Camera;
  config: CameraConfig;
  behavior: OrbitCamera | FollowCamera | FirstPersonCamera | ThirdPersonCamera | CinematicCamera | FreeCamera | null;
  name: string;
}

/**
 * Main Camera Manager
 */
export class CameraManager {
  private cameras: Map<string, CameraEntry> = new Map();
  private activeCameraName: string | null = null;
  private frustumCulling: FrustumCulling = new FrustumCulling();
  private cameraStack: CameraStack = new CameraStack();
  
  // Effects
  private currentShake: CameraShake | null = null;
  private currentKick: CameraKick | null = null;
  private currentFOVKick: FOVKick | null = null;
  
  // Aspect ratio
  private aspectRatio: number = 16 / 9;
  private viewportSize: THREE.Vector2 = new THREE.Vector2(1920, 1080);

  constructor() {}

  createCamera(name: string, config: Partial<CameraConfig> = {}): THREE.Camera {
    const fullConfig: CameraConfig = {
      type: config.type ?? CameraType.PERSPECTIVE,
      fov: config.fov ?? 60,
      near: config.near ?? 0.1,
      far: config.far ?? 1000,
      orthoSize: config.orthoSize ?? 10,
      dof: config.dof ?? { ...defaultDOFSettings },
      motionBlur: config.motionBlur ?? { ...defaultMotionBlurSettings },
      exposure: config.exposure ?? 1.0,
      aspectRatio: config.aspectRatio,
      focalLength: config.focalLength,
      sensorSize: config.sensorSize,
      lensShift: config.lensShift,
      useJitteredProjection: config.useJitteredProjection ?? false,
      useObliqueNearPlane: config.useObliqueNearPlane ?? false
    };

    let camera: THREE.Camera;

    switch (fullConfig.type) {
      case CameraType.ORTHOGRAPHIC:
        camera = this.createOrthographicCamera(fullConfig);
        break;
      case CameraType.CINEMATIC:
        camera = this.createCinematicCamera(fullConfig);
        break;
      case CameraType.PERSPECTIVE:
      default:
        camera = this.createPerspectiveCamera(fullConfig);
        break;
    }

    camera.name = name;

    this.cameras.set(name, {
      camera,
      config: fullConfig,
      behavior: null,
      name
    });

    // Set as active if first camera
    if (this.cameras.size === 1) {
      this.activeCameraName = name;
    }

    return camera;
  }

  private createPerspectiveCamera(config: CameraConfig): THREE.PerspectiveCamera {
    const aspect = config.aspectRatio ?? this.aspectRatio;
    const camera = new THREE.PerspectiveCamera(config.fov, aspect, config.near, config.far);
    
    // Apply cinematic settings if specified
    if (config.focalLength !== undefined) {
      camera.setFocalLength(config.focalLength);
    }
    
    if (config.sensorSize !== undefined) {
      camera.filmGauge = Math.sqrt(config.sensorSize.x * config.sensorSize.x + config.sensorSize.y * config.sensorSize.y);
    }

    return camera;
  }

  private createOrthographicCamera(config: CameraConfig): THREE.OrthographicCamera {
    const size = config.orthoSize ?? 10;
    const aspect = config.aspectRatio ?? this.aspectRatio;
    
    const camera = new THREE.OrthographicCamera(
      -size * aspect,
      size * aspect,
      size,
      -size,
      config.near,
      config.far
    );

    if (config.lensShift !== undefined) {
      // Apply lens shift via view offset
      camera.setViewOffset(
        size * aspect * 2,
        size * 2,
        config.lensShift.x * size * aspect,
        config.lensShift.y * size,
        size * aspect * 2,
        size * 2
      );
    }

    return camera;
  }

  private createCinematicCamera(config: CameraConfig): THREE.PerspectiveCamera {
    const camera = this.createPerspectiveCamera(config);
    
    // Apply cinematic defaults
    if (config.focalLength === undefined) {
      camera.setFocalLength(50); // 50mm lens
    }
    
    return camera;
  }

  getCamera(name: string): THREE.Camera | undefined {
    return this.cameras.get(name)?.camera;
  }

  setActiveCamera(name: string): void {
    if (this.cameras.has(name)) {
      this.activeCameraName = name;
    }
  }

  getActiveCamera(): THREE.Camera | null {
    if (!this.activeCameraName) return null;
    return this.cameras.get(this.activeCameraName)?.camera ?? null;
  }

  getActiveCameraName(): string | null {
    return this.activeCameraName;
  }

  removeCamera(name: string): void {
    if (name === this.activeCameraName) {
      this.activeCameraName = null;
    }
    
    const entry = this.cameras.get(name);
    if (entry?.behavior) {
      entry.behavior.dispose();
    }
    
    this.cameras.delete(name);
  }

  setCameraBehavior(
    name: string,
    behavior: OrbitCamera | FollowCamera | FirstPersonCamera | ThirdPersonCamera | CinematicCamera | FreeCamera
  ): void {
    const entry = this.cameras.get(name);
    if (entry) {
      if (entry.behavior) {
        entry.behavior.dispose();
      }
      entry.behavior = behavior;
    }
  }

  setViewport(width: number, height: number): void {
    this.viewportSize.set(width, height);
    this.aspectRatio = width / height;
    
    // Update all cameras
    this.cameras.forEach((entry) => {
      const camera = entry.camera;
      
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.aspect = this.aspectRatio;
        camera.updateProjectionMatrix();
      } else if (camera instanceof THREE.OrthographicCamera) {
        const size = entry.config.orthoSize ?? 10;
        camera.left = -size * this.aspectRatio;
        camera.right = size * this.aspectRatio;
        camera.updateProjectionMatrix();
      }
    });
  }

  // Effects
  shake(config: CameraShakeConfig): void {
    this.currentShake = new CameraShake(config);
  }

  kick(config: CameraKickConfig): void {
    this.currentKick = new CameraKick(config);
  }

  fovKick(config: FOVKickConfig): void {
    const activeCamera = this.getActiveCamera();
    if (activeCamera instanceof THREE.PerspectiveCamera) {
      this.currentFOVKick = new FOVKick(config);
      this.currentFOVKick.setOriginalFOV(activeCamera.fov);
      this.currentFOVKick.kick();
    }
  }

  // Frustum culling
  getFrustumCulling(): FrustumCulling {
    return this.frustumCulling;
  }

  // Camera stack
  getCameraStack(): CameraStack {
    return this.cameraStack;
  }

  updateAll(deltaTime: number, scene?: THREE.Scene): void {
    // Update all cameras with behaviors
    this.cameras.forEach((entry) => {
      if (entry.behavior) {
        if (entry.behavior instanceof ThirdPersonCamera && scene) {
          entry.behavior.update(entry.camera, deltaTime, scene);
        } else {
          entry.behavior.update(entry.camera, deltaTime);
        }
      }
    });

    // Update active camera effects
    const activeCamera = this.getActiveCamera();
    if (activeCamera) {
      // Update shake
      if (this.currentShake) {
        this.currentShake.update(activeCamera, deltaTime);
        if (this.currentShake.isFinished()) {
          this.currentShake = null;
        }
      }

      // Update kick
      if (this.currentKick) {
        this.currentKick.update(activeCamera, deltaTime);
      }

      // Update FOV kick
      if (this.currentFOVKick && activeCamera instanceof THREE.PerspectiveCamera) {
        this.currentFOVKick.update(activeCamera, deltaTime);
      }

      // Update frustum culling
      this.frustumCulling.updateFromCamera(activeCamera);
    }

    // Update camera stack
    this.cameraStack.update(deltaTime);
  }

  // Jittered projection for TAA
  applyJitter(camera: THREE.Camera, jitterX: number, jitterY: number): void {
    if (camera instanceof THREE.PerspectiveCamera) {
      const aspect = camera.aspect;
      const jitter = new THREE.Vector2(jitterX, jitterY);
      
      camera.setViewOffset(
        aspect * 2,
        2,
        jitter.x,
        jitter.y,
        aspect * 2,
        2
      );
    }
  }

  removeJitter(camera: THREE.Camera): void {
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.clearViewOffset();
    }
  }

  dispose(): void {
    this.cameras.forEach((entry) => {
      if (entry.behavior) {
        entry.behavior.dispose();
      }
    });
    this.cameras.clear();
    this.cameraStack.dispose();
    this.currentShake = null;
    this.currentKick = null;
    this.currentFOVKick = null;
  }
}

// ============================================
// CAMERA PRESETS
// ============================================

/**
 * Pre-configured camera settings
 */
export const CameraPresets = {
  default: (): Partial<CameraConfig> => ({
    type: CameraType.PERSPECTIVE,
    fov: 60,
    near: 0.1,
    far: 1000,
    dof: { ...defaultDOFSettings },
    motionBlur: { ...defaultMotionBlurSettings },
    exposure: 1.0,
    useJitteredProjection: false,
    useObliqueNearPlane: false
  }),

  wide: (): Partial<CameraConfig> => ({
    type: CameraType.PERSPECTIVE,
    fov: 90,
    near: 0.1,
    far: 2000,
    dof: { ...defaultDOFSettings },
    motionBlur: { ...defaultMotionBlurSettings },
    exposure: 1.0,
    useJitteredProjection: false,
    useObliqueNearPlane: false
  }),

  cinematic: (): Partial<CameraConfig> => ({
    type: CameraType.CINEMATIC,
    fov: 24, // 35mm equivalent
    near: 0.1,
    far: 1000,
    focalLength: 35, // 35mm lens
    dof: {
      enabled: true,
      focusDistance: 10,
      focalLength: 35,
      fStop: 2.8,
      bokehScale: 1.5
    },
    motionBlur: {
      enabled: true,
      intensity: 0.7,
      samples: 16,
      maxBlur: 0.1
    },
    exposure: 1.0,
    aspectRatio: 2.39, // Anamorphic
    useJitteredProjection: false,
    useObliqueNearPlane: false
  }),

  isometric: (): Partial<CameraConfig> => ({
    type: CameraType.ORTHOGRAPHIC,
    fov: 0,
    near: 0.1,
    far: 1000,
    orthoSize: 10,
    dof: { ...defaultDOFSettings },
    motionBlur: { ...defaultMotionBlurSettings },
    exposure: 1.0,
    useJitteredProjection: false,
    useObliqueNearPlane: false
  }),

  security: (): Partial<CameraConfig> => ({
    type: CameraType.ORTHOGRAPHIC,
    fov: 0,
    near: 0.1,
    far: 500,
    orthoSize: 50,
    dof: { ...defaultDOFSettings },
    motionBlur: { ...defaultMotionBlurSettings },
    exposure: 1.2,
    useJitteredProjection: false,
    useObliqueNearPlane: false
  }),

  firstPerson: (): Partial<CameraConfig> => ({
    type: CameraType.PERSPECTIVE,
    fov: 75,
    near: 0.01,
    far: 500,
    dof: {
      enabled: false,
      focusDistance: 0,
      focalLength: 0,
      fStop: 0,
      bokehScale: 0
    },
    motionBlur: {
      enabled: true,
      intensity: 0.3,
      samples: 8,
      maxBlur: 0.05
    },
    exposure: 1.0,
    useJitteredProjection: false,
    useObliqueNearPlane: false
  }),

  thirdPerson: (): Partial<CameraConfig> => ({
    type: CameraType.PERSPECTIVE,
    fov: 65,
    near: 0.1,
    far: 1000,
    dof: {
      enabled: true,
      focusDistance: 5,
      focalLength: 50,
      fStop: 4.0,
      bokehScale: 0.5
    },
    motionBlur: {
      enabled: true,
      intensity: 0.4,
      samples: 8,
      maxBlur: 0.05
    },
    exposure: 1.0,
    useJitteredProjection: false,
    useObliqueNearPlane: false
  }),

  spectator: (): Partial<CameraConfig> => ({
    type: CameraType.PERSPECTIVE,
    fov: 90,
    near: 0.1,
    far: 5000,
    dof: { ...defaultDOFSettings },
    motionBlur: { ...defaultMotionBlurSettings },
    exposure: 1.0,
    useJitteredProjection: false,
    useObliqueNearPlane: false
  })
};
