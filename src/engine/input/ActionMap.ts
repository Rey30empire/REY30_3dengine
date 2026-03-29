// ============================================
// ActionMap - Predefined Action Maps
// REY30 3D Engine - Input System
// ============================================

import {
  InputActionMap,
  InputActionDefinition,
  SerializableInputBindings,
} from './types';
import { KeyCode, GamepadButton, GamepadAxis, MouseButton } from './KeyCode';
import { InputActionBuilder, InputBindingBuilder, InputMap } from './InputMap';

/**
 * Create Player Movement Action Map
 * 
 * Bindings:
 * - Move X: A/D, Arrow Left/Right, Left Stick X
 * - Move Y: W/S, Arrow Up/Down, Left Stick Y
 * - Jump: Space, Face Down (A/Cross)
 * - Sprint: Shift, Left Stick Click (L3)
 * - Crouch: C, Face Right (B/Circle)
 * - Walk Toggle: Caps Lock
 */
export function createPlayerMovementActionMap(): InputActionMap {
  const actions: InputActionDefinition[] = [
    // Horizontal Movement
    InputActionBuilder.create('moveX')
      .displayName('Move Horizontal')
      .description('Horizontal movement axis')
      .category('Movement')
      .asAxis()
      .addBinding(builder => builder
        .keyboard(KeyCode.A).keyboard(KeyCode.D)
        .keyboard(KeyCode.ArrowLeft).keyboard(KeyCode.ArrowRight)
        .gamepadAxis(GamepadAxis.LeftStickX)
      )
      .build(),

    // Vertical Movement
    InputActionBuilder.create('moveY')
      .displayName('Move Vertical')
      .description('Vertical movement axis')
      .category('Movement')
      .asAxis()
      .addBinding(builder => builder
        .keyboard(KeyCode.W).keyboard(KeyCode.S)
        .keyboard(KeyCode.ArrowUp).keyboard(KeyCode.ArrowDown)
        .gamepadAxis(GamepadAxis.LeftStickY)
      )
      .build(),

    // Jump
    InputActionBuilder.create('jump')
      .displayName('Jump')
      .description('Makes the character jump')
      .category('Movement')
      .addBinding(builder => builder
        .keyboard(KeyCode.Space)
        .gamepadButton(GamepadButton.FaceDown)
      )
      .build(),

    // Sprint
    InputActionBuilder.create('sprint')
      .displayName('Sprint')
      .description('Hold to sprint')
      .category('Movement')
      .addBinding(builder => builder
        .keyboard(KeyCode.ShiftLeft)
        .keyboard(KeyCode.ShiftRight)
        .gamepadButton(GamepadButton.LeftStick)
      )
      .build(),

    // Crouch
    InputActionBuilder.create('crouch')
      .displayName('Crouch')
      .description('Hold to crouch')
      .category('Movement')
      .addBinding(builder => builder
        .keyboard(KeyCode.C)
        .keyboard(KeyCode.ControlLeft)
        .gamepadButton(GamepadButton.FaceRight)
      )
      .build(),

    // Walk Toggle
    InputActionBuilder.create('walkToggle')
      .displayName('Walk Toggle')
      .description('Toggle between walk and run')
      .category('Movement')
      .addBinding(builder => builder
        .keyboard(KeyCode.CapsLock)
        .gamepadButton(GamepadButton.LeftBumper)
      )
      .build(),
  ];

  return {
    name: 'PlayerMovement',
    displayName: 'Player Movement',
    description: 'Basic player movement controls',
    actions,
    priority: 10,
    enabled: true,
  };
}

/**
 * Create Camera Action Map
 * 
 * Bindings:
 * - Camera X: Mouse movement, Right Stick X
 * - Camera Y: Mouse movement, Right Stick Y
 * - Zoom In: Scroll Up, Right Trigger
 * - Zoom Out: Scroll Down, Left Trigger
 * - Camera Reset: Home, Right Stick Click (R3)
 * - Lock Target: Tab, Right Bumper (R1)
 */
