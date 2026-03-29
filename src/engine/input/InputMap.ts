// ============================================
// InputMap - Action Mapping System
// REY30 3D Engine - Input System
// ============================================

import { v4 as uuidv4 } from 'uuid';
import {
  InputBinding,
  InputActionDefinition,
  InputAction,
  AxisConfig,
  ModifierBinding,
  InputDeviceType,
  SerializableInputBindings,
} from './types';
import { KeyCode, GamepadButton, GamepadAxis, MouseButton } from './KeyCode';

/**
 * Builder class for creating input bindings fluently.
 * 
 * @example
 * ```typescript
 * const binding = InputBindingBuilder.create()
 *   .keyboard(KeyCode.Space)
 *   .gamepadButton(GamepadButton.FaceDown)
 *   .withDeadZone(0.2)
 *   .build();
 * ```
 */
export class InputBindingBuilder {
  private bindings: InputBinding[] = [];

  private constructor() {}

  /**
   * Create a new binding builder
   */
  static create(): InputBindingBuilder {
    return new InputBindingBuilder();
  }

  /**
   * Add a keyboard key binding
   */
  keyboard(code: KeyCode): this {
    this.bindings.push({
      id: uuidv4(),
      deviceType: 'keyboard',
      input: code,
      enabled: true,
    });
    return this;
  }

  /**
   * Add a keyboard binding with modifiers
   */
  keyboardWithModifiers(code: KeyCode, modifiers: ModifierBinding[]): this {
    this.bindings.push({
      id: uuidv4(),
      deviceType: 'keyboard',
      input: code,
      modifiers,
      enabled: true,
    });
    return this;
  }

  /**
   * Add a mouse button binding
   */
  mouseButton(button: MouseButton): this {
    this.bindings.push({
      id: uuidv4(),
      deviceType: 'mouse',
      input: button,
      enabled: true,
    });
    return this;
  }

  /**
   * Add a gamepad button binding
   */
  gamepadButton(button: GamepadButton): this {
    this.bindings.push({
      id: uuidv4(),
      deviceType: 'gamepad',
      input: button,
      enabled: true,
    });
    return this;
  }

  /**
   * Add a gamepad axis binding
   */
  gamepadAxis(axis: GamepadAxis, config?: Partial<AxisConfig>): this {
    this.bindings.push({
      id: uuidv4(),
      deviceType: 'gamepad',
      input: axis,
      enabled: true,
      axisConfig: {
        deadZone: 0.15,
        sensitivity: 1.0,
        invert: false,
        mode: 'analog',
        ...config,
      },
    });
    return this;
  }

  /**
   * Add a touch input binding
   */
  touch(type: 'tap' | 'doubleTap' | 'longPress' | 'swipeLeft' | 'swipeRight' | 'swipeUp' | 'swipeDown'): this {
    this.bindings.push({
      id: uuidv4(),
      deviceType: 'touch',
      input: type,
      enabled: true,
    });
    return this;
  }

  /**
   * Set dead zone for the last binding
   */
  withDeadZone(deadZone: number): this {
    if (this.bindings.length > 0) {
      const last = this.bindings[this.bindings.length - 1];
      if (last.deviceType === 'gamepad' && typeof last.input === 'number') {
        last.axisConfig = {
          ...last.axisConfig,
          deadZone,
          sensitivity: last.axisConfig?.sensitivity ?? 1.0,
          invert: last.axisConfig?.invert ?? false,
          mode: last.axisConfig?.mode ?? 'analog',
        };
      }
    }
    return this;
  }

  /**
   * Set sensitivity for the last binding
   */
  withSensitivity(sensitivity: number): this {
    if (this.bindings.length > 0) {
      const last = this.bindings[this.bindings.length - 1];
      if (!last.axisConfig) {
        last.axisConfig = {
          deadZone: 0.15,
          sensitivity,
          invert: false,
          mode: 'analog',
        };
      } else {
        last.axisConfig.sensitivity = sensitivity;
      }
    }
    return this;
  }

  /**
   * Invert the last axis binding
   */
  inverted(): this {
    if (this.bindings.length > 0) {
      const last = this.bindings[this.bindings.length - 1];
      if (last.axisConfig) {
        last.axisConfig.invert = true;
      }
    }
    return this;
  }

  /**
   * Set digital mode for axis
   */
  asDigital(threshold: number = 0.5): this {
    if (this.bindings.length > 0) {
      const last = this.bindings[this.bindings.length - 1];
      if (last.axisConfig) {
        last.axisConfig.mode = 'digital';
        last.axisConfig.threshold = threshold;
      }
    }
    return this;
  }

  /**
   * Get all built bindings
   */
  build(): InputBinding[] {
    return [...this.bindings];
  }
}

