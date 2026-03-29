// ============================================
// Avatar System
// REY30 3D Engine - Animation Module
// ============================================

import * as THREE from 'three';
import type { Vector3, Quaternion } from '@/types/engine';
import { AnimationClip, AnimationCurve } from './AnimationClip';

/**
 * Humanoid body part for bone mapping
 */
export enum HumanoidBodyPart {
  // Root
  Hips = 'hips',
  
  // Spine
  Spine = 'spine',
  Chest = 'chest',
  UpperChest = 'upperChest',
  Neck = 'neck',
  Head = 'head',
  
  // Left arm
  LeftShoulder = 'leftShoulder',
  LeftUpperArm = 'leftUpperArm',
  LeftLowerArm = 'leftLowerArm',
  LeftHand = 'leftHand',
  
  // Right arm
  RightShoulder = 'rightShoulder',
  RightUpperArm = 'rightUpperArm',
  RightLowerArm = 'rightLowerArm',
  RightHand = 'rightHand',
  
  // Left leg
  LeftUpperLeg = 'leftUpperLeg',
  LeftLowerLeg = 'leftLowerLeg',
  LeftFoot = 'leftFoot',
  LeftToes = 'leftToes',
  
  // Right leg
  RightUpperLeg = 'rightUpperLeg',
  RightLowerLeg = 'rightLowerLeg',
  RightFoot = 'rightFoot',
  RightToes = 'rightToes',
  
  // Fingers (left)
  LeftThumbProximal = 'leftThumbProximal',
  LeftThumbIntermediate = 'leftThumbIntermediate',
  LeftThumbDistal = 'leftThumbDistal',
  LeftIndexProximal = 'leftIndexProximal',
  LeftIndexIntermediate = 'leftIndexIntermediate',
  LeftIndexDistal = 'leftIndexDistal',
  LeftMiddleProximal = 'leftMiddleProximal',
  LeftMiddleIntermediate = 'leftMiddleIntermediate',
  LeftMiddleDistal = 'leftMiddleDistal',
  LeftRingProximal = 'leftRingProximal',
  LeftRingIntermediate = 'leftRingIntermediate',
  LeftRingDistal = 'leftRingDistal',
  LeftLittleProximal = 'leftLittleProximal',
  LeftLittleIntermediate = 'leftLittleIntermediate',
  LeftLittleDistal = 'leftLittleDistal',
  
  // Fingers (right)
  RightThumbProximal = 'rightThumbProximal',
  RightThumbIntermediate = 'rightThumbIntermediate',
  RightThumbDistal = 'rightThumbDistal',
  RightIndexProximal = 'rightIndexProximal',
  RightIndexIntermediate = 'rightIndexIntermediate',
  RightIndexDistal = 'rightIndexDistal',
  RightMiddleProximal = 'rightMiddleProximal',
  RightMiddleIntermediate = 'rightMiddleIntermediate',
  RightMiddleDistal = 'rightMiddleDistal',
  RightRingProximal = 'rightRingProximal',
  RightRingIntermediate = 'rightRingIntermediate',
  RightRingDistal = 'rightRingDistal',
  RightLittleProximal = 'rightLittleProximal',
  RightLittleIntermediate = 'rightLittleIntermediate',
  RightLittleDistal = 'rightLittleDistal',
  
  // Eyes
  LeftEye = 'leftEye',
  RightEye = 'rightEye',
  Jaw = 'jaw',
}

/**
 * Body part category for avatar masks
 */
export enum BodyPartCategory {
  FullBody = 'fullBody',
  UpperBody = 'upperBody',
  LowerBody = 'lowerBody',
  LeftArm = 'leftArm',
  RightArm = 'rightArm',
  LeftLeg = 'leftLeg',
  RightLeg = 'rightLeg',
  Head = 'head',
  Hands = 'hands',
  Fingers = 'fingers',
}

/**
 * Bone mapping entry
 */
export interface BoneMapping {
  /** Humanoid body part */
  bodyPart: HumanoidBodyPart;
  /** Bone name in the skeleton */
  boneName: string;
  /** Bone reference */
  bone: THREE.Bone | null;
  /** Local offset from bind pose */
  offset: Vector3;
}

