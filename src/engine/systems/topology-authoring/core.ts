import type { EditableMesh, EditableVec3 } from '@/engine/editor/modelerMesh';
import {
  type CreationMode,
  type CursorSpaceResolution,
  type EditableTopologyResult,
  type IntentHypothesis,
  type IntentSuggestion,
  type SurfaceHit,
  type TemplateMeshResult,
  type TemplateType,
  type TopologyBrushInput,
  type TopologyBrushSnapshot,
  type TopologyCommand,
  type TopologyEdge,
  type TopologyFace,
  type TopologyMesh,
  type TopologyProjectionAdapter,
  type TopologyTemplateParameters,
  type TopologyValidationIssue,
  type TopologyVertex,
} from './types';

function cloneVec3(value: EditableVec3): EditableVec3 {
  return { ...value };
}

function cloneMesh(mesh: TopologyMesh): TopologyMesh {
  return {
    vertices: mesh.vertices.map((vertex) => ({ ...vertex, position: cloneVec3(vertex.position) })),
    edges: mesh.edges.map((edge) => ({ ...edge })),
    faces: mesh.faces.map((face) => ({ ...face, vertexIds: [...face.vertexIds] })),
    metadata: mesh.metadata ? { ...mesh.metadata } : undefined,
  };
}

function createEmptyMesh(): TopologyMesh {
  return {
    vertices: [],
    edges: [],
    faces: [],
  };
}

function defaultProjectionAdapter(): TopologyProjectionAdapter {
  return {
    projectCursorToSurface(input) {
      return input.worldPosition
        ? {
            position: cloneVec3(input.worldPosition),
            normal: { x: 0, y: 1, z: 0 },
          }
        : null;
    },
    projectCursorToWorkPlane(input) {
      return input.worldPosition ? cloneVec3(input.worldPosition) : { x: 0, y: 0, z: 0 };
    },
    detectSurfaceHit(input) {
      return input.worldPosition
        ? {
            position: cloneVec3(input.worldPosition),
            normal: { x: 0, y: 1, z: 0 },
          }
        : null;
    },
  };
}

function createCuboid(center: EditableVec3, size: EditableVec3, prefix: string): TopologyMesh {
  const hx = size.x / 2;
  const hy = size.y / 2;
  const hz = size.z / 2;
  const vertices: TopologyVertex[] = [
    { id: `${prefix}_v0`, position: { x: center.x - hx, y: center.y - hy, z: center.z - hz } },
    { id: `${prefix}_v1`, position: { x: center.x + hx, y: center.y - hy, z: center.z - hz } },
    { id: `${prefix}_v2`, position: { x: center.x + hx, y: center.y + hy, z: center.z - hz } },
    { id: `${prefix}_v3`, position: { x: center.x - hx, y: center.y + hy, z: center.z - hz } },
    { id: `${prefix}_v4`, position: { x: center.x - hx, y: center.y - hy, z: center.z + hz } },
    { id: `${prefix}_v5`, position: { x: center.x + hx, y: center.y - hy, z: center.z + hz } },
    { id: `${prefix}_v6`, position: { x: center.x + hx, y: center.y + hy, z: center.z + hz } },
    { id: `${prefix}_v7`, position: { x: center.x - hx, y: center.y + hy, z: center.z + hz } },
  ];
  const edges: TopologyEdge[] = [
    ['v0', 'v1'], ['v1', 'v2'], ['v2', 'v3'], ['v3', 'v0'],
    ['v4', 'v5'], ['v5', 'v6'], ['v6', 'v7'], ['v7', 'v4'],
    ['v0', 'v4'], ['v1', 'v5'], ['v2', 'v6'], ['v3', 'v7'],
  ].map(([a, b], index) => ({
    id: `${prefix}_e${index}`,
    a: `${prefix}_${a}`,
    b: `${prefix}_${b}`,
  }));
  const faces: TopologyFace[] = [
    ['v0', 'v1', 'v2', 'v3'],
    ['v4', 'v5', 'v6', 'v7'],
    ['v0', 'v1', 'v5', 'v4'],
    ['v1', 'v2', 'v6', 'v5'],
    ['v2', 'v3', 'v7', 'v6'],
    ['v3', 'v0', 'v4', 'v7'],
  ].map((vertexIds, index) => ({
    id: `${prefix}_f${index}`,
    vertexIds: vertexIds.map((id) => `${prefix}_${id}`),
  }));
  return { vertices, edges, faces };
}

