// ============================================
// Input System - Complete Input Framework
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// ============================================

import { EventEmitter } from 'events';
import { inputMap } from './InputMap';
import { inputEventEmitter } from './InputEvent';
import type {
  AxisConfig as ModernAxisConfig,
  BufferedInput as ModernBufferedInput,
  GamepadState as ModernGamepadState,
  InputAction as ModernInputAction,
  InputActionDefinition as ModernInputActionDefinition,
  InputBinding as ModernInputBinding,
  ModifierBinding as ModernModifierBinding,
  ModifierState as ModernModifierState,
  TouchPoint as ModernTouchPoint,
} from './types';

// Key codes
export enum KeyCode {
  // Letters
  A = 'KeyA', B = 'KeyB', C = 'KeyC', D = 'KeyD', E = 'KeyE', F = 'KeyF', G = 'KeyG',
  H = 'KeyH', I = 'KeyI', J = 'KeyJ', K = 'KeyK', L = 'KeyL', M = 'KeyM', N = 'KeyN',
  O = 'KeyO', P = 'KeyP', Q = 'KeyQ', R = 'KeyR', S = 'KeyS', T = 'KeyT', U = 'KeyU',
  V = 'KeyV', W = 'KeyW', X = 'KeyX', Y = 'KeyY', Z = 'KeyZ',
  // Numbers
  Digit0 = 'Digit0', Digit1 = 'Digit1', Digit2 = 'Digit2', Digit3 = 'Digit3',
  Digit4 = 'Digit4', Digit5 = 'Digit5', Digit6 = 'Digit6', Digit7 = 'Digit7',
  Digit8 = 'Digit8', Digit9 = 'Digit9',
  // Numpad
  Numpad0 = 'Numpad0', Numpad1 = 'Numpad1', Numpad2 = 'Numpad2', Numpad3 = 'Numpad3',
  Numpad4 = 'Numpad4', Numpad5 = 'Numpad5', Numpad6 = 'Numpad6', Numpad7 = 'Numpad7',
  Numpad8 = 'Numpad8', Numpad9 = 'Numpad9',
  // Arrows
  ArrowUp = 'ArrowUp', ArrowDown = 'ArrowDown', ArrowLeft = 'ArrowLeft', ArrowRight = 'ArrowRight',
  // Modifiers
  ShiftLeft = 'ShiftLeft', ShiftRight = 'ShiftRight',
  ControlLeft = 'ControlLeft', ControlRight = 'ControlRight',
  AltLeft = 'AltLeft', AltRight = 'AltRight',
  MetaLeft = 'MetaLeft', MetaRight = 'MetaRight',
  // Special
  Space = 'Space', Enter = 'Enter', Escape = 'Escape', Tab = 'Tab',
  Backspace = 'Backspace', Delete = 'Delete', Insert = 'Insert',
  Home = 'Home', End = 'End', PageUp = 'PageUp', PageDown = 'PageDown',
  CapsLock = 'CapsLock', NumLock = 'NumLock',
  // Symbols
  Minus = 'Minus', Equal = 'Equal', BracketLeft = 'BracketLeft', BracketRight = 'BracketRight',
  Backslash = 'Backslash', Semicolon = 'Semicolon', Quote = 'Quote', Comma = 'Comma',
  Period = 'Period', Slash = 'Slash', Backquote = 'Backquote',
  // F keys
  F1 = 'F1', F2 = 'F2', F3 = 'F3', F4 = 'F4', F5 = 'F5', F6 = 'F6',
  F7 = 'F7', F8 = 'F8', F9 = 'F9', F10 = 'F10', F11 = 'F11', F12 = 'F12',
}

// Mouse buttons
export enum MouseButton {
  Left = 0,
  Middle = 1,
  Right = 2,
  Back = 3,
  Forward = 4,
}

// Gamepad buttons
export enum GamepadButton {
  A = 0, B = 1, X = 2, Y = 3,
  LeftBumper = 4, RightBumper = 5,
  LeftTrigger = 6, RightTrigger = 7,
  Select = 8, Start = 9,
  LeftStick = 10, RightStick = 11,
  DPadUp = 12, DPadDown = 13, DPadLeft = 14, DPadRight = 15,
  Home = 16,
}

// Gamepad axes
export enum GamepadAxis {
  LeftX = 0, LeftY = 1,
  RightX = 2, RightY = 3,
}

// Input binding
export interface InputBinding {
  key?: KeyCode;
  mouseButton?: MouseButton;
  gamepadButton?: GamepadButton;
  gamepadAxis?: GamepadAxis;
  axisDirection?: 1 | -1;
  modifiers?: {
    shift?: boolean;
    ctrl?: boolean;
    alt?: boolean;
  };
  deadzone?: number;
  sensitivity?: number;
  invert?: boolean;
}

// Input action
export interface InputAction {
  name: string;
  bindings: InputBinding[];
  value: number;
  justPressed: boolean;
  justReleased: boolean;
  pressed: boolean;
  holdTime: number;
}

// Input events
export interface InputEventData {
  action?: InputAction;
  key?: KeyCode;
  mouseButton?: MouseButton;
  gamepad?: Gamepad;
  gamepadIndex?: number;
  position?: { x: number; y: number };
  delta?: { x: number; y: number };
  scroll?: { x: number; y: number };
  touch?: Touch[];
}

