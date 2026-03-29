// ============================================
// Inverse Kinematics System
// REY30 3D Engine - Animation Module
// ============================================

import * as THREE from 'three';
import type { Vector3, Quaternion } from '@/types/engine';

/**
 * IK target information
 */
export interface IKTarget {
  /** Target position in world space */
  position: Vector3;
  /** Target rotation (optional) */
  rotation?: Quaternion;
  /** Target weight (0-1) */
  weight: number;
  /** Whether target is active */
  active: boolean;
}

/**
 * IK hint for joint bending direction
 */
export interface IKHint {
  /** Hint position in world space */
  position: Vector3;
  /** Hint weight (0-1) */
  weight: number;
}

/**
 * IK chain definition
 */
export interface IKChain {
  /** Chain name */
  name: string;
  /** Bone names from root to tip */
  bones: string[];
  /** Target for end effector */
  target: IKTarget | null;
  /** Hint for bending direction */
  hint: IKHint | null;
  /** Chain weight */
  weight: number;
}

/**
 * Two-bone IK solver for arms and legs
 */
export class TwoBoneIKSolver {
  /** Root bone (upper arm/thigh) */
  rootBone: THREE.Bone | null = null;
  
  /** Mid bone (forearm/calf) */
  midBone: THREE.Bone | null = null;
  
  /** End bone (hand/foot) */
  endBone: THREE.Bone | null = null;
  
  /** Target position */
  target: THREE.Vector3 = new THREE.Vector3();
  
  /** Hint position for bending */
  hint: THREE.Vector3 | null = null;
  
  /** IK weight */
  weight: number = 1;
  
  /** Soften factor for smooth transitions */
  soften: number = 0.1;
  
  /** Maximum stretch factor */
  maxStretch: number = 1.2;

  constructor() {}

  /**
   * Set bones for the IK chain
   */
  setBones(root: THREE.Bone, mid: THREE.Bone, end: THREE.Bone): void {
    this.rootBone = root;
    this.midBone = mid;
    this.endBone = end;
  }

  /**
   * Solve IK
   */
  solve(): void {
    if (!this.rootBone || !this.midBone || !this.endBone) return;
    if (this.weight <= 0) return;

    // Get bone positions in world space
    const rootPos = new THREE.Vector3();
    const midPos = new THREE.Vector3();
    const endPos = new THREE.Vector3();
    
    this.rootBone.getWorldPosition(rootPos);
    this.midBone.getWorldPosition(midPos);
    this.endBone.getWorldPosition(endPos);

    // Calculate bone lengths
    const upperLength = rootPos.distanceTo(midPos);
    const lowerLength = midPos.distanceTo(endPos);
    const totalLength = upperLength + lowerLength;

    // Distance to target
    const targetDistance = rootPos.distanceTo(this.target);

    // Calculate stretch factor
    let stretchFactor = 1;
    if (targetDistance > totalLength) {
      stretchFactor = Math.min(targetDistance / totalLength, this.maxStretch);
    }

    // Blend target position with current end position
    const blendedTarget = new THREE.Vector3().lerpVectors(
      endPos,
      this.target,
      this.weight
    );

    // Calculate the desired mid bone position using two-bone IK
    const dirToTarget = new THREE.Vector3()
      .subVectors(blendedTarget, rootPos)
      .normalize();

    // Calculate the length from root to target
    const targetLength = Math.min(targetDistance * stretchFactor, totalLength * this.maxStretch);

    // Use cosine rule to find the bend angle
    const cosAngle = (upperLength * upperLength + targetLength * targetLength - lowerLength * lowerLength) 
      / (2 * upperLength * targetLength);
    const bendAngle = Math.acos(Math.max(-1, Math.min(1, cosAngle)));

    // Calculate mid position
    let midTarget = new THREE.Vector3();

    if (this.hint) {
      // Use hint for bend direction
      const hintDir = new THREE.Vector3()
        .subVectors(this.hint, rootPos)
        .normalize();
      
      // Project hint onto the plane defined by root-target line
      const planeNormal = dirToTarget.clone();
      const projectedHint = hintDir.clone().sub(
        planeNormal.multiplyScalar(hintDir.dot(planeNormal))
      ).normalize();

      // Rotate target direction by bend angle towards hint
      const rotationAxis = projectedHint;
      const bendRotation = new THREE.Quaternion().setFromAxisAngle(rotationAxis, bendAngle);
      
      midTarget.copy(rootPos).add(
        dirToTarget.clone().applyQuaternion(bendRotation).multiplyScalar(upperLength)
      );
    } else {
      // Default bend direction (perpendicular)
      const bendAxis = this.getDefaultBendAxis(rootPos, dirToTarget);
      const bendRotation = new THREE.Quaternion().setFromAxisAngle(bendAxis, bendAngle);
      
      midTarget.copy(rootPos).add(
        dirToTarget.clone().applyQuaternion(bendRotation).multiplyScalar(upperLength)
      );
    }

    // Apply rotation to root bone
    this.applyRotation(this.rootBone, rootPos, midPos, midTarget);

    // Apply rotation to mid bone
    this.midBone.getWorldPosition(midPos);
    this.applyRotation(this.midBone, midPos, endPos, blendedTarget);
  }