function mergeMeshes(meshes: TopologyMesh[]): TopologyMesh {
  return meshes.reduce<TopologyMesh>(
    (acc, mesh) => ({
      vertices: [...acc.vertices, ...mesh.vertices],
      edges: [...acc.edges, ...mesh.edges],
      faces: [...acc.faces, ...mesh.faces],
      metadata: { ...(acc.metadata ?? {}), ...(mesh.metadata ?? {}) },
    }),
    createEmptyMesh()
  );
}

function distanceSquared(a: EditableVec3, b: EditableVec3) {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;
}

class TopologyHistory {
  private past: TopologyCommand[] = [];
  private future: TopologyCommand[] = [];

  push(command: TopologyCommand) {
    this.past.push({
      ...command,
      before: cloneMesh(command.before),
      after: cloneMesh(command.after),
    });
    this.future = [];
  }

  undo(current: TopologyMesh) {
    const command = this.past.pop();
    if (!command) return null;
    this.future.push({
      ...command,
      before: cloneMesh(command.before),
      after: cloneMesh(current),
    });
    return cloneMesh(command.before);
  }

  redo(current: TopologyMesh) {
    const command = this.future.pop();
    if (!command) return null;
    this.past.push({
      ...command,
      before: cloneMesh(current),
      after: cloneMesh(command.after),
    });
    return cloneMesh(command.after);
  }
}

export function validateTopology(mesh: TopologyMesh): TopologyValidationIssue[] {
  const vertexIds = new Set(mesh.vertices.map((vertex) => vertex.id));
  const edgeKeys = new Set<string>();
  const issues: TopologyValidationIssue[] = [];

  mesh.edges.forEach((edge) => {
    if (!vertexIds.has(edge.a) || !vertexIds.has(edge.b)) {
      issues.push({
        code: 'edge_missing_vertex',
        severity: 'error',
        message: `Edge ${edge.id} referencia vertices que no existen.`,
      });
    }
    if (edge.a === edge.b) {
      issues.push({
        code: 'edge_degenerate',
        severity: 'error',
        message: `Edge ${edge.id} conecta el mismo vertice.`,
      });
    }
    const key = [edge.a, edge.b].sort().join(':');
    if (edgeKeys.has(key)) {
      issues.push({
        code: 'edge_duplicate',
        severity: 'warn',
        message: `Edge duplicada entre ${edge.a} y ${edge.b}.`,
      });
    }
    edgeKeys.add(key);
  });

  mesh.faces.forEach((face) => {
    const uniqueVertices = new Set(face.vertexIds);
    if (uniqueVertices.size < 3) {
      issues.push({
        code: 'face_degenerate',
        severity: 'error',
        message: `Face ${face.id} no tiene suficientes vertices unicos.`,
      });
    }
    face.vertexIds.forEach((vertexId) => {
      if (!vertexIds.has(vertexId)) {
        issues.push({
          code: 'face_missing_vertex',
          severity: 'error',
          message: `Face ${face.id} referencia ${vertexId} que no existe.`,
        });
      }
    });
  });

  return issues;
}

export function cleanupTopology(mesh: TopologyMesh): TopologyMesh {
  const uniqueVertices = new Map(mesh.vertices.map((vertex) => [vertex.id, vertex]));
  const edges = new Map<string, TopologyEdge>();
  mesh.edges.forEach((edge) => {
    if (edge.a === edge.b) return;
    if (!uniqueVertices.has(edge.a) || !uniqueVertices.has(edge.b)) return;
    const key = [edge.a, edge.b].sort().join(':');
    if (!edges.has(key)) {
      edges.set(key, edge);
    }
  });

  const faces = mesh.faces.filter((face) => {
    const unique = Array.from(new Set(face.vertexIds));
    return unique.length >= 3 && unique.every((vertexId) => uniqueVertices.has(vertexId));
  });

  return {
    vertices: Array.from(uniqueVertices.values()).map((vertex) => ({
      ...vertex,
      position: cloneVec3(vertex.position),
    })),
    edges: Array.from(edges.values()).map((edge) => ({ ...edge })),
    faces: faces.map((face) => ({ ...face, vertexIds: [...face.vertexIds] })),
    metadata: mesh.metadata ? { ...mesh.metadata } : undefined,
  };
}

