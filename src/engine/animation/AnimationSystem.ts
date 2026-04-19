// ============================================
// Animation System - Complete Animation Framework
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// ============================================

import * as THREE from 'three';

// Animation wrap modes
export type WrapMode = 'once' | 'loop' | 'pingPong' | 'clampForever';

// Animation parameter types
export type AnimParamType = 'bool' | 'float' | 'int' | 'trigger';

// Animation event
export interface AnimationEvent {
  time: number;
  functionName: string;
  parameter?: string | number | boolean;
}

// Animation clip data
export interface AnimationClipData {
  name: string;
  duration: number;
  frameRate: number;
  wrapMode: WrapMode;
  events: AnimationEvent[];
  tracks: AnimationTrack[];
}

// Animation track
export interface AnimationTrack {
  name: string;
  type: 'position' | 'rotation' | 'scale' | 'morph';
  times: number[];
  values: number[];
  interpolation: 'linear' | 'step' | 'cubic';
}

// Animator parameter
export interface AnimatorParameter {
  name: string;
  type: AnimParamType;
  value: boolean | number;
  defaultValue: boolean | number;
}

// Animator state
export interface AnimatorState {
  name: string;
  clip: string;
  speed: number;
  loop: boolean;
  transitions: AnimatorTransition[];
  onEnter?: () => void;
  onExit?: () => void;
}

// Animator transition
export interface AnimatorTransition {
  toState: string;
  duration: number;
  conditions: TransitionCondition[];
  hasExitTime: boolean;
  exitTime: number;
}

// Transition condition
export interface TransitionCondition {
  parameter: string;
  mode: 'equals' | 'notEquals' | 'greater' | 'less' | 'trigger';
  threshold: number | boolean;
}

// Blend tree node
export interface BlendTreeNode {
  clip: string;
  position: { x: number; y: number };
  threshold: number;
  speed: number;
}

// Blend tree
export interface BlendTree {
  name: string;
  blendParameter: string;
  blendParameterY?: string;
  nodes: BlendTreeNode[];
  mode: '1D' | '2D';
}

// ============================================
// Animation Clip
// ============================================
export class AnimationClip {
  public name: string;
  public duration: number;
  public frameRate: number;
  public wrapMode: WrapMode;
  public events: AnimationEvent[];
  public threeClip: THREE.AnimationClip | null = null;

  constructor(data: Partial<AnimationClipData> = {}) {
    this.name = data.name || 'unnamed';
    this.duration = data.duration || 1;
    this.frameRate = data.frameRate || 30;
    this.wrapMode = data.wrapMode || 'loop';
    this.events = data.events || [];
  }

  static fromThreeClip(clip: THREE.AnimationClip): AnimationClip {
    const animClip = new AnimationClip();
    animClip.name = clip.name;
    animClip.duration = clip.duration;
    animClip.frameRate = 30;
    animClip.threeClip = clip;
    return animClip;
  }

  addEvent(time: number, functionName: string, parameter?: string | number | boolean): void {
    this.events.push({ time, functionName, parameter });
    this.events.sort((a, b) => a.time - b.time);
  }
}

// ============================================
// Blend Tree
// ============================================
export class BlendTreeController {
  public name: string;
  public mode: '1D' | '2D';
  public nodes: BlendTreeNode[];
  public blendParameter: string;
  public blendParameterY?: string;

  constructor(data: Partial<BlendTree> = {}) {
    this.name = data.name || 'blendTree';
    this.mode = data.mode || '1D';
    this.nodes = data.nodes || [];
    this.blendParameter = data.blendParameter || 'blend';
    this.blendParameterY = data.blendParameterY;
  }

  addNode(clip: string, position: { x: number; y?: number }, threshold?: number): void {
    this.nodes.push({
      clip,
      position: { x: position.x, y: position.y || 0 },
      threshold: threshold ?? this.nodes.length,
      speed: 1,
    });
    this.nodes.sort((a, b) => a.position.x - b.position.x);
  }

