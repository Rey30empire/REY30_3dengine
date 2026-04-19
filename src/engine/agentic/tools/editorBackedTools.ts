import type { ComponentType } from '@/types/engine';
import type { EditorSceneStoreAdapter } from './adapters/sceneStoreAdapter';
import { failToolResult, okToolResult } from './toolResult';
import {
  type AgenticEntity,
  type ColorRGBA,
  type JsonObject,
  type ToolDefinition,
} from '../schemas';

function asJsonObject(value: unknown): JsonObject {
  return value && typeof value === 'object' ? (value as JsonObject) : {};
}

function colorFromInput(value: unknown, fallback: ColorRGBA): ColorRGBA {
  if (!value || typeof value !== 'object') {
    return fallback;
  }
  return { ...fallback, ...(value as Partial<ColorRGBA>) };
}

function activeSceneId(input: JsonObject, adapter: EditorSceneStoreAdapter, contextWorld: Parameters<ToolDefinition['execute']>[1]['world']) {
  const snapshot = adapter.refreshWorldState(contextWorld);
  return typeof input.sceneId === 'string' ? input.sceneId : snapshot.activeSceneId;
}

export function createEditorBackedSceneTools(adapter: EditorSceneStoreAdapter): ToolDefinition[] {
  return [
    {
      name: 'scene.create',
      description: 'Create a scene in the editor store and sync agentic WorldState.',
      capabilities: ['scene.create'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        const name = typeof input.name === 'string' ? input.name : 'Agentic Editor Scene';
        const result = adapter.createScene(context.world, name);
        return okToolResult(context.call, `Editor scene "${name}" created.`, result.evidence, {
          sceneId: result.sceneId,
        });
      },
    },
    {
      name: 'scene.modify',
      description: 'Modify editor scene metadata and sync agentic WorldState.',
      capabilities: ['scene.modify'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        const sceneId = activeSceneId(input, adapter, context.world);
        if (!sceneId) {
          return failToolResult(context.call, 'NO_SCENE', 'No active editor scene exists.');
        }
        const evidence = adapter.updateScene(context.world, sceneId, {
          name: typeof input.name === 'string' ? input.name : undefined,
        });
        return okToolResult(context.call, 'Editor scene modified.', evidence, { sceneId });
      },
    },
    {
      name: 'scene.moveObject',
      description: 'Move, rotate or scale an editor entity and sync agentic WorldState.',
      capabilities: ['scene.layout', 'entity.transform'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        if (typeof input.entityId !== 'string') {
          return failToolResult(context.call, 'INVALID_INPUT', 'scene.moveObject requires entityId.');
        }
        const evidence = adapter.updateEntityTransform(
          context.world,
          input.entityId,
          input.transform && typeof input.transform === 'object' ? (input.transform as never) : {}
        );
        return okToolResult(context.call, 'Editor object transform updated.', evidence, {
          entityId: input.entityId,
        });
      },
    },
    {
      name: 'scene.groupObjects',
      description: 'Create an editor layout group and parent entities under it.',
      capabilities: ['scene.layout', 'entity.hierarchy'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        const sceneId = activeSceneId(input, adapter, context.world);
        if (!sceneId) {
          const created = adapter.createScene(context.world, 'Agentic Working Scene');
          const result = adapter.groupObjects(context.world, created.sceneId, 'Reorganized Layout', []);
          return okToolResult(context.call, 'Editor layout group created in a new scene.', [...created.evidence, ...result.evidence], {
            groupId: result.groupId,
            sceneId: created.sceneId,
          });
        }
        const entityIds = Array.isArray(input.entityIds)
          ? input.entityIds.filter((id): id is string => typeof id === 'string')
          : [];
        const result = adapter.groupObjects(
          context.world,
          sceneId,
          typeof input.name === 'string' ? input.name : 'Reorganized Layout',
          entityIds
        );
        return okToolResult(context.call, `Editor grouped ${entityIds.length} objects.`, result.evidence, {
          groupId: result.groupId,
          entityIds,
        });
      },
    },
    {
      name: 'entity.create',
      description: 'Create an entity in the editor store and sync agentic WorldState.',
      capabilities: ['entity.create'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        const ensured = adapter.ensureScene(context.world);
        const result = adapter.createEntity(context.world, {
          sceneId: typeof input.sceneId === 'string' ? input.sceneId : ensured.sceneId,
          name: typeof input.name === 'string' ? input.name : 'Entity',
          type: typeof input.type === 'string' ? (input.type as AgenticEntity['type']) : 'empty',
          tags: Array.isArray(input.tags)
            ? input.tags.filter((tag): tag is string => typeof tag === 'string')
            : [],
          metadata: asJsonObject(input.metadata),
        });
        return okToolResult(context.call, 'Editor entity created.', [...ensured.evidence, ...result.evidence], {
          entityId: result.entityId,
        });
      },
    },
    {
      name: 'entity.assignComponent',
      description: 'Assign a component in the editor store and sync agentic WorldState.',
      capabilities: ['entity.component'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        if (typeof input.entityId !== 'string' || typeof input.componentType !== 'string') {
          return failToolResult(context.call, 'INVALID_INPUT', 'entity.assignComponent requires entityId and componentType.');
        }
        const evidence = adapter.assignComponent(
          context.world,
          input.entityId,
          input.componentType as ComponentType,
          asJsonObject(input.data)
        );
        return okToolResult(context.call, 'Editor component assigned.', evidence, {
          entityId: input.entityId,
        });
      },
    },
    {
      name: 'entity.editTransform',
      description: 'Edit an editor entity transform and sync agentic WorldState.',
      capabilities: ['entity.transform'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        if (typeof input.entityId !== 'string') {
          return failToolResult(context.call, 'INVALID_INPUT', 'entity.editTransform requires entityId.');
        }
        const evidence = adapter.updateEntityTransform(
          context.world,
          input.entityId,
          input.transform && typeof input.transform === 'object' ? (input.transform as never) : {}
        );
        return okToolResult(context.call, 'Editor entity transform edited.', evidence, {
          entityId: input.entityId,
        });
      },
    },
    {
      name: 'entity.editHierarchy',
      description: 'Edit editor entity hierarchy and sync agentic WorldState.',
      capabilities: ['entity.hierarchy'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        if (typeof input.entityId !== 'string') {
          return failToolResult(context.call, 'INVALID_INPUT', 'entity.editHierarchy requires entityId.');
        }
        const evidence = adapter.setParent(
          context.world,
          input.entityId,
          typeof input.parentId === 'string' ? input.parentId : null
        );
        return okToolResult(context.call, 'Editor entity hierarchy edited.', evidence, {
          entityId: input.entityId,
        });
      },
    },
  ];
}

