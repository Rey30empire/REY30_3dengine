'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { useEngineStore } from '@/store/editorStore';
import { cn } from '@/lib/utils';
import {
  Box,
  Copy,
  Layers,
  Move,
  Save,
  Scissors,
  Sparkles,
  Triangle,
  Wand2,
} from 'lucide-react';
import {
  arrayMesh,
  assignFaceSet,
  bevelEdges,
  bridgeEdges,
  bridgeEdgeLoops,
  clearVertexMask,
  decimateMesh,
  collapseEdges,
  createPrimitiveMesh,
  clearSeamEdges,
  deleteEdges,
  deleteFaces,
  deleteVertices,
  duplicateFacesAlongNormal,
  fillEdges,
  fillVertices,
  gridFillEdges,
  gridFillVertices,
  extrudeFaceRegion,
  fitSelectionUvs,
  getFaceSetId,
  getHiddenFaceIndices,
  getVisibleFaceIndices,
  getVertexMaskValue,
  hideFaces,
  insetFaceRegion,
  knifeFace,
  listMeshEdges,
  listVisibleMeshEdgeIndices,
  markSeamEdges,
  maskVertices,
  mergeVertices,
  mirrorMeshX,
  moveVertices,
  packUvIslands,
  parseEditableMesh,
  polyBuildEdge,
  projectSelectionUvs,
  growFaceSelection,
  relaxVertices,
  ripFaces,
  remeshMeshUniform,
  rotateSelectionUvs,
  scaleSelectionUvs,
  selectEdgePath,
  selectEdgeLoop,
  selectEdgeRing,
  selectFaceIsland,
  selectFacesByNormal,
  selectUvIsland,
  selectVertexPath,
  separateFaces,
  revealFaces,
  sanitizeEditableMesh,
  selectFaceSet,
  shrinkwrapMesh,
  shrinkFaceSelection,
  slideVertices,
  solidifyMesh,
  subdivideEdge,
  subdivideFace,
  translateSelectionUvs,
  unwrapMeshPlanar,
  weldVerticesByDistance,
  type EditableMesh,
  type ModelerElementMode,
} from './modelerMesh';
import {
  applyMeshModifierStack,
  buildMeshModifierPreviewMetrics,
  cloneMeshModifier,
  cloneMeshModifierStack,
  createArrayModifier,
  createDecimateModifier,
  createMirrorModifier,
  parseMeshModifierPresetLibraryDocument,
  createRemeshModifier,
  createSolidifyModifier,
  serializeMeshModifierPresetLibraryDocument,
  parseMeshModifierStackDocument,
  parseMeshModifierStack,
  sanitizeMeshModifier,
  serializeMeshModifierStackDocument,
  summarizeMeshModifierStack,
  type MeshModifier,
} from './meshModifiers';
import {
  BUILTIN_GEOMETRY_NODE_RECIPES,
  geometryNodesToModifierStack,
  modifierStackToGeometryNodes,
  parseGeometryNodeGraphDocument,
  serializeGeometryNodeGraphDocument,
  summarizeGeometryNodeGraph,
} from './geometryNodesLite';
import {
  buildEntityThumbnailKey,
  createMeshRendererThumbnailEntity,
  EntityVisualThumbnail,
} from './visualThumbnails';
import { TopologyAuthoringCard } from './TopologyAuthoringCard';

type EditMode = 'object' | ModelerElementMode;
type SlideConstraint = 'free' | 'path' | 'x' | 'y' | 'z';
type ArrayMode = 'linear' | 'radial';
type ArrayAxis = 'x' | 'y' | 'z';

interface AuthSessionPayload {
  authenticated?: boolean;
}

const MODELER_AUTH_HINT =
  'Inicia sesion en Config APIs -> Usuario para guardar meshes y presets persistentes.';
const MODELER_MODIFIER_PRESETS_STORAGE_KEY = 'rey30:modeler:modifier-presets:v1';
const MODELER_DETACHED_STACK_STORAGE_KEY = 'rey30:modeler:detached-modifier-stack:v1';

interface ModifierStackPreset {
  id: string;
  name: string;
  description?: string;
  modifiers: MeshModifier[];
}

interface ServerModifierPresetItem {
  name: string;
  path: string;
  projectKey: string;
  scope: 'project' | 'shared';
  definition: {
    name?: string;
    description?: string;
    modifiers: MeshModifier[];
  };
}

function parseServerModifierPresetItems(payload: unknown): ServerModifierPresetItem[] {
  return Array.isArray((payload as { presets?: unknown[] })?.presets)
    ? ((payload as { presets: Array<Record<string, unknown>> }).presets ?? [])
        .flatMap((entry) => {
          const definition = parseMeshModifierStackDocument(entry?.definition);
          const name =
            typeof entry?.name === 'string'
              ? entry.name
              : definition?.name?.trim() || 'modifier_preset';
          const path = typeof entry?.path === 'string' ? entry.path : '';
          const projectKey = typeof entry?.projectKey === 'string' ? entry.projectKey : '';
          const scope = entry?.scope === 'shared' ? 'shared' : 'project';
          if (!definition || !path) {
            return [];
          }
          return [
            {
              name,
              path,
              projectKey,
              scope,
              definition: {
                name: definition.name,
                description: definition.description,
                modifiers: definition.modifiers,
              },
            } satisfies ServerModifierPresetItem,
          ];
        })
    : [];
}

function summarizeServerPresetLoadError(error: unknown): string {
  const message = String(error || 'No se pudieron cargar presets del servidor.');
  return message.trim() || 'No se pudieron cargar presets del servidor.';
}

function createLocalModelerId(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
}

function clampSelection(indices: number[], max: number) {
  if (max <= 0) return [];
  const next = Array.from(
    new Set(indices.filter((index) => index >= 0 && index < max))
  );
  return next.length > 0 ? next : [0];
}

function clampSelectableSelection(
  indices: number[],
  max: number,
  selectableIds: number[]
) {
  const clamped = clampSelection(indices, max);
  const allowed = new Set(selectableIds);
  const filtered = clamped.filter((index) => allowed.has(index));
  if (filtered.length > 0) {
    return filtered;
  }
  return selectableIds.length > 0 ? [selectableIds[0]!] : [];
}

function readNumericInput(rawValue: string, fallback: number) {
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseStoredModifierPresets(value: unknown): ModifierStackPreset[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    const record = asRecord(entry);
    const name =
      typeof record?.name === 'string' && record.name.trim().length > 0
        ? record.name.trim()
        : null;
    if (!name) {
      return [];
    }

    const modifiers = parseMeshModifierStack(record?.modifiers);
    if (modifiers.length === 0) {
      return [];
    }

    return [
      {
        id:
          typeof record?.id === 'string' && record.id.trim().length > 0
            ? record.id.trim()
            : createLocalModelerId('modifier_preset'),
        name,
        description:
          typeof record?.description === 'string' && record.description.trim().length > 0
            ? record.description.trim()
            : undefined,
        modifiers,
      } satisfies ModifierStackPreset,
    ];
  });
}

const BUILTIN_MODIFIER_PRESETS: Array<{
  id: string;
  name: string;
  description: string;
  build: () => MeshModifier[];
}> = [
  {
    id: 'mirror_shell',
    name: 'Mirror Shell',
    description: 'Mirror + solidify para blockout simetrico no destructivo.',
    build: () => [createMirrorModifier(), createSolidifyModifier(0.08)],
  },
  {
    id: 'radial_kit',
    name: 'Radial Kit',
    description: 'Array radial listo para props circulares y repeticion rapida.',
    build: () => [
      createArrayModifier({
        count: 8,
        mode: 'radial',
        axis: 'y',
        radius: 2,
        angle: 360,
        rotateInstances: true,
      }),
    ],
  },
  {
    id: 'proxy_lod',
    name: 'Proxy LOD',
    description: 'Remesh suave + decimate para sacar un proxy rapido.',
    build: () => [createRemeshModifier(1, 0.12), createDecimateModifier(0.55)],
  },
];

async function persistMeshRemote(name: string, mesh: EditableMesh) {
  const response = await fetch('/api/modeler/persist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mesh }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || 'No se pudo guardar el mesh');
  }
  return payload as {
    path?: string;
    asset?: {
      id?: string;
      name?: string;
      path?: string;
      size?: number;
      createdAt?: string;
    };
  };
}

type ModelerWorkspaceProps = {
  initialMesh: EditableMesh;
  initialName: string;
  targetEntityId: string | null;
  targetEntityName: string | null;
};

