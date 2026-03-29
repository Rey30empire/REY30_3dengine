'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  Suspense,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Canvas } from '@react-three/fiber';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  CharacterLibraryBuilder,
  CHARACTER_CATEGORY_LABELS,
  CHARACTER_PART_CATEGORIES,
  type CharacterBuilderActionResult,
  type CharacterBuilderSnapshot,
  type CharacterPartCategory,
} from '@/engine/character-builder';
import { createCharacterBuilderEditorAdapter } from './characterBuilderEditorAdapter';
import {
  buildCharacterBuilderPresetFromSceneData,
  buildCharacterBuilderSceneData,
  buildCharacterBuilderSceneSignature,
  findCharacterBuilderSceneEntity,
  readCharacterBuilderSceneDataFromEntity,
  syncCharacterBuilderSnapshotToStore,
} from './characterBuilderSceneSync';
import { cn } from '@/lib/utils';
import { useEngineStore } from '@/store/editorStore';
import {
  Cuboid,
  Dices,
  Grip,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

type PreviewModelSpec = {
  key: string;
  path: string;
  category: CharacterPartCategory;
  label: string;
  materialSwatch: string | null;
  colorSwatch: string | null;
};

function parsePreviewColor(swatch: string | null | undefined) {
  if (!swatch || swatch.trim().length === 0) return null;
  try {
    return new THREE.Color(swatch);
  } catch {
    return null;
  }
}

function clonePreviewMaterial(
  material: THREE.Material,
  materialSwatch: string | null | undefined,
  colorSwatch: string | null | undefined
) {
  const nextMaterial = material.clone();
  const materialColor = parsePreviewColor(materialSwatch);
  const accentColor = parsePreviewColor(colorSwatch);

  if ('color' in nextMaterial && nextMaterial.color && materialColor) {
    (nextMaterial.color as THREE.Color).lerp(materialColor, 0.72);
  }

  if ('emissive' in nextMaterial && nextMaterial.emissive && accentColor) {
    (nextMaterial.emissive as THREE.Color).copy(accentColor);
    if ('emissiveIntensity' in nextMaterial && typeof nextMaterial.emissiveIntensity === 'number') {
      nextMaterial.emissiveIntensity = Math.max(nextMaterial.emissiveIntensity, 0.18);
    }
  }

  return nextMaterial;
}

function LoadedPreviewModel({ spec }: { spec: PreviewModelSpec }) {
  const gltf = useGLTF(spec.path);
  const scene = useMemo(() => {
    const clonedScene = cloneSkeleton(gltf.scene);
    clonedScene.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!('material' in mesh) || !mesh.material) return;

      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map((material) =>
          clonePreviewMaterial(material, spec.materialSwatch, spec.colorSwatch)
        );
        return;
      }

      mesh.material = clonePreviewMaterial(mesh.material, spec.materialSwatch, spec.colorSwatch);
    });
    return clonedScene;
  }, [gltf.scene, spec.colorSwatch, spec.materialSwatch]);

  useEffect(() => {
    return () => {
      scene.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!('material' in mesh) || !mesh.material) return;
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((material) => material.dispose());
          return;
        }
        mesh.material.dispose();
      });
    };
  }, [scene]);

  return <primitive object={scene} />;
}

function CharacterPreviewCanvas({
  models,
  yaw,
  pitch,
  zoom,
}: {
  models: PreviewModelSpec[];
  yaw: number;
  pitch: number;
  zoom: number;
}) {
  return (
    <Canvas camera={{ position: [0, 1.2 + pitch, zoom], fov: 38 }} gl={{ antialias: true }} dpr={[1, 1.5]}>
      <color attach="background" args={['#07111b']} />
      <ambientLight intensity={0.85} />
      <directionalLight position={[4, 5, 6]} intensity={2.25} castShadow />
      <directionalLight position={[-3, 2, -4]} intensity={0.65} color="#9ec8ff" />
      <group position={[0, -0.95, 0]} rotation={[0, yaw, 0]}>
        <Suspense fallback={null}>
          {models.map((model) => (
            <LoadedPreviewModel key={model.key} spec={model} />
          ))}
        </Suspense>
      </group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.02, 0]} receiveShadow>
        <circleGeometry args={[2.4, 48]} />
        <meshStandardMaterial color="#102033" roughness={0.95} metalness={0.05} />
      </mesh>
    </Canvas>
  );
}