// Action map preset
export interface ActionMapPreset {
  name: string;
  actions: {
    name: string;
    bindings: InputBinding[];
  }[];
}

// Default action maps
export const DEFAULT_ACTION_MAPS: ActionMapPreset[] = [
  {
    name: 'PlayerMovement',
    actions: [
      {
        name: 'moveX',
        bindings: [
          { key: KeyCode.A, axisDirection: -1 },
          { key: KeyCode.D, axisDirection: 1 },
          { key: KeyCode.ArrowLeft, axisDirection: -1 },
          { key: KeyCode.ArrowRight, axisDirection: 1 },
          { gamepadAxis: GamepadAxis.LeftX, deadzone: 0.15 },
        ],
      },
      {
        name: 'moveY',
        bindings: [
          { key: KeyCode.W, axisDirection: 1 },
          { key: KeyCode.S, axisDirection: -1 },
          { key: KeyCode.ArrowUp, axisDirection: 1 },
          { key: KeyCode.ArrowDown, axisDirection: -1 },
          { gamepadAxis: GamepadAxis.LeftY, deadzone: 0.15, invert: true },
        ],
      },
      {
        name: 'jump',
        bindings: [
          { key: KeyCode.Space },
          { gamepadButton: GamepadButton.A },
        ],
      },
      {
        name: 'sprint',
        bindings: [
          { key: KeyCode.ShiftLeft },
          { key: KeyCode.ShiftRight },
          { gamepadButton: GamepadButton.LeftStick },
        ],
      },
      {
        name: 'crouch',
        bindings: [
          { key: KeyCode.ControlLeft },
          { key: KeyCode.ControlRight },
          { gamepadButton: GamepadButton.B },
        ],
      },
    ],
  },
  {
    name: 'Camera',
    actions: [
      {
        name: 'lookX',
        bindings: [
          { gamepadAxis: GamepadAxis.RightX, deadzone: 0.15, sensitivity: 2 },
        ],
      },
      {
        name: 'lookY',
        bindings: [
          { gamepadAxis: GamepadAxis.RightY, deadzone: 0.15, sensitivity: 2, invert: true },
        ],
      },
      {
        name: 'zoom',
        bindings: [
          { gamepadAxis: GamepadAxis.RightY, deadzone: 0.15 },
        ],
      },
    ],
  },
  {
    name: 'Combat',
    actions: [
      {
        name: 'attack',
        bindings: [
          { mouseButton: MouseButton.Left },
          { gamepadButton: GamepadButton.X },
        ],
      },
      {
        name: 'heavyAttack',
        bindings: [
          { mouseButton: MouseButton.Right },
          { gamepadButton: GamepadButton.Y },
        ],
      },
      {
        name: 'block',
        bindings: [
          { mouseButton: MouseButton.Middle },
          { gamepadButton: GamepadButton.LeftBumper },
        ],
      },
      {
        name: 'parry',
        bindings: [
          { key: KeyCode.Q },
          { gamepadButton: GamepadButton.LeftTrigger },
        ],
      },
      {
        name: 'lockTarget',
        bindings: [
          { key: KeyCode.Tab },
          { gamepadButton: GamepadButton.RightBumper },
        ],
      },
      {
        name: 'aim',
        bindings: [
          { mouseButton: MouseButton.Right },
          { gamepadButton: GamepadButton.LeftTrigger },
        ],
      },
      {
        name: 'reload',
        bindings: [
          { key: KeyCode.R },
          { gamepadButton: GamepadButton.Y },
        ],
      },
      {
        name: 'interact',
        bindings: [
          { key: KeyCode.E },
          { gamepadButton: GamepadButton.A },
        ],
      },
    ],
  },
  {
    name: 'UI',
    actions: [
      {
        name: 'confirm',
        bindings: [
          { key: KeyCode.Enter },
          { key: KeyCode.Space },
          { gamepadButton: GamepadButton.A },
        ],
      },
      {
        name: 'cancel',
        bindings: [
          { key: KeyCode.Escape },
          { gamepadButton: GamepadButton.B },
        ],
      },
      {
        name: 'pause',
        bindings: [
          { key: KeyCode.Escape },
          { gamepadButton: GamepadButton.Start },
        ],
      },
      {
        name: 'inventory',
        bindings: [
          { key: KeyCode.I },
          { key: KeyCode.Tab },
          { gamepadButton: GamepadButton.Select },
        ],
      },
    ],
  },
];

// ============================================
// Input Manager
// ============================================
export class InputManager extends EventEmitter {
  private static instance: InputManager;
  private static readonly STORAGE_KEY = 'rey30.input.bindings.v1';
  private static readonly DEFAULT_DELTA_TIME = 1 / 60;
  private static lastUpdateAt = 0;
  static readonly map = inputMap;
  static readonly events = inputEventEmitter;
  
  // State
  private keyStates: Map<string, { pressed: boolean; holdTime: number }>;
  private mouseStates: Map<number, { pressed: boolean; holdTime: number }>;
  private _mousePosition: { x: number; y: number };
  private _mouseDelta: { x: number; y: number };
  private _scrollDelta: { x: number; y: number };
  private gamepads: Map<number, Gamepad>;
  private gamepadButtonStates: Map<number, boolean[]>;
  private touches: Map<number, ModernTouchPoint>;
  
  // Actions
  private actions: Map<string, InputAction>;
  private actionMaps: Map<string, ActionMapPreset>;
  
