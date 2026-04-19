'use client';

import type { MutableRefObject } from 'react';
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useSceneViewEntityActions } from './useSceneViewEntityActions';
import { useSceneViewTestingSurface } from './useSceneViewTestingSurface';
import { useSceneViewModelerMeshSync } from './useSceneViewModelerMeshSync';
import { useSceneViewTopologyInteractions } from './useSceneViewTopologyInteractions';
import { useSceneViewOverlayState } from './useSceneViewOverlayState';
import { useSceneViewTransformInteractions } from './useSceneViewTransformInteractions';
import { useSceneViewModelerInteractions } from './useSceneViewModelerInteractions';
import { useSceneViewPointerInteractions } from './useSceneViewPointerInteractions';
import { useSceneViewHistoryActions } from './useSceneViewHistoryActions';
import { useSceneViewShortcuts } from './useSceneViewShortcuts';
import { useSceneViewPresentation } from './useSceneViewPresentation';
import type { ViewportCamera } from './viewportCamera';
import type { TransformTools } from './gizmos';
import type { SelectionManager, SelectionBox } from './selection';
import type { EditableMesh, ModelerElementMode } from './modelerMesh';
import type { EditorShortcutConfig } from '@/lib/editor-shortcuts';
import type { Entity } from '@/types/engine';
import type { TemplateType } from '@/engine/systems/topology-authoring';

type SnapValues = {
  translate: number;
  rotate: number;
  scale: number;
};

type AxisState = {
  x: boolean;
  y: boolean;
  z: boolean;
};

interface ViewportTelemetrySnapshot {
  fps: number;
  frameTimeMs: number;
}

