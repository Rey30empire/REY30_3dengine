'use client';

import { useCallback, useMemo, type ComponentProps, type MutableRefObject } from 'react';
import type { PivotMode, CameraMode } from './EditorToolbar';
import type { TransformTools } from './gizmos';
import { EditorToolbar } from './EditorToolbar';
import { SceneViewportOverlays } from './viewport/SceneViewportOverlays';

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

type QuickCreateEntityType = 'cube' | 'sphere' | 'light' | 'camera';

interface SceneViewportPresentationParams {
  playRuntimeState: 'PLAYING' | 'PAUSED' | 'IDLE';
  gizmoMode: ComponentProps<typeof EditorToolbar>['transformMode'];
  transformSpace: 'world' | 'local';
  gridVisible: boolean;
  gridSize: number;
  snapEnabled: boolean;
  snapTarget: 'grid' | 'vertex' | 'surface';
  snapValues: SnapValues;
  snapValue: number;
  activeAxes: AxisState;
  cameraMode: CameraMode;
  pivotMode: PivotMode;
  canAdjustOrigin: boolean;
  showLights: boolean;
  showColliders: boolean;
  transformToolsRef: MutableRefObject<TransformTools | null>;
  setPlayRuntimeState: (state: 'PLAYING' | 'PAUSED' | 'IDLE') => void;
  setGizmoMode: (mode: 'translate' | 'rotate' | 'scale') => void;
  setTransformSpace: (value: 'world' | 'local' | ((current: 'world' | 'local') => 'world' | 'local')) => void;
  setGridVisible: (visible: boolean) => void;
  setGridSize: (size: number) => void;
  setSnapEnabled: (enabled: boolean) => void;
  setSnapValue: (value: number) => void;
  setSnapTarget: (target: 'grid' | 'vertex' | 'surface') => void;
  setSnapValues: (values: SnapValues) => void;
  setActiveAxes: (axes: AxisState) => void;
  applyCameraMode: (mode: CameraMode) => void;
  clearPivotDragState: () => void;
  setPivotMode: (mode: PivotMode) => void;
  updateEditableMeshOrigin: (mode: 'originToGeometry' | 'geometryToOrigin') => void;
  setShowLights: (value: boolean) => void;
  setShowColliders: (value: boolean) => void;
  focusSelected: () => void;
  resetView: () => void;
  createManualEntity: (type: QuickCreateEntityType) => void;
  removeSelectedEntities: () => void;
  boxSelection: ComponentProps<typeof SceneViewportOverlays>['boxSelection'];
  telemetry: ComponentProps<typeof SceneViewportOverlays>['telemetry'];
  shortcutSummary: string;
  navigationLabel: string;
  cameraStatusLabel: string;
  modelerOverlay: ComponentProps<typeof SceneViewportOverlays>['modelerOverlay'];
  topologyOverlay: ComponentProps<typeof SceneViewportOverlays>['topologyOverlay'];
  hoveredAxis: string | null;
}

export function useSceneViewPresentation(params: SceneViewportPresentationParams) {
  const stepRuntime = useCallback(() => {
    if (params.playRuntimeState === 'PLAYING') return;
    params.setPlayRuntimeState('PLAYING');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        params.setPlayRuntimeState('PAUSED');
      });
    });
  }, [params]);

  const toolbarProps = useMemo<ComponentProps<typeof EditorToolbar>>(
    () => ({
      playState: params.playRuntimeState,
      transformMode: params.gizmoMode,
      transformSpace: params.transformSpace,
      showGrid: params.gridVisible,
      gridSize: params.gridSize,
      snapEnabled: params.snapEnabled,
      snapTarget: params.snapTarget,
      snapValues: { ...params.snapValues, translate: params.snapValue },
      activeAxes: params.activeAxes,
      cameraMode: params.cameraMode,
      pivotMode: params.pivotMode,
      canAdjustOrigin: params.canAdjustOrigin,
      showLights: params.showLights,
      showColliders: params.showColliders,
      onPlay: () => params.setPlayRuntimeState('PLAYING'),
      onPause: () =>
        params.setPlayRuntimeState(
          params.playRuntimeState === 'PAUSED' ? 'PLAYING' : 'PAUSED'
        ),
      onStop: () => params.setPlayRuntimeState('IDLE'),
      onStep: stepRuntime,
      onTransformModeChange: (mode: 'translate' | 'rotate' | 'scale') => {
        params.setGizmoMode(mode);
        params.transformToolsRef.current?.gizmo.setMode(mode);
      },
      onTransformSpaceChange: (space: 'world' | 'local') => {
        params.setTransformSpace(space);
        params.transformToolsRef.current?.gizmo.setSpace(space);
      },
      onGridVisibilityChange: params.setGridVisible,
      onGridSizeChange: params.setGridSize,
      onSnapEnabledChange: params.setSnapEnabled,
      onSnapTargetChange: params.setSnapTarget,
      onSnapValuesChange: (values: SnapValues) => {
        params.setSnapValues(values);
        params.setSnapValue(values.translate);
      },
      onActiveAxesChange: (nextAxes: AxisState) => {
        if (!nextAxes.x && !nextAxes.y && !nextAxes.z) {
          return;
        }
        params.setActiveAxes(nextAxes);
      },
      onCameraModeChange: params.applyCameraMode,
      onPivotModeChange: (mode: PivotMode) => {
        params.clearPivotDragState();
        params.setPivotMode(mode);
      },
      onOriginToGeometry: () => params.updateEditableMeshOrigin('originToGeometry'),
      onGeometryToOrigin: () => params.updateEditableMeshOrigin('geometryToOrigin'),
      onShowLightsChange: params.setShowLights,
      onShowCollidersChange: params.setShowColliders,
      onFocusSelected: params.focusSelected,
      onResetView: params.resetView,
    }),
    [params, stepRuntime]
  );

  const overlaysProps = useMemo<ComponentProps<typeof SceneViewportOverlays>>(
    () => ({
      boxSelection: params.boxSelection,
      telemetry: params.telemetry,
      shortcutSummary: params.shortcutSummary,
      navigationLabel: params.navigationLabel,
      cameraStatusLabel: params.cameraStatusLabel,
      modelerOverlay: params.modelerOverlay,
      topologyOverlay: params.topologyOverlay,
      hoveredAxis: params.hoveredAxis,
    }),
    [params]
  );

  return {
    toolbarProps,
    overlaysProps,
    onCreateEntity: params.createManualEntity,
    onRemoveSelected: params.removeSelectedEntities,
  };
}