export function createCameraActionMap(): InputActionMap {
  const actions: InputActionDefinition[] = [
    // Camera Horizontal
    InputActionBuilder.create('cameraX')
      .displayName('Camera Horizontal')
      .description('Horizontal camera rotation')
      .category('Camera')
      .asAxis()
      .addBinding(builder => builder
        .gamepadAxis(GamepadAxis.RightStickX)
        .withSensitivity(0.5)
      )
      .build(),

    // Camera Vertical
    InputActionBuilder.create('cameraY')
      .displayName('Camera Vertical')
      .description('Vertical camera rotation')
      .category('Camera')
      .asAxis()
      .addBinding(builder => builder
        .gamepadAxis(GamepadAxis.RightStickY)
        .withSensitivity(0.5)
      )
      .build(),

    // Zoom In
    InputActionBuilder.create('zoomIn')
      .displayName('Zoom In')
      .description('Zoom camera in')
      .category('Camera')
      .addBinding(builder => builder
        .gamepadButton(GamepadButton.RightTrigger)
      )
      .build(),

    // Zoom Out
    InputActionBuilder.create('zoomOut')
      .displayName('Zoom Out')
      .description('Zoom camera out')
      .category('Camera')
      .addBinding(builder => builder
        .gamepadButton(GamepadButton.LeftTrigger)
      )
      .build(),

    // Camera Reset
    InputActionBuilder.create('cameraReset')
      .displayName('Reset Camera')
      .description('Reset camera to default position')
      .category('Camera')
      .addBinding(builder => builder
        .keyboard(KeyCode.Home)
        .gamepadButton(GamepadButton.RightStick)
      )
      .build(),

    // Lock Target
    InputActionBuilder.create('lockTarget')
      .displayName('Lock Target')
      .description('Lock camera to nearest target')
      .category('Camera')
      .addBinding(builder => builder
        .keyboard(KeyCode.Tab)
        .gamepadButton(GamepadButton.RightBumper)
      )
      .build(),
  ];

  return {
    name: 'Camera',
    displayName: 'Camera Controls',
    description: 'Camera manipulation controls',
    actions,
    priority: 9,
    enabled: true,
  };
}

/**
 * Create Combat Action Map
 * 
 * Bindings:
 * - Attack: Left Mouse, Face Left (X/Square)
 * - Heavy Attack: Right Mouse, Face Up (Y/Triangle)
 * - Block: Middle Mouse, Left Bumper (L1)
 * - Parry: Q, Left Trigger
 * - Special 1: 1, D-Pad Up
 * - Special 2: 2, D-Pad Right
 * - Special 3: 3, D-Pad Down
 * - Special 4: 4, D-Pad Left
 * - Dodge: Shift + Space, Face Right (B/Circle)
 * - Interact: E, Face Down (A/Cross)
 */
