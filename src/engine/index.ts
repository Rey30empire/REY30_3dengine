// ============================================
// Engine Module Exports
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// ============================================

// Core
export { EntityFactory, ComponentManager, EventBus, eventBus, componentManager } from './core/ECS';
export type { Entity, Component, ComponentType } from '@/types/engine';

// Rendering
export { RenderEngine, PrimitiveGenerator, MaterialPresets } from './rendering/RenderEngine';

// Scene
export { TerrainGenerator, NoiseGenerator, VegetationScatter, TerrainPresets, BiomePresets, BiomeType } from './scene/TerrainGenerator';

// AI
export { AIOrchestrator, orchestrator } from './ai/AIOrchestrator';

// Agents
export { 
  BaseAgent, 
  WorldBuilderAgent, 
  ModelGeneratorAgent, 
  AnimationAgent, 
  GameplayAgent, 
  TerrainAgent,
  AgentRegistry,
  agentRegistry 
} from './agents/AgentSystem';

// Command System
export * from './command';

// Editor
export { EditorLayout } from './editor/EditorLayout';
export { SceneView } from './editor/SceneView';
export { HierarchyPanel } from './editor/HierarchyPanel';
export { InspectorPanel } from './editor/InspectorPanel';
export { AIChatPanel, AIModeToggle, AgentStatusIndicator } from './editor/AIChatPanel';
export { AssetBrowserPanel } from './editor/AssetBrowserPanel';

// ReyPlay Studio
export { ReyPlayStudioPanel } from './reyplay/ui/ReyPlayStudioPanel';
export * from './reyplay/types';
export { buildReyPlayManifest, validateReyPlayProject } from './reyplay/build/compile';

// Advanced authoring foundations
export * as EngineSystems from './systems';

