import { ToolRegistry } from './ToolRegistry';
import { createAnimationTools } from './animationTools';
import { createAssetBuildTools } from './assetBuildTools';
import { createEntityTools } from './entityTools';
import { createEnvironmentTools } from './environmentTools';
import { createGameplayTools } from './gameplayTools';
import { createInspectionTools } from './inspectionTools';
import { createPhysicsTools } from './physicsTools';
import { createSceneTools } from './sceneTools';

export function createDefaultToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.registerMany([
    ...createSceneTools(),
    ...createEntityTools(),
    ...createEnvironmentTools(),
    ...createPhysicsTools(),
    ...createAnimationTools(),
    ...createGameplayTools(),
    ...createAssetBuildTools(),
    ...createInspectionTools(),
  ]);
  return registry;
}