/**
 * Avatar definition for humanoid characters
 */
export class Avatar {
  /** Unique identifier */
  id: string;
  
  /** Avatar name */
  name: string;
  
  /** Skeleton reference */
  skeleton: THREE.Skeleton | null = null;
  
  /** Bone mappings */
  boneMappings: Map<HumanoidBodyPart, BoneMapping> = new Map();
  
  /** Humanoid measurements */
  measurements: AvatarMeasurements;
  
  /** Bind pose */
  bindPose: Map<string, { position: Vector3; rotation: Quaternion; scale: Vector3 }>;
  
  /** T-Pose reference */
  tPose: Map<string, { position: Vector3; rotation: Quaternion; scale: Vector3 }>;

  constructor(id: string, name: string) {
    this.id = id;
    this.name = name;
    this.measurements = new AvatarMeasurements();
    this.bindPose = new Map();
    this.tPose = new Map();
  }

  /**
   * Set skeleton and create bone mappings
   */
  setSkeleton(skeleton: THREE.Skeleton): void {
    this.skeleton = skeleton;
    this.captureBindPose();
  }

  /**
   * Map a bone to a humanoid body part
   */
  mapBone(bodyPart: HumanoidBodyPart, boneName: string): boolean {
    if (!this.skeleton) return false;
    
    const bone = this.skeleton.getBoneByName(boneName);
    if (!bone) return false;
    
    this.boneMappings.set(bodyPart, {
      bodyPart,
      boneName,
      bone,
      offset: { x: 0, y: 0, z: 0 },
    });
    
    return true;
  }

  /**
   * Get bone by body part
   */
  getBone(bodyPart: HumanoidBodyPart): THREE.Bone | null {
    const mapping = this.boneMappings.get(bodyPart);
    return mapping?.bone || null;
  }

  /**
   * Get bone mapping by body part
   */
  getBoneMapping(bodyPart: HumanoidBodyPart): BoneMapping | undefined {
    return this.boneMappings.get(bodyPart);
  }

  /**
   * Capture current skeleton state as bind pose
   */
  captureBindPose(): void {
    if (!this.skeleton) return;
    
    this.bindPose.clear();
    
    for (const bone of this.skeleton.bones) {
      this.bindPose.set(bone.name, {
        position: { x: bone.position.x, y: bone.position.y, z: bone.position.z },
        rotation: { x: bone.quaternion.x, y: bone.quaternion.y, z: bone.quaternion.z, w: bone.quaternion.w },
        scale: { x: bone.scale.x, y: bone.scale.y, z: bone.scale.z },
      });
    }
  }

  /**
   * Reset skeleton to bind pose
   */
  resetToBindPose(): void {
    if (!this.skeleton) return;
    
    for (const bone of this.skeleton.bones) {
      const pose = this.bindPose.get(bone.name);
      if (pose) {
        bone.position.set(pose.position.x, pose.position.y, pose.position.z);
        bone.quaternion.set(pose.rotation.x, pose.rotation.y, pose.rotation.z, pose.rotation.w);
        bone.scale.set(pose.scale.x, pose.scale.y, pose.scale.z);
      }
    }
  }

  /**
   * Capture T-pose
   */
  captureTPose(): void {
    if (!this.skeleton) return;
    
    this.tPose.clear();
    
    for (const bone of this.skeleton.bones) {
      this.tPose.set(bone.name, {
        position: { x: bone.position.x, y: bone.position.y, z: bone.position.z },
        rotation: { x: bone.quaternion.x, y: bone.quaternion.y, z: bone.quaternion.z, w: bone.quaternion.w },
        scale: { x: bone.scale.x, y: bone.scale.y, z: bone.scale.z },
      });
    }
  }

