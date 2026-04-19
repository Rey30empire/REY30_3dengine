import type { EditorSceneStoreAdapter } from './adapters/sceneStoreAdapter';
import { failToolResult, okToolResult } from './toolResult';
import { type JsonObject, type ToolDefinition } from '../schemas';

function targetEntity(input: JsonObject, context: Parameters<ToolDefinition['execute']>[1]): string | undefined {
  if (typeof input.entityId === 'string') {
    return input.entityId;
  }
  return context.world.findEntitiesByType('npc')[0]?.id;
}

export function createEditorBackedPhysicsTools(adapter: EditorSceneStoreAdapter): ToolDefinition[] {
  return [
    {
      name: 'physics.addCollider',
      description: 'Add or update a collider on an editor entity and sync agentic WorldState.',
      capabilities: ['physics.collider'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        const entityId = targetEntity(input, context);
        if (!entityId) {
          return failToolResult(context.call, 'NO_ENTITY', 'physics.addCollider requires an entity.');
        }
        const evidence = adapter.updateComponent(context.world, entityId, 'Collider', {
          type: typeof input.colliderType === 'string' ? input.colliderType : 'capsule',
          isTrigger: input.isTrigger === true,
          center: input.center && typeof input.center === 'object' ? (input.center as JsonObject) : { x: 0, y: 0.9, z: 0 },
          size: input.size && typeof input.size === 'object' ? (input.size as JsonObject) : { x: 0.8, y: 1.8, z: 0.8 },
        });
        return okToolResult(context.call, 'Editor collider added.', evidence, { entityId });
      },
    },
    {
      name: 'physics.adjustRigidbody',
      description: 'Add or update a rigidbody on an editor entity and sync agentic WorldState.',
      capabilities: ['physics.rigidbody'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        const entityId = targetEntity(input, context);
        if (!entityId) {
          return failToolResult(context.call, 'NO_ENTITY', 'physics.adjustRigidbody requires an entity.');
        }
        const evidence = adapter.updateComponent(context.world, entityId, 'Rigidbody', {
          mass: typeof input.mass === 'number' ? input.mass : 1,
          drag: typeof input.drag === 'number' ? input.drag : 0.2,
          angularDrag: typeof input.angularDrag === 'number' ? input.angularDrag : 0.05,
          useGravity: input.useGravity !== false,
          isKinematic: input.isKinematic === true,
        });
        return okToolResult(context.call, 'Editor rigidbody adjusted.', evidence, { entityId });
      },
    },
    {
      name: 'physics.fixBasicCollisions',
      description: 'Ensure editor NPCs have collider and rigidbody components.',
      capabilities: ['physics.fix'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        const targets = context.world.findEntitiesByType('npc');
        const evidence = targets.flatMap((entity) => [
          ...adapter.updateComponent(context.world, entity.id, 'Collider', {
            type: 'capsule',
            isTrigger: false,
            center: { x: 0, y: 0.9, z: 0 },
            size: { x: 0.8, y: 1.8, z: 0.8 },
          }),
          ...adapter.updateComponent(context.world, entity.id, 'Rigidbody', {
            mass: 1,
            drag: 0.2,
            angularDrag: 0.05,
            useGravity: true,
            isKinematic: false,
          }),
        ]);
        return okToolResult(context.call, `Editor collisions fixed for ${targets.length} entities.`, evidence, {
          fixedCount: targets.length,
          requestedPreset: typeof input.preset === 'string' ? input.preset : 'npc',
        });
      },
    },
    {
      name: 'physics.applyPreset',
      description: 'Apply a physics preset to an editor entity and sync agentic WorldState.',
      capabilities: ['physics.preset'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        const entityId = targetEntity(input, context);
        if (!entityId) {
          return failToolResult(context.call, 'NO_ENTITY', 'physics.applyPreset requires an entity.');
        }
        const preset = typeof input.preset === 'string' ? input.preset : 'npc';
        const collider = adapter.updateComponent(context.world, entityId, 'Collider', {
          type: preset === 'static-prop' ? 'box' : 'capsule',
          isTrigger: false,
          center: { x: 0, y: preset === 'static-prop' ? 0.5 : 0.9, z: 0 },
          size: preset === 'static-prop' ? { x: 1, y: 1, z: 1 } : { x: 0.8, y: 1.8, z: 0.8 },
        });
        const rigidbody = adapter.updateComponent(context.world, entityId, 'Rigidbody', {
          mass: preset === 'static-prop' ? 0 : 1,
          drag: 0.2,
          angularDrag: 0.05,
          useGravity: true,
          isKinematic: preset === 'static-prop',
        });
        return okToolResult(context.call, `Editor physics preset "${preset}" applied.`, [...collider, ...rigidbody], {
          entityId,
          preset,
        });
      },
    },
  ];
}
