'use client';

// ============================================
// useInput - React Hooks for Input System
// REY30 3D Engine - Input System
// ============================================

import { useEffect, useRef, useState, useCallback } from 'react';
import { InputAction, Vector2, ModifierState, TouchPoint, GamepadState, BufferedInput } from './types';
import { KeyCode, MouseButton, GamepadButton, GamepadAxis } from './KeyCode';
import { InputManager } from './InputManager';

/**
 * Hook to get action state with automatic updates
 * 
 * @param actionName - The action to query
 * @returns Current action state
 * 
 * @example
 * ```tsx
 * function Player() {
 *   const jump = useAction('jump');
 *   
 *   useEffect(() => {
 *     if (jump.justPressed) {
 *       playerRef.current?.jump();
 *     }
 *   }, [jump.justPressed]);
 *   
 *   return <mesh ref={playerRef} />;
 * }
 * ```
 */
export function useAction(actionName: string): InputAction {
  const [action, setAction] = useState<InputAction>(() => InputManager.getAction(actionName));

  useEffect(() => {
    // Update every frame
    let animationId: number;
    const update = () => {
      setAction(InputManager.getAction(actionName));
      animationId = requestAnimationFrame(update);
    };
    animationId = requestAnimationFrame(update);

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [actionName]);

  return action;
}

/**
 * Hook to check if an action was just pressed (one-time trigger)
 * Returns true only on the frame the action was pressed
 * 
 * @param actionName - The action to query
 * @returns Whether the action was just pressed
 * 
 * @example
 * ```tsx
 * function Menu() {
 *   const confirmPressed = useActionPressed('confirm');
 *   
 *   useEffect(() => {
 *     if (confirmPressed) {
 *       handleConfirm();
 *     }
 *   }, [confirmPressed]);
 * }
 * ```
 */
export function useActionPressed(actionName: string): boolean {
  const [pressed, setPressed] = useState(false);
  const prevPressed = useRef(false);

  useEffect(() => {
    let animationId: number;
    
    const update = () => {
      const action = InputManager.getAction(actionName);
      const isPressed = action.justPressed;
      
      // Only trigger once per press
      if (isPressed && !prevPressed.current) {
        setPressed(true);
        setTimeout(() => setPressed(false), 0);
      }
      
      prevPressed.current = isPressed;
      animationId = requestAnimationFrame(update);
    };
    
    animationId = requestAnimationFrame(update);
    
    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [actionName]);

  return pressed;
}

/**
 * Hook to get action value (for axes)
 * 
 * @param actionName - The action to query
 * @returns Current action value (-1 to 1)
 * 
 * @example
 * ```tsx
 * function Player() {
 *   const moveX = useActionValue('moveX');
 *   const moveY = useActionValue('moveY');
 *   
 *   useFrame(() => {
 *     player.position.x += moveX * speed;
 *     player.position.z += moveY * speed;
 *   });
 * }
 * ```
 */
export function useActionValue(actionName: string): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    let animationId: number;
    
    const update = () => {
      setValue(InputManager.getActionValue(actionName));
      animationId = requestAnimationFrame(update);
    };
    
    animationId = requestAnimationFrame(update);
    
    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [actionName]);

  return value;
}

/**
 * Hook for keyboard key state
 * 
 * @param code - Key code to check
 * @returns Object with down, pressed, up states
 * 
 * @example
 * ```tsx
 * function Component() {
 *   const space = useKey(KeyCode.Space);
 *   
 *   return (
 *     <div>
 *       Space: {space.down ? 'Held' : 'Released'}
 *       {space.pressed && 'Just Pressed!'}
 *       {space.up && 'Just Released!'}
 *     </div>
 *   );
 * }
 * ```
 */