  /**
   * Reset to T-pose
   */
  resetToTPose(): void {
    if (!this.skeleton) return;
    
    for (const bone of this.skeleton.bones) {
      const pose = this.tPose.get(bone.name);
      if (pose) {
        bone.position.set(pose.position.x, pose.position.y, pose.position.z);
        bone.quaternion.set(pose.rotation.x, pose.rotation.y, pose.rotation.z, pose.rotation.w);
        bone.scale.set(pose.scale.x, pose.scale.y, pose.scale.z);
      }
    }
  }

  /**
   * Calculate avatar measurements
   */
  calculateMeasurements(): void {
    this.measurements.calculate(this);
  }

  /**
   * Create avatar mask for animation layers
   */
  createMask(categories: BodyPartCategory[]): AvatarMask {
    return new AvatarMask(this, categories);
  }

  /**
   * Check if avatar is valid humanoid
   */
  isValid(): { valid: boolean; missingParts: HumanoidBodyPart[] } {
    const requiredParts = [
      HumanoidBodyPart.Hips,
      HumanoidBodyPart.Spine,
      HumanoidBodyPart.Head,
      HumanoidBodyPart.LeftUpperArm,
      HumanoidBodyPart.LeftLowerArm,
      HumanoidBodyPart.LeftHand,
      HumanoidBodyPart.RightUpperArm,
      HumanoidBodyPart.RightLowerArm,
      HumanoidBodyPart.RightHand,
      HumanoidBodyPart.LeftUpperLeg,
      HumanoidBodyPart.LeftLowerLeg,
      HumanoidBodyPart.LeftFoot,
      HumanoidBodyPart.RightUpperLeg,
      HumanoidBodyPart.RightLowerLeg,
      HumanoidBodyPart.RightFoot,
    ];
    
    const missingParts: HumanoidBodyPart[] = [];
    
    for (const part of requiredParts) {
      if (!this.boneMappings.has(part)) {
        missingParts.push(part);
      }
    }
    
    return {
      valid: missingParts.length === 0,
      missingParts,
    };
  }

  /**
   * Auto-detect bone mappings from skeleton
   */
  autoDetectBones(): number {
    if (!this.skeleton) return 0;
    
    const boneNames = this.skeleton.bones.map(b => b.name.toLowerCase());
    let detectedCount = 0;
    
    // Common naming patterns
    const patterns: { part: HumanoidBodyPart; patterns: string[] }[] = [
      { part: HumanoidBodyPart.Hips, patterns: ['hip', 'pelvis', 'root'] },
      { part: HumanoidBodyPart.Spine, patterns: ['spine', 'spine1'] },
      { part: HumanoidBodyPart.Chest, patterns: ['chest', 'spine2', 'upperchest'] },
      { part: HumanoidBodyPart.Neck, patterns: ['neck'] },
      { part: HumanoidBodyPart.Head, patterns: ['head'] },
      
      { part: HumanoidBodyPart.LeftShoulder, patterns: ['leftshoulder', 'lshoulder'] },
      { part: HumanoidBodyPart.LeftUpperArm, patterns: ['leftarm', 'larm', 'leftupperarm'] },
      { part: HumanoidBodyPart.LeftLowerArm, patterns: ['leftforearm', 'lforearm', 'leftlowerarm'] },
      { part: HumanoidBodyPart.LeftHand, patterns: ['lefthand', 'lhand'] },
      
      { part: HumanoidBodyPart.RightShoulder, patterns: ['rightshoulder', 'rshoulder'] },
      { part: HumanoidBodyPart.RightUpperArm, patterns: ['rightarm', 'rarm', 'rightupperarm'] },
      { part: HumanoidBodyPart.RightLowerArm, patterns: ['rightforearm', 'rforearm', 'rightlowerarm'] },
      { part: HumanoidBodyPart.RightHand, patterns: ['righthand', 'rhand'] },
      
      { part: HumanoidBodyPart.LeftUpperLeg, patterns: ['leftupleg', 'lupleg', 'leftthigh'] },
      { part: HumanoidBodyPart.LeftLowerLeg, patterns: ['leftleg', 'lleg', 'leftcalf'] },
      { part: HumanoidBodyPart.LeftFoot, patterns: ['leftfoot', 'lfoot'] },
      
      { part: HumanoidBodyPart.RightUpperLeg, patterns: ['rightupleg', 'rupleg', 'rightthigh'] },
      { part: HumanoidBodyPart.RightLowerLeg, patterns: ['rightleg', 'rleg', 'rightcalf'] },
      { part: HumanoidBodyPart.RightFoot, patterns: ['rightfoot', 'rfoot'] },
    ];
    
    for (const { part, patterns: partPatterns } of patterns) {
      for (const pattern of partPatterns) {
        const index = boneNames.findIndex(name => name.includes(pattern));
        if (index >= 0) {
          const bone = this.skeleton!.bones[index];
          this.mapBone(part, bone.name);
          detectedCount++;
          break;
        }
      }
    }
    
    return detectedCount;
  }

