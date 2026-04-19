// ============================================
// Paint Panel - Vertex, Texture and Weight Paint
// ============================================

'use client';

import { useEffect, useMemo, useState } from 'react';
import { Brush } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { loadClientAuthSession } from '@/lib/client-auth-session';
import { useEngineStore } from '@/store/editorStore';
import { buildAssetFileUrl } from './assetUrls';
import {
  MATERIAL_TEXTURE_SLOTS,
  type EditorMaterialTextureSlot,
} from './editorMaterials';
import {
  createPrimitiveMesh,
  parseEditableMesh,
  sanitizeEditableMesh,
  subdivideMesh,
  type EditableMesh,
  voxelRemeshMesh,
} from './modelerMesh';
import {
  clearMeshVertexColors,
  clearMeshWeights,
  fillMeshWeights,
  mirrorMeshWeights,
  normalizeMeshWeights,
  smoothMeshWeights,
  summarizeMeshWeights,
} from './paintMesh';
import {
  downloadTexturePaint,
  persistTexturePaintAsset,
  toEngineTextureAsset,
} from './texturePaintAssets';

type PaintMode =
  | 'vertex'
  | 'texture'
  | 'weight'
  | 'sculpt_draw'
  | 'sculpt_clay'
  | 'sculpt_grab'
  | 'sculpt_smooth'
  | 'sculpt_crease';

type SelectionSummary =
  | { kind: 'none' }
  | { kind: 'multi'; count: number }
  | { kind: 'no-mesh'; entityName: string }
  | {
      kind: 'single';
      entityId: string;
      entityName: string;
      mesh: EditableMesh;
      paintedVertices: number;
      textureSlot: EditorMaterialTextureSlot;
      textureAssetPath: string | null;
      textureIsDataUrl: boolean;
      textureEnabled: boolean;
      textureUrl: string | null;
      hasUvs: boolean;
      weightBone: string;
      weightGroups: string[];
      weightSummary: ReturnType<typeof summarizeMeshWeights>;
    };

const TEXTURE_RESOLUTION_OPTIONS = [512, 1024, 2048, 4096];
const PAINT_AUTH_HINT =
  'Inicia sesion con una cuenta autorizada para guardar mapas pintados en Assets.';

const SLOT_LABELS: Record<EditorMaterialTextureSlot, string> = {
  albedo: 'Albedo',
  normal: 'Normal',
  roughness: 'Roughness',
  metallic: 'Metallic',
  emissive: 'Emissive',
  occlusion: 'Occlusion',
  alpha: 'Alpha',
};

const MODE_COPY: Record<PaintMode, { title: string; subtitle: string }> = {
  vertex: {
    title: 'Vertex Paint',
    subtitle: 'Color persistente por vertice con preview inmediata.',
  },
  texture: {
    title: 'Texture Paint',
    subtitle: 'Pinta mapas PBR reales sobre UVs y los guarda en el material.',
  },
  weight: {
    title: 'Weight Paint',
    subtitle: 'Pesa vertices por hueso con mirror, suavizado y normalizacion.',
  },
  sculpt_draw: {
    title: 'Sculpt Draw',
    subtitle: 'Empuja volumen sobre la superficie con brochazo directo.',
  },
  sculpt_clay: {
    title: 'Sculpt Clay',
    subtitle: 'Acumula masa con una respuesta mas organica para blockout.',
  },
  sculpt_grab: {
    title: 'Sculpt Grab',
    subtitle: 'Arrastra grupos de vertices para ajustar silueta rapido.',
  },
  sculpt_smooth: {
    title: 'Sculpt Smooth',
    subtitle: 'Relaja vertices y limpia bultos del sculpt.',
  },
  sculpt_crease: {
    title: 'Sculpt Crease',
    subtitle: 'Marca pliegues y tension hacia el centro del trazo.',
  },
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
}

function sanitizePaintName(value: string, fallback: string) {
  const normalized = value.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  return normalized.length > 0 ? normalized : fallback;
}

function buildTexturePaintAssetName(
  entityName: string,
  slot: EditorMaterialTextureSlot
) {
  return sanitizePaintName(`${entityName}_${slot}`, 'paint_texture');
}

