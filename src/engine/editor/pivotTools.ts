import * as THREE from 'three';
import type { Entity } from '@/types/engine';
import {
  cloneEditableMesh,
  createPrimitiveMesh,
  parseEditableMesh,
  type EditableMesh,
} from './modelerMesh';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
}

function isEditablePrimitiveKind(kind: string) {
  return kind === 'cube' || kind === 'plane';
}

export function resolveEditableMeshFromMeshRendererData(
  meshRendererData: Record<string, unknown> | null
): EditableMesh | null {
  const manualMesh = parseEditableMesh(
    meshRendererData?.manualMesh ?? meshRendererData?.customMesh
  );
  if (manualMesh) {
    return cloneEditableMesh(manualMesh);
  }

  const meshId =
    typeof meshRendererData?.meshId === 'string'
      ? meshRendererData.meshId.toLowerCase()
      : '';
  if (!isEditablePrimitiveKind(meshId)) {
    return null;
  }

  return createPrimitiveMesh(meshId);
}

export function resolveEditableMeshFromEntity(entity: Entity | null): EditableMesh | null {
  if (!entity?.components.has('MeshRenderer')) {
    return null;
  }

  const meshRendererData = asRecord(entity.components.get('MeshRenderer')?.data);
  return resolveEditableMeshFromMeshRendererData(meshRendererData);
}

export function computeEditableMeshBoundsCenter(mesh: EditableMesh): THREE.Vector3 {
  if (mesh.vertices.length === 0) {
    return new THREE.Vector3();
  }

  const bounds = new THREE.Box3();
  mesh.vertices.forEach((vertex) => {
    bounds.expandByPoint(new THREE.Vector3(vertex.x, vertex.y, vertex.z));
  });

  return bounds.getCenter(new THREE.Vector3());
}

export function translateEditableMesh(
  mesh: EditableMesh,
  offset: THREE.Vector3
): EditableMesh {
  const next = cloneEditableMesh(mesh);
  if (offset.lengthSq() === 0) {
    return next;
  }

  next.vertices = next.vertices.map((vertex) => ({
    x: vertex.x + offset.x,
    y: vertex.y + offset.y,
    z: vertex.z + offset.z,
  }));
  return next;
}
