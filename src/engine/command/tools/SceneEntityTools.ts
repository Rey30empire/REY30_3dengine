// ============================================
// Scene & Entity Tools
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// ============================================

import { z } from 'zod';
import { createTool } from './ToolRegistry';
import type { ToolDefinition } from '../types';
import { useEngineStore } from '@/store/editorStore';
import { EntityFactory } from '@/engine/core/ECS';
import { v4 as uuidv4 } from 'uuid';

// ============================================
// SCENE Namespace Tools
// ============================================

export const scene_create = createTool()
  .namespace('scene')
  .name('create')
  .description('Create a new scene')
  .parameters(z.object({
    name: z.string().describe('Scene name'),
    template: z.enum(['empty', 'default', 'outdoor', 'indoor']).optional(),
  }))
  .permission('write')
  .cost({ cpu: 10, gpu: 0, memory: 5, time: 50, risk: 'low' })
  .executor(async (params) => {
    const { createScene } = useEngineStore.getState();
    const scene = createScene(params.name);
    
    return {
      success: true,
      data: { sceneId: scene.id, name: scene.name },
      duration: 50,
      sideEffects: [{ type: 'scene_created', description: `Scene '${params.name}' created` }],
      undoData: { sceneId: scene.id },
    };
  })
  .build();

export const scene_open = createTool()
  .namespace('scene')
  .name('open')
  .description('Open an existing scene')
  .parameters(z.object({
    sceneId: z.string().describe('Scene ID to open'),
  }))
  .permission('read')
  .cost({ cpu: 5, gpu: 10, memory: 50, time: 100, risk: 'low' })
  .executor(async (params) => {
    const { scenes, setActiveScene } = useEngineStore.getState();
    const scene = scenes.find(s => s.id === params.sceneId);
    
    if (!scene) {
      return {
        success: false,
        error: { code: 'SCENE_NOT_FOUND', message: `Scene ${params.sceneId} not found`, recoverable: false },
        duration: 5,
        sideEffects: [],
      };
    }
    
    setActiveScene(params.sceneId);
    
    return {
      success: true,
      data: { sceneId: params.sceneId, name: scene.name },
      duration: 100,
      sideEffects: [{ type: 'scene_opened', description: `Scene '${scene.name}' opened` }],
    };
  })
  .build();

export const scene_save = createTool()
  .namespace('scene')
  .name('save')
  .description('Save the current scene')
  .parameters(z.object({
    path: z.string().optional().describe('Optional save path'),
  }))
  .permission('write')
  .cost({ cpu: 20, gpu: 0, memory: 10, time: 200, risk: 'low' })
  .executor(async (params) => {
    const { activeSceneId, scenes } = useEngineStore.getState();
    
    if (!activeSceneId) {
      return {
        success: false,
        error: { code: 'NO_ACTIVE_SCENE', message: 'No active scene to save', recoverable: false },
        duration: 1,
        sideEffects: [],
      };
    }
    
    const targetPath = params.path || `output/scenes/${activeSceneId}.json`;

    if (typeof window === 'undefined') {
      const fs = await import('fs/promises');
      const path = await import('path');
      const abs = path.resolve(process.cwd(), targetPath);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      const scene = scenes.find(s => s.id === activeSceneId);
      await fs.writeFile(abs, JSON.stringify(scene, null, 2), 'utf-8');
    }

    return {
      success: true,
      data: { saved: true, sceneId: activeSceneId, path: targetPath },
      duration: 200,
      sideEffects: [{ type: 'scene_saved', description: 'Scene saved' }],
    };
  })
  .build();

export const scene_setSky = createTool()
  .namespace('scene')
  .name('set_sky')
  .description('Set the scene skybox/environment')
  .parameters(z.object({
    preset: z.enum(['day', 'night', 'sunset', 'sunrise', 'overcast', 'starry', 'custom']),
    color: z.object({ r: z.number(), g: z.number(), b: z.number() }).optional(),
    intensity: z.number().optional(),
  }))
  .permission('write')
  .cost({ cpu: 5, gpu: 10, memory: 5, time: 50, risk: 'low' })
  .executor(async (params) => {
    const { activeSceneId, scenes } = useEngineStore.getState();
    if (!activeSceneId) {
      return {
        success: false,
        error: { code: 'NO_ACTIVE_SCENE', message: 'No active scene selected', recoverable: false },
        duration: 1,
        sideEffects: [],
      };
    }

    const nextScenes = scenes.map((scene) => {
      if (scene.id !== activeSceneId) return scene;
      return {
        ...scene,
        environment: {
          ...scene.environment,
          skybox: params.preset === 'custom' ? scene.environment.skybox : params.preset,
          ambientLight: params.color
            ? { ...params.color, a: 1 }
            : scene.environment.ambientLight,
        },
        updatedAt: new Date(),
      };
    });

    useEngineStore.setState({ scenes: nextScenes, isDirty: true });

    return {
      success: true,
      data: { sky: params.preset },
      duration: 50,
      sideEffects: [{ type: 'sky_changed', description: `Sky set to ${params.preset}` }],
    };
  })
  .build();

