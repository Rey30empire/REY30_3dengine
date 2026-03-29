import { describe, expect, it } from 'vitest';
import {
  buildEntityThumbnailKey,
  createMeshRendererThumbnailEntity,
} from '@/engine/editor/visualThumbnails';

describe('visual thumbnail helpers', () => {
  it('builds deterministic keys for the same entity signature', () => {
    const entity = createMeshRendererThumbnailEntity({
      idSeed: 'thumb_default',
      name: 'Default',
      meshRendererData: {
        meshId: 'sphere',
        materialId: 'default',
      },
    });

    expect(buildEntityThumbnailKey(entity, 'material')).toBe(
      buildEntityThumbnailKey(entity, 'material')
    );
  });

  it('changes the key when the rendered material changes', () => {
    const left = createMeshRendererThumbnailEntity({
      idSeed: 'thumb_left',
      name: 'Left',
      meshRendererData: {
        meshId: 'sphere',
        materialId: 'default',
      },
    });
    const right = createMeshRendererThumbnailEntity({
      idSeed: 'thumb_right',
      name: 'Right',
      meshRendererData: {
        meshId: 'sphere',
        materialId: 'metal',
      },
    });

    expect(buildEntityThumbnailKey(left, 'material')).not.toBe(
      buildEntityThumbnailKey(right, 'material')
    );
  });

  it('creates a lightweight entity with a mesh renderer component', () => {
    const entity = createMeshRendererThumbnailEntity({
      idSeed: 'thumb_entity',
      name: 'Preview Mesh',
      meshRendererData: {
        meshId: 'cube',
        materialId: 'default',
      },
    });

    expect(entity.name).toBe('Preview Mesh');
    expect(entity.active).toBe(true);
    expect(entity.children).toEqual([]);
    expect(entity.components.get('MeshRenderer')?.data).toMatchObject({
      meshId: 'cube',
      materialId: 'default',
    });
  });

  it('changes the thumbnail key when a character builder assembly changes', () => {
    const left = createMeshRendererThumbnailEntity({
      idSeed: 'thumb_character_left',
      name: 'Character Left',
      meshRendererData: {
        meshId: 'capsule',
        materialId: 'default',
        characterBuilder: {
          version: 1,
          source: 'character-builder-panel',
          baseBodyId: 'body_a',
          skeletonId: 'human_base_v1',
          bodyType: 'unisex_medium',
          parts: [
            {
              category: 'body',
              partId: 'body_a',
              label: 'Body A',
              modelPath: '/library/mannequin_a.glb',
              attachmentSocket: 'root_socket',
              materialVariantId: 'skin_tan',
              materialSwatch: '#cf9f72',
              colorVariantId: 'eyes_green',
              colorSwatch: '#4ade80',
            },
          ],
        },
      },
    });
    const right = createMeshRendererThumbnailEntity({
      idSeed: 'thumb_character_right',
      name: 'Character Right',
      meshRendererData: {
        meshId: 'capsule',
        materialId: 'default',
        characterBuilder: {
          version: 1,
          source: 'character-builder-panel',
          baseBodyId: 'body_a',
          skeletonId: 'human_base_v1',
          bodyType: 'unisex_medium',
          parts: [
            {
              category: 'body',
              partId: 'body_a',
              label: 'Body A',
              modelPath: '/library/mannequin_a.glb',
              attachmentSocket: 'root_socket',
              materialVariantId: 'skin_tan',
              materialSwatch: '#cf9f72',
              colorVariantId: 'eyes_green',
              colorSwatch: '#4ade80',
            },
            {
              category: 'outfit',
              partId: 'hoodie_a',
              label: 'Hoodie A',
              modelPath: '/library/hoodie.glb',
              attachmentSocket: 'torso_socket',
              materialVariantId: 'hoodie_mint',
              materialSwatch: '#67e8f9',
              colorVariantId: null,
              colorSwatch: null,
            },
          ],
        },
      },
    });

    expect(buildEntityThumbnailKey(left, 'character')).not.toBe(
      buildEntityThumbnailKey(right, 'character')
    );
  });

  it('changes the thumbnail key when the focused character slot changes', () => {
    const left = createMeshRendererThumbnailEntity({
      idSeed: 'thumb_character_focus_left',
      name: 'Character Focus Left',
      meshRendererData: {
        meshId: 'capsule',
        materialId: 'default',
        characterBuilder: {
          version: 1,
          source: 'character-builder-panel',
          baseBodyId: 'body_a',
          skeletonId: 'human_base_v1',
          bodyType: 'unisex_medium',
          focusedCategory: 'torso',
          parts: [
            {
              category: 'body',
              partId: 'body_a',
              label: 'Body A',
              modelPath: '/library/mannequin_a.glb',
              attachmentSocket: 'root_socket',
              materialVariantId: 'skin_tan',
              materialSwatch: '#cf9f72',
              colorVariantId: 'eyes_green',
              colorSwatch: '#4ade80',
            },
          ],
        },
      },
    });
    const right = createMeshRendererThumbnailEntity({
      idSeed: 'thumb_character_focus_right',
      name: 'Character Focus Right',
      meshRendererData: {
        meshId: 'capsule',
        materialId: 'default',
        characterBuilder: {
          version: 1,
          source: 'character-builder-panel',
          baseBodyId: 'body_a',
          skeletonId: 'human_base_v1',
          bodyType: 'unisex_medium',
          focusedCategory: 'shoes',
          parts: [
            {
              category: 'body',
              partId: 'body_a',
              label: 'Body A',
              modelPath: '/library/mannequin_a.glb',
              attachmentSocket: 'root_socket',
              materialVariantId: 'skin_tan',
              materialSwatch: '#cf9f72',
              colorVariantId: 'eyes_green',
              colorSwatch: '#4ade80',
            },
          ],
        },
      },
    });

    expect(buildEntityThumbnailKey(left, 'character')).not.toBe(
      buildEntityThumbnailKey(right, 'character')
    );
  });

  it('changes the thumbnail key when the hovered drag target changes', () => {
    const left = createMeshRendererThumbnailEntity({
      idSeed: 'thumb_character_hover_left',
      name: 'Character Hover Left',
      meshRendererData: {
        meshId: 'capsule',
        materialId: 'default',
        characterBuilder: {
          version: 1,
          source: 'character-builder-panel',
          baseBodyId: 'body_a',
          skeletonId: 'human_base_v1',
          bodyType: 'unisex_medium',
          focusedCategory: 'body',
          hoveredCategory: 'torso',
          parts: [
            {
              category: 'body',
              partId: 'body_a',
              label: 'Body A',
              modelPath: '/library/mannequin_a.glb',
              attachmentSocket: 'root_socket',
              materialVariantId: 'skin_tan',
              materialSwatch: '#cf9f72',
              colorVariantId: 'eyes_green',
              colorSwatch: '#4ade80',
            },
          ],
        },
      },
    });
    const right = createMeshRendererThumbnailEntity({
      idSeed: 'thumb_character_hover_right',
      name: 'Character Hover Right',
      meshRendererData: {
        meshId: 'capsule',
        materialId: 'default',
        characterBuilder: {
          version: 1,
          source: 'character-builder-panel',
          baseBodyId: 'body_a',
          skeletonId: 'human_base_v1',
          bodyType: 'unisex_medium',
          focusedCategory: 'body',
          hoveredCategory: 'shoes',
          parts: [
            {
              category: 'body',
              partId: 'body_a',
              label: 'Body A',
              modelPath: '/library/mannequin_a.glb',
              attachmentSocket: 'root_socket',
              materialVariantId: 'skin_tan',
              materialSwatch: '#cf9f72',
              colorVariantId: 'eyes_green',
              colorSwatch: '#4ade80',
            },
          ],
        },
      },
    });

    expect(buildEntityThumbnailKey(left, 'character')).not.toBe(
      buildEntityThumbnailKey(right, 'character')
    );
  });
});
