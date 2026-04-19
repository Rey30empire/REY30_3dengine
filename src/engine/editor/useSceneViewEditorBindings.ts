'use client';

import { useEffect, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { scriptRuntime } from '@/engine/gameplay/ScriptRuntime';
import type { TransformTools, GizmoMode, SnapTarget, TransformSpace } from './gizmos';

type AxisState = {
  x: boolean;
  y: boolean;
  z: boolean;
};

export interface SceneViewTransformToolConfig {
  mode: GizmoMode;
  space: TransformSpace;
  enabledAxes: AxisState;
  snapSettings: {
    enabled: boolean;
    gridVisible: boolean;
    gridSize: number;
    translateSnap: number;
    rotateSnap: number;
    scaleSnap: number;
    translateAxes: AxisState;
    rotateAxes: AxisState;
    scaleAxes: AxisState;
    snapTarget: SnapTarget;
    vertexSnap: boolean;
    surfaceSnap: boolean;
  };
}

export function createSceneViewTransformToolConfig(params: {
  mode: GizmoMode;
  space: TransformSpace;
  activeAxes: AxisState;
  snapEnabled: boolean;
  gridVisible: boolean;
  gridSize: number;
  translateSnap: number;
  rotateSnap: number;
  scaleSnap: number;
  snapTarget: SnapTarget;
}): SceneViewTransformToolConfig {
  const {
    mode,
    space,
    activeAxes,
    snapEnabled,
    gridVisible,
    gridSize,
    translateSnap,
    rotateSnap,
    scaleSnap,
    snapTarget,
  } = params;

  return {
    mode,
    space,
    enabledAxes: { ...activeAxes },
    snapSettings: {
      enabled: snapEnabled,
      gridVisible,
      gridSize,
      translateSnap,
      rotateSnap,
      scaleSnap,
      translateAxes: { ...activeAxes },
      rotateAxes: { ...activeAxes },
      scaleAxes: { ...activeAxes },
      snapTarget,
      vertexSnap: snapTarget === 'vertex',
      surfaceSnap: snapTarget === 'surface',
    },
  };
}

export function useSceneViewEditorBindings(params: {
  sceneRef: MutableRefObject<THREE.Scene | null>;
  transformToolsRef: MutableRefObject<TransformTools | null>;
  timerRef: MutableRefObject<THREE.Timer>;
  playRuntimeState: 'IDLE' | 'PLAYING' | 'PAUSED';
  gridVisible: boolean;
  showLights: boolean;
  gridSize: number;
  gizmoMode: GizmoMode;
  transformSpace: TransformSpace;
  activeAxes: AxisState;
  snapEnabled: boolean;
  snapValue: number;
  snapTarget: SnapTarget;
  snapValues: {
    translate: number;
    rotate: number;
    scale: number;
  };
}) {
  const {
    sceneRef,
    transformToolsRef,
    timerRef,
    playRuntimeState,
    gridVisible,
    showLights,
    gridSize,
    gizmoMode,
    transformSpace,
    activeAxes,
    snapEnabled,
    snapValue,
    snapTarget,
    snapValues,
  } = params;

  useEffect(() => {
    if (playRuntimeState === 'IDLE') {
      scriptRuntime.reset();
      timerRef.current.reset();
    }
  }, [playRuntimeState, timerRef]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const grid = scene.getObjectByName('grid');
    const axes = scene.getObjectByName('axes');
    const ambientLight = scene.getObjectByName('ambient_light');
    const directionalLight = scene.getObjectByName('directional_light');

    if (grid) {
      grid.visible = gridVisible;
      grid.scale.setScalar(Math.max(gridSize, 0.25));
    }
    if (axes) axes.visible = gridVisible;
    if (ambientLight) ambientLight.visible = showLights;
    if (directionalLight) directionalLight.visible = showLights;
  }, [gridSize, gridVisible, sceneRef, showLights]);

  useEffect(() => {
    const transformTools = transformToolsRef.current;
    if (!transformTools) return;

    const config = createSceneViewTransformToolConfig({
      mode: gizmoMode,
      space: transformSpace,
      activeAxes,
      snapEnabled,
      gridVisible,
      gridSize,
      translateSnap: snapValue,
      rotateSnap: snapValues.rotate,
      scaleSnap: snapValues.scale,
      snapTarget,
    });

    transformTools.setScene(sceneRef.current);
    transformTools.gizmo.setMode(config.mode);
    transformTools.gizmo.setSpace(config.space);
    transformTools.gizmo.setEnabledAxes(config.enabledAxes);
    transformTools.snapSettings.enabled = config.snapSettings.enabled;
    transformTools.snapSettings.gridVisible = config.snapSettings.gridVisible;
    transformTools.snapSettings.gridSize = config.snapSettings.gridSize;
    transformTools.snapSettings.translateSnap = config.snapSettings.translateSnap;
    transformTools.snapSettings.rotateSnap = config.snapSettings.rotateSnap;
    transformTools.snapSettings.scaleSnap = config.snapSettings.scaleSnap;
    transformTools.snapSettings.translateAxes = { ...config.snapSettings.translateAxes };
    transformTools.snapSettings.rotateAxes = { ...config.snapSettings.rotateAxes };
    transformTools.snapSettings.scaleAxes = { ...config.snapSettings.scaleAxes };
    transformTools.snapSettings.snapTarget = config.snapSettings.snapTarget;
    transformTools.snapSettings.vertexSnap = config.snapSettings.vertexSnap;
    transformTools.snapSettings.surfaceSnap = config.snapSettings.surfaceSnap;
  }, [
    activeAxes,
    gizmoMode,
    gridSize,
    gridVisible,
    sceneRef,
    snapEnabled,
    snapTarget,
    snapValue,
    snapValues.rotate,
    snapValues.scale,
    transformSpace,
    transformToolsRef,
  ]);
}
