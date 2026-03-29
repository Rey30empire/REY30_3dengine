// ============================================
// Agent System - Specialized AI Agents
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// ============================================

import type { Agent, AgentTask, AgentType, AgentTool, Entity } from '@/types/engine';
import { v4 as uuidv4 } from 'uuid';
import { EntityFactory } from '@/engine/core/ECS';

// Base Agent Class
export abstract class BaseAgent implements Agent {
  id: string;
  type: AgentType;
  name: string;
  status: 'idle' | 'working' | 'error' | 'disabled' = 'idle';
  tools: AgentTool[] = [];
  currentTask: AgentTask | null = null;

  constructor(type: AgentType, name: string) {
    this.id = uuidv4();
    this.type = type;
    this.name = name;
    this.initializeTools();
  }

  abstract initializeTools(): void;

  async executeTask(task: AgentTask): Promise<unknown> {
    this.status = 'working';
    this.currentTask = task;

    try {
      const result = await this.processTask(task);
      this.status = 'idle';
      this.currentTask = null;
      return result;
    } catch (error) {
      this.status = 'error';
      throw error;
    }
  }

  abstract processTask(task: AgentTask): Promise<unknown>;

  addTool(tool: AgentTool): void {
    this.tools.push(tool);
  }
}

// World Builder Agent
export class WorldBuilderAgent extends BaseAgent {
  constructor() {
    super('world_builder', 'World Builder Agent');
  }

  initializeTools(): void {
    this.addTool({
      id: 'create_terrain',
      name: 'Create Terrain',
      description: 'Generate procedural terrain with specified parameters',
      parameters: [
        { name: 'preset', type: 'string', required: false, description: 'Terrain preset (mountains, hills, plains, island)' },
        { name: 'size', type: 'number', required: false, description: 'Terrain size in meters' },
        { name: 'height', type: 'number', required: false, description: 'Maximum height' },
      ],
      execute: async (params) => {
        return { type: 'terrain', params };
      },
    });

    this.addTool({
      id: 'add_water',
      name: 'Add Water',
      description: 'Add water bodies to the scene',
      parameters: [
        { name: 'type', type: 'string', required: true, description: 'Water type (lake, river, ocean)' },
        { name: 'position', type: 'object', required: true, description: 'Water position' },
      ],
      execute: async (params) => {
        return { type: 'water', params };
      },
    });

    this.addTool({
      id: 'set_skybox',
      name: 'Set Skybox',
      description: 'Set the scene skybox/environment',
      parameters: [
        { name: 'type', type: 'string', required: true, description: 'Skybox type (day, night, sunset, custom)' },
      ],
      execute: async (params) => {
        return { type: 'skybox', params };
      },
    });
  }

  async processTask(task: AgentTask): Promise<unknown> {
    const prompt = task.prompt.toLowerCase();
    
    // Analyze prompt and determine actions
    const actions: unknown[] = [];

    if (prompt.includes('terrain') || prompt.includes('mountain') || prompt.includes('landscape')) {
      const tool = this.tools.find(t => t.id === 'create_terrain');
      if (tool) {
        const result = await tool.execute({ preset: 'mountains' });
        actions.push(result);
      }
    }

    if (prompt.includes('water') || prompt.includes('lake') || prompt.includes('river')) {
      const tool = this.tools.find(t => t.id === 'add_water');
      if (tool) {
        const result = await tool.execute({ type: 'lake', position: { x: 0, y: 0, z: 0 } });
        actions.push(result);
      }
    }

    if (prompt.includes('sky') || prompt.includes('environment')) {
      const tool = this.tools.find(t => t.id === 'set_skybox');
      if (tool) {
        const result = await tool.execute({ type: prompt.includes('night') ? 'night' : 'day' });
        actions.push(result);
      }
    }

    return { actions, message: 'World building tasks processed' };
  }
}

// 3D Model Agent
export class ModelGeneratorAgent extends BaseAgent {
  constructor() {
    super('model_generator', '3D Model Agent');
  }

