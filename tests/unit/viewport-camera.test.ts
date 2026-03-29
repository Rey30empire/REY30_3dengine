import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  computeOrthographicSizeToFitBox,
  deriveOrthographicSizeFromPerspective,
  getOrthographicSize,
  setOrthographicSize,
} from '@/engine/editor/viewportCamera';

describe('viewportCamera', () => {
  it('configures an orthographic frustum from viewport size', () => {
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);

    setOrthographicSize(camera, 400, 200, 10);

    expect(getOrthographicSize(camera)).toBeCloseTo(10, 5);
    expect(camera.top).toBeCloseTo(10, 5);
    expect(camera.bottom).toBeCloseTo(-10, 5);
    expect(camera.right).toBeCloseTo(20, 5);
    expect(camera.left).toBeCloseTo(-20, 5);
  });

  it('derives orthographic framing from perspective distance and bounds', () => {
    const derived = deriveOrthographicSizeFromPerspective(10, 60);
    expect(derived).toBeCloseTo(5.7735, 3);

    const bounds = new THREE.Box3(
      new THREE.Vector3(-2, -1, -1),
      new THREE.Vector3(2, 1, 1)
    );

    const fitted = computeOrthographicSizeToFitBox(
      bounds,
      new THREE.Vector3(0, 0, 10),
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 1, 0),
      16 / 9
    );

    expect(fitted).toBeGreaterThan(1.28);
    expect(fitted).toBeLessThan(1.31);
  });
});