  /**
   * Get default bend axis when no hint is provided
   */
  private getDefaultBendAxis(rootPos: THREE.Vector3, dirToTarget: THREE.Vector3): THREE.Vector3 {
    // Default to bending forward/backward
    const up = new THREE.Vector3(0, 1, 0);
    const bendAxis = new THREE.Vector3().crossVectors(dirToTarget, up).normalize();
    
    if (bendAxis.length() < 0.001) {
      bendAxis.set(1, 0, 0);
    }
    
    return bendAxis;
  }

  /**
   * Apply rotation to a bone
   */
  private applyRotation(
    bone: THREE.Bone,
    currentStart: THREE.Vector3,
    currentEnd: THREE.Vector3,
    targetEnd: THREE.Vector3
  ): void {
    // Get current direction
    const currentDir = new THREE.Vector3()
      .subVectors(currentEnd, currentStart)
      .normalize();

    // Get target direction
    const targetDir = new THREE.Vector3()
      .subVectors(targetEnd, currentStart)
      .normalize();

    // Calculate rotation
    const rotation = new THREE.Quaternion().setFromUnitVectors(currentDir, targetDir);

    // Get bone world quaternion
    const worldQuat = new THREE.Quaternion();
    bone.getWorldQuaternion(worldQuat);

    // Apply rotation in world space
    const newWorldQuat = rotation.multiply(worldQuat);

    // Convert to local space
    if (bone.parent) {
      const parentWorldQuat = new THREE.Quaternion();
      bone.parent.getWorldQuaternion(parentWorldQuat);
      parentWorldQuat.invert();
      newWorldQuat.premultiply(parentWorldQuat);
    }

    bone.quaternion.copy(newWorldQuat);
  }
}

/**
 * Look-at IK solver for head/eyes
 */
export class LookAtIKSolver {
  /** Head/eye bone */
  bone: THREE.Bone | null = null;
  
  /** Look-at target */
  target: THREE.Vector3 = new THREE.Vector3();
  
  /** IK weight */
  weight: number = 1;
  
  /** Forward direction of the bone */
  forward: THREE.Vector3 = new THREE.Vector3(0, 0, 1);
  
  /** Up direction */
  up: THREE.Vector3 = new THREE.Vector3(0, 1, 0);
  
  /** Maximum rotation angle (radians) */
  maxAngle: number = Math.PI / 2;
  
  /** Speed of look-at transition */
  speed: number = 10;

  constructor() {}

  /**
   * Set the bone to control
   */
  setBone(bone: THREE.Bone, forward: THREE.Vector3 = new THREE.Vector3(0, 0, 1)): void {
    this.bone = bone;
    this.forward = forward.clone().normalize();
  }