export function useSceneViewViewportController(params: {
  refs: {
    containerRef: MutableRefObject<HTMLDivElement | null>;
    sceneRef: MutableRefObject<THREE.Scene | null>;
    cameraRef: MutableRefObject<ViewportCamera | null>;
    controlsRef: MutableRefObject<OrbitControls | null>;
    transformToolsRef: MutableRefObject<TransformTools | null>;
    selectionRef: MutableRefObject<SelectionManager | null>;
    selectionBoxRef: MutableRefObject<SelectionBox | null>;
    rendererRef: MutableRefObject<THREE.WebGLRenderer | null>;
    renderFrameRef: MutableRefObject<(() => void) | null>;
  };
  activeScene: {
    entities: Entity[];
    collections?: unknown[];
  } | null;
  virtualCameraName: string | null;
  shortcutConfig: EditorShortcutConfig;
  viewportTelemetry: ViewportTelemetrySnapshot;
  editorState: {
    selectedEntities: string[];
    viewportCameraEntityId: string | null;
    tool: string;
    paintEnabled: boolean;
    navigationMode: 'orbit' | 'walk' | 'fly';
    gizmoMode: 'translate' | 'rotate' | 'scale';
    showColliders: boolean;
    showLights: boolean;
    playRuntimeState: 'PLAYING' | 'PAUSED' | 'IDLE';
    modelerMode: 'object' | ModelerElementMode;
    modelerSelectedElements: number[] | undefined;
  };
  modelerState: {
    selectedModelerEntityId: string | null;
    selectedModelerMesh: EditableMesh | null;
    selectedOriginMesh: EditableMesh | null;
    safeModelerSelection: number[];
    selectedModelerVertexIndices: number[];
    modelerSubSelectionActive: boolean;
    topologyViewportReady: boolean;
    selectedModelerMeshSignature: string | null;
    safeModelerSelectionSignature: string;
    topologyViewportMode: 'template' | 'intent_driven';
    topologyViewportTemplateType: TemplateType;
  };
  paint: {
    isPainting: boolean;
    startPaint: (event: React.MouseEvent) => void;
    continuePaint: (event: React.MouseEvent) => void;
    finishPaint: () => boolean;
    cancelPaint: () => boolean;
    undoPaint: () => boolean;
    redoPaint: () => boolean;
    getLastPastPaintTimestamp: () => number;
    getLastFuturePaintTimestamp: () => number;
    simulatePaintStroke: (points: Array<{ x: number; y: number }>) => boolean;
  };
  viewportUi: {
    cameraMode: 'perspective' | 'orthographic' | 'top' | 'front' | 'side';
    pivotMode: 'objectOrigin' | 'selectionCenter';
    transformSpace: 'world' | 'local';
    gridVisible: boolean;
    gridSize: number;
    snapEnabled: boolean;
    snapTarget: 'grid' | 'vertex' | 'surface';
    snapValue: number;
    snapValues: SnapValues;
    activeAxes: AxisState;
    canAdjustOrigin: boolean;
  };
  actions: {
    selectEntity: (entityId: string | null, additive?: boolean) => void;
    setGizmoMode: (mode: 'translate' | 'rotate' | 'scale') => void;
    setModelerMode: (mode: 'vertex' | 'edge' | 'face' | 'object') => void;
    setModelerSelection: (selection: number[]) => void;
    setPlayRuntimeState: (state: 'PLAYING' | 'PAUSED' | 'IDLE') => void;
    setTransformSpace: (value: 'world' | 'local' | ((current: 'world' | 'local') => 'world' | 'local')) => void;
    setGridVisible: (visible: boolean) => void;
    setGridSize: (size: number) => void;
    setSnapEnabled: (enabled: boolean) => void;
    setSnapValue: (value: number) => void;
    setSnapTarget: (target: 'grid' | 'vertex' | 'surface') => void;
    setSnapValues: (values: SnapValues) => void;
    setActiveAxes: (axes: AxisState) => void;
    setPivotMode: (mode: 'objectOrigin' | 'selectionCenter') => void;
    setShowLights: (value: boolean) => void;
    setShowColliders: (value: boolean) => void;
    addEntity: (entity: Entity) => void;
    updateEntity: (entityId: string, patch: Partial<Entity>) => void;
    updateEntityTransient: (entityId: string, patch: Partial<Entity>) => void;
    applyCameraMode: (mode: 'perspective' | 'orthographic' | 'top' | 'front' | 'side') => void;
    focusSelected: () => void;
    resetView: () => void;
  };
}) {
  const {
    refs,
    activeScene,
    virtualCameraName,
    shortcutConfig,
    viewportTelemetry,
    editorState,
    modelerState,
    paint,
    viewportUi,
    actions,
  } = params;

  const {
    syncObjectTransformToStore,
    createManualEntity,
    removeSelectedEntities,
    syncBoxSelectionToStore,
  } = useSceneViewEntityActions({
    sceneRef: refs.sceneRef,
    transformToolsRef: refs.transformToolsRef,
    addEntity: actions.addEntity,
    updateEntity: actions.updateEntity,
    updateEntityTransient: actions.updateEntityTransient,
    selectEntity: actions.selectEntity,
  });

  useSceneViewTestingSurface({
    containerRef: refs.containerRef,
    sceneRef: refs.sceneRef,
    cameraRef: refs.cameraRef,
    transformToolsRef: refs.transformToolsRef,
    rendererRef: refs.rendererRef,
    renderFrameRef: refs.renderFrameRef,
    createManualEntity,
    simulatePaintStroke: paint.simulatePaintStroke,
  });

  const { syncModelerMeshToStore } = useSceneViewModelerMeshSync({
    selectedModelerEntityId: modelerState.selectedModelerEntityId,
    updateEntity: actions.updateEntity as unknown as (
      entityId: string,
      patch: { components: Map<string, unknown> }
    ) => void,
    updateEntityTransient: actions.updateEntityTransient as unknown as (
      entityId: string,
      patch: { components: Map<string, unknown> }
    ) => void,
  });

  const {
    topologyStrokePointCount,
    topologyLastIntentKind,
    customStrokeHandlers,
  } = useSceneViewTopologyInteractions({
    containerRef: refs.containerRef,
    cameraRef: refs.cameraRef,
    sceneRef: refs.sceneRef,
    selectedModelerEntityId: modelerState.selectedModelerEntityId,
    selectedModelerMesh: modelerState.selectedModelerMesh,
    topologyViewportReady: modelerState.topologyViewportReady,
    topologyViewportMode: modelerState.topologyViewportMode,
    topologyViewportTemplateType: modelerState.topologyViewportTemplateType,
    syncModelerMeshToStore,
  });

  const viewportOverlayState = useSceneViewOverlayState({
    shortcutConfig,
    navigationMode: editorState.navigationMode,
    viewportCameraEntityId: editorState.viewportCameraEntityId,
    virtualCameraName,
    objectCount: activeScene?.entities.length ?? 0,
    selectionCount: editorState.selectedEntities.length,
    playRuntimeState: editorState.playRuntimeState,
    viewportTelemetry,
    hasSelectedModelerEntity: Boolean(modelerState.selectedModelerEntityId),
    hasSelectedModelerMesh: Boolean(modelerState.selectedModelerMesh),
    modelerMode: editorState.modelerMode,
    safeModelerSelectionLength: modelerState.safeModelerSelection.length,
    topologyViewportReady: modelerState.topologyViewportReady,
    topologyViewportMode: modelerState.topologyViewportMode,
    topologyViewportTemplateType: modelerState.topologyViewportTemplateType,
    topologyStrokePointCount,
    topologyLastIntentKind,
  });

  const { clearPivotDragState, customTransformHandlers } = useSceneViewTransformInteractions({
    sceneRef: refs.sceneRef,
    transformToolsRef: refs.transformToolsRef,
    selectedEntities: editorState.selectedEntities,
    selectedModelerEntityId: modelerState.selectedModelerEntityId,
    selectedModelerMesh: modelerState.selectedModelerMesh,
    selectedModelerVertexIndices: modelerState.selectedModelerVertexIndices,
    safeModelerSelection: modelerState.safeModelerSelection,
    selectedModelerMeshSignature: modelerState.selectedModelerMeshSignature,
    safeModelerSelectionSignature: modelerState.safeModelerSelectionSignature,
    modelerMode: editorState.modelerMode,
    modelerSubSelectionActive: modelerState.modelerSubSelectionActive,
    pivotMode: viewportUi.pivotMode,
    transformSpace: viewportUi.transformSpace,
    gizmoMode: editorState.gizmoMode,
    syncModelerMeshToStore,
    syncObjectTransformToStore,
  });

  const { updateEditableMeshOrigin, handleModelerElementPick } = useSceneViewModelerInteractions({
    sceneRef: refs.sceneRef,
    selectedModelerEntityId: modelerState.selectedModelerEntityId,
    selectedModelerMesh: modelerState.selectedModelerMesh,
    selectedOriginMesh: modelerState.selectedOriginMesh,
    modelerMode: editorState.modelerMode,
    selectedModelerElements: editorState.modelerSelectedElements,
    safeModelerSelection: modelerState.safeModelerSelection,
    safeModelerSelectionSignature: modelerState.safeModelerSelectionSignature,
    selectedModelerMeshSignature: modelerState.selectedModelerMeshSignature,
    updateEntity: actions.updateEntity as unknown as (
      entityId: string,
      patch: { components: Map<string, unknown> }
    ) => void,
    setModelerMode: actions.setModelerMode,
    setModelerSelection: actions.setModelerSelection,
    clearPivotDragState,
  });

  const {
    isBoxSelecting,
    boxSelectStart,
    boxSelectEnd,
    hoveredAxis,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleMouseLeave,
  } = useSceneViewPointerInteractions({
    containerRef: refs.containerRef,
    cameraRef: refs.cameraRef,
    sceneRef: refs.sceneRef,
    controlsRef: refs.controlsRef,
    transformToolsRef: refs.transformToolsRef,
    selectionRef: refs.selectionRef,
    selectionBoxRef: refs.selectionBoxRef,
    tool: editorState.tool,
    paintEnabled: editorState.paintEnabled,
    isPainting: paint.isPainting,
    startPaint: paint.startPaint,
    continuePaint: paint.continuePaint,
    finishPaint: paint.finishPaint,
    cancelPaint: paint.cancelPaint,
    selectEntity: actions.selectEntity,
    onModelerElementPick: handleModelerElementPick,
    customStrokeHandlers,
    customTransformHandlers,
    syncBoxSelectionToStore,
    syncObjectTransformToStore,
    controlsLocked: Boolean(editorState.viewportCameraEntityId),
  });

  const { handleUndo, handleRedo } = useSceneViewHistoryActions({
    undoPaint: paint.undoPaint,
    redoPaint: paint.redoPaint,
    getLastPastPaintTimestamp: paint.getLastPastPaintTimestamp,
    getLastFuturePaintTimestamp: paint.getLastFuturePaintTimestamp,
  });

  useSceneViewShortcuts({
    selectEntity: actions.selectEntity,
    setGizmoMode: actions.setGizmoMode,
    transformToolsRef: refs.transformToolsRef,
    removeSelectedEntities,
    handleUndo,
    handleRedo,
    onToggleTransformSpace: () =>
      actions.setTransformSpace((current) => (current === 'world' ? 'local' : 'world')),
    onFocusSelected: actions.focusSelected,
  });

  const {
    toolbarProps,
    overlaysProps,
    onCreateEntity,
    onRemoveSelected,
  } = useSceneViewPresentation({
    playRuntimeState: editorState.playRuntimeState,
    gizmoMode: editorState.gizmoMode,
    transformSpace: viewportUi.transformSpace,
    gridVisible: viewportUi.gridVisible,
    gridSize: viewportUi.gridSize,
    snapEnabled: viewportUi.snapEnabled,
    snapTarget: viewportUi.snapTarget,
    snapValues: viewportUi.snapValues,
    snapValue: viewportUi.snapValue,
    activeAxes: viewportUi.activeAxes,
    cameraMode: viewportUi.cameraMode,
    pivotMode: viewportUi.pivotMode,
    canAdjustOrigin: viewportUi.canAdjustOrigin,
    showLights: editorState.showLights,
    showColliders: editorState.showColliders,
    transformToolsRef: refs.transformToolsRef,
    setPlayRuntimeState: actions.setPlayRuntimeState,
    setGizmoMode: actions.setGizmoMode,
    setTransformSpace: actions.setTransformSpace,
    setGridVisible: actions.setGridVisible,
    setGridSize: actions.setGridSize,
    setSnapEnabled: actions.setSnapEnabled,
    setSnapValue: actions.setSnapValue,
    setSnapTarget: actions.setSnapTarget,
    setSnapValues: actions.setSnapValues,
    setActiveAxes: actions.setActiveAxes,
    applyCameraMode: actions.applyCameraMode,
    clearPivotDragState,
    setPivotMode: actions.setPivotMode,
    updateEditableMeshOrigin,
    setShowLights: actions.setShowLights,
    setShowColliders: actions.setShowColliders,
    focusSelected: actions.focusSelected,
    resetView: actions.resetView,
    createManualEntity,
    removeSelectedEntities,
    boxSelection: {
      active: isBoxSelecting,
      start: boxSelectStart,
      end: boxSelectEnd,
    },
    telemetry: viewportOverlayState.telemetry,
    shortcutSummary: viewportOverlayState.shortcutSummary,
    navigationLabel: viewportOverlayState.navigationLabel,
    cameraStatusLabel: viewportOverlayState.cameraStatusLabel,
    modelerOverlay: viewportOverlayState.modelerOverlay,
    topologyOverlay: viewportOverlayState.topologyOverlay,
    hoveredAxis,
  });

  return {
    shellHandlers: {
      handleMouseDown,
      handleMouseMove,
      handleMouseUp,
      handleMouseLeave,
    },
    toolbarProps,
    overlaysProps,
    onCreateEntity,
    onRemoveSelected,
  };
}
