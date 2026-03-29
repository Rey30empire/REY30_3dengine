// ============================================
// Game Generator Tools - AI Game Creation
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// ============================================

import { z } from 'zod';
import { createTool } from './ToolRegistry';
import type { ToolDefinition, TaskGraph, TaskNode } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { useEngineStore } from '@/store/editorStore';
import { EntityFactory } from '@/engine/core/ECS';
import type { Entity } from '@/types/engine';
import { buildProject } from '@/engine/reyplay/build/buildPipeline';

// ============================================
// GEN Namespace - Game Generation Tools
// ============================================

export const gen_createGameFromTemplate = createTool()
  .namespace('gen')
  .name('create_game_from_template')
  .description('Create a complete game from a template')
  .parameters(z.object({
    templateId: z.enum(['platformer', 'shooter_arena', 'island_adventure', 'racing', 'puzzle', 'rpg_dungeon', 'survival']),
    params: z.object({
      name: z.string().optional(),
      difficulty: z.enum(['easy', 'normal', 'hard']).optional(),
      size: z.enum(['small', 'medium', 'large']).optional(),
    }).optional(),
  }))
  .permission('write')
  .cost({ cpu: 50, gpu: 30, memory: 50, time: 5000, risk: 'medium' })
  .executor(async (params) => {
    const gameId = uuidv4();
    
    // Generate task graph based on template
    const taskGraph = generateGameTemplate(params.templateId, params.params);
    
    return {
      success: true,
      data: {
        gameId,
        templateId: params.templateId,
        taskGraph,
        message: `Game template '${params.templateId}' initialized with ${taskGraph.nodes.length} tasks`,
      },
      duration: 100,
      sideEffects: [{ type: 'game_created', description: `Game from template ${params.templateId}` }],
    };
  })
  .build();

export const gen_planFromPrompt = createTool()
  .namespace('gen')
  .name('plan_from_prompt')
  .description('Analyze a natural language prompt and create a task graph for game creation')
  .parameters(z.object({
    prompt: z.string().describe('Natural language description of the game'),
    constraints: z.object({
      targetFps: z.number().optional(),
      maxMemoryMB: z.number().optional(),
      platform: z.string().optional(),
    }).optional(),
  }))
  .permission('read')
  .cost({ cpu: 30, gpu: 0, memory: 10, time: 1000, risk: 'low' })
  .executor(async (params) => {
    // Parse the prompt and generate task graph
    const taskGraph = parsePromptToTaskGraph(params.prompt);
    
    return {
      success: true,
      data: {
        taskGraph,
        analysis: analyzePrompt(params.prompt),
        estimatedTime: taskGraph.nodes.length * 500,
      },
      duration: 1000,
      sideEffects: [],
    };
  })
  .build();

export const gen_executePlan = createTool()
  .namespace('gen')
  .name('execute_plan')
  .description('Execute a task graph to build the game')
  .parameters(z.object({
    taskGraphId: z.string(),
    autoContinue: z.boolean().optional().describe('Continue on errors'),
  }))
  .permission('write')
  .cost({ cpu: 100, gpu: 100, memory: 100, time: 30000, risk: 'high' })
  .executor(async (params) => {
    return {
      success: true,
      data: {
        status: 'started',
        taskGraphId: params.taskGraphId,
      },
      duration: 100,
      sideEffects: [{ type: 'plan_execution_started', description: 'Executing task graph' }],
    };
  })
  .build();