/**
 * Builder class for creating input action definitions.
 * 
 * @example
 * ```typescript
 * const jumpAction = InputActionBuilder.create('jump')
 *   .displayName('Jump')
 *   .description('Makes the character jump')
 *   .category('Movement')
 *   .addBinding(builder => builder
 *     .keyboard(KeyCode.Space)
 *     .gamepadButton(GamepadButton.FaceDown)
 *   )
 *   .build();
 * ```
 */
export class InputActionBuilder {
  private action: Partial<InputActionDefinition>;

  private constructor(name: string) {
    this.action = {
      name,
      displayName: name,
      bindings: [],
      defaultBindings: [],
      isAxis: false,
    };
  }

  /**
   * Create a new action builder
   */
  static create(name: string): InputActionBuilder {
    return new InputActionBuilder(name);
  }

  /**
   * Set display name
   */
  displayName(name: string): this {
    this.action.displayName = name;
    return this;
  }

  /**
   * Set description
   */
  description(desc: string): this {
    this.action.description = desc;
    return this;
  }

  /**
   * Set category
   */
  category(cat: string): this {
    this.action.category = cat;
    return this;
  }

  /**
   * Mark as axis action
   */
  asAxis(): this {
    this.action.isAxis = true;
    return this;
  }

  /**
   * Add bindings using a builder function
   */
  addBinding(builder: (b: InputBindingBuilder) => InputBindingBuilder): this {
    const bindingBuilder = InputBindingBuilder.create();
    const result = builder(bindingBuilder);
    const bindings = result.build();
    this.action.bindings!.push(...bindings);
    this.action.defaultBindings!.push(...bindings.map(b => ({ ...b, id: uuidv4() })));
    return this;
  }

  /**
   * Add a simple keyboard binding
   */
  addKey(code: KeyCode): this {
    const binding: InputBinding = {
      id: uuidv4(),
      deviceType: 'keyboard',
      input: code,
      enabled: true,
    };
    this.action.bindings!.push(binding);
    this.action.defaultBindings!.push({ ...binding, id: uuidv4() });
    return this;
  }

  /**
   * Add a simple gamepad button binding
   */
  addGamepadButton(button: GamepadButton): this {
    const binding: InputBinding = {
      id: uuidv4(),
      deviceType: 'gamepad',
      input: button,
      enabled: true,
    };
    this.action.bindings!.push(binding);
    this.action.defaultBindings!.push({ ...binding, id: uuidv4() });
    return this;
  }

  /**
   * Add gamepad axis binding
   */
  addGamepadAxis(axis: GamepadAxis, config?: Partial<AxisConfig>): this {
    const binding: InputBinding = {
      id: uuidv4(),
      deviceType: 'gamepad',
      input: axis,
      enabled: true,
      axisConfig: {
        deadZone: 0.15,
        sensitivity: 1.0,
        invert: false,
        mode: 'analog',
        ...config,
      },
    };
    this.action.bindings!.push(binding);
    this.action.defaultBindings!.push({ ...binding, id: uuidv4() });
    return this;
  }

  /**
   * Build the action definition
   */
  build(): InputActionDefinition {
    return {
      name: this.action.name!,
      displayName: this.action.displayName!,
      description: this.action.description,
      bindings: this.action.bindings!,
      category: this.action.category,
      isAxis: this.action.isAxis,
      defaultBindings: this.action.defaultBindings!,
    };
  }
}

/**
 * Input Map manages action definitions and their bindings.
 * Handles saving/loading and rebinding of controls.
 */
export class InputMap {
  private actions: Map<string, InputActionDefinition> = new Map();
  private actionStates: Map<string, InputAction> = new Map();

  /**
   * Register an action definition
   */
  registerAction(definition: InputActionDefinition): void {
    this.actions.set(definition.name, definition);
    this.actionStates.set(definition.name, {
      name: definition.name,
      active: false,
      justPressed: false,
      justReleased: false,
      value: 0,
      rawValue: 0,
      duration: 0,
    });
  }

  /**
   * Register multiple actions
   */
  registerActions(definitions: InputActionDefinition[]): void {
    definitions.forEach(def => this.registerAction(def));
  }

  /**
   * Get action definition
   */
  getActionDefinition(name: string): InputActionDefinition | undefined {
    return this.actions.get(name);
  }

  /**
   * Get all action definitions
   */
  getAllActionDefinitions(): InputActionDefinition[] {
    return Array.from(this.actions.values());
  }

  /**
   * Get action definitions by category
   */
  getActionsByCategory(category: string): InputActionDefinition[] {
    return this.getAllActionDefinitions().filter(a => a.category === category);
  }

  /**
   * Get all categories
   */
  getCategories(): string[] {
    const categories = new Set<string>();
    this.actions.forEach(action => {
      if (action.category) {
        categories.add(action.category);
      }
    });
    return Array.from(categories);
  }

  /**
   * Get action state
   */
  getActionState(name: string): InputAction | undefined {
    return this.actionStates.get(name);
  }