  // Settings
  private enabled: boolean;
  private initialized: boolean;
  private pointerLocked: boolean;
  private targetElement: HTMLElement | null;
  
  // Input buffer for fighting games
  private inputBuffer: { action: string; time: number }[];
  private bufferWindow: number = 150; // ms

  private constructor() {
    super();
    
    this.keyStates = new Map();
    this.mouseStates = new Map();
    this._mousePosition = { x: 0, y: 0 };
    this._mouseDelta = { x: 0, y: 0 };
    this._scrollDelta = { x: 0, y: 0 };
    this.gamepads = new Map();
    this.gamepadButtonStates = new Map();
    this.touches = new Map();
    this.actions = new Map();
    this.actionMaps = new Map();
    this.enabled = true;
    this.initialized = false;
    this.pointerLocked = false;
    this.targetElement = null;
    this.inputBuffer = [];
    
    // Load default action maps
    this.loadActionMaps(DEFAULT_ACTION_MAPS);
    this.syncInputMap();
    this.loadBindingsFromStorage();
  }

  static getInstance(): InputManager {
    if (!InputManager.instance) {
      InputManager.instance = new InputManager();
    }
    return InputManager.instance;
  }

  // Static facade for hooks/UI
  static initialize(element?: HTMLElement | null): void {
    this.getInstance().initialize(element ?? undefined);
  }

  static shutdown(): void {
    this.getInstance().dispose();
    InputManager.lastUpdateAt = 0;
  }

  static update(deltaTime?: number): void {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const last = InputManager.lastUpdateAt || now;
    InputManager.lastUpdateAt = now;
    const fallbackDelta = (now - last) / 1000 || InputManager.DEFAULT_DELTA_TIME;
    this.getInstance().update(deltaTime ?? fallbackDelta);
  }

  static getAction(name: string): ModernInputAction {
    return this.getInstance().toModernAction(this.getInstance().getAction(name), name);
  }

  static getActionValue(name: string): number {
    return this.getAction(name).value;
  }

  static getKey(keyCode: string): boolean {
    return this.getInstance().getKey(keyCode);
  }

  static getKeyDown(keyCode: string): boolean {
    return this.getInstance().getKeyDown(keyCode);
  }

  static getKeyUp(keyCode: string): boolean {
    return this.getInstance().getKeyUp(keyCode);
  }

  static getMouseButton(button: MouseButton): boolean {
    return this.getInstance().getMouseButton(button);
  }

  static getMouseButtonDown(button: MouseButton): boolean {
    return this.getInstance().getMouseButtonDown(button);
  }

  static getMouseButtonUp(button: MouseButton): boolean {
    return this.getInstance().getMouseButtonUp(button);
  }

  static get mousePosition(): { x: number; y: number } {
    return this.getInstance().mousePosition;
  }

  static get mouseDelta(): { x: number; y: number } {
    return this.getInstance().mouseDelta;
  }

  static get scrollDelta(): { x: number; y: number } {
    return this.getInstance().scrollDelta;
  }

  static get isPointerLocked(): boolean {
    return this.getInstance().isPointerLocked();
  }

  static get modifiers(): ModernModifierState {
    return this.getInstance().getModifiers();
  }

  static get touchCount(): number {
    return this.getInstance().touches.size;
  }

  static getTouches(): ModernTouchPoint[] {
    return this.getInstance().getTouches();
  }

  static getGamepad(index: number): ModernGamepadState | undefined {
    return this.getInstance().getGamepadState(index);
  }

  static get gamepadCount(): number {
    return this.getInstance().gamepads.size;
  }

  static getBufferedInput(actionName: string): ModernBufferedInput | null {
    return this.getInstance().getBufferedInput(actionName);
  }

  static consumeBufferedInput(actionName: string): ModernBufferedInput | null {
    return this.getInstance().consumeBufferedInput(actionName);
  }