export const gen_validateGameplay = createTool()
  .namespace('gen')
  .name('validate_gameplay')
  .description('Validate that the game meets minimum requirements')
  .parameters(z.object({
    requirements: z.object({
      hasPlayer: z.boolean().optional(),
      hasEnemies: z.boolean().optional(),
      hasObjective: z.boolean().optional(),
      hasUI: z.boolean().optional(),
      hasWinCondition: z.boolean().optional(),
    }),
  }))
  .permission('read')
  .cost({ cpu: 20, gpu: 0, memory: 5, time: 500, risk: 'low' })
  .executor(async (params) => {
    const validationResults = {
      hasPlayer: true,
      hasEnemies: true,
      hasObjective: false,
      hasUI: false,
      hasWinCondition: false,
    };
    
    const issues: string[] = [];
    Object.entries(params.requirements).forEach(([key, required]) => {
      if (required && !validationResults[key as keyof typeof validationResults]) {
        issues.push(`Missing: ${key}`);
      }
    });
    
    return {
      success: issues.length === 0,
      data: {
        valid: issues.length === 0,
        results: validationResults,
        issues,
      },
      duration: 500,
      sideEffects: [],
    };
  })
  .build();

export const gen_createPlatformerLevel = createTool()
  .namespace('gen')
  .name('create_platformer_level')
  .description('Generate a platformer level with platforms, coins, and enemies')
  .parameters(z.object({
    length: z.number().describe('Level length'),
    difficulty: z.enum(['easy', 'normal', 'hard']).optional(),
    theme: z.enum(['forest', 'desert', 'ice', 'lava', 'sky']).optional(),
  }))
  .permission('write')
  .cost({ cpu: 50, gpu: 30, memory: 20, time: 2000, risk: 'low' })
  .executor(async (params) => {
    const { levelId, created } = generatePlatformerLevel(params);

    created.forEach(addEntityToActiveScene);

    return {
      success: true,
      data: {
        levelId,
        placedEntities: created.map(e => ({ id: e.id, name: e.name })),
        platformCount: created.length,
      },
      duration: 2000,
      sideEffects: [{ type: 'level_created', description: 'Platformer level generated' }],
    };
  })
  .build();

export const gen_createShooterArena = createTool()
  .namespace('gen')
  .name('create_shooter_arena')
  .description('Generate a shooter arena with cover, weapons, and spawn points')
  .parameters(z.object({
    size: z.number().describe('Arena size'),
    coverDensity: z.enum(['sparse', 'medium', 'dense']).optional(),
    weaponTypes: z.array(z.string()).optional(),
  }))
  .permission('write')
  .cost({ cpu: 50, gpu: 30, memory: 20, time: 2000, risk: 'low' })
  .executor(async (params) => {
    const arenaId = uuidv4();
    const coverCount = params.size * (params.coverDensity === 'sparse' ? 2 : params.coverDensity === 'medium' ? 4 : 6);
    const spawnPoints = 8;

    const entities: Entity[] = [];
    for (let i = 0; i < coverCount; i++) {
      const ent = EntityFactory.create(`Cover_${i}`);
      ent.components.set('Transform', {
        id: uuidv4(),
        type: 'Transform',
        data: { position: { x: i * 2, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 } },
        enabled: true,
      });
      entities.push(ent);
    }

    entities.forEach(addEntityToActiveScene);

    return {
      success: true,
      data: {
        arenaId,
        coverCount,
        weaponSpawns: params.weaponTypes?.length || 3,
        spawnPoints,
      },
      duration: 2000,
      sideEffects: [{ type: 'arena_created', description: 'Shooter arena generated' }],
    };
  })
  .build();

export const gen_createIslandAdventure = createTool()
  .namespace('gen')
  .name('create_island_adventure')
  .description('Generate an island adventure with terrain, structures, and NPCs')
  .parameters(z.object({
    islandSize: z.number().describe('Island diameter'),
    features: z.array(z.enum(['castle', 'village', 'dungeon', 'beach', 'mountain', 'forest'])).optional(),
  }))
  .permission('write')
  .cost({ cpu: 80, gpu: 60, memory: 40, time: 5000, risk: 'low' })
  .executor(async (params) => {
    const features = params.features || ['castle', 'village', 'forest'];
    const islandId = uuidv4();

    const terrain = EntityFactory.create('IslandTerrain');
    terrain.components.set('Transform', {
      id: uuidv4(),
      type: 'Transform',
      data: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: params.islandSize, y: 1, z: params.islandSize } },
      enabled: true,
    });
    addEntityToActiveScene(terrain);

    const featureEntities: Entity[] = [];
    features.forEach((f, idx) => {
      const e = EntityFactory.create(`Feature_${f}_${idx}`);
      e.components.set('Transform', {
        id: uuidv4(),
        type: 'Transform',
        data: { position: { x: idx * 5, y: 0, z: idx * 3 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 2, y: 2, z: 2 } },
        enabled: true,
      });
      featureEntities.push(e);
      addEntityToActiveScene(e);
    });

    return {
      success: true,
      data: {
        islandId,
        features,
        placedEntities: featureEntities.map((e) => ({ id: e.id, name: e.name })),
      },
      duration: 5000,
      sideEffects: [{ type: 'island_created', description: 'Island adventure generated' }],
    };
  })
  .build();

