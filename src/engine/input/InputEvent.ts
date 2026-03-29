// ============================================
// InputEvent - Event System
// REY30 3D Engine - Input System
// ============================================

import {
  KeyboardInputEvent,
  MouseInputEvent,
  GamepadInputEvent,
  TouchInputEvent,
  ActionInputEvent,
  InputEvent,
  KeyboardEventCallback,
  MouseEventCallback,
  GamepadEventCallback,
  TouchEventCallback,
  ActionEventCallback,
  InputEventCallback,
  ModifierState,
  Vector2,
} from './types';
import { KeyCode, MouseButton } from './KeyCode';

/**
 * Event emitter for input events.
 * Provides a pub/sub system for all input-related events.
 * 
 * @example
 * ```typescript
 * const inputEvents = new InputEventEmitter();
 * 
 * // Subscribe to keyboard events
 * inputEvents.onKeyDown((event) => {
 *   console.log('Key pressed:', event.code);
 * });
 * 
 * // Subscribe to action events
 * inputEvents.onAction('jump', (action) => {
 *   if (action.justPressed) player.jump();
 * });
 * ```
 */
export class InputEventEmitter {
  private keyboardListeners: Map<string, Set<KeyboardEventCallback>> = new Map();
  private mouseListeners: Map<string, Set<MouseEventCallback>> = new Map();
  private gamepadListeners: Map<string, Set<GamepadEventCallback>> = new Map();
  private touchListeners: Map<string, Set<TouchEventCallback>> = new Map();
  private actionListeners: Map<string, Set<ActionEventCallback>> = new Map();
  private globalListeners: Set<InputEventCallback> = new Set();

  // ============================================
  // Keyboard Events
  // ============================================

  /**
   * Subscribe to key down events
   */
  onKeyDown(callback: KeyboardEventCallback): () => void {
    return this.addKeyboardListener('keydown', callback);
  }

  /**
   * Subscribe to key up events
   */
  onKeyUp(callback: KeyboardEventCallback): () => void {
    return this.addKeyboardListener('keyup', callback);
  }

  /**
   * Subscribe to key pressed events (fires each frame while held)
   */
  onKeyPressed(callback: KeyboardEventCallback): () => void {
    return this.addKeyboardListener('keypressed', callback);
  }

  /**
   * Subscribe to a specific key down event
   */
  onKey(code: KeyCode, callback: KeyboardEventCallback, eventType: 'down' | 'up' | 'pressed' = 'down'): () => void {
    const wrapper: KeyboardEventCallback = (event) => {
      if (event.code === code) {
        callback(event);
      }
    };
    
    const eventTypeMap = {
      down: 'keydown',
      up: 'keyup',
      pressed: 'keypressed',
    };
    
    return this.addKeyboardListener(eventTypeMap[eventType], wrapper);
  }

  // ============================================
  // Mouse Events
  // ============================================

  /**
   * Subscribe to mouse down events
   */
  onMouseDown(callback: MouseEventCallback): () => void {
    return this.addMouseListener('mousedown', callback);
  }

  /**
   * Subscribe to mouse up events
   */
  onMouseUp(callback: MouseEventCallback): () => void {
    return this.addMouseListener('mouseup', callback);
  }

  /**
   * Subscribe to mouse move events
   */
  onMouseMove(callback: MouseEventCallback): () => void {
    return this.addMouseListener('mousemove', callback);
  }

  /**
   * Subscribe to scroll events
   */
  onScroll(callback: MouseEventCallback): () => void {
    return this.addMouseListener('scroll', callback);
  }

  /**
   * Subscribe to click events
   */
  onClick(callback: MouseEventCallback): () => void {
    return this.addMouseListener('click', callback);
  }

  /**
   * Subscribe to double click events
   */
  onDoubleClick(callback: MouseEventCallback): () => void {
    return this.addMouseListener('dblclick', callback);
  }

  /**
   * Subscribe to a specific mouse button
   */
  onMouseButton(button: MouseButton, callback: MouseEventCallback, eventType: 'down' | 'up' = 'down'): () => void {
    const wrapper: MouseEventCallback = (event) => {
      if (event.button === button) {
        callback(event);
      }
    };
    
    return this.addMouseListener(eventType === 'down' ? 'mousedown' : 'mouseup', wrapper);
  }

  // ============================================
  // Gamepad Events
  // ============================================

  /**
   * Subscribe to gamepad connected events
   */
  onGamepadConnected(callback: GamepadEventCallback): () => void {
    return this.addGamepadListener('gamepadconnected', callback);
  }

