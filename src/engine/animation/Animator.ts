// ============================================
// Animator Component and State Machine
// REY30 3D Engine - Animation Module
// ============================================

import * as THREE from 'three';
import { AnimationClip, WrapMode, AnimationEvent } from './AnimationClip';
import { BlendTree, BlendTreeType, Vector2 } from './BlendTree';
import { IKSystem, HumanoidBoneMap, MixamoBoneMap } from './IK';
import { Avatar, HumanoidBodyPart } from './Avatar';
import type { Vector3, Quaternion } from '@/types/engine';

/**
 * Animator parameter types
 */
export enum AnimatorParameterType {
  Float = 'float',
  Int = 'int',
  Bool = 'bool',
  Trigger = 'trigger',
}

/**
 * Animator parameter
 */
export interface AnimatorParameter {
  name: string;
  type: AnimatorParameterType;
  value: number | boolean;
  defaultValue: number | boolean;
}

/**
 * Animation state in the state machine
 */
export class AnimationState {
  /** State name */
  name: string;
  
  /** Animation clip (for single clip states) */
  clip: AnimationClip | null = null;
  
  /** Blend tree (for blend states) */
  blendTree: BlendTree | null = null;
  
  /** Speed multiplier */
  speed: number = 1;
  
  /** Speed parameter name (for variable speed) */
  speedParameter: string | null = null;
  
  /** Mirror animation */
  mirror: boolean = false;
  
  /** Cycle offset (0-1) */
  cycleOffset: number = 0;
  
  /** Foot IK enabled */
  footIK: boolean = false;
  
  /** Transitions from this state */
  transitions: AnimationTransition[] = [];
  
  /** Behaviors on enter/exit */
  onEnter: (() => void) | null = null;
  onExit: (() => void) | null = null;
  onUpdate: ((deltaTime: number) => void) | null = null;

  constructor(name: string) {
    this.name = name;
  }

  /**
   * Set animation clip
   */
  setClip(clip: AnimationClip): void {
    this.clip = clip;
    this.blendTree = null;
  }

  /**
   * Set blend tree
   */
  setBlendTree(blendTree: BlendTree): void {
    this.blendTree = blendTree;
    this.clip = null;
  }

  /**
   * Add transition to another state
   */
  addTransition(transition: AnimationTransition): void {
    this.transitions.push(transition);
  }

  /**
   * Get duration
   */
  getDuration(): number {
    if (this.clip) {
      return this.clip.duration;
    }
    if (this.blendTree) {
      return this.blendTree.getDuration(0);
    }
    return 0;
  }
}

/**
 * Transition condition
 */
export interface TransitionCondition {
  /** Parameter name */
  parameter: string;
  /** Condition mode */
  mode: ConditionMode;
  /** Threshold value */
  threshold: number;
}

/**
 * Condition modes
 */
export enum ConditionMode {
  /** Parameter is greater than threshold */
  Greater = 'greater',
  /** Parameter is less than threshold */
  Less = 'less',
  /** Parameter equals threshold */
  Equals = 'equals',
  /** Parameter not equals threshold */
  NotEquals = 'notEquals',
  /** Parameter is true */
  If = 'if',
  /** Parameter is false */
  IfNot = 'ifNot',
  /** Trigger is set */
  Trigger = 'trigger',
}

/**
 * Animation transition between states
 */
export class AnimationTransition {
  /** Source state */
  sourceState: string;
  
  /** Destination state */
  destinationState: string;
  
  /** Transition duration in seconds */
  duration: number = 0.25;
  
  /** Has exit time */
  hasExitTime: boolean = false;
  
  /** Exit time (0-1) */
  exitTime: number = 0.9;
  
  /** Fixed duration vs percentage */
  hasFixedDuration: boolean = true;
  
  /** Transition offset (start point in destination) */
  offset: number = 0;
  
  /** Interruption source */
  interruptionSource: InterruptionSource = InterruptionSource.None;
  
  /** Transition conditions */
  conditions: TransitionCondition[] = [];
  
  /** Can transition to self */
  canTransitionToSelf: boolean = false;

  constructor(sourceState: string, destinationState: string) {
    this.sourceState = sourceState;
    this.destinationState = destinationState;
  }

