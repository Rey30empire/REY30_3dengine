import type { EditorSceneStoreAdapter } from './adapters/sceneStoreAdapter';
import { failToolResult, okToolResult } from './toolResult';
import { type JsonObject, type ToolDefinition } from '../schemas';

const PATROL_SCRIPT = `export function update(entity, deltaTime, context) {
  const route = entity.components.PatrolRoute?.points ?? [];
  if (!route.length) return;
  context.moveAlongRoute(entity, route, deltaTime);
}`;

function asJsonObject(value: unknown): JsonObject {
  return value && typeof value === 'object' ? (value as JsonObject) : {};
}

function targetEntity(input: JsonObject, context: Parameters<ToolDefinition['execute']>[1]): string | undefined {
  if (typeof input.entityId === 'string') {
    return input.entityId;
  }
  return context.world.findEntitiesByType('npc')[0]?.id;
}

export function createEditorBackedGameplayTools(adapter: EditorSceneStoreAdapter): ToolDefinition[] {
  return [
    {
      name: 'script.create',
      description: 'Create a gameplay script asset in the editor store and agentic WorldState.',
      capabilities: ['script.create'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        const behavior = typeof input.behavior === 'string' ? input.behavior : 'generic';
        const result = adapter.registerScript(context.world, {
          name: typeof input.name === 'string' ? input.name : `${behavior}Script`,
          source: typeof input.source === 'string' ? input.source : behavior === 'patrol' ? PATROL_SCRIPT : 'export function update() {}',
          parameters: asJsonObject(input.parameters),
          metadata: {
            behavior,
            generatedBy: 'agentic.gameplay.editor',
          },
        });
        return okToolResult(context.call, 'Editor gameplay script created.', result.evidence, {
          scriptId: result.scriptId,
        });
      },
    },
    {
      name: 'script.attach',
      description: 'Attach a script component to an editor entity and sync agentic WorldState.',
      capabilities: ['script.attach'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        const entityId = targetEntity(input, context);
        if (!entityId || typeof input.scriptId !== 'string') {
          return failToolResult(context.call, 'INVALID_INPUT', 'script.attach requires entityId and scriptId.');
        }
        const evidence = adapter.updateComponent(context.world, entityId, 'Script', {
          scriptId: input.scriptId,
          parameters: asJsonObject(input.parameters),
          enabled: true,
        });
        return okToolResult(context.call, 'Editor script attached.', evidence, {
          entityId,
          scriptId: input.scriptId,
        });
      },
    },
    {
      name: 'script.updateParameters',
      description: 'Update editor script component parameters.',
      capabilities: ['script.parameters'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        const entityId = targetEntity(input, context);
        if (!entityId) {
          return failToolResult(context.call, 'NO_ENTITY', 'script.updateParameters requires an entity.');
        }
        const evidence = adapter.updateComponent(context.world, entityId, 'Script', {
          parameters: asJsonObject(input.parameters),
        });
        return okToolResult(context.call, 'Editor script parameters updated.', evidence, { entityId });
      },
    },
    {
      name: 'trigger.register',
      description: 'Register trigger metadata on an editor script component.',
      capabilities: ['trigger.register'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        const entityId = targetEntity(input, context);
        if (!entityId) {
          return failToolResult(context.call, 'NO_ENTITY', 'trigger.register requires an entity.');
        }
        const evidence = adapter.updateComponent(context.world, entityId, 'Script', {
          trigger: {
            event: typeof input.event === 'string' ? input.event : 'onEnter',
            action: typeof input.action === 'string' ? input.action : 'custom',
          },
        });
        return okToolResult(context.call, 'Editor trigger registered.', evidence, { entityId });
      },
    },
  ];
}
