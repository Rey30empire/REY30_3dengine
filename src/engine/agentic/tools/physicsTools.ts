import { type JsonObject, type ToolDefinition } from '../schemas';
import { failToolResult, okToolResult } from './toolResult';

function findTargetEntity(input: JsonObject, contextWorld: Parameters<ToolDefinition['execute']>[1]['world']): string | null {
  if (typeof input.entityId === 'string') {
    return input.entityId;
  }
  const npc = contextWorld.findEntitiesByType('npc')[0];
  return npc?.id ?? null;
}

export function createPhysicsTools(): ToolDefinition[] {
  return [
    {
      name: 'physics.addCollider',
      description: 'Add a collider component to an entity.',
      capabilities: ['physics.collider'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        const entityId = findTargetEntity(input, context.world);
        if (!entityId) {
          return failToolResult(context.call, 'NO_ENTITY', 'physics.addCollider requires an entity.');
        }
        const result = context.world.addComponent(entityId, 'Collider', {
          type: typeof input.colliderType === 'string' ? input.colliderType : 'capsule',
          isTrigger: input.isTrigger === true,
          center: input.center && typeof input.center === 'object' ? (input.center as JsonObject) : { x: 0, y: 0.9, z: 0 },
          size: input.size && typeof input.size === 'object' ? (input.size as JsonObject) : { x: 0.8, y: 1.8, z: 0.8 },
        });
        return okToolResult(context.call, 'Collider added.', [result.evidence], { entityId });
      },
    },
    {
      name: 'physics.adjustRigidbody',
      description: 'Add or update a rigidbody component.',
      capabilities: ['physics.rigidbody'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        const entityId = findTargetEntity(input, context.world);
        if (!entityId) {
          return failToolResult(context.call, 'NO_ENTITY', 'physics.adjustRigidbody requires an entity.');
        }
        const evidence = context.world.updateComponent(entityId, 'Rigidbody', {
          mass: typeof input.mass === 'number' ? input.mass : 1,
          drag: typeof input.drag === 'number' ? input.drag : 0.2,
          angularDrag: typeof input.angularDrag === 'number' ? input.angularDrag : 0.05,
          useGravity: input.useGravity !== false,
          isKinematic: input.isKinematic === true,
        });
        return okToolResult(context.call, 'Rigidbody adjusted.', [evidence], { entityId });
      },
    },
    {
      name: 'physics.fixBasicCollisions',
      description: 'Ensure scene entities that need physics have colliders and rigidbodies.',
      capabilities: ['physics.fix'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        const targets = context.world
          .findEntitiesByType('npc')
          .filter((entity) => !Object.values(entity.components).some((component) => component.type === 'Collider'));
        const evidence = targets.flatMap((entity) => {
          const collider = context.world.addComponent(entity.id, 'Collider', {
            type: 'capsule',
            isTrigger: false,
            center: { x: 0, y: 0.9, z: 0 },
            size: { x: 0.8, y: 1.8, z: 0.8 },
          });
          const rigidbody = context.world.updateComponent(entity.id, 'Rigidbody', {
            mass: 1,
            drag: 0.2,
            angularDrag: 0.05,
            useGravity: true,
            isKinematic: false,
          });
          return [collider.evidence, rigidbody];
        });
        return okToolResult(context.call, `Fixed basic collisions for ${targets.length} entities.`, evidence, {
          fixedCount: targets.length,
          requestedPreset: typeof input.preset === 'string' ? input.preset : 'npc',
        });
      },
    },
    {
      name: 'physics.applyPreset',
      description: 'Apply a named physics preset to an entity.',
      capabilities: ['physics.preset'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        const entityId = findTargetEntity(input, context.world);
        if (!entityId) {
          return failToolResult(context.call, 'NO_ENTITY', 'physics.applyPreset requires an entity.');
        }
        const preset = typeof input.preset === 'string' ? input.preset : 'npc';
        const collider = context.world.updateComponent(entityId, 'Collider', {
          type: preset === 'static-prop' ? 'box' : 'capsule',
          isTrigger: false,
          center: { x: 0, y: preset === 'static-prop' ? 0.5 : 0.9, z: 0 },
          size: preset === 'static-prop' ? { x: 1, y: 1, z: 1 } : { x: 0.8, y: 1.8, z: 0.8 },
        });
        const rigidbody = context.world.updateComponent(entityId, 'Rigidbody', {
          mass: preset === 'static-prop' ? 0 : 1,
          drag: 0.2,
          angularDrag: 0.05,
          useGravity: true,
          isKinematic: preset === 'static-prop',
        });
        return okToolResult(context.call, `Physics preset "${preset}" applied.`, [collider, rigidbody], {
          entityId,
          preset,
        });
      },
    },
  ];
}
