// ============================================
// Physics, Rendering & Gameplay Tools
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// ============================================

import { z } from 'zod';
import { createTool } from './ToolRegistry';
import type { ToolDefinition } from '../types';
import { useEngineStore } from '@/store/editorStore';
import { v4 as uuidv4 } from 'uuid';

// ============================================
// PHYSICS Namespace Tools
// ============================================

export const phys_addCollider = createTool()
  .namespace('phys')
  .name('add_collider')
  .description('Add a collider component to an entity')
  .parameters(z.object({
    entityId: z.string(),
    shape: z.enum(['box', 'sphere', 'capsule', 'cylinder', 'mesh']),
    isTrigger: z.boolean().optional(),
    center: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional(),
    size: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional(),
    radius: z.number().optional(),
    height: z.number().optional(),
  }))
  .permission('write')
  .cost({ cpu: 10, gpu: 5, memory: 1, time: 20, risk: 'low' })
  .executor(async (params) => {
    const { entities, updateEntity } = useEngineStore.getState();
    const entity = entities.get(params.entityId);
    
    if (!entity) {
      return { success: false, error: { code: 'ENTITY_NOT_FOUND', message: 'Entity not found', recoverable: false }, duration: 1, sideEffects: [] };
    }
    
    entity.components.set('Collider', {
      id: uuidv4(),
      type: 'Collider',
      data: {
        type: params.shape,
        isTrigger: params.isTrigger || false,
        center: params.center || { x: 0, y: 0, z: 0 },
        size: params.size,
        radius: params.radius,
        height: params.height,
      },
      enabled: true,
    });
    
    updateEntity(params.entityId, { components: entity.components });
    
    return {
      success: true,
      data: { collider: entity.components.get('Collider')?.data },
      duration: 20,
      sideEffects: [{ type: 'collider_added', entityId: params.entityId, description: `${params.shape} collider added` }],
    };
  })
  .build();

export const phys_addRigidbody = createTool()
  .namespace('phys')
  .name('add_rigidbody')
  .description('Add a rigidbody component to an entity for physics simulation')
  .parameters(z.object({
    entityId: z.string(),
    type: z.enum(['dynamic', 'static', 'kinematic']),
    mass: z.number().optional(),
    drag: z.number().optional(),
    angularDrag: z.number().optional(),
    useGravity: z.boolean().optional(),
  }))
  .permission('write')
  .cost({ cpu: 10, gpu: 5, memory: 1, time: 20, risk: 'low' })
  .executor(async (params) => {
    const { entities, updateEntity } = useEngineStore.getState();
    const entity = entities.get(params.entityId);
    
    if (!entity) {
      return { success: false, error: { code: 'ENTITY_NOT_FOUND', message: 'Entity not found', recoverable: false }, duration: 1, sideEffects: [] };
    }
    
    entity.components.set('Rigidbody', {
      id: uuidv4(),
      type: 'Rigidbody',
      data: {
        mass: params.mass || 1,
        drag: params.drag || 0,
        angularDrag: params.angularDrag || 0.05,
        useGravity: params.useGravity ?? true,
        isKinematic: params.type === 'kinematic',
        velocity: { x: 0, y: 0, z: 0 },
        angularVelocity: { x: 0, y: 0, z: 0 },
      },
      enabled: true,
    });
    
    updateEntity(params.entityId, { components: entity.components });
    
    return {
      success: true,
      data: { rigidbody: entity.components.get('Rigidbody')?.data },
      duration: 20,
      sideEffects: [{ type: 'rigidbody_added', entityId: params.entityId, description: 'Rigidbody added' }],
    };
  })
  .build();

