import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  UIButton,
  UIPanel,
  UICanvas,
  uiManager,
} from '@/engine/ui-runtime';
import { installUIRuntimeTestEnvironment } from './ui-runtime-test-helpers';

describe('UIRuntime foundation', () => {
  afterEach(() => {
    uiManager.reset();
    vi.unstubAllGlobals();
  });

  it('mounts and cleans up canvases without leaking DOM nodes', () => {
    const { container, context } = installUIRuntimeTestEnvironment();

    const first = uiManager.createCanvas('hud');
    const second = uiManager.createCanvas('hud');

    expect(first).toBe(second);

    first.attach(container);
    expect((container as unknown as { querySelectorAll: (selector: string) => unknown[] }).querySelectorAll('canvas')).toHaveLength(1);
    expect(first.getElement()?.parentElement).toBe(container);

    uiManager.update(1 / 60);
    expect(context.clearRect).toHaveBeenCalled();

    uiManager.removeCanvas('hud');
    expect((container as unknown as { querySelectorAll: (selector: string) => unknown[] }).querySelectorAll('canvas')).toHaveLength(0);
  });

  it('finds the top-most widget at a screen position', () => {
    const { container } = installUIRuntimeTestEnvironment();

    const canvas = uiManager.createCanvas('hud') as UICanvas;
    canvas.attach(container);
    canvas.setReferenceResolution(1280, 720);

    const panel = new UIPanel('panel');
    panel.setPosition(20, 20);
    panel.setSize(120, 80);

    const button = new UIButton('button', 'Click');
    button.setPosition(32, 34);
    button.setSize(48, 24);
    panel.addChild(button);

    canvas.addChild(panel);

    expect(uiManager.findWidgetAtPosition(new THREE.Vector2(40, 40))?.id).toBe('button');
    expect(uiManager.findWidgetAtPosition(new THREE.Vector2(24, 24))?.id).toBe('panel');
    expect(uiManager.findWidgetAtPosition(new THREE.Vector2(300, 300))).toBeNull();
  });
});
