'use client';

// ============================================
// VirtualJoystick - Touch Joystick Component
// REY30 3D Engine - Input System
// ============================================

import React, { useCallback, useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { Vector2 } from './types';

/**
 * Props for the VirtualJoystick component
 */
export interface VirtualJoystickProps {
  /** Unique identifier for this joystick */
  id: string;
  /** Size of the joystick in pixels */
  size?: number;
  /** Position from left (px or %) */
  left?: string | number;
  /** Position from bottom (px or %) */
  bottom?: string | number;
  /** Position from right (alternative to left) */
  right?: string | number;
  /** Dead zone (0 to 1) */
  deadZone?: number;
  /** Opacity when not in use */
  inactiveOpacity?: number;
  /** Opacity when in use */
  activeOpacity?: number;
  /** Color of the joystick base */
  baseColor?: string;
  /** Color of the joystick stick */
  stickColor?: string;
  /** Color of the joystick border */
  borderColor?: string;
  /** Whether to show visual feedback */
  showFeedback?: boolean;
  /** Whether the joystick is visible */
  visible?: boolean;
  /** Fixed position (doesn't appear where touched) */
  fixed?: boolean;
  /** Callback when joystick value changes */
  onChange?: (value: Vector2) => void;
  /** Callback when joystick is pressed */
  onPress?: () => void;
  /** Callback when joystick is released */
  onRelease?: () => void;
  /** Additional CSS class */
  className?: string;
}

/**
 * Ref handle for VirtualJoystick
 */
export interface VirtualJoystickHandle {
  /** Get current value */
  getValue: () => Vector2;
  /** Reset joystick to center */
  reset: () => void;
}

/**
 * Virtual Joystick component for mobile touch controls.
 * Supports both fixed and dynamic positioning.
 * 
 * @example
 * ```tsx
 * // Fixed joystick
 * <VirtualJoystick
 *   id="move"
 *   left={50}
 *   bottom={50}
 *   size={120}
 *   onChange={({ x, y }) => player.move(x, y)}
 * />
 * 
 * // Dynamic joystick (appears where touched)
 * <VirtualJoystick
 *   id="camera"
 *   right={50}
 *   bottom={50}
 *   size={100}
 *   fixed={false}
 *   onChange={({ x, y }) => camera.rotate(x, y)}
 * />
 * ```
 */
export const VirtualJoystick = forwardRef<VirtualJoystickHandle, VirtualJoystickProps>(
  (
    {
      id,
      size = 120,
      left,
      bottom,
      right,
      deadZone = 0.1,
      inactiveOpacity = 0.5,
      activeOpacity = 0.8,
      baseColor = 'rgba(255, 255, 255, 0.2)',
      stickColor = 'rgba(255, 255, 255, 0.6)',
      borderColor = 'rgba(255, 255, 255, 0.3)',
      showFeedback = true,
      visible = true,
      fixed = true,
      onChange,
      onPress,
      onRelease,
      className = '',
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [isActive, setIsActive] = useState(false);
    const [position, setPosition] = useState<Vector2>({ x: 0, y: 0 });
    const [touchId, setTouchId] = useState<number | null>(null);
    const [dynamicPosition, setDynamicPosition] = useState<{ x: number; y: number } | null>(null);

    const radius = size / 2;
    const stickRadius = size / 6;

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      getValue: () => position,
      reset: () => {
        setPosition({ x: 0, y: 0 });
        setIsActive(false);
        setTouchId(null);
        setDynamicPosition(null);
      },
    }));

    // Calculate normalized value with dead zone
    const calculateValue = useCallback(
      (dx: number, dy: number): Vector2 => {
        const distance = Math.sqrt(dx * dx + dy * dy);
        const maxDistance = radius - stickRadius;

        if (distance < deadZone * maxDistance) {
          return { x: 0, y: 0 };
        }

        // Normalize and apply dead zone
        const normalizedDistance = Math.min(distance / maxDistance, 1);
        const angle = Math.atan2(dy, dx);

        // Rescale after dead zone
        const adjustedDistance = (normalizedDistance - deadZone) / (1 - deadZone);

        return {
          x: Math.cos(angle) * adjustedDistance,
          y: Math.sin(angle) * adjustedDistance,
        };
      },
      [radius, stickRadius, deadZone]
    );

    // Handle touch start
    const handleTouchStart = useCallback(
      (e: React.TouchEvent) => {
        e.preventDefault();

        if (touchId !== null) return;

        const touch = e.changedTouches[0];
        const rect = containerRef.current?.getBoundingClientRect();

        if (!rect) return;

        let centerX: number;
        let centerY: number;

        if (!fixed) {
          // Dynamic joystick - appear where touched
          centerX = touch.clientX;
          centerY = touch.clientY;
          setDynamicPosition({ x: centerX, y: centerY });
        } else {
          // Fixed joystick
          centerX = rect.left + radius;
          centerY = rect.top + radius;
        }

        const dx = touch.clientX - centerX;
        const dy = touch.clientY - centerY;

        setTouchId(touch.identifier);
        setIsActive(true);

        const value = calculateValue(dx, dy);
        setPosition(value);
        onChange?.(value);
        onPress?.();
      },
      [touchId, fixed, radius, calculateValue, onChange, onPress]
    );

    // Handle touch move
    const handleTouchMove = useCallback(
      (e: React.TouchEvent) => {
        e.preventDefault();

        if (touchId === null) return;

        // Find our touch
        let touch: React.Touch | undefined;
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === touchId) {
            touch = e.changedTouches[i];
            break;
          }
        }

        if (!touch) return;

        let centerX: number;
        let centerY: number;

        if (!fixed && dynamicPosition) {
          centerX = dynamicPosition.x;
          centerY = dynamicPosition.y;
        } else {
          const rect = containerRef.current?.getBoundingClientRect();
          if (!rect) return;
          centerX = rect.left + radius;
          centerY = rect.top + radius;
        }

        const dx = touch.clientX - centerX;
        const dy = touch.clientY - centerY;

        const value = calculateValue(dx, dy);
        setPosition(value);
        onChange?.(value);
      },
      [touchId, fixed, dynamicPosition, radius, calculateValue, onChange]
    );

    // Handle touch end
    const handleTouchEnd = useCallback(
      (e: React.TouchEvent) => {
        e.preventDefault();

        // Check if our touch ended
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === touchId) {
            setTouchId(null);
            setIsActive(false);
            setPosition({ x: 0, y: 0 });
            setDynamicPosition(null);
            onChange?.({ x: 0, y: 0 });
            onRelease?.();
            break;
          }
        }
      },
      [touchId, onChange, onRelease]
    );

    // Handle touch cancel
    const handleTouchCancel = useCallback(() => {
      setTouchId(null);
      setIsActive(false);
      setPosition({ x: 0, y: 0 });
      setDynamicPosition(null);
      onChange?.({ x: 0, y: 0 });
      onRelease?.();
    }, [onChange, onRelease]);

    // Clean up on unmount
    useEffect(() => {
      return () => {
        if (isActive) {
          onRelease?.();
        }
      };
    }, [isActive, onRelease]);

    // Calculate stick visual position
    const stickVisualPosition = {
      x: position.x * (radius - stickRadius),
      y: position.y * (radius - stickRadius),
    };

    // Container styles
    const containerStyle: React.CSSProperties = {
      position: 'fixed',
      width: size,
      height: size,
      opacity: isActive ? activeOpacity : inactiveOpacity,
      transition: isActive ? 'none' : 'opacity 0.2s ease',
      touchAction: 'none',
      userSelect: 'none',
      pointerEvents: 'auto',
      zIndex: 1000,
      ...(left !== undefined && { left: typeof left === 'number' ? left : left }),
      ...(right !== undefined && { right: typeof right === 'number' ? right : right }),
      ...(bottom !== undefined && { bottom: typeof bottom === 'number' ? bottom : bottom }),
      ...(dynamicPosition && {
        left: dynamicPosition.x - radius,
        top: dynamicPosition.y - radius,
        bottom: undefined,
        right: undefined,
      }),
    };

    if (!visible) {
      return null;
    }

    return (
      <div
        ref={containerRef}
        data-joystick-id={id}
        className={`virtual-joystick ${className}`}
        style={containerStyle}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
      >
        {/* Base circle */}
        <div
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            backgroundColor: baseColor,
            border: `2px solid ${borderColor}`,
            boxShadow: 'inset 0 0 10px rgba(0, 0, 0, 0.3)',
          }}
        />

        {/* Stick */}
        <div
          style={{
            position: 'absolute',
            width: stickRadius * 2,
            height: stickRadius * 2,
            left: radius - stickRadius + stickVisualPosition.x,
            top: radius - stickRadius + stickVisualPosition.y,
            borderRadius: '50%',
            backgroundColor: stickColor,
            border: `2px solid ${borderColor}`,
            boxShadow: isActive
              ? '0 0 15px rgba(255, 255, 255, 0.5)'
              : '0 2px 5px rgba(0, 0, 0, 0.3)',
            transform: 'translate(-50%, -50%)',
            transition: isActive ? 'none' : 'all 0.2s ease',
          }}
        />

        {/* Feedback indicator (optional) */}
        {showFeedback && isActive && (
          <>
            {/* Direction indicator */}
            <div
              style={{
                position: 'absolute',
                width: 4,
                height: radius * 0.8,
                left: radius,
                top: radius - radius * 0.8,
                backgroundColor: 'rgba(255, 255, 255, 0.3)',
                transformOrigin: 'center bottom',
                transform: `translate(-50%, 0) rotate(${Math.atan2(position.y, position.x) + Math.PI / 2}rad)`,
                borderRadius: 2,
              }}
            />
          </>
        )}
      </div>
    );
  }
);