function DropZone({
  category,
  active,
  hovered,
  focused,
  pulsing,
  onDrop,
  onHover,
  onSelect,
}: {
  category: CharacterPartCategory;
  active: boolean;
  hovered: boolean;
  focused: boolean;
  pulsing: boolean;
  onDrop: (category: CharacterPartCategory) => void;
  onHover: (category: CharacterPartCategory | null) => void;
  onSelect: (category: CharacterPartCategory) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(category)}
      onDragOver={(event) => {
        if (!active) return;
        event.preventDefault();
        onHover(category);
      }}
      onDragLeave={() => onHover(null)}
      onDrop={(event) => {
        if (!active) return;
        event.preventDefault();
        onDrop(category);
        onHover(null);
      }}
      className={cn(
        'rounded-full border px-2 py-1 text-[10px] uppercase tracking-wide transition-all duration-200',
        focused && 'border-cyan-300 bg-cyan-300/20 text-cyan-50 ring-2 ring-cyan-300/50',
        pulsing &&
          'animate-pulse shadow-[0_0_0_1px_rgba(103,232,249,0.35),0_0_22px_rgba(34,211,238,0.22)]',
        active
          ? hovered
            ? 'border-cyan-300 bg-cyan-400/30 text-cyan-50'
            : 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200'
          : !focused && 'border-slate-700 bg-slate-950/80 text-slate-500'
      )}
    >
      {CHARACTER_CATEGORY_LABELS[category]}
    </button>
  );
}

const INITIAL_SNAPSHOT: CharacterBuilderSnapshot = {
  selectedCategory: 'body',
  filters: {
    searchQuery: '',
    bodyType: null,
    tag: null,
  },
  categories: [],
  filteredParts: [],
  equippedParts: {},
  baseBody: null,
  presets: [],
  dragDrop: {
    enabled: true,
    draggingPartId: null,
    hoveredCategory: null,
    highlightedCategories: [],
  },
  preview: {
    yaw: 0.45,
    pitch: 0.1,
    zoom: 3.8,
  },
  previewModelPaths: [],
  tags: [],
  materialSelections: {},
  colorSelections: {},
  errorReports: [],
};