  /**
   * Subscribe to gamepad disconnected events
   */
  onGamepadDisconnected(callback: GamepadEventCallback): () => void {
    return this.addGamepadListener('gamepaddisconnected', callback);
  }

  /**
   * Subscribe to gamepad button down events
   */
  onGamepadButtonDown(callback: GamepadEventCallback): () => void {
    return this.addGamepadListener('buttondown', callback);
  }

  /**
   * Subscribe to gamepad button up events
   */
  onGamepadButtonUp(callback: GamepadEventCallback): () => void {
    return this.addGamepadListener('buttonup', callback);
  }

  /**
   * Subscribe to gamepad axis change events
   */
  onGamepadAxisChange(callback: GamepadEventCallback): () => void {
    return this.addGamepadListener('axischange', callback);
  }

  // ============================================
  // Touch Events
  // ============================================

  /**
   * Subscribe to touch start events
   */
  onTouchStart(callback: TouchEventCallback): () => void {
    return this.addTouchListener('touchstart', callback);
  }

  /**
   * Subscribe to touch end events
   */
  onTouchEnd(callback: TouchEventCallback): () => void {
    return this.addTouchListener('touchend', callback);
  }

  /**
   * Subscribe to touch move events
   */
  onTouchMove(callback: TouchEventCallback): () => void {
    return this.addTouchListener('touchmove', callback);
  }

  /**
   * Subscribe to touch cancel events
   */
  onTouchCancel(callback: TouchEventCallback): () => void {
    return this.addTouchListener('touchcancel', callback);
  }

  // ============================================
  // Action Events
  // ============================================

  /**
   * Subscribe to a specific action
   */
  onAction(actionName: string, callback: ActionEventCallback): () => void {
    if (!this.actionListeners.has(actionName)) {
      this.actionListeners.set(actionName, new Set());
    }
    this.actionListeners.get(actionName)!.add(callback);

    return () => {
      this.actionListeners.get(actionName)?.delete(callback);
    };
  }

  /**
   * Subscribe to action started events (when action just becomes active)
   */
  onActionStarted(callback: ActionEventCallback): () => void {
    return this.addActionListener('actionstarted', callback);
  }

  /**
   * Subscribe to action performed events (fires each frame while active)
   */
  onActionPerformed(callback: ActionEventCallback): () => void {
    return this.addActionListener('actionperformed', callback);
  }

  /**
   * Subscribe to action canceled events (when action just becomes inactive)
   */
  onActionCanceled(callback: ActionEventCallback): () => void {
    return this.addActionListener('actioncanceled', callback);
  }

  // ============================================
  // Global Events
  // ============================================

  /**
   * Subscribe to all input events
   */
  onAll(callback: InputEventCallback): () => void {
    this.globalListeners.add(callback);
    return () => {
      this.globalListeners.delete(callback);
    };
  }

  // ============================================
  // Emit Methods (Internal)
  // ============================================

  /**
   * Emit a keyboard event
   * @internal
   */
  emitKeyboardEvent(event: KeyboardInputEvent): void {
    const listeners = this.keyboardListeners.get(event.type);
    if (listeners) {
      listeners.forEach(callback => callback(event));
    }
    this.emitGlobal(event);
  }

  /**
   * Emit a mouse event
   * @internal
   */
  emitMouseEvent(event: MouseInputEvent): void {
    const listeners = this.mouseListeners.get(event.type);
    if (listeners) {
      listeners.forEach(callback => callback(event));
    }
    this.emitGlobal(event);
  }

  /**
   * Emit a gamepad event
   * @internal
   */
  emitGamepadEvent(event: GamepadInputEvent): void {
    const listeners = this.gamepadListeners.get(event.type);
    if (listeners) {
      listeners.forEach(callback => callback(event));
    }
    this.emitGlobal(event);
  }

  /**
   * Emit a touch event
   * @internal
   */
  emitTouchEvent(event: TouchInputEvent): void {
    const listeners = this.touchListeners.get(event.type);
    if (listeners) {
      listeners.forEach(callback => callback(event));
    }
    this.emitGlobal(event);
  }

  /**
   * Emit an action event
   * @internal
   */
  emitActionEvent(event: ActionInputEvent): void {
    // Emit to specific action listeners
    const specificListeners = this.actionListeners.get(event.action.name);
    if (specificListeners) {
      specificListeners.forEach(callback => callback(event.action));
    }

    // Emit to type-based listeners
    const typeListeners = this.actionListeners.get(event.type);
    if (typeListeners) {
      typeListeners.forEach(callback => callback(event.action));
    }

    this.emitGlobal(event);
  }

  // ============================================
  // Helper Methods
  // ============================================

  private emitGlobal(event: InputEvent): void {
    this.globalListeners.forEach(callback => callback(event));
  }

