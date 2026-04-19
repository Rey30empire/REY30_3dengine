import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InputManager, KeyCode } from '@/engine/input/InputManager';
import {
  dispatchKeyboardEvent,
  installInputTestEnvironment,
  resetInputManagerForTests,
} from './input-test-helpers';

describe('InputManager', () => {
  beforeEach(() => {
    installInputTestEnvironment();
    resetInputManagerForTests();
  });

  afterEach(() => {
    resetInputManagerForTests();
    vi.unstubAllGlobals();
  });

  it('persists rebound bindings across input manager restarts', () => {
    InputManager.initialize(document.body as HTMLElement);

    const manager = InputManager.getInstance();
    manager.rebindAction('jump', 0, { key: KeyCode.Enter });
    InputManager.saveBindings();

    dispatchKeyboardEvent('keydown', KeyCode.Enter, 'Enter');
    InputManager.update(1 / 60);
    expect(InputManager.getAction('jump').justPressed).toBe(true);

    dispatchKeyboardEvent('keyup', KeyCode.Enter, 'Enter');
    InputManager.update(1 / 60);

    resetInputManagerForTests();
    InputManager.initialize(document.body as HTMLElement);

    dispatchKeyboardEvent('keydown', KeyCode.Space, ' ');
    InputManager.update(1 / 60);
    expect(InputManager.getAction('jump').active).toBe(false);

    dispatchKeyboardEvent('keyup', KeyCode.Space, ' ');
    InputManager.update(1 / 60);

    dispatchKeyboardEvent('keydown', KeyCode.Enter, 'Enter');
    InputManager.update(1 / 60);
    expect(InputManager.getAction('jump').justPressed).toBe(true);
  });

  it('clears transient key state when the runtime shuts down', () => {
    InputManager.initialize(document.body as HTMLElement);

    dispatchKeyboardEvent('keydown', KeyCode.W, 'w');
    InputManager.update(1 / 60);
    expect(InputManager.getAction('moveY').active).toBe(true);

    InputManager.shutdown();
    InputManager.initialize(document.body as HTMLElement);
    InputManager.update(1 / 60);

    expect(InputManager.getAction('moveY').active).toBe(false);
    expect(InputManager.getKey(KeyCode.W)).toBe(false);
  });
});