export function generateTemplateMesh(
  templateType: TemplateType,
  parameters: TopologyTemplateParameters = {}
): TemplateMeshResult {
  const width = parameters.width ?? 1.4;
  const height = parameters.height ?? 1.2;
  const depth = parameters.depth ?? 1.1;

  const mesh = (() => {
    switch (templateType) {
      case 'chair':
        return mergeMeshes([
          createCuboid({ x: 0, y: 0.55, z: 0 }, { x: width, y: 0.12, z: depth }, 'chair_seat'),
          createCuboid({ x: 0, y: 1.0, z: -0.42 }, { x: width, y: 0.9, z: 0.12 }, 'chair_back'),
          createCuboid({ x: -0.55, y: 0.25, z: -0.45 }, { x: 0.12, y: 0.5, z: 0.12 }, 'chair_leg_a'),
          createCuboid({ x: 0.55, y: 0.25, z: -0.45 }, { x: 0.12, y: 0.5, z: 0.12 }, 'chair_leg_b'),
          createCuboid({ x: -0.55, y: 0.25, z: 0.45 }, { x: 0.12, y: 0.5, z: 0.12 }, 'chair_leg_c'),
          createCuboid({ x: 0.55, y: 0.25, z: 0.45 }, { x: 0.12, y: 0.5, z: 0.12 }, 'chair_leg_d'),
        ]);
      case 'table':
        return mergeMeshes([
          createCuboid({ x: 0, y: 0.85, z: 0 }, { x: width * 1.4, y: 0.14, z: depth * 1.4 }, 'table_top'),
          createCuboid({ x: -0.65, y: 0.4, z: -0.55 }, { x: 0.12, y: 0.8, z: 0.12 }, 'table_leg_a'),
          createCuboid({ x: 0.65, y: 0.4, z: -0.55 }, { x: 0.12, y: 0.8, z: 0.12 }, 'table_leg_b'),
          createCuboid({ x: -0.65, y: 0.4, z: 0.55 }, { x: 0.12, y: 0.8, z: 0.12 }, 'table_leg_c'),
          createCuboid({ x: 0.65, y: 0.4, z: 0.55 }, { x: 0.12, y: 0.8, z: 0.12 }, 'table_leg_d'),
        ]);
      case 'bed':
        return mergeMeshes([
          createCuboid({ x: 0, y: 0.3, z: 0 }, { x: width * 1.8, y: 0.28, z: depth * 2.4 }, 'bed_base'),
          createCuboid({ x: 0, y: 0.8, z: -1.1 }, { x: width * 1.8, y: 1.0, z: 0.12 }, 'bed_headboard'),
        ]);
      case 'vehicle':
        return mergeMeshes([
          createCuboid({ x: 0, y: 0.45, z: 0 }, { x: width * 2.0, y: 0.5, z: depth * 1.1 }, 'vehicle_body'),
          createCuboid({ x: 0.1, y: 0.85, z: -0.1 }, { x: width, y: 0.42, z: depth * 0.7 }, 'vehicle_cabin'),
        ]);
      case 'humanoid':
        return mergeMeshes([
          createCuboid({ x: 0, y: 1.0, z: 0 }, { x: 0.7, y: 1.1, z: 0.35 }, 'humanoid_torso'),
          createCuboid({ x: 0, y: 1.8, z: 0 }, { x: 0.45, y: 0.45, z: 0.4 }, 'humanoid_head'),
          createCuboid({ x: -0.65, y: 1.0, z: 0 }, { x: 0.18, y: 0.9, z: 0.18 }, 'humanoid_arm_l'),
          createCuboid({ x: 0.65, y: 1.0, z: 0 }, { x: 0.18, y: 0.9, z: 0.18 }, 'humanoid_arm_r'),
          createCuboid({ x: -0.18, y: 0.3, z: 0 }, { x: 0.2, y: 0.9, z: 0.2 }, 'humanoid_leg_l'),
          createCuboid({ x: 0.18, y: 0.3, z: 0 }, { x: 0.2, y: 0.9, z: 0.2 }, 'humanoid_leg_r'),
        ]);
      case 'animal':
        return mergeMeshes([
          createCuboid({ x: 0, y: 0.8, z: 0 }, { x: width * 1.8, y: 0.8, z: depth }, 'animal_body'),
          createCuboid({ x: 0.95, y: 1.0, z: -0.1 }, { x: 0.5, y: 0.45, z: 0.45 }, 'animal_head'),
          createCuboid({ x: -0.55, y: 0.25, z: -0.25 }, { x: 0.16, y: 0.5, z: 0.16 }, 'animal_leg_a'),
          createCuboid({ x: 0.55, y: 0.25, z: -0.25 }, { x: 0.16, y: 0.5, z: 0.16 }, 'animal_leg_b'),
          createCuboid({ x: -0.55, y: 0.25, z: 0.25 }, { x: 0.16, y: 0.5, z: 0.16 }, 'animal_leg_c'),
          createCuboid({ x: 0.55, y: 0.25, z: 0.25 }, { x: 0.16, y: 0.5, z: 0.16 }, 'animal_leg_d'),
        ]);
      case 'generic':
      default:
        return createCuboid({ x: 0, y: height * 0.5, z: 0 }, { x: width, y: height, z: depth }, 'generic_proxy');
    }
  })();

  return {
    templateType,
    mesh,
  };
}