  /**
   * Clone avatar definition
   */
  clone(): Avatar {
    const cloned = new Avatar(this.id + '_clone', this.name + '_clone');
    
    cloned.boneMappings = new Map(this.boneMappings);
    cloned.bindPose = new Map(this.bindPose);
    cloned.tPose = new Map(this.tPose);
    cloned.measurements = Object.assign(new AvatarMeasurements(), this.measurements);
    
    return cloned;
  }

  /**
   * Serialize to JSON
   */
  toJSON(): AvatarJSON {
    return {
      id: this.id,
      name: this.name,
      boneMappings: Array.from(this.boneMappings.entries()).map(([part, mapping]) => ({
        bodyPart: part,
        boneName: mapping.boneName,
        offset: mapping.offset,
      })),
      measurements: {
        height: this.measurements.height,
        armSpan: this.measurements.armSpan,
        legLength: this.measurements.legLength,
        torsoLength: this.measurements.torsoLength,
        shoulderWidth: this.measurements.shoulderWidth,
        hipWidth: this.measurements.hipWidth,
      },
    };
  }

  /**
   * Create from JSON
   */
  static fromJSON(data: AvatarJSON, skeleton?: THREE.Skeleton): Avatar {
    const avatar = new Avatar(data.id, data.name);
    
    if (skeleton) {
      avatar.setSkeleton(skeleton);
    }
    
    for (const mapping of data.boneMappings) {
      avatar.boneMappings.set(mapping.bodyPart as HumanoidBodyPart, {
        bodyPart: mapping.bodyPart as HumanoidBodyPart,
        boneName: mapping.boneName,
        bone: skeleton?.getBoneByName(mapping.boneName) || null,
        offset: mapping.offset,
      });
    }
    
    avatar.measurements = Object.assign(new AvatarMeasurements(), {
      height: data.measurements.height,
      armSpan: data.measurements.armSpan,
      legLength: data.measurements.legLength,
      torsoLength: data.measurements.torsoLength,
      shoulderWidth: data.measurements.shoulderWidth,
      hipWidth: data.measurements.hipWidth,
    });
    
    return avatar;
  }
}

/**
 * Avatar measurements for retargeting
 */
export class AvatarMeasurements {
  /** Total height */
  height: number = 0;
  
  /** Arm span (fingertip to fingertip) */
  armSpan: number = 0;
  
  /** Leg length (hip to foot) */
  legLength: number = 0;
  
  /** Torso length (hip to neck) */
  torsoLength: number = 0;
  
  /** Shoulder width */
  shoulderWidth: number = 0;
  
  /** Hip width */
  hipWidth: number = 0;