function resolveMirroredWeightBone(boneName: string) {
  const normalized = boneName.trim() || 'Spine';
  if (normalized.endsWith('_L')) return `${normalized.slice(0, -2)}_R`;
  if (normalized.endsWith('_R')) return `${normalized.slice(0, -2)}_L`;
  if (normalized.endsWith('.L')) return `${normalized.slice(0, -2)}.R`;
  if (normalized.endsWith('.R')) return `${normalized.slice(0, -2)}.L`;
  if (normalized.endsWith('Left')) return `${normalized.slice(0, -4)}Right`;
  if (normalized.endsWith('Right')) return `${normalized.slice(0, -5)}Left`;
  if (normalized.endsWith('left')) return `${normalized.slice(0, -4)}right`;
  if (normalized.endsWith('right')) return `${normalized.slice(0, -5)}left`;
  return normalized;
}

function resolveEditableMesh(meshRendererData: Record<string, unknown>) {
  return (
    parseEditableMesh(meshRendererData.manualMesh ?? meshRendererData.customMesh) ??
    createPrimitiveMesh(
      typeof meshRendererData.meshId === 'string' ? meshRendererData.meshId : 'cube'
    )
  );
}

function buildMeshRendererDataWithMesh(
  meshRendererData: Record<string, unknown>,
  mesh: EditableMesh
) {
  return {
    ...meshRendererData,
    meshId: 'custom',
    manualMesh: sanitizeEditableMesh(mesh),
  };
}

function countPaintedVertices(mesh: EditableMesh) {
  return (mesh.vertexColors ?? []).reduce((count, color) => {
    if (!color) return count;
    const isPainted =
      Math.abs((color.r ?? 1) - 1) > 0.001 ||
      Math.abs((color.g ?? 1) - 1) > 0.001 ||
      Math.abs((color.b ?? 1) - 1) > 0.001 ||
      Math.abs((color.a ?? 1) - 1) > 0.001;
    return count + (isPainted ? 1 : 0);
  }, 0);
}

function updateSelectedMeshRendererData(
  entityId: string,
  updater: (meshRendererData: Record<string, unknown>) => Record<string, unknown>
) {
  const store = useEngineStore.getState();
  const entity = store.entities.get(entityId);
  if (!entity) return false;

  const meshRenderer = entity.components.get('MeshRenderer');
  if (!meshRenderer) return false;

  const meshRendererData = asRecord(meshRenderer.data) ?? {};
  const nextComponents = new Map(entity.components);
  nextComponents.set('MeshRenderer', {
    ...meshRenderer,
    data: updater(meshRendererData),
  });
  store.updateEntity(entityId, { components: nextComponents });
  return true;
}

function StatRow(props: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-[11px] text-slate-300">
      <span className="text-slate-400">{props.label}</span>
      <span>{props.value}</span>
    </div>
  );
}

function ToggleRow(props: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2">
      <div>
        <div className="text-xs text-slate-200">{props.label}</div>
        <div className="text-[11px] text-slate-500">{props.description}</div>
      </div>
      <Switch checked={props.checked} onCheckedChange={props.onCheckedChange} />
    </div>
  );
}