export function convertTopologyToEditableMesh(topology: TopologyMesh): EditableTopologyResult {
  const vertexIndexById = new Map(topology.vertices.map((vertex, index) => [vertex.id, index]));
  const faces = topology.faces.flatMap((face) => {
    if (face.vertexIds.length < 3) return [];
    const indices = face.vertexIds.map((vertexId) => vertexIndexById.get(vertexId)).filter((value): value is number => typeof value === 'number');
    if (indices.length < 3) return [];
    const triangles: EditableMesh['faces'] = [];
    for (let index = 1; index < indices.length - 1; index += 1) {
      triangles.push([indices[0]!, indices[index]!, indices[index + 1]!]);
    }
    return triangles;
  });

  return {
    topology: cloneMesh(topology),
    editableMesh: {
      vertices: topology.vertices.map((vertex) => cloneVec3(vertex.position)),
      faces,
    },
  };
}

export function convertEditableMeshToTopology(editableMesh: EditableMesh): TopologyMesh {
  const vertices = editableMesh.vertices.map((vertex, index) => ({
    id: `v${index}`,
    position: cloneVec3(vertex),
  }));
  const edges: TopologyEdge[] = [];
  const edgeKeys = new Set<string>();

  editableMesh.faces.forEach((face) => {
    const pairs: Array<[number, number]> = [
      [face[0], face[1]],
      [face[1], face[2]],
      [face[2], face[0]],
    ];
    pairs.forEach(([left, right]) => {
      const sorted = left < right ? [left, right] : [right, left];
      const key = `${sorted[0]}:${sorted[1]}`;
      if (edgeKeys.has(key)) return;
      edgeKeys.add(key);
      edges.push({
        id: `e${edges.length}`,
        a: `v${sorted[0]}`,
        b: `v${sorted[1]}`,
      });
    });
  });

  return cleanupTopology({
    vertices,
    edges,
    faces: editableMesh.faces.map((face, index) => ({
      id: `f${index}`,
      vertexIds: face.map((vertexIndex) => `v${vertexIndex}`),
    })),
  });
}

function average(values: EditableVec3[]): EditableVec3 {
  if (values.length === 0) return { x: 0, y: 0, z: 0 };
  const total = values.reduce(
    (acc, value) => ({ x: acc.x + value.x, y: acc.y + value.y, z: acc.z + value.z }),
    { x: 0, y: 0, z: 0 }
  );
  return {
    x: total.x / values.length,
    y: total.y / values.length,
    z: total.z / values.length,
  };
}

export class TopologyBrushSystem {
  private projectionAdapter: TopologyProjectionAdapter;
  private history = new TopologyHistory();
  private snapshotState: TopologyBrushSnapshot = {
    mode: 'template',
    activeTemplateType: null,
    mesh: createEmptyMesh(),
    templateParameters: {},
    currentStroke: [],
    currentSuggestion: null,
  };

