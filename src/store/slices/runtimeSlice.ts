import {
  assignScribToTarget,
  removeScribInstance,
} from '@/engine/scrib';
import {
  buildReyPlayManifest,
  createDiagnosticHintFromReport,
  validateReyPlayProject,
} from '@/engine/reyplay/build/compile';
import type { RuntimeSlice, SliceCreator } from '../editorStore.types';
import { pushHistory } from '../editorStore.utils';

export const createRuntimeSlice: SliceCreator<RuntimeSlice> = (set, get) => ({
  playRuntimeState: 'IDLE',
  lastBuildReport: null,
  buildManifest: null,
  lastCompileSummary: '',
  scribProfiles: new Map(),
  activeScribEntityId: null,
  scribInstances: new Map(),

  setPlayRuntimeState: (playRuntimeState) => set({ playRuntimeState }),

  runReyPlayCompile: () => {
    const state = get();
    const report = validateReyPlayProject({
      scenes: state.scenes,
      entities: state.entities,
      assets: state.assets,
      scribProfiles: state.scribProfiles,
      scribInstances: state.scribInstances,
      activeSceneId: state.activeSceneId,
      projectName: state.projectName,
    });

    const lastCompileSummary = createDiagnosticHintFromReport(report);

    if (!report.ok) {
      set({
        lastBuildReport: report,
        lastCompileSummary,
        buildManifest: null,
      });
      return report;
    }

    const manifest = buildReyPlayManifest({
      scenes: state.scenes,
      entities: state.entities,
      assets: state.assets,
      scribProfiles: state.scribProfiles,
      scribInstances: state.scribInstances,
      activeSceneId: state.activeSceneId,
      projectName: state.projectName,
    });

    set({
      lastBuildReport: report,
      buildManifest: manifest,
      lastCompileSummary,
    });

    return report;
  },

  clearBuild: () =>
    set({
      lastBuildReport: null,
      buildManifest: null,
      lastCompileSummary: '',
    }),

  setScribProfile: (entityId, profile) =>
    set((state) => {
      const nextProfiles = new Map(state.scribProfiles);
      nextProfiles.set(entityId, {
        ...profile,
        entityId,
        updatedAt: profile.updatedAt || new Date().toISOString(),
      });
      return {
        ...pushHistory(state),
        scribProfiles: nextProfiles,
      };
    }),

  selectScribEntity: (entityId) =>
    set((state) => {
      if (state.activeScribEntityId === entityId) return {};
      return {
        ...pushHistory(state),
        activeScribEntityId: entityId,
      };
    }),

  assignScribToEntity: (entityId, type, options) => {
    const state = get();
    if (!state.entities.has(entityId)) {
      return {
        ok: false,
        assigned: [],
        autoAdded: [],
        issues: [
          {
            level: 'error' as const,
            code: 'SCRIB_ENTITY_NOT_FOUND',
            message: `No existe la entidad objetivo: ${entityId}`,
          },
        ],
      };
    }

    const result = assignScribToTarget(
      {
        target: { scope: 'entity', id: entityId },
        type,
        config: options?.config,
        origin: options?.origin,
      },
      state.scribInstances
    );

    if (!result.ok) return result;

    set((current) => {
      const nextInstances = new Map(current.scribInstances);
      [...result.autoAdded, ...result.assigned].forEach((instance) => {
        nextInstances.set(instance.id, instance);
      });
      return {
        ...pushHistory(current),
        scribInstances: nextInstances,
        isDirty: true,
      };
    });

    return result;
  },

  assignScribToScene: (sceneId, type, options) => {
    const state = get();
    const exists = state.scenes.some((scene) => scene.id === sceneId);
    if (!exists) {
      return {
        ok: false,
        assigned: [],
        autoAdded: [],
        issues: [
          {
            level: 'error' as const,
            code: 'SCRIB_SCENE_NOT_FOUND',
            message: `No existe la escena objetivo: ${sceneId}`,
          },
        ],
      };
    }

    const result = assignScribToTarget(
      {
        target: { scope: 'scene', id: sceneId },
        type,
        config: options?.config,
        origin: options?.origin,
      },
      state.scribInstances
    );

    if (!result.ok) return result;

    set((current) => {
      const nextInstances = new Map(current.scribInstances);
      [...result.autoAdded, ...result.assigned].forEach((instance) => {
        nextInstances.set(instance.id, instance);
      });
      return {
        ...pushHistory(current),
        scribInstances: nextInstances,
        isDirty: true,
      };
    });

    return result;
  },

  deleteScribInstance: (instanceId) =>
    set((state) => ({
      ...pushHistory(state),
      scribInstances: removeScribInstance(instanceId, state.scribInstances),
      isDirty: true,
    })),

  setScribInstanceEnabled: (instanceId, enabled) =>
    set((state) => {
      const existing = state.scribInstances.get(instanceId);
      if (!existing || existing.enabled === enabled) return {};

      const nextInstances = new Map(state.scribInstances);
      nextInstances.set(instanceId, {
        ...existing,
        enabled,
        updatedAt: new Date().toISOString(),
      });

      return {
        ...pushHistory(state),
        scribInstances: nextInstances,
        isDirty: true,
      };
    }),
});
