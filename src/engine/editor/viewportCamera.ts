import * as THREE from 'three';

export type ViewportCamera = THREE.PerspectiveCamera | THREE.OrthographicCamera;

export const DEFAULT_ORTHOGRAPHIC_SIZE = 10;
const MIN_ORTHOGRAPHIC_SIZE = 0.1;

export function isPerspectiveCamera(
  camera: THREE.Camera | null | undefined
): camera is THREE.PerspectiveCamera {
  return Boolean(camera && (camera as THREE.PerspectiveCamera).isPerspectiveCamera);
}

export function isOrthographicCamera(
  camera: THREE.Camera | null | undefined
): camera is THREE.OrthographicCamera {
  return Boolean(camera && (camera as THREE.OrthographicCamera).isOrthographicCamera);
}

export function getViewportAspect(width: number, height: number): number {
  return Math.max(width, 1) / Math.max(height, 1);
}

export function getOrthographicSize(
  camera: THREE.OrthographicCamera | null | undefined,
  fallback = DEFAULT_ORTHOGRAPHIC_SIZE
): number {
  if (!camera) return fallback;

  const userDataSize = camera.userData?.orthoSize;
  if (typeof userDataSize === 'number' && Number.isFinite(userDataSize) && userDataSize > 0) {
    return userDataSize;
  }

  const derivedSize = ((camera.top - camera.bottom) * 0.5) / Math.max(camera.zoom, 1e-3);
  return Number.isFinite(derivedSize) && derivedSize > 0 ? derivedSize : fallback;
}

export function setOrthographicSize(
  camera: THREE.OrthographicCamera,
  width: number,
  height: number,
  size: number
): number {
  const safeSize = Math.max(size, MIN_ORTHOGRAPHIC_SIZE);
  const aspect = getViewportAspect(width, height);
  const halfHeight = safeSize;
  const halfWidth = halfHeight * aspect;

  camera.left = -halfWidth;
  camera.right = halfWidth;
  camera.top = halfHeight;
  camera.bottom = -halfHeight;
  camera.userData.orthoSize = halfHeight;
  camera.updateProjectionMatrix();

  return halfHeight;
}

export function deriveOrthographicSizeFromPerspective(
  distance: number,
  fovDegrees: number
): number {
  const safeDistance = Math.max(distance, MIN_ORTHOGRAPHIC_SIZE);
  const safeFov = THREE.MathUtils.clamp(fovDegrees, 1, 179);
  return Math.max(
    Math.tan(THREE.MathUtils.degToRad(safeFov * 0.5)) * safeDistance,
    MIN_ORTHOGRAPHIC_SIZE
  );
}

export function computeOrthographicSizeToFitBox(
  bounds: THREE.Box3,
  position: THREE.Vector3,
  target: THREE.Vector3,
  up: THREE.Vector3,
  aspect: number,
  margin = 1.15
): number {
  if (bounds.isEmpty()) {
    return DEFAULT_ORTHOGRAPHIC_SIZE;
  }

  const probe = new THREE.Object3D();
  probe.position.copy(position);
  probe.up.copy(up);
  probe.lookAt(target);
  probe.updateMatrixWorld(true);

  const inverseMatrix = probe.matrixWorld.clone().invert();
  const corners = [
    new THREE.Vector3(bounds.min.x, bounds.min.y, bounds.min.z),
    new THREE.Vector3(bounds.min.x, bounds.min.y, bounds.max.z),
    new THREE.Vector3(bounds.min.x, bounds.max.y, bounds.min.z),
    new THREE.Vector3(bounds.min.x, bounds.max.y, bounds.max.z),
    new THREE.Vector3(bounds.max.x, bounds.min.y, bounds.min.z),
    new THREE.Vector3(bounds.max.x, bounds.min.y, bounds.max.z),
    new THREE.Vector3(bounds.max.x, bounds.max.y, bounds.min.z),
    new THREE.Vector3(bounds.max.x, bounds.max.y, bounds.max.z),
  ];

  let maxLocalX = MIN_ORTHOGRAPHIC_SIZE;
  let maxLocalY = MIN_ORTHOGRAPHIC_SIZE;

  corners.forEach((corner) => {
    const local = corner.clone().applyMatrix4(inverseMatrix);
    maxLocalX = Math.max(maxLocalX, Math.abs(local.x));
    maxLocalY = Math.max(maxLocalY, Math.abs(local.y));
  });

  return Math.max(
    Math.max(maxLocalY, maxLocalX / Math.max(aspect, 1e-3)) * margin,
    MIN_ORTHOGRAPHIC_SIZE
  );
}

export function setCameraClipPlanes(
  camera: ViewportCamera,
  near?: number,
  far?: number
): void {
  if (typeof near === 'number') camera.near = near;
  if (typeof far === 'number') camera.far = far;
}

export function applyCameraTransform(
  camera: ViewportCamera,
  position: THREE.Vector3,
  target: THREE.Vector3,
  up: THREE.Vector3
): void {
  camera.position.copy(position);
  camera.up.copy(up);
  camera.lookAt(target);
}

export function applyPerspectiveLens(
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
  fov: number,
  zoom: number
): void {
  camera.aspect = width / height;
  camera.fov = fov;
  camera.zoom = zoom;
  camera.updateProjectionMatrix();
}

export function applyOrthographicLens(
  camera: THREE.OrthographicCamera,
  width: number,
  height: number,
  orthoSize: number,
  zoom: number
): void {
  camera.zoom = zoom;
  setOrthographicSize(camera, width, height, orthoSize);
  camera.updateProjectionMatrix();
}