  constructor(adapter?: TopologyProjectionAdapter, initialMesh?: TopologyMesh) {
    this.projectionAdapter = adapter ?? defaultProjectionAdapter();
    if (initialMesh) {
      this.snapshotState.mesh = cloneMesh(initialMesh);
    }
  }

  snapshot() {
    return {
      ...this.snapshotState,
      mesh: cloneMesh(this.snapshotState.mesh),
      currentStroke: this.snapshotState.currentStroke.map((entry) => ({
        ...entry,
        worldPosition: entry.worldPosition ? cloneVec3(entry.worldPosition) : null,
      })),
      currentSuggestion: this.snapshotState.currentSuggestion
        ? {
            ...this.snapshotState.currentSuggestion,
            preview: this.snapshotState.currentSuggestion.preview
              ? cloneMesh(this.snapshotState.currentSuggestion.preview)
              : null,
            hypotheses: [...this.snapshotState.currentSuggestion.hypotheses],
          }
        : null,
    };
  }

  InitializeTopologyBrushSystem() {
    this.snapshotState.currentStroke = [];
    this.snapshotState.currentSuggestion = null;
    return this.snapshot();
  }

  SetCreationMode(mode: CreationMode) {
    this.snapshotState.mode = mode;
    return this.snapshot();
  }

  ActivateTemplateMode(templateType: TemplateType) {
    this.snapshotState.mode = 'template';
    this.snapshotState.activeTemplateType = templateType;
    this.snapshotState.currentSuggestion = null;
    return this.snapshot();
  }

  ActivateIntentDrivenMode() {
    this.snapshotState.mode = 'intent_driven';
    this.snapshotState.activeTemplateType = null;
    this.snapshotState.currentSuggestion = null;
    return this.snapshot();
  }

  ResolveCursorSpace(input: TopologyBrushInput): CursorSpaceResolution {
    const surfaceHit = this.ProjectCursorToSurface(input);
    if (surfaceHit) {
      return {
        worldPosition: cloneVec3(surfaceHit.position),
        snapped: true,
        source: 'surface',
        surfaceHit,
      };
    }
    const workPlane = this.ProjectCursorToWorkPlane(input);
    return {
      worldPosition: cloneVec3(workPlane),
      snapped: false,
      source: 'work_plane',
      surfaceHit: null,
    };
  }

  ProjectCursorToSurface(input: TopologyBrushInput) {
    return this.projectionAdapter.projectCursorToSurface(input);
  }

  ProjectCursorToWorkPlane(input: TopologyBrushInput) {
    return this.projectionAdapter.projectCursorToWorkPlane(input);
  }

  DetectSurfaceHit(input: TopologyBrushInput) {
    return this.projectionAdapter.detectSurfaceHit(input);
  }

  BeginStroke(input: TopologyBrushInput) {
    const resolved = this.ResolveCursorSpace(input);
    this.snapshotState.currentStroke = [
      {
        ...input,
        worldPosition: cloneVec3(resolved.worldPosition),
      },
    ];
    this.snapshotState.currentSuggestion = null;
    return this.snapshot();
  }

  UpdateStroke(input: TopologyBrushInput) {
    const resolved = this.ResolveCursorSpace(input);
    this.snapshotState.currentStroke = [
      ...this.snapshotState.currentStroke,
      {
        ...input,
        worldPosition: cloneVec3(resolved.worldPosition),
      },
    ];
    this.snapshotState.currentSuggestion = this.BuildIntentPreview();
    return this.snapshot();
  }

  EndStroke(input: TopologyBrushInput) {
    this.UpdateStroke(input);
    this.snapshotState.currentSuggestion = this.BuildIntentPreview();
    return this.snapshot();
  }

