import * as THREE from 'three';
import {
  getFaceSetId,
  getEdgeMidpoint,
  getFaceCenter,
  getFaceNormal,
  getVertexMaskValue,
  getVisibleFaceIndices,
  listMeshEdges,
  listVisibleMeshEdgeIndices,
  type EditableMesh,
} from './modelerMesh';

export type ModelerViewportMode = 'vertex' | 'edge' | 'face';

export const MODELER_HELPER_GROUP_NAME = '__modeler_helper_group';

function createHandleMaterial(color: number, selected: boolean) {
  return new THREE.MeshBasicMaterial({
    color,
    depthTest: false,
    toneMapped: false,
    transparent: true,
    opacity: selected ? 1 : 0.82,
  });
}

function createLineMaterial(color: number, selected: boolean) {
  return new THREE.LineBasicMaterial({
    color,
    depthTest: false,
    toneMapped: false,
    transparent: true,
    opacity: selected ? 0.95 : 0.35,
  });
}

function blendHexColors(left: number, right: number, amount: number) {
  return new THREE.Color(left).lerp(new THREE.Color(right), amount).getHex();
}

function getFaceSetColor(faceSetId: number) {
  if (faceSetId <= 0) {
    return 0x94a3b8;
  }

  const palette = [0xf97316, 0x22c55e, 0xeab308, 0x06b6d4, 0xec4899, 0xa855f7];
  return palette[(faceSetId - 1) % palette.length] ?? 0x94a3b8;
}

function buildVertexHelpers(mesh: EditableMesh, selectedIndices: Set<number>) {
  const group = new THREE.Group();

  mesh.vertices.forEach((vertex, index) => {
    const selected = selectedIndices.has(index);
    const maskValue = getVertexMaskValue(mesh, index);
    const baseColor =
      maskValue > 0.0001
        ? blendHexColors(0x94a3b8, 0xef4444, Math.min(1, maskValue))
        : 0x94a3b8;
    const handle = new THREE.Mesh(
      new THREE.SphereGeometry(selected ? 0.11 : 0.085, 14, 14),
      createHandleMaterial(selected ? 0x38bdf8 : baseColor, selected)
    );
    handle.position.set(vertex.x, vertex.y, vertex.z);
    handle.renderOrder = 1000;
    handle.userData.modelerSelectable = true;
    handle.userData.modelerElementType = 'vertex';
    handle.userData.modelerIndex = index;
    group.add(handle);
  });

  return group;
}

function buildEdgeHelpers(mesh: EditableMesh, selectedIndices: Set<number>) {
  const group = new THREE.Group();
  const edges = listMeshEdges(mesh);
  const visibleEdgeIndices = new Set(listVisibleMeshEdgeIndices(mesh));

  edges.forEach((edge, index) => {
    if (!visibleEdgeIndices.has(index)) return;
    const selected = selectedIndices.has(index);
    const [left, right] = edge;
    const start = mesh.vertices[left];
    const end = mesh.vertices[right];
    if (!start || !end) return;

    const lineGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(start.x, start.y, start.z),
      new THREE.Vector3(end.x, end.y, end.z),
    ]);
    const line = new THREE.Line(lineGeometry, createLineMaterial(selected ? 0x38bdf8 : 0x64748b, selected));
    line.renderOrder = 998;
    group.add(line);

    const midpoint = getEdgeMidpoint(mesh, edge);
    const handle = new THREE.Mesh(
      new THREE.SphereGeometry(selected ? 0.1 : 0.075, 12, 12),
      createHandleMaterial(selected ? 0x38bdf8 : 0x64748b, selected)
    );
    handle.position.set(midpoint.x, midpoint.y, midpoint.z);
    handle.renderOrder = 1000;
    handle.userData.modelerSelectable = true;
    handle.userData.modelerElementType = 'edge';
    handle.userData.modelerIndex = index;
    group.add(handle);
  });

  return group;
}

function buildFaceHelpers(mesh: EditableMesh, selectedIndices: Set<number>) {
  const group = new THREE.Group();

  getVisibleFaceIndices(mesh).forEach((index) => {
    const face = mesh.faces[index];
    if (!face) return;
    const selected = selectedIndices.has(index);
    const vertices = face
      .map((vertexIndex) => mesh.vertices[vertexIndex])
      .filter((vertex): vertex is NonNullable<typeof vertex> => Boolean(vertex));
    if (vertices.length !== 3) return;
    const faceSetColor = getFaceSetColor(getFaceSetId(mesh, index));

    const loopGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(vertices[0].x, vertices[0].y, vertices[0].z),
      new THREE.Vector3(vertices[1].x, vertices[1].y, vertices[1].z),
      new THREE.Vector3(vertices[2].x, vertices[2].y, vertices[2].z),
    ]);
    const loop = new THREE.LineLoop(
      loopGeometry,
      createLineMaterial(selected ? 0xf59e0b : blendHexColors(faceSetColor, 0x334155, 0.45), selected)
    );
    loop.renderOrder = 998;
    group.add(loop);

    const center = getFaceCenter(mesh, index);
    const normal = getFaceNormal(mesh, index);
    const handle = new THREE.Mesh(
      new THREE.OctahedronGeometry(selected ? 0.13 : 0.1, 0),
      createHandleMaterial(selected ? 0xf59e0b : faceSetColor, selected)
    );
    handle.position.set(
      center.x + normal.x * 0.08,
      center.y + normal.y * 0.08,
      center.z + normal.z * 0.08
    );
    handle.renderOrder = 1000;
    handle.userData.modelerSelectable = true;
    handle.userData.modelerElementType = 'face';
    handle.userData.modelerIndex = index;
    group.add(handle);
  });

  return group;
}

export function createModelerHelperGroup(params: {
  mesh: EditableMesh;
  mode: ModelerViewportMode;
  selectedIndices: number[];
}) {
  const { mesh, mode, selectedIndices } = params;
  const selectedSet = new Set(selectedIndices);
  const group = new THREE.Group();
  group.name = MODELER_HELPER_GROUP_NAME;
  group.renderOrder = 997;
  group.userData.modelerHelperRoot = true;

  const content =
    mode === 'vertex'
      ? buildVertexHelpers(mesh, selectedSet)
      : mode === 'edge'
        ? buildEdgeHelpers(mesh, selectedSet)
        : buildFaceHelpers(mesh, selectedSet);

  group.add(content);
  return group;
}

export function disposeModelerHelperGroup(group: THREE.Object3D | null) {
  group?.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
    const material = (mesh as { material?: THREE.Material | THREE.Material[] }).material;
    if (Array.isArray(material)) {
      material.forEach((entry) => entry.dispose());
    } else {
      material?.dispose();
    }
  });
}