  getBlendWeights(value: number, valueY?: number): Map<string, number> {
    const weights = new Map<string, number>();

    if (this.mode === '1D') {
      // 1D blending
      for (let i = 0; i < this.nodes.length; i++) {
        const node = this.nodes[i];
        const nextNode = this.nodes[i + 1];

        if (!nextNode) {
          if (i === 0) weights.set(node.clip, 1);
          break;
        }

        if (value <= node.position.x) {
          weights.set(node.clip, 1);
          break;
        }

        if (value >= nextNode.position.x) {
          weights.set(node.clip, 0);
          continue;
        }

        // Interpolate
        const t = (value - node.position.x) / (nextNode.position.x - node.position.x);
        weights.set(node.clip, 1 - t);
        weights.set(nextNode.clip, t);
        break;
      }
    } else if (this.mode === '2D' && valueY !== undefined) {
      // 2D blending (simple distance-based)
      let totalWeight = 0;
      const distances: { clip: string; distance: number }[] = [];

      for (const node of this.nodes) {
        const dx = node.position.x - value;
        const dy = node.position.y - valueY;
        const distance = Math.sqrt(dx * dx + dy * dy) + 0.001; // Avoid division by zero
        distances.push({ clip: node.clip, distance });
        totalWeight += 1 / distance;
      }

      for (const d of distances) {
        weights.set(d.clip, (1 / d.distance) / totalWeight);
      }
    }

    return weights;
  }
}

// ============================================
// Animator State Machine
// ============================================
export class AnimatorController {
  public parameters: Map<string, AnimatorParameter>;
  public states: Map<string, AnimatorState>;
  public currentState: string;
  public previousState: string | null;
  public stateTime: number;
  public transitionDuration: number;
  public transitionTime: number;

  constructor() {
    this.parameters = new Map();
    this.states = new Map();
    this.currentState = 'default';
    this.previousState = null;
    this.stateTime = 0;
    this.transitionDuration = 0;
    this.transitionTime = 0;
  }

  // Parameters
  addParameter(name: string, type: AnimParamType, defaultValue: boolean | number = false): void {
    this.parameters.set(name, {
      name,
      type,
      value: defaultValue,
      defaultValue,
    });
  }

  setBool(name: string, value: boolean): void {
    const param = this.parameters.get(name);
    if (param && param.type === 'bool') {
      param.value = value;
    }
  }

  setFloat(name: string, value: number): void {
    const param = this.parameters.get(name);
    if (param && param.type === 'float') {
      param.value = value;
    }
  }

  setInt(name: string, value: number): void {
    const param = this.parameters.get(name);
    if (param && param.type === 'int') {
      param.value = Math.floor(value);
    }
  }

  setTrigger(name: string): void {
    const param = this.parameters.get(name);
    if (param && param.type === 'trigger') {
      param.value = true;
    }
  }

  resetTrigger(name: string): void {
    const param = this.parameters.get(name);
    if (param && param.type === 'trigger') {
      param.value = false;
    }
  }

  getParam(name: string): boolean | number | undefined {
    return this.parameters.get(name)?.value;
  }

  // States
  addState(state: AnimatorState): void {
    this.states.set(state.name, state);
  }

  setState(name: string): void {
    if (this.states.has(name) && this.currentState !== name) {
      const prevState = this.states.get(this.currentState);
      if (prevState?.onExit) prevState.onExit();

      this.previousState = this.currentState;
      this.currentState = name;
      this.stateTime = 0;

      const newState = this.states.get(name);
      if (newState?.onEnter) newState.onEnter();
    }
  }

  // Transitions
  checkTransitions(): string | null {
    const state = this.states.get(this.currentState);
    if (!state) return null;

    for (const transition of state.transitions) {
      if (this.checkConditions(transition.conditions)) {
        return transition.toState;
      }
    }

    return null;
  }

  private checkConditions(conditions: TransitionCondition[]): boolean {
    for (const condition of conditions) {
      const param = this.parameters.get(condition.parameter);
      if (!param) continue;

      const value = param.value;

      switch (condition.mode) {
        case 'equals':
          if (value !== condition.threshold) return false;
          break;
        case 'notEquals':
          if (value === condition.threshold) return false;
          break;
        case 'greater':
          if (typeof value !== 'number' || value <= (condition.threshold as number)) return false;
          break;
        case 'less':
          if (typeof value !== 'number' || value >= (condition.threshold as number)) return false;
          break;
        case 'trigger':
          if (!value) return false;
          this.resetTrigger(condition.parameter);
          break;
      }
    }

    return true;
  }

