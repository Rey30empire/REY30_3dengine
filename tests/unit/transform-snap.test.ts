import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  resolveSurfaceSnapPoint,
  resolveVertexSnapPoint,
} from '@/engine/editor/gizmos/transformSnap';

function createSnapScene() {
  const scene = new THREE.Scene();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [
        -1, -1, 0,
        1, -1, 0,
        0, 1, 0,
      ],
      3
    )
  );
  geometry.setIndex([0, 1, 2]);
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  scene.add(mesh);

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);

  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

  return { scene, mesh, raycaster };
}

describe('transformSnap', () => {
  it('snaps to the hit surface point', () => {
    const { scene, raycaster } = createSnapScene();

    const point = resolveSurfaceSnapPoint(scene, raycaster, null);

    expect(point).not.toBeNull();
    expect(point?.x ?? NaN).toBeCloseTo(0, 5);
    expect(point?.y ?? NaN).toBeCloseTo(0, 5);
    expect(point?.z ?? NaN).toBeCloseTo(0, 5);
  });

  it('snaps to the nearest hit-triangle vertex and excludes the active target', () => {
    const { scene, mesh, raycaster } = createSnapScene();

    const vertexPoint = resolveVertexSnapPoint(scene, raycaster, null);
    expect(vertexPoint).not.toBeNull();
    expect(vertexPoint?.x ?? NaN).toBeCloseTo(0, 5);
    expect(vertexPoint?.y ?? NaN).toBeCloseTo(1, 5);
    expect(vertexPoint?.z ?? NaN).toBeCloseTo(0, 5);

    const excluded = resolveSurfaceSnapPoint(scene, raycaster, mesh);
    expect(excluded).toBeNull();
  });
});