export function createCombatActionMap(): InputActionMap {
  const actions: InputActionDefinition[] = [
    // Primary Attack
    InputActionBuilder.create('attack')
      .displayName('Attack')
      .description('Primary attack action')
      .category('Combat')
      .addBinding(builder => builder
        .mouseButton(MouseButton.Left)
        .gamepadButton(GamepadButton.FaceLeft)
      )
      .build(),

    // Heavy Attack
    InputActionBuilder.create('heavyAttack')
      .displayName('Heavy Attack')
      .description('Heavy/special attack action')
      .category('Combat')
      .addBinding(builder => builder
        .mouseButton(MouseButton.Right)
        .gamepadButton(GamepadButton.FaceUp)
      )
      .build(),

    // Block
    InputActionBuilder.create('block')
      .displayName('Block')
      .description('Hold to block incoming attacks')
      .category('Combat')
      .addBinding(builder => builder
        .mouseButton(MouseButton.Middle)
        .gamepadButton(GamepadButton.LeftBumper)
      )
      .build(),

    // Parry
    InputActionBuilder.create('parry')
      .displayName('Parry')
      .description('Perfect timing parry')
      .category('Combat')
      .addBinding(builder => builder
        .keyboard(KeyCode.Q)
        .gamepadButton(GamepadButton.LeftTrigger)
      )
      .build(),

    // Special Ability 1
    InputActionBuilder.create('special1')
      .displayName('Special Ability 1')
      .description('First special ability')
      .category('Combat')
      .addBinding(builder => builder
        .keyboard(KeyCode.Digit1)
        .gamepadButton(GamepadButton.DPadUp)
      )
      .build(),

    // Special Ability 2
    InputActionBuilder.create('special2')
      .displayName('Special Ability 2')
      .description('Second special ability')
      .category('Combat')
      .addBinding(builder => builder
        .keyboard(KeyCode.Digit2)
        .gamepadButton(GamepadButton.DPadRight)
      )
      .build(),

    // Special Ability 3
    InputActionBuilder.create('special3')
      .displayName('Special Ability 3')
      .description('Third special ability')
      .category('Combat')
      .addBinding(builder => builder
        .keyboard(KeyCode.Digit3)
        .gamepadButton(GamepadButton.DPadDown)
      )
      .build(),

    // Special Ability 4
    InputActionBuilder.create('special4')
      .displayName('Special Ability 4')
      .description('Fourth special ability')
      .category('Combat')
      .addBinding(builder => builder
        .keyboard(KeyCode.Digit4)
        .gamepadButton(GamepadButton.DPadLeft)
      )
      .build(),

    // Dodge/Roll
    InputActionBuilder.create('dodge')
      .displayName('Dodge')
      .description('Dodge roll in movement direction')
      .category('Combat')
      .addBinding(builder => builder
        .gamepadButton(GamepadButton.FaceRight)
      )
      .build(),

    // Interact
    InputActionBuilder.create('interact')
      .displayName('Interact')
      .description('Interact with objects and NPCs')
      .category('Combat')
      .addBinding(builder => builder
        .keyboard(KeyCode.E)
        .gamepadButton(GamepadButton.FaceDown)
      )
      .build(),
  ];

  return {
    name: 'Combat',
    displayName: 'Combat Controls',
    description: 'Combat and interaction controls',
    actions,
    priority: 8,
    enabled: true,
  };
}

/**
 * Create UI Action Map
 * 
 * Bindings:
 * - Confirm: Enter, Space, Face Down (A/Cross)
 * - Cancel: Escape, Face Right (B/Circle)
 * - Menu: Escape, Start
 * - Inventory: I, Select/Back
 * - Map: M, D-Pad Up
 * - Journal: J
 * - Character: C
 * - Pause: Escape, Start
 * - Next Tab: Tab
 * - Previous Tab: Shift + Tab
 */