  // Create default state machine
  createDefaultStateMachine(): void {
    // Parameters
    this.addParameter('speed', 'float', 0);
    this.addParameter('grounded', 'bool', true);
    this.addParameter('jump', 'trigger', false);
    this.addParameter('attack', 'trigger', false);

    // States
    this.addState({
      name: 'idle',
      clip: 'idle',
      speed: 1,
      loop: true,
      transitions: [
        { toState: 'walk', duration: 0.2, conditions: [{ parameter: 'speed', mode: 'greater', threshold: 0.1 }], hasExitTime: false, exitTime: 0 },
        { toState: 'jump', duration: 0.1, conditions: [{ parameter: 'jump', mode: 'trigger', threshold: true }], hasExitTime: false, exitTime: 0 },
        { toState: 'attack', duration: 0.1, conditions: [{ parameter: 'attack', mode: 'trigger', threshold: true }], hasExitTime: false, exitTime: 0 },
      ],
    });

    this.addState({
      name: 'walk',
      clip: 'walk',
      speed: 1,
      loop: true,
      transitions: [
        { toState: 'idle', duration: 0.2, conditions: [{ parameter: 'speed', mode: 'less', threshold: 0.1 }], hasExitTime: false, exitTime: 0 },
        { toState: 'run', duration: 0.2, conditions: [{ parameter: 'speed', mode: 'greater', threshold: 0.7 }], hasExitTime: false, exitTime: 0 },
      ],
    });

    this.addState({
      name: 'run',
      clip: 'run',
      speed: 1,
      loop: true,
      transitions: [
        { toState: 'walk', duration: 0.2, conditions: [{ parameter: 'speed', mode: 'less', threshold: 0.7 }], hasExitTime: false, exitTime: 0 },
        { toState: 'idle', duration: 0.3, conditions: [{ parameter: 'speed', mode: 'less', threshold: 0.1 }], hasExitTime: false, exitTime: 0 },
      ],
    });

    this.addState({
      name: 'jump',
      clip: 'jump',
      speed: 1,
      loop: false,
      transitions: [
        { toState: 'idle', duration: 0.2, conditions: [{ parameter: 'grounded', mode: 'equals', threshold: true }], hasExitTime: true, exitTime: 0.9 },
      ],
    });

    this.addState({
      name: 'attack',
      clip: 'attack',
      speed: 1.5,
      loop: false,
      transitions: [
        { toState: 'idle', duration: 0.1, conditions: [], hasExitTime: true, exitTime: 0.9 },
      ],
    });
  }
}

// ============================================
// Animator Component
// ============================================
export class Animator {
  public controller: AnimatorController;
  public clips: Map<string, AnimationClip>;
  public mixer: THREE.AnimationMixer | null;
  public currentAction: THREE.AnimationAction | null;
  public blendTrees: Map<string, BlendTreeController>;
  public speed: number;
  public avatar: THREE.Object3D | null;

  private events: Map<string, Set<() => void>>;

  constructor() {
    this.controller = new AnimatorController();
    this.clips = new Map();
    this.mixer = null;
    this.currentAction = null;
    this.blendTrees = new Map();
    this.speed = 1;
    this.avatar = null;
    this.events = new Map();
  }

  // Setup
  setAvatar(object: THREE.Object3D): void {
    this.avatar = object;
    this.mixer = new THREE.AnimationMixer(object);
  }

  // Clips
  addClip(clip: AnimationClip): void {
    this.clips.set(clip.name, clip);
  }

  addThreeClip(clip: THREE.AnimationClip): void {
    const animClip = AnimationClip.fromThreeClip(clip);
    this.clips.set(clip.name, animClip);
  }

  addClipsFromGLTF(gltf: { animations: THREE.AnimationClip[] }): void {
    for (const clip of gltf.animations) {
      this.addThreeClip(clip);
    }
  }

  // Blend Trees
  addBlendTree(blendTree: BlendTreeController): void {
    this.blendTrees.set(blendTree.name, blendTree);
  }

  // Playback
  play(name: string, crossFadeDuration: number = 0.3): void {
    if (!this.mixer) return;

    const clip = this.clips.get(name);
    if (!clip?.threeClip) return;

    const action = this.mixer.clipAction(clip.threeClip);
    action.reset();
    action.setLoop(clip.wrapMode === 'loop' ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.clampWhenFinished = clip.wrapMode === 'clampForever';

    if (this.currentAction && this.currentAction !== action) {
      if (crossFadeDuration > 0) {
        this.mixer.stopAllAction();
        action.play();
        this.currentAction.crossFadeTo(action, crossFadeDuration, true);
      } else {
        this.currentAction.stop();
        action.play();
      }
    } else {
      action.play();
    }

    this.currentAction = action;
  }

  stop(): void {
    if (this.currentAction) {
      this.currentAction.stop();
      this.currentAction = null;
    }
  }

  pause(): void {
    if (this.currentAction) {
      this.currentAction.paused = true;
    }
  }

  resume(): void {
    if (this.currentAction) {
      this.currentAction.paused = false;
    }
  }

  // Parameters (delegate to controller)
  setBool(name: string, value: boolean): void {
    this.controller.setBool(name, value);
  }

  setFloat(name: string, value: number): void {
    this.controller.setFloat(name, value);
  }

  setInt(name: string, value: number): void {
    this.controller.setInt(name, value);
  }

  setTrigger(name: string): void {
    this.controller.setTrigger(name);
  }

  // Events
  on(event: string, callback: () => void): void {
    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }
    this.events.get(event)!.add(callback);
  }