  /**
   * Calculate measurements from avatar
   */
  calculate(avatar: Avatar): void {
    if (!avatar.skeleton) return;
    
    // Height: hip to head
    const hips = avatar.getBone(HumanoidBodyPart.Hips);
    const head = avatar.getBone(HumanoidBodyPart.Head);
    const leftFoot = avatar.getBone(HumanoidBodyPart.LeftFoot);
    
    if (hips && head) {
      const hipsPos = new THREE.Vector3();
      const headPos = new THREE.Vector3();
      hips.getWorldPosition(hipsPos);
      head.getWorldPosition(headPos);
      
      // Add head size estimate
      this.height = headPos.y - hipsPos.y + 0.2;
      
      if (leftFoot) {
        const footPos = new THREE.Vector3();
        leftFoot.getWorldPosition(footPos);
        this.height += hipsPos.y - footPos.y;
      }
    }
    
    // Leg length
    if (hips && leftFoot) {
      const hipsPos = new THREE.Vector3();
      const footPos = new THREE.Vector3();
      hips.getWorldPosition(hipsPos);
      leftFoot.getWorldPosition(footPos);
      this.legLength = hipsPos.y - footPos.y;
    }
    
    // Torso length
    const neck = avatar.getBone(HumanoidBodyPart.Neck);
    if (hips && neck) {
      const hipsPos = new THREE.Vector3();
      const neckPos = new THREE.Vector3();
      hips.getWorldPosition(hipsPos);
      neck.getWorldPosition(neckPos);
      this.torsoLength = neckPos.y - hipsPos.y;
    }
    
    // Shoulder width
    const leftShoulder = avatar.getBone(HumanoidBodyPart.LeftShoulder);
    const rightShoulder = avatar.getBone(HumanoidBodyPart.RightShoulder);
    if (leftShoulder && rightShoulder) {
      const leftPos = new THREE.Vector3();
      const rightPos = new THREE.Vector3();
      leftShoulder.getWorldPosition(leftPos);
      rightShoulder.getWorldPosition(rightPos);
      this.shoulderWidth = leftPos.distanceTo(rightPos);
    }
    
    // Arm span
    const leftHand = avatar.getBone(HumanoidBodyPart.LeftHand);
    const rightHand = avatar.getBone(HumanoidBodyPart.RightHand);
    if (leftHand && rightHand) {
      const leftPos = new THREE.Vector3();
      const rightPos = new THREE.Vector3();
      leftHand.getWorldPosition(leftPos);
      rightHand.getWorldPosition(rightPos);
      this.armSpan = leftPos.distanceTo(rightPos);
    }
  }
}

/**
 * Avatar mask for animation layers
 */
export class AvatarMask {
  /** Avatar reference */
  avatar: Avatar;
  
  /** Enabled body part categories */
  enabledCategories: Set<BodyPartCategory> = new Set();
  
  /** Enabled body parts */
  enabledParts: Set<HumanoidBodyPart> = new Set();
  
  /** Bone weights (0-1) */
  boneWeights: Map<string, number> = new Map();

  constructor(avatar: Avatar, categories: BodyPartCategory[] = []) {
    this.avatar = avatar;
    categories.forEach(c => this.enableCategory(c));
  }

  /**
   * Enable a body part category
   */
  enableCategory(category: BodyPartCategory): void {
    this.enabledCategories.add(category);
    
    const parts = this.getPartsForCategory(category);
    parts.forEach(p => this.enabledParts.add(p));
  }

  /**
   * Disable a body part category
   */
  disableCategory(category: BodyPartCategory): void {
    this.enabledCategories.delete(category);
    
    const parts = this.getPartsForCategory(category);
    parts.forEach(p => this.enabledParts.delete(p));
  }