export function createUIActionMap(): InputActionMap {
  const actions: InputActionDefinition[] = [
    // Confirm
    InputActionBuilder.create('confirm')
      .displayName('Confirm')
      .description('Confirm selection')
      .category('UI')
      .addBinding(builder => builder
        .keyboard(KeyCode.Enter)
        .keyboard(KeyCode.Space)
        .keyboard(KeyCode.NumpadEnter)
        .gamepadButton(GamepadButton.FaceDown)
      )
      .build(),

    // Cancel
    InputActionBuilder.create('cancel')
      .displayName('Cancel')
      .description('Cancel or go back')
      .category('UI')
      .addBinding(builder => builder
        .keyboard(KeyCode.Escape)
        .gamepadButton(GamepadButton.FaceRight)
      )
      .build(),

    // Pause/Menu
    InputActionBuilder.create('pause')
      .displayName('Pause')
      .description('Open pause menu')
      .category('UI')
      .addBinding(builder => builder
        .keyboard(KeyCode.Escape)
        .gamepadButton(GamepadButton.Start)
      )
      .build(),

    // Inventory
    InputActionBuilder.create('inventory')
      .displayName('Inventory')
      .description('Open inventory screen')
      .category('UI')
      .addBinding(builder => builder
        .keyboard(KeyCode.I)
        .gamepadButton(GamepadButton.Select)
      )
      .build(),

    // Map
    InputActionBuilder.create('map')
      .displayName('Map')
      .description('Open map screen')
      .category('UI')
      .addBinding(builder => builder
        .keyboard(KeyCode.M)
        .gamepadButton(GamepadButton.DPadUp)
      )
      .build(),

    // Journal/Quests
    InputActionBuilder.create('journal')
      .displayName('Journal')
      .description('Open journal/quest log')
      .category('UI')
      .addBinding(builder => builder
        .keyboard(KeyCode.J)
      )
      .build(),

    // Character Sheet
    InputActionBuilder.create('character')
      .displayName('Character')
      .description('Open character sheet')
      .category('UI')
      .addBinding(builder => builder
        .keyboard(KeyCode.C)
      )
      .build(),

    // Next Tab
    InputActionBuilder.create('nextTab')
      .displayName('Next Tab')
      .description('Switch to next tab')
      .category('UI')
      .addBinding(builder => builder
        .keyboard(KeyCode.Tab)
        .gamepadButton(GamepadButton.RightBumper)
      )
      .build(),

    // Previous Tab
    InputActionBuilder.create('prevTab')
      .displayName('Previous Tab')
      .description('Switch to previous tab')
      .category('UI')
      .addBinding(builder => builder
        .keyboard(KeyCode.Tab)
        .gamepadButton(GamepadButton.LeftBumper)
      )
      .build(),

    // Up
    InputActionBuilder.create('uiUp')
      .displayName('Navigate Up')
      .description('Navigate UI up')
      .category('UI')
      .addBinding(builder => builder
        .keyboard(KeyCode.ArrowUp)
        .keyboard(KeyCode.W)
        .gamepadButton(GamepadButton.DPadUp)
      )
      .build(),

    // Down
    InputActionBuilder.create('uiDown')
      .displayName('Navigate Down')
      .description('Navigate UI down')
      .category('UI')
      .addBinding(builder => builder
        .keyboard(KeyCode.ArrowDown)
        .keyboard(KeyCode.S)
        .gamepadButton(GamepadButton.DPadDown)
      )
      .build(),

    // Left
    InputActionBuilder.create('uiLeft')
      .displayName('Navigate Left')
      .description('Navigate UI left')
      .category('UI')
      .addBinding(builder => builder
        .keyboard(KeyCode.ArrowLeft)
        .keyboard(KeyCode.A)
        .gamepadButton(GamepadButton.DPadLeft)
      )
      .build(),

    // Right
    InputActionBuilder.create('uiRight')
      .displayName('Navigate Right')
      .description('Navigate UI right')
      .category('UI')
      .addBinding(builder => builder
        .keyboard(KeyCode.ArrowRight)
        .keyboard(KeyCode.D)
        .gamepadButton(GamepadButton.DPadRight)
      )
      .build(),
  ];

  return {
    name: 'UI',
    displayName: 'UI Controls',
    description: 'User interface navigation controls',
    actions,
    priority: 100, // Highest priority
    enabled: true,
  };
}

/**
 * Create Vehicle Action Map
 * 
 * Bindings:
 * - Accelerate: W, Right Trigger
 * - Brake/Reverse: S, Left Trigger
 * - Steer Left: A, Left Stick Left
 * - Steer Right: D, Left Stick Right
 * - Handbrake: Space, Face Down (A/Cross)
 * - Horn: H, Face Left (X/Square)
 * - Camera Look Behind: B, Face Right (B/Circle)
 */
export function createVehicleActionMap(): InputActionMap {
  const actions: InputActionDefinition[] = [
    InputActionBuilder.create('accelerate')
      .displayName('Accelerate')
      .description('Accelerate vehicle')
      .category('Vehicle')
      .addBinding(builder => builder
        .keyboard(KeyCode.W)
        .keyboard(KeyCode.ArrowUp)
        .gamepadAxis(GamepadAxis.RightStickY).inverted()
      )
      .build(),

    InputActionBuilder.create('brake')
      .displayName('Brake/Reverse')
      .description('Brake or reverse vehicle')
      .category('Vehicle')
      .addBinding(builder => builder
        .keyboard(KeyCode.S)
        .keyboard(KeyCode.ArrowDown)
        .gamepadAxis(GamepadAxis.LeftStickY).inverted()
      )
      .build(),

    InputActionBuilder.create('steer')
      .displayName('Steer')
      .description('Steering axis')
      .category('Vehicle')
      .asAxis()
      .addBinding(builder => builder
        .keyboard(KeyCode.A).keyboard(KeyCode.D)
        .gamepadAxis(GamepadAxis.LeftStickX)
      )
      .build(),

    InputActionBuilder.create('handbrake')
      .displayName('Handbrake')
      .description('Handbrake for drifting')
      .category('Vehicle')
      .addBinding(builder => builder
        .keyboard(KeyCode.Space)
        .gamepadButton(GamepadButton.FaceDown)
      )
      .build(),

    InputActionBuilder.create('horn')
      .displayName('Horn')
      .description('Vehicle horn')
      .category('Vehicle')
      .addBinding(builder => builder
        .keyboard(KeyCode.H)
        .gamepadButton(GamepadButton.FaceLeft)
      )
      .build(),

    InputActionBuilder.create('lookBehind')
      .displayName('Look Behind')
      .description('Look behind vehicle')
      .category('Vehicle')
      .addBinding(builder => builder
        .keyboard(KeyCode.B)
        .gamepadButton(GamepadButton.FaceRight)
      )
      .build(),
  ];

  return {
    name: 'Vehicle',
    displayName: 'Vehicle Controls',
    description: 'Vehicle driving controls',
    actions,
    priority: 7,
    enabled: false,
  };
}

