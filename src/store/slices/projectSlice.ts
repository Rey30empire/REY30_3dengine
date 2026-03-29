import { v4 as uuidv4 } from 'uuid';
import { battleEngine } from '@/engine/gameplay/BattleEngine';
import type { ScribInstance } from '@/engine/scrib';
import type {
  AutomationPermission,
  Entity,
  Scene,
} from '@/types/engine';
import type { ProjectSlice, SliceCreator } from '../editorStore.types';
import {
  collectDescendantIds,
  collectSceneEntityIds,
  findSceneIdForEntity,
  normalizeScenesAndEntities,
} from '../sceneGraph';
import {
  cloneHistoryState,
  cloneValue,
  createDefaultAutomationPermissions,
  HISTORY_LIMIT,
  pushHistory,
} from '../editorStore.utils';

function addIdsToSceneMembership(
  scene: Scene,
  entities: Map<string, Entity>,
  entityIds: string[]
): Scene {
  const knownIds = new Set<string>(scene.rootEntities);
  scene.entities.forEach((entity) => knownIds.add(entity.id));

  let changed = false;
  const nextSceneEntities = [...scene.entities];
  entityIds.forEach((entityId) => {
    if (knownIds.has(entityId)) return;
    const entity = entities.get(entityId);
    if (!entity) return;
    knownIds.add(entityId);
    nextSceneEntities.push(entity);
    changed = true;
  });

  if (!changed) return scene;
  return {
    ...scene,
    entities: nextSceneEntities,
  };
}

function removeIdsFromScene(scene: Scene, idsToRemove: Set<string>): Scene {
  const hasSceneIds = scene.rootEntities.some((entityId) => idsToRemove.has(entityId));
  const hasSceneEntities = scene.entities.some((entity) => idsToRemove.has(entity.id));
  const nextCollections = (scene.collections ?? []).map((collection) => ({
    ...collection,
    entityIds: collection.entityIds.filter((entityId) => !idsToRemove.has(entityId)),
  }));
  const collectionsChanged = nextCollections.some((collection, index) => {
    const current = scene.collections?.[index];
    if (!current) return true;
    if (current.entityIds.length !== collection.entityIds.length) return true;
    return current.entityIds.some((entityId, entityIndex) => collection.entityIds[entityIndex] !== entityId);
  });

  if (!hasSceneIds && !hasSceneEntities && !collectionsChanged) {
    return scene;
  }

  return {
    ...scene,
    entities: scene.entities.filter((entity) => !idsToRemove.has(entity.id)),
    rootEntities: scene.rootEntities.filter((entityId) => !idsToRemove.has(entityId)),
    collections: nextCollections,
  };
}

function rebalanceSceneMembership(params: {
  scenes: Scene[];
  entities: Map<string, Entity>;
  entityIds: string[];
  targetSceneId: string | null;
}): { scenes: Scene[]; affectedSceneIds: Set<string> } {
  const idsToMove = new Set(params.entityIds);
  const affectedSceneIds = new Set<string>();

  const nextScenes = params.scenes.map((scene) => {
    let nextScene = removeIdsFromScene(scene, idsToMove);
    if (nextScene !== scene) {
      affectedSceneIds.add(scene.id);
    }

    if (scene.id === params.targetSceneId) {
      const withMembership = addIdsToSceneMembership(nextScene, params.entities, params.entityIds);
      if (withMembership !== nextScene) {
        affectedSceneIds.add(scene.id);
      }
      nextScene = withMembership;
    }

    return nextScene;
  });

  return {
    scenes: nextScenes,
    affectedSceneIds,
  };
}

function pruneScribProfilesForEntities<T>(profiles: Map<string, T>, removedEntityIds: Set<string>) {
  return new Map(
    Array.from(profiles.entries()).filter(([entityId]) => !removedEntityIds.has(entityId))
  );
}

function pruneScribInstances(params: {
  scribInstances: Map<string, ScribInstance>;
  removedEntityIds: Set<string>;
  removedSceneIds?: Set<string>;
}) {
  const removedSceneIds = params.removedSceneIds ?? new Set<string>();
  return new Map(
    Array.from(params.scribInstances.entries()).filter(([, value]) => {
      if (value.target.scope === 'entity') {
        return !params.removedEntityIds.has(value.target.id);
      }
      if (value.target.scope === 'scene') {
        return !removedSceneIds.has(value.target.id);
      }
      return true;
    })
  );
}