  /**
   * Get body parts for a category
   */
  private getPartsForCategory(category: BodyPartCategory): HumanoidBodyPart[] {
    switch (category) {
      case BodyPartCategory.FullBody:
        return Object.values(HumanoidBodyPart);
      
      case BodyPartCategory.UpperBody:
        return [
          HumanoidBodyPart.Spine,
          HumanoidBodyPart.Chest,
          HumanoidBodyPart.UpperChest,
          HumanoidBodyPart.Neck,
          HumanoidBodyPart.Head,
          HumanoidBodyPart.LeftShoulder,
          HumanoidBodyPart.LeftUpperArm,
          HumanoidBodyPart.LeftLowerArm,
          HumanoidBodyPart.LeftHand,
          HumanoidBodyPart.RightShoulder,
          HumanoidBodyPart.RightUpperArm,
          HumanoidBodyPart.RightLowerArm,
          HumanoidBodyPart.RightHand,
        ];
      
      case BodyPartCategory.LowerBody:
        return [
          HumanoidBodyPart.Hips,
          HumanoidBodyPart.LeftUpperLeg,
          HumanoidBodyPart.LeftLowerLeg,
          HumanoidBodyPart.LeftFoot,
          HumanoidBodyPart.RightUpperLeg,
          HumanoidBodyPart.RightLowerLeg,
          HumanoidBodyPart.RightFoot,
        ];
      
      case BodyPartCategory.LeftArm:
        return [
          HumanoidBodyPart.LeftShoulder,
          HumanoidBodyPart.LeftUpperArm,
          HumanoidBodyPart.LeftLowerArm,
          HumanoidBodyPart.LeftHand,
        ];
      
      case BodyPartCategory.RightArm:
        return [
          HumanoidBodyPart.RightShoulder,
          HumanoidBodyPart.RightUpperArm,
          HumanoidBodyPart.RightLowerArm,
          HumanoidBodyPart.RightHand,
        ];
      
      case BodyPartCategory.LeftLeg:
        return [
          HumanoidBodyPart.LeftUpperLeg,
          HumanoidBodyPart.LeftLowerLeg,
          HumanoidBodyPart.LeftFoot,
        ];
      
      case BodyPartCategory.RightLeg:
        return [
          HumanoidBodyPart.RightUpperLeg,
          HumanoidBodyPart.RightLowerLeg,
          HumanoidBodyPart.RightFoot,
        ];
      
      case BodyPartCategory.Head:
        return [
          HumanoidBodyPart.Neck,
          HumanoidBodyPart.Head,
          HumanoidBodyPart.LeftEye,
          HumanoidBodyPart.RightEye,
          HumanoidBodyPart.Jaw,
        ];
      
      case BodyPartCategory.Hands:
        return [
          HumanoidBodyPart.LeftHand,
          HumanoidBodyPart.RightHand,
        ];
      
      case BodyPartCategory.Fingers:
        return [
          HumanoidBodyPart.LeftThumbProximal,
          HumanoidBodyPart.LeftThumbIntermediate,
          HumanoidBodyPart.LeftThumbDistal,
          HumanoidBodyPart.LeftIndexProximal,
          HumanoidBodyPart.LeftIndexIntermediate,
          HumanoidBodyPart.LeftIndexDistal,
          HumanoidBodyPart.LeftMiddleProximal,
          HumanoidBodyPart.LeftMiddleIntermediate,
          HumanoidBodyPart.LeftMiddleDistal,
          HumanoidBodyPart.LeftRingProximal,
          HumanoidBodyPart.LeftRingIntermediate,
          HumanoidBodyPart.LeftRingDistal,
          HumanoidBodyPart.LeftLittleProximal,
          HumanoidBodyPart.LeftLittleIntermediate,
          HumanoidBodyPart.LeftLittleDistal,
          HumanoidBodyPart.RightThumbProximal,
          HumanoidBodyPart.RightThumbIntermediate,
          HumanoidBodyPart.RightThumbDistal,
          HumanoidBodyPart.RightIndexProximal,
          HumanoidBodyPart.RightIndexIntermediate,
          HumanoidBodyPart.RightIndexDistal,
          HumanoidBodyPart.RightMiddleProximal,
          HumanoidBodyPart.RightMiddleIntermediate,
          HumanoidBodyPart.RightMiddleDistal,
          HumanoidBodyPart.RightRingProximal,
          HumanoidBodyPart.RightRingIntermediate,
          HumanoidBodyPart.RightRingDistal,
          HumanoidBodyPart.RightLittleProximal,
          HumanoidBodyPart.RightLittleIntermediate,
          HumanoidBodyPart.RightLittleDistal,
        ];
      
      default:
        return [];
    }
  }

  /**
   * Check if a body part is enabled
   */
  isPartEnabled(part: HumanoidBodyPart): boolean {
    return this.enabledParts.has(part);
  }

  /**
   * Set weight for a specific bone
   */
  setBoneWeight(boneName: string, weight: number): void {
    this.boneWeights.set(boneName, Math.max(0, Math.min(1, weight)));
  }