export const scene_addFog = createTool()
  .namespace('scene')
  .name('add_fog')
  .description('Add fog to the scene')
  .parameters(z.object({
    type: z.enum(['linear', 'exponential']),
    color: z.object({ r: z.number(), g: z.number(), b: z.number() }).optional(),
    near: z.number().optional(),
    far: z.number().optional(),
    density: z.number().optional(),
  }))
  .permission('write')
  .cost({ cpu: 2, gpu: 5, memory: 1, time: 10, risk: 'low' })
  .executor(async (params) => {
    const { activeSceneId, scenes } = useEngineStore.getState();
    if (!activeSceneId) {
      return {
        success: false,
        error: { code: 'NO_ACTIVE_SCENE', message: 'No active scene selected', recoverable: false },
        duration: 1,
        sideEffects: [],
      };
    }

    const nextScenes = scenes.map((scene) => {
      if (scene.id !== activeSceneId) return scene;
      return {
        ...scene,
        environment: {
          ...scene.environment,
          fog: {
            enabled: true,
            type: params.type,
            color: params.color ?? scene.environment.fog?.color ?? { r: 0.7, g: 0.7, b: 0.7 },
            near: params.near,
            far: params.far,
            density: params.density,
          },
        },
        updatedAt: new Date(),
      };
    });

    useEngineStore.setState({ scenes: nextScenes, isDirty: true });

    return {
      success: true,
      data: { fog: params },
      duration: 10,
      sideEffects: [{ type: 'fog_added', description: 'Fog added to scene' }],
    };
  })
  .build();

export const scene_setTimeOfDay = createTool()
  .namespace('scene')
  .name('set_time_of_day')
  .description('Set the time of day for the scene')
  .parameters(z.object({
    time: z.number().min(0).max(24).describe('Time in hours (0-24)'),
    autoAdvance: z.boolean().optional().describe('Enable time progression'),
  }))
  .permission('write')
  .cost({ cpu: 2, gpu: 5, memory: 1, time: 10, risk: 'low' })
  .executor(async (params) => {
    const { activeSceneId, scenes } = useEngineStore.getState();
    if (!activeSceneId) {
      return {
        success: false,
        error: { code: 'NO_ACTIVE_SCENE', message: 'No active scene selected', recoverable: false },
        duration: 1,
        sideEffects: [],
      };
    }

    const daylight = Math.max(0, Math.min(24, params.time));
    const intensity = daylight >= 6 && daylight <= 18 ? 1 : 0.25;

    const nextScenes = scenes.map((scene) => {
      if (scene.id !== activeSceneId) return scene;
      return {
        ...scene,
        environment: {
          ...scene.environment,
          ambientLight: { ...scene.environment.ambientLight, r: intensity, g: intensity, b: intensity },
        },
        updatedAt: new Date(),
      };
    });

    useEngineStore.setState({ scenes: nextScenes, isDirty: true });

    return {
      success: true,
      data: { time: params.time },
      duration: 10,
      sideEffects: [{ type: 'time_changed', description: `Time set to ${params.time}:00` }],
    };
  })
  .build();

// ============================================
// ENTITY Namespace Tools
// ============================================