export const createProjectSlice: SliceCreator<ProjectSlice> = (set) => ({
  projectName: 'Untitled Project',
  projectPath: '',
  isDirty: false,
  scenes: [],
  activeSceneId: null,
  entities: new Map(),
  assets: [],
  historyPast: [],
  historyFuture: [],
  automationPermissions: createDefaultAutomationPermissions(),

  setProjectName: (name) =>
    set((state) => {
      if (state.projectName === name) return {};
      return {
        ...pushHistory(state),
        projectName: name,
        isDirty: true,
      };
    }),

  setDirty: (dirty) => set({ isDirty: dirty }),

  createScene: (name) => {
    const scene: Scene = {
      id: uuidv4(),
      name,
      entities: [],
      rootEntities: [],
      collections: [
        {
          id: uuidv4(),
          name: 'Master',
          color: '#4da3ff',
          visible: true,
          entityIds: [],
        },
      ],
      environment: {
        skybox: 'studio',
        ambientLight: { r: 0.5, g: 0.5, b: 0.5 },
        ambientIntensity: 1,
        environmentIntensity: 1,
        environmentRotation: 0,
        directionalLightIntensity: 1.2,
        directionalLightAzimuth: 45,
        directionalLightElevation: 55,
        fog: null,
        postProcessing: {
          bloom: { enabled: false, intensity: 0.5, threshold: 0.8, radius: 0.5 },
          ssao: { enabled: false, radius: 0.5, intensity: 1, bias: 0.025 },
          ssr: { enabled: false, intensity: 0.5, maxDistance: 100 },
          colorGrading: {
            enabled: false,
            exposure: 1,
            contrast: 1,
            saturation: 1,
            gamma: 2.2,
            toneMapping: 'aces',
            rendererExposure: 1,
          },
          vignette: { enabled: false, intensity: 0.5, smoothness: 0.5, roundness: 1 },
        },
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    set((state) => ({
      ...pushHistory(state),
      scenes: [...state.scenes, scene],
      activeSceneId: scene.id,
      isDirty: true,
    }));

    return scene;
  },

  setActiveScene: (sceneId) => set({ activeSceneId: sceneId }),

  updateScene: (sceneId, updates) =>
    set((state) => {
      const currentScene = state.scenes.find((scene) => scene.id === sceneId);
      if (!currentScene) return {};

      const nextScenes = state.scenes.map((scene) => {
        if (scene.id !== sceneId) return scene;
        return {
          ...scene,
          ...updates,
          updatedAt: new Date(),
        };
      });

      return {
        ...pushHistory(state),
        scenes: nextScenes,
        isDirty: true,
      };
    }),

  deleteScene: (sceneId) =>
    set((state) => {
      const scene = state.scenes.find((item) => item.id === sceneId);
      if (!scene) return {};

      const removedEntityIds = new Set(collectSceneEntityIds(scene, state.entities));
      removedEntityIds.forEach((entityId) => battleEngine.unregisterByEntityId(entityId));

      const nextScenes = state.scenes.filter((item) => item.id !== sceneId);
      const nextEntities = new Map(
        Array.from(state.entities.entries()).filter(([entityId]) => !removedEntityIds.has(entityId))
      );
      const nextActiveSceneId = state.activeSceneId === sceneId
        ? nextScenes[0]?.id ?? null
        : state.activeSceneId;

      return {
        ...pushHistory(state),
        scenes: nextScenes,
        activeSceneId: nextActiveSceneId,
        entities: nextEntities,
        scribProfiles: pruneScribProfilesForEntities(state.scribProfiles, removedEntityIds),
        activeScribEntityId:
          state.activeScribEntityId && removedEntityIds.has(state.activeScribEntityId)
            ? null
            : state.activeScribEntityId,
        scribInstances: pruneScribInstances({
          scribInstances: state.scribInstances,
          removedEntityIds,
          removedSceneIds: new Set([sceneId]),
        }),
        editor: {
          ...state.editor,
          selectedEntities: state.editor.selectedEntities.filter(
            (entityId) => !removedEntityIds.has(entityId)
          ),
        },
        isDirty: true,
      };
    }),

  addEntity: (entity) =>
    set((state) => {
      const nextEntities = new Map(state.entities);
      nextEntities.set(entity.id, entity);

      const targetSceneId =
        (entity.parentId ? findSceneIdForEntity(state.scenes, entity.parentId) : null) ??
        state.activeSceneId;
      const membership = rebalanceSceneMembership({
        scenes: state.scenes,
        entities: nextEntities,
        entityIds: [entity.id],
        targetSceneId,
      });
      const normalized = membership.affectedSceneIds.size > 0
        ? normalizeScenesAndEntities({
            scenes: membership.scenes,
            entities: nextEntities,
            sceneIds: membership.affectedSceneIds,
          })
        : { scenes: membership.scenes, entities: nextEntities };

      return {
        ...pushHistory(state),
        scenes: normalized.scenes,
        entities: normalized.entities,
        isDirty: true,
      };
    }),

  updateEntity: (id, updates) =>
    set((state) => {
      const currentEntity = state.entities.get(id);
      if (!currentEntity) {
        return {};
      }

      const nextEntities = new Map(state.entities);
      const nextEntity = { ...currentEntity, ...updates };
      nextEntities.set(id, nextEntity);

      const currentSceneId = findSceneIdForEntity(state.scenes, id);
      const targetSceneId =
        (nextEntity.parentId ? findSceneIdForEntity(state.scenes, nextEntity.parentId) : null) ??
        currentSceneId ??
        state.activeSceneId;
      const parentChanged = Object.prototype.hasOwnProperty.call(updates, 'parentId');

      let nextScenes = state.scenes;
      const affectedSceneIds = new Set<string>();

      if (parentChanged || currentSceneId !== targetSceneId || (!currentSceneId && targetSceneId)) {
        const movedEntityIds = collectDescendantIds(nextEntities, id);
        const membership = rebalanceSceneMembership({
          scenes: state.scenes,
          entities: nextEntities,
          entityIds: movedEntityIds,
          targetSceneId,
        });
        nextScenes = membership.scenes;
        membership.affectedSceneIds.forEach((sceneId) => affectedSceneIds.add(sceneId));
      } else if (currentSceneId) {
        affectedSceneIds.add(currentSceneId);
      }

      const normalized = affectedSceneIds.size > 0
        ? normalizeScenesAndEntities({
            scenes: nextScenes,
            entities: nextEntities,
            sceneIds: affectedSceneIds,
          })
        : { scenes: nextScenes, entities: nextEntities };

      return {
        ...pushHistory(state),
        scenes: normalized.scenes,
        entities: normalized.entities,
        isDirty: true,
      };
    }),

  updateEntityTransient: (id, updates) =>
    set((state) => {
      const currentEntity = state.entities.get(id);
      if (!currentEntity) {
        return {};
      }

      const nextEntities = new Map(state.entities);
      const nextEntity = { ...currentEntity, ...updates };
      nextEntities.set(id, nextEntity);

      const currentSceneId = findSceneIdForEntity(state.scenes, id);
      const parentChanged = Object.prototype.hasOwnProperty.call(updates, 'parentId');

      if (!currentSceneId) {
        return {
          entities: nextEntities,
        };
      }

      if (!parentChanged) {
        return {
          entities: nextEntities,
          scenes: state.scenes.map((scene) => {
            if (scene.id !== currentSceneId) return scene;
            return {
              ...scene,
              entities: scene.entities.map((entity) => (
                entity.id === id
                  ? { ...entity, ...updates }
                  : entity
              )),
            };
          }),
        };
      }

      const targetSceneId =
        (nextEntity.parentId ? findSceneIdForEntity(state.scenes, nextEntity.parentId) : null) ??
        currentSceneId ??
        state.activeSceneId;
      const movedEntityIds = collectDescendantIds(nextEntities, id);
      const membership = rebalanceSceneMembership({
        scenes: state.scenes,
        entities: nextEntities,
        entityIds: movedEntityIds,
        targetSceneId,
      });
      const normalized = normalizeScenesAndEntities({
        scenes: membership.scenes,
        entities: nextEntities,
        sceneIds: membership.affectedSceneIds,
      });

      return {
        scenes: normalized.scenes,
        entities: normalized.entities,
      };
    }),

  removeEntity: (id) =>
    set((state) => {
      const removedEntityIds = collectDescendantIds(state.entities, id);
      if (removedEntityIds.length === 0) {
        return {};
      }

      const removedEntityIdSet = new Set(removedEntityIds);
      removedEntityIds.forEach((entityId) => battleEngine.unregisterByEntityId(entityId));

      const nextEntities = new Map(
        Array.from(state.entities.entries()).filter(([entityId]) => !removedEntityIdSet.has(entityId))
      );
      const nextScenes = state.scenes.map((scene) => removeIdsFromScene(scene, removedEntityIdSet));
      const affectedSceneIds = new Set(
        nextScenes
          .filter((scene, index) => scene !== state.scenes[index])
          .map((scene) => scene.id)
      );
      const normalized = affectedSceneIds.size > 0
        ? normalizeScenesAndEntities({
            scenes: nextScenes,
            entities: nextEntities,
            sceneIds: affectedSceneIds,
          })
        : { scenes: nextScenes, entities: nextEntities };

      return {
        ...pushHistory(state),
        scenes: normalized.scenes,
        entities: normalized.entities,
        scribProfiles: pruneScribProfilesForEntities(state.scribProfiles, removedEntityIdSet),
        activeScribEntityId:
          state.activeScribEntityId && removedEntityIdSet.has(state.activeScribEntityId)
            ? null
            : state.activeScribEntityId,
        scribInstances: pruneScribInstances({
          scribInstances: state.scribInstances,
          removedEntityIds: removedEntityIdSet,
        }),
        isDirty: true,
        editor: {
          ...state.editor,
          selectedEntities: state.editor.selectedEntities.filter(
            (entityId) => !removedEntityIdSet.has(entityId)
          ),
        },
      };
    }),

  addAsset: (asset) =>
    set((state) => ({
      ...pushHistory(state),
      assets: [...state.assets, asset],
      isDirty: true,
    })),

  removeAsset: (assetId) =>
    set((state) => ({
      ...pushHistory(state),
      assets: state.assets.filter((asset) => asset.id !== assetId),
      isDirty: true,
    })),

  undo: () =>
    set((state) => {
      if (state.historyPast.length === 0) return {};

      const previous = state.historyPast[state.historyPast.length - 1];
      const remainingHistory = state.historyPast.slice(0, -1);
      const future = [
        { ...cloneHistoryState(state), label: 'redo', timestamp: Date.now() },
        ...state.historyFuture,
      ];

      return {
        historyPast: remainingHistory,
        historyFuture: future.slice(0, HISTORY_LIMIT),
        projectName: previous.projectName,
        projectPath: previous.projectPath,
        isDirty: previous.isDirty,
        scenes: cloneValue(previous.scenes),
        activeSceneId: previous.activeSceneId,
        entities: cloneValue(previous.entities),
        assets: cloneValue(previous.assets),
        engineMode: previous.engineMode,
        aiMode: previous.aiMode,
        aiEnabled: previous.aiEnabled,
        editor: { ...state.editor, ...cloneValue(previous.editor) },
        scribProfiles: cloneValue(previous.scribProfiles),
        activeScribEntityId: previous.activeScribEntityId,
        scribInstances: cloneValue(previous.scribInstances),
        automationPermissions: cloneValue(previous.automationPermissions),
      };
    }),

  redo: () =>
    set((state) => {
      if (state.historyFuture.length === 0) return {};

      const next = state.historyFuture[0];
      const remainingFuture = state.historyFuture.slice(1);
      const past = [...state.historyPast, cloneHistoryState(state)];
      const overflow = past.length - HISTORY_LIMIT;

      return {
        historyPast: overflow > 0 ? past.slice(overflow) : past,
        historyFuture: remainingFuture,
        projectName: next.projectName,
        projectPath: next.projectPath,
        isDirty: next.isDirty,
        scenes: cloneValue(next.scenes),
        activeSceneId: next.activeSceneId,
        entities: cloneValue(next.entities),
        assets: cloneValue(next.assets),
        engineMode: next.engineMode,
        aiMode: next.aiMode,
        aiEnabled: next.aiEnabled,
        editor: { ...state.editor, ...cloneValue(next.editor) },
        scribProfiles: cloneValue(next.scribProfiles),
        activeScribEntityId: next.activeScribEntityId,
        scribInstances: cloneValue(next.scribInstances),
        automationPermissions: cloneValue(next.automationPermissions),
      };
    }),

  setAutomationPermission: (action, permission) =>
    set((state) => {
      const current = state.automationPermissions[action];
      const nextPermission: AutomationPermission = {
        action,
        allowed: permission.allowed ?? current.allowed,
        requireConfirm: permission.requireConfirm ?? current.requireConfirm,
        updatedAt: new Date().toISOString(),
        note: permission.note ?? current.note,
      };

      return {
        ...pushHistory(state),
        automationPermissions: {
          ...state.automationPermissions,
          [action]: nextPermission,
        },
        isDirty: true,
      };
    }),
});