  off(event: string, callback: () => void): void {
    this.events.get(event)?.delete(callback);
  }

  private emit(event: string): void {
    this.events.get(event)?.forEach(cb => cb());
  }

  // Update
  update(deltaTime: number): void {
    if (!this.mixer) return;

    // Update mixer
    this.mixer.update(deltaTime * this.speed);

    // Update state machine
    this.controller.stateTime += deltaTime;

    // Check transitions
    const nextState = this.controller.checkTransitions();
    if (nextState) {
      this.controller.setState(nextState);
      const state = this.controller.states.get(nextState);
      if (state) {
        this.play(state.clip, state.transitions[0]?.duration ?? 0.2);
      }
    }

    // Check animation events
    const currentClip = this.clips.get(this.controller.currentState);
    if (currentClip) {
      for (const event of currentClip.events) {
        if (event.time <= this.controller.stateTime && event.time > this.controller.stateTime - deltaTime) {
          this.emit(event.functionName);
        }
      }
    }
  }
}

// ============================================
// IK System
// ============================================
export class IKSolver {
  public enabled: boolean;
  public leftFootTarget: THREE.Vector3 | null;
  public rightFootTarget: THREE.Vector3 | null;
  public leftHandTarget: THREE.Vector3 | null;
  public rightHandTarget: THREE.Vector3 | null;
  public lookAtTarget: THREE.Vector3 | null;
  public leftFootHint: THREE.Vector3 | null;
  public rightFootHint: THREE.Vector3 | null;
  public leftHandHint: THREE.Vector3 | null;
  public rightHandHint: THREE.Vector3 | null;

  private skeleton: THREE.Skeleton | null;
  private bones: Map<string, THREE.Bone>;

  constructor() {
    this.enabled = true;
    this.leftFootTarget = null;
    this.rightFootTarget = null;
    this.leftHandTarget = null;
    this.rightHandTarget = null;
    this.lookAtTarget = null;
    this.leftFootHint = null;
    this.rightFootHint = null;
    this.leftHandHint = null;
    this.rightHandHint = null;
    this.skeleton = null;
    this.bones = new Map();
  }

  setSkeleton(skeleton: THREE.Skeleton): void {
    this.skeleton = skeleton;
    this.bones.clear();

    skeleton.bones.forEach(bone => {
      this.bones.set(bone.name, bone);
    });
  }

  // Two-bone IK solver
  solveTwoBoneIK(
    rootBone: THREE.Bone,
    midBone: THREE.Bone,
    endBone: THREE.Bone,
    target: THREE.Vector3,
    hint?: THREE.Vector3
  ): void {
    const rootPos = new THREE.Vector3();
    const midPos = new THREE.Vector3();
    const endPos = new THREE.Vector3();

    rootBone.getWorldPosition(rootPos);
    midBone.getWorldPosition(midPos);
    endBone.getWorldPosition(endPos);

    const rootLen = rootPos.distanceTo(midPos);
    const midLen = midPos.distanceTo(endPos);
    const targetLen = rootPos.distanceTo(target);

    // Calculate bend direction
    const bendDir = new THREE.Vector3();
    if (hint) {
      bendDir.subVectors(hint, rootPos).normalize();
    } else {
      const toTarget = new THREE.Vector3().subVectors(target, rootPos);
      const cross = new THREE.Vector3().crossVectors(toTarget, new THREE.Vector3(0, 1, 0));
      bendDir.crossVectors(toTarget, cross).normalize();
    }

    // Calculate mid position
    const midToTarget = new THREE.Vector3().subVectors(target, rootPos);
    const midAngle = Math.acos(
      Math.max(-1, Math.min(1, (rootLen * rootLen + targetLen * targetLen - midLen * midLen) / (2 * rootLen * targetLen)))
    );

    const midRot = new THREE.Quaternion().setFromAxisAngle(bendDir, midAngle);
    const midDir = new THREE.Vector3().subVectors(target, rootPos).normalize();
    midDir.applyQuaternion(midRot);

    const newMidPos = new THREE.Vector3().copy(rootPos).add(midDir.multiplyScalar(rootLen));

    // Apply rotations
    const rootToMid = new THREE.Vector3().subVectors(newMidPos, rootPos).normalize();
    const currentRootToMid = new THREE.Vector3().subVectors(midPos, rootPos).normalize();

    const rootRot = new THREE.Quaternion().setFromUnitVectors(currentRootToMid, rootToMid);
    rootBone.quaternion.premultiply(rootRot);

    const midToEnd = new THREE.Vector3().subVectors(target, newMidPos).normalize();
    const currentMidToEnd = new THREE.Vector3().subVectors(endPos, midPos).normalize();

    const midRot2 = new THREE.Quaternion().setFromUnitVectors(currentMidToEnd, midToEnd);
    midBone.quaternion.premultiply(midRot2);
  }

