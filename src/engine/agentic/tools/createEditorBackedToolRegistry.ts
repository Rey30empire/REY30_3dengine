import { ToolRegistry } from './ToolRegistry';
import { createEditorBackedAnimationTools } from './editorBackedAnimationTools';
import { createEditorBackedAssetBuildTools } from './editorBackedAssetBuildTools';
import { createEditorBackedEnvironmentTools, createEditorBackedSceneTools } from './editorBackedTools';
import { createEditorBackedGameplayTools } from './editorBackedGameplayTools';
import { createEditorBackedMaterialTools } from './editorBackedMaterialTools';
import { createEditorBackedPhysicsTools } from './editorBackedPhysicsTools';
import { createInspectionTools } from './inspectionTools';
import type { EditorSceneStoreAdapter } from './adapters/sceneStoreAdapter';

export function createEditorBackedToolRegistry(adapter: EditorSceneStoreAdapter): ToolRegistry {
  const registry = new ToolRegistry();
  registry.registerMany([
    ...createEditorBackedSceneTools(adapter),
    ...createEditorBackedEnvironmentTools(adapter),
    ...createEditorBackedMaterialTools(adapter),
    ...createEditorBackedPhysicsTools(adapter),
    ...createEditorBackedAnimationTools(adapter),
    ...createEditorBackedGameplayTools(adapter),
    ...createEditorBackedAssetBuildTools(adapter),
    ...createInspectionTools(),
  ]);
  return registry;
}