export function useKey(code: KeyCode) {
  const [state, setState] = useState({
    down: false,
    pressed: false,
    up: false,
  });

  useEffect(() => {
    let animationId: number;
    
    const update = () => {
      setState({
        down: InputManager.getKey(code),
        pressed: InputManager.getKeyDown(code),
        up: InputManager.getKeyUp(code),
      });
      animationId = requestAnimationFrame(update);
    };
    
    animationId = requestAnimationFrame(update);
    
    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [code]);

  return state;
}

/**
 * Hook for multiple keys
 * 
 * @param codes - Array of key codes to check
 * @returns Map of key states
 * 
 * @example
 * ```tsx
 * function Player() {
 *   const keys = useKeys([KeyCode.W, KeyCode.A, KeyCode.S, KeyCode.D]);
 *   
 *   const moveX = (keys.get(KeyCode.D)?.down ? 1 : 0) - (keys.get(KeyCode.A)?.down ? 1 : 0);
 *   const moveY = (keys.get(KeyCode.W)?.down ? 1 : 0) - (keys.get(KeyCode.S)?.down ? 1 : 0);
 * }
 * ```
 */
export function useKeys(codes: KeyCode[]): Map<KeyCode, { down: boolean; pressed: boolean; up: boolean }> {
  const [states, setStates] = useState(() => {
    const map = new Map<KeyCode, { down: boolean; pressed: boolean; up: boolean }>();
    codes.forEach(code => {
      map.set(code, { down: false, pressed: false, up: false });
    });
    return map;
  });

  useEffect(() => {
    let animationId: number;
    
    const update = () => {
      const newStates = new Map<KeyCode, { down: boolean; pressed: boolean; up: boolean }>();
      codes.forEach(code => {
        newStates.set(code, {
          down: InputManager.getKey(code),
          pressed: InputManager.getKeyDown(code),
          up: InputManager.getKeyUp(code),
        });
      });
      setStates(newStates);
      animationId = requestAnimationFrame(update);
    };
    
    animationId = requestAnimationFrame(update);
    
    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [codes]);

  return states;
}

/**
 * Hook for mouse state
 * 
 * @returns Mouse position, delta, and button states
 * 
 * @example
 * ```tsx
 * function Component() {
 *   const { position, delta, buttons } = useMouse();
 *   
 *   useEffect(() => {
 *     if (buttons.left.pressed) {
 *       console.log('Clicked at', position);
 *     }
 *   }, [buttons.left.pressed]);
 * }
 * ```
 */
export function useMouse() {
  const [state, setState] = useState(() => ({
    position: InputManager.mousePosition,
    delta: InputManager.mouseDelta,
    scroll: InputManager.scrollDelta,
    buttons: {
      left: { down: false, pressed: false, up: false },
      middle: { down: false, pressed: false, up: false },
      right: { down: false, pressed: false, up: false },
    },
    locked: InputManager.isPointerLocked,
  }));

  useEffect(() => {
    let animationId: number;
    
    const update = () => {
      setState({
        position: InputManager.mousePosition,
        delta: InputManager.mouseDelta,
        scroll: InputManager.scrollDelta,
        buttons: {
          left: {
            down: InputManager.getMouseButton(MouseButton.Left),
            pressed: InputManager.getMouseButtonDown(MouseButton.Left),
            up: InputManager.getMouseButtonUp(MouseButton.Left),
          },
          middle: {
            down: InputManager.getMouseButton(MouseButton.Middle),
            pressed: InputManager.getMouseButtonDown(MouseButton.Middle),
            up: InputManager.getMouseButtonUp(MouseButton.Middle),
          },
          right: {
            down: InputManager.getMouseButton(MouseButton.Right),
            pressed: InputManager.getMouseButtonDown(MouseButton.Right),
            up: InputManager.getMouseButtonUp(MouseButton.Right),
          },
        },
        locked: InputManager.isPointerLocked,
      });
      animationId = requestAnimationFrame(update);
    };
    
    animationId = requestAnimationFrame(update);
    
    return () => {
      cancelAnimationFrame(animationId);
    };
  }, []);

  return state;
}

/**
 * Hook for modifier keys state
 * 
 * @returns Current modifier key states
 * 
 * @example
 * ```tsx
 * function Component() {
 *   const modifiers = useModifiers();
 *   
 *   if (modifiers.control && modifiers.shift) {
 *     // Ctrl+Shift held
 *   }
 * }
 * ```
 */
export function useModifiers(): ModifierState {
  const [modifiers, setModifiers] = useState<ModifierState>(() => InputManager.modifiers);

  useEffect(() => {
    let animationId: number;
    
    const update = () => {
      setModifiers(InputManager.modifiers);
      animationId = requestAnimationFrame(update);
    };
    
    animationId = requestAnimationFrame(update);
    
    return () => {
      cancelAnimationFrame(animationId);
    };
  }, []);

  return modifiers;
}

/**
 * Hook for touch state
 * 
 * @returns Touch count and touch points
 * 
 * @example
 * ```tsx
 * function MobileControls() {
 *   const { count, touches } = useTouch();
 *   
 *   if (count > 0) {
 *     const firstTouch = touches[0];
 *     console.log('Touch at', firstTouch.position);
 *   }
 * }
 * ```
 */
export function useTouch(): { count: number; touches: TouchPoint[] } {
  const [state, setState] = useState(() => ({
    count: InputManager.touchCount,
    touches: InputManager.getTouches(),
  }));

  useEffect(() => {
    let animationId: number;
    
    const update = () => {
      setState({
        count: InputManager.touchCount,
        touches: InputManager.getTouches(),
      });
      animationId = requestAnimationFrame(update);
    };
    
    animationId = requestAnimationFrame(update);
    
    return () => {
      cancelAnimationFrame(animationId);
    };
  }, []);

  return state;
}

/**
 * Hook for gamepad state
 * 
 * @param index - Gamepad index (default 0)
 * @returns Gamepad state or null if not connected
 * 
 * @example
 * ```tsx
 * function Player() {
 *   const gamepad = useGamepad(0);
 *   
 *   if (gamepad) {
 *     const leftStickX = gamepad.axes[GamepadAxis.LeftStickX];
 *     const aButton = gamepad.buttons[GamepadButton.FaceDown];
 *     
 *     if (aButton.justPressed) {
 *       player.jump();
 *     }
 *   }
 * }
 * ```
 */
export function useGamepad(index: number = 0): GamepadState | null {
  const [gamepad, setGamepad] = useState<GamepadState | null>(() => 
    InputManager.getGamepad(index) ?? null
  );

  useEffect(() => {
    let animationId: number;
    
    const update = () => {
      setGamepad(InputManager.getGamepad(index) ?? null);
      animationId = requestAnimationFrame(update);
    };
    
    animationId = requestAnimationFrame(update);
    
    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [index]);

  return gamepad;
}

/**
 * Hook for gamepad count
 * 
 * @returns Number of connected gamepads
 */
export function useGamepadCount(): number {
  const [count, setCount] = useState(() => InputManager.gamepadCount);

  useEffect(() => {
    const handleConnected = () => setCount(InputManager.gamepadCount);
    const handleDisconnected = () => setCount(InputManager.gamepadCount);

    const unsubConnect = InputManager.events.onGamepadConnected(handleConnected);
    const unsubDisconnect = InputManager.events.onGamepadDisconnected(handleDisconnected);

    return () => {
      unsubConnect();
      unsubDisconnect();
    };
  }, []);

  return count;
}

/**
 * Hook for input buffering (fighting games)
 * 
 * @param actionName - Action to check in buffer
 * @param consume - Whether to consume the input (default true)
 * @returns Buffered input if found
 * 
 * @example
 * ```tsx
 * function Fighter() {
 *   const bufferedPunch = useBufferedInput('attack', true);
 *   
 *   useEffect(() => {
 *     if (bufferedPunch) {
 *       executeCombo('punch');
 *     }
 *   }, [bufferedPunch]);
 * }
 * ```
 */
export function useBufferedInput(actionName: string, consume: boolean = true): BufferedInput | null {
  const [input, setInput] = useState<BufferedInput | null>(null);

  useEffect(() => {
    const checkBuffer = () => {
      const buffered = consume
        ? InputManager.consumeBufferedInput(actionName)
        : InputManager.getBufferedInput(actionName);
      
      if (buffered) {
        setInput(buffered);
        // Reset after one frame
        setTimeout(() => setInput(null), 0);
      }
    };

    let animationId: number;
    const update = () => {
      checkBuffer();
      animationId = requestAnimationFrame(update);
    };
    
    animationId = requestAnimationFrame(update);
    
    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [actionName, consume]);

  return input;
}

/**
 * Hook for initializing the input system
 * Must be used at the root of your game component
 * 
 * @param config - Optional input configuration
 * 
 * @example
 * ```tsx
 * function Game() {
 *   useInputInitializer();
 *   
 *   useFrame(() => {
 *     InputManager.update();
 *   });
 *   
 *   return <Canvas>...</Canvas>;
 * }
 * ```
 */
export function useInputInitializer(config?: Parameters<typeof InputManager.initialize>[0]) {
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) {
      InputManager.initialize(config);
      initialized.current = true;
    }

    return () => {
      InputManager.shutdown();
    };
  }, [config]);
}

/**
 * Hook that sets up the input update loop
 * Use this in your main game loop component
 * 
 * @param enabled - Whether to run the update loop
 * 
 * @example
 * ```tsx
 * function GameLoop() {
 *   useInputLoop(true);
 *   
 *   return null;
 * }
 * ```
 */
export function useInputLoop(enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return;

    let animationId: number;
    
    const loop = () => {
      InputManager.update();
      animationId = requestAnimationFrame(loop);
    };
    
    animationId = requestAnimationFrame(loop);
    
    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [enabled]);
}