  /**
   * Solve look-at IK
   */
  solve(deltaTime: number = 1 / 60): void {
    if (!this.bone) return;
    if (this.weight <= 0) return;

    // Get bone world position
    const bonePos = new THREE.Vector3();
    this.bone.getWorldPosition(bonePos);

    // Calculate direction to target
    const dirToTarget = new THREE.Vector3()
      .subVectors(this.target, bonePos)
      .normalize();

    // Get current forward direction in world space
    const worldQuat = new THREE.Quaternion();
    this.bone.getWorldQuaternion(worldQuat);
    const currentForward = this.forward.clone().applyQuaternion(worldQuat);

    // Calculate target rotation
    const targetRotation = new THREE.Quaternion().setFromUnitVectors(
      currentForward,
      dirToTarget
    );

    // Clamp rotation to max angle
    const angle = 2 * Math.acos(targetRotation.w);
    if (angle > this.maxAngle) {
      const axis = new THREE.Vector3(
        targetRotation.x,
        targetRotation.y,
        targetRotation.z
      ).normalize();
      targetRotation.setFromAxisAngle(axis, this.maxAngle);
    }

    // Interpolate rotation
    const currentRotation = new THREE.Quaternion();
    this.bone.getWorldQuaternion(currentRotation);
    
    const desiredRotation = targetRotation.multiply(currentRotation);
    
    // Smooth transition
    const finalRotation = new THREE.Quaternion().slerpQuaternions(
      currentRotation,
      desiredRotation,
      Math.min(1, this.weight * this.speed * deltaTime)
    );

    // Convert to local space
    if (this.bone.parent) {
      const parentQuat = new THREE.Quaternion();
      this.bone.parent.getWorldQuaternion(parentQuat);
      parentQuat.invert();
      finalRotation.premultiply(parentQuat);
    }

    this.bone.quaternion.copy(finalRotation);
  }
}

/**
 * Foot IK solver for ground placement
 */
export class FootIKSolver {
  /** Foot bone */
  footBone: THREE.Bone | null = null;
  
  /** IK chain for leg */
  legChain: TwoBoneIKSolver | null = null;
  
  /** Ground height at foot position */
  groundHeight: number = 0;
  
  /** IK weight */
  weight: number = 1;
  
  /** Foot offset from ground */
  footOffset: number = 0;
  
  /** Foot rotation offset */
  rotationOffset: THREE.Euler = new THREE.Euler();

  constructor() {}

  /**
   * Set foot bone
   */
  setFoot(bone: THREE.Bone): void {
    this.footBone = bone;
  }

  /**
   * Set leg IK chain
   */
  setLegChain(chain: TwoBoneIKSolver): void {
    this.legChain = chain;
  }

  /**
   * Solve foot IK
   */
  solve(): void {
    if (!this.footBone || !this.legChain) return;
    if (this.weight <= 0) return;

    // Get foot world position
    const footPos = new THREE.Vector3();
    this.footBone.getWorldPosition(footPos);

    // Calculate target position on ground
    const targetY = this.groundHeight + this.footOffset;
    const heightDiff = targetY - footPos.y;

    // If foot is above ground, adjust leg IK target
    if (heightDiff > 0) {
      // Adjust leg IK target to reach ground
      const legTarget = this.legChain.target.clone();
      legTarget.y = targetY;
      this.legChain.target = legTarget;
      this.legChain.weight = this.weight;
      this.legChain.solve();
    }

    // Get foot world position after leg IK
    this.footBone.getWorldPosition(footPos);

    // Apply foot rotation for terrain alignment
    if (this.rotationOffset.x !== 0 || this.rotationOffset.z !== 0) {
      const footQuat = new THREE.Quaternion();
      this.footBone.getWorldQuaternion(footQuat);

      const terrainRotation = new THREE.Quaternion().setFromEuler(this.rotationOffset);
      const newQuat = terrainRotation.multiply(footQuat);

      // Convert to local space
      if (this.footBone.parent) {
        const parentQuat = new THREE.Quaternion();
        this.footBone.parent.getWorldQuaternion(parentQuat);
        parentQuat.invert();
        newQuat.premultiply(parentQuat);
      }

      // Interpolate
      this.footBone.quaternion.slerp(newQuat, this.weight);
    }
  }
}

/**
 * Hand IK solver for object interaction
 */
export class HandIKSolver {
  /** Hand bone */
  handBone: THREE.Bone | null = null;
  