VirtualJoystick.displayName = 'VirtualJoystick';

/**
 * Props for VirtualButton component
 */
export interface VirtualButtonProps {
  /** Unique identifier */
  id: string;
  /** Button label */
  label?: string;
  /** Size in pixels */
  size?: number;
  /** Position from left */
  left?: string | number;
  /** Position from bottom */
  bottom?: string | number;
  /** Position from right */
  right?: string | number;
  /** Button color */
  color?: string;
  /** Whether button is pressed */
  pressed?: boolean;
  /** Callback when pressed */
  onPress?: () => void;
  /** Callback when released */
  onRelease?: () => void;
  /** Additional CSS class */
  className?: string;
}

/**
 * Virtual Button for mobile touch controls
 */
export const VirtualButton = forwardRef<HTMLDivElement, VirtualButtonProps>(
  (
    {
      id,
      label,
      size = 60,
      left,
      bottom,
      right,
      color = 'rgba(255, 255, 255, 0.3)',
      onPress,
      onRelease,
      className = '',
    },
    ref
  ) => {
    const [isPressed, setIsPressed] = useState(false);

    const handleTouchStart = useCallback(
      (e: React.TouchEvent) => {
        e.preventDefault();
        setIsPressed(true);
        onPress?.();
      },
      [onPress]
    );

    const handleTouchEnd = useCallback(
      (e: React.TouchEvent) => {
        e.preventDefault();
        setIsPressed(false);
        onRelease?.();
      },
      [onRelease]
    );

    const containerStyle: React.CSSProperties = {
      position: 'fixed',
      width: size,
      height: size,
      borderRadius: '50%',
      backgroundColor: isPressed ? color : 'rgba(255, 255, 255, 0.2)',
      border: `2px solid ${color}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'white',
      fontSize: size * 0.3,
      fontWeight: 'bold',
      touchAction: 'none',
      userSelect: 'none',
      zIndex: 1000,
      transition: isPressed ? 'none' : 'all 0.1s ease',
      transform: isPressed ? 'scale(0.95)' : 'scale(1)',
      ...(left !== undefined && { left: typeof left === 'number' ? left : left }),
      ...(right !== undefined && { right: typeof right === 'number' ? right : right }),
      ...(bottom !== undefined && { bottom: typeof bottom === 'number' ? bottom : bottom }),
    };

    return (
      <div
        ref={ref}
        data-button-id={id}
        className={`virtual-button ${className}`}
        style={containerStyle}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        {label}
      </div>
    );
  }
);

VirtualButton.displayName = 'VirtualButton';

/**
 * Props for VirtualDPad component
 */
export interface VirtualDPadProps {
  /** Unique identifier */
  id: string;
  /** Size in pixels */
  size?: number;
  /** Position from left */
  left?: string | number;
  /** Position from bottom */
  bottom?: string | number;
  /** Position from right */
  right?: string | number;
  /** Callback for direction change */
  onChange?: (direction: { x: number; y: number }) => void;
  /** Additional CSS class */
  className?: string;
}

/**
 * Virtual D-Pad for mobile touch controls
 */
export const VirtualDPad = forwardRef<HTMLDivElement, VirtualDPadProps>(
  (
    {
      id,
      size = 120,
      left,
      bottom,
      right,
      onChange,
      className = '',
    },
    ref
  ) => {
    const [activeDirection, setActiveDirection] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const [touchId, setTouchId] = useState<number | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const buttonSize = size / 3;

    const handleTouch = useCallback(
      (e: React.TouchEvent, isEnd: boolean) => {
        e.preventDefault();

        if (isEnd) {
          setActiveDirection({ x: 0, y: 0 });
          setTouchId(null);
          onChange?.({ x: 0, y: 0 });
          return;
        }

        const touch = e.changedTouches[0];
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;

        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const dx = touch.clientX - centerX;
        const dy = touch.clientY - centerY;

        const threshold = buttonSize * 0.5;
        const direction = { x: 0, y: 0 };

        if (Math.abs(dx) > threshold || Math.abs(dy) > threshold) {
          if (Math.abs(dx) > Math.abs(dy)) {
            direction.x = dx > 0 ? 1 : -1;
          } else {
            direction.y = dy > 0 ? 1 : -1;
          }
        }

        setActiveDirection(direction);
        onChange?.(direction);
        setTouchId(touch.identifier);
      },
      [buttonSize, onChange]
    );

    const containerStyle: React.CSSProperties = {
      position: 'fixed',
      width: size,
      height: size,
      touchAction: 'none',
      userSelect: 'none',
      zIndex: 1000,
      ...(left !== undefined && { left: typeof left === 'number' ? left : left }),
      ...(right !== undefined && { right: typeof right === 'number' ? right : right }),
      ...(bottom !== undefined && { bottom: typeof bottom === 'number' ? bottom : bottom }),
    };

    const buttonStyle = (active: boolean): React.CSSProperties => ({
      position: 'absolute',
      width: buttonSize,
      height: buttonSize,
      backgroundColor: active ? 'rgba(255, 255, 255, 0.5)' : 'rgba(255, 255, 255, 0.2)',
      border: '2px solid rgba(255, 255, 255, 0.3)',
      borderRadius: 4,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'white',
      fontSize: buttonSize * 0.4,
    });

    return (
      <div
        ref={(node) => {
          // Handle both refs
          (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
          if (typeof ref === 'function') ref(node);
          else if (ref) ref.current = node;
        }}
        data-dpad-id={id}
        className={`virtual-dpad ${className}`}
        style={containerStyle}
        onTouchStart={(e) => handleTouch(e, false)}
        onTouchMove={(e) => handleTouch(e, false)}
        onTouchEnd={(e) => handleTouch(e, true)}
        onTouchCancel={(e) => handleTouch(e, true)}
      >
        {/* Up */}
        <div style={{ ...buttonStyle(activeDirection.y < 0), top: 0, left: buttonSize }}>
          ▲
        </div>
        {/* Down */}
        <div style={{ ...buttonStyle(activeDirection.y > 0), bottom: 0, left: buttonSize }}>
          ▼
        </div>
        {/* Left */}
        <div style={{ ...buttonStyle(activeDirection.x < 0), top: buttonSize, left: 0 }}>
          ◀
        </div>
        {/* Right */}
        <div style={{ ...buttonStyle(activeDirection.x > 0), top: buttonSize, right: 0 }}>
          ▶
        </div>
        {/* Center */}
        <div
          style={{
            ...buttonStyle(false),
            top: buttonSize,
            left: buttonSize,
            borderRadius: '50%',
          }}
        />
      </div>
    );
  }
);

VirtualDPad.displayName = 'VirtualDPad';

export default VirtualJoystick;