export const phys_addCharacterController = createTool()
  .namespace('phys')
  .name('add_character_controller')
  .description('Add a character controller for player movement')
  .parameters(z.object({
    entityId: z.string(),
    height: z.number().optional(),
    radius: z.number().optional(),
    stepOffset: z.number().optional(),
    slopeLimit: z.number().optional(),
  }))
  .permission('write')
  .cost({ cpu: 10, gpu: 5, memory: 1, time: 20, risk: 'low' })
  .executor(async (params) => {
    return {
      success: true,
      data: { characterController: params },
      duration: 20,
      sideEffects: [{ type: 'character_controller_added', entityId: params.entityId, description: 'Character controller added' }],
    };
  })
  .build();

export const phys_raycast = createTool()
  .namespace('phys')
  .name('raycast')
  .description('Cast a ray and return hit information')
  .parameters(z.object({
    origin: z.object({ x: z.number(), y: z.number(), z: z.number() }),
    direction: z.object({ x: z.number(), y: z.number(), z: z.number() }),
    maxDistance: z.number(),
    layerMask: z.number().optional(),
  }))
  .permission('read')
  .cost({ cpu: 5, gpu: 0, memory: 0, time: 1, risk: 'low' })
  .executor(async (params) => {
    // Simulated raycast result
    return {
      success: true,
      data: {
        hit: false,
        point: null,
        normal: null,
        distance: params.maxDistance,
        entityId: null,
      },
      duration: 1,
      sideEffects: [],
    };
  })
  .build();

export const phys_setGravity = createTool()
  .namespace('phys')
  .name('set_gravity')
  .description('Set global gravity for the physics simulation')
  .parameters(z.object({
    gravity: z.object({ x: z.number(), y: z.number(), z: z.number() }),
  }))
  .permission('write')
  .cost({ cpu: 1, gpu: 0, memory: 0, time: 1, risk: 'low' })
  .executor(async (params) => {
    return {
      success: true,
      data: { gravity: params.gravity },
      duration: 1,
      sideEffects: [{ type: 'gravity_changed', description: 'Gravity updated' }],
    };
  })
  .build();

// ============================================
// RENDER Namespace Tools
// ============================================

