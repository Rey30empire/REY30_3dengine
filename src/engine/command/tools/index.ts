// ============================================
// Tool Index - Register All Tools
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// Updated
// ============================================

import { ToolRegistry } from './ToolRegistry';

// Import all tool categories
import { MVP_TOOLS } from './MVPTools';
import { SCENE_TOOLS, ENTITY_TOOLS } from './SceneEntityTools';
import { PHYSICS_TOOLS, RENDER_TOOLS, GAMEPLAY_TOOLS, VFX_TOOLS, WATER_TOOLS, MOUNT_TOOLS } from './PhysicsGameplayTools';
import { GENERATOR_TOOLS, BUILD_TOOLS } from './GeneratorTools';

// ============================================
// Tool Categories
// ============================================

export const TOOL_CATEGORIES = {
  MVP: 'MVP Tools - Context & Transactions',
  SCENE: 'Scene Management',
  ENTITY: 'Entity & Component System',
  PHYSICS: 'Physics & Collisions',
  RENDER: 'Rendering & Lighting',
  GAMEPLAY: 'Gameplay Framework',
  VFX: 'Particles & Visual Effects',
  WATER: 'Water & Ocean Systems',
  MOUNT: 'Vehicles & Mounts',
  GENERATOR: 'Game Generation',
  BUILD: 'Build & Export',
} as const;

// ============================================
// Create Tool Registry
// ============================================

export function createToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();

  // Register MVP Tools
  MVP_TOOLS.forEach(tool => registry.register(tool));

  // Register Scene Tools
  SCENE_TOOLS.forEach(tool => registry.register(tool));

  // Register Entity Tools
  ENTITY_TOOLS.forEach(tool => registry.register(tool));

  // Register Physics Tools
  PHYSICS_TOOLS.forEach(tool => registry.register(tool));

  // Register Render Tools
  RENDER_TOOLS.forEach(tool => registry.register(tool));

  // Register Gameplay Tools
  GAMEPLAY_TOOLS.forEach(tool => registry.register(tool));

  // Register VFX Tools
  VFX_TOOLS.forEach(tool => registry.register(tool));

  // Register Water Tools
  WATER_TOOLS.forEach(tool => registry.register(tool));

  // Register Mount Tools
  MOUNT_TOOLS.forEach(tool => registry.register(tool));

  // Register Generator Tools
  GENERATOR_TOOLS.forEach(tool => registry.register(tool));

  // Register Build Tools
  BUILD_TOOLS.forEach(tool => registry.register(tool));

  return registry;
}

// ============================================
// Export All Tools
// ============================================

export * from './ToolRegistry';

// ============================================
// Tool Statistics
// ============================================

export const TOOL_STATS = {
  MVP_TOOLS: MVP_TOOLS.length,
  SCENE_TOOLS: SCENE_TOOLS.length,
  ENTITY_TOOLS: ENTITY_TOOLS.length,
  PHYSICS_TOOLS: PHYSICS_TOOLS.length,
  RENDER_TOOLS: RENDER_TOOLS.length,
  GAMEPLAY_TOOLS: GAMEPLAY_TOOLS.length,
  VFX_TOOLS: VFX_TOOLS.length,
  WATER_TOOLS: WATER_TOOLS.length,
  MOUNT_TOOLS: MOUNT_TOOLS.length,
  GENERATOR_TOOLS: GENERATOR_TOOLS.length,
  BUILD_TOOLS: BUILD_TOOLS.length,
  get TOTAL() {
    return this.MVP_TOOLS + this.SCENE_TOOLS + this.ENTITY_TOOLS +
           this.PHYSICS_TOOLS + this.RENDER_TOOLS + this.GAMEPLAY_TOOLS +
           this.VFX_TOOLS + this.WATER_TOOLS + this.MOUNT_TOOLS +
           this.GENERATOR_TOOLS + this.BUILD_TOOLS;
  }
};
