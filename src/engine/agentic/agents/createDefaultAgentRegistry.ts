import { AgentRegistry } from './AgentRegistry';
import { AnimationAgent } from './AnimationAgent';
import { GameplayAgent } from './GameplayAgent';
import { LightingEnvironmentAgent } from './LightingEnvironmentAgent';
import { MaintenanceAgent } from './MaintenanceAgent';
import { ModelingAgent } from './ModelingAgent';
import { PhysicsAgent } from './PhysicsAgent';
import { ProjectManagerAgent } from './ProjectManagerAgent';
import { SceneArchitectAgent } from './SceneArchitectAgent';
import { TechnicalIntegrationAgent } from './TechnicalIntegrationAgent';

export function createDefaultAgentRegistry(): AgentRegistry {
  const registry = new AgentRegistry();
  registry.registerMany([
    new ProjectManagerAgent(),
    new SceneArchitectAgent(),
    new ModelingAgent(),
    new AnimationAgent(),
    new GameplayAgent(),
    new TechnicalIntegrationAgent(),
    new MaintenanceAgent(),
    new LightingEnvironmentAgent(),
    new PhysicsAgent(),
  ]);
  return registry;
}
