import { describe, expect, it } from 'vitest';
import type {
  CharacterBuilderSnapshot,
  CharacterPartMetadata,
} from '@/engine/character-builder';
import {
  buildCharacterBuilderPresetFromSceneData,
  buildCharacterBuilderSceneData,
  CHARACTER_BUILDER_SCENE_NAME,
  CHARACTER_BUILDER_SCENE_TAG,
  createCharacterBuilderSceneEntity,
} from '@/engine/editor/characterBuilderSceneSync';

function createPart(
  overrides: Partial<CharacterPartMetadata>
): CharacterPartMetadata {
  return {
    id: 'part_default',
    name: 'Part Default',
    category: 'body',
    modelPath: '/library/default.glb',
    thumbnailPath: '/library/default.preview.png',
    metadataPath: null,
    skeletonId: 'human_base_v1',
    bodyType: 'unisex_medium',
    attachmentSocket: 'root_socket',
    enabled: true,
    tags: [],
    isBaseBody: false,
    polycount: null,
    notes: null,
    source: 'test-suite',
    materialVariants: [],
    colorVariants: [],
    ...overrides,
  };
}

function createSnapshot(): CharacterBuilderSnapshot {
  const baseBody = createPart({
    id: 'body_a',
    name: 'Body A',
    category: 'body',
    isBaseBody: true,
    materialVariants: [{ id: 'skin_tan', label: 'Tan', swatch: '#cf9f72' }],
    colorVariants: [{ id: 'eyes_green', label: 'Green', swatch: '#4ade80' }],
  });
  const hoodie = createPart({
    id: 'hoodie_a',
    name: 'Hoodie A',
    category: 'outfit',
    modelPath: '/library/hoodie.glb',
    thumbnailPath: '/library/hoodie.preview.png',
    attachmentSocket: 'torso_socket',
    materialVariants: [{ id: 'hoodie_mint', label: 'Mint', swatch: '#67e8f9' }],
  });

  return {
    selectedCategory: 'body',
    filters: {
      searchQuery: '',
      bodyType: null,
      tag: null,
    },
    categories: [],
    filteredParts: [],
    equippedParts: {
      body: baseBody,
      outfit: hoodie,
    },
    baseBody,
    presets: [],
    dragDrop: {
      enabled: true,
      draggingPartId: null,
      hoveredCategory: null,
      highlightedCategories: [],
    },
    preview: {
      yaw: 0.4,
      pitch: 0.1,
      zoom: 3.6,
    },
    previewModelPaths: ['/library/mannequin_a.glb', '/library/hoodie.glb'],
    tags: [],
    materialSelections: {
      body: 'skin_tan',
      outfit: 'hoodie_mint',
    },
    colorSelections: {
      body: 'eyes_green',
    },
    errorReports: [],
  };
}

describe('character builder scene sync', () => {
  it('builds stable scene data from the active character assembly', () => {
    const sceneData = buildCharacterBuilderSceneData(createSnapshot());

    expect(sceneData).not.toBeNull();
    expect(sceneData?.baseBodyId).toBe('body_a');
    expect(sceneData?.skeletonId).toBe('human_base_v1');
    expect(sceneData?.focusedCategory).toBe('body');
    expect(sceneData?.hoveredCategory).toBeNull();
    expect(sceneData?.parts).toHaveLength(2);
    expect(sceneData?.parts[0]).toMatchObject({
      category: 'body',
      partId: 'body_a',
      materialVariantId: 'skin_tan',
      colorVariantId: 'eyes_green',
      materialSwatch: '#cf9f72',
      colorSwatch: '#4ade80',
    });
    expect(sceneData?.parts[1]).toMatchObject({
      category: 'outfit',
      partId: 'hoodie_a',
      attachmentSocket: 'torso_socket',
      materialVariantId: 'hoodie_mint',
      materialSwatch: '#67e8f9',
    });
  });

  it('creates a dedicated scene entity with a character builder payload', () => {
    const sceneData = buildCharacterBuilderSceneData(createSnapshot());
    expect(sceneData).not.toBeNull();

    const entity = createCharacterBuilderSceneEntity(sceneData!);
    const meshRenderer = entity.components.get('MeshRenderer');

    expect(entity.name).toBe(CHARACTER_BUILDER_SCENE_NAME);
    expect(entity.tags).toContain(CHARACTER_BUILDER_SCENE_TAG);
    expect(meshRenderer?.data).toMatchObject({
      meshId: 'capsule',
      materialId: 'default',
    });
    expect(
      (
        meshRenderer?.data as {
          characterBuilder?: {
            focusedCategory?: string | null;
            hoveredCategory?: string | null;
          };
        }
      ).characterBuilder?.focusedCategory
    ).toBe('body');
    expect(
      (
        meshRenderer?.data as {
          characterBuilder?: {
            focusedCategory?: string | null;
            hoveredCategory?: string | null;
          };
        }
      ).characterBuilder?.hoveredCategory
    ).toBeNull();
    expect(
      (meshRenderer?.data as { characterBuilder?: { parts?: unknown[] } }).characterBuilder?.parts
    ).toHaveLength(2);
  });

  it('persists hovered drop zone into the scene payload while dragging', () => {
    const snapshot = createSnapshot();
    snapshot.dragDrop.hoveredCategory = 'outfit';

    const sceneData = buildCharacterBuilderSceneData(snapshot);

    expect(sceneData?.focusedCategory).toBe('body');
    expect(sceneData?.hoveredCategory).toBe('outfit');
  });

  it('converts scene data back into a preset for panel hydration', () => {
    const sceneData = buildCharacterBuilderSceneData(createSnapshot());
    expect(sceneData).not.toBeNull();

    const preset = buildCharacterBuilderPresetFromSceneData(sceneData!);

    expect(preset.baseBodyId).toBe('body_a');
    expect(preset.parts).toMatchObject({
      outfit: 'hoodie_a',
    });
    expect(preset.materialVariants).toMatchObject({
      body: 'skin_tan',
      outfit: 'hoodie_mint',
    });
    expect(preset.colorVariants).toMatchObject({
      body: 'eyes_green',
    });
  });
});