  /**
   * Add a condition
   */
  addCondition(condition: TransitionCondition): void {
    this.conditions.push(condition);
  }

  /**
   * Set exit time
   */
  setExitTime(exitTime: number, duration: number = 0.25): void {
    this.hasExitTime = true;
    this.exitTime = exitTime;
    this.duration = duration;
  }
}

/**
 * Interruption source for transitions
 */
export enum InterruptionSource {
  None = 'none',
  Source = 'source',
  Destination = 'destination',
  SourceThenDestination = 'sourceThenDestination',
  DestinationThenSource = 'destinationThenSource',
}

/**
 * Animation layer for layered animation
 */
export class AnimationLayer {
  /** Layer name */
  name: string;
  
  /** Layer weight */
  weight: number = 1;
  
  /** Avatar mask */
  avatarMask: string[] = [];
  
  /** Blending mode */
  blendingMode: LayerBlendingMode = LayerBlendingMode.Override;
  
  /** States in this layer */
  states: Map<string, AnimationState> = new Map();
  
  /** Current state */
  currentState: AnimationState | null = null;
  
  /** Default state */
  defaultState: string | null = null;

  constructor(name: string) {
    this.name = name;
  }

  /**
   * Add a state
   */
  addState(state: AnimationState): void {
    this.states.set(state.name, state);
    if (!this.defaultState) {
      this.defaultState = state.name;
    }
  }

  /**
   * Get state by name
   */
  getState(name: string): AnimationState | undefined {
    return this.states.get(name);
  }

  /**
   * Set default state
   */
  setDefaultState(name: string): void {
    if (this.states.has(name)) {
      this.defaultState = name;
    }
  }
}

/**
 * Layer blending modes
 */
export enum LayerBlendingMode {
  Override = 'override',
  Additive = 'additive',
}

/**
 * Active state data
 */
interface ActiveStateData {
  state: AnimationState;
  time: number;
  normalizedTime: number;
  layerTime: number;
}

/**
 * Transition data
 */
interface TransitionData {
  fromState: ActiveStateData;
  toState: ActiveStateData;
  duration: number;
  elapsed: number;
  transition: AnimationTransition;
}

/**
 * Animator component for entities
 */
export class Animator {
  /** Animator ID */
  id: string;
  
  /** Three.js AnimationMixer */
  mixer: THREE.AnimationMixer | null = null;
  
  /** Three.js model reference */
  model: THREE.Object3D | null = null;
  
  /** Skeleton reference */
  skeleton: THREE.Skeleton | null = null;
  
  /** Animation clips */
  clips: Map<string, AnimationClip> = new Map();
  
  /** Blend trees */
  blendTrees: Map<string, BlendTree> = new Map();
  
  /** Animation layers */
  layers: AnimationLayer[] = [];
  
  /** Parameters */
  parameters: Map<string, AnimatorParameter> = new Map();
  
  /** Current active transitions */
  activeTransitions: TransitionData[] = [];
  
  /** IK system */
  ikSystem: IKSystem | null = null;
  
  /** Avatar definition */
  avatar: Avatar | null = null;
  
  /** Current clip for simple playback */
  private currentClipName: string | null = null;
  
  /** Current Three.js action */
  private currentAction: THREE.AnimationAction | null = null;
  
  /** Crossfade duration */
  private crossfadeDuration: number = 0.25;
  
  /** Playback speed */
  playbackSpeed: number = 1;
  
  /** Root motion enabled */
  rootMotionEnabled: boolean = false;
  
  /** Root motion delta */
  rootMotionDelta: { position: Vector3; rotation: Quaternion } = {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
  };

