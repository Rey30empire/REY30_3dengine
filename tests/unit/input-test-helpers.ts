import { vi } from 'vitest';
import { InputManager } from '@/engine/input/InputManager';

class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

class TestDocument extends EventTarget {
  body = {
    requestPointerLock: vi.fn(),
  } as unknown as HTMLElement;

  pointerLockElement: EventTarget | null = null;

  exitPointerLock = vi.fn(() => {
    this.pointerLockElement = null;
  });
}

class TestWindow extends EventTarget {
  constructor(readonly localStorage: Storage) {
    super();
  }

  devicePixelRatio = 1;
}

export function installInputTestEnvironment(): { storage: Storage; window: Window; document: Document } {
  const storage = new MemoryStorage();
  const testWindow = new TestWindow(storage) as unknown as Window;
  const testDocument = new TestDocument() as unknown as Document;

  vi.stubGlobal('window', testWindow);
  vi.stubGlobal('document', testDocument);
  vi.stubGlobal('navigator', { getGamepads: () => [] });

  return {
    storage,
    window: testWindow,
    document: testDocument,
  };
}

export function resetInputManagerForTests(): void {
  try {
    InputManager.shutdown();
  } catch {
    // Ignore shutdown races in tests.
  }
  const mutableInputManager = InputManager as unknown as {
    instance?: unknown;
    lastUpdateAt?: number;
  };
  mutableInputManager.instance = undefined;
  mutableInputManager.lastUpdateAt = 0;
}

export function dispatchKeyboardEvent(
  type: 'keydown' | 'keyup',
  code: string,
  key = code
): void {
  const event = new Event(type) as Event & {
    code: string;
    key: string;
    target: EventTarget | null;
  };
  Object.defineProperty(event, 'code', { value: code });
  Object.defineProperty(event, 'key', { value: key });
  Object.defineProperty(event, 'target', { value: null });
  window.dispatchEvent(event);
}

export function dispatchMouseMove(movementX: number, movementY: number): void {
  const event = new Event('mousemove') as Event & {
    clientX: number;
    clientY: number;
    movementX: number;
    movementY: number;
    target: EventTarget | null;
  };
  Object.defineProperty(event, 'clientX', { value: 0 });
  Object.defineProperty(event, 'clientY', { value: 0 });
  Object.defineProperty(event, 'movementX', { value: movementX });
  Object.defineProperty(event, 'movementY', { value: movementY });
  Object.defineProperty(event, 'target', { value: null });
  window.dispatchEvent(event);
}

export function dispatchMouseButton(
  type: 'mousedown' | 'mouseup',
  button: number
): void {
  const event = new Event(type) as Event & {
    button: number;
    clientX: number;
    clientY: number;
    target: EventTarget | null;
  };
  Object.defineProperty(event, 'button', { value: button });
  Object.defineProperty(event, 'clientX', { value: 0 });
  Object.defineProperty(event, 'clientY', { value: 0 });
  Object.defineProperty(event, 'target', { value: null });
  window.dispatchEvent(event);
}
