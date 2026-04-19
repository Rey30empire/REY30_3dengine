import { vi } from 'vitest';

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  left: number;
  right: number;
  bottom: number;
};

class FakeElement extends EventTarget {
  readonly children: FakeElement[] = [];
  readonly style: Record<string, string> = {};
  parentElement: FakeElement | null = null;
  id = '';

  constructor(
    readonly tagName: string,
    private rect: Rect
  ) {
    super();
  }

  appendChild<T extends FakeElement>(child: T): T {
    if (child.parentElement && child.parentElement !== this) {
      child.parentElement.removeChild(child);
    }
    if (!this.children.includes(child)) {
      this.children.push(child);
      child.parentElement = this;
    }
    return child;
  }

  removeChild<T extends FakeElement>(child: T): T {
    const index = this.children.indexOf(child);
    if (index >= 0) {
      this.children.splice(index, 1);
      child.parentElement = null;
    }
    return child;
  }

  getBoundingClientRect(): Rect {
    return { ...this.rect };
  }

  setBoundingClientRect(width: number, height: number): void {
    this.rect = {
      x: 0,
      y: 0,
      width,
      height,
      top: 0,
      left: 0,
      right: width,
      bottom: height,
    };
  }

  querySelectorAll(selector: string): FakeElement[] {
    if (selector === 'canvas') {
      return this.children.filter((child) => child.tagName === 'canvas');
    }
    return [];
  }
}

class FakeCanvasElement extends FakeElement {
  width = 0;
  height = 0;

  constructor(
    private readonly context: CanvasRenderingContext2D,
    rect: Rect
  ) {
    super('canvas', rect);
  }

  getContext(type: string): CanvasRenderingContext2D | null {
    return type === '2d' ? this.context : null;
  }

  override getBoundingClientRect(): Rect {
    if (this.parentElement) {
      return this.parentElement.getBoundingClientRect();
    }
    return super.getBoundingClientRect();
  }
}

class FakeDocument extends EventTarget {
  readonly body: FakeElement;

  constructor(
    private readonly context: CanvasRenderingContext2D,
    width: number,
    height: number
  ) {
    super();
    this.body = new FakeElement('body', {
      x: 0,
      y: 0,
      width,
      height,
      top: 0,
      left: 0,
      right: width,
      bottom: height,
    });
  }

  createElement(tagName: string): FakeElement {
    const rect = this.body.getBoundingClientRect();
    if (tagName === 'canvas') {
      return new FakeCanvasElement(this.context, rect);
    }
    return new FakeElement(tagName, rect);
  }
}

class FakeWindow extends EventTarget {
  devicePixelRatio = 1;
}

function createContext2D(): CanvasRenderingContext2D {
  const metrics = {
    width: 0,
    actualBoundingBoxAscent: 0,
    actualBoundingBoxDescent: 0,
    actualBoundingBoxLeft: 0,
    actualBoundingBoxRight: 0,
    fontBoundingBoxAscent: 0,
    fontBoundingBoxDescent: 0,
    emHeightAscent: 0,
    emHeightDescent: 0,
    hangingBaseline: 0,
    alphabeticBaseline: 0,
    ideographicBaseline: 0,
  } satisfies TextMetrics;

  const context = {
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    scale: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
    arc: vi.fn(),
    clip: vi.fn(),
    drawImage: vi.fn(),
    measureText: vi.fn((text: string) => ({
      ...metrics,
      width: text.length * 8,
    })),
    fillStyle: '#000000',
    strokeStyle: '#000000',
    font: '12px sans-serif',
    textAlign: 'left',
    textBaseline: 'top',
    lineWidth: 1,
  } satisfies Partial<CanvasRenderingContext2D>;

  return context as unknown as CanvasRenderingContext2D;
}

export function installUIRuntimeTestEnvironment(options?: {
  width?: number;
  height?: number;
}): {
  window: Window;
  document: Document;
  container: HTMLElement;
  context: CanvasRenderingContext2D;
} {
  const width = options?.width ?? 1280;
  const height = options?.height ?? 720;
  const context = createContext2D();
  const fakeWindow = new FakeWindow() as unknown as Window;
  const fakeDocument = new FakeDocument(context, width, height) as unknown as Document;
  const container = new FakeElement('div', {
    x: 0,
    y: 0,
    width,
    height,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
  }) as unknown as HTMLElement;

  (fakeDocument.body as unknown as FakeElement).appendChild(container as unknown as FakeElement);

  vi.stubGlobal('window', fakeWindow);
  vi.stubGlobal('document', fakeDocument);
  vi.stubGlobal('navigator', { getGamepads: () => [] });

  return {
    window: fakeWindow,
    document: fakeDocument,
    container,
    context,
  };
}
