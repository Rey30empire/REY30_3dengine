// ============================================
// KeyCode - Key Code Definitions
// REY30 3D Engine - Input System
// ============================================

/**
 * Enumeration of all supported keyboard key codes.
 * Maps to standard browser KeyboardEvent.code values.
 */
export enum KeyCode {
  // Letters
  A = 'KeyA',
  B = 'KeyB',
  C = 'KeyC',
  D = 'KeyD',
  E = 'KeyE',
  F = 'KeyF',
  G = 'KeyG',
  H = 'KeyH',
  I = 'KeyI',
  J = 'KeyJ',
  K = 'KeyK',
  L = 'KeyL',
  M = 'KeyM',
  N = 'KeyN',
  O = 'KeyO',
  P = 'KeyP',
  Q = 'KeyQ',
  R = 'KeyR',
  S = 'KeyS',
  T = 'KeyT',
  U = 'KeyU',
  V = 'KeyV',
  W = 'KeyW',
  X = 'KeyX',
  Y = 'KeyY',
  Z = 'KeyZ',

  // Numbers
  Digit0 = 'Digit0',
  Digit1 = 'Digit1',
  Digit2 = 'Digit2',
  Digit3 = 'Digit3',
  Digit4 = 'Digit4',
  Digit5 = 'Digit5',
  Digit6 = 'Digit6',
  Digit7 = 'Digit7',
  Digit8 = 'Digit8',
  Digit9 = 'Digit9',

  // Numpad
  Numpad0 = 'Numpad0',
  Numpad1 = 'Numpad1',
  Numpad2 = 'Numpad2',
  Numpad3 = 'Numpad3',
  Numpad4 = 'Numpad4',
  Numpad5 = 'Numpad5',
  Numpad6 = 'Numpad6',
  Numpad7 = 'Numpad7',
  Numpad8 = 'Numpad8',
  Numpad9 = 'Numpad9',
  NumpadAdd = 'NumpadAdd',
  NumpadSubtract = 'NumpadSubtract',
  NumpadMultiply = 'NumpadMultiply',
  NumpadDivide = 'NumpadDivide',
  NumpadDecimal = 'NumpadDecimal',
  NumpadEnter = 'NumpadEnter',

  // Arrow Keys
  ArrowUp = 'ArrowUp',
  ArrowDown = 'ArrowDown',
  ArrowLeft = 'ArrowLeft',
  ArrowRight = 'ArrowRight',

  // Modifier Keys
  ShiftLeft = 'ShiftLeft',
  ShiftRight = 'ShiftRight',
  ControlLeft = 'ControlLeft',
  ControlRight = 'ControlRight',
  AltLeft = 'AltLeft',
  AltRight = 'AltRight',
  MetaLeft = 'MetaLeft',
  MetaRight = 'MetaRight',

  // Special Keys
  Space = 'Space',
  Enter = 'Enter',
  Escape = 'Escape',
  Tab = 'Tab',
  Backspace = 'Backspace',
  Delete = 'Delete',
  Insert = 'Insert',
  Home = 'Home',
  End = 'End',
  PageUp = 'PageUp',
  PageDown = 'PageDown',
  CapsLock = 'CapsLock',
  NumLock = 'NumLock',
  ScrollLock = 'ScrollLock',

  // Function Keys
  F1 = 'F1',
  F2 = 'F2',
  F3 = 'F3',
  F4 = 'F4',
  F5 = 'F5',
  F6 = 'F6',
  F7 = 'F7',
  F8 = 'F8',
  F9 = 'F9',
  F10 = 'F10',
  F11 = 'F11',
  F12 = 'F12',
  F13 = 'F13',
  F14 = 'F14',
  F15 = 'F15',
  F16 = 'F16',
  F17 = 'F17',
  F18 = 'F18',
  F19 = 'F19',
  F20 = 'F20',

  // Punctuation
  Comma = 'Comma',
  Period = 'Period',
  Slash = 'Slash',
  Semicolon = 'Semicolon',
  Quote = 'Quote',
  BracketLeft = 'BracketLeft',
  BracketRight = 'BracketRight',
  Backslash = 'Backslash',
  Minus = 'Minus',
  Equal = 'Equal',
  Backquote = 'Backquote',

  // Media Keys
  MediaPlayPause = 'MediaPlayPause',
  MediaStop = 'MediaStop',
  MediaTrackNext = 'MediaTrackNext',
  MediaTrackPrevious = 'MediaTrackPrevious',
  AudioVolumeMute = 'AudioVolumeMute',
  AudioVolumeUp = 'AudioVolumeUp',
  AudioVolumeDown = 'AudioVolumeDown',
}

