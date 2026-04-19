'use client';

import { useCallback, useEffect, useMemo, useState, type DragEvent } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { loadClientAuthSession } from '@/lib/client-auth-session';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useEngineStore } from '@/store/editorStore';
import {
  MATERIAL_TEXTURE_SLOTS,
  getMaterialPreset,
  hexToMaterialColor,
  materialColorToHex,
  resolveEditorMaterial,
  sanitizeMaterialDefinition,
  type EditorMaterialDefinition,
  type EditorMaterialTextureSlot,
} from './editorMaterials';
import {
  MATERIAL_PRESET_CATEGORY_OPTIONS,
  MATERIAL_PRESET_REGISTRY,
  getMaterialPresetCategoryLabel,
  type MaterialPresetCategory,
} from './materialPresetRegistry';
import { buildAssetFileUrl } from './assetUrls';
import {
  buildEntityThumbnailKey,
  createMeshRendererThumbnailEntity,
  EntityVisualThumbnail,
} from './visualThumbnails';
import { ImagePlus, Palette, RotateCcw, Sparkles } from 'lucide-react';

interface AvailableTextureAsset {
  id: string;
  name: string;
  path: string;
}

interface MaterialLibraryItem {
  name: string;
  path: string;
  projectKey: string;
  scope: 'project' | 'shared';
  definition: EditorMaterialDefinition;
}

interface AuthSessionPayload {
  authenticated?: boolean;
}

const MATERIAL_AUTH_HINT =
  'Inicia sesion con una cuenta autorizada para guardar o cargar librerias del proyecto.';

type MaterialPresetCategoryFilter = 'all' | MaterialPresetCategory;

function parseMaterialLibraryItems(payload: unknown): MaterialLibraryItem[] {
  return Array.isArray((payload as { materials?: unknown[] })?.materials)
    ? ((payload as { materials: Array<Record<string, unknown>> }).materials ?? [])
        .map((entry) => {
          const definition = sanitizeMaterialDefinition(entry?.definition);
          const projectKey = typeof entry?.projectKey === 'string' ? entry.projectKey : '';
          const path = typeof entry?.path === 'string' ? entry.path : '';
          const name = typeof entry?.name === 'string' ? entry.name : 'material';
          const scope = entry?.scope === 'shared' ? 'shared' : 'project';
          if (!definition || !path) return null;
          return {
            name,
            path,
            projectKey,
            scope,
            definition,
          } satisfies MaterialLibraryItem;
        })
        .filter((entry): entry is MaterialLibraryItem => Boolean(entry))
    : [];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
}

function slotLabel(slot: EditorMaterialTextureSlot) {
  switch (slot) {
    case 'albedo':
      return 'Base Color';
    case 'normal':
      return 'Normal';
    case 'roughness':
      return 'Roughness';
    case 'metallic':
      return 'Metallic';
    case 'emissive':
      return 'Emissive';
    case 'occlusion':
      return 'Occlusion';
    case 'alpha':
      return 'Alpha';
    default:
      return slot;
  }
}

function mapTextureAssets(payload: unknown): AvailableTextureAsset[] {
  if (!Array.isArray((payload as { assets?: unknown[] })?.assets)) {
    return [];
  }

  return ((payload as { assets: Array<Record<string, unknown>> }).assets ?? [])
    .filter((asset) => asset?.type === 'texture')
    .map((asset) => ({
      id: String(asset.id ?? crypto.randomUUID()),
      name: String(asset.name ?? 'Texture'),
      path: String(asset.path ?? ''),
    }))
    .filter((asset) => asset.path.length > 0);
}

