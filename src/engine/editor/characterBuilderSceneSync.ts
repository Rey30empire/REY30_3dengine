import type {
  CharacterBuilderSnapshot,
  CharacterPartCategory,
  CharacterPreset,
} from '@/engine/character-builder';
import { CHARACTER_PART_CATEGORIES } from '@/engine/character-builder';
import { useEngineStore } from '@/store/editorStore';
import { findSceneIdForEntity } from '@/store/sceneGraph';
import type { Component, Entity } from '@/types/engine';

export const CHARACTER_BUILDER_SCENE_TAG = 'character-builder:live';
export const CHARACTER_BUILDER_SCENE_NAME = 'Character Builder Actor';

export interface CharacterBuilderScenePartData {
  category: CharacterPartCategory;
  partId: string;
  label: string;
  modelPath: string;
  attachmentSocket: string;
  materialVariantId: string | null;
  materialSwatch: string | null;
  colorVariantId: string | null;
  colorSwatch: string | null;
}

export interface CharacterBuilderSceneData {
  version: 1;
  source: 'character-builder-panel';
  baseBodyId: string | null;
  skeletonId: string | null;
  bodyType: string | null;
  focusedCategory: CharacterPartCategory | null;
  hoveredCategory: CharacterPartCategory | null;
  parts: CharacterBuilderScenePartData[];
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : '';
}

function readNullableString(value: unknown) {
  const normalized = readString(value);
  return normalized.length > 0 ? normalized : null;
}

function readCharacterPartCategory(value: unknown) {
  const category = readNullableString(value);
  if (!category) {
    return null;
  }
  return CHARACTER_PART_CATEGORIES.includes(category as CharacterPartCategory)
    ? (category as CharacterPartCategory)
    : null;
}

export function readCharacterBuilderSceneData(
  value: unknown
): CharacterBuilderSceneData | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const parts = Array.isArray(record.parts)
    ? record.parts.reduce<CharacterBuilderScenePartData[]>((acc, part) => {
        if (!part || typeof part !== 'object') {
          return acc;
        }
        const partRecord = part as Record<string, unknown>;
        const category = readString(partRecord.category);
        const partId = readString(partRecord.partId ?? partRecord.id);
        const modelPath = readString(partRecord.modelPath);
        if (!category || !partId || !modelPath) {
          return acc;
        }

        acc.push({
          category: category as CharacterPartCategory,
          partId,
          label: readString(partRecord.label ?? partRecord.name) || partId,
          modelPath,
          attachmentSocket: readString(partRecord.attachmentSocket),
          materialVariantId: readNullableString(partRecord.materialVariantId),
          materialSwatch: readNullableString(partRecord.materialSwatch),
          colorVariantId: readNullableString(partRecord.colorVariantId),
          colorSwatch: readNullableString(partRecord.colorSwatch),
        });
        return acc;
      }, [])
    : [];

  if (parts.length === 0) {
    return null;
  }

  return {
    version: 1,
    source: 'character-builder-panel',
    baseBodyId: readNullableString(record.baseBodyId),
    skeletonId: readNullableString(record.skeletonId),
    bodyType: readNullableString(record.bodyType),
    focusedCategory: readCharacterPartCategory(record.focusedCategory),
    hoveredCategory: readCharacterPartCategory(record.hoveredCategory),
    parts,
  };
}

export function readCharacterBuilderSceneDataFromEntity(entity: Entity | null | undefined) {
  if (!entity) return null;
  const meshRendererData = entity.components.get('MeshRenderer')?.data as
    | Record<string, unknown>
    | undefined;
  return readCharacterBuilderSceneData(meshRendererData?.characterBuilder);
}

export function buildCharacterBuilderSceneSignature(
  sceneData: CharacterBuilderSceneData | null | undefined
) {
  if (!sceneData) {
    return 'character-builder:none';
  }

  return JSON.stringify({
    baseBodyId: sceneData.baseBodyId,
    skeletonId: sceneData.skeletonId,
    bodyType: sceneData.bodyType,
    focusedCategory: sceneData.focusedCategory,
    hoveredCategory: sceneData.hoveredCategory,
    parts: sceneData.parts.map((part) => ({
      category: part.category,
      partId: part.partId,
      materialVariantId: part.materialVariantId,
      materialSwatch: part.materialSwatch,
      colorVariantId: part.colorVariantId,
      colorSwatch: part.colorSwatch,
    })),
  });
}

export function buildCharacterBuilderPresetFromSceneData(
  sceneData: CharacterBuilderSceneData
): CharacterPreset {
  const parts = sceneData.parts.reduce<Partial<Record<CharacterPartCategory, string>>>(
    (acc, part) => {
      if (part.category !== 'body') {
        acc[part.category] = part.partId;
      }
      return acc;
    },
    {}
  );

  const materialVariants = sceneData.parts.reduce<
    Partial<Record<CharacterPartCategory, string>>
  >((acc, part) => {
    if (part.materialVariantId) {
      acc[part.category] = part.materialVariantId;
    }
    return acc;
  }, {});

  const colorVariants = sceneData.parts.reduce<
    Partial<Record<CharacterPartCategory, string>>
  >((acc, part) => {
    if (part.colorVariantId) {
      acc[part.category] = part.colorVariantId;
    }
    return acc;
  }, {});

  return {
    baseBodyId: sceneData.baseBodyId,
    parts,
    materialVariants,
    colorVariants,
    colors: colorVariants,
  };
}

function normalizeSwatch(value: string | null | undefined) {
  const normalized = value?.trim() ?? '';
  return normalized.length > 0 ? normalized : null;
}

