// ============================================
// Input System Type Definitions
// REY30 3D Engine - Input System
// ============================================

import { KeyCode, MouseButton, GamepadButton, GamepadAxis } from './KeyCode';

// ============================================
// Keyboard State
// ============================================

/**
 * Represents the current state of keyboard input
 */
export interface KeyboardState {
  /** Keys currently being held down */
  keysDown: Set<KeyCode>;
  /** Keys that were just pressed this frame */
  keysPressed: Set<KeyCode>;
  /** Keys that were just released this frame */
  keysReleased: Set<KeyCode>;
  /** Modifier key states */
  modifiers: ModifierState;
}

/**
 * Modifier key state
 */
export interface ModifierState {
  shift: boolean;
  control: boolean;
  alt: boolean;
  meta: boolean;
}

// ============================================
// Mouse State
// ============================================

/**
 * Represents the current state of mouse input
 */
export interface MouseState {
  /** Current mouse position in screen coordinates */
  position: Vector2;
  /** Mouse movement since last frame */
  delta: Vector2;
  /** Scroll wheel delta */
  scrollDelta: Vector2;
  /** Buttons currently being held down */
  buttonsDown: Set<MouseButton>;
  /** Buttons that were just pressed this frame */
  buttonsPressed: Set<MouseButton>;
  /** Buttons that were just released this frame */
  buttonsReleased: Set<MouseButton>;
  /** Whether the mouse is locked (pointer lock) */
  locked: boolean;
}

/**
 * 2D Vector for mouse positions
 */
export interface Vector2 {
  x: number;
  y: number;
}

// ============================================
// Gamepad State
// ============================================

/**
 * Represents a connected gamepad
 */
export interface GamepadState {
  /** Gamepad ID from the browser */
  id: string;
  /** Index of the gamepad */
  index: number;
  /** Button states */
  buttons: GamepadButtonState[];
  /** Axis values (-1 to 1) */
  axes: number[];
  /** Whether this gamepad is connected */
  connected: boolean;
  /** Timestamp of last update */
  timestamp: number;
}

/**
 * State of a single gamepad button
 */
export interface GamepadButtonState {
  /** Button is currently pressed (0 to 1, analog triggers) */
  value: number;
  /** Button is currently held down */
  pressed: boolean;
  /** Button was just pressed this frame */
  justPressed: boolean;
  /** Button was just released this frame */
  justReleased: boolean;
}

// ============================================
// Touch State
// ============================================

/**
 * Represents a single touch point
 */
export interface TouchPoint {
  /** Unique identifier for this touch */
  identifier: number;
  /** Current position */
  position: Vector2;
  /** Position at start of touch */
  startPosition: Vector2;
  /** Movement since last frame */
  delta: Vector2;
  /** Time when touch started */
  startTime: number;
  /** Phase of the touch */
  phase: TouchPhase;
}

/**
 * Touch phase
 */
export type TouchPhase = 'began' | 'moved' | 'stationary' | 'ended' | 'canceled';

/**
 * Complete touch state
 */
export interface TouchState {
  /** All active touches */
  touches: Map<number, TouchPoint>;
  /** Number of active touches */
  count: number;
}

// ============================================
// Input Binding
// ============================================

/**
 * Type of input device
 */
export type InputDeviceType = 'keyboard' | 'mouse' | 'gamepad' | 'touch';

/**
 * Input binding for an action
 */
export interface InputBinding {
  /** Unique identifier for this binding */
  id: string;
  /** Type of input device */
  deviceType: InputDeviceType;
  /** The actual input (KeyCode, MouseButton, GamepadButton, etc.) */
  input: KeyCode | MouseButton | GamepadButton | GamepadAxis | TouchInputType;
  /** Modifiers that must be active (e.g., Ctrl+Key) */
  modifiers?: ModifierBinding[];
  /** Whether this binding is active */
  enabled: boolean;
  /** Axis configuration for analog inputs */
  axisConfig?: AxisConfig;
}

/**
 * Modifier binding requirement
 */
export interface ModifierBinding {
  /** Modifier key type */
  type: 'shift' | 'control' | 'alt' | 'meta';
  /** Whether the modifier must be pressed or not pressed */
  required: boolean;
}

/**
 * Configuration for axis inputs
 */
export interface AxisConfig {
  /** Dead zone (0 to 1) - input below this is ignored */
  deadZone: number;
  /** Sensitivity multiplier */
  sensitivity: number;
  /** Whether to invert the axis */
  invert: boolean;
  /** How to process the axis */
  mode: 'analog' | 'digital';
  /** For digital mode, threshold to trigger */
  threshold?: number;
}

/**
 * Touch input types
 */
export type TouchInputType = 
  | 'tap'
  | 'doubleTap'
  | 'longPress'
  | 'swipeLeft'
  | 'swipeRight'
  | 'swipeUp'
  | 'swipeDown'
  | 'pinch'
  | 'rotate';

// ============================================
// Input Action
// ============================================

/**
 * State of an input action
 */
export interface InputAction {
  /** Action name */
  name: string;
  /** Whether the action is currently active (button held) */
  active: boolean;
  /** Whether the action was just pressed this frame */
  justPressed: boolean;
  /** Whether the action was just released this frame */
  justReleased: boolean;
  /** Analog value of the action (0-1 for buttons, -1 to 1 for axes) */
  value: number;
  /** Raw value before processing */
  rawValue: number;
  /** Which device triggered this action */
  deviceType?: InputDeviceType;
  /** Timestamp when action started */
  startTime?: number;
  /** Duration the action has been active */
  duration: number;
}

/**
 * Definition of an input action
 */