  initializeTools(): void {
    this.addTool({
      id: 'create_primitive',
      name: 'Create Primitive',
      description: 'Create a primitive 3D shape',
      parameters: [
        { name: 'type', type: 'string', required: true, description: 'Primitive type (cube, sphere, cylinder, plane, capsule)' },
        { name: 'position', type: 'object', required: false, description: 'Position in 3D space' },
        { name: 'scale', type: 'object', required: false, description: 'Scale of the object' },
      ],
      execute: async (params) => {
        return { type: 'primitive', params };
      },
    });

    this.addTool({
      id: 'create_character',
      name: 'Create Character',
      description: 'Create a humanoid character',
      parameters: [
        { name: 'name', type: 'string', required: false, description: 'Character name' },
        { name: 'type', type: 'string', required: false, description: 'Character type (human, robot, fantasy)' },
      ],
      execute: async (params) => {
        return { type: 'character', params };
      },
    });

    this.addTool({
      id: 'create_building',
      name: 'Create Building',
      description: 'Generate a building or structure',
      parameters: [
        { name: 'type', type: 'string', required: true, description: 'Building type (house, castle, tower, bridge)' },
        { name: 'style', type: 'string', required: false, description: 'Architectural style (medieval, modern, fantasy)' },
      ],
      execute: async (params) => {
        return { type: 'building', params };
      },
    });
  }

  async processTask(task: AgentTask): Promise<unknown> {
    const prompt = task.prompt.toLowerCase();
    const entities: Partial<Entity>[] = [];

    // Detect primitives
    if (prompt.includes('cube') || prompt.includes('box')) {
      entities.push({
        name: 'Cube',
        components: new Map([
          ['Transform', { id: uuidv4(), type: 'Transform', data: { position: { x: 0, y: 0.5, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 } }, enabled: true }],
          ['MeshRenderer', { id: uuidv4(), type: 'MeshRenderer', data: { meshId: 'cube', materialId: 'default' }, enabled: true }],
        ]),
      });
    }

    if (prompt.includes('sphere') || prompt.includes('ball')) {
      entities.push({
        name: 'Sphere',
        components: new Map([
          ['Transform', { id: uuidv4(), type: 'Transform', data: { position: { x: 2, y: 0.5, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 } }, enabled: true }],
          ['MeshRenderer', { id: uuidv4(), type: 'MeshRenderer', data: { meshId: 'sphere', materialId: 'default' }, enabled: true }],
        ]),
      });
    }

    // Detect buildings
    if (prompt.includes('castle')) {
      const tool = this.tools.find(t => t.id === 'create_building');
      if (tool) {
        await tool.execute({ type: 'castle', style: 'medieval' });
        entities.push({
          name: 'Castle',
          components: new Map([
            ['Transform', { id: uuidv4(), type: 'Transform', data: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 } }, enabled: true }],
          ]),
        });
      }
    }

    // Detect characters
    if (prompt.includes('character') || prompt.includes('enemy') || prompt.includes('player')) {
      entities.push({
        name: 'Character',
        components: new Map([
          ['Transform', { id: uuidv4(), type: 'Transform', data: { position: { x: 0, y: 1, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 } }, enabled: true }],
          ['MeshRenderer', { id: uuidv4(), type: 'MeshRenderer', data: { meshId: 'capsule', materialId: 'default' }, enabled: true }],
        ]),
      });
    }

    return { entities, message: `Generated ${entities.length} objects` };
  }
}

// Animation Agent
export class AnimationAgent extends BaseAgent {
  constructor() {
    super('animation', 'Animation Agent');
  }