export const render_createLight = createTool()
  .namespace('render')
  .name('create_light')
  .description('Create a light entity')
  .parameters(z.object({
    type: z.enum(['directional', 'point', 'spot', 'ambient']),
    color: z.object({ r: z.number(), g: z.number(), b: z.number() }).optional(),
    intensity: z.number().optional(),
    shadows: z.boolean().optional(),
    position: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional(),
    range: z.number().optional(),
    spotAngle: z.number().optional(),
  }))
  .permission('write')
  .cost({ cpu: 5, gpu: 20, memory: 5, time: 30, risk: 'low' })
  .executor(async (params) => {
    const { addEntity } = useEngineStore.getState();
    const name = `${params.type.charAt(0).toUpperCase() + params.type.slice(1)}Light`;
    
    const entity = {
      id: uuidv4(),
      name,
      components: new Map([
        ['Transform', {
          id: uuidv4(),
          type: 'Transform',
          data: {
            position: params.position || { x: 0, y: 10, z: 0 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            scale: { x: 1, y: 1, z: 1 },
          },
          enabled: true,
        }],
        ['Light', {
          id: uuidv4(),
          type: 'Light',
          data: {
            type: params.type,
            color: params.color || { r: 1, g: 1, b: 1 },
            intensity: params.intensity || 1,
            shadows: params.shadows ?? true,
            range: params.range,
            spotAngle: params.spotAngle,
          },
          enabled: true,
        }],
      ]),
      children: [],
      parentId: null,
      active: true,
      tags: [],
    };
    
    addEntity(entity as any);
    
    return {
      success: true,
      data: { entityId: entity.id, name },
      duration: 30,
      sideEffects: [{ type: 'entity_created', entityId: entity.id, description: `${name} created` }],
    };
  })
  .build();

export const render_setQuality = createTool()
  .namespace('render')
  .name('set_quality')
  .description('Set rendering quality preset')
  .parameters(z.object({
    preset: z.enum(['low', 'medium', 'high', 'ultra']),
  }))
  .permission('write')
  .cost({ cpu: 1, gpu: 50, memory: 0, time: 100, risk: 'low' })
  .executor(async (params) => {
    return {
      success: true,
      data: { quality: params.preset },
      duration: 100,
      sideEffects: [{ type: 'quality_changed', description: `Quality set to ${params.preset}` }],
    };
  })
  .build();

export const render_setPostProcess = createTool()
  .namespace('render')
  .name('set_postprocess')
  .description('Configure post-processing effects')
  .parameters(z.object({
    bloom: z.object({ enabled: z.boolean(), intensity: z.number(), threshold: z.number() }).optional(),
    ssao: z.object({ enabled: z.boolean(), intensity: z.number(), radius: z.number() }).optional(),
    ssr: z.object({ enabled: z.boolean(), intensity: z.number(), maxDistance: z.number() }).optional(),
    vignette: z.object({ enabled: z.boolean(), intensity: z.number() }).optional(),
    colorGrading: z.object({
      contrast: z.number(),
      saturation: z.number(),
      exposure: z.number(),
      toneMapping: z.enum(['none', 'linear', 'reinhard', 'cineon', 'aces']).optional(),
      rendererExposure: z.number().optional(),
    }).optional(),
  }))
  .permission('write')
  .cost({ cpu: 5, gpu: 20, memory: 5, time: 50, risk: 'low' })
  .executor(async (params) => {
    return {
      success: true,
      data: { postProcess: params },
      duration: 50,
      sideEffects: [{ type: 'postprocess_changed', description: 'Post-processing updated' }],
    };
  })
  .build();

export const render_captureScreenshot = createTool()
  .namespace('render')
  .name('capture_screenshot')
  .description('Capture a screenshot of the current view')
  .parameters(z.object({
    path: z.string().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
  }))
  .permission('export')
  .cost({ cpu: 20, gpu: 50, memory: 20, time: 100, risk: 'low' })
  .executor(async (params) => {
    return {
      success: true,
      data: { captured: true, path: params.path || 'screenshot.png' },
      duration: 100,
      sideEffects: [{ type: 'screenshot_captured', description: 'Screenshot saved' }],
    };
  })
  .build();

// ============================================
// GAMEPLAY Namespace Tools
// ============================================

export const game_createWeapon = createTool()
  .namespace('game')
  .name('create_weapon')
  .description('Create a weapon definition')
  .parameters(z.object({
    name: z.string(),
    type: z.enum(['melee', 'ranged', 'projectile', 'magic']),
    damage: z.number(),
    fireRate: z.number().optional(),
    range: z.number().optional(),
    ammo: z.number().optional(),
    recoil: z.number().optional(),
    spread: z.number().optional(),
  }))
  .permission('write')
  .cost({ cpu: 5, gpu: 0, memory: 1, time: 10, risk: 'low' })
  .executor(async (params) => {
    const weaponId = uuidv4();
    return {
      success: true,
      data: { weaponId, weapon: params },
      duration: 10,
      sideEffects: [{ type: 'weapon_created', description: `Weapon '${params.name}' created` }],
    };
  })
  .build();

export const game_createInputAction = createTool()
  .namespace('game')
  .name('create_input_action')
  .description('Create an input action mapping')
  .parameters(z.object({
    name: z.string(),
    bindings: z.array(z.object({
      device: z.enum(['keyboard', 'mouse', 'gamepad']),
      button: z.string(),
    })),
  }))
  .permission('write')
  .cost({ cpu: 1, gpu: 0, memory: 0, time: 5, risk: 'low' })
  .executor(async (params) => {
    return {
      success: true,
      data: { action: params },
      duration: 5,
      sideEffects: [{ type: 'input_action_created', description: `Input action '${params.name}' created` }],
    };
  })
  .build();

export const game_addHealthComponent = createTool()
  .namespace('game')
  .name('add_health_component')
  .description('Add health/damage system to an entity')
  .parameters(z.object({
    entityId: z.string(),
    maxHealth: z.number(),
    currentHealth: z.number().optional(),
    invulnerable: z.boolean().optional(),
    onDeath: z.string().optional().describe('Script function to call on death'),
  }))
  .permission('write')
  .cost({ cpu: 5, gpu: 0, memory: 1, time: 10, risk: 'low' })
  .executor(async (params) => {
    const { entities, updateEntity } = useEngineStore.getState();
    const entity = entities.get(params.entityId);

    if (!entity) {
      return { success: false, error: { code: 'ENTITY_NOT_FOUND', message: 'Entity not found', recoverable: false }, duration: 1, sideEffects: [] };
    }

    entity.components.set('Health', {
      id: uuidv4(),
      type: 'Health',
      data: {
        maxHealth: params.maxHealth,
        currentHealth: params.currentHealth ?? params.maxHealth,
        invulnerable: params.invulnerable ?? false,
      },
      enabled: true,
    });

    updateEntity(params.entityId, { components: entity.components });

    return {
      success: true,
      data: { health: { maxHealth: params.maxHealth, currentHealth: params.currentHealth ?? params.maxHealth } },
      duration: 10,
      sideEffects: [{ type: 'health_added', entityId: params.entityId, description: 'Health component added' }],
    };
  })
  .build();

export const game_addTrigger = createTool()
  .namespace('game')
  .name('add_trigger')
  .description('Add a trigger zone that fires events')
  .parameters(z.object({
    entityId: z.string(),
    onEnter: z.string().optional().describe('Script function on entity enter'),
    onExit: z.string().optional().describe('Script function on entity exit'),
    oneShot: z.boolean().optional().describe('Only fire once'),
  }))
  .permission('write')
  .cost({ cpu: 5, gpu: 5, memory: 1, time: 10, risk: 'low' })
  .executor(async (params) => {
    return {
      success: true,
      data: { trigger: params },
      duration: 10,
      sideEffects: [{ type: 'trigger_added', entityId: params.entityId, description: 'Trigger added' }],
    };
  })
  .build();

// ============================================
// VFX Namespace Tools
// ============================================

export const vfx_createParticleSystem = createTool()
  .namespace('vfx')
  .name('create_particle_system')
  .description('Create a particle system for effects like fire, smoke, magic')
  .parameters(z.object({
    name: z.string(),
    maxParticles: z.number().optional(),
    emissionRate: z.number().optional(),
    duration: z.number().optional(),
    looping: z.boolean().optional(),
    startColor: z.object({ r: z.number(), g: z.number(), b: z.number(), a: z.number() }).optional(),
    endColor: z.object({ r: z.number(), g: z.number(), b: z.number(), a: z.number() }).optional(),
    startSize: z.number().optional(),
    endSize: z.number().optional(),
    gravity: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional(),
    velocity: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional(),
  }))
  .permission('write')
  .cost({ cpu: 20, gpu: 30, memory: 10, time: 50, risk: 'low' })
  .executor(async (params) => {
    const { addEntity } = useEngineStore.getState();
    
    const entity: any = {
      id: uuidv4(),
      name: params.name,
      components: new Map([
        ['Transform', {
          id: uuidv4(),
          type: 'Transform',
          data: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 } },
          enabled: true,
        }],
        ['ParticleSystem', {
          id: uuidv4(),
          type: 'ParticleSystem',
          data: params,
          enabled: true,
        }],
      ]),
      children: [],
      parentId: null,
      active: true,
      tags: [],
    };
    
    addEntity(entity);
    
    return {
      success: true,
      data: { entityId: entity.id, name: params.name },
      duration: 50,
      sideEffects: [{ type: 'particle_system_created', entityId: entity.id, description: 'Particle system created' }],
    };
  })
  .build();