export interface InputActionDefinition {
  /** Unique action name */
  name: string;
  /** Display name for UI */
  displayName: string;
  /** Description of what this action does */
  description?: string;
  /** All bindings for this action */
  bindings: InputBinding[];
  /** Category for grouping in UI */
  category?: string;
  /** Whether this is an axis action (continuous value) */
  isAxis?: boolean;
  /** Default bindings (for reset) */
  defaultBindings: InputBinding[];
}

// ============================================
// Input Buffer
// ============================================

/**
 * Buffered input for fighting games / combo systems
 */
export interface BufferedInput {
  /** The action that was buffered */
  action: string;
  /** Timestamp when it was buffered */
  timestamp: number;
  /** Value when buffered */
  value: number;
  /** How long this input stays in the buffer (ms) */
  duration: number;
  /** Whether this input has been consumed */
  consumed: boolean;
}

/**
 * Configuration for input buffering
 */
export interface InputBufferConfig {
  /** Maximum buffer duration in milliseconds */
  bufferDuration: number;
  /** Maximum number of buffered inputs */
  maxBufferSize: number;
  /** Whether to allow duplicate actions in buffer */
  allowDuplicates: boolean;
}

// ============================================
// Action Map
// ============================================

/**
 * A complete action map containing multiple actions
 */
export interface InputActionMap {
  /** Unique map name */
  name: string;
  /** Display name */
  displayName: string;
  /** Description */
  description?: string;
  /** Actions in this map */
  actions: InputActionDefinition[];
  /** Priority for overlapping actions (higher = processed first) */
  priority: number;
  /** Whether this map is enabled */
  enabled: boolean;
}

// ============================================
// Events
// ============================================

/**
 * Base input event
 */
export interface InputEventBase {
  /** Timestamp of the event */
  timestamp: number;
  /** Device that generated the event */
  deviceType: InputDeviceType;
}

/**
 * Keyboard event
 */
export interface KeyboardInputEvent extends InputEventBase {
  type: 'keydown' | 'keyup' | 'keypressed';
  code: KeyCode;
  key: string;
  modifiers: ModifierState;
  repeat: boolean;
}

/**
 * Mouse event
 */
export interface MouseInputEvent extends InputEventBase {
  type: 'mousedown' | 'mouseup' | 'mousemove' | 'scroll' | 'click' | 'dblclick';
  button?: MouseButton;
  position: Vector2;
  delta: Vector2;
  scrollDelta?: Vector2;
  modifiers: ModifierState;
}

/**
 * Gamepad event
 */
export interface GamepadInputEvent extends InputEventBase {
  type: 'gamepadconnected' | 'gamepaddisconnected' | 'buttondown' | 'buttonup' | 'axischange';
  gamepadIndex: number;
  gamepadId: string;
  button?: GamepadButton;
  buttonValue?: number;
  axis?: GamepadAxis;
  axisValue?: number;
}

/**
 * Touch event
 */
export interface TouchInputEvent extends InputEventBase {
  type: 'touchstart' | 'touchend' | 'touchmove' | 'touchcancel';
  touches: TouchPoint[];
  changedTouches: TouchPoint[];
}

/**
 * Action event
 */
export interface ActionInputEvent extends InputEventBase {
  type: 'actionstarted' | 'actionperformed' | 'actioncanceled';
  action: InputAction;
}

/**
 * Union of all input events
 */
export type InputEvent = 
  | KeyboardInputEvent 
  | MouseInputEvent 
  | GamepadInputEvent 
  | TouchInputEvent 
  | ActionInputEvent;

// ============================================
// Callback Types
// ============================================

export type KeyboardEventCallback = (event: KeyboardInputEvent) => void;
export type MouseEventCallback = (event: MouseInputEvent) => void;
export type GamepadEventCallback = (event: GamepadInputEvent) => void;
export type TouchEventCallback = (event: TouchInputEvent) => void;
export type ActionEventCallback = (action: InputAction) => void;
export type InputEventCallback = (event: InputEvent) => void;

// ============================================
// Configuration
// ============================================

/**
 * Main input system configuration
 */
export interface InputConfig {
  /** Enable keyboard input */
  enableKeyboard: boolean;
  /** Enable mouse input */
  enableMouse: boolean;
  /** Enable gamepad input */
  enableGamepad: boolean;
  /** Enable touch input */
  enableTouch: boolean;
  /** Input buffer configuration */
  bufferConfig?: InputBufferConfig;
  /** Default dead zone for all axes */
  defaultDeadZone: number;
  /** Default sensitivity for all axes */
  defaultSensitivity: number;
  /** Target element for input (defaults to window) */
  targetElement?: HTMLElement | null;
}

/**
 * Default input configuration
 */
export const DEFAULT_INPUT_CONFIG: InputConfig = {
  enableKeyboard: true,
  enableMouse: true,
  enableGamepad: true,
  enableTouch: true,
  bufferConfig: {
    bufferDuration: 150,
    maxBufferSize: 30,
    allowDuplicates: false,
  },
  defaultDeadZone: 0.15,
  defaultSensitivity: 1.0,
};

// ============================================
// Persistence
// ============================================

/**
 * Serializable input bindings for save/load
 */
export interface SerializableInputBindings {
  version: number;
  actionMaps: {
    name: string;
    actions: {
      name: string;
      bindings: {
        deviceType: InputDeviceType;
        input: string;
        modifiers?: ModifierBinding[];
        enabled: boolean;
        axisConfig?: AxisConfig;
      }[];
    }[];
  }[];
  lastModified: string;
}

/**
 * User's saved input preferences
 */
export interface InputUserPreferences {
  /** Active action map name */
  activeActionMap: string;
  /** Custom bindings (overrides defaults) */
  customBindings: Map<string, InputBinding[]>;
  /** Global settings */
  settings: {
    deadZone: number;
    sensitivity: number;
    invertY: boolean;
    rumbleEnabled: boolean;
  };
}
