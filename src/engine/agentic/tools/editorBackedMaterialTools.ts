import type { EditorSceneStoreAdapter } from './adapters/sceneStoreAdapter';
import { failToolResult, okToolResult } from './toolResult';
import { type ColorRGBA, type JsonObject, type ToolDefinition } from '../schemas';

function colorFromInput(value: unknown, fallback: ColorRGBA): ColorRGBA {
  if (!value || typeof value !== 'object') {
    return fallback;
  }
  return { ...fallback, ...(value as Partial<ColorRGBA>) };
}

function metadataFromInput(value: unknown): JsonObject {
  return value && typeof value === 'object' ? (value as JsonObject) : {};
}

export function createEditorBackedMaterialTools(adapter: EditorSceneStoreAdapter): ToolDefinition[] {
  return [
    {
      name: 'material.create',
      description: 'Create a material asset in the editor store and mirror it into WorldState.',
      capabilities: ['material.create'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        const result = adapter.createMaterial(context.world, {
          materialId: typeof input.materialId === 'string' ? input.materialId : undefined,
          name: typeof input.name === 'string' ? input.name : 'Agentic Material',
          color: colorFromInput(input.color, { r: 1, g: 1, b: 1, a: 1 }),
          roughness: typeof input.roughness === 'number' ? input.roughness : 0.5,
          metallic: typeof input.metallic === 'number' ? input.metallic : 0,
          entityId: typeof input.entityId === 'string' ? input.entityId : undefined,
          metadata: metadataFromInput(input.metadata),
        });
        return okToolResult(context.call, 'Editor material created.', result.evidence, {
          materialId: result.materialId,
        });
      },
    },
    {
      name: 'material.change',
      description: 'Change a material asset and optionally apply it to an editor entity.',
      capabilities: ['material.change'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        if (typeof input.materialId !== 'string') {
          return failToolResult(context.call, 'INVALID_INPUT', 'material.change requires materialId.');
        }
        const evidence = adapter.updateMaterial(context.world, input.materialId, {
          name: typeof input.name === 'string' ? input.name : undefined,
          color: input.color ? colorFromInput(input.color, { r: 1, g: 1, b: 1, a: 1 }) : undefined,
          roughness: typeof input.roughness === 'number' ? input.roughness : undefined,
          metallic: typeof input.metallic === 'number' ? input.metallic : undefined,
          entityId: typeof input.entityId === 'string' ? input.entityId : undefined,
          metadata: metadataFromInput(input.metadata),
        });
        return okToolResult(context.call, 'Editor material changed.', evidence, {
          materialId: input.materialId,
        });
      },
    },
  ];
}