function ModelerWorkspace({
  initialMesh,
  initialName,
  targetEntityId,
  targetEntityName,
}: ModelerWorkspaceProps) {
  const {
    entities,
    editor,
    addAsset,
    addEntity,
    updateEntity,
    selectEntity,
    createScene,
    activeSceneId,
    projectName,
    setModelerMode,
    setModelerSelection,
    setSnapEnabled,
    setSnapTarget,
  } = useEngineStore();

  const [name, setName] = useState(initialName);
  const [message, setMessage] = useState(
    targetEntityName ? `Editando ${targetEntityName}` : 'Sin MeshRenderer seleccionado'
  );
  const [mesh, setMesh] = useState<EditableMesh>(initialMesh);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionChecking, setSessionChecking] = useState(true);
  const [solidifyThickness, setSolidifyThickness] = useState(0.12);
  const [weldDistance, setWeldDistance] = useState(0.05);
  const [slideAmount, setSlideAmount] = useState(0.35);
  const [slideConstraint, setSlideConstraint] = useState<SlideConstraint>('free');
  const [relaxStrength, setRelaxStrength] = useState(0.45);
  const [relaxIterations, setRelaxIterations] = useState(1);
  const [bevelAmount, setBevelAmount] = useState(0.18);
  const [bevelSegments, setBevelSegments] = useState(1);
  const [bridgeSegments, setBridgeSegments] = useState(1);
  const [polyBuildDistance, setPolyBuildDistance] = useState(0.2);
  const [extrudeDistance, setExtrudeDistance] = useState(0.2);
  const [duplicateDistance, setDuplicateDistance] = useState(0.3);
  const [insetAmount, setInsetAmount] = useState(0.18);
  const [knifeAmount, setKnifeAmount] = useState(0.5);
  const [knifeSegments, setKnifeSegments] = useState(1);
  const [faceRegionSteps, setFaceRegionSteps] = useState(1);
  const [normalTolerance, setNormalTolerance] = useState(12);
  const [uvOffsetU, setUvOffsetU] = useState(0.1);
  const [uvOffsetV, setUvOffsetV] = useState(0.1);
  const [uvScaleU, setUvScaleU] = useState(1.1);
  const [uvScaleV, setUvScaleV] = useState(1.1);
  const [uvRotation, setUvRotation] = useState(15);
  const [uvPadding, setUvPadding] = useState(0.02);
  const [materialIdInput, setMaterialIdInput] = useState('default');
  const [checkerPreviewEnabled, setCheckerPreviewEnabled] = useState(false);
  const [checkerScale, setCheckerScale] = useState(8);
  const [arrayMode, setArrayMode] = useState<ArrayMode>('linear');
  const [arrayCount, setArrayCount] = useState(3);
  const [arrayAxis, setArrayAxis] = useState<ArrayAxis>('y');
  const [arrayRadius, setArrayRadius] = useState(2);
  const [arrayAngle, setArrayAngle] = useState(360);
  const [arrayRotateInstances, setArrayRotateInstances] = useState(true);
  const [arrayOffsetX, setArrayOffsetX] = useState(1.5);
  const [arrayOffsetY, setArrayOffsetY] = useState(0);
  const [arrayOffsetZ, setArrayOffsetZ] = useState(0);
  const [remeshIterations, setRemeshIterations] = useState(1);
  const [decimateRatio, setDecimateRatio] = useState(0.5);
  const [weightedNormalsEnabled, setWeightedNormalsEnabled] = useState(false);
  const [weightedNormalsStrength, setWeightedNormalsStrength] = useState(1);
  const [weightedNormalsKeepSharp, setWeightedNormalsKeepSharp] = useState(true);
  const [retopoTargetEntityId, setRetopoTargetEntityId] = useState('');
  const [retopoOffset, setRetopoOffset] = useState(0);
  const [faceSetInput, setFaceSetInput] = useState(1);
  const [detachedModifierStack, setDetachedModifierStack] = useState<MeshModifier[]>([]);
  const [customModifierPresets, setCustomModifierPresets] = useState<ModifierStackPreset[]>([]);
  const [serverModifierPresets, setServerModifierPresets] = useState<ServerModifierPresetItem[]>([]);
  const [serverModifierPresetsLoading, setServerModifierPresetsLoading] = useState(false);
  const [serverModifierPresetsError, setServerModifierPresetsError] = useState<string | null>(null);
  const [modifierPresetName, setModifierPresetName] = useState('');
  const [modifierPresetDescription, setModifierPresetDescription] = useState('');
  const [modifierPresetFilter, setModifierPresetFilter] = useState('');
  const [modifierTransferJson, setModifierTransferJson] = useState('');
  const [geometryNodesJson, setGeometryNodesJson] = useState('');
  const [modifierLibraryJson, setModifierLibraryJson] = useState('');
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);
  const selectionSectionRef = useRef<HTMLDivElement | null>(null);
  const notesSectionRef = useRef<HTMLDivElement | null>(null);
  const detachedStackHydratedRef = useRef(false);
  const modifierPresetsHydratedRef = useRef(false);
  const [scrollProgress, setScrollProgress] = useState(100);
  const editMode = (editor.modelerMode ?? 'face') as EditMode;
  const selectedElements = editor.modelerSelectedElements ?? [0];

  const targetEntity = targetEntityId ? entities.get(targetEntityId) ?? null : null;
  const targetEntityMesh = useMemo(() => {
    if (!targetEntity) return initialMesh;
    const meshRendererData = asRecord(targetEntity.components.get('MeshRenderer')?.data);
    const parsedMesh = parseEditableMesh(
      meshRendererData?.manualMesh ?? meshRendererData?.customMesh
    );
    if (parsedMesh) return parsedMesh;
    const meshId =
      typeof meshRendererData?.meshId === 'string' ? meshRendererData.meshId : 'cube';
    return createPrimitiveMesh(meshId);
  }, [initialMesh, targetEntity]);
  const targetEntityMeshSignature = useMemo(
    () => JSON.stringify(targetEntityMesh),
    [targetEntityMesh]
  );
  const targetMeshRendererData = asRecord(targetEntity?.components.get('MeshRenderer')?.data);
  const targetEntityMaterialId =
    typeof targetMeshRendererData?.materialId === 'string'
      ? targetMeshRendererData.materialId
      : 'default';
  const targetEntityCheckerPreview = Boolean(targetMeshRendererData?.checkerPreview);
  const targetEntityCheckerScale = Number.isFinite(Number(targetMeshRendererData?.checkerScale))
    ? Number(targetMeshRendererData?.checkerScale)
    : 8;
  const targetEntityMaterialOverride = asRecord(targetMeshRendererData?.material);
  const retopoTargetEntries = useMemo(
    () =>
      Array.from(entities.values())
        .filter((entity) => entity.id !== targetEntityId)
        .flatMap((entity) => {
          const meshRendererData = asRecord(entity.components.get('MeshRenderer')?.data);
          if (!meshRendererData) {
            return [];
          }
          return [
            {
              id: entity.id,
              name: entity.name,
              mesh: parseEditableMesh(
                meshRendererData.manualMesh ?? meshRendererData.customMesh
              ) ??
                createPrimitiveMesh(
                  typeof meshRendererData.meshId === 'string'
                    ? meshRendererData.meshId
                    : 'cube'
                ),
            },
          ];
        }),
    [entities, targetEntityId]
  );
  const retopoTargetEntry = retopoTargetEntries.find(
    (entry) => entry.id === retopoTargetEntityId
  ) ?? null;
  const presetThumbnailMaterialId = targetEntity
    ? targetEntityMaterialId
    : materialIdInput.trim() || 'default';
  const presetThumbnailCheckerPreview = targetEntity
    ? targetEntityCheckerPreview
    : checkerPreviewEnabled;
  const presetThumbnailCheckerScale = targetEntity
    ? targetEntityCheckerScale
    : checkerScale;
  const presetThumbnailMaterialOverride = targetEntity ? targetEntityMaterialOverride : null;
  const entityModifierStack = useMemo(
    () => parseMeshModifierStack(targetMeshRendererData?.modifiers),
    [targetMeshRendererData]
  );
  const modifierStack = targetEntity ? entityModifierStack : detachedModifierStack;
  const geometryNodeGraph = useMemo(
    () => modifierStackToGeometryNodes(modifierStack),
    [modifierStack]
  );
  const geometryNodeSummary = useMemo(
    () => summarizeGeometryNodeGraph(geometryNodeGraph),
    [geometryNodeGraph]
  );
  const previewMesh = useMemo(
    () =>
      modifierStack.length > 0
        ? applyMeshModifierStack(mesh, modifierStack)
        : mesh,
    [mesh, modifierStack]
  );
  const targetEntityWeightedNormalsEnabled = Boolean(
    targetEntityMaterialOverride?.weightedNormalsEnabled
  );
  const targetEntityWeightedNormalsStrength = Number.isFinite(
    Number(targetEntityMaterialOverride?.weightedNormalsStrength)
  )
    ? Number(targetEntityMaterialOverride?.weightedNormalsStrength)
    : 1;
  const targetEntityWeightedNormalsKeepSharp =
    typeof targetEntityMaterialOverride?.weightedNormalsKeepSharp === 'boolean'
      ? targetEntityMaterialOverride.weightedNormalsKeepSharp
      : true;
  const edges = useMemo(() => listMeshEdges(mesh), [mesh]);
  const visibleEdgeIndices = useMemo(() => listVisibleMeshEdgeIndices(mesh), [mesh]);
  const hiddenFaceIndices = useMemo(() => getHiddenFaceIndices(mesh), [mesh]);
  const visibleFaceIndices = useMemo(() => getVisibleFaceIndices(mesh), [mesh]);
  const maskedVertexCount = useMemo(
    () =>
      mesh.vertices.reduce(
        (count, _vertex, index) => count + (getVertexMaskValue(mesh, index) > 0.0001 ? 1 : 0),
        0
      ),
    [mesh]
  );
  const faceSetCount = useMemo(
    () =>
      new Set((mesh.faceSets ?? []).filter((value) => Number(value) > 0)).size,
    [mesh.faceSets]
  );
  const previewEdges = useMemo(() => listMeshEdges(previewMesh), [previewMesh]);
  const buildModifierPresetThumbnail = useCallback(
    (idSeed: string, presetName: string, modifiers: MeshModifier[]) => {
      const meshRendererData: Record<string, unknown> = {
        meshId: 'custom',
        manualMesh: mesh,
        modifiers,
        materialId: presetThumbnailMaterialId,
        checkerPreview: presetThumbnailCheckerPreview,
        checkerScale: presetThumbnailCheckerScale,
      };
      if (presetThumbnailMaterialOverride) {
        meshRendererData.material = presetThumbnailMaterialOverride;
      }

      const thumbnailEntity = createMeshRendererThumbnailEntity({
        idSeed: `modifier_preset_${idSeed}`,
        name: presetName,
        meshRendererData,
      });
      return {
        thumbnailEntity,
        thumbnailKey: buildEntityThumbnailKey(
          thumbnailEntity,
          `modifier-preset:${idSeed}`
        ),
      };
    },
    [
      mesh,
      presetThumbnailCheckerPreview,
      presetThumbnailCheckerScale,
      presetThumbnailMaterialId,
      presetThumbnailMaterialOverride,
    ]
  );
  const builtInPresetEntries = useMemo(
    () =>
      BUILTIN_MODIFIER_PRESETS.map((preset) => {
        const modifiers = preset.build();
        const thumbnail = buildModifierPresetThumbnail(
          `builtin:${preset.id}`,
          preset.name,
          modifiers
        );
        return {
          ...preset,
          modifiers,
          summary: summarizeMeshModifierStack(modifiers),
          metrics: buildMeshModifierPreviewMetrics(mesh, modifiers),
          ...thumbnail,
        };
      }),
    [buildModifierPresetThumbnail, mesh]
  );
  const geometryNodeRecipeEntries = useMemo(
    () =>
      BUILTIN_GEOMETRY_NODE_RECIPES.map((recipe) => {
        const modifiers = geometryNodesToModifierStack(recipe.nodes);
        const thumbnail = buildModifierPresetThumbnail(
          `gn:${recipe.id}`,
          recipe.name,
          modifiers
        );
        return {
          ...recipe,
          modifiers,
          summary: summarizeGeometryNodeGraph(recipe.nodes),
          metrics: buildMeshModifierPreviewMetrics(mesh, modifiers),
          ...thumbnail,
        };
      }),
    [buildModifierPresetThumbnail, mesh]
  );
  const customPresetEntries = useMemo(
    () =>
      customModifierPresets.map((preset) => {
        const thumbnail = buildModifierPresetThumbnail(
          `custom:${preset.id}`,
          preset.name,
          preset.modifiers
        );
        return {
          ...preset,
          summary: summarizeMeshModifierStack(preset.modifiers),
          metrics: buildMeshModifierPreviewMetrics(mesh, preset.modifiers),
          ...thumbnail,
        };
      }),
    [buildModifierPresetThumbnail, customModifierPresets, mesh]
  );
  const serverPresetEntries = useMemo(
    () =>
      serverModifierPresets.map((preset) => {
        const thumbnail = buildModifierPresetThumbnail(
          `server:${preset.path}`,
          preset.name,
          preset.definition.modifiers
        );
        return {
          ...preset,
          summary: summarizeMeshModifierStack(preset.definition.modifiers),
          metrics: buildMeshModifierPreviewMetrics(mesh, preset.definition.modifiers),
          ...thumbnail,
        };
      }),
    [buildModifierPresetThumbnail, serverModifierPresets, mesh]
  );
  const normalizedPresetFilter = modifierPresetFilter.trim().toLowerCase();
  const filteredBuiltInPresetEntries = useMemo(() => {
    if (!normalizedPresetFilter) {
      return builtInPresetEntries;
    }

    return builtInPresetEntries.filter((preset) =>
      [preset.name, preset.description, preset.summary]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalizedPresetFilter)
    );
  }, [builtInPresetEntries, normalizedPresetFilter]);
  const filteredGeometryNodeRecipeEntries = useMemo(() => {
    if (!normalizedPresetFilter) {
      return geometryNodeRecipeEntries;
    }

    return geometryNodeRecipeEntries.filter((recipe) =>
      [recipe.name, recipe.description, recipe.summary]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalizedPresetFilter)
    );
  }, [geometryNodeRecipeEntries, normalizedPresetFilter]);
  const filteredCustomPresetEntries = useMemo(() => {
    if (!normalizedPresetFilter) {
      return customPresetEntries;
    }

    return customPresetEntries.filter((preset) =>
      [preset.name, preset.description, preset.summary]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalizedPresetFilter)
    );
  }, [customPresetEntries, normalizedPresetFilter]);
  const filteredServerPresetEntries = useMemo(() => {
    if (!normalizedPresetFilter) {
      return serverPresetEntries;
    }

    return serverPresetEntries.filter((preset) =>
      [preset.name, preset.definition.description, preset.summary]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalizedPresetFilter)
    );
  }, [serverPresetEntries, normalizedPresetFilter]);
  const maxSelectable =
    editMode === 'vertex'
      ? mesh.vertices.length
      : editMode === 'edge'
        ? edges.length
        : editMode === 'face'
          ? mesh.faces.length
          : 0;
  const selectableItemIds =
    editMode === 'vertex'
      ? mesh.vertices.map((_vertex, index) => index)
      : editMode === 'edge'
        ? visibleEdgeIndices
        : editMode === 'face'
          ? visibleFaceIndices
          : [];
  const safeSelectedElements =
    editMode === 'object'
      ? []
      : clampSelectableSelection(selectedElements, maxSelectable, selectableItemIds);
  const selectedEdgeIndex = safeSelectedElements[0] ?? selectableItemIds[0] ?? 0;
  const selectedFaceSetId =
    editMode === 'face' && safeSelectedElements.length > 0
      ? getFaceSetId(mesh, safeSelectedElements[0] ?? 0)
      : 0;

  const syncMeshToSelectedEntity = (
    nextMesh: EditableMesh,
    nextMessage?: string,
    nextSelection?: number[]
  ) => {
    const sanitizedMesh = sanitizeEditableMesh(nextMesh);
    setMesh(sanitizedMesh);
    if (!targetEntity) {
      if (nextMessage) setMessage(nextMessage);
      if (nextSelection) {
        setModelerSelection(nextSelection);
      }
      return;
    }

    const meshRenderer = targetEntity.components.get('MeshRenderer');
    if (!meshRenderer) return;

    const data = asRecord(meshRenderer.data) ?? {};
    const nextComponents = new Map(targetEntity.components);
    nextComponents.set('MeshRenderer', {
      ...meshRenderer,
      data: {
        ...data,
        meshId: 'custom',
        manualMesh: sanitizedMesh,
      },
    });

    updateEntity(targetEntity.id, { components: nextComponents });
    if (nextMessage) {
      setMessage(nextMessage);
    }
    if (nextSelection) {
      setModelerSelection(nextSelection);
    }
  };

  const syncMeshRendererData = (
    patch: Record<string, unknown>,
    nextMessage?: string
  ) => {
    if (!targetEntity) {
      if (nextMessage) setMessage(nextMessage);
      return;
    }

    const meshRenderer = targetEntity.components.get('MeshRenderer');
    if (!meshRenderer) return;

    const data = asRecord(meshRenderer.data) ?? {};
    const nextComponents = new Map(targetEntity.components);
    nextComponents.set('MeshRenderer', {
      ...meshRenderer,
      data: {
        ...data,
        ...patch,
      },
    });
    updateEntity(targetEntity.id, { components: nextComponents });
    if (nextMessage) {
      setMessage(nextMessage);
    }
  };

  const updateModifierStack = (
    nextModifiers: MeshModifier[],
    nextMessage?: string
  ) => {
    if (!targetEntity) {
      setDetachedModifierStack(nextModifiers);
      if (nextMessage) {
        setMessage(nextMessage);
      }
      return;
    }

    syncMeshRendererData(
      {
        modifiers: nextModifiers,
      },
      nextMessage
    );
  };

  const addModifierToStack = (modifier: MeshModifier) => {
    updateModifierStack(
      [...modifierStack, modifier],
      `Modifier agregado: ${modifier.label ?? modifier.type}`
    );
  };

  const toggleModifierEnabled = (modifierId: string) => {
    updateModifierStack(
      modifierStack.map((modifier) =>
        modifier.id === modifierId
          ? { ...modifier, enabled: !modifier.enabled }
          : modifier
      ),
      'Estado de modifier actualizado'
    );
  };

  const moveModifier = (modifierId: string, direction: -1 | 1) => {
    const currentIndex = modifierStack.findIndex((modifier) => modifier.id === modifierId);
    if (currentIndex < 0) return;
    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= modifierStack.length) return;

    const nextModifiers = [...modifierStack];
    const [item] = nextModifiers.splice(currentIndex, 1);
    nextModifiers.splice(nextIndex, 0, item);
    updateModifierStack(nextModifiers, 'Orden de modifiers actualizado');
  };

  const removeModifier = (modifierId: string) => {
    updateModifierStack(
      modifierStack.filter((modifier) => modifier.id !== modifierId),
      'Modifier eliminado'
    );
  };

  const duplicateModifier = (modifierId: string) => {
    const currentIndex = modifierStack.findIndex((modifier) => modifier.id === modifierId);
    if (currentIndex < 0) return;

    const nextModifiers = [...modifierStack];
    nextModifiers.splice(currentIndex + 1, 0, cloneMeshModifier(modifierStack[currentIndex]!));
    updateModifierStack(nextModifiers, 'Modifier duplicado');
  };

  const updateModifier = (
    modifierId: string,
    recipe: (modifier: MeshModifier) => MeshModifier,
    nextMessage?: string
  ) => {
    updateModifierStack(
      modifierStack.map((modifier) =>
        modifier.id === modifierId ? sanitizeMeshModifier(recipe(modifier)) : modifier
      ),
      nextMessage
    );
  };

  const describeModifier = (modifier: MeshModifier) => {
    switch (modifier.type) {
      case 'mirror_x':
        return 'Refleja la base en X y mantiene la topologia original intacta hasta el bake.';
      case 'solidify':
        return `Thickness ${modifier.thickness.toFixed(3)}`;
      case 'array':
        return modifier.mode === 'linear'
          ? `Linear x${modifier.count} offset (${(modifier.offset?.x ?? 0).toFixed(2)}, ${(modifier.offset?.y ?? 0).toFixed(2)}, ${(modifier.offset?.z ?? 0).toFixed(2)})`
          : `Radial x${modifier.count} axis ${modifier.axis?.toUpperCase() ?? 'Y'} r=${(modifier.radius ?? 0).toFixed(2)} angle=${(modifier.angle ?? 0).toFixed(0)}${modifier.rotateInstances ? ' rotate' : ''}`;
      case 'remesh':
        return `Iterations ${modifier.iterations} relax ${(modifier.relaxStrength ?? 0.12).toFixed(2)}`;
      case 'decimate':
        return `Ratio ${(modifier.ratio * 100).toFixed(0)}%`;
      default:
        return 'Modifier';
    }
  };

  const bakeModifierStack = () => {
    if (modifierStack.length === 0) {
      setMessage('No hay modifiers para bakear.');
      return;
    }

    const bakedMesh = applyMeshModifierStack(mesh, modifierStack);
    if (!targetEntity) {
      setMesh(bakedMesh);
      updateModifierStack([], 'Modifier stack bakeado');
      return;
    }

    const meshRenderer = targetEntity.components.get('MeshRenderer');
    if (!meshRenderer) return;

    const data = asRecord(meshRenderer.data) ?? {};
    const nextComponents = new Map(targetEntity.components);
    nextComponents.set('MeshRenderer', {
      ...meshRenderer,
      data: {
        ...data,
        meshId: 'custom',
        manualMesh: bakedMesh,
        modifiers: [],
      },
    });
    updateEntity(targetEntity.id, { components: nextComponents });
    setMesh(bakedMesh);
    setMessage('Modifier stack bakeado sobre la malla base');
  };

  const applyModifierPreset = (
    presetName: string,
    presetModifiers: MeshModifier[],
    mode: 'replace' | 'append',
    presetDescription?: string
  ) => {
    const clonedPreset = cloneMeshModifierStack(presetModifiers);
    const nextModifiers =
      mode === 'append' ? [...modifierStack, ...clonedPreset] : clonedPreset;
    if (presetName.trim()) {
      setModifierPresetName(presetName.trim());
    }
    if (typeof presetDescription === 'string') {
      setModifierPresetDescription(presetDescription);
    }
    updateModifierStack(
      nextModifiers,
      mode === 'append'
        ? `Preset agregado: ${presetName}`
        : `Preset aplicado: ${presetName}`
    );
  };

  const applyGeometryNodeRecipe = (
    recipe: (typeof BUILTIN_GEOMETRY_NODE_RECIPES)[number],
    mode: 'replace' | 'append'
  ) => {
    applyModifierPreset(
      recipe.name,
      geometryNodesToModifierStack(recipe.nodes),
      mode,
      recipe.description
    );
    setGeometryNodesJson(
      serializeGeometryNodeGraphDocument({
        name: recipe.name,
        description: recipe.description,
        nodes: recipe.nodes,
      })
    );
  };

  const exportGeometryNodeRecipeToJson = (
    recipe: (typeof BUILTIN_GEOMETRY_NODE_RECIPES)[number]
  ) => {
    const payload = serializeGeometryNodeGraphDocument({
      name: recipe.name,
      description: recipe.description,
      nodes: recipe.nodes,
    });
    setGeometryNodesJson(payload);
    setMessage(`Graph listo: ${recipe.name}`);
    return payload;
  };

  const exportGeometryNodeGraphToJson = (options?: { name?: string; description?: string }) => {
    if (geometryNodeGraph.length === 0) {
      setMessage('No hay geometry nodes lite para exportar.');
      return null;
    }

    const payload = serializeGeometryNodeGraphDocument({
      nodes: geometryNodeGraph,
      name: options?.name?.trim() || modifierPresetName.trim() || name,
      description:
        options?.description?.trim() ||
        modifierPresetDescription.trim() ||
        geometryNodeSummary,
    });
    setGeometryNodesJson(payload);
    setMessage('JSON de Geometry Nodes Lite listo para copiar o reimportar.');
    return payload;
  };

  const importGeometryNodeGraphFromJson = (mode: 'replace' | 'append') => {
    if (!geometryNodesJson.trim()) {
      setMessage('Pega un JSON de Geometry Nodes Lite antes de importar.');
      return;
    }

    try {
      const parsed = parseGeometryNodeGraphDocument(JSON.parse(geometryNodesJson));
      if (!parsed) {
        setMessage('El JSON no contiene un graph valido de Geometry Nodes Lite.');
        return;
      }

      applyModifierPreset(
        parsed.name?.trim() || 'Geometry Nodes Lite',
        geometryNodesToModifierStack(parsed.nodes),
        mode,
        parsed.description?.trim() || summarizeGeometryNodeGraph(parsed.nodes)
      );
      setGeometryNodesJson(
        serializeGeometryNodeGraphDocument({
          name: parsed.name,
          description: parsed.description,
          nodes: parsed.nodes,
        })
      );
    } catch {
      setMessage('No se pudo leer ese JSON de Geometry Nodes Lite.');
    }
  };

  const saveCurrentModifierPreset = () => {
    const normalizedName = modifierPresetName.trim();
    const normalizedDescription = modifierPresetDescription.trim();
    if (!normalizedName) {
      setMessage('Escribe un nombre para guardar el preset.');
      return;
    }
    if (modifierStack.length === 0) {
      setMessage('Agrega al menos un modifier antes de guardar un preset.');
      return;
    }

    setCustomModifierPresets((current) => {
      const storedPreset: ModifierStackPreset = {
        id:
          current.find(
            (preset) => preset.name.toLowerCase() === normalizedName.toLowerCase()
          )?.id ?? createLocalModelerId('modifier_preset'),
        name: normalizedName,
        description:
          normalizedDescription.length > 0
            ? normalizedDescription
            : summarizeMeshModifierStack(modifierStack),
        modifiers: cloneMeshModifierStack(modifierStack),
      };

      const next = current.some(
        (preset) => preset.name.toLowerCase() === normalizedName.toLowerCase()
      )
        ? current.map((preset) =>
            preset.name.toLowerCase() === normalizedName.toLowerCase() ? storedPreset : preset
          )
        : [...current, storedPreset];

      return next.sort((left, right) => left.name.localeCompare(right.name));
    });
    setMessage(`Preset guardado: ${normalizedName}`);
  };

  const deleteModifierPreset = (presetId: string) => {
    setCustomModifierPresets((current) =>
      current.filter((preset) => preset.id !== presetId)
    );
    setMessage('Preset eliminado');
  };

  const loadPresetMetadata = (preset: {
    name: string;
    description?: string;
    summary?: string;
  }) => {
    setModifierPresetName(preset.name);
    setModifierPresetDescription(
      preset.description?.trim() || preset.summary || `Preset ${preset.name}`
    );
    setMessage(`Metadata cargada: ${preset.name}`);
  };

  const duplicateCustomModifierPreset = (presetId: string) => {
    setCustomModifierPresets((current) => {
      const source = current.find((preset) => preset.id === presetId);
      if (!source) {
        return current;
      }

      const baseName = `${source.name} Copy`;
      let candidateName = baseName;
      let counter = 2;
      while (
        current.some(
          (preset) => preset.name.trim().toLowerCase() === candidateName.trim().toLowerCase()
        )
      ) {
        candidateName = `${baseName} ${counter}`;
        counter += 1;
      }

      return [
        ...current,
        {
          id: createLocalModelerId('modifier_preset'),
          name: candidateName,
          description: source.description,
          modifiers: cloneMeshModifierStack(source.modifiers),
        },
      ].sort((left, right) => left.name.localeCompare(right.name));
    });
    setMessage('Preset duplicado');
  };

  const copyTextToClipboard = async (
    content: string,
    successMessage: string,
    fallbackMessage: string
  ) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(content);
        setMessage(successMessage);
        return;
      } catch {
        // Fall back to textarea-based workflow below.
      }
    }

    setMessage(fallbackMessage);
  };

  const exportModifierStackToJson = (
    sourceModifiers: MeshModifier[],
    options?: { name?: string; description?: string }
  ) => {
    if (sourceModifiers.length === 0) {
      setMessage('No hay modifiers para exportar.');
      return null;
    }

    const payload = serializeMeshModifierStackDocument({
      modifiers: sourceModifiers,
      name: options?.name?.trim() || modifierPresetName.trim() || name,
      description:
        options?.description?.trim() ||
        modifierPresetDescription.trim() ||
        summarizeMeshModifierStack(sourceModifiers),
    });
    setModifierTransferJson(payload);
    setMessage('JSON del stack listo para copiar o reimportar.');
    return payload;
  };

  const importModifierStackFromJson = (mode: 'replace' | 'append') => {
    if (!modifierTransferJson.trim()) {
      setMessage('Pega un JSON de modifier stack antes de importar.');
      return;
    }

    try {
      const parsed = parseMeshModifierStackDocument(JSON.parse(modifierTransferJson));
      if (!parsed) {
        setMessage('El JSON no contiene un modifier stack valido.');
        return;
      }

      const resolvedName = parsed.name?.trim() || 'JSON Import';
      const resolvedDescription =
        parsed.description?.trim() || summarizeMeshModifierStack(parsed.modifiers);
      applyModifierPreset(resolvedName, parsed.modifiers, mode, resolvedDescription);
      setModifierTransferJson(
        serializeMeshModifierStackDocument({
          modifiers: parsed.modifiers,
          name: resolvedName,
          description: resolvedDescription,
        })
      );
    } catch {
      setMessage('No se pudo leer ese JSON de modifier stack.');
    }
  };

  const exportModifierPresetLibraryToJson = (scope: 'saved' | 'all') => {
    const presets =
      scope === 'all'
        ? [
            ...builtInPresetEntries.map((preset) => ({
              id: preset.id,
              name: preset.name,
              description: preset.description,
              modifiers: preset.modifiers,
            })),
            ...customModifierPresets,
            ...serverModifierPresets.map((preset) => ({
              id: `${preset.scope}:${preset.name}`,
              name: preset.name,
              description: preset.definition.description,
              modifiers: preset.definition.modifiers,
            })),
          ]
        : customModifierPresets;

    if (presets.length === 0) {
      setMessage('No hay presets guardados para exportar.');
      return null;
    }

    const payload = serializeMeshModifierPresetLibraryDocument({
      name: scope === 'all' ? 'Modifier Presets - Full Library' : 'Modifier Presets - Saved',
      presets,
    });
    setModifierLibraryJson(payload);
    setMessage(
      scope === 'all'
        ? 'Libreria completa de presets lista para copiar.'
        : 'Libreria de presets guardados lista para copiar.'
    );
    return payload;
  };

  const importModifierPresetLibraryFromJson = (mode: 'replace' | 'merge') => {
    if (!modifierLibraryJson.trim()) {
      setMessage('Pega un JSON de libreria de presets antes de importar.');
      return;
    }

    try {
      const parsed = parseMeshModifierPresetLibraryDocument(JSON.parse(modifierLibraryJson));
      if (!parsed) {
        setMessage('El JSON no contiene una libreria de presets valida.');
        return;
      }

      const importedPresets: ModifierStackPreset[] = parsed.presets.map((preset) => ({
        id: createLocalModelerId('modifier_preset'),
        name: preset.name,
        description: preset.description,
        modifiers: cloneMeshModifierStack(preset.modifiers),
      }));

      setCustomModifierPresets((current) => {
        if (mode === 'replace') {
          return importedPresets.sort((left, right) => left.name.localeCompare(right.name));
        }

        const byName = new Map(
          current.map((preset) => [preset.name.trim().toLowerCase(), preset] as const)
        );
        importedPresets.forEach((preset) => {
          byName.set(preset.name.trim().toLowerCase(), preset);
        });
        return [...byName.values()].sort((left, right) => left.name.localeCompare(right.name));
      });

      setModifierLibraryJson(
        serializeMeshModifierPresetLibraryDocument({
          name: parsed.name,
          presets: importedPresets,
        })
      );
      setMessage(
        mode === 'replace'
          ? `Libreria importada: ${importedPresets.length} presets`
          : `Libreria fusionada: ${importedPresets.length} presets importados`
      );
    } catch {
      setMessage('No se pudo leer ese JSON de libreria de presets.');
    }
  };

  const describePresetMetrics = (
    metrics: ReturnType<typeof buildMeshModifierPreviewMetrics>
  ) => {
    const formatDelta = (value: number) => (value >= 0 ? `+${value}` : `${value}`);
    return `V ${metrics.baseVertices}->${metrics.vertices} (${formatDelta(metrics.deltaVertices)}) | F ${metrics.baseFaces}->${metrics.faces} (${formatDelta(metrics.deltaFaces)}) | E ${metrics.baseEdges}->${metrics.edges} (${formatDelta(metrics.deltaEdges)})`;
  };

  const loadServerModifierPresets = useCallback(async () => {
    const response = await fetch('/api/modifier-presets', {
      cache: 'no-store',
      headers: {
        'x-rey30-project': projectName || 'untitled_project',
      },
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const detail =
        typeof payload?.error === 'string'
          ? payload.error
          : `No se pudo cargar la libreria del servidor (${response.status}).`;
      throw new Error(detail);
    }
    const payload = await response.json().catch(() => ({}));
    return parseServerModifierPresetItems(payload);
  }, [projectName]);

  const refreshServerModifierPresets = useCallback(async () => {
    setServerModifierPresetsLoading(true);
    setServerModifierPresetsError(null);
    try {
      const presets = await loadServerModifierPresets();
      setServerModifierPresets(presets);
    } catch (error) {
      setServerModifierPresets([]);
      setServerModifierPresetsError(summarizeServerPresetLoadError(error));
    } finally {
      setServerModifierPresetsLoading(false);
    }
  }, [loadServerModifierPresets]);

  const saveCurrentModifierPresetToServer = async (scope: 'project' | 'shared') => {
    const normalizedName = modifierPresetName.trim();
    const normalizedDescription = modifierPresetDescription.trim();
    if (!sessionReady) {
      setMessage(MODELER_AUTH_HINT);
      return;
    }
    if (!normalizedName) {
      setMessage('Escribe un nombre para guardar el preset en servidor.');
      return;
    }
    if (modifierStack.length === 0) {
      setMessage('Agrega al menos un modifier antes de guardar en servidor.');
      return;
    }

    const response = await fetch('/api/modifier-presets', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-rey30-project': projectName || 'untitled_project',
      },
      body: JSON.stringify({
        name: normalizedName,
        description:
          normalizedDescription.length > 0
            ? normalizedDescription
            : summarizeMeshModifierStack(modifierStack),
        modifiers: modifierStack,
        scope,
      }),
    });
    if (!response.ok) {
      setMessage('No se pudo guardar el preset en servidor.');
      return;
    }

    await refreshServerModifierPresets();
    setMessage(
      scope === 'shared'
        ? `Preset compartido guardado: ${normalizedName}`
        : `Preset de proyecto guardado: ${normalizedName}`
    );
  };

  const deleteServerModifierPreset = async (preset: ServerModifierPresetItem) => {
    if (!sessionReady) {
      setMessage(MODELER_AUTH_HINT);
      return;
    }

    const response = await fetch(
      `/api/modifier-presets?name=${encodeURIComponent(preset.name)}&scope=${preset.scope}`,
      {
        method: 'DELETE',
        headers: {
          'x-rey30-project': projectName || 'untitled_project',
        },
      }
    );
    if (!response.ok) {
      setMessage('No se pudo eliminar el preset de servidor.');
      return;
    }

    await refreshServerModifierPresets();
    setMessage(`Preset eliminado de servidor: ${preset.name}`);
  };

  useEffect(() => {
    setMesh(targetEntityMesh);
  }, [targetEntityId, targetEntityMeshSignature, targetEntityMesh]);

  useEffect(() => {
    setMaterialIdInput(targetEntityMaterialId);
  }, [targetEntityId, targetEntityMaterialId]);

  useEffect(() => {
    setCheckerPreviewEnabled(targetEntityCheckerPreview);
    setCheckerScale(targetEntityCheckerScale);
  }, [targetEntityCheckerPreview, targetEntityCheckerScale]);

  useEffect(() => {
    setWeightedNormalsEnabled(targetEntityWeightedNormalsEnabled);
    setWeightedNormalsStrength(targetEntityWeightedNormalsStrength);
    setWeightedNormalsKeepSharp(targetEntityWeightedNormalsKeepSharp);
  }, [
    targetEntityWeightedNormalsEnabled,
    targetEntityWeightedNormalsStrength,
    targetEntityWeightedNormalsKeepSharp,
  ]);

  useEffect(() => {
    if (
      retopoTargetEntityId &&
      retopoTargetEntries.some((entry) => entry.id === retopoTargetEntityId)
    ) {
      return;
    }

    setRetopoTargetEntityId(retopoTargetEntries[0]?.id ?? '');
  }, [retopoTargetEntries, retopoTargetEntityId]);

  useEffect(() => {
    if (editMode !== 'face') return;
    if (safeSelectedElements.length === 0) return;
    const nextFaceSetId = getFaceSetId(mesh, safeSelectedElements[0] ?? 0);
    if (nextFaceSetId > 0) {
      setFaceSetInput(nextFaceSetId);
    }
  }, [editMode, mesh, safeSelectedElements]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const storedDetachedStack = window.localStorage.getItem(
        MODELER_DETACHED_STACK_STORAGE_KEY
      );
      if (storedDetachedStack) {
        const parsed = parseMeshModifierStack(JSON.parse(storedDetachedStack));
        if (parsed.length > 0) {
          setDetachedModifierStack(parsed);
        }
      }
    } catch {
      window.localStorage.removeItem(MODELER_DETACHED_STACK_STORAGE_KEY);
    }
    detachedStackHydratedRef.current = true;

    try {
      const storedPresets = window.localStorage.getItem(
        MODELER_MODIFIER_PRESETS_STORAGE_KEY
      );
      if (storedPresets) {
        setCustomModifierPresets(parseStoredModifierPresets(JSON.parse(storedPresets)));
      }
    } catch {
      window.localStorage.removeItem(MODELER_MODIFIER_PRESETS_STORAGE_KEY);
    }
    modifierPresetsHydratedRef.current = true;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !detachedStackHydratedRef.current) return;
    window.localStorage.setItem(
      MODELER_DETACHED_STACK_STORAGE_KEY,
      JSON.stringify(detachedModifierStack)
    );
  }, [detachedModifierStack]);

  useEffect(() => {
    if (typeof window === 'undefined' || !modifierPresetsHydratedRef.current) return;
    window.localStorage.setItem(
      MODELER_MODIFIER_PRESETS_STORAGE_KEY,
      JSON.stringify(customModifierPresets)
    );
  }, [customModifierPresets]);

  useEffect(() => {
    let cancelled = false;

    const refreshSession = async () => {
      setSessionChecking(true);
      try {
        const response = await fetch('/api/auth/session', { cache: 'no-store' });
        const payload = (await response.json().catch(() => ({}))) as AuthSessionPayload;
        if (cancelled) return;
        setSessionReady(Boolean(payload.authenticated));
      } catch {
        if (cancelled) return;
        setSessionReady(false);
      } finally {
        if (!cancelled) {
          setSessionChecking(false);
        }
      }
    };

    void refreshSession();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (sessionChecking) return;
    if (!sessionReady) {
      setServerModifierPresets([]);
      setServerModifierPresetsLoading(false);
      setServerModifierPresetsError(null);
      return;
    }

    let cancelled = false;
    const refresh = async () => {
      try {
        setServerModifierPresetsLoading(true);
        setServerModifierPresetsError(null);
        const presets = await loadServerModifierPresets();
        if (!cancelled) {
          setServerModifierPresets(presets);
        }
      } catch (error) {
        if (!cancelled) {
          setServerModifierPresets([]);
          setServerModifierPresetsError(summarizeServerPresetLoadError(error));
        }
      } finally {
        if (!cancelled) {
          setServerModifierPresetsLoading(false);
        }
      }
    };

    void refresh();
    return () => {
      cancelled = true;
    };
  }, [loadServerModifierPresets, projectName, sessionReady, sessionChecking]);

  const updateScrollProgress = useCallback(() => {
    const viewport = scrollViewportRef.current;
    if (!viewport) return;

    const max = viewport.scrollHeight - viewport.clientHeight;
    if (max <= 0) {
      setScrollProgress(100);
      return;
    }

    const ratio = Math.min(1, Math.max(0, viewport.scrollTop / max));
    setScrollProgress(Math.round(ratio * 100));
  }, []);

  useEffect(() => {
    const viewport = scrollViewportRef.current;
    if (!viewport) return;

    const handleScroll = () => updateScrollProgress();
    viewport.addEventListener('scroll', handleScroll, { passive: true });
    updateScrollProgress();

    return () => {
      viewport.removeEventListener('scroll', handleScroll);
    };
  }, [
    updateScrollProgress,
    editMode,
    message,
    mesh.faces.length,
    mesh.vertices.length,
    maxSelectable,
  ]);

  const scrollToOffset = useCallback(
    (top: number) => {
      const viewport = scrollViewportRef.current;
      if (!viewport) return;
      viewport.scrollTo({ top, behavior: 'smooth' });
      window.requestAnimationFrame(updateScrollProgress);
    },
    [updateScrollProgress]
  );

  const scrollToSection = useCallback(
    (section: 'top' | 'selection' | 'notes' | 'bottom') => {
      const viewport = scrollViewportRef.current;
      if (!viewport) return;

      if (section === 'top') {
        scrollToOffset(0);
        return;
      }

      if (section === 'bottom') {
        scrollToOffset(viewport.scrollHeight);
        return;
      }

      const target =
        section === 'selection' ? selectionSectionRef.current : notesSectionRef.current;
      if (!target) return;
      scrollToOffset(Math.max(0, target.offsetTop - 12));
    },
    [scrollToOffset]
  );

  const getSpawnPosition = (offsetX = 0) => {
    const transformData = asRecord(targetEntity?.components.get('Transform')?.data);
    const positionData = asRecord(transformData?.position);
    return {
      x: (typeof positionData?.x === 'number' ? positionData.x : 0) + offsetX,
      y: typeof positionData?.y === 'number' ? positionData.y : 0.75,
      z: typeof positionData?.z === 'number' ? positionData.z : 0,
    };
  };

  const createEditableEntityFromMesh = (
    nextMesh: EditableMesh,
    entityName: string,
    options?: { offsetX?: number; select?: boolean; modifiers?: MeshModifier[] }
  ) => {
    if (!activeSceneId) {
      createScene('Escena Principal');
    }

    const sanitizedMesh = sanitizeEditableMesh(nextMesh);
    const id = crypto.randomUUID();
    addEntity({
      id,
      name: entityName,
      components: new Map([
        [
          'Transform',
          {
            id: crypto.randomUUID(),
            type: 'Transform',
            data: {
              position: getSpawnPosition(options?.offsetX ?? 0),
              rotation: { x: 0, y: 0, z: 0, w: 1 },
              scale: { x: 1, y: 1, z: 1 },
            },
            enabled: true,
          },
        ],
        [
          'MeshRenderer',
          {
            id: crypto.randomUUID(),
            type: 'MeshRenderer',
            data: {
              meshId: 'custom',
              materialId: materialIdInput.trim() || 'default',
              checkerPreview: checkerPreviewEnabled,
              checkerScale,
              material: {
                weightedNormalsEnabled,
                weightedNormalsStrength,
                weightedNormalsKeepSharp,
              },
              modifiers:
                options?.modifiers && options.modifiers.length > 0
                  ? cloneMeshModifierStack(options.modifiers)
                  : [],
              castShadows: true,
              receiveShadows: true,
              manualMesh: sanitizedMesh,
            },
            enabled: true,
          },
        ],
      ]),
      children: [],
      parentId: null,
      active: true,
      tags: ['editable'],
    });

    if (options?.select) {
      selectEntity(id);
    }

    return id;
  };

  const createEditableEntity = () => {
    createEditableEntityFromMesh(mesh, name, {
      select: true,
      modifiers: modifierStack,
    });
    setMessage(
      modifierStack.length > 0
        ? `Entidad editable creada: ${name} con stack no destructivo`
        : `Entidad editable creada: ${name}`
    );
  };

  const saveMesh = async () => {
    if (!sessionReady) {
      setMessage(MODELER_AUTH_HINT);
      return;
    }

    try {
      const meshToPersist = sanitizeEditableMesh(modifierStack.length > 0 ? previewMesh : mesh);
      const payload = await persistMeshRemote(name, meshToPersist);
      addAsset({
        id: payload.asset?.id ?? crypto.randomUUID(),
        name: payload.asset?.name ?? `${name}.json`,
        type: 'mesh',
        path: payload.asset?.path ?? payload.path ?? `/virtual/${name}.json`,
        size: payload.asset?.size ?? JSON.stringify(meshToPersist).length,
        createdAt: payload.asset?.createdAt ? new Date(payload.asset.createdAt) : new Date(),
        metadata: {
          source: 'modeler_panel',
          vertices: meshToPersist.vertices.length,
          faces: meshToPersist.faces.length,
          bakedFromModifierStack: modifierStack.length > 0,
        },
      } as any);
      setMessage(
        modifierStack.length > 0
          ? `Mesh guardada en ${payload.path ?? 'assets'} usando el preview del stack`
          : `Mesh guardada en ${payload.path ?? 'assets'}`
      );
    } catch (error) {
      setMessage(`Error guardando mesh: ${String(error)}`);
    }
  };

  const toggleElement = (index: number) => {
    const nextSelection = selectedElements.includes(index)
      ? selectedElements.filter((candidate) => candidate !== index)
      : [...selectedElements, index];
    setModelerSelection(clampSelection(nextSelection, maxSelectable));
  };

  const resetPrimitive = (primitive: string) => {
    const nextMesh = createPrimitiveMesh(primitive);
    syncMeshToSelectedEntity(nextMesh, `Base ${primitive} cargada`, [0]);
  };

  const applyMeshOperation = (
    operation: (current: EditableMesh) => EditableMesh,
    label: string,
    nextSelection?: number[]
  ) => {
    const nextMesh = operation(mesh);
    syncMeshToSelectedEntity(nextMesh, label, nextSelection);
  };

  const applyFaceOperation = (
    operation: (current: EditableMesh, faceIndex: number) => EditableMesh,
    label: string
  ) => {
    const sortedSelection = [...safeSelectedElements].sort((left, right) => right - left);
    const nextMesh = sortedSelection.reduce(
      (currentMesh, faceIndex) => operation(currentMesh, faceIndex),
      mesh
    );
    syncMeshToSelectedEntity(nextMesh, label, [0]);
  };

  const applyEdgeOperation = (
    operation: (current: EditableMesh, edgeIndices: number[]) => EditableMesh,
    label: string
  ) => {
    const nextMesh = operation(mesh, safeSelectedElements);
    syncMeshToSelectedEntity(nextMesh, label, [0]);
  };

  const applyVertexOperation = (
    operation: (current: EditableMesh, vertexIndices: number[]) => EditableMesh,
    label: string
  ) => {
    const nextMesh = operation(mesh, safeSelectedElements);
    syncMeshToSelectedEntity(nextMesh, label, [0]);
  };

  const enableRetopoSurfaceSnap = () => {
    setSnapEnabled(true);
    setSnapTarget('surface');
    setMessage('Surface snap activado para retopo.');
  };

  const applyRetopoShrinkwrap = () => {
    if (!retopoTargetEntry) {
      setMessage('Selecciona un target de retopo para aplicar shrinkwrap.');
      return;
    }

    applyMeshOperation(
      (currentMesh) =>
        shrinkwrapMesh(currentMesh, retopoTargetEntry.mesh, {
          offset: retopoOffset,
        }),
      `Shrinkwrap aplicado sobre ${retopoTargetEntry.name}`,
      [0]
    );
  };

  const applyVertexPathSelection = () => {
    if (safeSelectedElements.length < 2) {
      setMessage('Selecciona al menos 2 vertices para Path select.');
      return;
    }

    const pathSelection = selectVertexPath(
      mesh,
      safeSelectedElements[0],
      safeSelectedElements[safeSelectedElements.length - 1]
    );
    if (pathSelection.length === 0) {
      setMessage('No se pudo resolver un path entre esos vertices.');
      return;
    }

    setModelerSelection(pathSelection);
    setMessage(`Vertex path resuelto con ${pathSelection.length} vertices`);
  };

  const applyEdgePathSelection = () => {
    if (safeSelectedElements.length < 2) {
      setMessage('Selecciona al menos 2 aristas para Path select.');
      return;
    }

    const pathSelection = selectEdgePath(
      mesh,
      safeSelectedElements[0],
      safeSelectedElements[safeSelectedElements.length - 1]
    );
    if (pathSelection.length === 0) {
      setMessage('No se pudo resolver un path entre esas aristas.');
      return;
    }

    setModelerSelection(pathSelection);
    setMessage(`Edge path resuelto con ${pathSelection.length} aristas`);
  };

  const applyFaceSelectionTransform = (
    operation: (current: EditableMesh, faceIndices: number[], steps: number) => number[],
    label: string
  ) => {
    const nextSelection = clampSelectableSelection(
      operation(mesh, safeSelectedElements, faceRegionSteps),
      mesh.faces.length,
      visibleFaceIndices
    );
    setModelerSelection(nextSelection);
    setMessage(`${label} (${nextSelection.length} visibles)`);
  };

  const applyFaceUvOperation = (
    operation: (current: EditableMesh, faceIndices: number[]) => EditableMesh,
    label: string
  ) => {
    if (safeSelectedElements.length === 0) {
      setMessage('Selecciona al menos una cara para editar UVs.');
      return;
    }

    const nextMesh = operation(mesh, safeSelectedElements);
    syncMeshToSelectedEntity(nextMesh, label, safeSelectedElements);
  };

  const applyFaceNormalSelection = () => {
    if (safeSelectedElements.length === 0) {
      setMessage('Selecciona al menos una cara para usar Select normal.');
      return;
    }

    const seedFaceIndex = safeSelectedElements[0] ?? 0;
    const nextSelection = clampSelectableSelection(
      selectFacesByNormal(mesh, seedFaceIndex, normalTolerance),
      mesh.faces.length,
      visibleFaceIndices
    );
    setModelerSelection(nextSelection);
    setMessage(
      `Select normal (${normalTolerance.toFixed(0)}deg) encontro ${nextSelection.length} cara(s)`
    );
  };

  const applyFaceIslandSelection = () => {
    if (safeSelectedElements.length === 0) {
      setMessage('Selecciona una cara visible para resolver su island.');
      return;
    }

    const nextSelection = clampSelectableSelection(
      selectFaceIsland(mesh, safeSelectedElements[0] ?? 0),
      mesh.faces.length,
      visibleFaceIndices
    );
    setModelerSelection(nextSelection);
    setMessage(`Face island con ${nextSelection.length} cara(s) visibles`);
  };

  const applyVertexMask = () => {
    if (safeSelectedElements.length === 0) {
      setMessage('Selecciona vertices para aplicar mask.');
      return;
    }

    applyVertexOperation(
      (currentMesh, vertexIndices) => maskVertices(currentMesh, vertexIndices, 1),
      `Mask aplicada sobre ${safeSelectedElements.length} vertex/vertices`
    );
  };

  const applyClearVertexMask = (all = false) => {
    if (!all && safeSelectedElements.length === 0) {
      setMessage('Selecciona vertices para limpiar mask.');
      return;
    }

    applyMeshOperation(
      (currentMesh) =>
        clearVertexMask(currentMesh, all ? undefined : safeSelectedElements),
      all
        ? 'Mask limpiada en toda la malla'
        : `Mask limpiada sobre ${safeSelectedElements.length} vertex/vertices`,
      all ? safeSelectedElements : safeSelectedElements
    );
  };

  const applyHideSelectedFaces = () => {
    if (safeSelectedElements.length === 0) {
      setMessage('Selecciona caras visibles para ocultarlas.');
      return;
    }

    const nextSelection = visibleFaceIndices.filter(
      (faceIndex) => !safeSelectedElements.includes(faceIndex)
    );
    applyMeshOperation(
      (currentMesh) => hideFaces(currentMesh, safeSelectedElements),
      `${safeSelectedElements.length} cara(s) ocultadas`,
      nextSelection.length > 0 ? [nextSelection[0]!] : []
    );
  };

  const applyRevealAllFaces = () => {
    applyMeshOperation(
      (currentMesh) => revealFaces(currentMesh),
      'Todas las caras ocultas fueron reveladas',
      mesh.faces.length > 0 ? [0] : []
    );
  };

  const applyAssignFaceSet = () => {
    if (safeSelectedElements.length === 0) {
      setMessage('Selecciona al menos una cara para asignar Face Set.');
      return;
    }

    const normalizedFaceSetId = Math.max(0, Math.round(faceSetInput));
    applyMeshOperation(
      (currentMesh) => assignFaceSet(currentMesh, safeSelectedElements, normalizedFaceSetId),
      normalizedFaceSetId > 0
        ? `Face Set ${normalizedFaceSetId} asignado a ${safeSelectedElements.length} cara(s)`
        : `Face Set limpiado en ${safeSelectedElements.length} cara(s)`,
      safeSelectedElements
    );
  };

  const applySelectCurrentFaceSet = () => {
    if (safeSelectedElements.length === 0) {
      setMessage('Selecciona una cara para resolver su Face Set.');
      return;
    }

    const nextSelection = clampSelectableSelection(
      selectFaceSet(mesh, safeSelectedElements[0] ?? 0),
      mesh.faces.length,
      visibleFaceIndices
    );
    setModelerSelection(nextSelection);
    setMessage(
      selectedFaceSetId > 0
        ? `Face Set ${selectedFaceSetId} contiene ${nextSelection.length} cara(s) visibles`
        : 'La cara seleccionada no tiene Face Set asignado'
    );
  };

  const applyMaterialId = () => {
    const nextMaterialId = materialIdInput.trim() || 'default';
    setMaterialIdInput(nextMaterialId);
    syncMeshRendererData(
      { materialId: nextMaterialId },
      `Material aplicado: ${nextMaterialId}`
    );
  };

  const applyCheckerPreview = (enabled = checkerPreviewEnabled) => {
    const nextCheckerScale = Math.max(1, Math.min(32, Math.round(checkerScale)));
    setCheckerPreviewEnabled(enabled);
    setCheckerScale(nextCheckerScale);
    syncMeshRendererData(
      {
        checkerPreview: enabled,
        checkerScale: nextCheckerScale,
      },
      enabled
        ? `Checker preview x${nextCheckerScale} activado`
        : 'Checker preview desactivado'
    );
  };

  const applyWeightedNormals = (enabled = weightedNormalsEnabled) => {
    const nextStrength = Math.max(0, Math.min(4, weightedNormalsStrength));
    setWeightedNormalsEnabled(enabled);
    setWeightedNormalsStrength(nextStrength);
    syncMeshRendererData(
      {
        material: {
          ...(targetEntityMaterialOverride ?? {}),
          weightedNormalsEnabled: enabled,
          weightedNormalsStrength: nextStrength,
          weightedNormalsKeepSharp,
        },
      },
      enabled
        ? `Weighted normals activados (${nextStrength.toFixed(2)})`
        : 'Weighted normals desactivados'
    );
  };

  const applyUvIslandSelection = () => {
    if (safeSelectedElements.length === 0) {
      setMessage('Selecciona al menos una cara para UV island.');
      return;
    }

    const islandSelection = clampSelectableSelection(
      selectUvIsland(mesh, safeSelectedElements[0] ?? 0),
      mesh.faces.length,
      visibleFaceIndices
    );
    setModelerSelection(islandSelection);
    setMessage(`UV island con ${islandSelection.length} cara(s)`);
  };

  const applyConstrainedSlide = (direction: 1 | -1) => {
    if (slideConstraint === 'path' && safeSelectedElements.length < 2) {
      setMessage('Selecciona un path de vertices o usa Path select antes de deslizar en modo Path.');
      return;
    }

    const axis =
      slideConstraint === 'x' || slideConstraint === 'y' || slideConstraint === 'z'
        ? slideConstraint
        : undefined;

    applyVertexOperation(
      (currentMesh, vertexIndices) =>
        slideVertices(currentMesh, vertexIndices, slideAmount * direction, {
          axis,
          pathVertexIndices: slideConstraint === 'path' ? vertexIndices : undefined,
        }),
      `Slide ${direction > 0 ? '+' : '-'}${slideAmount.toFixed(2)} en modo ${slideConstraint}`
    );
  };

  const selectionLabel =
    editMode === 'vertex'
      ? 'Vertices'
      : editMode === 'edge'
        ? 'Aristas'
        : editMode === 'face'
          ? 'Caras'
          : 'Selección';

  const selectableItems =
    editMode === 'vertex'
      ? mesh.vertices.map((vertex, index) => ({
          id: index,
          label: `#${index}  ${vertex.x.toFixed(2)}, ${vertex.y.toFixed(2)}, ${vertex.z.toFixed(2)}${
            getVertexMaskValue(mesh, index) > 0.0001
              ? `  mask ${getVertexMaskValue(mesh, index).toFixed(2)}`
              : ''
          }`,
        }))
      : editMode === 'edge'
        ? visibleEdgeIndices.map((index) => {
            const [a, b] = edges[index] ?? [-1, -1];
            return {
              id: index,
              label: `#${index}  [${a}-${b}]`,
            };
          })
        : visibleFaceIndices.map((index) => {
            const face = mesh.faces[index] ?? [0, 0, 0];
            const faceSetId = getFaceSetId(mesh, index);
            return {
              id: index,
              label: `#${index}  [${face.join(', ')}]${faceSetId > 0 ? `  set ${faceSetId}` : ''}`,
            };
          });

  const editButtons: Array<{
    mode: EditMode;
    label: string;
    icon: React.ReactNode;
  }> = [
    { mode: 'object', label: 'Object', icon: <Box className="h-3.5 w-3.5" /> },
    { mode: 'vertex', label: 'Vertex', icon: <Move className="h-3.5 w-3.5" /> },
    { mode: 'edge', label: 'Edge', icon: <Scissors className="h-3.5 w-3.5" /> },
    { mode: 'face', label: 'Face', icon: <Triangle className="h-3.5 w-3.5" /> },
  ];

  const operationSettings =
    editMode === 'object'
      ? [
          {
            key: 'solidifyThickness',
            label: 'Solidify',
            value: solidifyThickness,
            step: 0.02,
            min: 0.02,
            max: 1,
            setValue: setSolidifyThickness,
          },
          {
            key: 'arrayCount',
            label: 'Array count',
            value: arrayCount,
            step: 1,
            min: 2,
            max: 16,
            setValue: setArrayCount,
          },
          ...(arrayMode === 'linear'
            ? [
                {
                  key: 'arrayOffsetX',
                  label: 'Array X',
                  value: arrayOffsetX,
                  step: 0.1,
                  min: -10,
                  max: 10,
                  setValue: setArrayOffsetX,
                },
                {
                  key: 'arrayOffsetY',
                  label: 'Array Y',
                  value: arrayOffsetY,
                  step: 0.1,
                  min: -10,
                  max: 10,
                  setValue: setArrayOffsetY,
                },
                {
                  key: 'arrayOffsetZ',
                  label: 'Array Z',
                  value: arrayOffsetZ,
                  step: 0.1,
                  min: -10,
                  max: 10,
                  setValue: setArrayOffsetZ,
                },
              ]
            : [
                {
                  key: 'arrayRadius',
                  label: 'Array radius',
                  value: arrayRadius,
                  step: 0.1,
                  min: 0,
                  max: 20,
                  setValue: setArrayRadius,
                },
                {
                  key: 'arrayAngle',
                  label: 'Array angle',
                  value: arrayAngle,
                  step: 5,
                  min: -360,
                  max: 360,
                  setValue: setArrayAngle,
                },
              ]),
          {
            key: 'remeshIterations',
            label: 'Remesh it',
            value: remeshIterations,
            step: 1,
            min: 1,
            max: 3,
            setValue: setRemeshIterations,
          },
          {
            key: 'decimateRatio',
            label: 'Decimate',
            value: decimateRatio,
            step: 0.05,
            min: 0.1,
            max: 1,
            setValue: setDecimateRatio,
          },
        ]
      : editMode === 'vertex'
        ? [
            {
              key: 'slideAmount',
              label: 'Slide amt',
              value: slideAmount,
              step: 0.05,
              min: 0.05,
              max: 1,
              setValue: setSlideAmount,
            },
            {
              key: 'relaxStrength',
              label: 'Relax',
              value: relaxStrength,
              step: 0.05,
              min: 0.05,
              max: 1,
              setValue: setRelaxStrength,
            },
            {
              key: 'relaxIterations',
              label: 'Relax it',
              value: relaxIterations,
              step: 1,
              min: 1,
              max: 8,
              setValue: setRelaxIterations,
            },
            {
              key: 'weldDistance',
              label: 'Weld dist',
              value: weldDistance,
              step: 0.01,
              min: 0.001,
              max: 0.5,
              setValue: setWeldDistance,
            },
          ]
        : editMode === 'edge'
          ? [
              {
                key: 'bevelAmount',
                label: 'Bevel amt',
                value: bevelAmount,
                step: 0.02,
                min: 0.05,
                max: 0.45,
                setValue: setBevelAmount,
              },
              {
                key: 'bevelSegments',
                label: 'Bevel seg',
                value: bevelSegments,
                step: 1,
                min: 1,
                max: 6,
                setValue: setBevelSegments,
              },
              {
                key: 'bridgeSegments',
                label: 'Bridge seg',
                value: bridgeSegments,
                step: 1,
                min: 1,
                max: 8,
                setValue: setBridgeSegments,
              },
              {
                key: 'polyBuildDistance',
                label: 'Poly build',
                value: polyBuildDistance,
                step: 0.05,
                min: 0.05,
                max: 2,
                setValue: setPolyBuildDistance,
              },
            ]
          : [
              {
                key: 'extrudeDistance',
                label: 'Extrude',
                value: extrudeDistance,
                step: 0.05,
                min: -1,
                max: 2,
                setValue: setExtrudeDistance,
              },
              {
                key: 'duplicateDistance',
                label: 'Dup normal',
                value: duplicateDistance,
                step: 0.05,
                min: -1,
                max: 2,
                setValue: setDuplicateDistance,
              },
              {
                key: 'insetAmount',
                label: 'Inset',
                value: insetAmount,
                step: 0.02,
                min: 0.02,
                max: 0.9,
                setValue: setInsetAmount,
              },
              {
                key: 'knifeAmount',
                label: 'Knife amt',
                value: knifeAmount,
                step: 0.05,
                min: 0.1,
                max: 0.9,
                setValue: setKnifeAmount,
              },
              {
                key: 'knifeSegments',
                label: 'Knife seg',
                value: knifeSegments,
                step: 1,
                min: 1,
                max: 8,
                setValue: setKnifeSegments,
              },
              {
                key: 'faceRegionSteps',
                label: 'Region step',
                value: faceRegionSteps,
                step: 1,
                min: 1,
                max: 8,
                setValue: setFaceRegionSteps,
              },
              {
                key: 'normalTolerance',
                label: 'Normal tol',
                value: normalTolerance,
                step: 1,
                min: 1,
                max: 89,
                setValue: setNormalTolerance,
              },
              {
                key: 'uvPadding',
                label: 'UV pad',
                value: uvPadding,
                step: 0.01,
                min: 0,
                max: 0.45,
                setValue: setUvPadding,
              },
            ];

  return (
    <div className="flex h-full flex-col bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
        <div>
          <h3 className="text-sm font-medium text-slate-100">Edit Mode</h3>
          <p className="text-[11px] text-slate-500">
            Vertex / Edge / Face con sync en vivo al objeto seleccionado.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="h-8 w-36 border-slate-700 bg-slate-950 text-xs"
            placeholder="Nombre"
          />
          <Button size="sm" variant="outline" onClick={createEditableEntity}>
            Crear editable
          </Button>
          <Button size="sm" onClick={saveMesh} disabled={sessionChecking}>
            <Save className="mr-1 h-3 w-3" />
            Guardar
          </Button>
        </div>
      </div>

      <div className="grid max-h-[46vh] shrink-0 gap-3 overflow-y-auto border-b border-slate-800 p-3 xl:grid-cols-3">
        <Card className="border-slate-800 bg-slate-950 p-3">
          <div className="mb-2 text-[11px] uppercase tracking-wide text-slate-400">Target</div>
          <div className="space-y-1 text-xs text-slate-300">
            <div>Entidad: {targetEntityName ?? 'Sin MeshRenderer seleccionado'}</div>
            <div>Scope: {targetEntity ? 'MeshRenderer activo' : 'Stack local desacoplado'}</div>
            <div>Base vertices: {mesh.vertices.length}</div>
            <div>Base faces: {mesh.faces.length}</div>
            <div>Base aristas: {edges.length}</div>
            <div>Caras visibles: {visibleFaceIndices.length}</div>
            <div>Caras ocultas: {hiddenFaceIndices.length}</div>
            <div>Vertices en mask: {maskedVertexCount}</div>
            <div>Face sets: {faceSetCount}</div>
            <div>Preview vertices: {previewMesh.vertices.length}</div>
            <div>Preview faces: {previewMesh.faces.length}</div>
            <div>Preview aristas: {previewEdges.length}</div>
            <div>Material: {targetEntity ? targetEntityMaterialId : materialIdInput || 'default'}</div>
            <div>UVs: {mesh.uvs?.length === mesh.vertices.length ? 'listas' : 'sin proyectar'}</div>
            <div>Seams: {mesh.seamEdges?.length ?? 0}</div>
            <div>Modifier stack: {modifierStack.length}</div>
            <div>
              Checker: {checkerPreviewEnabled ? `on x${Math.round(checkerScale)}` : 'off'}
            </div>
          </div>
          {message && <p className="mt-2 text-[11px] text-emerald-300">{message}</p>}
        </Card>

        <Card className="border-slate-800 bg-slate-950 p-3">
          <div className="mb-2 text-[11px] uppercase tracking-wide text-slate-400">Mode</div>
          <div className="flex flex-wrap gap-2">
            {editButtons.map((button) => (
              <Button
                key={button.mode}
                size="sm"
                variant={editMode === button.mode ? 'default' : 'outline'}
                onClick={() => setModelerMode(button.mode)}
              >
                {button.icon}
                <span className="ml-1">{button.label}</span>
              </Button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            {editMode === 'object'
              ? 'Primitivas, mirror, unwrap, array lineal/radial, remesh/decimate y weighted normals sobre el viewport real.'
              : editMode === 'vertex'
                ? 'Selección directa, vertex path, slide constrained, relax con bordes preservados, merge, weld y delete.'
                : editMode === 'edge'
                  ? 'Loop/ring/path, seams UV, bevel paramétrico, bridge, bridge loops y collapse sobre aristas.'
                  : 'Extrude/inset por región, grow/shrink/island, UV island, select by normal, pack/checker UV, duplicate normal, knife paramétrico y delete de caras.'}
          </p>
        </Card>

        <Card className="border-slate-800 bg-slate-950 p-3">
          <div className="mb-2 text-[11px] uppercase tracking-wide text-slate-400">Operations</div>
          <div className="mb-3 rounded-md border border-slate-800 bg-slate-900/60 p-3">
            <div className="mb-2 text-[10px] uppercase tracking-wide text-slate-500">
              Mesh material
            </div>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr),auto]">
              <label className="space-y-1">
                <span className="block text-[10px] uppercase tracking-wide text-slate-500">
                  Material ID
                </span>
                <Input
                  aria-label="Material ID"
                  value={materialIdInput}
                  onChange={(event) => setMaterialIdInput(event.target.value)}
                  className="h-8 border-slate-700 bg-slate-950 text-xs"
                  placeholder="default / metal_blue / stone"
                />
              </label>
              <Button
                size="sm"
                variant="outline"
                className="self-end"
                onClick={applyMaterialId}
              >
                Apply material
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              `materialId` se guarda en `MeshRenderer` y el viewport ya responde con una firma
              visual estable para validar cambios rapido.
            </p>
          </div>
          <div className="mb-3 rounded-md border border-slate-800 bg-slate-900/60 p-3">
            <div className="mb-2 text-[10px] uppercase tracking-wide text-slate-500">
              UV preview
            </div>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr),auto]">
              <label className="space-y-1">
                <span className="block text-[10px] uppercase tracking-wide text-slate-500">
                  Checker scale
                </span>
                <Input
                  aria-label="Checker scale"
                  type="number"
                  value={checkerScale}
                  min={1}
                  max={32}
                  step={1}
                  onChange={(event) =>
                    setCheckerScale(readNumericInput(event.target.value, checkerScale))
                  }
                  className="h-8 border-slate-700 bg-slate-950 text-xs"
                />
              </label>
              <Button
                size="sm"
                variant="outline"
                className="self-end"
                onClick={() => applyCheckerPreview(checkerPreviewEnabled)}
              >
                Apply checker
              </Button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={checkerPreviewEnabled ? 'default' : 'outline'}
                onClick={() => applyCheckerPreview(true)}
              >
                Checker on
              </Button>
              <Button
                size="sm"
                variant={!checkerPreviewEnabled ? 'default' : 'outline'}
                onClick={() => applyCheckerPreview(false)}
              >
                Checker off
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              El viewport usa un checker procedural repetido por `uv` para revisar estiramiento y
              packing sin salir del editor.
            </p>
          </div>
          <div className="mb-3 rounded-md border border-slate-800 bg-slate-900/60 p-3">
            <div className="mb-2 text-[10px] uppercase tracking-wide text-slate-500">
              Retopo base
            </div>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr),96px]">
              <label className="space-y-1">
                <span className="block text-[10px] uppercase tracking-wide text-slate-500">
                  Target mesh
                </span>
                <select
                  aria-label="Retopo target"
                  value={retopoTargetEntityId}
                  onChange={(event) => setRetopoTargetEntityId(event.target.value)}
                  className="h-8 w-full rounded-md border border-slate-700 bg-slate-950 px-2 text-xs text-slate-100"
                >
                  {retopoTargetEntries.length === 0 && <option value="">Sin candidatos</option>}
                  {retopoTargetEntries.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="block text-[10px] uppercase tracking-wide text-slate-500">
                  Offset
                </span>
                <Input
                  aria-label="Retopo offset"
                  type="number"
                  value={retopoOffset}
                  min={-1}
                  max={1}
                  step={0.01}
                  onChange={(event) =>
                    setRetopoOffset(readNumericInput(event.target.value, retopoOffset))
                  }
                  className="h-8 border-slate-700 bg-slate-950 text-xs"
                />
              </label>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={enableRetopoSurfaceSnap}>
                Surface snap
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={applyRetopoShrinkwrap}
                disabled={!retopoTargetEntry}
              >
                Shrinkwrap
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              `Surface snap` prepara el gizmo para pegar vertices y piezas al volumen base.
              `Shrinkwrap` proyecta la malla editable al target elegido con offset controlado.
            </p>
          </div>
          <div className="mb-3 rounded-md border border-slate-800 bg-slate-900/60 p-3">
            <div className="mb-2 text-[10px] uppercase tracking-wide text-slate-500">
              Array mode
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={arrayMode === 'linear' ? 'default' : 'outline'}
                onClick={() => setArrayMode('linear')}
              >
                Linear
              </Button>
              <Button
                size="sm"
                variant={arrayMode === 'radial' ? 'default' : 'outline'}
                onClick={() => setArrayMode('radial')}
              >
                Radial
              </Button>
            </div>
            {arrayMode === 'radial' && (
              <div className="mt-2 space-y-2">
                <div className="flex flex-wrap gap-2">
                  {(['x', 'y', 'z'] as Array<ArrayAxis>).map((axis) => (
                    <Button
                      key={axis}
                      size="sm"
                      variant={arrayAxis === axis ? 'default' : 'outline'}
                      onClick={() => setArrayAxis(axis)}
                    >
                      Axis {axis.toUpperCase()}
                    </Button>
                  ))}
                </div>
                <Button
                  size="sm"
                  variant={arrayRotateInstances ? 'default' : 'outline'}
                  onClick={() => setArrayRotateInstances((current) => !current)}
                >
                  {arrayRotateInstances ? 'Rotate instances' : 'Keep original orientation'}
                </Button>
              </div>
            )}
            <p className="mt-2 text-[11px] text-slate-500">
              `Linear` duplica por offset XYZ. `Radial` distribuye instancias alrededor del mesh
              actual y puede girarlas por eje.
            </p>
          </div>
          <div className="mb-3 rounded-md border border-slate-800 bg-slate-900/60 p-3">
            <div className="mb-2 text-[10px] uppercase tracking-wide text-slate-500">
              Modifier stack
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  addModifierToStack(
                    createArrayModifier(
                      arrayMode === 'linear'
                        ? {
                            count: arrayCount,
                            mode: 'linear',
                            offset: { x: arrayOffsetX, y: arrayOffsetY, z: arrayOffsetZ },
                          }
                        : {
                            count: arrayCount,
                            mode: 'radial',
                            axis: arrayAxis,
                            radius: arrayRadius,
                            angle: arrayAngle,
                            rotateInstances: arrayRotateInstances,
                          }
                    )
                  )
                }
              >
                Add array
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => addModifierToStack(createSolidifyModifier(solidifyThickness))}
              >
                Add solidify
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => addModifierToStack(createMirrorModifier())}
              >
                Add mirror
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => addModifierToStack(createRemeshModifier(remeshIterations))}
              >
                Add remesh
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => addModifierToStack(createDecimateModifier(decimateRatio))}
              >
                Add decimate
              </Button>
            </div>
            <div className="mt-3 rounded-md border border-amber-900/40 bg-slate-950/70 p-2">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">
                    Geometry Nodes Lite
                  </div>
                  <div className="text-[11px] text-slate-400">{geometryNodeSummary}</div>
                </div>
                <div className="text-[10px] text-slate-600">
                  {modifierStack.length} modifiers enlazados
                </div>
              </div>
              <p className="text-[11px] text-slate-500">
                Este bloque envuelve el stack procedural actual como `graph` portable: recetas,
                export/import JSON y reaplicación rápida sin salir del modelador.
              </p>
              <div className="mt-2 space-y-2">
                {filteredGeometryNodeRecipeEntries.map((recipe) => (
                  <div
                    key={recipe.id}
                    className="rounded-md border border-amber-900/30 bg-slate-950/80 p-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <EntityVisualThumbnail
                          entity={recipe.thumbnailEntity}
                          thumbnailKey={recipe.thumbnailKey}
                          alt={`Geometry recipe ${recipe.name}`}
                          fallbackLabel={recipe.name.slice(0, 2).toUpperCase()}
                          className="mb-2 h-20 w-full max-w-[220px]"
                          width={176}
                          height={112}
                        />
                        <div className="text-xs text-slate-200">{recipe.name}</div>
                        <div className="text-[10px] text-slate-500">{recipe.description}</div>
                        <div className="mt-1 text-[10px] text-slate-600">{recipe.summary}</div>
                        <div className="mt-1 text-[10px] text-slate-600">
                          {describePresetMetrics(recipe.metrics)}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[11px]"
                          aria-label={`Use geometry recipe ${recipe.name}`}
                          onClick={() => applyGeometryNodeRecipe(recipe, 'replace')}
                        >
                          Use
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[11px]"
                          aria-label={`Append geometry recipe ${recipe.name}`}
                          onClick={() => applyGeometryNodeRecipe(recipe, 'append')}
                        >
                          Append
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[11px]"
                          aria-label={`Export geometry recipe ${recipe.name}`}
                          onClick={() => exportGeometryNodeRecipeToJson(recipe)}
                        >
                          Export
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[11px]"
                          aria-label={`Load geometry recipe metadata ${recipe.name}`}
                          onClick={() =>
                            loadPresetMetadata({
                              name: recipe.name,
                              description: recipe.description,
                              summary: recipe.summary,
                            })
                          }
                        >
                          Load meta
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[11px]"
                          aria-label={`Copy geometry recipe ${recipe.name}`}
                          onClick={() => {
                            const payload = exportGeometryNodeRecipeToJson(recipe);
                            void copyTextToClipboard(
                              payload,
                              `Graph copiado: ${recipe.name}`,
                              `Graph exportado al textarea: ${recipe.name}`
                            );
                          }}
                        >
                          Copy
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
                {filteredGeometryNodeRecipeEntries.length === 0 && (
                  <p className="text-[11px] text-slate-500">
                    No hay recetas de Geometry Nodes Lite que coincidan con ese filtro.
                  </p>
                )}
              </div>
              <div className="mt-2 rounded-md border border-amber-900/30 bg-slate-950/80 p-2">
                <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">
                  Graph JSON
                </div>
                <Textarea
                  aria-label="Geometry Nodes JSON"
                  value={geometryNodesJson}
                  onChange={(event) => setGeometryNodesJson(event.target.value)}
                  className="min-h-[140px] border-slate-700 bg-slate-950 text-xs font-mono"
                  placeholder='{"version":1,"name":"Panel Run","nodes":[...]}'
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label="Export geometry graph JSON"
                    onClick={() => exportGeometryNodeGraphToJson()}
                    disabled={geometryNodeGraph.length === 0}
                  >
                    Export graph
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label="Import replace geometry graph"
                    onClick={() => importGeometryNodeGraphFromJson('replace')}
                  >
                    Import replace
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label="Import append geometry graph"
                    onClick={() => importGeometryNodeGraphFromJson('append')}
                  >
                    Import append
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label="Clear geometry graph JSON"
                    onClick={() => {
                      setGeometryNodesJson('');
                      setMessage('JSON de Geometry Nodes Lite limpiado.');
                    }}
                  >
                    Clear graph
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label="Copy geometry graph JSON"
                    onClick={() => {
                      const payload = geometryNodesJson.trim()
                        ? geometryNodesJson
                        : exportGeometryNodeGraphToJson();
                      if (!payload) return;
                      void copyTextToClipboard(
                        payload,
                        'Graph JSON copiado al portapapeles.',
                        'Graph JSON listo en el textarea para copiar manualmente.'
                      );
                    }}
                  >
                    Copy graph
                  </Button>
                </div>
              </div>
            </div>
            <div className="mt-3 rounded-md border border-slate-800 bg-slate-950/70 p-2">
              <div className="mb-2 text-[10px] uppercase tracking-wide text-slate-500">
                Stack presets
              </div>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr),auto]">
                <Input
                  value={modifierPresetName}
                  onChange={(event) => setModifierPresetName(event.target.value)}
                  className="h-8 border-slate-700 bg-slate-950 text-xs"
                  placeholder="Nombre del preset"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="self-end"
                  onClick={saveCurrentModifierPreset}
                  disabled={modifierStack.length === 0}
                >
                  Save preset
                </Button>
              </div>
              <Input
                value={modifierPresetFilter}
                onChange={(event) => setModifierPresetFilter(event.target.value)}
                className="mt-2 h-8 border-slate-700 bg-slate-950 text-xs"
                placeholder="Filtrar presets por nombre, descripcion o resumen"
              />
              <Textarea
                value={modifierPresetDescription}
                onChange={(event) => setModifierPresetDescription(event.target.value)}
                className="mt-2 min-h-[72px] border-slate-700 bg-slate-950 text-xs"
                placeholder="Descripcion corta del preset o intencion del stack"
              />
              <div className="mt-2 rounded-md border border-slate-800 bg-slate-950/80 p-2">
                <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">
                  JSON transfer
                </div>
                <Textarea
                  value={modifierTransferJson}
                  onChange={(event) => setModifierTransferJson(event.target.value)}
                  className="min-h-[140px] border-slate-700 bg-slate-950 text-xs font-mono"
                  placeholder='{"version":1,"name":"My Stack","modifiers":[...]}'
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => exportModifierStackToJson(modifierStack)}
                    disabled={modifierStack.length === 0}
                  >
                    Export current
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => importModifierStackFromJson('replace')}
                  >
                    Import replace
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => importModifierStackFromJson('append')}
                  >
                    Import append
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setModifierTransferJson('')}
                  >
                    Clear JSON
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (!modifierTransferJson.trim()) {
                        setMessage('No hay JSON de stack para copiar.');
                        return;
                      }
                      void copyTextToClipboard(
                        modifierTransferJson,
                        'JSON del stack copiado al portapapeles.',
                        'JSON del stack listo en el textarea para copiar manualmente.'
                      );
                    }}
                  >
                    Copy JSON
                  </Button>
                </div>
              </div>
              <div className="mt-2 rounded-md border border-slate-800 bg-slate-950/80 p-2">
                <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">
                  Preset library JSON
                </div>
                <Textarea
                  value={modifierLibraryJson}
                  onChange={(event) => setModifierLibraryJson(event.target.value)}
                  className="min-h-[140px] border-slate-700 bg-slate-950 text-xs font-mono"
                  placeholder='{"version":1,"presets":[...]}'
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => exportModifierPresetLibraryToJson('saved')}
                    disabled={customModifierPresets.length === 0}
                  >
                    Export saved
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => exportModifierPresetLibraryToJson('all')}
                  >
                    Export all
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => importModifierPresetLibraryFromJson('replace')}
                  >
                    Import replace
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => importModifierPresetLibraryFromJson('merge')}
                  >
                    Import merge
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setModifierLibraryJson('')}
                  >
                    Clear library
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (!modifierLibraryJson.trim()) {
                        setMessage('No hay libreria JSON para copiar.');
                        return;
                      }
                      void copyTextToClipboard(
                        modifierLibraryJson,
                        'Libreria de presets copiada al portapapeles.',
                        'Libreria JSON lista en el textarea para copiar manualmente.'
                      );
                    }}
                  >
                    Copy library
                  </Button>
                </div>
              </div>
              <div
                className="mt-2 rounded-md border border-cyan-900/40 bg-slate-950/80 p-2"
                data-testid="modeler-server-library"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">
                      Server library
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Proyecto activo: {projectName || 'untitled_project'} · Presets
                      persistentes por proyecto o compartidos en servidor.
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => void refreshServerModifierPresets()}
                    disabled={sessionChecking}
                    data-testid="modeler-server-library-refresh"
                  >
                    Refresh
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => void saveCurrentModifierPresetToServer('project')}
                    disabled={modifierStack.length === 0 || !sessionReady}
                  >
                    Save project
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => void saveCurrentModifierPresetToServer('shared')}
                    disabled={modifierStack.length === 0 || !sessionReady}
                  >
                    Save shared
                  </Button>
                </div>
                {!sessionReady && !sessionChecking && (
                  <p
                    className="mt-2 text-[11px] text-slate-500"
                    data-testid="modeler-server-library-state"
                  >
                    {MODELER_AUTH_HINT}
                  </p>
                )}
                {sessionReady && serverModifierPresetsLoading && (
                  <p
                    className="mt-2 text-[11px] text-slate-500"
                    data-testid="modeler-server-library-state"
                  >
                    Cargando presets del servidor...
                  </p>
                )}
                {sessionReady && !serverModifierPresetsLoading && serverModifierPresetsError && (
                  <p
                    className="mt-2 text-[11px] text-amber-300"
                    data-testid="modeler-server-library-state"
                  >
                    {serverModifierPresetsError}
                  </p>
                )}
                {sessionReady &&
                  !serverModifierPresetsLoading &&
                  !serverModifierPresetsError &&
                  filteredServerPresetEntries.length === 0 && (
                    <p
                      className="mt-2 text-[11px] text-slate-500"
                      data-testid="modeler-server-library-state"
                    >
                      No hay presets persistentes del servidor para este proyecto o filtro.
                    </p>
                  )}
                {sessionReady &&
                  !serverModifierPresetsLoading &&
                  !serverModifierPresetsError &&
                  filteredServerPresetEntries.length > 0 && (
                  <div className="mt-2 space-y-2" data-testid="modeler-server-preset-list">
                    {filteredServerPresetEntries.map((preset) => (
                      <div
                        key={preset.path}
                        className={cn(
                          'rounded-md border bg-slate-950/80 p-2',
                          preset.scope === 'shared'
                            ? 'border-cyan-900/50'
                            : 'border-sky-900/50'
                        )}
                        data-testid="modeler-server-preset-entry"
                        data-preset-name={preset.name}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <EntityVisualThumbnail
                              entity={preset.thumbnailEntity}
                              thumbnailKey={preset.thumbnailKey}
                              alt={`Preset servidor ${preset.name}`}
                              fallbackLabel={preset.name.slice(0, 2).toUpperCase()}
                              className="mb-2 h-20 w-full max-w-[220px]"
                              width={176}
                              height={112}
                            />
                            <div className="text-xs text-slate-200">{preset.name}</div>
                            <div className="text-[10px] text-slate-500">
                              {preset.definition.description?.trim() ||
                                'Preset persistente sin descripcion manual'}
                            </div>
                            <div className="mt-1 text-[10px] text-slate-600">
                              {preset.scope === 'shared'
                                ? 'Shared library'
                                : `Proyecto: ${preset.projectKey}`}{' '}
                              · {preset.path}
                            </div>
                            <div className="mt-1 text-[10px] text-slate-600">
                              {preset.summary}
                            </div>
                            <div className="mt-1 text-[10px] text-slate-600">
                              {describePresetMetrics(preset.metrics)}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px]"
                              data-testid="modeler-server-preset-apply"
                              onClick={() =>
                                applyModifierPreset(
                                  preset.name,
                                  preset.definition.modifiers,
                                  'replace',
                                  preset.definition.description
                                )
                              }
                            >
                              Apply
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px]"
                              onClick={() =>
                                applyModifierPreset(
                                  preset.name,
                                  preset.definition.modifiers,
                                  'append',
                                  preset.definition.description
                                )
                              }
                            >
                              Append
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px]"
                              onClick={() =>
                                exportModifierStackToJson(preset.definition.modifiers, {
                                  name: preset.name,
                                  description: preset.definition.description,
                                })
                              }
                            >
                              Export
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px]"
                              onClick={() =>
                                loadPresetMetadata({
                                  name: preset.name,
                                  description: preset.definition.description,
                                  summary: preset.summary,
                                })
                              }
                            >
                              Load meta
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px]"
                              onClick={() => {
                                const payload = exportModifierStackToJson(
                                  preset.definition.modifiers,
                                  {
                                    name: preset.name,
                                    description: preset.definition.description,
                                  }
                                );
                                if (!payload) return;
                                void copyTextToClipboard(
                                  payload,
                                  `Preset copiado: ${preset.name}`,
                                  `Preset exportado al textarea: ${preset.name}`
                                );
                              }}
                            >
                              Copy
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px]"
                              onClick={() => void deleteServerModifierPreset(preset)}
                            >
                              Delete
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="mt-2 space-y-2">
                {filteredBuiltInPresetEntries.map((preset) => (
                  <div
                    key={preset.id}
                    className="rounded-md border border-slate-800 bg-slate-950/80 p-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <EntityVisualThumbnail
                          entity={preset.thumbnailEntity}
                          thumbnailKey={preset.thumbnailKey}
                          alt={`Preset built-in ${preset.name}`}
                          fallbackLabel={preset.name.slice(0, 2).toUpperCase()}
                          className="mb-2 h-20 w-full max-w-[220px]"
                          width={176}
                          height={112}
                        />
                        <div className="text-xs text-slate-200">{preset.name}</div>
                        <div className="text-[10px] text-slate-500">{preset.description}</div>
                        <div className="mt-1 text-[10px] text-slate-600">
                          {preset.summary}
                        </div>
                        <div className="mt-1 text-[10px] text-slate-600">
                          {describePresetMetrics(preset.metrics)}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[11px]"
                          onClick={() =>
                            applyModifierPreset(
                              preset.name,
                              preset.modifiers,
                              'replace',
                              preset.description
                            )
                          }
                        >
                          Apply
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[11px]"
                          onClick={() =>
                            applyModifierPreset(
                              preset.name,
                              preset.modifiers,
                              'append',
                              preset.description
                            )
                          }
                        >
                          Append
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[11px]"
                          onClick={() =>
                            exportModifierStackToJson(preset.modifiers, {
                              name: preset.name,
                              description: preset.description,
                            })
                          }
                        >
                          Export
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => loadPresetMetadata(preset)}
                        >
                          Load meta
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => {
                            const payload = exportModifierStackToJson(preset.modifiers, {
                              name: preset.name,
                              description: preset.description,
                            });
                            if (!payload) return;
                            void copyTextToClipboard(
                              payload,
                              `Preset copiado: ${preset.name}`,
                              `Preset exportado al textarea: ${preset.name}`
                            );
                          }}
                        >
                          Copy
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
                {filteredCustomPresetEntries.map((preset) => (
                  <div
                    key={preset.id}
                    className="rounded-md border border-emerald-900/50 bg-slate-950/80 p-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <EntityVisualThumbnail
                          entity={preset.thumbnailEntity}
                          thumbnailKey={preset.thumbnailKey}
                          alt={`Preset local ${preset.name}`}
                          fallbackLabel={preset.name.slice(0, 2).toUpperCase()}
                          className="mb-2 h-20 w-full max-w-[220px]"
                          width={176}
                          height={112}
                        />
                        <div className="text-xs text-slate-200">{preset.name}</div>
                        <div className="text-[10px] text-slate-500">
                          {preset.description?.trim() || 'Preset local sin descripcion manual'}
                        </div>
                        <div className="mt-1 text-[10px] text-slate-600">
                          {preset.summary}
                        </div>
                        <div className="mt-1 text-[10px] text-slate-600">
                          {describePresetMetrics(preset.metrics)}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[11px]"
                          onClick={() =>
                            applyModifierPreset(
                              preset.name,
                              preset.modifiers,
                              'replace',
                              preset.description
                            )
                          }
                        >
                          Apply
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[11px]"
                          onClick={() =>
                            applyModifierPreset(
                              preset.name,
                              preset.modifiers,
                              'append',
                              preset.description
                            )
                          }
                        >
                          Append
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[11px]"
                          onClick={() =>
                            exportModifierStackToJson(preset.modifiers, {
                              name: preset.name,
                              description: preset.description,
                            })
                          }
                        >
                          Export
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => loadPresetMetadata(preset)}
                        >
                          Load meta
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => duplicateCustomModifierPreset(preset.id)}
                        >
                          Duplicate
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => {
                            const payload = exportModifierStackToJson(preset.modifiers, {
                              name: preset.name,
                              description: preset.description,
                            });
                            if (!payload) return;
                            void copyTextToClipboard(
                              payload,
                              `Preset copiado: ${preset.name}`,
                              `Preset exportado al textarea: ${preset.name}`
                            );
                          }}
                        >
                          Copy
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => deleteModifierPreset(preset.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
                {filteredGeometryNodeRecipeEntries.length === 0 &&
                  filteredBuiltInPresetEntries.length === 0 &&
                  filteredCustomPresetEntries.length === 0 &&
                  filteredServerPresetEntries.length === 0 && (
                  <p className="text-[11px] text-slate-500">
                    No hay presets que coincidan con ese filtro.
                  </p>
                  )}
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {modifierStack.length === 0 ? (
                <p className="text-[11px] text-slate-500">
                  Sin modifiers. Las operaciones actuales siguen siendo destructivas hasta que
                  agregues modifiers al stack.
                </p>
              ) : (
                modifierStack.map((modifier, index) => (
                  <div
                    key={modifier.id}
                    className="rounded-md border border-slate-800 bg-slate-950/80 p-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-xs text-slate-200">
                          {index + 1}. {modifier.label ?? modifier.type}
                        </div>
                        <div className="truncate text-[10px] text-slate-500">
                          {describeModifier(modifier)}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <Button
                          size="sm"
                          variant={modifier.enabled ? 'default' : 'outline'}
                          className="h-7 px-2 text-[11px]"
                          onClick={() => toggleModifierEnabled(modifier.id)}
                        >
                          {modifier.enabled ? 'On' : 'Off'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => moveModifier(modifier.id, -1)}
                          disabled={index === 0}
                        >
                          Up
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => moveModifier(modifier.id, 1)}
                          disabled={index === modifierStack.length - 1}
                        >
                          Down
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => duplicateModifier(modifier.id)}
                        >
                          Duplicate
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => removeModifier(modifier.id)}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                    <div className="mt-2 space-y-2">
                      {modifier.type === 'mirror_x' && (
                        <p className="text-[11px] text-slate-500">
                          Mirror X no necesita parametros extra. Puedes reordenarlo para decidir
                          en que momento del stack ocurre el reflejo.
                        </p>
                      )}
                      {modifier.type === 'solidify' && (
                        <label className="block space-y-1">
                          <span className="block text-[10px] uppercase tracking-wide text-slate-500">
                            Thickness
                          </span>
                          <Input
                            type="number"
                            value={modifier.thickness}
                            min={0.001}
                            max={10}
                            step={0.01}
                            onChange={(event) =>
                              updateModifier(modifier.id, (current) =>
                                current.type === 'solidify'
                                  ? {
                                      ...current,
                                      thickness: readNumericInput(
                                        event.target.value,
                                        current.thickness
                                      ),
                                    }
                                  : current
                              )
                            }
                            className="h-8 border-slate-700 bg-slate-950 text-xs"
                          />
                        </label>
                      )}
                      {modifier.type === 'array' && (
                        <div className="space-y-2">
                          <div className="grid gap-2 sm:grid-cols-2">
                            <label className="space-y-1">
                              <span className="block text-[10px] uppercase tracking-wide text-slate-500">
                                Count
                              </span>
                              <Input
                                type="number"
                                value={modifier.count}
                                min={2}
                                max={64}
                                step={1}
                                onChange={(event) =>
                                  updateModifier(modifier.id, (current) =>
                                    current.type === 'array'
                                      ? {
                                          ...current,
                                          count: readNumericInput(
                                            event.target.value,
                                            current.count
                                          ),
                                        }
                                      : current
                                  )
                                }
                                className="h-8 border-slate-700 bg-slate-950 text-xs"
                              />
                            </label>
                            <div className="space-y-1">
                              <span className="block text-[10px] uppercase tracking-wide text-slate-500">
                                Mode
                              </span>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant={modifier.mode === 'linear' ? 'default' : 'outline'}
                                  className="h-8 flex-1 text-[11px]"
                                  onClick={() =>
                                    updateModifier(modifier.id, (current) =>
                                      current.type === 'array'
                                        ? {
                                            ...current,
                                            mode: 'linear',
                                            label: 'Array Linear',
                                          }
                                        : current
                                    )
                                  }
                                >
                                  Linear
                                </Button>
                                <Button
                                  size="sm"
                                  variant={modifier.mode === 'radial' ? 'default' : 'outline'}
                                  className="h-8 flex-1 text-[11px]"
                                  onClick={() =>
                                    updateModifier(modifier.id, (current) =>
                                      current.type === 'array'
                                        ? {
                                            ...current,
                                            mode: 'radial',
                                            label: 'Array Radial',
                                          }
                                        : current
                                    )
                                  }
                                >
                                  Radial
                                </Button>
                              </div>
                            </div>
                          </div>
                          {modifier.mode === 'linear' ? (
                            <div className="grid gap-2 sm:grid-cols-3">
                              {(
                                [
                                  ['x', 'Offset X'],
                                  ['y', 'Offset Y'],
                                  ['z', 'Offset Z'],
                                ] as const
                              ).map(([axisKey, label]) => (
                                <label key={axisKey} className="space-y-1">
                                  <span className="block text-[10px] uppercase tracking-wide text-slate-500">
                                    {label}
                                  </span>
                                  <Input
                                    type="number"
                                    value={modifier.offset?.[axisKey] ?? 0}
                                    min={-1000}
                                    max={1000}
                                    step={0.1}
                                    onChange={(event) =>
                                      updateModifier(modifier.id, (current) =>
                                        current.type === 'array'
                                          ? {
                                              ...current,
                                              offset: {
                                                x: current.offset?.x ?? 0,
                                                y: current.offset?.y ?? 0,
                                                z: current.offset?.z ?? 0,
                                                [axisKey]: readNumericInput(
                                                  event.target.value,
                                                  current.offset?.[axisKey] ?? 0
                                                ),
                                              },
                                            }
                                          : current
                                      )
                                    }
                                    className="h-8 border-slate-700 bg-slate-950 text-xs"
                                  />
                                </label>
                              ))}
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <div className="grid gap-2 sm:grid-cols-2">
                                <label className="space-y-1">
                                  <span className="block text-[10px] uppercase tracking-wide text-slate-500">
                                    Radius
                                  </span>
                                  <Input
                                    type="number"
                                    value={modifier.radius ?? 2}
                                    min={0}
                                    max={1000}
                                    step={0.1}
                                    onChange={(event) =>
                                      updateModifier(modifier.id, (current) =>
                                        current.type === 'array'
                                          ? {
                                              ...current,
                                              radius: readNumericInput(
                                                event.target.value,
                                                current.radius ?? 2
                                              ),
                                            }
                                          : current
                                      )
                                    }
                                    className="h-8 border-slate-700 bg-slate-950 text-xs"
                                  />
                                </label>
                                <label className="space-y-1">
                                  <span className="block text-[10px] uppercase tracking-wide text-slate-500">
                                    Angle
                                  </span>
                                  <Input
                                    type="number"
                                    value={modifier.angle ?? 360}
                                    min={-360}
                                    max={360}
                                    step={1}
                                    onChange={(event) =>
                                      updateModifier(modifier.id, (current) =>
                                        current.type === 'array'
                                          ? {
                                              ...current,
                                              angle: readNumericInput(
                                                event.target.value,
                                                current.angle ?? 360
                                              ),
                                            }
                                          : current
                                      )
                                    }
                                    className="h-8 border-slate-700 bg-slate-950 text-xs"
                                  />
                                </label>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {(['x', 'y', 'z'] as Array<ArrayAxis>).map((axis) => (
                                  <Button
                                    key={axis}
                                    size="sm"
                                    variant={modifier.axis === axis ? 'default' : 'outline'}
                                    className="h-8 text-[11px]"
                                    onClick={() =>
                                      updateModifier(modifier.id, (current) =>
                                        current.type === 'array'
                                          ? {
                                              ...current,
                                              axis,
                                            }
                                          : current
                                      )
                                    }
                                  >
                                    Axis {axis.toUpperCase()}
                                  </Button>
                                ))}
                                <Button
                                  size="sm"
                                  variant={modifier.rotateInstances ? 'default' : 'outline'}
                                  className="h-8 text-[11px]"
                                  onClick={() =>
                                    updateModifier(modifier.id, (current) =>
                                      current.type === 'array'
                                        ? {
                                            ...current,
                                            rotateInstances: !current.rotateInstances,
                                          }
                                        : current
                                    )
                                  }
                                >
                                  {modifier.rotateInstances ? 'Rotate on' : 'Rotate off'}
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      {modifier.type === 'remesh' && (
                        <div className="grid gap-2 sm:grid-cols-2">
                          <label className="space-y-1">
                            <span className="block text-[10px] uppercase tracking-wide text-slate-500">
                              Iterations
                            </span>
                            <Input
                              type="number"
                              value={modifier.iterations}
                              min={1}
                              max={3}
                              step={1}
                              onChange={(event) =>
                                updateModifier(modifier.id, (current) =>
                                  current.type === 'remesh'
                                    ? {
                                        ...current,
                                        iterations: readNumericInput(
                                          event.target.value,
                                          current.iterations
                                        ),
                                      }
                                    : current
                                )
                              }
                              className="h-8 border-slate-700 bg-slate-950 text-xs"
                            />
                          </label>
                          <label className="space-y-1">
                            <span className="block text-[10px] uppercase tracking-wide text-slate-500">
                              Relax
                            </span>
                            <Input
                              type="number"
                              value={modifier.relaxStrength ?? 0.12}
                              min={0}
                              max={1}
                              step={0.01}
                              onChange={(event) =>
                                updateModifier(modifier.id, (current) =>
                                  current.type === 'remesh'
                                    ? {
                                        ...current,
                                        relaxStrength: readNumericInput(
                                          event.target.value,
                                          current.relaxStrength ?? 0.12
                                        ),
                                      }
                                    : current
                                )
                              }
                              className="h-8 border-slate-700 bg-slate-950 text-xs"
                            />
                          </label>
                        </div>
                      )}
                      {modifier.type === 'decimate' && (
                        <label className="block space-y-1">
                          <span className="block text-[10px] uppercase tracking-wide text-slate-500">
                            Ratio
                          </span>
                          <Input
                            type="number"
                            value={modifier.ratio}
                            min={0.1}
                            max={1}
                            step={0.05}
                            onChange={(event) =>
                              updateModifier(modifier.id, (current) =>
                                current.type === 'decimate'
                                  ? {
                                      ...current,
                                      ratio: readNumericInput(event.target.value, current.ratio),
                                    }
                                  : current
                              )
                            }
                            className="h-8 border-slate-700 bg-slate-950 text-xs"
                          />
                        </label>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={bakeModifierStack}>
                Bake stack
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => updateModifierStack([], 'Modifier stack limpiado')}
              >
                Clear stack
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              El viewport aplica este stack encima de la malla base activa. En modo desacoplado,
              el stack vive localmente y sigue disponible hasta que lo limpies o lo conviertas en
              preset.
            </p>
          </div>
          <div className="mb-3 rounded-md border border-slate-800 bg-slate-900/60 p-3">
            <div className="mb-2 text-[10px] uppercase tracking-wide text-slate-500">
              Weighted normals
            </div>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr),auto]">
              <label className="space-y-1">
                <span className="block text-[10px] uppercase tracking-wide text-slate-500">
                  Strength
                </span>
                <Input
                  aria-label="Weighted normals strength"
                  type="number"
                  value={weightedNormalsStrength}
                  min={0}
                  max={4}
                  step={0.05}
                  onChange={(event) =>
                    setWeightedNormalsStrength(
                      readNumericInput(event.target.value, weightedNormalsStrength)
                    )
                  }
                  className="h-8 border-slate-700 bg-slate-950 text-xs"
                />
              </label>
              <Button
                size="sm"
                variant="outline"
                className="self-end"
                onClick={() => applyWeightedNormals(weightedNormalsEnabled)}
              >
                Apply shading
              </Button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={weightedNormalsEnabled ? 'default' : 'outline'}
                onClick={() => applyWeightedNormals(true)}
              >
                Weighted on
              </Button>
              <Button
                size="sm"
                variant={!weightedNormalsEnabled ? 'default' : 'outline'}
                onClick={() => applyWeightedNormals(false)}
              >
                Weighted off
              </Button>
              <Button
                size="sm"
                variant={weightedNormalsKeepSharp ? 'default' : 'outline'}
                onClick={() => {
                  const nextKeepSharp = !weightedNormalsKeepSharp;
                  setWeightedNormalsKeepSharp(nextKeepSharp);
                  syncMeshRendererData(
                    {
                      material: {
                        ...(targetEntityMaterialOverride ?? {}),
                        weightedNormalsEnabled,
                        weightedNormalsStrength,
                        weightedNormalsKeepSharp: nextKeepSharp,
                      },
                    },
                    `Keep sharp ${nextKeepSharp ? 'activado' : 'desactivado'}`
                  );
                }}
              >
                Keep sharp
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              Esto mejora el hard-surface shading sin destruir la topología editable.
            </p>
          </div>
          {operationSettings.length > 0 && (
            <div className="mb-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {operationSettings.map((setting) => (
                <label key={setting.key} className="space-y-1">
                  <span className="block text-[10px] uppercase tracking-wide text-slate-500">
                    {setting.label}
                  </span>
                  <Input
                    type="number"
                    value={setting.value}
                    min={setting.min}
                    max={setting.max}
                    step={setting.step}
                    onChange={(event) =>
                      setting.setValue(
                        readNumericInput(event.target.value, setting.value)
                      )
                    }
                    className="h-8 border-slate-700 bg-slate-950 text-xs"
                  />
                </label>
              ))}
            </div>
          )}
          {editMode === 'object' && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => resetPrimitive('cube')}>
                  <Box className="mr-1 h-3 w-3" />
                  Cubo base
                </Button>
                <Button size="sm" variant="outline" onClick={() => resetPrimitive('plane')}>
                  <Triangle className="mr-1 h-3 w-3" />
                  Plano base
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    syncMeshToSelectedEntity(mirrorMeshX(mesh), 'Mirror X aplicado')
                  }
                >
                  <Copy className="mr-1 h-3 w-3" />
                  Mirror X
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    syncMeshToSelectedEntity(
                      unwrapMeshPlanar(mesh),
                      'UVs planar aplicadas'
                    )
                  }
                >
                  <Wand2 className="mr-1 h-3 w-3" />
                  Unwrap planar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    applyMeshOperation(
                      (currentMesh) => solidifyMesh(currentMesh, solidifyThickness),
                      `Solidify aplicada (${solidifyThickness.toFixed(2)})`,
                      [0]
                    )
                  }
                  >
                  <Layers className="mr-1 h-3 w-3" />
                  Solidify
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    applyMeshOperation(
                      (currentMesh) =>
                        arrayMesh(
                          currentMesh,
                          arrayCount,
                          arrayMode === 'linear'
                            ? {
                                x: arrayOffsetX,
                                y: arrayOffsetY,
                                z: arrayOffsetZ,
                              }
                            : {
                                mode: 'radial',
                                axis: arrayAxis,
                                radius: arrayRadius,
                                angle: arrayAngle,
                                rotateInstances: arrayRotateInstances,
                              }
                        ),
                      arrayMode === 'linear'
                        ? `Array lineal x${Math.max(1, Math.round(arrayCount))} aplicada`
                        : `Array radial x${Math.max(1, Math.round(arrayCount))} sobre eje ${arrayAxis.toUpperCase()} aplicada`,
                      [0]
                    )
                  }
                >
                  Array
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    applyMeshOperation(
                      (currentMesh) => remeshMeshUniform(currentMesh, remeshIterations),
                      `Uniform remesh x${Math.max(1, Math.round(remeshIterations))} aplicada`,
                      [0]
                    )
                  }
                >
                  Remesh
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    applyMeshOperation(
                      (currentMesh) => decimateMesh(currentMesh, decimateRatio),
                      `Decimate al ${(Math.max(0.1, Math.min(1, decimateRatio)) * 100).toFixed(0)}% aplicada`,
                      [0]
                    )
                  }
                >
                  Decimate
                </Button>
              </div>

              <TopologyAuthoringCard
                mesh={mesh}
                onApplyMesh={(nextMesh, nextMessage) =>
                  syncMeshToSelectedEntity(nextMesh, nextMessage, [0])
                }
              />
            </div>
          )}

          {editMode === 'vertex' && (
            <div className="flex flex-wrap gap-2">
              <div className="flex w-full flex-wrap items-center gap-2 rounded-md border border-slate-800 bg-slate-900/60 p-2">
                <span className="text-[10px] uppercase tracking-wide text-slate-500">
                  Slide mode
                </span>
                {([
                  ['free', 'Free'],
                  ['path', 'Path'],
                  ['x', 'Axis X'],
                  ['y', 'Axis Y'],
                  ['z', 'Axis Z'],
                ] as Array<[SlideConstraint, string]>).map(([constraint, label]) => (
                  <Button
                    key={constraint}
                    size="sm"
                    variant={slideConstraint === constraint ? 'default' : 'outline'}
                    className="h-7 text-[11px]"
                    onClick={() => setSlideConstraint(constraint)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              {[
                { label: '+X', delta: { x: 0.1, y: 0, z: 0 } },
                { label: '-X', delta: { x: -0.1, y: 0, z: 0 } },
                { label: '+Y', delta: { x: 0, y: 0.1, z: 0 } },
                { label: '-Y', delta: { x: 0, y: -0.1, z: 0 } },
                { label: '+Z', delta: { x: 0, y: 0, z: 0.1 } },
                { label: '-Z', delta: { x: 0, y: 0, z: -0.1 } },
              ].map((option) => (
                <Button
                  key={option.label}
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    syncMeshToSelectedEntity(
                      moveVertices(mesh, safeSelectedElements, option.delta),
                      `Vertices movidos ${option.label}`,
                      safeSelectedElements
                    )
                  }
                >
                  {option.label}
                </Button>
              ))}
              <Button size="sm" variant="outline" onClick={applyVertexPathSelection}>
                Path select
              </Button>
              <Button size="sm" variant="outline" onClick={applyVertexMask}>
                Mask selected
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => applyClearVertexMask(false)}
              >
                Clear mask
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => applyClearVertexMask(true)}
              >
                Clear all mask
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => applyConstrainedSlide(1)}
              >
                Slide +
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => applyConstrainedSlide(-1)}
              >
                Slide -
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  applyVertexOperation(
                    (currentMesh, vertexIndices) =>
                      relaxVertices(
                        currentMesh,
                        vertexIndices,
                        relaxStrength,
                        relaxIterations,
                        { preserveBoundary: true }
                      ),
                    `Relax ${relaxStrength.toFixed(2)} x${Math.max(1, Math.round(relaxIterations))} preservando bordes`
                  )
                }
              >
                Relax
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  applyVertexOperation(
                    (currentMesh, vertexIndices) => mergeVertices(currentMesh, vertexIndices),
                    `${safeSelectedElements.length} vertices fusionados`
                  )
                }
              >
                Merge
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  applyVertexOperation(
                    (currentMesh, vertexIndices) =>
                      weldVerticesByDistance(currentMesh, weldDistance, vertexIndices),
                    `Weld <= ${weldDistance.toFixed(2)} sobre ${safeSelectedElements.length} vertices`
                  )
                }
              >
                Weld
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  applyVertexOperation(
                    (currentMesh, vertexIndices) => fillVertices(currentMesh, vertexIndices),
                    `Fill aplicada a ${safeSelectedElements.length} vertices`
                  )
                }
              >
                Fill
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  applyVertexOperation(
                    (currentMesh, vertexIndices) => gridFillVertices(currentMesh, vertexIndices),
                    `Grid Fill aplicada a ${safeSelectedElements.length} vertices`
                  )
                }
              >
                Grid Fill
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  applyVertexOperation(
                    (currentMesh, vertexIndices) => deleteVertices(currentMesh, vertexIndices),
                    `${safeSelectedElements.length} vertices eliminados`
                  )
                }
              >
                Delete
              </Button>
            </div>
          )}

          {editMode === 'edge' && (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  applyEdgeOperation(
                    (currentMesh, edgeIndices) =>
                      edgeIndices
                        .slice()
                        .sort((left, right) => right - left)
                        .reduce(
                          (workingMesh, edgeIndex) => subdivideEdge(workingMesh, edgeIndex),
                          currentMesh
                        ),
                    `Subdivide aplicada a ${safeSelectedElements.length} aristas`
                  )
                }
              >
                <Scissors className="mr-1 h-3 w-3" />
                Subdivide edge
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setModelerSelection(selectEdgeLoop(mesh, selectedEdgeIndex))}
              >
                Loop select
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setModelerSelection(selectEdgeRing(mesh, selectedEdgeIndex))}
              >
                Ring select
              </Button>
              <Button size="sm" variant="outline" onClick={applyEdgePathSelection}>
                Path select
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  applyMeshOperation(
                    (currentMesh) => markSeamEdges(currentMesh, safeSelectedElements),
                    `${safeSelectedElements.length} arista(s) marcadas como seam`,
                    safeSelectedElements
                  )
                }
              >
                Mark seam
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  applyMeshOperation(
                    (currentMesh) => clearSeamEdges(currentMesh, safeSelectedElements),
                    `Seam limpiada en ${safeSelectedElements.length} arista(s)`,
                    safeSelectedElements
                  )
                }
              >
                Clear seam
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const result = polyBuildEdge(mesh, selectedEdgeIndex, polyBuildDistance);
                  if (!result.ok) {
                    setMessage(result.reason ?? 'No se pudo ejecutar Poly Build.');
                    return;
                  }
                  syncMeshToSelectedEntity(
                    result.mesh,
                    `Poly Build ${polyBuildDistance.toFixed(2)} sobre arista #${selectedEdgeIndex}`,
                    result.createdEdgeIndex !== null ? [result.createdEdgeIndex] : [0]
                  );
                }}
              >
                Poly Build
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  applyEdgeOperation(
                    (currentMesh, edgeIndices) =>
                      bevelEdges(currentMesh, edgeIndices, bevelAmount, bevelSegments),
                    `Bevel ${bevelAmount.toFixed(2)} x${Math.max(1, Math.round(bevelSegments))} aplicada a ${safeSelectedElements.length} aristas`
                  )
                }
              >
                Bevel
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (safeSelectedElements.length < 2) {
                    setMessage('Selecciona al menos 2 aristas para Bridge.');
                    return;
                  }
                  applyEdgeOperation(
                    (currentMesh, edgeIndices) => bridgeEdges(currentMesh, edgeIndices),
                    `Bridge aplicada sobre ${Math.floor(safeSelectedElements.length / 2)} par(es) de aristas`
                  );
                }}
              >
                Bridge
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (safeSelectedElements.length < 2) {
                    setMessage('Selecciona dos loops/cadenas de aristas para Bridge Loops.');
                    return;
                  }
                  applyEdgeOperation(
                    (currentMesh, edgeIndices) =>
                      bridgeEdgeLoops(currentMesh, edgeIndices, bridgeSegments),
                    `Bridge loops x${Math.max(1, Math.round(bridgeSegments))} aplicada`
                  );
                }}
              >
                Bridge loops
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  applyEdgeOperation(
                    (currentMesh, edgeIndices) => fillEdges(currentMesh, edgeIndices),
                    `Fill aplicada a ${safeSelectedElements.length} aristas`
                  )
                }
              >
                Fill
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  applyEdgeOperation(
                    (currentMesh, edgeIndices) => gridFillEdges(currentMesh, edgeIndices),
                    `Grid Fill aplicada a ${safeSelectedElements.length} aristas`
                  )
                }
              >
                Grid Fill
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  applyEdgeOperation(
                    (currentMesh, edgeIndices) => collapseEdges(currentMesh, edgeIndices),
                    `${safeSelectedElements.length} aristas colapsadas`
                  )
                }
              >
                Collapse
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  applyEdgeOperation(
                    (currentMesh, edgeIndices) => deleteEdges(currentMesh, edgeIndices),
                    `${safeSelectedElements.length} aristas eliminadas`
                  )
                }
              >
                Delete
              </Button>
            </div>
          )}

          {editMode === 'face' && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={applyFaceIslandSelection}
                >
                  Island
                </Button>
                <Button size="sm" variant="outline" onClick={applyUvIslandSelection}>
                  UV island
                </Button>
                <Button size="sm" variant="outline" onClick={applyFaceNormalSelection}>
                  Select normal
                </Button>
                <Button size="sm" variant="outline" onClick={applyHideSelectedFaces}>
                  Hide selected
                </Button>
                <Button size="sm" variant="outline" onClick={applyRevealAllFaces}>
                  Reveal all
                </Button>
                <Button size="sm" variant="outline" onClick={applySelectCurrentFaceSet}>
                  Select face set
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    applyFaceSelectionTransform(
                      growFaceSelection,
                      `Grow region x${Math.max(1, Math.round(faceRegionSteps))} aplicada`
                    )
                  }
                >
                  Grow region
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    applyFaceSelectionTransform(
                      shrinkFaceSelection,
                      `Shrink region x${Math.max(1, Math.round(faceRegionSteps))} aplicada`
                    )
                  }
                >
                  Shrink region
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    applyMeshOperation(
                      (currentMesh) =>
                        extrudeFaceRegion(currentMesh, safeSelectedElements, extrudeDistance),
                      `${safeSelectedElements.length} caras extruidas (${extrudeDistance.toFixed(2)})`,
                      [0]
                    )
                  }
                >
                  <Sparkles className="mr-1 h-3 w-3" />
                  Extrude
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    applyMeshOperation(
                      (currentMesh) =>
                        insetFaceRegion(currentMesh, safeSelectedElements, insetAmount),
                      `${safeSelectedElements.length} caras con inset región (${insetAmount.toFixed(2)})`,
                      [0]
                    )
                  }
                >
                  <Layers className="mr-1 h-3 w-3" />
                  Inset
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    applyMeshOperation(
                      (currentMesh) =>
                        duplicateFacesAlongNormal(currentMesh, safeSelectedElements, duplicateDistance),
                      `${safeSelectedElements.length} caras duplicadas en normal (${duplicateDistance.toFixed(2)})`,
                      [0]
                    )
                  }
                >
                  Duplicate normal
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    applyFaceOperation(
                      (currentMesh, faceIndex) => subdivideFace(currentMesh, faceIndex),
                      `${safeSelectedElements.length} caras subdivididas`
                    )
                  }
                >
                  <Scissors className="mr-1 h-3 w-3" />
                  Subdivide
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    applyFaceOperation(
                      (currentMesh, faceIndex) =>
                        knifeFace(currentMesh, faceIndex, {
                          amount: knifeAmount,
                          segments: knifeSegments,
                        }),
                      `${safeSelectedElements.length} caras cortadas con knife (${knifeAmount.toFixed(2)} / ${Math.max(1, Math.round(knifeSegments))})`
                    )
                  }
                >
                  Knife
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    applyMeshOperation(
                      (currentMesh) => ripFaces(currentMesh, safeSelectedElements),
                      `Rip aplicada a ${safeSelectedElements.length} cara(s)`,
                      safeSelectedElements
                    )
                  }
                >
                  Rip
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const result = separateFaces(mesh, safeSelectedElements);
                    if (!result.detached) {
                      setMessage('Selecciona al menos una cara para Separate.');
                      return;
                    }

                    syncMeshToSelectedEntity(
                      result.remaining,
                      `${safeSelectedElements.length} cara(s) separadas`,
                      result.remaining.faces.length > 0 ? [0] : []
                    );

                    const detachedName = `${name}_separated`;
                    createEditableEntityFromMesh(result.detached, detachedName, {
                      offsetX: 1.8,
                    });
                    setMessage(
                      `Separate aplicada: nueva entidad ${detachedName} creada al lado del mesh actual`
                    );
                  }}
                >
                  Separate
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    applyMeshOperation(
                      (currentMesh) => deleteFaces(currentMesh, safeSelectedElements),
                      `${safeSelectedElements.length} caras eliminadas`,
                      [0]
                    )
                  }
                >
                  Delete
                </Button>
              </div>

              <div className="rounded-md border border-slate-800 bg-slate-900/60 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">
                    Face Sets
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Actual: {selectedFaceSetId > 0 ? selectedFaceSetId : 'sin set'}
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-[120px,1fr]">
                  <label className="space-y-1">
                    <span className="block text-[10px] uppercase tracking-wide text-slate-500">
                      Face Set ID
                    </span>
                    <Input
                      type="number"
                      value={faceSetInput}
                      min={0}
                      max={999}
                      step={1}
                      onChange={(event) =>
                        setFaceSetInput(Math.max(0, Math.round(readNumericInput(event.target.value, faceSetInput))))
                      }
                      className="h-8 border-slate-700 bg-slate-950 text-xs"
                    />
                  </label>
                  <div className="flex flex-wrap items-end gap-2">
                    <Button size="sm" variant="outline" onClick={applyAssignFaceSet}>
                      Assign set
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setFaceSetInput(0);
                        applyMeshOperation(
                          (currentMesh) => assignFaceSet(currentMesh, safeSelectedElements, 0),
                          `Face Set limpiado en ${safeSelectedElements.length} cara(s)`,
                          safeSelectedElements
                        );
                      }}
                    >
                      Clear set
                    </Button>
                  </div>
                </div>
                <p className="mt-2 text-[11px] text-slate-500">
                  `Hide/Reveal` controla visibilidad de caras en viewport y listas. `Face Set ID`
                  permite agrupar selección de retopo y sculpt por zonas; usa `0` para limpiar.
                </p>
              </div>

              <div className="rounded-md border border-slate-800 bg-slate-900/60 p-3">
                <div className="mb-2 text-[10px] uppercase tracking-wide text-slate-500">
                  Face UV tools
                </div>
                <div className="mb-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  <label className="space-y-1">
                    <span className="block text-[10px] uppercase tracking-wide text-slate-500">
                      UV offset U
                    </span>
                    <Input
                      type="number"
                      value={uvOffsetU}
                      min={-2}
                      max={2}
                      step={0.05}
                      onChange={(event) =>
                        setUvOffsetU(readNumericInput(event.target.value, uvOffsetU))
                      }
                      className="h-8 border-slate-700 bg-slate-950 text-xs"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="block text-[10px] uppercase tracking-wide text-slate-500">
                      UV offset V
                    </span>
                    <Input
                      type="number"
                      value={uvOffsetV}
                      min={-2}
                      max={2}
                      step={0.05}
                      onChange={(event) =>
                        setUvOffsetV(readNumericInput(event.target.value, uvOffsetV))
                      }
                      className="h-8 border-slate-700 bg-slate-950 text-xs"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="block text-[10px] uppercase tracking-wide text-slate-500">
                      UV scale U
                    </span>
                    <Input
                      type="number"
                      value={uvScaleU}
                      min={0.05}
                      max={4}
                      step={0.05}
                      onChange={(event) =>
                        setUvScaleU(readNumericInput(event.target.value, uvScaleU))
                      }
                      className="h-8 border-slate-700 bg-slate-950 text-xs"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="block text-[10px] uppercase tracking-wide text-slate-500">
                      UV scale V
                    </span>
                    <Input
                      type="number"
                      value={uvScaleV}
                      min={0.05}
                      max={4}
                      step={0.05}
                      onChange={(event) =>
                        setUvScaleV(readNumericInput(event.target.value, uvScaleV))
                      }
                      className="h-8 border-slate-700 bg-slate-950 text-xs"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="block text-[10px] uppercase tracking-wide text-slate-500">
                      UV rotate
                    </span>
                    <Input
                      type="number"
                      value={uvRotation}
                      min={-360}
                      max={360}
                      step={5}
                      onChange={(event) =>
                        setUvRotation(readNumericInput(event.target.value, uvRotation))
                      }
                      className="h-8 border-slate-700 bg-slate-950 text-xs"
                    />
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      applyFaceUvOperation(
                        (currentMesh, faceIndices) =>
                          projectSelectionUvs(currentMesh, faceIndices, { axis: 'auto' }),
                        `Project UV aplicado sobre ${safeSelectedElements.length} cara(s)`
                      )
                    }
                  >
                    Project UV
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      applyMeshOperation(
                        (currentMesh) => packUvIslands(currentMesh, uvPadding),
                        `Pack islands con padding ${uvPadding.toFixed(2)}`,
                        safeSelectedElements
                      )
                    }
                  >
                    Pack islands
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      applyFaceUvOperation(
                        (currentMesh, faceIndices) =>
                          fitSelectionUvs(currentMesh, faceIndices, uvPadding),
                        `Fit UV con padding ${uvPadding.toFixed(2)}`
                      )
                    }
                  >
                    Fit UV
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      applyFaceUvOperation(
                        (currentMesh, faceIndices) =>
                          translateSelectionUvs(currentMesh, faceIndices, uvOffsetU, uvOffsetV),
                        `UV offset (${uvOffsetU.toFixed(2)}, ${uvOffsetV.toFixed(2)}) aplicado`
                      )
                    }
                  >
                    Move UV
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      applyFaceUvOperation(
                        (currentMesh, faceIndices) =>
                          scaleSelectionUvs(currentMesh, faceIndices, uvScaleU, uvScaleV),
                        `UV scale (${uvScaleU.toFixed(2)}, ${uvScaleV.toFixed(2)}) aplicado`
                      )
                    }
                  >
                    Scale UV
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      applyFaceUvOperation(
                        (currentMesh, faceIndices) =>
                          rotateSelectionUvs(currentMesh, faceIndices, uvRotation),
                        `UV rotate ${uvRotation.toFixed(0)}deg aplicado`
                      )
                    }
                  >
                    Rotate UV
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>

      <div className="mx-3 mt-2 flex flex-wrap items-center gap-2 rounded-md border border-slate-800 bg-slate-950/70 px-3 py-2">
        <div className="min-w-[160px] flex-1">
          <div className="h-1 overflow-hidden rounded-full border border-slate-800 bg-slate-950/80">
            <div
              data-testid="modeler-scroll-progress"
              data-progress={scrollProgress}
              className="h-full rounded-full bg-cyan-400/80 transition-[width] duration-150"
              style={{ width: `${scrollProgress}%` }}
              aria-label="Barra de movimiento del modelador"
            />
          </div>
        </div>
        <span className="text-[10px] text-slate-500">{scrollProgress}%</span>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[11px]"
          onClick={() => scrollToSection('top')}
        >
          Inicio
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[11px]"
          onClick={() => scrollToSection('selection')}
        >
          Seleccion
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[11px]"
          onClick={() => scrollToSection('notes')}
        >
          Ayuda
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[11px]"
          onClick={() => scrollToSection('bottom')}
        >
          Final
        </Button>
      </div>

      <ScrollArea
        className="flex-1 min-h-0"
        ref={scrollViewportRef}
        data-testid="modeler-scroll-area"
      >
        <div className="grid gap-3 p-3 lg:grid-cols-[1.1fr,0.9fr]">
          <div ref={selectionSectionRef}>
            <Card className="border-slate-800 bg-slate-950 p-3">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    {selectionLabel}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {safeSelectedElements.length} seleccionados
                  </p>
                </div>
                {editMode !== 'object' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setModelerSelection(selectableItemIds)}
                  >
                    Seleccionar todo
                  </Button>
                )}
              </div>

              {editMode === 'object' ? (
                <div className="rounded-md border border-dashed border-slate-800 bg-slate-900/50 p-4 text-sm text-slate-500">
                  Cambia a Vertex, Edge o Face para trabajar elementos concretos de la malla.
                </div>
              ) : (
                <div className="grid gap-2 md:grid-cols-2">
                  {selectableItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => toggleElement(item.id)}
                      className={cn(
                        'rounded-md border px-2 py-1.5 text-left text-[11px] transition-colors',
                        safeSelectedElements.includes(item.id)
                          ? 'border-blue-500/60 bg-blue-500/15 text-blue-100'
                          : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700'
                      )}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <div ref={notesSectionRef}>
            <Card className="border-slate-800 bg-slate-950 p-3">
              <div className="mb-3 text-xs uppercase tracking-wide text-slate-400">
                Workflow + Persistence
              </div>
              <div className="space-y-2 text-[11px] text-slate-300">
                <div>
                  `manualMesh` se sincroniza a la entidad seleccionada en vivo. El viewport recrea
                  la geometría cuando cambian vértices o caras.
                </div>
                <div>
                  `Slide / Relax / Collapse` cubren la fase anterior; ahora también hay
                  `Path select`, `Grow/Shrink region` e `Island` para navegar topología compleja.
                </div>
                <div>
                  `Slide` ya puede ir en modo `Free`, `Path` o restringido por `Axis X/Y/Z`, y
                  `Relax` preserva fronteras duras por defecto.
                </div>
                <div>
                  `Face` ahora suma `Select normal` y un bloque UV con `Project`, `Fit`, `Move`,
                  `Scale` y `Rotate` sobre la selección actual.
                </div>
                <div>
                  `Mark seam / Clear seam` viven en `Edge`; `UV island` y `Pack islands` viven en
                  `Face`, cerrando el flujo básico de corte y empaquetado UV.
                </div>
                <div>
                  `Checker preview` usa el `MeshRenderer` de la entidad y refresca el viewport en
                  vivo para revisar stretching y packing.
                </div>
                <div>
                  `Mask / Hide / Face Sets` ya viven en `Vertex / Face`: la mask protege brushes,
                  hide saca caras del viewport real y face sets agrupan zonas para retopo/sculpt.
                </div>
                <div>
                  `Material ID` aplica sobre `MeshRenderer` y ahora conversa con `Materials`,
                  donde puedes afinar PBR real sin salir del shell principal.
                </div>
                <div>
                  `Geometry Nodes Lite` ya envuelve el bloque procedural de `Object`: recipes,
                  export/import JSON y stack no destructivo para `Mirror / Array / Solidify /
                  Remesh / Decimate`.
                </div>
                <div>
                  Nota práctica: como este mesh guarda una sola `uv` por vértice, `Pack islands`
                  puede materializar seams duplicando vértices en esos bordes para separar islas.
                </div>
                <div>
                  `Guardar` persiste la malla editada como asset vía `/api/modeler/persist`.
                </div>
                <div>
                  `Crear editable` genera una entidad nueva con `MeshRenderer` custom si todavía no
                  tienes una seleccionada.
                </div>
                <div>
                  El viewport ahora permite click directo sobre `vertex / edge / face` del objeto
                  seleccionado; usa `Shift` para sumar o quitar sub-elementos.
                </div>
                <div>
                  La barra superior de este panel muestra progreso de scroll y los botones
                  `Inicio / Seleccion / Ayuda / Final` permiten navegar rápido con paneles largos.
                </div>
                {!sessionReady && !sessionChecking && (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-amber-200">
                    {MODELER_AUTH_HINT}
                  </div>
                )}
              </div>
              <div className="mt-3 rounded-md border border-slate-800 bg-slate-900/60 p-3 text-[11px] text-slate-400">
                Consejo: en `Vertex / Edge / Face` el viewport ya puede usar gizmos sobre la
                sub-selección; este panel queda para operaciones topológicas, quick actions y
                validación visual rápida de la selección.
              </div>
            </Card>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

export function ModelerPanel() {
  const { entities, editor } = useEngineStore();

  const selectedEntity =
    editor.selectedEntities.length === 1
      ? entities.get(editor.selectedEntities[0]) ?? null
      : null;
  const selectedMeshEntity =
    selectedEntity && selectedEntity.components.has('MeshRenderer') ? selectedEntity : null;
  const meshRendererData = asRecord(selectedMeshEntity?.components.get('MeshRenderer')?.data);
  const manualMesh = parseEditableMesh(
    meshRendererData?.manualMesh ?? meshRendererData?.customMesh
  );
  const meshId =
    typeof meshRendererData?.meshId === 'string' ? meshRendererData.meshId : 'cube';
  const initialMesh = manualMesh ?? createPrimitiveMesh(meshId);
  const initialName = selectedMeshEntity
    ? selectedMeshEntity.name.replace(/\s+/g, '_')
    : 'EditableMesh';

  return (
    <ModelerWorkspace
      key={selectedMeshEntity?.id ?? 'detached-modeler'}
      initialMesh={initialMesh}
      initialName={initialName}
      targetEntityId={selectedMeshEntity?.id ?? null}
      targetEntityName={selectedMeshEntity?.name ?? null}
    />
  );
}
