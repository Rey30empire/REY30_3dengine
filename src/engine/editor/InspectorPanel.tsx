// ============================================
// Inspector Panel - Entity Properties
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// ============================================

'use client';

import {
  readCharacterBuilderSceneData,
  type CharacterBuilderSceneData,
} from './characterBuilderSceneSync';
import { useEngineStore } from '@/store/editorStore';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { 
  Collapsible, 
  CollapsibleContent, 
  CollapsibleTrigger 
} from '@/components/ui/collapsible';
import { ChevronDown, Settings, Component, Tag, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import type { Entity, Component as ComponentType } from '@/types/engine';
import { MATERIAL_PRESETS, isKnownMaterialPresetId } from './editorMaterials';
import {
  buildEntityThumbnailKey,
  createMeshRendererThumbnailEntity,
  EntityVisualThumbnail,
} from './visualThumbnails';

type AddableSimulationComponent = 'Collider' | 'Rigidbody' | 'ParticleSystem';

const SIMULATION_COMPONENT_DEFAULTS: Record<AddableSimulationComponent, Record<string, unknown>> = {
  Collider: {
    type: 'box',
    isTrigger: false,
    center: { x: 0, y: 0, z: 0 },
    size: { x: 1, y: 1, z: 1 },
    radius: 0.5,
    height: 1,
  },
  Rigidbody: {
    mass: 1,
    drag: 0,
    angularDrag: 0.05,
    useGravity: true,
    isKinematic: false,
    velocity: { x: 0, y: 0, z: 0 },
    angularVelocity: { x: 0, y: 0, z: 0 },
  },
  ParticleSystem: {
    rate: 24,
    maxParticles: 800,
    duration: 3,
    looping: true,
    shape: 'sphere',
    radius: 0.35,
    speedMin: 0.6,
    speedMax: 1.8,
    startSizeMin: 0.12,
    startSizeMax: 0.24,
    endSizeMin: 0,
    endSizeMax: 0.08,
    gravity: -0.6,
    blendMode: 'additive',
    startColor: { r: 1, g: 0.78, b: 0.22 },
    endColor: { r: 1, g: 0.24, b: 0.08 },
  },
};

function colorToHex(color?: { r?: number; g?: number; b?: number }) {
  const clampChannel = (value: number | undefined) =>
    Math.max(0, Math.min(255, Math.round((value ?? 1) * 255)));
  return `#${clampChannel(color?.r).toString(16).padStart(2, '0')}${clampChannel(color?.g).toString(16).padStart(2, '0')}${clampChannel(color?.b).toString(16).padStart(2, '0')}`;
}

function hexToColor(hex: string) {
  const normalized = hex.startsWith('#') ? hex.slice(1) : hex;
  return {
    r: parseInt(normalized.slice(0, 2), 16) / 255,
    g: parseInt(normalized.slice(2, 4), 16) / 255,
    b: parseInt(normalized.slice(4, 6), 16) / 255,
  };
}

function Vector3Input({
  label,
  value,
  step = 0.1,
  onChange,
}: {
  label: string;
  value: { x: number; y: number; z: number };
  step?: number;
  onChange: (value: { x: number; y: number; z: number }) => void;
}) {
  const axes = ['x', 'y', 'z'] as const;
  const axisClasses = { x: 'text-red-400', y: 'text-green-400', z: 'text-blue-400' };

  return (
    <div className="space-y-1">
      <Label className="text-xs text-slate-400">{label}</Label>
      <div className="grid grid-cols-3 gap-2">
        {axes.map((axis) => (
          <div key={axis} className="flex items-center gap-1">
            <span className={cn('text-xs w-3', axisClasses[axis])}>{axis.toUpperCase()}</span>
            <Input
              type="number"
              value={value[axis]}
              onChange={(event) =>
                onChange({
                  ...value,
                  [axis]: Number.parseFloat(event.target.value) || 0,
                })
              }
              className="h-7 text-xs bg-slate-900 border-slate-700"
              step={step}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export function InspectorPanel() {
  const { entities, editor, updateEntity, removeEntity } = useEngineStore();
  const [expandedComponents, setExpandedComponents] = useState<Set<string>>(new Set(['Transform']));

  const selectedEntity = editor.selectedEntities.length === 1
    ? entities.get(editor.selectedEntities[0])
    : null;

  if (editor.selectedEntities.length === 0) {
    return (
      <div className="flex flex-col h-full bg-slate-800/50">
        <div className="px-3 py-2 border-b border-slate-700">
          <h3 className="text-sm font-medium text-slate-200">Inspector</h3>
        </div>
        <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
          No object selected
        </div>
      </div>
    );
  }

  if (editor.selectedEntities.length > 1) {
    return (
      <div className="flex flex-col h-full bg-slate-800/50">
        <div className="px-3 py-2 border-b border-slate-700">
          <h3 className="text-sm font-medium text-slate-200">Inspector</h3>
        </div>
        <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
          {editor.selectedEntities.length} objects selected
        </div>
      </div>
    );
  }

  if (!selectedEntity) return null;

  const toggleComponent = (type: string) => {
    const newExpanded = new Set(expandedComponents);
    if (newExpanded.has(type)) {
      newExpanded.delete(type);
    } else {
      newExpanded.add(type);
    }
    setExpandedComponents(newExpanded);
  };

  const handleNameChange = (name: string) => {
    updateEntity(selectedEntity.id, { name });
  };

  const handleTransformChange = (field: string, axis: string, value: number) => {
    const transform = selectedEntity.components.get('Transform');
    if (!transform) return;

    const data = transform.data as Record<string, Record<string, number>>;
    if (field === 'position' || field === 'rotation' || field === 'scale') {
      data[field][axis] = value;
      updateEntity(selectedEntity.id, {
        components: new Map(selectedEntity.components),
      });
    }
  };

  const addSimulationComponent = (type: AddableSimulationComponent) => {
    if (selectedEntity.components.has(type)) return;
    const nextComponents = new Map(selectedEntity.components);
    nextComponents.set(type, {
      id: crypto.randomUUID(),
      type,
      enabled: true,
      data: structuredClone(SIMULATION_COMPONENT_DEFAULTS[type]),
    });
    updateEntity(selectedEntity.id, { components: nextComponents });
    setExpandedComponents((current) => new Set([...current, type]));
  };

  return (
    <div className="flex flex-col h-full bg-slate-800/50">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700">
        <h3 className="text-sm font-medium text-slate-200">Inspector</h3>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-red-400 hover:text-red-300"
          onClick={() => removeEntity(selectedEntity.id)}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {/* Entity Header */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label className="text-xs text-slate-400">Name</Label>
            </div>
            <Input
              value={selectedEntity.name}
              onChange={(e) => handleNameChange(e.target.value)}
              className="h-8 bg-slate-900 border-slate-700"
            />
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label className="text-xs text-slate-400">Tags</Label>
            <div className="flex flex-wrap gap-1">
              {selectedEntity.tags.map(tag => (
                <span
                  key={tag}
                  className="px-2 py-0.5 text-xs bg-slate-700 text-slate-300 rounded"
                >
                  {tag}
                </span>
              ))}
              <button className="px-2 py-0.5 text-xs border border-dashed border-slate-600 text-slate-400 rounded hover:border-slate-500">
                + Add Tag
              </button>
            </div>
          </div>

          {/* Active Toggle */}
          <div className="flex items-center justify-between">
            <Label className="text-xs text-slate-400">Active</Label>
            <Switch
              checked={selectedEntity.active}
              onCheckedChange={(checked) => updateEntity(selectedEntity.id, { active: checked })}
            />
          </div>

          {/* Components */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-slate-400">Components</Label>
              <span className="text-[10px] uppercase tracking-wide text-slate-500">
                Simulation ready
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {(['Collider', 'Rigidbody', 'ParticleSystem'] as const).map((componentType) => {
                const exists = selectedEntity.components.has(componentType);
                return (
                  <Button
                    key={componentType}
                    variant={exists ? 'secondary' : 'outline'}
                    size="sm"
                    className="h-7 text-[11px]"
                    onClick={() => addSimulationComponent(componentType)}
                    disabled={exists}
                  >
                    {exists ? `${componentType} listo` : `Add ${componentType}`}
                  </Button>
                );
              })}
            </div>

            {Array.from(selectedEntity.components.entries()).map(([type, component]) => (
              <ComponentEditor
                key={type}
                type={type}
                component={component}
                isExpanded={expandedComponents.has(type)}
                onToggle={() => toggleComponent(type)}
                onChange={(data) => {
                  component.data = { ...component.data, ...data };
                  updateEntity(selectedEntity.id, {
                    components: new Map(selectedEntity.components),
                  });
                }}
              />
            ))}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

// Component Editor
interface ComponentEditorProps {
  type: string;
  component: ComponentType;
  isExpanded: boolean;
  onToggle: () => void;
  onChange: (data: Record<string, unknown>) => void;
}

function ComponentEditor({ type, component, isExpanded, onToggle, onChange }: ComponentEditorProps) {
  const data = component.data as Record<string, unknown>;
  const characterBuilderSceneData =
    type === 'MeshRenderer' ? readCharacterBuilderSceneData(data.characterBuilder) : null;

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <CollapsibleTrigger className="flex items-center justify-between w-full px-2 py-1.5 bg-slate-700/50 hover:bg-slate-700 rounded text-left">
        <div className="flex items-center gap-2">
          <Component className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-sm text-slate-200">
            {type}
            {characterBuilderSceneData ? ' · CharacterBuilder3D' : ''}
          </span>
        </div>
        <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform", isExpanded && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-2 py-2 space-y-3">
        {type === 'Transform' && (
          <TransformEditor data={data as { position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number; w: number }; scale: { x: number; y: number; z: number } }} onChange={onChange} />
        )}
        {type === 'MeshRenderer' && (
          characterBuilderSceneData ? (
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
            <MeshRendererEditor data={data as { meshId?: string; materialId?: string; castShadows?: boolean; receiveShadows?: boolean }} onChange={onChange} />
          )
        )}
        {type === 'Light' && (
          <LightEditor data={data as { type: string; color: { r: number; g: number; b: number }; intensity: number; shadows?: boolean }} onChange={onChange} />
        )}
        {type === 'Camera' && (
          <CameraEditor data={data as { fov: number; near: number; far: number; orthographic?: boolean; orthoSize?: number }} onChange={onChange} />
        )}
        {type === 'Collider' && (
          <ColliderEditor
            data={data as {
              type?: string;
              isTrigger?: boolean;
              center?: { x: number; y: number; z: number };
              size?: { x: number; y: number; z: number };
              radius?: number;
              height?: number;
            }}
            onChange={onChange}
          />
        )}
        {type === 'Rigidbody' && (
          <RigidbodyEditor
            data={data as {
              mass?: number;
              drag?: number;
              angularDrag?: number;
              useGravity?: boolean;
              isKinematic?: boolean;
              velocity?: { x: number; y: number; z: number };
              angularVelocity?: { x: number; y: number; z: number };
            }}
            onChange={onChange}
          />
        )}
        {type === 'ParticleSystem' && (
          <ParticleSystemEditor
            data={data as {
              rate?: number;
              maxParticles?: number;
              duration?: number;
              looping?: boolean;
              shape?: string;
              radius?: number;
              speedMin?: number;
              speedMax?: number;
              startSizeMin?: number;
              startSizeMax?: number;
              endSizeMin?: number;
              endSizeMax?: number;
              gravity?: number;
              blendMode?: string;
              startColor?: { r: number; g: number; b: number };
              endColor?: { r: number; g: number; b: number };
            }}
            onChange={onChange}
          />
        )}
      </CollapsibleContent>
    </Collapsible>
  );
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
  const characterBuilderSceneData =
    readCharacterBuilderSceneData(data.characterBuilder);

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
            <div className="text-xs text-cyan-50">
              Sincronizado desde el panel `Character`.
            </div>
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
        <Button
          size="sm"
          variant="outline"
          onClick={resetToBodyOnly}
          className="text-[11px]"
        >
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

// Transform Editor
function TransformEditor({ 
  data, 
  onChange 
}: { 
  data: { position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number; w: number }; scale: { x: number; y: number; z: number } };
  onChange: (data: Record<string, unknown>) => void;
}) {
  const axes = ['x', 'y', 'z'] as const;
  const colors = { x: 'text-red-400', y: 'text-green-400', z: 'text-blue-400' };

  return (
    <div className="space-y-3">
      {/* Position */}
      <div className="space-y-1">
        <Label className="text-xs text-slate-400">Position</Label>
        <div className="grid grid-cols-3 gap-2">
          {axes.map(axis => (
            <div key={axis} className="flex items-center gap-1">
              <span className={cn("text-xs w-3", colors[axis])}>{axis.toUpperCase()}</span>
              <Input
                type="number"
                value={data.position[axis].toFixed(2)}
                onChange={(e) => onChange({
                  position: { ...data.position, [axis]: parseFloat(e.target.value) || 0 }
                })}
                className="h-7 text-xs bg-slate-900 border-slate-700"
                step={0.1}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Rotation */}
      <div className="space-y-1">
        <Label className="text-xs text-slate-400">Rotation</Label>
        <div className="grid grid-cols-3 gap-2">
          {axes.map(axis => (
            <div key={axis} className="flex items-center gap-1">
              <span className={cn("text-xs w-3", colors[axis])}>{axis.toUpperCase()}</span>
              <Input
                type="number"
                value={(data.rotation[axis] * 180 / Math.PI).toFixed(1)}
                onChange={(e) => onChange({
                  rotation: { ...data.rotation, [axis]: parseFloat(e.target.value) * Math.PI / 180 || 0 }
                })}
                className="h-7 text-xs bg-slate-900 border-slate-700"
                step={1}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Scale */}
      <div className="space-y-1">
        <Label className="text-xs text-slate-400">Scale</Label>
        <div className="grid grid-cols-3 gap-2">
          {axes.map(axis => (
            <div key={axis} className="flex items-center gap-1">
              <span className={cn("text-xs w-3", colors[axis])}>{axis.toUpperCase()}</span>
              <Input
                type="number"
                value={data.scale[axis].toFixed(2)}
                onChange={(e) => onChange({
                  scale: { ...data.scale, [axis]: parseFloat(e.target.value) || 1 }
                })}
                className="h-7 text-xs bg-slate-900 border-slate-700"
                step={0.1}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Mesh Renderer Editor
function MeshRendererEditor({ 
  data, 
  onChange 
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
  const materialSelectValue = isKnownMaterialPresetId(data.materialId)
    ? data.materialId!
    : 'custom';
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
    () =>
      buildEntityThumbnailKey(
        materialPreviewEntity,
        `inspector-current:${materialPreviewSignature}`
      ),
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
        <Select value={data.meshId || 'cube'} onValueChange={(v) => onChange({ meshId: v })}>
          <SelectTrigger className="h-7 bg-slate-900 border-slate-700">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
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
          onValueChange={(v) =>
            onChange({
              materialId: v === 'custom' ? data.materialId || 'custom' : v,
            })
          }
        >
          <SelectTrigger className="h-7 bg-slate-900 border-slate-700">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
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
                  <span>{preset.name}</span>
                </div>
              </SelectItem>
            ))}
            <SelectItem value="custom">Custom</SelectItem>
          </SelectContent>
        </Select>
        {materialSelectValue === 'custom' && (
          <Input
            value={data.materialId || 'custom'}
            onChange={(e) => onChange({ materialId: e.target.value })}
            className="h-7 text-xs bg-slate-900 border-slate-700"
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

// Light Editor
function LightEditor({ 
  data, 
  onChange 
}: { 
  data: { type: string; color: { r: number; g: number; b: number }; intensity: number; shadows?: boolean };
  onChange: (data: Record<string, unknown>) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs text-slate-400">Type</Label>
        <Select value={data.type} onValueChange={(v) => onChange({ type: v })}>
          <SelectTrigger className="h-7 bg-slate-900 border-slate-700">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
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
          onValueChange={([v]) => onChange({ intensity: v })}
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
            value={`#${Math.round(data.color.r * 255).toString(16).padStart(2, '0')}${Math.round(data.color.g * 255).toString(16).padStart(2, '0')}${Math.round(data.color.b * 255).toString(16).padStart(2, '0')}`}
            onChange={(e) => {
              const hex = e.target.value.slice(1);
              onChange({
                color: {
                  r: parseInt(hex.slice(0, 2), 16) / 255,
                  g: parseInt(hex.slice(2, 4), 16) / 255,
                  b: parseInt(hex.slice(4, 6), 16) / 255,
                }
              });
            }}
            className="w-10 h-7 p-0 bg-transparent border-0"
          />
          <Input
            value={`${Math.round(data.color.r * 255)}, ${Math.round(data.color.g * 255)}, ${Math.round(data.color.b * 255)}`}
            className="h-7 text-xs bg-slate-900 border-slate-700 flex-1"
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

// Camera Editor
function CameraEditor({ 
  data, 
  onChange 
}: { 
  data: { fov: number; near: number; far: number; orthographic?: boolean; orthoSize?: number };
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
            onValueChange={([v]) => onChange({ fov: v })}
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
            onChange={(e) => onChange({ orthoSize: Math.max(parseFloat(e.target.value) || 10, 0.1) })}
            className="h-7 text-xs bg-slate-900 border-slate-700"
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
            onChange={(e) => onChange({ near: parseFloat(e.target.value) || 0.1 })}
            className="h-7 text-xs bg-slate-900 border-slate-700"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">Far</Label>
          <Input
            type="number"
            value={data.far}
            onChange={(e) => onChange({ far: parseFloat(e.target.value) || 1000 })}
            className="h-7 text-xs bg-slate-900 border-slate-700"
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
          <SelectTrigger className="h-7 bg-slate-900 border-slate-700">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
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
              onChange={(event) => onChange({ radius: Math.max(0.05, Number.parseFloat(event.target.value) || 0.5) })}
              className="h-7 text-xs bg-slate-900 border-slate-700"
              step={0.05}
            />
          </div>
          {colliderType === 'capsule' && (
            <div className="space-y-1">
              <Label className="text-xs text-slate-400">Height</Label>
              <Input
                type="number"
                value={data.height ?? 1}
                onChange={(event) => onChange({ height: Math.max(0.1, Number.parseFloat(event.target.value) || 1) })}
                className="h-7 text-xs bg-slate-900 border-slate-700"
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
            onChange={(event) => onChange({ mass: Math.max(0, Number.parseFloat(event.target.value) || 0) })}
            className="h-7 text-xs bg-slate-900 border-slate-700"
            step={0.1}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">Drag</Label>
          <Input
            type="number"
            value={data.drag ?? 0}
            onChange={(event) => onChange({ drag: Math.max(0, Number.parseFloat(event.target.value) || 0) })}
            className="h-7 text-xs bg-slate-900 border-slate-700"
            step={0.01}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">Angular</Label>
          <Input
            type="number"
            value={data.angularDrag ?? 0.05}
            onChange={(event) => onChange({ angularDrag: Math.max(0, Number.parseFloat(event.target.value) || 0) })}
            className="h-7 text-xs bg-slate-900 border-slate-700"
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
    rate?: number;
    maxParticles?: number;
    duration?: number;
    looping?: boolean;
    shape?: string;
    radius?: number;
    speedMin?: number;
    speedMax?: number;
    startSizeMin?: number;
    startSizeMax?: number;
    endSizeMin?: number;
    endSizeMax?: number;
    gravity?: number;
    blendMode?: string;
    startColor?: { r: number; g: number; b: number };
    endColor?: { r: number; g: number; b: number };
  };
  onChange: (data: Record<string, unknown>) => void;
}) {
  return (
    <div className="space-y-3">
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
            onChange={(event) => onChange({ rate: Math.max(0, Number.parseFloat(event.target.value) || 0) })}
            className="h-7 text-xs bg-slate-900 border-slate-700"
            step={1}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">Max</Label>
          <Input
            type="number"
            value={data.maxParticles ?? 800}
            onChange={(event) => onChange({ maxParticles: Math.max(1, Math.round(Number.parseFloat(event.target.value) || 1)) })}
            className="h-7 text-xs bg-slate-900 border-slate-700"
            step={50}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">Duration</Label>
          <Input
            type="number"
            value={data.duration ?? 3}
            onChange={(event) => onChange({ duration: Math.max(0.1, Number.parseFloat(event.target.value) || 0.1) })}
            className="h-7 text-xs bg-slate-900 border-slate-700"
            step={0.1}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">Shape</Label>
          <Select value={data.shape ?? 'sphere'} onValueChange={(value) => onChange({ shape: value })}>
            <SelectTrigger className="h-7 bg-slate-900 border-slate-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
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
          <Select value={data.blendMode ?? 'additive'} onValueChange={(value) => onChange({ blendMode: value })}>
            <SelectTrigger className="h-7 bg-slate-900 border-slate-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
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
          <Label className="text-xs text-slate-400">Radius</Label>
          <Input
            type="number"
            value={data.radius ?? 0.35}
            onChange={(event) => onChange({ radius: Math.max(0, Number.parseFloat(event.target.value) || 0) })}
            className="h-7 text-xs bg-slate-900 border-slate-700"
            step={0.05}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">Speed Min</Label>
          <Input
            type="number"
            value={data.speedMin ?? 0.6}
            onChange={(event) => onChange({ speedMin: Math.max(0, Number.parseFloat(event.target.value) || 0) })}
            className="h-7 text-xs bg-slate-900 border-slate-700"
            step={0.1}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">Speed Max</Label>
          <Input
            type="number"
            value={data.speedMax ?? 1.8}
            onChange={(event) => onChange({ speedMax: Math.max(0, Number.parseFloat(event.target.value) || 0) })}
            className="h-7 text-xs bg-slate-900 border-slate-700"
            step={0.1}
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
              onChange={(event) => onChange({ startSizeMin: Math.max(0, Number.parseFloat(event.target.value) || 0) })}
              className="h-7 text-xs bg-slate-900 border-slate-700"
              step={0.01}
            />
            <Input
              type="number"
              value={data.startSizeMax ?? 0.24}
              onChange={(event) => onChange({ startSizeMax: Math.max(0, Number.parseFloat(event.target.value) || 0) })}
              className="h-7 text-xs bg-slate-900 border-slate-700"
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
              onChange={(event) => onChange({ endSizeMin: Math.max(0, Number.parseFloat(event.target.value) || 0) })}
              className="h-7 text-xs bg-slate-900 border-slate-700"
              step={0.01}
            />
            <Input
              type="number"
              value={data.endSizeMax ?? 0.08}
              onChange={(event) => onChange({ endSizeMax: Math.max(0, Number.parseFloat(event.target.value) || 0) })}
              className="h-7 text-xs bg-slate-900 border-slate-700"
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
          className="h-7 text-xs bg-slate-900 border-slate-700"
          step={0.1}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">Start Color</Label>
          <Input
            type="color"
            value={colorToHex(data.startColor)}
            onChange={(event) => onChange({ startColor: hexToColor(event.target.value) })}
            className="h-8 bg-transparent border-slate-700"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-400">End Color</Label>
          <Input
            type="color"
            value={colorToHex(data.endColor)}
            onChange={(event) => onChange({ endColor: hexToColor(event.target.value) })}
            className="h-8 bg-transparent border-slate-700"
          />
        </div>
      </div>
    </div>
  );
}
