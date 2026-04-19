// ============================================
// Serialization System - Index
// AI-FIRST-HYBRID-REY30-3D-ENGINE
// ============================================

export {
  PlayerPrefs,
  Serializer,
  SaveSystem,
  SceneStateManager,
  saveSystem,
  sceneStateManager,
  type SaveData,
  type SceneSaveData,
  type EntitySaveData,
  type TransformSaveData,
  type ComponentSaveData,
  type PlayerSaveData,
  type InventoryItemData,
  type QuestSaveData,
  type ObjectiveSaveData,
  type EnvironmentSaveData,
  type SettingsSaveData,
  type CheckpointData,
} from './SaveSystem';

export {
  DEFAULT_EDITOR_PROJECT_SAVE_SLOT,
  createEditorProjectSaveData,
  createLoadedEditorProjectPatch,
  getEditorProjectSaveSummary,
  isEditorProjectSaveData,
  loadEditorProjectFromSlot,
  restoreEditorProjectSaveData,
  saveEditorProjectToSlot,
  summarizeEditorProjectSaveData,
  type EditorProjectSaveData,
  type EditorProjectRestoreState,
  type EditorProjectSaveState,
  type EditorProjectSaveSummary,
} from './editorProjectSave';