/**
 * Helper object to check if any modifier is active
 */
export const ModifierKey = {
  Shift: [KeyCode.ShiftLeft, KeyCode.ShiftRight] as const,
  Control: [KeyCode.ControlLeft, KeyCode.ControlRight] as const,
  Alt: [KeyCode.AltLeft, KeyCode.AltRight] as const,
  Meta: [KeyCode.MetaLeft, KeyCode.MetaRight] as const,
} as const;

/**
 * Mouse button codes
 */
export enum MouseButton {
  Left = 0,
  Middle = 1,
  Right = 2,
  Back = 3,
  Forward = 4,
}

/**
 * Gamepad button indices (standard mapping)
 */
export enum GamepadButton {
  FaceDown = 0,    // A on Xbox, Cross on PlayStation
  FaceRight = 1,   // B on Xbox, Circle on PlayStation
  FaceLeft = 2,    // X on Xbox, Square on PlayStation
  FaceUp = 3,      // Y on Xbox, Triangle on PlayStation
  LeftBumper = 4,  // LB on Xbox, L1 on PlayStation
  RightBumper = 5, // RB on Xbox, R1 on PlayStation
  LeftTrigger = 6, // LT on Xbox, L2 on PlayStation
  RightTrigger = 7,// RT on Xbox, R2 on PlayStation
  Select = 8,      // Back on Xbox, Share on PlayStation
  Start = 9,       // Start on Xbox, Options on PlayStation
  LeftStick = 10,  // L3 (press left stick)
  RightStick = 11, // R3 (press right stick)
  DPadUp = 12,
  DPadDown = 13,
  DPadLeft = 14,
  DPadRight = 15,
  Home = 16,       // Guide/Home button
}

/**
 * Gamepad axis indices (standard mapping)
 */
export enum GamepadAxis {
  LeftStickX = 0,
  LeftStickY = 1,
  RightStickX = 2,
  RightStickY = 3,
}

/**
 * Convert a KeyCode to a human-readable name
 */
export function getKeyDisplayName(code: KeyCode): string {
  const displayNames: Partial<Record<KeyCode, string>> = {
    [KeyCode.ArrowUp]: '↑',
    [KeyCode.ArrowDown]: '↓',
    [KeyCode.ArrowLeft]: '←',
    [KeyCode.ArrowRight]: '→',
    [KeyCode.Space]: 'Space',
    [KeyCode.Enter]: 'Enter',
    [KeyCode.Escape]: 'Esc',
    [KeyCode.Tab]: 'Tab',
    [KeyCode.Backspace]: 'Backspace',
    [KeyCode.Delete]: 'Del',
    [KeyCode.ShiftLeft]: 'Shift',
    [KeyCode.ShiftRight]: 'Shift',
    [KeyCode.ControlLeft]: 'Ctrl',
    [KeyCode.ControlRight]: 'Ctrl',
    [KeyCode.AltLeft]: 'Alt',
    [KeyCode.AltRight]: 'Alt',
  };

  if (displayNames[code]) {
    return displayNames[code]!;
  }

  // Remove 'Key' prefix for letters
  if (code.startsWith('Key')) {
    return code.slice(3);
  }

  // Remove 'Digit' prefix for numbers
  if (code.startsWith('Digit')) {
    return code.slice(5);
  }

  // Remove 'Numpad' prefix
  if (code.startsWith('Numpad')) {
    return 'Num' + code.slice(6);
  }

  return code;
}

/**
 * Get gamepad button display name
 */
export function getGamepadButtonDisplayName(button: GamepadButton): string {
  const names: Partial<Record<GamepadButton, string>> = {
    [GamepadButton.FaceDown]: 'A',
    [GamepadButton.FaceRight]: 'B',
    [GamepadButton.FaceLeft]: 'X',
    [GamepadButton.FaceUp]: 'Y',
    [GamepadButton.LeftBumper]: 'LB',
    [GamepadButton.RightBumper]: 'RB',
    [GamepadButton.LeftTrigger]: 'LT',
    [GamepadButton.RightTrigger]: 'RT',
    [GamepadButton.Select]: 'Back',
    [GamepadButton.Start]: 'Start',
    [GamepadButton.LeftStick]: 'L3',
    [GamepadButton.RightStick]: 'R3',
    [GamepadButton.DPadUp]: 'D-Pad ↑',
    [GamepadButton.DPadDown]: 'D-Pad ↓',
    [GamepadButton.DPadLeft]: 'D-Pad ←',
    [GamepadButton.DPadRight]: 'D-Pad →',
    [GamepadButton.Home]: 'Home',
  };

  return names[button] ?? `Button ${button}`;
}