/**
 * Action Map Manager
 * Handles loading, saving, and managing multiple action maps.
 */
export class ActionMapManager {
  private actionMaps: Map<string, InputActionMap> = new Map();
  private inputMap: InputMap;

  constructor(inputMap: InputMap) {
    this.inputMap = inputMap;
  }

  /**
   * Register an action map
   */
  registerActionMap(actionMap: InputActionMap): void {
    this.actionMaps.set(actionMap.name, actionMap);
    this.inputMap.registerActions(actionMap.actions);
  }

  /**
   * Load all default action maps
   */
  loadDefaultActionMaps(): void {
    this.registerActionMap(createPlayerMovementActionMap());
    this.registerActionMap(createCameraActionMap());
    this.registerActionMap(createCombatActionMap());
    this.registerActionMap(createUIActionMap());
    this.registerActionMap(createVehicleActionMap());
  }

  /**
   * Get action map by name
   */
  getActionMap(name: string): InputActionMap | undefined {
    return this.actionMaps.get(name);
  }

  /**
   * Get all action maps
   */
  getAllActionMaps(): InputActionMap[] {
    return Array.from(this.actionMaps.values());
  }

  /**
   * Get enabled action maps sorted by priority
   */
  getEnabledActionMaps(): InputActionMap[] {
    return this.getAllActionMaps()
      .filter(am => am.enabled)
      .sort((a, b) => b.priority - a.priority);
  }

  /**
   * Enable/disable an action map
   */
  setActionMapEnabled(name: string, enabled: boolean): boolean {
    const actionMap = this.actionMaps.get(name);
    if (actionMap) {
      actionMap.enabled = enabled;
      return true;
    }
    return false;
  }

  /**
   * Remove an action map
   */
  removeActionMap(name: string): boolean {
    const actionMap = this.actionMaps.get(name);
    if (actionMap) {
      actionMap.actions.forEach(action => {
        this.inputMap.removeAction(action.name);
      });
      this.actionMaps.delete(name);
      return true;
    }
    return false;
  }

  /**
   * Save all bindings to local storage
   */
  saveToLocalStorage(key: string = 'rey30-input-bindings'): void {
    const data = this.inputMap.serialize();
    localStorage.setItem(key, JSON.stringify(data));
  }

  /**
   * Load bindings from local storage
   */
  loadFromLocalStorage(key: string = 'rey30-input-bindings'): boolean {
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        const data: SerializableInputBindings = JSON.parse(saved);
        this.inputMap.deserialize(data);
        return true;
      } catch (e) {
        console.error('Failed to load input bindings:', e);
        return false;
      }
    }
    return false;
  }

  /**
   * Reset all bindings to defaults
   */
  resetToDefaults(): void {
    this.inputMap.resetAllToDefaults();
  }

  /**
   * Clear all action maps
   */
  clear(): void {
    this.actionMaps.clear();
    this.inputMap.clear();
  }
}

/**
 * Create a new ActionMapManager with default maps
 */
export function createActionMapManager(inputMap: InputMap): ActionMapManager {
  const manager = new ActionMapManager(inputMap);
  manager.loadDefaultActionMaps();
  return manager;
}