  AnalyzeStrokeIntent(): IntentHypothesis[] {
    const stroke = this.snapshotState.currentStroke.filter((entry) => entry.worldPosition);
    const first = stroke[0]?.worldPosition ?? null;
    const last = stroke[stroke.length - 1]?.worldPosition ?? null;
    const closed = first && last ? distanceSquared(first, last) < 0.05 * 0.05 : false;

    if (this.snapshotState.mode === 'template' && this.snapshotState.activeTemplateType) {
      return [
        {
          kind: 'template_proxy',
          confidence: 0.92,
          reason: `Modo plantilla activo para ${this.snapshotState.activeTemplateType}.`,
        },
      ];
    }
    if (stroke.length <= 1) {
      return [{ kind: 'create_vertex', confidence: 0.95, reason: 'Stroke corto, crear vertice.' }];
    }
    if (stroke.length === 2) {
      return [{ kind: 'create_edge', confidence: 0.88, reason: 'Dos puntos definen una arista.' }];
    }
    if (closed) {
      return [{ kind: 'create_face', confidence: 0.83, reason: 'El stroke forma un loop cerrado.' }];
    }
    return [{ kind: 'extend_border', confidence: 0.72, reason: 'Stroke abierto, extender topologia.' }];
  }

  BuildIntentPreview(): IntentSuggestion | null {
    const hypotheses = this.AnalyzeStrokeIntent();
    const best = hypotheses[0];
    if (!best) return null;

    let preview: TopologyMesh | null = null;
    if (best.kind === 'template_proxy' && this.snapshotState.activeTemplateType) {
      preview = this.GenerateTemplateMesh(
        this.snapshotState.activeTemplateType,
        this.snapshotState.templateParameters
      ).mesh;
    } else if (best.kind === 'create_vertex') {
      const point = this.snapshotState.currentStroke[0]?.worldPosition ?? { x: 0, y: 0, z: 0 };
      preview = {
        vertices: [{ id: 'preview_v0', position: cloneVec3(point) }],
        edges: [],
        faces: [],
      };
    } else if (best.kind === 'create_edge') {
      const a = this.snapshotState.currentStroke[0]?.worldPosition ?? { x: 0, y: 0, z: 0 };
      const b = this.snapshotState.currentStroke[1]?.worldPosition ?? { x: 0.4, y: 0, z: 0 };
      preview = {
        vertices: [
          { id: 'preview_v0', position: cloneVec3(a) },
          { id: 'preview_v1', position: cloneVec3(b) },
        ],
        edges: [{ id: 'preview_e0', a: 'preview_v0', b: 'preview_v1' }],
        faces: [],
      };
    } else if (best.kind === 'create_face') {
      const vertices = this.snapshotState.currentStroke
        .filter((entry) => entry.worldPosition)
        .slice(0, 4)
        .map((entry, index) => ({
          id: `preview_v${index}`,
          position: cloneVec3(entry.worldPosition!),
        }));
      preview = {
        vertices,
        edges: vertices.map((vertex, index) => ({
          id: `preview_e${index}`,
          a: vertex.id,
          b: vertices[(index + 1) % vertices.length]?.id ?? vertex.id,
        })),
        faces: [
          {
            id: 'preview_f0',
            vertexIds: vertices.map((vertex) => vertex.id),
          },
        ],
      };
    }

    return {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      hypotheses,
      preview,
      accepted: false,
      rejected: false,
    };
  }

  AcceptIntentSuggestion() {
    const suggestion = this.snapshotState.currentSuggestion;
    const intent = suggestion?.hypotheses[0] ?? null;
    if (!intent) return this.snapshot();

    if (intent.kind === 'template_proxy' && this.snapshotState.activeTemplateType) {
      const generated = this.GenerateTemplateMesh(
        this.snapshotState.activeTemplateType,
        this.snapshotState.templateParameters
      );
      this.CommitTopologyCommand(`template:${generated.templateType}`, generated.mesh);
    } else if (intent.kind === 'create_vertex') {
      const cursor = this.snapshotState.currentStroke[0];
      if (cursor) {
        this.CreateVertexAtCursor(cursor);
      }
    } else if (intent.kind === 'create_edge') {
      const points = this.snapshotState.currentStroke.slice(0, 2);
      if (points.length === 2) {
        const a = this.CreateVertexAtCursor(points[0])!;
        const b = this.CreateVertexAtCursor(points[1])!;
        this.CreateEdgeBetweenVertices(a.id, b.id);
      }
    } else if (intent.kind === 'create_face') {
      const ids = this.snapshotState.currentStroke
        .filter((entry) => entry.worldPosition)
        .map((entry) => this.CreateVertexAtCursor(entry)?.id)
        .filter((id): id is string => Boolean(id));
      this.TryCreateFaceFromSelection(ids);
    } else if (intent.kind === 'extend_border') {
      this.ExtendTopologyFromBorder();
    }

    if (this.snapshotState.currentSuggestion) {
      this.snapshotState.currentSuggestion.accepted = true;
    }
    this.snapshotState.currentStroke = [];
    return this.snapshot();
  }