  initializeTools(): void {
    this.addTool({
      id: 'create_animation',
      name: 'Create Animation',
      description: 'Create an animation clip',
      parameters: [
        { name: 'name', type: 'string', required: true, description: 'Animation name' },
        { name: 'type', type: 'string', required: true, description: 'Animation type (walk, run, idle, attack)' },
        { name: 'duration', type: 'number', required: false, description: 'Duration in seconds' },
      ],
      execute: async (params) => {
        return { type: 'animation', params };
      },
    });

    this.addTool({
      id: 'create_animator',
      name: 'Create Animator',
      description: 'Create an animation controller',
      parameters: [
        { name: 'entityId', type: 'string', required: true, description: 'Target entity ID' },
        { name: 'animations', type: 'array', required: true, description: 'List of animations to include' },
      ],
      execute: async (params) => {
        return { type: 'animator', params };
      },
    });
  }

  async processTask(task: AgentTask): Promise<unknown> {
    const prompt = task.prompt.toLowerCase();
    const animations: unknown[] = [];

    if (prompt.includes('walk') || prompt.includes('walking')) {
      const tool = this.tools.find(t => t.id === 'create_animation');
      if (tool) {
        const result = await tool.execute({ name: 'Walk', type: 'walk', duration: 1.0 });
        animations.push(result);
      }
    }

    if (prompt.includes('run') || prompt.includes('running')) {
      const tool = this.tools.find(t => t.id === 'create_animation');
      if (tool) {
        const result = await tool.execute({ name: 'Run', type: 'run', duration: 0.5 });
        animations.push(result);
      }
    }

    if (prompt.includes('idle')) {
      const tool = this.tools.find(t => t.id === 'create_animation');
      if (tool) {
        const result = await tool.execute({ name: 'Idle', type: 'idle', duration: 2.0 });
        animations.push(result);
      }
    }

    return { animations, message: `Generated ${animations.length} animations` };
  }
}

// Gameplay Agent
export class GameplayAgent extends BaseAgent {
  constructor() {
    super('gameplay', 'Gameplay Agent');
  }

  initializeTools(): void {
    this.addTool({
      id: 'create_script',
      name: 'Create Script',
      description: 'Generate a gameplay script',
      parameters: [
        { name: 'name', type: 'string', required: true, description: 'Script name' },
        { name: 'type', type: 'string', required: true, description: 'Script type (player_controller, enemy_ai, pickup, trigger)' },
      ],
      execute: async (params) => {
        const scriptType =
          typeof (params as { type?: unknown }).type === 'string'
            ? (params as { type: string }).type
            : 'player_controller';
        return { type: 'script', params, code: this.generateScriptCode(scriptType) };
      },
    });

    this.addTool({
      id: 'create_gameplay_system',
      name: 'Create Gameplay System',
      description: 'Create a gameplay system (health, inventory, etc.)',
      parameters: [
        { name: 'type', type: 'string', required: true, description: 'System type (health, inventory, quest, dialogue)' },
      ],
      execute: async (params) => {
        return { type: 'system', params };
      },
    });
  }

  private generateScriptCode(type: string): string {
    const templates: Record<string, string> = {
      player_controller: `
// Player Controller Script
export class PlayerController {
  speed = 5.0;
  jumpForce = 10.0;
  
  onStart() {
    console.log('Player controller initialized');
  }
  
  onUpdate(deltaTime) {
    // Movement logic
    const moveX = Input.GetAxis('horizontal');
    const moveZ = Input.GetAxis('vertical');
    
    this.entity.transform.position.x += moveX * this.speed * deltaTime;
    this.entity.transform.position.z += moveZ * this.speed * deltaTime;
  }
}
      `,
      enemy_ai: `
// Enemy AI Script
export class EnemyAI {
  detectionRange = 10.0;
  attackRange = 2.0;
  moveSpeed = 3.0;
  
  onStart() {
    this.target = null;
    this.state = 'patrol';
  }
  
  onUpdate(deltaTime) {
    if (this.state === 'patrol') {
      this.patrol(deltaTime);
    } else if (this.state === 'chase') {
      this.chase(deltaTime);
    } else if (this.state === 'attack') {
      this.attack(deltaTime);
    }
  }
  
  patrol(deltaTime) {
    // Patrol logic
  }
  
  chase(deltaTime) {
    // Chase player
  }
  
  attack(deltaTime) {
    // Attack logic
  }
}
      `,
    };

    return templates[type] || '// Custom script template';
  }