  constructor(id?: string) {
    this.id = id || `animator_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create base layer
    this.addLayer('Base');
  }

  /**
   * Set the model and skeleton
   */
  setModel(model: THREE.Object3D): void {
    this.model = model;
    this.mixer = new THREE.AnimationMixer(model);
    
    // Find skeleton
    model.traverse((object) => {
      if ((object as THREE.SkinnedMesh).isSkinnedMesh) {
        const skinnedMesh = object as THREE.SkinnedMesh;
        this.skeleton = skinnedMesh.skeleton;
      }
    });
  }

  /**
   * Add an animation clip
   */
  addClip(name: string, clip: AnimationClip): void {
    this.clips.set(name, clip);
    
    // Create state for clip in base layer
    const baseLayer = this.layers[0];
    if (baseLayer && !baseLayer.getState(name)) {
      const state = new AnimationState(name);
      state.setClip(clip);
      baseLayer.addState(state);
    }
  }

  /**
   * Remove an animation clip
   */
  removeClip(name: string): boolean {
    return this.clips.delete(name);
  }

  /**
   * Get clip by name
   */
  getClip(name: string): AnimationClip | undefined {
    return this.clips.get(name);
  }

  /**
   * Add a blend tree
   */
  addBlendTree(name: string, blendTree: BlendTree): void {
    this.blendTrees.set(name, blendTree);
    
    // Create state for blend tree
    const baseLayer = this.layers[0];
    if (baseLayer && !baseLayer.getState(name)) {
      const state = new AnimationState(name);
      state.setBlendTree(blendTree);
      baseLayer.addState(state);
    }
  }

  /**
   * Add an animation layer
   */
  addLayer(name: string, weight: number = 1): AnimationLayer {
    const layer = new AnimationLayer(name);
    layer.weight = weight;
    this.layers.push(layer);
    return layer;
  }

  /**
   * Get layer by name
   */
  getLayer(name: string): AnimationLayer | undefined {
    return this.layers.find(l => l.name === name);
  }

  /**
   * Add a parameter
   */
  addParameter(name: string, type: AnimatorParameterType, defaultValue: number | boolean = 0): void {
    this.parameters.set(name, {
      name,
      type,
      value: defaultValue,
      defaultValue,
    });
  }

  /**
   * Set float parameter
   */
  setFloat(name: string, value: number): void {
    const param = this.parameters.get(name);
    if (param && param.type === AnimatorParameterType.Float) {
      param.value = value;
    }
  }

  /**
   * Get float parameter
   */
  getFloat(name: string): number {
    const param = this.parameters.get(name);
    if (param && param.type === AnimatorParameterType.Float) {
      return param.value as number;
    }
    return 0;
  }

  /**
   * Set integer parameter
   */
  setInt(name: string, value: number): void {
    const param = this.parameters.get(name);
    if (param && param.type === AnimatorParameterType.Int) {
      param.value = Math.floor(value);
    }
  }

  /**
   * Get integer parameter
   */
  getInt(name: string): number {
    const param = this.parameters.get(name);
    if (param && param.type === AnimatorParameterType.Int) {
      return param.value as number;
    }
    return 0;
  }

  /**
   * Set boolean parameter
   */
  setBool(name: string, value: boolean): void {
    const param = this.parameters.get(name);
    if (param && param.type === AnimatorParameterType.Bool) {
      param.value = value;
    }
  }

  /**
   * Get boolean parameter
   */
  getBool(name: string): boolean {
    const param = this.parameters.get(name);
    if (param && param.type === AnimatorParameterType.Bool) {
      return param.value as boolean;
    }
    return false;
  }

  /**
   * Set trigger parameter
   */
  setTrigger(name: string): void {
    const param = this.parameters.get(name);
    if (param && param.type === AnimatorParameterType.Trigger) {
      param.value = true;
    }
  }

  /**
   * Reset trigger parameter
   */
  resetTrigger(name: string): void {
    const param = this.parameters.get(name);
    if (param && param.type === AnimatorParameterType.Trigger) {
      param.value = false;
    }
  }

  /**
   * Set current state
   */
  setState(stateName: string, layerIndex: number = 0): void {
    const layer = this.layers[layerIndex];
    if (!layer) return;
    
    const state = layer.getState(stateName);
    if (!state) return;
    
    // Exit current state
    if (layer.currentState && layer.currentState.onExit) {
      layer.currentState.onExit();
    }
    
    // Set new state
    layer.currentState = state;
    
    // Play the animation
    this.playState(state, layerIndex);
    
    // Enter new state
    if (state.onEnter) {
      state.onEnter();
    }
  }

  /**
   * Get current state name
   */
  getCurrentState(layerIndex: number = 0): string | null {
    const layer = this.layers[layerIndex];
    return layer?.currentState?.name || null;
  }

  /**
   * Play an animation clip directly
   */
  play(clipName: string, crossfadeDuration: number = 0.25): void {
    const clip = this.clips.get(clipName);
    if (!clip || !this.mixer) return;
    
    this.currentClipName = clipName;
    this.crossfadeDuration = crossfadeDuration;
    
    // Get or create Three.js animation clip
    const threeClip = clip.toThreeClip();
    
    // Stop current action
    if (this.currentAction) {
      if (crossfadeDuration > 0) {
        const newAction = this.mixer.clipAction(threeClip);
        newAction.reset();
        newAction.play();
        this.currentAction.crossFadeTo(newAction, crossfadeDuration, true);
        this.currentAction = newAction;
      } else {
        this.currentAction.stop();
        this.currentAction = this.mixer.clipAction(threeClip);
        this.currentAction.play();
      }
    } else {
      this.currentAction = this.mixer.clipAction(threeClip);
      this.currentAction.play();
    }
    
    // Set wrap mode
    if (this.currentAction) {
      switch (clip.wrapMode) {
        case WrapMode.Once:
          this.currentAction.loop = THREE.LoopOnce;
          this.currentAction.clampWhenFinished = true;
          break;
        case WrapMode.Loop:
          this.currentAction.loop = THREE.LoopRepeat;
          break;
        case WrapMode.PingPong:
          this.currentAction.loop = THREE.LoopPingPong;
          break;
        case WrapMode.ClampForever:
          this.currentAction.loop = THREE.LoopOnce;
          this.currentAction.clampWhenFinished = true;
          break;
      }
    }
  }

  /**
   * Play a state
   */
  private playState(state: AnimationState, layerIndex: number): void {
    if (state.clip) {
      this.play(state.clip.name, 0);
    }
  }

  /**
   * Crossfade to another animation
   */
  crossfade(clipName: string, duration: number = 0.25): void {
    this.play(clipName, duration);
  }

  /**
   * Stop current animation
   */
  stop(): void {
    if (this.currentAction) {
      this.currentAction.stop();
      this.currentAction = null;
    }
    this.currentClipName = null;
  }

  /**
   * Pause animation
   */
  pause(): void {
    if (this.currentAction) {
      this.currentAction.paused = true;
    }
  }

  /**
   * Resume animation
   */
  resume(): void {
    if (this.currentAction) {
      this.currentAction.paused = false;
    }
  }

  /**
   * Set playback speed
   */
  setSpeed(speed: number): void {
    this.playbackSpeed = speed;
    if (this.currentAction) {
      this.currentAction.timeScale = speed;
    }
  }

  /**
   * Set animation time (seek)
   */
  setTime(time: number): void {
    if (this.currentAction) {
      this.currentAction.time = time;
    }
  }

  /**
   * Get current animation time
   */
  getTime(): number {
    return this.currentAction?.time || 0;
  }

  /**
   * Get normalized time (0-1)
   */
  getNormalizedTime(): number {
    if (!this.currentAction || !this.currentClipName) return 0;
    
    const clip = this.clips.get(this.currentClipName);
    if (!clip) return 0;
    
    return this.currentAction.time / clip.duration;
  }

  /**
   * Check if animation is playing
   */
  isPlaying(): boolean {
    return this.currentAction !== null && !this.currentAction.paused;
  }

  /**
   * Check if animation has finished
   */
  isFinished(): boolean {
    if (!this.currentAction) return true;
    return this.currentAction.paused && this.currentAction.time >= (this.currentAction.getClip().duration || 0);
  }

  /**
   * Setup IK for the animator
   */
  setupIK(boneMap: HumanoidBoneMap = MixamoBoneMap): void {
    if (!this.skeleton) return;
    
    this.ikSystem = IKSystem.createHumanoidIK(this.skeleton, boneMap);
  }

  /**
   * Set IK target for a limb
   */
  setIKTarget(limbName: string, position: Vector3, weight: number = 1): void {
    if (!this.ikSystem) return;
    
    this.ikSystem.setTwoBoneTarget(limbName, position, weight);
  }

  /**
   * Set IK hint for elbow/knee direction
   */
  setIKHint(limbName: string, position: Vector3): void {
    if (!this.ikSystem) return;
    
    this.ikSystem.setTwoBoneHint(limbName, position);
  }

  /**
   * Set look-at target
   */
  setLookAt(position: Vector3, weight: number = 1): void {
    if (!this.ikSystem) return;
    
    this.ikSystem.setLookAtTarget('head', position, weight);
  }

  /**
   * Set hand IK target
   */
  setHandIKTarget(hand: 'left' | 'right', position: Vector3, rotation: Quaternion, weight: number = 1): void {
    if (!this.ikSystem) return;
    
    this.ikSystem.setHandTarget(`${hand}Hand`, position, rotation, weight);
  }

  /**
   * Set foot IK ground height
   */
  setFootGround(foot: 'left' | 'right', groundHeight: number, weight: number = 1): void {
    if (!this.ikSystem) return;
    
    this.ikSystem.setFootGround(`${foot}Foot`, groundHeight, weight);
  }

  /**
   * Set avatar
   */
  setAvatar(avatar: Avatar): void {
    this.avatar = avatar;
  }

  /**
   * Create avatar from current skeleton
   */
  createAvatar(name: string): Avatar | null {
    if (!this.skeleton) return null;
    
    const avatar = new Avatar(`avatar_${this.id}`, name);
    avatar.setSkeleton(this.skeleton);
    avatar.autoDetectBones();
    avatar.calculateMeasurements();
    
    this.avatar = avatar;
    return avatar;
  }

  /**
   * Update animator
   */
  update(deltaTime: number): void {
    // Update Three.js mixer
    if (this.mixer) {
      this.mixer.update(deltaTime);
    }
    
    // Check transitions
    this.checkTransitions();
    
    // Update IK
    if (this.ikSystem) {
      this.ikSystem.solve(deltaTime);
    }
    
    // Update state callbacks
    for (const layer of this.layers) {
      if (layer.currentState?.onUpdate) {
        layer.currentState.onUpdate(deltaTime);
      }
    }
  }

  /**
   * Check and process transitions
   */
  private checkTransitions(): void {
    for (const layer of this.layers) {
      if (!layer.currentState) continue;
      
      for (const transition of layer.currentState.transitions) {
        if (this.evaluateTransition(transition)) {
          this.startTransition(transition, layer);
          break;
        }
      }
    }
  }

  /**
   * Evaluate transition conditions
   */
  private evaluateTransition(transition: AnimationTransition): boolean {
    // Check exit time first
    if (transition.hasExitTime) {
      const normalizedTime = this.getNormalizedTime();
      if (normalizedTime < transition.exitTime) {
        return false;
      }
    }
    
    // Check all conditions
    for (const condition of transition.conditions) {
      const param = this.parameters.get(condition.parameter);
      if (!param) continue;
      
      let conditionMet = false;
      
      switch (condition.mode) {
        case ConditionMode.Greater:
          conditionMet = (param.value as number) > condition.threshold;
          break;
        case ConditionMode.Less:
          conditionMet = (param.value as number) < condition.threshold;
          break;
        case ConditionMode.Equals:
          conditionMet = param.value === condition.threshold;
          break;
        case ConditionMode.NotEquals:
          conditionMet = param.value !== condition.threshold;
          break;
        case ConditionMode.If:
          conditionMet = param.value === true;
          break;
        case ConditionMode.IfNot:
          conditionMet = param.value === false;
          break;
        case ConditionMode.Trigger:
          conditionMet = param.value === true;
          if (conditionMet) {
            param.value = false; // Auto-reset trigger
          }
          break;
      }
      
      if (!conditionMet) return false;
    }
    
    return true;
  }

  /**
   * Start a transition
   */
  private startTransition(transition: AnimationTransition, layer: AnimationLayer): void {
    const destState = layer.getState(transition.destinationState);
    if (!destState) return;
    
    // Call exit callback
    if (layer.currentState?.onExit) {
      layer.currentState.onExit();
    }
    
    // Transition to new state
    this.setState(transition.destinationState, this.layers.indexOf(layer));
  }

  /**
   * Add transition between states
   */
  addTransition(
    fromState: string,
    toState: string,
    conditions?: TransitionCondition[],
    duration: number = 0.25,
    hasExitTime: boolean = false,
    exitTime: number = 0.9
  ): AnimationTransition | null {
    const layer = this.layers[0];
    const state = layer?.getState(fromState);
    if (!state) return null;
    
    const transition = new AnimationTransition(fromState, toState);
    transition.duration = duration;
    transition.hasExitTime = hasExitTime;
    transition.exitTime = exitTime;
    
    if (conditions) {
      conditions.forEach(c => transition.addCondition(c));
    }
    
    state.addTransition(transition);
    return transition;
  }

  /**
   * Get root motion delta
   */
  getRootMotionDelta(): { position: Vector3; rotation: Quaternion } {
    const delta = { ...this.rootMotionDelta };
    // Reset delta
    this.rootMotionDelta = {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    };
    return delta;
  }

  /**
   * Create a simple animator controller
   */
  static createSimpleController(
    clips: Map<string, AnimationClip>
  ): Animator {
    const animator = new Animator();
    
    // Add all clips
    clips.forEach((clip, name) => {
      animator.addClip(name, clip);
    });
    
    // Set default state
    const firstClip = clips.keys().next().value;
    if (firstClip) {
      animator.layers[0].setDefaultState(firstClip);
    }
    
    return animator;
  }

  /**
   * Create locomotion animator controller
   */
  static createLocomotionController(
    idle: AnimationClip,
    walk: AnimationClip,
    run: AnimationClip
  ): Animator {
    const animator = new Animator();
    
    // Add clips
    animator.addClip('idle', idle);
    animator.addClip('walk', walk);
    animator.addClip('run', run);
    
    // Add parameters
    animator.addParameter('speed', AnimatorParameterType.Float, 0);
    animator.addParameter('jump', AnimatorParameterType.Trigger);
    animator.addParameter('grounded', AnimatorParameterType.Bool, true);
    
    // Create blend tree for locomotion
    const blendTree = BlendTree.createLocomotionTree(idle, walk, run);
    animator.addBlendTree('locomotion', blendTree);
    
    // Create idle state
    const idleState = new AnimationState('idle');
    idleState.setClip(idle);
    animator.layers[0].addState(idleState);
    
    // Create locomotion state
    const locomotionState = new AnimationState('locomotion');
    locomotionState.setBlendTree(blendTree);
    animator.layers[0].addState(locomotionState);
    
    // Add transitions
    idleState.addTransition({
      sourceState: 'idle',
      destinationState: 'locomotion',
      duration: 0.2,
      conditions: [{ parameter: 'speed', mode: ConditionMode.Greater, threshold: 0.1 }],
    } as AnimationTransition);
    
    locomotionState.addTransition({
      sourceState: 'locomotion',
      destinationState: 'idle',
      duration: 0.2,
      conditions: [{ parameter: 'speed', mode: ConditionMode.Less, threshold: 0.1 }],
    } as AnimationTransition);
    
    // Set default state
    animator.layers[0].setDefaultState('idle');
    animator.setState('idle');
    
    return animator;
  }

  /**
   * Serialize animator state
   */
  toJSON(): AnimatorJSON {
    return {
      id: this.id,
      clips: Array.from(this.clips.entries()).map(([name, clip]) => ({
        name,
        clip: clip.toJSON(),
      })),
      parameters: Array.from(this.parameters.entries()).map(([name, param]) => ({
        name,
        type: param.type,
        value: param.value,
      })),
      layers: this.layers.map(layer => ({
        name: layer.name,
        weight: layer.weight,
        defaultState: layer.defaultState,
        currentState: layer.currentState?.name || null,
      })),
      playbackSpeed: this.playbackSpeed,
    };
  }

  /**
   * Restore animator state
   */
  static fromJSON(data: AnimatorJSON): Animator {
    const animator = new Animator(data.id);
    
    animator.playbackSpeed = data.playbackSpeed;
    
    // Restore parameters
    for (const param of data.parameters) {
      animator.addParameter(param.name, param.type as AnimatorParameterType, param.value);
    }
    
    // Note: Clips and layers should be set separately after creation
    
    return animator;
  }
}

/**
 * Animator JSON representation
 */
export interface AnimatorJSON {
  id: string;
  clips: Array<{ name: string; clip: ReturnType<AnimationClip['toJSON']> }>;
  parameters: Array<{ name: string; type: string; value: number | boolean }>;
  layers: Array<{
    name: string;
    weight: number;
    defaultState: string | null;
    currentState: string | null;
  }>;
  playbackSpeed: number;
}

// Import AnimationCurve for type reference
import { AnimationCurve } from './AnimationClip';
