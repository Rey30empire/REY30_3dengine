'use client';

import { useMemo, useState } from 'react';
import { useEngineStore } from '@/store/editorStore';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AUDIO_MIXER_GROUPS,
  normalizeAudioSourceData,
} from '@/engine/audio/audioSourceData';
import {
  createTerrainDataFromPreset,
  normalizeTerrainData,
  regenerateTerrainData,
  summarizeTerrainData,
  TERRAIN_PRESET_IDS,
  type TerrainPresetId,
} from '@/engine/scene/terrainAuthoring';
import {
  readCharacterBuilderSceneData,
  type CharacterBuilderSceneData,
} from '../characterBuilderSceneSync';
import { MATERIAL_PRESETS, isKnownMaterialPresetId } from '../editorMaterials';
import {
  getMaterialPresetCategoryLabel,
  getMaterialPresetRegistryEntry,
} from '../materialPresetRegistry';
import {
  PARTICLE_PRESET_CATEGORY_OPTIONS,
  PARTICLE_PRESET_REGISTRY,
  getParticlePresetCategoryLabel,
  getParticlePresetRegistryEntry,
} from '@/engine/rendering/particlePresetRegistry';
import {
  buildEntityThumbnailKey,
  createMeshRendererThumbnailEntity,
  EntityVisualThumbnail,
} from '../visualThumbnails';
import { Vector3Input, colorToHex, hexToColor } from './shared';

interface InspectorComponentEditorBodyProps {
  type: string;
  data: Record<string, unknown>;
  onChange: (data: Record<string, unknown>) => void;
}

export function InspectorComponentEditorBody({
  type,
  data,
  onChange,
}: InspectorComponentEditorBodyProps) {
  const characterBuilderSceneData =
    type === 'MeshRenderer' ? readCharacterBuilderSceneData(data.characterBuilder) : null;

  switch (type) {
    case 'Transform':
      return (
        <TransformEditor
          data={
            data as {
              position: { x: number; y: number; z: number };
              rotation: { x: number; y: number; z: number; w: number };
              scale: { x: number; y: number; z: number };
            }
          }
          onChange={onChange}
        />
      );
    case 'MeshRenderer':
      return characterBuilderSceneData ? (
        <CharacterBuilderMeshRendererEditor
          data={
            data as {
              meshId?: string;
              materialId?: string;
              castShadows?: boolean;
              receiveShadows?: boolean;
              characterBuilder?: CharacterBuilderSceneData;
            }
          }
          onChange={onChange}
        />
      ) : (
        <MeshRendererEditor
          data={
            data as {
              meshId?: string;
              materialId?: string;
              castShadows?: boolean;
              receiveShadows?: boolean;
              checkerPreview?: boolean;
              checkerScale?: number;
              manualMesh?: unknown;
              customMesh?: unknown;
              material?: Record<string, unknown>;
            }
          }
          onChange={onChange}
        />
      );
    case 'Light':
      return (
        <LightEditor
          data={
            data as {
              type: string;
              color: { r: number; g: number; b: number };
              intensity: number;
              shadows?: boolean;
            }
          }
          onChange={onChange}
        />
      );
    case 'Camera':
      return (
        <CameraEditor
          data={
            data as {
              fov: number;
              near: number;
              far: number;
              orthographic?: boolean;
              orthoSize?: number;
            }
          }
          onChange={onChange}
        />
      );
    case 'AudioSource':
      return (
        <AudioSourceEditor
          data={data}
          onChange={onChange}
        />
      );
    case 'Terrain':
      return <TerrainEditor data={data} onChange={onChange} />;
    case 'Collider':
      return (
        <ColliderEditor
          data={
            data as {
              type?: string;
              isTrigger?: boolean;
              center?: { x: number; y: number; z: number };
              size?: { x: number; y: number; z: number };
              radius?: number;
              height?: number;
            }
          }
          onChange={onChange}
        />
      );
    case 'Rigidbody':
      return (
        <RigidbodyEditor
          data={
            data as {
              mass?: number;
              drag?: number;
              angularDrag?: number;
              useGravity?: boolean;
              isKinematic?: boolean;
              velocity?: { x: number; y: number; z: number };
              angularVelocity?: { x: number; y: number; z: number };
            }
          }
          onChange={onChange}
        />
      );
    case 'ParticleSystem':
      return (
        <ParticleSystemEditor
          data={
            data as {
              presetId?: string | null;
              simulationBackend?: string | null;
              rate?: number;
              maxParticles?: number;
              burstCount?: number;
              duration?: number;
              looping?: boolean;
              shape?: string;
              radius?: number;
              speedMin?: number;
              speedMax?: number;
              direction?: string;
              lifetimeMin?: number;
              lifetimeMax?: number;
              startSizeMin?: number;
              startSizeMax?: number;
              endSizeMin?: number;
              endSizeMax?: number;
              gravity?: number;
              drag?: number;
              blendMode?: string;
              startColor?: { r: number; g: number; b: number };
              endColor?: { r: number; g: number; b: number };
              startAlpha?: number;
              endAlpha?: number;
              noiseStrength?: number;
              noiseFrequency?: number;
            }
          }
          onChange={onChange}
        />
      );
    default:
      return (
        <div className="rounded-lg border border-dashed border-slate-700 px-3 py-4 text-xs text-slate-500">
          No hay editor especializado para `{type}` todavia.
        </div>
      );
  }
}