export function MaterialEditor() {
  const { entities, editor, updateEntity, assets, projectName } = useEngineStore();
  const [remoteTextureAssets, setRemoteTextureAssets] = useState<AvailableTextureAsset[]>([]);
  const [libraryMaterials, setLibraryMaterials] = useState<MaterialLibraryItem[]>([]);
  const [libraryName, setLibraryName] = useState('material');
  const [libraryScope, setLibraryScope] = useState<'project' | 'shared'>('project');
  const [libraryMessage, setLibraryMessage] = useState('');
  const [presetCategoryFilter, setPresetCategoryFilter] =
    useState<MaterialPresetCategoryFilter>('all');
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionChecking, setSessionChecking] = useState(true);

  const selectedEntity =
    editor.selectedEntities.length === 1
      ? entities.get(editor.selectedEntities[0]) ?? null
      : null;
  const meshRenderer = selectedEntity?.components.get('MeshRenderer') ?? null;
  const meshRendererData = asRecord(meshRenderer?.data);
  const materialOverride = asRecord(meshRendererData?.material);
  const material = resolveEditorMaterial(meshRendererData);
  const materialId =
    typeof meshRendererData?.materialId === 'string'
      ? meshRendererData.materialId
      : 'default';
  const armedTextureAsset =
    editor.selectedAsset
      ? assets.find(
          (asset) => asset.id === editor.selectedAsset && asset.type === 'texture'
        ) ?? null
      : null;

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

  const loadMaterialLibrary = useCallback(async () => {
    const response = await fetch('/api/materials', {
      cache: 'no-store',
      headers: { 'x-rey30-project': projectName || 'untitled_project' },
    });
    if (!response.ok) {
      return [];
    }
    const payload = await response.json().catch(() => ({}));
    return parseMaterialLibraryItems(payload);
  }, [projectName]);

  useEffect(() => {
    let cancelled = false;

    const loadTextureAssets = async () => {
      if (sessionChecking) return;
      if (!sessionReady) {
        if (!cancelled) {
          setRemoteTextureAssets([]);
        }
        return;
      }

      try {
        const response = await fetch('/api/assets', { cache: 'no-store' });
        if (!response.ok) return;
        const payload = await response.json().catch(() => ({}));
        if (!cancelled) {
          setRemoteTextureAssets(mapTextureAssets(payload));
        }
      } catch {
        if (!cancelled) {
          setRemoteTextureAssets([]);
        }
      }
    };

    void loadTextureAssets();
    return () => {
      cancelled = true;
    };
  }, [sessionChecking, sessionReady]);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      if (sessionChecking) return;
      if (!sessionReady) {
        if (!cancelled) {
          setLibraryMaterials([]);
        }
        return;
      }

      try {
        const entries = await loadMaterialLibrary();
        if (!cancelled) {
          setLibraryMaterials(entries);
        }
      } catch {
        if (!cancelled) {
          setLibraryMaterials([]);
        }
      }
    };

    void refresh();
    return () => {
      cancelled = true;
    };
  }, [loadMaterialLibrary, sessionChecking, sessionReady]);

  const textureAssets = useMemo(() => {
    const merged = new Map<string, AvailableTextureAsset>();

    assets
      .filter((asset) => asset.type === 'texture')
      .forEach((asset) => {
        merged.set(asset.path, {
          id: asset.id,
          name: asset.name,
          path: asset.path,
        });
      });

    remoteTextureAssets.forEach((asset) => {
      if (!merged.has(asset.path)) {
        merged.set(asset.path, asset);
      }
    });

    return Array.from(merged.values()).sort((left, right) =>
      left.name.localeCompare(right.name)
    );
  }, [assets, remoteTextureAssets]);

  const materialPresetEntries = useMemo(
    () =>
      MATERIAL_PRESET_REGISTRY.map((registryEntry) => {
        const preset = getMaterialPreset(registryEntry.id);
        const thumbnailEntity = createMeshRendererThumbnailEntity({
          idSeed: `material_preset_${preset.id}`,
          name: preset.name,
          meshRendererData: {
            meshId: 'sphere',
            materialId: preset.id,
            material: preset,
          },
        });
        return {
          preset,
          registryEntry,
          thumbnailEntity,
          thumbnailKey: buildEntityThumbnailKey(
            thumbnailEntity,
            `material-preset:${preset.id}`
          ),
        };
      }),
    []
  );

  const visibleMaterialPresetEntries = useMemo(
    () =>
      materialPresetEntries.filter(({ registryEntry }) =>
        presetCategoryFilter === 'all'
          ? true
          : registryEntry.category === presetCategoryFilter
      ),
    [materialPresetEntries, presetCategoryFilter]
  );

  const libraryMaterialEntries = useMemo(
    () =>
      libraryMaterials.map((entry) => {
        const thumbnailMaterialId =
          typeof entry.definition.id === 'string' && entry.definition.id.trim().length > 0
            ? entry.definition.id
            : 'default';
        const thumbnailEntity = createMeshRendererThumbnailEntity({
          idSeed: `material_library_${entry.path}`,
          name: entry.name,
          meshRendererData: {
            meshId: 'sphere',
            materialId: thumbnailMaterialId,
            material: entry.definition,
          },
        });
        return {
          entry,
          thumbnailEntity,
          thumbnailKey: buildEntityThumbnailKey(
            thumbnailEntity,
            `material-library:${entry.path}`
          ),
        };
      }),
    [libraryMaterials]
  );

  if (!selectedEntity || !meshRenderer) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-900 p-6 text-center text-sm text-slate-500">
        Selecciona una entidad con `MeshRenderer` para editar un material real del viewport.
      </div>
    );
  }

  const patchMaterial = (patch: Record<string, unknown>) => {
    const nextComponents = new Map(selectedEntity.components);
    nextComponents.set('MeshRenderer', {
      ...meshRenderer,
      data: {
        ...(meshRendererData ?? {}),
        materialId,
        material: {
          ...(materialOverride ?? {}),
          ...patch,
        },
      },
    });
    updateEntity(selectedEntity.id, { components: nextComponents });
  };

  const patchTextureMap = (
    slot: EditorMaterialTextureSlot,
    assetPath: string | null
  ) => {
    const nextTextureMaps = {
      ...(asRecord(materialOverride?.textureMaps) ?? {}),
      [slot]: {
        assetPath: assetPath && assetPath.trim().length > 0 ? assetPath.trim() : null,
        enabled: Boolean(assetPath && assetPath.trim().length > 0),
      },
    };
    patchMaterial({ textureMaps: nextTextureMaps });
  };

  const patchTextureTransform = (patch: Record<string, number>) => {
    patchMaterial({
      textureTransform: {
        ...(asRecord(materialOverride?.textureTransform) ?? {}),
        ...patch,
      },
    });
  };

  const refreshMaterialLibrary = async () => {
    try {
      setLibraryMaterials(await loadMaterialLibrary());
      setLibraryMessage('Biblioteca sincronizada.');
    } catch {
      setLibraryMessage('No se pudo refrescar la biblioteca de materiales.');
    }
  };

  const saveCurrentMaterialToLibrary = async () => {
    if (!sessionReady) {
      setLibraryMessage(MATERIAL_AUTH_HINT);
      return;
    }
    const response = await fetch('/api/materials', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-rey30-project': projectName || 'untitled_project',
      },
      body: JSON.stringify({
        name: libraryName.trim() || materialId || 'material',
        scope: libraryScope,
        material,
      }),
    });
    if (!response.ok) {
      setLibraryMessage('No se pudo guardar el material en servidor.');
      return;
    }
    const payload = (await response.json().catch(() => ({}))) as {
      scope?: 'project' | 'shared';
      projectKey?: string;
    };
    await refreshMaterialLibrary();
    setLibraryMessage(
      payload.scope === 'shared'
        ? 'Material guardado en Shared library.'
        : `Material guardado para proyecto ${payload.projectKey || projectName || 'actual'}.`
    );
  };

  const deleteLibraryMaterial = async (entry: MaterialLibraryItem) => {
    if (!sessionReady) {
      setLibraryMessage(MATERIAL_AUTH_HINT);
      return;
    }
    const deleteWithScopeResponse = await fetch(
      `/api/materials?name=${encodeURIComponent(entry.name)}&scope=${entry.scope}`,
      {
        method: 'DELETE',
        headers: {
          'x-rey30-project': projectName || 'untitled_project',
        },
      }
    );
    if (!deleteWithScopeResponse.ok) {
      setLibraryMessage('No se pudo eliminar el material de servidor.');
      return;
    }
    await refreshMaterialLibrary();
    setLibraryMessage(`Material eliminado: ${entry.name}`);
  };

  const applyLibraryMaterial = (definition: EditorMaterialDefinition) => {
    const nextMaterialId = definition.id || materialId;
    const nextComponents = new Map(selectedEntity.components);
    nextComponents.set('MeshRenderer', {
      ...meshRenderer,
      data: {
        ...(meshRendererData ?? {}),
        materialId: nextMaterialId,
        material: {
          ...definition,
        },
      },
    });
    updateEntity(selectedEntity.id, { components: nextComponents });
    setLibraryMessage('Material de biblioteca aplicado al objeto seleccionado.');
  };

  const applyTextureAssetToSlot = (
    slot: EditorMaterialTextureSlot,
    assetPath: string | null
  ) => {
    patchTextureMap(slot, assetPath);
  };

  const handleTextureDrop = (
    event: DragEvent<HTMLDivElement>,
    slot: EditorMaterialTextureSlot
  ) => {
    event.preventDefault();
    const raw = event.dataTransfer.getData('asset');
    if (!raw) return;

    try {
      const asset = JSON.parse(raw) as {
        type?: string;
        path?: string;
      };
      if (asset.type !== 'texture' || typeof asset.path !== 'string') {
        return;
      }
      applyTextureAssetToSlot(slot, asset.path);
    } catch {
      // Ignore invalid drags from outside the asset browser.
    }
  };

  const applyPreset = (nextMaterialId: string) => {
    const preset = getMaterialPreset(nextMaterialId);
    const nextComponents = new Map(selectedEntity.components);
    nextComponents.set('MeshRenderer', {
      ...meshRenderer,
      data: {
        ...(meshRendererData ?? {}),
        materialId: nextMaterialId,
        material: {
          albedoColor: preset.albedoColor,
          metallic: preset.metallic,
          roughness: preset.roughness,
          normalIntensity: preset.normalIntensity,
          emissiveColor: preset.emissiveColor,
          emissiveIntensity: preset.emissiveIntensity,
          occlusionStrength: preset.occlusionStrength,
          alphaCutoff: preset.alphaCutoff,
          doubleSided: preset.doubleSided,
          transparent: preset.transparent,
          textureMaps: preset.textureMaps,
          textureTransform: preset.textureTransform,
          weightedNormalsEnabled: preset.weightedNormalsEnabled,
          weightedNormalsStrength: preset.weightedNormalsStrength,
          weightedNormalsKeepSharp: preset.weightedNormalsKeepSharp,
        },
      },
    });
    updateEntity(selectedEntity.id, { components: nextComponents });
  };

  return (
    <div className="flex h-full flex-col bg-slate-900 text-slate-100">
      <div className="border-b border-slate-800 px-3 py-2">
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4 text-amber-300" />
          <div>
            <h3 className="text-sm font-medium">Material Editor</h3>
            <p className="text-[11px] text-slate-400">
              Editando el material real de `{selectedEntity.name}`.
            </p>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-3 p-3">
          <Card className="border-slate-800 bg-slate-950 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Preset</p>
                <p className="text-xs text-slate-300">Material ID actual: {materialId}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                onClick={() => applyPreset(materialId)}
              >
                <RotateCcw className="mr-1 h-3 w-3" />
                Reset preset
              </Button>
            </div>
            <div className="mb-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_180px]">
              <div className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2">
                <p className="text-[11px] text-slate-300">
                  {visibleMaterialPresetEntries.length} de {materialPresetEntries.length} presets
                  visibles
                </p>
                <p className="text-[10px] text-slate-500">
                  Filtra por familia para navegar materiales reales del viewport.
                </p>
              </div>
              <div>
                <Label className="text-[11px] text-slate-500">Category</Label>
                <Select
                  value={presetCategoryFilter}
                  onValueChange={(value) =>
                    setPresetCategoryFilter(
                      value === 'all' ? 'all' : (value as MaterialPresetCategory)
                    )
                  }
                >
                  <SelectTrigger className="mt-1 h-8 border-slate-700 bg-slate-950 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-slate-700 bg-slate-900">
                    <SelectItem value="all">All categories</SelectItem>
                    {MATERIAL_PRESET_CATEGORY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="mb-3 grid grid-cols-2 gap-2 xl:grid-cols-3">
              {visibleMaterialPresetEntries.map(
                ({ preset, registryEntry, thumbnailEntity, thumbnailKey }) => (
                <Button
                  key={preset.id}
                  size="sm"
                  variant={materialId === preset.id ? 'default' : 'outline'}
                  className="h-auto flex-col items-start gap-1 px-2 py-2"
                  onClick={() => applyPreset(preset.id)}
                >
                  <EntityVisualThumbnail
                    entity={thumbnailEntity}
                    thumbnailKey={thumbnailKey}
                    alt={`Material ${preset.name}`}
                    fallbackLabel={preset.name.slice(0, 2).toUpperCase()}
                    className="h-16 w-full"
                    width={160}
                    height={96}
                  />
                  <span className="w-full truncate text-left text-[11px]">{preset.name}</span>
                  <span className="w-full truncate text-left text-[10px] text-slate-500">
                    {getMaterialPresetCategoryLabel(registryEntry.category)}
                  </span>
                </Button>
              )
              )}
            </div>
            <Label className="text-[11px] text-slate-500">Material ID</Label>
            <Input
              value={materialId}
              onChange={(event) => {
                const nextComponents = new Map(selectedEntity.components);
                nextComponents.set('MeshRenderer', {
                  ...meshRenderer,
                  data: {
                    ...(meshRendererData ?? {}),
                    materialId: event.target.value.trim() || 'default',
                    material: {
                      ...(materialOverride ?? {}),
                    },
                  },
                });
                updateEntity(selectedEntity.id, { components: nextComponents });
              }}
              className="mt-1 h-8 border-slate-700 bg-slate-950 text-xs"
            />
          </Card>

          <Card className="border-slate-800 bg-slate-950 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Library</p>
                <p className="text-xs text-slate-300">
                  Guarda y reaplica materiales persistentes por proyecto en servidor.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                onClick={() => void refreshMaterialLibrary()}
              >
                Refresh
              </Button>
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Label className="text-[11px] text-slate-500">Library Name</Label>
                <Input
                  value={libraryName}
                  onChange={(event) => setLibraryName(event.target.value)}
                  className="mt-1 h-8 border-slate-700 bg-slate-950 text-xs"
                />
              </div>
              <div className="w-36">
                <Label className="text-[11px] text-slate-500">Scope</Label>
                <Select
                  value={libraryScope}
                  onValueChange={(value) =>
                    setLibraryScope(value === 'shared' ? 'shared' : 'project')
                  }
                >
                  <SelectTrigger className="mt-1 h-8 border-slate-700 bg-slate-950 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-slate-700 bg-slate-900">
                    <SelectItem value="project">
                      Proyecto ({projectName || 'untitled_project'})
                    </SelectItem>
                    <SelectItem value="shared">Shared</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="sm"
                onClick={() => void saveCurrentMaterialToLibrary()}
                disabled={!sessionReady}
              >
                Save
              </Button>
            </div>
            {!sessionReady && !sessionChecking && (
              <p className="mt-2 text-[11px] text-slate-500">{MATERIAL_AUTH_HINT}</p>
            )}
            {libraryMessage && (
              <p className="mt-2 text-[11px] text-cyan-200">{libraryMessage}</p>
            )}
            <div className="mt-3 space-y-2">
              {libraryMaterials.length === 0 ? (
                <p className="text-[11px] text-slate-500">
                  No hay materiales guardados todavia.
                </p>
              ) : (
                libraryMaterialEntries.map(({ entry, thumbnailEntity, thumbnailKey }) => (
                  <div
                    key={entry.path}
                    className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-900/60 p-2"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <EntityVisualThumbnail
                        entity={thumbnailEntity}
                        thumbnailKey={thumbnailKey}
                        alt={`Material guardado ${entry.name}`}
                        fallbackLabel={entry.name.slice(0, 2).toUpperCase()}
                        className="h-11 w-14 shrink-0"
                        width={128}
                        height={96}
                      />
                      <div className="min-w-0">
                        <div className="truncate text-xs text-slate-200">{entry.name}</div>
                        <div className="truncate text-[10px] text-slate-500">
                          {entry.scope === 'project'
                            ? `Proyecto: ${entry.projectKey}`
                            : 'Shared library'}{' '}
                          · {entry.path}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => applyLibraryMaterial(entry.definition)}
                      >
                        Apply
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!sessionReady}
                        onClick={() => void deleteLibraryMaterial(entry)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card className="border-slate-800 bg-slate-950 p-3">
            <div className="mb-2 flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-cyan-300" />
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Surface</p>
            </div>

            <div className="space-y-3">
              <div>
                <Label className="text-[11px] text-slate-400">Albedo</Label>
                <div className="mt-1 flex items-center gap-2">
                  <Input
                    type="color"
                    value={materialColorToHex(material.albedoColor)}
                    onChange={(event) =>
                      patchMaterial({
                        albedoColor: hexToMaterialColor(
                          event.target.value,
                          material.albedoColor.a
                        ),
                      })
                    }
                    className="h-9 w-12 border-0 bg-transparent p-1"
                  />
                  <Input
                    value={materialColorToHex(material.albedoColor)}
                    onChange={(event) =>
                      patchMaterial({
                        albedoColor: hexToMaterialColor(
                          event.target.value,
                          material.albedoColor.a
                        ),
                      })
                    }
                    className="h-8 border-slate-700 bg-slate-900 text-xs"
                  />
                </div>
              </div>

              <SliderField
                label="Metallic"
                value={material.metallic}
                min={0}
                max={1}
                step={0.01}
                onChange={(value) => patchMaterial({ metallic: value })}
              />

              <SliderField
                label="Roughness"
                value={material.roughness}
                min={0}
                max={1}
                step={0.01}
                onChange={(value) => patchMaterial({ roughness: value })}
              />

              <SliderField
                label="Normal Intensity"
                value={material.normalIntensity}
                min={0}
                max={4}
                step={0.05}
                onChange={(value) => patchMaterial({ normalIntensity: value })}
              />
            </div>
          </Card>

          <Card className="border-slate-800 bg-slate-950 p-3">
            <div className="mb-2 flex items-center gap-2">
              <ImagePlus className="h-3.5 w-3.5 text-emerald-300" />
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Texture Maps</p>
            </div>

            <div className="mb-3 rounded-md border border-slate-800 bg-slate-900/60 p-2 text-[11px] text-slate-400">
              {armedTextureAsset ? (
                <div className="space-y-2">
                  <div>
                    Asset armado desde `Assets`: <span className="text-slate-200">{armedTextureAsset.name}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => applyTextureAssetToSlot('albedo', armedTextureAsset.path)}
                    >
                      To Base Color
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => applyTextureAssetToSlot('normal', armedTextureAsset.path)}
                    >
                      To Normal
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => applyTextureAssetToSlot('roughness', armedTextureAsset.path)}
                    >
                      To Roughness
                    </Button>
                  </div>
                </div>
              ) : (
                <span>
                  Selecciona una textura en `Assets` o arrástrala sobre cualquier slot.
                </span>
              )}
            </div>

            <div className="space-y-3">
              {MATERIAL_TEXTURE_SLOTS.map((slot) => {
                const map = material.textureMaps[slot];
                const currentPath = map.assetPath ?? '';
                const previewUrl = currentPath ? buildAssetFileUrl(currentPath) : '';

                return (
                  <div
                    key={slot}
                    className="rounded-md border border-slate-800 bg-slate-900/60 p-2"
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => handleTextureDrop(event, slot)}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <Label className="text-[11px] text-slate-300">{slotLabel(slot)}</Label>
                      {previewUrl && slot === 'albedo' && (
                        <img
                          src={previewUrl}
                          alt={currentPath}
                          className="h-8 w-8 rounded border border-slate-700 object-cover"
                        />
                      )}
                    </div>
                    <Select
                      value={currentPath || '__none__'}
                      onValueChange={(value) =>
                        patchTextureMap(slot, value === '__none__' ? null : value)
                      }
                    >
                      <SelectTrigger className="h-8 border-slate-700 bg-slate-950 text-xs">
                        <SelectValue placeholder="Sin textura" />
                      </SelectTrigger>
                      <SelectContent className="border-slate-700 bg-slate-900">
                        <SelectItem value="__none__">Sin textura</SelectItem>
                        {textureAssets.map((asset) => (
                          <SelectItem key={asset.path} value={asset.path}>
                            {asset.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      value={currentPath}
                      onChange={(event) => patchTextureMap(slot, event.target.value)}
                      placeholder="download/assets/texture/mi_textura.png"
                      className="mt-2 h-8 border-slate-700 bg-slate-950 text-xs"
                    />
                  </div>
                );
              })}
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  patchMaterial({
                    textureMaps: MATERIAL_TEXTURE_SLOTS.reduce(
                      (maps, slot) => ({
                        ...maps,
                        [slot]: { assetPath: null, enabled: false },
                      }),
                      {}
                    ),
                  })
                }
              >
                Clear all maps
              </Button>
            </div>
          </Card>

          <Card className="border-slate-800 bg-slate-950 p-3">
            <p className="mb-2 text-[10px] uppercase tracking-wide text-slate-500">Texture Transform</p>
            <div className="grid gap-3 md:grid-cols-2">
              <SliderField
                label="Repeat U"
                value={material.textureTransform.repeatU}
                min={0.05}
                max={8}
                step={0.05}
                onChange={(value) => patchTextureTransform({ repeatU: value })}
              />
              <SliderField
                label="Repeat V"
                value={material.textureTransform.repeatV}
                min={0.05}
                max={8}
                step={0.05}
                onChange={(value) => patchTextureTransform({ repeatV: value })}
              />
              <SliderField
                label="Offset U"
                value={material.textureTransform.offsetU}
                min={-2}
                max={2}
                step={0.01}
                onChange={(value) => patchTextureTransform({ offsetU: value })}
              />
              <SliderField
                label="Offset V"
                value={material.textureTransform.offsetV}
                min={-2}
                max={2}
                step={0.01}
                onChange={(value) => patchTextureTransform({ offsetV: value })}
              />
              <SliderField
                label="Rotation"
                value={material.textureTransform.rotation}
                min={-180}
                max={180}
                step={1}
                onChange={(value) => patchTextureTransform({ rotation: value })}
              />
            </div>
          </Card>

          <Card className="border-slate-800 bg-slate-950 p-3">
            <p className="mb-2 text-[10px] uppercase tracking-wide text-slate-500">Emission + Alpha</p>
            <div className="space-y-3">
              <div>
                <Label className="text-[11px] text-slate-400">Emissive</Label>
                <div className="mt-1 flex items-center gap-2">
                  <Input
                    type="color"
                    value={materialColorToHex(material.emissiveColor)}
                    onChange={(event) =>
                      patchMaterial({
                        emissiveColor: hexToMaterialColor(event.target.value, 1),
                      })
                    }
                    className="h-9 w-12 border-0 bg-transparent p-1"
                  />
                  <Input
                    value={materialColorToHex(material.emissiveColor)}
                    onChange={(event) =>
                      patchMaterial({
                        emissiveColor: hexToMaterialColor(event.target.value, 1),
                      })
                    }
                    className="h-8 border-slate-700 bg-slate-900 text-xs"
                  />
                </div>
              </div>

              <SliderField
                label="Emissive Intensity"
                value={material.emissiveIntensity}
                min={0}
                max={8}
                step={0.1}
                onChange={(value) => patchMaterial({ emissiveIntensity: value })}
              />

              <SliderField
                label="Opacity"
                value={material.albedoColor.a}
                min={0.05}
                max={1}
                step={0.01}
                onChange={(value) =>
                  patchMaterial({
                    albedoColor: {
                      ...material.albedoColor,
                      a: value,
                    },
                  })
                }
              />

              <SliderField
                label="Alpha Cutoff"
                value={material.alphaCutoff}
                min={0}
                max={1}
                step={0.01}
                onChange={(value) => patchMaterial({ alphaCutoff: value })}
              />
            </div>
          </Card>

          <Card className="border-slate-800 bg-slate-950 p-3">
            <p className="mb-2 text-[10px] uppercase tracking-wide text-slate-500">Rendering</p>
            <div className="space-y-3">
              <SliderField
                label="Occlusion Strength"
                value={material.occlusionStrength}
                min={0}
                max={1}
                step={0.01}
                onChange={(value) => patchMaterial({ occlusionStrength: value })}
              />

              <SliderField
                label="Weighted Normals"
                value={material.weightedNormalsStrength}
                min={0}
                max={4}
                step={0.05}
                onChange={(value) => patchMaterial({ weightedNormalsStrength: value })}
              />

              <ToggleField
                label="Weighted Normals Enabled"
                value={material.weightedNormalsEnabled}
                onChange={(value) => patchMaterial({ weightedNormalsEnabled: value })}
              />

              <ToggleField
                label="Keep Sharp Edges"
                value={material.weightedNormalsKeepSharp}
                onChange={(value) => patchMaterial({ weightedNormalsKeepSharp: value })}
              />

              <ToggleField
                label="Transparent"
                value={material.transparent}
                onChange={(value) => patchMaterial({ transparent: value })}
              />

              <ToggleField
                label="Double Sided"
                value={material.doubleSided}
                onChange={(value) => patchMaterial({ doubleSided: value })}
              />
            </div>
          </Card>
        </div>
      </ScrollArea>
    </div>
  );
}

function SliderField(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  const { label, value, min, max, step, onChange } = props;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <Label className="text-[11px] text-slate-400">{label}</Label>
        <span className="text-[11px] text-slate-500">{value.toFixed(2)}</span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([next]) => onChange(next)}
      />
    </div>
  );
}

function ToggleField(props: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const { label, value, onChange } = props;

  return (
    <div className="flex items-center justify-between">
      <Label className="text-[11px] text-slate-400">{label}</Label>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}