  /** IK chain for arm */
  armChain: TwoBoneIKSolver | null = null;
  
  /** Target transform */
  targetPosition: THREE.Vector3 = new THREE.Vector3();
  targetRotation: THREE.Quaternion = new THREE.Quaternion();
  
  /** IK weight */
  weight: number = 1;
  
  /** Position offset from target */
  positionOffset: THREE.Vector3 = new THREE.Vector3();
  
  /** Rotation offset */
  rotationOffset: THREE.Euler = new THREE.Euler();

  constructor() {}

  /**
   * Set hand bone
   */
  setHand(bone: THREE.Bone): void {
    this.handBone = bone;
  }

  /**
   * Set arm IK chain
   */
  setArmChain(chain: TwoBoneIKSolver): void {
    this.armChain = chain;
  }

  /**
   * Solve hand IK
   */
  solve(): void {
    if (!this.handBone || !this.armChain) return;
    if (this.weight <= 0) return;

    // Apply position offset
    const adjustedTarget = this.targetPosition.clone().add(this.positionOffset);

    // Update arm IK target
    this.armChain.target = adjustedTarget;
    this.armChain.weight = this.weight;
    this.armChain.solve();

    // Apply hand rotation
    const handQuat = new THREE.Quaternion();
    this.handBone.getWorldQuaternion(handQuat);

    const targetQuat = this.targetRotation.clone();
    
    // Apply rotation offset
    if (this.rotationOffset.x !== 0 || this.rotationOffset.y !== 0 || this.rotationOffset.z !== 0) {
      const offsetQuat = new THREE.Quaternion().setFromEuler(this.rotationOffset);
      targetQuat.multiply(offsetQuat);
    }

    // Interpolate to target rotation
    const finalQuat = new THREE.Quaternion().slerpQuaternions(
      handQuat,
      targetQuat,
      this.weight
    );

    // Convert to local space
    if (this.handBone.parent) {
      const parentQuat = new THREE.Quaternion();
      this.handBone.parent.getWorldQuaternion(parentQuat);
      parentQuat.invert();
      finalQuat.premultiply(parentQuat);
    }

    this.handBone.quaternion.copy(finalQuat);
  }
}

/**
 * IK System managing all IK solvers
 */
export class IKSystem {
  /** Two-bone IK solvers */
  twoBoneSolvers: Map<string, TwoBoneIKSolver> = new Map();
  
  /** Look-at IK solvers */
  lookAtSolvers: Map<string, LookAtIKSolver> = new Map();
  
  /** Foot IK solvers */
  footSolvers: Map<string, FootIKSolver> = new Map();
  
  /** Hand IK solvers */
  handSolvers: Map<string, HandIKSolver> = new Map();
  
  /** Global IK weight */
  globalWeight: number = 1;

  constructor() {}

  /**
   * Create and add a two-bone IK solver
   */
  addTwoBoneSolver(
    name: string,
    root: THREE.Bone,
    mid: THREE.Bone,
    end: THREE.Bone
  ): TwoBoneIKSolver {
    const solver = new TwoBoneIKSolver();
    solver.setBones(root, mid, end);
    this.twoBoneSolvers.set(name, solver);
    return solver;
  }

  /**
   * Create and add a look-at IK solver
   */
  addLookAtSolver(
    name: string,
    bone: THREE.Bone,
    forward?: THREE.Vector3
  ): LookAtIKSolver {
    const solver = new LookAtIKSolver();
    solver.setBone(bone, forward);
    this.lookAtSolvers.set(name, solver);
    return solver;
  }

  /**
   * Create and add a foot IK solver
   */
  addFootSolver(
    name: string,
    foot: THREE.Bone,
    legChain?: TwoBoneIKSolver
  ): FootIKSolver {
    const solver = new FootIKSolver();
    solver.setFoot(foot);
    if (legChain) {
      solver.setLegChain(legChain);
    }
    this.footSolvers.set(name, solver);
    return solver;
  }