  RejectIntentSuggestion() {
    if (this.snapshotState.currentSuggestion) {
      this.snapshotState.currentSuggestion.rejected = true;
    }
    this.snapshotState.currentSuggestion = null;
    this.snapshotState.currentStroke = [];
    return this.snapshot();
  }

  GenerateTemplateMesh(templateType: TemplateType, parameters: TopologyTemplateParameters = {}) {
    return generateTemplateMesh(templateType, parameters);
  }

  UpdateTemplateParameters(parameters: Partial<TopologyTemplateParameters>) {
    this.snapshotState.templateParameters = {
      ...this.snapshotState.templateParameters,
      ...parameters,
    };
    return this.snapshot();
  }

  ConvertTemplateToEditableMesh(templateType?: TemplateType): EditableTopologyResult {
    const template = this.GenerateTemplateMesh(
      templateType ?? this.snapshotState.activeTemplateType ?? 'generic',
      this.snapshotState.templateParameters
    );
    return convertTopologyToEditableMesh(template.mesh);
  }

  CreateVertexAtCursor(input: TopologyBrushInput) {
    const resolved = this.ResolveCursorSpace(input);
    const before = cloneMesh(this.snapshotState.mesh);
    const vertex: TopologyVertex = {
      id: crypto.randomUUID(),
      position: cloneVec3(resolved.worldPosition),
    };
    const next = cloneMesh(this.snapshotState.mesh);
    next.vertices.push(vertex);
    this.CommitTopologyCommand('create_vertex', next, before);
    return vertex;
  }

  CreateEdgeBetweenVertices(aId: string, bId: string) {
    if (aId === bId) return null;
    const exists = this.snapshotState.mesh.edges.some(
      (edge) => [edge.a, edge.b].sort().join(':') === [aId, bId].sort().join(':')
    );
    if (exists) return null;
    const before = cloneMesh(this.snapshotState.mesh);
    const next = cloneMesh(this.snapshotState.mesh);
    const edge: TopologyEdge = { id: crypto.randomUUID(), a: aId, b: bId };
    next.edges.push(edge);
    this.CommitTopologyCommand('create_edge', next, before);
    return edge;
  }

  TryCreateFaceFromSelection(vertexIds: string[]) {
    const unique = Array.from(new Set(vertexIds));
    if (unique.length < 3) return null;
    const before = cloneMesh(this.snapshotState.mesh);
    const next = cloneMesh(this.snapshotState.mesh);
    const face: TopologyFace = {
      id: crypto.randomUUID(),
      vertexIds: unique,
    };
    next.faces.push(face);

    unique.forEach((vertexId, index) => {
      const nextVertexId = unique[(index + 1) % unique.length]!;
      const edgeKey = [vertexId, nextVertexId].sort().join(':');
      const found = next.edges.some((edge) => [edge.a, edge.b].sort().join(':') === edgeKey);
      if (!found) {
        next.edges.push({ id: crypto.randomUUID(), a: vertexId, b: nextVertexId });
      }
    });

    this.CommitTopologyCommand('create_face', next, before);
    return face;
  }

  ExtendTopologyFromBorder() {
    const before = cloneMesh(this.snapshotState.mesh);
    const next = cloneMesh(this.snapshotState.mesh);
    const sourceVertex = next.vertices[next.vertices.length - 1];
    if (!sourceVertex) return null;
    const newVertex: TopologyVertex = {
      id: crypto.randomUUID(),
      position: {
        x: sourceVertex.position.x + 0.2,
        y: sourceVertex.position.y,
        z: sourceVertex.position.z,
      },
    };
    next.vertices.push(newVertex);
    next.edges.push({
      id: crypto.randomUUID(),
      a: sourceVertex.id,
      b: newVertex.id,
    });
    this.CommitTopologyCommand('extend_border', next, before);
    return newVertex;
  }