function CharacterBuilderMeshRendererEditor({
  data,
  onChange,
}: {
  data: {
    meshId?: string;
    materialId?: string;
    castShadows?: boolean;
    receiveShadows?: boolean;
    characterBuilder?: CharacterBuilderSceneData;
  };
  onChange: (data: Record<string, unknown>) => void;
}) {
  const setActivePanel = useEngineStore((state) => state.setActivePanel);
  const focusCharacterBuilderCategory = useEngineStore(
    (state) => state.focusCharacterBuilderCategory
  );
  const characterBuilderSceneData = readCharacterBuilderSceneData(data.characterBuilder);

  const previewEntity = useMemo(
    () =>
      createMeshRendererThumbnailEntity({
        idSeed: `inspector_character_builder_${characterBuilderSceneData?.baseBodyId ?? 'empty'}`,
        name: 'Character Builder Actor',
        meshRendererData: data as Record<string, unknown>,
      }),
    [characterBuilderSceneData?.baseBodyId, data]
  );
  const previewKey = useMemo(
    () =>
      buildEntityThumbnailKey(
        previewEntity,
        `inspector-character-builder:${JSON.stringify({
          baseBodyId: characterBuilderSceneData?.baseBodyId ?? null,
          parts: characterBuilderSceneData?.parts.map((part) => ({
            category: part.category,
            partId: part.partId,
            materialVariantId: part.materialVariantId,
            colorVariantId: part.colorVariantId,
          })),
        })}`
      ),
    [characterBuilderSceneData, previewEntity]
  );

  if (!characterBuilderSceneData) {
    return (
      <div className="rounded-lg border border-dashed border-slate-700 px-3 py-4 text-xs text-slate-500">
        El payload de Character Builder no esta disponible.
      </div>
    );
  }

  const updateCharacterBuilderData = (
    updater: (current: CharacterBuilderSceneData) => CharacterBuilderSceneData
  ) => {
    onChange({
      characterBuilder: updater(characterBuilderSceneData),
    });
  };

  const openCharacterPanelForCategory = (category: string | null) => {
    setActivePanel('character');
    focusCharacterBuilderCategory(category);
  };

  const unequipPart = (category: string) => {
    if (category === 'body') return;
    openCharacterPanelForCategory(category);
    updateCharacterBuilderData((current) => ({
      ...current,
      parts: current.parts.filter((part) => part.category !== category),
    }));
  };

  const resetMaterialVariant = (category: string) => {
    openCharacterPanelForCategory(category);
    updateCharacterBuilderData((current) => ({
      ...current,
      parts: current.parts.map((part) =>
        part.category === category
          ? {
              ...part,
              materialVariantId: null,
              materialSwatch: null,
            }
          : part
      ),
    }));
  };

  const resetColorVariant = (category: string) => {
    openCharacterPanelForCategory(category);
    updateCharacterBuilderData((current) => ({
      ...current,
      parts: current.parts.map((part) =>
        part.category === category
          ? {
              ...part,
              colorVariantId: null,
              colorSwatch: null,
            }
          : part
      ),
    }));
  };

  const resetToBodyOnly = () => {
    openCharacterPanelForCategory('body');
    updateCharacterBuilderData((current) => ({
      ...current,
      parts: current.parts.filter((part) => part.category === 'body'),
    }));
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-cyan-200/80">
              Character Builder Actor
            </div>
            <div className="text-xs text-cyan-50">Sincronizado desde el panel `Character`.</div>
          </div>
          <div className="rounded-full border border-cyan-400/30 px-2 py-0.5 text-[10px] text-cyan-100">
            {characterBuilderSceneData.parts.length} pieza(s)
          </div>
        </div>

        <div className="mb-2 flex justify-end">
          <Button
            size="sm"
            variant="secondary"
            className="h-7 text-[11px]"
            onClick={() => openCharacterPanelForCategory(null)}
          >
            Abrir Character
          </Button>
        </div>

        <EntityVisualThumbnail
          entity={previewEntity}
          thumbnailKey={previewKey}
          alt="Character Builder actor preview"
          fallbackLabel="CB"
          className="h-24 w-full"
          width={208}
          height={132}
          eager
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button size="sm" variant="outline" onClick={resetToBodyOnly} className="text-[11px]">
          Solo base
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            openCharacterPanelForCategory('body');
            updateCharacterBuilderData((current) => ({
              ...current,
              parts: current.parts.map((part) => ({
                ...part,
                materialVariantId: null,
                materialSwatch: null,
                colorVariantId: null,
                colorSwatch: null,
              })),
            }));
          }}
          className="text-[11px]"
        >
          Limpiar variantes
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Base body</div>
          <div className="truncate text-xs text-slate-100">
            {characterBuilderSceneData.baseBodyId ?? 'none'}
          </div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Skeleton</div>
          <div className="truncate text-xs text-slate-100">
            {characterBuilderSceneData.skeletonId ?? 'none'}
          </div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Body type</div>
          <div className="truncate text-xs text-slate-100">
            {characterBuilderSceneData.bodyType ?? 'none'}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-slate-400">Parts</Label>
        <div className="space-y-2">
          {characterBuilderSceneData.parts.map((part) => (
            <div
              key={`${part.category}:${part.partId}`}
              className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">
                    {part.category}
                  </div>
                  <div className="truncate text-xs text-slate-100">{part.label}</div>
                  <div className="truncate text-[10px] text-slate-500">
                    {part.attachmentSocket || 'socket no definido'}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {part.materialSwatch && (
                    <span
                      className="h-3 w-3 rounded-full border border-white/10"
                      style={{ backgroundColor: part.materialSwatch }}
                      title={part.materialVariantId ?? 'material'}
                    />
                  )}
                  {part.colorSwatch && (
                    <span
                      className="h-3 w-3 rounded-full border border-white/10"
                      style={{ backgroundColor: part.colorSwatch }}
                      title={part.colorVariantId ?? 'color'}
                    />
                  )}
                </div>
              </div>
              {(part.materialVariantId || part.colorVariantId) && (
                <div className="mt-1 text-[10px] text-slate-400">
                  {part.materialVariantId ?? 'default material'}
                  {part.colorVariantId ? ` · ${part.colorVariantId}` : ''}
                </div>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                {part.category !== 'body' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => unequipPart(part.category)}
                  >
                    Unequip
                  </Button>
                )}
                {part.materialVariantId && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => resetMaterialVariant(part.category)}
                  >
                    Default material
                  </Button>
                )}
                {part.colorVariantId && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => resetColorVariant(part.category)}
                  >
                    Default color
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Label className="text-xs text-slate-400">Cast Shadows</Label>
        <Switch
          checked={data.castShadows ?? true}
          onCheckedChange={(checked) => onChange({ castShadows: checked })}
        />
      </div>

      <div className="flex items-center justify-between">
        <Label className="text-xs text-slate-400">Receive Shadows</Label>
        <Switch
          checked={data.receiveShadows ?? true}
          onCheckedChange={(checked) => onChange({ receiveShadows: checked })}
        />
      </div>

      <div className="rounded-lg border border-dashed border-slate-700 px-3 py-3 text-[11px] text-slate-500">
        La composicion y las variantes se editan desde el panel `Character`; aqui ves el actor ya
        sincronizado dentro de la escena.
      </div>
    </div>
  );
}