  /**
   * Create and add a hand IK solver
   */
  addHandSolver(
    name: string,
    hand: THREE.Bone,
    armChain?: TwoBoneIKSolver
  ): HandIKSolver {
    const solver = new HandIKSolver();
    solver.setHand(hand);
    if (armChain) {
      solver.setArmChain(armChain);
    }
    this.handSolvers.set(name, solver);
    return solver;
  }

  /**
   * Get a two-bone solver by name
   */
  getTwoBoneSolver(name: string): TwoBoneIKSolver | undefined {
    return this.twoBoneSolvers.get(name);
  }

  /**
   * Get a look-at solver by name
   */
  getLookAtSolver(name: string): LookAtIKSolver | undefined {
    return this.lookAtSolvers.get(name);
  }

  /**
   * Set target for a two-bone IK
   */
  setTwoBoneTarget(name: string, position: Vector3, weight: number = 1): void {
    const solver = this.twoBoneSolvers.get(name);
    if (solver) {
      solver.target.set(position.x, position.y, position.z);
      solver.weight = weight * this.globalWeight;
    }
  }

  /**
   * Set hint for a two-bone IK
   */
  setTwoBoneHint(name: string, position: Vector3): void {
    const solver = this.twoBoneSolvers.get(name);
    if (solver) {
      solver.hint = new THREE.Vector3(position.x, position.y, position.z);
    }
  }

  /**
   * Set target for look-at IK
   */
  setLookAtTarget(name: string, position: Vector3, weight: number = 1): void {
    const solver = this.lookAtSolvers.get(name);
    if (solver) {
      solver.target.set(position.x, position.y, position.z);
      solver.weight = weight * this.globalWeight;
    }
  }

  /**
   * Set ground height for foot IK
   */
  setFootGround(name: string, groundHeight: number, weight: number = 1): void {
    const solver = this.footSolvers.get(name);
    if (solver) {
      solver.groundHeight = groundHeight;
      solver.weight = weight * this.globalWeight;
    }
  }

  /**
   * Set target for hand IK
   */
  setHandTarget(name: string, position: Vector3, rotation: Quaternion, weight: number = 1): void {
    const solver = this.handSolvers.get(name);
    if (solver) {
      solver.targetPosition.set(position.x, position.y, position.z);
      solver.targetRotation.set(rotation.x, rotation.y, rotation.z, rotation.w);
      solver.weight = weight * this.globalWeight;
    }
  }

  /**
   * Solve all IK chains
   */
  solve(deltaTime: number = 1 / 60): void {
    // Solve two-bone IK first (arms, legs)
    for (const solver of this.twoBoneSolvers.values()) {
      solver.solve();
    }

    // Solve foot IK
    for (const solver of this.footSolvers.values()) {
      solver.solve();
    }

    // Solve hand IK
    for (const solver of this.handSolvers.values()) {
      solver.solve();
    }

    // Solve look-at IK last (head, eyes)
    for (const solver of this.lookAtSolvers.values()) {
      solver.solve(deltaTime);
    }
  }

  /**
   * Remove a solver
   */
  removeSolver(name: string, type: 'twobone' | 'lookat' | 'foot' | 'hand'): boolean {
    switch (type) {
      case 'twobone':
        return this.twoBoneSolvers.delete(name);
      case 'lookat':
        return this.lookAtSolvers.delete(name);
      case 'foot':
        return this.footSolvers.delete(name);
      case 'hand':
        return this.handSolvers.delete(name);
    }
  }

  /**
   * Clear all solvers
   */
  clear(): void {
    this.twoBoneSolvers.clear();
    this.lookAtSolvers.clear();
    this.footSolvers.clear();
    this.handSolvers.clear();
  }

