import {
  type AgenticComponentType,
  type AgenticEntity,
  type JsonObject,
  type ToolDefinition,
} from '../schemas';
import { failToolResult, okToolResult } from './toolResult';

function componentType(value: unknown): AgenticComponentType {
  return typeof value === 'string' ? (value as AgenticComponentType) : 'Transform';
}

export function createEntityTools(): ToolDefinition[] {
  return [
    {
      name: 'entity.create',
      description: 'Create an entity in the active scene.',
      capabilities: ['entity.create'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        const result = context.world.createEntity({
          sceneId: typeof input.sceneId === 'string' ? input.sceneId : undefined,
          name: typeof input.name === 'string' ? input.name : 'Entity',
          type: typeof input.type === 'string' ? (input.type as AgenticEntity['type']) : 'empty',
          tags: Array.isArray(input.tags)
            ? input.tags.filter((tag): tag is string => typeof tag === 'string')
            : [],
          metadata:
            input.metadata && typeof input.metadata === 'object'
              ? (input.metadata as JsonObject)
              : {},
        });
        return okToolResult(context.call, `Entity "${result.entity.name}" created.`, [result.evidence], {
          entityId: result.entity.id,
        });
      },
    },
    {
      name: 'entity.assignComponent',
      description: 'Assign a typed component to an entity.',
      capabilities: ['entity.component'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        if (typeof input.entityId !== 'string') {
          return failToolResult(context.call, 'INVALID_INPUT', 'entity.assignComponent requires entityId.');
        }
        const result = context.world.addComponent(
          input.entityId,
          componentType(input.componentType),
          input.data && typeof input.data === 'object' ? (input.data as JsonObject) : {}
        );
        return okToolResult(context.call, 'Component assigned.', [result.evidence], {
          entityId: input.entityId,
          componentId: result.component.id,
        });
      },
    },
    {
      name: 'entity.editTransform',
      description: 'Edit an entity transform.',
      capabilities: ['entity.transform'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        if (typeof input.entityId !== 'string') {
          return failToolResult(context.call, 'INVALID_INPUT', 'entity.editTransform requires entityId.');
        }
        const evidence = context.world.updateEntityTransform(
          input.entityId,
          input.transform && typeof input.transform === 'object' ? (input.transform as never) : {}
        );
        return okToolResult(context.call, 'Entity transform edited.', [evidence], {
          entityId: input.entityId,
        });
      },
    },
    {
      name: 'entity.editHierarchy',
      description: 'Parent or unparent an entity.',
      capabilities: ['entity.hierarchy'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        if (typeof input.entityId !== 'string') {
          return failToolResult(context.call, 'INVALID_INPUT', 'entity.editHierarchy requires entityId.');
        }
        const parentId = typeof input.parentId === 'string' ? input.parentId : null;
        const evidence = context.world.setParent(input.entityId, parentId);
        return okToolResult(context.call, 'Entity hierarchy edited.', [evidence], {
          entityId: input.entityId,
          parentId: parentId ?? '',
        });
      },
    },
  ];
}