function TransformEditor({
  data,
  onChange,
}: {
  data: {
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number; w: number };
    scale: { x: number; y: number; z: number };
  };
  onChange: (data: Record<string, unknown>) => void;
}) {
  const axes = ['x', 'y', 'z'] as const;
  const colors = { x: 'text-red-400', y: 'text-green-400', z: 'text-blue-400' };

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs text-slate-400">Position</Label>
        <div className="grid grid-cols-3 gap-2">
          {axes.map((axis) => (
            <div key={axis} className="flex items-center gap-1">
              <span className={colors[axis]}>{axis.toUpperCase()}</span>
              <Input
                type="number"
                value={data.position[axis].toFixed(2)}
                onChange={(event) =>
                  onChange({
                    position: { ...data.position, [axis]: parseFloat(event.target.value) || 0 },
                  })
                }
                className="h-7 border-slate-700 bg-slate-900 text-xs"
                step={0.1}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-slate-400">Rotation</Label>
        <div className="grid grid-cols-3 gap-2">
          {axes.map((axis) => (
            <div key={axis} className="flex items-center gap-1">
              <span className={colors[axis]}>{axis.toUpperCase()}</span>
              <Input
                type="number"
                value={((data.rotation[axis] * 180) / Math.PI).toFixed(1)}
                onChange={(event) =>
                  onChange({
                    rotation: {
                      ...data.rotation,
                      [axis]: ((parseFloat(event.target.value) || 0) * Math.PI) / 180,
                    },
                  })
                }
                className="h-7 border-slate-700 bg-slate-900 text-xs"
                step={1}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-slate-400">Scale</Label>
        <div className="grid grid-cols-3 gap-2">
          {axes.map((axis) => (
            <div key={axis} className="flex items-center gap-1">
              <span className={colors[axis]}>{axis.toUpperCase()}</span>
              <Input
                type="number"
                value={data.scale[axis].toFixed(2)}
                onChange={(event) =>
                  onChange({
                    scale: { ...data.scale, [axis]: parseFloat(event.target.value) || 1 },
                  })
                }
                className="h-7 border-slate-700 bg-slate-900 text-xs"
                step={0.1}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MeshRendererEditor({
  data,
  onChange,
}: {
  data: {
    meshId?: string;
    materialId?: string;
    castShadows?: boolean;
    receiveShadows?: boolean;
    checkerPreview?: boolean;
    checkerScale?: number;
    manualMesh?: unknown;
    customMesh?: unknown;
    material?: Record<string, unknown>;
  };
  onChange: (data: Record<string, unknown>) => void;
}) {
  const materialSelectValue = isKnownMaterialPresetId(data.materialId) ? data.materialId! : 'custom';
  const materialPreviewSignature = JSON.stringify({
    meshId: data.meshId ?? 'cube',
    materialId: data.materialId ?? 'default',
    checkerPreview: data.checkerPreview ?? false,
    checkerScale: data.checkerScale ?? 8,
    hasManualMesh: Boolean(data.manualMesh ?? data.customMesh),
    material: data.material ?? null,
  });
  const materialPreviewEntity = useMemo(
    () =>
      createMeshRendererThumbnailEntity({
        idSeed: `inspector_current_${data.meshId ?? 'cube'}_${data.materialId ?? 'default'}`,
        name: 'Inspector Material Preview',
        meshRendererData: {
          meshId: data.meshId ?? 'cube',
          materialId: data.materialId ?? 'default',
          checkerPreview: data.checkerPreview ?? false,
          checkerScale: data.checkerScale ?? 8,
          ...(data.material ? { material: data.material } : {}),
          ...(data.manualMesh ? { manualMesh: data.manualMesh } : {}),
          ...(data.customMesh ? { customMesh: data.customMesh } : {}),
        },
      }),
    [
      data.checkerPreview,
      data.checkerScale,
      data.customMesh,
      data.manualMesh,
      data.material,
      data.materialId,
      data.meshId,
    ]
  );
  const materialPreviewKey = useMemo(
    () => buildEntityThumbnailKey(materialPreviewEntity, `inspector-current:${materialPreviewSignature}`),
    [materialPreviewEntity, materialPreviewSignature]
  );
  const materialPresetEntries = useMemo(
    () =>
      MATERIAL_PRESETS.map((preset) => {
        const previewEntity = createMeshRendererThumbnailEntity({
          idSeed: `inspector_preset_${preset.id}_${data.meshId ?? 'cube'}`,
          name: preset.name,
          meshRendererData: {
            meshId: data.meshId ?? 'cube',
            materialId: preset.id,
            material: preset,
            checkerPreview: data.checkerPreview ?? false,
            checkerScale: data.checkerScale ?? 8,
            ...(data.manualMesh ? { manualMesh: data.manualMesh } : {}),
            ...(data.customMesh ? { customMesh: data.customMesh } : {}),
          },
        });

        return {
          preset,
          previewEntity,
          previewKey: buildEntityThumbnailKey(
            previewEntity,
            `inspector-preset:${preset.id}:${materialPreviewSignature}`
          ),
        };
      }),
    [
      data.checkerPreview,
      data.checkerScale,
      data.customMesh,
      data.manualMesh,
      data.meshId,
      materialPreviewSignature,
    ]
  );

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs text-slate-400">Mesh</Label>
        <Select value={data.meshId || 'cube'} onValueChange={(value) => onChange({ meshId: value })}>
          <SelectTrigger className="h-7 border-slate-700 bg-slate-900">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border-slate-700 bg-slate-800">
            <SelectItem value="cube">Cube</SelectItem>
            <SelectItem value="sphere">Sphere</SelectItem>
            <SelectItem value="cylinder">Cylinder</SelectItem>
            <SelectItem value="plane">Plane</SelectItem>
            <SelectItem value="capsule">Capsule</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-slate-400">Material</Label>
        <EntityVisualThumbnail
          entity={materialPreviewEntity}
          thumbnailKey={materialPreviewKey}
          alt={`Material actual ${data.materialId || 'default'}`}
          fallbackLabel={(data.materialId || 'MA').slice(0, 2).toUpperCase()}
          className="h-20 w-full"
          width={176}
          height={112}
          eager
        />
        <Select
          value={materialSelectValue}
          onValueChange={(value) =>
            onChange({ materialId: value === 'custom' ? data.materialId || 'custom' : value })
          }
        >
          <SelectTrigger className="h-7 border-slate-700 bg-slate-900">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border-slate-700 bg-slate-800">
            {materialPresetEntries.map(({ preset, previewEntity, previewKey }) => (
              <SelectItem key={preset.id} value={preset.id} className="py-2">
                <div className="flex items-center gap-2">
                  <EntityVisualThumbnail
                    entity={previewEntity}
                    thumbnailKey={previewKey}
                    alt={`Preset ${preset.name}`}
                    fallbackLabel={preset.name.slice(0, 2).toUpperCase()}
                    className="h-8 w-10 shrink-0"
                    width={96}
                    height={72}
                    eager
                  />
                  <div className="min-w-0">
                    <div className="truncate">{preset.name}</div>
                    <div className="truncate text-[10px] text-slate-500">
                      {getMaterialPresetCategoryLabel(
                        getMaterialPresetRegistryEntry(preset.id)?.category ?? 'generic'
                      )}
                    </div>
                  </div>
                </div>
              </SelectItem>
            ))}
            <SelectItem value="custom">Custom</SelectItem>
          </SelectContent>
        </Select>
        {materialSelectValue === 'custom' && (
          <Input
            value={data.materialId || 'custom'}
            onChange={(event) => onChange({ materialId: event.target.value })}
            className="h-7 border-slate-700 bg-slate-900 text-xs"
            placeholder="custom_material"
          />
        )}
      </div>

      <div className="flex items-center justify-between">
        <Label className="text-xs text-slate-400">Cast Shadows</Label>
        <Switch
          checked={data.castShadows ?? true}
          onCheckedChange={(checked) => onChange({ castShadows: checked })}
        />
      </div>

      <div className="flex items-center justify-between">
        <Label className="text-xs text-slate-400">Receive Shadows</Label>
        <Switch
          checked={data.receiveShadows ?? true}
          onCheckedChange={(checked) => onChange({ receiveShadows: checked })}
        />
      </div>
    </div>
  );
}

function LightEditor({
  data,
  onChange,
}: {
  data: {
    type: string;
    color: { r: number; g: number; b: number };
    intensity: number;
    shadows?: boolean;
  };
  onChange: (data: Record<string, unknown>) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs text-slate-400">Type</Label>
        <Select value={data.type} onValueChange={(value) => onChange({ type: value })}>
          <SelectTrigger className="h-7 border-slate-700 bg-slate-900">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border-slate-700 bg-slate-800">
            <SelectItem value="directional">Directional</SelectItem>
            <SelectItem value="point">Point</SelectItem>
            <SelectItem value="spot">Spot</SelectItem>
            <SelectItem value="ambient">Ambient</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-slate-400">Intensity</Label>
        <Slider
          value={[data.intensity]}
          onValueChange={([value]) => onChange({ intensity: value })}
          min={0}
          max={10}
          step={0.1}
          className="w-full"
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-slate-400">Color</Label>
        <div className="flex gap-2">
          <Input
            type="color"
            value={colorToHex(data.color)}
            onChange={(event) => onChange({ color: hexToColor(event.target.value) })}
            className="h-7 w-10 border-0 bg-transparent p-0"
          />
          <Input
            value={`${Math.round(data.color.r * 255)}, ${Math.round(data.color.g * 255)}, ${Math.round(data.color.b * 255)}`}
            className="h-7 flex-1 border-slate-700 bg-slate-900 text-xs"
            readOnly
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Label className="text-xs text-slate-400">Shadows</Label>
        <Switch
          checked={data.shadows ?? true}
          onCheckedChange={(checked) => onChange({ shadows: checked })}
        />
      </div>
    </div>
  );
}

function CameraEditor({
  data,
  onChange,
}: {
  data: {
    fov: number;
    near: number;
    far: number;
    orthographic?: boolean;
    orthoSize?: number;
  };
  onChange: (data: Record<string, unknown>) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-slate-400">Orthographic</Label>
        <Switch
          checked={data.orthographic ?? false}
          onCheckedChange={(checked) => onChange({ orthographic: checked })}
        />
      </div>

      {!data.orthographic && (
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">FOV</Label>
          <Slider
            value={[data.fov]}
            onValueChange={([value]) => onChange({ fov: value })}
            min={10}
            max={120}
            step={1}
            className="w-full"
          />
          <span className="text-xs text-slate-500">{data.fov}°</span>
        </div>
      )}

      {data.orthographic && (
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">Ortho Size</Label>
          <Input
            type="number"
            value={data.orthoSize ?? 10}
            onChange={(event) =>
              onChange({ orthoSize: Math.max(parseFloat(event.target.value) || 10, 0.1) })
            }
            className="h-7 border-slate-700 bg-slate-900 text-xs"
            step={0.5}
            min={0.1}
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">Near</Label>
          <Input
            type="number"
            value={data.near}
            onChange={(event) => onChange({ near: parseFloat(event.target.value) || 0.1 })}
            className="h-7 border-slate-700 bg-slate-900 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">Far</Label>
          <Input
            type="number"
            value={data.far}
            onChange={(event) => onChange({ far: parseFloat(event.target.value) || 1000 })}
            className="h-7 border-slate-700 bg-slate-900 text-xs"
          />
        </div>
      </div>
    </div>
  );
}

function TerrainEditor({
  data,
  onChange,
}: {
  data: Record<string, unknown>;
  onChange: (data: Record<string, unknown>) => void;
}) {
  const terrain = normalizeTerrainData(data);

  const commitTerrain = (next: ReturnType<typeof normalizeTerrainData>) => {
    onChange(next as unknown as Record<string, unknown>);
  };

  const regenerateWithPatch = (patch: Record<string, unknown>) => {
    commitTerrain(
      regenerateTerrainData({
        ...terrain,
        ...patch,
        layers: patch.layers ?? terrain.layers,
      })
    );
  };

  const updateLayers = (
    updater: (layers: ReturnType<typeof normalizeTerrainData>['layers']) => ReturnType<typeof normalizeTerrainData>['layers']
  ) => {
    commitTerrain(
      normalizeTerrainData({
        ...terrain,
        layers: updater(terrain.layers),
      })
    );
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-100">
        {summarizeTerrainData(terrain)}
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-slate-400">Preset</Label>
        <Select
          value={terrain.preset ?? 'hills'}
          onValueChange={(value) =>
            commitTerrain(
              createTerrainDataFromPreset(value as TerrainPresetId, {
                width: terrain.width,
                depth: terrain.depth,
                segments: terrain.segments,
                layers: terrain.layers,
              })
            )
          }
        >
          <SelectTrigger className="h-7 border-slate-700 bg-slate-900">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border-slate-700 bg-slate-800">
            {TERRAIN_PRESET_IDS.map((preset) => (
              <SelectItem key={preset} value={preset}>
                {preset}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">Width</Label>
          <Input
            type="number"
            value={terrain.width}
            onChange={(event) =>
              regenerateWithPatch({
                width: Math.max(4, Number.parseFloat(event.target.value) || 4),
              })
            }
            className="h-7 border-slate-700 bg-slate-900 text-xs"
            step={1}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">Depth</Label>
          <Input
            type="number"
            value={terrain.depth}
            onChange={(event) =>
              regenerateWithPatch({
                depth: Math.max(4, Number.parseFloat(event.target.value) || 4),
              })
            }
            className="h-7 border-slate-700 bg-slate-900 text-xs"
            step={1}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">Height</Label>
          <Input
            type="number"
            value={terrain.height}
            onChange={(event) =>
              regenerateWithPatch({
                height: Math.max(1, Number.parseFloat(event.target.value) || 1),
              })
            }
            className="h-7 border-slate-700 bg-slate-900 text-xs"
            step={1}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">Segments</Label>
          <Input
            type="number"
            value={terrain.segments ?? 33}
            onChange={(event) =>
              regenerateWithPatch({
                segments: Math.max(2, Math.round(Number.parseFloat(event.target.value) || 2)),
              })
            }
            className="h-7 border-slate-700 bg-slate-900 text-xs"
            step={1}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">Scale</Label>
          <Input
            type="number"
            value={terrain.scale ?? 0.01}
            onChange={(event) =>
              regenerateWithPatch({
                scale: Math.max(0.001, Number.parseFloat(event.target.value) || 0.001),
              })
            }
            className="h-7 border-slate-700 bg-slate-900 text-xs"
            step={0.001}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">Octaves</Label>
          <Input
            type="number"
            value={terrain.octaves ?? 6}
            onChange={(event) =>
              regenerateWithPatch({
                octaves: Math.max(1, Math.round(Number.parseFloat(event.target.value) || 1)),
              })
            }
            className="h-7 border-slate-700 bg-slate-900 text-xs"
            step={1}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">Erosion</Label>
          <Input
            type="number"
            value={terrain.erosionIterations ?? 0}
            onChange={(event) =>
              regenerateWithPatch({
                erosionIterations: Math.max(
                  0,
                  Math.round(Number.parseFloat(event.target.value) || 0)
                ),
              })
            }
            className="h-7 border-slate-700 bg-slate-900 text-xs"
            step={1}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">Seed</Label>
          <Input
            type="number"
            value={terrain.seed ?? 0}
            onChange={(event) =>
              regenerateWithPatch({
                seed: Math.max(0, Math.round(Number.parseFloat(event.target.value) || 0)),
              })
            }
            className="h-7 border-slate-700 bg-slate-900 text-xs"
            step={1}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            regenerateWithPatch({
              seed: Math.round(Math.random() * 2_147_000_000),
            })
          }
        >
          Random Seed
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => commitTerrain(regenerateTerrainData(terrain))}
        >
          Regenerate
        </Button>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-slate-400">Layers</Label>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[10px]"
              onClick={() =>
                commitTerrain(
                  regenerateTerrainData({
                    ...terrain,
                    layers: [],
                  })
                )
              }
            >
              Reset
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[10px]"
              onClick={() =>
                updateLayers((layers) => [
                  ...layers,
                  {
                    id: `terrain-layer-${crypto.randomUUID()}`,
                    name: `Layer ${layers.length + 1}`,
                    textureId: `terrain-layer-${layers.length + 1}`,
                    minHeight: 0,
                    maxHeight: terrain.height,
                  },
                ])
              }
            >
              Add Layer
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          {terrain.layers.map((layer, index) => (
            <div
              key={layer.id}
              className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2"
            >
              <div className="mb-2 flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">
                  Layer {index + 1}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[10px]"
                  onClick={() =>
                    updateLayers((layers) => layers.filter((candidate) => candidate.id !== layer.id))
                  }
                >
                  Remove
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={layer.name}
                  onChange={(event) =>
                    updateLayers((layers) =>
                      layers.map((candidate) =>
                        candidate.id === layer.id
                          ? { ...candidate, name: event.target.value }
                          : candidate
                      )
                    )
                  }
                  className="h-7 border-slate-700 bg-slate-900 text-xs"
                  placeholder="Layer name"
                />
                <Input
                  value={layer.textureId}
                  onChange={(event) =>
                    updateLayers((layers) =>
                      layers.map((candidate) =>
                        candidate.id === layer.id
                          ? { ...candidate, textureId: event.target.value }
                          : candidate
                      )
                    )
                  }
                  className="h-7 border-slate-700 bg-slate-900 text-xs"
                  placeholder="texture id"
                />
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2">
                <Input
                  type="number"
                  value={layer.minHeight}
                  onChange={(event) =>
                    updateLayers((layers) =>
                      layers.map((candidate) =>
                        candidate.id === layer.id
                          ? {
                              ...candidate,
                              minHeight: Math.max(
                                0,
                                Number.parseFloat(event.target.value) || 0
                              ),
                            }
                          : candidate
                      )
                    )
                  }
                  className="h-7 border-slate-700 bg-slate-900 text-xs"
                  placeholder="min"
                  step={1}
                />
                <Input
                  type="number"
                  value={layer.maxHeight}
                  onChange={(event) =>
                    updateLayers((layers) =>
                      layers.map((candidate) =>
                        candidate.id === layer.id
                          ? {
                              ...candidate,
                              maxHeight: Math.max(
                                candidate.minHeight,
                                Number.parseFloat(event.target.value) || candidate.minHeight
                              ),
                            }
                          : candidate
                      )
                    )
                  }
                  className="h-7 border-slate-700 bg-slate-900 text-xs"
                  placeholder="max"
                  step={1}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AudioSourceEditor({
  data,
  onChange,
}: {
  data: Record<string, unknown>;
  onChange: (data: Record<string, unknown>) => void;
}) {
  const assets = useEngineStore((state) => state.assets);
  const audioAssets = useMemo(
    () =>
      assets
        .filter((asset) => asset.type === 'audio')
        .sort((left, right) => left.name.localeCompare(right.name)),
    [assets]
  );
  const normalized = normalizeAudioSourceData(data);
  const matchedAsset =
    audioAssets.find((asset) => asset.id === normalized.clipId)
    ?? audioAssets.find((asset) => asset.path === normalized.clip)
    ?? null;
  const clipSelectValue = matchedAsset
    ? matchedAsset.id
    : normalized.clip
      ? '__custom__'
      : '__none__';

  const updateClipPath = (nextPath: string) => {
    const trimmed = nextPath.trim();
    if (!trimmed) {
      onChange({ clip: null, clipId: null });
      return;
    }
    const nextAsset = audioAssets.find((asset) => asset.path === trimmed) ?? null;
    onChange({
      clip: trimmed,
      clipId: nextAsset?.id ?? null,
    });
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs text-slate-400">Audio Asset</Label>
        <Select
          value={clipSelectValue}
          onValueChange={(value) => {
            if (value === '__none__') {
              onChange({ clip: null, clipId: null });
              return;
            }
            if (value === '__custom__') {
              onChange({ clipId: null });
              return;
            }
            const asset = audioAssets.find((candidate) => candidate.id === value);
            if (!asset) return;
            onChange({
              clipId: asset.id,
              clip: asset.path,
            });
          }}
        >
          <SelectTrigger className="h-7 border-slate-700 bg-slate-900">
            <SelectValue placeholder="Selecciona un clip" />
          </SelectTrigger>
          <SelectContent className="border-slate-700 bg-slate-800">
            <SelectItem value="__none__">Sin clip</SelectItem>
            {audioAssets.map((asset) => (
              <SelectItem key={asset.id} value={asset.id}>
                {asset.name}
              </SelectItem>
            ))}
            {clipSelectValue === '__custom__' ? (
              <SelectItem value="__custom__">Clip manual</SelectItem>
            ) : null}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-slate-400">Asset Path / URL</Label>
        <Input
          value={normalized.clip ?? ''}
          onChange={(event) => updateClipPath(event.target.value)}
          placeholder="download/assets/audio/theme.ogg"
          className="h-7 border-slate-700 bg-slate-900 text-xs"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">Volume</Label>
          <Slider
            value={[normalized.volume]}
            onValueChange={([value]) => onChange({ volume: value })}
            min={0}
            max={2}
            step={0.05}
            className="w-full"
          />
          <span className="text-xs text-slate-500">{normalized.volume.toFixed(2)}</span>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">Pitch</Label>
          <Slider
            value={[normalized.pitch]}
            onValueChange={([value]) => onChange({ pitch: value })}
            min={0.1}
            max={4}
            step={0.05}
            className="w-full"
          />
          <span className="text-xs text-slate-500">{normalized.pitch.toFixed(2)}x</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2">
          <Label className="text-xs text-slate-400">Loop</Label>
          <Switch
            checked={normalized.loop}
            onCheckedChange={(checked) => onChange({ loop: checked })}
          />
        </div>
        <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2">
          <Label className="text-xs text-slate-400">Play On Start</Label>
          <Switch
            checked={normalized.playOnStart}
            onCheckedChange={(checked) => onChange({ playOnStart: checked })}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-slate-400">Mixer Group</Label>
        <Select
          value={normalized.mixerGroup}
          onValueChange={(value) => onChange({ mixerGroup: value })}
        >
          <SelectTrigger className="h-7 border-slate-700 bg-slate-900">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border-slate-700 bg-slate-800">
            {AUDIO_MIXER_GROUPS.map((group) => (
              <SelectItem key={group} value={group}>
                {group}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-slate-400">Spatial Blend</Label>
        <Slider
          value={[normalized.spatialBlend]}
          onValueChange={([value]) => onChange({ spatialBlend: value })}
          min={0}
          max={1}
          step={0.05}
          className="w-full"
        />
        <div className="text-xs text-slate-500">
          {normalized.spatialBlend === 0
            ? '2D'
            : normalized.spatialBlend === 1
              ? '3D'
              : `${Math.round(normalized.spatialBlend * 100)}% espacial`}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">Min Dist</Label>
          <Input
            type="number"
            value={normalized.minDistance}
            onChange={(event) =>
              onChange({
                minDistance: Math.max(0.05, Number.parseFloat(event.target.value) || 0.05),
              })
            }
            className="h-7 border-slate-700 bg-slate-900 text-xs"
            step={0.1}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">Max Dist</Label>
          <Input
            type="number"
            value={normalized.maxDistance}
            onChange={(event) =>
              onChange({
                maxDistance: Math.max(
                  normalized.minDistance,
                  Number.parseFloat(event.target.value) || normalized.minDistance
                ),
              })
            }
            className="h-7 border-slate-700 bg-slate-900 text-xs"
            step={0.5}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">Rolloff</Label>
          <Input
            type="number"
            value={normalized.rolloffFactor}
            onChange={(event) =>
              onChange({
                rolloffFactor: Math.max(0, Number.parseFloat(event.target.value) || 0),
              })
            }
            className="h-7 border-slate-700 bg-slate-900 text-xs"
            step={0.1}
          />
        </div>
      </div>
    </div>
  );
}

function ColliderEditor({
  data,
  onChange,
}: {
  data: {
    type?: string;
    isTrigger?: boolean;
    center?: { x: number; y: number; z: number };
    size?: { x: number; y: number; z: number };
    radius?: number;
    height?: number;
  };
  onChange: (data: Record<string, unknown>) => void;
}) {
  const colliderType = data.type ?? 'box';
  const center = data.center ?? { x: 0, y: 0, z: 0 };
  const size = data.size ?? { x: 1, y: 1, z: 1 };

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs text-slate-400">Shape</Label>
        <Select value={colliderType} onValueChange={(value) => onChange({ type: value })}>
          <SelectTrigger className="h-7 border-slate-700 bg-slate-900">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border-slate-700 bg-slate-800">
            <SelectItem value="box">Box</SelectItem>
            <SelectItem value="sphere">Sphere</SelectItem>
            <SelectItem value="capsule">Capsule</SelectItem>
            <SelectItem value="mesh">Mesh</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between">
        <Label className="text-xs text-slate-400">Trigger</Label>
        <Switch
          checked={data.isTrigger ?? false}
          onCheckedChange={(checked) => onChange({ isTrigger: checked })}
        />
      </div>

      <Vector3Input label="Center" value={center} onChange={(value) => onChange({ center: value })} />

      {(colliderType === 'box' || colliderType === 'mesh') && (
        <Vector3Input label="Size" value={size} onChange={(value) => onChange({ size: value })} />
      )}

      {(colliderType === 'sphere' || colliderType === 'capsule') && (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs text-slate-400">Radius</Label>
            <Input
              type="number"
              value={data.radius ?? 0.5}
              onChange={(event) =>
                onChange({ radius: Math.max(0.05, Number.parseFloat(event.target.value) || 0.5) })
              }
              className="h-7 border-slate-700 bg-slate-900 text-xs"
              step={0.05}
            />
          </div>
          {colliderType === 'capsule' && (
            <div className="space-y-1">
              <Label className="text-xs text-slate-400">Height</Label>
              <Input
                type="number"
                value={data.height ?? 1}
                onChange={(event) =>
                  onChange({ height: Math.max(0.1, Number.parseFloat(event.target.value) || 1) })
                }
                className="h-7 border-slate-700 bg-slate-900 text-xs"
                step={0.1}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RigidbodyEditor({
  data,
  onChange,
}: {
  data: {
    mass?: number;
    drag?: number;
    angularDrag?: number;
    useGravity?: boolean;
    isKinematic?: boolean;
    velocity?: { x: number; y: number; z: number };
    angularVelocity?: { x: number; y: number; z: number };
  };
  onChange: (data: Record<string, unknown>) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">Mass</Label>
          <Input
            type="number"
            value={data.mass ?? 1}
            onChange={(event) =>
              onChange({ mass: Math.max(0, Number.parseFloat(event.target.value) || 0) })
            }
            className="h-7 border-slate-700 bg-slate-900 text-xs"
            step={0.1}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">Drag</Label>
          <Input
            type="number"
            value={data.drag ?? 0}
            onChange={(event) =>
              onChange({ drag: Math.max(0, Number.parseFloat(event.target.value) || 0) })
            }
            className="h-7 border-slate-700 bg-slate-900 text-xs"
            step={0.01}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">Angular</Label>
          <Input
            type="number"
            value={data.angularDrag ?? 0.05}
            onChange={(event) =>
              onChange({ angularDrag: Math.max(0, Number.parseFloat(event.target.value) || 0) })
            }
            className="h-7 border-slate-700 bg-slate-900 text-xs"
            step={0.01}
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Label className="text-xs text-slate-400">Use Gravity</Label>
        <Switch
          checked={data.useGravity ?? true}
          onCheckedChange={(checked) => onChange({ useGravity: checked })}
        />
      </div>

      <div className="flex items-center justify-between">
        <Label className="text-xs text-slate-400">Kinematic</Label>
        <Switch
          checked={data.isKinematic ?? false}
          onCheckedChange={(checked) => onChange({ isKinematic: checked })}
        />
      </div>

      <Vector3Input
        label="Velocity"
        value={data.velocity ?? { x: 0, y: 0, z: 0 }}
        onChange={(value) => onChange({ velocity: value })}
      />

      <Vector3Input
        label="Angular Velocity"
        value={data.angularVelocity ?? { x: 0, y: 0, z: 0 }}
        step={0.05}
        onChange={(value) => onChange({ angularVelocity: value })}
      />
    </div>
  );
}

function ParticleSystemEditor({
  data,
  onChange,
}: {
  data: {
    presetId?: string | null;
    simulationBackend?: string | null;
    rate?: number;
    maxParticles?: number;
    burstCount?: number;
    duration?: number;
    looping?: boolean;
    shape?: string;
    radius?: number;
    speedMin?: number;
    speedMax?: number;
    direction?: string;
    lifetimeMin?: number;
    lifetimeMax?: number;
    startSizeMin?: number;
    startSizeMax?: number;
    endSizeMin?: number;
    endSizeMax?: number;
    gravity?: number;
    drag?: number;
    blendMode?: string;
    startColor?: { r: number; g: number; b: number };
    endColor?: { r: number; g: number; b: number };
    startAlpha?: number;
    endAlpha?: number;
    noiseStrength?: number;
    noiseFrequency?: number;
  };
  onChange: (data: Record<string, unknown>) => void;
}) {
  const [presetCategoryFilter, setPresetCategoryFilter] = useState<string>('all');
  const selectedPresetEntry = getParticlePresetRegistryEntry(
    typeof data.presetId === 'string' ? data.presetId : null
  );
  const selectedPresetValue = selectedPresetEntry?.id ?? '__custom__';
  const simulationBackendValue =
    data.simulationBackend === 'cpu' || data.simulationBackend === 'gpu'
      ? data.simulationBackend
      : 'auto';
  const visiblePresetEntries = useMemo(
    () =>
      PARTICLE_PRESET_REGISTRY.filter((entry) =>
        presetCategoryFilter === 'all' ? true : entry.category === presetCategoryFilter
      ),
    [presetCategoryFilter]
  );

  const toPlainColor = (color?: { r: number; g: number; b: number } | null) => ({
    r: color?.r ?? 1,
    g: color?.g ?? 1,
    b: color?.b ?? 1,
  });

  const applyParticlePreset = (presetId: string) => {
    const presetEntry = getParticlePresetRegistryEntry(presetId);
    if (!presetEntry) {
      return;
    }

    const preset = presetEntry.params;
    const lifetimeMin = Math.max(0.05, preset.lifetimeMin ?? 0.4);
    const lifetimeMax = Math.max(lifetimeMin, preset.lifetimeMax ?? 1.4);
    const looping = (preset.burstCount ?? 0) === 0 && (preset.rate ?? 0) > 0;

    onChange({
      presetId: presetEntry.id,
      rate: preset.rate ?? 24,
      maxParticles: preset.maxParticles ?? 800,
      burstCount: preset.burstCount ?? 0,
      duration: Math.max(lifetimeMax, 0.1),
      looping,
      shape: preset.shape ?? 'sphere',
      radius: preset.radius ?? 0.35,
      speedMin: preset.speedMin ?? 0.6,
      speedMax: Math.max(preset.speedMin ?? 0.6, preset.speedMax ?? 1.8),
      direction: preset.direction ?? 'up',
      lifetimeMin,
      lifetimeMax,
      startSizeMin: preset.startSizeMin ?? 0.12,
      startSizeMax: preset.startSizeMax ?? 0.24,
      endSizeMin: preset.endSizeMin ?? 0,
      endSizeMax: preset.endSizeMax ?? 0.08,
      gravity: preset.gravity ?? -0.6,
      drag: preset.drag ?? 0,
      blendMode: preset.blendMode ?? 'additive',
      startColor: toPlainColor(preset.startColor),
      endColor: toPlainColor(preset.endColor),
      startAlpha: preset.startAlpha ?? 1,
      endAlpha: preset.endAlpha ?? 0,
      noiseStrength: preset.noiseStrength ?? 0,
      noiseFrequency: preset.noiseFrequency ?? 1,
      simulationBackend: presetEntry.previewBackend,
    });
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Preset</div>
            <div className="text-xs text-slate-200">
              {selectedPresetEntry
                ? `${selectedPresetEntry.name} · ${getParticlePresetCategoryLabel(selectedPresetEntry.category)}`
                : 'Custom particle setup'}
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px]"
            onClick={() => selectedPresetEntry && applyParticlePreset(selectedPresetEntry.id)}
            disabled={!selectedPresetEntry}
          >
            Reapply preset
          </Button>
        </div>

        <div className="grid gap-2 md:grid-cols-[160px_minmax(0,1fr)]">
          <div>
            <Label className="text-xs text-slate-400">Family</Label>
            <Select value={presetCategoryFilter} onValueChange={setPresetCategoryFilter}>
              <SelectTrigger className="mt-1 h-7 border-slate-700 bg-slate-900">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-slate-700 bg-slate-800">
                <SelectItem value="all">All families</SelectItem>
                {PARTICLE_PRESET_CATEGORY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs text-slate-400">Preset</Label>
            <Select
              value={selectedPresetValue}
              onValueChange={(value) => {
                if (value === '__custom__') {
                  onChange({ presetId: null });
                  return;
                }
                applyParticlePreset(value);
              }}
            >
              <SelectTrigger className="mt-1 h-7 border-slate-700 bg-slate-900">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-slate-700 bg-slate-800">
                {visiblePresetEntries.map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>
                    {entry.name} · {getParticlePresetCategoryLabel(entry.category)}
                  </SelectItem>
                ))}
                <SelectItem value="__custom__">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-2 grid gap-2 md:grid-cols-[minmax(0,1fr)_140px]">
          <div className="text-[10px] text-slate-500">
            {visiblePresetEntries.length} de {PARTICLE_PRESET_REGISTRY.length} presets visibles
          </div>
          <div>
            <Label className="text-xs text-slate-400">Backend</Label>
            <Select
              value={simulationBackendValue}
              onValueChange={(value) => onChange({ simulationBackend: value })}
            >
              <SelectTrigger className="mt-1 h-7 border-slate-700 bg-slate-900">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-slate-700 bg-slate-800">
                <SelectItem value="auto">Auto</SelectItem>
                <SelectItem value="cpu">CPU</SelectItem>
                <SelectItem value="gpu">GPU</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Label className="text-xs text-slate-400">Looping Preview</Label>
        <Switch
          checked={data.looping ?? true}
          onCheckedChange={(checked) => onChange({ looping: checked })}
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">Rate</Label>
          <Input
            type="number"
            value={data.rate ?? 24}
            onChange={(event) =>
              onChange({ rate: Math.max(0, Number.parseFloat(event.target.value) || 0) })
            }
            className="h-7 border-slate-700 bg-slate-900 text-xs"
            step={1}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">Max</Label>
          <Input
            type="number"
            value={data.maxParticles ?? 800}
            onChange={(event) =>
              onChange({
                maxParticles: Math.max(1, Math.round(Number.parseFloat(event.target.value) || 1)),
              })
            }
            className="h-7 border-slate-700 bg-slate-900 text-xs"
            step={50}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">Duration</Label>
          <Input
            type="number"
            value={data.duration ?? 3}
            onChange={(event) =>
              onChange({ duration: Math.max(0.1, Number.parseFloat(event.target.value) || 0.1) })
            }
            className="h-7 border-slate-700 bg-slate-900 text-xs"
            step={0.1}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">Shape</Label>
          <Select value={data.shape ?? 'sphere'} onValueChange={(value) => onChange({ shape: value })}>
            <SelectTrigger className="h-7 border-slate-700 bg-slate-900">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-slate-700 bg-slate-800">
              <SelectItem value="point">Point</SelectItem>
              <SelectItem value="sphere">Sphere</SelectItem>
              <SelectItem value="cone">Cone</SelectItem>
              <SelectItem value="box">Box</SelectItem>
              <SelectItem value="circle">Circle</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">Blend</Label>
          <Select
            value={data.blendMode ?? 'additive'}
            onValueChange={(value) => onChange({ blendMode: value })}
          >
            <SelectTrigger className="h-7 border-slate-700 bg-slate-900">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-slate-700 bg-slate-800">
              <SelectItem value="additive">Additive</SelectItem>
              <SelectItem value="alpha">Alpha</SelectItem>
              <SelectItem value="multiply">Multiply</SelectItem>
              <SelectItem value="screen">Screen</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">Burst</Label>
          <Input
            type="number"
            value={data.burstCount ?? 0}
            onChange={(event) =>
              onChange({
                burstCount: Math.max(0, Math.round(Number.parseFloat(event.target.value) || 0)),
              })
            }
            className="h-7 border-slate-700 bg-slate-900 text-xs"
            step={1}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">Lifetime Min</Label>
          <Input
            type="number"
            value={data.lifetimeMin ?? Math.max((data.duration ?? 3) * 0.35, 0.2)}
            onChange={(event) =>
              onChange({
                lifetimeMin: Math.max(0.05, Number.parseFloat(event.target.value) || 0.05),
              })
            }
            className="h-7 border-slate-700 bg-slate-900 text-xs"
            step={0.05}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">Lifetime Max</Label>
          <Input
            type="number"
            value={data.lifetimeMax ?? Math.max(data.duration ?? 3, 0.3)}
            onChange={(event) =>
              onChange({
                lifetimeMax: Math.max(0.05, Number.parseFloat(event.target.value) || 0.05),
              })
            }
            className="h-7 border-slate-700 bg-slate-900 text-xs"
            step={0.05}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">Radius</Label>
          <Input
            type="number"
            value={data.radius ?? 0.35}
            onChange={(event) =>
              onChange({ radius: Math.max(0, Number.parseFloat(event.target.value) || 0) })
            }
            className="h-7 border-slate-700 bg-slate-900 text-xs"
            step={0.05}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">Speed Min</Label>
          <Input
            type="number"
            value={data.speedMin ?? 0.6}
            onChange={(event) =>
              onChange({ speedMin: Math.max(0, Number.parseFloat(event.target.value) || 0) })
            }
            className="h-7 border-slate-700 bg-slate-900 text-xs"
            step={0.1}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">Speed Max</Label>
          <Input
            type="number"
            value={data.speedMax ?? 1.8}
            onChange={(event) =>
              onChange({ speedMax: Math.max(0, Number.parseFloat(event.target.value) || 0) })
            }
            className="h-7 border-slate-700 bg-slate-900 text-xs"
            step={0.1}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">Direction</Label>
          <Select
            value={data.direction ?? 'up'}
            onValueChange={(value) => onChange({ direction: value })}
          >
            <SelectTrigger className="h-7 border-slate-700 bg-slate-900">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-slate-700 bg-slate-800">
              <SelectItem value="up">Up</SelectItem>
              <SelectItem value="down">Down</SelectItem>
              <SelectItem value="outward">Outward</SelectItem>
              <SelectItem value="forward">Forward</SelectItem>
              <SelectItem value="random">Random</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">Drag</Label>
          <Input
            type="number"
            value={data.drag ?? 0}
            onChange={(event) =>
              onChange({ drag: Math.max(0, Number.parseFloat(event.target.value) || 0) })
            }
            className="h-7 border-slate-700 bg-slate-900 text-xs"
            step={0.01}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">Start Size</Label>
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              value={data.startSizeMin ?? 0.12}
              onChange={(event) =>
                onChange({ startSizeMin: Math.max(0, Number.parseFloat(event.target.value) || 0) })
              }
              className="h-7 border-slate-700 bg-slate-900 text-xs"
              step={0.01}
            />
            <Input
              type="number"
              value={data.startSizeMax ?? 0.24}
              onChange={(event) =>
                onChange({ startSizeMax: Math.max(0, Number.parseFloat(event.target.value) || 0) })
              }
              className="h-7 border-slate-700 bg-slate-900 text-xs"
              step={0.01}
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">End Size</Label>
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              value={data.endSizeMin ?? 0}
              onChange={(event) =>
                onChange({ endSizeMin: Math.max(0, Number.parseFloat(event.target.value) || 0) })
              }
              className="h-7 border-slate-700 bg-slate-900 text-xs"
              step={0.01}
            />
            <Input
              type="number"
              value={data.endSizeMax ?? 0.08}
              onChange={(event) =>
                onChange({ endSizeMax: Math.max(0, Number.parseFloat(event.target.value) || 0) })
              }
              className="h-7 border-slate-700 bg-slate-900 text-xs"
              step={0.01}
            />
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-slate-400">Gravity</Label>
        <Input
          type="number"
          value={data.gravity ?? -0.6}
          onChange={(event) => onChange({ gravity: Number.parseFloat(event.target.value) || 0 })}
          className="h-7 border-slate-700 bg-slate-900 text-xs"
          step={0.1}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">Start Alpha</Label>
          <Input
            type="number"
            value={data.startAlpha ?? 1}
            onChange={(event) =>
              onChange({
                startAlpha: Math.max(
                  0,
                  Math.min(1, Number.parseFloat(event.target.value) || 0)
                ),
              })
            }
            className="h-7 border-slate-700 bg-slate-900 text-xs"
            step={0.05}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">End Alpha</Label>
          <Input
            type="number"
            value={data.endAlpha ?? 0}
            onChange={(event) =>
              onChange({
                endAlpha: Math.max(
                  0,
                  Math.min(1, Number.parseFloat(event.target.value) || 0)
                ),
              })
            }
            className="h-7 border-slate-700 bg-slate-900 text-xs"
            step={0.05}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">Noise Strength</Label>
          <Input
            type="number"
            value={data.noiseStrength ?? 0}
            onChange={(event) =>
              onChange({
                noiseStrength: Math.max(0, Number.parseFloat(event.target.value) || 0),
              })
            }
            className="h-7 border-slate-700 bg-slate-900 text-xs"
            step={0.05}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">Noise Frequency</Label>
          <Input
            type="number"
            value={data.noiseFrequency ?? 1}
            onChange={(event) =>
              onChange({
                noiseFrequency: Math.max(0.01, Number.parseFloat(event.target.value) || 0.01),
              })
            }
            className="h-7 border-slate-700 bg-slate-900 text-xs"
            step={0.05}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">Start Color</Label>
          <Input
            type="color"
            value={colorToHex(data.startColor)}
            onChange={(event) => onChange({ startColor: hexToColor(event.target.value) })}
            className="h-8 border-slate-700 bg-transparent"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">End Color</Label>
          <Input
            type="color"
            value={colorToHex(data.endColor)}
            onChange={(event) => onChange({ endColor: hexToColor(event.target.value) })}
            className="h-8 border-slate-700 bg-transparent"
          />
        </div>
      </div>
    </div>
  );
}