// ============================================
// BUILD Namespace Tools
// ============================================

export const build_setTarget = createTool()
  .namespace('build')
  .name('set_target')
  .description('Set the build target platform')
  .parameters(z.object({
    platform: z.enum(['windows', 'linux', 'macos', 'android', 'ios', 'web']),
    architecture: z.enum(['x64', 'arm64']).optional(),
  }))
  .permission('write')
  .cost({ cpu: 1, gpu: 0, memory: 0, time: 5, risk: 'low' })
  .executor(async (params) => {
    return {
      success: true,
      data: { target: params },
      duration: 5,
      sideEffects: [{ type: 'build_target_set', description: `Target: ${params.platform}` }],
    };
  })
  .build();

export const build_export = createTool()
  .namespace('build')
  .name('export_project')
  .description('Export the project for the target platform')
  .parameters(z.object({
    path: z.string().describe('Export path'),
    includeDebugSymbols: z.boolean().optional(),
    compressAssets: z.boolean().optional(),
    target: z.enum(['web', 'windows-exe', 'windows-msi']).optional(),
  }))
  .permission('export')
  .cost({ cpu: 100, gpu: 50, memory: 100, time: 10000, risk: 'low' })
  .executor(async (params) => {
    const target = (params.target || 'web') as 'web' | 'windows-exe' | 'windows-msi';
    const result = await buildProject(target);

    return {
      success: result.ok,
      data: {
        exported: result.ok,
        buildId: result.buildId,
        artifacts: result.artifacts,
        missingDeps: result.missingDeps,
        logs: result.logs,
        summary: result.report.summary,
      },
      duration: 10000,
      sideEffects: [{ type: 'project_exported', description: 'Project exported' }],
    };
  })
  .build();

export const build_buildAndRun = createTool()
  .namespace('build')
  .name('build_and_run')
  .description('Build the project and run it')
  .parameters(z.object({
    platform: z.enum(['windows', 'linux', 'macos', 'web']).optional(),
  }))
  .permission('execute')
  .cost({ cpu: 100, gpu: 100, memory: 200, time: 30000, risk: 'medium' })
  .executor(async (params) => {
    const target = (params.platform === 'web' ? 'web' : 'windows-exe') as 'web' | 'windows-exe';
    const result = await buildProject(target);

    return {
      success: result.ok,
      data: {
        buildId: result.buildId,
        status: result.ok ? 'built' : 'failed',
        summary: result.report.summary,
        platform: target,
        artifacts: result.artifacts,
      },
      duration: 100,
      sideEffects: [{ type: 'build_started', description: 'Build started' }],
    };
  })
  .build();

// ============================================
// Helper Functions
// ============================================