  /**
   * Update action state (called by InputManager)
   * @internal
   */
  updateActionState(name: string, state: Partial<InputAction>): void {
    const current = this.actionStates.get(name);
    if (current) {
      this.actionStates.set(name, { ...current, ...state });
    }
  }

  /**
   * Get all action states
   */
  getAllActionStates(): Map<string, InputAction> {
    return new Map(this.actionStates);
  }

  /**
   * Check if action exists
   */
  hasAction(name: string): boolean {
    return this.actions.has(name);
  }

  /**
   * Remove an action
   */
  removeAction(name: string): boolean {
    this.actions.delete(name);
    this.actionStates.delete(name);
    return true;
  }

  /**
   * Rebind an action - replace all bindings
   */
  rebindAction(name: string, bindings: InputBinding[]): boolean {
    const action = this.actions.get(name);
    if (!action) return false;

    action.bindings = bindings.map(b => ({ ...b, id: uuidv4() }));
    return true;
  }

  /**
   * Add a binding to an action
   */
  addBinding(actionName: string, binding: InputBinding): boolean {
    const action = this.actions.get(actionName);
    if (!action) return false;

    action.bindings.push({ ...binding, id: uuidv4() });
    return true;
  }

  /**
   * Remove a binding
   */
  removeBinding(actionName: string, bindingId: string): boolean {
    const action = this.actions.get(actionName);
    if (!action) return false;

    const index = action.bindings.findIndex(b => b.id === bindingId);
    if (index >= 0) {
      action.bindings.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Reset action to default bindings
   */
  resetActionToDefaults(name: string): boolean {
    const action = this.actions.get(name);
    if (!action) return false;

    action.bindings = action.defaultBindings.map(b => ({ ...b, id: uuidv4() }));
    return true;
  }

  /**
   * Reset all actions to defaults
   */
  resetAllToDefaults(): void {
    this.actions.forEach((action, name) => {
      this.resetActionToDefaults(name);
    });
  }

  /**
   * Enable/disable a binding
   */
  setBindingEnabled(actionName: string, bindingId: string, enabled: boolean): boolean {
    const action = this.actions.get(actionName);
    if (!action) return false;

    const binding = action.bindings.find(b => b.id === bindingId);
    if (binding) {
      binding.enabled = enabled;
      return true;
    }
    return false;
  }

  /**
   * Update axis config for a binding
   */
  updateAxisConfig(actionName: string, bindingId: string, config: Partial<AxisConfig>): boolean {
    const action = this.actions.get(actionName);
    if (!action) return false;

    const binding = action.bindings.find(b => b.id === bindingId);
    if (binding && binding.axisConfig) {
      binding.axisConfig = { ...binding.axisConfig, ...config };
      return true;
    }
    return false;
  }

  /**
   * Get bindings for a specific device type
   */
  getBindingsByDevice(actionName: string, deviceType: InputDeviceType): InputBinding[] {
    const action = this.actions.get(actionName);
    if (!action) return [];

    return action.bindings.filter(b => b.deviceType === deviceType);
  }

  /**
   * Serialize bindings for saving
   */
  serialize(): SerializableInputBindings {
    const actionMapArray = Array.from(this.actions.entries()).map(([name, action]) => ({
      name,
      actions: [{
        name: action.name,
        bindings: action.bindings.map(b => ({
          deviceType: b.deviceType,
          input: String(b.input),
          modifiers: b.modifiers,
          enabled: b.enabled,
          axisConfig: b.axisConfig,
        })),
      }],
    }));

    return {
      version: 1,
      actionMaps: actionMapArray,
      lastModified: new Date().toISOString(),
    };
  }

  /**
   * Load bindings from serialization
   */
  deserialize(data: SerializableInputBindings): void {
    data.actionMaps.forEach(actionMap => {
      actionMap.actions.forEach(actionData => {
        const action = this.actions.get(actionData.name);
        if (action) {
          action.bindings = actionData.bindings.map(b => ({
            id: uuidv4(),
            deviceType: b.deviceType,
            input: this.parseInputValue(b.input, b.deviceType),
            modifiers: b.modifiers,
            enabled: b.enabled,
            axisConfig: b.axisConfig,
          }));
        }
      });
    });
  }

  /**
   * Parse input value from string
   */
  private parseInputValue(value: string, deviceType: InputDeviceType): KeyCode | MouseButton | GamepadButton | GamepadAxis {
    switch (deviceType) {
      case 'keyboard':
        return value as KeyCode;
      case 'mouse':
        return parseInt(value) as MouseButton;
      case 'gamepad':
        const num = parseInt(value);
        return num >= 0 && num <= 3 ? num as GamepadAxis : num as GamepadButton;
      default:
        return value as KeyCode;
    }
  }

  /**
   * Clear all actions
   */
  clear(): void {
    this.actions.clear();
    this.actionStates.clear();
  }
}

// Global input map instance
export const inputMap = new InputMap();