  ApplyAutoWeld(distance = 0.001) {
    const before = cloneMesh(this.snapshotState.mesh);
    const next = cloneMesh(this.snapshotState.mesh);
    const thresholdSq = distance * distance;
    const remap = new Map<string, string>();

    next.vertices.forEach((vertex, index) => {
      for (let compareIndex = 0; compareIndex < index; compareIndex += 1) {
        const other = next.vertices[compareIndex]!;
        if (distanceSquared(vertex.position, other.position) <= thresholdSq) {
          remap.set(vertex.id, other.id);
          break;
        }
      }
    });

    next.edges = next.edges.map((edge) => ({
      ...edge,
      a: remap.get(edge.a) ?? edge.a,
      b: remap.get(edge.b) ?? edge.b,
    }));
    next.faces = next.faces.map((face) => ({
      ...face,
      vertexIds: face.vertexIds.map((vertexId) => remap.get(vertexId) ?? vertexId),
    }));
    next.vertices = next.vertices.filter((vertex) => !remap.has(vertex.id));
    this.CommitTopologyCommand('auto_weld', cleanupTopology(next), before);
    return this.snapshot();
  }

  ApplyCleanup() {
    const before = cloneMesh(this.snapshotState.mesh);
    this.CommitTopologyCommand('cleanup', cleanupTopology(this.snapshotState.mesh), before);
    return this.snapshot();
  }

  ApplyRelax() {
    const before = cloneMesh(this.snapshotState.mesh);
    const next = cloneMesh(this.snapshotState.mesh);
    const neighbours = new Map<string, EditableVec3[]>();
    next.edges.forEach((edge) => {
      const a = next.vertices.find((vertex) => vertex.id === edge.a);
      const b = next.vertices.find((vertex) => vertex.id === edge.b);
      if (!a || !b) return;
      neighbours.set(a.id, [...(neighbours.get(a.id) ?? []), b.position]);
      neighbours.set(b.id, [...(neighbours.get(b.id) ?? []), a.position]);
    });
    next.vertices = next.vertices.map((vertex) => ({
      ...vertex,
      position:
        (neighbours.get(vertex.id)?.length ?? 0) > 0
          ? average([vertex.position, ...(neighbours.get(vertex.id) ?? [])])
          : vertex.position,
    }));
    this.CommitTopologyCommand('relax', next, before);
    return this.snapshot();
  }

  ApplySymmetry(axis: 'x' | 'y' | 'z' = 'x') {
    const before = cloneMesh(this.snapshotState.mesh);
    const next = cloneMesh(this.snapshotState.mesh);
    const mirroredVertices = next.vertices.map((vertex) => ({
      id: `${vertex.id}_mirror_${axis}`,
      position: {
        x: axis === 'x' ? -vertex.position.x : vertex.position.x,
        y: axis === 'y' ? -vertex.position.y : vertex.position.y,
        z: axis === 'z' ? -vertex.position.z : vertex.position.z,
      },
    }));
    next.vertices.push(...mirroredVertices);
    this.CommitTopologyCommand(`symmetry_${axis}`, cleanupTopology(next), before);
    return this.snapshot();
  }

  ValidateTopology() {
    return validateTopology(this.snapshotState.mesh);
  }

  CommitTopologyCommand(label: string, mesh?: TopologyMesh, beforeOverride?: TopologyMesh) {
    const before = beforeOverride ? cloneMesh(beforeOverride) : cloneMesh(this.snapshotState.mesh);
    const after = mesh ? cloneMesh(mesh) : cloneMesh(this.snapshotState.mesh);
    this.history.push({
      id: crypto.randomUUID(),
      label,
      before,
      after,
    });
    this.snapshotState.mesh = cleanupTopology(after);
    return this.snapshot();
  }

  Undo() {
    const previous = this.history.undo(this.snapshotState.mesh);
    if (previous) {
      this.snapshotState.mesh = cleanupTopology(previous);
    }
    return this.snapshot();
  }

  Redo() {
    const next = this.history.redo(this.snapshotState.mesh);
    if (next) {
      this.snapshotState.mesh = cleanupTopology(next);
    }
    return this.snapshot();
  }
}

export function InitializeTopologyBrushSystem(initialMesh?: TopologyMesh) {
  return new TopologyBrushSystem(undefined, initialMesh);
}