  /**
   * Create IK system for a humanoid
   */
  static createHumanoidIK(
    skeleton: THREE.Skeleton,
    boneMap: HumanoidBoneMap
  ): IKSystem {
    const ik = new IKSystem();

    // Left leg IK
    if (boneMap.leftUpperLeg && boneMap.leftLowerLeg && boneMap.leftFoot) {
      const leftLeg = ik.addTwoBoneSolver(
        'leftLeg',
        skeleton.getBoneByName(boneMap.leftUpperLeg)!,
        skeleton.getBoneByName(boneMap.leftLowerLeg)!,
        skeleton.getBoneByName(boneMap.leftFoot)!
      );
      
      ik.addFootSolver('leftFoot', skeleton.getBoneByName(boneMap.leftFoot)!, leftLeg);
    }

    // Right leg IK
    if (boneMap.rightUpperLeg && boneMap.rightLowerLeg && boneMap.rightFoot) {
      const rightLeg = ik.addTwoBoneSolver(
        'rightLeg',
        skeleton.getBoneByName(boneMap.rightUpperLeg)!,
        skeleton.getBoneByName(boneMap.rightLowerLeg)!,
        skeleton.getBoneByName(boneMap.rightFoot)!
      );
      
      ik.addFootSolver('rightFoot', skeleton.getBoneByName(boneMap.rightFoot)!, rightLeg);
    }

    // Left arm IK
    if (boneMap.leftUpperArm && boneMap.leftLowerArm && boneMap.leftHand) {
      const leftArm = ik.addTwoBoneSolver(
        'leftArm',
        skeleton.getBoneByName(boneMap.leftUpperArm)!,
        skeleton.getBoneByName(boneMap.leftLowerArm)!,
        skeleton.getBoneByName(boneMap.leftHand)!
      );
      
      ik.addHandSolver('leftHand', skeleton.getBoneByName(boneMap.leftHand)!, leftArm);
    }

    // Right arm IK
    if (boneMap.rightUpperArm && boneMap.rightLowerArm && boneMap.rightHand) {
      const rightArm = ik.addTwoBoneSolver(
        'rightArm',
        skeleton.getBoneByName(boneMap.rightUpperArm)!,
        skeleton.getBoneByName(boneMap.rightLowerArm)!,
        skeleton.getBoneByName(boneMap.rightHand)!
      );
      
      ik.addHandSolver('rightHand', skeleton.getBoneByName(boneMap.rightHand)!, rightArm);
    }

    // Head look-at
    if (boneMap.head) {
      ik.addLookAtSolver('head', skeleton.getBoneByName(boneMap.head)!);
    }

    return ik;
  }
}

/**
 * Humanoid bone mapping
 */
export interface HumanoidBoneMap {
  // Spine
  hips?: string;
  spine?: string;
  chest?: string;
  upperChest?: string;
  neck?: string;
  head?: string;

  // Left arm
  leftShoulder?: string;
  leftUpperArm?: string;
  leftLowerArm?: string;
  leftHand?: string;

  // Right arm
  rightShoulder?: string;
  rightUpperArm?: string;
  rightLowerArm?: string;
  rightHand?: string;

  // Left leg
  leftUpperLeg?: string;
  leftLowerLeg?: string;
  leftFoot?: string;
  leftToes?: string;

  // Right leg
  rightUpperLeg?: string;
  rightLowerLeg?: string;
  rightFoot?: string;
  rightToes?: string;
}

/**
 * Standard Mixamo bone names
 */
export const MixamoBoneMap: HumanoidBoneMap = {
  hips: 'mixamorigHips',
  spine: 'mixamorigSpine',
  chest: 'mixamorigSpine1',
  upperChest: 'mixamorigSpine2',
  neck: 'mixamorigNeck',
  head: 'mixamorigHead',
  
  leftShoulder: 'mixamorigLeftShoulder',
  leftUpperArm: 'mixamorigLeftArm',
  leftLowerArm: 'mixamorigLeftForeArm',
  leftHand: 'mixamorigLeftHand',
  
  rightShoulder: 'mixamorigRightShoulder',
  rightUpperArm: 'mixamorigRightArm',
  rightLowerArm: 'mixamorigRightForeArm',
  rightHand: 'mixamorigRightHand',
  
  leftUpperLeg: 'mixamorigLeftUpLeg',
  leftLowerLeg: 'mixamorigLeftLeg',
  leftFoot: 'mixamorigLeftFoot',
  leftToes: 'mixamorigLeftToeBase',
  
  rightUpperLeg: 'mixamorigRightUpLeg',
  rightLowerLeg: 'mixamorigRightLeg',
  rightFoot: 'mixamorigRightFoot',
  rightToes: 'mixamorigRightToeBase',
};
