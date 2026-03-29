import * as THREE from 'three';

function hasAncestor(
  object: THREE.Object3D | null,
  predicate: (candidate: THREE.Object3D) => boolean
): boolean {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (predicate(current)) return true;
    current = current.parent;
  }
  return false;
}

function isDescendantOf(object: THREE.Object3D, root: THREE.Object3D | null): boolean {
  if (!root) return false;
  let current: THREE.Object3D | null = object;
  while (current) {
    if (current === root) return true;
    current = current.parent;
  }
  return false;
}

function collectSnapMeshes(scene: THREE.Scene, target: THREE.Object3D | null): THREE.Object3D[] {
  const meshes: THREE.Object3D[] = [];

  scene.traverse((candidate) => {
    const mesh = candidate as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    if (isDescendantOf(mesh, target)) return;
    if (hasAncestor(mesh, (node) => node.name === 'TransformGizmo')) return;
    if (hasAncestor(mesh, (node) => node.userData?.modelerHelperRoot === true)) return;
    if (mesh.userData?.modelerSelectable || mesh.userData?.modelerGizmoProxy) return;
    if (mesh.name === '__collider_helper' || mesh.userData?.colliderSignature) return;
    if (!(mesh.geometry instanceof THREE.BufferGeometry)) return;
    if (!mesh.geometry.getAttribute('position')) return;
    meshes.push(mesh);
  });

  return meshes;
}

function getSnapIntersection(
  scene: THREE.Scene,
  raycaster: THREE.Raycaster,
  target: THREE.Object3D | null
): THREE.Intersection<THREE.Object3D> | null {
  const candidates = collectSnapMeshes(scene, target);
  if (candidates.length === 0) return null;
  return raycaster.intersectObjects(candidates, true)[0] ?? null;
}

function getWorldVertex(
  mesh: THREE.Mesh,
  positions: THREE.BufferAttribute,
  index: number
): THREE.Vector3 {
  return new THREE.Vector3(
    positions.getX(index),
    positions.getY(index),
    positions.getZ(index)
  ).applyMatrix4(mesh.matrixWorld);
}

function getVertexCandidates(
  intersection: THREE.Intersection<THREE.Object3D>
): THREE.Vector3[] {
  const mesh = intersection.object as THREE.Mesh;
  const geometry = mesh.geometry as THREE.BufferGeometry;
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (!positions) return [];

  if (intersection.face) {
    return [intersection.face.a, intersection.face.b, intersection.face.c].map((index) =>
      getWorldVertex(mesh, positions, index)
    );
  }

  const count = Math.min(positions.count, 2048);
  const vertices: THREE.Vector3[] = [];
  for (let index = 0; index < count; index += 1) {
    vertices.push(getWorldVertex(mesh, positions, index));
  }
  return vertices;
}

export function resolveSurfaceSnapPoint(
  scene: THREE.Scene,
  raycaster: THREE.Raycaster,
  target: THREE.Object3D | null
): THREE.Vector3 | null {
  const intersection = getSnapIntersection(scene, raycaster, target);
  return intersection ? intersection.point.clone() : null;
}

export function resolveVertexSnapPoint(
  scene: THREE.Scene,
  raycaster: THREE.Raycaster,
  target: THREE.Object3D | null
): THREE.Vector3 | null {
  const intersection = getSnapIntersection(scene, raycaster, target);
  if (!intersection) return null;

  const candidates = getVertexCandidates(intersection);
  if (candidates.length === 0) return null;

  let nearest = candidates[0];
  let nearestDistance = nearest.distanceToSquared(intersection.point);

  for (let index = 1; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const distance = candidate.distanceToSquared(intersection.point);
    if (distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }

  return nearest.clone();
}