  private addKeyboardListener(type: string, callback: KeyboardEventCallback): () => void {
    if (!this.keyboardListeners.has(type)) {
      this.keyboardListeners.set(type, new Set());
    }
    this.keyboardListeners.get(type)!.add(callback);

    return () => {
      this.keyboardListeners.get(type)?.delete(callback);
    };
  }

  private addMouseListener(type: string, callback: MouseEventCallback): () => void {
    if (!this.mouseListeners.has(type)) {
      this.mouseListeners.set(type, new Set());
    }
    this.mouseListeners.get(type)!.add(callback);

    return () => {
      this.mouseListeners.get(type)?.delete(callback);
    };
  }

  private addGamepadListener(type: string, callback: GamepadEventCallback): () => void {
    if (!this.gamepadListeners.has(type)) {
      this.gamepadListeners.set(type, new Set());
    }
    this.gamepadListeners.get(type)!.add(callback);

    return () => {
      this.gamepadListeners.get(type)?.delete(callback);
    };
  }

  private addTouchListener(type: string, callback: TouchEventCallback): () => void {
    if (!this.touchListeners.has(type)) {
      this.touchListeners.set(type, new Set());
    }
    this.touchListeners.get(type)!.add(callback);

    return () => {
      this.touchListeners.get(type)?.delete(callback);
    };
  }

  private addActionListener(type: string, callback: ActionEventCallback): () => void {
    if (!this.actionListeners.has(type)) {
      this.actionListeners.set(type, new Set());
    }
    this.actionListeners.get(type)!.add(callback);

    return () => {
      this.actionListeners.get(type)?.delete(callback);
    };
  }

  /**
   * Remove all listeners
   */
  clear(): void {
    this.keyboardListeners.clear();
    this.mouseListeners.clear();
    this.gamepadListeners.clear();
    this.touchListeners.clear();
    this.actionListeners.clear();
    this.globalListeners.clear();
  }

  /**
   * Remove all listeners for a specific event type
   */
  clearType(type: string): void {
    this.keyboardListeners.delete(type);
    this.mouseListeners.delete(type);
    this.gamepadListeners.delete(type);
    this.touchListeners.delete(type);
    this.actionListeners.delete(type);
  }
}

// ============================================
// Event Factory Functions
// ============================================

/**
 * Create a keyboard event
 */
export function createKeyboardEvent(
  type: 'keydown' | 'keyup' | 'keypressed',
  code: KeyCode,
  key: string,
  modifiers: ModifierState,
  repeat: boolean = false
): KeyboardInputEvent {
  return {
    timestamp: performance.now(),
    deviceType: 'keyboard',
    type,
    code,
    key,
    modifiers,
    repeat,
  };
}

/**
 * Create a mouse event
 */
export function createMouseEvent(
  type: 'mousedown' | 'mouseup' | 'mousemove' | 'scroll' | 'click' | 'dblclick',
  position: Vector2,
  delta: Vector2,
  modifiers: ModifierState,
  button?: MouseButton,
  scrollDelta?: Vector2
): MouseInputEvent {
  return {
    timestamp: performance.now(),
    deviceType: 'mouse',
    type,
    button,
    position,
    delta,
    scrollDelta,
    modifiers,
  };
}

/**
 * Create a gamepad event
 */
export function createGamepadEvent(
  type: 'gamepadconnected' | 'gamepaddisconnected' | 'buttondown' | 'buttonup' | 'axischange',
  gamepadIndex: number,
  gamepadId: string,
  options?: {
    button?: number;
    buttonValue?: number;
    axis?: number;
    axisValue?: number;
  }
): GamepadInputEvent {
  return {
    timestamp: performance.now(),
    deviceType: 'gamepad',
    type,
    gamepadIndex,
    gamepadId,
    ...options,
  };
}

/**
 * Create a touch event
 */
export function createTouchEvent(
  type: 'touchstart' | 'touchend' | 'touchmove' | 'touchcancel',
  touches: TouchInputEvent['touches'],
  changedTouches: TouchInputEvent['changedTouches']
): TouchInputEvent {
  return {
    timestamp: performance.now(),
    deviceType: 'touch',
    type,
    touches,
    changedTouches,
  };
}

/**
 * Create an action event
 */
export function createActionEvent(
  type: 'actionstarted' | 'actionperformed' | 'actioncanceled',
  action: ActionInputEvent['action']
): ActionInputEvent {
  return {
    timestamp: performance.now(),
    deviceType: action.deviceType || 'keyboard',
    type,
    action,
  };
}

// Global event emitter instance
export const inputEventEmitter = new InputEventEmitter();