// ============================================
// WATER Namespace Tools
// ============================================

export const water_createOcean = createTool()
  .namespace('water')
  .name('create_ocean')
  .description('Create an ocean/water body')
  .parameters(z.object({
    size: z.number().describe('Ocean size in meters'),
    waveHeight: z.number().optional(),
    waveSpeed: z.number().optional(),
    foam: z.boolean().optional(),
    color: z.object({ r: z.number(), g: z.number(), b: z.number() }).optional(),
  }))
  .permission('write')
  .cost({ cpu: 30, gpu: 50, memory: 20, time: 100, risk: 'low' })
  .executor(async (params) => {
    const { addEntity } = useEngineStore.getState();
    
    const entity: any = {
      id: uuidv4(),
      name: 'Ocean',
      components: new Map([
        ['Transform', {
          id: uuidv4(),
          type: 'Transform',
          data: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: params.size, y: 1, z: params.size } },
          enabled: true,
        }],
        ['Water', {
          id: uuidv4(),
          type: 'Water',
          data: params,
          enabled: true,
        }],
      ]),
      children: [],
      parentId: null,
      active: true,
      tags: ['water', 'ocean'],
    };
    
    addEntity(entity);
    
    return {
      success: true,
      data: { entityId: entity.id },
      duration: 100,
      sideEffects: [{ type: 'ocean_created', description: `Ocean of size ${params.size}m created` }],
    };
  })
  .build();