  static saveBindings(): string {
    const json = this.getInstance().saveBindings();
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(InputManager.STORAGE_KEY, json);
    }
    return json;
  }

  static resetBindings(): void {
    this.getInstance().resetBindings();
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(InputManager.STORAGE_KEY);
    }
  }

  static clearTransientState(): void {
    this.getInstance().clearTransientState();
    InputManager.lastUpdateAt = 0;
  }

  // Initialize
  initialize(element?: HTMLElement): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    this.targetElement = element || document.body;
    if (this.initialized) {
      return;
    }
    
    // Keyboard events
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    
    // Mouse events
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('wheel', this.onWheel);
    window.addEventListener('contextmenu', this.onContextMenu);
    
    // Pointer lock
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    
    // Gamepad events
    window.addEventListener('gamepadconnected', this.onGamepadConnected);
    window.addEventListener('gamepaddisconnected', this.onGamepadDisconnected);
    
    // Touch events
    window.addEventListener('touchstart', this.onTouchStart);
    window.addEventListener('touchend', this.onTouchEnd);
    window.addEventListener('touchmove', this.onTouchMove);
    this.initialized = true;
  }

  // Cleanup
  dispose(): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      this.initialized = false;
      this.targetElement = null;
      this.clearTransientState();
      return;
    }

    if (!this.initialized) {
      this.targetElement = null;
      this.clearTransientState();
      return;
    }

    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('contextmenu', this.onContextMenu);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    window.removeEventListener('gamepadconnected', this.onGamepadConnected);
    window.removeEventListener('gamepaddisconnected', this.onGamepadDisconnected);
    window.removeEventListener('touchstart', this.onTouchStart);
    window.removeEventListener('touchend', this.onTouchEnd);
    window.removeEventListener('touchmove', this.onTouchMove);
    this.initialized = false;
    this.targetElement = null;
    this.clearTransientState();
  }

  // Update
  update(deltaTime: number): void {
    if (!this.enabled) return;

    // Update key hold times
    this.keyStates.forEach((state) => {
      if (state.pressed) {
        state.holdTime += deltaTime;
      }
    });

    // Update mouse hold times
    this.mouseStates.forEach((state) => {
      if (state.pressed) {
        state.holdTime += deltaTime;
      }
    });

    // Update gamepads
    this.updateGamepads();

    // Update actions
    this.updateActions(deltaTime);

    // Clear frame deltas
    this._mouseDelta = { x: 0, y: 0 };
    this._scrollDelta = { x: 0, y: 0 };

    // Clear input buffer old entries
    const now = performance.now();
    this.inputBuffer = this.inputBuffer.filter(entry => now - entry.time < this.bufferWindow);
  }

  // Keyboard handlers
  private onKeyDown = (e: KeyboardEvent): void => {
    if (!this.enabled) return;
    
    const state = this.keyStates.get(e.code);
    if (!state?.pressed) {
      this.keyStates.set(e.code, { pressed: true, holdTime: 0 });
      
      this.emit('keyDown', { key: e.code as KeyCode } as InputEventData);
      this.emit(`keyDown:${e.code}`, { key: e.code as KeyCode } as InputEventData);
      inputEventEmitter.emitKeyboardEvent({
        timestamp: performance.now(),
        deviceType: 'keyboard',
        type: 'keydown',
        code: e.code as unknown as import('./KeyCode').KeyCode,
        key: e.key,
        modifiers: this.getModifiers(),
        repeat: e.repeat,
      });
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (!this.enabled) return;
    
    this.keyStates.set(e.code, { pressed: false, holdTime: 0 });
    
    this.emit('keyUp', { key: e.code as KeyCode } as InputEventData);
    this.emit(`keyUp:${e.code}`, { key: e.code as KeyCode } as InputEventData);
    inputEventEmitter.emitKeyboardEvent({
      timestamp: performance.now(),
      deviceType: 'keyboard',
      type: 'keyup',
      code: e.code as unknown as import('./KeyCode').KeyCode,
      key: e.key,
      modifiers: this.getModifiers(),
      repeat: false,
    });
  };

  // Mouse handlers
  private onMouseDown = (e: MouseEvent): void => {
    if (!this.enabled) return;
    
    this.mouseStates.set(e.button, { pressed: true, holdTime: 0 });
    
    this.emit('mouseDown', { 
      mouseButton: e.button as MouseButton,
      position: { x: e.clientX, y: e.clientY }
    } as InputEventData);
    inputEventEmitter.emitMouseEvent({
      timestamp: performance.now(),
      deviceType: 'mouse',
      type: 'mousedown',
      button: e.button as unknown as import('./KeyCode').MouseButton,
      position: { x: e.clientX, y: e.clientY },
      delta: { x: 0, y: 0 },
      modifiers: this.getModifiers(),
    });
  };

  private onMouseUp = (e: MouseEvent): void => {
    if (!this.enabled) return;
    
    this.mouseStates.set(e.button, { pressed: false, holdTime: 0 });
    
    this.emit('mouseUp', { 
      mouseButton: e.button as MouseButton,
      position: { x: e.clientX, y: e.clientY }
    } as InputEventData);
    inputEventEmitter.emitMouseEvent({
      timestamp: performance.now(),
      deviceType: 'mouse',
      type: 'mouseup',
      button: e.button as unknown as import('./KeyCode').MouseButton,
      position: { x: e.clientX, y: e.clientY },
      delta: { x: 0, y: 0 },
      modifiers: this.getModifiers(),
    });
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.enabled) return;
    
    this._mouseDelta.x += e.movementX || 0;
    this._mouseDelta.y += e.movementY || 0;
    this._mousePosition = { x: e.clientX, y: e.clientY };
    
    this.emit('mouseMove', { 
      position: { x: e.clientX, y: e.clientY },
      delta: { x: e.movementX || 0, y: e.movementY || 0 }
    } as InputEventData);
    inputEventEmitter.emitMouseEvent({
      timestamp: performance.now(),
      deviceType: 'mouse',
      type: 'mousemove',
      position: { x: e.clientX, y: e.clientY },
      delta: { x: e.movementX || 0, y: e.movementY || 0 },
      modifiers: this.getModifiers(),
    });
  };

  private onWheel = (e: WheelEvent): void => {
    if (!this.enabled) return;
    
    this._scrollDelta.x += e.deltaX;
    this._scrollDelta.y += e.deltaY;
    
    this.emit('scroll', { 
      scroll: { x: e.deltaX, y: e.deltaY },
      position: { x: e.clientX, y: e.clientY }
    } as InputEventData);
    inputEventEmitter.emitMouseEvent({
      timestamp: performance.now(),
      deviceType: 'mouse',
      type: 'scroll',
      position: { x: e.clientX, y: e.clientY },
      delta: { x: 0, y: 0 },
      scrollDelta: { x: e.deltaX, y: e.deltaY },
      modifiers: this.getModifiers(),
    });
  };

  private onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
  };

  private onPointerLockChange = (): void => {
    this.pointerLocked = document.pointerLockElement === this.targetElement;
    this.emit('pointerLockChange', { pointerLocked: this.pointerLocked });
  };

  // Gamepad handlers
  private onGamepadConnected = (e: GamepadEvent): void => {
    this.gamepads.set(e.gamepad.index, e.gamepad);
    this.gamepadButtonStates.set(e.gamepad.index, e.gamepad.buttons.map((button) => button.pressed));
    this.emit('gamepadConnected', { gamepad: e.gamepad, gamepadIndex: e.gamepad.index });
    inputEventEmitter.emitGamepadEvent({
      timestamp: performance.now(),
      deviceType: 'gamepad',
      type: 'gamepadconnected',
      gamepadIndex: e.gamepad.index,
      gamepadId: e.gamepad.id,
    });
  };

  private onGamepadDisconnected = (e: GamepadEvent): void => {
    this.gamepads.delete(e.gamepad.index);
    this.gamepadButtonStates.delete(e.gamepad.index);
    this.emit('gamepadDisconnected', { gamepad: e.gamepad, gamepadIndex: e.gamepad.index });
    inputEventEmitter.emitGamepadEvent({
      timestamp: performance.now(),
      deviceType: 'gamepad',
      type: 'gamepaddisconnected',
      gamepadIndex: e.gamepad.index,
      gamepadId: e.gamepad.id,
    });
  };

  private updateGamepads(): void {
    const gamepads = navigator.getGamepads();
    for (let i = 0; i < gamepads.length; i++) {
      const gp = gamepads[i];
      if (gp) {
        const prevButtons = this.gamepadButtonStates.get(i) ?? gp.buttons.map(() => false);
        gp.buttons.forEach((button, buttonIndex) => {
          const wasPressed = prevButtons[buttonIndex] ?? false;
          const isPressed = button.pressed;
          if (isPressed && !wasPressed) {
            inputEventEmitter.emitGamepadEvent({
              timestamp: performance.now(),
              deviceType: 'gamepad',
              type: 'buttondown',
              gamepadIndex: i,
              gamepadId: gp.id,
              button: buttonIndex,
              buttonValue: button.value,
            });
          } else if (!isPressed && wasPressed) {
            inputEventEmitter.emitGamepadEvent({
              timestamp: performance.now(),
              deviceType: 'gamepad',
              type: 'buttonup',
              gamepadIndex: i,
              gamepadId: gp.id,
              button: buttonIndex,
              buttonValue: button.value,
            });
          }
          prevButtons[buttonIndex] = isPressed;
        });
        this.gamepadButtonStates.set(i, prevButtons);
        this.gamepads.set(i, gp);
      }
    }
  }

  // Touch handlers
  private onTouchStart = (e: TouchEvent): void => {
    if (!this.enabled) return;
    const changedTouches = this.updateTouches(e.changedTouches, 'began');
    this.emit('touchStart', { touch: Array.from(e.touches) });
    inputEventEmitter.emitTouchEvent({
      timestamp: performance.now(),
      deviceType: 'touch',
      type: 'touchstart',
      touches: this.getTouches(),
      changedTouches,
    });
  };

  private onTouchEnd = (e: TouchEvent): void => {
    if (!this.enabled) return;
    const changedTouches = this.updateTouches(e.changedTouches, 'ended');
    changedTouches.forEach((touch) => this.touches.delete(touch.identifier));
    this.emit('touchEnd', { touch: Array.from(e.touches) });
    inputEventEmitter.emitTouchEvent({
      timestamp: performance.now(),
      deviceType: 'touch',
      type: 'touchend',
      touches: this.getTouches(),
      changedTouches,
    });
  };

  private onTouchMove = (e: TouchEvent): void => {
    if (!this.enabled) return;
    const changedTouches = this.updateTouches(e.changedTouches, 'moved');
    this.emit('touchMove', { touch: Array.from(e.touches) });
    inputEventEmitter.emitTouchEvent({
      timestamp: performance.now(),
      deviceType: 'touch',
      type: 'touchmove',
      touches: this.getTouches(),
      changedTouches,
    });
  };

  // Action management
  private updateActions(deltaTime: number): void {
    this.actions.forEach((action) => {
      let wasPressed = action.pressed;
      action.value = 0;
      action.pressed = false;

      for (const binding of action.bindings) {
        // Check key binding
        if (binding.key) {
          const state = this.keyStates.get(binding.key);
          if (state?.pressed) {
            // Check modifiers
            if (binding.modifiers) {
              const shift = this.getKey(KeyCode.ShiftLeft) || this.getKey(KeyCode.ShiftRight);
              const ctrl = this.getKey(KeyCode.ControlLeft) || this.getKey(KeyCode.ControlRight);
              const alt = this.getKey(KeyCode.AltLeft) || this.getKey(KeyCode.AltRight);

              if (binding.modifiers.shift && !shift) continue;
              if (binding.modifiers.ctrl && !ctrl) continue;
              if (binding.modifiers.alt && !alt) continue;
            }

            action.pressed = true;
            action.value = binding.axisDirection ?? 1;
            action.holdTime = state.holdTime;
          }
        }

        // Check mouse binding
        if (binding.mouseButton !== undefined) {
          const state = this.mouseStates.get(binding.mouseButton);
          if (state?.pressed) {
            action.pressed = true;
            action.value = 1;
            action.holdTime = state.holdTime;
          }
        }

        // Check gamepad binding
        if (binding.gamepadButton !== undefined) {
          for (const [, gamepad] of this.gamepads) {
            const button = gamepad.buttons[binding.gamepadButton];
            if (button?.pressed) {
              action.pressed = true;
              action.value = button.value;
            }
          }
        }

        // Check gamepad axis
        if (binding.gamepadAxis !== undefined) {
          for (const [, gamepad] of this.gamepads) {
            let axisValue = gamepad.axes[binding.gamepadAxis] || 0;
            
            // Apply deadzone
            const deadzone = binding.deadzone ?? 0.15;
            if (Math.abs(axisValue) < deadzone) {
              axisValue = 0;
            } else {
              axisValue = axisValue > 0 
                ? (axisValue - deadzone) / (1 - deadzone)
                : (axisValue + deadzone) / (1 - deadzone);
            }

            // Apply invert
            if (binding.invert) {
              axisValue = -axisValue;
            }

            // Apply sensitivity
            const sensitivity = binding.sensitivity ?? 1;
            axisValue *= sensitivity;

            // Apply direction
            if (binding.axisDirection) {
              axisValue *= binding.axisDirection;
            }

            if (Math.abs(axisValue) > Math.abs(action.value)) {
              action.value = axisValue;
              action.pressed = Math.abs(axisValue) > 0.1;
            }
          }
        }
      }

      // Update state flags
      action.justPressed = action.pressed && !wasPressed;
      action.justReleased = !action.pressed && wasPressed;

      // Add to input buffer
      if (action.justPressed) {
        this.inputBuffer.push({ action: action.name, time: performance.now() });
        this.emit(`action:${action.name}`, action);
        inputEventEmitter.emitActionEvent({
          timestamp: performance.now(),
          deviceType: 'keyboard',
          type: 'actionstarted',
          action: this.toModernAction(action, action.name),
        });
      } else if (action.pressed) {
        inputEventEmitter.emitActionEvent({
          timestamp: performance.now(),
          deviceType: 'keyboard',
          type: 'actionperformed',
          action: this.toModernAction(action, action.name),
        });
      } else if (action.justReleased) {
        inputEventEmitter.emitActionEvent({
          timestamp: performance.now(),
          deviceType: 'keyboard',
          type: 'actioncanceled',
          action: this.toModernAction(action, action.name),
        });
      }

      InputManager.map.updateActionState(action.name, this.toModernAction(action, action.name));
    });
  }

  // Public API
  loadActionMaps(maps: ActionMapPreset[]): void {
    maps.forEach(map => {
      this.actionMaps.set(map.name, map);
      map.actions.forEach(actionDef => {
        this.actions.set(actionDef.name, {
          name: actionDef.name,
          bindings: actionDef.bindings,
          value: 0,
          justPressed: false,
          justReleased: false,
          pressed: false,
          holdTime: 0,
        });
      });
    });
    this.syncInputMap();
  }

  getAction(name: string): InputAction | undefined {
    return this.actions.get(name);
  }

  addAction(name: string, bindings: InputBinding[]): void {
    this.actions.set(name, {
      name,
      bindings,
      value: 0,
      justPressed: false,
      justReleased: false,
      pressed: false,
      holdTime: 0,
    });
    this.syncInputMap();
  }

  removeAction(name: string): void {
    this.actions.delete(name);
    this.syncInputMap();
  }

  rebindAction(actionName: string, bindingIndex: number, newBinding: InputBinding): void {
    const action = this.actions.get(actionName);
    if (action && bindingIndex < action.bindings.length) {
      action.bindings[bindingIndex] = newBinding;
      this.syncInputMap();
    }
  }

  // Direct input queries
  getKey(keyCode: string): boolean {
    return this.keyStates.get(keyCode)?.pressed ?? false;
  }

  getKeyDown(keyCode: string): boolean {
    const state = this.keyStates.get(keyCode);
    return state?.pressed === true && state.holdTime === 0;
  }

  getKeyUp(keyCode: string): boolean {
    const state = this.keyStates.get(keyCode);
    return state?.pressed === false && state.holdTime === 0;
  }

  getKeyHoldTime(keyCode: string): number {
    return this.keyStates.get(keyCode)?.holdTime ?? 0;
  }

  getMouseButton(button: MouseButton): boolean {
    return this.mouseStates.get(button)?.pressed ?? false;
  }

  getMouseButtonDown(button: MouseButton): boolean {
    const state = this.mouseStates.get(button);
    return state?.pressed === true && state.holdTime === 0;
  }

  getMouseButtonUp(button: MouseButton): boolean {
    const state = this.mouseStates.get(button);
    return state?.pressed === false && state.holdTime === 0;
  }

  get mousePosition(): { x: number; y: number } {
    return { ...this._mousePosition };
  }

  get mouseDelta(): { x: number; y: number } {
    return { ...this._mouseDelta };
  }

  get scrollDelta(): { x: number; y: number } {
    return { ...this._scrollDelta };
  }

  getGamepad(index: number): Gamepad | undefined {
    return this.gamepads.get(index);
  }

  getGamepadState(index: number): ModernGamepadState | undefined {
    const gamepad = this.gamepads.get(index);
    if (!gamepad) return undefined;

    return {
      id: gamepad.id,
      index: gamepad.index,
      buttons: gamepad.buttons.map((button) => ({
        value: button.value,
        pressed: button.pressed,
        justPressed: false,
        justReleased: false,
      })),
      axes: [...gamepad.axes],
      connected: gamepad.connected,
      timestamp: gamepad.timestamp,
    };
  }

  getGamepadButton(index: number, button: GamepadButton): boolean {
    const gamepad = this.gamepads.get(index);
    return gamepad?.buttons[button]?.pressed ?? false;
  }

  getGamepadAxis(index: number, axis: GamepadAxis): number {
    const gamepad = this.gamepads.get(index);
    return gamepad?.axes[axis] ?? 0;
  }

  // Input buffer for fighting games
  get bufferedInputs(): { action: string; time: number }[] {
    return [...this.inputBuffer];
  }

  wasActionBuffered(actionName: string): boolean {
    return this.inputBuffer.some(entry => entry.action === actionName);
  }

  getBufferedInput(actionName: string): ModernBufferedInput | null {
    const found = this.inputBuffer.find((entry) => entry.action === actionName);
    if (!found) return null;
    return {
      action: found.action,
      timestamp: found.time,
      value: this.getAction(actionName)?.value ?? 1,
      duration: this.bufferWindow,
      consumed: false,
    };
  }

  consumeBufferedInput(actionName: string): ModernBufferedInput | null {
    const index = this.inputBuffer.findIndex((entry) => entry.action === actionName);
    if (index < 0) return null;
    const [entry] = this.inputBuffer.splice(index, 1);
    return {
      action: entry.action,
      timestamp: entry.time,
      value: this.getAction(actionName)?.value ?? 1,
      duration: this.bufferWindow,
      consumed: true,
    };
  }

  // Pointer lock
  requestPointerLock(): void {
    this.targetElement?.requestPointerLock();
  }

  exitPointerLock(): void {
    document.exitPointerLock();
  }

  isPointerLocked(): boolean {
    return this.pointerLocked;
  }

  // Enable/disable
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getTouches(): ModernTouchPoint[] {
    return Array.from(this.touches.values()).map((touch) => ({
      ...touch,
      position: { ...touch.position },
      startPosition: { ...touch.startPosition },
      delta: { ...touch.delta },
    }));
  }

  resetBindings(): void {
    this.actions.clear();
    this.actionMaps.clear();
    this.loadActionMaps(DEFAULT_ACTION_MAPS);
    this.syncInputMap();
  }

  clearTransientState(): void {
    this.keyStates.clear();
    this.mouseStates.clear();
    this.gamepads.clear();
    this.gamepadButtonStates.clear();
    this.touches.clear();
    this.inputBuffer = [];
    this._mouseDelta = { x: 0, y: 0 };
    this._scrollDelta = { x: 0, y: 0 };
    this.pointerLocked = false;
    this.actions.forEach((action) => {
      action.value = 0;
      action.justPressed = false;
      action.justReleased = false;
      action.pressed = false;
      action.holdTime = 0;
      InputManager.map.updateActionState(action.name, this.toModernAction(action, action.name));
    });
  }

  // Save/load bindings
  saveBindings(): string {
    this.syncLegacyFromInputMap();
    const bindings: Record<string, InputBinding[]> = {};
    this.actions.forEach((action, name) => {
      bindings[name] = action.bindings;
    });
    return JSON.stringify(bindings);
  }

  loadBindings(json: string): void {
    try {
      const bindings = JSON.parse(json);
      Object.entries(bindings).forEach(([name, bindingList]) => {
        const action = this.actions.get(name);
        if (action) {
          action.bindings = bindingList as InputBinding[];
        }
      });
      this.syncInputMap();
    } catch (e) {
      console.error('Failed to load bindings:', e);
    }
  }

  private getModifiers(): ModernModifierState {
    return {
      shift: this.getKey(KeyCode.ShiftLeft) || this.getKey(KeyCode.ShiftRight),
      control: this.getKey(KeyCode.ControlLeft) || this.getKey(KeyCode.ControlRight),
      alt: this.getKey(KeyCode.AltLeft) || this.getKey(KeyCode.AltRight),
      meta: this.getKey(KeyCode.MetaLeft) || this.getKey(KeyCode.MetaRight),
    };
  }

  private toModernAction(action: InputAction | undefined, name: string): ModernInputAction {
    if (!action) {
      return {
        name,
        active: false,
        justPressed: false,
        justReleased: false,
        value: 0,
        rawValue: 0,
        duration: 0,
      };
    }

    return {
      name: action.name,
      active: action.pressed,
      justPressed: action.justPressed,
      justReleased: action.justReleased,
      value: action.value,
      rawValue: action.value,
      duration: action.holdTime,
    };
  }

  private syncInputMap(): void {
    InputManager.map.clear();

    const categoryByAction = new Map<string, string>();
    this.actionMaps.forEach((map) => {
      map.actions.forEach((action) => {
        categoryByAction.set(action.name, map.name);
      });
    });

    this.actions.forEach((action, actionName) => {
      const modernBindings = action.bindings.map((binding, index) =>
        this.toModernBinding(actionName, binding, index)
      );

      const definition: ModernInputActionDefinition = {
        name: actionName,
        displayName: this.humanizeActionName(actionName),
        description: undefined,
        bindings: modernBindings.map((binding) => ({ ...binding })),
        defaultBindings: modernBindings.map((binding) => ({ ...binding, id: `${binding.id}-default` })),
        category: categoryByAction.get(actionName) ?? 'General',
        isAxis: modernBindings.some((binding) => Boolean(binding.axisConfig)),
      };

      InputManager.map.registerAction(definition);
      InputManager.map.updateActionState(actionName, this.toModernAction(action, actionName));
    });
  }

  private toModernBinding(actionName: string, binding: InputBinding, index: number): ModernInputBinding {
    const id = `${actionName}-${index}`;
    const modifiers = this.toModernModifiers(binding.modifiers);

    if (binding.key) {
      return {
        id,
        deviceType: 'keyboard',
        input: binding.key as unknown as import('./KeyCode').KeyCode,
        enabled: true,
        modifiers,
      };
    }

    if (binding.mouseButton !== undefined) {
      return {
        id,
        deviceType: 'mouse',
        input: binding.mouseButton as unknown as import('./KeyCode').MouseButton,
        enabled: true,
        modifiers,
      };
    }

    if (binding.gamepadAxis !== undefined) {
      return {
        id,
        deviceType: 'gamepad',
        input: binding.gamepadAxis as unknown as import('./KeyCode').GamepadAxis,
        enabled: true,
        axisConfig: {
          deadZone: binding.deadzone ?? 0.15,
          sensitivity: binding.sensitivity ?? 1.0,
          invert: binding.invert ?? false,
          mode: 'analog',
        },
      };
    }

    return {
      id,
      deviceType: 'gamepad',
      input: (binding.gamepadButton ?? GamepadButton.A) as unknown as import('./KeyCode').GamepadButton,
      enabled: true,
      modifiers,
    };
  }

  private syncLegacyFromInputMap(): void {
    const definitions = InputManager.map.getAllActionDefinitions();
    definitions.forEach((definition) => {
      const legacyBindings = definition.bindings.map((binding) => this.fromModernBinding(binding));
      const action = this.actions.get(definition.name);
      if (action) {
        action.bindings = legacyBindings;
      } else {
        this.addAction(definition.name, legacyBindings);
      }
    });
  }

  private fromModernBinding(binding: ModernInputBinding): InputBinding {
    const modifiers = this.fromModernModifiers(binding.modifiers);
    if (binding.deviceType === 'keyboard') {
      return {
        key: binding.input as unknown as KeyCode,
        modifiers,
      };
    }
    if (binding.deviceType === 'mouse') {
      return {
        mouseButton: binding.input as unknown as MouseButton,
      };
    }
    if (binding.deviceType === 'gamepad' && binding.axisConfig) {
      return {
        gamepadAxis: binding.input as unknown as GamepadAxis,
        deadzone: binding.axisConfig.deadZone,
        sensitivity: binding.axisConfig.sensitivity,
        invert: binding.axisConfig.invert,
      };
    }
    if (binding.deviceType === 'gamepad') {
      return {
        gamepadButton: binding.input as unknown as GamepadButton,
      };
    }
    return { key: KeyCode.Space };
  }

  private toModernModifiers(modifiers?: InputBinding['modifiers']): ModernModifierBinding[] | undefined {
    if (!modifiers) return undefined;
    const output: ModernModifierBinding[] = [];
    if (modifiers.shift) output.push({ type: 'shift', required: true });
    if (modifiers.ctrl) output.push({ type: 'control', required: true });
    if (modifiers.alt) output.push({ type: 'alt', required: true });
    return output.length > 0 ? output : undefined;
  }

  private fromModernModifiers(modifiers?: ModernModifierBinding[]): InputBinding['modifiers'] | undefined {
    if (!modifiers || modifiers.length === 0) return undefined;
    const output: NonNullable<InputBinding['modifiers']> = {};
    modifiers.forEach((modifier) => {
      if (!modifier.required) return;
      if (modifier.type === 'shift') output.shift = true;
      if (modifier.type === 'control') output.ctrl = true;
      if (modifier.type === 'alt') output.alt = true;
    });
    return output;
  }

  private humanizeActionName(name: string): string {
    return name
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  private loadBindingsFromStorage(): void {
    if (typeof window === 'undefined') return;
    const serialized = window.localStorage.getItem(InputManager.STORAGE_KEY);
    if (serialized) {
      this.loadBindings(serialized);
    }
  }

  private updateTouches(list: TouchList, phase: ModernTouchPoint['phase']): ModernTouchPoint[] {
    const changed: ModernTouchPoint[] = [];
    for (let i = 0; i < list.length; i++) {
      const touch = list.item(i);
      if (!touch) continue;
      const existing = this.touches.get(touch.identifier);
      const point: ModernTouchPoint = {
        identifier: touch.identifier,
        position: { x: touch.clientX, y: touch.clientY },
        startPosition: existing?.startPosition ?? { x: touch.clientX, y: touch.clientY },
        delta: existing
          ? { x: touch.clientX - existing.position.x, y: touch.clientY - existing.position.y }
          : { x: 0, y: 0 },
        startTime: existing?.startTime ?? performance.now(),
        phase,
      };
      if (phase === 'ended' || phase === 'canceled') {
        changed.push(point);
      } else {
        this.touches.set(touch.identifier, point);
        changed.push(point);
      }
    }
    return changed;
  }
}

// Export singleton
export const inputManager = InputManager.getInstance();
