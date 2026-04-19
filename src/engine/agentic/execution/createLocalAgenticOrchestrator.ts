import { WorldStateManager } from '../memory/WorldStateManager';
import { createEditorBackedToolRegistry } from '../tools/createEditorBackedToolRegistry';
import { createNodeEditorBuildExporter } from '../tools/adapters/nodeEditorBuildExporter';
import type { EditorStoreApi } from '../tools/adapters/sceneStoreAdapter';
import { createZustandSceneStoreAdapter } from '../tools/adapters/zustandSceneStoreAdapter';
import { FinalDeliveryValidatorAgent } from '../validation/FinalDeliveryValidatorAgent';
import { createNodeArtifactVerifier } from '../validation/nodeArtifactVerifier';
import { MasterOrchestrator, type MasterOrchestratorOptions } from './MasterOrchestrator';

export type LocalAgenticOrchestratorOptions = Omit<
  MasterOrchestratorOptions,
  'tools' | 'validator'
> & {
  artifactRootDir?: string;
  store?: EditorStoreApi;
};

export function createLocalAgenticOrchestrator(
  options: LocalAgenticOrchestratorOptions = {}
): MasterOrchestrator {
  const { artifactRootDir, store, world: providedWorld, ...orchestratorOptions } = options;
  const adapter = createZustandSceneStoreAdapter({
    store,
    buildExporter: createNodeEditorBuildExporter(),
  });
  const world = providedWorld ?? new WorldStateManager(adapter.snapshotWorldState());

  return new MasterOrchestrator({
    ...orchestratorOptions,
    world,
    tools: createEditorBackedToolRegistry(adapter),
    validator: new FinalDeliveryValidatorAgent(createNodeArtifactVerifier(artifactRootDir)),
  });
}