export function PaintPanel() {
  const {
    editor,
    entities,
    addAsset,
    projectName,
    setPaintEnabled,
    setPaintMode,
    setPaintColor,
    setPaintSize,
    setPaintStrength,
    setPaintTextureSlot,
    setPaintTextureResolution,
    setPaintWeightBone,
    setPaintWeightMirror,
    setPaintWeightSmooth,
    setPaintWeightNormalize,
    setPaintWeightErase,
    setSculptSymmetryX,
    setSculptDyntopo,
    setSculptRemeshIterations,
    setSculptMultiresLevels,
    setSculptVoxelSize,
  } = useEngineStore();
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionChecking, setSessionChecking] = useState(true);
  const [textureAssetName, setTextureAssetName] = useState('paint_texture');
  const [textureMessage, setTextureMessage] = useState('');
  const [textureSaving, setTextureSaving] = useState(false);
  const [weightMessage, setWeightMessage] = useState('');

  const active = editor.tool === 'brush' || editor.paintEnabled;
  const currentMode = (editor.paintMode ?? 'vertex') as PaintMode;

  useEffect(() => {
    let cancelled = false;

    const refreshSession = async () => {
      setSessionChecking(true);
      const payload = await loadClientAuthSession();
      if (cancelled) return;
      setSessionReady(Boolean(payload.authenticated));
      if (!cancelled) {
        setSessionChecking(false);
      }
    };

    void refreshSession();
    return () => {
      cancelled = true;
    };
  }, []);

  const selection = useMemo<SelectionSummary>(() => {
    if (editor.selectedEntities.length === 0) {
      return { kind: 'none' };
    }

    if (editor.selectedEntities.length > 1) {
      return { kind: 'multi', count: editor.selectedEntities.length };
    }

    const entityId = editor.selectedEntities[0];
    const entity = entities.get(entityId);
    if (!entity) return { kind: 'none' };

    const meshRenderer = entity.components.get('MeshRenderer');
    if (!meshRenderer) {
      return { kind: 'no-mesh', entityName: entity.name };
    }

    const meshRendererData = asRecord(meshRenderer.data) ?? {};
    const mesh = resolveEditableMesh(meshRendererData);
    const textureSlot = (editor.paintTextureSlot ?? 'albedo') as EditorMaterialTextureSlot;
    const material = asRecord(meshRendererData.material) ?? {};
    const textureMaps = asRecord(material.textureMaps) ?? {};
    const textureSlotRecord = asRecord(textureMaps[textureSlot]);
    const textureAssetPath =
      typeof textureSlotRecord?.assetPath === 'string' &&
      textureSlotRecord.assetPath.trim().length > 0
        ? textureSlotRecord.assetPath.trim()
        : null;
    const weightBone = editor.paintWeightBone ?? 'Spine';

    return {
      kind: 'single',
      entityId,
      entityName: entity.name,
      mesh,
      paintedVertices: countPaintedVertices(mesh),
      textureSlot,
      textureAssetPath,
      textureIsDataUrl: Boolean(textureAssetPath?.startsWith('data:')),
      textureEnabled: Boolean(textureSlotRecord?.enabled),
      textureUrl: buildAssetFileUrl(textureAssetPath),
      hasUvs: (mesh.uvs?.length ?? 0) === mesh.vertices.length,
      weightBone,
      weightGroups: mesh.weightGroups ?? [],
      weightSummary: summarizeMeshWeights(mesh, weightBone),
    };
  }, [
    editor.paintTextureSlot,
    editor.paintWeightBone,
    editor.selectedEntities,
    entities,
  ]);

  useEffect(() => {
    if (selection.kind !== 'single') return;
    setTextureAssetName(
      buildTexturePaintAssetName(selection.entityName, selection.textureSlot)
    );
  }, [
    selection.kind,
    selection.kind === 'single' ? selection.entityId : null,
    selection.kind === 'single' ? selection.textureSlot : null,
  ]);

  const clearVertexColors = () => {
    if (selection.kind !== 'single') return;
    updateSelectedMeshRendererData(selection.entityId, (meshRendererData) =>
      buildMeshRendererDataWithMesh(
        meshRendererData,
        clearMeshVertexColors(resolveEditableMesh(meshRendererData))
      )
    );
  };

  const clearTextureSlot = () => {
    if (selection.kind !== 'single') return;
    setTextureMessage('');
    updateSelectedMeshRendererData(selection.entityId, (meshRendererData) => {
      const material = asRecord(meshRendererData.material) ?? {};
      const textureMaps = asRecord(material.textureMaps) ?? {};
      return {
        ...meshRendererData,
        material: {
          ...material,
          textureMaps: {
            ...textureMaps,
            [selection.textureSlot]: {
              assetPath: null,
              enabled: false,
            },
          },
        },
      };
    });
  };

  const clearWeightBone = () => {
    if (selection.kind !== 'single') return;
    setWeightMessage('');
    updateSelectedMeshRendererData(selection.entityId, (meshRendererData) =>
      buildMeshRendererDataWithMesh(
        meshRendererData,
        clearMeshWeights(
          resolveEditableMesh(meshRendererData),
          editor.paintWeightBone ?? 'Spine'
        )
      )
    );
  };

  const persistTextureMap = async () => {
    if (selection.kind !== 'single' || !selection.textureUrl) return;
    if (!sessionReady) {
      setTextureMessage(PAINT_AUTH_HINT);
      return;
    }

    setTextureSaving(true);
    setTextureMessage('');
    try {
      const persistedAsset = await persistTexturePaintAsset({
        textureUrl: selection.textureUrl,
        assetName:
          textureAssetName ||
          buildTexturePaintAssetName(selection.entityName, selection.textureSlot),
        entityName: selection.entityName,
        entityId: selection.entityId,
        slot: selection.textureSlot,
        resolution: editor.paintTextureResolution ?? 1024,
        projectName,
      });

      updateSelectedMeshRendererData(selection.entityId, (meshRendererData) => {
        const material = asRecord(meshRendererData.material) ?? {};
        const textureMaps = asRecord(material.textureMaps) ?? {};
        return {
          ...meshRendererData,
          material: {
            ...material,
            textureMaps: {
              ...textureMaps,
              [selection.textureSlot]: {
                assetPath: persistedAsset.path,
                enabled: true,
              },
            },
          },
        };
      });

      addAsset(toEngineTextureAsset(persistedAsset));
      setTextureMessage(`Mapa guardado en Assets: ${persistedAsset.path}`);
    } catch (error) {
      setTextureMessage(`Error guardando mapa: ${String(error)}`);
    } finally {
      setTextureSaving(false);
    }
  };

  const exportTextureMap = async () => {
    if (selection.kind !== 'single' || !selection.textureUrl) return;
    setTextureMessage('');
    try {
      await downloadTexturePaint({
        textureUrl: selection.textureUrl,
        fileName:
          textureAssetName ||
          buildTexturePaintAssetName(selection.entityName, selection.textureSlot),
      });
      setTextureMessage('PNG exportado desde el mapa pintado actual.');
    } catch (error) {
      setTextureMessage(`Error exportando mapa: ${String(error)}`);
    }
  };

  const applyWeightOperation = (
    updater: (mesh: EditableMesh) => EditableMesh,
    message: string
  ) => {
    if (selection.kind !== 'single') return;
    updateSelectedMeshRendererData(selection.entityId, (meshRendererData) =>
      buildMeshRendererDataWithMesh(
        meshRendererData,
        updater(resolveEditableMesh(meshRendererData))
      )
    );
    setWeightMessage(message);
  };

  const fillWeightBone = () => {
    applyWeightOperation(
      (mesh) =>
        fillMeshWeights({
          mesh,
          boneName: editor.paintWeightBone ?? 'Spine',
          value: 1,
          normalize: Boolean(editor.paintWeightNormalize),
        }),
      `Grupo ${(editor.paintWeightBone ?? 'Spine').trim() || 'Spine'} rellenado al 100%.`
    );
  };

  const smoothWeightBone = () => {
    applyWeightOperation(
      (mesh) =>
        smoothMeshWeights({
          mesh,
          boneName: editor.paintWeightBone ?? 'Spine',
          normalize: Boolean(editor.paintWeightNormalize),
          iterations: 1,
          strength: 0.45,
        }),
      `Pesos suavizados para ${(editor.paintWeightBone ?? 'Spine').trim() || 'Spine'}.`
    );
  };

  const normalizeWeightGroups = () => {
    applyWeightOperation(
      (mesh) => normalizeMeshWeights(mesh),
      'Todos los pesos visibles fueron normalizados.'
    );
  };

  const mirrorWeightBone = () => {
    const activeBone = (editor.paintWeightBone ?? 'Spine').trim() || 'Spine';
    applyWeightOperation(
      (mesh) =>
        mirrorMeshWeights({
          mesh,
          boneName: activeBone,
          normalize: Boolean(editor.paintWeightNormalize),
        }),
      `Mirror aplicado de ${activeBone} a ${resolveMirroredWeightBone(activeBone)}.`
    );
  };

  const applySculptMultires = () => {
    if (selection.kind !== 'single') return;
    updateSelectedMeshRendererData(selection.entityId, (meshRendererData) =>
      buildMeshRendererDataWithMesh(
        meshRendererData,
        subdivideMesh(
          resolveEditableMesh(meshRendererData),
          editor.sculptMultiresLevels ?? 1
        )
      )
    );
  };

  const applySculptRemesh = () => {
    if (selection.kind !== 'single') return;
    updateSelectedMeshRendererData(selection.entityId, (meshRendererData) =>
      buildMeshRendererDataWithMesh(
        meshRendererData,
        voxelRemeshMesh(
          resolveEditableMesh(meshRendererData),
          editor.sculptVoxelSize ?? 0.12,
          editor.sculptRemeshIterations ?? 1
        )
      )
    );
  };

  const selectionHeader =
    selection.kind === 'single'
      ? selection.entityName
      : selection.kind === 'multi'
        ? `${selection.count} objetos seleccionados`
        : selection.kind === 'no-mesh'
          ? `${selection.entityName} sin MeshRenderer`
          : 'Sin seleccion';

  return (
    <div className="flex h-full flex-col bg-slate-900 text-slate-100">
      <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-2">
        <Brush className="h-4 w-4 text-emerald-300" />
        <div className="min-w-0">
          <h3 className="truncate text-sm font-medium">{MODE_COPY[currentMode].title}</h3>
          <p className="truncate text-[11px] text-slate-400">{MODE_COPY[currentMode].subtitle}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Badge variant={active ? 'default' : 'outline'}>
            {active ? 'Brush activo' : 'Brush inactivo'}
          </Badge>
          <Button size="sm" variant={active ? 'default' : 'outline'} onClick={() => setPaintEnabled(!active)}>
            {active ? 'Salir' : 'Activar'}
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-3 p-3">
          <Card className="space-y-2 border-slate-800 bg-slate-950 p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-xs text-slate-200">Objetivo</div>
                <div className="text-[11px] text-slate-400">{selectionHeader}</div>
              </div>
              {selection.kind === 'single' && (
                <Badge variant="outline">{selection.mesh.vertices.length} verts</Badge>
              )}
            </div>
            {selection.kind !== 'single' && (
              <div className="rounded-md border border-dashed border-slate-800 bg-slate-950/60 px-3 py-2 text-[11px] text-slate-500">
                {selection.kind === 'multi'
                  ? 'El panel de paint opera sobre una sola entidad a la vez.'
                  : 'Selecciona un mesh para habilitar resumen y acciones de limpieza.'}
              </div>
            )}
          </Card>

          <Tabs
            value={currentMode}
            onValueChange={(value) => {
              setPaintMode(value as PaintMode);
              if (!active) setPaintEnabled(true);
            }}
            className="space-y-3"
          >
            <TabsList className="flex h-auto w-full flex-wrap bg-slate-950">
              <TabsTrigger value="vertex">Vertex</TabsTrigger>
              <TabsTrigger value="texture">Texture</TabsTrigger>
              <TabsTrigger value="weight">Weight</TabsTrigger>
              <TabsTrigger value="sculpt_draw">Draw</TabsTrigger>
              <TabsTrigger value="sculpt_clay">Clay</TabsTrigger>
              <TabsTrigger value="sculpt_grab">Grab</TabsTrigger>
              <TabsTrigger value="sculpt_smooth">Smooth</TabsTrigger>
              <TabsTrigger value="sculpt_crease">Crease</TabsTrigger>
            </TabsList>

            <Card className="space-y-3 border-slate-800 bg-slate-950 p-3">
              <div className="text-xs text-slate-300">Brocha</div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span>Color</span>
                  <span className="text-slate-400">{editor.paintColor || '#ff4d6d'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="color"
                    value={editor.paintColor || '#ff4d6d'}
                    className="h-10 w-12 border-slate-700 bg-transparent p-1"
                    onChange={(event) => setPaintColor(event.target.value)}
                  />
                  <Input
                    value={editor.paintColor || '#ff4d6d'}
                    className="flex-1 border-slate-700 bg-slate-950 text-xs"
                    onChange={(event) => setPaintColor(event.target.value)}
                  />
                </div>
                {currentMode.startsWith('sculpt_') && (
                  <div className="text-[11px] text-slate-500">
                    El color no afecta sculpt; esta brochando geometria y no material.
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span>Tamano brocha</span>
                  <span className="text-slate-400">{(editor.paintSize ?? 0.5).toFixed(2)} u</span>
                </div>
                <Slider
                  value={[editor.paintSize ?? 0.5]}
                  min={0.05}
                  max={2}
                  step={0.05}
                  onValueChange={([value]) => setPaintSize(value)}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span>Fuerza</span>
                  <span className="text-slate-400">{((editor.paintStrength ?? 0.8) * 100).toFixed(0)}%</span>
                </div>
                <Slider
                  value={[editor.paintStrength ?? 0.8]}
                  min={0.05}
                  max={1}
                  step={0.01}
                  onValueChange={([value]) => setPaintStrength(value)}
                />
              </div>
            </Card>

            <TabsContent value="vertex" className="space-y-3">
              <Card className="space-y-2 border-slate-800 bg-slate-950 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-slate-200">Estado de color por vertice</div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={selection.kind !== 'single'}
                    onClick={clearVertexColors}
                  >
                    Limpiar color
                  </Button>
                </div>
                <StatRow
                  label="Vertices pintados"
                  value={
                    selection.kind === 'single'
                      ? `${selection.paintedVertices}/${selection.mesh.vertices.length}`
                      : '-'
                  }
                />
                <div className="text-[11px] text-slate-500">
                  Persiste en `manualMesh.vertexColors` y se refleja directo en el viewport.
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="texture" className="space-y-3">
              <Card className="space-y-3 border-slate-800 bg-slate-950 p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <div className="text-xs text-slate-300">Canal PBR</div>
                    <Select
                      value={(editor.paintTextureSlot ?? 'albedo') as string}
                      onValueChange={(value) =>
                        setPaintTextureSlot(value as EditorMaterialTextureSlot)
                      }
                    >
                      <SelectTrigger className="w-full border-slate-700 bg-slate-950 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MATERIAL_TEXTURE_SLOTS.map((slot) => (
                          <SelectItem key={slot} value={slot}>
                            {SLOT_LABELS[slot]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs text-slate-300">Resolucion</div>
                    <Select
                      value={String(editor.paintTextureResolution ?? 1024)}
                      onValueChange={(value) => setPaintTextureResolution(Number(value))}
                    >
                      <SelectTrigger className="w-full border-slate-700 bg-slate-950 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TEXTURE_RESOLUTION_OPTIONS.map((resolution) => (
                          <SelectItem key={resolution} value={String(resolution)}>
                            {resolution}px
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-xs text-slate-200">Mapa activo</div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={selection.kind !== 'single'}
                    onClick={clearTextureSlot}
                  >
                    Limpiar mapa
                  </Button>
                </div>

                <StatRow
                  label="Slot activo"
                  value={SLOT_LABELS[(editor.paintTextureSlot ?? 'albedo') as EditorMaterialTextureSlot]}
                />
                <StatRow
                  label="UVs"
                  value={
                    selection.kind === 'single'
                      ? selection.hasUvs
                        ? 'Disponibles'
                        : 'Se generan al pintar'
                      : '-'
                  }
                />
                <StatRow
                  label="Estado"
                  value={
                    selection.kind === 'single'
                      ? selection.textureAssetPath
                        ? selection.textureIsDataUrl
                          ? 'Mapa temporal sin persistir'
                          : selection.textureEnabled
                            ? 'Mapa persistido activo'
                            : 'Mapa persistido desactivado'
                        : 'Sin mapa pintado'
                      : '-'
                  }
                />
                <StatRow
                  label="Persistencia"
                  value={
                    selection.kind === 'single'
                      ? selection.textureAssetPath
                        ? selection.textureIsDataUrl
                          ? 'Temporal / data URL'
                          : 'Asset real'
                        : 'Sin mapa pintado'
                      : '-'
                  }
                />

                <div className="space-y-2 rounded-md border border-slate-800 bg-slate-900/50 p-2">
                  <div className="text-xs text-slate-300">Guardar mapa pintado</div>
                  <Input
                    value={textureAssetName}
                    disabled={selection.kind !== 'single'}
                    className="border-slate-700 bg-slate-950 text-xs"
                    onChange={(event) => setTextureAssetName(event.target.value)}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={
                        selection.kind !== 'single' ||
                        !selection.textureUrl ||
                        textureSaving
                      }
                      onClick={() => void exportTextureMap()}
                    >
                      Export PNG
                    </Button>
                    <Button
                      size="sm"
                      disabled={
                        selection.kind !== 'single' ||
                        !selection.textureUrl ||
                        !sessionReady ||
                        textureSaving
                      }
                      onClick={() => void persistTextureMap()}
                    >
                      {textureSaving ? 'Saving...' : 'Guardar a Assets'}
                    </Button>
                  </div>
                  {!sessionReady && !sessionChecking && (
                    <div className="text-[11px] text-slate-500">{PAINT_AUTH_HINT}</div>
                  )}
                  {textureMessage && (
                    <div className="text-[11px] text-cyan-200">{textureMessage}</div>
                  )}
                </div>

                {selection.kind === 'single' && selection.textureUrl ? (
                  <div className="overflow-hidden rounded-md border border-slate-800 bg-slate-900">
                    <img
                      src={selection.textureUrl}
                      alt={`Preview ${selection.textureSlot}`}
                      className="aspect-square w-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed border-slate-800 bg-slate-950/60 px-3 py-6 text-center text-[11px] text-slate-500">
                    El preview del mapa aparecera aqui cuando pintes el canal seleccionado.
                  </div>
                )}
              </Card>
            </TabsContent>

            <TabsContent value="weight" className="space-y-3">
              <Card className="space-y-3 border-slate-800 bg-slate-950 p-3">
                <div className="space-y-2">
                  <div className="text-xs text-slate-300">Hueso activo</div>
                  <Input
                    value={editor.paintWeightBone ?? 'Spine'}
                    className="border-slate-700 bg-slate-950 text-xs"
                    onChange={(event) => setPaintWeightBone(event.target.value)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-xs text-slate-200">Pesos del hueso</div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={selection.kind !== 'single'}
                    onClick={clearWeightBone}
                  >
                    Limpiar pesos
                  </Button>
                </div>

                <StatRow
                  label="Grupo"
                  value={
                    selection.kind === 'single'
                      ? selection.weightSummary.groupIndex >= 0
                        ? `#${selection.weightSummary.groupIndex}`
                        : 'No creado aun'
                      : '-'
                  }
                />
                <StatRow
                  label="Vertices con peso"
                  value={
                    selection.kind === 'single'
                      ? `${selection.weightSummary.nonZeroVertices}/${selection.mesh.vertices.length}`
                      : '-'
                  }
                />
                <StatRow
                  label="Peso maximo"
                  value={
                    selection.kind === 'single'
                      ? selection.weightSummary.maxWeight.toFixed(2)
                      : '-'
                  }
                />
                <StatRow
                  label="Peso promedio"
                  value={
                    selection.kind === 'single'
                      ? selection.weightSummary.averageWeight.toFixed(2)
                      : '-'
                  }
                />
                <StatRow
                  label="Mirror target"
                  value={resolveMirroredWeightBone(editor.paintWeightBone ?? 'Spine')}
                />

                <div className="flex flex-wrap gap-2">
                  {(selection.kind === 'single' ? selection.weightGroups : []).map((group) => (
                    <Badge
                      key={group}
                      variant={group === (editor.paintWeightBone ?? 'Spine') ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => {
                        setPaintWeightBone(group);
                        setWeightMessage(`Grupo activo: ${group}`);
                      }}
                    >
                      {group}
                    </Badge>
                  ))}
                  {selection.kind === 'single' && selection.weightGroups.length === 0 && (
                    <Badge variant="outline">Sin grupos todavia</Badge>
                  )}
                </div>

                <ToggleRow
                  label="Mirror X"
                  description="Replica el peso sobre el vertice espejo al otro lado del eje X."
                  checked={Boolean(editor.paintWeightMirror)}
                  onCheckedChange={setPaintWeightMirror}
                />
                <ToggleRow
                  label="Suavizar"
                  description="Promedia pesos con vecinos cercanos tras cada brochazo."
                  checked={Boolean(editor.paintWeightSmooth)}
                  onCheckedChange={setPaintWeightSmooth}
                />
                <ToggleRow
                  label="Normalizar"
                  description="Mantiene la suma de pesos por vertice dentro de rango."
                  checked={Boolean(editor.paintWeightNormalize)}
                  onCheckedChange={setPaintWeightNormalize}
                />
                <ToggleRow
                  label="Modo erase"
                  description="Resta influencia en lugar de agregarla."
                  checked={Boolean(editor.paintWeightErase)}
                  onCheckedChange={setPaintWeightErase}
                />

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={selection.kind !== 'single'}
                    onClick={fillWeightBone}
                  >
                    Fill activo
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={selection.kind !== 'single'}
                    onClick={smoothWeightBone}
                  >
                    Smooth activo
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={selection.kind !== 'single'}
                    onClick={normalizeWeightGroups}
                  >
                    Normalize all
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={selection.kind !== 'single'}
                    onClick={mirrorWeightBone}
                  >
                    Mirror activo
                  </Button>
                </div>
                {weightMessage && (
                  <div className="text-[11px] text-cyan-200">{weightMessage}</div>
                )}
              </Card>
            </TabsContent>

            {currentMode.startsWith('sculpt_') && (
              <Card className="space-y-3 border-slate-800 bg-slate-950 p-3">
                <div className="text-xs text-slate-200">Flujo de sculpt</div>
                <StatRow
                  label="Brush activo"
                  value={MODE_COPY[currentMode].title.replace('Sculpt ', '')}
                />
                <StatRow
                  label="Vertices activos"
                  value={selection.kind === 'single' ? `${selection.mesh.vertices.length}` : '-'}
                />
                <StatRow
                  label="Multires passes"
                  value={String(editor.sculptMultiresLevels ?? 1)}
                />
                <ToggleRow
                  label="Symmetry X"
                  description="Replica el brochazo al otro lado del eje X para blockout simetrico."
                  checked={Boolean(editor.sculptSymmetryX)}
                  onCheckedChange={setSculptSymmetryX}
                />
                <ToggleRow
                  label="Dyntopo proxy"
                  description="Aplica remesh editable tras el trazo para agregar detalle dinamico."
                  checked={Boolean(editor.sculptDyntopo)}
                  onCheckedChange={setSculptDyntopo}
                />

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span>Multires levels</span>
                    <span className="text-slate-400">{editor.sculptMultiresLevels ?? 1}</span>
                  </div>
                  <Select
                    value={String(editor.sculptMultiresLevels ?? 1)}
                    onValueChange={(value) => setSculptMultiresLevels(Number(value))}
                  >
                    <SelectTrigger className="w-full border-slate-700 bg-slate-950 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3].map((levels) => (
                        <SelectItem key={levels} value={String(levels)}>
                          {levels} nivel{levels > 1 ? 'es' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span>Iteraciones remesh</span>
                    <span className="text-slate-400">{editor.sculptRemeshIterations ?? 1}</span>
                  </div>
                  <Select
                    value={String(editor.sculptRemeshIterations ?? 1)}
                    onValueChange={(value) => setSculptRemeshIterations(Number(value))}
                  >
                    <SelectTrigger className="w-full border-slate-700 bg-slate-950 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3].map((iterations) => (
                        <SelectItem key={iterations} value={String(iterations)}>
                          {iterations} pasada{iterations > 1 ? 's' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span>Voxel size</span>
                    <span className="text-slate-400">{(editor.sculptVoxelSize ?? 0.12).toFixed(2)}</span>
                  </div>
                  <Slider
                    value={[editor.sculptVoxelSize ?? 0.12]}
                    min={0.03}
                    max={0.3}
                    step={0.01}
                    onValueChange={([value]) => setSculptVoxelSize(value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    disabled={selection.kind !== 'single'}
                    onClick={applySculptMultires}
                  >
                    Add detail
                  </Button>
                  <Button
                    variant="outline"
                    disabled={selection.kind !== 'single'}
                    onClick={applySculptRemesh}
                  >
                    Remesh sculpt
                  </Button>
                </div>

                <div className="text-[11px] text-slate-500">
                  Draw, clay, grab, smooth y crease ya operan en el viewport con el mismo brush.
                  `Add detail` ahora subdivide por niveles, `Remesh sculpt` usa voxel remesh configurable y `Dyntopo proxy`
                  reutiliza ese detalle durante el brochazo.
                </div>
              </Card>
            )}
          </Tabs>
        </div>
      </ScrollArea>
    </div>
  );
}