export function CharacterBuilderPanel() {
  const activeSceneId = useEngineStore((state) => state.activeSceneId);
  const entities = useEngineStore((state) => state.entities);
  const selectedEntityIds = useEngineStore((state) => state.editor.selectedEntities);
  const characterBuilderFocusRequest = useEngineStore(
    (state) => state.editor.characterBuilderFocusRequest
  );
  const clearCharacterBuilderFocus = useEngineStore(
    (state) => state.clearCharacterBuilderFocus
  );
  const builderRef = useRef<CharacterLibraryBuilder | null>(null);
  const dragPointerRef = useRef<{ x: number; y: number } | null>(null);
  const equippedSlotRefs = useRef<
    Partial<Record<CharacterPartCategory, HTMLDivElement | null>>
  >({});
  const [snapshot, setSnapshot] = useState<CharacterBuilderSnapshot>(INITIAL_SNAPSHOT);
  const [status, setStatus] = useState('Cargando Character Builder...');
  const [presetName, setPresetName] = useState('preset_personaje');
  const [sceneBridgeReady, setSceneBridgeReady] = useState(false);
  const [previewPulseCategory, setPreviewPulseCategory] = useState<CharacterPartCategory | null>(
    null
  );
  const previewPulseTimeoutRef = useRef<number | null>(null);

  const refreshSnapshot = useCallback(() => {
    const builder = builderRef.current;
    if (!builder) return;
    setSnapshot(builder.snapshot());
  }, []);

  const runAction = useCallback(
    async (action: Promise<CharacterBuilderActionResult> | CharacterBuilderActionResult) => {
      const result = await action;
      setStatus(result.message);
      refreshSnapshot();
      return result;
    },
    [refreshSnapshot]
  );

  const pulsePreviewCategory = useCallback((category: CharacterPartCategory) => {
    if (previewPulseTimeoutRef.current !== null) {
      window.clearTimeout(previewPulseTimeoutRef.current);
    }
    setPreviewPulseCategory(category);
    previewPulseTimeoutRef.current = window.setTimeout(() => {
      setPreviewPulseCategory((current) => (current === category ? null : current));
      previewPulseTimeoutRef.current = null;
    }, 950);
  }, []);

  useEffect(() => {
    const builder = new CharacterLibraryBuilder(createCharacterBuilderEditorAdapter());
    builderRef.current = builder;
    let cancelled = false;
    builder
      .openCharacterBuilder()
      .then((nextSnapshot) => {
        if (cancelled) return;
        const liveCharacterEntity = findCharacterBuilderSceneEntity(
          useEngineStore.getState().entities.values()
        );
        const liveCharacterSceneData =
          readCharacterBuilderSceneDataFromEntity(liveCharacterEntity);

        if (liveCharacterSceneData) {
          setSnapshot(
            builder.hydrateFromPreset(
              buildCharacterBuilderPresetFromSceneData(liveCharacterSceneData)
            )
          );
          setStatus('Character Builder hidratado desde el actor de escena.');
          setSceneBridgeReady(true);
          return;
        }

        setSnapshot(nextSnapshot);
        setStatus('Character Builder inicializado con biblioteca publica.');
        setSceneBridgeReady(true);
      })
      .catch((error) => {
        if (cancelled) return;
        setStatus(`No se pudo abrir Character Builder: ${String(error)}`);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () => () => {
      if (previewPulseTimeoutRef.current !== null) {
        window.clearTimeout(previewPulseTimeoutRef.current);
      }
    },
    []
  );

  const selectCategory = (category: string) => {
    const builder = builderRef.current;
    if (!builder) return;
    const nextCategory = category as CharacterPartCategory;
    setSnapshot(builder.setSelectedCategory(nextCategory));
    pulsePreviewCategory(nextCategory);
  };

  const onSearchChange = (value: string) => {
    const builder = builderRef.current;
    if (!builder) return;
    setSnapshot(builder.setSearchQuery(value));
  };

  const onTagChange = (value: string) => {
    const builder = builderRef.current;
    if (!builder) return;
    setSnapshot(builder.setTagFilter(value));
  };

  const onBodyTypeChange = (value: string) => {
    const builder = builderRef.current;
    if (!builder) return;
    setSnapshot(builder.setBodyTypeFilter(value));
  };

  const applyPart = (partId: string) => {
    const builder = builderRef.current;
    if (!builder) return;
    void runAction(builder.applyPart(partId));
  };

  const dropOnCategory = (category: CharacterPartCategory) => {
    const builder = builderRef.current;
    if (!builder) return;
    void runAction(builder.dropDraggedPart(category));
  };

  const applyMaterialVariant = (category: CharacterPartCategory, variantId: string | null) => {
    const builder = builderRef.current;
    if (!builder) return;
    setSnapshot(builder.setMaterialVariant(category, variantId));
    setStatus(
      variantId
        ? `Material ${variantId} aplicado en ${CHARACTER_CATEGORY_LABELS[category]}.`
        : `Material limpiado en ${CHARACTER_CATEGORY_LABELS[category]}.`
    );
  };

  const applyColorVariant = (category: CharacterPartCategory, variantId: string | null) => {
    const builder = builderRef.current;
    if (!builder) return;
    setSnapshot(builder.setColorVariant(category, variantId));
    setStatus(
      variantId
        ? `Color ${variantId} aplicado en ${CHARACTER_CATEGORY_LABELS[category]}.`
        : `Color limpiado en ${CHARACTER_CATEGORY_LABELS[category]}.`
    );
  };

  const onPreviewPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragPointerRef.current = { x: event.clientX, y: event.clientY };
  };

  const onPreviewPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const builder = builderRef.current;
    const start = dragPointerRef.current;
    if (!builder || !start) return;
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    dragPointerRef.current = { x: event.clientX, y: event.clientY };
    setSnapshot(builder.rotatePreview(deltaX * 0.01, deltaY * 0.0035));
  };

  const onPreviewPointerUp = () => {
    dragPointerRef.current = null;
  };

  const previewModels = useMemo<PreviewModelSpec[]>(() => {
    return CHARACTER_PART_CATEGORIES.reduce<PreviewModelSpec[]>((acc, category) => {
      const part = snapshot.equippedParts[category];
      if (!part) return acc;

      const selectedMaterialVariant = part.materialVariants.find(
        (variant) => variant.id === snapshot.materialSelections[category]
      );
      const selectedColorVariant = part.colorVariants.find(
        (variant) => variant.id === snapshot.colorSelections[category]
      );

      acc.push({
        key: [
          category,
          part.id,
          selectedMaterialVariant?.id ?? 'default_material',
          selectedColorVariant?.id ?? 'default_color',
        ].join(':'),
        path: part.modelPath,
        category,
        label: part.name,
        materialSwatch: selectedMaterialVariant?.swatch ?? null,
        colorSwatch: selectedColorVariant?.swatch ?? null,
      });

      return acc;
    }, []);
  }, [snapshot.colorSelections, snapshot.equippedParts, snapshot.materialSelections]);

  const liveCharacterEntity = useMemo(() => {
    const selectedEntity =
      selectedEntityIds.length === 1 ? entities.get(selectedEntityIds[0]) ?? null : null;
    return (
      readCharacterBuilderSceneDataFromEntity(selectedEntity) !== null
        ? selectedEntity
        : findCharacterBuilderSceneEntity(entities.values())
    );
  }, [entities, selectedEntityIds]);

  const liveCharacterSceneData = useMemo(() => {
    return readCharacterBuilderSceneDataFromEntity(liveCharacterEntity);
  }, [liveCharacterEntity]);

  const liveCharacterSceneId = liveCharacterEntity?.id ?? null;

  const liveCharacterSceneSignature = useMemo(
    () => buildCharacterBuilderSceneSignature(liveCharacterSceneData),
    [liveCharacterSceneData]
  );

  const sceneSyncKey = useMemo(
    () =>
      JSON.stringify({
        activeSceneId,
        baseBodyId: snapshot.baseBody?.id ?? null,
        equippedParts: CHARACTER_PART_CATEGORIES.map((category) => ({
          category,
          partId: snapshot.equippedParts[category]?.id ?? null,
          materialSelection: snapshot.materialSelections[category] ?? null,
          colorSelection: snapshot.colorSelections[category] ?? null,
        })),
      }),
      [
        activeSceneId,
        snapshot.baseBody?.id,
        snapshot.colorSelections,
        snapshot.dragDrop.hoveredCategory,
        snapshot.equippedParts,
        snapshot.materialSelections,
        snapshot.selectedCategory,
      ]
    );

  const sceneSyncSnapshot = useMemo(() => snapshot, [sceneSyncKey]);
  const localSceneSignature = useMemo(
    () => buildCharacterBuilderSceneSignature(buildCharacterBuilderSceneData(sceneSyncSnapshot)),
    [sceneSyncSnapshot]
  );

  useEffect(() => {
    if (!sceneBridgeReady) return;
    syncCharacterBuilderSnapshotToStore(sceneSyncSnapshot);
  }, [sceneBridgeReady, sceneSyncSnapshot]);

  useEffect(() => {
    const builder = builderRef.current;
    if (!builder || !sceneBridgeReady || !liveCharacterSceneData) return;
    if (liveCharacterSceneSignature === localSceneSignature) return;

    setSnapshot(
      builder.hydrateFromPreset(
        buildCharacterBuilderPresetFromSceneData(liveCharacterSceneData)
      )
    );
    setStatus('Character Builder sincronizado desde Inspector/escena.');
  }, [
    liveCharacterSceneData,
    liveCharacterSceneSignature,
    localSceneSignature,
    sceneBridgeReady,
  ]);

  useEffect(() => {
    const builder = builderRef.current;
    const focusCategory = characterBuilderFocusRequest?.category ?? null;
    if (!builder || !sceneBridgeReady || !focusCategory) return;
    if (
      !CHARACTER_PART_CATEGORIES.includes(
        focusCategory as CharacterPartCategory
      )
    ) {
      clearCharacterBuilderFocus();
      return;
    }

    setSnapshot(
      builder.setSelectedCategory(focusCategory as CharacterPartCategory)
    );
    setStatus(`Categoria ${CHARACTER_CATEGORY_LABELS[focusCategory as CharacterPartCategory]} enfocada desde Inspector.`);
    pulsePreviewCategory(focusCategory as CharacterPartCategory);
    clearCharacterBuilderFocus();
  }, [characterBuilderFocusRequest, clearCharacterBuilderFocus, pulsePreviewCategory, sceneBridgeReady]);

  useEffect(() => {
    const target = equippedSlotRefs.current[snapshot.selectedCategory];
    if (!target) return;

    const frame = window.requestAnimationFrame(() => {
      target.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
        behavior: 'smooth',
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [snapshot.selectedCategory]);

  return (
    <div className="flex h-full min-h-0 bg-slate-950 text-slate-100">
      <div className="w-52 shrink-0 border-r border-slate-800 bg-slate-900/60">
        <div className="border-b border-slate-800 px-3 py-3">
          <div className="flex items-start gap-2">
            <Cuboid className="mt-0.5 h-4 w-4 text-cyan-300" />
            <div>
              <h3 className="text-sm font-medium">Character Builder</h3>
              <p className="text-[11px] text-slate-400">
                Biblioteca modular, validacion y presets JSON.
              </p>
            </div>
          </div>
        </div>

        <ScrollArea className="h-[calc(100%-74px)]">
          <div className="space-y-3 p-3">
            <div className="space-y-1">
              {snapshot.categories.map((entry) => (
                <button
                  key={entry.category}
                  type="button"
                  className={cn(
                    'flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-xs transition-colors',
                    snapshot.selectedCategory === entry.category
                      ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-100'
                      : 'border-slate-800 bg-slate-950 text-slate-300 hover:bg-slate-900'
                  )}
                  onClick={() => selectCategory(entry.category)}
                >
                  <span>{entry.label}</span>
                  <span className="rounded-full bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                    {entry.count}
                  </span>
                </button>
              ))}
            </div>

            <Card className="gap-3 border-slate-800 bg-slate-950 py-4">
              <CardHeader className="px-4">
                <CardTitle className="text-xs uppercase tracking-wide text-slate-300">
                  Equipado
                </CardTitle>
                <CardDescription className="text-[11px] text-slate-500">
                  Slots activos del personaje actual.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 px-4">
                {CHARACTER_PART_CATEGORIES.map((category) => {
                  const part = snapshot.equippedParts[category];
                  const isFocusedSlot = snapshot.selectedCategory === category;
                  return (
                    <div
                      key={category}
                      ref={(node) => {
                        equippedSlotRefs.current[category] = node;
                      }}
                      role="button"
                      tabIndex={0}
                      onClick={() => selectCategory(category)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          selectCategory(category);
                        }
                      }}
                      className={cn(
                        'rounded-lg border px-2 py-2 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-400/60',
                        isFocusedSlot
                          ? 'border-cyan-400/60 bg-cyan-500/10 shadow-[0_0_0_1px_rgba(34,211,238,0.15)]'
                          : 'border-slate-800 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-900'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div
                          className={cn(
                            'text-[10px] uppercase tracking-wide',
                            isFocusedSlot ? 'text-cyan-200' : 'text-slate-500'
                          )}
                        >
                          {CHARACTER_CATEGORY_LABELS[category]}
                        </div>
                        {isFocusedSlot && (
                          <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-cyan-100">
                            Focused
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            'truncate text-xs',
                            isFocusedSlot ? 'text-cyan-50' : 'text-slate-200'
                          )}
                        >
                          {part?.name ?? 'Vacio'}
                        </span>
                        {part && (
                          <button
                            type="button"
                            className="rounded bg-slate-800 p-1 text-slate-300 hover:bg-rose-500/20 hover:text-rose-200"
                            onClick={(event) => {
                              event.stopPropagation();
                              const builder = builderRef.current;
                              if (!builder) return;
                              void runAction(builder.removePart(category));
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        </ScrollArea>
      </div>

      <div className="flex min-w-0 flex-1 flex-col border-r border-slate-800">
        <div className="border-b border-slate-800 px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={snapshot.filters.searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Buscar pieza..."
              className="h-8 max-w-52 border-slate-700 bg-slate-900 text-xs"
            />
            <select
              value={snapshot.filters.bodyType ?? 'all'}
              onChange={(event) => onBodyTypeChange(event.target.value)}
              className="h-8 rounded-md border border-slate-700 bg-slate-900 px-2 text-xs text-slate-200"
            >
              <option value="all">Body type: all</option>
              <option value="unisex_medium">unisex_medium</option>
            </select>
            <select
              value={snapshot.filters.tag ?? 'all'}
              onChange={(event) => onTagChange(event.target.value)}
              className="h-8 rounded-md border border-slate-700 bg-slate-900 px-2 text-xs text-slate-200"
            >
              <option value="all">Tag: all</option>
              {snapshot.tags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant={snapshot.dragDrop.enabled ? 'secondary' : 'outline'}
              onClick={() => {
                const builder = builderRef.current;
                if (!builder) return;
                setSnapshot(builder.enableDragDropMode(!snapshot.dragDrop.enabled));
                setStatus(
                  !snapshot.dragDrop.enabled
                    ? 'Drag & drop activado.'
                    : 'Drag & drop desactivado.'
                );
              }}
            >
              <Grip className="mr-1 h-3.5 w-3.5" />
              DnD
            </Button>
          </div>
        </div>

        <Tabs value={snapshot.selectedCategory} onValueChange={selectCategory} className="flex min-h-0 flex-1 flex-col">
          <div className="border-b border-slate-800 px-3 py-2">
            <TabsList className="h-auto flex-wrap bg-slate-900">
              {snapshot.categories.map((entry) => (
                <TabsTrigger
                  key={entry.category}
                  value={entry.category}
                  className="text-xs data-[state=active]:bg-slate-800 data-[state=active]:text-cyan-100"
                >
                  {entry.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <ScrollArea className="flex-1 p-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {snapshot.filteredParts.map(({ part, compatibility, equipped }) => (
                <Card
                  key={part.id}
                  draggable={snapshot.dragDrop.enabled}
                  onDragStart={() => {
                    const builder = builderRef.current;
                    if (!builder) return;
                    setSnapshot(builder.beginDrag(part.id));
                  }}
                  onDragEnd={() => {
                    const builder = builderRef.current;
                    if (!builder) return;
                    setSnapshot(builder.cancelDrag());
                  }}
                  className={cn(
                    'gap-3 border-slate-800 bg-slate-950 py-4 transition-colors',
                    equipped && 'border-cyan-500/50 bg-cyan-500/10',
                    !compatibility.ok && 'border-amber-500/30'
                  )}
                >
                  <CardHeader className="px-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-sm">{part.name}</CardTitle>
                        <CardDescription className="text-[11px] text-slate-500">
                          {part.category} · socket {part.attachmentSocket}
                        </CardDescription>
                      </div>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[10px]',
                          compatibility.ok
                            ? 'bg-emerald-500/15 text-emerald-200'
                            : 'bg-amber-500/15 text-amber-200'
                        )}
                      >
                        {compatibility.ok ? 'Compatible' : 'Revisar'}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className="h-16 w-16 overflow-hidden rounded-lg border border-slate-800 bg-slate-900">
                        {part.thumbnailPath ? (
                          <img
                            src={part.thumbnailPath}
                            alt={part.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-[10px] text-slate-500">
                            Sin preview
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1 text-[11px] text-slate-400">
                        <div className="truncate">Skeleton: {part.skeletonId}</div>
                        <div className="truncate">Body: {part.bodyType}</div>
                        <div className="truncate">Tags: {part.tags.join(', ') || 'none'}</div>
                      </div>
                    </div>
                    {!compatibility.ok && (
                      <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-2 py-2 text-[11px] text-amber-100">
                        {compatibility.issues[0]?.message}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => applyPart(part.id)}
                        disabled={!compatibility.ok}
                      >
                        Equipar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const builder = builderRef.current;
                          if (!builder) return;
                          setSnapshot(builder.beginDrag(part.id));
                          setStatus(`Arrastrando ${part.name}.`);
                        }}
                      >
                        Drag
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </Tabs>
      </div>

      <div className="w-[30rem] shrink-0 bg-slate-900/40">
        <div className="border-b border-slate-800 px-3 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium">Preview Viewport</h3>
              <p className="text-[11px] text-slate-400">
                Cuerpo base + piezas equipadas en una preview 3D local.
              </p>
            </div>
            <div className="flex gap-1">
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => {
                  const builder = builderRef.current;
                  if (!builder) return;
                  setSnapshot(builder.zoomPreview(-0.2));
                }}
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => {
                  const builder = builderRef.current;
                  if (!builder) return;
                  setSnapshot(builder.zoomPreview(0.2));
                }}
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => {
                  const builder = builderRef.current;
                  if (!builder) return;
                  setSnapshot(builder.resetPreview());
                }}
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-3 p-3">
          <div
            className="relative h-80 overflow-hidden rounded-xl border border-slate-800 bg-slate-950"
            onPointerDown={onPreviewPointerDown}
            onPointerMove={onPreviewPointerMove}
            onPointerUp={onPreviewPointerUp}
            onPointerLeave={onPreviewPointerUp}
            onWheel={(event) => {
              event.preventDefault();
              const builder = builderRef.current;
              if (!builder) return;
              setSnapshot(builder.zoomPreview(event.deltaY > 0 ? 0.16 : -0.16));
            }}
          >
            {previewModels.length > 0 ? (
              <CharacterPreviewCanvas
                models={previewModels}
                yaw={snapshot.preview.yaw}
                pitch={snapshot.preview.pitch}
                zoom={snapshot.preview.zoom}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                No hay piezas para previsualizar.
              </div>
            )}

            <div className="absolute inset-x-3 top-3 flex flex-wrap gap-2">
              {CHARACTER_PART_CATEGORIES.map((category) => (
                <DropZone
                  key={category}
                  category={category}
                  active={snapshot.dragDrop.highlightedCategories.includes(category)}
                  hovered={snapshot.dragDrop.hoveredCategory === category}
                  focused={snapshot.selectedCategory === category}
                  pulsing={previewPulseCategory === category}
                  onDrop={dropOnCategory}
                  onHover={(target) => {
                    const builder = builderRef.current;
                    if (!builder) return;
                    setSnapshot(builder.hoverDropZone(target));
                  }}
                  onSelect={(targetCategory) => selectCategory(targetCategory)}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                const builder = builderRef.current;
                if (!builder) return;
                void runAction(builder.randomizeCharacter());
              }}
            >
              <Dices className="mr-1 h-3.5 w-3.5" />
              Random
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const builder = builderRef.current;
                if (!builder) return;
                void runAction(builder.resetCharacter());
              }}
            >
              <RotateCcw className="mr-1 h-3.5 w-3.5" />
              Reset
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const builder = builderRef.current;
                if (!builder) return;
                builder.resetPreview();
                void builder.rebuildAssetLibrary().then((nextSnapshot) => {
                  setSnapshot(nextSnapshot);
                  setStatus('Biblioteca reconstruida.');
                });
              }}
            >
              <RefreshCw className="mr-1 h-3.5 w-3.5" />
              Rebuild Library
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const builder = builderRef.current;
                if (!builder) return;
                setSnapshot(builder.rotatePreview(0.3));
              }}
            >
              Girar
            </Button>
          </div>

          <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-[11px] text-cyan-100">
            {liveCharacterSceneId
              ? `Scene sync activa con la entidad ${liveCharacterSceneId}.`
              : 'Scene sync en espera de un personaje base valido.'}
          </div>

          <Card className="gap-3 border-slate-800 bg-slate-950 py-4">
            <CardHeader className="px-4">
              <CardTitle className="text-sm">Variants</CardTitle>
              <CardDescription className="text-[11px] text-slate-500">
                Materiales y colores guardados junto al preset JSON.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 px-4">
              {CHARACTER_PART_CATEGORIES.map((category) => {
                const part = snapshot.equippedParts[category];
                if (!part) return null;
                const hasMaterialVariants = part.materialVariants.length > 0;
                const hasColorVariants = part.colorVariants.length > 0;
                if (!hasMaterialVariants && !hasColorVariants) return null;

                return (
                  <div
                    key={`variant_${category}`}
                    className="rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-3"
                  >
                    <div className="mb-2">
                      <div className="text-[10px] uppercase tracking-wide text-slate-500">
                        {CHARACTER_CATEGORY_LABELS[category]}
                      </div>
                      <div className="text-xs text-slate-200">{part.name}</div>
                    </div>

                    <div className="space-y-2">
                      {hasMaterialVariants && (
                        <label className="block space-y-1">
                          <span className="text-[10px] uppercase tracking-wide text-slate-500">
                            Material
                          </span>
                          <select
                            value={snapshot.materialSelections[category] ?? ''}
                            onChange={(event) =>
                              applyMaterialVariant(category, event.target.value || null)
                            }
                            className="h-8 w-full rounded-md border border-slate-700 bg-slate-950 px-2 text-xs text-slate-200"
                          >
                            <option value="">Default material</option>
                            {part.materialVariants.map((variant) => (
                              <option key={variant.id} value={variant.id}>
                                {variant.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}

                      {hasColorVariants && (
                        <label className="block space-y-1">
                          <span className="text-[10px] uppercase tracking-wide text-slate-500">
                            Color
                          </span>
                          <select
                            value={snapshot.colorSelections[category] ?? ''}
                            onChange={(event) =>
                              applyColorVariant(category, event.target.value || null)
                            }
                            className="h-8 w-full rounded-md border border-slate-700 bg-slate-950 px-2 text-xs text-slate-200"
                          >
                            <option value="">Default color</option>
                            {part.colorVariants.map((variant) => (
                              <option key={variant.id} value={variant.id}>
                                {variant.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    </div>
                  </div>
                );
              })}

              {!CHARACTER_PART_CATEGORIES.some((category) => {
                const part = snapshot.equippedParts[category];
                return Boolean(
                  part && (part.materialVariants.length > 0 || part.colorVariants.length > 0)
                );
              }) && (
                <div className="rounded-lg border border-dashed border-slate-700 px-3 py-4 text-center text-xs text-slate-500">
                  Equipa una pieza con variantes para ajustar materiales o colores.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="gap-3 border-slate-800 bg-slate-950 py-4">
            <CardHeader className="px-4">
              <CardTitle className="text-sm">Presets JSON</CardTitle>
              <CardDescription className="text-[11px] text-slate-500">
                Guardado local serializado como JSON. El adaptador actual lo deja listo para mover
                a backend o filesystem despues.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 px-4">
              <div className="flex gap-2">
                <Input
                  value={presetName}
                  onChange={(event) => setPresetName(event.target.value)}
                  placeholder="Nombre del preset"
                  className="h-8 border-slate-700 bg-slate-900 text-xs"
                />
                <Button
                  size="sm"
                  onClick={() => {
                    const builder = builderRef.current;
                    if (!builder) return;
                    void runAction(builder.savePreset(presetName));
                  }}
                >
                  <Save className="mr-1 h-3.5 w-3.5" />
                  Guardar
                </Button>
              </div>

              <ScrollArea className="h-44 rounded-lg border border-slate-800 bg-slate-900/40 p-2">
                <div className="space-y-2">
                  {snapshot.presets.length === 0 && (
                    <div className="rounded-lg border border-dashed border-slate-700 px-3 py-4 text-center text-xs text-slate-500">
                      Todavia no hay presets guardados.
                    </div>
                  )}
                  {snapshot.presets.map((preset) => (
                    <div
                      key={preset.id}
                      className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-xs text-slate-200">{preset.name}</div>
                          <div className="text-[10px] text-slate-500">
                            {new Date(preset.updatedAt).toLocaleString()}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-[11px]"
                            onClick={() => {
                              const builder = builderRef.current;
                              if (!builder) return;
                              void runAction(builder.loadPreset(preset.id));
                            }}
                          >
                            Cargar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-[11px] text-rose-200 hover:text-rose-100"
                            onClick={() => {
                              const builder = builderRef.current;
                              if (!builder) return;
                              void runAction(builder.deletePreset(preset.id));
                            }}
                          >
                            Borrar
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card className="gap-3 border-slate-800 bg-slate-950 py-4">
            <CardHeader className="px-4">
              <CardTitle className="text-sm">Compatibility Reports</CardTitle>
              <CardDescription className="text-[11px] text-slate-500">
                Ultimos errores estructurados cuando una pieza no encaja.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-4">
              <ScrollArea className="h-40 rounded-lg border border-slate-800 bg-slate-900/40 p-2">
                <div className="space-y-2">
                  {snapshot.errorReports.length === 0 && (
                    <div className="rounded-lg border border-dashed border-slate-700 px-3 py-4 text-center text-xs text-slate-500">
                      Aun no hay reportes de compatibilidad.
                    </div>
                  )}
                  {snapshot.errorReports.map((report) => (
                    <div
                      key={report.id}
                      className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2"
                    >
                      <div className="truncate text-xs text-amber-100">{report.message}</div>
                      <div className="text-[10px] text-amber-200/80">
                        {report.targetCategory ?? 'unknown'} ·{' '}
                        {new Date(report.createdAt).toLocaleString()}
                      </div>
                      {report.issues[1] && (
                        <div className="mt-1 text-[10px] text-amber-100/80">
                          +{report.issues.length - 1} issue(s) adicionales
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <div className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-[11px] text-slate-300">
            {status}
          </div>
        </div>
      </div>
    </div>
  );
}