export const entity_create = createTool()
  .namespace('entity')
  .name('create')
  .description('Create a new entity in the scene')
  .parameters(z.object({
    name: z.string().describe('Entity name'),
    archetype: z.enum(['empty', 'cube', 'sphere', 'cylinder', 'plane', 'light', 'camera', 'audio']).optional(),
    position: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional(),
    rotation: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional(),
    scale: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional(),
    parentId: z.string().optional(),
  }))
  .permission('write')
  .cost({ cpu: 5, gpu: 5, memory: 1, time: 10, risk: 'low' })
  .executor(async (params) => {
    const { addEntity } = useEngineStore.getState();
    
    const entity = EntityFactory.create(params.name);
    
    // Add Transform component
    entity.components.set('Transform', {
      id: uuidv4(),
      type: 'Transform',
      data: {
        position: params.position || { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: params.scale || { x: 1, y: 1, z: 1 },
      },
      enabled: true,
    });
    
    // Add archetype components
    if (params.archetype && params.archetype !== 'empty') {
      switch (params.archetype) {
        case 'cube':
        case 'sphere':
        case 'cylinder':
        case 'plane':
          entity.components.set('MeshRenderer', {
            id: uuidv4(),
            type: 'MeshRenderer',
            data: {
              meshId: params.archetype,
              materialId: 'default',
              castShadows: true,
              receiveShadows: true,
            },
            enabled: true,
          });
          break;
        case 'light':
          entity.components.set('Light', {
            id: uuidv4(),
            type: 'Light',
            data: {
              type: 'point',
              color: { r: 1, g: 1, b: 1 },
              intensity: 1,
              shadows: true,
            },
            enabled: true,
          });
          break;
        case 'camera':
          entity.components.set('Camera', {
            id: uuidv4(),
            type: 'Camera',
            data: {
              fov: 60,
              near: 0.1,
              far: 1000,
              orthographic: false,
              isMain: false,
            },
            enabled: true,
          });
          break;
      }
    }
    
    if (params.parentId) {
      entity.parentId = params.parentId;
    }
    
    addEntity(entity);
    
    return {
      success: true,
      data: { entityId: entity.id, name: entity.name },
      duration: 10,
      sideEffects: [{ type: 'entity_created', entityId: entity.id, description: `Entity '${params.name}' created` }],
      undoData: { entityId: entity.id },
    };
  })
  .build();

export const entity_delete = createTool()
  .namespace('entity')
  .name('delete')
  .description('Delete an entity from the scene')
  .parameters(z.object({
    entityId: z.string().describe('Entity ID to delete'),
  }))
  .permission('delete')
  .cost({ cpu: 5, gpu: 5, memory: 0, time: 10, risk: 'medium' })
  .executor(async (params) => {
    const { removeEntity, entities } = useEngineStore.getState();
    const entity = entities.get(params.entityId);
    
    if (!entity) {
      return {
        success: false,
        error: { code: 'ENTITY_NOT_FOUND', message: `Entity ${params.entityId} not found`, recoverable: false },
        duration: 1,
        sideEffects: [],
      };
    }
    
    removeEntity(params.entityId);
    
    return {
      success: true,
      data: { deleted: true },
      duration: 10,
      sideEffects: [{ type: 'entity_deleted', entityId: params.entityId, description: `Entity '${entity.name}' deleted` }],
      undoData: { entity },
    };
  })
  .build();

export const entity_setTransform = createTool()
  .namespace('entity')
  .name('set_transform')
  .description('Set the transform of an entity')
  .parameters(z.object({
    entityId: z.string(),
    position: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional(),
    rotation: z.object({ x: z.number(), y: z.number(), z: z.number(), w: z.number() }).optional(),
    scale: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional(),
  }))
  .permission('write')
  .cost({ cpu: 1, gpu: 1, memory: 0, time: 1, risk: 'low' })
  .executor(async (params) => {
    const { entities, updateEntity } = useEngineStore.getState();
    const entity = entities.get(params.entityId);
    
    if (!entity) {
      return {
        success: false,
        error: { code: 'ENTITY_NOT_FOUND', message: `Entity ${params.entityId} not found`, recoverable: false },
        duration: 1,
        sideEffects: [],
      };
    }
    
    const transform = entity.components.get('Transform');
    if (!transform) {
      return {
        success: false,
        error: { code: 'NO_TRANSFORM', message: 'Entity has no Transform component', recoverable: false },
        duration: 1,
        sideEffects: [],
      };
    }
    
    const oldTransform = { ...transform.data };
    
    if (params.position) transform.data.position = params.position;
    if (params.rotation) transform.data.rotation = params.rotation;
    if (params.scale) transform.data.scale = params.scale;
    
    updateEntity(params.entityId, { components: new Map(entity.components) });
    
    return {
      success: true,
      data: { transform: transform.data },
      duration: 1,
      sideEffects: [{ type: 'transform_changed', entityId: params.entityId, description: 'Transform updated' }],
      undoData: { oldTransform },
    };
  })
  .build();

export const entity_addComponent = createTool()
  .namespace('entity')
  .name('add_component')
  .description('Add a component to an entity')
  .parameters(z.object({
    entityId: z.string(),
    componentType: z.enum(['MeshRenderer', 'Light', 'Camera', 'Collider', 'Rigidbody', 'AudioSource', 'ParticleSystem', 'Animator', 'Script']),
    data: z.record(z.string(), z.unknown()).optional().describe('Component data'),
  }))
  .permission('write')
  .cost({ cpu: 5, gpu: 5, memory: 1, time: 10, risk: 'low' })
  .executor(async (params) => {
    const { entities, updateEntity } = useEngineStore.getState();
    const entity = entities.get(params.entityId);
    
    if (!entity) {
      return {
        success: false,
        error: { code: 'ENTITY_NOT_FOUND', message: `Entity ${params.entityId} not found`, recoverable: false },
        duration: 1,
        sideEffects: [],
      };
    }
    
    // Default component data
    const defaultData: Record<string, unknown> = {
      MeshRenderer: { meshId: 'cube', materialId: 'default', castShadows: true, receiveShadows: true },
      Light: { type: 'point', color: { r: 1, g: 1, b: 1 }, intensity: 1, shadows: true },
      Camera: { fov: 60, near: 0.1, far: 1000, orthographic: false, isMain: false },
      Collider: { type: 'box', isTrigger: false, center: { x: 0, y: 0, z: 0 } },
      Rigidbody: { mass: 1, drag: 0, angularDrag: 0.05, useGravity: true, isKinematic: false },
      AudioSource: { clipId: null, volume: 1, loop: false, playOnStart: false },
      ParticleSystem: { maxParticles: 1000, duration: 5, looping: true },
      Animator: { controllerId: null, currentAnimation: null },
      Script: { scriptId: null, parameters: {} },
    };
    
    const componentData =
      params.data ??
      (defaultData[params.componentType] as Record<string, unknown> | undefined) ??
      ({} as Record<string, unknown>);

    entity.components.set(params.componentType, {
      id: uuidv4(),
      type: params.componentType,
      data: componentData,
      enabled: true,
    });
    
    updateEntity(params.entityId, { components: entity.components });
    
    return {
      success: true,
      data: { componentType: params.componentType },
      duration: 10,
      sideEffects: [{ type: 'component_added', entityId: params.entityId, description: `${params.componentType} added` }],
    };
  })
  .build();

export const entity_findByName = createTool()
  .namespace('entity')
  .name('find_by_name')
  .description('Find entities by name (supports partial match)')
  .parameters(z.object({
    name: z.string().describe('Entity name to search for'),
    exact: z.boolean().optional().describe('Require exact match'),
  }))
  .permission('read')
  .cost({ cpu: 5, gpu: 0, memory: 0, time: 5, risk: 'low' })
  .executor(async (params) => {
    const { entities } = useEngineStore.getState();
    
    const results = Array.from(entities.values()).filter(e => {
      if (params.exact) {
        return e.name === params.name;
      }
      return e.name.toLowerCase().includes(params.name.toLowerCase());
    });
    
    return {
      success: true,
      data: { entities: results.map(e => ({ id: e.id, name: e.name })), count: results.length },
      duration: 5,
      sideEffects: [],
    };
  })
  .build();

export const entity_clone = createTool()
  .namespace('entity')
  .name('clone')
  .description('Clone an entity')
  .parameters(z.object({
    entityId: z.string(),
    name: z.string().optional(),
    position: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional(),
  }))
  .permission('write')
  .cost({ cpu: 10, gpu: 10, memory: 5, time: 20, risk: 'low' })
  .executor(async (params) => {
    const { entities, addEntity } = useEngineStore.getState();
    const entity = entities.get(params.entityId);
    
    if (!entity) {
      return {
        success: false,
        error: { code: 'ENTITY_NOT_FOUND', message: `Entity ${params.entityId} not found`, recoverable: false },
        duration: 1,
        sideEffects: [],
      };
    }
    
    const cloned = EntityFactory.clone(entity);
    cloned.name = params.name || `${entity.name}_copy`;
    
    if (params.position) {
      const transform = cloned.components.get('Transform');
      if (transform) {
        transform.data.position = params.position;
      }
    }
    
    addEntity(cloned);
    
    return {
      success: true,
      data: { entityId: cloned.id, name: cloned.name },
      duration: 20,
      sideEffects: [{ type: 'entity_created', entityId: cloned.id, description: `Entity '${cloned.name}' cloned` }],
    };
  })
  .build();

// ============================================
// Export All Scene & Entity Tools
// ============================================

export const SCENE_TOOLS: ToolDefinition[] = [
  scene_create,
  scene_open,
  scene_save,
  scene_setSky,
  scene_addFog,
  scene_setTimeOfDay,
];

export const ENTITY_TOOLS: ToolDefinition[] = [
  entity_create,
  entity_delete,
  entity_setTransform,
  entity_addComponent,
  entity_findByName,
  entity_clone,
];