  /**
   * Get weight for a bone (default 1 if enabled, 0 if not)
   */
  getBoneWeight(boneName: string): number {
    if (this.boneWeights.has(boneName)) {
      return this.boneWeights.get(boneName)!;
    }
    
    // Check if bone is in enabled parts
    for (const [part, mapping] of this.avatar.boneMappings) {
      if (mapping.boneName === boneName && this.enabledParts.has(part)) {
        return 1;
      }
    }
    
    return 0;
  }
}

/**
 * Animation retargeting between avatars
 */
export class AnimationRetargeter {
  /** Source avatar */
  sourceAvatar: Avatar;
  
  /** Target avatar */
  targetAvatar: Avatar;
  
  /** Retargeting mode */
  mode: RetargetingMode = RetargetingMode.MuscleSpace;

  constructor(sourceAvatar: Avatar, targetAvatar: Avatar) {
    this.sourceAvatar = sourceAvatar;
    this.targetAvatar = targetAvatar;
  }

  /**
   * Retarget an animation clip
   */
  retargetClip(sourceClip: AnimationClip): AnimationClip {
    const targetClip = new AnimationClip(sourceClip.id + '_retargeted', sourceClip.name);
    targetClip.duration = sourceClip.duration;
    targetClip.frameRate = sourceClip.frameRate;
    targetClip.wrapMode = sourceClip.wrapMode;

    // Scale factor based on height
    const heightScale = this.targetAvatar.measurements.height / this.sourceAvatar.measurements.height;
    
    for (const track of sourceClip.tracks) {
      // Find corresponding body part
      const sourcePart = this.findBodyPartForBone(track.target, this.sourceAvatar);
      
      if (sourcePart) {
        const targetMapping = this.targetAvatar.getBoneMapping(sourcePart);
        
        if (targetMapping) {
          // Create retargeted track
          const retargetedTrack = this.retargetTrack(track, sourcePart, heightScale);
          if (retargetedTrack) {
            targetClip.addTrack(retargetedTrack);
          }
        }
      }
    }

    return targetClip;
  }

  /**
   * Retarget a single track
   */
  private retargetTrack(
    track: { target: string; property: string; curve: AnimationClip['tracks'][0]['curve'] },
    bodyPart: HumanoidBodyPart,
    scale: number
  ): { target: string; property: string; curve: AnimationClip['tracks'][0]['curve'] } | null {
    const targetMapping = this.targetAvatar.getBoneMapping(bodyPart);
    if (!targetMapping || !targetMapping.bone) return null;

    // Clone the curve
    const newCurve = new (track.curve.constructor as typeof AnimationCurve)();
    
    for (const kf of track.curve.getKeyframes()) {
      let value = kf.value;
      
      // Apply scaling for position tracks
      if (track.property.includes('position') && typeof value === 'object' && 'x' in value) {
        const v = value as Vector3;
        value = {
          x: v.x * scale,
          y: v.y * scale,
          z: v.z * scale,
        };
      }
      
      newCurve.addKeyframe({ ...kf, value });
    }

    return {
      target: targetMapping.boneName,
      property: track.property,
      curve: newCurve,
    };
  }

  /**
   * Find body part for bone name
   */
  private findBodyPartForBone(boneName: string, avatar: Avatar): HumanoidBodyPart | null {
    for (const [part, mapping] of avatar.boneMappings) {
      if (mapping.boneName === boneName) {
        return part;
      }
    }
    return null;
  }
}

/**
 * Retargeting mode
 */
export enum RetargetingMode {
  /** Direct bone mapping */
  BoneMapping = 'boneMapping',
  /** Retarget in muscle space */
  MuscleSpace = 'muscleSpace',
  /** Relative retargeting */
  Relative = 'relative',
}

/**
 * Avatar JSON representation
 */
export interface AvatarJSON {
  id: string;
  name: string;
  boneMappings: Array<{
    bodyPart: string;
    boneName: string;
    offset: Vector3;
  }>;
  measurements: {
    height: number;
    armSpan: number;
    legLength: number;
    torsoLength: number;
    shoulderWidth: number;
    hipWidth: number;
  };
}