  // Look-at IK
  solveLookAt(headBone: THREE.Bone, target: THREE.Vector3, weight: number = 1): void {
    const headPos = new THREE.Vector3();
    headBone.getWorldPosition(headPos);

    const direction = new THREE.Vector3().subVectors(target, headPos).normalize();
    const up = new THREE.Vector3(0, 1, 0);

    const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
    rotation.slerp(new THREE.Quaternion(), 1 - weight);

    headBone.quaternion.premultiply(rotation);
  }

  // Update all IK
  update(): void {
    if (!this.enabled || !this.skeleton) return;

    // Solve foot IK
    if (this.leftFootTarget) {
      const leftUpperLeg = this.bones.get('LeftUpperLeg');
      const leftLowerLeg = this.bones.get('LeftLowerLeg');
      const leftFoot = this.bones.get('LeftFoot');
      if (leftUpperLeg && leftLowerLeg && leftFoot) {
        this.solveTwoBoneIK(leftUpperLeg, leftLowerLeg, leftFoot, this.leftFootTarget, this.leftFootHint ?? undefined);
      }
    }

    if (this.rightFootTarget) {
      const rightUpperLeg = this.bones.get('RightUpperLeg');
      const rightLowerLeg = this.bones.get('RightLowerLeg');
      const rightFoot = this.bones.get('RightFoot');
      if (rightUpperLeg && rightLowerLeg && rightFoot) {
        this.solveTwoBoneIK(rightUpperLeg, rightLowerLeg, rightFoot, this.rightFootTarget, this.rightFootHint ?? undefined);
      }
    }

    // Solve hand IK
    if (this.leftHandTarget) {
      const leftUpperArm = this.bones.get('LeftUpperArm');
      const leftLowerArm = this.bones.get('LeftLowerArm');
      const leftHand = this.bones.get('LeftHand');
      if (leftUpperArm && leftLowerArm && leftHand) {
        this.solveTwoBoneIK(leftUpperArm, leftLowerArm, leftHand, this.leftHandTarget, this.leftHandHint ?? undefined);
      }
    }

    if (this.rightHandTarget) {
      const rightUpperArm = this.bones.get('RightUpperArm');
      const rightLowerArm = this.bones.get('RightLowerArm');
      const rightHand = this.bones.get('RightHand');
      if (rightUpperArm && rightLowerArm && rightHand) {
        this.solveTwoBoneIK(rightUpperArm, rightLowerArm, rightHand, this.rightHandTarget, this.rightHandHint ?? undefined);
      }
    }

    // Solve look-at IK
    if (this.lookAtTarget) {
      const head = this.bones.get('Head');
      if (head) {
        this.solveLookAt(head, this.lookAtTarget, 0.5);
      }
    }
  }
}

// ============================================
// Animation System Manager
// ============================================
export class AnimationSystem {
  private animators: Set<Animator>;
  private ikSolvers: Set<IKSolver>;
  private lastUpdateTime: number;

  constructor() {
    this.animators = new Set();
    this.ikSolvers = new Set();
    this.lastUpdateTime = performance.now();
  }

  addAnimator(animator: Animator): void {
    this.animators.add(animator);
  }

  removeAnimator(animator: Animator): void {
    this.animators.delete(animator);
  }

  addIKSolver(solver: IKSolver): void {
    this.ikSolvers.add(solver);
  }

  removeIKSolver(solver: IKSolver): void {
    this.ikSolvers.delete(solver);
  }

  update(): void {
    const now = performance.now();
    const deltaTime = Math.min((now - this.lastUpdateTime) / 1000, 0.1);
    this.lastUpdateTime = now;

    // Update animators
    for (const animator of this.animators) {
      animator.update(deltaTime);
    }

    // Update IK solvers
    for (const solver of this.ikSolvers) {
      solver.update();
    }
  }

  dispose(): void {
    this.animators.clear();
    this.ikSolvers.clear();
  }
}

// Export singleton
export const animationSystem = new AnimationSystem();
