// ============================================
// Hierarchy Panel - Outliner + Collections
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// ============================================

'use client';

import { useRef, useState } from 'react';
import { CHARACTER_BUILDER_SCENE_TAG } from './characterBuilderSceneSync';
import { useActiveScene, useEngineStore } from '@/store/editorStore';
import {
  Camera,
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Folder,
  GripVertical,
  Layers3,
  Lightbulb,
  MoreHorizontal,
  MousePointer,
  Package,
  Plus,
  Sparkles,
  Trash2,
  Volume2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createDefaultAudioSourceData } from '@/engine/audio/audioSourceData';
import { EntityFactory } from '@/engine/core/ECS';
import type { Entity, SceneCollection } from '@/types/engine';
import { cn } from '@/lib/utils';

interface DragItem {
  type: 'entity';
  id: string;
  parentId: string | null;
}

const COLLECTION_COLORS = ['#4da3ff', '#9d7bff', '#35c991', '#ff8a5b', '#ffcb57', '#ff5f87'];

export function HierarchyPanel() {
  const {
    scenes,
    activeSceneId,
    setActiveScene,
    setActivePanel,
    createScene,
    updateScene,
    entities,
    editor,
    selectEntity,
    addEntity,
    removeEntity,
    updateEntity,
  } = useEngineStore();
  const activeScene = useActiveScene();

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<'before' | 'after' | 'inside' | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showInactive, setShowInactive] = useState(true);
  const [collectionFilterId, setCollectionFilterId] = useState<string | null>(null);
  const dragItemRef = useRef<DragItem | null>(null);

  const sceneCollections = activeScene?.collections ?? [];

  const updateCollections = (collections: SceneCollection[]) => {
    if (!activeScene) return;
    updateScene(activeScene.id, { collections });
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const getIcon = (entity: Entity) => {
    if (entity.tags.includes(CHARACTER_BUILDER_SCENE_TAG)) {
      return <Sparkles className="h-3.5 w-3.5 text-cyan-300" />;
    }
    if (entity.components.has('Light')) return <Lightbulb className="h-3.5 w-3.5 text-yellow-400" />;
    if (entity.components.has('Camera')) return <Camera className="h-3.5 w-3.5 text-blue-400" />;
    if (entity.components.has('AudioSource')) return <Volume2 className="h-3.5 w-3.5 text-purple-400" />;
    if (entity.components.has('MeshRenderer')) return <Package className="h-3.5 w-3.5 text-slate-400" />;
    return <Folder className="h-3.5 w-3.5 text-slate-500" />;
  };

  const ensureSceneExists = () => {
    if (activeSceneId) return activeSceneId;
    return createScene(`Scene ${scenes.length + 1}`).id;
  };

  const handleCreateEntity = (
    type: 'empty' | 'cube' | 'sphere' | 'cylinder' | 'plane' | 'light' | 'camera' | 'audio',
    parentId: string | null = null
  ) => {
    ensureSceneExists();
    const entity = EntityFactory.create(`${type.charAt(0).toUpperCase() + type.slice(1)}`);

    entity.components.set('Transform', {
      id: crypto.randomUUID(),
      type: 'Transform',
      data: {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: { x: 1, y: 1, z: 1 },
      },
      enabled: true,
    });

    switch (type) {
      case 'cube':
      case 'sphere':
      case 'cylinder':
      case 'plane':
        entity.components.set('MeshRenderer', {
          id: crypto.randomUUID(),
          type: 'MeshRenderer',
          data: {
            meshId: type,
            materialId: 'default',
            castShadows: true,
            receiveShadows: true,
          },
          enabled: true,
        });
        break;
      case 'light':
        entity.components.set('Light', {
          id: crypto.randomUUID(),
          type: 'Light',
          data: {
            type: 'point',
            color: { r: 1, g: 1, b: 1 },
            intensity: 1,
            shadows: true,
          },
          enabled: true,
        });
        break;
      case 'camera':
        entity.components.set('Camera', {
          id: crypto.randomUUID(),
          type: 'Camera',
          data: {
            fov: 60,
            near: 0.1,
            far: 1000,
            orthographic: false,
            orthoSize: 10,
            clearColor: { r: 0.1, g: 0.1, b: 0.15 },
            isMain: false,
          },
          enabled: true,
        });
        break;
      case 'audio':
        entity.components.set('AudioSource', {
          id: crypto.randomUUID(),
          type: 'AudioSource',
          data: createDefaultAudioSourceData() as unknown as Record<string, unknown>,
          enabled: true,
        });
        break;
    }

    entity.parentId = parentId;
    addEntity(entity);
    selectEntity(entity.id, false);
  };

  const handleDuplicate = (entity: Entity) => {
    const duplicated: Entity = {
      ...entity,
      id: crypto.randomUUID(),
      name: `${entity.name}_Copy`,
      children: [],
      tags: entity.tags.filter((tag) => tag !== CHARACTER_BUILDER_SCENE_TAG),
    };
    addEntity(duplicated);
    selectEntity(duplicated.id, false);
  };

  const handleRename = (entity: Entity) => {
    setRenamingId(entity.id);
    setNewName(entity.name);
  };

  const handleRenameSubmit = (entityId: string) => {
    if (newName.trim()) {
      updateEntity(entityId, { name: newName.trim() });
    }
    setRenamingId(null);
    setNewName('');
  };

  const handleCreateCollection = () => {
    const targetScene = activeScene ?? createScene(`Scene ${scenes.length + 1}`);
    const currentCollections = targetScene.collections ?? [];

    const nextCollection: SceneCollection = {
      id: crypto.randomUUID(),
      name: `Collection ${currentCollections.length + 1}`,
      color: COLLECTION_COLORS[currentCollections.length % COLLECTION_COLORS.length],
      visible: true,
      entityIds: [...editor.selectedEntities],
    };

    updateScene(targetScene.id, { collections: [...currentCollections, nextCollection] });
  };

  const handleRenameCollection = (collectionId: string) => {
    if (!activeScene) return;
    const current = sceneCollections.find((collection) => collection.id === collectionId);
    if (!current) return;
    const nextName = window.prompt('Nuevo nombre de colección', current.name)?.trim();
    if (!nextName) return;

    updateCollections(
      sceneCollections.map((collection) =>
        collection.id === collectionId ? { ...collection, name: nextName } : collection
      )
    );
  };

  const handleDeleteCollection = (collectionId: string) => {
    updateCollections(sceneCollections.filter((collection) => collection.id !== collectionId));
    if (collectionFilterId === collectionId) {
      setCollectionFilterId(null);
    }
  };

  const toggleCollectionVisibility = (collectionId: string) => {
    updateCollections(
      sceneCollections.map((collection) =>
        collection.id === collectionId
          ? { ...collection, visible: collection.visible === false ? true : false }
          : collection
      )
    );
  };

  const toggleEntityCollectionMembership = (entityId: string, collectionId: string) => {
    updateCollections(
      sceneCollections.map((collection) => {
        if (collection.id !== collectionId) return collection;
        const hasEntity = collection.entityIds.includes(entityId);
        return {
          ...collection,
          entityIds: hasEntity
            ? collection.entityIds.filter((id) => id !== entityId)
            : [...collection.entityIds, entityId],
        };
      })
    );
  };

  const assignSelectionToCollection = (collectionId: string) => {
    if (editor.selectedEntities.length === 0) return;

    updateCollections(
      sceneCollections.map((collection) =>
        collection.id === collectionId
          ? {
              ...collection,
              entityIds: Array.from(new Set([...collection.entityIds, ...editor.selectedEntities])),
            }
          : collection
      )
    );
  };

  const getEntityCollections = (entityId: string) =>
    sceneCollections.filter((collection) => collection.entityIds.includes(entityId));

  const isEntityVisibleByCollections = (entityId: string) => {
    const memberships = getEntityCollections(entityId);
    return memberships.length === 0 || memberships.some((collection) => collection.visible !== false);
  };

  const filteredCollectionIds = new Set(
    collectionFilterId
      ? (sceneCollections.find((collection) => collection.id === collectionFilterId)?.entityIds ?? [])
      : []
  );

  const matchesEntityFilters = (entity: Entity) => {
    const matchesSearch =
      searchQuery.length === 0 ||
      entity.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      getEntityCollections(entity.id).some((collection) =>
        collection.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    const matchesCollection = collectionFilterId === null || filteredCollectionIds.has(entity.id);
    const matchesActive = showInactive || entity.active;
    return matchesSearch && matchesCollection && matchesActive;
  };

  const shouldRenderEntity = (entity: Entity): boolean => {
    if (matchesEntityFilters(entity)) return true;
    return entity.children.some((child) => shouldRenderEntity(child));
  };

  const isDescendant = (targetId: string, sourceId: string, entityMap: Map<string, Entity>): boolean => {
    const target = entityMap.get(targetId);
    if (!target) return false;
    if (target.parentId === sourceId) return true;
    if (target.parentId) return isDescendant(target.parentId, sourceId, entityMap);
    return false;
  };

  const handleDragStart = (event: React.DragEvent, entity: Entity) => {
    dragItemRef.current = {
      type: 'entity',
      id: entity.id,
      parentId: entity.parentId || null,
    };
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', entity.id);

    const target = event.target as HTMLElement;
    setTimeout(() => target.classList.add('opacity-50'), 0);
  };

  const handleDragEnd = (event: React.DragEvent) => {
    setDragOverId(null);
    setDragOverPosition(null);
    dragItemRef.current = null;
    (event.target as HTMLElement).classList.remove('opacity-50');
  };

  const handleDragOver = (event: React.DragEvent, entity: Entity) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';

    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const y = event.clientY - rect.top;
    const height = rect.height;

    if (y < height * 0.25) {
      setDragOverPosition('before');
    } else if (y > height * 0.75) {
      setDragOverPosition('after');
    } else {
      setDragOverPosition('inside');
    }

    setDragOverId(entity.id);
  };

  const handleDrop = (event: React.DragEvent, targetEntity: Entity) => {
    event.preventDefault();

    const draggedId = event.dataTransfer.getData('text/plain');
    if (!draggedId || draggedId === targetEntity.id) return;

    const draggedEntity = entities.get(draggedId);
    if (!draggedEntity) return;
    if (isDescendant(targetEntity.id, draggedId, entities)) return;

    if (dragOverPosition === 'inside') {
      updateEntity(draggedId, { parentId: targetEntity.id });
      setExpandedIds((current) => new Set(current).add(targetEntity.id));
    } else {
      updateEntity(draggedId, { parentId: targetEntity.parentId || null });
    }

    setDragOverId(null);
    setDragOverPosition(null);
  };

  const renderEntity = (entity: Entity, depth = 0) => {
    if (!shouldRenderEntity(entity)) return null;

    const isSelected = editor.selectedEntities.includes(entity.id);
    const hasChildren = entity.children.length > 0;
    const isExpanded = expandedIds.has(entity.id);
    const isRenaming = renamingId === entity.id;
    const isDragOver = dragOverId === entity.id;
    const memberships = getEntityCollections(entity.id);
    const collectionVisible = isEntityVisibleByCollections(entity.id);
    const isCharacterBuilderActor = entity.tags.includes(CHARACTER_BUILDER_SCENE_TAG);

    return (
      <div key={entity.id}>
        {isDragOver && dragOverPosition === 'before' && (
          <div className="mx-2 h-0.5 rounded bg-blue-500" />
        )}

        <div
          draggable
          onDragStart={(event) => handleDragStart(event, entity)}
          onDragEnd={handleDragEnd}
          onDragOver={(event) => handleDragOver(event, entity)}
          onDragLeave={() => {
            setDragOverId(null);
            setDragOverPosition(null);
          }}
          onDrop={(event) => handleDrop(event, entity)}
          className={cn(
            'group flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 transition-colors',
            isSelected ? 'bg-blue-500/30 text-white' : 'text-slate-300 hover:bg-slate-700/50',
            isDragOver && dragOverPosition === 'inside' && 'ring-2 ring-inset ring-blue-500',
            (!entity.active || !collectionVisible) && 'opacity-50'
          )}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={(event) => {
            event.stopPropagation();
            selectEntity(entity.id, event.shiftKey || event.ctrlKey);
          }}
        >
          <GripVertical className="h-3 w-3 shrink-0 cursor-grab opacity-0 group-hover:opacity-30" />

          {hasChildren ? (
            <button
              onClick={(event) => {
                event.stopPropagation();
                toggleExpand(entity.id);
              }}
              className="shrink-0 rounded p-0.5 hover:bg-slate-600"
            >
              {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
          ) : (
            <div className="w-4 shrink-0" />
          )}

          {getIcon(entity)}

          {isRenaming ? (
            <Input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              onBlur={() => handleRenameSubmit(entity.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleRenameSubmit(entity.id);
                if (event.key === 'Escape') setRenamingId(null);
              }}
              className="h-5 border-slate-700 bg-slate-900 px-1 text-xs"
              autoFocus
              onClick={(event) => event.stopPropagation()}
            />
          ) : (
            <span className="min-w-0 flex-1 truncate text-sm">{entity.name}</span>
          )}

          {isCharacterBuilderActor && (
            <span className="rounded border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0 text-[10px] text-cyan-200">
              CB3D
            </span>
          )}

          {memberships.length > 0 && (
            <div className="hidden items-center gap-1 xl:flex">
              {memberships.slice(0, 2).map((collection) => (
                <span
                  key={collection.id}
                  className="rounded border px-1 py-0 text-[10px]"
                  style={{ borderColor: `${collection.color}66`, color: collection.color }}
                >
                  {collection.name}
                </span>
              ))}
              {memberships.length > 2 && (
                <span className="text-[10px] text-slate-500">+{memberships.length - 2}</span>
              )}
            </div>
          )}

          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
            {isCharacterBuilderActor && (
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  setActivePanel('character');
                }}
                className="rounded p-0.5 hover:bg-slate-600"
                title="Abrir Character Builder"
              >
                <Sparkles className="h-3 w-3 text-cyan-300" />
              </button>
            )}
            <button
              onClick={(event) => {
                event.stopPropagation();
                updateEntity(entity.id, { active: !entity.active });
              }}
              className="rounded p-0.5 hover:bg-slate-600"
              title={entity.active ? 'Deactivate' : 'Activate'}
            >
              {entity.active ? (
                <Eye className="h-3 w-3 text-slate-400" />
              ) : (
                <EyeOff className="h-3 w-3 text-slate-500" />
              )}
            </button>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                onClick={(event) => event.stopPropagation()}
                className="rounded p-0.5 opacity-0 hover:bg-slate-600 group-hover:opacity-100"
              >
                <MoreHorizontal className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 border-slate-700 bg-slate-800">
              <DropdownMenuItem onClick={() => handleCreateEntity('empty', entity.id)}>
                <Plus className="mr-2 h-3.5 w-3.5" />
                Add Child
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleRename(entity)}>
                <MousePointer className="mr-2 h-3.5 w-3.5" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleDuplicate(entity)}>
                <Copy className="mr-2 h-3.5 w-3.5" />
                Duplicate
              </DropdownMenuItem>
              {isCharacterBuilderActor && (
                <DropdownMenuItem onClick={() => setActivePanel('character')}>
                  <Sparkles className="mr-2 h-3.5 w-3.5" />
                  Abrir Character
                </DropdownMenuItem>
              )}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Layers3 className="mr-2 h-3.5 w-3.5" />
                  Collections
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="border-slate-700 bg-slate-800">
                  {sceneCollections.length === 0 && (
                    <DropdownMenuItem onClick={handleCreateCollection}>
                      Create collection
                    </DropdownMenuItem>
                  )}
                  {sceneCollections.map((collection) => (
                    <DropdownMenuCheckboxItem
                      key={collection.id}
                      checked={collection.entityIds.includes(entity.id)}
                      onCheckedChange={() => toggleEntityCollectionMembership(entity.id, collection.id)}
                    >
                      <span
                        className="mr-2 inline-flex h-2 w-2 rounded-full"
                        style={{ backgroundColor: collection.color }}
                      />
                      {collection.name}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => removeEntity(entity.id)}
                className="text-red-400 focus:text-red-300"
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {isDragOver && dragOverPosition === 'after' && (
          <div className="mx-2 h-0.5 rounded bg-blue-500" />
        )}

        {hasChildren && isExpanded && (
          <div>{entity.children.map((child) => renderEntity(child, depth + 1))}</div>
        )}
      </div>
    );
  };

  const rootEntities = activeScene?.entities.filter((entity) => !entity.parentId) ?? [];

  return (
    <div className="flex h-full flex-col bg-slate-800/50">
      <div className="border-b border-slate-700 px-3 py-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-slate-200">Outliner</h3>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={handleCreateCollection}>
              <Layers3 className="mr-1 h-3.5 w-3.5" />
              Collection
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                  <Plus className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 border-slate-700 bg-slate-800">
                <DropdownMenuItem onClick={() => handleCreateEntity('empty')}>Empty Object</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleCreateEntity('cube')}>Cube</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleCreateEntity('sphere')}>Sphere</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleCreateEntity('cylinder')}>Cylinder</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleCreateEntity('plane')}>Plane</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleCreateEntity('light')}>Light</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleCreateEntity('camera')}>Camera</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleCreateEntity('audio')}>Audio Source</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="mt-2 flex items-center gap-2">
          <Select
            value={activeSceneId ?? '__none__'}
            onValueChange={(value) => {
              if (value === '__new__') {
                createScene(`Scene ${scenes.length + 1}`);
                return;
              }
              if (value !== '__none__') {
                setActiveScene(value);
              }
            }}
          >
            <SelectTrigger className="h-8 border-slate-700 bg-slate-900 text-xs">
              <SelectValue placeholder="Select scene" />
            </SelectTrigger>
            <SelectContent className="border-slate-700 bg-slate-800">
              <SelectItem value="__none__">Select scene</SelectItem>
              {scenes.map((scene) => (
                <SelectItem key={scene.id} value={scene.id}>
                  {scene.name}
                </SelectItem>
              ))}
              <SelectItem value="__new__">+ New Scene</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="border-b border-slate-700/50 px-2 py-1">
        <Input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search objects or collections..."
          className="h-7 border-slate-700 bg-slate-900 text-xs"
        />
      </div>

      <div className="border-b border-slate-700/50 px-2 py-2">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-wide text-slate-400">Collections</span>
          <button
            onClick={handleCreateCollection}
            className="text-[11px] text-blue-300 hover:text-blue-200"
          >
            + Add
          </button>
        </div>

        <div className="space-y-1">
          <button
            onClick={() => setCollectionFilterId(null)}
            className={cn(
              'flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-xs transition-colors',
              collectionFilterId === null
                ? 'bg-blue-500/20 text-blue-200'
                : 'text-slate-300 hover:bg-slate-700/50'
            )}
          >
            <span>All Objects</span>
            <span className="text-slate-500">{activeScene?.entities.length ?? 0}</span>
          </button>

          {sceneCollections.map((collection) => (
            <div
              key={collection.id}
              className={cn(
                'group flex items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors',
                collectionFilterId === collection.id
                  ? 'bg-blue-500/20 text-blue-200'
                  : 'text-slate-300 hover:bg-slate-700/50'
              )}
            >
              <button
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                onClick={() =>
                  setCollectionFilterId((current) => (current === collection.id ? null : collection.id))
                }
              >
                <span
                  className="inline-flex h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: collection.color }}
                />
                <span className="truncate">{collection.name}</span>
              </button>

              <span className="text-[10px] text-slate-500">{collection.entityIds.length}</span>

              <button
                onClick={(event) => {
                  event.stopPropagation();
                  toggleCollectionVisibility(collection.id);
                }}
                className="rounded p-0.5 hover:bg-slate-600"
                title={collection.visible === false ? 'Show collection' : 'Hide collection'}
              >
                {collection.visible === false ? (
                  <EyeOff className="h-3 w-3 text-slate-500" />
                ) : (
                  <Eye className="h-3 w-3 text-slate-400" />
                )}
              </button>

              {editor.selectedEntities.length > 0 && (
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    assignSelectionToCollection(collection.id);
                  }}
                  className="rounded p-0.5 opacity-0 hover:bg-slate-600 group-hover:opacity-100"
                  title="Add selection"
                >
                  <Plus className="h-3 w-3 text-slate-400" />
                </button>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    onClick={(event) => event.stopPropagation()}
                    className="rounded p-0.5 opacity-0 hover:bg-slate-600 group-hover:opacity-100"
                  >
                    <MoreHorizontal className="h-3 w-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44 border-slate-700 bg-slate-800">
                  <DropdownMenuItem onClick={() => assignSelectionToCollection(collection.id)}>
                    Add selection
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleRenameCollection(collection.id)}>
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleDeleteCollection(collection.id)}
                    className="text-red-400 focus:text-red-300"
                  >
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      </div>

      <div className="border-b border-slate-700/50 px-2 py-1 text-xs">
        <button
          onClick={() => setShowInactive(!showInactive)}
          className={cn(
            'flex items-center gap-1.5 rounded px-2 py-1 transition-colors',
            showInactive ? 'bg-blue-500/20 text-blue-300' : 'text-slate-400 hover:text-slate-200'
          )}
        >
          {showInactive ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          Show Inactive
        </button>
      </div>

      <ScrollArea className="flex-1">
        <div className="py-1">
          {rootEntities.filter((entity) => shouldRenderEntity(entity)).length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              <Folder className="mx-auto mb-2 h-8 w-8 opacity-50" />
              No objects in scene
              <p className="mt-1 text-xs">Create a scene object or clear filters</p>
            </div>
          ) : (
            rootEntities
              .filter((entity) => shouldRenderEntity(entity))
              .map((entity) => renderEntity(entity))
          )}
        </div>
      </ScrollArea>

      <div className="border-t border-slate-700/50 px-2 py-1 text-[10px] text-slate-500">
        {activeScene?.entities.length ?? 0} objects
        {editor.selectedEntities.length > 0 && ` • ${editor.selectedEntities.length} selected`}
        {collectionFilterId && ` • filtered by ${sceneCollections.find((item) => item.id === collectionFilterId)?.name ?? 'collection'}`}
      </div>
    </div>
  );
}