export function buildCharacterBuilderSceneData(
  snapshot: CharacterBuilderSnapshot
): CharacterBuilderSceneData | null {
  const baseBody = snapshot.baseBody;
  if (!baseBody) {
    return null;
  }

  const parts = CHARACTER_PART_CATEGORIES.reduce<CharacterBuilderScenePartData[]>(
    (acc, category) => {
      const part = snapshot.equippedParts[category];
      if (!part) return acc;

      const selectedMaterialVariant = part.materialVariants.find(
        (variant) => variant.id === snapshot.materialSelections[category]
      );
      const selectedColorVariant = part.colorVariants.find(
        (variant) => variant.id === snapshot.colorSelections[category]
      );

      acc.push({
        category,
        partId: part.id,
        label: part.name,
        modelPath: part.modelPath,
        attachmentSocket: part.attachmentSocket,
        materialVariantId: selectedMaterialVariant?.id ?? null,
        materialSwatch: normalizeSwatch(selectedMaterialVariant?.swatch),
        colorVariantId: selectedColorVariant?.id ?? null,
        colorSwatch: normalizeSwatch(selectedColorVariant?.swatch),
      });

      return acc;
    },
    []
  );

  if (parts.length === 0) {
    return null;
  }

  return {
    version: 1,
    source: 'character-builder-panel',
    baseBodyId: baseBody.id,
    skeletonId: baseBody.skeletonId,
    bodyType: baseBody.bodyType,
    focusedCategory: snapshot.selectedCategory,
    hoveredCategory: snapshot.dragDrop.hoveredCategory,
    parts,
  };
}

export function isCharacterBuilderSceneEntity(entity: Entity) {
  return entity.tags.includes(CHARACTER_BUILDER_SCENE_TAG);
}

export function findCharacterBuilderSceneEntity(entities: Iterable<Entity>) {
  for (const entity of entities) {
    if (isCharacterBuilderSceneEntity(entity)) {
      return entity;
    }
  }
  return null;
}

function createCharacterBuilderMeshRendererData(
  renderData: CharacterBuilderSceneData
) {
  return {
    meshId: 'capsule',
    materialId: 'default',
    castShadows: true,
    receiveShadows: true,
    characterBuilder: renderData,
  };
}

function ensureCharacterBuilderTags(existingTags: string[]) {
  return Array.from(
    new Set([
      ...existingTags,
      'character',
      CHARACTER_BUILDER_SCENE_TAG,
    ])
  );
}

function createTransformComponent() {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `char_builder_transform_${Date.now()}`,
    type: 'Transform' as const,
    enabled: true,
    data: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
    },
  };
}

function createMeshRendererComponent(renderData: CharacterBuilderSceneData) {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `char_builder_mesh_${Date.now()}`,
    type: 'MeshRenderer' as const,
    enabled: true,
    data: createCharacterBuilderMeshRendererData(renderData),
  };
}

export function createCharacterBuilderSceneEntity(renderData: CharacterBuilderSceneData): Entity {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `char_builder_entity_${Date.now()}`,
    name: CHARACTER_BUILDER_SCENE_NAME,
    components: new Map<string, Component>([
      ['Transform', createTransformComponent()],
      ['MeshRenderer', createMeshRendererComponent(renderData)],
    ]),
    children: [],
    parentId: null,
    active: true,
    tags: ['character', CHARACTER_BUILDER_SCENE_TAG],
  };
}

function buildUpdatedCharacterBuilderEntity(
  existing: Entity,
  renderData: CharacterBuilderSceneData
) {
  const nextComponents = new Map(existing.components);
  const existingTransform = nextComponents.get('Transform');
  const existingMeshRenderer = nextComponents.get('MeshRenderer');

  if (!existingTransform) {
    nextComponents.set('Transform', createTransformComponent());
  }

  nextComponents.set('MeshRenderer', {
    id:
      existingMeshRenderer?.id ??
      globalThis.crypto?.randomUUID?.() ??
      `char_builder_mesh_${Date.now()}`,
    type: 'MeshRenderer',
    enabled: true,
    data: {
      ...(existingMeshRenderer?.data ?? {}),
      ...createCharacterBuilderMeshRendererData(renderData),
    },
  });

  return {
    ...existing,
    name: CHARACTER_BUILDER_SCENE_NAME,
    active: true,
    tags: ensureCharacterBuilderTags(existing.tags),
    components: nextComponents,
  } satisfies Entity;
}

export function syncCharacterBuilderSnapshotToStore(
  snapshot: CharacterBuilderSnapshot
) {
  const store = useEngineStore.getState();
  const renderData = buildCharacterBuilderSceneData(snapshot);
  const existing = findCharacterBuilderSceneEntity(store.entities.values());

  if (!renderData) {
    if (existing && existing.active) {
      store.updateEntity(existing.id, { active: false });
      return existing.id;
    }
    return existing?.id ?? null;
  }

  if (!store.activeSceneId) {
    store.createScene('Escena Principal');
  }

  if (!existing) {
    const entity = createCharacterBuilderSceneEntity(renderData);
    store.addEntity(entity);
    return entity.id;
  }

  const nextEntity = buildUpdatedCharacterBuilderEntity(existing, renderData);
  const existingSceneId = findSceneIdForEntity(store.scenes, existing.id);
  const activeSceneId = useEngineStore.getState().activeSceneId;

  if (activeSceneId && existingSceneId && existingSceneId !== activeSceneId) {
    store.removeEntity(existing.id);
    store.addEntity({
      ...nextEntity,
      parentId: null,
      children: [],
    });
    return nextEntity.id;
  }

  store.updateEntity(existing.id, {
    name: nextEntity.name,
    active: nextEntity.active,
    tags: nextEntity.tags,
    components: nextEntity.components,
  });
  return existing.id;
}
