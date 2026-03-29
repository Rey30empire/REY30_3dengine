import type { EditorSlice, SliceCreator } from '../editorStore.types';
import {
  createDefaultEditorState,
  pushHistory,
  sameSelection,
} from '../editorStore.utils';

export const createEditorSlice: SliceCreator<EditorSlice> = (set) => ({
  editor: createDefaultEditorState(),
  profiler: {
    fps: 60,
    frameTime: 16.67,
    cpuTime: 0,
    gpuTime: 0,
    memory: {
      used: 0,
      allocated: 0,
      textures: 0,
      meshes: 0,
      audio: 0,
    },
    drawCalls: 0,
    triangles: 0,
    vertices: 0,
  },
  sidebarCollapsed: false,
  activePanel: 'inspector',
  showProfiler: false,
  showConsole: true,

  selectEntity: (id, multi = false) =>
    set((state) => {
      let nextSelection: string[] = [];

      if (id === null) {
        nextSelection = [];
      } else if (multi) {
        nextSelection = state.editor.selectedEntities.includes(id)
          ? state.editor.selectedEntities.filter((entityId) => entityId !== id)
          : [...state.editor.selectedEntities, id];
      } else {
        nextSelection = [id];
      }

      if (sameSelection(nextSelection, state.editor.selectedEntities)) {
        return {};
      }

      return {
        ...pushHistory(state),
        editor: {
          ...state.editor,
          selectedEntities: nextSelection,
        },
      };
    }),

  clearSelection: () =>
    set((state) => {
      if (state.editor.selectedEntities.length === 0 && !state.editor.selectedAsset) {
        return {};
      }
      return {
        ...pushHistory(state),
        editor: {
          ...state.editor,
          selectedEntities: [],
          selectedAsset: null,
        },
      };
    }),

  selectAsset: (assetId) =>
    set((state) => {
      if (state.editor.selectedAsset === assetId) return {};
      return {
        ...pushHistory(state),
        editor: {
          ...state.editor,
          selectedAsset: assetId,
        },
      };
    }),

  setEditorTool: (tool) =>
    set((state) => ({
      editor: { ...state.editor, tool },
    })),

  setEditorMode: (mode) =>
    set((state) => ({
      editor: { ...state.editor, mode },
    })),

  setGizmoMode: (mode) =>
    set((state) => ({
      editor: { ...state.editor, gizmoMode: mode },
    })),

  toggleGrid: () =>
    set((state) => ({
      editor: { ...state.editor, gridVisible: !state.editor.gridVisible },
    })),

  setGridVisible: (visible) =>
    set((state) => ({
      editor: { ...state.editor, gridVisible: visible },
    })),

  toggleSnap: () =>
    set((state) => ({
      editor: { ...state.editor, snapEnabled: !state.editor.snapEnabled },
    })),

  setSnapEnabled: (enabled) =>
    set((state) => ({
      editor: { ...state.editor, snapEnabled: enabled },
    })),

  setSnapValue: (value) =>
    set((state) => ({
      editor: { ...state.editor, snapValue: value },
    })),

  setSnapTarget: (target) =>
    set((state) => ({
      editor: { ...state.editor, snapTarget: target },
    })),

  setCameraSpeed: (speed) =>
    set((state) => ({
      editor: { ...state.editor, cameraSpeed: speed },
    })),

  setNavigationMode: (mode) =>
    set((state) => ({
      editor: { ...state.editor, navigationMode: mode },
    })),

  setViewportCameraMode: (mode) =>
    set((state) => ({
      editor: { ...state.editor, viewportCameraMode: mode },
    })),

  setViewportCameraEntity: (entityId) =>
    set((state) => ({
      editor: { ...state.editor, viewportCameraEntityId: entityId },
    })),

  setViewportFov: (fov) =>
    set((state) => ({
      editor: { ...state.editor, viewportFov: fov },
    })),

  setShowColliders: (visible) =>
    set((state) => ({
      editor: { ...state.editor, showColliders: visible },
    })),

  setShowLights: (visible) =>
    set((state) => ({
      editor: { ...state.editor, showLights: visible },
    })),

  setPaintEnabled: (enabled) =>
    set((state) => ({
      editor: {
        ...state.editor,
        paintEnabled: enabled,
        tool: enabled ? 'brush' : 'select',
      },
    })),

  setPaintMode: (mode) =>
    set((state) => ({
      editor: {
        ...state.editor,
        paintMode: mode,
      },
    })),

  setPaintColor: (color) =>
    set((state) => ({
      editor: { ...state.editor, paintColor: color },
    })),

  setPaintSize: (size) =>
    set((state) => ({
      editor: { ...state.editor, paintSize: size },
    })),

  setPaintStrength: (strength) =>
    set((state) => ({
      editor: { ...state.editor, paintStrength: strength },
    })),

  setPaintTextureSlot: (slot) =>
    set((state) => ({
      editor: { ...state.editor, paintTextureSlot: slot },
    })),

  setPaintTextureResolution: (resolution) =>
    set((state) => ({
      editor: {
        ...state.editor,
        paintTextureResolution: Math.max(128, Math.min(4096, Math.round(resolution))),
      },
    })),

  setPaintWeightBone: (boneName) =>
    set((state) => ({
      editor: { ...state.editor, paintWeightBone: boneName.trim() || 'Spine' },
    })),

  setPaintWeightMirror: (enabled) =>
    set((state) => ({
      editor: { ...state.editor, paintWeightMirror: enabled },
    })),

  setPaintWeightSmooth: (enabled) =>
    set((state) => ({
      editor: { ...state.editor, paintWeightSmooth: enabled },
    })),

  setPaintWeightNormalize: (enabled) =>
    set((state) => ({
      editor: { ...state.editor, paintWeightNormalize: enabled },
    })),

  setPaintWeightErase: (enabled) =>
    set((state) => ({
      editor: { ...state.editor, paintWeightErase: enabled },
    })),

  setSculptSymmetryX: (enabled) =>
    set((state) => ({
      editor: { ...state.editor, sculptSymmetryX: enabled },
    })),

  setSculptDyntopo: (enabled) =>
    set((state) => ({
      editor: { ...state.editor, sculptDyntopo: enabled },
    })),

  setSculptRemeshIterations: (iterations) =>
    set((state) => ({
      editor: {
        ...state.editor,
        sculptRemeshIterations: Math.max(1, Math.min(3, Math.round(iterations))),
      },
    })),

  setSculptMultiresLevels: (levels) =>
    set((state) => ({
      editor: {
        ...state.editor,
        sculptMultiresLevels: Math.max(1, Math.min(3, Math.round(levels))),
      },
    })),

  setSculptVoxelSize: (size) =>
    set((state) => ({
      editor: {
        ...state.editor,
        sculptVoxelSize: Math.min(0.5, Math.max(0.03, size)),
      },
    })),

  setModelerMode: (mode) =>
    set((state) => ({
      editor: {
        ...state.editor,
        modelerMode: mode,
        modelerSelectedElements: [0],
      },
    })),

  setModelerSelection: (selection) =>
    set((state) => ({
      editor: {
        ...state.editor,
        modelerSelectedElements:
          selection.length > 0
            ? Array.from(new Set(selection.filter((index) => index >= 0)))
            : [],
      },
    })),

  toggleModelerSelection: (index, additive = false) =>
    set((state) => {
      if (index < 0) return {};
      const current = state.editor.modelerSelectedElements ?? [];
      let nextSelection: number[];
      if (additive) {
        nextSelection = current.includes(index)
          ? current.filter((candidate) => candidate !== index)
          : [...current, index];
      } else {
        nextSelection = [index];
      }

      return {
        editor: {
          ...state.editor,
          modelerSelectedElements:
            nextSelection.length > 0
              ? Array.from(new Set(nextSelection))
              : [],
        },
      };
    }),

  setTopologyViewportEnabled: (enabled) =>
    set((state) => ({
      editor: {
        ...state.editor,
        topologyViewportEnabled: enabled,
      },
    })),

  setTopologyViewportMode: (mode) =>
    set((state) => ({
      editor: {
        ...state.editor,
        topologyViewportMode: mode,
      },
    })),

  setTopologyViewportTemplateType: (templateType) =>
    set((state) => ({
      editor: {
        ...state.editor,
        topologyViewportTemplateType: templateType,
      },
    })),

  updateProfiler: (data) =>
    set((state) => ({
      profiler: { ...state.profiler, ...data },
    })),

  toggleSidebar: () =>
    set((state) => ({
      sidebarCollapsed: !state.sidebarCollapsed,
    })),

  setActivePanel: (panel) => set({ activePanel: panel }),

  focusCharacterBuilderCategory: (category) =>
    set((state) => ({
      editor: {
        ...state.editor,
        characterBuilderFocusRequest: {
          category: category?.trim() || null,
          token:
            (state.editor.characterBuilderFocusRequest?.token ?? 0) + 1,
        },
      },
    })),

  clearCharacterBuilderFocus: () =>
    set((state) => ({
      editor: {
        ...state.editor,
        characterBuilderFocusRequest: null,
      },
    })),

  toggleProfiler: () =>
    set((state) => ({
      showProfiler: !state.showProfiler,
    })),

  toggleConsole: () =>
    set((state) => ({
      showConsole: !state.showConsole,
    })),
});