/**
 * Hook for action callback
 * Calls the callback when the action is triggered
 * 
 * @param actionName - Action to listen for
 * @param callback - Function to call when action is triggered
 * @param trigger - When to trigger: 'pressed', 'active', or 'released'
 * 
 * @example
 * ```tsx
 * function Player() {
 *   useActionCallback('jump', () => {
 *     console.log('Jump!');
 *   }, 'pressed');
 *   
 *   useActionCallback('sprint', () => {
 *     player.speed = 2;
 *   }, 'active');
 * }
 * ```
 */
export function useActionCallback(
  actionName: string,
  callback: (action: InputAction) => void,
  trigger: 'pressed' | 'active' | 'released' = 'pressed'
) {
  const callbackRef = useRef(callback);

  // Update ref in effect to avoid accessing during render
  useEffect(() => {
    callbackRef.current = callback;
  });

  useEffect(() => {
    let animationId: number;
    let wasActive = false;

    const update = () => {
      const action = InputManager.getAction(actionName);

      if (trigger === 'pressed' && action.justPressed) {
        callbackRef.current(action);
      } else if (trigger === 'active' && action.active) {
        callbackRef.current(action);
      } else if (trigger === 'released' && action.justReleased) {
        callbackRef.current(action);
      }

      wasActive = action.active;
      animationId = requestAnimationFrame(update);
    };

    animationId = requestAnimationFrame(update);

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [actionName, trigger]);
}

/**
 * Hook for key callback
 * Calls the callback when the key is pressed
 * 
 * @param code - Key code to listen for
 * @param callback - Function to call when key is pressed
 * 
 * @example
 * ```tsx
 * function Menu() {
 *   useKeyCallback(KeyCode.Escape, () => {
 *     toggleMenu();
 *   });
 * }
 * ```
 */
export function useKeyCallback(code: KeyCode, callback: () => void) {
  const callbackRef = useRef(callback);

  // Update ref in effect to avoid accessing during render
  useEffect(() => {
    callbackRef.current = callback;
  });

  useEffect(() => {
    const unsubscribe = InputManager.events.onKey(code, () => {
      callbackRef.current();
    }, 'down');

    return unsubscribe;
  }, [code]);
}


