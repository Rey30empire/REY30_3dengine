import type { EditableMesh } from './modelerMesh';
import { sanitizeEditableMesh } from './modelerMesh';
import {
  InitializeTopologyBrushSystem,
  convertEditableMeshToTopology,
  convertTopologyToEditableMesh,
  type TemplateType,
  type TopologyTemplateParameters,
} from '@/engine/systems/topology-authoring';

export interface TopologyIntentBridgeResult {
  suggestionKind: string | null;
  editableMesh: EditableMesh | null;
}

function toEditableMesh(mesh: EditableMesh): EditableMesh {
  return sanitizeEditableMesh({
    vertices: mesh.vertices.map((vertex) => ({ ...vertex })),
    faces: mesh.faces.map((face) => [...face] as [number, number, number]),
    uvs: mesh.uvs ? mesh.uvs.map((uv) => ({ ...uv })) : undefined,
    seamEdges: mesh.seamEdges ? mesh.seamEdges.map((edge) => [...edge] as [number, number]) : undefined,
    vertexColors: mesh.vertexColors ? mesh.vertexColors.map((color) => ({ ...color })) : undefined,
    weightGroups: mesh.weightGroups ? [...mesh.weightGroups] : undefined,
    weights: mesh.weights ? mesh.weights.map((entry) => [...entry]) : undefined,
    vertexMask: mesh.vertexMask ? [...mesh.vertexMask] : undefined,
    hiddenFaces: mesh.hiddenFaces ? [...mesh.hiddenFaces] : undefined,
    faceSets: mesh.faceSets ? [...mesh.faceSets] : undefined,
  });
}

function translateEditableMesh(mesh: EditableMesh, offset: { x: number; y: number; z: number }) {
  return toEditableMesh({
    ...mesh,
    vertices: mesh.vertices.map((vertex) => ({
      x: vertex.x + offset.x,
      y: vertex.y + offset.y,
      z: vertex.z + offset.z,
    })),
  });
}

function applyTopologySnapshotToEditableMesh(system: ReturnType<typeof InitializeTopologyBrushSystem>) {
  return toEditableMesh(convertTopologyToEditableMesh(system.snapshot().mesh).editableMesh);
}

export function createTopologyTemplateEditableMesh(
  templateType: TemplateType,
  parameters: TopologyTemplateParameters
) {
  const system = InitializeTopologyBrushSystem();
  const template = system.GenerateTemplateMesh(templateType, parameters);
  return toEditableMesh(convertTopologyToEditableMesh(template.mesh).editableMesh);
}

export function applyTopologyCleanup(mesh: EditableMesh) {
  const system = InitializeTopologyBrushSystem(convertEditableMeshToTopology(mesh));
  system.ApplyCleanup();
  return applyTopologySnapshotToEditableMesh(system);
}

export function applyTopologyAutoWeld(mesh: EditableMesh, distance = 0.001) {
  const system = InitializeTopologyBrushSystem(convertEditableMeshToTopology(mesh));
  system.ApplyAutoWeld(distance);
  return applyTopologySnapshotToEditableMesh(system);
}

export function applyTopologyRelax(mesh: EditableMesh) {
  const system = InitializeTopologyBrushSystem(convertEditableMeshToTopology(mesh));
  system.ApplyRelax();
  return applyTopologySnapshotToEditableMesh(system);
}

export function applyTopologySymmetry(mesh: EditableMesh, axis: 'x' | 'y' | 'z' = 'x') {
  const system = InitializeTopologyBrushSystem(convertEditableMeshToTopology(mesh));
  system.ApplySymmetry(axis);
  return applyTopologySnapshotToEditableMesh(system);
}

export function acceptTopologyIntentStroke(params: {
  mesh?: EditableMesh;
  templateType?: TemplateType;
  mode: 'template' | 'intent_driven';
  stroke: Array<{ x: number; y: number; z: number }>;
}): TopologyIntentBridgeResult {
  const system = InitializeTopologyBrushSystem(
    params.mesh ? convertEditableMeshToTopology(params.mesh) : undefined
  );

  if (params.mode === 'template' && params.templateType) {
    system.ActivateTemplateMode(params.templateType);
  } else {
    system.ActivateIntentDrivenMode();
  }

  const points = params.stroke.length > 0 ? params.stroke : [{ x: 0, y: 0, z: 0 }];
  if (points.length === 1 && params.mode === 'intent_driven') {
    system.CreateVertexAtCursor({
      screenX: 0,
      screenY: 0,
      timestamp: 0,
      worldPosition: { ...points[0]! },
    });
    return {
      suggestionKind: 'create_vertex',
      editableMesh: applyTopologySnapshotToEditableMesh(system),
    };
  }

  system.BeginStroke({
    screenX: 0,
    screenY: 0,
    timestamp: 0,
    worldPosition: { ...points[0]! },
  });
  if (points.length === 1 && params.mode === 'template') {
    system.EndStroke({
      screenX: 1,
      screenY: 1,
      timestamp: 16,
      worldPosition: { ...points[0]! },
    });
  }
  points.slice(1).forEach((point, index, array) => {
    const isLast = index === array.length - 1;
    const payload = {
      screenX: index + 1,
      screenY: index + 1,
      timestamp: (index + 1) * 16,
      worldPosition: { ...point },
    };
    if (isLast) {
      system.EndStroke(payload);
      return;
    }
    system.UpdateStroke(payload);
  });

  const suggestionKind = system.snapshot().currentSuggestion?.hypotheses[0]?.kind ?? null;
  system.AcceptIntentSuggestion();
  const editableMesh = applyTopologySnapshotToEditableMesh(system);
  const positionedMesh =
    params.mode === 'template' && points[0]
      ? translateEditableMesh(editableMesh, points[0])
      : editableMesh;
  return {
    suggestionKind,
    editableMesh: positionedMesh,
  };
}
