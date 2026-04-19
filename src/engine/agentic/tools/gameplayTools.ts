import { type JsonObject, type ToolDefinition } from '../schemas';
import { failToolResult, okToolResult } from './toolResult';

function targetEntity(input: JsonObject, context: Parameters<ToolDefinition['execute']>[1]): string | undefined {
  if (typeof input.entityId === 'string') {
    return input.entityId;
  }
  return context.world.findEntitiesByType('npc')[0]?.id;
}

const PATROL_SCRIPT = `export function update(entity, deltaTime, context) {
  const route = entity.components.PatrolRoute?.points ?? [];
  if (!route.length) return;
  context.moveAlongRoute(entity, route, deltaTime);
}`;

export function createGameplayTools(): ToolDefinition[] {
  return [
    {
      name: 'script.create',
      description: 'Create a gameplay script asset.',
      capabilities: ['script.create'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        const behavior = typeof input.behavior === 'string' ? input.behavior : 'generic';
        const result = context.world.createScript({
          name: typeof input.name === 'string' ? input.name : `${behavior}Script`,
          source: typeof input.source === 'string' ? input.source : behavior === 'patrol' ? PATROL_SCRIPT : 'export function update() {}',
          parameters:
            input.parameters && typeof input.parameters === 'object'
              ? (input.parameters as JsonObject)
              : {},
          metadata: {
            behavior,
            generatedBy: 'agentic.gameplay',
          },
        });
        return okToolResult(context.call, 'Gameplay script created.', [result.evidence], {
          scriptId: result.script.id,
        });
      },
    },
    {
      name: 'script.attach',
      description: 'Attach a script to an entity.',
      capabilities: ['script.attach'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        const entityId = targetEntity(input, context);
        if (!entityId || typeof input.scriptId !== 'string') {
          return failToolResult(context.call, 'INVALID_INPUT', 'script.attach requires entityId and scriptId.');
        }
        const evidence = context.world.addComponent(entityId, 'Script', {
          scriptId: input.scriptId,
          parameters:
            input.parameters && typeof input.parameters === 'object'
              ? (input.parameters as JsonObject)
              : {},
        }).evidence;
        return okToolResult(context.call, 'Script attached.', [evidence], {
          entityId,
          scriptId: input.scriptId,
        });
      },
    },
    {
      name: 'script.updateParameters',
      description: 'Update script parameters.',
      capabilities: ['script.parameters'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        if (typeof input.scriptId !== 'string') {
          return failToolResult(context.call, 'INVALID_INPUT', 'script.updateParameters requires scriptId.');
        }
        const evidence = context.world.updateScriptParameters(
          input.scriptId,
          input.parameters && typeof input.parameters === 'object'
            ? (input.parameters as JsonObject)
            : {}
        );
        return okToolResult(context.call, 'Script parameters updated.', [evidence], {
          scriptId: input.scriptId,
        });
      },
    },
    {
      name: 'trigger.register',
      description: 'Register a trigger component on an entity.',
      capabilities: ['trigger.register'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        const entityId = targetEntity(input, context);
        if (!entityId) {
          return failToolResult(context.call, 'NO_ENTITY', 'trigger.register requires an entity.');
        }
        const evidence = context.world.addComponent(entityId, 'Trigger', {
          event: typeof input.event === 'string' ? input.event : 'onEnter',
          action: typeof input.action === 'string' ? input.action : 'custom',
        }).evidence;
        return okToolResult(context.call, 'Trigger registered.', [evidence], { entityId });
      },
    },
  ];
}
