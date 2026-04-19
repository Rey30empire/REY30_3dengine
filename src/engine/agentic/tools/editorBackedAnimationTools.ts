import type { EditorSceneStoreAdapter } from './adapters/sceneStoreAdapter';
import { failToolResult, okToolResult } from './toolResult';
import { type JsonObject, type ToolDefinition } from '../schemas';

function targetEntity(input: JsonObject, context: Parameters<ToolDefinition['execute']>[1]): string | undefined {
  if (typeof input.entityId === 'string') {
    return input.entityId;
  }
  return context.world.findEntitiesByType('npc')[0]?.id;
}

function metadataFromInput(value: unknown): JsonObject {
  return value && typeof value === 'object' ? (value as JsonObject) : {};
}

export function createEditorBackedAnimationTools(adapter: EditorSceneStoreAdapter): ToolDefinition[] {
  return [
    {
      name: 'animation.createClip',
      description: 'Create a real editor Animator clip, animation asset and WorldState animation.',
      capabilities: ['animation.clip'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        const result = adapter.createAnimationClip(context.world, {
          entityId: targetEntity(input, context),
          name: typeof input.name === 'string' ? input.name : 'Animation Clip',
          duration: typeof input.duration === 'number' ? input.duration : 1.2,
          tracks: Array.isArray(input.tracks) ? (input.tracks as JsonObject[]) : [],
          metadata: metadataFromInput(input.metadata),
        });
        return okToolResult(context.call, 'Editor animation clip created.', result.evidence, {
          animationId: result.animationId,
          entityId: result.entityId,
        });
      },
    },
    {
      name: 'animation.attachClip',
      description: 'Attach an animation clip to an editor Animator component.',
      capabilities: ['animation.attach'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        if (typeof input.animationId !== 'string') {
          return failToolResult(context.call, 'INVALID_INPUT', 'animation.attachClip requires animationId.');
        }
        const entityId = targetEntity(input, context);
        const evidence = adapter.attachAnimationClip(
          context.world,
          input.animationId,
          entityId,
          typeof input.state === 'string' ? input.state : 'default'
        );
        return okToolResult(context.call, 'Editor animation clip attached.', evidence, {
          entityId: entityId ?? '',
          animationId: input.animationId,
        });
      },
    },
    {
      name: 'animation.editTimeline',
      description: 'Edit the editor Animator timeline/NLA data for an entity.',
      capabilities: ['animation.timeline'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        const evidence = adapter.editAnimationTimeline(
          context.world,
          targetEntity(input, context),
          input.timeline && typeof input.timeline === 'object'
            ? (input.timeline as JsonObject)
            : { start: 0, end: 1.2, markers: [] }
        );
        return okToolResult(context.call, 'Editor animation timeline edited.', evidence);
      },
    },
    {
      name: 'animation.assignState',
      description: 'Assign a named state on an editor Animator component.',
      capabilities: ['animation.state'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        const evidence = adapter.assignAnimationState(
          context.world,
          targetEntity(input, context),
          typeof input.state === 'string' ? input.state : 'idle'
        );
        return okToolResult(context.call, 'Editor animation state assigned.', evidence);
      },
    },
  ];
}