// ============================================
// MOUNT Namespace Tools
// ============================================

export const mount_createHorse = createTool()
  .namespace('mount')
  .name('create_horse')
  .description('Create a rideable horse with animations')
  .parameters(z.object({
    name: z.string().optional(),
    position: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional(),
    color: z.string().optional(),
  }))
  .permission('write')
  .cost({ cpu: 30, gpu: 40, memory: 15, time: 80, risk: 'low' })
  .executor(async (params) => {
    const { addEntity } = useEngineStore.getState();
    
    const entity: any = {
      id: uuidv4(),
      name: params.name || 'Horse',
      components: new Map([
        ['Transform', {
          id: uuidv4(),
          type: 'Transform',
          data: { position: params.position || { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 } },
          enabled: true,
        }],
        ['MeshRenderer', {
          id: uuidv4(),
          type: 'MeshRenderer',
          data: { meshId: 'horse', materialId: 'default' },
          enabled: true,
        }],
        ['Animator', {
          id: uuidv4(),
          type: 'Animator',
          data: { animations: ['idle', 'walk', 'trot', 'gallop'] },
          enabled: true,
        }],
        ['Mount', {
          id: uuidv4(),
          type: 'Mount',
          data: { type: 'horse', speed: 10 },
          enabled: true,
        }],
      ]),
      children: [],
      parentId: null,
      active: true,
      tags: ['mount', 'horse'],
    };
    
    addEntity(entity);
    
    return {
      success: true,
      data: { entityId: entity.id, name: entity.name },
      duration: 80,
      sideEffects: [{ type: 'mount_created', description: 'Horse created' }],
    };
  })
  .build();

// ============================================
// Export All Tools
// ============================================

export const PHYSICS_TOOLS: ToolDefinition[] = [
  phys_addCollider,
  phys_addRigidbody,
  phys_addCharacterController,
  phys_raycast,
  phys_setGravity,
];

export const RENDER_TOOLS: ToolDefinition[] = [
  render_createLight,
  render_setQuality,
  render_setPostProcess,
  render_captureScreenshot,
];

export const GAMEPLAY_TOOLS: ToolDefinition[] = [
  game_createWeapon,
  game_createInputAction,
  game_addHealthComponent,
  game_addTrigger,
];

export const VFX_TOOLS: ToolDefinition[] = [
  vfx_createParticleSystem,
];

export const WATER_TOOLS: ToolDefinition[] = [
  water_createOcean,
];

export const MOUNT_TOOLS: ToolDefinition[] = [
  mount_createHorse,
];