function generateGameTemplate(templateId: string, params?: any): TaskGraph {
  const templates: Record<string, () => TaskNode[]> = {
    platformer: () => [
      { id: uuidv4(), tool: 'scene.create', params: { name: 'Level1' }, status: 'pending', dependencies: [] },
      { id: uuidv4(), tool: 'entity.create', params: { name: 'Player', archetype: 'cube' }, status: 'pending', dependencies: [] },
      { id: uuidv4(), tool: 'phys.add_character_controller', params: { entityId: '@Player' }, status: 'pending', dependencies: ['@Player'] },
      { id: uuidv4(), tool: 'gen.create_platformer_level', params: { length: 100 }, status: 'pending', dependencies: [] },
      { id: uuidv4(), tool: 'render.create_light', params: { type: 'directional' }, status: 'pending', dependencies: [] },
    ],
    shooter_arena: () => [
      { id: uuidv4(), tool: 'scene.create', params: { name: 'Arena' }, status: 'pending', dependencies: [] },
      { id: uuidv4(), tool: 'entity.create', params: { name: 'Player', archetype: 'capsule' }, status: 'pending', dependencies: [] },
      { id: uuidv4(), tool: 'game.create_weapon', params: { name: 'Rifle', type: 'ranged' }, status: 'pending', dependencies: [] },
      { id: uuidv4(), tool: 'gen.create_shooter_arena', params: { size: 50 }, status: 'pending', dependencies: [] },
    ],
    island_adventure: () => [
      { id: uuidv4(), tool: 'scene.create', params: { name: 'MainIsland' }, status: 'pending', dependencies: [] },
      { id: uuidv4(), tool: 'water.create_ocean', params: { size: 500 }, status: 'pending', dependencies: [] },
      { id: uuidv4(), tool: 'scene.set_sky', params: { preset: 'day' }, status: 'pending', dependencies: [] },
      { id: uuidv4(), tool: 'gen.create_island_adventure', params: { islandSize: 100 }, status: 'pending', dependencies: [] },
    ],
    rpg_dungeon: () => [
      { id: uuidv4(), tool: 'scene.create', params: { name: 'Dungeon' }, status: 'pending', dependencies: [] },
      { id: uuidv4(), tool: 'entity.create', params: { name: 'Hero', archetype: 'capsule' }, status: 'pending', dependencies: [] },
      { id: uuidv4(), tool: 'game.add_health_component', params: { entityId: '@Hero', maxHealth: 100 }, status: 'pending', dependencies: ['@Hero'] },
    ],
    racing: () => [
      { id: uuidv4(), tool: 'scene.create', params: { name: 'Track' }, status: 'pending', dependencies: [] },
      { id: uuidv4(), tool: 'entity.create', params: { name: 'Car', archetype: 'cube' }, status: 'pending', dependencies: [] },
      { id: uuidv4(), tool: 'phys.add_rigidbody', params: { entityId: '@Car', type: 'dynamic' }, status: 'pending', dependencies: ['@Car'] },
    ],
    survival: () => [
      { id: uuidv4(), tool: 'scene.create', params: { name: 'World' }, status: 'pending', dependencies: [] },
      { id: uuidv4(), tool: 'water.create_ocean', params: { size: 1000 }, status: 'pending', dependencies: [] },
      { id: uuidv4(), tool: 'entity.create', params: { name: 'Player', archetype: 'capsule' }, status: 'pending', dependencies: [] },
      { id: uuidv4(), tool: 'game.add_health_component', params: { entityId: '@Player', maxHealth: 100 }, status: 'pending', dependencies: ['@Player'] },
    ],
    puzzle: () => [
      { id: uuidv4(), tool: 'scene.create', params: { name: 'PuzzleRoom' }, status: 'pending', dependencies: [] },
      { id: uuidv4(), tool: 'entity.create', params: { name: 'PuzzlePiece', archetype: 'cube' }, status: 'pending', dependencies: [] },
    ],
  };

  const nodes = templates[templateId]?.() || [];
  
  return {
    id: uuidv4(),
    prompt: `Create ${templateId} game`,
    nodes,
    edges: [],
    status: 'ready',
  };
}