export function createEditorBackedEnvironmentTools(adapter: EditorSceneStoreAdapter): ToolDefinition[] {
  return [
    {
      name: 'lighting.adjustLight',
      description: 'Adjust editor scene lighting and sync agentic WorldState.',
      capabilities: ['lighting.adjust'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        const sceneId = activeSceneId(input, adapter, context.world);
        if (!sceneId) {
          return failToolResult(context.call, 'NO_SCENE', 'No active editor scene exists.');
        }
        const mood = typeof input.mood === 'string' ? input.mood : 'cinematic';
        const dark = mood === 'dark';
        const evidence = adapter.updateEnvironment(context.world, sceneId, {
          mood: dark ? 'dark' : 'cinematic',
          ambientIntensity:
            typeof input.ambientIntensity === 'number' ? input.ambientIntensity : dark ? 0.22 : 0.65,
          directionalLightIntensity:
            typeof input.directionalLightIntensity === 'number'
              ? input.directionalLightIntensity
              : dark
                ? 0.45
                : 1.15,
          ambientLight: colorFromInput(input.ambientLight, dark ? { r: 0.08, g: 0.1, b: 0.14, a: 1 } : { r: 0.7, g: 0.75, b: 0.85, a: 1 }),
        });
        return okToolResult(context.call, 'Editor lighting adjusted.', evidence, { sceneId });
      },
    },
    {
      name: 'environment.configureFog',
      description: 'Configure editor scene fog and sync agentic WorldState.',
      capabilities: ['environment.fog'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        const sceneId = activeSceneId(input, adapter, context.world);
        if (!sceneId) {
          return failToolResult(context.call, 'NO_SCENE', 'No active editor scene exists.');
        }
        const evidence = adapter.updateEnvironment(context.world, sceneId, {
          mood: 'foggy',
          fog: {
            enabled: input.enabled !== false,
            type: input.type === 'linear' ? 'linear' : 'exponential',
            color: colorFromInput(input.color, { r: 0.58, g: 0.62, b: 0.68, a: 1 }),
            density: typeof input.density === 'number' ? input.density : 0.045,
            near: typeof input.near === 'number' ? input.near : undefined,
            far: typeof input.far === 'number' ? input.far : undefined,
          },
        });
        return okToolResult(context.call, 'Editor fog configured.', evidence, { sceneId });
      },
    },
    {
      name: 'environment.changeSky',
      description: 'Change editor scene skybox and sync agentic WorldState.',
      capabilities: ['environment.sky'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        const sceneId = activeSceneId(input, adapter, context.world);
        if (!sceneId) {
          return failToolResult(context.call, 'NO_SCENE', 'No active editor scene exists.');
        }
        const evidence = adapter.updateEnvironment(context.world, sceneId, {
          skybox: typeof input.skybox === 'string' ? input.skybox : null,
          mood: input.mood === 'dark' ? 'dark' : 'cinematic',
        });
        return okToolResult(context.call, 'Editor sky changed.', evidence, { sceneId });
      },
    },
  ];
}