  async processTask(task: AgentTask): Promise<unknown> {
    const prompt = task.prompt.toLowerCase();
    const systems: unknown[] = [];

    if (prompt.includes('player') || prompt.includes('control')) {
      const tool = this.tools.find(t => t.id === 'create_script');
      if (tool) {
        const result = await tool.execute({ name: 'PlayerController', type: 'player_controller' });
        systems.push(result);
      }
    }

    if (prompt.includes('enemy') || prompt.includes('ai')) {
      const tool = this.tools.find(t => t.id === 'create_script');
      if (tool) {
        const result = await tool.execute({ name: 'EnemyAI', type: 'enemy_ai' });
        systems.push(result);
      }
    }

    if (prompt.includes('health') || prompt.includes('damage')) {
      const tool = this.tools.find(t => t.id === 'create_gameplay_system');
      if (tool) {
        const result = await tool.execute({ type: 'health' });
        systems.push(result);
      }
    }

    return { systems, message: `Generated ${systems.length} gameplay elements` };
  }
}

// Terrain Agent
export class TerrainAgent extends BaseAgent {
  constructor() {
    super('terrain', 'Terrain Agent');
  }

  initializeTools(): void {
    this.addTool({
      id: 'generate_heightmap',
      name: 'Generate Heightmap',
      description: 'Generate a procedural heightmap for terrain',
      parameters: [
        { name: 'size', type: 'number', required: false, description: 'Heightmap resolution' },
        { name: 'scale', type: 'number', required: false, description: 'Noise scale' },
        { name: 'seed', type: 'number', required: false, description: 'Random seed' },
      ],
      execute: async (params) => {
        return { type: 'heightmap', params };
      },
    });

    this.addTool({
      id: 'apply_biome',
      name: 'Apply Biome',
      description: 'Apply biome settings to terrain',
      parameters: [
        { name: 'biome', type: 'string', required: true, description: 'Biome type (desert, forest, tundra, jungle, plains)' },
      ],
      execute: async (params) => {
        return { type: 'biome', params };
      },
    });
  }

  async processTask(task: AgentTask): Promise<unknown> {
    const prompt = task.prompt.toLowerCase();
    const terrainData: unknown[] = [];

    if (prompt.includes('terrain') || prompt.includes('ground') || prompt.includes('land')) {
      const tool = this.tools.find(t => t.id === 'generate_heightmap');
      if (tool) {
        const result = await tool.execute({
          size: 128,
          scale: prompt.includes('mountain') ? 0.02 : 0.01,
          seed: Math.random() * 10000,
        });
        terrainData.push(result);
      }
    }

    if (prompt.includes('forest') || prompt.includes('jungle')) {
      const tool = this.tools.find(t => t.id === 'apply_biome');
      if (tool) {
        const result = await tool.execute({ biome: prompt.includes('forest') ? 'forest' : 'jungle' });
        terrainData.push(result);
      }
    }

    if (prompt.includes('desert')) {
      const tool = this.tools.find(t => t.id === 'apply_biome');
      if (tool) {
        const result = await tool.execute({ biome: 'desert' });
        terrainData.push(result);
      }
    }

    return { terrainData, message: 'Terrain generation complete' };
  }
}

// Agent Registry
export class AgentRegistry {
  private agents: Map<AgentType, BaseAgent> = new Map();

  constructor() {
    this.registerDefaults();
  }

  private registerDefaults(): void {
    this.register(new WorldBuilderAgent());
    this.register(new ModelGeneratorAgent());
    this.register(new AnimationAgent());
    this.register(new GameplayAgent());
    this.register(new TerrainAgent());
  }

  register(agent: BaseAgent): void {
    this.agents.set(agent.type, agent);
  }

  get(type: AgentType): BaseAgent | undefined {
    return this.agents.get(type);
  }

  getAll(): BaseAgent[] {
    return Array.from(this.agents.values());
  }
}

// Global agent registry
export const agentRegistry = new AgentRegistry();