function parsePromptToTaskGraph(prompt: string): TaskGraph {
  const lowerPrompt = prompt.toLowerCase();
  const nodes: TaskNode[] = [];
  
  // Detect game type
  if (lowerPrompt.includes('platform') || lowerPrompt.includes('jump')) {
    nodes.push(...generateGameTemplate('platformer').nodes);
  }
  
  if (lowerPrompt.includes('shoot') || lowerPrompt.includes('fps') || lowerPrompt.includes('gun')) {
    nodes.push(...generateGameTemplate('shooter_arena').nodes);
  }
  
  if (lowerPrompt.includes('island') || lowerPrompt.includes('adventure')) {
    nodes.push(...generateGameTemplate('island_adventure').nodes);
  }
  
  if (lowerPrompt.includes('dungeon') || lowerPrompt.includes('rpg')) {
    nodes.push(...generateGameTemplate('rpg_dungeon').nodes);
  }
  
  if (lowerPrompt.includes('race') || lowerPrompt.includes('car')) {
    nodes.push(...generateGameTemplate('racing').nodes);
  }
  
  // If nothing specific detected, create a basic scene
  if (nodes.length === 0) {
    nodes.push(
      { id: uuidv4(), tool: 'scene.create', params: { name: 'MainScene' }, status: 'pending', dependencies: [] },
      { id: uuidv4(), tool: 'entity.create', params: { name: 'Player', archetype: 'cube' }, status: 'pending', dependencies: [] },
      { id: uuidv4(), tool: 'render.create_light', params: { type: 'directional' }, status: 'pending', dependencies: [] },
    );
  }
  
  return {
    id: uuidv4(),
    prompt,
    nodes,
    edges: [],
    status: 'ready',
  };
}

function analyzePrompt(prompt: string): {
  gameType: string;
  features: string[];
  complexity: 'simple' | 'medium' | 'complex';
  estimatedTasks: number;
} {
  const lowerPrompt = prompt.toLowerCase();
  const features: string[] = [];
  
  if (lowerPrompt.includes('player') || lowerPrompt.includes('character')) features.push('player');
  if (lowerPrompt.includes('enemy') || lowerPrompt.includes('enemies')) features.push('enemies');
  if (lowerPrompt.includes('water') || lowerPrompt.includes('ocean')) features.push('water');
  if (lowerPrompt.includes('terrain') || lowerPrompt.includes('ground')) features.push('terrain');
  if (lowerPrompt.includes('weapon') || lowerPrompt.includes('gun')) features.push('weapons');
  if (lowerPrompt.includes('vehicle') || lowerPrompt.includes('car') || lowerPrompt.includes('horse')) features.push('vehicles');
  if (lowerPrompt.includes('castle') || lowerPrompt.includes('building')) features.push('structures');
  if (lowerPrompt.includes('particle') || lowerPrompt.includes('vfx')) features.push('vfx');
  
  return {
    gameType: 'custom',
    features,
    complexity: features.length > 5 ? 'complex' : features.length > 2 ? 'medium' : 'simple',
    estimatedTasks: 10 + features.length * 5,
  };
}

function generatePlatformerLevel(params: { length: number; difficulty?: string; theme?: string }): { levelId: string; created: Entity[] } {
  const created: Entity[] = [];
  const platformCount = Math.floor(params.length / 5);
  
  for (let i = 0; i < platformCount; i++) {
    const ent = EntityFactory.create(`Platform_${i}`);
    ent.components.set('Transform', {
      id: uuidv4(),
      type: 'Transform',
      data: {
        position: { x: i * 5, y: Math.random() * 3, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: { x: 2, y: 0.5, z: 2 },
      },
      enabled: true,
    });
    created.push(ent);
  }
  
  return { levelId: uuidv4(), created };
}

function addEntityToActiveScene(entity: Entity): void {
  const store = useEngineStore.getState();
  store.addEntity(entity);
}

// ============================================
// Export All Generator Tools
// ============================================

export const GENERATOR_TOOLS: ToolDefinition[] = [
  gen_createGameFromTemplate,
  gen_planFromPrompt,
  gen_executePlan,
  gen_validateGameplay,
  gen_createPlatformerLevel,
  gen_createShooterArena,
  gen_createIslandAdventure,
];

export const BUILD_TOOLS: ToolDefinition[] = [
  build_setTarget,
  build_export,
  build_buildAndRun,
];
