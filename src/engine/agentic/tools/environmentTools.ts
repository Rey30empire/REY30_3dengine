import { type ColorRGBA, type JsonObject, type ToolDefinition } from '../schemas';
import { failToolResult, okToolResult } from './toolResult';

function activeSceneId(input: JsonObject, contextSceneId: string | null): string | null {
  return typeof input.sceneId === 'string' ? input.sceneId : contextSceneId;
}

function colorFromInput(value: unknown, fallback: ColorRGBA): ColorRGBA {
  if (!value || typeof value !== 'object') {
    return fallback;
  }
  return { ...fallback, ...(value as Partial<ColorRGBA>) };
}

export function createEnvironmentTools(): ToolDefinition[] {
  return [
    {
      name: 'material.create',
      description: 'Create a reusable material.',
      capabilities: ['material.create'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        const result = context.world.createMaterial({
          name: typeof input.name === 'string' ? input.name : 'Material',
          color: colorFromInput(input.color, { r: 1, g: 1, b: 1, a: 1 }),
          roughness: typeof input.roughness === 'number' ? input.roughness : 0.5,
          metallic: typeof input.metallic === 'number' ? input.metallic : 0,
          metadata:
            input.metadata && typeof input.metadata === 'object'
              ? (input.metadata as JsonObject)
              : {},
        });
        return okToolResult(context.call, 'Material created.', [result.evidence], {
          materialId: result.material.id,
        });
      },
    },
    {
      name: 'material.change',
      description: 'Change material properties.',
      capabilities: ['material.change'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        if (typeof input.materialId !== 'string') {
          return failToolResult(context.call, 'INVALID_INPUT', 'material.change requires materialId.');
        }
        const evidence = context.world.updateMaterial(input.materialId, {
          name: typeof input.name === 'string' ? input.name : undefined,
          color: colorFromInput(input.color, { r: 1, g: 1, b: 1, a: 1 }),
          roughness: typeof input.roughness === 'number' ? input.roughness : undefined,
          metallic: typeof input.metallic === 'number' ? input.metallic : undefined,
          metadata:
            input.metadata && typeof input.metadata === 'object'
              ? (input.metadata as JsonObject)
              : {},
        });
        return okToolResult(context.call, 'Material changed.', [evidence], {
          materialId: input.materialId,
        });
      },
    },
    {
      name: 'lighting.adjustLight',
      description: 'Adjust scene lighting mood and intensity.',
      capabilities: ['lighting.adjust'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        const sceneId = activeSceneId(input, context.world.getActiveScene()?.id ?? null);
        if (!sceneId) {
          return failToolResult(context.call, 'NO_SCENE', 'No active scene exists.');
        }
        const mood = typeof input.mood === 'string' ? input.mood : 'cinematic';
        const dark = mood === 'dark';
        const evidence = context.world.updateEnvironment(sceneId, {
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
        return okToolResult(context.call, 'Lighting adjusted.', [evidence], { sceneId });
      },
    },
    {
      name: 'environment.configureFog',
      description: 'Configure scene fog.',
      capabilities: ['environment.fog'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        const sceneId = activeSceneId(input, context.world.getActiveScene()?.id ?? null);
        if (!sceneId) {
          return failToolResult(context.call, 'NO_SCENE', 'No active scene exists.');
        }
        const evidence = context.world.updateEnvironment(sceneId, {
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
        return okToolResult(context.call, 'Fog configured.', [evidence], { sceneId });
      },
    },
    {
      name: 'environment.changeSky',
      description: 'Change skybox and scene mood.',
      capabilities: ['environment.sky'],
      mutatesWorld: true,
      evidenceContract: 'before_after',
      execute(input, context) {
        const sceneId = activeSceneId(input, context.world.getActiveScene()?.id ?? null);
        if (!sceneId) {
          return failToolResult(context.call, 'NO_SCENE', 'No active scene exists.');
        }
        const evidence = context.world.updateEnvironment(sceneId, {
          skybox: typeof input.skybox === 'string' ? input.skybox : null,
          mood: input.mood === 'dark' ? 'dark' : 'cinematic',
        });
        return okToolResult(context.call, 'Sky environment changed.', [evidence], { sceneId });
      },
    },
  ];
}
