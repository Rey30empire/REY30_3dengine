import { type JsonObject, type ToolDefinition, type Vector3 } from '../schemas';
import { failToolResult, okToolResult } from './toolResult';

function getSceneId(input: JsonObject, contextSceneId: string | null): string | null {
  return typeof input.sceneId === 'string' ? input.sceneId : contextSceneId;
}

function asVector(value: unknown): Partial<{ position: Vector3; rotation: Vector3; scale: Vector3 }> {
  if (!value || typeof value !== 'object') {
    return {};
  }
  return value as Partial<{ position: Vector3; rotation: Vector3; scale: Vector3 }>;
}

export function createSceneTools(): ToolDefinition[] {
  return [
    {
      name: 'scene.create',
      description: 'Create a scene and make it active.',
      capabilities: ['scene.create'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        const name = typeof input.name === 'string' ? input.name : 'Agentic Scene';
        const result = context.world.createScene({ name });
        return okToolResult(context.call, `Scene "${name}" created.`, [result.evidence], {
          sceneId: result.scene.id,
        });
      },
    },
    {
      name: 'scene.modify',
      description: 'Modify basic scene metadata.',
      capabilities: ['scene.modify'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        const sceneId = getSceneId(input, context.world.getActiveScene()?.id ?? null);
        if (!sceneId) {
          return failToolResult(context.call, 'NO_SCENE', 'No active scene exists.');
        }
        const evidence = context.world.updateScene(sceneId, {
          name: typeof input.name === 'string' ? input.name : undefined,
          metadata:
            input.metadata && typeof input.metadata === 'object'
              ? (input.metadata as JsonObject)
              : undefined,
        });
        return okToolResult(context.call, 'Scene modified.', [evidence], { sceneId });
      },
    },
    {
      name: 'scene.moveObject',
      description: 'Move, rotate or scale an existing entity.',
      capabilities: ['scene.layout', 'entity.transform'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        if (typeof input.entityId !== 'string') {
          return failToolResult(context.call, 'INVALID_INPUT', 'scene.moveObject requires entityId.');
        }
        const evidence = context.world.updateEntityTransform(
          input.entityId,
          asVector(input.transform)
        );
        return okToolResult(context.call, 'Object transform updated.', [evidence], {
          entityId: input.entityId,
        });
      },
    },
    {
      name: 'scene.groupObjects',
      description: 'Create a layout group and parent entities under it.',
      capabilities: ['scene.layout', 'entity.hierarchy'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        const sceneId = getSceneId(input, context.world.getActiveScene()?.id ?? null);
        const entityIds = Array.isArray(input.entityIds)
          ? input.entityIds.filter((id): id is string => typeof id === 'string')
          : [];
        if (!sceneId) {
          return failToolResult(context.call, 'NO_SCENE', 'No active scene exists.');
        }
        const name = typeof input.name === 'string' ? input.name : 'Layout Group';
        const result = context.world.createGroup(sceneId, name, entityIds);
        return okToolResult(context.call, `Grouped ${entityIds.length} objects.`, result.evidence, {
          groupId: result.group.id,
          entityIds,
        });
      },
    },
    {
      name: 'scene.duplicateObject',
      description: 'Duplicate one entity in the current world state.',
      capabilities: ['scene.duplicate', 'entity.create'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        if (typeof input.entityId !== 'string') {
          return failToolResult(context.call, 'INVALID_INPUT', 'scene.duplicateObject requires entityId.');
        }
        const result = context.world.duplicateEntity(
          input.entityId,
          typeof input.name === 'string' ? input.name : undefined
        );
        return okToolResult(context.call, 'Object duplicated.', [result.evidence], {
          entityId: result.entity.id,
        });
      },
    },
    {
      name: 'scene.deleteObject',
      description: 'Delete an entity from the current scene.',
      capabilities: ['scene.delete', 'entity.delete'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        if (typeof input.entityId !== 'string') {
          return failToolResult(context.call, 'INVALID_INPUT', 'scene.deleteObject requires entityId.');
        }
        const evidence = context.world.deleteEntity(input.entityId);
        return okToolResult(context.call, 'Object deleted.', [evidence], { entityId: input.entityId });
      },
    },
  ];
}
