import { type JsonObject, type ToolDefinition } from '../schemas';
import { failToolResult, okToolResult } from './toolResult';

function targetEntity(input: JsonObject, context: Parameters<ToolDefinition['execute']>[1]): string | undefined {
  if (typeof input.entityId === 'string') {
    return input.entityId;
  }
  return context.world.findEntitiesByType('npc')[0]?.id;
}

export function createAnimationTools(): ToolDefinition[] {
  return [
    {
      name: 'animation.createClip',
      description: 'Create a basic animation clip.',
      capabilities: ['animation.clip'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        const result = context.world.createAnimation({
          name: typeof input.name === 'string' ? input.name : 'Animation Clip',
          duration: typeof input.duration === 'number' ? input.duration : 1.2,
          targetEntityId: targetEntity(input, context),
          tracks: Array.isArray(input.tracks) ? (input.tracks as JsonObject[]) : [],
          metadata:
            input.metadata && typeof input.metadata === 'object'
              ? (input.metadata as JsonObject)
              : {},
        });
        return okToolResult(context.call, 'Animation clip created.', [result.evidence], {
          animationId: result.animation.id,
        });
      },
    },
    {
      name: 'animation.attachClip',
      description: 'Attach an animation clip to an entity animator component.',
      capabilities: ['animation.attach'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        const entityId = targetEntity(input, context);
        if (!entityId || typeof input.animationId !== 'string') {
          return failToolResult(context.call, 'INVALID_INPUT', 'animation.attachClip requires entityId and animationId.');
        }
        const evidence = context.world.updateComponent(entityId, 'Animator', {
          activeClipId: input.animationId,
          state: typeof input.state === 'string' ? input.state : 'default',
        });
        return okToolResult(context.call, 'Animation clip attached.', [evidence], {
          entityId,
          animationId: input.animationId,
        });
      },
    },
    {
      name: 'animation.editTimeline',
      description: 'Create or update a simple animation timeline marker set.',
      capabilities: ['animation.timeline'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        const entityId = targetEntity(input, context);
        if (!entityId) {
          return failToolResult(context.call, 'NO_ENTITY', 'animation.editTimeline requires an entity.');
        }
        const evidence = context.world.updateComponent(entityId, 'Animator', {
          timeline:
            input.timeline && typeof input.timeline === 'object'
              ? (input.timeline as JsonObject)
              : { start: 0, end: 1.2, markers: [] },
        });
        return okToolResult(context.call, 'Animation timeline edited.', [evidence], { entityId });
      },
    },
    {
      name: 'animation.assignState',
      description: 'Assign an animation state to an entity.',
      capabilities: ['animation.state'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        const entityId = targetEntity(input, context);
        if (!entityId) {
          return failToolResult(context.call, 'NO_ENTITY', 'animation.assignState requires an entity.');
        }
        const evidence = context.world.updateComponent(entityId, 'Animator', {
          state: typeof input.state === 'string' ? input.state : 'idle',
        });
        return okToolResult(context.call, 'Animation state assigned.', [evidence], { entityId });
      },
    },
  ];
}
